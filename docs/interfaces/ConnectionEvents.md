[**unifi-protect**](../README.md)

***

[Home](../README.md) / ConnectionEvents

# Interface: ConnectionEvents

The events [ConnectionMonitor](ConnectionMonitor.md) publishes on its three-rail surface.

- `stateChanged` fires on every connection-state edge.
- `controllerLost` fires once when the controller is concluded unreachable, carrying the typed fault.
- `controllerRebooted` fires when the controller's self-reported boot time changes, carrying the previous and new values.
- `controllerRecovered` fires when the connection returns to healthy after having been lost.
- `throttleEntered` / `throttleExited` forward the transport breaker's transitions.

## Properties

| Property | Type |
| ------ | ------ |
| <a id="controllerlost"></a> `controllerLost` | \[[`ProtectError`](../classes/ProtectError.md)\] |
| <a id="controllerrebooted"></a> `controllerRebooted` | \[\{ `newUpSince`: `number`; `previousUpSince`: `number`; \}\] |
| <a id="controllerrecovered"></a> `controllerRecovered` | \[\] |
| <a id="statechanged"></a> `stateChanged` | \[[`ConnectionTransition`](ConnectionTransition.md)\] |
| <a id="throttleentered"></a> `throttleEntered` | \[\] |
| <a id="throttleexited"></a> `throttleExited` | \[\] |
