[**unifi-protect**](../README.md)

***

[Home](../README.md) / LivestreamInit

# Interface: LivestreamInit

One livestream initialization segment: the controller's codec label from its codec-information frame (`codec`, the RFC 6381 string, `""` when no such frame
preceded the init), the init bytes (`data`), and the stream's `description` read once from them. The label and the description come from different sources and
are carried side by side: the label names the codec family, profile, level and audio object type, and nothing about sample rate, channels or dimensions, which the
description reads from the bytes. Every place an init travels or rests carries this one type - a `Segment`'s init arm, a subscription's cached init, and the prior
and reconnected inits a codec change reports.

## Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="codec"></a> `codec` | `readonly` | `string` |
| <a id="data"></a> `data` | `readonly` | `Buffer` |
| <a id="description"></a> `description` | `readonly` | [`LivestreamDescription`](LivestreamDescription.md) |
