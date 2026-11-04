[**unifi-protect**](../README.md)

***

[Home](../README.md) / ConnectionEvents

# Interface: ConnectionEvents

The events [ConnectionMonitor](ConnectionMonitor.md) publishes on its state, controller-lifecycle, and throttle rails.

- `stateChanged` fires on every connection-state edge.
- `controllerLost` fires when the connection is concluded lost, and again whenever the cause of the loss changes class among a refused sign-in, a rate limit, a
  fault a person must fix and a fault that heals itself, carrying the typed fault that settled it.
- `controllerRebooted` fires when the controller's self-reported boot time changes, carrying the previous and new values.
- `controllerRecovered` fires when recovery completes after the connection was lost, into `healthy` or into `throttled` when the transport's breaker is open.
- `throttleEntered` / `throttleExited` forward the transport breaker's transitions.

## Properties

| Property | Type |
| ------ | ------ |
| <a id="controllerlost"></a> `controllerLost` | \[`reason`: [`ProtectError`](../classes/ProtectError.md)\] |
| <a id="controllerrebooted"></a> `controllerRebooted` | \[`info`: \{ `newUpSince`: `number`; `previousUpSince`: `number`; \}\] |
| <a id="controllerrecovered"></a> `controllerRecovered` | \[\] |
| <a id="statechanged"></a> `stateChanged` | \[`transition`: [`ConnectionTransition`](ConnectionTransition.md)\] |
| <a id="throttleentered"></a> `throttleEntered` | \[\] |
| <a id="throttleexited"></a> `throttleExited` | \[\] |
