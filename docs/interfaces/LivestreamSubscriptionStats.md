[**unifi-protect**](../README.md)

***

[Home](../README.md) / LivestreamSubscriptionStats

# Interface: LivestreamSubscriptionStats

The delivery counters a [LivestreamSubscription](LivestreamSubscription.md) exposes, so a consumer can monitor its own slowness (a growing `queueDepth` / `peakQueueDepth`) and respond -
the only backpressure mechanism, since the queue itself is unbounded. An item is whatever the subscription iterates: a segment, or a frame for a frames
subscription.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="delivered"></a> `delivered` | `number` | Items handed to the iterator over this subscription's life. |
| <a id="discarded"></a> `discarded` | `number` | Items dropped undelivered when this subscription was disposed under `discardOnDispose`; `0` for a default drain-on-dispose subscription. |
| <a id="lastsegmentat"></a> `lastSegmentAt` | `number` | The `clock.now()` timestamp of the most recent item enqueued for this subscriber. |
| <a id="peakqueuedepth"></a> `peakQueueDepth` | `number` | The historical high-water mark of `queueDepth`. Monotonic: it records the peak backlog this subscriber ever accrued, which a later discard does not lower. |
| <a id="queuedepth"></a> `queueDepth` | `number` | Items queued but not yet delivered right now - the live backlog. Reads `0` immediately after a `discardOnDispose` disposal clears the queue. |
