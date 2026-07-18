/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * events-stream.ts: The realtime events WebSocket - decode, classify, and fan one TypedEvent out through a three-rail EventBus, with a silence watchdog.
 */

/**
 * `EventStream` owns the controller's realtime events WebSocket and is the single decode site for the realtime packet stream: every frame is decoded
 * ({@link decodePacket}) and classified ({@link classifyPacket}) here, and the one resulting {@link TypedEvent} is emitted on the `packet` rail. The composition root
 * wires exactly one bridge subscription that fans that event into both the state store and the client firehose - there is never a second decode path.
 *
 * The surface is the three-rail model (see {@link EventBus}): an internal `EventBus<EventStreamEvents>` backs `on` / `once` / `stream`. The library composes
 * `node:events.EventEmitter`; it does not extend it.
 *
 * **The WebSocket is an injected dependency**, exactly like the {@link Transport}'s dispatcher and the {@link StateStore}'s refresh seam. `EventStream` depends on the
 * minimal {@link ProtectWebSocket} interface - only the surface it uses - never undici's full type. The default factory builds undici's `WebSocket` over an owned
 * HTTP/1.1 agent with `rejectUnauthorized: false` (Protect controllers ship self-signed certificates, and a WebSocket upgrade cannot ride the HTTP/2 request pool).
 * Tests inject a fake socket and drive `open` / `message` / `close` / `error` deterministically (undici's `MockAgent` does not mock WebSockets).
 *
 * **The watchdog detects here; `ConnectionMonitor` responds.** This is the same division as the throttle breaker: the subsystem that owns a resource detects its health
 * condition and emits a typed signal, and the one coordinator responds. `EventStream` stamps `lastMessageAt` on every frame and runs a silence watchdog on the injected
 * `Clock`; a tick that finds the channel silent past {@link PROTECT_EVENTS_WATCHDOG_TIMEOUT} concludes it is dead-but-not-closed (the lossy-firmware case the whole
 * design exists for), emits `error({@link ProtectStallError})` - a `RecoverableError`, so the error type itself is the "recover" signal - and tears the socket down.
 * `EventStream` does not reconnect; that is `ConnectionMonitor`'s scope. The gap is covered by the bootstrap-refresh failsafe, which exists precisely for it.
 *
 * @module EventStream
 */
import { Agent, WebSocket } from "undici";
import type { EventsClosedPayload, EventsPacketPayload, SchemaUnknownModelKeyPayload } from "../diagnostics.ts";
import { ProtectAbortedError, ProtectError, ProtectNetworkError, ProtectProtocolError, ProtectStallError } from "../errors.ts";
import type { ProtectWebSocket, ProtectWebSocketErrorEvent } from "./ws.ts";
import { classifyPacket, isKnownModelKey } from "../protocol/events.ts";
import type { Clock } from "../clock.ts";
import { EventBus } from "../event-bus.ts";
import { PROTECT_EVENTS_WATCHDOG_TIMEOUT } from "../settings.ts";
import type { ProtectLogging } from "../logging.ts";
import type { RawPacket } from "../protocol/packet.ts";
import type { StreamOptions } from "../event-bus.ts";
import type { TypedEvent } from "../protocol/events.ts";
import { channels } from "../diagnostics.ts";
import { decodePacket } from "../protocol/packet.ts";
import { isExpectedWsDisconnect } from "../errors.ts";
import { noopLog } from "../logging.ts";
import { toBuffer } from "./ws.ts";
import { wallClock } from "../clock.ts";

/**
 * Construction options for {@link EventStream}.
 *
 * - `host` and `lastUpdateId` build the WebSocket URL; `lastUpdateId` is handed to the controller so it replays any events that fired between the bootstrap snapshot
 *   and the WebSocket coming online.
 * - `getAuthHeaders` is the cookie seam, wired to {@link AuthSession} at the composition root (the same dependency inversion the {@link Transport} uses).
 * - `webSocket` is the injected I/O seam; omit it to use the default undici-backed factory, inject it in tests.
 * - `signal` cancels the connection attempt - if it aborts before the socket opens, {@link EventStream.opened} rejects and the stream tears down.
 *
 * @category Transport
 */
export interface EventStreamOptions {

  clock?: Clock;
  getAuthHeaders?: () => Record<string, string>;
  host: string;
  lastUpdateId: string;
  log?: ProtectLogging;
  signal?: AbortSignal;
  webSocket?: (url: string) => ProtectWebSocket;
}

/**
 * The events {@link EventStream} publishes on its three-rail surface.
 *
 * - `packet` is the realtime firehose: one decoded {@link TypedEvent} per modeled frame. The composition root bridges it into the state store and the client firehose.
 * - `rawPacket` is the raw observability firehose: the decoded {@link RawPacket} (header + payload) of *every* frame, emitted one decode step before `packet` and
 *   before classification - so it carries the valid-but-unmodeled frames the classifier drops to `null`, which `packet` never sees. Pure observability for protocol
 *   exploration and capture; never dispatched into state, no state-ordering guarantee (unlike `packet`, which is dispatched-then-emitted).
 * - `closed` fires once when the WebSocket closes (naturally, on error, or on a watchdog stall), carrying the close frame's code and reason.
 * - `error` carries a typed {@link ProtectError} - a decode failure, a socket error, a {@link ProtectStallError} from the silence watchdog, or a {@link
 *   ProtectNetworkError} when the peer closes a live socket unsolicited (a controller reboot drops the socket this way: a `close` event with no preceding socket
 *   `error`). Every termination we did not initiate reaches this rail; a self-initiated close stays informational on `closed`, and a caller-signal abort before open
 *   surfaces on the {@link EventStream.opened} handshake rejection as {@link ProtectAbortedError} rather than here. The error *type* is what the
 *   `ConnectionMonitor` acts on.
 *
 * @category Transport
 */
export interface EventStreamEvents {

  closed: [info: { code: number; reason: string }];
  error: [err: ProtectError];
  packet: [event: TypedEvent];
  rawPacket: [packet: RawPacket];
}

/**
 * The realtime events stream. Constructed directly (the constructor begins connecting and wires the WebSocket listeners) so the composition root can attach its bridge
 * subscription *before* awaiting {@link EventStream.opened} - a socket delivers no `message` before `open`, so a pre-`open` subscription loses nothing, no buffering
 * required. {@link EventStream.connect} is atomic sugar (construct, await open, return) for direct consumers that subscribe via {@link EventStream.packets}.
 *
 * @category Transport
 */
export class EventStream implements AsyncDisposable {

  readonly #bus = new EventBus<EventStreamEvents>();
  readonly #clock: Clock;
  // One AbortController governs every WebSocket listener and the watchdog loop. A single abort() detaches them all at once - the same teardown primitive the livestream
  // session uses.
  readonly #controller = new AbortController();
  readonly #log: ProtectLogging;
  // The agent we own only when we built the default WebSocket; null when a factory was injected (its owner manages the underlying transport). Mirrors
  // Transport.#ownsDispatcher: we never destroy what we did not create.
  readonly #ownedAgent: Agent | null;
  readonly #ws: ProtectWebSocket;

  // The open handshake, settled exactly once: resolved on the WebSocket `open` event, rejected if the socket closes (or the caller's signal aborts) before opening.
  readonly #opened: Promise<void>;
  readonly #settleOpen: (error?: ProtectError) => void;

  // The model-key/action pairs whose schema-drift signal we have already published this session, so sustained drift does not spam the diagnostics channel.
  readonly #seenUnknown = new Set<string>();

  // The single teardown gate and the agent-destruction promise close()/dispose await. lastMessageAt is the watchdog's only liveness source - clock-stamped on every
  // frame, seeded to construction time so a fresh stream is not instantly considered stale.
  #closePromise: Promise<void> | null = null;
  #closed = false;
  // Set by every self-initiated teardown (close(), caller abort, watchdog stall, socket error), so #onClose can tell a deliberate close from a peer-initiated
  // one and route
  // only the latter onto the error rail.
  #closeInitiated = false;
  // Set ONLY by the caller-abort teardown path, a narrowing of the broader #closeInitiated, so #onClose settles a still-pending open handshake as the typed
  // ProtectAbortedError for a caller abort while every other pre-open teardown (socket close, error, watchdog, explicit close()) keeps the generic ProtectNetworkError.
  #callerAborted = false;
  #lastMessageAt: number;
  // True once the socket has opened. Gates the unsolicited-close error so a pre-open connect failure flows through the opened-handshake rejection alone, not a recovery.
  #live = false;
  #openSettled = false;

  constructor(options: EventStreamOptions) {

    this.#clock = options.clock ?? wallClock;
    this.#log = options.log ?? noopLog;
    this.#lastMessageAt = this.#clock.now();

    const url = "wss://" + options.host + "/proxy/protect/ws/updates?" + new URLSearchParams({ lastUpdateId: options.lastUpdateId }).toString();

    // Build the socket: an injected factory in tests, otherwise undici's WebSocket over an owned HTTP/1.1 agent that accepts the controller's self-signed certificate.
    // undici's WebSocket structurally satisfies the minimal ProtectWebSocket surface we model, so it assigns directly - no cast, the seam is honest by construction.
    if(options.webSocket !== undefined) {

      this.#ownedAgent = null;
      this.#ws = options.webSocket(url);
    } else {

      const agent = new Agent({ connect: { rejectUnauthorized: false } });

      this.#ownedAgent = agent;
      this.#ws = new WebSocket(url, { dispatcher: agent, headers: options.getAuthHeaders?.() ?? {} });
    }

    this.#ws.binaryType = "arraybuffer";

    const { promise, resolve, reject } = Promise.withResolvers<undefined>();

    this.#opened = promise;

    // Attaching a no-op rejection handler marks the handshake promise as handled, so a consumer that only subscribes via `on("packet")` and never awaits `opened` does
    // not trigger an unhandled-rejection warning when the socket fails to open. Real awaiters (the composition root, `connect()`) still receive the rejection - both
    // handlers run.
    void this.#opened.catch(() => undefined);

    this.#settleOpen = (error?: ProtectError): void => {

      if(this.#openSettled) {

        return;
      }

      this.#openSettled = true;

      if(error !== undefined) {

        reject(error);

        return;
      }

      resolve(undefined);
    };

    // All listeners bind to the controller's signal, so one abort() detaches them together. The close and error handlers are `once` - a socket reports each terminal
    // condition a single time - while message stays live for the connection's lifetime.
    const signal = this.#controller.signal;

    this.#ws.addEventListener("open", () => this.#onOpen(), { once: true, signal });
    this.#ws.addEventListener("message", (event) => this.#onMessage(event.data), { signal });
    this.#ws.addEventListener("close", (event) => this.#onClose(event.code, event.reason), { once: true, signal });
    this.#ws.addEventListener("error", (event) => this.#onError(event), { once: true, signal });

    // The caller's signal cancels the connection attempt. Bound to our own signal too, so it detaches with everything else once we tear down.
    if(options.signal !== undefined) {

      if(options.signal.aborted) {

        this.#abortByCaller();
      } else {

        options.signal.addEventListener("abort", () => this.#abortByCaller(), { once: true, signal });
      }
    }

    // The silence watchdog runs detached for the stream's lifetime; the controller's abort ends it.
    void this.#runWatchdog();
  }

  /**
   * Open an events stream and wait for it to connect. Atomic sugar over the constructor for direct consumers: it returns a live stream or throws. Consumers that must
   * not miss a single replayed frame should instead construct the stream, attach their `packet` subscription, and then `await stream.opened` - a pre-`open`
   * subscription is race-free because a socket delivers no message before it opens.
   *
   * @param options - The stream options.
   *
   * @returns A connected {@link EventStream}.
   *
   * @throws {@link ProtectNetworkError} if the socket closes before it opens, or {@link ProtectAbortedError} if the caller's signal aborts the connect.
   */
  static async connect(options: EventStreamOptions): Promise<EventStream> {

    const stream = new EventStream(options);

    await stream.opened;

    return stream;
  }

  /**
   * The open handshake. Resolves when the WebSocket opens; rejects with a {@link ProtectNetworkError} if it closes before opening, or a {@link ProtectAbortedError} if
   * the caller's signal aborts first. The composition root awaits this *after* attaching its bridge subscription, so no frame is lost between open and subscription.
   */
  get opened(): Promise<void> {

    return this.#opened;
  }

  /**
   * The `clock.now()` timestamp of the most recent frame received (seeded to construction time). The watchdog's only liveness source; also readable for diagnostics.
   */
  get lastMessageAt(): number {

    return this.#lastMessageAt;
  }

  /**
   * Subscribe to a stream event. Returns a `Disposable`; prefer `using sub = stream.on(...)` so the listener detaches at scope exit.
   *
   * @param event   - The event to listen for.
   * @param handler - Invoked on each emission.
   *
   * @returns A `Disposable` that removes the listener when disposed.
   */
  on<K extends keyof EventStreamEvents>(event: K, handler: (...args: EventStreamEvents[K]) => void): Disposable {

    return this.#bus.on(event, handler);
  }

  /**
   * Wait for the next emission of a stream event.
   *
   * @param event - The event to await.
   * @param opts  - Optional abort signal.
   *
   * @returns A promise resolving to the event's argument tuple.
   */
  async once<K extends keyof EventStreamEvents>(event: K, opts: { signal?: AbortSignal } = {}): Promise<EventStreamEvents[K]> {

    return this.#bus.once(event, opts);
  }

  /**
   * Stream every subsequent emission of a stream event until the signal aborts.
   *
   * @param event - The event to stream.
   * @param opts  - Stream options, including the abort signal.
   *
   * @returns An async iterable of the event's argument tuples.
   */
  stream<K extends keyof EventStreamEvents>(event: K, opts: StreamOptions = {}): AsyncIterable<EventStreamEvents[K]> {

    return this.#bus.stream(event, opts);
  }

  /**
   * The realtime event firehose: every decoded {@link TypedEvent}, until the signal aborts or the stream closes. Sugar over `stream("packet")` that unwraps the
   * single-element argument tuple to the event itself.
   *
   * @param opts - Optional abort signal that terminates the iteration.
   *
   * @returns An async iterable of typed events.
   */
  async *packets(opts: { signal?: AbortSignal } = {}): AsyncGenerator<TypedEvent> {

    // The underlying `stream` rail rejects with the abort reason when its signal fires (node:events' `on` contract). For the firehose sugar we smooth that into a clean
    // return on the caller's own abort - a `for await` over the firehose ends quietly on Ctrl-C rather than forcing every consumer to wrap it in try/catch. Any other
    // error still propagates.
    try {

      for await (const [event] of this.#bus.stream("packet", opts)) {

        yield event;
      }
    } catch(error) {

      if(opts.signal?.aborted === true) {

        return;
      }

      throw error;
    }
  }

  /**
   * Close the stream: request the WebSocket close, detach every listener, end the watchdog, and destroy the owned agent. Safe to call more than once, and awaitable.
   */
  async close(): Promise<void> {

    this.#shutdown(1000, "the events stream was closed by the client");

    await (this.#closePromise ?? Promise.resolve());
  }

  /**
   * Dispose the stream. Delegates to {@link EventStream.close} so `await using stream = ...` tears the socket down cleanly.
   */
  async [Symbol.asyncDispose](): Promise<void> {

    await this.close();
  }

  // The WebSocket opened. Record the lifecycle event and settle the open handshake.
  #onOpen(): void {

    this.#live = true;
    this.#log.debug("Connected to the UniFi Protect realtime events API.");
    this.#settleOpen();
  }

  // A frame arrived. Stamp liveness first (any byte from the controller proves the channel is alive, decodable or not), then decode and classify at the one site that
  // does so. A decode failure surfaces on the error rail but does not tear the channel down - WebSocket frames are independently delimited, so one bad frame does not
  // desync the next. A classifier null is either genuine schema drift (an unmodeled model key, surfaced once per model-key/action on the diagnostics channel) or a
  // modeled-but-not-lifted packet (a non-self-describing event, an unhandled action), which we leave at debug.
  #onMessage(data: unknown): void {

    this.#lastMessageAt = this.#clock.now();

    const buffer = toBuffer(data);

    if(buffer === null) {

      this.#log.debug("Skipping an unsupported realtime message frame.", { type: typeof data });

      return;
    }

    let event: TypedEvent | null;

    try {

      const raw = decodePacket(buffer);

      // The raw observability rail fires here - one step before classification, so it carries every decoded frame, including the valid-but-unmodeled ones the classifier
      // drops to null below. This is a second fan-out of the single decode, not a second decode; it is pure observability and is never dispatched into state.
      this.#bus.emit("rawPacket", raw);

      event = classifyPacket(raw);

      if(event === null) {

        this.#noteUnclassified(raw.header.action, raw.header.id, raw.header.modelKey);

        return;
      }
    } catch(error) {

      this.#bus.emit("error", (error instanceof ProtectError) ? error :
        new ProtectProtocolError("A realtime events frame could not be decoded.", { cause: error }));

      return;
    }

    if(channels.eventsPacket.hasSubscribers) {

      channels.eventsPacket.publish(this.#packetPayload(event));
    }

    this.#bus.emit("packet", event);
  }

  // The socket reported an error. Suppress the expected-disconnect noise (the same predicate the livestream WS handler uses), surface a typed error, and request a
  // close so teardown flows through the single close path.
  #onError(event: ProtectWebSocketErrorEvent): void {

    if(!isExpectedWsDisconnect(event.error)) {

      this.#log.error("The UniFi Protect realtime events API reported an error.", event.error ?? event.message);
    }

    this.#bus.emit("error", new ProtectNetworkError("The UniFi Protect realtime events API connection failed.", { cause: event.error }));
    this.#shutdown(1006, "the events stream connection errored");
  }

  // The single teardown. Guarded so it runs once whether triggered by the socket's close event, an error, the watchdog, or an explicit close. Aborts the controller
  // (detaching every listener and ending the watchdog), settles a still-pending open handshake as a failure, announces the close, and destroys the owned agent.
  #onClose(code: number, reason: string): void {

    if(this.#closed) {

      return;
    }

    this.#closed = true;
    this.#controller.abort();

    // Settle a still-pending open handshake as a failure. A caller-signal abort surfaces as the typed ProtectAbortedError (its own event, its own type); every other
    // pre-open teardown - an unsolicited peer close, a socket error, a watchdog stall, an explicit close() - stays the generic pre-open network error.
    this.#settleOpen(this.#callerAborted ? new ProtectAbortedError("The UniFi Protect realtime events API connection was aborted by the caller's signal.") :
      new ProtectNetworkError("The UniFi Protect realtime events API closed before it finished connecting.", { cause: reason }));

    // An unsolicited close - the peer dropped a live socket without our asking - is termination we did not initiate, the same category as a socket error, and a
    // controller
    // reboot arrives exactly this way (a `close` event with no preceding socket `error`). Route it onto the error rail so the ConnectionMonitor recovers; a
    // self-initiated
    // close, or one that follows an already-emitted error (socket error / watchdog stall, both of which set #closeInitiated via #shutdown), stays informational.
    // The #live
    // gate keeps a pre-open connect failure on the opened-handshake rejection rather than starting a doomed recovery.
    if(!this.#closeInitiated && this.#live) {

      this.#bus.emit("error", new ProtectNetworkError("The UniFi Protect realtime events API connection closed unexpectedly.", { cause: reason }));
    }

    this.#log.debug("The UniFi Protect realtime events API connection closed.", { code, reason });
    this.#bus.emit("closed", { code, reason });

    if(channels.eventsClosed.hasSubscribers) {

      channels.eventsClosed.publish({ code, reason } satisfies EventsClosedPayload);
    }

    this.#closePromise = (this.#ownedAgent === null) ? Promise.resolve() : this.#ownedAgent.destroy();
  }

  // The caller's own signal fired. Mark this teardown as a caller abort BEFORE it runs, so #onClose settles a still-pending open handshake as the typed
  // ProtectAbortedError; only this path sets the mark, so a socket close, an error, the watchdog, or an explicit close() keep the generic pre-open network error.
  #abortByCaller(): void {

    this.#callerAborted = true;
    this.#shutdown(1000, "connection aborted by the caller's signal");
  }

  // Request a graceful WebSocket close, then run teardown. Calling close() on the socket is best-effort - destroying the owned agent (in #onClose) is what guarantees
  // the underlying connection is released even if the close frame never completes.
  #shutdown(code: number, reason: string): void {

    // Mark this as a self-initiated teardown so #onClose does not misclassify the resulting close event as an unsolicited (recoverable) one.
    this.#closeInitiated = true;

    try {

      this.#ws.close();
    } catch {

      // A socket that never opened (or a fake that rejects a premature close) must not block teardown; #onClose below releases everything regardless.
    }

    this.#onClose(code, reason);
  }

  // Record an unclassified frame. Genuine schema drift - a model key outside the recognized wire vocabulary - is published once per (modelKey, action) so a consumer
  // sees the controller's wire-format evolution explicitly; a recognized-but-unlifted packet (a non-self-describing event, an unhandled action, or a recognized-but-
  // unmodeled collection like group/bridge) stays at debug.
  #noteUnclassified(action: string, id: string, modelKey: string): void {

    if(isKnownModelKey(modelKey)) {

      this.#log.debug("Received a recognized realtime packet the classifier did not lift.", { action, modelKey });

      return;
    }

    const key = modelKey + ":" + action;

    if(this.#seenUnknown.has(key)) {

      return;
    }

    this.#seenUnknown.add(key);
    this.#log.debug("Received a realtime packet with a model key the library does not model.", { action, modelKey });

    if(channels.schemaUnknownModelKey.hasSubscribers) {

      channels.schemaUnknownModelKey.publish({ action, exampleId: id, modelKey } satisfies SchemaUnknownModelKeyPayload);
    }
  }

  // Build the events:packet diagnostic payload. Device transitions carry a model key and id; activity signals and the synthetic bootstrap carry neither at this level.
  #packetPayload(event: TypedEvent): EventsPacketPayload {

    if((event.kind === "deviceAdded") || (event.kind === "devicePatched") || (event.kind === "deviceRemoved")) {

      return { id: event.id, kind: event.kind, modelKey: event.modelKey };
    }

    return { kind: event.kind };
  }

  // The silence watchdog. Each tick checks how long the channel has been quiet; once it crosses the threshold the channel is presumed dead-but-not-closed, so we
  // surface a typed stall (the ConnectionMonitor's cue to recover) and tear the socket down. The loop ends when teardown aborts the controller, which the interval
  // iterator reports as an abort - the normal shutdown path, swallowed here. Detection latency is bounded in [threshold, 2*threshold) by the interval granularity,
  // which is appropriate for a multi-minute failsafe and needs no variable-cadence timer that reschedules on every message.
  async #runWatchdog(): Promise<void> {

    try {

      for await (const _tick of this.#clock.setInterval(PROTECT_EVENTS_WATCHDOG_TIMEOUT, { signal: this.#controller.signal })) {

        const silentForMs = this.#clock.now() - this.#lastMessageAt;

        if(silentForMs >= PROTECT_EVENTS_WATCHDOG_TIMEOUT) {

          this.#log.error("The UniFi Protect realtime events API went silent beyond the watchdog window; tearing down the stalled connection.", { silentForMs });
          this.#bus.emit("error", new ProtectStallError("The UniFi Protect realtime events API produced no data within the watchdog window.", { silentForMs }));
          this.#shutdown(1006, "the events stream stalled past the watchdog window");

          return;
        }
      }
    } catch {

      // The interval iterator throws on abort when the stream is torn down. That is the expected end of the loop, not an error.
    }
  }
}
