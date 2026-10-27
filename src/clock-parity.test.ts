/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * clock-parity.test.ts: Differential tests holding this library's clock to homebridge-plugin-utils' clock. The library takes no runtime dependency on
 * homebridge-plugin-utils, so `armDeadline` and the production clock's handling of the platform timer's range are implemented in both places; this suite is what
 * keeps them one behavior. It runs a table of scenarios - the behaviors homebridge-plugin-utils' own suite asserts of its deadline - through each over a fresh
 * `TestClock`, and asserts the same observations come back: the clock's ledger, the deadline's signal, and the class, message, and name of the reason it aborts
 * with. It runs a second table through `wallClock` and homebridge-plugin-utils' `systemClock` under node:test's mock timers - spans below the ceiling, at it and
 * past it, a chain disposed or aborted mid-hop, and an infinite span - and asserts each fires and settles at the moment asked for, and at the same moment on both.
 * A change to either side reddens it here, and a divergence is a divergence from homebridge-plugin-utils' shape, resolved by reading its clock, never by loosening
 * the assertion. Beside the scenarios, the compiler holds homebridge-plugin-utils' `TestClock` and `systemClock` to this library's `Clock`, so a consumer may inject
 * either.
 */
import type { Assert, Extends } from "homebridge-plugin-utils/testing";
import type { Clock, Deadline } from "./clock.ts";
import { TIMER_DELAY_MAX_MS, armDeadline, wallClock } from "./clock.ts";
import { TestClock, settle } from "homebridge-plugin-utils/testing";
import { armDeadline as armWithPluginUtils, systemClock } from "homebridge-plugin-utils";
import { describe, test } from "node:test";
import type { Nullable } from "./types/index.ts";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";

/* A member of the contract read as a function type rather than as the method signature it is declared with. Method signatures compare their parameters in both
 * directions, so a clock whose `delay` demanded more of its init than the contract offers would still assign to `Clock` whole; a function type compares them in one
 * direction only, so the member lines below are what hold each clock's parameters to the contract's.
 */
type AsFunction<Member> = Member extends (...args: infer Parameters) => infer Result ? (...args: Parameters) => Result : never;

// Each of homebridge-plugin-utils' clocks assigns to this library's `Clock` whole, and member by member through the function-typed reading.
const _testClockIsAClock: Clock = new TestClock();
const _systemClockIsAClock: Clock = systemClock;

type _DelayConforms = Assert<Extends<TestClock["delay"] | (typeof systemClock)["delay"], AsFunction<Clock["delay"]>>>;
type _NowConforms = Assert<Extends<TestClock["now"] | (typeof systemClock)["now"], AsFunction<Clock["now"]>>>;
type _ScheduleConforms = Assert<Extends<TestClock["schedule"] | (typeof systemClock)["schedule"], AsFunction<Clock["schedule"]>>>;

type ArmDeadline = (ms: number, options: { clock: TestClock }) => Deadline;

interface DeadlineObservation {

  readonly aborted: boolean;
  readonly nextDeadline: Nullable<number>;
  readonly pending: number;
  readonly reason: Nullable<{ readonly constructor: unknown; readonly message: string; readonly name: string }>;
  readonly requested: readonly number[];
}

interface DeadlineScenario {

  readonly name: string;
  readonly run: (clock: TestClock, arm: ArmDeadline) => DeadlineObservation;
}

function observe(clock: TestClock, deadline: Deadline): DeadlineObservation {

  const reason: unknown = deadline.signal.reason;

  return {

    aborted: deadline.signal.aborted,
    nextDeadline: clock.nextDeadline,
    pending: clock.pending,
    reason: (reason instanceof DOMException) ? { constructor: reason.constructor, message: reason.message, name: reason.name } : null,
    requested: [...clock.requested]
  };
}

const DEADLINE_SCENARIOS: readonly DeadlineScenario[] = [

  { name: "a deadline advanced short of its span", run: (clock: TestClock, arm: ArmDeadline): DeadlineObservation => {

    const deadline = arm(500, { clock });

    clock.advance(499);

    return observe(clock, deadline);
  } },

  { name: "a deadline advanced across its span", run: (clock: TestClock, arm: ArmDeadline): DeadlineObservation => {

    const deadline = arm(500, { clock });

    clock.advance(500);

    return observe(clock, deadline);
  } },

  { name: "a deadline disposed and then advanced across its span", run: (clock: TestClock, arm: ArmDeadline): DeadlineObservation => {

    const deadline = arm(500, { clock });

    deadline[Symbol.dispose]();
    clock.advance(1000);

    return observe(clock, deadline);
  } },

  { name: "a deadline advanced across its span and then disposed twice", run: (clock: TestClock, arm: ArmDeadline): DeadlineObservation => {

    const deadline = arm(100, { clock });

    clock.advance(100);
    deadline[Symbol.dispose]();
    deadline[Symbol.dispose]();

    return observe(clock, deadline);
  } }
];

describe("armDeadline parity with homebridge-plugin-utils", () => {

  for(const { name, run } of DEADLINE_SCENARIOS) {

    test(name + " leaves the same state behind as homebridge-plugin-utils' deadline does", () => {

      assert.deepEqual(run(new TestClock(), armDeadline), run(new TestClock(), armWithPluginUtils), "the two deadlines agree on " + name);
    });
  }
});

/* The members of a clock that arm time, which is all a timer scenario drives. Both clocks assign to this library's `Clock`, as the lines at the top hold, so each
 * runs the same scenario code.
 */
type ArmingClock = Pick<Clock, "delay" | "schedule">;

// A scenario moves the mock's time through its tick, which lets the queue come to rest after each step, and records each event through its log.
type Tick = (ms: number) => Promise<void>;
type Log = (event: string) => void;

interface TimerScenario {

  readonly expected: readonly string[];
  readonly name: string;
  readonly run: (clock: ArmingClock, tick: Tick, log: Log) => Promise<void>;
}

// The reason every aborting scenario aborts with, so a rejection's cause is read as the reason handed in rather than one the primitive made up.
const ABORT_REASON = new Error("the scenario ended the wait");

// Record how a wait settled: resolved, or rejected with the shape of its error and whether that error carries the reason the scenario aborted with.
function watch(wait: Promise<void>, log: Log, label: string): void {

  void wait.then((): void => log(label + " resolved"), (error: unknown): void => {

    const { cause, code, name } = error as { cause?: unknown; code?: unknown; name?: unknown };

    log(label + " rejected with " + String(name) + " " + String(code) + ((cause === ABORT_REASON) ? " carrying the reason" : " without the reason"));
  });
}

// An event as the log records it, at the instant the mocked `Date` reads.
const at = (event: string, instant: number): string => event + " at " + String(instant);

const TIMER_SCENARIOS: readonly TimerScenario[] = [

  {

    expected:[ at("checkpoint", 999), at("one-shot fired", 1000), at("delay resolved", 1000) ],
    name: "a one-shot and a delay below the ceiling",
    run: async (clock: ArmingClock, tick: Tick, log: Log): Promise<void> => {

      using timer = clock.schedule((): void => log("one-shot fired"), 1000);

      watch(clock.delay(1000, { signal: new AbortController().signal }), log, "delay");
      await tick(999);
      log("checkpoint");
      await tick(1);
    }
  },

  {

    expected:[ at("checkpoint", TIMER_DELAY_MAX_MS - 1), at("one-shot fired", TIMER_DELAY_MAX_MS), at("delay resolved", TIMER_DELAY_MAX_MS) ],
    name: "a one-shot and a delay at the ceiling",
    run: async (clock: ArmingClock, tick: Tick, log: Log): Promise<void> => {

      using timer = clock.schedule((): void => log("one-shot fired"), TIMER_DELAY_MAX_MS);

      watch(clock.delay(TIMER_DELAY_MAX_MS, { signal: new AbortController().signal }), log, "delay");
      await tick(TIMER_DELAY_MAX_MS - 1);
      log("checkpoint");
      await tick(1);
    }
  },

  {

    expected:[ at("checkpoint", TIMER_DELAY_MAX_MS), at("one-shot fired", TIMER_DELAY_MAX_MS + 1), at("delay resolved", TIMER_DELAY_MAX_MS + 1) ],
    name: "a one-shot and a delay one hop past the ceiling",
    run: async (clock: ArmingClock, tick: Tick, log: Log): Promise<void> => {

      using timer = clock.schedule((): void => log("one-shot fired"), TIMER_DELAY_MAX_MS + 1);

      watch(clock.delay(TIMER_DELAY_MAX_MS + 1, { signal: new AbortController().signal }), log, "delay");
      await tick(TIMER_DELAY_MAX_MS);
      log("checkpoint");
      await tick(1);
    }
  },

  {

    expected:[ at("checkpoint", (3 * TIMER_DELAY_MAX_MS) + 6), at("one-shot fired", (3 * TIMER_DELAY_MAX_MS) + 7), at("delay resolved", (3 * TIMER_DELAY_MAX_MS) + 7) ],
    name: "a one-shot and a delay several hops past the ceiling",
    run: async (clock: ArmingClock, tick: Tick, log: Log): Promise<void> => {

      using timer = clock.schedule((): void => log("one-shot fired"), (3 * TIMER_DELAY_MAX_MS) + 7);

      watch(clock.delay((3 * TIMER_DELAY_MAX_MS) + 7, { signal: new AbortController().signal }), log, "delay");

      // Each hop is crossed on its own, so the hop it releases arms its successor before virtual time moves again.
      await tick(TIMER_DELAY_MAX_MS);
      await tick(TIMER_DELAY_MAX_MS);
      await tick(TIMER_DELAY_MAX_MS);
      await tick(6);
      log("checkpoint");
      await tick(1);
    }
  },

  {

    expected:[at("checkpoint", (3 * TIMER_DELAY_MAX_MS) + 17)],
    name: "a chained one-shot disposed mid-chain",
    run: async (clock: ArmingClock, tick: Tick, log: Log): Promise<void> => {

      const timer = clock.schedule((): void => log("one-shot fired"), (2 * TIMER_DELAY_MAX_MS) + 5);

      await tick(TIMER_DELAY_MAX_MS + 2);
      timer[Symbol.dispose]();
      await tick((2 * TIMER_DELAY_MAX_MS) + 5);
      await tick(10);
      log("checkpoint");
    }
  },

  {

    expected:[at("delay rejected with AbortError ABORT_ERR carrying the reason", TIMER_DELAY_MAX_MS + 2)],
    name: "a delay aborted mid-hop",
    run: async (clock: ArmingClock, tick: Tick, log: Log): Promise<void> => {

      const controller = new AbortController();

      watch(clock.delay((2 * TIMER_DELAY_MAX_MS) + 5, { signal: controller.signal }), log, "delay");
      await tick(TIMER_DELAY_MAX_MS + 2);
      controller.abort(ABORT_REASON);
      await tick(0);
    }
  },

  {

    expected:[ at("checkpoint", 2 * TIMER_DELAY_MAX_MS), at("delay rejected with AbortError ABORT_ERR carrying the reason", 2 * TIMER_DELAY_MAX_MS) ],
    name: "an infinite delay and an infinite one-shot, referenced and unreferenced",
    run: async (clock: ArmingClock, tick: Tick, log: Log): Promise<void> => {

      const controller = new AbortController();

      using referenced = clock.schedule((): void => log("referenced one-shot fired"), Infinity);
      using unreferenced = clock.schedule((): void => log("unreferenced one-shot fired"), Infinity, { unref: true });

      watch(clock.delay(Infinity, { signal: controller.signal }), log, "delay");
      await tick(TIMER_DELAY_MAX_MS);
      await tick(TIMER_DELAY_MAX_MS);
      log("checkpoint");
      controller.abort(ABORT_REASON);
      await tick(0);
    }
  }
];

/* Run one scenario on one clock under node:test's mock timers, reading each event's instant off the mocked `Date`, and answer the events in the order they came.
 * Both clocks read the global callback timer and the promise primitive at call time, so the mock reaches every arm either makes, and each run starts the mock's
 * time at zero and leaves it reset, so the second clock runs on the timeline the first did.
 */
async function runUnderMockTimers(context: TestContext, clock: ArmingClock, scenario: TimerScenario): Promise<string[]> {

  const events: string[] = [];

  context.mock.timers.enable({ apis: [ "setTimeout", "Date" ], now: 0 });

  try {

    await scenario.run(clock, async (ms: number): Promise<void> => {

      context.mock.timers.tick(ms);
      await settle();
    }, (event: string): number => events.push(at(event, Date.now())));
  } finally {

    context.mock.timers.reset();
  }

  return events;
}

describe("the production clock's timers, parity with homebridge-plugin-utils' systemClock", () => {

  for(const scenario of TIMER_SCENARIOS) {

    test(scenario.name + " fire and settle at the same instants on both clocks", async (t) => {

      const local = await runUnderMockTimers(t, wallClock, scenario);
      const shared = await runUnderMockTimers(t, systemClock, scenario);

      assert.deepEqual(local, scenario.expected, "the wall clock answers " + scenario.name + " at the moments asked for");
      assert.deepEqual(local, shared, "and homebridge-plugin-utils' clock answers it at the same moments");
    });
  }
});
