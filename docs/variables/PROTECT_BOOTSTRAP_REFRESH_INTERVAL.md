[**unifi-protect**](../README.md)

***

[Home](../README.md) / PROTECT\_BOOTSTRAP\_REFRESH\_INTERVAL

# Variable: PROTECT\_BOOTSTRAP\_REFRESH\_INTERVAL

```ts
const PROTECT_BOOTSTRAP_REFRESH_INTERVAL: 120000 = 120000;
```

Bootstrap refresh failsafe interval, in milliseconds. The StateStore re-bootstraps the controller on this cadence because Protect firmware occasionally drops realtime
events; a periodic full re-bootstrap is the only way to guarantee eventual consistency. The reducer's applyBootstrap reconciliation makes the refresh invisible (zero
observer notifications) when nothing has actually drifted. This is a permanent contract, not a workaround.
