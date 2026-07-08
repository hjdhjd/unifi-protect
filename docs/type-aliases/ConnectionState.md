[**unifi-protect**](../README.md)

***

[Home](../README.md) / ConnectionState

# Type Alias: ConnectionState

```ts
type ConnectionState = RecoveryPhase | "throttled";
```

The connection's observable state. `healthy` is steady operation; `degraded` means a fault was detected and reachability is being probed; `reconnecting` means the
controller is reachable and the monitor is re-bootstrapping and relaunching the events stream; `lost` means the controller is unreachable and recovery is polling;
`throttled` means the transport's circuit breaker is open (HTTP is paused on a cooldown). `throttled` is derived live from the transport and takes precedence.
