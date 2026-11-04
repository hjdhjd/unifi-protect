[**unifi-protect**](../README.md)

***

[Home](../README.md) / PROTECT\_RECOVERY\_BACKOFF\_UNKNOWN\_MS

# Variable: PROTECT\_RECOVERY\_BACKOFF\_UNKNOWN\_MS

```ts
const PROTECT_RECOVERY_BACKOFF_UNKNOWN_MS: number[];
```

Connection-recovery backoff, in milliseconds, for the unknown-unreachable track. The ConnectionMonitor enters this track on any unsolicited fault (a stall, a socket
drop, a network error - including an autonomous reboot, which at t=0 is indistinguishable from a transient blip). It enters at the short end - probe at once to catch a
blip in seconds - then walks the delay out toward the steady floor, so an autonomous reboot still recovers within roughly a steady interval of the controller's return.
The leading zero means the first probe fires immediately on the fault. After these stages the monitor falls through to the shared steady floor.
