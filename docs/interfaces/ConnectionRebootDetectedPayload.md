[**unifi-protect**](../README.md)

***

[Home](../README.md) / ConnectionRebootDetectedPayload

# Interface: ConnectionRebootDetectedPayload

Payload published on [channels.connectionRebootDetected](../variables/channels.md#property-connectionrebootdetected). The controller's own self-reported boot time (`upSince`) is the underlying wire-level signal; a
threshold-based comparison across bootstraps distinguishes a genuine reboot from measurement jitter in that value.

## Properties

| Property | Type |
| ------ | ------ |
| <a id="newupsince"></a> `newUpSince` | `number` |
| <a id="previousupsince"></a> `previousUpSince` | `number` |
