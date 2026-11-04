[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectOverlaySettingsInterface

# Interface: ProtectOverlaySettingsInterface

A description of the UniFi Protect video-overlay settings: what the controller burns into a camera's picture, and where. The NVR carries this shape as the global
default and each camera carries its own, with the camera's `useGlobalOverlaySettings` deciding which one applies - so the shape lives here once and both sites
reference it. A member the NVR leaves unset is `null` there while a camera reports it populated, which is why so much of the shape is nullable.

## Indexable

```ts
[key: string]: ProtectKnownJsonValue
```

## Properties

| Property | Type |
| ------ | ------ |
| <a id="bottomleft"></a> `bottomLeft` | `Nullable`\<\{ `content`: `string`; `orientation`: `string`; \}\> |
| <a id="bottomright"></a> `bottomRight` | `Nullable`\<\{ `content`: `string`; `orientation`: `string`; \}\> |
| <a id="cameraname"></a> `cameraName` | `Nullable`\<`string`\> |
| <a id="capabilities"></a> `capabilities` | `Nullable`\<\{ `anchors`: `string`[]; `maxAreaPercent`: `number`; `maxContentLength`: `number`; `maxContentLines`: `number`; `maxSegmentsPerCorner`: `number`; `placeholders`: `string`[]; \}\> |
| <a id="customlogofileid"></a> `customLogoFileId` | `Nullable`\<`string`\> |
| <a id="datetimeformat"></a> `datetimeFormat` | `Nullable`\<`string`\> |
| <a id="deviceid"></a> `deviceId` | `string` |
| <a id="enable"></a> `enable` | `boolean` |
| <a id="overlayareapercent"></a> `overlayAreaPercent` | `Nullable`\<`number`\> |
| <a id="source"></a> `source` | `Nullable`\<`string`\> |
| <a id="testmode"></a> `testMode` | `boolean` |
| <a id="topleft"></a> `topLeft` | `Nullable`\<\{ `content`: `string`; `orientation`: `string`; \}\> |
| <a id="topright"></a> `topRight` | `Nullable`\<\{ `content`: `string`; `orientation`: `string`; \}\> |
