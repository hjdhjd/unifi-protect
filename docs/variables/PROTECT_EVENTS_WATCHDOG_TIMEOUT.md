[**unifi-protect**](../README.md)

***

[Home](../README.md) / PROTECT\_EVENTS\_WATCHDOG\_TIMEOUT

# Variable: PROTECT\_EVENTS\_WATCHDOG\_TIMEOUT

```ts
const PROTECT_EVENTS_WATCHDOG_TIMEOUT: 300000 = 300000;
```

Events WebSocket watchdog timeout, in milliseconds. If the realtime events stream is silent for longer than this window, the EventStream's watchdog presumes the
channel dead, emits a ProtectStallError, and tears the socket down; the ConnectionMonitor observes that fault and drives recovery (verify, re-bootstrap, relaunch). The
threshold is deliberately generous: a healthy controller emits device health telemetry well within this window, so prolonged silence is a strong signal that the stream
has stalled rather than merely gone quiet.
