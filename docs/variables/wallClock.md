[**unifi-protect**](../README.md)

***

[Home](../README.md) / wallClock

# Variable: wallClock

```ts
const wallClock: Clock;
```

The production clock. Reads wall-clock time via `Date.now()`, the monotonic clock via `process.hrtime.bigint()` truncated to whole microseconds and read in
milliseconds, delays via `node:timers/promises`, and arms callback timers on the global `setTimeout`. This shim is the single bridge between the `Clock`
interface and Node's runtime; consumers always go through `Clock`, never directly to the Node primitives, so an unmocked call site behaves exactly like a direct
`Date.now()`, `process.hrtime.bigint()`, `node:timers/promises`, or `setTimeout` call would - except past the platform timer's ceiling, where the platform would
fire at once and this clock fires when asked, and at an infinite span, which the platform would fire at once and this clock never fires.

Consumer tests (the `ConnectionMonitor`, `LivestreamPool`, `StateStore`, and the like) construct homebridge-plugin-utils' `TestClock` instead of importing this;
this module's own test exercises `wallClock` directly to confirm it reads real time and drives real timers. Production code receives this as the default in every
constructor that takes a `Clock`.
