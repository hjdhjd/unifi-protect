[**unifi-protect**](../README.md)

***

[Home](../README.md) / LivestreamRecoveryExhaustedPayload

# Interface: LivestreamRecoveryExhaustedPayload

Payload published on [channels.livestreamRecoveryExhausted](../variables/channels.md#property-livestreamrecoveryexhausted). `attempts` is the number of consecutive failed reconnect attempts before the policy gave up. The
consumer's iterator also receives a [ProtectLivestreamUnavailableError](../classes/ProtectLivestreamUnavailableError.md); this channel is the seam an opt-in self-heal observer watches.

## Properties

| Property | Type |
| ------ | ------ |
| <a id="attempts"></a> `attempts` | `number` |
| <a id="cameraid"></a> `cameraId` | `string` |
| <a id="key"></a> `key` | `string` |
