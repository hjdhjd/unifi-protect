[**unifi-protect**](../README.md)

***

[Home](../README.md) / LivestreamCodecChangedPayload

# Interface: LivestreamCodecChangedPayload

Payload published on [channels.livestreamCodecChanged](../variables/channels.md#property-livestreamcodecchanged). `from` / `to` are the RFC 6381 codec descriptors of the prior and reconnected init segments. The
consumer's iterator also receives a [ProtectCodecChangeError](../classes/ProtectCodecChangeError.md); this is its observable companion.

## Properties

| Property | Type |
| ------ | ------ |
| <a id="cameraid"></a> `cameraId` | `string` |
| <a id="from"></a> `from` | `string` |
| <a id="key"></a> `key` | `string` |
| <a id="to"></a> `to` | `string` |
