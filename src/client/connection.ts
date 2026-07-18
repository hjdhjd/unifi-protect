/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * connection.ts: ConnectionMonitor - the connection-state FSM, reboot detection, and auto-recovery coordinator that folds the transport throttle and the events-stream
 * stall into one observable health surface.
 */

/**
 * `ConnectionMonitor` is the single coordinator that responds to the detection signals the lower layers emit: the {@link Transport}'s throttle rails (the half-open
 * circuit breaker's reachability verdict) and the {@link EventStream}'s `error` rail (the silence watchdog's channel-liveness verdict). Detection lives with the resource
 * that owns the signal; the response - verify, re-bootstrap, relaunch, and the state machine that narrates it - lives here. This is the same detect-here/respond-there
 * split the throttle and the stall already use; the monitor is the responder half of that split.
 *
 * **The monitor is pure FSM and policy; it does not own a raw `EventStream`.** The events WebSocket must be relaunched on recovery (the stream never self-reconnects - it
 * tears down on a stall), which means the packet bridge and the stall subscription re-attach to each new socket. Fusing that lifecycle into the monitor would pile two
 * responsibilities into one class and force per-relaunch `.on`/`.off` bookkeeping. So the replaceable stream lives behind {@link ManagedEventStream} - the structural
 * sibling of the livestream pool's managed session - which exposes a stable surface (`opened` / `relaunch` / a once-wired `onError` callback / a `packetSink`) so the
 * monitor wires in exactly once and never re-attaches across relaunches.
 *
 * **`state` is derived, never a stored enum.** `state = (transport.isThrottled && (phase === "healthy")) ? "throttled" : phase`, where `phase` is the recovery sub-state.
 * `throttled` surfaces only when the breaker is the *sole* fault (phase `healthy`); once recovery is underway the recovery phase (`degraded`/`reconnecting`/`lost`) takes
 * precedence, because the monitor - not the breaker - owns reachability re-probing, and `lost`/`reconnecting` is the more actionable truth than a cooldown. A transition
 * is just "recompute the derived value after any input and emit when it differs," so there is no transition table to drift out of sync.
 *
 * **Coupling is narrow and inverted.** The transport dependency is the structural {@link ThrottleSource} (exactly `isThrottled` plus the two throttle rails), not the
 * concrete class; the store is read only through its public `observe`/`snapshot`; every other I/O is an injected seam wired at the composition root (the events-stream
 * factory, the packet sink, `reBootstrap`, `verify`). The monitor never imports another subsystem's internals.
 *
 * @module ConnectionMonitor
 */
import type { ConnectionRebootDetectedPayload, EventsReconnectingPayload } from "../diagnostics.ts";
import { PROTECT_REBOOT_ANTICIPATION_WINDOW_MS, PROTECT_REBOOT_DETECTION_THRESHOLD, PROTECT_RECOVERY_BACKOFF_KNOWN_MS, PROTECT_RECOVERY_BACKOFF_UNKNOWN_MS,
  PROTECT_RECOVERY_STEADY_INTERVAL_MS } from "../settings.ts";
import { ProtectError, ProtectNetworkError } from "../errors.ts";
import type { Clock } from "../clock.ts";
import { EventBus } from "../event-bus.ts";
import type { EventStream } from "../transport/events-stream.ts";
import type { ProtectLogging } from "../logging.ts";
import type { RawPacket } from "../protocol/packet.ts";
import type { StateStore } from "../state/store.ts";
import type { StreamOptions } from "../event-bus.ts";
import type { TypedEvent } from "../protocol/events.ts";
import { channels } from "../diagnostics.ts";
import { noopLog } from "../logging.ts";
import { selectControllerUpSince } from "../state/selectors.ts";
import { wallClock } from "../clock.ts";

// The recovery sub-state the monitor maintains internally. `state` exposes this widened with the derived `throttled` value (see ConnectionState), so the throttle verdict
// never has to be mirrored into a stored field - it is read live from the transport.
/** @internal */
type RecoveryPhase = "degraded" | "healthy" | "lost" | "reconnecting";

// Which backoff curve a recovery episode follows, chosen by how certain the fault's cause is. A `known` reboot (a self-initiated controller reboot, the one case where
// the cause is certain) enters the long, return-time-anticipating curve; everything else is `unknown` and enters the prompt curve. The two differ only in their delay
// schedule (see #backoffDelays); the phase machinery is identical.
/** @internal */
type RecoveryTrack = "known" | "unknown";

/**
 * The connection's observable state. `healthy` is steady operation; `degraded` means a fault was detected and reachability is being probed; `reconnecting` means the
 * controller is reachable and the monitor is re-bootstrapping and relaunching the events stream; `lost` means the controller is unreachable and recovery is polling;
 * `throttled` means the transport's circuit breaker is open (HTTP is paused on a cooldown). `throttled` is derived live from the transport and takes precedence.
 *
 * @category Client
 */
export type ConnectionState = RecoveryPhase | "throttled";

/**
 * One edge of the connection-state machine, yielded by {@link ConnectionMonitor.observe} and carried on the `stateChanged` event. `reason` is present when a typed fault
 * (a stall, a failed liveness probe) drove the edge.
 *
 * @category Client
 */
export interface ConnectionTransition {

  from: ConnectionState;
  reason?: string;
  to: ConnectionState;
}

/**
 * The events {@link ConnectionMonitor} publishes on its three-rail surface.
 *
 * - `stateChanged` fires on every connection-state edge.
 * - `controllerLost` fires once when the controller is concluded unreachable, carrying the typed fault.
 * - `controllerRebooted` fires when the controller's self-reported boot time changes, carrying the previous and new values.
 * - `controllerRecovered` fires when the connection returns to healthy after having been lost.
 * - `throttleEntered` / `throttleExited` forward the transport breaker's transitions.
 *
 * @category Client
 */
export interface ConnectionEvents {

  controllerLost: [reason: ProtectError];
  controllerRebooted: [info: { newUpSince: number; previousUpSince: number }];
  controllerRecovered: [];
  stateChanged: [transition: ConnectionTransition];
  throttleEntered: [];
  throttleExited: [];
}

/**
 * The narrow Transport surface the monitor depends on - exactly the throttle verdict and the two throttle rails, nothing more. Expressing the dependency as this
 * structural type (rather than the concrete {@link Transport}) is what makes the contract's "narrow coupling to Transport" a compile-time guarantee: the monitor cannot
 * reach into the transport's request path or breaker internals because the type does not expose them. The concrete `Transport` satisfies this structurally.
 *
 * @category Client
 */
export interface ThrottleSource {

  readonly isThrottled: boolean;
  on(event: "throttleEntered" | "throttleExited", handler: () => void): Disposable;
}

/**
 * Construction options for {@link ConnectionMonitor}. Every I/O dependency is an injected seam wired at the composition root, mirroring how every other subsystem in the
 * library inverts its dependencies.
 *
 * - `eventStreamFactory` builds an events stream for a given `lastUpdateId`; it is the single construction path, used for the initial stream and every relaunch. The
 *   optional `signal` is bound only to the initial connect, never to a relaunch (a relaunch must not inherit a possibly-stale connect signal).
 * - `packetSink` receives every decoded {@link TypedEvent} from whichever inner stream is live (the composition root fans it into the store and the client firehose).
 * - `rawPacketSink` receives the {@link RawPacket} of every decoded frame from whichever inner stream is live (the composition root fans it into the client's raw
 *   firehose); it carries the unmodeled frames `packetSink` never sees. Bridged across relaunches exactly as `packetSink` is, so the raw firehose survives recovery.
 * - `reBootstrap` fetches a fresh bootstrap, dispatches it, and returns its `lastUpdateId` to seed the relaunch - wired to the shared bootstrap fetch and the store's
 *   single dispatch chokepoint, so there is one fetch source and one write path.
 * - `verify` is the liveness probe - a GET against the bootstrap endpoint (the controller does not answer HEAD there), surfaced as {@link ConnectionMonitor.verify}.
 * - `store` is read only through `observe`/`snapshot` (reboot detection); `transport` is the narrow {@link ThrottleSource}.
 * - `signal` cancels the initial events-stream connect.
 *
 * @category Client
 */
export interface ConnectionMonitorOptions {

  clock?: Clock;
  eventStreamFactory: (lastUpdateId: string, signal?: AbortSignal) => EventStream;
  initialLastUpdateId: string;
  log?: ProtectLogging;
  packetSink: (event: TypedEvent) => void;
  rawPacketSink: (packet: RawPacket) => void;
  reBootstrap: (signal?: AbortSignal) => Promise<string>;
  signal?: AbortSignal;
  store: StateStore;
  transport: ThrottleSource;
  verify: (signal?: AbortSignal) => Promise<void>;
}

/**
 * Owns the *replaceable* events stream behind a stable surface, so the monitor subscribes once and never re-attaches across relaunches. It is the structural sibling of
 * the livestream pool's managed session: it builds the inner stream through the single injected factory (the initial stream and every relaunch), bridges the inner
 * stream's packets to the injected `packetSink` (and its raw packets to `rawPacketSink`), and forwards the inner stream's `error` to the stable `onError` callback the
 * monitor wires once.
 *
 * Both bridges are attached synchronously at build time, before any await, preserving the race-free "subscribe before open" property the composition root relies on. On
 * `relaunch` the subscriptions are disposed *before* the old stream is torn down, so a dying socket's late frames never reach the monitor or the firehose. It listens
 * only to `error`: the `EventStream` routes every unsolicited termination there - a stall, a socket error, and an unsolicited close (the peer dropping a live
 * socket, e.g.
 * a controller reboot, which arrives as a `close` with no socket `error`). A self-initiated close (relaunch / dispose) stays informational on `closed`, so the error rail
 * alone is the failure signal and `closed` needs no handling.
 */
class ManagedEventStream implements AsyncDisposable {

  readonly #factory: (lastUpdateId: string, signal?: AbortSignal) => EventStream;
  readonly #onError: (err: ProtectError) => void;
  readonly #packetSink: (event: TypedEvent) => void;
  readonly #rawPacketSink: (packet: RawPacket) => void;

  // The current inner stream and the bridges into it. The subscriptions are disposed and rebuilt on every relaunch; the stream reference is replaced in lockstep.
  #stream: EventStream;
  #subscriptions: Disposable[] = [];

  constructor(options: {
    factory: (lastUpdateId: string, signal?: AbortSignal) => EventStream;
    initialLastUpdateId: string;
    onError: (err: ProtectError) => void;
    packetSink: (event: TypedEvent) => void;
    rawPacketSink: (packet: RawPacket) => void;
    signal?: AbortSignal;
  }) {

    this.#factory = options.factory;
    this.#onError = options.onError;
    this.#packetSink = options.packetSink;
    this.#rawPacketSink = options.rawPacketSink;
    this.#stream = this.#build(options.initialLastUpdateId, options.signal);
  }

  /** The current inner stream's open handshake. The composition root awaits it (via the monitor) to complete the atomic connect. */
  get opened(): Promise<void> {

    return this.#stream.opened;
  }

  /**
   * Tear the current stream down and bring up a fresh one seeded with the latest `lastUpdateId` (so the controller replays the gap), then await its open. The bridges
   * re-attach to the new stream inside `#build`, so the monitor's wiring is untouched.
   *
   * @param lastUpdateId - The freshest update id from the recovery re-bootstrap.
   */
  async relaunch(lastUpdateId: string): Promise<void> {

    await this.#teardown();

    this.#stream = this.#build(lastUpdateId);

    await this.#stream.opened;
  }

  /**
   * Dispose the owner: detach the bridges and tear the current stream down. Safe to call more than once, via the underlying stream's own repeat-safe close.
   */
  async [Symbol.asyncDispose](): Promise<void> {

    await this.#teardown();
  }

  // Build one inner stream and attach the stable bridges - packets to the sink, raw packets to the raw sink, errors to onError - synchronously, before the socket can
  // deliver anything, tracking them as Disposables so teardown detaches them before the stream is disposed.
  #build(lastUpdateId: string, signal?: AbortSignal): EventStream {

    const stream = this.#factory(lastUpdateId, signal);

    this.#subscriptions = [ stream.on("packet", (event): void => this.#packetSink(event)),
      stream.on("rawPacket", (packet): void => this.#rawPacketSink(packet)), stream.on("error", (err): void => this.#onError(err)) ];

    return stream;
  }

  // Detach the bridges, then tear the current stream down. Disposing the subscriptions first guarantees that the close this triggers (and any late frame) cannot reach
  // the monitor or the firehose.
  async #teardown(): Promise<void> {

    for(const subscription of this.#subscriptions) {

      subscription[Symbol.dispose]();
    }

    this.#subscriptions = [];

    await this.#stream[Symbol.asyncDispose]();
  }
}

/**
 * The connection-state coordinator. Constructed by `ProtectClient.connect()`; consumers read it as `client.connection`.
 *
 * @category Client
 */
export class ConnectionMonitor {

  readonly #bus = new EventBus<ConnectionEvents>();
  readonly #clock: Clock;
  // One AbortController for the monitor's lifetime. It ends the reboot-observation loop and any recovery-interval wait; disposal aborts it.
  readonly #controller = new AbortController();
  readonly #log: ProtectLogging;
  readonly #managed: ManagedEventStream;
  readonly #reBootstrap: (signal?: AbortSignal) => Promise<string>;
  readonly #store: StateStore;
  readonly #throttleSubscriptions: Disposable[];
  readonly #transport: ThrottleSource;
  readonly #verifyProbe: (signal?: AbortSignal) => Promise<void>;

  // The recovery sub-state and the bookkeeping the FSM needs. `state` is derived from #phase and the transport's live throttle verdict, never stored. #lastFault is the
  // most recent typed fault (the transition reason and the controllerLost payload). #reportedState caches the last emitted derived state purely to dedup stateChanged.
  // #recovering guards against re-entrant recovery. #recoveryWake holds the abort handle for the in-flight backoff wait, or is null when recovery is not currently
  // parked on a wait. #wasLost records that an episode reached `lost`, so controllerRecovered fires only after a genuine loss. #lastUpSince tracks the controller's
  // last-seen boot time for reboot detection. #rebootAnticipatedUntil is the self-expiring deadline (clock time) armed by expectReboot(); a fault before it enters the
  // known-reboot backoff track, a fault after it the unknown one.
  #lastFault: ProtectError | null = null;
  #lastUpSince: number | null;
  #phase: RecoveryPhase = "healthy";
  #rebootAnticipatedUntil: number | null = null;
  #recovering = false;
  #recoveryWake: AbortController | null = null;
  #reportedState: ConnectionState;
  #wasLost = false;

  constructor(options: ConnectionMonitorOptions) {

    this.#clock = options.clock ?? wallClock;
    this.#log = options.log ?? noopLog;
    this.#reBootstrap = options.reBootstrap;
    this.#store = options.store;
    this.#transport = options.transport;
    this.#verifyProbe = options.verify;

    // Build the events-channel lifecycle owner. Its packet sink and stall callback are wired once here; the owner re-attaches them internally across relaunches, so the
    // monitor never does paired on/off bookkeeping. Construction begins connecting the initial stream synchronously, attaching its bridges before anything awaits open.
    this.#managed = new ManagedEventStream({

      factory: options.eventStreamFactory,
      initialLastUpdateId: options.initialLastUpdateId,
      onError: (err: ProtectError): void => this.#onStreamFault(err),
      packetSink: options.packetSink,
      rawPacketSink: options.rawPacketSink,
      ...((options.signal !== undefined) && { signal: options.signal })
    });

    // Seed reboot detection from the bootstrap connect() already dispatched, and seed the dedup baseline from the derived state at construction (healthy in the common
    // case; throttled if the injected transport is already breaker-open).
    this.#lastUpSince = selectControllerUpSince(this.#store.snapshot());
    this.#reportedState = this.#derive();

    // Fold the transport's throttle rails into the FSM: forward them on our own surface and recompute the derived state. The transport already logs the breaker
    // transitions, so we do not re-log them here.
    this.#throttleSubscriptions = [
      this.#transport.on("throttleEntered", (): void => this.#onThrottle(true)),
      this.#transport.on("throttleExited", (): void => this.#onThrottle(false))
    ];

    // Watch the controller's boot time for reboots. The loop runs detached for the monitor's lifetime; the controller's abort ends it.
    void this.#watchReboots();
  }

  /** The current connection state. Derived live from the recovery phase and the transport's throttle verdict, so it can never drift from a separately-stored enum. */
  get state(): ConnectionState {

    return this.#derive();
  }

  /** Whether the connection is in steady operation. */
  get isHealthy(): boolean {

    return this.#derive() === "healthy";
  }

  /** Whether the transport's throttle breaker is open. Delegates verbatim to the transport - the single source of truth for reachability backoff. */
  get isThrottled(): boolean {

    return this.#transport.isThrottled;
  }

  /** The initial events-channel open handshake. The composition root awaits this to complete the atomic connect; a failure tears the client down. */
  get opened(): Promise<void> {

    return this.#managed.opened;
  }

  /**
   * Subscribe to a connection event. Returns a `Disposable`; prefer `using sub = connection.on(...)` so the listener detaches at scope exit.
   *
   * @param event   - The event to listen for.
   * @param handler - Invoked on each emission.
   *
   * @returns A `Disposable` that removes the listener when disposed.
   */
  on<K extends keyof ConnectionEvents>(event: K, handler: (...args: ConnectionEvents[K]) => void): Disposable {

    return this.#bus.on(event, handler);
  }

  /**
   * Wait for the next emission of a connection event.
   *
   * @param event - The event to await.
   * @param opts  - Optional abort signal.
   *
   * @returns A promise resolving to the event's argument tuple.
   */
  async once<K extends keyof ConnectionEvents>(event: K, opts: { signal?: AbortSignal } = {}): Promise<ConnectionEvents[K]> {

    return this.#bus.once(event, opts);
  }

  /**
   * Stream every subsequent emission of a connection event until the signal aborts.
   *
   * @param event - The event to stream.
   * @param opts  - Stream options, including the abort signal.
   *
   * @returns An async iterable of the event's argument tuples.
   */
  stream<K extends keyof ConnectionEvents>(event: K, opts: StreamOptions = {}): AsyncIterable<ConnectionEvents[K]> {

    return this.#bus.stream(event, opts);
  }

  /**
   * Observe the connection-state machine: every {@link ConnectionTransition} until the signal aborts. Sugar over `stream("stateChanged")` that unwraps the single-element
   * argument tuple and ends quietly on the caller's own abort.
   *
   * @param opts - Optional abort signal that terminates the iteration.
   *
   * @returns An async iterable of state transitions.
   */
  async *observe(opts: { signal?: AbortSignal } = {}): AsyncGenerator<ConnectionTransition> {

    try {

      for await (const [transition] of this.#bus.stream("stateChanged", opts)) {

        yield transition;
      }
    } catch(error) {

      if(opts.signal?.aborted === true) {

        return;
      }

      throw error;
    }
  }

  /**
   * Explicitly probe the controller's liveness (a GET against the bootstrap endpoint). Resolves when the controller answers, throws the classified error otherwise. The
   * same probe the recovery loop uses; exposed so a consumer can check reachability on demand.
   *
   * @param opts - Optional abort signal.
   *
   * @throws The classified `FatalError` on a non-2xx, or a transport-level `ProtectError` when the controller is unreachable.
   */
  async verify(opts: { signal?: AbortSignal } = {}): Promise<void> {

    await this.#verifyProbe(opts.signal);
  }

  /**
   * Arm the monitor to treat the next connection fault as a *known* controller reboot, so recovery enters the long, return-time-anticipating backoff track rather than
   * the prompt one. Called by {@link ProtectClient.reboot} after the controller accepts the reboot - the one moment a fault's cause is certain. Package-internal: it is
   * not a consumer recovery trigger, only a hint that colors the recovery episode the imminent fault will trigger on its own.
   *
   * The anticipation is bounded: it self-expires {@link PROTECT_REBOOT_ANTICIPATION_WINDOW_MS} after now, and is consumed by the next fault. So a reboot whose fault
   * never arrives cannot mis-route a much-later unrelated fault into the known track, and a fault after the window correctly takes the unknown track.
   */
  expectReboot(): void {

    this.#rebootAnticipatedUntil = this.#clock.now() + PROTECT_REBOOT_ANTICIPATION_WINDOW_MS;
  }

  /**
   * Dispose the monitor: end the reboot-observation loop and any recovery wait, detach the throttle subscriptions, and tear the events stream down. A no-op on repeat.
   */
  async [Symbol.asyncDispose](): Promise<void> {

    this.#controller.abort();

    for(const subscription of this.#throttleSubscriptions) {

      subscription[Symbol.dispose]();
    }

    await this.#managed[Symbol.asyncDispose]();
  }

  // The single derivation of the observable state. `throttled` is surfaced only when the breaker is the sole fault - the recovery phase is `healthy` - so it reads
  // straight from the transport without being mirrored into a field. Once recovery is underway (any non-healthy phase) the recovery phase takes precedence, because then
  // the monitor (not the breaker) owns reachability re-probing, and `lost` / `reconnecting` is the more actionable truth than a tripped breaker during a reboot. The
  // precedence mirrors the ownership boundary exactly: throttle in the breaker's regime, the recovery phase in the monitor's.
  #derive(): ConnectionState {

    return (this.#transport.isThrottled && (this.#phase === "healthy")) ? "throttled" : this.#phase;
  }

  // Recompute the derived state and emit a transition when it changed. The one place stateChanged fires, so the event and the diagnostic always agree.
  #recompute(): void {

    const next = this.#derive();

    if(next === this.#reportedState) {

      return;
    }

    const from = this.#reportedState;

    this.#reportedState = next;

    const transition: ConnectionTransition = { from, to: next, ...((this.#lastFault !== null) && { reason: this.#lastFault.message }) };

    this.#bus.emit("stateChanged", transition);

    if(channels.connectionTransition.hasSubscribers) {

      channels.connectionTransition.publish(transition);
    }
  }

  // Move to a recovery phase and recompute. Used for the non-terminal phases; entering `lost` goes through #enterLost so the controllerLost announcement fires once.
  #enterPhase(phase: RecoveryPhase): void {

    this.#phase = phase;
    this.#recompute();
  }

  // Conclude the controller is unreachable. Announces controllerLost once per lost episode (on the transition into lost, not on every failed poll), records the fault,
  // and marks the episode so a later return to healthy fires controllerRecovered.
  #enterLost(reason: ProtectError): void {

    const announce = this.#phase !== "lost";

    this.#lastFault = reason;
    this.#phase = "lost";
    this.#wasLost = true;
    this.#recompute();

    if(announce) {

      this.#log.warn("The UniFi Protect controller appears unreachable; the connection is lost and recovery is polling.", { reason: reason.message });
      this.#bus.emit("controllerLost", reason);
    }
  }

  // A throttle rail fired. Forward it and recompute the derived state (which now reflects, or stops reflecting, "throttled").
  #onThrottle(entered: boolean): void {

    this.#bus.emit(entered ? "throttleEntered" : "throttleExited");
    this.#recompute();
  }

  // The events channel reported an unsolicited fault (a watchdog stall or a socket error). Record it, mark the connection degraded if it was healthy, and kick the
  // guarded recovery sequence. A deliberate relaunch/close fires no error, so this runs only for genuine faults.
  #onStreamFault(err: ProtectError): void {

    this.#lastFault = err;
    this.#log.debug("The UniFi Protect realtime events channel faulted; beginning recovery.", { reason: err.message });

    if(this.#phase === "healthy") {

      this.#enterPhase("degraded");
    }

    void this.#recover();
  }

  // The guarded recovery sequence: one backoff curve, chosen by fault certainty, that walks out to the steady floor and polls there until the controller returns or the
  // monitor is disposed. The #backoffDelays generator yields the delay before each probe (the staged prefix, then the floor forever), so the single loop is "wait the
  // next delay, then attempt." The wait ends one of three ways: its delay elapses and we probe on schedule; a reachability wake aborts it (a detected reboot proves the
  // controller is back, so we probe now rather than sleeping out the rest of the backoff); or disposal aborts it and we end. Recovery therefore polls a slow-to-return
  // controller for as long as the monitor lives - it never gives up after a handful of failures. The #recovering guard makes re-entrant faults no-ops, so the track is
  // chosen (and the one-shot reboot anticipation consumed) once per episode, inside the guard.
  async #recover(): Promise<void> {

    if(this.#recovering) {

      return;
    }

    this.#recovering = true;

    const track = this.#consumeRecoveryTrack();

    try {

      for(const delay of this.#backoffDelays(track)) {

        // Park on the next scheduled delay, but make the wait interruptible by a reachability wake distinct from disposal. We compose the monitor's lifetime
        // signal with a per-iteration wake controller: disposal aborts the former, #wakeRecovery() the latter. AbortSignal.any handles a pre-aborted lifetime signal
        // cleanly, and Node holds the composite's dependents weakly, so the per-poll composites are GC-reclaimed - bounded and negligible at the steady cadence.
        // Sequential by design: each probe must wait and complete before the next is scheduled.
        const wake = new AbortController();

        this.#recoveryWake = wake;

        try {

          // eslint-disable-next-line no-await-in-loop
          await this.#clock.wait(delay, { signal: AbortSignal.any([ this.#controller.signal, wake.signal ]) });
        } catch {

          // The wait aborted. A monitor-lifetime abort means disposal, so we end recovery. Otherwise a reachability wake (a detected reboot) fired, so we fall
          // through and probe now instead of sleeping out the rest of the backoff.
          if(this.#controller.signal.aborted) {

            return;
          }
        } finally {

          this.#recoveryWake = null;
        }

        // eslint-disable-next-line no-await-in-loop
        if(await this.#attemptRecovery()) {

          return;
        }
      }
    } catch {

      // A real backstop, not dead code. #attemptRecovery's own catch calls #enterLost, which emits controllerLost/stateChanged through the EventBus, and a synchronous
      // consumer listener that throws would propagate back here; swallowing it keeps the detached `void this.#recover()` from surfacing as an unhandled rejection. The
      // wait's own abort (wake or disposal) is handled inside the loop, so this does not fire on disposal.
    } finally {

      this.#recovering = false;
    }
  }

  // Wake an in-flight recovery wait so its next probe fires immediately. This is a no-op when recovery is not parked on a wait (between probes, or not recovering).
  #wakeRecovery(): void {

    this.#recoveryWake?.abort();
  }

  // The delays, in milliseconds, before each successive recovery probe: the chosen track's staged prefix, then the shared steady floor forever. A known reboot walks the
  // long, return-time-anticipating curve; an unknown fault the prompt one (its leading zero reproduces "probe at once on the fault"). The infinite steady tail is what
  // makes recovery poll indefinitely - the loop ends only on success or disposal, never by exhausting the schedule.
  *#backoffDelays(track: RecoveryTrack): Generator<number> {

    yield* (track === "known") ? PROTECT_RECOVERY_BACKOFF_KNOWN_MS : PROTECT_RECOVERY_BACKOFF_UNKNOWN_MS;

    for(;;) {

      yield PROTECT_RECOVERY_STEADY_INTERVAL_MS;
    }
  }

  // Choose the backoff track for an episode and consume the one-shot reboot anticipation. A fault inside the anticipation window armed by expectReboot() is a known
  // reboot (the long track); anything else is unknown (the prompt track). We clear the anticipation unconditionally so it is strictly one-shot - an expired or absent
  // window simply yields the unknown track. (A reboot issued while an unknown episode is already recovering does not upgrade the in-flight track; the steady floor still
  // recovers it within an interval of the controller's return, and the window self-expires - an acceptable, rare degradation, not a correctness gap.)
  #consumeRecoveryTrack(): RecoveryTrack {

    const anticipated = (this.#rebootAnticipatedUntil !== null) && (this.#clock.now() < this.#rebootAnticipatedUntil);

    this.#rebootAnticipatedUntil = null;

    return anticipated ? "known" : "unknown";
  }

  // One recovery attempt: the verify -> re-bootstrap -> relaunch sequence. The verify probe and the re-bootstrap fetch both carry `probe: true` (wired at the
  // composition root), so they dispatch through an open breaker at this loop's cadence rather than waiting out the breaker's cooldown - the unification that makes the
  // monitor the single owner of re-probe cadence during recovery. A successful probe closes the breaker as a side effect of its own booking; the monitor never touches
  // breaker internals. Success returns true (the caller stops); a failure at any step drops to `lost` and returns false so the caller retries. Announcing `lost` is
  // a no-op on repeat (controllerLost fires once per episode), so repeated failures while a sluggish controller returns do not spam.
  async #attemptRecovery(): Promise<boolean> {

    try {

      await this.#verifyProbe(this.#controller.signal);

      this.#enterPhase("reconnecting");
      this.#publishReconnecting();

      const lastUpdateId = await this.#reBootstrap(this.#controller.signal);

      await this.#managed.relaunch(lastUpdateId);

      this.#onRecovered();

      return true;
    } catch(error) {

      this.#enterLost((error instanceof ProtectError) ? error :
        new ProtectNetworkError("Recovery of the UniFi Protect connection failed.", { cause: error }));

      return false;
    }
  }

  // Recovery completed. Clear the fault, return to healthy, and announce recovery only if the episode had reached `lost` (a transient stall that re-bootstrapped without
  // the controller ever going unreachable does not warrant a controllerRecovered). The non-lost path still logs a quieter stream-level confirmation in the `else` so a
  // transient relaunch that announced "Reconnecting..." still has a visible resolution.
  #onRecovered(): void {

    const recovered = this.#wasLost;

    this.#lastFault = null;
    this.#wasLost = false;
    this.#enterPhase("healthy");

    if(recovered) {

      this.#log.info("Recovered the connection to the UniFi Protect controller.");
      this.#bus.emit("controllerRecovered");
    } else {

      // A transient relaunch that recovered before the controller was ever declared unreachable still announced "Reconnecting..." when the relaunch began, so confirm it
      // returned. This is the stream-level past-tense complement of #publishReconnecting's line; the louder controller-level "Recovered the connection" above already
      // covers the genuine-loss case, so the two are mutually exclusive and each recovery logs exactly one success line.
      this.#log.info("Reconnected the UniFi Protect realtime events stream.");
    }
  }

  // Announce the relaunch on the diagnostics channel. Published here (not by the events stream, which does not reconnect) per the channel's contract.
  #publishReconnecting(): void {

    this.#log.info("Reconnecting the UniFi Protect realtime events stream.");

    if(channels.eventsReconnecting.hasSubscribers) {

      channels.eventsReconnecting.publish({ reason: this.#lastFault?.message ?? "the events channel faulted" } satisfies EventsReconnectingPayload);
    }
  }

  // Watch the controller's self-reported boot time. `upSince` is a noisy measurement of the boot instant (live validation observed millisecond-level
  // jitter across
  // bootstraps, plausibly because it is recomputed as now - uptime), so a naive change test fires on every refresh. A genuine reboot instead moves the boot time by at
  // least the prior uptime - minutes to hours - so we treat a change below PROTECT_REBOOT_DETECTION_THRESHOLD as noise and only announce a reboot beyond it. We
  // still track
  // the latest value each yield, so accumulated jitter never crosses the floor. This catches a reboot whether the fresh bootstrap arrived via the periodic refresh or a
  // recovery re-bootstrap.
  async #watchReboots(): Promise<void> {

    try {

      for await (const upSince of this.#store.observe(selectControllerUpSince, { signal: this.#controller.signal })) {

        const previousUpSince = this.#lastUpSince;

        this.#lastUpSince = upSince;

        if((previousUpSince !== null) && (upSince !== null) && (Math.abs(upSince - previousUpSince) >= PROTECT_REBOOT_DETECTION_THRESHOLD)) {

          this.#log.info("The UniFi Protect controller restarted.");

          // A detected reboot is proof the controller is reachable again - this detection rides a successful bootstrap fetch - so we wake any parked recovery wait to
          // relaunch the events stream now rather than sleeping out the backoff. We wake before the emit so a throwing or slow consumer listener on controllerRebooted
          // cannot skip the wake.
          this.#wakeRecovery();
          this.#bus.emit("controllerRebooted", { newUpSince: upSince, previousUpSince });

          if(channels.connectionRebootDetected.hasSubscribers) {

            channels.connectionRebootDetected.publish({ newUpSince: upSince, previousUpSince } satisfies ConnectionRebootDetectedPayload);
          }
        }
      }
    } catch {

      // The observe iterator ends on abort when the monitor is disposed. Swallowed as the loop's end.
    }
  }
}
