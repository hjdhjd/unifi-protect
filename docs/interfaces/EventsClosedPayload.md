[**unifi-protect**](../README.md)

***

[Home](../README.md) / EventsClosedPayload

# Interface: EventsClosedPayload

Payload published on [channels.eventsClosed](../variables/channels.md#property-eventsclosed). When the controller closes the stream unprompted, `code` and `reason` carry the peer's WebSocket close frame. When
the stream closes itself, they carry the library's own classification instead: `1000` for a deliberate teardown (an explicit `close()` or the caller's abort) and
`1006` for a failure-driven one (a socket error or a watchdog stall), with a reason describing what ended it.

## Properties

| Property | Type |
| ------ | ------ |
| <a id="code"></a> `code` | `number` |
| <a id="reason"></a> `reason` | `string` |
