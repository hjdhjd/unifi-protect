[unifi-protect](../README.md) / [Exports](../modules.md) / ProtectNvrConfigInterface

# Interface: ProtectNvrConfigInterface

## Table of contents

### Properties

- [analyticsData](ProtectNvrConfigInterface.md#analyticsdata)
- [anonymouseDeviceId](ProtectNvrConfigInterface.md#anonymousedeviceid)
- [availableUpdate](ProtectNvrConfigInterface.md#availableupdate)
- [avgMotions](ProtectNvrConfigInterface.md#avgmotions)
- [cameraUtilization](ProtectNvrConfigInterface.md#camerautilization)
- [canAutoUpdate](ProtectNvrConfigInterface.md#canautoupdate)
- [disableAudio](ProtectNvrConfigInterface.md#disableaudio)
- [disableAutoLink](ProtectNvrConfigInterface.md#disableautolink)
- [doorbellSettings](ProtectNvrConfigInterface.md#doorbellsettings)
- [enableAutomaticBackups](ProtectNvrConfigInterface.md#enableautomaticbackups)
- [enableBridgeAutoAdoption](ProtectNvrConfigInterface.md#enablebridgeautoadoption)
- [enableCrashReporting](ProtectNvrConfigInterface.md#enablecrashreporting)
- [enableStatsReporting](ProtectNvrConfigInterface.md#enablestatsreporting)
- [errorCode](ProtectNvrConfigInterface.md#errorcode)
- [featureFlags](ProtectNvrConfigInterface.md#featureflags)
- [firmwareVersion](ProtectNvrConfigInterface.md#firmwareversion)
- [hardwareId](ProtectNvrConfigInterface.md#hardwareid)
- [hardwarePlatform](ProtectNvrConfigInterface.md#hardwareplatform)
- [hardwareRevision](ProtectNvrConfigInterface.md#hardwarerevision)
- [host](ProtectNvrConfigInterface.md#host)
- [hostShortname](ProtectNvrConfigInterface.md#hostshortname)
- [hostType](ProtectNvrConfigInterface.md#hosttype)
- [hosts](ProtectNvrConfigInterface.md#hosts)
- [id](ProtectNvrConfigInterface.md#id)
- [isAway](ProtectNvrConfigInterface.md#isaway)
- [isHardware](ProtectNvrConfigInterface.md#ishardware)
- [isRecordingDisabled](ProtectNvrConfigInterface.md#isrecordingdisabled)
- [isRecordingMotionOnly](ProtectNvrConfigInterface.md#isrecordingmotiononly)
- [isRecycling](ProtectNvrConfigInterface.md#isrecycling)
- [isSetup](ProtectNvrConfigInterface.md#issetup)
- [isSshEnabled](ProtectNvrConfigInterface.md#issshenabled)
- [isStation](ProtectNvrConfigInterface.md#isstation)
- [isStatsGatheringEnabled](ProtectNvrConfigInterface.md#isstatsgatheringenabled)
- [isUpdating](ProtectNvrConfigInterface.md#isupdating)
- [isWirelessUplinkEnabled](ProtectNvrConfigInterface.md#iswirelessuplinkenabled)
- [lastSeen](ProtectNvrConfigInterface.md#lastseen)
- [lastUpdateAt](ProtectNvrConfigInterface.md#lastupdateat)
- [locationSettings](ProtectNvrConfigInterface.md#locationsettings)
- [mac](ProtectNvrConfigInterface.md#mac)
- [marketName](ProtectNvrConfigInterface.md#marketname)
- [maxCameraCapacity](ProtectNvrConfigInterface.md#maxcameracapacity)
- [modelKey](ProtectNvrConfigInterface.md#modelkey)
- [name](ProtectNvrConfigInterface.md#name)
- [network](ProtectNvrConfigInterface.md#network)
- [ports](ProtectNvrConfigInterface.md#ports)
- [recordingRetentionDurationMs](ProtectNvrConfigInterface.md#recordingretentiondurationms)
- [releaseChannel](ProtectNvrConfigInterface.md#releasechannel)
- [skipFirmwareUpdate](ProtectNvrConfigInterface.md#skipfirmwareupdate)
- [smartDetectAgreement](ProtectNvrConfigInterface.md#smartdetectagreement)
- [ssoChannel](ProtectNvrConfigInterface.md#ssochannel)
- [storageStats](ProtectNvrConfigInterface.md#storagestats)
- [systemInfo](ProtectNvrConfigInterface.md#systeminfo)
- [temperatureUnit](ProtectNvrConfigInterface.md#temperatureunit)
- [timeFormat](ProtectNvrConfigInterface.md#timeformat)
- [timezone](ProtectNvrConfigInterface.md#timezone)
- [type](ProtectNvrConfigInterface.md#type)
- [ucoreVersion](ProtectNvrConfigInterface.md#ucoreversion)
- [uiVersion](ProtectNvrConfigInterface.md#uiversion)
- [upSince](ProtectNvrConfigInterface.md#upsince)
- [uptime](ProtectNvrConfigInterface.md#uptime)
- [version](ProtectNvrConfigInterface.md#version)
- [wifiSettings](ProtectNvrConfigInterface.md#wifisettings)

## Properties

### analyticsData

• **analyticsData**: `string`

#### Defined in

[src/protect-types.ts:27](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L27)

___

### anonymouseDeviceId

• **anonymouseDeviceId**: `string`

#### Defined in

[src/protect-types.ts:28](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L28)

___

### availableUpdate

• **availableUpdate**: `string`

#### Defined in

[src/protect-types.ts:29](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L29)

___

### avgMotions

• **avgMotions**: `number`[]

#### Defined in

[src/protect-types.ts:30](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L30)

___

### cameraUtilization

• **cameraUtilization**: `number`

#### Defined in

[src/protect-types.ts:31](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L31)

___

### canAutoUpdate

• **canAutoUpdate**: `boolean`

#### Defined in

[src/protect-types.ts:32](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L32)

___

### disableAudio

• **disableAudio**: `boolean`

#### Defined in

[src/protect-types.ts:33](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L33)

___

### disableAutoLink

• **disableAutoLink**: `boolean`

#### Defined in

[src/protect-types.ts:34](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L34)

___

### doorbellSettings

• **doorbellSettings**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `allMessages` | { `text`: `string` ; `type`: `string`  }[] |
| `customMessages` | `string`[] |
| `defaultMessageResetTimeoutMs` | `number` |
| `defaultMessageText` | `string` |

#### Defined in

[src/protect-types.ts:35](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L35)

___

### enableAutomaticBackups

• **enableAutomaticBackups**: `boolean`

#### Defined in

[src/protect-types.ts:45](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L45)

___

### enableBridgeAutoAdoption

• **enableBridgeAutoAdoption**: `boolean`

#### Defined in

[src/protect-types.ts:46](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L46)

___

### enableCrashReporting

• **enableCrashReporting**: `boolean`

#### Defined in

[src/protect-types.ts:47](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L47)

___

### enableStatsReporting

• **enableStatsReporting**: `boolean`

#### Defined in

[src/protect-types.ts:48](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L48)

___

### errorCode

• **errorCode**: ``null`` \| `string`

#### Defined in

[src/protect-types.ts:49](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L49)

___

### featureFlags

• **featureFlags**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `beta` | `boolean` |
| `dev` | `boolean` |
| `notificationsV2` | `boolean` |

#### Defined in

[src/protect-types.ts:50](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L50)

___

### firmwareVersion

• **firmwareVersion**: `string`

#### Defined in

[src/protect-types.ts:56](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L56)

___

### hardwareId

• **hardwareId**: `string`

#### Defined in

[src/protect-types.ts:57](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L57)

___

### hardwarePlatform

• **hardwarePlatform**: `string`

#### Defined in

[src/protect-types.ts:58](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L58)

___

### hardwareRevision

• **hardwareRevision**: `string`

#### Defined in

[src/protect-types.ts:59](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L59)

___

### host

• **host**: `string`

#### Defined in

[src/protect-types.ts:60](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L60)

___

### hostShortname

• **hostShortname**: `string`

#### Defined in

[src/protect-types.ts:61](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L61)

___

### hostType

• **hostType**: `string`

#### Defined in

[src/protect-types.ts:62](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L62)

___

### hosts

• **hosts**: `string`[]

#### Defined in

[src/protect-types.ts:63](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L63)

___

### id

• **id**: `string`

#### Defined in

[src/protect-types.ts:64](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L64)

___

### isAway

• **isAway**: `boolean`

#### Defined in

[src/protect-types.ts:65](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L65)

___

### isHardware

• **isHardware**: `boolean`

#### Defined in

[src/protect-types.ts:66](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L66)

___

### isRecordingDisabled

• **isRecordingDisabled**: `boolean`

#### Defined in

[src/protect-types.ts:67](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L67)

___

### isRecordingMotionOnly

• **isRecordingMotionOnly**: `boolean`

#### Defined in

[src/protect-types.ts:68](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L68)

___

### isRecycling

• **isRecycling**: `boolean`

#### Defined in

[src/protect-types.ts:69](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L69)

___

### isSetup

• **isSetup**: `boolean`

#### Defined in

[src/protect-types.ts:70](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L70)

___

### isSshEnabled

• **isSshEnabled**: `boolean`

#### Defined in

[src/protect-types.ts:71](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L71)

___

### isStation

• **isStation**: `boolean`

#### Defined in

[src/protect-types.ts:72](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L72)

___

### isStatsGatheringEnabled

• **isStatsGatheringEnabled**: `boolean`

#### Defined in

[src/protect-types.ts:73](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L73)

___

### isUpdating

• **isUpdating**: `boolean`

#### Defined in

[src/protect-types.ts:74](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L74)

___

### isWirelessUplinkEnabled

• **isWirelessUplinkEnabled**: `boolean`

#### Defined in

[src/protect-types.ts:75](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L75)

___

### lastSeen

• **lastSeen**: `number`

#### Defined in

[src/protect-types.ts:76](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L76)

___

### lastUpdateAt

• **lastUpdateAt**: ``null`` \| `number`

#### Defined in

[src/protect-types.ts:77](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L77)

___

### locationSettings

• **locationSettings**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `isAway` | `boolean` |
| `isGeofencingEnabled` | `boolean` |
| `latitude` | `number` |
| `longitude` | `number` |
| `radius` | `number` |

#### Defined in

[src/protect-types.ts:78](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L78)

___

### mac

• **mac**: `string`

#### Defined in

[src/protect-types.ts:86](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L86)

___

### marketName

• **marketName**: `string`

#### Defined in

[src/protect-types.ts:87](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L87)

___

### maxCameraCapacity

• **maxCameraCapacity**: `Record`<`string`, `number`\>

#### Defined in

[src/protect-types.ts:88](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L88)

___

### modelKey

• **modelKey**: `string`

#### Defined in

[src/protect-types.ts:89](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L89)

___

### name

• **name**: `string`

#### Defined in

[src/protect-types.ts:90](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L90)

___

### network

• **network**: `string`

#### Defined in

[src/protect-types.ts:91](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L91)

___

### ports

• **ports**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `cameraEvents` | `number` |
| `cameraHttps` | `number` |
| `cameraTcp` | `number` |
| `devicesWss` | `number` |
| `discoveryClient` | `number` |
| `emsCLI` | `number` |
| `emsLiveFLV` | `number` |
| `http` | `number` |
| `https` | `number` |
| `liveWs` | `number` |
| `liveWss` | `number` |
| `playback` | `number` |
| `rtmp` | `number` |
| `rtsp` | `number` |
| `rtsps` | `number` |
| `tcpBridge` | `number` |
| `tcpStreams` | `number` |
| `ucore` | `number` |
| `ump` | `number` |

#### Defined in

[src/protect-types.ts:92](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L92)

___

### recordingRetentionDurationMs

• **recordingRetentionDurationMs**: `string`

#### Defined in

[src/protect-types.ts:114](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L114)

___

### releaseChannel

• **releaseChannel**: `string`

#### Defined in

[src/protect-types.ts:115](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L115)

___

### skipFirmwareUpdate

• **skipFirmwareUpdate**: `boolean`

#### Defined in

[src/protect-types.ts:116](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L116)

___

### smartDetectAgreement

• **smartDetectAgreement**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `lastUpdateAt` | ``null`` \| `number` |
| `status` | `string` |

#### Defined in

[src/protect-types.ts:117](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L117)

___

### ssoChannel

• **ssoChannel**: ``null`` \| `string`

#### Defined in

[src/protect-types.ts:122](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L122)

___

### storageStats

• **storageStats**: `unknown`

#### Defined in

[src/protect-types.ts:123](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L123)

___

### systemInfo

• **systemInfo**: [`ProtectNvrSystemInfoInterface`](ProtectNvrSystemInfoInterface.md)

#### Defined in

[src/protect-types.ts:124](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L124)

___

### temperatureUnit

• **temperatureUnit**: `string`

#### Defined in

[src/protect-types.ts:125](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L125)

___

### timeFormat

• **timeFormat**: `string`

#### Defined in

[src/protect-types.ts:126](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L126)

___

### timezone

• **timezone**: `string`

#### Defined in

[src/protect-types.ts:127](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L127)

___

### type

• **type**: `string`

#### Defined in

[src/protect-types.ts:128](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L128)

___

### ucoreVersion

• **ucoreVersion**: `string`

#### Defined in

[src/protect-types.ts:129](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L129)

___

### uiVersion

• **uiVersion**: `string`

#### Defined in

[src/protect-types.ts:130](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L130)

___

### upSince

• **upSince**: `number`

#### Defined in

[src/protect-types.ts:131](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L131)

___

### uptime

• **uptime**: `number`

#### Defined in

[src/protect-types.ts:132](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L132)

___

### version

• **version**: `string`

#### Defined in

[src/protect-types.ts:133](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L133)

___

### wifiSettings

• **wifiSettings**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `password` | ``null`` \| `string` |
| `ssid` | ``null`` \| `string` |
| `useThirdPartyWifi` | `boolean` |

#### Defined in

[src/protect-types.ts:134](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L134)
