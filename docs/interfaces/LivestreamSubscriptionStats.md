[**unifi-protect**](../README.md)

***

[Home](../README.md) / LivestreamSubscriptionStats

# Interface: LivestreamSubscriptionStats

The delivery counters a [LivestreamSubscription](LivestreamSubscription.md) exposes, so a consumer can monitor its own slowness (a growing `queueDepth` / `peakQueueDepth`) and respond -
the only backpressure mechanism, since the queue itself is unbounded.

## Properties

| Property | Type |
| ------ | ------ |
| <a id="delivered"></a> `delivered` | `number` |
| <a id="lastsegmentat"></a> `lastSegmentAt` | `number` |
| <a id="peakqueuedepth"></a> `peakQueueDepth` | `number` |
| <a id="queuedepth"></a> `queueDepth` | `number` |
