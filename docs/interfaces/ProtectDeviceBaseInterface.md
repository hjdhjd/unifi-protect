[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectDeviceBaseInterface

# Interface: ProtectDeviceBaseInterface

The common properties shared by all UniFi Protect device configuration objects.

## Extended by

- [`ProtectCameraConfigInterface`](ProtectCameraConfigInterface.md)
- [`ProtectChimeConfigInterface`](ProtectChimeConfigInterface.md)
- [`ProtectFobConfigInterface`](ProtectFobConfigInterface.md)
- [`ProtectLightConfigInterface`](ProtectLightConfigInterface.md)
- [`ProtectRelayConfigInterface`](ProtectRelayConfigInterface.md)
- [`ProtectSensorConfigInterface`](ProtectSensorConfigInterface.md)
- [`ProtectViewerConfigInterface`](ProtectViewerConfigInterface.md)

## Indexable

```ts
[key: string]: ProtectKnownJsonValue
```

## Properties

| Property | Type |
| ------ | ------ |
| <a id="anonymousdeviceid"></a> `anonymousDeviceId` | `Nullable`\<`string`\> |
| <a id="canadopt"></a> `canAdopt` | `boolean` |
| <a id="connectedsince"></a> `connectedSince` | `number` |
| <a id="connectionhost"></a> `connectionHost` | `Nullable`\<`string`\> |
| <a id="displayname"></a> `displayName` | `string` |
| <a id="firmwarebuild"></a> `firmwareBuild` | `string` |
| <a id="firmwareversion"></a> `firmwareVersion` | `Nullable`\<`string`\> |
| <a id="fwupdatestate"></a> `fwUpdateState` | `Nullable`\<`string`\> |
| <a id="globalalarmmanagerscopenames"></a> `globalAlarmManagerScopeNames` | `string`[] |
| <a id="guid"></a> `guid` | `Nullable`\<`string`\> |
| <a id="hardwarerevision"></a> `hardwareRevision` | `Nullable`\<`string`\> |
| <a id="host"></a> `host` | `Nullable`\<`string`\> |
| <a id="id"></a> `id` | `string` |
| <a id="isadopted"></a> `isAdopted` | `boolean` |
| <a id="isadoptedbyother"></a> `isAdoptedByOther` | `boolean` |
| <a id="isadopting"></a> `isAdopting` | `boolean` |
| <a id="isattemptingtoconnect"></a> `isAttemptingToConnect` | `boolean` |
| <a id="isblockedbyarmmode"></a> `isBlockedByArmMode` | `boolean` |
| <a id="isconnected"></a> `isConnected?` | `boolean` |
| <a id="isdownloadingfw"></a> `isDownloadingFW` | `boolean` |
| <a id="isprovisioned"></a> `isProvisioned` | `boolean` |
| <a id="isrebooting"></a> `isRebooting` | `boolean` |
| <a id="isrestoring"></a> `isRestoring` | `boolean` |
| <a id="isreverting"></a> `isReverting` | `boolean` |
| <a id="issshenabled"></a> `isSshEnabled` | `boolean` |
| <a id="isupdating"></a> `isUpdating` | `boolean` |
| <a id="lastdisconnect"></a> `lastDisconnect` | `Nullable`\<`number`\> |
| <a id="lastseen"></a> `lastSeen` | `number` |
| <a id="latestfirmwaresizebytes"></a> `latestFirmwareSizeBytes` | `Nullable`\<`number`\> |
| <a id="latestfirmwareversion"></a> `latestFirmwareVersion` | `string` |
| <a id="mac"></a> `mac` | `string` |
| <a id="marketname"></a> `marketName` | `string` |
| <a id="minfirmwareversion"></a> `minFirmwareVersion` | `string` |
| <a id="name"></a> `name?` | `string` |
| <a id="nvrmac"></a> `nvrMac` | `string` |
| <a id="platform"></a> `platform?` | `Nullable`\<`string`\> |
| <a id="previousfirmwareurl"></a> `previousFirmwareUrl` | `Nullable`\<`string`\> |
| <a id="previousfirmwareversion"></a> `previousFirmwareVersion` | `Nullable`\<`string`\> |
| <a id="releasenotepath"></a> `releaseNotePath` | `Nullable`\<`string`\> |
| <a id="state"></a> `state` | `string` |
| <a id="supportfilecreatedat"></a> `supportFileCreatedAt` | `Nullable`\<`number`\> |
| <a id="supportfilename"></a> `supportFileName` | `Nullable`\<`string`\> |
| <a id="supportfilestate"></a> `supportFileState` | `Nullable`\<`string`\> |
| <a id="sysid"></a> `sysid` | `Nullable`\<`string`\> |
| <a id="type"></a> `type` | `string` |
| <a id="uplinkdevice"></a> `uplinkDevice` | `Nullable`\<`string`\> |
| <a id="upsince"></a> `upSince` | `number` |
| <a id="uptime"></a> `uptime` | `number` |
| <a id="wificonnectionstate"></a> `wifiConnectionState` | [`ProtectWifiConnectionStateInterface`](ProtectWifiConnectionStateInterface.md) |
| <a id="wiredconnectionstate"></a> `wiredConnectionState` | [`ProtectWiredConnectionStateInterface`](ProtectWiredConnectionStateInterface.md) |
