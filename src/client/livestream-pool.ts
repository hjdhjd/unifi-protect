/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * livestream-pool.ts: The ref-counted, multi-subscriber livestream pool - one underlying WebSocket per stream identity, fanned out to many independent subscriptions,
 * resilient by default: recovery is owned by the pool's ManagedSession and governed by an injected policy and per-subscription urgency.
 */

/**
 * `LivestreamPool` is the library-owned fan-out *and recovery* layer over {@link LivestreamSession}. Two consumers that ask for the same stream share one underlying
 * WebSocket; each receives every segment through its own unbounded queue, so a slow consumer never backs up a fast one. Reference counting tears the underlying session
 * down when the last subscriber disposes, and the cached init segment is replayed automatically to any late joiner.
 *
 * **Resilient by default; recovery lives where sharing lives.** A subscription's iterator survives stalls and reconnects - it pauses during the gap and resumes when
 * segments flow again. Because there is exactly one underlying socket per stream, the recover-or-give-up decision is inherently per-shared-stream, so it lives in the one
 * object that holds both the session and the subscriber set: the {@link ManagedSession}. When the underlying {@link LivestreamSession} dies (stall / error / close), the
 * managed session does not fail its subscribers; it runs a recovery loop - a reducer over recovery events, `{ decision = policy(ctx); apply }` - that consults the
 * injected {@link RecoveryPolicy} and, per its decision, reconnects (a fresh session and a fresh negotiation, which often clears a wedged endpoint), waits, or gives up.
 * "Raw, non-resilient" is therefore not a pool mode - it is the bare {@link LivestreamSession} used directly, or a `recoveryPolicy` returning `giveUp` on first failure.
 *
 * **A consumer requests a spec, never a URL.** The controller mints a fresh, one-time URL per negotiation, so the pool dedups on the *spec* (its full stream-affecting
 * identity, via {@link livestreamKey}) *before* negotiating - only the first subscriber for a key creates a managed session, which then creates and negotiates each
 * underlying session. `subscribe` registers the managed session in the map synchronously, so a concurrent early subscriber attaches to the one in-flight session.
 *
 * **The pool owns no transport.** It receives `resolveUrl` - the transport-backed negotiation seam (see {@link wsEndpointResolver}) - so it stays unit-testable with a
 * one-line fake resolver and a fake WebSocket, and the negotiation lives end-to-end inside each session (one connect attempt, one error path).
 *
 * @module LivestreamPool
 */
import type { LivestreamCodecChangedPayload, LivestreamRecoveryExhaustedPayload, LivestreamRecoveryRecoveredPayload, LivestreamRecoveryStartedPayload,
  LivestreamSessionClosedPayload, LivestreamSessionOpenedPayload, LivestreamStallDetectedPayload, LivestreamSubscriptionCreatedPayload,
  LivestreamSubscriptionDisposedPayload } from "../diagnostics.ts";
import { LivestreamSession, livestreamKey, resolveLivestreamSpec } from "../transport/livestream-session.ts";
import type { LivestreamSessionEvents, LivestreamSpec, ResolvedLivestreamSpec, Segment } from "../transport/livestream-session.ts";
import { PROTECT_LIVESTREAM_AWAIT_MARGIN_MS, PROTECT_LIVESTREAM_AWAIT_MAX_MS, PROTECT_LIVESTREAM_AWAIT_MIN_MS, PROTECT_LIVESTREAM_DEFAULT_TOLERANCE_MS,
  PROTECT_LIVESTREAM_ESTABLISH_BACKOFF_MS, PROTECT_LIVESTREAM_ESTABLISH_DEADLINE_MS, PROTECT_LIVESTREAM_RECOVERY_BACKOFF_MS, PROTECT_LIVESTREAM_STALL_DEFAULT_MS,
  PROTECT_LIVESTREAM_STALL_FLOOR_MS, PROTECT_LIVESTREAM_STALL_POLL_MS } from "../settings.ts";
import { ProtectCodecChangeError, ProtectLivestreamUnavailableError, ProtectStallError } from "../errors.ts";
import type { Clock } from "../clock.ts";
import type { ProtectError } from "../errors.ts";
import type { ProtectLogging } from "../logging.ts";
import type { ProtectWebSocket } from "../transport/ws.ts";
import { channels } from "../diagnostics.ts";
import { noopLog } from "../logging.ts";
import { randomUUID } from "node:crypto";
import { wallClock } from "../clock.ts";

/**
 * The coarse, stable lifecycle of a pooled stream as a subscriber observes it. `connecting` is bounded establishment (no segment has ever flowed); `live` is a healthy
 * stream; `recovering` is an in-flight recovery episode (a recoverable stall shows here *without* ending iteration); `closed` is terminal (disposed, codec change, or the
 * policy gave up).
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

  /** Consecutive failed reconnect attempts this episode; resets to 0 once a media segment flows again. */
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
 *   `awaitMs` doubles as the inter-attempt spacing (a fast-failing attempt still occupies its full window), so the single policy governs both disposition and timing.
 * - `wait` does nothing for `forMs`, then re-consults - unifying defer-soak (a still-connecting session's late segment cancels it early) and inter-attempt backoff.
 * - `giveUp` is terminal: the give-up error is thrown into every subscriber and the stream is torn down.
 *
 * @category Client
 */
export type RecoveryDecision =
  | { awaitMs: number; kind: "reconnect" } |
  { forMs: number; kind: "wait" } |
  { kind: "giveUp" };

/**
 * The single decision authority for a stream's recovery, injected at the pool (the same dependency-inversion seam as `resolveUrl`). Pure: given the library-observable
 * {@link RecoveryContext}, it returns a {@link RecoveryDecision}. The library ships {@link defaultLivestreamRecoveryPolicy}, a health-agnostic default; a consumer
 * injects its own to add the controller-health correlation only it can observe.
 *
 * @category Client
 */
export type RecoveryPolicy = (context: RecoveryContext) => RecoveryDecision;

/**
 * The library's default, health-agnostic recovery policy. It is **phase-split**, because the two regimes have different timing authorities:
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
 * controllers' latency (e.g. HBUP) injects a tighter policy; a consumer composing one may delegate here for the timing and override only the disposition, or replace it.
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
 * the only backpressure mechanism, since the queue itself is unbounded.
 *
 * @category Client
 */
export interface LivestreamSubscriptionStats {

  /** Segments handed to the iterator over this subscription's life. */
  delivered: number;

  /** Segments dropped undelivered when this subscription was disposed under `discardOnDispose`; `0` for a default drain-on-dispose subscription. */
  discarded: number;

  /** The `clock.now()` timestamp of the most recent segment enqueued for this subscriber. */
  lastSegmentAt: number;

  /** The historical high-water mark of `queueDepth`. Monotonic: it records the peak backlog this subscriber ever accrued, which a later discard does not lower. */
  peakQueueDepth: number;

  /** Segments queued but not yet delivered right now - the live backlog. Reads `0` immediately after a `discardOnDispose` disposal clears the queue. */
  queueDepth: number;
}

/**
 * Per-subscription options for `LivestreamPool.subscribe` (reached through the {@link Camera.livestream} consumer entry point). All optional: a bare `subscribe(spec)`
 * is a resilient, drain-on-dispose subscription with no abort wiring and no reported urgency.
 *
 * @category Client
 */
export interface LivestreamSubscribeOptions {

  /**
   * Discard any still-queued, undelivered segments the instant this subscription is disposed, so a consumer mid-iteration receives the terminal rather than draining
   * stale bytes first. Off by default: a disposed subscription normally drains its queue before ending. Scoped to the consumer's own disposal alone; a pool-forced
   * terminal (codec change, give-up, last-subscriber detach, pool disposal) still drains the queue before the terminal surfaces, exactly as it does without this option.
   */
  discardOnDispose?: boolean;

  /** An abort signal that disposes this subscription (and only this one - a shared session lives as long as any subscriber remains). */
  signal?: AbortSignal;

  /**
   * How many milliseconds this consumer can tolerate receiving no segment, pulled fresh at each decision and aggregated across a shared stream by the minimum. It serves
   * consumer-owned policies at once. First, the resilient recovery's await budget self-tunes from the consumer's real buffer headroom: a live view reports ~0
   * (recover aggressively), a paced recording its cushion, a passive buffer a large value (wait patiently). Second, it is the consumer's MEDIA-stall detection deadline
   * for the pool's always-on (while live) media watchdog: declaring nothing leaves the default 10 s window (every stream is media-watched by default), a tighter value
   * tightens detection (clamped up to a small floor against jitter), and Infinity opts out of media-stall detection entirely (the session's any-byte heartbeat still
   * watches the socket). Omit it to leave the stream maximally patient on recovery and media-watched at the 10 s default.
   */
  urgency?: () => number;
}

/**
 * Construction options for {@link LivestreamPool}. `resolveUrl` is the transport-backed negotiation seam (build it with {@link livestreamUrlResolver}, the shared {@link
 * wsEndpointResolver}'s livestream specialization); `webSocket` is the injected I/O seam, shared with {@link EventStream}'s and threaded down to each session;
 * `recoveryPolicy` is the per-stream recovery decision authority, defaulting to {@link defaultLivestreamRecoveryPolicy}.
 *
 * @category Client
 */
export interface LivestreamPoolOptions {

  clock?: Clock;
  log?: ProtectLogging;
  recoveryPolicy?: RecoveryPolicy;
  resolveUrl: (params: URLSearchParams, opts: { signal?: AbortSignal }) => Promise<string>;
  webSocket?: (url: string) => ProtectWebSocket;
}

// The recovery-relevant surface a LivestreamSubscription reads from the ManagedSession that owns its stream. Keeping it a narrow interface (rather than a back-reference
// to the whole ManagedSession) means the subscription depends on exactly the affordances it exposes - state, the cached init, the establishment latch, and the
// in-flight re-decision - and nothing more.
interface SubscriptionHost {

  get initSegment(): { codec: string; data: Buffer } | null;
  get state(): LivestreamSubscriptionState;
  reassess(): void;
  whenEstablished(): Promise<boolean>;
}

/**
 * A consumer's handle into a pooled livestream. It is an `AsyncIterable<Segment>` (the iterator *is* the surface - no callback rail) and `AsyncDisposable`. Each
 * subscription has its **own unbounded queue**: the pool pushes every segment to every subscriber, so one slow consumer cannot stall a fast one, and nothing is dropped.
 *
 * The stream is **resilient by default**: a recoverable stall or reconnect is invisible to the iterator - it pauses while the underlying session is re-established and
 * resumes seamlessly when segments flow again (a same-codec reconnect suppresses the redundant init). The iterator terminates only on these conditions: disposal (a
 * clean `done`), a codec change across a reconnect (it throws {@link ProtectCodecChangeError}), and the recovery policy giving up (it throws {@link
 * ProtectLivestreamUnavailableError}). A recoverable stall is *not* one of them.
 *
 * @category Client
 */
export class LivestreamSubscription implements AsyncIterable<Segment>, AsyncDisposable {

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
  readonly #onDispose: (subscription: LivestreamSubscription) => void;
  // This queue is a policy-bearing media backlog on the library's hottest path - it carries the per-subscriber delivery statistics, the consumer-disposal discard, and
  // the drain-before-terminal guarantee - kept deliberately separate from the generic `EventBus` rail, which rides Node's own async iterator and carries no per-consumer
  // policy.
  readonly #queue: Segment[] = [];

  #abortHandler: (() => void) | null = null;
  #delivered = 0;
  #discarded = 0;
  #disposed = false;
  #done = false;
  #error: ProtectError | null = null;
  #lastSegmentAt = 0;
  #peakQueueDepth = 0;
  #signal: AbortSignal | undefined;
  // The resolver of a pending `next()` that is waiting for the queue to fill or the stream to terminate. Cleared each time it is fired.
  #wake: (() => void) | null = null;

  constructor(opts: { clock: Clock; discardOnDispose: boolean; host: SubscriptionHost; onDispose: (subscription: LivestreamSubscription) => void;
    signal?: AbortSignal; }) {

    this.id = randomUUID();
    this.#clock = opts.clock;
    this.#discardOnDispose = opts.discardOnDispose;
    this.#host = opts.host;
    this.#onDispose = opts.onDispose;
    this.#signal = opts.signal;

    // The consumer's signal disposes this subscription (and only this one - a shared session lives as long as any subscriber remains). An already-aborted signal disposes
    // on the next microtask so the caller still receives the handle first.
    if(opts.signal !== undefined) {

      if(opts.signal.aborted) {

        queueMicrotask(() => void this[Symbol.asyncDispose]());
      } else {

        this.#abortHandler = (): void => void this[Symbol.asyncDispose]();
        opts.signal.addEventListener("abort", this.#abortHandler, { once: true });
      }
    }
  }

  /** The negotiated RFC 6381 codec descriptor once the init segment has arrived, otherwise `""`. Read through to the shared session's cached init, the single source. */
  get codec(): string {

    return this.#host.initSegment?.codec ?? "";
  }

  /**
   * The cached initialization segment of the shared stream once it has arrived, otherwise `null`. Stable across same-codec reconnects (it is suppressed and the cache is
   * retained), and replaced only on a codec change - which is itself terminal, so a consumer never observes the cached init mutate beneath it mid-stream.
   */
  get initSegment(): { codec: string; data: Buffer } | null {

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
   * Iterate the segments of this subscription. The iterator yields every queued segment, then either ends (clean close / disposal) or throws the terminal error (codec
   * change or give-up). A recoverable stall is invisible - the iterator parks and resumes. Breaking out of the loop disposes the subscription.
   *
   * @returns An async iterator of segments.
   */
  [Symbol.asyncIterator](): AsyncIterator<Segment> {

    return this.#drain();
  }

  /**
   * Dispose the subscription: detach it from its shared session (decrementing the reference count, which tears the session down if it was the last), end any in-flight
   * iteration, and detach the consumer's abort listener. Safe to call more than once.
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
   * establishing, or this subscription itself was disposed - its own signal aborting, an explicit `await using` exit, or breaking its iterator - so a departed
   * subscriber's own wait ends with the subscription rather than hanging on the shared establishment latch until the remaining subscribers happen to settle it. The
   * boolean deliberately does not distinguish these outcomes because every consumer's correct reaction is identical: stop waiting and clean up.
   *
   * @returns A promise resolving `true` once the first media segment flows, `false` if establishment was abandoned or this subscription was disposed first.
   */
  async whenEstablished(): Promise<boolean> {

    // Already disposed: there is nothing left to wait for, and we must not forward to the still-pending shared latch (unlike the departed-mid-wait case below, which the
    // disposal deferred settles). A repeat call lands here identically - the answer is a property of this subscription's state, not of any per-call listener.
    if(this.#disposed) {

      return false;
    }

    // Race the shared establishment latch against this subscription's own disposal. The shared latch settles for the whole stream (first media `true`, or give-up
    // `false`); the disposal deferred settles `false` for this subscriber alone. It is shared across every call, so repeated waits register nothing per call and leak no
    // listeners.
    return Promise.race([ this.#host.whenEstablished(), this.#disposalDeferred.promise ]);
  }

  // Push a segment to this subscriber. Records liveness, tracks the peak queue depth (the consumer's slowness signal), enqueues, and wakes a pending next(). Codec reads
  // through to the shared session's cached init, so nothing codec-specific is tracked here. Package-internal: the ManagedSession calls this.
  push(segment: Segment): void {

    if(this.#done) {

      return;
    }

    this.#lastSegmentAt = this.#clock.now();
    this.#queue.push(segment);
    this.#peakQueueDepth = Math.max(this.#peakQueueDepth, this.#queue.length);
    this.#fireWake();
  }

  // Terminate this subscriber with a terminal error (codec change or give-up). Already-queued segments still drain first; the error throws only once the queue empties.
  // Package-internal.
  fail(error: ProtectError): void {

    if(this.#done || (this.#error !== null)) {

      return;
    }

    this.#error = error;
    this.#fireWake();
  }

  // Terminate this subscriber cleanly (disposal, or the pool closing without a terminal error). Already-queued segments still drain first. Package-internal.
  close(): void {

    if(this.#done) {

      return;
    }

    this.#done = true;
    this.#fireWake();
  }

  // The pull loop. Drains every queued segment, then surfaces the terminal condition: a stored error (thrown) or completion (return). When neither is ready, it awaits
  // the next push/terminate. The finally block disposes, so breaking the consumer's loop releases the reference exactly as an explicit dispose would.
  async *#drain(): AsyncGenerator<Segment> {

    try {

      for(;;) {

        const segment = this.#queue.shift();

        if(segment !== undefined) {

          this.#delivered++;

          yield segment;

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
// a consumer asked to re-decide now (`reassess`), or the stream was torn down (`aborted`). A dying in-flight session does not settle an outcome - it simply stops
// producing segments, so the window times out as `elapsed`, which keeps the model uniform (failure is always "no media segment in the window").
type RecoveryOutcome = "aborted" | "elapsed" | "reassess" | "recovered";

// The per-install one-shot latches that must move in lockstep with every freshly-installed session, consolidated into one object so the lockstep is enforced by
// structure rather than by separate booleans a future edit could desynchronize. They are all reset atomically in `#installSession` and consumed at most once over
// that session's life:
//
// - `awaitingFirstSegment` gates the codec-gate / init point: the very first segment of a freshly-installed session (normally the init) routes to `#handleFirstSegment`.
// - `awaitingFirstMedia` gates the recovery point: the first MEDIA segment of the install settles the episode `recovered` (establishment / live recovery both key on
//   media, not the init - "a stream is alive when media is flowing, not when the controller acked with an init").
// - `pendingDiscontinuity` arms the post-reconnect timeline-discontinuity marker for the first fanned media; armed only in the recovering phase (a cold start has no
//   prior timeline to resynchronize).
interface SessionInstallState {

  awaitingFirstMedia: boolean;
  awaitingFirstSegment: boolean;
  pendingDiscontinuity: boolean;
}

// The pool's per-stream record: the (replaceable) underlying session, the subscribers fanned out from it, the cached init segment for late-joiner replay, and - the heart
// of the resilient pool - the recovery loop. It is the one object holding both the session and the subscriber set, which is why recovery (a per-shared-stream decision)
// lives here. It implements SubscriptionHost so each subscription reads its lifecycle state, cached init, establishment latch, and in-flight re-decision through it.
class ManagedSession implements SubscriptionHost {

  readonly #clock: Clock;
  readonly #controller = new AbortController();
  readonly #createSession: () => LivestreamSession;
  readonly #established = Promise.withResolvers<boolean>();
  readonly #key: string;
  readonly #log: ProtectLogging;
  readonly #onTeardown: (key: string) => void;
  readonly #policy: RecoveryPolicy;
  readonly #resolved: ResolvedLivestreamSpec;
  // Subscribers mapped to their (optional) urgency closure, so the recovery loop aggregates delay tolerance across the stream by the minimum at each decision point.
  readonly #subscribers = new Map<LivestreamSubscription, (() => number) | undefined>();

  // The in-flight underlying session and its rail subscriptions. Both are replaced wholesale on each reconnect; disposing the rails before closing the old session
  // guarantees a dying socket's late frames never leak into the new attempt.
  #current: LivestreamSession | null = null;
  #currentRails: Disposable[] = [];

  // The shared lifecycle state, the cached init (compared on reconnect for the codec gate), the last terminal error (only ever a codec change or give-up; recoverable
  // session errors are absorbed by recovery and never stored), liveness for the recovery diagnostics, and the single teardown / establishment-latch guards.
  //
  // `#lastSegmentAt` is the ANY-segment liveness clock (stamped on every segment, inits included) the recovery diagnostics report. `#lastMediaAt` is the dedicated
  // MEDIA-keyed liveness clock the media-stall watchdog reads: it advances only when a decodable media segment is fanned, so a stream producing only non-media frames (a
  // suppressed re-init, the negotiated timestamp frames) reads stalled to the watchdog even while `#lastSegmentAt` stays fresh. The two are deliberately separate clocks
  // measuring two different liveness notions - any byte vs. a picture. `#watchdogController` is the media watchdog's lifecycle handle: non-null only while the watchdog
  // is armed (between the first media of an install and the next reconnect / teardown), aborting it ends the interval loop.
  #establishedSettled = false;
  #initSegmentCache: { codec: string; data: Buffer } | null = null;
  #lastError: ProtectError | null = null;
  #lastMediaAt = 0;
  #lastSegmentAt = 0;
  #state: LivestreamSubscriptionState = "connecting";
  #torndown = false;
  #watchdogController: AbortController | null = null;

  // The current recovery episode's bookkeeping: which regime, how many attempts have failed, when it began, the lockstep per-install latches (see the
  // SessionInstallState type - the codec-gate point, the media-keyed recovery point, and the post-reconnect discontinuity marker, reset as a unit per install), and the
  // resolver of the window the loop is currently awaiting (the single seam the rails and reassess() settle).
  #attempts = 0;
  #episodeStartedAt = 0;
  #install: SessionInstallState = { awaitingFirstMedia: false, awaitingFirstSegment: false, pendingDiscontinuity: false };
  #phase: "establishing" | "recovering" = "establishing";
  #settleOutcome: ((outcome: RecoveryOutcome) => void) | null = null;

  constructor(opts: { clock: Clock; createSession: () => LivestreamSession; key: string; log: ProtectLogging; onTeardown: (key: string) => void; policy: RecoveryPolicy;
    resolved: ResolvedLivestreamSpec; }) {

    this.#clock = opts.clock;
    this.#createSession = opts.createSession;
    this.#key = opts.key;
    this.#log = opts.log;
    this.#onTeardown = opts.onTeardown;
    this.#policy = opts.policy;
    this.#resolved = opts.resolved;
    this.#lastSegmentAt = this.#clock.now();

    if(channels.livestreamSessionOpened.hasSubscribers) {

      const payload = { cameraId: this.#resolved.cameraId, channel: this.#resolved.channel, key: this.#key, lens: this.#resolved.lens };

      channels.livestreamSessionOpened.publish(payload satisfies LivestreamSessionOpenedPayload);
    }
  }

  /** The cached init segment of the shared stream, for the subscription's read-through getter and late-joiner replay. */
  get initSegment(): { codec: string; data: Buffer } | null {

    return this.#initSegmentCache;
  }

  /** The shared stream's coarse lifecycle state. */
  get state(): LivestreamSubscriptionState {

    return this.#state;
  }

  // Attach a new subscriber, recording its urgency closure. A late joiner (the init is already cached) is replayed that cached init as its first segment; the very first
  // subscriber kicks off the bounded establishment episode. Synchronous, so no live segment can interleave ahead of the replay.
  attach(subscription: LivestreamSubscription, urgency?: () => number): void {

    const first = (this.#subscribers.size === 0);

    this.#subscribers.set(subscription, urgency);

    if(this.#initSegmentCache !== null) {

      subscription.push({ codec: this.#initSegmentCache.codec, data: this.#initSegmentCache.data, type: "init" });
    }

    if(first) {

      void this.#runEpisode("establishing");
    }

    // A tighter joiner mid-recovery re-decides the in-flight window now, instead of waiting out a backoff sized for the looser prior MIN. We carry the same recovering
    // gate `reassess()` uses: a joiner while live needs no poke (the media watchdog reads the new MIN on its next tick, so a tightened detection deadline takes effect
    // within one tick), and a joiner during the establishing init->media gap must not settle the urgency-independent establishing window (the gate spares it).
    if((this.#settleOutcome !== null) && (this.#phase === "recovering")) {

      this.#settle("reassess");
    }
  }

  // Detach a subscriber. When the last one leaves, tear the stream down (which ends the recovery loop if one is running).
  detach(subscription: LivestreamSubscription): void {

    if(!this.#subscribers.delete(subscription)) {

      return;
    }

    if(this.#subscribers.size === 0) {

      this.#teardown("the last subscriber disposed");
    }
  }

  // Close the stream from the pool's own disposal path, awaiting the underlying session's close.
  async close(): Promise<void> {

    const session = this.#current;

    this.#teardown("the livestream pool was disposed");

    await (session?.close() ?? Promise.resolve());
  }

  // Ask the recovery policy to re-decide the in-flight episode now. A no-op on a healthy stream (no window is being awaited), so it never forces a reconnect of a working
  // connection - it only short-circuits a wait/backoff a consumer's changed urgency has made stale.
  //
  // It is gated to the recovering phase. A reassess re-asks the policy because the consumer's urgency changed, but establishment is urgency-INDEPENDENT - a fresh stream
  // mints at the camera's own first-segment latency, which no consumer can hurry - so re-deciding an establishing episode cannot change its window. Now that the recovery
  // point keys on media, an establishing episode stays in flight through the init->media gap, so an ungated reassess in that gap would settle the live window and the
  // loop would re-consult and reinstall, tearing down a healthy session that has already inited and is about to produce media. Gating to recovering keeps the
  // urgency-driven re-decision exactly where urgency matters and leaves a connecting stream's progress untouched. (When the stream is live, no window is awaited, so
  // `#settle` no-ops regardless; the gate's sole effect is to spare the in-flight establishing session.)
  reassess(): void {

    if(this.#phase === "recovering") {

      this.#settle("reassess");
    }
  }

  // Resolve once the stream first produces a MEDIA segment (true) or gives up establishing (false).
  whenEstablished(): Promise<boolean> {

    return this.#established.promise;
  }

  // The recovery loop: a reducer over recovery events. Each pass asks the policy for a decision given the live context, applies it (reconnect builds a fresh session;
  // wait leaves the socket alone; giveUp is terminal), then awaits the decision's window. A segment ends the window as `recovered` and the episode is over; the window
  // elapsing on a reconnect counts a failed attempt and re-consults; a torn-down stream ends the loop. The loop is bound to the managed session's AbortController, so
  // teardown (last subscriber, pool disposal, terminal) ends it cleanly.
  async #runEpisode(phase: "establishing" | "recovering"): Promise<void> {

    this.#phase = phase;
    this.#state = (phase === "establishing") ? "connecting" : "recovering";
    this.#episodeStartedAt = this.#clock.now();
    this.#attempts = 0;

    if((phase === "recovering") && channels.livestreamRecoveryStarted.hasSubscribers) {

      const payload = { attempts: 0, cameraId: this.#resolved.cameraId, key: this.#key, sinceLastSegmentMs: this.#clock.now() - this.#lastSegmentAt } satisfies
        LivestreamRecoveryStartedPayload;

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

          this.#giveUp();

          return;
        }

        const isReconnect = (decision.kind === "reconnect");

        // A reconnect tears down any in-flight socket and connects fresh; a wait leaves the socket untouched. Either way we then wait out the decision's window for a
        // segment (which restores the stream) or the window's elapse.
        if(isReconnect) {

          this.#installSession();
        }

        // eslint-disable-next-line no-await-in-loop
        const outcome = await this.#raceOutcome(isReconnect ? decision.awaitMs : decision.forMs, signal);

        if((outcome === "recovered") || (outcome === "aborted")) {

          return;
        }

        // A reconnect whose window elapsed without a recovering MEDIA segment is a failed attempt; a wait that simply elapsed is not (it was deliberate backoff/defer). A
        // reassess on either re-consults immediately without counting an attempt. Because the recovery point now keys on media, an init-then-no-media session - the
        // controller acked with an init then went silent - elapses its window exactly like a session that never connected, and counts as a failed media-establishment
        // attempt: a fresh socket is a legitimate recovery for a per-socket controller bug, bounded by the establishment deadline (establishing) and by the injected
        // policy's giveUp -> self-heal (recovering). We deliberately do NOT keep-the-session-and-wait. The residual edge is a near-good session that inits at
        // `awaitMs - e` and would have produced media at `awaitMs + e`: this tears it down to reconnect. The default establishing windows are patient enough that a
        // real first-media latency lands well inside the window, so this near-miss is low-probability and acceptable; keeping the session and waiting indefinitely on a
        // stalled init would never terminate, which the reconnect-on-elapse design forecloses.
        if(isReconnect && (outcome === "elapsed")) {

          this.#attempts++;
        }
      }
    } catch(error) {

      // A consumer-supplied policy that throws must not leak an unhandled rejection or wedge the stream; treat it as a give-up and tear down.
      this.#log.error("The UniFi Protect livestream recovery policy threw; tearing the stream down.", error);
      this.#giveUp();
    }
  }

  // The live recovery context the policy reads. Only library-observable fields; consumer-private state lives in the policy's own closure.
  #context(): RecoveryContext {

    return { attempts: this.#attempts, cameraId: this.#resolved.cameraId, elapsedMs: this.#clock.now() - this.#episodeStartedAt, phase: this.#phase,
      toleranceMs: this.#aggregateTolerance() };
  }

  // Aggregate delay tolerance across the stream's subscribers by the MINIMUM (the most-urgent governs). A subscriber that reported no urgency contributes nothing, so the
  // aggregate is Infinity when none reported - which the default policy reads as "patient." This feeds the recovery-await derivation (RecoveryContext.toleranceMs); it is
  // deliberately distinct from `#detectionThresholdMs`, whose undeclared default is the 10 s media-stall window, not Infinity.
  #aggregateTolerance(): number {

    let tolerance = Infinity;

    for(const urgency of this.#subscribers.values()) {

      if(urgency !== undefined) {

        tolerance = Math.min(tolerance, urgency());
      }
    }

    return tolerance;
  }

  // The media-stall detection threshold - the consumer-declared policy the watchdog enforces, aggregated across subscribers by the MINIMUM (the most-urgent governs).
  // This is the detection sibling of `#aggregateTolerance`, with one deliberately different default: a subscriber that declares NO urgency contributes the 10 s default
  // (every live stream is media-watched by default - the fail-safe analog of the byte heartbeat), whereas the recovery-await aggregate reads an undeclared subscriber as
  // Infinity (patient). A subscriber declaring a tighter value pulls the MIN down; one declaring Infinity opts itself out entirely, so a stream where every subscriber
  // opts out yields Infinity and the watchdog's per-tick `>= Infinity` comparison never fires (the byte backstop alone watches it). A finite MIN is clamped UP to the
  // floor so a maximally-urgent consumer cannot set a threshold so tight that ordinary inter-segment jitter trips it. We read the RAW aggregate here, never the
  // margin-reduced RecoveryContext.toleranceMs - detection answers "notice a stall this fast," a different question from the recovery-await's "how long to wait per
  // attempt," so the 10 s detection default must never leak into recovery and vice versa.
  #detectionThresholdMs(): number {

    // Seed the MIN at its identity (Infinity), then fold in each subscriber's contribution: the 10 s default when it declared no urgency, otherwise its declared value.
    // Seeding at the default instead would cap every stream at 10 s and make the Infinity opt-out unreachable (a lone Infinity subscriber would MIN to the 10 s seed) -
    // the default is a per-subscriber contribution, not the aggregate's ceiling.
    let threshold = Infinity;

    for(const urgency of this.#subscribers.values()) {

      threshold = Math.min(threshold, urgency === undefined ? PROTECT_LIVESTREAM_STALL_DEFAULT_MS : urgency());
    }

    // An all-opted-out stream (every subscriber declared Infinity, or there are no subscribers) leaves the MIN at Infinity, which we pass through unclamped so the
    // watchdog never fires; a finite MIN is clamped up to the floor.
    return Number.isFinite(threshold) ? Math.max(threshold, PROTECT_LIVESTREAM_STALL_FLOOR_MS) : Infinity;
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
    // a reconnect's fresh session renegotiates rebaseTimestampsToZero and restarts the fMP4 timeline near zero, a backward jump from the delivered timeline the first
    // fanned media must announce. We gate the marker on the phase, not on a non-null prior - a multi-attempt INITIAL establishment also installs over a prior failed
    // session object, yet no media has ever flowed and there is no timeline to resynchronize, so a cold start must never arm. A defer/wait that resumes the existing
    // session never installs at all.
    this.#install = { awaitingFirstMedia: true, awaitingFirstSegment: true, pendingDiscontinuity: (this.#phase === "recovering") };

    const session = this.#createSession();

    this.#current = session;
    this.#currentRails = [

      session.on("segment", (segment: Segment): void => this.#onSegment(segment)),
      session.on("error", (error: LivestreamSessionEvents["error"][0]): void => this.#onSessionError(error)),
      session.on("closed", (): void => this.#onSessionClosed())
    ];

    if(prior !== null) {

      void prior.close();
    }
  }

  // Await the outcome of one decision's window. A media segment restores the stream (settled `recovered` by the segment handler), the timer elapses (`elapsed`), a
  // consumer reassesses (`reassess`), or teardown aborts the controller (`aborted`). The single settle seam is `#settleOutcome`; every settler routes through `#settle`,
  // so the first to fire wins and the rest are no-ops. The timer's own controller is aborted in the finally so a settled window cancels its pending wait.
  async #raceOutcome(timeoutMs: number, signal: AbortSignal): Promise<RecoveryOutcome> {

    if(signal.aborted) {

      return "aborted";
    }

    const { promise, resolve } = Promise.withResolvers<RecoveryOutcome>();

    this.#settleOutcome = resolve;

    const timerController = new AbortController();
    const onAbort = (): void => void this.#settle("aborted");

    signal.addEventListener("abort", onAbort, { once: true });
    // The window's timer. On elapse it settles `elapsed`; its rejection (when the finally cancels it) is the expected path and swallowed.
    void this.#clock.wait(timeoutMs, { signal: timerController.signal }).then(() => void this.#settle("elapsed"), () => undefined);

    try {

      return await promise;
    } finally {

      this.#settleOutcome = null;
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
  // Everything after the first media is steady live flow.
  #onSegment(segment: Segment): void {

    this.#lastSegmentAt = this.#clock.now();

    // The codec-gate point: the install's first segment. This runs the codec gate and caches/delivers/suppresses the init, but does NOT settle the episode - liveness
    // waits for media. A defensive media-first install settles immediately through the same recovery-media helper (see `#handleFirstSegment`).
    if(this.#install.awaitingFirstSegment) {

      this.#install.awaitingFirstSegment = false;
      this.#handleFirstSegment(segment);

      return;
    }

    // The recovery point: the first MEDIA segment after the init. This is the sole steady-path settle - it ends the establishing / recovering episode `recovered`. We
    // gate on media so a post-init traffic lull (non-media frames, a suppressed re-init) never settles the episode.
    if(this.#install.awaitingFirstMedia && (segment.type === "media")) {

      this.#handleRecoveryMedia(segment);

      return;
    }

    if(segment.type === "init") {

      this.#initSegmentCache = { codec: segment.codec, data: segment.data };
    }

    this.#fanOut(segment);
  }

  // The first segment of a freshly-installed session - normally the init - is the codec-gate point, NOT the recovery point. It is settle-free: the episode stays in
  // flight (its recovery window still bounds time-to-first-MEDIA) so that a controller that inits then never produces media elapses the window and reconnects rather than
  // being presumed live. It applies the codec gate - the very first establishment caches and delivers the init; a same-codec reconnect suppresses the byte-equivalent
  // re-emit (HKSV tolerates no second init; an FFmpeg pipe cannot re-init) and resumes seamlessly; a changed codec is the one terminal a recovery raises, torn down here
  // via the controller's abort (which settles the window `aborted`, booking no spurious attempt). It does NOT need the settle-race guard the recovery-media path keeps:
  // the init can only reach us on the current session's still-attached rail, and an elapsed window would already have disposed that rail before the init could arrive.
  #handleFirstSegment(segment: Segment): void {

    if(segment.type === "init") {

      const prior = this.#initSegmentCache;

      if((prior !== null) && (prior.codec !== segment.codec)) {

        this.#failCodecChange(prior.codec, segment.codec);

        return;
      }

      // The very first init (no prior cache) is delivered; a same-codec reconnect keeps the cached init and is suppressed (not re-emitted). Either way
      // `awaitingFirstMedia` stays armed, so the following media is what settles the episode.
      if(prior === null) {

        this.#initSegmentCache = { codec: segment.codec, data: segment.data };
        this.#fanOut(segment);
      }

      return;
    }

    // Defensive: a fresh session whose first frame is media rather than an init (not observed in practice). It is media, so it settles the recovery point directly - the
    // SAME helper, so "first media settles recovered" has exactly one implementation whether media arrived as the literal first segment or after an init.
    this.#handleRecoveryMedia(segment);
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
    this.#lastMediaAt = this.#clock.now();
    this.#armWatchdog();
    this.#fanOut(segment);
  }

  // Arm the always-on (while live) media-stall watchdog, called at the first-media boundary once the stream is `live`. It is the MEDIA-silence analog of the session's
  // any-byte heartbeat watchdog (which stays its own transport-liveness backstop, untouched): the two are complementary layers, byte-silence vs. media-silence, and on a
  // real stall this one fires first - after which `#onSessionClosed`'s torndown / settle / state guards make the later session-watchdog close a no-op.
  //
  // We arm even when the current threshold is Infinity (an all-opted-out stream): the loop is then a zero-cost idle interval whose per-tick comparison never fires, but
  // it stays running so a subscriber that later joins or tightens (pulling the MIN finite) is caught on the next tick with no explicit re-arm - the same property that
  // lets a tighten DURING a stall be caught. The arm is gated on `#state === "live"` by its sole caller, so it never runs during establishing / recovering (no media has
  // flowed). Abort-and-replace the controller so a stale loop from a prior arm can never coexist with the new one, then drive the interval on its signal.
  #armWatchdog(): void {

    if(this.#state !== "live") {

      return;
    }

    this.#watchdogController?.abort();
    this.#watchdogController = new AbortController();

    // Swallow the abort the same way `#raceOutcome` swallows its timer's: a disarm aborts the controller, which the interval iterator reports as an AbortError the loop
    // already catches - voiding the promise keeps it off the unhandled-rejection rail.
    void this.#runWatchdog(this.#watchdogController.signal).then(() => undefined, () => undefined);
  }

  // Disarm the media-stall watchdog. Aborts the interval loop (ending it cleanly) and clears the handle. A no-op on repeat, and when the watchdog was never armed (a
  // stream torn down or reconnected before any media flowed), so both `#installSession` and `#teardown` can call it unconditionally.
  #disarmWatchdog(): void {

    if(this.#watchdogController !== null) {

      this.#watchdogController.abort();
      this.#watchdogController = null;
    }
  }

  // The media-stall watchdog loop - an interval-poll mirroring the session's heartbeat watchdog shape, but keyed on `#lastMediaAt` (media flow) rather than
  // `#lastSegmentAt` (any byte). Each tick re-reads the detection threshold LIVE, so a tightened or loosened consumer policy takes effect within one tick with no
  // explicit re-arm - and a tighten that lands during an active media silence (no segment arriving to re-stamp the clock) is still caught, the blind spot a per-segment
  // one-shot would have. On a tick where the media silence has reached the threshold the watchdog FIRES: it re-checks the same `#torndown` / `#settleOutcome` guard
  // `#onSessionClosed` uses so it no-ops if a recovery is already in flight or the stream is torn down, then closes the current session into the EXISTING recovery path
  // (the session's `closed` rail drives `#onSessionClosed` -> a recovering episode) - never a parallel recovery entry. The loop ENDS after firing (at most one fire per
  // arm), so a second tick in the micro-gap before `#onSessionClosed` parks the recovery window cannot re-fire. The loop also ends when a disarm aborts the controller.
  async #runWatchdog(signal: AbortSignal): Promise<void> {

    for await (const _tick of this.#clock.setInterval(PROTECT_LIVESTREAM_STALL_POLL_MS, { signal })) {

      if(this.#torndown || (this.#settleOutcome !== null)) {

        return;
      }

      const silentForMs = this.#clock.now() - this.#lastMediaAt;

      if(silentForMs >= this.#detectionThresholdMs()) {

        this.#log.debug("Livestream media went silent beyond the detection threshold; recovering the stalled session.", { key: this.#key, silentForMs });
        void this.#current?.close();

        return;
      }
    }
  }

  // The stream produced its first MEDIA segment of the install: the episode is over. Establishment resolves the latch true; live recovery publishes the recovered
  // diagnostic with the downtime (now "media was absent this long", since the episode settles on media). Either way the stream returns to `live` and the attempt counter
  // resets. `wasEstablishing` keys off `#state` (still `"connecting"` for an establishing episode, `"recovering"` otherwise) - this is reached only on media now, never
  // on the init, but nothing between the episode start and here mutates `#state`, so the establishing-vs-recovering classification is unchanged.
  #onRecovered(): void {

    const wasEstablishing = (this.#state === "connecting");

    this.#state = "live";
    this.#attempts = 0;

    if(wasEstablishing) {

      this.#settleEstablished(true);

      return;
    }

    if(channels.livestreamRecoveryRecovered.hasSubscribers) {

      const payload = { cameraId: this.#resolved.cameraId, downtimeMs: this.#clock.now() - this.#episodeStartedAt, key: this.#key } satisfies
        LivestreamRecoveryRecoveredPayload;

      channels.livestreamRecoveryRecovered.publish(payload);
    }
  }

  // A reconnect negotiated a different codec than the one in flight. No fixed-codec consumer can adapt mid-stream, so this is terminal: publish the codec diagnostic and
  // tear the stream down with a ProtectCodecChangeError every subscriber throws.
  #failCodecChange(from: string, to: string): void {

    if(channels.livestreamCodecChanged.hasSubscribers) {

      channels.livestreamCodecChanged.publish({ cameraId: this.#resolved.cameraId, from, key: this.#key, to } satisfies LivestreamCodecChangedPayload);
    }

    this.#lastError = new ProtectCodecChangeError("The UniFi Protect livestream codec changed across a reconnect.", { from, to });
    this.#teardown("the livestream codec changed");
  }

  // The recovery policy gave up. Publish the exhausted diagnostic (the seam an opt-in consumer self-heal observer watches), then tear the stream down with a
  // ProtectLivestreamUnavailableError carrying the regime and the attempt count. An establishing give-up also resolves the establishment latch false.
  #giveUp(): void {

    const attempts = this.#attempts;
    const phase = this.#phase;

    if(channels.livestreamRecoveryExhausted.hasSubscribers) {

      channels.livestreamRecoveryExhausted.publish({ attempts, cameraId: this.#resolved.cameraId, key: this.#key } satisfies LivestreamRecoveryExhaustedPayload);
    }

    const message = (phase === "establishing") ? "The UniFi Protect livestream could not be established within the deadline." :
      "The UniFi Protect livestream could not be recovered.";

    this.#lastError = new ProtectLivestreamUnavailableError(message, { attempts, phase });

    if(phase === "establishing") {

      this.#settleEstablished(false);
    }

    this.#teardown("the livestream recovery policy gave up");
  }

  // The in-flight session surfaced a typed error. A stall publishes the stall diagnostic; otherwise nothing - a recoverable session error is absorbed by recovery and
  // never reaches subscribers (only the codec-change / give-up terminals do). The session's `closed` follows, which the loop reads as the window producing no segment.
  #onSessionError(error: ProtectError): void {

    if((error instanceof ProtectStallError) && channels.livestreamStallDetected.hasSubscribers) {

      const payload = { cameraId: this.#resolved.cameraId, key: this.#key, lastSegmentAt: this.#lastSegmentAt, silentForMs: error.silentForMs } satisfies
        LivestreamStallDetectedPayload;

      channels.livestreamStallDetected.publish(payload);
    }
  }

  // The in-flight session closed. During a recovery episode (a window is being awaited) the death is absorbed - the window simply times out as `elapsed`, keeping failure
  // uniform. While the stream is `live` (no episode running), a close is a fault, so we begin a recovery episode. A close during teardown, or between episodes with no
  // live stream, is ignored.
  #onSessionClosed(): void {

    if(this.#torndown || (this.#settleOutcome !== null)) {

      return;
    }

    if(this.#state === "live") {

      void this.#runEpisode("recovering");
    }
  }

  // Fan one segment out to every subscriber's own unbounded queue.
  #fanOut(segment: Segment): void {

    // Stamp the media-keyed liveness clock on every media segment fanned (the first via `#handleRecoveryMedia`, and every steady-state media here), and only on media -
    // an init never refreshes it. This is the single clock the media-stall watchdog reads, so keying it on the media branch is what makes a stream that produces only
    // non-media frames read stalled even while its any-byte heartbeat stays fresh.
    if(segment.type === "media") {

      this.#lastMediaAt = this.#clock.now();
    }

    // The first media segment after a reconnect carries the discontinuity marker, exactly once. The post-reconnect session restarted its timeline, so a consumer that
    // maintains a decode timeline must resynchronize at this splice point. We stamp a copy (never mutating the emitted segment) and clear the latch so only this segment
    // is marked. An init is never marked (a same-codec reconnect suppresses the re-init; a codec change is terminal), so gating on the media arm is correct by shape.
    let outgoing = segment;

    if(this.#install.pendingDiscontinuity && (segment.type === "media")) {

      this.#install.pendingDiscontinuity = false;
      outgoing = { ...segment, discontinuity: true };
    }

    for(const subscription of this.#subscribers.keys()) {

      subscription.push(outgoing);
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

  // The single guarded teardown, whether triggered by the last subscriber leaving, the pool disposing, a codec change, or a give-up. Aborts the recovery loop, disposes
  // the in-flight rails (so no further segment arrives), removes the key from the pool map synchronously (so a new subscriber starts fresh rather than attaching to a
  // closing session), resolves the establishment latch (false, if it never resolved), terminates the subscribers (failing them with the terminal error if there is one,
  // else closing them cleanly), closes the underlying session, and publishes the close diagnostic.
  #teardown(reason: string): void {

    if(this.#torndown) {

      return;
    }

    this.#torndown = true;
    this.#state = "closed";
    this.#controller.abort();
    // Disarm the media-stall watchdog so an interval tick already scheduled before teardown cannot fire on a dead session - aborting its controller ends the loop, and
    // the loop's own `#torndown` guard makes a tick that slipped through a no-op as well.
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

    void this.#current?.close();
    this.#log.debug("Livestream session torn down.", { key: this.#key, reason });

    if(channels.livestreamSessionClosed.hasSubscribers) {

      channels.livestreamSessionClosed.publish({ cameraId: this.#resolved.cameraId, key: this.#key, reason } satisfies LivestreamSessionClosedPayload);
    }
  }
}

/**
 * The ref-counted, multi-subscriber, resilient-by-default livestream pool. Construct it at the composition root with a transport-backed {@link livestreamUrlResolver}
 * (the shared {@link wsEndpointResolver}'s livestream specialization) and an optional {@link RecoveryPolicy}; consumers reach it through `camera.livestream(...)`.
 *
 * @category Client
 */
export class LivestreamPool implements AsyncDisposable {

  readonly #clock: Clock;
  readonly #log: ProtectLogging;
  readonly #recoveryPolicy: RecoveryPolicy;
  readonly #resolveUrl: (params: URLSearchParams, opts: { signal?: AbortSignal }) => Promise<string>;
  readonly #sessions = new Map<string, ManagedSession>();
  readonly #webSocketFactory: ((url: string) => ProtectWebSocket) | undefined;

  constructor(options: LivestreamPoolOptions) {

    this.#clock = options.clock ?? wallClock;
    this.#log = options.log ?? noopLog;
    this.#recoveryPolicy = options.recoveryPolicy ?? defaultLivestreamRecoveryPolicy;
    this.#resolveUrl = options.resolveUrl;
    this.#webSocketFactory = options.webSocket;
  }

  /**
   * Subscribe to a camera livestream. Returns immediately with a {@link LivestreamSubscription}; segments begin flowing once the underlying session connects (or
   * immediately, replayed from the cached init, for a shared session already live). Subscribers asking for an identical stream share one underlying WebSocket, and the
   * shared session recovers under the pool's policy without failing any subscriber.
   *
   * @param spec - The stream to subscribe to.
   * @param opts - Per-subscription {@link LivestreamSubscribeOptions}: an optional abort signal that disposes this subscription (and only this one), an
   *               optional `urgency` closure feeding the resilient recovery, and `discardOnDispose` dropping the undelivered queue on this consumer's own disposal.
   *
   * @returns A live subscription.
   */
  subscribe(spec: LivestreamSpec, opts: LivestreamSubscribeOptions = {}): LivestreamSubscription {

    const resolved = resolveLivestreamSpec(spec);
    const key = livestreamKey(resolved);

    let managed = this.#sessions.get(key);

    // First subscriber for this stream identity: create the one managed session (which owns session creation, negotiation, and recovery) and register it synchronously,
    // so any concurrent early subscriber finds it here rather than opening a second socket.
    if(managed === undefined) {

      const createSession = (): LivestreamSession => new LivestreamSession({

        clock: this.#clock,
        log: this.#log,
        resolveUrl: this.#resolveUrl,
        spec,
        ...((this.#webSocketFactory !== undefined) && { webSocket: this.#webSocketFactory })
      });

      managed = new ManagedSession({ clock: this.#clock, createSession, key, log: this.#log, onTeardown: (k: string): void => void this.#sessions.delete(k),
        policy: this.#recoveryPolicy, resolved });
      this.#sessions.set(key, managed);
    }

    const session = managed;
    const subscription = new LivestreamSubscription({ clock: this.#clock, discardOnDispose: opts.discardOnDispose ?? false, host: session,
      onDispose: (disposed): void => this.#onSubscriptionDisposed(key, session, disposed), ...((opts.signal !== undefined) && { signal: opts.signal }) });

    session.attach(subscription, opts.urgency);

    if(channels.livestreamSubscriptionCreated.hasSubscribers) {

      channels.livestreamSubscriptionCreated.publish({ key, subscriptionId: subscription.id } satisfies LivestreamSubscriptionCreatedPayload);
    }

    return subscription;
  }

  /**
   * Dispose the pool: close every managed session and clear the map. Called by the client's own disposal.
   */
  async [Symbol.asyncDispose](): Promise<void> {

    // Snapshot the sessions first: each close() removes its own key from the map via teardown, so iterating the live map would mutate it mid-iteration.
    const managed = [...this.#sessions.values()];

    this.#sessions.clear();

    await Promise.all(managed.map((session) => session.close()));
  }

  // A subscription was disposed. Detach it from its session (decrementing the reference count, which tears the session down if it was the last) and publish the disposed
  // diagnostic with its final stats.
  #onSubscriptionDisposed(key: string, session: ManagedSession, subscription: LivestreamSubscription): void {

    session.detach(subscription);

    if(channels.livestreamSubscriptionDisposed.hasSubscribers) {

      const payload = { key, stats: subscription.stats, subscriptionId: subscription.id } satisfies LivestreamSubscriptionDisposedPayload;

      channels.livestreamSubscriptionDisposed.publish(payload);
    }
  }
}
