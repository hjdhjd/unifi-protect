[**unifi-protect**](../README.md)

***

[Home](../README.md) / wallClock

# Variable: wallClock

```ts
const wallClock: Clock;
```

The production clock. Reads wall-clock time via `Date.now()` and timers via `node:timers/promises`. This shim is the single bridge between the `Clock` interface and
Node's runtime; consumers always go through `Clock`, never directly to the Node primitives, so an unmocked call site behaves exactly like a direct `Date.now()` or
`node:timers/promises` call would.

Consumer tests (the `ConnectionMonitor`, `LivestreamPool`, `StateStore`, and the like) construct a fake clock instead of importing this; this module's own test
exercises `wallClock` directly to confirm it reads real time and drives real timers. Production code receives this as the default in every constructor that takes a
`Clock`.
