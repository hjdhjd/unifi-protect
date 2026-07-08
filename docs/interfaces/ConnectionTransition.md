[**unifi-protect**](../README.md)

***

[Home](../README.md) / ConnectionTransition

# Interface: ConnectionTransition

One edge of the connection-state machine, yielded by [ConnectionMonitor.observe](ConnectionMonitor.md#observe) and carried on the `stateChanged` event. `reason` is present when a typed fault
(a stall, a failed liveness probe) drove the edge.

## Properties

| Property | Type |
| ------ | ------ |
| <a id="from"></a> `from` | [`ConnectionState`](../type-aliases/ConnectionState.md) |
| <a id="reason"></a> `reason?` | `string` |
| <a id="to"></a> `to` | [`ConnectionState`](../type-aliases/ConnectionState.md) |
