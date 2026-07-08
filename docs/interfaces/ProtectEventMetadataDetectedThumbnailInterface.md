[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectEventMetadataDetectedThumbnailInterface

# Interface: ProtectEventMetadataDetectedThumbnailInterface

A semi-complete description of the UniFi Protect smart motion detection thumbnail metadata JSON.

## Properties

| Property | Type |
| ------ | ------ |
| <a id="attributes"></a> `attributes` | \{ `color`: \{ `confidence`: `number`; `val`: `string`; \}; `faceMask`: \{ `confidence`: `number`; `val`: `string`; \}; `trackerId`: `string`; `vehicleType`: \{ `confidence`: `number`; `val`: `string`; \}; `zone`: `number`[]; \} |
| `attributes.color` | \{ `confidence`: `number`; `val`: `string`; \} |
| `attributes.color.confidence` | `number` |
| `attributes.color.val` | `string` |
| `attributes.faceMask` | \{ `confidence`: `number`; `val`: `string`; \} |
| `attributes.faceMask.confidence` | `number` |
| `attributes.faceMask.val` | `string` |
| `attributes.trackerId` | `string` |
| `attributes.vehicleType` | \{ `confidence`: `number`; `val`: `string`; \} |
| `attributes.vehicleType.confidence` | `number` |
| `attributes.vehicleType.val` | `string` |
| `attributes.zone` | `number`[] |
| <a id="clockbestwall"></a> `clockBestWall` | `number` |
| <a id="confidence"></a> `confidence` | `number` |
| <a id="coord"></a> `coord` | \[`number`, `number`, `number`, `number`\] |
| <a id="croppedid"></a> `croppedId` | `string` |
| <a id="name"></a> `name` | `string` |
| <a id="objectid"></a> `objectId` | `string` |
| <a id="type"></a> `type` | `string` |
