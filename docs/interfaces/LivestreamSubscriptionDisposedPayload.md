[**unifi-protect**](../README.md)

***

[Home](../README.md) / LivestreamSubscriptionDisposedPayload

# Interface: LivestreamSubscriptionDisposedPayload

Payload published on [channels.livestreamSubscriptionDisposed](../variables/channels.md#property-livestreamsubscriptiondisposed). `stats` carries the subscription's final delivery counters.

## Properties

| Property | Type |
| ------ | ------ |
| <a id="key"></a> `key` | `string` |
| <a id="stats"></a> `stats` | \{ `delivered`: `number`; `lastSegmentAt`: `number`; `peakQueueDepth`: `number`; `queueDepth`: `number`; \} |
| `stats.delivered` | `number` |
| `stats.lastSegmentAt` | `number` |
| `stats.peakQueueDepth` | `number` |
| `stats.queueDepth` | `number` |
| <a id="subscriptionid"></a> `subscriptionId` | `string` |
