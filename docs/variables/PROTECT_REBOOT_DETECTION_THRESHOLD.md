[**unifi-protect**](../README.md)

***

[Home](../README.md) / PROTECT\_REBOOT\_DETECTION\_THRESHOLD

# Variable: PROTECT\_REBOOT\_DETECTION\_THRESHOLD

```ts
const PROTECT_REBOOT_DETECTION_THRESHOLD: 5000 = 5000;
```

Reboot-detection noise floor, in milliseconds. The controller's self-reported boot time (nvr.upSince) is a noisy measurement of the boot instant, not a stable epoch:
it is observed to jitter by a few milliseconds across bootstraps (plausibly recomputed as now - uptime, and NTP-perturbable). A genuine reboot moves upSince by at
least the prior uptime - minutes to hours - so the ConnectionMonitor treats a boot-time change smaller than this threshold as measurement noise rather than a reboot.
The value sits orders of magnitude above the observed jitter and far below any realistic reboot delta.
