[**unifi-protect**](../README.md)

***

[Home](../README.md) / LivestreamRouteFallbackPayload

# Interface: LivestreamRouteFallbackPayload

Payload published on [channels.livestreamRouteFallback](../variables/channels.md#property-livestreamroutefallback). `reason` names why the direct attempt ended, and `port` is the port the direct attempt dialed, or
null when there was no direct address to dial.

## Properties

| Property | Type |
| ------ | ------ |
| <a id="cameraid"></a> `cameraId` | `string` |
| <a id="key"></a> `key` | `string` |
| <a id="port"></a> `port` | `number` \| `null` |
| <a id="reason"></a> `reason` | [`LivestreamRouteFallbackReason`](../type-aliases/LivestreamRouteFallbackReason.md) |
