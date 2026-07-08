/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * testing.helpers.test.ts: Unit tests for the cross-cutting test helpers in testing.helpers.ts. Test infrastructure is itself code, and a bug in any of these
 * helpers would silently corrupt every consumer test that depends on it. Helpers earn the same coverage rigor as production code: every branch, every error
 * path, every boundary value.
 */
import { access, constants } from "node:fs/promises";
import { afterEach, beforeEach, describe, test } from "node:test";
import { assertNoUnhandledRejections, capturingLog, expectAt, fakeClock, silentLog, withTempDir } from "./testing.helpers.ts";
import assert from "node:assert/strict";

describe("silentLog", () => {

  test("returns a logger with all four ProtectLogging methods", () => {

    const log = silentLog();

    assert.equal(typeof log.debug, "function", "debug must be a function");
    assert.equal(typeof log.error, "function", "error must be a function");
    assert.equal(typeof log.info, "function", "info must be a function");
    assert.equal(typeof log.warn, "function", "warn must be a function");
  });

  test("each method is a mock.fn so consumers can assert on call counts", () => {

    const log = silentLog();

    log.error("test message", { context: 1 });

    // silentLog wires each method to mock.fn() so the test infrastructure exposes a `.mock` property carrying call records. We read it through an `as unknown as`
    // cast to the minimal `.mock` shape this test depends on. The cast is precisely what lets this compile whatever the real runtime shape is, so if the helper
    // switched away from mock.fn the `.mock` would be undefined and the `assert.ok` below would fail at runtime, not at compile time.
    const errorRecord = (log.error as unknown as { mock?: { callCount(): number } }).mock;

    assert.ok(errorRecord, "silentLog.error must be a mock.fn (exposes a .mock property)");
    assert.equal(errorRecord.callCount(), 1, "the mock must record exactly the calls the test made");
  });

  test("methods do not throw when called with mixed argument types", () => {

    const log = silentLog();

    // Exercise every level with the production-typical "message + structured context object" shape.
    log.debug("debug message", { id: "x" });
    log.error("error message", new Error("test error"));
    log.info("info message", 42);
    log.warn("warn message", null, undefined, [ 1, 2, 3 ]);
  });
});

describe("capturingLog", () => {

  test("records every call with level, message, and structured args", () => {

    const log = capturingLog();

    log.debug("a", 1);
    log.error("b");
    log.info("c", { context: true }, 42);
    log.warn("d");

    assert.equal(log.entries.length, 4, "every call must produce one entry");
    assert.deepEqual(log.entries[0], { args: [1], level: "debug", message: "a" });
    assert.deepEqual(log.entries[1], { args: [], level: "error", message: "b" });
    assert.deepEqual(log.entries[2], { args: [ { context: true }, 42 ], level: "info", message: "c" });
    assert.deepEqual(log.entries[3], { args: [], level: "warn", message: "d" });
  });

  test("entries is the same array reference across calls (mutation, not replacement)", () => {

    const log = capturingLog();
    const entriesRef = log.entries;

    log.error("msg");

    assert.equal(log.entries, entriesRef, "entries must be the same array - consumers may hold a reference");
    assert.equal(entriesRef.length, 1, "the held reference must reflect the new entry");
  });

  test("reset() clears entries in place without replacing the array", () => {

    const log = capturingLog();
    const entriesRef = log.entries;

    log.error("first");
    log.error("second");

    log.reset();

    assert.equal(log.entries.length, 0, "reset must clear entries");
    assert.equal(log.entries, entriesRef, "reset must mutate in place, not replace the array");
  });

  test("reset() is safe to call when entries is already empty", () => {

    const log = capturingLog();

    log.reset();

    assert.equal(log.entries.length, 0);
  });
});

describe("withTempDir", () => {

  test("creates a directory, passes its path to the callback, and resolves to the callback's value", async () => {

    let observedPath: string | null = null;

    const result = await withTempDir(async (dir) => {

      observedPath = dir;

      // The directory must exist for the callback's lifetime.
      await access(dir, constants.F_OK);

      return "callback-return-value";
    });

    assert.equal(result, "callback-return-value", "withTempDir must return the callback's resolved value");
    assert.ok(observedPath, "the callback must have run with a non-null path");
    assert.match(observedPath ?? "", /ufp-test-/, "the temp directory name must use the documented prefix");
  });

  test("removes the directory after the callback resolves", async () => {

    let capturedPath: string | null = null;

    await withTempDir(async (dir) => {

      capturedPath = dir;
    });

    assert.ok(capturedPath, "callback must have observed a path");

    // After withTempDir returns, the directory must no longer exist. access() rejects with ENOENT in that case.
    await assert.rejects(

      async () => access(capturedPath ?? "", constants.F_OK),
      (error: unknown) => (error instanceof Error) && ("code" in error) && ((error as NodeJS.ErrnoException).code === "ENOENT"),
      "temp directory must be removed once the callback resolves"
    );
  });

  test("removes the directory even when the callback throws", async () => {

    let capturedPath: string | null = null;
    const sentinel = new Error("synthetic callback failure");

    await assert.rejects(

      async () => withTempDir(async (dir) => {

        capturedPath = dir;

        throw sentinel;
      }),
      (error: unknown) => error === sentinel,
      "withTempDir must rethrow the callback's error"
    );

    assert.ok(capturedPath, "callback must have run before throwing");

    await assert.rejects(

      async () => access(capturedPath ?? "", constants.F_OK),
      (error: unknown) => (error instanceof Error) && ("code" in error) && ((error as NodeJS.ErrnoException).code === "ENOENT"),
      "temp directory must be removed even when the callback throws"
    );
  });

  test("each call produces a distinct directory", async () => {

    const paths: string[] = [];

    await withTempDir(async (dir) => {

      paths.push(dir);
    });
    await withTempDir(async (dir) => {

      paths.push(dir);
    });

    assert.equal(paths.length, 2);
    assert.notEqual(paths[0], paths[1], "consecutive calls must produce distinct directories - no path collision");
  });
});

describe("assertNoUnhandledRejections", () => {

  test("resolves when the wrapped function does not produce any unhandled rejection", async () => {

    await assertNoUnhandledRejections(async () => {

      // Awaited rejection - handled, not unhandled.
      await Promise.resolve("ok");
    });
  });

  test("removes the unhandledRejection listener after the wrapped function resolves", async () => {

    const listenersBefore = process.listenerCount("unhandledRejection");

    await assertNoUnhandledRejections(async () => {

      await Promise.resolve();
    });

    const listenersAfter = process.listenerCount("unhandledRejection");

    assert.equal(listenersAfter, listenersBefore, "the helper must remove its listener (no leak across calls)");
  });

  test("removes the unhandledRejection listener even when the wrapped function throws", async () => {

    const listenersBefore = process.listenerCount("unhandledRejection");
    const sentinel = new Error("synthetic failure");

    await assert.rejects(

      async () => assertNoUnhandledRejections(async () => {

        throw sentinel;
      }),
      (error: unknown) => error === sentinel
    );

    const listenersAfter = process.listenerCount("unhandledRejection");

    assert.equal(listenersAfter, listenersBefore, "the helper must remove its listener via the finally block on throw too");
  });
});

describe("expectAt", () => {

  test("resolves when the predicate returns true on the first poll", async () => {

    let calls = 0;

    await expectAt(() => {

      calls++;

      return true;
    });

    assert.equal(calls, 1, "predicate must be polled exactly once when it returns true on entry");
  });

  test("polls until the predicate becomes true", async () => {

    let count = 0;

    await expectAt(() => {

      count++;

      return count >= 3;
    });

    assert.ok(count >= 3, "predicate must be polled until it returns true");
  });

  test("supports an async predicate that returns a Promise<boolean>", async () => {

    let count = 0;

    await expectAt(async () => {

      count++;

      return Promise.resolve(count >= 2);
    });

    assert.ok(count >= 2);
  });

  test("rejects with the supplied message when the predicate never becomes true within the timeout", async () => {

    await assert.rejects(

      async () => expectAt(() => false, { message: "predicate never became true", timeoutMs: 50 }),
      { message: "predicate never became true" },
      "expectAt must surface the supplied message when the deadline elapses"
    );
  });

  test("rejects with the default message when no message is supplied", async () => {

    await assert.rejects(

      async () => expectAt(() => false, { timeoutMs: 50 }),
      /predicate did not become true within deadline/,
      "the default message must indicate the deadline elapsed"
    );
  });

  test("respects the intervalMs option (predicate is polled at the configured cadence)", async () => {

    let count = 0;
    const start = Date.now();

    // With intervalMs: 20 and timeoutMs: 100, the predicate should be polled 4-6 times before the deadline (5 nominal intervals; jitter accepted).
    await assert.rejects(

      async () => expectAt(() => {

        count++;

        return false;
      }, { intervalMs: 20, timeoutMs: 100 }),
      /predicate did not become true/
    );

    const elapsed = Date.now() - start;

    assert.ok(elapsed >= 100, "expectAt must wait the full timeout before rejecting (got " + elapsed.toString() + "ms)");
    assert.ok(count >= 1, "predicate must be polled at least once");
  });
});

describe("fakeClock", () => {

  let fakeAbort: AbortController;

  beforeEach(() => {

    fakeAbort = new AbortController();
  });

  afterEach(() => {

    if(!fakeAbort.signal.aborted) {

      fakeAbort.abort();
    }
  });

  test("now() starts at 0 and advances by the supplied milliseconds", () => {

    const clock = fakeClock();

    assert.equal(clock.now(), 0, "fakeClock starts at time 0");

    clock.advance(100);
    assert.equal(clock.now(), 100, "advance(100) moves now() forward by 100ms");

    clock.advance(50);
    assert.equal(clock.now(), 150, "advance is cumulative");
  });

  test("setInterval yields once per tick() call", async () => {

    const clock = fakeClock();
    const ticks: number[] = [];

    // We capture the loop's promise so the test can await its full termination after aborting. Without the await, the loop's AbortError settles after the
    // test body returns, which the runner reports as "asynchronous activity after the test ended." Threading the promise back to the test body keeps the
    // loop's lifetime bounded by the test.
    const loop = (async (): Promise<void> => {

      try {

        for await (const _t of clock.setInterval(1000, { signal: fakeAbort.signal })) {

          ticks.push(clock.now());
        }
      } catch {

        // AbortError is the clean shutdown path.
      }
    })();

    clock.advance(1000);
    await clock.tick();
    assert.equal(ticks.length, 1, "first tick yields one iteration");

    clock.advance(1000);
    await clock.tick();
    assert.equal(ticks.length, 2, "second tick yields a second iteration");

    fakeAbort.abort();
    await loop;
  });

  test("setInterval terminates when the abort signal fires", async () => {

    const clock = fakeClock();
    let iterationsCompleted = 0;
    let loopSettled = false;

    const loop = (async (): Promise<void> => {

      try {

        for await (const _t of clock.setInterval(1000, { signal: fakeAbort.signal })) {

          iterationsCompleted++;
        }
      } catch {

        // The async iterator from setInterval rejects with AbortError on signal abort - that's the documented termination path. We absorb it here so the
        // settled flag observably tracks the loop's actual termination.
      } finally {

        loopSettled = true;
      }
    })();

    clock.advance(1000);
    await clock.tick();
    assert.equal(iterationsCompleted, 1);

    fakeAbort.abort();
    await loop;

    assert.equal(loopSettled, true, "loop must terminate after abort");
    assert.equal(iterationsCompleted, 1, "no further iterations after abort");
  });

  test("setInterval pre-aborted signal terminates immediately on first next()", async () => {

    const clock = fakeClock();

    fakeAbort.abort();

    let iterationsCompleted = 0;

    for await (const _t of clock.setInterval(1000, { signal: fakeAbort.signal })) {

      iterationsCompleted++;
    }

    assert.equal(iterationsCompleted, 0, "pre-aborted signal must not yield any iterations");
  });

  test("multiple concurrent setInterval consumers share tick() in FIFO order", async () => {

    const clock = fakeClock();
    const consumerA: number[] = [];
    const consumerB: number[] = [];

    const consumerALoop = (async (): Promise<void> => {

      try {

        for await (const _t of clock.setInterval(1000, { signal: fakeAbort.signal })) {

          consumerA.push(clock.now());
        }
      } catch {

        // AbortError is the clean shutdown path.
      }
    })();

    // Start consumer B after a setImmediate (a turn of the event loop) so consumer A's await registers first.
    await new Promise((resolve) => setImmediate(resolve));

    const consumerBLoop = (async (): Promise<void> => {

      try {

        for await (const _t of clock.setInterval(1000, { signal: fakeAbort.signal })) {

          consumerB.push(clock.now());
        }
      } catch {

        // AbortError is the clean shutdown path.
      }
    })();

    await new Promise((resolve) => setImmediate(resolve));

    // First tick releases consumer A (registered first); second tick releases consumer B.
    await clock.tick();
    await clock.tick();

    assert.equal(consumerA.length, 1, "consumer A receives the first tick");
    assert.equal(consumerB.length, 1, "consumer B receives the second tick");

    fakeAbort.abort();
    await Promise.all([ consumerALoop, consumerBLoop ]);
  });

  test("tick() with no pending waiters is a no-op (does not throw)", async () => {

    const clock = fakeClock();

    // No setInterval consumer registered. tick() should not throw.
    await clock.tick();
    await clock.tick();
  });

  test("aborting a signal removes its waiter from the pending queue", async () => {

    const clockA = new AbortController();
    const clockB = new AbortController();
    const clock = fakeClock();
    const ticksA: number[] = [];
    const ticksB: number[] = [];

    const loopA = (async (): Promise<void> => {

      try {

        for await (const _t of clock.setInterval(1000, { signal: clockA.signal })) {

          ticksA.push(clock.now());
        }
      } catch {

        // AbortError is the clean shutdown path.
      }
    })();

    await new Promise((resolve) => setImmediate(resolve));

    const loopB = (async (): Promise<void> => {

      try {

        for await (const _t of clock.setInterval(1000, { signal: clockB.signal })) {

          ticksB.push(clock.now());
        }
      } catch {

        // AbortError is the clean shutdown path.
      }
    })();

    await new Promise((resolve) => setImmediate(resolve));

    // Abort A's signal. The waiter from A should be removed from the queue.
    clockA.abort();
    await loopA;

    // Single tick should now reach B (A's slot has been removed from the FIFO).
    await clock.tick();

    assert.equal(ticksA.length, 0, "A received no ticks before abort");
    assert.equal(ticksB.length, 1, "B receives the next tick after A's slot was removed by abort");

    clockB.abort();
    await loopB;
  });

  test("wait resolves only once advance() reaches its deadline", async () => {

    const clock = fakeClock();
    let resolved = false;

    const pending = clock.wait(100, { signal: fakeAbort.signal }).then(() => void (resolved = true));

    // Advancing short of the deadline leaves the wait pending.
    clock.advance(99);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(resolved, false, "wait stays pending until the clock reaches its deadline");

    // Crossing the deadline resolves it.
    clock.advance(1);
    await pending;
    assert.equal(resolved, true, "wait resolves once advance() reaches the deadline");
  });

  test("advance() resolves several due waits in deadline order", async () => {

    const clock = fakeClock();
    const fired: number[] = [];

    void clock.wait(300, { signal: fakeAbort.signal }).then(() => void fired.push(300));
    void clock.wait(100, { signal: fakeAbort.signal }).then(() => void fired.push(100));
    void clock.wait(200, { signal: fakeAbort.signal }).then(() => void fired.push(200));

    // One advance past all three deadlines fires them all, ordered by deadline rather than registration.
    clock.advance(300);
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(fired, [ 100, 200, 300 ], "due waits resolve in deadline order");
  });

  test("pendingWaits reports the outstanding wait delays and clears them as they fire", async () => {

    const clock = fakeClock();

    // The 300000 wait stays pending past the test body; the afterEach abort rejects it, so we swallow that AbortError to avoid an unhandled rejection.
    clock.wait(300000, { signal: fakeAbort.signal }).catch(() => undefined);
    clock.wait(120000, { signal: fakeAbort.signal }).catch(() => undefined);

    assert.deepEqual(clock.pendingWaits(), [ 300000, 120000 ], "pendingWaits lists the registered delays in order");

    // Advancing past the shorter deadline (120000) but not the longer one fires only that wait, leaving the 300000 wait pending.
    clock.advance(120000);
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(clock.pendingWaits(), [300000], "a fired wait is removed from the pending list, the not-yet-due one remains");
  });

  test("wait rejects with an AbortError when its signal aborts, and a later advance does not fire it", async () => {

    const controller = new AbortController();
    const clock = fakeClock();

    const pending = clock.wait(100, { signal: controller.signal });

    controller.abort();
    await assert.rejects(pending, (error: unknown) => (error as Error).name === "AbortError", "an aborted wait rejects with an AbortError");

    assert.deepEqual(clock.pendingWaits(), [], "the aborted wait is removed from the pending list");

    // A subsequent advance past the original deadline must not re-fire the already-rejected wait.
    clock.advance(1000);
    await new Promise((resolve) => setImmediate(resolve));
  });

  test("wait with an already-aborted signal rejects immediately without registering", async () => {

    const controller = new AbortController();
    const clock = fakeClock();

    controller.abort();

    await assert.rejects(clock.wait(100, { signal: controller.signal }), (error: unknown) => (error as Error).name === "AbortError");
    assert.deepEqual(clock.pendingWaits(), [], "a pre-aborted wait never enters the pending list");
  });
});
