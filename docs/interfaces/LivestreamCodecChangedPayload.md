[**unifi-protect**](../README.md)

***

[Home](../README.md) / LivestreamCodecChangedPayload

# Interface: LivestreamCodecChangedPayload

Payload published on [channels.livestreamCodecChanged](../variables/channels.md#property-livestreamcodecchanged). `from` / `to` are the prior and the reconnected inits themselves, each with its codec label, its bytes
and its description, the same pair the [ProtectCodecChangeError](../classes/ProtectCodecChangeError.md) the consumer's iterator receives carries; this is its observable companion.

## Properties

| Property | Type |
| ------ | ------ |
| <a id="cameraid"></a> `cameraId` | `string` |
| <a id="from"></a> `from` | [`LivestreamInit`](LivestreamInit.md) |
| <a id="key"></a> `key` | `string` |
| <a id="to"></a> `to` | [`LivestreamInit`](LivestreamInit.md) |
