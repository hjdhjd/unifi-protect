/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * talkback-session.ts: The send-direction return-audio WebSocket - negotiate, open atomically, and drain a consumer-supplied audio source to the camera speaker. The
 * reverse-direction counterpart of the livestream, structurally the send-direction sibling of EventStream.
 */

/**
 * `TalkbackSession` is the **send-direction** return-audio channel: the consumer's audio pushed to a camera's speaker (two-way audio / "talkback"). It is the reverse of
 * the livestream, but its structural sibling is **{@link EventStream}, not {@link LivestreamSession}**. The distinction is deliberate - `LivestreamSession` is
 * lazy-constructed only because its pool needs synchronous map registration so concurrent early subscribers can share one in-flight session, a constraint talkback (per
 * call, never shared) does not have. So talkback follows `EventStream`'s atomic `static connect()`: ready or throws, no half-open. It is *simpler* than both siblings: no
 * frame decoder, no init-segment cache, no segment rail, and **no `EventBus`, no watchdog, no `Clock`, no recovery loop**. The channel is write-only, the bytes are
 * opaque, and there is no inbound stream to time out or reconnect mid-sentence (silently replaying stale buffered audio into a live conversation is worse than a clean
 * end).
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
import { ProtectAbortedError, ProtectError, ProtectNetworkError } from "../errors.ts";
import type { TalkbackSessionClosedPayload, TalkbackSessionOpenedPayload } from "../diagnostics.ts";
import { PROTECT_TALKBACK_MAX_BUFFERED_BYTES } from "../settings.ts";
import type { ProtectLogging } from "../logging.ts";
import type { ProtectWritableWebSocket } from "./ws.ts";
import { channels } from "../diagnostics.ts";
import { isExpectedWsDisconnect } from "../errors.ts";
import { noopLog } from "../logging.ts";

/**
 * The deterministic lifecycle of a talkback session. The transitions are: construction begins connecting (`connecting`); WebSocket `open` advances to `live` (and the
 * static `connect()`'s promise resolves); an error, the caller's abort, or an explicit `close()` requests a graceful close and moves to `closing`; the socket fully
 * closing and the owned agent being destroyed is `closed`, which a peer-initiated close reaches directly without passing through `closing`. There is no `handshaking`
 * arm - talkback has no init segment.
 *
 * @category Transport
 */
export type TalkbackState = "closed" | "closing" | "connecting" | "live";

/**
 * Construction options for {@link TalkbackSession}.
 *
 * - `cameraId` is the camera whose speaker receives the audio - the only negotiation param.
 * - `resolveUrl` is the negotiation seam, identical in type to {@link LivestreamSession}'s: given the request params it returns the controller-minted, host-rewritten
 *   WebSocket URL. The composition root wires it to a transport-backed GET (see `talkbackUrlResolver`); tests pass a one-line fake.
 * - `webSocket` is the injected I/O seam - the write-direction `ProtectWritableWebSocket`, distinct from the receive-direction seam {@link EventStream} /
 *   {@link LivestreamSession} share; omit it for the default undici-backed factory, inject it in tests.
 * - `signal` cancels the connect attempt and, once live, the session - if it aborts, the session tears down and an in-flight `send` rejects.
 *
 * @category Transport
 */
export interface TalkbackSessionOptions {

  cameraId: string;
  log?: ProtectLogging;
  resolveUrl: (params: URLSearchParams, opts: { signal?: AbortSignal }) => Promise<string>;
  signal?: AbortSignal;
  webSocket?: (url: string) => ProtectWritableWebSocket;
}

/**
 * One talkback WebSocket, write-only. Constructed atomically via the static `connect()` (the constructor is private): it negotiates the URL, opens the socket,
 * and resolves to a live session or throws a typed `FatalError` - there is no half-open session. Feed it audio with {@link TalkbackSession.send} and dispose it (or abort
 * its signal) to close.
 *
 * @category Transport
 */
export class TalkbackSession implements AsyncDisposable {

  readonly #cameraId: string;
  // One AbortController governs every WebSocket listener and the caller's abort. A single abort() detaches them all at once - the same teardown primitive the sibling
  // sessions use.
  readonly #controller = new AbortController();
  // A promise that only ever rejects, when the socket faults (error or unsolicited close) or the session is torn down. An in-flight send() races it so a socket death
  // interrupts even a parked source pull; outside a send it carries a no-op rejection handler so a fault with no send in flight raises no unhandled-rejection warning.
  readonly #fault: { promise: Promise<never>; reject: (reason: ProtectError) => void };
  readonly #log: ProtectLogging;
  readonly #resolveUrl: (params: URLSearchParams, opts: { signal?: AbortSignal }) => Promise<string>;
  readonly #webSocketFactory: ((url: string) => ProtectWritableWebSocket) | undefined;

  // The open handshake, settled exactly once: resolved on the WebSocket `open` event, rejected if the socket closes (or negotiation fails, or the caller's signal aborts)
  // before opening.
  readonly #opened: Promise<void>;
  readonly #settleOpen: (error?: ProtectError) => void;

  // The agent we own only when we built the default WebSocket; null when a factory was injected. Mirrors EventStream / LivestreamSession: we never destroy what we did
  // not create. The socket itself is built only after the URL is negotiated, so it is null through the connecting phase.
  #ownedAgent: Agent | null = null;
  #ws: ProtectWritableWebSocket | null = null;

  // The single teardown gate and the agent-destruction promise close()/dispose await; the typed failure an in-flight or subsequent send rejects with (set by a socket
  // error or unsolicited close); and the flags that distinguish a self-initiated close from a peer one and gate the open handshake.
  #closePromise: Promise<void> | null = null;
  #closeInitiated = false;
  #closed = false;
  #failure: ProtectError | null = null;
  #live = false;
  #openSettled = false;
  #state: TalkbackState = "connecting";

  private constructor(options: TalkbackSessionOptions) {

    this.#cameraId = options.cameraId;
    this.#log = options.log ?? noopLog;
    this.#resolveUrl = options.resolveUrl;
    this.#webSocketFactory = options.webSocket;

    const opened = Promise.withResolvers<undefined>();

    this.#opened = opened.promise;

    // A consumer that opens the channel but never awaits `connect()`'s result (it awaits `send` instead) must not trigger an unhandled-rejection warning if the open
    // fails; the real awaiter (connect()) still receives the rejection - both handlers run.
    void this.#opened.catch(() => undefined);

    this.#settleOpen = (error?: ProtectError): void => {

      if(this.#openSettled) {

        return;
      }

      this.#openSettled = true;

      if(error !== undefined) {

        opened.reject(error);

        return;
      }

      opened.resolve(undefined);
    };

    // The fault promise: a Promise<never> that the teardown path rejects to interrupt an in-flight send. The standing no-op handler keeps a fault with no send in flight
    // from surfacing as an unhandled rejection; a real send attaches its own handler by racing it.
    const fault = Promise.withResolvers<never>();

    void fault.promise.catch(() => undefined);
    this.#fault = { promise: fault.promise, reject: fault.reject };

    // The caller's signal cancels the connect attempt and, once live, the session. Bound to our own signal too, so it detaches with everything else on teardown. An
    // already-aborted signal tears down immediately - the connect below sees the abort and bails before opening a socket.
    if(options.signal !== undefined) {

      if(options.signal.aborted) {

        this.#abortByCaller();
      } else {

        options.signal.addEventListener("abort", () => this.#abortByCaller(), { once: true, signal: this.#controller.signal });
      }
    }

    // Begin connecting. Like LivestreamSession (and unlike EventStream, whose URL is immediate), we must negotiate the URL first, so the connect is an async task whose
    // failures settle the open handshake as a rejection. It is launched detached; the constructor never throws and never blocks.
    void this.#connect(options.signal);
  }

  /**
   * Open a talkback session and wait for it to connect. Atomic: it negotiates the WebSocket URL, opens the socket, and returns a live session, or throws a typed
   * `FatalError` - there is no half-open session a caller must clean up.
   *
   * @param options - The session options.
   *
   * @returns A connected {@link TalkbackSession}.
   *
   * @throws {@link ProtectUnsupportedError} is not thrown here (the capability guard lives on `Camera.talkback`); negotiation surfaces the classified `FatalError` on a
   *   non-2xx (typically {@link ProtectRequestError}), a {@link ProtectNetworkError} when the socket fails to open, and {@link ProtectAbortedError} when the caller's
   *   signal aborts the connect.
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
   * so a real-time, producer-paced source streams at its own rate with no buffer growth. Resolves when the source is
   * exhausted; rejects with a typed {@link ProtectError} if the socket errors or closes mid-drain, if the caller's `signal` aborts, or if the socket's send buffer
   * crosses the `PROTECT_TALKBACK_MAX_BUFFERED_BYTES` safety ceiling (a non-real-time source the wire cannot keep up with). The bytes are opaque - whatever audio
   * format the camera expects (read `camera.config.talkbackSettings`); the library neither inspects nor transcodes them.
   *
   * @param source - The audio source to drain. A Node `Readable` (e.g. `ffmpeg.stdout`) is an `AsyncIterable<Buffer>` and feeds in directly.
   * @param opts   - An optional abort signal that ends this drain.
   *
   * @returns A promise that resolves when the source is exhausted.
   *
   * @throws {@link ProtectNetworkError} on a socket failure mid-drain or a buffer-ceiling overrun; {@link ProtectAbortedError} when the per-send `opts.signal` aborts or
   *   the session's own caller signal aborts mid-drain; any error the source itself raises propagates unwrapped.
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

    try {

      for(;;) {

        // Race the source pull against a socket fault and the caller's abort, so a mid-drain socket death or abort interrupts even a parked pull (a source awaiting its
        // next real-time chunk). On a fault/abort win the pull may still settle later, so we attach a no-op handler to it before re-throwing to avoid an unhandled
        // rejection; a source that errors during a normal pull simply rejects the race and propagates unwrapped.
        const next = iterator.next();
        let result: IteratorResult<Uint8Array>;

        try {

          // eslint-disable-next-line no-await-in-loop
          result = await Promise.race([ next, this.#fault.promise, abort.promise ]);
        } catch(error) {

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

      // Signal the source we are done pulling, so a generator or pipe behind it can clean up. A source without a `return` (a plain async iterator) simply has none to
      // call.
      await iterator.return?.();
    }
  }

  /**
   * Close the session: request the WebSocket close, detach every listener, and destroy the owned agent. Idempotent and awaitable. An in-flight {@link
   * TalkbackSession.send} rejects.
   */
  async close(): Promise<void> {

    this.#shutdown(1000, "the talkback session was closed by the client");

    await (this.#closePromise ?? Promise.resolve());
  }

  /**
   * Dispose the session. Delegates to {@link TalkbackSession.close} so `await using session = ...` tears the socket down cleanly.
   */
  async [Symbol.asyncDispose](): Promise<void> {

    await this.close();
  }

  // Negotiate the URL and open the socket. This is the connecting phase: a negotiation (4xx/5xx) or network failure settles the open handshake as a rejection and tears
  // down, and a caller-signal abort does too but as the typed ProtectAbortedError (recorded in #failure before teardown). Either way connect() throws for the whole
  // connect attempt, with no half-open session. The negotiated URL carries its own authorization token, so - like the livestream - no auth headers are stamped on the
  // upgrade.
  async #connect(signal?: AbortSignal): Promise<void> {

    // An already-aborted caller signal tears us down in the constructor before this runs; bail without touching state so we never negotiate or build a socket.
    if(this.#closed) {

      return;
    }

    let url: string;

    try {

      url = await this.#resolveUrl(new URLSearchParams({ camera: this.#cameraId }), (signal !== undefined) ? { signal } : {});
    } catch(error) {

      // A teardown that already fired (caller abort during negotiation) has settled everything; do not also settle. We read the controller's abort state rather than
      // `#closed` because it is a live getter the type system cannot narrow to a constant across the await, and it is set in lockstep with `#closed` on teardown.
      if(!this.#controller.signal.aborted) {

        const failure = (error instanceof ProtectError) ? error :
          new ProtectNetworkError("The UniFi Protect talkback WebSocket endpoint could not be negotiated.", { cause: error });

        this.#failure = failure;
        this.#settleOpen(failure);
        this.#shutdown(1006, "the talkback endpoint negotiation failed");
      }

      return;
    }

    // A concurrent close()/abort may have torn us down while we awaited negotiation. Bail before opening a socket we would immediately orphan.
    if(this.#controller.signal.aborted) {

      return;
    }

    // Build the socket: an injected factory in tests, otherwise undici's WebSocket over an owned HTTP/1.1 agent that accepts the controller's self-signed certificate.
    // undici's WebSocket structurally satisfies the minimal ProtectWritableWebSocket surface, so it assigns directly - no cast.
    if(this.#webSocketFactory !== undefined) {

      this.#ws = this.#webSocketFactory(url);
    } else {

      const agent = new Agent({ connect: { rejectUnauthorized: false } });

      this.#ownedAgent = agent;
      this.#ws = new WebSocket(url, { dispatcher: agent });
    }

    // All listeners bind to the controller's signal, so one abort() detaches them together. open / close / error are `once` - a socket reports each terminal condition a
    // single time. There is deliberately no `message` listener and no `binaryType`: the channel is write-only - the controller emits nothing inbound on it - so the
    // session never reads frames.
    const wsSignal = this.#controller.signal;

    this.#ws.addEventListener("open", () => this.#onOpen(), { once: true, signal: wsSignal });
    this.#ws.addEventListener("close", (event) => this.#onClose(event.code, event.reason), { once: true, signal: wsSignal });
    this.#ws.addEventListener("error", (event) => this.#onError(event), { once: true, signal: wsSignal });
  }

  // The WebSocket opened. Advance to live, settle the open handshake, and publish the opened diagnostic. send() now flows.
  #onOpen(): void {

    this.#live = true;
    this.#state = "live";
    this.#log.debug("Connected to the UniFi Protect talkback API.", { camera: this.#cameraId });
    this.#settleOpen();

    if(channels.talkbackSessionOpened.hasSubscribers) {

      channels.talkbackSessionOpened.publish({ cameraId: this.#cameraId } satisfies TalkbackSessionOpenedPayload);
    }
  }

  // The socket reported an error. Suppress the expected-disconnect noise (the same predicate the sibling sessions use), store the typed failure so an in-flight or
  // subsequent send rejects with it, and request a close so teardown flows through the single close path.
  #onError(event: { error?: unknown; message?: string }): void {

    if(!isExpectedWsDisconnect(event.error)) {

      this.#log.error("The UniFi Protect talkback API reported an error.", event.error ?? event.message);
    }

    this.#failure ??= new ProtectNetworkError("The UniFi Protect talkback API connection failed.", { cause: event.error });
    this.#shutdown(1006, "the talkback connection errored");
  }

  // The single teardown. Guarded so it runs once whether triggered by the socket's close event, an error, the caller's abort, or an explicit close. An unsolicited close
  // - the peer dropped a live socket without our asking - is a failure we did not initiate, so it stores a network failure if none is set yet. Aborts the controller
  // (detaching every listener), settles a still-pending open handshake as a failure, rejects the fault promise (interrupting any in-flight send), publishes the closed
  // diagnostic, and destroys the owned agent.
  #onClose(code: number, reason: string): void {

    if(this.#closed) {

      return;
    }

    this.#closed = true;
    this.#state = "closed";
    this.#controller.abort();

    if(!this.#closeInitiated && this.#live) {

      this.#failure ??= new ProtectNetworkError("The UniFi Protect talkback API connection closed unexpectedly.", { cause: reason });
    }

    this.#settleOpen(this.#failure ?? new ProtectNetworkError("The UniFi Protect talkback API closed before it finished connecting.", { cause: reason }));

    // Reject the fault promise so any in-flight send unparks and rejects. A stored failure (socket error / unsolicited close) is the meaningful cause; a clean
    // self-initiated close still rejects an in-flight send, because the channel it was writing to is gone.
    this.#fault.reject(this.#failure ?? new ProtectNetworkError("The UniFi Protect talkback session was closed.", { cause: reason }));

    this.#log.debug("The UniFi Protect talkback API connection closed.", { camera: this.#cameraId, code, reason });

    if(channels.talkbackSessionClosed.hasSubscribers) {

      channels.talkbackSessionClosed.publish({ cameraId: this.#cameraId, reason } satisfies TalkbackSessionClosedPayload);
    }

    this.#closePromise = (this.#ownedAgent === null) ? Promise.resolve() : this.#ownedAgent.destroy();
  }

  // The caller's own signal fired. Record it as a typed aborted failure BEFORE teardown, so both places #onClose surfaces the stored #failure - the connect handshake's
  // rejection and an in-flight send's fault rejection - report the caller's abort as ProtectAbortedError rather than the generic network error a socket death produces.
  // One event, one type, wherever it is observed.
  #abortByCaller(): void {

    this.#failure ??= new ProtectAbortedError("The UniFi Protect talkback session was aborted by the caller's signal.");
    this.#shutdown(1000, "the talkback session was aborted by the caller's signal");
  }

  // Request a graceful WebSocket close, then run teardown. Calling close() on the socket is best-effort - destroying the owned agent (in #onClose) is what guarantees the
  // underlying connection is released even if the close frame never completes, or if we tear down before the socket was ever built (negotiation abort).
  #shutdown(code: number, reason: string): void {

    // Mark this as a self-initiated teardown so #onClose does not misclassify the resulting close event as an unsolicited (failure) one.
    this.#closeInitiated = true;

    if(!this.#closed) {

      this.#state = "closing";
    }

    try {

      this.#ws?.close();
    } catch {

      // A socket that never opened (or a fake that rejects a premature close) must not block teardown; #onClose below releases everything regardless.
    }

    this.#onClose(code, reason);
  }
}
