/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * clock.ts: Time abstraction for the UniFi Protect API.
 */
import timersPromises from "node:timers/promises";

/**
 * Source of time for any code that needs to know "what time is it now?", "how much time has passed?", "wake me up after a delay," or "call me back once the time is
 * up." Every timer and timestamp in the library reads time through this interface, never through `Date.now()`, `process.hrtime`, `node:timers/promises`, or the
 * global `setTimeout` directly. Tests substitute a controllable clock to drive time deterministically without real-time waits or module-level mocking. Outside it by
 * design are undici's own timers - its connect timer, the retry interceptor's backoff, and the pool's client lifetime - which are the dependency's, armed on the
 * platform's timers inside undici where no injected clock reaches, and the `ufp` CLI, a consumer of the library that reads ambient time as any consumer does.
 *
 * The interface is shaped by what consumers actually need - a clock, a monotonic reading, a one-shot delay, and a one-shot callback timer (`now` / `monotonic` /
 * `delay` / `schedule`), no more. Adding methods speculatively (setImmediate, a repeating timer, etc.) would be YAGNI; adding them when a consumer first needs one
 * is principled, and each member here answers a consumer. `monotonic` serves every elapsed time the library measures - the throttle breaker's cooldown, a request's
 * duration and the elapsed time a failed one reports, a connection attempt's elapsed time, the silence each watchdog measures, a livestream recovery episode's
 * length and downtime, the time since the last segment a recovery reports, and the reboot anticipation window - each a whole-millisecond difference taken
 * through `millisecondsSince`, because a wall-clock step would move a measure taken on `now`, and these are readings a suite steps rather than waits for. `now` is
 * the time of day, read for a timestamp that leaves the library, recorded when its event happens - the livestream stall diagnostic's and a subscriber's stats'
 * `lastSegmentAt` - and for the one reading the library acts on itself: a `Retry-After` HTTP-date's distance from now, the hinted wait connection recovery reads
 * off a controller's answer, because such a date is a time of day and `now` is the one reading on its timeline. `delay` serves the connection-recovery backoff
 * curve and the livestream pool's establishing and recovery windows, each a one-shot wait of varying duration. `schedule` serves the transport's request deadline,
 * which `armDeadline` arms on it, so a suite fires the deadline rather than waiting it out and a request releases its timer the moment it settles. A repeating
 * consumer - the events and livestream heartbeat watchdogs, the livestream pool's media-stall watchdog, the store's refresh failsafe - is itself a loop that awaits
 * one `delay` per pass, so that single primitive covers a varying sequence and a fixed period alike.
 *
 * The production clock is more than the primitives it wraps only where the platform timer's range runs out, and it answers there as homebridge-plugin-utils' clock
 * does. A finite span past the ceiling is carried in full rather than fired at once, and an infinite span never elapses: nothing is armed for it, so an infinite
 * timer never fires, an infinite delay settles only when its signal aborts, and nothing holds the process open on its account. A consumer states the span it means
 * and never clamps it for the platform.
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
   * Resolves once, after `ms` milliseconds, unless the abort signal fires first. Mirrors `setTimeout` from `node:timers/promises` but takes only the parameters
   * we actually use - the value parameter and the optional `ref` flag are omitted because no consumer needs them.
   *
   * The signal is required rather than optional because every consumer here waits inside a lifecycle that disposal has to be able to end: a loop that forgot
   * cancellation would hold its subsystem open past teardown, and requiring the signal makes that shape unwritable. The returned promise rejects with an
   * `AbortError` if the signal aborts before the delay elapses, matching `setTimeout` from `node:timers/promises`, so a consumer's loop ends cleanly on disposal.
   * A finite delay past the platform timer's ceiling is carried in full: the production clock awaits the primitive once per hop of at most the ceiling, each hop
   * under the caller's signal. An infinite delay never elapses: the production clock arms nothing for it, so it settles only when the signal aborts, rejecting with
   * the same `AbortError`, and it holds no process open while it waits.
   *
   * @param ms   - Delay before the promise resolves, in milliseconds.
   * @param init - Includes the abort signal that cancels the delay.
   *
   * @returns A promise that resolves after the delay, or rejects with `AbortError` on abort.
   */
  delay(ms: number, init: { signal: AbortSignal }): Promise<void>;

  /**
   * Returns a reading of the platform's monotonic clock: an integer count of microseconds on `process.hrtime`'s timeline, from its origin, divided by 1000, so the
   * reading is in milliseconds and `Math.round(reading * 1000)` recovers the count exactly. A wall-clock change never moves it, so a later reading less an earlier
   * one is the time that passed between them however the time of day was set meanwhile. Whether it advances across a system suspend depends on the platform's
   * monotonic clock. Its origin is the platform's rather than the process's, so an uptime is a consumer's own difference from a reading it took when it started.
   * The production {@link wallClock} implements this as `process.hrtime.bigint()` truncated to whole microseconds.
   *
   * @returns The monotonic reading, in milliseconds to the microsecond.
   */
  monotonic(): number;

  /**
   * Returns the current wall-clock time in milliseconds since the Unix epoch. The semantic matches `Date.now()`.
   */
  now(): number;

  /**
   * Runs `callback` once, after `ms` milliseconds. The production clock arms it on the global `setTimeout`, read at call time rather than bound when the module
   * loads, so a harness that replaces the global observes the timer. A finite window past the platform timer's ceiling is carried in full: the production clock
   * arms at most the ceiling and re-arms for the remainder, so the callback runs when asked. An infinite window never comes due: the production clock arms nothing
   * for it, so the callback never runs, disposing the handle does nothing, and nothing holds the process open whatever `init.unref` says.
   *
   * With `init.unref` set the timer never holds the process open, so a process whose only pending work is a timer armed this way exits without waiting for it.
   * Omitted, the platform's default holds: the timer keeps the process alive until it fires or is disposed. Set or omitted, the timer comes due at the same moment,
   * so the flag decides only whether the process waits for it.
   *
   * The timer is one-shot only. Every repeating consumer here is a loop that awaits one `delay` per pass, and what needs a callback timer is the deadline
   * `armDeadline` arms, which fires once, so a repeating arm would add surface no consumer calls.
   *
   * @param callback - The function to run when the timer fires.
   * @param ms       - The timer's window, in milliseconds.
   * @param init     - Optional init options. `unref` arms a timer that does not hold the process open.
   *
   * @returns A handle whose `[Symbol.dispose]` cancels the timer. Disposing it before it fires means the callback never runs; disposing it after it fired, or a
   * second time, does nothing.
   */
  schedule(callback: () => void, ms: number, init?: { unref?: boolean }): Disposable;
}

/**
 * The platform timer's ceiling in milliseconds. Node arms a callback timer and a promise delay alike on a 32-bit signed count, and sets a delay past this value to one
 * millisecond with a TimeoutOverflowWarning rather than refusing it. The production clock carries a finite delay past the ceiling as a chain of arms of at most this
 * length, so the value is the hop size as well as the boundary, and arms nothing for an infinite span, which never elapses. It is a fact of the platform rather than a
 * tunable, so it sits beside the clock that carries it rather than among the library's settings, and a consumer never clamps a delay to it, because the clock carries
 * a longer delay itself.
 */
export const TIMER_DELAY_MAX_MS = 2147483647;

/* Whether `ms` is a finite delay the platform cannot carry in one arm. An infinite span is not one, because it never elapses, which `neverElapses` states, and the
 * finiteness test keeps this predicate true to its name whichever branch a member checks first. Anything else - a delay within the ceiling, a non-positive one,
 * negative infinity among them, or `NaN` - is handed to the platform timer as it stands, under that timer's own rules.
 */
function pastCeiling(ms: number): boolean {

  return Number.isFinite(ms) && (ms > TIMER_DELAY_MAX_MS);
}

/* Whether `ms` is an infinite span, which never elapses. Every member that arms time checks it first and arms nothing for such a span, because each alternative fires
 * a wait meant never to end or keeps the process alive for it: the platform's own arm fires it after one millisecond, a chain of ceiling-length hops never ends and,
 * referenced, never lets the process exit, and a clamp to the ceiling fires it once the ceiling elapses. The test is an equality rather than a finiteness check,
 * because negative infinity is a negative span and `NaN` fires after one millisecond, each under the platform's own rules.
 */
function neverElapses(ms: number): boolean {

  return ms === Infinity;
}

/* Arm one platform one-shot and apply the process-hold policy to it. Every timer the production clock arms goes through this one site, the chain's hops included, so
 * the policy a consumer stated reaches every hop. The bare `setTimeout` resolves to the global callback timer and is read inside the body at call time, so a harness
 * that replaces the global, `node:test`'s mock timers among them, observes every timer this clock arms, hops included.
 */
function armPlatformTimer(callback: () => void, ms: number, init?: { unref?: boolean }): NodeJS.Timeout {

  const handle = setTimeout(callback, ms);

  if(init?.unref ?? false) {

    handle.unref();
  }

  return handle;
}

/* Arm `callback` after a delay past the platform's ceiling, as a chain of one-shot arms of at most the ceiling each. Every hop but the last re-arms for what remains,
 * and the last runs the callback. The remainder counts down by the hop that was armed rather than by a wall-clock read, so the chain means what the platform means by
 * a delay - the callback runs after `ms` of timer time - and a wall-clock step never moves it. Each hop's handle replaces the one before it and the disposer reads
 * whichever hop is live, so a cancel mid-chain clears the hop that is actually armed.
 */
function armPastCeiling(callback: () => void, ms: number, init?: { unref?: boolean }): Disposable {

  let live: NodeJS.Timeout | undefined;

  const arm = (remaining: number): void => {

    const hop = Math.min(remaining, TIMER_DELAY_MAX_MS);

    live = armPlatformTimer((): void => {

      if(remaining > hop) {

        arm(remaining - hop);

        return;
      }

      callback();
    }, hop, init);
  };

  arm(ms);

  return { [Symbol.dispose]: (): void => clearTimeout(live) };
}

/* Await a delay past the platform's ceiling as consecutive waits on the promise primitive, each at most the ceiling and each under the caller's signal, so the
 * primitive's own `AbortError` is what an abort rejects with whichever hop is waiting, and a pre-aborted signal rejects on the first.
 */
async function delayPastCeiling(ms: number, init: { signal: AbortSignal }): Promise<void> {

  for(let remaining = ms; remaining > 0; remaining -= TIMER_DELAY_MAX_MS) {

    // Each hop has to finish before the next is armed, which is the whole point of the loop.
    // eslint-disable-next-line no-await-in-loop
    await timersPromises.setTimeout(Math.min(remaining, TIMER_DELAY_MAX_MS), undefined, init);
  }
}

/* Wait on an infinite span, which arms no timer because none could ever come due. The wait registers one abort listener, and when the signal aborts it hands the
 * aborted signal to the promise primitive, which rejects at once without arming anything, so an infinite wait rejects with exactly the `AbortError` a finite one
 * does; a signal already aborted goes straight to that call. The listener is `once`, so the abort that fires it also detaches it, and until then it lives exactly as
 * long as the wait it serves. A caller outside the type system that hands no signal waits forever, and with nothing armed, nothing holds the process open on its
 * account.
 */
function delayUntilAbort({ signal }: { signal?: AbortSignal } = {}): Promise<void> {

  const { promise, resolve }: PromiseWithResolvers<void> = Promise.withResolvers();

  if(signal === undefined) {

    return promise;
  }

  if(signal.aborted) {

    return timersPromises.setTimeout(0, undefined, { signal });
  }

  signal.addEventListener("abort", (): void => resolve(timersPromises.setTimeout(0, undefined, { signal })), { once: true });

  return promise;
}

/**
 * The production clock. Reads wall-clock time via `Date.now()`, the monotonic clock via `process.hrtime.bigint()` truncated to whole microseconds and read in
 * milliseconds, delays via `node:timers/promises`, and arms callback timers on the global `setTimeout`. This shim is the single bridge between the `Clock`
 * interface and Node's runtime; consumers always go through `Clock`, never directly to the Node primitives, so an unmocked call site behaves exactly like a direct
 * `Date.now()`, `process.hrtime.bigint()`, `node:timers/promises`, or `setTimeout` call would - except past the platform timer's ceiling, where the platform would
 * fire at once and this clock fires when asked, and at an infinite span, which the platform would fire at once and this clock never fires.
 *
 * Consumer tests (the `ConnectionMonitor`, `LivestreamPool`, `StateStore`, and the like) construct homebridge-plugin-utils' `TestClock` instead of importing this;
 * this module's own test exercises `wallClock` directly to confirm it reads real time and drives real timers. Production code receives this as the default in every
 * constructor that takes a `Clock`.
 *
 * @category Utilities
 */
export const wallClock: Clock = {

  /* The promise primitive is read off the `node:timers/promises` module object at call time rather than bound by a named import, because the module object is what
   * `node:test`'s mock timers patch - a named import binds the original and a harness never sees the wait. A delay past the ceiling awaits the same primitive once
   * per hop, and an infinite one arms nothing and settles only through its signal.
   */
  delay: (ms: number, init: { signal: AbortSignal }): Promise<void> => {

    if(neverElapses(ms)) {

      return delayUntilAbort(init);
    }

    return pastCeiling(ms) ? delayPastCeiling(ms, init) : timersPromises.setTimeout(ms, undefined, init);
  },

  /* The reading is truncated to whole microseconds before it becomes a `number`, because nanoseconds since the platform's origin, which is near boot on common
   * hosts, outgrow the integers a `number` holds exactly after about a hundred days. A count of microseconds stays exact, and its reading in milliseconds rounds
   * back to it, for years past any realistic uptime, so a consumer recovering the microseconds with `Math.round` gets back the very count this read.
   */
  monotonic: (): number => Number(process.hrtime.bigint() / 1000n) / 1000,

  now: (): number => Date.now(),

  /* An infinite window never comes due, so it arms nothing and answers a disposer with nothing to cancel. A window the platform can carry is the platform's own
   * timer, the same call one indirection removed, and one past the ceiling the clock carries as a chain. A single disposer serves every armed window, because
   * `clearTimeout` clears whichever timer it is handed.
   */
  schedule: (callback: () => void, ms: number, init?: { unref?: boolean }): Disposable => {

    if(neverElapses(ms)) {

      return { [Symbol.dispose]: (): void => undefined };
    }

    if(pastCeiling(ms)) {

      return armPastCeiling(callback, ms, init);
    }

    const handle = armPlatformTimer(callback, ms, init);

    return { [Symbol.dispose]: (): void => clearTimeout(handle) };
  }
};

/**
 * A deadline armed by `armDeadline`: the signal that aborts when the span elapses, and the disposer that releases the timer behind it. Its holder hands `signal` to
 * the work it bounds and disposes the deadline when that work settles, with `using` where the work is a scope. A deadline disposed before its span elapses leaves its
 * signal unaborted for good.
 */
export interface Deadline extends Disposable {

  readonly signal: AbortSignal;
}

/**
 * Arms a deadline of `ms` milliseconds on a clock, answering a `Deadline` whose signal aborts when the span elapses and whose disposal releases the timer.
 *
 * The signal aborts with the platform's deadline reason: a `DOMException` whose `name` is `"TimeoutError"`, the reason `AbortSignal.timeout` aborts with, so the
 * cause a `ProtectTimeoutError` carries keeps the platform's shape. The abort is one of the clock's own timers, armed through `schedule` with `unref` set, so a
 * pending deadline never holds the process open, and a suite holding a `TestClock` fires it with an advance rather than a real wait. Because the deadline is
 * `schedule`'s timer, the span's domain is `schedule`'s as well: a finite span past the platform timer's ceiling is carried in full, and an infinite span never
 * aborts the signal.
 *
 * Its holder releases the deadline when the work it bounds settles - with `using` where that work is a scope - so no timer outlives the work. Disposing after the
 * deadline fired, and disposing a second time, do nothing. Composing the deadline's signal with a caller's own stays the holder's job, through `AbortSignal.any`,
 * so the deadline hands back one primitive rather than an assembled lifetime.
 *
 * This is a local copy of homebridge-plugin-utils' `armDeadline`. The library takes no runtime dependency on homebridge-plugin-utils, so a differential test in this
 * package's suite runs each deadline over a fresh `TestClock` and asserts the same observations come back, which is what keeps the two of them one behavior.
 *
 * @param ms            - The deadline, in milliseconds.
 * @param options       - Optional deadline options.
 * @param options.clock - The time source the deadline is armed on. Defaults to `wallClock`.
 *
 * @returns A `Deadline` carrying the signal, for its holder to dispose when the work it bounds settles.
 */
export function armDeadline(ms: number, { clock = wallClock }: { clock?: Clock } = {}): Deadline {

  const controller = new AbortController();
  const timer = clock.schedule((): void => controller.abort(new DOMException("The operation was aborted due to timeout", "TimeoutError")), ms, { unref: true });

  return { [Symbol.dispose]: (): void => timer[Symbol.dispose](), signal: controller.signal };
}

/**
 * Answers the whole milliseconds a clock's monotonic reading has moved since an earlier reading of it, which is the one way the library measures an elapsed time.
 *
 * The difference is taken on `monotonic()` rather than `now()`, so a change to the time of day between the two readings - an NTP correction, often a large one on a
 * host with no real-time clock - never moves it. It is rounded to the nearest whole millisecond because the reading carries microseconds, and a raw difference of two
 * readings prints with floating-point noise wherever the figure is published or logged, so every elapsed figure stays an integer.
 *
 * @param since         - An earlier `monotonic()` reading of the same clock.
 * @param options       - Optional elapsed-time options.
 * @param options.clock - The clock `since` was read from. Defaults to `wallClock`.
 *
 * @returns The milliseconds that have passed since `since`, rounded to a whole number.
 */
export function millisecondsSince(since: number, { clock = wallClock }: { clock?: Clock } = {}): number {

  return Math.round(clock.monotonic() - since);
}
