[**unifi-protect**](../README.md)

***

[Home](../README.md) / LivestreamStallDetectedPayload

# Interface: LivestreamStallDetectedPayload

Payload published on [channels.livestreamStallDetected](../variables/channels.md#property-livestreamstalldetected). `lastSegmentAt` is when the pool last saw a segment of any kind, the injected `Clock`'s `now()` read
as that segment arrived, so it is epoch milliseconds only under the production clock. `silentForMs` is how long, in milliseconds, the session's heartbeat watchdog
found the channel silent when it declared the stall.

## Properties

| Property | Type |
| ------ | ------ |
| <a id="cameraid"></a> `cameraId` | `string` |
| <a id="key"></a> `key` | `string` |
| <a id="lastsegmentat"></a> `lastSegmentAt` | `number` |
| <a id="silentforms"></a> `silentForMs` | `number` |
