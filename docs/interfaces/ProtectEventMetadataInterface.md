[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectEventMetadataInterface

# Interface: ProtectEventMetadataInterface

A description of metadata in UniFi Protect smart motion detect events.

## Properties

| Property | Type |
| ------ | ------ |
| <a id="accesseventid"></a> `accessEventId` | `string` |
| <a id="action"></a> `action` | `string` |
| <a id="detectedareas"></a> `detectedAreas` | \{ `areaIndexes`: `number`[]; `smartDetectObject`: `string`; \}[] |
| <a id="detectedthumbnails"></a> `detectedThumbnails` | `DeepPartial`\<[`ProtectEventMetadataDetectedThumbnailInterface`](ProtectEventMetadataDetectedThumbnailInterface.md)\>[] |
| <a id="deviceid"></a> `deviceId` | \{ `text`: `string`; \} |
| `deviceId.text` | `string` |
| <a id="direction"></a> `direction` | `string` |
| <a id="doorname"></a> `doorName` | `string` |
| <a id="fingerprint"></a> `fingerprint` | \{ `ulpId`: `string`; \} |
| `fingerprint.ulpId` | `string` |
| <a id="firstname"></a> `firstName` | `string` |
| <a id="hallwaymode"></a> `hallwayMode` | `string` |
| <a id="islowbattery"></a> `isLowBattery` | `boolean` |
| <a id="iswireless"></a> `isWireless` | `boolean` |
| <a id="lastname"></a> `lastName` | `string` |
| <a id="licenseplate"></a> `licensePlate` | \{ `confidenceLevel`: `number`; `name`: `string`; \} |
| `licensePlate.confidenceLevel` | `number` |
| `licensePlate.name` | `string` |
| <a id="name"></a> `name` | \{ `text`: `string`; \} |
| `name.text` | `string` |
| <a id="nfc"></a> `nfc` | \{ `nfcId`: `string`; `ulpId`: `string`; \} |
| `nfc.nfcId` | `string` |
| `nfc.ulpId` | `string` |
| <a id="openmethod"></a> `openMethod` | `string` |
| <a id="opensuccess"></a> `openSuccess` | `boolean` |
| <a id="reason"></a> `reason` | `string` |
| <a id="uniqueid"></a> `uniqueId` | `string` |
| <a id="usertype"></a> `userType` | `string` |
| <a id="zonesstatus"></a> `zonesStatus` | `Record`\<`string`, \{ `level`: `number`; `status`: `string`; \}\> |
