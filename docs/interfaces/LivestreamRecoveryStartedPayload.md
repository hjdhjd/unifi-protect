[**unifi-protect**](../README.md)

***

[Home](../README.md) / LivestreamRecoveryStartedPayload

# Interface: LivestreamRecoveryStartedPayload

Payload published on [channels.livestreamRecoveryStarted](../variables/channels.md#property-livestreamrecoverystarted). `attempts` is 0 at the start of an episode; `sinceLastSegmentMs` is the time since the last segment of
any kind, init segments included, when the fault was observed. It is not a measure of media downtime: an episode started by the media-stall watchdog can report a
small value while media has been absent for the whole detection threshold, because non-media frames kept arriving.

## Properties

| Property | Type |
| ------ | ------ |
| <a id="attempts"></a> `attempts` | `number` |
| <a id="cameraid"></a> `cameraId` | `string` |
| <a id="key"></a> `key` | `string` |
| <a id="sincelastsegmentms"></a> `sinceLastSegmentMs` | `number` |
