[**unifi-protect**](../README.md)

***

[Home](../README.md) / StreamClassifier

# Interface: StreamClassifier

The classifier a realtime stream lifts its frames through: [ProtectClient.classifyPacket](../classes/ProtectClient.md#classifypacket), with each open event's camera and start carried to the event's
later frames.

The controller names an event's camera and start on its `add` and sends what it learns later as partial `update`s that name neither - an audio detection's class
above all, since the controller saves every audio event with no class and names the class in a frame of its own. So this remembers each open event's camera and
start under its id and supplies them to a later frame that omits them, while what was detected is still read from the frame that says it alone. An entry opens on
an `add` that names its own camera and carries no `end`, and closes on the frame that carries an `end` or on the event's `remove`, because what the controller
sends after an end restates the event, a visual detection's classes among it, and lifting that would deliver a detection for an event already over. The frame
that carries the `end` is lifted with the entry before the entry goes, while a `remove` is read from the header whatever its payload carries, and its own frame
takes nothing from the entry it closes.

One instance serves one stream for that stream's life, so a new connection starts with no open events. Its memory is bounded by the capacity its owner hands in,
at which the oldest entry is evicted to admit a new one, the bound for an event whose end never arrives. A frame of any other model key costs nothing beyond
`classifyPacket`, and an `event` frame costs at most one map read, with a write only at an event's `add`, its end or its `remove`.

A consumer reaches one through [ProtectClient.createClassifier](../classes/ProtectClient.md#createclassifier), built as the events stream builds its own, at the same bound, so a recording of one
connection, taken unfiltered from its start and lifted in order through one classifier, reads as the live rail read it.

## Methods

### classify()

```ts
classify(raw): TypedEvent | null;
```

Classify one frame of the stream, remembering or forgetting its event as the frame opens or ends it.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `raw` | [`RawPacket`](RawPacket.md) | A structurally valid packet from [ProtectClient.decodePacket](../classes/ProtectClient.md#decodepacket). |

#### Returns

[`TypedEvent`](../type-aliases/TypedEvent.md) \| `null`

The classified [TypedEvent](../type-aliases/TypedEvent.md), or `null` for a valid-but-unmodeled packet.
