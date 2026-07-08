/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * event-bus.test.ts: Unit tests for the three-rail EventBus facade - Disposable callbacks, the once promise, the stream async-iterable, signal cancellation on both,
 * and the single-emit fan-out across all three rails.
 */
import { describe, test } from "node:test";
import { EventBus } from "./event-bus.ts";
import assert from "node:assert/strict";

// A representative event map: one single-argument event and one multi-argument event, so the tuple typing of every rail is exercised.
interface TestEvents {

  ping: [count: number];
  pong: [label: string, value: number];
}

// An event map whose key collides with EventEmitter's special `error` event, to prove the facade insulates it.
interface ErrorRailEvents {

  data: [value: number];
  error: [err: Error];
}

describe("EventBus", () => {

  describe("on - Disposable callback rail", () => {

    test("invokes the handler on each emit and detaches on dispose", () => {

      const bus = new EventBus<TestEvents>();
      const received: number[] = [];
      const subscription = bus.on("ping", (count) => received.push(count));

      bus.emit("ping", 1);
      bus.emit("ping", 2);
      subscription[Symbol.dispose]();
      bus.emit("ping", 3);

      assert.deepEqual(received, [ 1, 2 ], "handler should see emissions until it is disposed, and nothing after");
    });

    test("a using declaration auto-disposes the subscription at scope exit", () => {

      const bus = new EventBus<TestEvents>();
      const received: number[] = [];

      {

        using _subscription = bus.on("ping", (count) => received.push(count));

        bus.emit("ping", 1);
      }

      bus.emit("ping", 2);

      assert.deepEqual(received, [1], "the subscription should detach when the using binding leaves scope");
    });

    test("disposing twice is safe", () => {

      const bus = new EventBus<TestEvents>();
      const subscription = bus.on("ping", () => { /* no-op */ });

      subscription[Symbol.dispose]();

      assert.doesNotThrow(() => subscription[Symbol.dispose](), "a second dispose must be a no-op, not a throw");
    });

    test("a single emit fans out to every active subscriber", () => {

      const bus = new EventBus<TestEvents>();
      const first: number[] = [];
      const second: number[] = [];

      using _s1 = bus.on("ping", (count) => first.push(count));
      using _s2 = bus.on("ping", (count) => second.push(count));

      bus.emit("ping", 7);

      assert.deepEqual(first, [7]);
      assert.deepEqual(second, [7]);
    });

    test("emit reports whether the event had listeners", () => {

      const bus = new EventBus<TestEvents>();

      assert.equal(bus.emit("ping", 1), false, "emit with no listeners returns false");

      using _subscription = bus.on("ping", () => { /* no-op */ });

      assert.equal(bus.emit("ping", 1), true, "emit with a listener returns true");
    });
  });

  describe("once - Promise rail", () => {

    test("resolves with the argument tuple of the next emission", async () => {

      const bus = new EventBus<TestEvents>();
      const pending = bus.once("pong");

      bus.emit("pong", "hello", 9);

      const [ label, value ] = await pending;

      assert.equal(label, "hello");
      assert.equal(value, 9);
    });

    test("rejects with an AbortError when the signal aborts before the event fires", async () => {

      const bus = new EventBus<TestEvents>();
      const controller = new AbortController();
      const pending = bus.once("ping", { signal: controller.signal });

      controller.abort();

      await assert.rejects(pending, (error: unknown) => (error as Error).name === "AbortError");
    });
  });

  describe("stream - AsyncIterable rail", () => {

    test("yields each subsequent emission until the signal aborts", async () => {

      const bus = new EventBus<TestEvents>();
      const controller = new AbortController();
      const received: number[] = [];

      // The stream attaches its listener synchronously when constructed, so emissions made after this call but before iteration are buffered, not lost.
      const iterable = bus.stream("ping", { signal: controller.signal });

      const collector = (async (): Promise<void> => {

        try {

          for await (const [count] of iterable) {

            received.push(count);

            if(received.length === 2) {

              controller.abort();
            }
          }
        } catch(error) {

          if((error as Error).name !== "AbortError") {

            throw error;
          }
        }
      })();

      bus.emit("ping", 1);
      bus.emit("ping", 2);

      await collector;

      assert.deepEqual(received, [ 1, 2 ], "the stream should surface buffered emissions and terminate cleanly on abort");
    });
  });

  // node:events special-cases the `error` event on the underlying EventEmitter; the facade namespaces event names so a typed `error` rail behaves like any other.
  describe("error-rail insulation", () => {

    test("emitting error with no listeners does not throw", () => {

      const bus = new EventBus<ErrorRailEvents>();

      // A raw EventEmitter throws synchronously on emit("error") with no listener; the facade must not.
      assert.doesNotThrow(() => bus.emit("error", new Error("boom")));
    });

    test("emitting error does not reject an open stream of another event", async () => {

      const bus = new EventBus<ErrorRailEvents>();
      const controller = new AbortController();
      const received: number[] = [];
      const iterable = bus.stream("data", { signal: controller.signal });
      const collector = (async (): Promise<void> => {

        try {

          for await (const [value] of iterable) {

            received.push(value);

            if(received.length === 2) {

              controller.abort();
            }
          }
        } catch(error) {

          if((error as Error).name !== "AbortError") {

            throw error;
          }
        }
      })();

      // A raw EventEmitter's `events.on("data")` iterator rejects when "error" is emitted; the facade's namespacing must keep the data stream alive across it.
      bus.emit("data", 1);
      bus.emit("error", new Error("boom"));
      bus.emit("data", 2);

      await collector;

      assert.deepEqual(received, [ 1, 2 ], "the data stream survives an error emission on the same bus");
    });

    test("a callback on the error rail still receives the emission", () => {

      const bus = new EventBus<ErrorRailEvents>();
      const seen: Error[] = [];

      using sub = bus.on("error", (err) => seen.push(err));

      assert.equal(typeof sub[Symbol.dispose], "function");
      bus.emit("error", new Error("boom"));

      assert.equal(seen.length, 1);
      assert.equal(seen[0]?.message, "boom");
    });
  });
});
