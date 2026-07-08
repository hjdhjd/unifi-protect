[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectViewerConfigInterface

# Interface: ProtectViewerConfigInterface

A semi-complete description of the UniFi Protect viewer JSON.

## Extends

- [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md)

## Indexable

```ts
[key: string]: ProtectKnownJsonValue
```

## Properties

| Property | Type | Overrides | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="anonymousdeviceid"></a> `anonymousDeviceId` | `Nullable`\<`string`\> | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`anonymousDeviceId`](ProtectDeviceBaseInterface.md#anonymousdeviceid) |
| <a id="canadopt"></a> `canAdopt` | `boolean` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`canAdopt`](ProtectDeviceBaseInterface.md#canadopt) |
| <a id="connectedsince"></a> `connectedSince` | `number` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`connectedSince`](ProtectDeviceBaseInterface.md#connectedsince) |
| <a id="connectionhost"></a> `connectionHost` | `Nullable`\<`string`\> | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`connectionHost`](ProtectDeviceBaseInterface.md#connectionhost) |
| <a id="displayname"></a> `displayName` | `string` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`displayName`](ProtectDeviceBaseInterface.md#displayname) |
| <a id="enablecontinuousmonitoring"></a> `enableContinuousMonitoring` | `boolean` | - | - |
| <a id="featureflags"></a> `featureFlags` | \{ `supportAdjustBrightness`: `boolean`; `supportLiveview`: `boolean`; `supportLocate`: `boolean`; `supportManualDownloadSupportFile`: `boolean`; `supportManualFirmwareUpdate`: `boolean`; `supportMic`: `boolean`; `supportSsh`: `boolean`; \} | - | - |
| `featureFlags.supportAdjustBrightness` | `boolean` | - | - |
| `featureFlags.supportLiveview` | `boolean` | - | - |
| `featureFlags.supportLocate` | `boolean` | - | - |
| `featureFlags.supportManualDownloadSupportFile` | `boolean` | - | - |
| `featureFlags.supportManualFirmwareUpdate` | `boolean` | - | - |
| `featureFlags.supportMic` | `boolean` | - | - |
| `featureFlags.supportSsh` | `boolean` | - | - |
| <a id="firmwarebuild"></a> `firmwareBuild` | `string` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`firmwareBuild`](ProtectDeviceBaseInterface.md#firmwarebuild) |
| <a id="firmwareversion"></a> `firmwareVersion` | `Nullable`\<`string`\> | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`firmwareVersion`](ProtectDeviceBaseInterface.md#firmwareversion) |
| <a id="fwupdatestate"></a> `fwUpdateState` | `Nullable`\<`string`\> | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`fwUpdateState`](ProtectDeviceBaseInterface.md#fwupdatestate) |
| <a id="globalalarmmanagerscopenames"></a> `globalAlarmManagerScopeNames` | `string`[] | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`globalAlarmManagerScopeNames`](ProtectDeviceBaseInterface.md#globalalarmmanagerscopenames) |
| <a id="guid"></a> `guid` | `Nullable`\<`string`\> | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`guid`](ProtectDeviceBaseInterface.md#guid) |
| <a id="hardwarerevision"></a> `hardwareRevision` | `Nullable`\<`string`\> | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`hardwareRevision`](ProtectDeviceBaseInterface.md#hardwarerevision) |
| <a id="host"></a> `host` | `string` | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`host`](ProtectDeviceBaseInterface.md#host) | - |
| <a id="id"></a> `id` | `string` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`id`](ProtectDeviceBaseInterface.md#id) |
| <a id="isaccessdevice"></a> `isAccessDevice` | `boolean` | - | - |
| <a id="isadopted"></a> `isAdopted` | `boolean` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`isAdopted`](ProtectDeviceBaseInterface.md#isadopted) |
| <a id="isadoptedbyother"></a> `isAdoptedByOther` | `boolean` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`isAdoptedByOther`](ProtectDeviceBaseInterface.md#isadoptedbyother) |
| <a id="isadopting"></a> `isAdopting` | `boolean` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`isAdopting`](ProtectDeviceBaseInterface.md#isadopting) |
| <a id="isattemptingtoconnect"></a> `isAttemptingToConnect` | `boolean` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`isAttemptingToConnect`](ProtectDeviceBaseInterface.md#isattemptingtoconnect) |
| <a id="isblockedbyarmmode"></a> `isBlockedByArmMode` | `boolean` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`isBlockedByArmMode`](ProtectDeviceBaseInterface.md#isblockedbyarmmode) |
| <a id="isconnected"></a> `isConnected` | `boolean` | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`isConnected`](ProtectDeviceBaseInterface.md#isconnected) | - |
| <a id="isdownloadingfw"></a> `isDownloadingFW` | `boolean` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`isDownloadingFW`](ProtectDeviceBaseInterface.md#isdownloadingfw) |
| <a id="isprovisioned"></a> `isProvisioned` | `boolean` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`isProvisioned`](ProtectDeviceBaseInterface.md#isprovisioned) |
| <a id="isrebooting"></a> `isRebooting` | `boolean` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`isRebooting`](ProtectDeviceBaseInterface.md#isrebooting) |
| <a id="isrestoring"></a> `isRestoring` | `boolean` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`isRestoring`](ProtectDeviceBaseInterface.md#isrestoring) |
| <a id="isreverting"></a> `isReverting` | `boolean` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`isReverting`](ProtectDeviceBaseInterface.md#isreverting) |
| <a id="issshenabled"></a> `isSshEnabled` | `boolean` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`isSshEnabled`](ProtectDeviceBaseInterface.md#issshenabled) |
| <a id="isupdating"></a> `isUpdating` | `boolean` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`isUpdating`](ProtectDeviceBaseInterface.md#isupdating) |
| <a id="lastdisconnect"></a> `lastDisconnect` | `Nullable`\<`number`\> | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`lastDisconnect`](ProtectDeviceBaseInterface.md#lastdisconnect) |
| <a id="lastseen"></a> `lastSeen` | `number` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`lastSeen`](ProtectDeviceBaseInterface.md#lastseen) |
| <a id="latestfirmwaresizebytes"></a> `latestFirmwareSizeBytes` | `Nullable`\<`number`\> | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`latestFirmwareSizeBytes`](ProtectDeviceBaseInterface.md#latestfirmwaresizebytes) |
| <a id="latestfirmwareversion"></a> `latestFirmwareVersion` | `string` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`latestFirmwareVersion`](ProtectDeviceBaseInterface.md#latestfirmwareversion) |
| <a id="liveview"></a> `liveview` | `Nullable`\<`string`\> | - | - |
| <a id="mac"></a> `mac` | `string` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`mac`](ProtectDeviceBaseInterface.md#mac) |
| <a id="marketname"></a> `marketName` | `string` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`marketName`](ProtectDeviceBaseInterface.md#marketname) |
| <a id="minfirmwareversion"></a> `minFirmwareVersion` | `string` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`minFirmwareVersion`](ProtectDeviceBaseInterface.md#minfirmwareversion) |
| <a id="modelkey"></a> `modelKey` | `"viewer"` | - | - |
| <a id="name"></a> `name?` | `string` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`name`](ProtectDeviceBaseInterface.md#name) |
| <a id="needupdatebeforeadoption"></a> `needUpdateBeforeAdoption` | `boolean` | - | - |
| <a id="nvrmac"></a> `nvrMac` | `string` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`nvrMac`](ProtectDeviceBaseInterface.md#nvrmac) |
| <a id="platform"></a> `platform?` | `Nullable`\<`string`\> | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`platform`](ProtectDeviceBaseInterface.md#platform) |
| <a id="previousfirmwareurl"></a> `previousFirmwareUrl` | `Nullable`\<`string`\> | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`previousFirmwareUrl`](ProtectDeviceBaseInterface.md#previousfirmwareurl) |
| <a id="previousfirmwareversion"></a> `previousFirmwareVersion` | `Nullable`\<`string`\> | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`previousFirmwareVersion`](ProtectDeviceBaseInterface.md#previousfirmwareversion) |
| <a id="releasenotepath"></a> `releaseNotePath` | `Nullable`\<`string`\> | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`releaseNotePath`](ProtectDeviceBaseInterface.md#releasenotepath) |
| <a id="softwareversion"></a> `softwareVersion` | `Nullable`\<`string`\> | - | - |
| <a id="state"></a> `state` | `string` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`state`](ProtectDeviceBaseInterface.md#state) |
| <a id="streamlimit"></a> `streamLimit` | `number` | - | - |
| <a id="supportfilecreatedat"></a> `supportFileCreatedAt` | `Nullable`\<`number`\> | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`supportFileCreatedAt`](ProtectDeviceBaseInterface.md#supportfilecreatedat) |
| <a id="supportfilename"></a> `supportFileName` | `Nullable`\<`string`\> | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`supportFileName`](ProtectDeviceBaseInterface.md#supportfilename) |
| <a id="supportfilestate"></a> `supportFileState` | `Nullable`\<`string`\> | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`supportFileState`](ProtectDeviceBaseInterface.md#supportfilestate) |
| <a id="supportucp4"></a> `supportUcp4` | `boolean` | - | - |
| <a id="sysid"></a> `sysid` | `Nullable`\<`string`\> | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`sysid`](ProtectDeviceBaseInterface.md#sysid) |
| <a id="type"></a> `type` | `string` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`type`](ProtectDeviceBaseInterface.md#type) |
| <a id="uplinkdevice"></a> `uplinkDevice` | `Nullable`\<`string`\> | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`uplinkDevice`](ProtectDeviceBaseInterface.md#uplinkdevice) |
| <a id="upsince"></a> `upSince` | `number` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`upSince`](ProtectDeviceBaseInterface.md#upsince) |
| <a id="uptime"></a> `uptime` | `number` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`uptime`](ProtectDeviceBaseInterface.md#uptime) |
| <a id="wificonnectionstate"></a> `wifiConnectionState` | [`ProtectWifiConnectionStateInterface`](ProtectWifiConnectionStateInterface.md) | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`wifiConnectionState`](ProtectDeviceBaseInterface.md#wificonnectionstate) |
| <a id="wiredconnectionstate"></a> `wiredConnectionState` | [`ProtectWiredConnectionStateInterface`](ProtectWiredConnectionStateInterface.md) | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`wiredConnectionState`](ProtectDeviceBaseInterface.md#wiredconnectionstate) |
