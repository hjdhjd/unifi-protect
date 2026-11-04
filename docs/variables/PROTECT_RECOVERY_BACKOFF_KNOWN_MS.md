[**unifi-protect**](../README.md)

***

[Home](../README.md) / PROTECT\_RECOVERY\_BACKOFF\_KNOWN\_MS

# Variable: PROTECT\_RECOVERY\_BACKOFF\_KNOWN\_MS

```ts
const PROTECT_RECOVERY_BACKOFF_KNOWN_MS: number[];
```

Connection-recovery backoff, in milliseconds, for the known-reboot track. The ConnectionMonitor enters this track only when a fault follows a self-initiated controller
reboot (the one case where the cause is certain). It is a return-time-anticipating curve: a controller takes 5-7 minutes to come back, so probing earlier is wasted
effort that risks hammering a fragile fresh controller. The stages are the delays *before* successive probes - wait 5 minutes, probe, then +2 minutes, probe - after
which the monitor falls through to the shared steady floor. See the unknown-track curve for the complementary entry point.
