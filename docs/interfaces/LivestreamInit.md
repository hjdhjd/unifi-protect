[**unifi-protect**](../README.md)

***

[Home](../README.md) / LivestreamInit

# Interface: LivestreamInit

One livestream initialization segment: its codec label (`codec`, the RFC 6381 string), the controller's from its codec-information frame on Protect's own fMP4,
`""` when no such frame preceded the init, and the writer's on UBV, the init bytes (`data`), and the stream's `description` read once from them. The label and
the description come from different sources and are carried side by side: the label names the codec family, profile, level and audio object type, and nothing
about sample rate, channels or dimensions, which the description reads from the bytes. Every place an init travels or rests carries this one type - a
`Segment`'s init arm, a subscription's cached init, and the stream's first init and the later one a codec change reports. Two inits of one stream differ in their
bytes, whose creation times move on every connection, so a codec change is read from the label, the description and each track's sample description, never
from the bytes whole.

## Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="codec"></a> `codec` | `readonly` | `string` |
| <a id="data"></a> `data` | `readonly` | `Buffer` |
| <a id="description"></a> `description` | `readonly` | [`LivestreamDescription`](LivestreamDescription.md) |
