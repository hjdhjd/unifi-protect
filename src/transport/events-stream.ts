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
 * design exists for), emits `error({@link ProtectStallError})` - a `RecoverableError`, so the error type itself is the "recover" signal - and tears the socket down.
 * A stall before the socket opens rejects {@link EventStream.opened} with that error instead, since there is no open stream yet for anyone to recover.
 * `EventStream` does not reconnect; that is `ConnectionMonitor`'s scope. The gap is covered by the bootstrap-refresh failsafe, which exists precisely for it.
 *
 * @module EventStream
 */
import { Agent, WebSocket } from "undici";
import type { EventsClosedPayload, EventsPacketPayload, SchemaUnknownModelKeyPayload } from "../diagnostics.ts";
import { ProtectAbortedError, ProtectError, ProtectNetworkError, ProtectProtocolError, ProtectStallError } from "../errors.ts";
import type { ProtectWebSocket, ProtectWebSocketErrorEvent } from "./ws.ts";
import { classifyPacket, isKnownModelKey } from "../protocol/events.ts";
import { createOwnedConnector, releaseOwned } from "./connector.ts";
import { reportSocketFailure, toBuffer } from "./ws.ts";
import type { Clock } from "../clock.ts";
import { EventBus } from "../event-bus.ts";
import type { OwnedDispatcher } from "./connector.ts";
import { PROTECT_EVENTS_WATCHDOG_TIMEOUT } from "../settings.ts";
import type { ProtectLogging } from "../logging.ts";
import type { RawPacket } from "../protocol/packet.ts";
import type { StreamOptions } from "../event-bus.ts";
import type { TypedEvent } from "../protocol/events.ts";
import { channels } from "../diagnostics.ts";
import { decodePacket } from "../protocol/packet.ts";
import { noopLog } from "../logging.ts";
import { wallClock } from "../clock.ts";

/**
 * Construction options for {@link EventStream}.
 *
 * - `host` and `lastUpdateId` build the WebSocket URL. `host` is the controller's URL authority, an IPv6 literal bracketed and any port kept, and `lastUpdateId` is
 *   handed to the controller so it replays any events that fired between the bootstrap snapshot and the WebSocket coming online.
 * - `getAuthHeaders` is the cookie hook, wired to {@link AuthSession} at the composition root (the same dependency inversion the {@link Transport} uses).
 * - `webSocket` is the injected I/O dependency; omit it to use the default undici-backed factory, inject it in tests.
 * - `signal` cancels the connection attempt and, once open, the stream - if it aborts before the socket opens, {@link EventStream.opened} rejects with
 *   `ProtectAbortedError`; at any point the stream tears down.
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
 * @category Transport
 */
export class EventStream implements AsyncDisposable {

  // The address this stream dials, read from the URL the socket opens, which is what a certificate refusal reports the peer as.
  readonly #address: string;
  readonly #bus: EventBus<EventStreamEvents>;
  readonly #clock: Clock;
  // When the connection attempt began, on the injected clock, which is what a connection attempt that times out measures its elapsed time from. It is a stamp of its
  // own rather than the watchdog's liveness stamp, which every frame moves.
  readonly #connectStartedAt: number;
  // One AbortController governs every WebSocket listener and the watchdog loop. A single abort() detaches them all at once - the same teardown primitive the livestream
  // session uses.
  readonly #controller = new AbortController();
  readonly #log: ProtectLogging;
  /* What we own when we built the default WebSocket, and null when a factory was injected - its owner manages the transport underneath it, and we never destroy what
   * we did not create, exactly as Transport treats an injected dispatcher. The agent, carried as the dispatcher, and the connector travel as one value so the two
   * cannot disagree about whether there is anything to release. The connector is what puts the whole connection within reach: destroying the agent releases only
   * what the agent still holds, a completed upgrade hands its socket to the WebSocket machinery, and a socket still in its handshake belongs to nothing else at all.
   */
  readonly #owned: OwnedDispatcher | null;
  readonly #ws: ProtectWebSocket;

  // The open handshake, settled exactly once: resolved on the WebSocket `open` event, rejected if the socket closes (or the caller's signal aborts) before opening.
  readonly #opened: Promise<void>;
  readonly #settleOpen: (error?: ProtectError) => void;

  // The model-key/action pairs whose schema-drift signal we have already published this session, so sustained drift does not spam the diagnostics channel.
  readonly #seenUnknown = new Set<string>();

  // The single teardown gate and the connection-release promise close()/dispose await. lastMessageAt is the watchdog's only liveness source - clock-stamped on every
  // frame, seeded to construction time so a fresh stream is not instantly considered stale.
  #closePromise: Promise<void> | null = null;
  #closed = false;
  // Set by every self-initiated teardown (close(), caller abort, watchdog stall, socket error), so #onClose can tell a deliberate close from a peer-initiated one and
  // route only the latter onto the error rail.
  #closeInitiated = false;
  // Set ONLY by the caller-abort teardown path, a narrowing of the broader #closeInitiated, so #onClose settles a still-pending open handshake as the typed
  // ProtectAbortedError for a caller abort. A socket error or a watchdog stall before open has already settled the handshake with its own typed failure by then, and
  // every other pre-open teardown (a peer close, an explicit close()) keeps the generic ProtectNetworkError.
  #callerAborted = false;
  #lastMessageAt: number;
  // True once the socket has opened. Gates the unsolicited-close error so a pre-open connect failure flows through the opened-handshake rejection alone, not a recovery.
  #live = false;
  #openSettled = false;

  constructor(options: EventStreamOptions) {

    this.#clock = options.clock ?? wallClock;
    this.#log = options.log ?? noopLog;
    this.#bus = new EventBus<EventStreamEvents>(this.#log);
    this.#lastMessageAt = this.#clock.now();

    const url = "wss://" + options.host + "/proxy/protect/ws/updates?" + new URLSearchParams({ lastUpdateId: options.lastUpdateId }).toString();

    this.#address = URL.parse(url)?.host ?? url;

    /* Build the socket: an injected factory in tests, otherwise undici's WebSocket over an owned HTTP/1.1 agent that dials through an owned connector, its
     * certificate posture following `verifyTls`, which is permissive by default for the controller's self-signed certificate. HTTP/2 is off and pipelining disabled
     * because a WebSocket upgrade can use neither. `allowH2` reaches the connector and the agent alike, because the connector's copy decides the ALPN offer and the
     * agent's how it handles the connection. undici's WebSocket structurally satisfies the minimal ProtectWebSocket surface we model, so it assigns directly - no cast,
     * the interface is honest by construction. Building the socket is where the connection attempt begins, whichever branch builds it, so the attempt's start is
     * stamped immediately ahead of it.
     */
    this.#connectStartedAt = this.#clock.now();

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

    // The caller's signal cancels the connection attempt and, once open, the stream itself. Bound to our own signal too, so it detaches with everything else once we
    // tear down.
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

    // WebSocket close code 1000 (RFC 6455 normal closure) marks a close this instance itself decided on - an explicit close() call or a caller-signal abort - while code
    // 1006 (abnormal closure) marks a close forced by conditions outside our control - a socket error or a watchdog-detected stall. Every #shutdown call site in this
    // file chooses between the two along exactly that line, so #onClose and any downstream consumer inspecting the code can tell a deliberate teardown from one that
    // signals a connection problem.
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

  /* The socket reported an error. The cause is read once, from the connector ahead of the event: a WebSocket upgrade that fails reports a content-free `TypeError`
   * on this event while the connector that vended the socket still holds the dial's own error, and an established connection the peer resets reports the same
   * `TypeError` while the connector holds the reset the socket raised - so reading the event alone would throw away every errno the platform gave, the certificate
   * verdict among them. An injected socket has no connector of ours, and there its event error is the whole account. That one cause is the typed failure's cause
   * as well as the line's subject, so the line and the failure always name the same fault.
   *
   * Where the classified failure goes depends on whether the socket had opened. An open stream logs the line at the level the connection-fault table answers and
   * puts the failure on the error rail ahead of the teardown, so the ConnectionMonitor recovers. A stream that never opened settles its handshake with the failure,
   * logs nothing and puts nothing on the rail: its caller reports it from the rejection, so a line here as well would log one failure twice, and a rail fault would
   * start a recovery for a connect that caller is already failing. The request to close then sends teardown through the single close path.
   */
  #onError(event: ProtectWebSocketErrorEvent): void {

    const connector = this.#owned?.connector;
    const cause = connector?.lastDialFailure ?? connector?.lastConnectionFailure ?? event.error;
    const failure = reportSocketFailure(cause, { elapsed: this.#clock.now() - this.#connectStartedAt,
      failed: "The UniFi Protect realtime events API connection failed.", host: this.#address, log: this.#log, open: this.#live,
      reported: "The UniFi Protect realtime events API reported an error.", timedOut: "The UniFi Protect realtime events API connection timed out." });

    if(this.#live) {

      this.#bus.emit("error", failure);
    } else {

      this.#settleOpen(failure);
    }

    this.#shutdown(1006, "the events stream connection errored");
  }

  // The single teardown. Guarded so it runs once whether triggered by the socket's close event, an error, the watchdog, or an explicit close. Aborts the controller
  // (detaching every listener and ending the watchdog), settles a still-pending open handshake as a failure, announces the close, and releases the connection the
  // stream owns.
  #onClose(code: number, reason: string): void {

    if(this.#closed) {

      return;
    }

    this.#closed = true;
    this.#controller.abort();

    // Settle a still-pending open handshake as a failure. A socket error or a watchdog stall before open has already settled it with its own typed failure, so this
    // settles nothing after either. A caller-signal abort surfaces as the typed ProtectAbortedError (its own event, its own type); every other pre-open teardown - an
    // unsolicited peer close, an explicit close() - stays the generic pre-open network error.
    this.#settleOpen(this.#callerAborted ? new ProtectAbortedError("The UniFi Protect realtime events API connection was aborted by the caller's signal.") :
      new ProtectNetworkError("The UniFi Protect realtime events API closed before it finished connecting.", { cause: reason }));

    // An unsolicited close - the peer dropped a live socket without our asking - is termination we did not initiate, the same category as a socket error, and a
    // controller reboot arrives exactly this way (a `close` event with no preceding socket `error`). Route it onto the error rail so the ConnectionMonitor recovers; a
    // self-initiated close, or one that follows an already-emitted error (socket error / watchdog stall, both of which set #closeInitiated via #shutdown), stays
    // informational. The #live gate keeps a pre-open connect failure on the opened-handshake rejection rather than starting a doomed recovery.
    if(!this.#closeInitiated && this.#live) {

      this.#bus.emit("error", new ProtectNetworkError("The UniFi Protect realtime events API connection closed unexpectedly.", { cause: reason }));
    }

    this.#log.debug("The UniFi Protect realtime events API connection closed.", { code, reason });
    this.#bus.emit("closed", { code, reason });

    if(channels.eventsClosed.hasSubscribers) {

      channels.eventsClosed.publish({ code, reason } satisfies EventsClosedPayload);
    }

    // releaseOwned destroys the agent and then releases the connector, in the order and for the reasons it states. The connector's release is what severs a socket
    // the agent does not hold: one a completed upgrade handed to the WebSocket machinery, which a peer that never answers the close frame would otherwise hold open,
    // and one still in its handshake.
    this.#closePromise = (this.#owned === null) ? Promise.resolve() : releaseOwned(this.#owned);
  }

  // The caller's own signal fired. Mark this teardown as a caller abort BEFORE it runs, so #onClose settles a still-pending open handshake as the typed
  // ProtectAbortedError; only this path sets the mark, so a socket close or an explicit close() keeps the generic pre-open network error, while a socket error and a
  // watchdog stall settle the handshake with their own typed failure before teardown reaches it.
  #abortByCaller(): void {

    this.#callerAborted = true;
    this.#shutdown(1000, "connection aborted by the caller's signal");
  }

  // Request a graceful WebSocket close, then run teardown. Calling close() on the socket is best-effort - releasing the owned connection (in #onClose) is what
  // guarantees the underlying connection is released even if the close frame never completes.
  #shutdown(code: number, reason: string): void {

    // Mark this as a self-initiated teardown so #onClose does not misclassify the resulting close event as an unsolicited (recoverable) one.
    this.#closeInitiated = true;

    /* The socket's listeners come off before it is asked to close: closing a socket that is still connecting makes undici fail the connection and fire `error` and
     * `close` synchronously, before close() returns, and a listener still attached would carry that into the teardown as a fault, putting a network error on the rail
     * and a forced close on `closed` for a teardown this stream itself asked for. The abort is what detaches them, and it ends the watchdog and the caller-signal
     * binding with them.
     */
    this.#controller.abort();

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

  /* The silence watchdog. Each pass waits one threshold on the injected clock, then checks how long the channel has been quiet; once that crosses the threshold the
   * channel is presumed dead-but-not-closed, so we surface a typed stall and tear the socket down. An open stream logs the stall at warning, since recovery heals it,
   * and puts it on the error rail, the ConnectionMonitor's cue to recover; a stream that never opened settles its handshake with it instead, logging nothing and
   * putting nothing on the rail, as a socket error before open does, because its caller is already failing that connect and reports the stall from the rejection.
   * The teardown that follows detaches the socket's error listener, so a stall never logs beside a socket error for the same failure.
   *
   * The loop ends when teardown aborts the controller, which rejects the pending delay with its abort error, the normal shutdown path swallowed here. Detection
   * latency is bounded in [threshold, 2*threshold) because the loop wakes once per threshold, which is appropriate for a multi-minute failsafe and needs no
   * variable-cadence timer that reschedules on every message.
   */
  async #runWatchdog(): Promise<void> {

    try {

      for(;;) {

        // eslint-disable-next-line no-await-in-loop
        await this.#clock.delay(PROTECT_EVENTS_WATCHDOG_TIMEOUT, { signal: this.#controller.signal });

        const silentForMs = this.#clock.now() - this.#lastMessageAt;

        if(silentForMs >= PROTECT_EVENTS_WATCHDOG_TIMEOUT) {

          const stall = new ProtectStallError("The UniFi Protect realtime events API produced no data within the watchdog window.", { silentForMs });

          if(this.#live) {

            this.#log.warn("The UniFi Protect realtime events API went silent beyond the watchdog window; tearing down the stalled connection.", { silentForMs });
            this.#bus.emit("error", stall);
          } else {

            this.#settleOpen(stall);
          }

          this.#shutdown(1006, "the events stream stalled past the watchdog window");

          return;
        }
      }
    } catch {

      // The delay rejects on abort when the stream is torn down. That is the expected end of the loop, not an error.
    }
  }
}
