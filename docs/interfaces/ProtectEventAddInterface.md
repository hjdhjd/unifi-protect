[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectEventAddInterface

# Interface: ProtectEventAddInterface

A semi-complete description of the UniFi Protect smart motion detection event JSON.

## Indexable

```ts
[key: string]: ProtectKnownJsonValue
```

## Properties

| Property | Type |
| ------ | ------ |
| <a id="camera"></a> `camera?` | `string` |
| <a id="cameraid"></a> `cameraId` | `string` |
| <a id="detectedat"></a> `detectedAt` | `number` |
| <a id="end"></a> `end` | `number` |
| <a id="eventid"></a> `eventId` | `string` |
| <a id="id"></a> `id` | `string` |
| <a id="locked"></a> `locked?` | `boolean` |
| <a id="metadata"></a> `metadata?` | `DeepPartial`\<[`ProtectEventMetadataInterface`](ProtectEventMetadataInterface.md)\> |
| <a id="modelkey"></a> `modelKey` | `"event"` |
| <a id="partition"></a> `partition` | `string` |
| <a id="score"></a> `score` | `number` |
| <a id="smartdetectevents"></a> `smartDetectEvents` | `string`[] |
| <a id="smartdetecttypes"></a> `smartDetectTypes?` | `string`[] |
| <a id="start"></a> `start` | `number` |
| <a id="thumbnailid"></a> `thumbnailId` | `string` |
| <a id="type"></a> `type` | `string` |
| <a id="user"></a> `user` | `string` |
