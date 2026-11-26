/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * pool.ts: The ref-counted, multi-subscriber livestream pool - one underlying WebSocket per stream identity, fanned out to many independent subscriptions,
 * resilient by default: recovery is owned by the pool's ManagedSession and governed by an injected policy and per-subscription urgency.
 */

/**
 * `LivestreamPool` is the library-owned fan-out *and recovery* layer over {@link LivestreamSession}. Two consumers that ask for the same stream on the same route share
 * one underlying WebSocket; each receives every segment through its own unbounded queue, so a slow consumer never backs up a fast one. Reference counting tears the
 * underlying session down when the last subscriber disposes, and the cached init segment is replayed automatically to any late joiner. A subscriber of a UBV stream
 * may ask for its frames instead of its segments, and receives every frame the same way, with no init replayed; the output never decides which stream it shares.
 *
 * **Resilient by default; recovery lives where sharing lives.** A subscription's iterator survives stalls and reconnects - it pauses during the gap and resumes when
 * segments flow again. Because there is exactly one underlying socket per stream, the recover-or-give-up decision is inherently per-shared-stream, so it lives in the one
 * object that holds both the session and the subscriber set: the {@link ManagedSession}. When the underlying {@link LivestreamSession} dies (stall / error / close), the
 * managed session runs a recovery loop - a reducer over recovery events, `{ decision = policy(ctx); apply }` - that consults the injected {@link RecoveryPolicy} and,
 * per its decision, reconnects (a fresh session and a fresh negotiation, which often clears a wedged endpoint), waits, or gives up. The session deaths that fail the
 * subscribers without the policy are the requests the controller answers the same way on every attempt: a negotiation offering no direct address to a `"direct"`
 * stream or to one asking for Opus over UBV, a UBV stream carrying an audio codec other than the one it asked for, and a socket that cannot send the play command
 * an Opus stream needs. "Raw, non-resilient" is therefore not a pool mode - it is the bare {@link LivestreamSession} used directly, or a `recoveryPolicy` returning
 * `giveUp` on first failure.
 *
 * **The pool decides each attempt's route.** A session dials the one route it is handed and never reconnects, so the managed session, which owns recovery, picks it:
 * a `"proxied"` or `"direct"` stream dials its own route on every attempt, and a `"preferDirect"` stream dials direct first in each episode and proxied for the rest
 * of the episode once a direct attempt fails at its dial or is offered no direct address, publishing `livestreamRouteFallback` as it falls back, starting direct
 * again in the next. A `"preferDirect"` stream asking for Opus that is offered no direct address ends instead, since its proxied route names its stream by that
 * address. Every route shares the negotiation, so a failed one moves no stream off its route.
 *
 * **A consumer requests a spec, never a URL.** The controller mints fresh, one-time addresses per negotiation, so the pool dedups on the *spec* (its sharing identity,
 * via {@link livestreamKey}) *before* negotiating - only the first subscriber for a key creates a managed session, which then creates and negotiates each underlying
 * session, and a subscriber whose signal had already aborted creates and joins none. `subscribe` registers the managed session in the map synchronously, so a
 * concurrent early subscriber attaches to the one in-flight session.
 *
 * **The pool owns no transport.** It receives `resolveUrl` - the transport-backed negotiation hook (see {@link livestreamUrlResolver}), answering both of a
 * livestream's addresses - so it stays unit-testable with a one-line fake resolver and a fake WebSocket, and the negotiation lives end-to-end inside each session (one
 * connect attempt, one error path).
 *
 * @module LivestreamPool
 */
import type { LivestreamAddresses, LivestreamDialRoute, LivestreamFrame, LivestreamSessionEvents, LivestreamSpec, ResolvedLivestreamSpec,
  Segment } from "./session.ts";
import type { LivestreamCodecChangedPayload, LivestreamRecoveryExhaustedPayload, LivestreamRecoveryRecoveredPayload, LivestreamRecoveryStartedPayload,
  LivestreamRouteFallbackPayload, LivestreamRouteFallbackReason, LivestreamSessionClosedPayload, LivestreamSessionOpenedPayload, LivestreamStallDetectedPayload,
  LivestreamSubscriptionCreatedPayload, LivestreamSubscriptionDisposedPayload } from "../shared/diagnostics.ts";
import { LivestreamSession, livestreamKey, resolveLivestreamSpec } from "./session.ts";
import { PROTECT_LIVESTREAM_AWAIT_MARGIN_MS, PROTECT_LIVESTREAM_AWAIT_MAX_MS, PROTECT_LIVESTREAM_AWAIT_MIN_MS, PROTECT_LIVESTREAM_DEFAULT_TOLERANCE_MS,
  PROTECT_LIVESTREAM_ESTABLISH_BACKOFF_MS, PROTECT_LIVESTREAM_ESTABLISH_DEADLINE_MS, PROTECT_LIVESTREAM_RECOVERY_BACKOFF_MS, PROTECT_LIVESTREAM_STALL_DEFAULT_MS,
  PROTECT_LIVESTREAM_STALL_FLOOR_MS, PROTECT_LIVESTREAM_STALL_POLL_MS } from "../shared/settings.ts";
import { ProtectCodecChangeError, ProtectConfigurationError, ProtectLivestreamAudioError, ProtectLivestreamRouteError, ProtectLivestreamUnavailableError,
  ProtectStallError, assertNever } from "../shared/errors.ts";
import { millisecondsSince, wallClock } from "../shared/clock.ts";
import type { Clock } from "../shared/clock.ts";
import type { LivestreamInit } from "../protocol/media/fmp4/init-segment.ts";
import type { MediaFrame } from "../protocol/media/frames.ts";
import type { ProtectError } from "../shared/errors.ts";
import type { ProtectLogging } from "../shared/logging.ts";
import type { ProtectWebSocket } from "../transport/ws.ts";
import { channels } from "../shared/diagnostics.ts";
import { isDeepStrictEqual } from "node:util";
import { noopLog } from "../shared/logging.ts";
import { randomUUID } from "node:crypto";
import { readSampleDescriptions } from "../protocol/media/fmp4/init-segment.ts";

/**
 * The coarse, stable lifecycle of a pooled stream as a subscriber observes it. `connecting` is bounded establishment (no MEDIA segment has ever flowed); `live` is a
 * healthy stream; `recovering` is an in-flight recovery episode (a recoverable stall shows here *without* ending iteration); `closed` is terminal (disposed, codec
 * change, a `"direct"` or Opus stream offered no direct address, another audio codec than the one asked for, a socket that cannot send, or the policy gave up).
 *
 * @category Client
 */
export type LivestreamSubscriptionState = "closed" | "connecting" | "live" | "recovering";

/**
 * What the library can observe at a recovery decision point. Consumer-private state (buffer headroom, controller health) is deliberately *not* here - a consumer that
 * wants to correlate recovery with controller health reads it in its own policy closure. The fields are exactly what the library itself can compute.
 *
 * @category Client
 */
export interface RecoveryContext {

  /**
   * The failed reconnect attempts this episode has counted; resets to 0 once a media segment flows again. A `"preferDirect"` stream's direct attempt whose session
   * ended before its first media, after reaching its dial or on being offered no direct address, is not among them: it falls back to the proxied route at once,
   * and the policy is consulted again with the count as it stood. A stream asking for Opus that is offered no direct address ends there instead, with no fallback.
   * A direct attempt still dialing when its window elapses, and one whose negotiation failed, are each counted as any failed attempt is.
   */
  attempts: number;

  /** The camera this recovery episode belongs to, so a consumer policy can correlate the decision with per-camera state it alone observes. */
  cameraId: string;

  /** Milliseconds since this episode began (the stall moment, or the first establish attempt). Lets a policy enforce a bounded establishment deadline. */
  elapsedMs: number;

  /** Bounded establishment (fail fast if it never came up) vs. unbounded live recovery (it proved itself once). */
  phase: "establishing" | "recovering";

  /** Aggregated delay tolerance across subscribers - the MINIMUM reported, so the most-urgent governs; `Infinity` when none reported. */
  toleranceMs: number;
}

/**
 * A recovery decision the {@link RecoveryPolicy} returns. Its arms are exhaustive:
 *
 * - `reconnect` tears down any socket and connects fresh; the attempt is treated as failed if no media segment arrives within `awaitMs`, then the policy is re-consulted.
 *   `awaitMs` doubles as the inter-attempt spacing (a fast-failing attempt still occupies its full window, except a `"preferDirect"` stream's direct attempt that fails
 *   at its dial or is offered no direct address, which falls back to the proxied route at once, or ends the stream when it asks for Opus and was offered no direct
 *   address), so the single policy governs both disposition and timing. The pool keeps an attempt past `awaitMs` while its frames keep arriving - until its first
 *   media, until its frames fall silent for the stream's media-stall detection threshold, until its session closes, or until
 *   {@link PROTECT_LIVESTREAM_ESTABLISH_DEADLINE_MS} has passed since its first frame - because a UBV stream's writer can hold the stream's first media while it
 *   waits for audio.
 * - `wait` does nothing for `forMs`, then re-consults - unifying defer-soak (a still-connecting session's late media segment cancels it early) and inter-attempt backoff.
 *   A `"preferDirect"` stream's direct attempt that had not reached its dial when its window elapsed, and so did not fall back then, ends the wait early if its dial
 *   then fails or it is offered no direct address, and the stream falls back to the proxied route, or ends when it asks for Opus and was offered no direct address.
 *   A direct session already dialing at the elapse fell back then, and its later end is absorbed.
 * - `giveUp` is terminal: the give-up error is thrown into every subscriber and the stream is torn down.
 *
 * @category Client
 */
export type RecoveryDecision =
  | { awaitMs: number; kind: "reconnect" } |
  { forMs: number; kind: "wait" } |
  { kind: "giveUp" };

/**
 * The single decision authority for a stream's recovery, injected at the pool (the same dependency inversion as `resolveUrl`). Pure: given the library-observable
 * {@link RecoveryContext}, it returns a {@link RecoveryDecision}. The library ships {@link defaultLivestreamRecoveryPolicy}, a health-agnostic default; a consumer
 * injects its own to add the controller-health correlation only it can observe.
 *
 * @category Client
 */
export type RecoveryPolicy = (context: RecoveryContext) => RecoveryDecision;

/**
 * The library's default, health-agnostic recovery policy. It is **phase-split**, because establishing and recovering have different timing authorities:
 *
 * - **Establishment (`phase === "establishing"`) is hardware-bound and urgency-INDEPENDENT.** A fresh stream is minted at the camera's own first-segment latency, which
 *   no consumer can hurry - so the per-attempt window follows the fixed, patient {@link PROTECT_LIVESTREAM_ESTABLISH_BACKOFF_MS} curve and ignores `toleranceMs` entirely
 *   (tearing a fresh stream down early just churns the negotiation). It gives up once the episode runs past {@link PROTECT_LIVESTREAM_ESTABLISH_DEADLINE_MS} - the
 *   stream that connects but never produces media, its windows walking the patient establishment curve and holding at the last stage until the deadline.
 * - **Live recovery (`phase === "recovering"`) is headroom-clamped and unbounded.** A stream that proved itself once is retried forever (never `giveUp`); each window
 *   grows along {@link PROTECT_LIVESTREAM_RECOVERY_BACKOFF_MS}, capped by the consumer's headroom (the aggregated tolerance less a margin; the patient default when none
 *   reported) and clamped to {@link PROTECT_LIVESTREAM_AWAIT_MIN_MS}/{@link PROTECT_LIVESTREAM_AWAIT_MAX_MS}. An urgent subscriber recovers at the floor; a patient one
 *   follows the curve.
 *
 * These are safe **ecosystem** defaults - conservative across the diverse hardware real users run, not tuned for a fast controller. A consumer that has measured its own
 * controllers' latency may inject a tighter policy; a consumer composing one may delegate here for the timing and override only the disposition, or replace it.
 *
 * @param context - The library-observable recovery context.
 *
 * @returns The recovery decision for this step.
 *
 * @category Client
 */
export function defaultLivestreamRecoveryPolicy(context: RecoveryContext): RecoveryDecision {

  // Establishment is hardware-bound: it follows a fixed patient curve and ignores urgency, giving up only once the deadline elapses. The backoff
  // index is always in range, so the nullish fallback only satisfies noUncheckedIndexedAccess.
  if(context.phase === "establishing") {

    if(context.elapsedMs >= PROTECT_LIVESTREAM_ESTABLISH_DEADLINE_MS) {

      return { kind: "giveUp" };
    }

    const establishWindow = PROTECT_LIVESTREAM_ESTABLISH_BACKOFF_MS[Math.min(context.attempts, PROTECT_LIVESTREAM_ESTABLISH_BACKOFF_MS.length - 1)] ??
      PROTECT_LIVESTREAM_AWAIT_MAX_MS;

    return { awaitMs: establishWindow, kind: "reconnect" };
  }

  // Live recovery is unbounded and headroom-clamped. The per-attempt window grows with consecutive failures (the backoff curve), then holds at the curve's last value.
  const stage = PROTECT_LIVESTREAM_RECOVERY_BACKOFF_MS[Math.min(context.attempts, PROTECT_LIVESTREAM_RECOVERY_BACKOFF_MS.length - 1)] ?? PROTECT_LIVESTREAM_AWAIT_MAX_MS;

  // Headroom is how long the most-urgent subscriber can tolerate no data, less a safety margin; with no reported urgency we treat the stream as patient. The window is
  // the backoff stage, floored so we never tear down a fresh stream before it can mint and ceilinged by both the consumer's headroom and the absolute max - self-tuning.
  const headroom = Number.isFinite(context.toleranceMs) ? Math.max(context.toleranceMs - PROTECT_LIVESTREAM_AWAIT_MARGIN_MS, 0) : PROTECT_LIVESTREAM_DEFAULT_TOLERANCE_MS;
  const ceiling = Math.max(Math.min(headroom, PROTECT_LIVESTREAM_AWAIT_MAX_MS), PROTECT_LIVESTREAM_AWAIT_MIN_MS);
  const awaitMs = Math.min(Math.max(stage, PROTECT_LIVESTREAM_AWAIT_MIN_MS), ceiling);

  return { awaitMs, kind: "reconnect" };
}

/**
 * The delivery counters a {@link LivestreamSubscription} exposes, so a consumer can monitor its own slowness (a growing `queueDepth` / `peakQueueDepth`) and respond -
 * the only backpressure mechanism, since the queue itself is unbounded. An item is whatever the subscription iterates: a segment, or a frame for a frames
 * subscription.
 *
 * @category Client
 */
export interface LivestreamSubscriptionStats {

  /** Items handed to the iterator over this subscription's life. */
  delivered: number;

  /** Items dropped undelivered when this subscription was disposed under `discardOnDispose`; `0` for a default drain-on-dispose subscription. */
  discarded: number;

  /** The `clock.now()` timestamp of the most recent item enqueued for this subscriber. */
  lastSegmentAt: number;

  /** The historical high-water mark of `queueDepth`. Monotonic: it records the peak backlog this subscriber ever accrued, which a later discard does not lower. */
  peakQueueDepth: number;

  /** Items queued but not yet delivered right now - the live backlog. Reads `0` immediately after a `discardOnDispose` disposal clears the queue. */
  queueDepth: number;
}

/**
 * What a subscription iterates: `"segments"`, the default, the stream's fMP4 initialization and media segments, or `"frames"`, the media frames a UBV stream
 * carries, each a {@link LivestreamFrame} as the camera sent it. A frames subscription reads UBV whatever its spec names, so it shares a stream with the segments
 * subscribers that read UBV with the same audio, and the output itself never joins the stream's identity. It is named by the overloads of `LivestreamPool.subscribe`
 * and {@link Camera.livestream} beside the shared option types, so a value typed as those keeps answering segments.
 *
 * @category Client
 */
export type LivestreamOutput = "frames" | "segments";

/**
 * Per-subscription options for `LivestreamPool.subscribe` (reached through the {@link Camera.livestream} consumer entry point). All optional: a bare `subscribe(spec)`
 * is a resilient, drain-on-dispose subscription with no abort wiring and no reported urgency.
 *
 * @category Client
 */
export interface LivestreamSubscribeOptions {

  /**
   * Discard any still-queued, undelivered items the instant this subscription is disposed, so a consumer mid-iteration receives the terminal rather than draining
   * stale bytes first. Off by default: a disposed subscription normally drains its queue before ending. Scoped to the consumer's own disposal alone; a pool-forced
   * terminal (codec change, a missing direct address, another audio codec, a socket that cannot send, give-up, last-subscriber detach, pool disposal) still drains
   * the queue before the terminal surfaces, exactly as it does without this option.
   */
  discardOnDispose?: boolean;

  /**
   * An abort signal that disposes this subscription (and only this one - a shared session lives as long as any subscriber remains), or, when it has already aborted,
   * makes `subscribe` return one that is already disposed and joined no shared stream.
   */
  signal?: AbortSignal;

  /**
   * How many milliseconds this consumer can tolerate receiving no segment, pulled fresh at each decision and aggregated across a shared stream by the minimum. It serves
   * each consumer-owned policy from one closure. First, the resilient recovery's await budget self-tunes from the consumer's real buffer headroom: a live view reports ~0
   * (recover aggressively), a paced recording its cushion, a passive buffer a large value (wait patiently). Second, it is the consumer's MEDIA-stall detection deadline
   * for the pool's always-on (while live) media watchdog: declaring nothing leaves `PROTECT_LIVESTREAM_STALL_DEFAULT_MS` (the default media-stall window, so every
   * stream is media-watched by default), a tighter value tightens detection (clamped up to a small floor against jitter), and Infinity opts out of media-stall detection
   * entirely (the session's any-byte heartbeat still watches the socket). Omit it to leave the stream maximally patient on recovery and media-watched at the default
   * media-stall window.
   */
  urgency?: () => number;
}

/**
 * Construction options for {@link LivestreamPool}. `resolveUrl` is the transport-backed negotiation hook answering both of a livestream's addresses (build it with
 * {@link livestreamUrlResolver}); `getAuthHeaders` is the auth hook threaded down to each session, which stamps it on a proxied upgrade alone; `webSocket` is the
 * injected I/O dependency, shared with {@link EventStream}'s and threaded down to each session; `recoveryPolicy` is the per-stream recovery decision authority,
 * defaulting to {@link defaultLivestreamRecoveryPolicy}; `verifyTls` is the strict-TLS opt-in threaded down to each session's proxied connection, defaulting to
 * `false` for the controller's self-signed certificate, while a direct connection never verifies the media server's; `clock` is the time source, defaulting to the
 * wall clock and replaceable for tests; `log` is the logger, defaulting to a no-op.
 *
 * @category Client
 */
export interface LivestreamPoolOptions {

  clock?: Clock;
  getAuthHeaders?: () => Record<string, string>;
  log?: ProtectLogging;
  recoveryPolicy?: RecoveryPolicy;
  resolveUrl: (params: URLSearchParams, opts: { signal?: AbortSignal }) => Promise<LivestreamAddresses>;
  verifyTls?: boolean;
  webSocket?: (url: string) => ProtectWebSocket;
}

// The recovery-relevant surface a LivestreamSubscription reads from its host: the ManagedSession that owns its stream, or the detached host below for a subscription
// that joined none. Keeping it a narrow interface (rather than a back-reference to the whole ManagedSession) means the subscription depends on exactly the affordances
// it exposes - state, the cached init, the establishment latch, and the in-flight re-decision - and nothing more.
interface SubscriptionHost {

  get initSegment(): LivestreamInit | null;
  get state(): LivestreamSubscriptionState;
  reassess(): void;
  whenEstablished(): Promise<boolean>;
}

// The host of a subscription that joined no shared stream: the handle `subscribe` returns under a signal that had already aborted. It has no init segment to read
// through to, and it answers everything else a host is asked the way a stream that is over would. That subscription is disposed before its caller holds it, so its
// own guards answer first; these answers keep the host total for a subscription that stands on it.
const detachedHost: SubscriptionHost = {

  initSegment: null,
  reassess: (): void => {

    // A subscription on no stream has nothing to re-decide.
  },
  state: "closed",
  whenEstablished: async (): Promise<boolean> => false
};

/**
 * A consumer's handle into a pooled livestream. It is an `AsyncIterable` of what the subscriber asked for (the iterator *is* the surface - no callback rail) and
 * `AsyncDisposable`: fMP4 {@link Segment}s by default, or, for a frames subscription, the {@link LivestreamFrame}s of a UBV stream, which need no init and are
 * replayed none. Each subscription has its **own unbounded queue**: the pool pushes every item of its output to every subscriber of that output, so one slow
 * consumer cannot stall a fast one, and nothing is dropped.
 *
 * The stream is **resilient by default**: a recoverable stall or reconnect is invisible to the iterator - it pauses while the underlying session is re-established and
 * resumes uninterrupted when segments flow again (a reconnect to the same stream, whose init carries the same codec label, description and sample descriptions,
 * suppresses the redundant init, as an identical init on a live session is swallowed). The iterator terminates only on these conditions: disposal (a clean `done`),
 * an init, on a reconnect or on a live session, whose codec label, description or a track's sample description differs from the stream's (it throws
 * {@link ProtectCodecChangeError}), a `"direct"` stream or one asking for Opus whose negotiation offered no direct address (it throws
 * {@link ProtectLivestreamRouteError}), a UBV stream carrying an audio codec other than the one it asked for (it throws {@link ProtectLivestreamAudioError}), an
 * Opus stream whose socket cannot send its play command (it throws {@link ProtectConfigurationError}), and the recovery policy giving up (it throws
 * {@link ProtectLivestreamUnavailableError}). A recoverable stall is *not* one of them. A frames subscription meets the same terminals, the codec gate reading the
 * stream's segments for it.
 *
 * @typeParam T - What the subscription iterates: {@link Segment}, the default, or {@link LivestreamFrame} for a frames subscription.
 *
 * @category Client
 */
export class LivestreamSubscription<T = Segment> implements AsyncIterable<T>, AsyncDisposable {

  /** This subscription's unique id, correlated with the `subscription:created` / `:disposed` diagnostics. */
  readonly id: string;

  readonly #clock: Clock;
  // When set, disposing this subscription clears its undelivered queue so a consumer mid-iteration receives the terminal rather than stale segments. Consumer-disposal
  // scoped by construction (see the clear site in `[Symbol.asyncDispose]`).
  readonly #discardOnDispose: boolean;
  // A one-shot deferred settled `false` the instant this subscription is disposed by any path. `whenEstablished()` races the shared session's establishment latch against
  // it, so a departed subscriber's own wait ends with the subscription instead of hanging on the shared latch until the remaining subscribers settle it. It only ever
  // resolves (never rejects), so it needs no observed-rejection handler; if `whenEstablished()` is never called it simply settles unobserved and is collected with the
  // subscription.
  readonly #disposalDeferred = Promise.withResolvers<false>();
  readonly #host: SubscriptionHost;
  readonly #onDispose: (subscription: LivestreamSubscription<T>) => void;
  // This queue is a policy-bearing media backlog on the library's hottest path - it carries the per-subscriber delivery statistics, the consumer-disposal discard, and
  // the drain-before-terminal guarantee - kept deliberately separate from the generic `EventBus` rail, which is built on Node's own async iterator and carries no
  // per-consumer policy.
  readonly #queue: T[] = [];
  readonly #signal: AbortSignal | undefined;

  #abortHandler: (() => void) | null = null;
  #delivered = 0;
  #discarded = 0;
  #disposed = false;
  #done = false;
  #error: ProtectError | null = null;
  #lastSegmentAt = 0;
  #peakQueueDepth = 0;
  // The resolver of a pending `next()` that is waiting for the queue to fill or the stream to terminate. Cleared each time it is fired.
  #wake: (() => void) | null = null;

  constructor(opts: { clock: Clock; discardOnDispose: boolean; host: SubscriptionHost; onDispose: (subscription: LivestreamSubscription<T>) => void;
    signal?: AbortSignal; }) {

    this.id = randomUUID();
    this.#clock = opts.clock;
    this.#discardOnDispose = opts.discardOnDispose;
    this.#host = opts.host;
    this.#onDispose = opts.onDispose;
    this.#signal = opts.signal;

    // The consumer's signal disposes this subscription (and only this one - a shared session lives as long as any subscriber remains). The pool hands a
    // subscription only a signal that has not aborted, so a listener is all the binding needs.
    if(opts.signal !== undefined) {

      this.#abortHandler = (): void => void this[Symbol.asyncDispose]();
      opts.signal.addEventListener("abort", this.#abortHandler, { once: true });
    }
  }

  /** The negotiated RFC 6381 codec descriptor once the init segment has arrived, otherwise `""`. Read through to the shared session's cached init, the single source. */
  get codec(): string {

    return this.#host.initSegment?.codec ?? "";
  }

  /**
   * The cached initialization segment of the shared stream once it has arrived, otherwise `null`: its codec label, its bytes and its description. The first init sets
   * it, and nothing replaces it: a later init of the same stream, one carrying the same label, description and sample descriptions, on a reconnect or on a live
   * session, is suppressed and the cache retained, and a later init whose label, description or a track's sample description differs is terminal.
   */
  get initSegment(): LivestreamInit | null {

    return this.#host.initSegment;
  }

  /** The coarse, stable lifecycle state. `"closed"` once this subscription is disposed; else the shared stream's state (a recoverable stall reads `"recovering"`). */
  get state(): LivestreamSubscriptionState {

    return this.#disposed ? "closed" : this.#host.state;
  }

  /** The live delivery counters for this subscription. `queueDepth` / `peakQueueDepth` let a consumer detect that it is falling behind. */
  get stats(): LivestreamSubscriptionStats {

    return { delivered: this.#delivered, discarded: this.#discarded, lastSegmentAt: this.#lastSegmentAt, peakQueueDepth: this.#peakQueueDepth,
      queueDepth: this.#queue.length };
  }

  /**
   * Iterate this subscription's items: its segments, or its frames for a frames subscription. The iterator yields every queued item, then either ends (clean close /
   * disposal) or throws the terminal error (a codec change, a missing direct address, another audio codec, a socket that cannot send, or a give-up). A recoverable
   * stall is invisible - the iterator parks and resumes. Breaking out of the loop disposes the subscription.
   *
   * @returns An async iterator of the subscription's items.
   */
  [Symbol.asyncIterator](): AsyncIterator<T> {

    return this.#drain();
  }

  /**
   * Dispose the subscription: detach it from its shared session when it joined one (decrementing the reference count, which tears the session down if it was the
   * last), end any in-flight iteration, and detach the consumer's abort listener. Safe to call more than once.
   */
  async [Symbol.asyncDispose](): Promise<void> {

    if(this.#disposed) {

      return;
    }

    this.#disposed = true;
    this.#done = true;

    // Settle the disposal deferred first, so a pending `whenEstablished()` on this subscription unblocks as `false` the moment the subscription ends, whatever ended it -
    // its own signal abort (which routes here), an explicit `await using` exit, or the drain loop's `finally`.
    this.#disposalDeferred.resolve(false);

    if((this.#signal !== undefined) && (this.#abortHandler !== null)) {

      this.#signal.removeEventListener("abort", this.#abortHandler);
      this.#abortHandler = null;
    }

    // Discard-on-dispose: drop whatever is still queued so the imminent wake surfaces the terminal (`#done` is set above) instead of draining stale bytes, and record the
    // exact count for observability. This clear is scoped correctly to consumer disposal BY CONSTRUCTION: the pool-forced terminals (`fail()` / `close()`) reach a
    // subscriber only through `#drain`'s `finally`, which fires AFTER the queue has already drained to the consumer, so they never route through this method with a
    // non-empty queue - the drain-then-terminal contract holds for them regardless of this flag. The clear precedes `#fireWake()` so a parked `next()` re-checks an
    // already-empty queue.
    if(this.#discardOnDispose) {

      this.#discarded = this.#queue.length;
      this.#queue.length = 0;
    }

    this.#fireWake();
    this.#onDispose(this);
  }

  /**
   * Ask the shared stream's recovery policy to re-decide now - for example when this consumer's urgency just changed. It only re-decides an *in-flight* recovery episode,
   * so on a healthy stream it is a no-op; it never forces a reconnect of a working connection.
   */
  reassess(): void {

    // A disposed subscription no longer speaks for a consumer, so it must not nudge the shared stream's recovery. With sibling subscribers still attached, an unguarded
    // call from a departed consumer could re-decide an in-flight recovery episode the siblings still own.
    if(this.#disposed) {

      return;
    }

    this.#host.reassess();
  }

  /**
   * Resolve `true` once the shared stream has produced its first MEDIA segment, or `false` once this subscription's wait for it is over. Liveness is
   * media-keyed: a controller that connects and acks with an init but then produces no media is NOT established - it elapses its recovery window and reconnects, so this
   * resolves `true` only when media is actually flowing. It resolves `false` in every case where the wait is over without media: the shared stream gave up
   * establishing or ended on a terminal first, or this subscription itself was disposed - its own signal aborting, an explicit `await using` exit, or breaking its
   * iterator - so a departed subscriber's own wait ends with the subscription rather than hanging on the shared establishment latch until the remaining subscribers
   * happen to settle it. The boolean deliberately does not distinguish these outcomes because every consumer's correct reaction is identical: stop waiting and clean
   * up. A frames subscription is established by the same media: a UBV stream always writes its segments, whether or not a subscriber iterates them, so its first
   * media segment, not its first frame, resolves the wait.
   *
   * @returns A promise resolving `true` once the first media segment flows, `false` if establishment was abandoned or this subscription was disposed first.
   */
  async whenEstablished(): Promise<boolean> {

    // Already disposed: there is nothing left to wait for, and we must not forward to the still-pending shared latch (unlike the departed-mid-wait case below, which the
    // disposal deferred settles). A repeat call lands here identically - the answer is a property of this subscription's state, not of any per-call listener.
    if(this.#disposed) {

      return false;
    }

    // Race the shared establishment latch against this subscription's own disposal. The shared latch settles for the whole stream: first media `true`, or `false` once
    // the stream is over without it, ended by a give-up, a codec change, another terminal or its teardown. The disposal deferred settles `false` for this subscriber
    // alone. It is shared across every call, so repeated waits register nothing per call and leak no listeners.
    return Promise.race([ this.#host.whenEstablished(), this.#disposalDeferred.promise ]);
  }

  /**
   * Push an item, a segment or a frame, to this subscriber. Records liveness, tracks the peak queue depth (the consumer's slowness signal), enqueues, and wakes a
   * pending next(). Codec reads through to the shared session's cached init, so nothing codec-specific is tracked here. Package-internal: the ManagedSession calls
   * this.
   *
   * @internal
   */
  push(item: T): void {

    if(this.#done) {

      return;
    }

    this.#lastSegmentAt = this.#clock.now();
    this.#queue.push(item);
    this.#peakQueueDepth = Math.max(this.#peakQueueDepth, this.#queue.length);
    this.#fireWake();
  }

  /**
   * Terminate this subscriber with a terminal error (a codec change, a missing direct address, another audio codec, a socket that cannot send, or a give-up).
   * Already-queued segments still drain first; the error throws only once the queue empties. Package-internal.
   *
   * @internal
   */
  fail(error: ProtectError): void {

    if(this.#done || (this.#error !== null)) {

      return;
    }

    this.#error = error;
    this.#fireWake();
  }

  /**
   * Terminate this subscriber cleanly: the managed stream's teardown without a terminal error (for example, pool disposal). Already-queued segments still drain
   * first. Package-internal.
   *
   * @internal
   */
  close(): void {

    if(this.#done) {

      return;
    }

    this.#done = true;
    this.#fireWake();
  }

  // The pull loop. Drains every queued item, then surfaces the terminal condition: a stored error (thrown) or completion (return). When neither is ready, it awaits
  // the next push/terminate. The finally block disposes, so breaking the consumer's loop releases the reference exactly as an explicit dispose would.
  async *#drain(): AsyncGenerator<T> {

    try {

      for(;;) {

        const item = this.#queue.shift();

        if(item !== undefined) {

          this.#delivered++;

          yield item;

          continue;
        }

        if(this.#error !== null) {

          throw this.#error;
        }

        if(this.#done) {

          return;
        }

        const { promise, resolve } = Promise.withResolvers<undefined>();

        this.#wake = (): void => resolve(undefined);

        // Parking on the next push or terminate is the whole point of this loop - the await is intentional and sequential, the same drain idiom the state store uses.
        // eslint-disable-next-line no-await-in-loop
        await promise;
      }
    } finally {

      await this[Symbol.asyncDispose]();
    }
  }

  // Resolve any pending next() so it re-checks the queue and terminal flags. One-shot: cleared after firing.
  #fireWake(): void {

    const wake = this.#wake;

    if(wake !== null) {

      this.#wake = null;
      wake();
    }
  }
}

// The internal recovery-loop outcome of waiting out one decision's window: a media segment restored the stream (`recovered`), the window elapsed without one (`elapsed`),
// a consumer asked to re-decide now (`reassess`), a "preferDirect" stream's direct attempt failed at its dial or was offered no direct address before its first media
// (`directFailed`), or the stream was torn down (`aborted`). Any other dying in-flight session settles no outcome - it simply stops producing segments, so the window
// times out as `elapsed`, which keeps the model uniform (failure is "no media segment in the window"). The direct attempt is the one exception, because the proxied
// route behind it should not wait out a window the direct route has already answered; a failed negotiation is shared by every route and says nothing of the direct one.
type RecoveryOutcome = "aborted" | "directFailed" | "elapsed" | "reassess" | "recovered";

// A subscription of any output, as the pool holds it apart from its tag: where it is detached, disposed and reported.
type PooledSubscription = LivestreamSubscription | LivestreamSubscription<LivestreamFrame>;

// A managed stream's subscriber, tagged by the output it asked for, so each fan-out reaches the subscribers of its own output alone and the compiler holds every
// item to the type its subscription iterates. The urgency closure, which a subscriber may leave out, feeds the recovery and the media watchdog whatever the output.
type Subscriber =
  | { output: "frames"; subscription: LivestreamSubscription<LivestreamFrame>; urgency: (() => number) | undefined } |
  { output: "segments"; subscription: LivestreamSubscription; urgency: (() => number) | undefined };

// Resolve the output a subscription asks for: an omitted output is segments, and a value outside the outputs, which only an untyped caller can pass, is refused here
// as the spec's resolution refuses an unknown route, before any session is built.
function resolveOutput(output: LivestreamOutput | undefined): LivestreamOutput {

  if(output === undefined) {

    return "segments";
  }

  switch(output) {

    case "frames":
    case "segments": {

      return output;
    }

    default: {

      return assertNever(output);
    }
  }
}

// Build a subscriber of the output asked for, its subscription typed by what it iterates and built from the options every output takes. An output added without
// an arm here leaves the function's end reachable, which fails to compile.
function subscriberOf(output: LivestreamOutput, options: { clock: Clock; discardOnDispose: boolean; host: SubscriptionHost;
  onDispose: (subscription: PooledSubscription) => void; signal?: AbortSignal; }, urgency?: () => number): Subscriber {

  switch(output) {

    case "frames": {

      return { output, subscription: new LivestreamSubscription<LivestreamFrame>(options), urgency };
    }

    case "segments": {

      return { output, subscription: new LivestreamSubscription<Segment>(options), urgency };
    }
  }
}

// The per-install state that must move in lockstep with every freshly-installed session, consolidated into one object so the lockstep is enforced by structure
// rather than by separate fields a future edit could desynchronize. It is all reset atomically in `#installSession`; each latch is consumed at most once over that
// session's life, and the frame times are stamped on every frame it fans:
//
// - `awaitingFirstSegment` gates the codec-gate / init point: the very first segment of a freshly-installed session (normally the init) routes to `#handleFirstSegment`.
// - `awaitingFirstMedia` gates the recovery point: the first MEDIA segment of the install settles the episode `recovered` (establishment / live recovery both key on
//   media, not the init - "a stream is alive when media is flowing, not when the controller acked with an init").
// - `firstFrameAt` and `lastFrameAt` are when this install fanned its first and its latest frame, as the clock's monotonic readings, null until it fans one. They
//   judge only whether an attempt still waiting for its first media is kept past its window (see `#aliveMs`).
// - `pendingDiscontinuity` arms the post-reconnect timeline-discontinuity marker for the first fanned media; armed only in the recovering phase (a cold start has no
//   prior timeline to resynchronize).
// - `pendingFrameDiscontinuity` arms the same marker for the first fanned frame, by its own rule: armed whenever an earlier install has fanned a frame, whatever the
//   phase, because frames arrive ahead of the media an attempt is judged by, so an establishing attempt can fan frames and end before its first media.
interface SessionInstallState {

  awaitingFirstMedia: boolean;
  awaitingFirstSegment: boolean;
  firstFrameAt: number | null;
  lastFrameAt: number | null;
  pendingDiscontinuity: boolean;
  pendingFrameDiscontinuity: boolean;
}

/* Whether a later init carries the same stream as the cached one, on a reconnect or on a live session: the same codec label, the same description by value, and
 * each track's sample description the same, byte for byte and in number. A move in any of them makes the stream one a fixed-format consumer cannot follow: the label
 * names the codec family, profile, level and audio object type, the description the sample rate, channels and dimensions the label says nothing about, and a
 * track's sample description holds exactly what a decoder is configured from, its parameter sets among it, which can change while neither of the others moves. An
 * init never compares whole, because its creation times differ on every connection, while a track's sample description reads the same on every connection of one
 * stream. The reserved bits of an AV1 track's `av1C` record are no part of its sample description, because the format reserves them and no decoder reads them, so
 * the reader answers them cleared. The sample descriptions are read here, at the gate, and never stored.
 */
function isSameStream(prior: LivestreamInit, next: LivestreamInit): boolean {

  if((prior.codec !== next.codec) || !isDeepStrictEqual(prior.description, next.description)) {

    return false;
  }

  const priorDescriptions = readSampleDescriptions(prior.data);
  const nextDescriptions = readSampleDescriptions(next.data);

  return (priorDescriptions.length === nextDescriptions.length) && priorDescriptions.every((description, index) => nextDescriptions[index]?.equals(description) === true);
}

// Project an init segment onto the one init type: the cache, the late-joiner replay and the prior and later inits of a codec change hold its fields and never the
// segment itself.
function initOf(segment: Extract<Segment, { type: "init" }>): LivestreamInit {

  return { codec: segment.codec, data: segment.data, description: segment.description };
}

// The pool's per-stream record: the (replaceable) underlying session, the subscribers fanned out from it, the cached init segment for late-joiner replay, and - the heart
// of the resilient pool - the recovery loop. It is the one object holding both the session and the subscriber set, which is why recovery (a per-shared-stream decision)
// lives here. It implements SubscriptionHost so each subscription that joined the stream reads its lifecycle state, cached init, establishment latch, and in-flight
// re-decision through it.
class ManagedSession implements SubscriptionHost {

  readonly #clock: Clock;
  readonly #controller = new AbortController();
  readonly #createSession: (signal: AbortSignal, route: LivestreamDialRoute) => LivestreamSession;
  readonly #established = Promise.withResolvers<boolean>();
  readonly #key: string;
  readonly #log: ProtectLogging;
  readonly #onTeardown: (key: string) => void;
  readonly #policy: RecoveryPolicy;
  readonly #resolved: ResolvedLivestreamSpec;
  // Each subscription mapped to its subscriber, tagged by output and carrying its (optional) urgency closure, so each fan-out reaches its own output's subscribers
  // and the recovery loop aggregates delay tolerance across the stream by the minimum at each decision point.
  readonly #subscribers = new Map<PooledSubscription, Subscriber>();

  // The in-flight underlying session and its rail subscriptions. Both are replaced wholesale on each reconnect; disposing the rails before closing the old session
  // guarantees a dying socket's late frames never leak into the new attempt.
  #current: LivestreamSession | null = null;
  #currentRails: Disposable[] = [];

  // The shared lifecycle state, the cached init (which the codec gate compares every later init with), the last terminal error (a codec change, a missing direct
  // address, another audio codec, a socket that cannot send, or a give-up; recoverable session errors are absorbed by recovery and never stored), liveness for the
  // recovery diagnostics, and the single teardown / establishment-latch guards.
  //
  // `#lastSegmentAt` and `#lastSegmentMonotonicAt` are the ANY-segment liveness clock (stamped on every segment, inits included) the recovery diagnostics report,
  // always stamped together: `#lastSegmentAt` is the clock's `now()`, the time of day the stall diagnostic publishes, recorded when the segment arrives, and
  // `#lastSegmentMonotonicAt` is its `monotonic()` reading, which the time since the last segment is measured from, so a change to the time of day never moves
  // that figure. `#lastMediaAt` is the dedicated MEDIA-keyed liveness clock the media-stall watchdog reads, a `monotonic()` reading: it advances only
  // when a decodable media segment is fanned, so a stream producing only non-media frames (an init the codec gate swallows, the negotiated timestamp frames) reads
  // stalled to the watchdog even while the any-segment stamps stay fresh. The any-segment and media stamps are deliberately separate, measuring two different
  // liveness notions - any byte vs. a picture. `#watchdogController` is the media watchdog's lifecycle handle: non-null only while the watchdog is armed (between the
  // first media of an install and the next reconnect / teardown), aborting it ends the poll loop. `#framesFanned` records that some install of the stream has fanned a
  // frame, which arms the frame discontinuity marker at every later install; nothing clears it, because once a stream's frames have begun, every later connection
  // leaves a gap in them.
  #establishedSettled = false;
  #framesFanned = false;
  #initSegmentCache: LivestreamInit | null = null;
  #lastError: ProtectError | null = null;
  #lastMediaAt = 0;
  #lastSegmentAt = 0;
  #lastSegmentMonotonicAt = 0;
  #state: LivestreamSubscriptionState = "connecting";
  #torndown = false;
  #watchdogController: AbortController | null = null;

  // The current recovery episode's bookkeeping: which regime, how many attempts have failed, when it began as the clock's monotonic reading, the lockstep
  // per-install state (see the SessionInstallState type - the codec-gate point, the media-keyed recovery point, the post-reconnect discontinuity marker and the
  // install's frame times, reset as a unit per install), whether the window being awaited is one an attempt's frames are keeping past the policy's own (stated
  // by every window as it begins, beside its resolver, and read only while a window is awaited, which is how the session's close tells it from the policy's
  // window), the route the episode's attempts dial, and the resolver of the window the loop is currently awaiting (the single point the rails and reassess()
  // settle). The route is set as each episode begins and moves only when a "preferDirect" episode falls back, so it is never carried into the next one.
  #attempts = 0;
  #episodeStartedAt = 0;
  #install: SessionInstallState = { awaitingFirstMedia: false, awaitingFirstSegment: false, firstFrameAt: null, lastFrameAt: null, pendingDiscontinuity: false,
    pendingFrameDiscontinuity: false };

  #keptByFrames = false;
  #phase: "establishing" | "recovering" = "establishing";
  #route: LivestreamDialRoute = "proxied";
  #settleOutcome: ((outcome: RecoveryOutcome) => void) | null = null;

  constructor(opts: { clock: Clock; createSession: (signal: AbortSignal, route: LivestreamDialRoute) => LivestreamSession; key: string; log: ProtectLogging;
    onTeardown: (key: string) => void; policy: RecoveryPolicy; resolved: ResolvedLivestreamSpec; }) {

    this.#clock = opts.clock;
    this.#createSession = opts.createSession;
    this.#key = opts.key;
    this.#log = opts.log;
    this.#onTeardown = opts.onTeardown;
    this.#policy = opts.policy;
    this.#resolved = opts.resolved;
    this.#lastSegmentAt = this.#clock.now();
    this.#lastSegmentMonotonicAt = this.#clock.monotonic();

    if(channels.livestreamSessionOpened.hasSubscribers) {

      const payload = { cameraId: this.#resolved.cameraId, channel: this.#resolved.channel, key: this.#key, lens: this.#resolved.lens };

      channels.livestreamSessionOpened.publish(payload satisfies LivestreamSessionOpenedPayload);
    }
  }

  /** The cached init segment of the shared stream, for the subscription's read-through getter and late-joiner replay. */
  get initSegment(): LivestreamInit | null {

    return this.#initSegmentCache;
  }

  /** The shared stream's coarse lifecycle state. */
  get state(): LivestreamSubscriptionState {

    return this.#state;
  }

  // Attach a new subscriber, recording its output and its urgency closure. A late segments joiner (the init is already cached) is replayed that cached init as its first
  // segment, and a frames joiner, which iterates no init, is replayed nothing; the very first subscriber kicks off the bounded establishment episode. Synchronous, so no
  // live segment can interleave ahead of the replay.
  attach(subscriber: Subscriber): void {

    const first = (this.#subscribers.size === 0);

    this.#subscribers.set(subscriber.subscription, subscriber);

    if((this.#initSegmentCache !== null) && (subscriber.output === "segments")) {

      subscriber.subscription.push({ ...this.#initSegmentCache, type: "init" });
    }

    if(first) {

      void this.#runEpisode("establishing");
    }

    // A tighter joiner mid-recovery re-decides the in-flight window now, instead of waiting out a backoff sized for the looser prior MIN. We carry the same recovering
    // gate `reassess()` uses: a joiner while live needs no poke (the media watchdog reads the new MIN on its next pass, so a tightened detection deadline takes effect
    // within one poll period), and a joiner during the establishing init->media gap must not settle the urgency-independent establishing window (the gate spares it).
    if((this.#settleOutcome !== null) && (this.#phase === "recovering")) {

      this.#settle("reassess");
    }
  }

  // Detach a subscriber. When the last one leaves, tear the stream down (which ends the recovery loop if one is running).
  detach(subscription: PooledSubscription): void {

    if(!this.#subscribers.delete(subscription)) {

      return;
    }

    if(this.#subscribers.size === 0) {

      this.#teardown("the last subscriber disposed");
    }
  }

  // Close the stream from the pool's own disposal path. The teardown closes the underlying session through the lifetime signal it was handed, and awaiting that
  // session's close here waits for the close to finish.
  async close(): Promise<void> {

    const session = this.#current;

    this.#teardown("the livestream pool was disposed");

    await (session?.close() ?? Promise.resolve());
  }

  // Ask the recovery policy to re-decide the in-flight episode now. A no-op on a healthy stream (no window is being awaited), so it never forces a reconnect of a working
  // connection - it only short-circuits a wait/backoff a consumer's changed urgency has made stale.
  //
  // It is gated to the recovering phase. A reassess re-asks the policy because the consumer's urgency changed, but establishment is urgency-INDEPENDENT - a fresh stream
  // mints at the camera's own first-segment latency, which no consumer can hurry - so re-deciding an establishing episode cannot change its window. The recovery point
  // keys on media, not the init, so an establishing episode stays in flight through the init->media gap; an ungated reassess in that gap would settle the live window
  // and the loop would re-consult and reinstall, tearing down a healthy session that has already inited and is about to produce media. Gating to recovering keeps the
  // urgency-driven re-decision exactly where urgency matters and leaves a connecting stream's progress untouched. (When the stream is live, no window is awaited, so
  // `#settle` no-ops regardless; the gate's sole effect is to spare the in-flight establishing session.)
  reassess(): void {

    if(this.#phase === "recovering") {

      this.#settle("reassess");
    }
  }

  // Resolve once the stream first produces a MEDIA segment (true) or ends without one, a give-up or a terminal ending it first (false).
  whenEstablished(): Promise<boolean> {

    return this.#established.promise;
  }

  // The recovery loop: a reducer over recovery events. Each pass asks the policy for a decision given the live context, applies it (reconnect builds a fresh session;
  // wait leaves the socket alone; giveUp is terminal), then awaits the decision's window. A MEDIA segment ends the window as `recovered` and the episode is over; the
  // window elapsing on a reconnect counts a failed attempt and re-consults; a "preferDirect" stream's direct attempt that failed at its dial, or was offered no direct
  // address, before its first media falls back and re-consults with no attempt counted; a torn-down stream ends the loop. The loop is bound to the managed session's
  // AbortController, so teardown (last subscriber, pool disposal, terminal) ends it cleanly.
  async #runEpisode(phase: "establishing" | "recovering"): Promise<void> {

    this.#phase = phase;
    this.#state = (phase === "establishing") ? "connecting" : "recovering";
    this.#episodeStartedAt = this.#clock.monotonic();
    this.#attempts = 0;

    // Every episode begins on the stream's own route, a "preferDirect" stream's on its direct one, so a fallback in one episode is never remembered in the next. A
    // route added without an arm here leaves `route` unassigned where the episode reads it, which fails to compile.
    let route: LivestreamDialRoute;

    switch(this.#resolved.route) {

      case "direct":
      case "preferDirect": {

        route = "direct";

        break;
      }

      case "proxied": {

        route = "proxied";

        break;
      }
    }

    this.#route = route;

    if((phase === "recovering") && channels.livestreamRecoveryStarted.hasSubscribers) {

      const payload = { attempts: 0, cameraId: this.#resolved.cameraId, key: this.#key,
        sinceLastSegmentMs: millisecondsSince(this.#lastSegmentMonotonicAt, { clock: this.#clock }) } satisfies LivestreamRecoveryStartedPayload;

      channels.livestreamRecoveryStarted.publish(payload);
    }

    const signal = this.#controller.signal;

    try {

      for(;;) {

        if(signal.aborted) {

          return;
        }

        const decision = this.#policy(this.#context());

        if(decision.kind === "giveUp") {

          this.#giveUp(this.#current?.closeCause ?? undefined);

          return;
        }

        const isReconnect = (decision.kind === "reconnect");

        // A reconnect tears down any in-flight socket and connects fresh; a wait leaves the socket untouched. Either way we then wait out the decision's window for a
        // media segment (which restores the stream) or the window's elapse. A reconnect's attempt still receiving frames when its window elapses is waited on for as
        // long as its frames keep it (see `#aliveMs`), each further wait read fresh as the last one elapses, so the attempt ends at its first media, once its frames
        // fall silent, when its session closes, or at the deadline from its first frame. Each such wait is marked as it begins, which is how the session's close
        // ends it at once where it leaves the policy's own window to elapse (see `#onSessionClosed`). A wait is never kept past its window.
        if(isReconnect) {

          this.#installSession();
        }

        // eslint-disable-next-line no-await-in-loop
        let outcome = await this.#raceOutcome(isReconnect ? decision.awaitMs : decision.forMs, signal);

        for(let aliveMs = isReconnect ? this.#aliveMs() : 0; (outcome === "elapsed") && (aliveMs > 0); aliveMs = this.#aliveMs()) {

          // eslint-disable-next-line no-await-in-loop
          outcome = await this.#raceOutcome(aliveMs, signal, { keptByFrames: true });
        }

        if((outcome === "recovered") || (outcome === "aborted")) {

          return;
        }

        // The episode's direct attempt failed at its dial, or was offered no direct address, before its first media: fall back to the proxied route and re-consult at
        // once, counting no attempt, since the direct route has already answered. A teardown can land after that settle and before this pass resumes, and a stream
        // that is over falls back to nothing, so the fallback runs only while the lifetime still stands and the loop's next pass ends it otherwise. TypeScript carries
        // the pass's opening read of the signal across the await above, so the compiler reads the signal as never aborted here, and the lint rule follows the compiler.
        if(outcome === "directFailed") {

          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          if(!signal.aborted) {

            this.#fallBack();
          }

          continue;
        }

        // A reconnect whose window elapsed without a recovering MEDIA segment, with no frames still keeping it, is a failed attempt; a wait that simply elapsed is
        // not (it was deliberate backoff/defer). A reassess on either re-consults immediately without counting an attempt. Because the recovery point keys on media,
        // an init-then-no-media session - the controller acked with an init then went silent - elapses its window exactly like a session that never connected, and
        // counts as a failed media-establishment attempt: a fresh socket is a legitimate recovery for a per-socket controller bug, bounded by the establishment
        // deadline (establishing) and by the injected policy's giveUp -> self-heal (recovering). We deliberately do NOT keep a silent session and wait. The residual
        // edge is a near-good session carrying no frames that inits at `awaitMs - e` and would have produced media at `awaitMs + e`: this tears it down to
        // reconnect. The default establishing windows are patient enough that a real first-media latency lands well inside the window, so this near-miss is
        // low-probability and acceptable; keeping the session and waiting indefinitely on a stalled init would never terminate, which the reconnect-on-elapse design
        // forecloses.
        if(isReconnect && (outcome === "elapsed")) {

          this.#attempts++;

          // A direct attempt whose window elapsed with no media is counted as any elapsed window is, and falls back too when it reached its dial, one still dialing a
          // port that drops packets among them. One whose negotiation failed or never answered dialed nothing, so the next attempt dials direct again.
          if(this.#canFallBack()) {

            this.#fallBack();
          }
        }
      }
    } catch(error) {

      // A consumer-supplied policy that throws must not leak an unhandled rejection or wedge the stream; treat it as a give-up whose cause is the policy's throw, and
      // tear down.
      this.#log.error("The UniFi Protect livestream recovery policy threw; tearing the stream down.", error);
      this.#giveUp(error);
    }
  }

  /* Whether the in-flight attempt may fall back to the proxied route, the one rule each fallback site reads. The attempt is a "preferDirect" stream's direct attempt:
   * the episode's route still reads "direct", which only the fallback moves, so an episode falls back at most once and no session of it after the fallback qualifies.
   * And the direct route itself answered it: its session reached its dial, or was offered no direct address. A negotiation that failed is shared by every route and
   * says nothing of the direct one, so its attempt stays on the direct route and is counted when its window elapses. A stream asking for Opus that is
   * offered no direct address never reaches this rule: its session's route error ends the stream as it arrives, ahead of the close, because the proxied route
   * names its stream by the same address.
   */
  #canFallBack(): boolean {

    const session = this.#current;

    return (this.#resolved.route === "preferDirect") && (this.#route === "direct") && (session !== null) &&
      (session.dialed || (session.closeCause instanceof ProtectLivestreamRouteError));
  }

  /* Fall back from the episode's direct attempt to the proxied route for the rest of the episode, publishing why and logging it at debug, since the published
   * reason is what a consumer acts on. The session is still the current one here, because the loop reaches this before it installs the next attempt, so its close
   * cause, whether its socket opened and the port it dialed are the failed attempt's own. A route error means the controller offered no direct address; otherwise
   * a socket that opened completed its WebSocket upgrade and sent no media before the attempt ended, and one that never opened never completed its upgrade. The
   * line carries the close cause too, left out when the session recorded none, as a direct attempt still dialing when its window elapsed has not.
   */
  #fallBack(): void {

    const session = this.#current;
    const error = session?.closeCause ?? null;
    const reason: LivestreamRouteFallbackReason = (error instanceof ProtectLivestreamRouteError) ? "noDirectAddress" :
      ((session?.opened === true) ? "noMedia" : "unreachable");

    this.#route = "proxied";

    if(channels.livestreamRouteFallback.hasSubscribers) {

      const payload = { cameraId: this.#resolved.cameraId, key: this.#key, port: session?.dialedPort ?? null, reason } satisfies LivestreamRouteFallbackPayload;

      channels.livestreamRouteFallback.publish(payload);
    }

    this.#log.debug("The UniFi Protect livestream's direct route failed before its first media; falling back to the proxied route.",
      { cameraId: this.#resolved.cameraId, ...((error !== null) && { error }), reason });
  }

  // The live recovery context the policy reads. Only library-observable fields; consumer-private state lives in the policy's own closure.
  #context(): RecoveryContext {

    return { attempts: this.#attempts, cameraId: this.#resolved.cameraId, elapsedMs: millisecondsSince(this.#episodeStartedAt, { clock: this.#clock }),
      phase: this.#phase, toleranceMs: this.#aggregateTolerance() };
  }

  // Aggregate delay tolerance across the stream's subscribers by the MINIMUM (the most-urgent governs). A subscriber that reported no urgency contributes nothing, so the
  // aggregate is Infinity when none reported - which the default policy reads as "patient." This feeds the recovery-await derivation (RecoveryContext.toleranceMs); it is
  // deliberately distinct from `#detectionThresholdMs`, whose undeclared default is the default media-stall window, not Infinity.
  #aggregateTolerance(): number {

    let tolerance = Infinity;

    for(const { urgency } of this.#subscribers.values()) {

      if(urgency !== undefined) {

        tolerance = Math.min(tolerance, urgency());
      }
    }

    return tolerance;
  }

  // The media-stall detection threshold - the consumer-declared policy the watchdog enforces, aggregated across subscribers by the MINIMUM (the most-urgent governs).
  // This is the detection sibling of `#aggregateTolerance`, with one deliberately different default: a subscriber that declares NO urgency contributes the default
  // media-stall window (every live stream is media-watched by default - the fail-safe analog of the byte heartbeat), whereas the recovery-await aggregate reads an
  // undeclared subscriber as Infinity (patient). A subscriber declaring a tighter value pulls the MIN down; one declaring Infinity opts itself out entirely, so a stream
  // where every subscriber opts out yields Infinity and the watchdog's per-pass `>= Infinity` comparison never fires (the byte backstop alone watches it). A finite MIN
  // is clamped UP to the floor so a maximally-urgent consumer cannot set a threshold so tight that ordinary inter-segment jitter trips it. We read the RAW aggregate
  // here, never the value `defaultLivestreamRecoveryPolicy` derives from it after subtracting the await margin - detection answers "notice a stall this fast," a
  // different question from the recovery-await's "how long to wait per attempt," so the detection default must never leak into recovery and vice versa.
  #detectionThresholdMs(): number {

    // Seed the MIN at its identity (Infinity), then fold in each subscriber's contribution: the default media-stall window when it declared no urgency, otherwise its
    // declared value. Seeding at the default instead would cap every stream at that window and make the Infinity opt-out unreachable (a lone Infinity subscriber would
    // MIN to the default seed) - the default is a per-subscriber contribution, not the aggregate's ceiling.
    let threshold = Infinity;

    for(const { urgency } of this.#subscribers.values()) {

      threshold = Math.min(threshold, urgency === undefined ? PROTECT_LIVESTREAM_STALL_DEFAULT_MS : urgency());
    }

    // An all-opted-out stream (every subscriber declared Infinity, or there are no subscribers) leaves the MIN at Infinity, which we pass through unclamped so the
    // watchdog never fires; a finite MIN is clamped up to the floor.
    return Number.isFinite(threshold) ? Math.max(threshold, PROTECT_LIVESTREAM_STALL_FLOOR_MS) : Infinity;
  }

  /* How much longer the current install's frames keep its attempt once the policy's window has elapsed with no media: 0 when the install has fanned no frame, when
   * its session has closed, when its latest frame is as old as the media-stall detection threshold, or when its first frame is as old as
   * PROTECT_LIVESTREAM_ESTABLISH_DEADLINE_MS, and otherwise the time left until the sooner of that silence and that deadline. Frames count here and nowhere else
   * because a UBV stream's writer can hold its first media while it waits for audio, a wait counted in the stream's own video, so an attempt whose frames arrive
   * with no media yet is a stream starting, not a failed one. The silence that ends it is the one the watchdog calls a live stream stalled by, and the deadline
   * bounds a stream whose frames never yield media. A closed session sends nothing more, so the frames it sent keep nothing, and its closure is read from the
   * session itself rather than recorded here. The clock and the threshold are read fresh on every call, so a subscriber that joins or leaves moves the answer, and
   * an infinite threshold leaves the session's close or the deadline to end it.
   */
  #aliveMs(): number {

    const { firstFrameAt, lastFrameAt } = this.#install;

    if((firstFrameAt === null) || (lastFrameAt === null) || (this.#current?.state === "closed")) {

      return 0;
    }

    const untilSilent = this.#detectionThresholdMs() - millisecondsSince(lastFrameAt, { clock: this.#clock });
    const untilDeadline = PROTECT_LIVESTREAM_ESTABLISH_DEADLINE_MS - millisecondsSince(firstFrameAt, { clock: this.#clock });

    return Math.max(Math.min(untilSilent, untilDeadline), 0);
  }

  // Tear down the in-flight session and build a fresh one for the next attempt. Disposing the old rails before closing the old session means its late frames and its own
  // close event never reach us - so the new attempt is clean and the old socket's death is silently absorbed rather than mistaken for a recovery event.
  #installSession(): void {

    // Disarm the media-stall watchdog before installing the replacement session: a reconnect is leaving the live domain for a recovery window, so the watchdog (valid
    // only while live) must not survive into it - and the recovery-loop window and the watchdog are never both live, strictly sequential at the first-media boundary. The
    // disarm is a no-op on repeat, so it is safe on a multi-attempt establishment that reinstalls before any media ever armed it.
    this.#disarmWatchdog();

    for(const rail of this.#currentRails) {

      rail[Symbol.dispose]();
    }

    this.#currentRails = [];

    const prior = this.#current;

    // Reset the lockstep per-install latches as one atomic unit, so the codec-gate point, the media-keyed recovery point, and the discontinuity marker can never
    // drift out of step. We re-arm `awaitingFirstSegment` (the next segment is this install's first) and `awaitingFirstMedia` (the next media settles this install
    // `recovered`) unconditionally, and arm the discontinuity marker only when this install replaces the session of an already-established stream (the recovering phase):
    // a reconnect's fresh session restarts the fMP4 timeline near zero, Protect's own fMP4 by renegotiating rebaseTimestampsToZero and UBV by a fresh writer counting
    // from its first keyframe, a backward jump from the delivered timeline the first fanned media must announce. We gate the marker on the phase, not on a non-null
    // prior - a multi-attempt INITIAL establishment also installs over a prior failed session object, yet no media has ever flowed and there is no timeline to
    // resynchronize, so a cold start must never arm. A defer/wait that resumes the existing session never installs at all. The frame marker arms on what the frames
    // themselves have done rather than on the phase: any install that follows a fanned frame leaves a gap in the frames, an establishing one included. Every
    // install starts with no frame times, so only an attempt's own frames keep it past its window.
    this.#install = { awaitingFirstMedia: true, awaitingFirstSegment: true, firstFrameAt: null, lastFrameAt: null, pendingDiscontinuity: (this.#phase === "recovering"),
      pendingFrameDiscontinuity: this.#framesFanned };

    // Each session is handed its managed stream's lifetime signal and the route the episode's attempts dial. When the stream is torn down, whatever the cause, that
    // signal closes the current session and cancels any URL negotiation still in flight, a replaced session's included. A recovery retry aborts nothing: it closes
    // the session it replaces, whose negotiation runs to its own outcome, so the request still reports what the controller did with it. The frame rail is bridged
    // whether or not a frames subscriber is attached, so one that joins later needs no rewiring; a session reading Protect's own fMP4 never emits on it.
    const session = this.#createSession(this.#controller.signal, this.#route);

    this.#current = session;
    this.#currentRails = [

      session.on("segment", (segment: Segment): void => this.#onSegment(segment)),
      session.on("frame", (frame: LivestreamSessionEvents["frame"][0]): void => this.#onFrame(frame)),
      session.on("error", (error: LivestreamSessionEvents["error"][0]): void => this.#onSessionError(error)),
      session.on("closed", (): void => this.#onSessionClosed())
    ];

    if(prior !== null) {

      void prior.close();
    }
  }

  // Await the outcome of one decision's window. A media segment restores the stream (settled `recovered` by the segment handler), the timer elapses (`elapsed`), a
  // consumer reassesses (`reassess`), or teardown aborts the controller (`aborted`). The single settle point is `#settleOutcome`; every settler routes through `#settle`,
  // so the first to fire wins and the rest are no-ops. The timer's own controller is aborted in the finally so a settled window cancels its pending wait. The
  // resolver is cleared by `#settle` alone, as the window ends, and never by the cleanup here: a session that closes in the same stack as the media that settled a
  // window begins the next episode at once, so that episode's window is already awaited when this one's cleanup runs, and a cleanup that cleared the resolver
  // would clear the newer window's and leave nothing that could end it. Each window states as it begins whether an attempt's frames are keeping it, beside its
  // resolver, so that mark always describes the window being awaited.
  async #raceOutcome(timeoutMs: number, signal: AbortSignal, { keptByFrames = false }: { keptByFrames?: boolean } = {}): Promise<RecoveryOutcome> {

    if(signal.aborted) {

      return "aborted";
    }

    const { promise, resolve } = Promise.withResolvers<RecoveryOutcome>();

    this.#keptByFrames = keptByFrames;
    this.#settleOutcome = resolve;

    const timerController = new AbortController();
    const onAbort = (): void => void this.#settle("aborted");

    signal.addEventListener("abort", onAbort, { once: true });
    // The window's timer. On elapse it settles `elapsed`; its rejection (when the finally cancels it) is the expected path and swallowed.
    void this.#clock.delay(timeoutMs, { signal: timerController.signal }).then(() => void this.#settle("elapsed"), () => undefined);

    try {

      return await promise;
    } finally {

      signal.removeEventListener("abort", onAbort);
      timerController.abort();
    }
  }

  // Settle the in-flight window, if one is being awaited. One-shot: the first settler claims the slot and the rest are no-ops. Returns whether this call won, so the
  // segment handler knows whether it actually claimed the recovery (and should run its side effects) or lost a race with the window's elapse.
  #settle(outcome: RecoveryOutcome): boolean {

    const resolve = this.#settleOutcome;

    if(resolve === null) {

      return false;
    }

    this.#settleOutcome = null;
    resolve(outcome);

    return true;
  }

  // Fan one decoded segment out to every subscriber. A freshly-installed session has TWO ordered settle points, not one: its first segment (normally the init) is the
  // codec-gate point, and its first MEDIA segment is the recovery point. We key liveness on media because a stream is alive when media is flowing, not when the
  // controller merely acked with an init - a controller that inits then produces no media must elapse its recovery window and reconnect, never be presumed live.
  // Everything after the first media is steady live flow, where a later init meets the same codec gate a reconnect's does.
  #onSegment(segment: Segment): void {

    this.#lastSegmentAt = this.#clock.now();
    this.#lastSegmentMonotonicAt = this.#clock.monotonic();

    // The codec-gate point: the install's first segment. This runs the codec gate and caches/delivers/suppresses the init, but does NOT settle the episode - liveness
    // waits for media. A defensive media-first install settles immediately through the same recovery-media helper (see `#handleFirstSegment`).
    if(this.#install.awaitingFirstSegment) {

      this.#install.awaitingFirstSegment = false;
      this.#handleFirstSegment(segment);

      return;
    }

    // The recovery point: the first MEDIA segment after the init. This is the sole steady-path settle - it ends the establishing / recovering episode `recovered`. We
    // gate on media so a post-init traffic lull (non-media frames, a later init the codec gate swallows) never settles the episode.
    if(this.#install.awaitingFirstMedia && (segment.type === "media")) {

      this.#handleRecoveryMedia(segment);

      return;
    }

    // A later init on a live session meets the codec gate: the same stream is swallowed, and any other ends the stream.
    if(segment.type === "init") {

      this.#handleInit(segment);

      return;
    }

    this.#fanOut(segment);
  }

  // The first segment of a freshly-installed session - normally the init - is the codec-gate point, NOT the recovery point. It is settle-free: the episode stays in
  // flight (its recovery window still bounds time-to-first-MEDIA) so that a controller that inits then never produces media elapses the window and reconnects rather than
  // being presumed live. An init meets the codec gate (see `#handleInit`); a changed stream is torn down there via the controller's abort (which settles the window
  // `aborted`, booking no spurious attempt). It does NOT need the settle-race guard the recovery-media path keeps: the init can only reach us on the current session's
  // still-attached rail, and an elapsed window would already have disposed that rail before the init could arrive.
  #handleFirstSegment(segment: Segment): void {

    // The very first init is delivered and a same-stream init suppressed, and either way `awaitingFirstMedia` stays armed, so the following media is what settles the
    // episode.
    if(segment.type === "init") {

      this.#handleInit(segment);

      return;
    }

    // Defensive: a fresh session whose first frame is media rather than an init (not observed in practice). It is media, so it settles the recovery point directly - the
    // SAME helper, so "first media settles recovered" has exactly one implementation whether media arrived as the literal first segment or after an init.
    this.#handleRecoveryMedia(segment);
  }

  // The codec gate, the one rule every init meets, the install's first and a later one on a live session alike. The stream's first init is cached and delivered. A
  // later init that is the same stream (see `isSameStream`) is swallowed: it is never fanned out and the cache keeps the first, because a consumer of one format
  // cannot take a second init (HKSV tolerates none; an FFmpeg pipe cannot re-init). Any other ends the stream, terminally, since no fixed-format consumer can follow it.
  #handleInit(segment: Extract<Segment, { type: "init" }>): void {

    const prior = this.#initSegmentCache;
    const next = initOf(segment);

    if(prior === null) {

      this.#initSegmentCache = next;
      this.#fanOut(segment);

      return;
    }

    if(!isSameStream(prior, next)) {

      this.#failCodecChange(prior, next);
    }
  }

  // The recovery point: the first MEDIA segment of a freshly-installed session settles the episode. This is the sole media-settle, reached from the steady path (init
  // then media) and from the defensive media-first first-segment branch. We claim the recovery window atomically first; if we lost the race (the window already elapsed
  // or the stream was torn down), we drop this now-stale media and the reinstall produces its own fresh first media. On a win we clear the media latch, run
  // `#onRecovered` (which ends the episode - establishment resolves the latch, live recovery publishes the downtime), stamp the media-keyed liveness clock and arm the
  // media-stall watchdog (this first media is the moment a picture is genuinely flowing), then fan the segment out. Fanning it out is also where the post-reconnect
  // discontinuity marker is stamped, so `recovered` and the discontinuity marker land on this one media segment - strictly cleaner than a split.
  #handleRecoveryMedia(segment: Segment): void {

    if(!this.#settle("recovered")) {

      return;
    }

    this.#install.awaitingFirstMedia = false;
    this.#onRecovered();
    this.#lastMediaAt = this.#clock.monotonic();
    this.#armWatchdog();
    this.#fanOut(segment);
  }

  // Arm the always-on (while live) media-stall watchdog, called at the first-media boundary once the stream is `live`. It is the MEDIA-silence analog of the session's
  // any-byte heartbeat watchdog (which stays its own transport-liveness backstop, untouched): the two are complementary layers, byte-silence vs. media-silence, and on a
  // real stall this one fires first - after which `#onSessionClosed`'s torndown / settle / state guards make the later session-watchdog close a no-op.
  //
  // We arm even when the current threshold is Infinity (an all-opted-out stream): the loop is then a zero-cost idle poll whose per-pass comparison never fires, but it
  // stays running so a subscriber that later joins or tightens (pulling the MIN finite) is caught on the next pass with no explicit re-arm - the same property that
  // lets a tighten DURING a stall be caught. The arm no-ops unless `#state` is already "live", which holds here because `#onRecovered` sets it just before the sole
  // caller invokes this method, so it never runs during establishing / recovering (no media has flowed). Abort-and-replace the controller so a stale loop from a
  // prior arm can never coexist with the new one, then run the loop on its signal.
  #armWatchdog(): void {

    if(this.#state !== "live") {

      return;
    }

    this.#watchdogController?.abort();
    this.#watchdogController = new AbortController();

    // Swallow the abort the same way `#raceOutcome` swallows its timer's: a disarm aborts the controller, the pending delay rejects with an AbortError that
    // propagates out of `#runWatchdog`, and the `.then` rejection handler absorbs that expected rejection so it never becomes unhandled.
    void this.#runWatchdog(this.#watchdogController.signal).then(() => undefined, () => undefined);
  }

  // Disarm the media-stall watchdog. Aborts the poll loop (its AbortError is absorbed where `#armWatchdog` starts it) and clears the handle. A no-op on repeat,
  // and when the watchdog was never armed (a stream torn down or reconnected before any media flowed), so both `#installSession` and `#teardown` can call it
  // unconditionally.
  #disarmWatchdog(): void {

    if(this.#watchdogController !== null) {

      this.#watchdogController.abort();
      this.#watchdogController = null;
    }
  }

  // The media-stall watchdog loop - a poll loop mirroring the session's heartbeat watchdog shape, waiting one poll period per pass, but keyed on `#lastMediaAt` (media
  // flow) rather than `#lastSegmentAt` (any byte). Each pass re-reads the detection threshold LIVE, so a tightened or loosened consumer policy takes effect within one
  // poll period with no explicit re-arm - and a tighten that lands during an active media silence (no segment arriving to re-stamp the clock) is still caught, the blind
  // spot a per-segment one-shot would have. On a pass where the media silence has reached the threshold the watchdog FIRES: it re-checks the same `#torndown` /
  // `#settleOutcome` guard `#onSessionClosed` uses so it no-ops if a recovery is already in flight or the stream is torn down, then closes the current session into the
  // EXISTING recovery path (the session's `closed` rail drives `#onSessionClosed` -> a recovering episode) - never a parallel recovery entry. The loop ENDS after firing
  // (at most one fire per arm), so a second pass in the micro-gap before `#onSessionClosed` parks the recovery window cannot re-fire. The loop also ends when a disarm
  // aborts the controller, which rejects the pending delay - the rejection `#armWatchdog` absorbs.
  async #runWatchdog(signal: AbortSignal): Promise<void> {

    for(;;) {

      // eslint-disable-next-line no-await-in-loop
      await this.#clock.delay(PROTECT_LIVESTREAM_STALL_POLL_MS, { signal });

      if(this.#torndown || (this.#settleOutcome !== null)) {

        return;
      }

      const silentForMs = millisecondsSince(this.#lastMediaAt, { clock: this.#clock });

      if(silentForMs >= this.#detectionThresholdMs()) {

        this.#log.debug("Livestream media went silent beyond the detection threshold; recovering the stalled session.", { key: this.#key, silentForMs });
        void this.#current?.close();

        return;
      }
    }
  }

  // The stream produced its first MEDIA segment of the install: the episode is over. Establishment resolves the latch true; live recovery publishes the recovered
  // diagnostic with the downtime - how long media was absent, since the episode settles on media. Either way the stream returns to `live` and the attempt counter
  // resets. `wasEstablishing` keys off `#state` (still `"connecting"` for an establishing episode, `"recovering"` otherwise) - this is reached only on media, never on
  // the init, and nothing between the episode start and here mutates `#state`, so it still tells an establishing episode from a recovering one.
  #onRecovered(): void {

    const wasEstablishing = (this.#state === "connecting");

    this.#state = "live";
    this.#attempts = 0;

    if(wasEstablishing) {

      this.#settleEstablished(true);

      return;
    }

    if(channels.livestreamRecoveryRecovered.hasSubscribers) {

      const payload = { cameraId: this.#resolved.cameraId, downtimeMs: millisecondsSince(this.#episodeStartedAt, { clock: this.#clock }), key: this.#key } satisfies
        LivestreamRecoveryRecoveredPayload;

      channels.livestreamRecoveryRecovered.publish(payload);
    }
  }

  // An init delivered a different stream than the one in flight, on a reconnect or on a live session: its codec label, its description (a sample rate, channel count
  // or dimensions that moved under the same label) or a track's sample description (a parameter set that changed under both) differs. No fixed-format consumer can
  // adapt mid-stream, so this is terminal: publish the codec diagnostic and tear the stream down with a ProtectCodecChangeError every subscriber throws, the
  // diagnostic and the error each carrying the cached init and the one that differs from it.
  #failCodecChange(from: LivestreamInit, to: LivestreamInit): void {

    if(channels.livestreamCodecChanged.hasSubscribers) {

      channels.livestreamCodecChanged.publish({ cameraId: this.#resolved.cameraId, from, key: this.#key, to } satisfies LivestreamCodecChangedPayload);
    }

    this.#lastError = new ProtectCodecChangeError("The UniFi Protect livestream changed its codec or format.", { from, to });
    this.#teardown("the livestream codec changed");
  }

  /* The recovery policy gave up. Publish the exhausted diagnostic (the signal an opt-in consumer self-heal observer watches), then tear the stream down with a
   * ProtectLivestreamUnavailableError carrying the regime and the attempt count. An establishing give-up also resolves the establishment latch false.
   *
   * The error's cause is what ended the last attempt: the last session's `closeCause`, the first typed cause its teardown recorded - a certificate refusal, a refused
   * dial, a stall - so a consumer reads why the stream could not be established without the pool keeping a record of its own. A session that closed plainly, or one
   * still open when the policy gave up, recorded none, and the give-up carries none. A policy that threw passes its throw instead.
   */
  #giveUp(cause: unknown): void {

    const attempts = this.#attempts;
    const phase = this.#phase;

    if(channels.livestreamRecoveryExhausted.hasSubscribers) {

      channels.livestreamRecoveryExhausted.publish({ attempts, cameraId: this.#resolved.cameraId, key: this.#key } satisfies LivestreamRecoveryExhaustedPayload);
    }

    const message = (phase === "establishing") ? "The UniFi Protect livestream could not be established within the deadline." :
      "The UniFi Protect livestream could not be recovered.";

    this.#lastError = new ProtectLivestreamUnavailableError(message, { attempts, cause, phase });

    if(phase === "establishing") {

      this.#settleEstablished(false);
    }

    this.#teardown("the livestream recovery policy gave up");
  }

  /* The in-flight session surfaced a typed error. A stall publishes the stall diagnostic. An error the controller answers the same way on every attempt ends the
   * stream with that error, which every subscriber throws, the way a codec change ends one: no retry changes the answer, and a give-up would spend the
   * establishment deadline on a request that cannot succeed and publish the exhausted diagnostic a consumer's self-heal observer acts on. Every other session error
   * is absorbed by recovery and never reaches subscribers. The session's `closed` follows, which the loop reads as the window producing no segment, or as a direct
   * attempt's failed dial.
   */
  #onSessionError(error: ProtectError): void {

    if((error instanceof ProtectStallError) && channels.livestreamStallDetected.hasSubscribers) {

      const payload = { cameraId: this.#resolved.cameraId, key: this.#key, lastSegmentAt: this.#lastSegmentAt, silentForMs: error.silentForMs } satisfies
        LivestreamStallDetectedPayload;

      channels.livestreamStallDetected.publish(payload);
    }

    const terminal = this.#terminalReason(error);

    if(terminal !== null) {

      this.#lastError = error;
      this.#teardown(terminal);
    }
  }

  /* The teardown reason of a session error that ends the stream, or null for one recovery absorbs. A negotiation that offered no direct address ends a "direct"
   * stream, which dials it, and one asking for Opus over UBV, whose proxied route names its stream by it; the stream's resolved spec decides, never the attempt's
   * route, so a "preferDirect" stream asking for Opus ends on its direct attempt rather than falling back to a route that needs the same address. The same error on
   * any other "preferDirect" stream's direct attempt is the fallback's, and is absorbed. A UBV stream carrying another audio codec ends, as does a session whose
   * socket cannot send the play command an Opus stream needs.
   */
  #terminalReason(error: ProtectError): string | null {

    if(error instanceof ProtectLivestreamAudioError) {

      return "the controller streamed another audio codec";
    }

    if(error instanceof ProtectConfigurationError) {

      return "the livestream socket cannot send";
    }

    if((error instanceof ProtectLivestreamRouteError) && ((this.#resolved.route === "direct") || (this.#resolved.audio === "opus"))) {

      return "the controller offered no direct livestream address";
    }

    return null;
  }

  /* The in-flight session closed. A teardown is read first and ends it: #teardown aborts the lifetime before it disposes the rails, so a last subscriber leaving, a
   * pool disposal and a caller abort each deliver the current session's close while a window is still awaited, and none of them is a failed dial. A "preferDirect"
   * stream's direct attempt that failed at its dial, or was offered no direct address, before its first media settles its window `directFailed`, which the loop reads
   * as a fallback with no attempt counted. Any other death during a recovery episode (a window is being awaited) is absorbed - the window simply times out as
   * `elapsed`, keeping failure uniform - a direct attempt whose negotiation failed included, and one after the episode fell back, inside a policy's wait as much as
   * an attempt's window, except inside a wait an attempt's frames are keeping past its window: that wait stands only on frames still arriving, and a closed
   * session sends none, so it settles `elapsed` at once and the loop counts the attempt as it counts any other that ended without media. An attempt whose session
   * closed inside its window is never kept past it (see `#aliveMs`). While the stream is `live` (no episode running), a close is a fault, so we begin a recovery
   * episode. A close between episodes with no live stream is ignored.
   */
  #onSessionClosed(): void {

    if(this.#torndown) {

      return;
    }

    if(this.#canFallBack() && this.#install.awaitingFirstMedia) {

      this.#settle("directFailed");

      return;
    }

    if(this.#settleOutcome !== null) {

      if(this.#keptByFrames) {

        this.#settle("elapsed");
      }

      return;
    }

    if(this.#state === "live") {

      void this.#runEpisode("recovering");
    }
  }

  // Fan one segment out to every segments subscriber's own unbounded queue. It runs whether or not one is attached, because the segments are what the stream is
  // judged by: a frames-only stream is established, watched and gated by them all the same.
  #fanOut(segment: Segment): void {

    // Stamp the media-keyed liveness clock on every media segment fanned (the first via `#handleRecoveryMedia`, and every steady-state media here), and only on media -
    // an init never refreshes it. This is the single clock the media-stall watchdog reads, so keying it on the media branch is what makes a stream that produces only
    // non-media frames read stalled even while its any-byte heartbeat stays fresh.
    if(segment.type === "media") {

      this.#lastMediaAt = this.#clock.monotonic();
    }

    // The first media segment after a reconnect carries the discontinuity marker, exactly once. The post-reconnect session restarted its timeline, so a consumer that
    // maintains a decode timeline must resynchronize at this splice point. We stamp a copy (never mutating the emitted segment) and clear the latch so only this segment
    // is marked. An init is never marked (the only init fanned is the stream's first; the codec gate swallows a later one of the same stream and ends the stream on
    // any other), so gating on the media arm is correct by shape.
    let outgoing = segment;

    if(this.#install.pendingDiscontinuity && (segment.type === "media")) {

      this.#install.pendingDiscontinuity = false;
      outgoing = { ...segment, discontinuity: true };
    }

    for(const subscriber of this.#subscribers.values()) {

      if(subscriber.output === "segments") {

        subscriber.subscription.push(outgoing);
      }
    }
  }

  /* Fan one frame of a UBV stream out to every frames subscriber's own unbounded queue, the same object to each, and to no segments subscriber. A frame establishes
   * nothing, marks nothing live and arms no watchdog: liveness, establishment, the media watchdog and the codec gate stay keyed on the segments the stream's writer
   * always writes, so frames of a reconnect can reach a frames subscriber before that connection's init meets the gate. Each frame stamps the install's frame times
   * before its fan-out, whether or not a frames subscriber is attached, and those times are read only to judge an attempt still waiting for its first media (see
   * `#aliveMs`). The first frame of an install that follows a fanned frame is marked as a discontinuity on a copy, never on the emitted frame, and the latch clears
   * so only that frame is marked.
   */
  #onFrame(frame: MediaFrame): void {

    const now = this.#clock.monotonic();

    this.#install.firstFrameAt ??= now;
    this.#install.lastFrameAt = now;

    let outgoing: LivestreamFrame = frame;

    if(this.#install.pendingFrameDiscontinuity) {

      this.#install.pendingFrameDiscontinuity = false;
      outgoing = { ...frame, discontinuity: true };
    }

    this.#framesFanned = true;

    for(const subscriber of this.#subscribers.values()) {

      if(subscriber.output === "frames") {

        subscriber.subscription.push(outgoing);
      }
    }
  }

  // Resolve the establishment latch exactly once.
  #settleEstablished(value: boolean): void {

    if(this.#establishedSettled) {

      return;
    }

    this.#establishedSettled = true;
    this.#established.resolve(value);
  }

  // The single guarded teardown, whether triggered by the last subscriber leaving, the pool disposing, a codec change, a session error no retry changes, or a
  // give-up. It first aborts the lifetime controller, which ends the recovery loop and closes the underlying session through the signal it was handed, cancelling
  // any URL negotiation still in flight. It then disposes the in-flight rails (so no further segment arrives), removes the key from the pool map synchronously (so a new
  // subscriber starts fresh rather than attaching to a closing session), resolves the establishment latch (false, if it never resolved), terminates the subscribers
  // (failing them with the terminal error if there is one, else closing them cleanly), and publishes the close diagnostic.
  #teardown(reason: string): void {

    if(this.#torndown) {

      return;
    }

    this.#torndown = true;
    this.#state = "closed";

    // Aborting the lifetime controller ends the recovery loop and closes the current session through the signal it was handed. The session's own close event still
    // reaches `#onSessionClosed`, which ignores it because the teardown flag is already set.
    this.#controller.abort();
    // Disarm the media-stall watchdog so a watchdog pass already due before teardown cannot fire on a dead session - aborting its controller ends the loop, and the
    // loop's own `#torndown` guard makes a pass that slipped through a no-op as well.
    this.#disarmWatchdog();

    for(const rail of this.#currentRails) {

      rail[Symbol.dispose]();
    }

    this.#currentRails = [];
    this.#onTeardown(this.#key);
    this.#settleEstablished(false);

    for(const subscription of this.#subscribers.keys()) {

      if(this.#lastError !== null) {

        subscription.fail(this.#lastError);
      } else {

        subscription.close();
      }
    }

    this.#log.debug("Livestream session torn down.", { key: this.#key, reason });

    if(channels.livestreamSessionClosed.hasSubscribers) {

      channels.livestreamSessionClosed.publish({ cameraId: this.#resolved.cameraId, key: this.#key, reason } satisfies LivestreamSessionClosedPayload);
    }
  }
}

/**
 * The ref-counted, multi-subscriber, resilient-by-default livestream pool. Construct it at the composition root with a transport-backed {@link livestreamUrlResolver}
 * and an optional {@link RecoveryPolicy}; consumers reach it through `camera.livestream(...)`.
 *
 * @category Client
 */
export class LivestreamPool implements AsyncDisposable {

  readonly #clock: Clock;
  readonly #getAuthHeaders: (() => Record<string, string>) | undefined;
  readonly #log: ProtectLogging;
  readonly #recoveryPolicy: RecoveryPolicy;
  readonly #resolveUrl: (params: URLSearchParams, opts: { signal?: AbortSignal }) => Promise<LivestreamAddresses>;
  readonly #sessions = new Map<string, ManagedSession>();
  // Carried as the caller stated it rather than resolved to a default here: the pool passes the posture through to each session it mints, and the permissive default
  // lives at the one place that builds an agent.
  readonly #verifyTls: boolean | undefined;
  readonly #webSocketFactory: ((url: string) => ProtectWebSocket) | undefined;

  constructor(options: LivestreamPoolOptions) {

    this.#clock = options.clock ?? wallClock;
    this.#getAuthHeaders = options.getAuthHeaders;
    this.#log = options.log ?? noopLog;
    this.#recoveryPolicy = options.recoveryPolicy ?? defaultLivestreamRecoveryPolicy;
    this.#resolveUrl = options.resolveUrl;
    this.#verifyTls = options.verifyTls;
    this.#webSocketFactory = options.webSocket;
  }

  /**
   * Subscribe to a camera livestream's frames. Returns immediately with a {@link LivestreamSubscription} of {@link LivestreamFrame}s, which begin flowing once the
   * underlying session connects, with no init replayed to a late joiner. A frames subscription reads UBV whatever its spec names, so it shares one underlying
   * WebSocket with every subscriber asking for the same stream on the same route from UBV with the same audio, segments subscribers among them, and it meets the
   * same recovery and the same terminals as they do.
   *
   * @param spec - The stream to subscribe to.
   * @param opts - Per-subscription {@link LivestreamSubscribeOptions}, with `output: "frames"`.
   *
   * @returns The subscription: live, or already disposed when its signal had already aborted.
   */
  subscribe(spec: LivestreamSpec, opts: LivestreamSubscribeOptions & { output: "frames" }): LivestreamSubscription<LivestreamFrame>;

  /**
   * Subscribe to a camera livestream. Returns immediately with a {@link LivestreamSubscription}; segments begin flowing once the underlying session connects (or
   * immediately, replayed from the cached init, for a shared session already live). Subscribers asking for the same stream on the same route, from the same
   * upstream with the same audio, share one underlying WebSocket, and the shared session recovers under the pool's policy, failing its subscribers only on a
   * terminal: a codec change, a missing direct address, another audio codec, a socket that cannot send, or the policy giving up.
   *
   * @param spec - The stream to subscribe to.
   * @param opts - Per-subscription {@link LivestreamSubscribeOptions}: an optional abort signal that disposes this subscription (and only this one), an
   *               optional `urgency` closure feeding the resilient recovery, and `discardOnDispose` dropping the undelivered queue on this consumer's own disposal,
   *               with `output: "segments"`, the default.
   *
   * @returns The subscription: live, or already disposed when its signal had already aborted.
   */
  subscribe(spec: LivestreamSpec, opts?: LivestreamSubscribeOptions & { output?: "segments" }): LivestreamSubscription;

  subscribe(spec: LivestreamSpec, opts: LivestreamSubscribeOptions & { output?: LivestreamOutput } = {}): PooledSubscription {

    // The output is resolved first, so one outside the union is refused before anything is resolved, joined or built. A frames subscription reads UBV, the one
    // upstream that carries frames, so its spec names it before the key is read and the stream it shares is one every subscriber resolving to UBV with the same
    // audio shares too. An upstream the spec names already is left for the resolution to judge.
    const output = resolveOutput(opts.output);
    const stream: LivestreamSpec = (output === "frames") ? { ...spec, upstream: spec.upstream ?? "ubv" } : spec;
    const resolved = resolveLivestreamSpec(stream);
    const key = livestreamKey(resolved);
    const discardOnDispose = opts.discardOnDispose ?? false;

    // A signal that has already aborted asks for a subscription that is over before it begins, so it joins no shared stream: no managed session is created,
    // replayed from or re-decided on its behalf. The caller still receives a handle - already disposed, the answer the sibling sessions give an aborted signal at
    // construction - and the created and disposed diagnostics publish in that order, the lifecycle an observer pairing them by id sees for every subscription.
    if(opts.signal?.aborted === true) {

      const closed = subscriberOf(output, { clock: this.#clock, discardOnDispose, host: detachedHost,
        onDispose: (disposed): void => this.#publishDisposed(key, disposed) }).subscription;

      this.#publishCreated(key, closed);

      void closed[Symbol.asyncDispose]();

      return closed;
    }

    let managed = this.#sessions.get(key);

    // First subscriber for this stream identity: create the one managed session (which owns session creation, negotiation, and recovery) and register it synchronously,
    // so any concurrent early subscriber finds it here rather than opening a second socket. Each session it creates dials the one route the managed session picked
    // for that attempt, which replaces the spec's own.
    if(managed === undefined) {

      const createSession = (signal: AbortSignal, route: LivestreamDialRoute): LivestreamSession => new LivestreamSession({

        clock: this.#clock,
        ...((this.#getAuthHeaders !== undefined) && { getAuthHeaders: this.#getAuthHeaders }),
        log: this.#log,
        resolveUrl: this.#resolveUrl,
        signal,
        spec: { ...stream, route },
        ...((this.#verifyTls !== undefined) && { verifyTls: this.#verifyTls }),
        ...((this.#webSocketFactory !== undefined) && { webSocket: this.#webSocketFactory })
      });

      managed = new ManagedSession({ clock: this.#clock, createSession, key, log: this.#log, onTeardown: (k: string): void => void this.#sessions.delete(k),
        policy: this.#recoveryPolicy, resolved });
      this.#sessions.set(key, managed);
    }

    const session = managed;
    const subscriber = subscriberOf(output, { clock: this.#clock, discardOnDispose, host: session,
      onDispose: (disposed): void => this.#onSubscriptionDisposed(key, session, disposed), ...((opts.signal !== undefined) && { signal: opts.signal }) }, opts.urgency);

    session.attach(subscriber);
    this.#publishCreated(key, subscriber.subscription);

    return subscriber.subscription;
  }

  /**
   * Dispose the pool: close every managed session and clear the map. Called by the client's own disposal.
   */
  async [Symbol.asyncDispose](): Promise<void> {

    // Snapshot the sessions first so the map can be cleared at once, making the pool look empty to any concurrent subscribe, while each captured session is still
    // closed.
    const managed = [...this.#sessions.values()];

    this.#sessions.clear();

    await Promise.all(managed.map((session) => session.close()));
  }

  // A subscription was disposed. Detach it from its session (decrementing the reference count, which tears the session down if it was the last) and publish the disposed
  // diagnostic with its final stats.
  #onSubscriptionDisposed(key: string, session: ManagedSession, subscription: PooledSubscription): void {

    session.detach(subscription);
    this.#publishDisposed(key, subscription);
  }

  // Publish the subscription-created diagnostic, which carries the new subscription's id.
  #publishCreated(key: string, subscription: PooledSubscription): void {

    if(channels.livestreamSubscriptionCreated.hasSubscribers) {

      channels.livestreamSubscriptionCreated.publish({ key, subscriptionId: subscription.id } satisfies LivestreamSubscriptionCreatedPayload);
    }
  }

  // Publish the subscription-disposed diagnostic, which carries the subscription's final stats.
  #publishDisposed(key: string, subscription: PooledSubscription): void {

    if(channels.livestreamSubscriptionDisposed.hasSubscribers) {

      const payload = { key, stats: subscription.stats, subscriptionId: subscription.id } satisfies LivestreamSubscriptionDisposedPayload;

      channels.livestreamSubscriptionDisposed.publish(payload);
    }
  }
}
