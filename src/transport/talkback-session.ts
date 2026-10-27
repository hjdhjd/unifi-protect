/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * talkback-session.ts: The send-direction return-audio WebSocket - negotiate, open atomically, and drain a consumer-supplied audio source to the camera speaker. The
 * reverse-direction counterpart of the livestream, structurally the send-direction sibling of EventStream.
 */

/**
 * `TalkbackSession` is the **send-direction** return-audio channel: the consumer's audio pushed to a camera's speaker (two-way audio / "talkback"). It is the reverse of
 * the livestream, but its structural sibling is **{@link EventStream}, not {@link LivestreamSession}**. The distinction is deliberate - `LivestreamSession` is
 * constructed non-atomically only because its pool needs synchronous map registration so concurrent early subscribers can share one in-flight session, a constraint
 * talkback (per call, never shared) does not have. So talkback follows `EventStream`'s atomic `static connect()`: ready or throws, no half-open. It is *simpler* than
 * both siblings: no frame decoder, no init-segment cache, no segment rail, and **no `EventBus`, no watchdog, no timer, no recovery loop** - its injected `Clock` is
 * read only to time a connection attempt, never on the write path. The channel is write-only, the bytes are opaque, and there is no inbound stream to time out or
 * reconnect mid-sentence (silently replaying stale buffered audio into a live conversation is worse than a clean end).
 *
 * **The write API is the dual of the receive channel.** The livestream's consumer surface is `AsyncIterable<Segment>` - the library is the source, the consumer pulls.
 * The honest mirror inverts that: the consumer is the source and the library pulls. So the single write entry, {@link TalkbackSession.send}, drains a consumer-supplied
 * `AsyncIterable<Uint8Array>`. Pacing comes from the source itself - a real-time producer only yields its next chunk as fast as it generates audio, keeping the socket
 * buffer near zero - so there is no `bufferedAmount` getter the consumer must poll. A Node `Readable` (ffmpeg's `stdout`) already implements `Symbol.asyncIterator` over
 * `Buffer`s, so `await session.send(ffmpeg.stdout)` just works, no adapter. The `send` promise *is* the entire async contract: resolve means the source was exhausted,
 * reject means a typed failure. The only active bound is a safety ceiling, `PROTECT_TALKBACK_MAX_BUFFERED_BYTES`: a real-time source keeps the socket buffer near zero
 * and never approaches it, but a non-real-time source fed faster than the wire drains would otherwise balloon the socket buffer, so crossing the ceiling rejects rather
 * than buffering unboundedly. It is a tripwire, not a timer.
 *
 * **Write-only.** The Protect controller emits nothing inbound on the talkback channel - it accepts the audio and relays it to the camera speaker, with no acks or codec
 * negotiation to drain - so `TalkbackSession` registers `open` / `close` / `error` but never attaches a `message` listener.
 *
 * **Two phases - `connect` then `send` - mandated by resource ownership.** The socket is a long-lived resource the consumer holds as an `await using` disposable, so the
 * handle (the static `connect()` returns it) is separate from the streaming operation ({@link TalkbackSession.send}); leak-safety is structural, not dependent
 * on the consumer wiring an abort signal. The consumer can open the channel early (overlapping the handshake with its own setup) and stream once audio is ready, with the
 * open phase's failures (negotiation 4xx/5xx, network) cleanly distinct from the stream phase's.
 *
 * @module TalkbackSession
 */
import { Agent, WebSocket } from "undici";
import { ProtectAbortedError, ProtectError, ProtectNetworkError, assertNever } from "../errors.ts";
import type { ProtectWebSocketCloseEvent, ProtectWebSocketErrorEvent, ProtectWritableWebSocket, SocketTeardown } from "./ws.ts";
import type { TalkbackSessionClosedPayload, TalkbackSessionOpenedPayload } from "../diagnostics.ts";
import { closeFrameText, socketFault, teardownCode } from "./ws.ts";
import { createOwnedConnector, releaseOwned } from "./connector.ts";
import { millisecondsSince, wallClock } from "../clock.ts";
import type { Clock } from "../clock.ts";
import type { OwnedDispatcher } from "./connector.ts";
import { PROTECT_TALKBACK_MAX_BUFFERED_BYTES } from "../settings.ts";
import type { ProtectLogging } from "../logging.ts";
import { channels } from "../diagnostics.ts";
import { noopLog } from "../logging.ts";

/**
 * The deterministic lifecycle of a talkback session. The transitions are: construction begins connecting (`connecting`); WebSocket `open` advances to `live` (and the
 * static `connect()`'s promise resolves); every teardown path - an error, the caller's abort, an explicit `close()`, or a peer-initiated close - moves to `closed`
 * synchronously, the release of the owned connection starting in that same step, ahead of anything the teardown reports, and `close()`'s promise settling once the
 * release completes. `closing` is a momentary arm set inside the teardown call just before `closed`, so a reader of `state` never observes it. There is no
 * `handshaking` arm - talkback has no init segment.
 *
 * @category Transport
 */
export type TalkbackState = "closed" | "closing" | "connecting" | "live";

/**
 * Construction options for {@link TalkbackSession}.
 *
 * - `cameraId` is the camera whose speaker receives the audio - the only negotiation param.
 * - `clock` is the time source a connection attempt that times out is measured on; it defaults to the wall clock, and tests inject a fake. It is read only for that
 *   measure, never on the write path.
 * - `log` receives the session's diagnostics logging; it defaults to a no-op logger.
 * - `resolveUrl` is the negotiation hook, identical in type to {@link LivestreamSession}'s: given the request params it returns the controller-minted, host-rewritten
 *   WebSocket URL. The composition root wires it to a transport-backed GET (see `talkbackUrlResolver`); tests pass a one-line fake.
 * - `webSocket` is the injected I/O dependency - the write-direction `ProtectWritableWebSocket`, distinct from the receive-direction interface {@link EventStream} /
 *   {@link LivestreamSession} share; omit it for the default undici-backed factory, inject it in tests.
 * - `signal` cancels the connect attempt and, once live, the session - if it aborts, the session tears down and an in-flight `send` rejects.
 * - `verifyTls` opts the owned connection into strict TLS certificate verification; it defaults to `false` for the controller's self-signed certificate. An injected
 *   `webSocket` factory builds no agent here, so the option is inert alongside one.
 *
 * @category Transport
 */
export interface TalkbackSessionOptions {

  cameraId: string;
  clock?: Clock;
  log?: ProtectLogging;
  resolveUrl: (params: URLSearchParams, opts: { signal?: AbortSignal }) => Promise<string>;
  signal?: AbortSignal;
  verifyTls?: boolean;
  webSocket?: (url: string) => ProtectWritableWebSocket;
}

/**
 * One talkback WebSocket, write-only. Constructed atomically via the static `connect()` (the constructor is private): it negotiates the URL, opens the socket, and
 * resolves to a live session or throws a typed `ProtectError` - there is no half-open session. Feed it audio with {@link TalkbackSession.send} and dispose it (or abort
 * its signal) to close.
 *
 * @category Transport
 */
export class TalkbackSession implements AsyncDisposable {

  readonly #cameraId: string;
  readonly #clock: Clock;
  // One AbortController marks the session torn down, which the connect reads across its negotiation await. The socket's listeners and the binding to the caller's
  // signal are not among what it governs: the session holds them and removes them itself in its teardown, as the sibling sessions remove theirs.
  readonly #controller = new AbortController();
  // A promise that only ever rejects, when the socket faults (error or unsolicited close) or the session is torn down. An in-flight send() races it so a socket death
  // interrupts even a parked source pull; outside a send it carries a no-op rejection handler so a fault with no send in flight raises no unhandled-rejection warning.
  readonly #fault: { promise: Promise<never>; reject: (reason: ProtectError) => void };
  readonly #log: ProtectLogging;
  readonly #resolveUrl: (params: URLSearchParams, opts: { signal?: AbortSignal }) => Promise<string>;
  readonly #verifyTls: boolean;
  readonly #webSocketFactory: ((url: string) => ProtectWritableWebSocket) | undefined;

  // The socket's handlers and the handler bound to the caller's signal, built once and held so the teardown removes each by the identity it was registered under, as
  // EventStream holds its own: on every Node before the fix for nodejs/node#63954 (all of 22, 24 before 24.22, 25, and 26 before 26.9) the `signal` registration
  // option can leave a listener attached after its abort.
  readonly #callerSignal: AbortSignal | undefined;
  readonly #onCallerAbort = (): void => this.#abortByCaller();
  readonly #socketListeners = {

    close: (event: ProtectWebSocketCloseEvent): void => this.#onClose({ code: event.code, kind: "peer", reason: event.reason }),
    error: (event: ProtectWebSocketErrorEvent): void => this.#onError(event),
    open: (): void => this.#onOpen()
  };

  /* The open handshake, settled exactly once: resolved on the WebSocket `open` event, rejected if the socket closes (or negotiation fails, or the caller's signal
   * aborts) before opening. Settling once is a property of the lifecycle rather than a check of its own, as it is for EventStream: the `open` listener fires once, a
   * teardown removes it before it reports and leaves the connect registering none, #onOpen marks the session live before it resolves, and the teardown runs once
   * and rejects only a session that never opened.
   */
  readonly #opened: Promise<void>;
  readonly #rejectOpen: (error: ProtectError) => void;
  readonly #resolveOpen: (value: undefined) => void;

  // The agent and the connector we own only when we built the default WebSocket, travelling as one value; null when a factory was injected. Mirrors EventStream /
  // LivestreamSession: we never destroy what we did not create. The socket itself is built only after the URL is negotiated, so it is null through the connecting
  // phase, and so are the address it dials and the stamp of when its connection attempt began, the clock's monotonic reading, which a certificate refusal and a
  // timeout read.
  #owned: OwnedDispatcher | null = null;
  #ws: ProtectWritableWebSocket | null = null;
  #address = "";
  #connectStartedAt = 0;

  // The release of the connection the session owns, which the single teardown starts and close()/dispose await, null until the teardown runs, so it is also the gate
  // that runs the teardown once; the typed failure an in-flight or subsequent send rejects with, which the teardown stores once from the reason it ran for; and
  // whether the socket has opened, which decides whether a teardown still owes the open handshake its rejection.
  #released: Promise<void> | null = null;
  #failure: ProtectError | null = null;
  #live = false;
  #state: TalkbackState = "connecting";

  private constructor(options: TalkbackSessionOptions) {

    this.#callerSignal = options.signal;
    this.#cameraId = options.cameraId;
    this.#clock = options.clock ?? wallClock;
    this.#log = options.log ?? noopLog;
    this.#resolveUrl = options.resolveUrl;
    this.#verifyTls = options.verifyTls ?? false;
    this.#webSocketFactory = options.webSocket;

    const opened = Promise.withResolvers<undefined>();

    this.#opened = opened.promise;
    this.#rejectOpen = opened.reject;
    this.#resolveOpen = opened.resolve;

    // A consumer that opens the channel but never awaits `connect()`'s result (it awaits `send` instead) must not trigger an unhandled-rejection warning if the open
    // fails; the real awaiter (connect()) still receives the rejection - both handlers run.
    void this.#opened.catch(() => undefined);

    // The fault promise: a Promise<never> that the teardown path rejects to interrupt an in-flight send. The standing no-op handler keeps a fault with no send in flight
    // from surfacing as an unhandled rejection; a real send attaches its own handler by racing it.
    const fault = Promise.withResolvers<never>();

    void fault.promise.catch(() => undefined);
    this.#fault = { promise: fault.promise, reject: fault.reject };

    // The caller's signal cancels the connect attempt and, once live, the session, and the teardown removes this binding as it removes the socket's handlers. An
    // already-aborted signal tears down immediately - the connect below sees the abort and bails before opening a socket.
    if(options.signal !== undefined) {

      if(options.signal.aborted) {

        this.#abortByCaller();
      } else {

        options.signal.addEventListener("abort", this.#onCallerAbort, { once: true });
      }
    }

    // Begin connecting. Like LivestreamSession (and unlike EventStream, whose URL is immediate), we must negotiate the URL first, so the connect is an async task whose
    // failures settle the open handshake as a rejection. It is launched detached; the constructor never throws and never blocks.
    void this.#connect(options.signal);
  }

  /**
   * Open a talkback session and wait for it to connect. Atomic: it negotiates the WebSocket URL, opens the socket, and returns a live session, or throws a typed
   * `ProtectError` - there is no half-open session a caller must clean up. The capability guard lives on `Camera.talkback`, so this method never checks whether the
   * camera supports talkback.
   *
   * @param options - The session options.
   *
   * @returns A connected {@link TalkbackSession}.
   *
   * @throws The classified `FatalError` negotiation surfaces on a non-2xx (typically {@link ProtectRequestError}), the socket's classified failure when it fails
   *   to open - a {@link ProtectNetworkError}, a {@link ProtectCertificateError} when the controller's certificate is refused, or a {@link ProtectTimeoutError}
   *   when the connection attempt timed out - and {@link ProtectAbortedError} when the caller's signal aborts the connect.
   */
  static async connect(options: TalkbackSessionOptions): Promise<TalkbackSession> {

    const session = new TalkbackSession(options);

    await session.#opened;

    return session;
  }

  /** The session's current lifecycle state, for diagnostics and tests. */
  get state(): TalkbackState {

    return this.#state;
  }

  /**
   * Drain a consumer-supplied audio source to the camera speaker. The single write entry: it sends each `Uint8Array` and pulls the next as fast as the source yields it,
   * so a real-time, producer-paced source streams at its own rate with no buffer growth. Resolves when the source is exhausted; rejects with a typed
   * {@link ProtectError} if the socket errors or closes mid-drain, if the caller's `signal` aborts, or if the socket's send buffer crosses the
   * `PROTECT_TALKBACK_MAX_BUFFERED_BYTES` safety ceiling (a non-real-time source the wire cannot keep up with). On a socket fault, an abort, or the source's own error,
   * the source's cleanup (its `return()`) is requested and not awaited, so the rejection arrives at once and a generator's `finally` runs once its parked pull settles.
   * The bytes are opaque - whatever audio format the camera expects (read `camera.config.talkbackSettings`); the library neither inspects nor transcodes them.
   *
   * Await one drain before starting the next. Nothing serializes concurrent calls, so overlapping drains interleave their audio on the shared socket.
   *
   * @param source - The audio source to drain. A Node `Readable` (e.g. `ffmpeg.stdout`) is an `AsyncIterable<Buffer>` and feeds in directly.
   * @param opts   - An optional abort signal that ends this drain.
   *
   * @returns A promise that resolves when the source is exhausted.
   *
   * @throws {@link ProtectNetworkError} on a socket failure mid-drain, a buffer-ceiling overrun, or a call made while the session is not live (never
   *   connected, or already closed/faulted); {@link ProtectAbortedError} when the per-send `opts.signal` aborts, the session's own caller signal aborts
   *   mid-drain, or when send() is called after an earlier caller-signal abort already tore the session down; any error the source itself raises
   *   propagates unwrapped.
   */
  async send(source: AsyncIterable<Uint8Array>, opts: { signal?: AbortSignal } = {}): Promise<void> {

    // Only a live session accepts audio. A session that never reached `live`, or that has faulted/closed, rejects with its stored failure if it has one, else a plain
    // not-connected error - the same typed surface a mid-drain failure produces.
    if(this.#state !== "live") {

      throw this.#failure ?? new ProtectNetworkError("The UniFi Protect talkback session is not connected.");
    }

    if(opts.signal?.aborted === true) {

      throw new ProtectAbortedError("The UniFi Protect talkback send was aborted by the caller's signal.");
    }

    // The socket is non-null while live (built once in #connect, never re-nulled). Capture it so the hot loop reads a stable, narrowed reference.
    const ws = this.#ws;

    if(ws === null) {

      throw this.#failure ?? new ProtectNetworkError("The UniFi Protect talkback session is not connected.");
    }

    const iterator = source[Symbol.asyncIterator]();
    const abort = Promise.withResolvers<never>();

    void abort.promise.catch(() => undefined);

    const onAbort = (): void => abort.reject(new ProtectAbortedError("The UniFi Protect talkback send was aborted by the caller's signal."));

    opts.signal?.addEventListener("abort", onAbort, { once: true });

    // Whether the cleanup below waits on the source. Only the catch around the race clears it, the exit a socket fault, an abort and the source's own rejection share.
    let awaitReturn = true;

    try {

      for(;;) {

        // Race the source pull against a socket fault and the caller's abort, so a mid-drain socket death or abort interrupts even a parked pull (a source awaiting its
        // next real-time chunk). On a fault/abort win the pull may still settle later, so we attach a no-op handler to it before re-throwing to avoid an unhandled
        // rejection; a source that errors during a normal pull simply rejects the race and propagates unwrapped.
        const next = iterator.next();
        let result: IteratorResult<Uint8Array>;

        try {

          // The drain is sequential by nature: each chunk is pulled only after the previous one was handed to the socket, which is the backpressure contract.
          // eslint-disable-next-line no-await-in-loop
          result = await Promise.race([ next, this.#fault.promise, abort.promise ]);
        } catch(error) {

          awaitReturn = false;
          void next.catch(() => undefined);

          throw error;
        }

        if(result.done === true) {

          return;
        }

        ws.send(result.value);

        // The lone active backpressure bound. A producer-paced source keeps bufferedAmount near zero; a source the wire cannot keep up with would balloon it, so we
        // refuse rather than buffer without limit or inject stale audio into a live channel.
        if(ws.bufferedAmount > PROTECT_TALKBACK_MAX_BUFFERED_BYTES) {

          throw new ProtectNetworkError("The UniFi Protect talkback socket could not keep up with the audio source; its send buffer exceeded the safety ceiling.");
        }
      }
    } finally {

      opts.signal?.removeEventListener("abort", onAbort);

      /* Signal the source we are done pulling, so a generator or pipe behind it can clean up; a source without a `return` (a plain async iterator) has none to call.
       * A drain that ended cleanly or at the buffer ceiling waits for that cleanup. A drain that ended in the catch above only requests it: after a socket fault or an
       * abort the pull is still parked, and a generator's or a Readable's `return()` queues behind a parked pull, so waiting would hold the typed rejection until the
       * source next moves, while a source that rejected has already finished and leaves nothing to wait for. The request's own rejection is swallowed, so a cleanup
       * that fails can never replace the error the drain throws.
       */
      const cleanup = iterator.return?.();

      // TypeScript's flow analysis does not carry an assignment made inside the catch above into this finally, so the compiler reads the flag as always true where the
      // catch clears it, and the lint rule follows the compiler.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if(awaitReturn) {

        await cleanup;
      } else {

        void cleanup?.catch(() => undefined);
      }
    }
  }

  /**
   * Close the session: detach every listener, request the WebSocket close, and release the connection the session owns. Safe to call more than once, and awaitable.
   * An in-flight {@link TalkbackSession.send} rejects.
   */
  async close(): Promise<void> {

    this.#shutdown({ kind: "close", reason: "the talkback session was closed by the client" });

    await this.#released;
  }

  /**
   * Dispose the session. Delegates to {@link TalkbackSession.close} so `await using session = ...` tears the socket down cleanly.
   */
  async [Symbol.asyncDispose](): Promise<void> {

    await this.close();
  }

  // Negotiate the URL and open the socket. This is the connecting phase: a negotiation (4xx/5xx) or network failure tears down as a fault, whose teardown settles the
  // open handshake as a rejection, and a caller-signal abort does too but as the typed ProtectAbortedError the teardown stores as the session's failure. Either way
  // connect() throws for the whole connect attempt, with no half-open session. The negotiated URL carries its own authorization token, so - like the livestream - no
  // auth headers are stamped on the upgrade.
  async #connect(signal?: AbortSignal): Promise<void> {

    // An already-aborted caller signal tears us down in the constructor before this runs; bail without touching state so we never negotiate or build a socket.
    if(this.#released !== null) {

      return;
    }

    let url: string;

    try {

      url = await this.#resolveUrl(new URLSearchParams({ camera: this.#cameraId }), (signal !== undefined) ? { signal } : {});
    } catch(error) {

      // A teardown that already fired (caller abort during negotiation) has settled everything; do not also settle. We read the controller's abort state rather than
      // `#released` because it is a live getter the type system cannot narrow to a constant across the await, and it is set in lockstep with `#released` on teardown.
      if(!this.#controller.signal.aborted) {

        const failure = (error instanceof ProtectError) ? error :
          new ProtectNetworkError("The UniFi Protect talkback WebSocket endpoint could not be negotiated.", { cause: error });

        this.#shutdown({ error: failure, kind: "fault", line: null, reason: "the talkback endpoint negotiation failed" });
      }

      return;
    }

    // A concurrent close()/abort may have torn us down while we awaited negotiation. Bail before opening a socket we would immediately orphan.
    if(this.#controller.signal.aborted) {

      return;
    }

    /* Build the socket: an injected factory in tests, otherwise undici's WebSocket over an owned HTTP/1.1 agent that dials through an owned connector, its
     * certificate posture following `verifyTls`, which is permissive by default for the controller's self-signed certificate. HTTP/2 is off and pipelining disabled
     * because a WebSocket upgrade can use neither, and `allowH2` reaches the connector and the agent alike. undici's WebSocket structurally satisfies the minimal
     * ProtectWritableWebSocket surface, so it assigns directly - no cast. Building the socket is where the connection attempt begins, so the address and the attempt's
     * start are read immediately ahead of it, the address parsed without a throw because an injected factory may be handed a URL undici would refuse, and this runs
     * detached.
     */
    this.#address = URL.parse(url)?.host ?? url;
    this.#connectStartedAt = this.#clock.monotonic();

    if(this.#webSocketFactory !== undefined) {

      this.#ws = this.#webSocketFactory(url);
    } else {

      const allowH2 = false;
      const connector = createOwnedConnector({ allowH2, verifyTls: this.#verifyTls });
      const agent = new Agent({ allowH2, connect: connector.connect, pipelining: 0 });

      this.#owned = { connector, dispatcher: agent };
      this.#ws = new WebSocket(url, { dispatcher: agent });
    }

    // The socket's handlers register with no `signal` option, since the teardown removes each itself. open / close / error are `once` - a socket reports each terminal
    // condition a single time. There is deliberately no `message` listener and no `binaryType`: the channel is write-only - the controller emits nothing inbound on
    // it - so the session never reads frames.
    this.#ws.addEventListener("open", this.#socketListeners.open, { once: true });
    this.#ws.addEventListener("close", this.#socketListeners.close, { once: true });
    this.#ws.addEventListener("error", this.#socketListeners.error, { once: true });
  }

  // The WebSocket opened. Advance to live, settle the open handshake, and publish the opened diagnostic, all ahead of the debug line, so a logger that throws on the
  // line leaves the handshake settled and the diagnostic published. send() now flows.
  #onOpen(): void {

    this.#live = true;
    this.#state = "live";
    this.#resolveOpen(undefined);

    if(channels.talkbackSessionOpened.hasSubscribers) {

      channels.talkbackSessionOpened.publish({ cameraId: this.#cameraId } satisfies TalkbackSessionOpenedPayload);
    }

    this.#log.debug("Connected to the UniFi Protect talkback API.", { camera: this.#cameraId });
  }

  /* The socket reported an error. The cause is read once, from the connector ahead of the event, as the sibling sessions read it: a failed upgrade reports a
   * content-free `TypeError` on this event while the connector still holds the dial's own error, and a reset of the established connection reports the same
   * `TypeError` while the connector holds the reset the socket raised. That one cause is the typed failure's cause and the line's subject. The line belongs to a
   * live session, at the level the connection-fault table answers; a failure before open reaches its caller as the connect() rejection alone. The classified failure
   * is the fault the teardown runs for, which stores it once the connection is released, so the connect handshake, an in-flight send or a later one rejects with it,
   * and only then logs its line.
   */
  #onError(event: { error?: unknown; message?: string }): void {

    const connector = this.#owned?.connector;
    const cause = connector?.lastDialFailure ?? connector?.lastConnectionFailure ?? event.error;

    this.#shutdown(socketFault({ cause, elapsed: millisecondsSince(this.#connectStartedAt, { clock: this.#clock }),
      failed: "The UniFi Protect talkback API connection failed.", host: this.#address, open: this.#live, reason: "the talkback connection errored",
      reported: "The UniFi Protect talkback API reported an error.", timedOut: "The UniFi Protect talkback API connection timed out." }));
  }

  /* The single teardown, run once whether the socket's close event, an error, the caller's abort or an explicit close starts it, with the reason it ran. The removal
   * of the listeners and the abort stay here as well as in #shutdown because the peer's own close listener reaches this teardown without passing through it.
   *
   * The release starts directly after the abort, as the sibling sessions start it, ahead of every report, so everything the teardown then settles or announces, the
   * closed diagnostic among it, finds the connection already severed: releaseOwned severs it in one synchronous stack, before it returns, so a subscriber that reopens
   * on the close never overlaps the connection this teardown lets go, and nothing that throws past this point, a logger included, can leave it held. releaseOwned
   * destroys the agent and then releases the connector, in the order and for the reasons it states; the connector's release is what severs a socket a completed
   * upgrade handed to the WebSocket machinery, or one still in its handshake.
   *
   * The reports then run in one order: the open handshake of a session that never opened settled as a failure, the session's failure stored, the fault promise
   * rejected (interrupting any in-flight send), the line a fault carries, the close line and the closed diagnostic.
   */
  #onClose(teardown: SocketTeardown): void {

    if(this.#released !== null) {

      return;
    }

    const code = teardownCode(teardown);
    const { reason } = teardown;

    this.#state = "closed";
    this.#detachListeners();
    this.#controller.abort();
    this.#released = (this.#owned === null) ? Promise.resolve() : releaseOwned(this.#owned);

    const failure = this.#failureOf(teardown);

    // The open resolved the handshake of a session that opened, so only one that never did has a handshake left to settle.
    if(!this.#live) {

      this.#rejectOpen(failure ?? this.#unopenedFailure(teardown));
    }

    this.#failure = failure;

    // Reject the fault promise so any in-flight send unparks and rejects. A stored failure is the meaningful cause; a clean self-initiated close still rejects an
    // in-flight send, because the channel it was writing to is gone.
    this.#fault.reject(failure ?? new ProtectNetworkError("The UniFi Protect talkback session was closed.", { cause: reason }));

    if((teardown.kind === "fault") && (teardown.line !== null)) {

      this.#log[teardown.line.level](teardown.line.message, teardown.line.context);
    }

    this.#log.debug("The UniFi Protect talkback API connection closed.", { camera: this.#cameraId, code, reason });

    if(channels.talkbackSessionClosed.hasSubscribers) {

      channels.talkbackSessionClosed.publish({ cameraId: this.#cameraId, reason } satisfies TalkbackSessionClosedPayload);
    }
  }

  /* The failure the session stores, which the connect handshake and every send then reject with: the typed abort for the caller's cancel, so wherever it surfaces it
   * reports a cancellation rather than the network error a socket death produces, the fault's own error, and for the peer dropping a live socket without our asking
   * a network failure naming the frame it arrived on. An explicit close stores none, nor does a peer's close of a session that never opened, whose handshake answer
   * is the whole of its report.
   */
  #failureOf(teardown: SocketTeardown): ProtectError | null {

    switch(teardown.kind) {

      case "callerSignal":

        return new ProtectAbortedError("The UniFi Protect talkback session was aborted by the caller's signal.");

      case "close":

        return null;

      case "fault":

        return teardown.error;

      case "peer":

        return this.#live ? new ProtectNetworkError("The UniFi Protect talkback API connection closed unexpectedly (" + closeFrameText(teardown.code, teardown.reason) +
          ").") : null;

      default:

        // Exhaustiveness guard. A new reason joining the union without a case above stops `teardown` being `never` here, and this fails to compile.
        return assertNever(teardown);
    }
  }

  // What a still-pending handshake rejects with when the teardown stored no failure: the generic pre-open failure, naming the frame it arrived on when the close was
  // the peer's.
  #unopenedFailure(teardown: SocketTeardown): ProtectError {

    if(teardown.kind === "peer") {

      return new ProtectNetworkError("The UniFi Protect talkback API closed before it finished connecting (" + closeFrameText(teardown.code, teardown.reason) + ").");
    }

    return new ProtectNetworkError("The UniFi Protect talkback API closed before it finished connecting.", { cause: teardown.reason });
  }

  // The caller's own signal fired. Naming the caller's signal as the teardown's reason is what has the teardown store the typed ProtectAbortedError as the session's
  // failure. One event, one type, wherever it is observed.
  #abortByCaller(): void {

    this.#shutdown({ kind: "callerSignal", reason: "the talkback session was aborted by the caller's signal" });
  }

  // Request a graceful WebSocket close, then run teardown with the reason it was asked for. Calling close() on the socket is best-effort - releasing the owned
  // connection (in #onClose) is what guarantees it is let go even if the close frame never completes. A teardown before the socket was built (a negotiation abort) has
  // nothing to release: the owned agent and connector are created together with the socket, so none exists yet. A call after the teardown has run still asks any
  // socket the session built to close, which does nothing on a socket already closing or closed.
  #shutdown(teardown: SocketTeardown): void {

    if(this.#released === null) {

      this.#state = "closing";
    }

    // The socket's listeners come off before it is asked to close, the session taking them off itself as the sibling sessions do: closing a socket that is still
    // connecting makes undici fire `error` and `close` synchronously inside close(), which an attached listener would report as a socket failure or a peer's close for
    // a teardown this session asked for.
    this.#detachListeners();
    this.#controller.abort();

    try {

      this.#ws?.close();
    } catch {

      // A socket that never opened (or a fake that rejects a premature close) must not block teardown; #onClose below releases everything regardless.
    }

    this.#onClose(teardown);
  }

  // Take the socket's listeners and the caller-signal binding off by the identity each was registered under. A teardown before negotiation built the socket has none
  // of the socket's to remove, and removing one a `once` dispatch already took off is quiet.
  #detachListeners(): void {

    this.#ws?.removeEventListener("close", this.#socketListeners.close);
    this.#ws?.removeEventListener("error", this.#socketListeners.error);
    this.#ws?.removeEventListener("open", this.#socketListeners.open);
    this.#callerSignal?.removeEventListener("abort", this.#onCallerAbort);
  }
}
