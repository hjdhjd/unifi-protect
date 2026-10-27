/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * event-bus.test.ts: Unit tests for the three-rail EventBus facade - Disposable callbacks, the once promise, the stream async-iterable, signal cancellation on both,
 * the single-emit fan-out to every active callback subscriber, and the containment of a listener's throw.
 */
import { capturingLog, silentLog } from "./testing.helpers.ts";
import { describe, test } from "node:test";
import { EventBus } from "./event-bus.ts";
import assert from "node:assert/strict";

// A representative event map: a single-argument event for the rails' behavior, and a multi-argument event that covers tuple destructuring on the once rail.
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

      const bus = new EventBus<TestEvents>(silentLog());
      const received: number[] = [];
      const subscription = bus.on("ping", (count) => received.push(count));

      bus.emit("ping", 1);
      bus.emit("ping", 2);
      subscription[Symbol.dispose]();
      bus.emit("ping", 3);

      assert.deepEqual(received, [ 1, 2 ], "handler should see emissions until it is disposed, and nothing after");
    });

    test("disposing twice is safe", () => {

      const bus = new EventBus<TestEvents>(silentLog());
      const received: number[] = [];
      const handler = (count: number): void => void received.push(count);
      const subscription = bus.on("ping", handler);

      // A sibling subscription registered with the very same handler, so a second dispose that removed one more registration would strip it.
      using sibling = bus.on("ping", handler);

      subscription[Symbol.dispose]();

      assert.doesNotThrow(() => subscription[Symbol.dispose](), "a second dispose must be a no-op, not a throw");

      bus.emit("ping", 1);
      assert.deepEqual(received, [1], "the second dispose left the sibling subscription registered");
    });

    test("a single emit fans out to every active subscriber", () => {

      const bus = new EventBus<TestEvents>(silentLog());
      const first: number[] = [];
      const second: number[] = [];

      using firstSubscription = bus.on("ping", (count) => first.push(count));
      using secondSubscription = bus.on("ping", (count) => second.push(count));

      bus.emit("ping", 7);

      assert.deepEqual(first, [7]);
      assert.deepEqual(second, [7]);
    });

    test("emit reports whether the event had listeners", () => {

      const bus = new EventBus<TestEvents>(silentLog());

      assert.equal(bus.emit("ping", 1), false, "emit with no listeners returns false");

      using subscription = bus.on("ping", () => { /* no-op */ });

      assert.equal(bus.emit("ping", 1), true, "emit with a listener returns true");
    });

    test("a listener that throws is logged at error level and the listeners after it still run", () => {

      const log = capturingLog();
      const bus = new EventBus<TestEvents>(log);
      const failure = new Error("consumer handler failed");
      const received: string[] = [];

      // The thrower registers first, so the listeners after it run only if its throw is contained rather than unwinding the emit that reached it.
      using thrower = bus.on("ping", () => {

        throw failure;
      });

      using second = bus.on("ping", (count) => void received.push("second " + count.toString()));
      using third = bus.on("ping", (count) => void received.push("third " + count.toString()));

      assert.doesNotThrow(() => bus.emit("ping", 1), "a listener's throw never leaves emit");
      bus.emit("ping", 2);

      assert.deepEqual(received, [ "second 1", "third 1", "second 2", "third 2" ], "every listener after the thrower still ran, on every emission");

      const errors = log.entries.filter((entry) => entry.level === "error");

      assert.equal(errors.length, 2, "each throw is logged once");
      assert.deepEqual(errors[0]?.args, [{ error: failure, event: "ping" }], "the line carries the throw and the event it came from as structured context");
      assert.equal(errors[0].message, "An event listener threw; the remaining listeners still run.");
    });
  });

  describe("once - Promise rail", () => {

    test("resolves with the argument tuple of the next emission", async () => {

      const bus = new EventBus<TestEvents>(silentLog());
      const pending = bus.once("pong");

      bus.emit("pong", "hello", 9);

      const [ label, value ] = await pending;

      assert.equal(label, "hello");
      assert.equal(value, 9);
    });

    test("rejects with an AbortError when the signal aborts before the event fires", async () => {

      const bus = new EventBus<TestEvents>(silentLog());
      const controller = new AbortController();
      const pending = bus.once("ping", { signal: controller.signal });

      controller.abort();

      await assert.rejects(pending, { name: "AbortError" });
    });
  });

  describe("stream - AsyncIterable rail", () => {

    test("yields each subsequent emission until the signal aborts", async () => {

      const bus = new EventBus<TestEvents>(silentLog());
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

      const bus = new EventBus<ErrorRailEvents>(silentLog());

      // A raw EventEmitter throws synchronously on emit("error") with no listener; the facade must not.
      assert.doesNotThrow(() => bus.emit("error", new Error("boom")));
    });

    test("emitting error does not reject an open stream of another event", async () => {

      const bus = new EventBus<ErrorRailEvents>(silentLog());
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

      const bus = new EventBus<ErrorRailEvents>(silentLog());
      const seen: Error[] = [];

      using sub = bus.on("error", (err) => seen.push(err));

      assert.equal(typeof sub[Symbol.dispose], "function");
      bus.emit("error", new Error("boom"));

      assert.equal(seen.length, 1);
      assert.equal(seen[0]?.message, "boom");
    });
  });
});
