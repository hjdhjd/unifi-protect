[unifi-protect](../README.md) / [Exports](../modules.md) / ProtectNvrConfig

# Interface: ProtectNvrConfig

## Table of contents

### Properties

- [analyticsData](ProtectNvrConfig.md#analyticsdata)
- [anonymouseDeviceId](ProtectNvrConfig.md#anonymousedeviceid)
- [availableUpdate](ProtectNvrConfig.md#availableupdate)
- [avgMotions](ProtectNvrConfig.md#avgmotions)
- [cameraUtilization](ProtectNvrConfig.md#camerautilization)
- [canAutoUpdate](ProtectNvrConfig.md#canautoupdate)
- [disableAudio](ProtectNvrConfig.md#disableaudio)
- [disableAutoLink](ProtectNvrConfig.md#disableautolink)
- [doorbellSettings](ProtectNvrConfig.md#doorbellsettings)
- [enableAutomaticBackups](ProtectNvrConfig.md#enableautomaticbackups)
- [enableBridgeAutoAdoption](ProtectNvrConfig.md#enablebridgeautoadoption)
- [enableCrashReporting](ProtectNvrConfig.md#enablecrashreporting)
- [enableStatsReporting](ProtectNvrConfig.md#enablestatsreporting)
- [errorCode](ProtectNvrConfig.md#errorcode)
- [featureFlags](ProtectNvrConfig.md#featureflags)
- [firmwareVersion](ProtectNvrConfig.md#firmwareversion)
- [hardwareId](ProtectNvrConfig.md#hardwareid)
- [hardwarePlatform](ProtectNvrConfig.md#hardwareplatform)
- [hardwareRevision](ProtectNvrConfig.md#hardwarerevision)
- [host](ProtectNvrConfig.md#host)
- [hostShortname](ProtectNvrConfig.md#hostshortname)
- [hostType](ProtectNvrConfig.md#hosttype)
- [hosts](ProtectNvrConfig.md#hosts)
- [id](ProtectNvrConfig.md#id)
- [isAway](ProtectNvrConfig.md#isaway)
- [isHardware](ProtectNvrConfig.md#ishardware)
- [isRecordingDisabled](ProtectNvrConfig.md#isrecordingdisabled)
- [isRecordingMotionOnly](ProtectNvrConfig.md#isrecordingmotiononly)
- [isRecycling](ProtectNvrConfig.md#isrecycling)
- [isSetup](ProtectNvrConfig.md#issetup)
- [isSshEnabled](ProtectNvrConfig.md#issshenabled)
- [isStation](ProtectNvrConfig.md#isstation)
- [isStatsGatheringEnabled](ProtectNvrConfig.md#isstatsgatheringenabled)
- [isUpdating](ProtectNvrConfig.md#isupdating)
- [isWirelessUplinkEnabled](ProtectNvrConfig.md#iswirelessuplinkenabled)
- [lastSeen](ProtectNvrConfig.md#lastseen)
- [lastUpdateAt](ProtectNvrConfig.md#lastupdateat)
- [locationSettings](ProtectNvrConfig.md#locationsettings)
- [mac](ProtectNvrConfig.md#mac)
- [marketName](ProtectNvrConfig.md#marketname)
- [maxCameraCapacity](ProtectNvrConfig.md#maxcameracapacity)
- [modelKey](ProtectNvrConfig.md#modelkey)
- [name](ProtectNvrConfig.md#name)
- [network](ProtectNvrConfig.md#network)
- [ports](ProtectNvrConfig.md#ports)
- [recordingRetentionDurationMs](ProtectNvrConfig.md#recordingretentiondurationms)
- [releaseChannel](ProtectNvrConfig.md#releasechannel)
- [skipFirmwareUpdate](ProtectNvrConfig.md#skipfirmwareupdate)
- [smartDetectAgreement](ProtectNvrConfig.md#smartdetectagreement)
- [ssoChannel](ProtectNvrConfig.md#ssochannel)
- [storageStats](ProtectNvrConfig.md#storagestats)
- [systemInfo](ProtectNvrConfig.md#systeminfo)
- [temperatureUnit](ProtectNvrConfig.md#temperatureunit)
- [timeFormat](ProtectNvrConfig.md#timeformat)
- [timezone](ProtectNvrConfig.md#timezone)
- [type](ProtectNvrConfig.md#type)
- [ucoreVersion](ProtectNvrConfig.md#ucoreversion)
- [uiVersion](ProtectNvrConfig.md#uiversion)
- [upSince](ProtectNvrConfig.md#upsince)
- [uptime](ProtectNvrConfig.md#uptime)
- [version](ProtectNvrConfig.md#version)
- [wifiSettings](ProtectNvrConfig.md#wifisettings)

## Properties

### analyticsData

• `Readonly` **analyticsData**: `string`

#### Defined in

[src/protect-types.ts:27](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L27)

___

### anonymouseDeviceId

• `Readonly` **anonymouseDeviceId**: `string`

#### Defined in

[src/protect-types.ts:28](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L28)

___

### availableUpdate

• `Readonly` **availableUpdate**: `string`

#### Defined in

[src/protect-types.ts:29](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L29)

___

### avgMotions

• `Readonly` **avgMotions**: `number`[]

#### Defined in

[src/protect-types.ts:30](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L30)

___

### cameraUtilization

• `Readonly` **cameraUtilization**: `number`

#### Defined in

[src/protect-types.ts:31](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L31)

___

### canAutoUpdate

• `Readonly` **canAutoUpdate**: `boolean`

#### Defined in

[src/protect-types.ts:32](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L32)

___

### disableAudio

• `Readonly` **disableAudio**: `boolean`

#### Defined in

[src/protect-types.ts:33](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L33)

___

### disableAutoLink

• `Readonly` **disableAutoLink**: `boolean`

#### Defined in

[src/protect-types.ts:34](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L34)

___

### doorbellSettings

• `Readonly` **doorbellSettings**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `allMessages` | { `text`: `string` ; `type`: `string`  }[] |
| `customMessages` | `string`[] |
| `defaultMessageResetTimeoutMs` | `number` |
| `defaultMessageText` | `string` |

#### Defined in

[src/protect-types.ts:35](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L35)

___

### enableAutomaticBackups

• `Readonly` **enableAutomaticBackups**: `boolean`

#### Defined in

[src/protect-types.ts:45](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L45)

___

### enableBridgeAutoAdoption

• `Readonly` **enableBridgeAutoAdoption**: `boolean`

#### Defined in

[src/protect-types.ts:46](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L46)

___

### enableCrashReporting

• `Readonly` **enableCrashReporting**: `boolean`

#### Defined in

[src/protect-types.ts:47](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L47)

___

### enableStatsReporting

• `Readonly` **enableStatsReporting**: `boolean`

#### Defined in

[src/protect-types.ts:48](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L48)

___

### errorCode

• `Readonly` **errorCode**: ``null`` \| `string`

#### Defined in

[src/protect-types.ts:49](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L49)

___

### featureFlags

• `Readonly` **featureFlags**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `beta` | `boolean` |
| `dev` | `boolean` |
| `notificationsV2` | `boolean` |

#### Defined in

[src/protect-types.ts:50](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L50)

___

### firmwareVersion

• `Readonly` **firmwareVersion**: `string`

#### Defined in

[src/protect-types.ts:56](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L56)

___

### hardwareId

• `Readonly` **hardwareId**: `string`

#### Defined in

[src/protect-types.ts:57](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L57)

___

### hardwarePlatform

• `Readonly` **hardwarePlatform**: `string`

#### Defined in

[src/protect-types.ts:58](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L58)

___

### hardwareRevision

• `Readonly` **hardwareRevision**: `string`

#### Defined in

[src/protect-types.ts:59](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L59)

___

### host

• `Readonly` **host**: `string`

#### Defined in

[src/protect-types.ts:60](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L60)

___

### hostShortname

• `Readonly` **hostShortname**: `string`

#### Defined in

[src/protect-types.ts:61](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L61)

___

### hostType

• `Readonly` **hostType**: `string`

#### Defined in

[src/protect-types.ts:62](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L62)

___

### hosts

• `Readonly` **hosts**: `string`[]

#### Defined in

[src/protect-types.ts:63](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L63)

___

### id

• `Readonly` **id**: `string`

#### Defined in

[src/protect-types.ts:64](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L64)

___

### isAway

• `Readonly` **isAway**: `boolean`

#### Defined in

[src/protect-types.ts:65](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L65)

___

### isHardware

• `Readonly` **isHardware**: `boolean`

#### Defined in

[src/protect-types.ts:66](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L66)

___

### isRecordingDisabled

• `Readonly` **isRecordingDisabled**: `boolean`

#### Defined in

[src/protect-types.ts:67](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L67)

___

### isRecordingMotionOnly

• `Readonly` **isRecordingMotionOnly**: `boolean`

#### Defined in

[src/protect-types.ts:68](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L68)

___

### isRecycling

• `Readonly` **isRecycling**: `boolean`

#### Defined in

[src/protect-types.ts:69](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L69)

___

### isSetup

• `Readonly` **isSetup**: `boolean`

#### Defined in

[src/protect-types.ts:70](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L70)

___

### isSshEnabled

• `Readonly` **isSshEnabled**: `boolean`

#### Defined in

[src/protect-types.ts:71](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L71)

___

### isStation

• `Readonly` **isStation**: `boolean`

#### Defined in

[src/protect-types.ts:72](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L72)

___

### isStatsGatheringEnabled

• `Readonly` **isStatsGatheringEnabled**: `boolean`

#### Defined in

[src/protect-types.ts:73](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L73)

___

### isUpdating

• `Readonly` **isUpdating**: `boolean`

#### Defined in

[src/protect-types.ts:74](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L74)

___

### isWirelessUplinkEnabled

• `Readonly` **isWirelessUplinkEnabled**: `boolean`

#### Defined in

[src/protect-types.ts:75](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L75)

___

### lastSeen

• `Readonly` **lastSeen**: `number`

#### Defined in

[src/protect-types.ts:76](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L76)

___

### lastUpdateAt

• `Readonly` **lastUpdateAt**: ``null`` \| `number`

#### Defined in

[src/protect-types.ts:77](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L77)

___

### locationSettings

• `Readonly` **locationSettings**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `isAway` | `boolean` |
| `isGeofencingEnabled` | `boolean` |
| `latitude` | `number` |
| `longitude` | `number` |
| `radius` | `number` |

#### Defined in

[src/protect-types.ts:78](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L78)

___

### mac

• `Readonly` **mac**: `string`

#### Defined in

[src/protect-types.ts:86](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L86)

___

### marketName

• `Readonly` **marketName**: `string`

#### Defined in

[src/protect-types.ts:87](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L87)

___

### maxCameraCapacity

• `Readonly` **maxCameraCapacity**: `Record`<`string`, `number`\>

#### Defined in

[src/protect-types.ts:88](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L88)

___

### modelKey

• `Readonly` **modelKey**: `string`

#### Defined in

[src/protect-types.ts:89](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L89)

___

### name

• `Readonly` **name**: `string`

#### Defined in

[src/protect-types.ts:90](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L90)

___

### network

• `Readonly` **network**: `string`

#### Defined in

[src/protect-types.ts:91](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L91)

___

### ports

• `Readonly` **ports**: `Object`

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

[src/protect-types.ts:92](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L92)

___

### recordingRetentionDurationMs

• `Readonly` **recordingRetentionDurationMs**: `string`

#### Defined in

[src/protect-types.ts:114](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L114)

___

### releaseChannel

• `Readonly` **releaseChannel**: `string`

#### Defined in

[src/protect-types.ts:115](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L115)

___

### skipFirmwareUpdate

• `Readonly` **skipFirmwareUpdate**: `boolean`

#### Defined in

[src/protect-types.ts:116](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L116)

___

### smartDetectAgreement

• `Readonly` **smartDetectAgreement**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `lastUpdateAt` | ``null`` \| `number` |
| `status` | `string` |

#### Defined in

[src/protect-types.ts:117](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L117)

___

### ssoChannel

• `Readonly` **ssoChannel**: ``null`` \| `string`

#### Defined in

[src/protect-types.ts:122](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L122)

___

### storageStats

• `Readonly` **storageStats**: `unknown`

#### Defined in

[src/protect-types.ts:123](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L123)

___

### systemInfo

• `Readonly` **systemInfo**: [`ProtectNvrSystemInfoInterface`](ProtectNvrSystemInfoInterface.md)

#### Defined in

[src/protect-types.ts:124](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L124)

___

### temperatureUnit

• `Readonly` **temperatureUnit**: `string`

#### Defined in

[src/protect-types.ts:125](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L125)

___

### timeFormat

• `Readonly` **timeFormat**: `string`

#### Defined in

[src/protect-types.ts:126](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L126)

___

### timezone

• `Readonly` **timezone**: `string`

#### Defined in

[src/protect-types.ts:127](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L127)

___

### type

• `Readonly` **type**: `string`

#### Defined in

[src/protect-types.ts:128](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L128)

___

### ucoreVersion

• `Readonly` **ucoreVersion**: `string`

#### Defined in

[src/protect-types.ts:129](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L129)

___

### uiVersion

• `Readonly` **uiVersion**: `string`

#### Defined in

[src/protect-types.ts:130](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L130)

___

### upSince

• `Readonly` **upSince**: `number`

#### Defined in

[src/protect-types.ts:131](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L131)

___

### uptime

• `Readonly` **uptime**: `number`

#### Defined in

[src/protect-types.ts:132](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L132)

___

### version

• `Readonly` **version**: `string`

#### Defined in

[src/protect-types.ts:133](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L133)

___

### wifiSettings

• `Readonly` **wifiSettings**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `password` | ``null`` \| `string` |
| `ssid` | ``null`` \| `string` |
| `useThirdPartyWifi` | `boolean` |

#### Defined in

[src/protect-types.ts:134](https://github.com/hjdhjd/unifi-protect/blob/a8068b4/src/protect-types.ts#L134)
