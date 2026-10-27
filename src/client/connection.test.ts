/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * connection.test.ts: Tests for ConnectionMonitor - the derived-state FSM, reboot detection via the controller's boot time, throttle/stall folding, and the guarded
 * auto-recovery sequence (verify -> re-bootstrap -> relaunch). Driven with a `TestClock`, a fake throttle source, and injected events-stream/verify/re-bootstrap hooks,
 * so every path is exercised without a live controller.
 */
import type { CapturedLogEntry, CapturingLogger } from "../testing.helpers.ts";
import type { ConnectionState, ConnectionTransition, ThrottleSource } from "./connection.ts";
import { PROTECT_EVENTS_WATCHDOG_TIMEOUT, PROTECT_REBOOT_ANTICIPATION_WINDOW_MS, PROTECT_RECOVERY_BACKOFF_KNOWN_MS, PROTECT_RECOVERY_BACKOFF_UNKNOWN_MS,
  PROTECT_RECOVERY_REFUSAL_SCHEDULE_MS, PROTECT_RECOVERY_STEADY_INTERVAL_MS } from "../settings.ts";
import { ProtectAbortedError, ProtectAuthError, ProtectAuthorizationError, ProtectBootstrapError, ProtectCertificateError, ProtectError,
  ProtectNetworkError } from "../errors.ts";
import { TIME_OF_DAY_STEP_MS, capturingLog, expectAt, silentLog } from "../testing.helpers.ts";
import { TestClock, advanceThroughSchedule, errnoError, present } from "homebridge-plugin-utils/testing";
import { buildPacket, jsonActionFrame, jsonDataFrame, makeActionHeader } from "../protocol/packet.helpers.ts";
import { channels, subscribeToChannel } from "../diagnostics.ts";
import { describe, test } from "node:test";
import { makeBootstrap, makeNvr } from "../fixtures.helpers.ts";
import { ConnectionMonitor } from "./connection.ts";
import { EventBus } from "../event-bus.ts";
import { EventStream } from "../transport/events-stream.ts";
import { FakeWebSocket } from "../transport/events-stream.helpers.ts";
import type { ProtectLogging } from "../logging.ts";
import type { RawPacket } from "../protocol/packet.ts";
import { StateStore } from "../state/store.ts";
import type { TypedEvent } from "../protocol/events.ts";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { errors } from "undici";

const HOST = "10.0.0.1";
const BOOT_TIME = 1700000000000;

// A phrase unique to each of the lost line's sentences, so a reading by sentence tells a refused sign-in, a fault a person must fix and an unreachable controller
// apart.
const MUST_FIX_SENTENCE = "cannot be reached until its certificate or its address is fixed";
const REFUSAL_SENTENCE = "is refusing the sign-in";
const UNREACHABLE_SENTENCE = "appears unreachable";

// A test-controllable throttle source: the narrow surface the monitor consumes, plus a `set` knob that flips the verdict and emits the matching rail (mirroring the real
// transport's breaker, which only emits on an actual edge).
interface ThrottleControl extends ThrottleSource {

  set(next: boolean): void;
}

function fakeThrottle(initial = false): ThrottleControl {

  const bus = new EventBus<{ throttleEntered: []; throttleExited: [] }>(silentLog());

  let throttled = initial;

  return {

    get isThrottled(): boolean {

      return throttled;
    },

    on(event: "throttleEntered" | "throttleExited", handler: () => void): Disposable {

      return bus.on(event, handler);
    },

    set(next: boolean): void {

      if(next === throttled) {

        return;
      }

      throttled = next;
      bus.emit(next ? "throttleEntered" : "throttleExited");
    }
  };
}

// Encode a realtime packet the way the controller frames one - an action header plus a JSON data payload - so a test can drive a real decode through a stream.
function encode(header: Partial<{ action: string; id: string; modelKey: string }>, payload: object): Buffer {

  return buildPacket(jsonActionFrame(makeActionHeader(header)), jsonDataFrame(payload));
}

// A fake socket that runs a hook each time it is asked to close, which is how a row lands a disposal inside the teardown that close request belongs to.
class HookedWebSocket extends FakeWebSocket {

  readonly #onClose: () => void;

  constructor(onClose: () => void) {

    super();

    this.#onClose = onClose;
  }

  override close(): void {

    super.close();
    this.#onClose();
  }
}

// The captured events a test asserts against.
interface CapturedEvents {

  lost: ProtectError[];
  rebooted: { newUpSince: number; previousUpSince: number }[];
  recovered: number;
  throttleEntered: number;
  throttleExited: number;
  transitions: ConnectionTransition[];
}

// Build a ConnectionMonitor over fakes: a real StateStore (failsafe disabled, seeded with one bootstrap), a fake throttle source, an events-stream factory that hands out
// FakeWebSockets we can drive, and controllable verify / re-bootstrap hooks. Returns the monitor plus the levers a test pulls. `webSocket` builds the socket for the
// stream at a given position, the initial stream at zero and each relaunch after it, for a row whose relaunched socket must not open on its own. `setVerifyAction`
// hands each verify call, and the monitor's signal it carries, to a row that decides how the probe settles; null restores the verify error lever.
function harness(options: { initialUpSince?: number; log?: ProtectLogging; throttledAtStart?: boolean; webSocket?: (index: number) => FakeWebSocket } = {}): {
  clock: TestClock;
  control: {
    reBootstrapCalls: () => number;
    setNextUpSince: (value: number) => void;
    setReBootstrapError: (error: Error | null) => void;
    setVerifyAction: (action: ((signal?: AbortSignal) => Promise<void>) | null) => void;
    setVerifyError: (error: Error | null) => void;
    verifyCalls: () => number;
  };
  events: CapturedEvents;
  monitor: ConnectionMonitor;
  rawSunk: RawPacket[];
  store: StateStore;
  streams: FakeWebSocket[];
  sunk: TypedEvent[];
  throttle: ThrottleControl;
} {

  const clock = new TestClock();
  const log = options.log ?? silentLog();
  const initialUpSince = options.initialUpSince ?? BOOT_TIME;
  const store = new StateStore({ clock, log, refresh: (): Promise<never> => new Promise<never>(() => undefined), refreshIntervalMs: false });

  store.dispatch({ data: makeBootstrap({ nvr: makeNvr({ upSince: initialUpSince }) }), kind: "bootstrapLoaded" });

  const throttle = fakeThrottle(options.throttledAtStart ?? false);
  const streams: FakeWebSocket[] = [];
  const sunk: TypedEvent[] = [];
  const rawSunk: RawPacket[] = [];

  let verifyAction: ((signal?: AbortSignal) => Promise<void>) | null = null;
  let verifyCalls = 0;
  let verifyError: Error | null = null;
  let reBootstrapCalls = 0;
  let reBootstrapError: Error | null = null;
  let nextUpSince = initialUpSince;

  const verify = async (signal?: AbortSignal): Promise<void> => {

    verifyCalls++;

    if(verifyAction !== null) {

      return verifyAction(signal);
    }

    if(verifyError !== null) {

      throw verifyError;
    }
  };

  const reBootstrap = async (): Promise<string> => {

    reBootstrapCalls++;

    if(reBootstrapError !== null) {

      throw reBootstrapError;
    }

    store.dispatch({ data: makeBootstrap({ nvr: makeNvr({ upSince: nextUpSince }) }), kind: "bootstrapLoaded" });

    return "update-" + reBootstrapCalls.toString();
  };

  const eventStreamFactory = (lastUpdateId: string): EventStream => {

    const ws = options.webSocket?.(streams.length) ?? new FakeWebSocket();

    streams.push(ws);

    return new EventStream({ clock, host: HOST, lastUpdateId, log, webSocket: (): FakeWebSocket => ws });
  };

  const monitor = new ConnectionMonitor({

    clock,
    eventStreamFactory,
    initialLastUpdateId: "update-0",
    log,
    packetSink: (event: TypedEvent): void => void sunk.push(event),
    rawPacketSink: (packet: RawPacket): void => void rawSunk.push(packet),
    reBootstrap,
    store,
    transport: throttle,
    verify
  });

  const events: CapturedEvents = { lost: [], rebooted: [], recovered: 0, throttleEntered: 0, throttleExited: 0, transitions: [] };

  monitor.on("controllerLost", (reason): void => void events.lost.push(reason));
  monitor.on("controllerRebooted", (info): void => void events.rebooted.push(info));
  monitor.on("controllerRecovered", (): void => {

    events.recovered++;
  });
  monitor.on("throttleEntered", (): void => {

    events.throttleEntered++;
  });
  monitor.on("throttleExited", (): void => {

    events.throttleExited++;
  });
  monitor.on("stateChanged", (transition): void => void events.transitions.push(transition));

  return {

    clock,
    control: {

      reBootstrapCalls: (): number => reBootstrapCalls,
      setNextUpSince: (value: number): void => {

        nextUpSince = value;
      },
      setReBootstrapError: (error: Error | null): void => {

        reBootstrapError = error;
      },
      setVerifyAction: (action: ((signal?: AbortSignal) => Promise<void>) | null): void => {

        verifyAction = action;
      },
      setVerifyError: (error: Error | null): void => {

        verifyError = error;
      },
      verifyCalls: (): number => verifyCalls
    },
    events,
    monitor,
    rawSunk,
    store,
    streams,
    sunk,
    throttle
  };
}

// Let queued microtasks and the void recovery/observe loops settle, so the work a test sets in motion - a recovery attempt, the reboot watcher's wake on a dispatched
// bootstrap - runs to its next park before the test reads the outcome. The reboot watcher's store observer itself registers synchronously inside the monitor's
// constructor, because the `for await` in `#watchReboots` starts the observe generator's body at once, so it is in place before any test drives state.
function settle(): Promise<void> {

  return delay(10);
}

// Release the recovery loop's next scheduled probe. The loop parks on a single `clock.delay(delay)` between probes; the walk lets that delay register, advances
// past the steady floor to fire it (every unknown-track delay is at most the floor), and lets that probe's verify -> re-bootstrap -> relaunch run. Used by tests
// that assert recovery *progresses*, not the exact backoff durations - those read the timeline's next deadline or walk the schedule through `assertRecoveryDelays`.
// Known-track tests, whose first delay exceeds the floor, advance explicitly.
async function pump(clock: TestClock): Promise<void> {

  await advanceThroughSchedule(clock, [PROTECT_RECOVERY_STEADY_INTERVAL_MS]);
}

/* Read a recovery schedule behaviorally: for each expected delay, advancing by one less than it must not release the probe, and advancing the last millisecond must.
 * The expected delays come out of the exported constants, so a changed delay fails here loudly rather than passing against a restated number, and the label names
 * the walk in every assertion so a failure says which walk it was. Each probe in a walk fails, so it parks the loop on the next delay rather than ending recovery.
 */
async function assertRecoveryDelays(options: { delays: readonly number[]; label: string; rig: Pick<ReturnType<typeof harness>, "clock" | "control"> }): Promise<void> {

  const { clock, control } = options.rig;
  let probes = control.verifyCalls();

  for(const delay of options.delays) {

    if(delay > 0) {

      clock.advance(delay - 1);

      // eslint-disable-next-line no-await-in-loop
      await settle();

      assert.equal(control.verifyCalls(), probes, options.label + ": no probe runs before its scheduled delay of " + delay.toString() + " has elapsed");
    }

    clock.advance((delay > 0) ? 1 : 0);

    // eslint-disable-next-line no-await-in-loop
    await settle();

    assert.equal(control.verifyCalls(), probes + 1, options.label + ": the probe runs once its delay of " + delay.toString() + " has elapsed");
    probes += 1;
  }
}

// The level of each line carrying a phrase, at whatever level it was logged and in the order logged, so a row reads how many times each of the lost line's sentences
// was logged and at which level each time, in one assertion.
function lostLines(log: CapturingLogger, phrase: string): CapturedLogEntry["level"][] {

  return log.entries.filter((entry) => entry.message.includes(phrase)).map(({ level }) => level);
}

describe("ConnectionMonitor", () => {

  describe("initial state", () => {

    test("starts healthy once the initial events stream opens", async () => {

      const { monitor } = harness();

      await monitor.opened;

      assert.equal(monitor.state, "healthy");
      assert.equal(monitor.isHealthy, true);
      assert.equal(monitor.isThrottled, false);

      await monitor[Symbol.asyncDispose]();
    });
  });

  describe("throttle folding", () => {

    test("reflects the transport breaker as the derived state and forwards the rails", async () => {

      const { events, monitor, throttle } = harness();

      await monitor.opened;
      await settle();

      throttle.set(true);

      assert.equal(monitor.state, "throttled");
      assert.equal(monitor.isThrottled, true);
      assert.equal(monitor.isHealthy, false);
      assert.equal(events.throttleEntered, 1);
      assert.deepEqual(events.transitions.at(-1), { from: "healthy", to: "throttled" });

      throttle.set(false);

      assert.equal(monitor.state, "healthy");
      assert.equal(events.throttleExited, 1);
      assert.deepEqual(events.transitions.at(-1), { from: "throttled", to: "healthy" });

      await monitor[Symbol.asyncDispose]();
    });
  });

  describe("reboot detection", () => {

    test("fires controllerRebooted when the controller's boot time changes", async () => {

      const { events, monitor, store } = harness({ initialUpSince: 1000 });

      await monitor.opened;
      await settle();

      // A genuine reboot moves the boot time by at least the prior uptime - well beyond the noise floor.
      store.dispatch({ data: makeBootstrap({ nvr: makeNvr({ upSince: 100000 }) }), kind: "bootstrapLoaded" });

      await expectAt(() => events.rebooted.length === 1, { message: "expected a reboot to be detected" });
      assert.deepEqual(events.rebooted[0], { newUpSince: 100000, previousUpSince: 1000 });

      await monitor[Symbol.asyncDispose]();
    });

    test("logs the detected restart at info, plainly, without raw boot-time epochs", async () => {

      const log = capturingLog();
      const { events, monitor, store } = harness({ initialUpSince: 1000, log });

      await monitor.opened;
      await settle();

      store.dispatch({ data: makeBootstrap({ nvr: makeNvr({ upSince: 100000 }) }), kind: "bootstrapLoaded" });

      await expectAt(() => events.rebooted.length === 1, { message: "expected a reboot to be detected" });

      // The user-facing restart line is a plain info statement with no "self-reported boot time" wording and no raw upSince epochs; those values are carried by
      // the controllerRebooted event and the connectionRebootDetected channel for diagnostics instead.
      const restart = log.entries.find((entry) => entry.message.includes("The UniFi Protect controller restarted."));

      assert.ok(restart, "the restart was logged");
      assert.equal(restart.level, "info", "the detected restart logs at info, not warn");
      assert.equal(log.entries.some((entry) => entry.message.includes("self-reported boot time")), false, "the clunky boot-time wording is gone");

      await monitor[Symbol.asyncDispose]();
    });

    test("does not fire on sub-threshold upSince jitter", async () => {

      const { events, monitor, store } = harness({ initialUpSince: 1000 });

      await monitor.opened;
      await settle();

      // The controller reports upSince as a noisy measurement (observed millisecond jitter across bootstraps), not a stable epoch. A change below the noise floor
      // (PROTECT_REBOOT_DETECTION_THRESHOLD) is measurement noise, not a reboot, so none of these jittered values is reported.
      for(const jittered of [ 1003, 999, 1004, 1001 ]) {

        store.dispatch({ data: makeBootstrap({ nvr: makeNvr({ upSince: jittered }) }), kind: "bootstrapLoaded" });
      }

      await settle();
      assert.equal(events.rebooted.length, 0, "millisecond upSince jitter must not be reported as a reboot");

      await monitor[Symbol.asyncDispose]();
    });
  });

  describe("recovery", () => {

    test("a transient stall recovers without ever reporting the controller lost", async () => {

      const log = capturingLog();
      const { clock, control, events, monitor } = harness({ log });

      await monitor.opened;
      await settle();

      // Drive the events stream's silence watchdog: advance to its deadline and let it wake, so it concludes the channel stalled and faults.
      clock.advance(PROTECT_EVENTS_WATCHDOG_TIMEOUT);
      await settle();

      // The unknown-track schedule opens with a zero delay ("probe at once"); release it. The probe succeeds, so recovery walks straight back to healthy.
      await pump(clock);

      await expectAt(() => monitor.state === "healthy", { message: "expected recovery back to healthy" });

      assert.equal(events.lost.length, 0, "a reachable controller is never reported lost");
      assert.equal(events.recovered, 0, "controllerRecovered fires only after a genuine loss");

      // The transient relaunch confirms the stream reconnected at info (the else branch of #onRecovered), and must NOT fire the louder controller-level recovery line.
      assert.ok(log.entries.some((entry) => (entry.level === "info") && entry.message.includes("Reconnected the UniFi Protect realtime events stream.")),
        "a transient recovery confirms the events stream reconnected at info");
      assert.ok(!log.entries.some((entry) => entry.message.includes("Recovered the connection to the UniFi Protect controller.")),
        "a transient recovery does NOT log the controller-level recovery line");

      assert.equal(control.verifyCalls(), 1);
      assert.equal(control.reBootstrapCalls(), 1);

      // The state walked healthy -> degraded -> reconnecting -> healthy.
      const path = events.transitions.map((transition) => transition.to);

      assert.deepEqual(path, [ "degraded", "reconnecting", "healthy" ]);

      await monitor[Symbol.asyncDispose]();
    });

    test("an unreachable controller is reported lost, then recovered once it returns", async () => {

      const log = capturingLog();
      const { clock, control, events, monitor, streams } = harness({ log });

      await monitor.opened;
      await settle();

      // The controller is unreachable when recovery probes it.
      control.setVerifyError(new ProtectNetworkError("unreachable"));

      // Fault the live events socket to trigger recovery; the first probe fails, dropping the connection to lost.
      streams[0]?.emitError(new Error("socket dropped"));
      await pump(clock);

      await expectAt(() => monitor.state === "lost", { message: "expected the connection to be reported lost" });
      assert.equal(events.lost.length, 1);
      assert.ok(events.lost[0] instanceof ProtectError);

      // The controller returns; the next scheduled probe completes recovery.
      control.setVerifyError(null);
      await pump(clock);

      await expectAt(() => monitor.state === "healthy", { message: "expected recovery once the controller returned" });
      assert.equal(events.recovered, 1, "controllerRecovered fires after a genuine loss");
      assert.equal(events.lost.length, 1, "controllerLost fires once per lost episode, not per poll");

      // A genuine loss logs the louder controller-level recovery (the if branch of #onRecovered), and must NOT fire the transient stream-reconnected line.
      assert.ok(log.entries.some((entry) => (entry.level === "info") && entry.message.includes("Recovered the connection to the UniFi Protect controller.")),
        "a genuine loss logs the controller-level recovery at info");
      assert.ok(!log.entries.some((entry) => entry.message.includes("Reconnected the UniFi Protect realtime events stream.")),
        "a genuine loss does NOT log the transient stream-reconnected line");

      await monitor[Symbol.asyncDispose]();
    });

    test("a second loss of the same class after a recovered episode is announced again", async () => {

      const log = capturingLog();
      const { clock, control, events, monitor, streams } = harness({ log });

      await monitor.opened;
      await settle();

      // The first episode: the controller is unreachable when recovery probes it, so the connection is lost, and then it returns, so the episode recovers.
      control.setVerifyError(new ProtectNetworkError("unreachable"));
      streams[0]?.emitError(new Error("socket dropped"));
      await pump(clock);
      await expectAt(() => monitor.state === "lost", { message: "expected the first episode to be reported lost" });

      control.setVerifyError(null);
      await pump(clock);
      await expectAt(() => monitor.state === "healthy", { message: "expected the first episode to recover" });

      /* The second episode faults the stream recovery relaunched and finds the controller unreachable again, the same class of fault as the first. Recovery ended the
       * first episode, so this loss opens an episode of its own and is announced as one, rather than read as the first loss repeating.
       */
      control.setVerifyError(new ProtectNetworkError("unreachable again"));
      streams[1]?.emitError(new Error("socket dropped again"));
      await pump(clock);
      await expectAt(() => monitor.state === "lost", { message: "expected the second episode to be reported lost" });

      assert.equal(events.lost.length, 2, "controllerLost fires for each episode's loss");
      assert.deepEqual(lostLines(log, UNREACHABLE_SENTENCE), [ "warn", "warn" ], "and each loss logs its own line, at warning");

      await monitor[Symbol.asyncDispose]();
    });

    test("controllerLost fires once across several failed recovery polls", async () => {

      const { clock, control, events, monitor, streams } = harness();

      await monitor.opened;
      await settle();

      control.setVerifyError(new ProtectNetworkError("still down"));
      streams[0]?.emitError(new Error("socket dropped"));

      // First probe fails -> lost.
      await pump(clock);
      await expectAt(() => monitor.state === "lost", { message: "expected lost" });

      // Three more failed polls.
      await pump(clock);
      await pump(clock);
      await pump(clock);

      assert.equal(events.lost.length, 1, "lost is announced on the edge into lost, not on every failed poll");
      assert.ok(control.verifyCalls() >= 2, "recovery kept probing");

      await monitor[Symbol.asyncDispose]();
    });

    test("keeps polling and recovers after many consecutive failures - it never gives up while the monitor lives", async () => {

      const { clock, control, events, monitor, streams } = harness();

      await monitor.opened;
      await settle();

      // A controller that is slow to return makes verify fail across many polls. Recovery must keep retrying, not quit after a handful; while the monitor lives it never
      // gives up, so the firehose is never left dead. The backoff curve walks out to the steady floor and polls there forever; `pump` releases the next scheduled probe
      // each iteration regardless of which delay it is on.
      control.setVerifyError(new ProtectNetworkError("sluggish; timing out"));
      streams[0]?.emitError(new Error("socket dropped"));

      await pump(clock);
      await expectAt(() => monitor.state === "lost", { message: "expected lost" });

      for(let i = 0; i < 15; i++) {

        // eslint-disable-next-line no-await-in-loop
        await pump(clock);
      }

      assert.equal(monitor.state, "lost", "recovery is still polling after many failures");
      assert.ok(control.verifyCalls() >= 10, "recovery kept probing across every failure rather than giving up");

      // The controller finally responds; the next poll completes recovery.
      control.setVerifyError(null);
      await pump(clock);

      await expectAt(() => monitor.state === "healthy", { message: "expected recovery once the controller finally responded" });
      assert.equal(events.recovered, 1);

      await monitor[Symbol.asyncDispose]();
    });

    test("recovery probes and re-bootstraps even while the breaker is open - does not skip while throttled", async () => {

      const { clock, control, monitor, streams, throttle } = harness({ throttledAtStart: true });

      await monitor.opened;
      await settle();

      // Throttled while otherwise healthy, the breaker is the sole fault, so the derived state is throttled.
      assert.equal(monitor.state, "throttled");

      // Fault the events channel. Recovery must drive the probe at its own cadence regardless of the breaker, rather than skipping while throttled and waiting out its
      // cooldown - in production the verify hook carries probe:true so the send bypasses the cooldown gate; here we assert the monitor-level half: recovery actually
      // probes and re-bootstraps rather than skipping.
      streams[0]?.emitError(new Error("socket dropped"));
      await pump(clock);

      assert.ok(control.verifyCalls() >= 1, "recovery probed despite the breaker being open - the skip-while-throttled path is gone");
      assert.equal(control.reBootstrapCalls(), 1, "recovery re-bootstrapped through the open breaker rather than waiting out the cooldown");

      // In production a successful probe closes the breaker through its own booking (covered in http.test.ts); the harness's verify and throttle are independent fakes,
      // so we model that close explicitly. Once the breaker clears, the now-healthy recovery phase surfaces.
      throttle.set(false);

      await expectAt(() => monitor.state === "healthy", { message: "expected healthy once the breaker closed after a successful probe" });

      await monitor[Symbol.asyncDispose]();
    });
  });

  describe("recovery wake", () => {

    test("a detected reboot wakes the parked known-track wait so recovery relaunches without waiting out the backoff", async () => {

      const { clock, control, events, monitor, store, streams } = harness({ initialUpSince: 1000 });

      await monitor.opened;
      await settle();

      // Arm the known-reboot anticipation (what client.reboot() does once the controller accepts the reboot) and fault, so recovery enters the long known track and parks
      // on its multi-minute first delay before any probe.
      control.setVerifyError(new ProtectNetworkError("rebooting"));
      monitor.expectReboot();
      streams[0]?.emitError(new Error("socket dropped"));
      await settle();

      // The loop is parked on the known track's long first delay - sourced from the constant, never hardcoded. Without a wake, this parked wait is the only place the
      // recovery loop can leave from.
      assert.equal(clock.nextDeadline, clock.now() + present(PROTECT_RECOVERY_BACKOFF_KNOWN_MS[0], "the known track's first delay"),
        "a known reboot parks on the long first delay before its first probe");
      assert.equal(clock.pending, 1, "and recovery parks on that one wait alone");

      // The controller answers liveness again now that it has returned; the periodic bootstrap refresh observes the return as a boot-time jump. We hold the recovery
      // re-bootstrap on the same jumped value so it does not register a second spurious jump.
      control.setVerifyError(null);
      control.setNextUpSince(100000);
      store.dispatch({ data: makeBootstrap({ nvr: makeNvr({ upSince: 100000 }) }), kind: "bootstrapLoaded" });

      // Detection wakes the parked wait, so recovery relaunches and walks back to healthy WITHOUT advancing the clock by that first delay - only settle()s. This is the
      // distinguishing assertion: without the wake the loop cannot progress until a clock.advance(PROTECT_RECOVERY_BACKOFF_KNOWN_MS[0]).
      await expectAt(() => monitor.state === "healthy", { message: "expected the detected reboot to wake recovery and relaunch immediately" });

      assert.equal(streams.length, 2, "recovery relaunched the events stream on the wake rather than waiting out the backoff");
      assert.equal(events.rebooted.length, 1, "the reboot was detected exactly once");

      await monitor[Symbol.asyncDispose]();
    });

    test("disposal during a recovery wait ends recovery without relaunching", async () => {

      const { clock, control, monitor, streams } = harness();

      await monitor.opened;
      await settle();

      // Drive to lost so the loop is parked on its next backoff wait.
      control.setVerifyError(new ProtectNetworkError("down"));
      streams[0]?.emitError(new Error("socket dropped"));
      await pump(clock);

      await expectAt(() => monitor.state === "lost", { message: "expected lost with recovery parked on a wait" });

      const streamsBefore = streams.length;

      // The controller answers again before disposal, so a loop that fell through the aborted wait would pass its probe, re-bootstrap and relaunch. Disposal aborts the
      // monitor's lifetime controller, the wait's other composed signal, and the loop must read that as disposal rather than a wake and end: no re-bootstrap and no
      // relaunch are the reads that tell the two apart (a rejection-only check would be vacuous, since #attemptRecovery swallows its own error).
      control.setVerifyError(null);
      await monitor[Symbol.asyncDispose]();
      await settle();

      assert.equal(control.reBootstrapCalls(), 0, "disposal must not fall through to a re-bootstrap");
      assert.equal(streams.length, streamsBefore, "disposal must not relaunch the events stream - the loop distinguishes disposal from a wake");
      assert.equal(streams[0]?.closeRequested, true, "the live socket was closed on disposal");
    });

    test("a disposal that lands while a recovery probe is pending runs nothing of the loss: no phase change, edge, event or line", async () => {

      const log = capturingLog();
      const { clock, control, events, monitor, streams } = harness({ log });

      await monitor.opened;
      await settle();

      // The probe parks until the monitor's own signal aborts and then rejects, as the transport rejects a request whose caller's signal fired.
      control.setVerifyAction(async (signal?: AbortSignal): Promise<void> => {

        const { promise, reject } = Promise.withResolvers<undefined>();

        signal?.addEventListener("abort", () => reject(new ProtectAbortedError("The request was aborted by the caller's signal.", { cause: signal.reason })),
          { once: true });

        await promise;
      });

      streams[0]?.emitError(new Error("socket dropped"));
      await pump(clock);

      assert.equal(control.verifyCalls(), 1, "the recovery probe is pending");

      const lines = log.entries.length;
      const transitions = events.transitions.length;

      await monitor[Symbol.asyncDispose]();
      await settle();

      assert.equal(monitor.state, "degraded", "the probe's rejection drives no phase change");
      assert.equal(events.transitions.length, transitions, "and no edge");
      assert.deepEqual(events.lost, [], "and no controllerLost");
      assert.deepEqual(log.entries.slice(lines), [], "and no line");
    });

    test("a disposal that lands in the same turn a recovery probe resolves runs no reconnecting edge and no line", async () => {

      const log = capturingLog();
      const { clock, control, events, monitor, streams } = harness({ log });

      let disposal: Promise<void> | undefined;

      await monitor.opened;
      await settle();

      // The probe answers, and the disposal it starts aborts the monitor's signal synchronously, before that answer reaches the recovery attempt waiting on it.
      control.setVerifyAction(async (): Promise<void> => {

        disposal = monitor[Symbol.asyncDispose]();
      });

      streams[0]?.emitError(new Error("socket dropped"));

      const lines = log.entries.length;
      const transitions = events.transitions.length;

      await pump(clock);
      await disposal;
      await settle();

      assert.equal(control.verifyCalls(), 1, "the probe ran");
      assert.equal(control.reBootstrapCalls(), 0, "and nothing after it");
      assert.equal(events.transitions.length, transitions, "no reconnecting edge follows a disposal");
      assert.deepEqual(log.entries.slice(lines).filter((entry) => entry.level !== "debug"), [], "and no line announces a reconnect");
    });

    test("a disposal that lands while a relaunch tears its stream down builds no socket and announces no recovery", async () => {

      const log = capturingLog();

      let disposal: Promise<void> | undefined;
      let onClose = (): void => undefined;

      const { clock, control, events, monitor, streams } = harness({ log,
        webSocket: (index) => (index === 0) ? new HookedWebSocket(() => onClose()) : new FakeWebSocket() });

      await monitor.opened;
      await settle();

      // The controller is unreachable at first, so the episode reaches lost and a recovery would announce itself.
      control.setVerifyError(new ProtectNetworkError("down"));
      streams[0]?.emitError(new Error("socket dropped"));
      await pump(clock);

      await expectAt(() => monitor.state === "lost", { message: "expected the connection to be reported lost" });

      // The controller answers again, so the next attempt relaunches, and the relaunch's teardown of the faulted stream asks its socket to close, which is where the
      // disposal lands, once.
      control.setVerifyError(null);
      onClose = (): void => {

        onClose = (): void => undefined;
        disposal = monitor[Symbol.asyncDispose]();
      };

      await pump(clock);
      await disposal;
      await settle();

      assert.equal(control.reBootstrapCalls(), 1, "the attempt reached the relaunch");
      assert.equal(streams.length, 1, "a relaunch the disposal landed in builds no socket, which nothing would ever close");
      assert.equal(events.recovered, 0, "and announces no recovery");
      assert.ok(!events.transitions.some((transition) => transition.to === "healthy"), "and drives no edge back to healthy");
      assert.ok(!log.entries.some((entry) => entry.message.includes("Recovered the connection")), "and logs no recovery line");
    });
  });

  describe("fault log level", () => {

    test("a transient events-channel fault is reported at debug, not warn", async () => {

      const log = capturingLog();
      const { monitor, streams } = harness({ log });

      await monitor.opened;
      await settle();

      // A fault kicks the guarded recovery sequence. The "beginning recovery" notice is transient - a fault that immediately recovers is not warn-worthy - so it logs at
      // debug; the warn is reserved for the confirmed-loss tier.
      streams[0]?.emitError(new Error("socket dropped"));
      await settle();

      const fault = log.entries.find((entry) => entry.message.includes("The UniFi Protect realtime events channel faulted; beginning recovery."));

      assert.ok(fault, "the transient fault was logged");
      assert.equal(fault.level, "debug", "a transient events-channel fault logs at debug, not warn");

      await monitor[Symbol.asyncDispose]();
    });

    test("a confirmed connection loss is still reported at warn", async () => {

      const log = capturingLog();
      const { clock, control, monitor, streams } = harness({ log });

      await monitor.opened;
      await settle();

      // The controller is unreachable, so the first recovery probe fails and the monitor concludes the connection lost - the real-issue tier that stays at warn.
      control.setVerifyError(new ProtectNetworkError("unreachable"));
      streams[0]?.emitError(new Error("socket dropped"));
      await pump(clock);

      await expectAt(() => monitor.state === "lost", { message: "expected the failed probe to conclude the connection lost" });

      const loss = log.entries.find((entry) => entry.message.includes("The UniFi Protect controller appears unreachable;"));

      assert.ok(loss, "the confirmed loss was logged");
      assert.equal(loss.level, "warn", "a confirmed connection loss still warns");

      await monitor[Symbol.asyncDispose]();
    });

    /* The lost line's level by its cause, a row per cause: a fault a person must fix and a refused sign-in at error, each in its own sentence, and every fault that
     * heals itself at warning. A pool reset is among the last, the level table reading its kind as quiet while dialing, because a lost connection always matters to a
     * user and the line is never quieter than a warning.
     */
    const lossLevels: readonly { level: CapturedLogEntry["level"]; name: string; reason: ProtectError; sentence: string }[] = [

      { level: "error", name: "a certificate nothing trusts",
        reason: new ProtectCertificateError({ cause: errnoError("self-signed certificate", "DEPTH_ZERO_SELF_SIGNED_CERT"), host: HOST }), sentence: MUST_FIX_SENTENCE },
      { level: "error", name: "a host name that does not resolve",
        reason: new ProtectNetworkError("A network error occurred communicating with the UniFi Protect controller.",
          { cause: errnoError("getaddrinfo ENOTFOUND controller", "ENOTFOUND") }), sentence: MUST_FIX_SENTENCE },
      { level: "error", name: "a refused sign-in", reason: new ProtectAuthError("refused", { statusCode: 401 }), sentence: REFUSAL_SENTENCE },
      { level: "warn", name: "a reason carrying no code", reason: new ProtectNetworkError("unreachable"), sentence: UNREACHABLE_SENTENCE },
      { level: "warn", name: "a pool reset", reason: new ProtectNetworkError("The request was interrupted because the connection pool was reset.",
        { cause: new errors.ClientDestroyedError() }), sentence: UNREACHABLE_SENTENCE }
    ];

    for(const { level, name, reason, sentence } of lossLevels) {

      test("a loss on " + name + " is announced in its own sentence at " + level, async () => {

        const log = capturingLog();
        const { clock, control, events, monitor, streams } = harness({ log });

        await monitor.opened;
        await settle();

        control.setVerifyError(reason);
        streams[0]?.emitError(new Error("socket dropped"));
        await pump(clock);

        await expectAt(() => monitor.state === "lost", { message: "expected the failed probe to conclude the connection lost" });

        assert.deepEqual(lostLines(log, "the connection is lost"), [level], "the loss is announced once, at " + level);
        assert.deepEqual(lostLines(log, sentence), [level], "in the sentence its cause calls for");
        assert.deepEqual(events.lost, [reason], "and controllerLost carries the fault that concluded it");

        await monitor[Symbol.asyncDispose]();
      });
    }

    test("an episode that turns between an unreachable controller and a certificate verdict announces each turn at its level, while the network track runs on",
      async () => {

        const log = capturingLog();
        const { clock, control, events, monitor, streams } = harness({ log });
        const unreachable = new ProtectNetworkError("down");
        const certificate = new ProtectCertificateError({ cause: errnoError("self-signed certificate", "DEPTH_ZERO_SELF_SIGNED_CERT"), host: HOST });

        await monitor.opened;
        await settle();

        // The episode opens unreachable: the stream's own fault releases the first attempt at once, and it fails unreachable.
        control.setVerifyError(unreachable);
        streams[0]?.emitError(new Error("socket dropped"));
        await settle();
        await assertRecoveryDelays({ delays: PROTECT_RECOVERY_BACKOFF_UNKNOWN_MS.slice(0, 1), label: "while unreachable", rig: { clock, control } });

        // The controller turns to presenting a certificate nothing trusts, met on consecutive attempts. Neither class is a refusal, so the network track walks on.
        control.setVerifyError(certificate);
        await assertRecoveryDelays({ delays: PROTECT_RECOVERY_BACKOFF_UNKNOWN_MS.slice(1, 3), label: "while the certificate is refused", rig: { clock, control } });

        // And back to unreachable, its attempts released by the rest of the track and then its floor.
        control.setVerifyError(unreachable);
        await assertRecoveryDelays({ delays: [ ...PROTECT_RECOVERY_BACKOFF_UNKNOWN_MS.slice(3), PROTECT_RECOVERY_STEADY_INTERVAL_MS ], label: "once unreachable again",
          rig: { clock, control } });

        assert.deepEqual(log.entries.filter((entry) => entry.message.includes("the connection is lost")).map(({ level, message }) => ({ level, message })), [

          { level: "warn", message: "The UniFi Protect controller appears unreachable; the connection is lost and recovery is polling." },
          { level: "error",
            message: "The UniFi Protect controller cannot be reached until its certificate or its address is fixed; the connection is lost and recovery is polling." },
          { level: "warn", message: "The UniFi Protect controller appears unreachable; the connection is lost and recovery is polling." }
        ], "each turn of class is announced once, the certificate verdict met twice in a row announced once, at error with the sentence that asks for the fix");
        assert.deepEqual(events.lost, [ unreachable, certificate, unreachable ], "and controllerLost fires at each turn and only then");

        await monitor[Symbol.asyncDispose]();
      });
  });

  describe("backoff cadence", () => {

    test("the unknown track probes at once, then walks the staged delays out to the steady floor", async () => {

      const { clock, control, monitor, streams } = harness();

      await monitor.opened;
      await settle();

      // The probe keeps failing so the loop walks the whole schedule rather than completing early.
      control.setVerifyError(new ProtectNetworkError("down"));
      streams[0]?.emitError(new Error("socket dropped"));
      await settle();

      // The schedule is the staged unknown-track prefix, then the steady floor forever. Each probe fails, so each one parks the loop on the next delay of the walk.
      await assertRecoveryDelays({ delays: [ ...PROTECT_RECOVERY_BACKOFF_UNKNOWN_MS, PROTECT_RECOVERY_STEADY_INTERVAL_MS, PROTECT_RECOVERY_STEADY_INTERVAL_MS ],
        label: "the unknown track then the steady floor", rig: { clock, control } });

      await monitor[Symbol.asyncDispose]();
    });

    test("a known reboot enters the long, return-time-anticipating track", async () => {

      const { clock, control, monitor, streams } = harness();

      await monitor.opened;
      await settle();

      // Arm the known-reboot anticipation (what client.reboot() does after the controller accepts the reboot), then fault.
      control.setVerifyError(new ProtectNetworkError("rebooting"));
      monitor.expectReboot();
      streams[0]?.emitError(new Error("socket dropped"));
      await settle();

      // The first scheduled probe is the long initial wait, not the prompt zero.
      assert.equal(clock.nextDeadline, clock.now() + present(PROTECT_RECOVERY_BACKOFF_KNOWN_MS[0], "the known track's first delay"),
        "a known reboot waits out the controller's return before probing");
      assert.equal(clock.pending, 1, "and recovery parks on that one wait alone");

      // Walk the staged known-track delays, then the steady floor.
      await assertRecoveryDelays({ delays: [ ...PROTECT_RECOVERY_BACKOFF_KNOWN_MS, PROTECT_RECOVERY_STEADY_INTERVAL_MS ], label: "the known track then the steady floor",
        rig: { clock, control } });

      await monitor[Symbol.asyncDispose]();
    });
  });

  describe("reboot anticipation", () => {

    test("expectReboot is one-shot: a fault inside the window is known, the next fault is unknown", async () => {

      const { clock, control, monitor, store, streams } = harness({ initialUpSince: 1000 });

      await monitor.opened;
      await settle();

      control.setVerifyError(new ProtectNetworkError("rebooting"));
      monitor.expectReboot();
      streams[0]?.emitError(new Error("socket dropped"));
      await settle();

      // Consumed: the first fault took the known track.
      assert.equal(clock.nextDeadline, clock.now() + present(PROTECT_RECOVERY_BACKOFF_KNOWN_MS[0], "the known track's first delay"), "the armed fault is a known reboot");
      assert.equal(clock.pending, 1, "and recovery parks on that one wait alone");

      // The controller returns and a bootstrap observes its boot-time jump, which wakes the parked wait, so recovery completes without the clock advancing and the next
      // fault lands inside the anticipation window. The recovery re-bootstrap holds the jumped value so it registers no second jump.
      control.setVerifyError(null);
      control.setNextUpSince(100000);
      store.dispatch({ data: makeBootstrap({ nvr: makeNvr({ upSince: 100000 }) }), kind: "bootstrapLoaded" });
      await expectAt(() => monitor.state === "healthy", { message: "expected the detected reboot to wake recovery to healthy" });

      // A second, unarmed fault inside the window takes the prompt unknown track - the first fault consumed the anticipation.
      control.setVerifyError(new ProtectNetworkError("unsolicited drop"));
      streams.at(-1)?.emitError(new Error("socket dropped again"));
      await settle();

      assert.equal(clock.nextDeadline, clock.now() + present(PROTECT_RECOVERY_BACKOFF_UNKNOWN_MS[0], "the unknown track's first delay"),
        "an unarmed fault probes at once, not on the long curve");
      assert.equal(clock.pending, 1, "and recovery parks on that one wait alone");

      await monitor[Symbol.asyncDispose]();
    });

    test("an anticipation that expires before any fault falls back to the unknown track", async () => {

      const { clock, control, monitor, streams } = harness();

      await monitor.opened;
      await settle();

      // Arm, then let the window lapse with no fault.
      monitor.expectReboot();
      clock.advance(PROTECT_REBOOT_ANTICIPATION_WINDOW_MS + 1);

      // A fault now is unknown, not known - the stale anticipation must not mis-route it.
      control.setVerifyError(new ProtectNetworkError("much later, unrelated"));
      streams[0]?.emitError(new Error("socket dropped"));
      await settle();

      assert.equal(clock.nextDeadline, clock.now() + present(PROTECT_RECOVERY_BACKOFF_UNKNOWN_MS[0], "the unknown track's first delay"),
        "an expired anticipation falls back to the prompt track");
      assert.equal(clock.pending, 1, "and recovery parks on that one wait alone");

      await monitor[Symbol.asyncDispose]();
    });

    test("a backward step of the time of day leaves the anticipation lapsing once its window has passed", async () => {

      const { clock, control, monitor, streams } = harness();

      await monitor.opened;
      await settle();

      // Arm, then set the time of day back before the window passes. The window measures the time that passed, so it lapses on time, though the time of day still
      // reads inside it.
      monitor.expectReboot();
      clock.advance(-TIME_OF_DAY_STEP_MS);
      clock.advance(PROTECT_REBOOT_ANTICIPATION_WINDOW_MS);

      control.setVerifyError(new ProtectNetworkError("after the window"));
      streams[0]?.emitError(new Error("socket dropped"));
      await settle();

      assert.equal(clock.nextDeadline, clock.now() + present(PROTECT_RECOVERY_BACKOFF_UNKNOWN_MS[0], "the unknown track's first delay"),
        "a fault once the window has passed takes the prompt track");
      assert.equal(clock.pending, 1, "and recovery parks on that one wait alone");

      await monitor[Symbol.asyncDispose]();
    });
  });

  describe("the refusal schedule", () => {

    test("a refused identity or privilege walks the refusal schedule out to its floor", async () => {

      // Each refusal the recovery loop can be handed: the transport's classification of a refused identity and of a refused privilege.
      const refusals = [

        { error: new ProtectAuthError("refused", { statusCode: 401 }), label: "ProtectAuthError with status 401" },
        { error: new ProtectAuthorizationError("refused", { statusCode: 403 }), label: "ProtectAuthorizationError with status 403" }
      ];

      const walk = async (refusal: { error: Error; label: string }): Promise<void> => {

        const { clock, control, monitor, streams } = harness();

        await monitor.opened;
        await settle();

        control.setVerifyError(refusal.error);
        streams[0]?.emitError(new Error("socket dropped"));
        await settle();

        /* The episode opens on the stream's own fault, which is no refusal, so the first wait is the network schedule's first rung. The attempt it releases is
         * refused, and every wait from there walks the refusal schedule: each of its rungs in turn, then its floor, held for a second interval.
         */
        await assertRecoveryDelays({ delays: [ ...PROTECT_RECOVERY_BACKOFF_UNKNOWN_MS.slice(0, 1), ...PROTECT_RECOVERY_REFUSAL_SCHEDULE_MS.backoff,
          PROTECT_RECOVERY_REFUSAL_SCHEDULE_MS.steady, PROTECT_RECOVERY_REFUSAL_SCHEDULE_MS.steady ], label: refusal.label, rig: { clock, control } });

        await monitor[Symbol.asyncDispose]();
      };

      for(const refusal of refusals) {

        // Sequential by intent: each refusal walks its own monitor.
        // eslint-disable-next-line no-await-in-loop
        await walk(refusal);
      }
    });

    test("a controller that turns from unreachable to refusing walks the refusal schedule from its first rung", async () => {

      const { clock, control, monitor, streams } = harness();

      await monitor.opened;
      await settle();

      // Attempts fail unreachable, each released by the network schedule's next rung.
      control.setVerifyError(new ProtectNetworkError("down"));
      streams[0]?.emitError(new Error("socket dropped"));
      await settle();
      await assertRecoveryDelays({ delays: PROTECT_RECOVERY_BACKOFF_UNKNOWN_MS.slice(0, 2), label: "while unreachable", rig: { clock, control } });

      /* The controller turns to refusing. The wait already parked was chosen from the unreachable fault, so it runs out on the network schedule and releases the first
       * refused attempt; every wait after that walks the refusal schedule from its first rung rather than from the rung the network schedule had reached. The walk
       * runs out to the floor because the network and refusal schedules could agree at any single rung, and only the whole walk tells a schedule that switched from
       * one that never did.
       */
      control.setVerifyError(new ProtectAuthError("refused", { statusCode: 401 }));
      await assertRecoveryDelays({ delays: [ ...PROTECT_RECOVERY_BACKOFF_UNKNOWN_MS.slice(2, 3), ...PROTECT_RECOVERY_REFUSAL_SCHEDULE_MS.backoff,
        PROTECT_RECOVERY_REFUSAL_SCHEDULE_MS.steady, PROTECT_RECOVERY_REFUSAL_SCHEDULE_MS.steady ], label: "once refusing", rig: { clock, control } });

      await monitor[Symbol.asyncDispose]();
    });

    test("a controller that turns from refusing to unreachable walks the unknown track from its first rung", async () => {

      const { clock, control, monitor, streams } = harness();

      await monitor.opened;
      await settle();

      // The stream's own fault opens the episode on the network schedule's first rung, which releases the first refused attempt; the refusal schedule's opening
      // rungs follow, each releasing another refused attempt.
      control.setVerifyError(new ProtectAuthError("refused", { statusCode: 401 }));
      streams[0]?.emitError(new Error("socket dropped"));
      await settle();
      await assertRecoveryDelays({ delays: [ ...PROTECT_RECOVERY_BACKOFF_UNKNOWN_MS.slice(0, 1), ...PROTECT_RECOVERY_REFUSAL_SCHEDULE_MS.backoff.slice(0, 2) ],
        label: "while refusing", rig: { clock, control } });

      /* The controller stops refusing and becomes unreachable. The wait already parked was chosen from the refusal, so it runs out on the refusal schedule and
       * releases the first unreachable attempt; every wait after that walks the unknown track from its first rung, an immediate attempt, out to its floor.
       */
      control.setVerifyError(new ProtectNetworkError("down"));
      await assertRecoveryDelays({ delays: [ ...PROTECT_RECOVERY_REFUSAL_SCHEDULE_MS.backoff.slice(2, 3), ...PROTECT_RECOVERY_BACKOFF_UNKNOWN_MS,
        PROTECT_RECOVERY_STEADY_INTERVAL_MS, PROTECT_RECOVERY_STEADY_INTERVAL_MS ], label: "once unreachable", rig: { clock, control } });

      await monitor[Symbol.asyncDispose]();
    });

    test("a refusal on an episode that opened on the known track turns to the unknown track once the controller stops answering", async () => {

      const { clock, control, monitor, streams } = harness();

      await monitor.opened;
      await settle();

      // A known reboot opens the episode on the long track, and the attempt its first delay releases is refused.
      control.setVerifyError(new ProtectAuthError("refused", { statusCode: 401 }));
      monitor.expectReboot();
      streams[0]?.emitError(new Error("socket dropped"));
      await settle();
      await assertRecoveryDelays({ delays: PROTECT_RECOVERY_BACKOFF_KNOWN_MS.slice(0, 1), label: "the known track's first wait", rig: { clock, control } });

      /* The refusal's first rung releases an attempt that finds the controller unreachable. A refusal is the controller answering, so whatever reboot the known track
       * anticipated is over: the network schedule restarts on the unknown track at its first rung, an immediate attempt, rather than on the episode's own long track.
       */
      control.setVerifyError(new ProtectNetworkError("down"));
      await assertRecoveryDelays({ delays: [ ...PROTECT_RECOVERY_REFUSAL_SCHEDULE_MS.backoff.slice(0, 1), ...PROTECT_RECOVERY_BACKOFF_UNKNOWN_MS,
        PROTECT_RECOVERY_STEADY_INTERVAL_MS ], label: "a refusal, then unreachable", rig: { clock, control } });

      await monitor[Symbol.asyncDispose]();
    });

    test("an episode that opens on a refusal is announced once, as a refusal at error, across every rung it walks", async () => {

      const log = capturingLog();
      const { clock, control, events, monitor, streams } = harness({ log });

      await monitor.opened;
      await settle();

      control.setVerifyError(new ProtectAuthError("refused", { statusCode: 401 }));
      streams[0]?.emitError(new Error("socket dropped"));
      await settle();
      await assertRecoveryDelays({ delays: [ ...PROTECT_RECOVERY_BACKOFF_UNKNOWN_MS.slice(0, 1), ...PROTECT_RECOVERY_REFUSAL_SCHEDULE_MS.backoff,
        PROTECT_RECOVERY_REFUSAL_SCHEDULE_MS.steady, PROTECT_RECOVERY_REFUSAL_SCHEDULE_MS.steady ], label: "while refusing", rig: { clock, control } });

      const announced = log.entries.find((entry) => entry.message.includes("the connection is lost"));

      assert.equal(announced?.message,
        "The UniFi Protect controller is refusing the sign-in; the connection is lost and recovery is retrying on the slower refusal schedule.",
        "the lost line, found by the phrase every lost line shares, is the refusal sentence");
      assert.equal(announced.level, "error", "a refusal waits on a person to fix the credentials, so it logs at error");
      assert.deepEqual(lostLines(log, REFUSAL_SENTENCE), ["error"], "the refusal is announced once for the whole walk");
      assert.deepEqual(lostLines(log, UNREACHABLE_SENTENCE), [], "and never as an unreachable controller");
      assert.equal(events.lost.length, 1, "and controllerLost fires once for the episode");

      await monitor[Symbol.asyncDispose]();
    });

    test("a controller that turns from unreachable to refusing is announced once as each, in the lost line and on controllerLost", async () => {

      const log = capturingLog();
      const { clock, control, events, monitor, streams } = harness({ log });
      const unreachable = new ProtectNetworkError("down");
      const refusal = new ProtectAuthError("refused", { statusCode: 401 });

      await monitor.opened;
      await settle();

      // Attempts fail unreachable, each released by the network schedule's next rung.
      control.setVerifyError(unreachable);
      streams[0]?.emitError(new Error("socket dropped"));
      await settle();
      await assertRecoveryDelays({ delays: PROTECT_RECOVERY_BACKOFF_UNKNOWN_MS.slice(0, 2), label: "while unreachable", rig: { clock, control } });

      assert.deepEqual(lostLines(log, UNREACHABLE_SENTENCE), ["warn"], "the loss is announced once, at warning, while the controller is unreachable");
      assert.deepEqual(lostLines(log, REFUSAL_SENTENCE), [], "and not as a refusal");
      assert.equal(events.lost.length, 1, "controllerLost fires once while the controller is unreachable");
      assert.equal(events.lost[0], unreachable, "carrying the fault that concluded the loss");

      // The controller turns to refusing. The network wait already parked releases the first refused attempt, and the refusal schedule's opening rungs release more.
      control.setVerifyError(refusal);
      await assertRecoveryDelays({ delays: [ ...PROTECT_RECOVERY_BACKOFF_UNKNOWN_MS.slice(2, 3), ...PROTECT_RECOVERY_REFUSAL_SCHEDULE_MS.backoff.slice(0, 2) ],
        label: "once refusing", rig: { clock, control } });

      assert.deepEqual(lostLines(log, REFUSAL_SENTENCE), ["error"], "the turn to refusing is announced once, at error, across its attempts");
      assert.deepEqual(lostLines(log, UNREACHABLE_SENTENCE), ["warn"], "and the unreachable line is not repeated");
      assert.equal(events.lost.length, 2, "controllerLost fires again at the turn, and only then");
      assert.equal(events.lost[1], refusal, "carrying the refusal the loss turned to");

      await monitor[Symbol.asyncDispose]();
    });

    test("a controller that turns from refusing to unreachable is announced once as each, in the lost line and on controllerLost", async () => {

      const log = capturingLog();
      const { clock, control, events, monitor, streams } = harness({ log });
      const refusal = new ProtectAuthError("refused", { statusCode: 401 });
      const unreachable = new ProtectNetworkError("down");

      await monitor.opened;
      await settle();

      // The stream's own fault opens the episode on the network schedule's first rung, which releases the first refused attempt; the refusal schedule's opening rungs
      // release more.
      control.setVerifyError(refusal);
      streams[0]?.emitError(new Error("socket dropped"));
      await settle();
      await assertRecoveryDelays({ delays: [ ...PROTECT_RECOVERY_BACKOFF_UNKNOWN_MS.slice(0, 1), ...PROTECT_RECOVERY_REFUSAL_SCHEDULE_MS.backoff.slice(0, 2) ],
        label: "while refusing", rig: { clock, control } });

      assert.deepEqual(lostLines(log, REFUSAL_SENTENCE), ["error"], "the loss is announced once, at error, while the controller is refusing");
      assert.deepEqual(lostLines(log, UNREACHABLE_SENTENCE), [], "and not as an unreachable controller");
      assert.equal(events.lost.length, 1, "controllerLost fires once while the controller is refusing");
      assert.equal(events.lost[0], refusal, "carrying the refusal that concluded the loss");

      // The controller stops refusing and becomes unreachable. The refusal wait already parked releases the first unreachable attempt, and the unknown track's opening
      // rungs release more.
      control.setVerifyError(unreachable);
      await assertRecoveryDelays({ delays: [ ...PROTECT_RECOVERY_REFUSAL_SCHEDULE_MS.backoff.slice(2, 3), ...PROTECT_RECOVERY_BACKOFF_UNKNOWN_MS.slice(0, 2) ],
        label: "once unreachable", rig: { clock, control } });

      assert.deepEqual(lostLines(log, UNREACHABLE_SENTENCE), ["warn"], "the turn to unreachable is announced once, at warning, across its attempts");
      assert.deepEqual(lostLines(log, REFUSAL_SENTENCE), ["error"], "and the refusal line is not repeated");
      assert.equal(events.lost.length, 2, "controllerLost fires again at the turn, and only then");
      assert.equal(events.lost[1], unreachable, "carrying the fault the loss turned to");

      await monitor[Symbol.asyncDispose]();
    });

    test("a fault that keeps its class is announced once across repeated attempts, including attempts that pass through reconnecting", async () => {

      /* Each walk fails attempt after attempt with one class of fault after the controller answers the probe, so each attempt passes through reconnecting and drops
       * back to lost at the re-bootstrap. The loss is announced for the episode's first loss alone, in the lost line and on controllerLost alike, however many of those
       * drops follow, at the level its class logs at.
       */
      const walks: readonly { delays: readonly number[]; error: Error; label: string; level: CapturedLogEntry["level"]; otherSentence: string; sentence: string }[] = [

        { delays: [ ...PROTECT_RECOVERY_BACKOFF_UNKNOWN_MS.slice(0, 1), ...PROTECT_RECOVERY_REFUSAL_SCHEDULE_MS.backoff.slice(0, 3) ],
          error: new ProtectAuthError("refused", { statusCode: 401 }), label: "refused", level: "error", otherSentence: UNREACHABLE_SENTENCE,
          sentence: REFUSAL_SENTENCE },
        { delays: PROTECT_RECOVERY_BACKOFF_UNKNOWN_MS.slice(0, 4), error: new ProtectNetworkError("bootstrap unavailable"), label: "unreachable",
          level: "warn", otherSentence: REFUSAL_SENTENCE, sentence: UNREACHABLE_SENTENCE }
      ];

      const walk = async (options: (typeof walks)[number]): Promise<void> => {

        const log = capturingLog();
        const { clock, control, events, monitor, streams } = harness({ log });

        await monitor.opened;
        await settle();

        control.setReBootstrapError(options.error);
        streams[0]?.emitError(new Error("socket dropped"));
        await settle();
        await assertRecoveryDelays({ delays: options.delays, label: options.label, rig: { clock, control } });

        assert.equal(control.reBootstrapCalls(), options.delays.length, options.label + ": every attempt answered the probe and failed at the re-bootstrap");
        assert.deepEqual(lostLines(log, options.sentence), [options.level], options.label + ": the fault is announced once, at its level, across every attempt");
        assert.deepEqual(lostLines(log, options.otherSentence), [], options.label + ": and never in the other sentence");
        assert.equal(events.lost.length, 1, options.label + ": and controllerLost fires once for the episode");

        await monitor[Symbol.asyncDispose]();
      };

      for(const options of walks) {

        // Sequential by intent: each class walks its own monitor.
        // eslint-disable-next-line no-await-in-loop
        await walk(options);
      }
    });

    test("a refusal wrapped in a bootstrap error walks the refusal schedule and is announced as a refusal", async () => {

      const log = capturingLog();
      const { clock, control, events, monitor, streams } = harness({ log });

      await monitor.opened;
      await settle();

      /* A refused bootstrap read arrives wrapped in a bootstrap error at the fetch stage, so this refusal arrives that way: the probe answers, so each attempt passes
       * through reconnecting and fails at the re-bootstrap. The first wait was chosen from the stream's own fault, the network schedule's first rung, and the attempt
       * it releases lands the first wrapped refusal; every wait after that walks the refusal schedule out to its floor, held for a second interval.
       */
      control.setReBootstrapError(new ProtectBootstrapError("Unable to fetch the UniFi Protect controller bootstrap.",
        { cause: new ProtectAuthError("refused", { statusCode: 401 }), stage: "fetch" }));
      streams[0]?.emitError(new Error("socket dropped"));
      await settle();
      await assertRecoveryDelays({ delays: [ ...PROTECT_RECOVERY_BACKOFF_UNKNOWN_MS.slice(0, 1), ...PROTECT_RECOVERY_REFUSAL_SCHEDULE_MS.backoff,
        PROTECT_RECOVERY_REFUSAL_SCHEDULE_MS.steady, PROTECT_RECOVERY_REFUSAL_SCHEDULE_MS.steady ], label: "a wrapped refusal", rig: { clock, control } });

      assert.deepEqual(lostLines(log, REFUSAL_SENTENCE), ["error"], "the wrapped refusal is announced once, at error, for the whole walk");
      assert.deepEqual(lostLines(log, UNREACHABLE_SENTENCE), [], "and never as an unreachable controller");
      assert.equal(events.lost.length, 1, "and controllerLost fires once for the episode");

      await monitor[Symbol.asyncDispose]();
    });

    test("a refusal carried below a network fault is read as the network fault and walks the network schedule", async () => {

      const log = capturingLog();
      const { clock, control, monitor, streams } = harness({ log });

      await monitor.opened;
      await settle();

      // A bootstrap error is the one wrapper read by its cause, so a network fault that carries a refusal below it is read as the network fault it is.
      control.setVerifyError(new ProtectNetworkError("unreachable", { cause: new ProtectAuthError("refused", { statusCode: 401 }) }));
      streams[0]?.emitError(new Error("socket dropped"));
      await settle();
      await assertRecoveryDelays({ delays: [ ...PROTECT_RECOVERY_BACKOFF_UNKNOWN_MS, PROTECT_RECOVERY_STEADY_INTERVAL_MS, PROTECT_RECOVERY_STEADY_INTERVAL_MS ],
        label: "a refusal below a network fault", rig: { clock, control } });

      assert.deepEqual(lostLines(log, UNREACHABLE_SENTENCE), ["warn"], "the loss is announced once, at warning, as an unreachable controller");
      assert.deepEqual(lostLines(log, REFUSAL_SENTENCE), [], "and never as a refusal");

      await monitor[Symbol.asyncDispose]();
    });

    test("disposal while recovery is parked on the refusal schedule ends the loop without a further attempt", async () => {

      const { clock, control, monitor, streams } = harness();

      await monitor.opened;
      await settle();

      control.setVerifyError(new ProtectAuthError("refused", { statusCode: 401 }));
      streams[0]?.emitError(new Error("socket dropped"));
      await settle();
      await assertRecoveryDelays({ delays: PROTECT_RECOVERY_BACKOFF_UNKNOWN_MS.slice(0, 1), label: "the first attempt", rig: { clock, control } });

      await expectAt(() => monitor.state === "lost", { message: "expected the refused attempt to conclude the connection lost" });

      const attempts = control.verifyCalls();
      const before = streams.length;

      // The refused attempt parks recovery on the refusal schedule's first rung. Advancing to one short of it leaves the wait pending, which is where disposal lands.
      clock.advance(PROTECT_RECOVERY_REFUSAL_SCHEDULE_MS.backoff[0] - 1);
      await settle();

      assert.equal(control.verifyCalls(), attempts, "recovery is parked on the refusal schedule's first rung");

      // Disposal aborts the monitor's lifetime signal, the parked wait's other composed signal. Carrying the clock past the rung afterward is what shows the wait
      // ended with disposal rather than releasing its attempt on schedule.
      await monitor[Symbol.asyncDispose]();
      clock.advance(1);
      await settle();

      assert.equal(control.verifyCalls(), attempts, "disposal must not release a further attempt");
      assert.equal(streams.length, before, "disposal must not relaunch the stream");
      assert.equal(streams[0]?.closeRequested, true);
    });
  });

  describe("throttle precedence", () => {

    test("throttle shows only when it is the sole fault; the recovery phase takes precedence during recovery", async () => {

      const { clock, control, monitor, streams, throttle } = harness();

      await monitor.opened;
      await settle();

      // Breaker open while otherwise healthy: throttle is the sole fault, so it shows.
      throttle.set(true);
      assert.equal(monitor.state, "throttled");
      throttle.set(false);
      assert.equal(monitor.state, "healthy");

      // Drive the connection to lost and hold it there (the probe keeps failing).
      control.setVerifyError(new ProtectNetworkError("down"));
      streams[0]?.emitError(new Error("socket dropped"));
      await pump(clock);

      await expectAt(() => monitor.state === "lost", { message: "expected lost" });

      // The breaker opening during recovery does NOT mask the phase: the monitor (not the breaker) owns re-probing here, so lost remains the actionable state.
      throttle.set(true);
      assert.equal(monitor.state, "lost", "throttle does not overlay an active recovery phase");

      // Clearing it leaves the phase unchanged.
      throttle.set(false);
      assert.equal(monitor.state, "lost");

      await monitor[Symbol.asyncDispose]();
    });
  });

  describe("reboot during recovery", () => {

    test("a recovery re-bootstrap that carries a new boot time fires both rebooted and recovered", async () => {

      const { clock, control, events, monitor, streams } = harness({ initialUpSince: 1000 });

      await monitor.opened;
      await settle();

      control.setVerifyError(new ProtectNetworkError("rebooting"));
      control.setNextUpSince(100000);
      streams[0]?.emitError(new Error("socket dropped"));

      // First probe fails against the still-rebooting controller -> lost.
      await pump(clock);
      await expectAt(() => events.lost.length === 1, { message: "expected lost during the reboot" });

      // The controller finishes rebooting and answers; the next probe re-bootstraps, which carries the new boot time.
      control.setVerifyError(null);
      await pump(clock);

      await expectAt(() => monitor.state === "healthy", { message: "expected recovery after reboot" });
      assert.equal(events.recovered, 1);

      await expectAt(() => events.rebooted.length === 1, { message: "expected the reboot to be detected from the recovery bootstrap" });
      assert.deepEqual(events.rebooted[0], { newUpSince: 100000, previousUpSince: 1000 });

      await monitor[Symbol.asyncDispose]();
    });
  });

  describe("events relaunch", () => {

    test("re-attaches the packet bridge to the new stream and detaches the old one", async () => {

      const { clock, monitor, streams, sunk } = harness();

      await monitor.opened;
      await settle();

      // Transient stall -> recovery relaunches the events stream, building a second socket. The watchdog faults the channel; pump releases the prompt first probe.
      clock.advance(PROTECT_EVENTS_WATCHDOG_TIMEOUT);
      await settle();
      await pump(clock);

      await expectAt(() => monitor.state === "healthy", { message: "expected relaunch to complete" });
      assert.equal(streams.length, 2, "a fresh socket was built for the relaunch");

      // A packet on the new socket reaches the sink; the old socket is detached and delivers nothing.
      streams[1]?.emitMessage(encode({ action: "update", id: "camera-1", modelKey: "camera" }, { name: "Renamed" }));
      streams[0]?.emitMessage(encode({ action: "update", id: "camera-1", modelKey: "camera" }, { name: "Stale" }));

      await settle();

      assert.equal(sunk.length, 1, "only the live socket's packet is sunk");
      assert.equal(sunk[0]?.kind, "devicePatched");

      await monitor[Symbol.asyncDispose]();
    });

    test("re-attaches the raw-packet bridge to the new stream, carrying even the unmodeled frames the typed rail drops", async () => {

      const { clock, monitor, rawSunk, streams, sunk } = harness();

      await monitor.opened;
      await settle();

      // The same transient-stall relaunch as the packet-bridge test above.
      clock.advance(PROTECT_EVENTS_WATCHDOG_TIMEOUT);
      await settle();
      await pump(clock);

      await expectAt(() => monitor.state === "healthy", { message: "expected relaunch to complete" });
      assert.equal(streams.length, 2, "a fresh socket was built for the relaunch");

      // On the new socket, an unmodeled frame (garage) the classifier drops; on the old socket, one that must not leak. This single assertion guards several
      // regressions at once: the raw bridge re-attaching on relaunch (else rawSunk is empty), the old socket detaching (else rawSunk has two), and the raw rail
      // still carrying the frames the typed rail drops after a recovery (the rail's reason to exist) - exactly the breakage a packet-only relaunch test would miss.
      streams[1]?.emitMessage(encode({ action: "add", id: "g1", modelKey: "garage" }, { id: "g1" }));
      streams[0]?.emitMessage(encode({ action: "add", id: "g2", modelKey: "garage" }, { id: "g2" }));

      await settle();

      assert.equal(sunk.length, 0, "the unmodeled frame never reaches the typed sink");
      assert.equal(rawSunk.length, 1, "only the live socket's raw frame is sunk");
      assert.equal(rawSunk[0]?.header.modelKey, "garage");

      await monitor[Symbol.asyncDispose]();
    });

    test("a relaunched stream whose socket errors before it opens leaves the connection lost on the dial's own failure, with nothing on the rail", async () => {

      const log = capturingLog();
      const { clock, events, monitor, streams } = harness({ log, webSocket: (index) => new FakeWebSocket({ autoOpen: index === 0 }) });

      await monitor.opened;
      await settle();

      // The live socket faults; the probe and the re-bootstrap both answer, so recovery relaunches onto a second socket that has not opened yet.
      streams[0]?.emitError(new Error("socket dropped"));
      await pump(clock);

      assert.equal(streams.length, 2, "recovery relaunched onto a fresh socket");

      /* The fresh socket fails before it opens. The relaunch awaiting its handshake is the one reader of that failure: it marks the connection lost with the
       * classified failure, carrying the dial's class and code, and nothing reaches the error rail, so no second fault re-enters recovery.
       */
      const refused = errnoError("connect ECONNREFUSED " + HOST + ":443", "ECONNREFUSED");

      streams[1]?.emitError(refused);

      await expectAt(() => monitor.state === "lost", { message: "expected the failed relaunch to conclude the connection lost" });

      const [reason] = events.lost;

      assert.ok(reason instanceof ProtectNetworkError, "the loss carries the socket's classified failure");
      assert.equal(reason.code, "ECONNREFUSED", "with the dial's own code");
      assert.ok(Object.is(reason.cause, refused), "and the dial's own error as its cause");
      assert.equal(events.lost.length, 1);
      assert.equal(log.entries.filter((entry) => entry.message.includes("faulted; beginning recovery")).length, 1,
        "the relaunched socket's failure never reached the error rail, so only the first socket's fault began recovery");

      await monitor[Symbol.asyncDispose]();
    });
  });

  describe("verify()", () => {

    test("delegates to the injected probe and propagates its failure", async () => {

      const { control, monitor } = harness();

      await monitor.opened;

      await monitor.verify();
      assert.equal(control.verifyCalls(), 1);

      control.setVerifyError(new ProtectNetworkError("unreachable"));
      await assert.rejects(() => monitor.verify(), ProtectNetworkError);

      await monitor[Symbol.asyncDispose]();
    });
  });

  describe("observe()", () => {

    test("yields each state transition until the signal aborts", async () => {

      const { monitor, throttle } = harness();

      await monitor.opened;
      await settle();

      const controller = new AbortController();
      const seen: ConnectionState[] = [];

      const consumer = (async (): Promise<void> => {

        for await (const transition of monitor.observe({ signal: controller.signal })) {

          seen.push(transition.to);
        }
      })();

      await settle();
      throttle.set(true);
      throttle.set(false);

      await expectAt(() => seen.length === 2, { message: "expected two transitions observed" });
      assert.deepEqual(seen, [ "throttled", "healthy" ]);

      controller.abort();
      await consumer;

      await monitor[Symbol.asyncDispose]();
    });
  });

  describe("event rails", () => {

    test("once resolves on the next emission and stream yields the raw argument tuples", async () => {

      const { monitor, throttle } = harness();

      await monitor.opened;
      await settle();

      // once registers synchronously, so it catches the emission that follows.
      const entered = monitor.once("throttleEntered");

      throttle.set(true);
      await entered;

      const controller = new AbortController();
      const seen: ConnectionState[] = [];

      // The raw stream rail rejects with the abort reason when its signal fires (the node:events `on` contract that observe() wraps and smooths); a direct consumer
      // catches it.
      const consumer = (async (): Promise<void> => {

        try {

          for await (const [transition] of monitor.stream("stateChanged", { signal: controller.signal })) {

            seen.push(transition.to);
          }
        } catch {

          // The abort reason ends the iteration.
        }
      })();

      await settle();
      throttle.set(false);

      await expectAt(() => seen.length === 1, { message: "expected one streamed transition" });
      assert.deepEqual(seen, ["healthy"]);

      controller.abort();
      await consumer;

      await monitor[Symbol.asyncDispose]();
    });
  });

  describe("diagnostics", () => {

    test("publishes the transition, reboot, and reconnecting channels", async () => {

      const { clock, events, monitor, store } = harness({ initialUpSince: 1000 });

      const transitions: { from: string; to: string }[] = [];
      const reboots: { newUpSince: number; previousUpSince: number }[] = [];
      const reconnecting: { reason: string }[] = [];

      using transitionSubscription = subscribeToChannel(channels.connectionTransition, (payload) => void transitions.push(payload));
      using rebootSubscription = subscribeToChannel(channels.connectionRebootDetected, (payload) => void reboots.push(payload));
      using reconnectingSubscription = subscribeToChannel(channels.eventsReconnecting, (payload) => void reconnecting.push(payload));

      await monitor.opened;
      await settle();

      // A reboot bootstrap (a boot-time jump beyond the noise floor) fires the reboot channel with the jump's new and previous boot times.
      store.dispatch({ data: makeBootstrap({ nvr: makeNvr({ upSince: 100000 }) }), kind: "bootstrapLoaded" });
      await expectAt(() => reboots.length === 1, { message: "expected a reboot diagnostic" });
      assert.deepEqual(reboots, [{ newUpSince: 100000, previousUpSince: 1000 }]);

      // A stall and recovery fire the transition and reconnecting channels.
      clock.advance(PROTECT_EVENTS_WATCHDOG_TIMEOUT);
      await settle();
      await pump(clock);
      await expectAt(() => monitor.state === "healthy", { message: "expected recovery" });

      // The stall degrades the connection, the passing probe moves it to reconnecting, and the relaunch returns it to healthy; the bus rail carries the same transitions
      // the channel published.
      assert.deepEqual(transitions.map(({ from, to }) => [ from, to ]), [ [ "healthy", "degraded" ], [ "degraded", "reconnecting" ], [ "reconnecting", "healthy" ] ],
        "the transition channel published each step of the stall and its recovery");
      assert.equal(reconnecting.length, 1, "the reconnecting diagnostic was published once");
      assert.deepEqual(events.transitions, transitions);

      await monitor[Symbol.asyncDispose]();
    });
  });

  describe("the rendered failure text", () => {

    test("the stream fault's debug line carries the socket's own failure below the stream's sentence", async () => {

      const log = capturingLog();
      const { monitor, streams } = harness({ log });

      await monitor.opened;
      await settle();

      streams[0]?.emitError(new Error("socket dropped"));
      await settle();

      const faulted = log.entries.find((entry) => (entry.level === "debug") && entry.message.includes("faulted; beginning recovery"));

      assert.ok(faulted, "the fault that starts recovery is recorded at debug");
      assert.deepEqual(faulted.args, [{ reason: "The UniFi Protect realtime events API connection failed: socket dropped" }],
        "the stream's sentence carries the socket's own words below it rather than dropping them");

      await monitor[Symbol.asyncDispose]();
    });

    test("the lost line and the edge into lost both carry the failure's whole chain", async () => {

      const log = capturingLog();
      const { clock, control, events, monitor, streams } = harness({ log });

      await monitor.opened;
      await settle();

      control.setVerifyError(new ProtectNetworkError("The UniFi Protect controller could not be reached.", { cause: new Error("connect ECONNREFUSED") }));
      streams[0]?.emitError(new Error("socket dropped"));
      await pump(clock);

      await expectAt(() => monitor.state === "lost", { message: "expected the connection to be reported lost" });

      const announced = log.entries.find((entry) => entry.message.includes("the connection is lost"));

      assert.ok(announced, "the loss is announced");
      assert.deepEqual(announced.args, [{ reason: "The UniFi Protect controller could not be reached: connect ECONNREFUSED" }],
        "the lost line carries the errno the cause held rather than the wrapper's sentence alone");

      const intoLost = events.transitions.find((transition) => transition.to === "lost");

      assert.ok(intoLost, "the edge into lost is announced");
      assert.equal(intoLost.reason, "The UniFi Protect controller could not be reached: connect ECONNREFUSED",
        "a consumer reading the transition sees exactly what the lost line said");

      await monitor[Symbol.asyncDispose]();
    });

    test("the reconnecting diagnostic and the edge into degraded carry the fault's whole chain", async () => {

      const { clock, events, monitor, streams } = harness();
      const reconnecting: { reason: string }[] = [];

      using reconnectingSubscription = subscribeToChannel(channels.eventsReconnecting, (payload) => void reconnecting.push(payload));

      await monitor.opened;
      await settle();

      // The probe and the re-bootstrap both answer, so the fault drives the connection through degraded and reconnecting back to healthy.
      streams[0]?.emitError(new Error("socket dropped"));
      await pump(clock);

      await expectAt(() => monitor.state === "healthy", { message: "expected recovery back to healthy" });

      const rendered = "The UniFi Protect realtime events API connection failed: socket dropped";

      assert.deepEqual(reconnecting, [{ reason: rendered }], "the reconnecting diagnostic carries the socket's own words below the stream's sentence");
      assert.equal(events.transitions.find((transition) => transition.to === "degraded")?.reason, rendered, "and so does the edge into degraded");

      await monitor[Symbol.asyncDispose]();
    });
  });

  describe("consumer-code isolation", () => {

    test("a throwing controllerRebooted listener leaves reboot detection running", async () => {

      const { events, monitor, store } = harness({ initialUpSince: 1000 });

      await monitor.opened;
      await settle();

      // The harness's own listener registered first, so it records every reboot; this one throws on each, from inside the reboot watch's loop.
      using thrower = monitor.on("controllerRebooted", () => {

        throw new Error("the consumer's reboot handler failed");
      });

      store.dispatch({ data: makeBootstrap({ nvr: makeNvr({ upSince: 100000 }) }), kind: "bootstrapLoaded" });
      await expectAt(() => events.rebooted.length === 1, { message: "expected the first reboot to be detected" });

      // A watch the throw had ended would never see the second reboot.
      store.dispatch({ data: makeBootstrap({ nvr: makeNvr({ upSince: 200000 }) }), kind: "bootstrapLoaded" });
      await expectAt(() => events.rebooted.length === 2, { message: "expected the reboot watch to survive the throwing listener and detect the second reboot" });

      await monitor[Symbol.asyncDispose]();
    });

    test("a throwing controllerLost listener leaves recovery running to healthy", async () => {

      const { clock, control, events, monitor, streams } = harness();

      await monitor.opened;
      await settle();

      using thrower = monitor.on("controllerLost", () => {

        throw new Error("the consumer's loss handler failed");
      });

      control.setVerifyError(new ProtectNetworkError("unreachable"));
      streams[0]?.emitError(new Error("socket dropped"));
      await pump(clock);
      await expectAt(() => monitor.state === "lost", { message: "expected the connection to be reported lost" });

      // A recovery loop the throw had ended would leave the connection lost however long the controller had been back.
      control.setVerifyError(null);
      await pump(clock);

      await expectAt(() => monitor.state === "healthy", { message: "expected recovery to survive the throwing listener" });
      assert.equal(events.recovered, 1);

      await monitor[Symbol.asyncDispose]();
    });

    test("a throwing stateChanged listener leaves recovery and the transition diagnostics running", async () => {

      const { clock, monitor, streams } = harness();
      const transitions: { from: string; to: string }[] = [];

      using transitionSubscription = subscribeToChannel(channels.connectionTransition, (payload) => void transitions.push(payload));

      await monitor.opened;
      await settle();

      // The first edge a fault drives is the one into degraded, emitted before recovery starts, so a throw that escaped it would leave recovery unstarted.
      using thrower = monitor.on("stateChanged", () => {

        throw new Error("the consumer's transition handler failed");
      });

      streams[0]?.emitError(new Error("socket dropped"));
      await pump(clock);

      await expectAt(() => monitor.state === "healthy", { message: "expected recovery to survive the throwing listener" });
      assert.deepEqual(transitions.map(({ from, to }) => [ from, to ]), [ [ "healthy", "degraded" ], [ "degraded", "reconnecting" ], [ "reconnecting", "healthy" ] ],
        "the transition channel still published each step after the listener threw on it");

      await monitor[Symbol.asyncDispose]();
    });

    test("a throwing controllerRecovered listener is logged once and the recovered connection stays healthy", async () => {

      const log = capturingLog();
      const { clock, control, events, monitor, streams } = harness({ log });
      const failure = new Error("the consumer's recovery handler failed");

      await monitor.opened;
      await settle();

      using thrower = monitor.on("controllerRecovered", () => {

        throw failure;
      });

      control.setVerifyError(new ProtectNetworkError("unreachable"));
      streams[0]?.emitError(new Error("socket dropped"));
      await pump(clock);
      await expectAt(() => monitor.state === "lost", { message: "expected the connection to be reported lost" });

      control.setVerifyError(null);
      await pump(clock);
      await expectAt(() => monitor.state === "healthy", { message: "expected recovery to healthy" });

      // Read as a failed attempt, the throw would mark the relaunched connection lost again and cycle through a fresh relaunch on every steady interval.
      await pump(clock);
      await pump(clock);

      assert.equal(monitor.state, "healthy", "the recovered connection stays healthy");
      assert.equal(events.lost.length, 1, "the throw is not read as a fresh loss");
      assert.equal(streams.length, 2, "and drives no further relaunch");

      // The monitor's other lines share this logger, so the listener's line is read by its sentence.
      const thrown = log.entries.filter((entry) => (entry.level === "error") && (entry.message === "An event listener threw; the remaining listeners still run."));

      assert.equal(thrown.length, 1, "the throw is logged once, through the monitor's own logger");
      assert.deepEqual(thrown[0]?.args, [{ error: failure, event: "controllerRecovered" }], "naming the event the listener threw on");

      await monitor[Symbol.asyncDispose]();
    });
  });

  describe("teardown", () => {

    test("disposal closes the events stream and detaches every subscription", async () => {

      const { events, monitor, store, streams, throttle } = harness({ initialUpSince: 1000 });

      await monitor.opened;
      await settle();

      await monitor[Symbol.asyncDispose]();

      // The live socket was asked to close.
      assert.equal(streams[0]?.closeRequested, true);

      const transitionsBefore = events.transitions.length;
      const rebootsBefore = events.rebooted.length;

      // After disposal the throttle subscription is gone (no further transitions) and the reboot-observation loop has ended (no further reboot events).
      throttle.set(true);
      store.dispatch({ data: makeBootstrap({ nvr: makeNvr({ upSince: 9999 }) }), kind: "bootstrapLoaded" });

      await settle();

      assert.equal(events.transitions.length, transitionsBefore, "no transitions are emitted after disposal");
      assert.equal(events.rebooted.length, rebootsBefore, "the reboot loop ended at disposal");
    });
  });
});
