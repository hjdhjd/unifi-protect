/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * clock.test.ts: Unit tests for the production wall clock and the deadline armed on it. The interface itself is the contract that lets every other module take time
 * as an injected dependency; here we verify the production implementation reads real time, that its delay resolves once its duration elapses and rejects cleanly
 * when its signal aborts, that its callback timer runs once after its duration, never once disposed, and holds the process open only when asked to, that a delay or
 * a timer past the platform timer's ceiling is carried in full rather than fired at once, that an infinite span arms nothing and never elapses, and that a deadline
 * armed on it aborts with the platform's own timeout reason and leaves the process free to exit while it is pending.
 */
import { TIMER_DELAY_MAX_MS, armDeadline, wallClock } from "./clock.ts";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { settle } from "homebridge-plugin-utils/testing";
import { settlement } from "./testing.helpers.ts";
import timersPromises from "node:timers/promises";

// The platform's active timers, read as a count. The runner holds timers of its own, so every reading is a delta against a synchronous sample, and nothing awaits
// between an arm and the read that follows it, so no other timer can enter or leave the list in between.
function activeTimers(): number {

  return process.getActiveResourcesInfo().filter((resource) => resource === "Timeout").length;
}

describe("wallClock", () => {

  test("now() returns the current wall-clock time", () => {

    const before = Date.now();
    const observed = wallClock.now();

    assert.ok((observed >= before) && (observed <= Date.now()), "now() should fall within the surrounding Date.now() readings");
  });

  test("delay resolves once its duration elapses", async () => {

    const controller = new AbortController();
    const before = Date.now();

    await wallClock.delay(5, { signal: controller.signal });

    assert.ok((Date.now() - before) >= 4, "delay should resolve no sooner than its duration (allowing for timer granularity)");
  });

  test("delay rejects with an AbortError when its signal aborts before its duration elapses", async () => {

    const controller = new AbortController();
    const pending = wallClock.delay(10000, { signal: controller.signal });

    controller.abort();

    await assert.rejects(pending, { code: "ABORT_ERR", name: "AbortError" });
  });

  test("schedule runs its callback once, after its duration elapses", async () => {

    const controller = new AbortController();
    const before = Date.now();
    const fired = Promise.withResolvers<number>();

    let calls = 0;

    using timer = wallClock.schedule((): void => {

      calls++;
      fired.resolve(Date.now());
    }, 5);

    const firedAt = await fired.promise;

    await wallClock.delay(20, { signal: controller.signal });

    assert.ok((firedAt - before) >= 4, "schedule should run its callback no sooner than its duration (allowing for timer granularity)");
    assert.equal(calls, 1, "a scheduled callback runs once, and not again across a further span of several times its duration");
  });

  test("disposing a scheduled timer before it fires cancels it", async () => {

    const controller = new AbortController();

    let calls = 0;

    const timer = wallClock.schedule((): void => {

      calls++;
    }, 5);

    timer[Symbol.dispose]();

    await wallClock.delay(20, { signal: controller.signal });

    assert.equal(calls, 0, "a timer disposed before its duration elapses never runs its callback");
  });

  test("a timer armed with unref is absent from the process's active timers, while one armed without it counts", () => {

    const sample = activeTimers();
    const referenced = wallClock.schedule((): void => undefined, 60000);

    assert.equal(activeTimers(), sample + 1, "a referenced timer holds the process open");

    referenced[Symbol.dispose]();

    assert.equal(activeTimers(), sample, "and disposing it releases the process again");

    using unreferenced = wallClock.schedule((): void => undefined, 60000, { unref: true });

    assert.equal(activeTimers(), sample, "an unreferenced timer stands pending without counting against the process");
  });

  test("the timer ceiling is the platform's 32-bit signed millisecond maximum", () => {

    // The rows past the ceiling state their windows through the constant, so they move with it rather than checking it. This row is the one place the number is
    // stated independently of the constant.
    assert.equal(TIMER_DELAY_MAX_MS, (2 ** 31) - 1, "the ceiling is the platform's own number, fixed outside this code");
  });

  test("a timer past the ceiling is carried as a chain of arms and fires at the requested moment", (t) => {

    t.mock.timers.enable({ apis: ["setTimeout"] });

    // One past the ceiling is the smallest window the platform would set to one millisecond.
    const fired: number[] = [];

    using timer = wallClock.schedule((): number => fired.push(1), TIMER_DELAY_MAX_MS + 1);

    t.mock.timers.tick(TIMER_DELAY_MAX_MS);

    assert.deepEqual(fired, [], "a ceiling's worth of time fires nothing, because the first hop re-arms for the remainder instead of running the callback");

    t.mock.timers.tick(1);

    assert.deepEqual(fired, [1], "the remainder elapsing runs the callback, at exactly the moment asked for");

    t.mock.timers.tick(TIMER_DELAY_MAX_MS + 1);

    assert.deepEqual(fired, [1], "and a chained timer fires once");
  });

  test("disposing a chained timer mid-chain cancels the hop that is live, so nothing fires later", (t) => {

    t.mock.timers.enable({ apis: ["setTimeout"] });

    // Two ceilings and a little more, so the chain has three hops; the disposal lands while the second is armed. A disposer that still held the first hop's handle
    // would clear a timer that has already fired and leave the live one to run the chain to its end.
    const fired: number[] = [];
    const timer = wallClock.schedule((): number => fired.push(1), (2 * TIMER_DELAY_MAX_MS) + 5);

    t.mock.timers.tick(TIMER_DELAY_MAX_MS + 2);
    timer[Symbol.dispose]();

    // The mock times a hop armed inside a callback from the end of the tick that ran the callback, so the chain's last hop needs a tick of its own to be reachable at
    // all; a disposer that still held the first hop's handle would let the chain run on and fire here.
    t.mock.timers.tick((2 * TIMER_DELAY_MAX_MS) + 5);
    t.mock.timers.tick(10);

    assert.deepEqual(fired, [], "the chain is cancelled at whichever hop is live, and no later hop fires");
  });

  test("a delay past the ceiling awaits the promise primitive once per hop and resolves at the requested moment", async (t) => {

    // The promise primitive is read off the module object at call time, which is what lets the mock reach it here; a wait bound by a named import would run on the
    // real timers regardless of the mock.
    t.mock.timers.enable({ apis: ["setTimeout"] });

    const controller = new AbortController();
    let resolved = false;

    const waited = wallClock.delay(TIMER_DELAY_MAX_MS + 1, { signal: controller.signal }).then((): void => {

      resolved = true;
    });

    t.mock.timers.tick(TIMER_DELAY_MAX_MS);
    await settle();

    assert.equal(resolved, false, "a ceiling's worth of time resolves nothing: the first hop's continuation awaits the remainder");

    t.mock.timers.tick(1);
    await waited;

    assert.equal(resolved, true, "the remainder elapsing resolves the delay, at exactly the moment asked for");
  });

  test("each shape past the ceiling arms without the platform's overflow warning, and an abort mid-chain rejects the delay with its AbortError", async () => {

    // The platform announces a delay it has set to one millisecond through a process warning, emitted on a later turn, so the read below yields a macrotask first.
    const warnings: string[] = [];
    const observe = (warning: Error): number => warnings.push(warning.name);

    process.on("warning", observe);

    try {

      using timer = wallClock.schedule((): void => undefined, TIMER_DELAY_MAX_MS + 1, { unref: true });

      const controller = new AbortController();
      const waited = wallClock.delay(TIMER_DELAY_MAX_MS + 1, { signal: controller.signal });

      await settle();

      assert.deepEqual(warnings, [], "neither shape armed past the ceiling draws the platform's overflow warning, because each armed at most the ceiling");

      controller.abort();

      await assert.rejects(waited, { code: "ABORT_ERR", name: "AbortError" });
    } finally {

      process.off("warning", observe);
    }
  });

  test("an infinite delay arms no timer, holds one abort listener, and rejects with the primitive's AbortError carrying the reason once its signal aborts", async (t) => {

    // The spy sits on the module object the delay reads the promise primitive from at call time, and calls through, so its count is the delay's own arms.
    const primitive = t.mock.method(timersPromises, "setTimeout");
    const controller = new AbortController();
    const reason = new Error("the wait's owner ended it");
    const sample = activeTimers();
    const waited = wallClock.delay(Infinity, { signal: controller.signal });
    const settled = settlement(waited);

    await settle();

    assert.equal(settled(), false, "an infinite delay stays pending");
    assert.equal(activeTimers(), sample, "holding no timer, so it keeps nothing open");
    assert.equal(primitive.mock.callCount(), 0, "and arming nothing on the promise primitive while it waits");
    assert.equal(getEventListeners(controller.signal, "abort").length, 1, "holding one abort listener on its signal");

    controller.abort(reason);

    await assert.rejects(waited, { cause: reason, code: "ABORT_ERR", name: "AbortError" });
    assert.equal(primitive.mock.callCount(), 1, "the abort hands the signal to the promise primitive once, which rejects without arming anything");
    assert.equal(getEventListeners(controller.signal, "abort").length, 0, "and the listener leaves with the abort that fired it");
  });

  test("an infinite delay whose signal has already aborted rejects at once with the same AbortError, registering no listener", async () => {

    const controller = new AbortController();
    const reason = new Error("the wait's owner ended it before it began");

    controller.abort(reason);

    const waited = wallClock.delay(Infinity, { signal: controller.signal });
    const settled = settlement(waited);

    await settle();

    assert.equal(settled(), true, "a signal already aborted settles the wait within one turn");
    assert.equal(getEventListeners(controller.signal, "abort").length, 0, "with no listener registered");

    await assert.rejects(waited, { cause: reason, code: "ABORT_ERR", name: "AbortError" });
  });

  test("an infinite schedule, referenced or unreferenced, arms nothing, never fires, and its disposer clears nothing", async (t) => {

    // The spies call through, so any timer an arm reached would still run. The real wait below is the promise primitive, which never reads the global timers, so
    // every count is the schedules' own.
    const globalSetTimeout = t.mock.method(globalThis, "setTimeout");
    const globalClearTimeout = t.mock.method(globalThis, "clearTimeout");
    const controller = new AbortController();
    const sample = activeTimers();
    const fired: string[] = [];

    using referenced = wallClock.schedule((): number => fired.push("referenced"), Infinity);
    using unreferenced = wallClock.schedule((): number => fired.push("unreferenced"), Infinity, { unref: true });

    assert.equal(activeTimers(), sample, "neither window holds a timer, whatever unref says");
    assert.equal(globalSetTimeout.mock.callCount(), 0, "because neither arms the global setTimeout");

    await wallClock.delay(20, { signal: controller.signal });

    assert.deepEqual(fired, [], "neither fires across a real wait, where the platform's own arm would have fired each after a millisecond");

    referenced[Symbol.dispose]();
    unreferenced[Symbol.dispose]();

    assert.equal(globalClearTimeout.mock.callCount(), 0, "and disposing each clears nothing, because nothing was armed");
  });

  test("armDeadline with no clock named arms on the wall clock and aborts with a TimeoutError once its duration elapses", async () => {

    const before = Date.now();
    const aborted = Promise.withResolvers<undefined>();

    using deadline = armDeadline(5);

    deadline.signal.addEventListener("abort", () => aborted.resolve(undefined), { once: true });

    await aborted.promise;

    // The one thing this library adds is the bridge to the platform's primitive, so the assertions are the bridge's: the reason the deadline carries, and that it
    // was a real wait rather than an immediate abort. The platform's own contract is not re-verified here.
    assert.ok(deadline.signal.reason instanceof DOMException, "the deadline aborts with a DOMException, the class the platform's own deadline carries");
    assert.equal(deadline.signal.reason.name, "TimeoutError", "the deadline aborts with the platform's timeout reason");
    assert.ok((Date.now() - before) >= 4, "the deadline should fire no sooner than its duration (allowing for timer granularity)");
  });

  test("a deadline pending on the wall clock leaves the process free to exit, and its disposal leaves its signal live", () => {

    const sample = activeTimers();
    const deadline = armDeadline(60000);

    assert.equal(activeTimers(), sample, "the deadline's timer stands pending without holding the process open");

    deadline[Symbol.dispose]();

    assert.equal(deadline.signal.aborted, false, "a deadline released before its span elapses never aborts");
  });
});
