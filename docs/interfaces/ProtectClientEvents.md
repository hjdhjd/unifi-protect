[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectClientEvents

# Interface: ProtectClientEvents

The events the [ProtectClient](../classes/ProtectClient.md) publishes. `packet` is the realtime event firehose - the same `TypedEvent` stream that feeds the reducer, fanned out to consumers.
It is produced by the realtime events WebSocket and bridged here at the composition root: each decoded event is dispatched into the store and then emitted on this rail
from the one bridge subscription, so there is a single decode path for both the state model and the firehose.

`rawPacket` is the raw observability firehose - the decoded [RawPacket](RawPacket.md) of every frame, including the valid-but-unmodeled ones the classifier drops (so `packet`
never sees them). It is bridged from the same single decode site, one step before classification, and is pure observability: never dispatched into the store, no
state-ordering guarantee. Consumers use it for protocol exploration and capture; the modeled state and event model still flow through `packet`.

## Properties

| Property | Type |
| ------ | ------ |
| <a id="packet"></a> `packet` | \[[`TypedEvent`](../type-aliases/TypedEvent.md)\] |
| <a id="rawpacket"></a> `rawPacket` | \[[`RawPacket`](RawPacket.md)\] |
