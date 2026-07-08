[**unifi-protect**](../README.md)

***

[Home](../README.md) / LivestreamRecoveryRecoveredPayload

# Interface: LivestreamRecoveryRecoveredPayload

Payload published on [channels.livestreamRecoveryRecovered](../variables/channels.md#property-livestreamrecoveryrecovered). `downtimeMs` is the elapsed time from the fault that began the episode to the first MEDIA segment
that restored the stream - liveness is media-keyed, so this measures how long media was actually absent, not how long until the controller re-acked with an init.

## Properties

| Property | Type |
| ------ | ------ |
| <a id="cameraid"></a> `cameraId` | `string` |
| <a id="downtimems"></a> `downtimeMs` | `number` |
| <a id="key"></a> `key` | `string` |
