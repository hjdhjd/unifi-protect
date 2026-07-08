[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectNvrBootstrapInterface

# Interface: ProtectNvrBootstrapInterface

A semi-complete description of the UniFi Protect NVR bootstrap JSON.

## Indexable

```ts
[key: string]: ProtectKnownJsonValue
```

## Properties

| Property | Type |
| ------ | ------ |
| <a id="accesskey"></a> `accessKey` | `string` |
| <a id="aiports"></a> `aiports` | `ProtectKnownJsonValue`[] |
| <a id="aiprocessors"></a> `aiprocessors` | `ProtectKnownJsonValue`[] |
| <a id="authuserid"></a> `authUserId` | `string` |
| <a id="bridges"></a> `bridges` | `ProtectKnownJsonValue`[] |
| <a id="cameragroups"></a> `cameraGroups` | `ProtectKnownJsonValue`[] |
| <a id="cameras"></a> `cameras` | [`ProtectCameraConfigInterface`](ProtectCameraConfigInterface.md)[] |
| <a id="chimes"></a> `chimes` | [`ProtectChimeConfigInterface`](ProtectChimeConfigInterface.md)[] |
| <a id="devicegroups"></a> `deviceGroups` | `ProtectKnownJsonValue`[] |
| <a id="fobs"></a> `fobs` | [`ProtectFobConfigInterface`](ProtectFobConfigInterface.md)[] |
| <a id="groups"></a> `groups` | `ProtectKnownJsonValue`[] |
| <a id="hubs"></a> `hubs` | `ProtectKnownJsonValue`[] |
| <a id="lastupdateid"></a> `lastUpdateId` | `string` |
| <a id="lights"></a> `lights` | [`ProtectLightConfigInterface`](ProtectLightConfigInterface.md)[] |
| <a id="linkstations"></a> `linkstations` | `ProtectKnownJsonValue`[] |
| <a id="liveviews"></a> `liveviews` | [`ProtectNvrLiveviewConfigInterface`](ProtectNvrLiveviewConfigInterface.md)[] |
| <a id="nvr"></a> `nvr` | [`ProtectNvrConfigInterface`](ProtectNvrConfigInterface.md) |
| <a id="readers"></a> `readers` | `ProtectKnownJsonValue`[] |
| <a id="relays"></a> `relays` | [`ProtectRelayConfigInterface`](ProtectRelayConfigInterface.md)[] |
| <a id="ringtones"></a> `ringtones` | [`ProtectRingtoneConfigInterface`](ProtectRingtoneConfigInterface.md)[] |
| <a id="sensors"></a> `sensors` | [`ProtectSensorConfigInterface`](ProtectSensorConfigInterface.md)[] |
| <a id="sirens"></a> `sirens` | `ProtectKnownJsonValue`[] |
| <a id="speakers"></a> `speakers` | `ProtectKnownJsonValue`[] |
| <a id="users"></a> `users` | [`ProtectNvrUserConfigInterface`](ProtectNvrUserConfigInterface.md)[] |
| <a id="viewers"></a> `viewers` | [`ProtectViewerConfigInterface`](ProtectViewerConfigInterface.md)[] |
