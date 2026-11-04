[**unifi-protect**](../README.md)

***

[Home](../README.md) / Clock

# Interface: Clock

Source of time for any code that needs to know "what time is it now?", "how much time has passed?", "wake me up after a delay," or "call me back once the time is
up." Every timer and timestamp in the library reads time through this interface, never through `Date.now()`, `process.hrtime`, `node:timers/promises`, or the
global `setTimeout` directly. Tests substitute a controllable clock to drive time deterministically without real-time waits or module-level mocking. Outside it by
design are undici's own timers - its connect timer, the retry interceptor's backoff, and the pool's client lifetime - which are the dependency's, armed on the
platform's timers inside undici where no injected clock reaches, and the `ufp` CLI, a consumer of the library that reads ambient time as any consumer does.

The interface is shaped by what consumers actually need - a clock, a monotonic reading, a one-shot delay, and a one-shot callback timer (`now` / `monotonic` /
`delay` / `schedule`), no more. Adding methods speculatively (setImmediate, a repeating timer, etc.) would be YAGNI; adding them when a consumer first needs one
is principled, and each member here answers a consumer. `monotonic` serves every elapsed time the library measures - the throttle breaker's cooldown, a request's
duration and the elapsed time a failed one reports, a connection attempt's elapsed time, the silence each watchdog measures, a livestream recovery episode's
length and downtime, the time since the last segment a recovery reports, and the reboot anticipation window - each a whole-millisecond difference taken
through `millisecondsSince`, because a wall-clock step would move a measure taken on `now`, and these are readings a suite steps rather than waits for. `now` is
the time of day, read for a timestamp that leaves the library, recorded when its event happens - the livestream stall diagnostic's and a subscriber's stats'
`lastSegmentAt` - and for the one reading the library acts on itself: a `Retry-After` HTTP-date's distance from now, the hinted wait connection recovery reads
off a controller's answer, because such a date is a time of day and `now` is the one reading on its timeline. `delay` serves the connection-recovery backoff
curve and the livestream pool's establishing and recovery windows, each a one-shot wait of varying duration. `schedule` serves the transport's request deadline,
which `armDeadline` arms on it, so a suite fires the deadline rather than waiting it out and a request releases its timer the moment it settles. A repeating
consumer - the events and livestream heartbeat watchdogs, the livestream pool's media-stall watchdog, the store's refresh failsafe - is itself a loop that awaits
one `delay` per pass, so that single primitive covers a varying sequence and a fixed period alike.

The production clock is more than the primitives it wraps only where the platform timer's range runs out, and it answers there as homebridge-plugin-utils' clock
does. A finite span past the ceiling is carried in full rather than fired at once, and an infinite span never elapses: nothing is armed for it, so an infinite
timer never fires, an infinite delay settles only when its signal aborts, and nothing holds the process open on its account. A consumer states the span it means
and never clamps it for the platform.

Why dependency injection here rather than module mocking: time is a real dependency the code reads from, not an incidental detail of the runtime. Naming
it as a parameter at the function (or constructor) signature makes the dependency visible at the call site - a reader sees `clock: Clock` and immediately
knows the function reads time. With ambient `Date.now()`, the same reader has to scan the function body to discover the dependency. Surfacing implicit
dependencies is the architectural property that makes the rest of the testing story trivial.

## Methods

### delay()

```ts
delay(ms, init): Promise<void>;
```

Resolves once, after `ms` milliseconds, unless the abort signal fires first. Mirrors `setTimeout` from `node:timers/promises` but takes only the parameters
we actually use - the value parameter and the optional `ref` flag are omitted because no consumer needs them.

The signal is required rather than optional because every consumer here waits inside a lifecycle that disposal has to be able to end: a loop that forgot
cancellation would hold its subsystem open past teardown, and requiring the signal makes that shape unwritable. The returned promise rejects with an
`AbortError` if the signal aborts before the delay elapses, matching `setTimeout` from `node:timers/promises`, so a consumer's loop ends cleanly on disposal.
A finite delay past the platform timer's ceiling is carried in full: the production clock awaits the primitive once per hop of at most the ceiling, each hop
under the caller's signal. An infinite delay never elapses: the production clock arms nothing for it, so it settles only when the signal aborts, rejecting with
the same `AbortError`, and it holds no process open while it waits.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `ms` | `number` | Delay before the promise resolves, in milliseconds. |
| `init` | \{ `signal`: `AbortSignal`; \} | Includes the abort signal that cancels the delay. |
| `init.signal` | `AbortSignal` | - |

#### Returns

`Promise`\<`void`\>

A promise that resolves after the delay, or rejects with `AbortError` on abort.

***

### monotonic()

```ts
monotonic(): number;
```

Returns a reading of the platform's monotonic clock: an integer count of microseconds on `process.hrtime`'s timeline, from its origin, divided by 1000, so the
reading is in milliseconds and `Math.round(reading * 1000)` recovers the count exactly. A wall-clock change never moves it, so a later reading less an earlier
one is the time that passed between them however the time of day was set meanwhile. Whether it advances across a system suspend depends on the platform's
monotonic clock. Its origin is the platform's rather than the process's, so an uptime is a consumer's own difference from a reading it took when it started.
The production [wallClock](../variables/wallClock.md) implements this as `process.hrtime.bigint()` truncated to whole microseconds.

#### Returns

`number`

The monotonic reading, in milliseconds to the microsecond.

***

### now()

```ts
now(): number;
```

Returns the current wall-clock time in milliseconds since the Unix epoch. The semantic matches `Date.now()`.

#### Returns

`number`

***

### schedule()

```ts
schedule(
   callback, 
   ms, 
   init?
): Disposable;
```

Runs `callback` once, after `ms` milliseconds. The production clock arms it on the global `setTimeout`, read at call time rather than bound when the module
loads, so a harness that replaces the global observes the timer. A finite window past the platform timer's ceiling is carried in full: the production clock
arms at most the ceiling and re-arms for the remainder, so the callback runs when asked. An infinite window never comes due: the production clock arms nothing
for it, so the callback never runs, disposing the handle does nothing, and nothing holds the process open whatever `init.unref` says.

With `init.unref` set the timer never holds the process open, so a process whose only pending work is a timer armed this way exits without waiting for it.
Omitted, the platform's default holds: the timer keeps the process alive until it fires or is disposed. Set or omitted, the timer comes due at the same moment,
so the flag decides only whether the process waits for it.

The timer is one-shot only. Every repeating consumer here is a loop that awaits one `delay` per pass, and what needs a callback timer is the deadline
`armDeadline` arms, which fires once, so a repeating arm would add surface no consumer calls.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `callback` | () => `void` | The function to run when the timer fires. |
| `ms` | `number` | The timer's window, in milliseconds. |
| `init?` | \{ `unref?`: `boolean`; \} | Optional init options. `unref` arms a timer that does not hold the process open. |
| `init.unref?` | `boolean` | - |

#### Returns

`Disposable`

A handle whose `[Symbol.dispose]` cancels the timer. Disposing it before it fires means the callback never runs; disposing it after it fired, or a
second time, does nothing.
