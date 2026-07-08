/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * testing.helpers.ts: Cross-cutting helpers shared across every unit test in the codebase.
 *
 * These helpers exist as code rather than data because they encapsulate behavior the test runtime needs (no-op logging, log capture, temporary directory lifecycle,
 * unhandled-rejection detection, eventual-consistency assertions, deterministic time control). They live in src/ so they are co-located with the production code they
 * support, and they are excluded from the build emit by the helpers exclude pattern in tsconfig.build.json.
 *
 * Adding new cross-cutting helpers here is preferable to per-test reinvention. If a helper is specific to a single source module, place it next to that module as a
 * sibling helpers file instead.
 */
import { mkdtemp, rm } from "node:fs/promises";
import type { Clock } from "./clock.ts";
import type { ProtectLogging } from "./logging.ts";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { mock } from "node:test";
import path from "node:path";
import { tmpdir } from "node:os";

// Captured log entry. We store the full argument list so tests can assert on the message and the structured-context object that the production code passed alongside
// it. This shape mirrors how the library logs in practice ("text", { contextObject }).
export interface CapturedLogEntry {

  args: unknown[];
  level: "debug" | "error" | "info" | "warn";
  message: string;
}

// Buffer-backed logger that records every call for later assertion. Useful for verifying that production code logs the right message at the right level when
// recovery, throttling, or error paths fire.
export interface CapturingLogger extends ProtectLogging {

  entries: CapturedLogEntry[];
  reset(): void;
}

/**
 * Build a no-op logger. Used by tests that exercise code which requires a `ProtectLogging` shape but where the test does not assert on log output.
 *
 * @returns a logger whose methods are mock functions, so call counts can still be inspected if needed.
 */
export function silentLog(): ProtectLogging {

  return {

    debug: mock.fn(),
    error: mock.fn(),
    info: mock.fn(),
    warn: mock.fn()
  };
}

/**
 * Build a capturing logger. Each call appends a `CapturedLogEntry` to `entries`. Useful for verifying that production code logs a specific message under a specific
 * condition (e.g., "should warn on retry").
 *
 * @returns a logger plus an `entries` buffer and a `reset()` to clear the buffer between assertions within a single test.
 */
export function capturingLog(): CapturingLogger {

  const entries: CapturedLogEntry[] = [];

  const record = (level: CapturedLogEntry["level"]) => (message: string, ...args: unknown[]): void => {

    entries.push({ args, level, message });
  };

  return {

    debug: record("debug"),
    entries,
    error: record("error"),
    info: record("info"),
    reset: (): void => {

      entries.length = 0;
    },
    warn: record("warn")
  };
}

/**
 * Run a function with a freshly created temporary directory. The directory is removed (recursively, ignoring errors) when the function resolves or rejects.
 *
 * Tests must never write to a fixed filesystem path - that creates order dependencies and leaks between runs. This helper guarantees isolation.
 *
 * @param fn - Async function that receives the absolute temp directory path. Its resolved value is returned.
 *
 * @returns whatever `fn` resolves to.
 */
export async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {

  const dir = await mkdtemp(path.join(tmpdir(), "ufp-test-"));

  try {

    return await fn(dir);
  } finally {

    await rm(dir, { force: true, recursive: true });
  }
}

/**
 * Detect unhandled promise rejections that occur during the wrapped function's lifetime. The helper attaches an `unhandledRejection` listener, runs the function,
 * waits a short scheduler tick to let microtasks drain, then asserts no rejections fired and removes the listener.
 *
 * Use to verify that fire-and-forget promises (e.g., `void this.refresh()`) actually settle, not just that they execute.
 *
 * @param fn - Async function whose promise hygiene is being verified.
 */
export async function assertNoUnhandledRejections(fn: () => Promise<void>): Promise<void> {

  const captured: unknown[] = [];

  const listener = (reason: unknown): void => {

    captured.push(reason);
  };

  process.on("unhandledRejection", listener);

  try {

    await fn();

    // Yield once so any pending microtasks (await chains scheduled but not yet run) have a chance to surface their rejections before we assert.
    await delay(0);

    assert.equal(captured.length, 0, "expected no unhandled rejections, captured: " + captured.map((r) => String(r)).join(", "));
  } finally {

    process.off("unhandledRejection", listener);
  }
}

/**
 * Poll a predicate until it returns true or a deadline is reached. Useful for testing eventually-consistent behavior without real-time delays.
 *
 * Pair with a `FakeClock`'s `advance()`/`tick()` to drive time-dependent production code forward inside the polling loop. The default `intervalMs` of 0 yields the
 * event loop without sleeping, so the predicate is re-checked after each microtask drain.
 *
 * @param predicate - Function returning a boolean (or boolean-promise). Called repeatedly until it returns truthy.
 * @param options   - `timeoutMs` is the wall clock deadline (real time, since the loop polls against the real scheduler). `intervalMs` is the poll cadence.
 * @param options.intervalMs - Milliseconds between poll attempts. Defaults to 0.
 * @param options.message    - Message to include if the assertion fails.
 * @param options.timeoutMs  - Real-time deadline. Defaults to 1000 ms.
 */
export async function expectAt(predicate: () => boolean | Promise<boolean>,
  options: { intervalMs?: number; message?: string; timeoutMs?: number } = {}): Promise<void> {

  const intervalMs = options.intervalMs ?? 0;
  const message = options.message ?? "predicate did not become true within deadline";
  const timeoutMs = options.timeoutMs ?? 1000;
  const deadline = Date.now() + timeoutMs;

  // We use a real-time deadline because the polling loop runs against the real scheduler, independent of any `FakeClock` a test injects into the production code;
  // that lets mocked-time tests still bound their wait. The sequential awaits inside the loop are intentional...the predicate is the gate, the delay the cadence;
  // parallelizing would defeat the polling semantic.
  while(Date.now() < deadline) {

    // eslint-disable-next-line no-await-in-loop
    if(await predicate()) {

      return;
    }

    // eslint-disable-next-line no-await-in-loop
    await delay(intervalMs);
  }

  assert.fail(message);
}

/**
 * Test-controllable Clock. Extends the production `Clock` interface with test-only knobs: `advance(ms)` is the clock
 * hand - it moves `now()` forward and resolves any `wait` whose deadline it crosses; `tick()` is the interval pulse -
 * it releases exactly one pending `setInterval` iteration (the next FIFO-queued consumer); and `pendingWaits()` reveals the
 * delays of the outstanding `wait`s so a test can assert a backoff schedule directly. Tests drive watchdogs, polling loops, the
 * recovery backoff curve, and any other time-dependent code through these operations and never sleep against real time.
 *
 * The release mechanisms stay distinct because the underlying production primitives differ in kind: `wait` is a time-based
 * one-shot (faithfully fired by advancing the clock past its deadline), while `setInterval` is a tick-based repeater (fired
 * by an explicit pulse, independent of exact time - which is what lets a watchdog test advance the clock without yet waking
 * the loop). `advance` does both jobs for `wait`; `tick` is the pulse for `setInterval`.
 */
export interface FakeClock extends Clock {

  /**
   * Advance the clock's `now()` by `ms` milliseconds, then resolve every pending `wait` whose deadline the new time has
   * reached (in deadline order). Does not fire any `setInterval` iteration - call `tick()` for that. Separating "advance
   * time" from "fire one interval iteration" is deliberate: tests can express "the wall clock has moved forward by N
   * seconds, but the interval has not yet woken up" - useful for staleness semantics like the livestream heartbeat
   * watchdog, where the gate is `now() - lastMessage > threshold` evaluated when the loop ticks. A `wait`, by contrast,
   * genuinely is due once time passes its deadline, so `advance` resolves it - exactly as a real timer fires.
   *
   * @param ms - Milliseconds to add to the current time.
   */
  advance(ms: number): void;

  /**
   * The delays (as originally requested) of every `wait` still outstanding, in the order they were registered. Lets a
   * test assert the shape of a backoff schedule - "the next scheduled probe is 300000 ms out" - without advancing time.
   *
   * @returns The pending wait delays in milliseconds.
   */
  pendingWaits(): readonly number[];

  /**
   * Release exactly one pending `setInterval` iteration - the next FIFO-queued consumer, not every active one. After
   * resolving the iteration, yields once to the event loop so the consumer's `for await` body executes before the call returns.
   */
  tick(): Promise<void>;
}

/**
 * Build a deterministic test clock. Tests use this in place of `wallClock` to drive time-dependent code without real
 * waits or module mocks.
 *
 * Behavior:
 * - `now()` returns the accumulated value of `advance(ms)` calls (starts at 0).
 * - `wait()` resolves when `advance()` moves `now()` to or past the deadline it recorded at registration; an abort
 *   before then rejects it with an `AbortError`, matching `setTimeout` from `node:timers/promises`.
 * - `setInterval()` returns an async iterable whose iterations are gated on `tick()`; each `tick()` releases one
 *   waiter across all active intervals. The iterable terminates with an `AbortError` when the supplied signal aborts,
 *   matching the behavior of `setInterval` from `node:timers/promises`.
 *
 * @returns A `FakeClock` wired into the same `Clock` shape production code expects.
 */
export function fakeClock(): FakeClock {

  let currentTime = 0;

  // Pending tick resolvers from active setInterval consumers. Each entry is a function that, when called, releases the
  // consumer's `await` and lets the next iteration's body run. We push during `next()` and shift during `tick()` -
  // FIFO ensures that intervals that started waiting first get released first, which keeps the test ordering
  // deterministic.
  const pendingTicks: (() => void)[] = [];

  // Pending one-shot waits. Each records the deadline `now()` must reach to fire, the originally requested delay (for
  // `pendingWaits()` inspection), the resolver, and an abort detacher so a cancelled wait neither fires nor leaks its
  // listener. `advance()` fires every entry whose deadline the new time has reached.
  interface PendingWait {

    deadline: number;
    delayMs: number;
    detach: () => void;
    resolve: () => void;
  }

  let pendingWaitList: PendingWait[] = [];

  return {

    advance: (ms: number): void => {

      currentTime += ms;

      // Fire every wait the new time has reached, in deadline order, so a test that advances past several stages at
      // once sees them resolve in schedule order. Partition rather than mutate-while-iterating: the survivors are kept,
      // the due ones detached from their abort listener and resolved.
      const due = pendingWaitList.filter((entry) => entry.deadline <= currentTime).sort((a, b) => a.deadline - b.deadline);

      pendingWaitList = pendingWaitList.filter((entry) => entry.deadline > currentTime);

      for(const entry of due) {

        entry.detach();
        entry.resolve();
      }
    },

    now: (): number => currentTime,

    pendingWaits: (): readonly number[] => pendingWaitList.map((entry) => entry.delayMs),

    setInterval: (_delayMs: number, options: { signal: AbortSignal }): AsyncIterable<void> => {

      const iterator: AsyncIterableIterator<void> = {

        [Symbol.asyncIterator](): AsyncIterableIterator<void> {

          return this;
        },

        next: async (): Promise<IteratorResult<void>> => {

          if(options.signal.aborted) {

            return Promise.resolve({ done: true, value: undefined });
          }

          // Wait for either a tick or an abort, whichever comes first. Once one fires, detach the other so the same
          // resolver cannot fire twice.
          return new Promise<IteratorResult<void>>((resolve, reject) => {

            const onAbort = (): void => {

              const idx = pendingTicks.indexOf(resolveOnTick);

              if(idx >= 0) {

                pendingTicks.splice(idx, 1);
              }

              const error = new Error("The operation was aborted.");

              error.name = "AbortError";

              reject(error);
            };

            const resolveOnTick = (): void => {

              options.signal.removeEventListener("abort", onAbort);
              resolve({ done: false, value: undefined });
            };

            options.signal.addEventListener("abort", onAbort, { once: true });
            pendingTicks.push(resolveOnTick);
          });
        }
      };

      return { [Symbol.asyncIterator]: () => iterator };
    },

    tick: async (): Promise<void> => {

      // Release one pending tick. We snapshot the queue's current head rather than draining the queue so consumers
      // can call `tick()` repeatedly to advance one iteration at a time.
      const next = pendingTicks.shift();

      next?.();

      // Yield once so the consumer's `for await` body executes before `tick()` returns. Without this yield, callers
      // that expect side effects to be visible immediately after `await tick()` would see stale state.
      await delay(0);
    },

    wait: (delayMs: number, options: { signal: AbortSignal }): Promise<void> => {

      // An already-aborted signal rejects immediately, never registering a deadline - matching `setTimeout` from
      // `node:timers/promises`.
      if(options.signal.aborted) {

        const error = new Error("The operation was aborted.");

        error.name = "AbortError";

        return Promise.reject(error);
      }

      return new Promise<void>((resolve, reject) => {

        const entry: PendingWait = {

          deadline: currentTime + delayMs,
          delayMs,
          detach: (): void => options.signal.removeEventListener("abort", onAbort),
          resolve
        };

        // Abort before the deadline: drop the entry so a later `advance()` cannot fire it, then reject like a real timer.
        const onAbort = (): void => {

          pendingWaitList = pendingWaitList.filter((pending) => pending !== entry);

          const error = new Error("The operation was aborted.");

          error.name = "AbortError";

          reject(error);
        };

        options.signal.addEventListener("abort", onAbort, { once: true });
        pendingWaitList.push(entry);
      });
    }
  };
}
