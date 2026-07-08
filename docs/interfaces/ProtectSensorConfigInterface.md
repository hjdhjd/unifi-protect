[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectSensorConfigInterface

# Interface: ProtectSensorConfigInterface

A semi-complete description of the UniFi Protect sensor JSON.

The `...At` members are last-occurrence timestamps: each records when its event last fired and is `Nullable`, reporting `null` for any event the sensor has never
observed - which includes every event its hardware capabilities do not support. The per-field notes on `motionDetectedAt` and `openStatusChangedAt` below illustrate
that one rule rather than enumerating every field it governs.

## Extends

- [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md)

## Indexable

```ts
[key: string]: ProtectKnownJsonValue
```

## Properties

| Property | Type | Overrides | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="airquality"></a> `airQuality` | [`ProtectSensorAirQualityInterface`](ProtectSensorAirQualityInterface.md) | - | - |
| <a id="airqualitysettings"></a> `airQualitySettings` | [`ProtectSensorAirQualitySettingsInterface`](ProtectSensorAirQualitySettingsInterface.md) | - | - |
| <a id="alarmsettings"></a> `alarmSettings` | \{ `isEnabled`: `boolean`; \} | - | - |
| `alarmSettings.isEnabled` | `boolean` | - | - |
| <a id="alarmsilencedat"></a> `alarmSilencedAt` | `Nullable`\<`number`\> | - | - |
| <a id="alarmtriggeredat"></a> `alarmTriggeredAt` | `Nullable`\<`number`\> | - | - |
| <a id="anonymousdeviceid"></a> `anonymousDeviceId` | `Nullable`\<`string`\> | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`anonymousDeviceId`](ProtectDeviceBaseInterface.md#anonymousdeviceid) |
| <a id="armprofileids"></a> `armProfileIds` | `Nullable`\<`string`[]\> | - | - |
| <a id="batterystatus"></a> `batteryStatus` | \{ `isLow`: `boolean`; `percentage`: `Nullable`\<`number`\>; \} | - | - |
| `batteryStatus.isLow` | `boolean` | - | - |
| `batteryStatus.percentage` | `Nullable`\<`number`\> | - | - |
| <a id="bluetoothconnectionstate"></a> `bluetoothConnectionState` | \{ `signalNoiseRatio`: `Nullable`\<`number`\>; `signalQuality`: `number`; `signalStrength`: `number`; \} | - | - |
| `bluetoothConnectionState.signalNoiseRatio` | `Nullable`\<`number`\> | - | - |
| `bluetoothConnectionState.signalQuality` | `number` | - | - |
| `bluetoothConnectionState.signalStrength` | `number` | - | - |
| <a id="bridge"></a> `bridge` | `string` | - | - |
| <a id="bridgecandidates"></a> `bridgeCandidates` | [`ProtectBridgeCandidate`](ProtectBridgeCandidate.md)[] | - | - |
| <a id="camera"></a> `camera` | `string` | - | - |
| <a id="canadopt"></a> `canAdopt` | `boolean` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`canAdopt`](ProtectDeviceBaseInterface.md#canadopt) |
| <a id="chosenbridge"></a> `chosenBridge` | `Nullable`\<`string`\> | - | - |
| <a id="connectedsince"></a> `connectedSince` | `number` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`connectedSince`](ProtectDeviceBaseInterface.md#connectedsince) |
| <a id="connectionhost"></a> `connectionHost` | `Nullable`\<`string`\> | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`connectionHost`](ProtectDeviceBaseInterface.md#connectionhost) |
| <a id="connectiontype"></a> `connectionType` | `string` | - | - |
| <a id="displayname"></a> `displayName` | `string` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`displayName`](ProtectDeviceBaseInterface.md#displayname) |
| <a id="externalleakdetectedat"></a> `externalLeakDetectedAt` | `Nullable`\<`number`\> | - | - |
| <a id="featureflags"></a> `featureFlags` | \{ `acceleration?`: `ProtectSensorChannelInterface`; `alarmTypes?`: `string`[]; `button?`: `ProtectSensorChannelInterface`; `glassBreak?`: `ProtectSensorChannelInterface`; `humidity?`: `ProtectSensorChannelInterface`; `isBidirectional`: `boolean`; `led?`: `ProtectSensorChannelInterface`; `light?`: `ProtectSensorChannelInterface`; `motion?`: `ProtectSensorChannelInterface`; `open?`: `ProtectSensorChannelInterface`; `tamper?`: `ProtectSensorChannelInterface`; `temperature?`: `ProtectSensorChannelInterface` & \{ `range`: \{ `max`: `number`; `min`: `number`; \}; \}; `waterLeak?`: `ProtectSensorChannelInterface` & \{ `channelNames`: `string`[]; \}; \} | - | - |
| `featureFlags.acceleration?` | `ProtectSensorChannelInterface` | - | - |
| `featureFlags.alarmTypes?` | `string`[] | - | - |
| `featureFlags.button?` | `ProtectSensorChannelInterface` | - | - |
| `featureFlags.glassBreak?` | `ProtectSensorChannelInterface` | - | - |
| `featureFlags.humidity?` | `ProtectSensorChannelInterface` | - | - |
| `featureFlags.isBidirectional` | `boolean` | - | - |
| `featureFlags.led?` | `ProtectSensorChannelInterface` | - | - |
| `featureFlags.light?` | `ProtectSensorChannelInterface` | - | - |
| `featureFlags.motion?` | `ProtectSensorChannelInterface` | - | - |
| `featureFlags.open?` | `ProtectSensorChannelInterface` | - | - |
| `featureFlags.tamper?` | `ProtectSensorChannelInterface` | - | - |
| `featureFlags.temperature?` | `ProtectSensorChannelInterface` & \{ `range`: \{ `max`: `number`; `min`: `number`; \}; \} | - | - |
| `featureFlags.waterLeak?` | `ProtectSensorChannelInterface` & \{ `channelNames`: `string`[]; \} | - | - |
| <a id="firmwarebuild"></a> `firmwareBuild` | `string` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`firmwareBuild`](ProtectDeviceBaseInterface.md#firmwarebuild) |
| <a id="firmwareversion"></a> `firmwareVersion` | `Nullable`\<`string`\> | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`firmwareVersion`](ProtectDeviceBaseInterface.md#firmwareversion) |
| <a id="functionbuttonpressedat"></a> `functionButtonPressedAt` | `Nullable`\<`number`\> | - | - |
| <a id="fwupdatestate"></a> `fwUpdateState` | `Nullable`\<`string`\> | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`fwUpdateState`](ProtectDeviceBaseInterface.md#fwupdatestate) |
| <a id="glassbreaksettings"></a> `glassBreakSettings` | [`ProtectSensorSensitivitySettingsInterface`](ProtectSensorSensitivitySettingsInterface.md) | - | - |
| <a id="globalalarmmanagerscopenames"></a> `globalAlarmManagerScopeNames` | `string`[] | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`globalAlarmManagerScopeNames`](ProtectDeviceBaseInterface.md#globalalarmmanagerscopenames) |
| <a id="guid"></a> `guid` | `Nullable`\<`string`\> | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`guid`](ProtectDeviceBaseInterface.md#guid) |
| <a id="hardwarerevision"></a> `hardwareRevision` | `Nullable`\<`string`\> | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`hardwareRevision`](ProtectDeviceBaseInterface.md#hardwarerevision) |
| <a id="hascustomsensitivitywhenarmed"></a> `hasCustomSensitivityWhenArmed` | `boolean` | - | - |
| <a id="host"></a> `host` | `string` | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`host`](ProtectDeviceBaseInterface.md#host) | - |
| <a id="humiditysettings"></a> `humiditySettings` | [`ProtectThresholdSettingsInterface`](ProtectThresholdSettingsInterface.md) | - | - |
| <a id="id"></a> `id` | `string` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`id`](ProtectDeviceBaseInterface.md#id) |
| <a id="isadopted"></a> `isAdopted` | `boolean` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`isAdopted`](ProtectDeviceBaseInterface.md#isadopted) |
| <a id="isadoptedbyother"></a> `isAdoptedByOther` | `boolean` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`isAdoptedByOther`](ProtectDeviceBaseInterface.md#isadoptedbyother) |
| <a id="isadopting"></a> `isAdopting` | `boolean` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`isAdopting`](ProtectDeviceBaseInterface.md#isadopting) |
| <a id="isattemptingtoconnect"></a> `isAttemptingToConnect` | `boolean` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`isAttemptingToConnect`](ProtectDeviceBaseInterface.md#isattemptingtoconnect) |
| <a id="isblockedbyarmmode"></a> `isBlockedByArmMode` | `boolean` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`isBlockedByArmMode`](ProtectDeviceBaseInterface.md#isblockedbyarmmode) |
| <a id="isconnected"></a> `isConnected` | `boolean` | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`isConnected`](ProtectDeviceBaseInterface.md#isconnected) | - |
| <a id="isdownloadingfw"></a> `isDownloadingFW` | `boolean` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`isDownloadingFW`](ProtectDeviceBaseInterface.md#isdownloadingfw) |
| <a id="ismotiondetected"></a> `isMotionDetected` | `boolean` | - | - |
| <a id="isopened"></a> `isOpened` | `Nullable`\<`boolean`\> | - | - |
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
| <a id="leakdetectedat"></a> `leakDetectedAt` | `Nullable`\<`number`\> | - | - |
| <a id="leaksettings"></a> `leakSettings` | \{ `isExternalEnabled`: `boolean`; `isInternalEnabled`: `boolean`; \} | - | - |
| `leakSettings.isExternalEnabled` | `boolean` | - | - |
| `leakSettings.isInternalEnabled` | `boolean` | - | - |
| <a id="ledsettings"></a> `ledSettings` | \{ `isEnabled`: `boolean`; \} | - | - |
| `ledSettings.isEnabled` | `boolean` | - | - |
| <a id="lightsettings"></a> `lightSettings` | [`ProtectThresholdSettingsInterface`](ProtectThresholdSettingsInterface.md) | - | - |
| <a id="mac"></a> `mac` | `string` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`mac`](ProtectDeviceBaseInterface.md#mac) |
| <a id="marketname"></a> `marketName` | `string` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`marketName`](ProtectDeviceBaseInterface.md#marketname) |
| <a id="minfirmwareversion"></a> `minFirmwareVersion` | `string` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`minFirmwareVersion`](ProtectDeviceBaseInterface.md#minfirmwareversion) |
| <a id="modelkey"></a> `modelKey` | `"sensor"` | - | - |
| <a id="motiondetectedat"></a> `motionDetectedAt` | `Nullable`\<`number`\> | - | - |
| <a id="motionsettings"></a> `motionSettings` | [`ProtectSensorSensitivitySettingsInterface`](ProtectSensorSensitivitySettingsInterface.md) | - | - |
| <a id="mounttype"></a> `mountType` | `string` | - | - |
| <a id="name"></a> `name?` | `string` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`name`](ProtectDeviceBaseInterface.md#name) |
| <a id="nvrmac"></a> `nvrMac` | `string` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`nvrMac`](ProtectDeviceBaseInterface.md#nvrmac) |
| <a id="openstatuschangedat"></a> `openStatusChangedAt` | `Nullable`\<`number`\> | - | - |
| <a id="platform"></a> `platform?` | `Nullable`\<`string`\> | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`platform`](ProtectDeviceBaseInterface.md#platform) |
| <a id="previousfirmwareurl"></a> `previousFirmwareUrl` | `Nullable`\<`string`\> | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`previousFirmwareUrl`](ProtectDeviceBaseInterface.md#previousfirmwareurl) |
| <a id="previousfirmwareversion"></a> `previousFirmwareVersion` | `Nullable`\<`string`\> | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`previousFirmwareVersion`](ProtectDeviceBaseInterface.md#previousfirmwareversion) |
| <a id="releasenotepath"></a> `releaseNotePath` | `Nullable`\<`string`\> | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`releaseNotePath`](ProtectDeviceBaseInterface.md#releasenotepath) |
| <a id="schedulemode"></a> `scheduleMode` | `string` | - | - |
| <a id="smokestatus"></a> `smokeStatus` | `Nullable`\<[`ProtectSensorSmokeStatusInterface`](ProtectSensorSmokeStatusInterface.md)\> | - | - |
| <a id="state"></a> `state` | `string` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`state`](ProtectDeviceBaseInterface.md#state) |
| <a id="stats"></a> `stats?` | \{ `humidity?`: [`ProtectAirQualityMetricInterface`](ProtectAirQualityMetricInterface.md); `light?`: [`ProtectAirQualityMetricInterface`](ProtectAirQualityMetricInterface.md); `temperature?`: [`ProtectAirQualityMetricInterface`](ProtectAirQualityMetricInterface.md); \} | - | - |
| `stats.humidity?` | [`ProtectAirQualityMetricInterface`](ProtectAirQualityMetricInterface.md) | - | - |
| `stats.light?` | [`ProtectAirQualityMetricInterface`](ProtectAirQualityMetricInterface.md) | - | - |
| `stats.temperature?` | [`ProtectAirQualityMetricInterface`](ProtectAirQualityMetricInterface.md) | - | - |
| <a id="supportfilecreatedat"></a> `supportFileCreatedAt` | `Nullable`\<`number`\> | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`supportFileCreatedAt`](ProtectDeviceBaseInterface.md#supportfilecreatedat) |
| <a id="supportfilename"></a> `supportFileName` | `Nullable`\<`string`\> | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`supportFileName`](ProtectDeviceBaseInterface.md#supportfilename) |
| <a id="supportfilestate"></a> `supportFileState` | `Nullable`\<`string`\> | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`supportFileState`](ProtectDeviceBaseInterface.md#supportfilestate) |
| <a id="sysid"></a> `sysid` | `Nullable`\<`string`\> | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`sysid`](ProtectDeviceBaseInterface.md#sysid) |
| <a id="tamperingdetectedat"></a> `tamperingDetectedAt` | `Nullable`\<`number`\> | - | - |
| <a id="temperaturesettings"></a> `temperatureSettings` | [`ProtectThresholdSettingsInterface`](ProtectThresholdSettingsInterface.md) | - | - |
| <a id="troublesilencedat"></a> `troubleSilencedAt` | `Nullable`\<`number`\> | - | - |
| <a id="type"></a> `type` | `string` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`type`](ProtectDeviceBaseInterface.md#type) |
| <a id="updateinterval"></a> `updateInterval` | `number` | - | - |
| <a id="uplinkdevice"></a> `uplinkDevice` | `Nullable`\<`string`\> | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`uplinkDevice`](ProtectDeviceBaseInterface.md#uplinkdevice) |
| <a id="upsince"></a> `upSince` | `number` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`upSince`](ProtectDeviceBaseInterface.md#upsince) |
| <a id="uptime"></a> `uptime` | `number` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`uptime`](ProtectDeviceBaseInterface.md#uptime) |
| <a id="wificonnectionstate"></a> `wifiConnectionState` | [`ProtectWifiConnectionStateInterface`](ProtectWifiConnectionStateInterface.md) | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`wifiConnectionState`](ProtectDeviceBaseInterface.md#wificonnectionstate) |
| <a id="wiredconnectionstate"></a> `wiredConnectionState` | [`ProtectWiredConnectionStateInterface`](ProtectWiredConnectionStateInterface.md) | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`wiredConnectionState`](ProtectDeviceBaseInterface.md#wiredconnectionstate) |
| <a id="wirelessconnectionsettings"></a> `wirelessConnectionSettings` | [`ProtectWirelessConnectionSettingsInterface`](ProtectWirelessConnectionSettingsInterface.md) | - | - |
| <a id="wirelessconnectionstate"></a> `wirelessConnectionState` | [`ProtectWirelessConnectionStateInterface`](ProtectWirelessConnectionStateInterface.md) | - | - |
