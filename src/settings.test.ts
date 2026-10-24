/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * settings.test.ts: Unit tests for the project-wide constants in settings.ts. The constants are externally observable behavior - the error limit and retry interval
 * govern how aggressively the client retries against a controller, the API timeout bounds each request, the bootstrap refresh interval is the failsafe cadence, the
 * events watchdog timeout governs degraded-connection detection, and the heartbeat timeout governs livestream watchdog timing. Asserting each value keeps an
 * accidental edit (a misplaced zero, a unit confusion) from silently changing behavior on every consumer.
 */
import * as settings from "./settings.ts";
import { PROTECT_API_ERROR_LIMIT, PROTECT_API_RETRY_INTERVAL, PROTECT_API_TIMEOUT, PROTECT_BOOTSTRAP_REFRESH_INTERVAL, PROTECT_CAPTURE_DEFAULT_DURATION,
  PROTECT_CAPTURE_SNAPSHOT_EXEMPLARS, PROTECT_EVENTS_WATCHDOG_TIMEOUT, PROTECT_LIVESTREAM_HEARTBEAT_TIMEOUT, PROTECT_REBOOT_ANTICIPATION_WINDOW_MS,
  PROTECT_REBOOT_DETECTION_THRESHOLD, PROTECT_RECOVERY_BACKOFF_KNOWN_MS, PROTECT_RECOVERY_BACKOFF_UNKNOWN_MS,
  PROTECT_RECOVERY_STEADY_INTERVAL_MS } from "./settings.ts";
import { describe, test } from "node:test";
import assert from "node:assert/strict";

describe("settings", () => {

  // The error limit and retry interval together encode the throttling contract: 10 consecutive errors trigger a 300-second backoff.
  test("PROTECT_API_ERROR_LIMIT is 10", () => {

    assert.equal(PROTECT_API_ERROR_LIMIT, 10, "error limit must be 10 to match the documented backoff contract");
  });

  test("PROTECT_API_RETRY_INTERVAL is 300 seconds", () => {

    assert.equal(PROTECT_API_RETRY_INTERVAL, 300, "retry interval must be 300 seconds to match the documented backoff contract");
  });

  // The API timeout is documented as "should never be greater than 5000 ms" - we lock both the value and the upper bound so future tuning can change the value but a
  // regression that pushes it past the ceiling gets a loud failure with the spec citation visible in the diff.
  test("PROTECT_API_TIMEOUT is 3500 ms and at most 5000 ms", () => {

    assert.equal(PROTECT_API_TIMEOUT, 3500, "API timeout must be 3500 ms");

    // The constant's literal type makes the linter read a direct comparison as always true, and a number-typed local changes only how the linter reads it, leaving the
    // comparison itself unchanged.
    const timeout: number = PROTECT_API_TIMEOUT;

    assert.ok(timeout <= 5000, "API timeout must never exceed the documented 5000 ms ceiling");
  });

  test("PROTECT_BOOTSTRAP_REFRESH_INTERVAL is 120000 ms", () => {

    assert.equal(PROTECT_BOOTSTRAP_REFRESH_INTERVAL, 120000, "bootstrap refresh failsafe must run on the documented 120-second cadence");
  });

  test("PROTECT_EVENTS_WATCHDOG_TIMEOUT is 300000 ms", () => {

    assert.equal(PROTECT_EVENTS_WATCHDOG_TIMEOUT, 300000, "events watchdog must trip at the documented 300-second silence threshold");
  });

  test("PROTECT_LIVESTREAM_HEARTBEAT_TIMEOUT is 10000 ms", () => {

    assert.equal(PROTECT_LIVESTREAM_HEARTBEAT_TIMEOUT, 10000, "livestream heartbeat timeout must be 10000 ms");
  });

  // The reboot-detection threshold sits far above the controller's observed millisecond upSince jitter and far below any realistic reboot delta (the prior uptime,
  // minutes to hours), so it cleanly separates measurement noise from a genuine restart. Live validation surfaced the value and holds it fixed here.
  test("PROTECT_REBOOT_DETECTION_THRESHOLD is 5000 ms", () => {

    assert.equal(PROTECT_REBOOT_DETECTION_THRESHOLD, 5000, "reboot-detection noise floor must be 5000 ms");
  });

  // The recovery steady floor is the shared "recover without slamming" cadence both backoff tracks walk out to.
  test("PROTECT_RECOVERY_STEADY_INTERVAL_MS is 60000 ms", () => {

    assert.equal(PROTECT_RECOVERY_STEADY_INTERVAL_MS, 60000, "the recovery steady floor must be the documented 60-second cadence");
  });

  // The known-reboot track is the long, return-time-anticipating curve: wait 5 minutes, then +2 minutes, before falling through to the steady floor.
  test("PROTECT_RECOVERY_BACKOFF_KNOWN_MS is [300000, 120000]", () => {

    assert.deepEqual(PROTECT_RECOVERY_BACKOFF_KNOWN_MS, [ 300000, 120000 ], "the known-reboot track must wait 5 minutes then 2 minutes before the floor");
  });

  // The unknown track is the prompt curve: probe at once (the leading zero), then walk the delay out toward the steady floor.
  test("PROTECT_RECOVERY_BACKOFF_UNKNOWN_MS is [0, 5000, 15000, 30000]", () => {

    assert.deepEqual(PROTECT_RECOVERY_BACKOFF_UNKNOWN_MS, [ 0, 5000, 15000, 30000 ], "the unknown track must probe at once then walk out to the floor");
  });

  test("PROTECT_REBOOT_ANTICIPATION_WINDOW_MS is 60000 ms", () => {

    assert.equal(PROTECT_REBOOT_ANTICIPATION_WINDOW_MS, 60000, "the reboot anticipation window must be the documented 60 seconds");
  });

  // The exemplar cap decides how much of an unmodeled collection a capture bundle carries, which is a privacy question as much as a size one: a handful of records
  // shows the shape of a device class, while a larger sample starts describing the site the bundle came from.
  test("PROTECT_CAPTURE_SNAPSHOT_EXEMPLARS is 3", () => {

    assert.equal(PROTECT_CAPTURE_SNAPSHOT_EXEMPLARS, 3, "a capture must carry three exemplar records of an unmodeled collection");
  });

  // Coherence of the recovery cadence: the unknown track must lead with a prompt probe (its leading zero), every staged backoff delay must be a non-negative integer, and
  // the steady floor must sit below the watchdog and throttle windows so recovery is prompt relative to the failures it responds to. These relationships - not just the
  // individual values - are the contract; a future edit that, say, set the floor above the watchdog would make recovery slower than the detection it answers.
  test("the recovery curves are coherent: prompt unknown lead, non-negative integer delays, floor below the watchdog and the breaker cooldown", () => {

    assert.equal(PROTECT_RECOVERY_BACKOFF_UNKNOWN_MS[0], 0, "the unknown track must probe at once on the fault");

    for(const delay of [ ...PROTECT_RECOVERY_BACKOFF_KNOWN_MS, ...PROTECT_RECOVERY_BACKOFF_UNKNOWN_MS ]) {

      assert.ok((delay >= 0) && Number.isInteger(delay), "every staged backoff delay must be a non-negative integer, got " + String(delay));
    }

    // Each constant's literal type makes the linter read a direct comparison as always true, and number-typed locals change only how the linter reads it, leaving the
    // comparison itself unchanged.
    const steadyFloor: number = PROTECT_RECOVERY_STEADY_INTERVAL_MS;
    const watchdogWindow: number = PROTECT_EVENTS_WATCHDOG_TIMEOUT;

    assert.ok(steadyFloor < watchdogWindow, "the steady floor must be prompt relative to the events watchdog window");
    assert.ok(PROTECT_RECOVERY_STEADY_INTERVAL_MS < (PROTECT_API_RETRY_INTERVAL * 1000), "the steady floor must be faster than the breaker's autonomous cooldown");
  });

  // Sanity: every scalar the module exports must be a finite positive integer. A negative, fractional or NaN value would indicate a typo and would corrupt the timing
  // logic in subtle ways the per-value tests might miss. The row reads the module's own namespace, so a scalar without a per-value test is checked all the same, and an
  // export that is neither a number nor an array fails here rather than being passed over. An array export is read only as an array.
  test("every exported scalar constant is a finite positive integer", () => {

    for(const [ name, value ] of Object.entries(settings)) {

      if(Array.isArray(value)) {

        continue;
      }

      assert.equal(typeof value, "number", name + " must be a number or an array, got " + typeof value);
      assert.ok(Number.isInteger(value), name + " must be an integer, got " + String(value));
      assert.ok(value > 0, name + " must be positive, got " + String(value));
      assert.ok(Number.isFinite(value), name + " must be finite, got " + String(value));
    }
  });

  // The capture window is a documented user-facing default, so it is asserted like the rest: fifteen minutes is long enough to span several air-quality reading cycles,
  // which is what makes a default-length capture useful for a slow-reporting sensor rather than merely non-empty.
  test("PROTECT_CAPTURE_DEFAULT_DURATION is 15 minutes", () => {

    assert.equal(PROTECT_CAPTURE_DEFAULT_DURATION, 900000, "the capture window must be 15 minutes expressed in milliseconds");
  });
});
