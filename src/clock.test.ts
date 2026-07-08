/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * clock.test.ts: Unit tests for the production wall clock. The interface itself is the contract that lets every other module take time as an injected dependency;
 * here we verify the production implementation reads real time and that its interval iterator yields and then terminates cleanly when its signal aborts.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { wallClock } from "./clock.ts";

describe("wallClock", () => {

  test("now() returns the current wall-clock time", () => {

    const before = Date.now();
    const observed = wallClock.now();

    assert.ok((observed >= before) && (observed <= Date.now()), "now() should fall within the surrounding Date.now() readings");
  });

  test("wait resolves after the delay elapses", async () => {

    const controller = new AbortController();
    const before = Date.now();

    await wallClock.wait(5, { signal: controller.signal });

    assert.ok((Date.now() - before) >= 4, "wait should resolve no sooner than its delay (allowing for timer granularity)");
  });

  test("wait rejects with an AbortError when its signal aborts before the delay elapses", async () => {

    const controller = new AbortController();
    const pending = wallClock.wait(10000, { signal: controller.signal });

    controller.abort();

    await assert.rejects(pending, (error: unknown) => (error as Error).name === "AbortError", "aborting the signal rejects the wait with an AbortError");
  });

  test("setInterval yields repeatedly and terminates when its signal aborts", async () => {

    const controller = new AbortController();
    let count = 0;

    // The iterator throws an AbortError on abort (the node:timers/promises contract); the consumer's for-await surfaces it, and we assert the expected shape.
    try {

      for await (const _tick of wallClock.setInterval(1, { signal: controller.signal })) {

        count++;

        if(count >= 2) {

          controller.abort();
        }
      }

      assert.fail("the loop should terminate via the abort throwing, not by completing");
    } catch(error) {

      assert.equal((error as Error).name, "AbortError", "aborting the signal ends the iteration with an AbortError");
    }

    assert.equal(count, 2, "the iterator should have yielded exactly until the abort");
  });
});
