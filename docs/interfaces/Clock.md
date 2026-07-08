[**unifi-protect**](../README.md)

***

[Home](../README.md) / Clock

# Interface: Clock

Source of time for any code that needs to know "what time is it now?" or "wake me up at intervals." Production code reads time exclusively through this
interface, never through `Date.now()` or `node:timers/promises` directly. Tests substitute a fake clock to drive time deterministically without real-time
waits or module-level mocking.

The interface is shaped by what consumers actually need - the canonical trio of clock, one-shot timeout, and repeating interval (`now` / `wait` / `setInterval`),
no more. Adding methods speculatively (setImmediate, etc.) would be YAGNI; adding them when a consumer first needs one is principled - `wait` earned its place when
the connection-recovery backoff curve needed a one-shot delay of varying duration (a genuinely distinct primitive from a fixed repeating interval). The consumers are
every subsystem that needs wall-clock time, a single delay, or interval ticks - the transport throttle breaker, the events and livestream watchdogs, the store refresh
loop, and the connection recovery loop among them.

Why dependency injection here rather than module mocking: time is a real dependency the code reads from, not an incidental detail of the runtime. Naming
it as a parameter at the function (or constructor) signature makes the dependency visible at the call site - a reader sees `clock: Clock` and immediately
knows the function reads time. With ambient `Date.now()`, the same reader has to scan the function body to discover the dependency. Surfacing implicit
dependencies is the architectural property that makes the rest of the testing story trivial.

## Methods

### now()

```ts
now(): number;
```

Returns the current wall-clock time in milliseconds since the Unix epoch. The semantic matches `Date.now()`.

#### Returns

`number`

***

### setInterval()

```ts
setInterval(delayMs, options): AsyncIterable<void>;
```

Yields once per `delayMs` interval until the abort signal fires. Mirrors `setInterval` from `node:timers/promises` but takes only the parameters we
actually use - the value parameter and the optional `ref` flag are omitted because no consumer needs them.

The returned async iterable terminates cleanly when the signal aborts (the iterator throws an `AbortError`, which the consumer's `for await` catches).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `delayMs` | `number` | Interval between yields in milliseconds. |
| `options` | \{ `signal`: `AbortSignal`; \} | Includes the abort signal that ends the iteration. |
| `options.signal` | `AbortSignal` | - |

#### Returns

`AsyncIterable`\<`void`\>

An async iterable that yields `void` once per interval until the signal aborts.

***

### wait()

```ts
wait(delayMs, options): Promise<void>;
```

Resolves once, after `delayMs` milliseconds, unless the abort signal fires first. Mirrors `setTimeout` from `node:timers/promises` but takes only the
parameters we actually use - the value parameter and the optional `ref` flag are omitted because no consumer needs them.

This is a one-shot delay, distinct from `setInterval`'s repeating ticks: the connection-recovery backoff walks a sequence of *varying* delays, which a
fixed-interval iterator cannot express. The returned promise rejects with an `AbortError` if the signal aborts before the delay elapses, matching
`setTimeout` from `node:timers/promises`, so a consumer's recovery loop ends cleanly on disposal.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `delayMs` | `number` | Delay before the promise resolves, in milliseconds. |
| `options` | \{ `signal`: `AbortSignal`; \} | Includes the abort signal that cancels the wait. |
| `options.signal` | `AbortSignal` | - |

#### Returns

`Promise`\<`void`\>

A promise that resolves after the delay, or rejects with `AbortError` on abort.
