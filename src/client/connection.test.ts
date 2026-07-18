/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * connection.test.ts: Tests for ConnectionMonitor - the derived-state FSM, reboot detection via the controller's boot time, throttle/stall folding, and the guarded
 * auto-recovery sequence (verify -> re-bootstrap -> relaunch). Driven with a fake clock, a fake throttle source, and injected events-stream/verify/re-bootstrap seams,
 * so every path is exercised without a live controller.
 */
import type { ConnectionState, ConnectionTransition, ThrottleSource } from "./connection.ts";
import { PROTECT_EVENTS_WATCHDOG_TIMEOUT, PROTECT_REBOOT_ANTICIPATION_WINDOW_MS, PROTECT_RECOVERY_BACKOFF_KNOWN_MS, PROTECT_RECOVERY_BACKOFF_UNKNOWN_MS,
  PROTECT_RECOVERY_STEADY_INTERVAL_MS } from "../settings.ts";
import { ProtectError, ProtectNetworkError } from "../errors.ts";
import { buildPacket, jsonActionFrame, jsonDataFrame, makeActionHeader } from "../protocol/packet.helpers.ts";
import { capturingLog, expectAt, fakeClock, silentLog } from "../testing.helpers.ts";
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
import { channels } from "../diagnostics.ts";
import { setTimeout as delay } from "node:timers/promises";

const HOST = "10.0.0.1";
const BOOT_TIME = 1700000000000;

// A test-controllable throttle source: the narrow surface the monitor consumes, plus a `set` knob that flips the verdict and emits the matching rail (mirroring the real
// transport's breaker, which only emits on an actual edge).
interface ThrottleControl extends ThrottleSource {

  set(next: boolean): void;
}

function fakeThrottle(initial = false): ThrottleControl {

  const bus = new EventBus<{ throttleEntered: []; throttleExited: [] }>();

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
// FakeWebSockets we can drive, and controllable verify / re-bootstrap seams. Returns the monitor plus the levers a test pulls.
function harness(options: { initialUpSince?: number; log?: ProtectLogging; throttledAtStart?: boolean } = {}): {
  clock: ReturnType<typeof fakeClock>;
  control: {
    reBootstrapCalls: () => number;
    setNextUpSince: (value: number) => void;
    setReBootstrapError: (error: Error | null) => void;
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

  const clock = fakeClock();
  const log = options.log ?? silentLog();
  const initialUpSince = options.initialUpSince ?? BOOT_TIME;
  const store = new StateStore({ clock, log, refresh: (): Promise<never> => new Promise<never>(() => undefined), refreshIntervalMs: false });

  store.dispatch({ data: makeBootstrap({ nvr: makeNvr({ upSince: initialUpSince }) }), kind: "bootstrapLoaded" });

  const throttle = fakeThrottle(options.throttledAtStart ?? false);
  const streams: FakeWebSocket[] = [];
  const sunk: TypedEvent[] = [];
  const rawSunk: RawPacket[] = [];

  let verifyCalls = 0;
  let verifyError: Error | null = null;
  let reBootstrapCalls = 0;
  let reBootstrapError: Error | null = null;
  let nextUpSince = initialUpSince;

  const verify = async (): Promise<void> => {

    verifyCalls++;

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

    const ws = new FakeWebSocket();

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
  monitor.on("controllerRecovered", (): void => void events.recovered++);
  monitor.on("throttleEntered", (): void => void events.throttleEntered++);
  monitor.on("throttleExited", (): void => void events.throttleExited++);
  monitor.on("stateChanged", (transition): void => void events.transitions.push(transition));

  return {

    clock,
    control: {

      reBootstrapCalls: (): number => reBootstrapCalls,
      setNextUpSince: (value: number): void => void (nextUpSince = value),
      setReBootstrapError: (error: Error | null): void => void (reBootstrapError = error),
      setVerifyError: (error: Error | null): void => void (verifyError = error),
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

// Let queued microtasks and the void recovery/observe loops settle. The reboot-observation loop registers its store observer on a microtask after construction, so a
// short settle before driving state guarantees the observer is in place (an observer that registers after a dispatch would adopt the new value as its baseline and miss
// the change).
function settle(): Promise<void> {

  return delay(10);
}

// Release the recovery loop's next scheduled probe. The loop parks on a single `clock.wait(delay)` between probes; the leading settle guarantees that wait is registered,
// advancing past the steady floor fires it (every unknown-track delay is at most the floor), and the trailing settle lets that probe's verify -> re-bootstrap -> relaunch
// run. Used by tests that assert recovery *progresses*, not the exact backoff durations - those assert `clock.pendingWaits()` directly. Known-track tests, whose first
// delay exceeds the floor, advance explicitly.
async function pump(clock: ReturnType<typeof fakeClock>): Promise<void> {

  await settle();

  clock.advance(PROTECT_RECOVERY_STEADY_INTERVAL_MS);

  await settle();
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

      // The user-facing restart line is a plain info statement with no "self-reported boot time" wording and no raw upSince epochs; those values ride the
      // controllerRebooted event and the connectionRebootDetected channel for diagnostics instead.
      const restart = log.entries.find((entry) => entry.message.includes("The UniFi Protect controller restarted."));

      assert.ok(restart, "the restart was logged");
      assert.equal(restart?.level, "info", "the detected restart logs at info, not warn");
      assert.equal(log.entries.some((entry) => entry.message.includes("self-reported boot time")), false, "the clunky boot-time wording is gone");

      await monitor[Symbol.asyncDispose]();
    });

    test("does not fire when a refresh carries the same boot time", async () => {

      const { events, monitor, store } = harness({ initialUpSince: 1000 });

      await monitor.opened;
      await settle();

      // A drift-free refresh re-dispatches the same boot time; the primitive selector dedups, so no reboot is reported even though a bootstrap landed.
      store.dispatch({ data: makeBootstrap({ nvr: makeNvr({ upSince: 1000 }) }), kind: "bootstrapLoaded" });

      await settle();
      assert.equal(events.rebooted.length, 0);

      await monitor[Symbol.asyncDispose]();
    });

    test("does not fire on sub-threshold upSince jitter", async () => {

      const { events, monitor, store } = harness({ initialUpSince: 1000 });

      await monitor.opened;
      await settle();

      // The controller reports upSince as a noisy measurement (observed millisecond jitter across bootstraps), not a stable epoch. A change below the noise floor
      // (PROTECT_REBOOT_DETECTION_THRESHOLD) is measurement noise, not a reboot, so none of these jittered values is reported - this is the live-validation fix.
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

      // Drive the events stream's silence watchdog: advance past the window, then release the watchdog interval so it concludes the channel stalled and faults.
      clock.advance(PROTECT_EVENTS_WATCHDOG_TIMEOUT);
      await clock.tick();

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
      // cooldown - in production the verify seam carries probe:true so the send bypasses the cooldown gate; here we assert the monitor-level half: recovery actually
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
      assert.deepEqual(clock.pendingWaits(), [PROTECT_RECOVERY_BACKOFF_KNOWN_MS[0]], "a known reboot parks on the long first delay before its first probe");

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

      // Drive to lost so the loop is parked on its next backoff wait, with the probe still failing.
      control.setVerifyError(new ProtectNetworkError("down"));
      streams[0]?.emitError(new Error("socket dropped"));
      await pump(clock);

      await expectAt(() => monitor.state === "lost", { message: "expected lost with recovery parked on a wait" });

      const streamsBefore = streams.length;

      // Disposal aborts the monitor's lifetime controller, which is the wait's other composed signal. The loop must read that as disposal (not a wake) and END - it must
      // not fall through to a relaunch. This no-relaunch assertion is the check that tells disposal apart from a wake (a rejection-only check would be
      // vacuous, since #attemptRecovery swallows its own error).
      await monitor[Symbol.asyncDispose]();
      await settle();

      assert.equal(streams.length, streamsBefore, "disposal must not relaunch the events stream - the loop distinguishes disposal from a wake");
      assert.equal(streams[0]?.closeRequested, true, "the live socket was closed on disposal");
    });
  });

  describe("fault log level", () => {

    test("a transient events-channel fault is reported at debug, not warn", async () => {

      const log = capturingLog();
      const { monitor, streams } = harness({ log });

      await monitor.opened;
      await settle();

      // A fault kicks the guarded recovery sequence. The "beginning recovery" notice is transient - a fault that immediately recovers is not warn-worthy - so it now logs
      // at debug; the warn is reserved for the confirmed-loss tier.
      streams[0]?.emitError(new Error("socket dropped"));
      await settle();

      const fault = log.entries.find((entry) => entry.message.includes("The UniFi Protect realtime events channel faulted; beginning recovery."));

      assert.ok(fault, "the transient fault was logged");
      assert.equal(fault?.level, "debug", "a transient events-channel fault logs at debug, not warn");

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
      assert.equal(loss?.level, "warn", "a confirmed connection loss still warns");

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

      // The schedule is the staged unknown-track prefix, then the steady floor forever. We read the single pending wait before each release.
      const expected = [ ...PROTECT_RECOVERY_BACKOFF_UNKNOWN_MS, PROTECT_RECOVERY_STEADY_INTERVAL_MS, PROTECT_RECOVERY_STEADY_INTERVAL_MS ];
      const observed: number[] = [];

      for(const delay of expected) {

        observed.push((clock.pendingWaits())[0] ?? -1);

        // Fire exactly the pending wait, then let the failed probe register the next one.

        clock.advance(delay);

        // eslint-disable-next-line no-await-in-loop
        await settle();
      }

      assert.deepEqual(observed, expected, "the unknown track is [0, 5000, 15000, 30000] then the 60000 floor repeating");

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
      assert.deepEqual(clock.pendingWaits(), [PROTECT_RECOVERY_BACKOFF_KNOWN_MS[0]], "a known reboot waits out the controller's return before probing");

      // Walk the staged known-track delays, then the steady floor.
      const expected = [ ...PROTECT_RECOVERY_BACKOFF_KNOWN_MS, PROTECT_RECOVERY_STEADY_INTERVAL_MS ];
      const observed: number[] = [];

      for(const delay of expected) {

        observed.push((clock.pendingWaits())[0] ?? -1);


        clock.advance(delay);

        // eslint-disable-next-line no-await-in-loop
        await settle();
      }

      assert.deepEqual(observed, expected, "the known track is [300000, 120000] then the 60000 floor");

      await monitor[Symbol.asyncDispose]();
    });
  });

  describe("reboot anticipation", () => {

    test("expectReboot is one-shot: a fault inside the window is known, the next fault is unknown", async () => {

      const { clock, control, monitor, streams } = harness();

      await monitor.opened;
      await settle();

      control.setVerifyError(new ProtectNetworkError("rebooting"));
      monitor.expectReboot();
      streams[0]?.emitError(new Error("socket dropped"));
      await settle();

      // Consumed: the first fault took the known track.
      assert.deepEqual(clock.pendingWaits(), [PROTECT_RECOVERY_BACKOFF_KNOWN_MS[0]], "the armed fault is a known reboot");

      // Recover (the controller returns), so the episode ends and the anticipation is spent.
      control.setVerifyError(new ProtectNetworkError("down again"));
      clock.advance(PROTECT_RECOVERY_BACKOFF_KNOWN_MS[0] ?? 0);
      await settle();
      control.setVerifyError(null);

      // Drain the remaining known-track schedule until recovery succeeds.
      await expectAt(async () => {

        clock.advance(PROTECT_RECOVERY_STEADY_INTERVAL_MS + (PROTECT_RECOVERY_BACKOFF_KNOWN_MS[1] ?? 0));
        await settle();

        return monitor.state === "healthy";
      }, { message: "expected recovery to complete" });

      // A second, unarmed fault takes the prompt unknown track - the anticipation did not linger.
      control.setVerifyError(new ProtectNetworkError("unsolicited drop"));
      streams.at(-1)?.emitError(new Error("socket dropped again"));
      await settle();

      assert.deepEqual(clock.pendingWaits(), [PROTECT_RECOVERY_BACKOFF_UNKNOWN_MS[0]], "an unarmed fault probes at once, not on the long curve");

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

      assert.deepEqual(clock.pendingWaits(), [PROTECT_RECOVERY_BACKOFF_UNKNOWN_MS[0]], "an expired anticipation falls back to the prompt track");

      await monitor[Symbol.asyncDispose]();
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
      await clock.tick();
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
      await clock.tick();
      await pump(clock);

      await expectAt(() => monitor.state === "healthy", { message: "expected relaunch to complete" });
      assert.equal(streams.length, 2, "a fresh socket was built for the relaunch");

      // On the new socket, an unmodeled frame (garage) the classifier drops; on the old socket, one that must not leak. This single assertion guards three regressions
      // at once: the raw bridge re-attaching on relaunch (else rawSunk is empty), the old socket detaching (else rawSunk has two), and the raw rail still carrying the
      // frames the typed rail drops after a recovery (the rail's reason to exist) - exactly the breakage a packet-only relaunch test would miss.
      streams[1]?.emitMessage(encode({ action: "add", id: "g1", modelKey: "garage" }, { id: "g1" }));
      streams[0]?.emitMessage(encode({ action: "add", id: "g2", modelKey: "garage" }, { id: "g2" }));

      await settle();

      assert.equal(sunk.length, 0, "the unmodeled frame never reaches the typed sink");
      assert.equal(rawSunk.length, 1, "only the live socket's raw frame is sunk");
      assert.equal(rawSunk[0]?.header.modelKey, "garage");

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

      const onTransition = (message: unknown): void => void transitions.push(message as { from: string; to: string });
      const onReboot = (message: unknown): void => void reboots.push(message as { newUpSince: number; previousUpSince: number });
      const onReconnecting = (message: unknown): void => void reconnecting.push(message as { reason: string });

      channels.connectionTransition.subscribe(onTransition);
      channels.connectionRebootDetected.subscribe(onReboot);
      channels.eventsReconnecting.subscribe(onReconnecting);

      try {

        await monitor.opened;
        await settle();

        // A reboot bootstrap (a boot-time jump beyond the noise floor) fires the reboot channel.
        store.dispatch({ data: makeBootstrap({ nvr: makeNvr({ upSince: 100000 }) }), kind: "bootstrapLoaded" });
        await expectAt(() => reboots.length === 1, { message: "expected a reboot diagnostic" });

        // A stall and recovery fire the transition and reconnecting channels.
        clock.advance(PROTECT_EVENTS_WATCHDOG_TIMEOUT);
        await clock.tick();
        await pump(clock);
        await expectAt(() => monitor.state === "healthy", { message: "expected recovery" });

        assert.ok(transitions.length > 0, "transition diagnostics were published");
        assert.equal(reconnecting.length, 1, "the reconnecting diagnostic was published once");
        assert.ok(events.transitions.length > 0);
      } finally {

        channels.connectionTransition.unsubscribe(onTransition);
        channels.connectionRebootDetected.unsubscribe(onReboot);
        channels.eventsReconnecting.unsubscribe(onReconnecting);
      }

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

    test("disposal while a recovery poll is waiting unwinds the recovery loop cleanly", async () => {

      const { clock, control, monitor, streams } = harness();

      await monitor.opened;
      await settle();

      // Drive to lost so the recovery loop is parked on its next backoff wait.
      control.setVerifyError(new ProtectNetworkError("down"));
      streams[0]?.emitError(new Error("socket dropped"));
      await pump(clock);

      await expectAt(() => monitor.state === "lost", { message: "expected lost with recovery polling" });

      // Disposing aborts the monitor's controller, so the parked backoff wait rejects with an AbortError and the recovery loop unwinds without throwing.
      await monitor[Symbol.asyncDispose]();
      await settle();

      assert.equal(streams[0]?.closeRequested, true);
    });
  });
});
