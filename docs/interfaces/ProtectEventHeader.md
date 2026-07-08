[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectEventHeader

# Interface: ProtectEventHeader

The realtime-events action header. Every action frame is a JSON object carrying at least these four string fields; controllers may include arbitrary additional
keys, which are preserved on the index signature. The decoder validates this shape, so a [RawPacket](RawPacket.md)'s `header` is always trustworthy downstream.

## Indexable

```ts
[key: string]: string | number | boolean | object
```

## Properties

| Property | Type |
| ------ | ------ |
| <a id="action"></a> `action` | `string` |
| <a id="id"></a> `id` | `string` |
| <a id="modelkey"></a> `modelKey` | `string` |
| <a id="newupdateid"></a> `newUpdateId` | `string` |
