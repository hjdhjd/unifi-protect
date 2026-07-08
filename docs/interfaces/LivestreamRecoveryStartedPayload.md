[**unifi-protect**](../README.md)

***

[Home](../README.md) / LivestreamRecoveryStartedPayload

# Interface: LivestreamRecoveryStartedPayload

Payload published on [channels.livestreamRecoveryStarted](../variables/channels.md#property-livestreamrecoverystarted). `attempts` is 0 at the start of an episode; `sinceLastSegmentMs` is how long the stream had been
silent when the fault was observed.

## Properties

| Property | Type |
| ------ | ------ |
| <a id="attempts"></a> `attempts` | `number` |
| <a id="cameraid"></a> `cameraId` | `string` |
| <a id="key"></a> `key` | `string` |
| <a id="sincelastsegmentms"></a> `sinceLastSegmentMs` | `number` |
