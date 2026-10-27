/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * testing.helpers.ts: Cross-cutting helpers shared across every unit test in the codebase.
 *
 * These helpers exist as code rather than data because they encapsulate behavior the test runtime needs (no-op logging, log capture, temporary directory lifecycle,
 * unhandled-rejection detection, eventual-consistency assertions, promise-settlement probes). They live in src/ so they are co-located with the production code they
 * support, and they are excluded from the build emit by the helpers exclude pattern in tsconfig.build.json. Virtual time is homebridge-plugin-utils' `TestClock`, which
 * a suite injects wherever the code under test takes a `Clock`, and `TIME_OF_DAY_STEP_MS` is the step the rows share when they set that clock's time of day back to
 * show that an elapsed figure measures the time that passed rather than the time of day, and their step needs no sizing to a window.
 *
 * Adding new cross-cutting helpers here is preferable to per-test reinvention. If a helper is specific to a single source module, place it next to that module as a
 * sibling helpers file instead.
 */
import { mkdtemp, rm } from "node:fs/promises";
import type { ProtectLogging } from "./logging.ts";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { mock } from "node:test";
import path from "node:path";
import { tmpdir } from "node:os";

// How far a row sets the time of day back, as an NTP correction can, to show that an elapsed figure measures the time that passed rather than the time of day.
export const TIME_OF_DAY_STEP_MS = 60000;

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
 * Pair with a `TestClock`'s `advance()` to drive time-dependent production code forward between polls. The default `intervalMs` of 0 yields the
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

  // We use a real-time deadline because the polling loop runs against the real scheduler, independent of any `TestClock` a test injects into the production code;
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
 * Answer whether a promise has settled, without awaiting it. The probe marks on both outcomes, so a rejection counts as settled and leaves no unhandled derived
 * rejection behind. Pair it with `expectAt` to wait for a promise to settle, or read it in a plain assertion to hold that a promise is still pending.
 *
 * A caller that needs fulfilment awaits the promise after the read, since a rejection counts as settled too.
 *
 * @param promise - The promise to watch.
 *
 * @returns a predicate that reads true once the promise has fulfilled or rejected.
 */
export function settlement(promise: Promise<unknown>): () => boolean {

  let settled = false;

  const mark = (): void => {

    settled = true;
  };

  void promise.then(mark, mark);

  return (): boolean => settled;
}
