[**unifi-protect**](../README.md)

***

[Home](../README.md) / LivestreamDescription

# Interface: LivestreamDescription

What a livestream's init segment says about the stream: every track in its `moov`, in file order, or none when the bytes carry no readable `moov`. A stream with no
audio, or no AAC, is an empty filter result over `tracks` rather than an `undefined` - the library ships the list and the consumer picks the track it wants.

## Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="tracks"></a> `tracks` | `readonly` | readonly [`LivestreamTrack`](../type-aliases/LivestreamTrack.md)[] |
