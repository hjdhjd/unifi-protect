[**unifi-protect**](../README.md)

***

[Home](../README.md) / LivestreamRecoveryExhaustedPayload

# Interface: LivestreamRecoveryExhaustedPayload

Payload published on [channels.livestreamRecoveryExhausted](../variables/channels.md#property-livestreamrecoveryexhausted). `attempts` is the number of failed attempts the episode counted before the policy gave up, which
leaves out a `"preferDirect"` stream's direct attempt that ended before its first media and fell back at once. The consumer's iterator also receives a
[ProtectLivestreamUnavailableError](../classes/ProtectLivestreamUnavailableError.md); this channel is what an opt-in self-heal observer watches.

## Properties

| Property | Type |
| ------ | ------ |
| <a id="attempts"></a> `attempts` | `number` |
| <a id="cameraid"></a> `cameraId` | `string` |
| <a id="key"></a> `key` | `string` |
