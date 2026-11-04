[**unifi-protect**](../README.md)

***

[Home](../README.md) / PROTECT\_RECOVERY\_STEADY\_INTERVAL\_MS

# Variable: PROTECT\_RECOVERY\_STEADY\_INTERVAL\_MS

```ts
const PROTECT_RECOVERY_STEADY_INTERVAL_MS: 60000 = 60000;
```

Connection-recovery steady-state floor, in milliseconds. Each network backoff track walks out to this interval and then probes at it indefinitely until the
controller returns or the monitor is disposed. This is the single "recover without slamming a down controller" guarantee: no matter how an unreachable episode
began, sustained re-probing settles to this cadence, while a refusal settles onto the slower floor of its own schedule, and a controller whose
`Retry-After` hint asks for longer than this floor sets the pace instead, up to the refusal schedule's steady interval. It sits well below the bootstrap-refresh
and throttle windows so recovery is prompt, yet coarse enough not to hammer a rebooting controller.
