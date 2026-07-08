/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * clock.ts: Time abstraction for the UniFi Protect API.
 */
import { setInterval as setIntervalAsync, setTimeout as setTimeoutAsync } from "node:timers/promises";

/**
 * Source of time for any code that needs to know "what time is it now?" or "wake me up at intervals." Production code reads time exclusively through this
 * interface, never through `Date.now()` or `node:timers/promises` directly. Tests substitute a fake clock to drive time deterministically without real-time
 * waits or module-level mocking.
 *
 * The interface is shaped by what consumers actually need - the canonical trio of clock, one-shot timeout, and repeating interval (`now` / `wait` / `setInterval`),
 * no more. Adding methods speculatively (setImmediate, etc.) would be YAGNI; adding them when a consumer first needs one is principled - `wait` earned its place when
 * the connection-recovery backoff curve needed a one-shot delay of varying duration (a genuinely distinct primitive from a fixed repeating interval). The consumers are
 * every subsystem that needs wall-clock time, a single delay, or interval ticks - the transport throttle breaker, the events and livestream watchdogs, the store refresh
 * loop, and the connection recovery loop among them.
 *
 * Why dependency injection here rather than module mocking: time is a real dependency the code reads from, not an incidental detail of the runtime. Naming
 * it as a parameter at the function (or constructor) signature makes the dependency visible at the call site - a reader sees `clock: Clock` and immediately
 * knows the function reads time. With ambient `Date.now()`, the same reader has to scan the function body to discover the dependency. Surfacing implicit
 * dependencies is the architectural property that makes the rest of the testing story trivial.
 *
 * @category Utilities
 */
export interface Clock {

  /**
   * Returns the current wall-clock time in milliseconds since the Unix epoch. The semantic matches `Date.now()`.
   */
  now(): number;

  /**
   * Resolves once, after `delayMs` milliseconds, unless the abort signal fires first. Mirrors `setTimeout` from `node:timers/promises` but takes only the
   * parameters we actually use - the value parameter and the optional `ref` flag are omitted because no consumer needs them.
   *
   * This is a one-shot delay, distinct from `setInterval`'s repeating ticks: the connection-recovery backoff walks a sequence of *varying* delays, which a
   * fixed-interval iterator cannot express. The returned promise rejects with an `AbortError` if the signal aborts before the delay elapses, matching
   * `setTimeout` from `node:timers/promises`, so a consumer's recovery loop ends cleanly on disposal.
   *
   * @param delayMs - Delay before the promise resolves, in milliseconds.
   * @param options - Includes the abort signal that cancels the wait.
   *
   * @returns A promise that resolves after the delay, or rejects with `AbortError` on abort.
   */
  wait(delayMs: number, options: { signal: AbortSignal }): Promise<void>;

  /**
   * Yields once per `delayMs` interval until the abort signal fires. Mirrors `setInterval` from `node:timers/promises` but takes only the parameters we
   * actually use - the value parameter and the optional `ref` flag are omitted because no consumer needs them.
   *
   * The returned async iterable terminates cleanly when the signal aborts (the iterator throws an `AbortError`, which the consumer's `for await` catches).
   *
   * @param delayMs - Interval between yields in milliseconds.
   * @param options - Includes the abort signal that ends the iteration.
   *
   * @returns An async iterable that yields `void` once per interval until the signal aborts.
   */
  setInterval(delayMs: number, options: { signal: AbortSignal }): AsyncIterable<void>;
}

/**
 * The production clock. Reads wall-clock time via `Date.now()` and timers via `node:timers/promises`. This shim is the single bridge between the `Clock` interface and
 * Node's runtime; consumers always go through `Clock`, never directly to the Node primitives, so an unmocked call site behaves exactly like a direct `Date.now()` or
 * `node:timers/promises` call would.
 *
 * Consumer tests (the `ConnectionMonitor`, `LivestreamPool`, `StateStore`, and the like) construct a fake clock instead of importing this; this module's own test
 * exercises `wallClock` directly to confirm it reads real time and drives real timers. Production code receives this as the default in every constructor that takes a
 * `Clock`.
 *
 * @category Utilities
 */
export const wallClock: Clock = {

  now: (): number => Date.now(),

  setInterval: (delayMs: number, options: { signal: AbortSignal }): AsyncIterable<void> => setIntervalAsync(delayMs, undefined, options),

  wait: (delayMs: number, options: { signal: AbortSignal }): Promise<void> => setTimeoutAsync(delayMs, undefined, options)
};
