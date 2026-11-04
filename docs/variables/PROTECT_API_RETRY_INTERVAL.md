[**unifi-protect**](../README.md)

***

[Home](../README.md) / PROTECT\_API\_RETRY\_INTERVAL

# Variable: PROTECT\_API\_RETRY\_INTERVAL

```ts
const PROTECT_API_RETRY_INTERVAL: 300 = 300;
```

Interval, in seconds, to wait before trying to access the API again once we've hit the PROTECT_API_ERROR_LIMIT threshold. The breaker waits out this cooldown on its
own only while the ConnectionMonitor is idle - HTTP failing while the realtime events channel stays alive. During a recovery episode the monitor's probe skips the
cooldown and paces re-probing on its own backoff curve, so this cooldown can stay long without delaying recovery from a controller outage.
