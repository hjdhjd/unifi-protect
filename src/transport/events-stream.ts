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
 * **The WebSocket is an injected dependency**, exactly like the {@link Transport}'s dispatcher and the {@link StateStore}'s refresh hook. `EventStream` depends on the
 * minimal {@link ProtectWebSocket} interface - only the surface it uses - never undici's full type. The default factory builds undici's `WebSocket` over an
 * owned HTTP/1.1 connection whose certificate verification follows the `verifyTls` option, permissive by default because Protect controllers ship self-signed
 * certificates (and a WebSocket upgrade cannot go through the HTTP/2 request pool). Tests inject a fake socket and drive `open` / `message` / `close` / `error`
 * deterministically (undici's `MockAgent` does not mock WebSockets).
 *
 * **The watchdog detects here; `ConnectionMonitor` responds.** This is the same division as the throttle breaker: the subsystem that owns a resource detects its health
 * condition and emits a typed signal, and the one coordinator responds. `EventStream` stamps `lastMessageAt` on every frame and runs a silence watchdog on the injected
 * `Clock`; a wake that finds the channel silent past {@link PROTECT_EVENTS_WATCHDOG_TIMEOUT} concludes it is dead-but-not-closed (the lossy-firmware case the whole
 * design exists for), tears the socket down and emits `error({@link ProtectStallError})` - a `RecoverableError`, so the error type itself is the "recover" signal -
 * once the connection is released. A stall before the socket opens rejects {@link EventStream.opened} with that error instead, since there is no open stream yet
 * for anyone to recover.
 * `EventStream` does not reconnect; that is `ConnectionMonitor`'s scope. The gap is covered by the bootstrap-refresh failsafe, which exists precisely for it.
 *
 * @module EventStream
 */
import { Agent, WebSocket } from "undici";
import type { EventsClosedPayload, EventsPacketPayload, SchemaUnknownModelKeyPayload } from "../diagnostics.ts";
import { ProtectAbortedError, ProtectError, ProtectNetworkError, ProtectProtocolError, ProtectStallError, assertNever } from "../errors.ts";
import type { ProtectWebSocket, ProtectWebSocketCloseEvent, ProtectWebSocketErrorEvent, ProtectWebSocketMessageEvent, SocketFaultLine, SocketTeardown } from "./ws.ts";
import { classifyPacket, isKnownModelKey } from "../protocol/events.ts";
import { closeFrameText, socketFault, teardownCode, toBuffer } from "./ws.ts";
import { createOwnedConnector, releaseOwned } from "./connector.ts";
import { millisecondsSince, wallClock } from "../clock.ts";
import type { Clock } from "../clock.ts";
import { EventBus } from "../event-bus.ts";
import type { OwnedDispatcher } from "./connector.ts";
import { PROTECT_EVENTS_WATCHDOG_TIMEOUT } from "../settings.ts";
import { PROTECT_PROXY_PATH } from "./url-host.ts";
import type { ProtectLogging } from "../logging.ts";
import type { RawPacket } from "../protocol/packet.ts";
import type { StreamOptions } from "../event-bus.ts";
import type { TypedEvent } from "../protocol/events.ts";
import { channels } from "../diagnostics.ts";
import { decodePacket } from "../protocol/packet.ts";
import { noopLog } from "../logging.ts";

/**
 * Construction options for {@link EventStream}.
 *
 * - `host` and `lastUpdateId` build the WebSocket URL. `host` is the controller's URL authority, an IPv6 literal bracketed and any port kept, and `lastUpdateId` is
 *   handed to the controller so it replays any events that fired between the bootstrap snapshot and the WebSocket coming online.
 * - `getAuthHeaders` is the cookie hook, wired to {@link AuthSession} at the composition root (the same dependency inversion the {@link Transport} uses).
 * - `webSocket` is the injected I/O dependency; omit it to use the default undici-backed factory, inject it in tests.
 * - `signal` cancels the connection attempt alone. If it aborts before the socket opens, {@link EventStream.opened} rejects with `ProtectAbortedError` and the
 *   stream tears down; the stream stops listening to it once the socket opens, so an abort from then on leaves the live stream running until
 *   {@link EventStream.close} or a fault ends it.
 * - `verifyTls` opts the owned connection into strict TLS certificate verification; it defaults to `false` for the controller's self-signed certificate. An injected
 *   `webSocket` factory builds no agent here, so the option is inert alongside one.
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
  verifyTls?: boolean;
  webSocket?: (url: string) => ProtectWebSocket;
}

/**
 * The events {@link EventStream} publishes on its three-rail surface.
 *
 * - `packet` is the realtime firehose: one decoded {@link TypedEvent} per modeled frame. The composition root bridges it into the state store and the client firehose.
 * - `rawPacket` is the raw observability firehose: the decoded {@link RawPacket} (header + payload) of *every* frame, emitted one decode step before `packet` and
 *   before classification - so it carries the valid-but-unmodeled frames the classifier drops to `null`, which `packet` never sees. Pure observability for protocol
 *   exploration and capture; never dispatched into state, no state-ordering guarantee (unlike `packet`, which is dispatched-then-emitted).
 * - `closed` fires once when the stream tears down, carrying a code and reason that classify the teardown: the peer's own close code and reason for a close it
 *   started, otherwise 1000 for a teardown we chose (an explicit close or a caller abort) and 1006 for one forced by a failure (a socket error or a watchdog stall).
 * - `error` carries a typed {@link ProtectError} - a decode failure, a socket error, a {@link ProtectStallError} from the silence watchdog, or a {@link
 *   ProtectNetworkError} when the peer closes a live socket unsolicited (a controller reboot drops the socket this way: a `close` event with no preceding socket
 *   `error`). Every termination of an open stream we did not initiate reaches this rail, as does a watchdog stall of an open stream; a self-initiated close stays
 *   informational on `closed`, and a socket error, a watchdog stall, a peer close or a caller-signal abort before open surfaces on the {@link EventStream.opened}
 *   handshake rejection alone rather than here. The error *type* is what the `ConnectionMonitor` acts on.
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
 * A caller's signal cancels the connection attempt alone and never the live stream: the stream listens to it until the socket opens and then lets it go, so what
 * ends an open stream is its own {@link EventStream.close} or a fault, and the layer that owns connection policy recovers from the fault.
 *
 * @category Transport
 */
export class EventStream implements AsyncDisposable {

  // The address this stream dials, read from the URL the socket opens, which is what a certificate refusal reports the peer as.
  readonly #address: string;
  readonly #bus: EventBus<EventStreamEvents>;
  readonly #clock: Clock;
  // When the connection attempt began, as the injected clock's monotonic reading, which is what a connection attempt that times out measures its elapsed time from.
  // It is a stamp of its own rather than the watchdog's liveness stamp, which every frame moves.
  readonly #connectStartedAt: number;
  // One AbortController governs the watchdog loop, so a single abort() ends it, as the livestream session's ends its own. The socket's listeners and the binding to the
  // caller's signal are not among what it governs: the stream holds them and removes them itself, the binding at the open or in a teardown that comes first, and the
  // socket's listeners in its teardown.
  readonly #controller = new AbortController();
  readonly #log: ProtectLogging;
  /* What we own when we built the default WebSocket, and null when a factory was injected - its owner manages the transport underneath it, and we never destroy what
   * we did not create, exactly as Transport treats an injected dispatcher. The agent, carried as the dispatcher, and the connector travel as one value so the two
   * cannot disagree about whether there is anything to release. The connector is what puts the whole connection within reach: destroying the agent releases only
   * what the agent still holds, a completed upgrade hands its socket to the WebSocket machinery, and a socket still in its handshake belongs to nothing else at all.
   */
  readonly #owned: OwnedDispatcher | null;
  readonly #ws: ProtectWebSocket;

  /* The socket's handlers and the handler bound to the caller's signal, built once and held on the instance so the stream removes each by the identity it was
   * registered under: the caller's at the open, or in a teardown that comes first, and the socket's in the teardown. The `signal` registration option is
   * deliberately not what detaches them: on every Node before the fix for nodejs/node#63954 (all of 22, 24 before 24.22, 25, and 26 before 26.9) the runtime keeps
   * only the last signal-bound removal per target alive, so a garbage collection landing before the abort leaves the others attached, and a teardown that must
   * detach before it asks the socket to close cannot rest on that. A reference the stream owns cannot be collected out from under it, which makes the detach a
   * property of the stream rather than of the collector.
   */
  readonly #callerSignal: AbortSignal | undefined;
  readonly #onCallerAbort = (): void => this.#abortByCaller();
  readonly #socketListeners = {

    close: (event: ProtectWebSocketCloseEvent): void => this.#onClose({ code: event.code, kind: "peer", reason: event.reason }),
    error: (event: ProtectWebSocketErrorEvent): void => this.#onError(event),
    message: (event: ProtectWebSocketMessageEvent): void => this.#onMessage(event.data),
    open: (): void => this.#onOpen()
  };

  /* The open handshake, settled exactly once: resolved on the WebSocket `open` event, rejected if the socket closes (or the caller's signal aborts) before opening.
   * Settling once is a property of the lifecycle rather than a check of its own: the `open` listener fires once and every teardown removes it before it reports,
   * #onOpen marks the stream live before it resolves, and the teardown runs once and rejects only a stream that never opened.
   */
  readonly #opened: Promise<void>;
  readonly #rejectOpen: (error: ProtectError) => void;
  readonly #resolveOpen: (value: undefined) => void;

  // The model-key/action pairs whose schema-drift signal we have already published this session, so sustained drift does not spam the diagnostics channel.
  readonly #seenUnknown = new Set<string>();

  // The release of the connection the stream owns, which the single teardown starts and close()/dispose await, null until the teardown runs, so it is also the gate
  // that runs the teardown once. lastMessageAt is the watchdog's only liveness source - the clock's monotonic reading at every frame, seeded at construction so a
  // fresh stream is not instantly considered stale.
  #released: Promise<void> | null = null;
  #lastMessageAt: number;
  // True once the socket has opened, which decides what a teardown owes: the open handshake's rejection for a stream that never opened, and the error rail for one
  // that did, so a pre-open connect failure reaches its caller alone rather than starting a recovery.
  #live = false;

  constructor(options: EventStreamOptions) {

    this.#callerSignal = options.signal;
    this.#clock = options.clock ?? wallClock;
    this.#log = options.log ?? noopLog;
    this.#bus = new EventBus<EventStreamEvents>(this.#log);
    this.#lastMessageAt = this.#clock.monotonic();

    const url = "wss://" + options.host + PROTECT_PROXY_PATH + "/ws/updates?" + new URLSearchParams({ lastUpdateId: options.lastUpdateId }).toString();

    this.#address = URL.parse(url)?.host ?? url;

    /* Build the socket: an injected factory in tests, otherwise undici's WebSocket over an owned HTTP/1.1 agent that dials through an owned connector, its
     * certificate posture following `verifyTls`, which is permissive by default for the controller's self-signed certificate. HTTP/2 is off and pipelining disabled
     * because a WebSocket upgrade can use neither. `allowH2` reaches the connector and the agent alike, because the connector's copy decides the ALPN offer and the
     * agent's how it handles the connection. undici's WebSocket structurally satisfies the minimal ProtectWebSocket surface we model, so it assigns directly - no cast,
     * the interface is honest by construction. Building the socket is where the connection attempt begins, whichever branch builds it, so the attempt's start is
     * stamped immediately ahead of it.
     */
    this.#connectStartedAt = this.#clock.monotonic();

    if(options.webSocket !== undefined) {

      this.#owned = null;
      this.#ws = options.webSocket(url);
    } else {

      const allowH2 = false;
      const connector = createOwnedConnector({ allowH2, verifyTls: options.verifyTls ?? false });
      const agent = new Agent({ allowH2, connect: connector.connect, pipelining: 0 });

      this.#owned = { connector, dispatcher: agent };
      this.#ws = new WebSocket(url, { dispatcher: agent, headers: options.getAuthHeaders?.() ?? {} });
    }

    this.#ws.binaryType = "arraybuffer";

    const { promise, resolve, reject } = Promise.withResolvers<undefined>();

    this.#opened = promise;
    this.#rejectOpen = reject;
    this.#resolveOpen = resolve;

    // Attaching a no-op rejection handler marks the handshake promise as handled, so a consumer that only subscribes via `on("packet")` and never awaits `opened` does
    // not trigger an unhandled-rejection warning when the socket fails to open. Real awaiters (the composition root, `connect()`) still receive the rejection - both
    // handlers run.
    void this.#opened.catch(() => undefined);

    // The socket's handlers register with no `signal` option, since the teardown removes each itself. The close and error handlers are `once` - a socket reports each
    // terminal condition a single time - while message stays live for the connection's lifetime.
    this.#ws.addEventListener("open", this.#socketListeners.open, { once: true });
    this.#ws.addEventListener("message", this.#socketListeners.message);
    this.#ws.addEventListener("close", this.#socketListeners.close, { once: true });
    this.#ws.addEventListener("error", this.#socketListeners.error, { once: true });

    // The caller's signal cancels the connection attempt alone: the open removes this binding, so an abort once the stream is live changes nothing, and a teardown
    // before the open removes it as it removes the socket's handlers.
    if(options.signal !== undefined) {

      if(options.signal.aborted) {

        this.#abortByCaller();
      } else {

        options.signal.addEventListener("abort", this.#onCallerAbort, { once: true });
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
   * @throws The failure that ended the connect: a socket error's classified failure ({@link ProtectNetworkError}, {@link ProtectCertificateError} when the
   *   controller's certificate is refused, or {@link ProtectTimeoutError} when the connection attempt timed out), a {@link ProtectStallError} if the silence
   *   watchdog ends a connect that never opened, a generic {@link ProtectNetworkError} if the socket closes before it opens, or {@link ProtectAbortedError} if the
   *   caller's signal aborts the connect.
   */
  static async connect(options: EventStreamOptions): Promise<EventStream> {

    const stream = new EventStream(options);

    await stream.opened;

    return stream;
  }

  /**
   * The open handshake. Resolves when the WebSocket opens, and rejects with whatever ended the connect: a socket error's classified failure, which carries the
   * dial's own error as its cause (a {@link ProtectCertificateError} naming the address dialed, a {@link ProtectTimeoutError} when the connection attempt timed
   * out, or a {@link ProtectNetworkError}), a {@link ProtectStallError} if the silence watchdog fires first, a generic {@link ProtectNetworkError} if the socket
   * closes before opening, or a {@link ProtectAbortedError} if the caller's signal aborts first. A failure before open reaches its caller here alone, never on the
   * `error` rail, so a connect its caller is already failing starts no recovery. The composition root awaits this *after* attaching its bridge subscription, so no
   * frame is lost between open and subscription.
   */
  get opened(): Promise<void> {

    return this.#opened;
  }

  /**
   * The clock's `monotonic()` reading at the most recent frame received (seeded at construction). The watchdog's only liveness source; also readable for
   * diagnostics, where it is a point on the monotonic timeline rather than a time of day, so it means something only against another `monotonic()` reading.
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
   * The realtime event firehose: every decoded {@link TypedEvent}, until the caller's signal aborts. Closing the stream does not end the iteration, so a consumer ties
   * the signal to the stream's lifetime. Sugar over `stream("packet")` that unwraps the single-element argument tuple to the event itself.
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
   * Close the stream: detach every listener, end the watchdog, request the WebSocket close, and release the connection the stream owns. Safe to call more than once,
   * and awaitable.
   */
  async close(): Promise<void> {

    this.#shutdown({ kind: "close", reason: "the events stream was closed by the client" });

    await this.#released;
  }

  /**
   * Dispose the stream. Delegates to {@link EventStream.close} so `await using stream = ...` tears the socket down cleanly.
   */
  async [Symbol.asyncDispose](): Promise<void> {

    await this.close();
  }

  /* The WebSocket opened. Settle the open handshake, then record the lifecycle event, so a logger that throws on the debug line leaves the handshake settled.
   *
   * The open is also where the caller's signal stops governing the stream, because it cancels the connection attempt and nothing after it. Its binding comes off
   * here, by the identity it was registered under, so an abort once the stream is live changes nothing, and what ends the stream from then on is its own close()
   * or a fault the ConnectionMonitor recovers from.
   */
  #onOpen(): void {

    this.#callerSignal?.removeEventListener("abort", this.#onCallerAbort);
    this.#live = true;
    this.#resolveOpen(undefined);
    this.#log.debug("Connected to the UniFi Protect realtime events API.");
  }

  // A frame arrived. Stamp liveness first (any byte from the controller proves the channel is alive, decodable or not), then decode and classify at the one site that
  // does so. A decode failure surfaces on the error rail but does not tear the channel down - WebSocket frames are independently delimited, so one bad frame does not
  // desync the next. A classifier null is either genuine schema drift (an unmodeled model key, surfaced once per model-key/action on the diagnostics channel) or a
  // modeled-but-not-lifted packet (a non-self-describing event, an unhandled action), which we leave at debug.
  #onMessage(data: unknown): void {

    this.#lastMessageAt = this.#clock.monotonic();

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

  /* The socket reported an error. The cause is read once, from the connector ahead of the event: a WebSocket upgrade that fails reports a content-free `TypeError`
   * on this event while the connector that vended the socket still holds the dial's own error, and an established connection the peer resets reports the same
   * `TypeError` while the connector holds the reset the socket raised - so reading the event alone would throw away every errno the platform gave, the certificate
   * verdict among them. An injected socket has no connector of ours, and there its event error is the whole account. That one cause is the typed failure's cause
   * as well as the line's subject, so the line and the failure always name the same fault.
   *
   * The one cause, classified once, is the fault the teardown runs for, carrying the typed error and the line an open stream logs at the level the connection-fault
   * table answers. Where the failure goes depends on whether the socket had opened, and the teardown decides it after the release: an open stream's fault goes on
   * the error rail, so the ConnectionMonitor recovers, and then logs its line; a stream that never opened settles its handshake with the failure, logs nothing and
   * puts nothing on the rail, because its caller reports it from the rejection, so a line here as well would log one failure twice, and a rail fault would start a
   * recovery for a connect that caller is already failing.
   */
  #onError(event: ProtectWebSocketErrorEvent): void {

    const connector = this.#owned?.connector;
    const cause = connector?.lastDialFailure ?? connector?.lastConnectionFailure ?? event.error;

    this.#shutdown(socketFault({ cause, elapsed: millisecondsSince(this.#connectStartedAt, { clock: this.#clock }),
      failed: "The UniFi Protect realtime events API connection failed.", host: this.#address, open: this.#live, reason: "the events stream connection errored",
      reported: "The UniFi Protect realtime events API reported an error.", timedOut: "The UniFi Protect realtime events API connection timed out." }));
  }

  /* The single teardown, run once whether the socket's close event, an error, the watchdog, the caller's signal or an explicit close starts it, with the reason it
   * ran. The removal of the listeners and the abort stay here as well as in #shutdown because the peer's own close listener reaches this teardown without passing
   * through it, and repeating them does nothing.
   *
   * The release starts directly after the abort, ahead of every report, so everything the teardown then settles or announces finds the connection already severed:
   * releaseOwned severs it in one synchronous stack, before it returns, so a listener that reopens on the close never overlaps the connection this teardown lets go,
   * and nothing that throws past this point, a logger included, can leave it held. releaseOwned destroys the agent and then releases the connector, in the order and
   * for the reasons it states. The connector's release is what severs a socket the agent does not hold: one a completed upgrade handed to the WebSocket machinery,
   * which a peer that never answers the close frame would otherwise hold open, and one still in its handshake.
   *
   * The reports then run in one order: the handshake's rejection for a stream that never opened or the rail fault for one that did, the line a fault carries, the
   * close line, `closed` and the closed diagnostic.
   */
  #onClose(teardown: SocketTeardown): void {

    if(this.#released !== null) {

      return;
    }

    const code = teardownCode(teardown);
    const { reason } = teardown;

    this.#detachListeners();
    this.#controller.abort();
    this.#released = (this.#owned === null) ? Promise.resolve() : releaseOwned(this.#owned);

    if(this.#live) {

      const fault = this.#railFault(teardown);

      if(fault !== null) {

        this.#bus.emit("error", fault);
      }
    } else {

      this.#rejectOpen(this.#preOpenFailure(teardown));
    }

    if((teardown.kind === "fault") && (teardown.line !== null)) {

      this.#log[teardown.line.level](teardown.line.message, teardown.line.context);
    }

    this.#log.debug("The UniFi Protect realtime events API connection closed.", { code, reason });
    this.#bus.emit("closed", { code, reason });

    if(channels.eventsClosed.hasSubscribers) {

      channels.eventsClosed.publish({ code, reason } satisfies EventsClosedPayload);
    }
  }

  /* What a handshake that never completed rejects with. A fault is handed over as itself, so the rejection's type says exactly what went wrong; the caller's own
   * signal gets the typed abort, a cancellation rather than a failure; an explicit close settles as the generic pre-open failure; and a peer's close does too,
   * naming the frame it arrived on.
   */
  #preOpenFailure(teardown: SocketTeardown): ProtectError {

    switch(teardown.kind) {

      case "callerSignal":

        return new ProtectAbortedError("The UniFi Protect realtime events API connection was aborted by the caller's signal.");

      case "close":

        return new ProtectNetworkError("The UniFi Protect realtime events API closed before it finished connecting.", { cause: teardown.reason });

      case "fault":

        return teardown.error;

      case "peer":

        return new ProtectNetworkError("The UniFi Protect realtime events API closed before it finished connecting (" + closeFrameText(teardown.code, teardown.reason) +
          ").");

      default:

        // Exhaustiveness guard. A new reason joining the union without a case above stops `teardown` being `never` here, and this fails to compile.
        return assertNever(teardown);
    }
  }

  /* What an open stream's teardown puts on the error rail, or nothing at all for a teardown that was asked for: an explicit close is a clean lifecycle end and stays
   * informational on `closed`, and the caller's cancel never reaches an open stream, its binding having come off at the open. A fault goes out as itself, so a
   * consumer branches on the type the detector chose. The peer dropping a live socket without our asking is termination we did not initiate, the same category as a
   * socket error, and a controller reboot arrives exactly this way (a `close` event with no preceding socket `error`), so it goes out as a network failure naming
   * the frame it arrived on, and the ConnectionMonitor recovers.
   */
  #railFault(teardown: SocketTeardown): ProtectError | null {

    switch(teardown.kind) {

      case "callerSignal":
      case "close":

        return null;

      case "fault":

        return teardown.error;

      case "peer":

        return new ProtectNetworkError("The UniFi Protect realtime events API connection closed unexpectedly (" + closeFrameText(teardown.code, teardown.reason) + ").");

      default:

        // Exhaustiveness guard. A new reason joining the union without a case above stops `teardown` being `never` here, and this fails to compile.
        return assertNever(teardown);
    }
  }

  // The caller's own signal fired. Naming the caller's signal as the teardown's reason is what settles a still-pending open handshake as the typed
  // ProtectAbortedError rather than as a failure the stream detected.
  #abortByCaller(): void {

    this.#shutdown({ kind: "callerSignal", reason: "connection aborted by the caller's signal" });
  }

  // Request a graceful WebSocket close, then run teardown. Calling close() on the socket is best-effort - releasing the owned connection (in #onClose) is what
  // guarantees the underlying connection is released even if the close frame never completes. A call after the teardown has run still asks the socket to close,
  // which does nothing on a socket already closing or closed.
  #shutdown(teardown: SocketTeardown): void {

    /* The socket's listeners come off before it is asked to close, and the stream takes them off itself rather than leaving that to an abort: closing a socket that
     * is still connecting makes undici fail the connection and fire `error` and `close` synchronously, before close() returns, and a listener still attached would
     * carry that into the teardown as a fault or as a peer's close, reporting a failure for a teardown this stream itself asked for. It is also what the peer
     * reason's truth rests on: the socket's own close listener comes off here, ahead of ws.close(), so the only close that can still reach the teardown naming the
     * peer is one this stream did not ask for. The abort that follows ends the watchdog.
     */
    this.#detachListeners();
    this.#controller.abort();

    try {

      this.#ws.close();
    } catch {

      // A socket that never opened (or a fake that rejects a premature close) must not block teardown; #onClose below releases everything regardless.
    }

    this.#onClose(teardown);
  }

  /* Take the socket's listeners and the caller-signal binding off, each handed back by the identity it was registered under. Removing one that a `once` dispatch
   * or the open has already taken off is quiet, so the teardown asks for every listener it registered whatever the socket and the signal have already reported.
   */
  #detachListeners(): void {

    this.#ws.removeEventListener("close", this.#socketListeners.close);
    this.#ws.removeEventListener("error", this.#socketListeners.error);
    this.#ws.removeEventListener("message", this.#socketListeners.message);
    this.#ws.removeEventListener("open", this.#socketListeners.open);
    this.#callerSignal?.removeEventListener("abort", this.#onCallerAbort);
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

  /* The silence watchdog. Each pass waits one threshold on the injected clock, then checks how long the channel has been quiet; once that crosses the threshold the
   * channel is presumed dead-but-not-closed, so the typed stall travels into the teardown as its fault, which reports it once the connection is released. An open
   * stream's stall carries a warning line, since recovery heals it, and goes on the error rail, the ConnectionMonitor's cue to recover; a stream that never opened
   * settles its handshake with it instead, logging nothing and putting nothing on the rail, as a socket error before open does, because its caller is already
   * failing that connect and reports the stall from the rejection. The teardown detaches the socket's error listener before it reports, so a stall never logs
   * beside a socket error for the same failure.
   *
   * The loop ends when teardown aborts the controller, which rejects the pending delay with its abort error, the normal shutdown path swallowed here, as is a throw
   * from a logger refusing the stall's line, which reaches the loop only after the teardown has released the connection. Detection latency is bounded in
   * [threshold, 2*threshold) because the loop wakes once per threshold, which is appropriate for a multi-minute failsafe and needs no variable-cadence timer that
   * reschedules on every message.
   */
  async #runWatchdog(): Promise<void> {

    try {

      for(;;) {

        // eslint-disable-next-line no-await-in-loop
        await this.#clock.delay(PROTECT_EVENTS_WATCHDOG_TIMEOUT, { signal: this.#controller.signal });

        const silentForMs = millisecondsSince(this.#lastMessageAt, { clock: this.#clock });

        if(silentForMs >= PROTECT_EVENTS_WATCHDOG_TIMEOUT) {

          const stall = new ProtectStallError("The UniFi Protect realtime events API produced no data within the watchdog window.", { silentForMs });
          const line: SocketFaultLine | null = this.#live ? { context: { silentForMs }, level: "warn",
            message: "The UniFi Protect realtime events API went silent beyond the watchdog window; tearing down the stalled connection." } : null;

          this.#shutdown({ error: stall, kind: "fault", line, reason: "the events stream stalled past the watchdog window" });

          return;
        }
      }
    } catch {

      // The delay rejects on abort when the stream is torn down. That is the expected end of the loop, not an error.
    }
  }
}
