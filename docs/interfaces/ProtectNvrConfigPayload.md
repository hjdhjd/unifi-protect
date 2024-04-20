[unifi-protect](../README.md) / [Exports](../modules.md) / ProtectNvrConfigPayload

# Interface: ProtectNvrConfigPayload

## Table of contents

### Properties

- [analyticsData](ProtectNvrConfigPayload.md#analyticsdata)
- [anonymouseDeviceId](ProtectNvrConfigPayload.md#anonymousedeviceid)
- [availableUpdate](ProtectNvrConfigPayload.md#availableupdate)
- [avgMotions](ProtectNvrConfigPayload.md#avgmotions)
- [cameraUtilization](ProtectNvrConfigPayload.md#camerautilization)
- [canAutoUpdate](ProtectNvrConfigPayload.md#canautoupdate)
- [disableAudio](ProtectNvrConfigPayload.md#disableaudio)
- [disableAutoLink](ProtectNvrConfigPayload.md#disableautolink)
- [doorbellSettings](ProtectNvrConfigPayload.md#doorbellsettings)
- [enableAutomaticBackups](ProtectNvrConfigPayload.md#enableautomaticbackups)
- [enableBridgeAutoAdoption](ProtectNvrConfigPayload.md#enablebridgeautoadoption)
- [enableCrashReporting](ProtectNvrConfigPayload.md#enablecrashreporting)
- [enableStatsReporting](ProtectNvrConfigPayload.md#enablestatsreporting)
- [errorCode](ProtectNvrConfigPayload.md#errorcode)
- [featureFlags](ProtectNvrConfigPayload.md#featureflags)
- [firmwareVersion](ProtectNvrConfigPayload.md#firmwareversion)
- [hardwareId](ProtectNvrConfigPayload.md#hardwareid)
- [hardwarePlatform](ProtectNvrConfigPayload.md#hardwareplatform)
- [hardwareRevision](ProtectNvrConfigPayload.md#hardwarerevision)
- [host](ProtectNvrConfigPayload.md#host)
- [hostShortname](ProtectNvrConfigPayload.md#hostshortname)
- [hostType](ProtectNvrConfigPayload.md#hosttype)
- [hosts](ProtectNvrConfigPayload.md#hosts)
- [id](ProtectNvrConfigPayload.md#id)
- [isAway](ProtectNvrConfigPayload.md#isaway)
- [isHardware](ProtectNvrConfigPayload.md#ishardware)
- [isRecordingDisabled](ProtectNvrConfigPayload.md#isrecordingdisabled)
- [isRecordingMotionOnly](ProtectNvrConfigPayload.md#isrecordingmotiononly)
- [isRecycling](ProtectNvrConfigPayload.md#isrecycling)
- [isSetup](ProtectNvrConfigPayload.md#issetup)
- [isSshEnabled](ProtectNvrConfigPayload.md#issshenabled)
- [isStation](ProtectNvrConfigPayload.md#isstation)
- [isStatsGatheringEnabled](ProtectNvrConfigPayload.md#isstatsgatheringenabled)
- [isUpdating](ProtectNvrConfigPayload.md#isupdating)
- [isWirelessUplinkEnabled](ProtectNvrConfigPayload.md#iswirelessuplinkenabled)
- [lastSeen](ProtectNvrConfigPayload.md#lastseen)
- [lastUpdateAt](ProtectNvrConfigPayload.md#lastupdateat)
- [locationSettings](ProtectNvrConfigPayload.md#locationsettings)
- [mac](ProtectNvrConfigPayload.md#mac)
- [marketName](ProtectNvrConfigPayload.md#marketname)
- [maxCameraCapacity](ProtectNvrConfigPayload.md#maxcameracapacity)
- [modelKey](ProtectNvrConfigPayload.md#modelkey)
- [name](ProtectNvrConfigPayload.md#name)
- [network](ProtectNvrConfigPayload.md#network)
- [ports](ProtectNvrConfigPayload.md#ports)
- [recordingRetentionDurationMs](ProtectNvrConfigPayload.md#recordingretentiondurationms)
- [releaseChannel](ProtectNvrConfigPayload.md#releasechannel)
- [skipFirmwareUpdate](ProtectNvrConfigPayload.md#skipfirmwareupdate)
- [smartDetectAgreement](ProtectNvrConfigPayload.md#smartdetectagreement)
- [ssoChannel](ProtectNvrConfigPayload.md#ssochannel)
- [storageStats](ProtectNvrConfigPayload.md#storagestats)
- [systemInfo](ProtectNvrConfigPayload.md#systeminfo)
- [temperatureUnit](ProtectNvrConfigPayload.md#temperatureunit)
- [timeFormat](ProtectNvrConfigPayload.md#timeformat)
- [timezone](ProtectNvrConfigPayload.md#timezone)
- [type](ProtectNvrConfigPayload.md#type)
- [ucoreVersion](ProtectNvrConfigPayload.md#ucoreversion)
- [uiVersion](ProtectNvrConfigPayload.md#uiversion)
- [upSince](ProtectNvrConfigPayload.md#upsince)
- [uptime](ProtectNvrConfigPayload.md#uptime)
- [version](ProtectNvrConfigPayload.md#version)
- [wifiSettings](ProtectNvrConfigPayload.md#wifisettings)

## Properties

### analyticsData

• `Optional` **analyticsData**: `string`

#### Defined in

[src/protect-types.ts:29](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L29)

___

### anonymouseDeviceId

• `Optional` **anonymouseDeviceId**: `string`

#### Defined in

[src/protect-types.ts:30](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L30)

___

### availableUpdate

• `Optional` **availableUpdate**: `string`

#### Defined in

[src/protect-types.ts:31](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L31)

___

### avgMotions

• `Optional` **avgMotions**: `number`[]

#### Defined in

[src/protect-types.ts:32](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L32)

___

### cameraUtilization

• `Optional` **cameraUtilization**: `number`

#### Defined in

[src/protect-types.ts:33](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L33)

___

### canAutoUpdate

• `Optional` **canAutoUpdate**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:34](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L34)

___

### disableAudio

• `Optional` **disableAudio**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:35](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L35)

___

### disableAutoLink

• `Optional` **disableAutoLink**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:36](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L36)

___

### doorbellSettings

• `Optional` **doorbellSettings**: `DeepPartial`\<\{ `allMessages`: \{ `text`: `string` ; `type`: `string`  }[] ; `customMessages`: `string`[] ; `defaultMessageResetTimeoutMs`: `number` ; `defaultMessageText`: `string`  }\>

#### Defined in

[src/protect-types.ts:37](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L37)

___

### enableAutomaticBackups

• `Optional` **enableAutomaticBackups**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:47](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L47)

___

### enableBridgeAutoAdoption

• `Optional` **enableBridgeAutoAdoption**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:48](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L48)

___

### enableCrashReporting

• `Optional` **enableCrashReporting**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:49](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L49)

___

### enableStatsReporting

• `Optional` **enableStatsReporting**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:50](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L50)

___

### errorCode

• `Optional` **errorCode**: `DeepPartial`\<``null`` \| `string`\>

#### Defined in

[src/protect-types.ts:51](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L51)

___

### featureFlags

• `Optional` **featureFlags**: `DeepPartial`\<\{ `beta`: `boolean` ; `dev`: `boolean` ; `notificationsV2`: `boolean`  }\>

#### Defined in

[src/protect-types.ts:52](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L52)

___

### firmwareVersion

• `Optional` **firmwareVersion**: `string`

#### Defined in

[src/protect-types.ts:58](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L58)

___

### hardwareId

• `Optional` **hardwareId**: `string`

#### Defined in

[src/protect-types.ts:59](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L59)

___

### hardwarePlatform

• `Optional` **hardwarePlatform**: `string`

#### Defined in

[src/protect-types.ts:60](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L60)

___

### hardwareRevision

• `Optional` **hardwareRevision**: `string`

#### Defined in

[src/protect-types.ts:61](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L61)

___

### host

• `Optional` **host**: `string`

#### Defined in

[src/protect-types.ts:62](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L62)

___

### hostShortname

• `Optional` **hostShortname**: `string`

#### Defined in

[src/protect-types.ts:63](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L63)

___

### hostType

• `Optional` **hostType**: `string`

#### Defined in

[src/protect-types.ts:64](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L64)

___

### hosts

• `Optional` **hosts**: `string`[]

#### Defined in

[src/protect-types.ts:65](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L65)

___

### id

• `Optional` **id**: `string`

#### Defined in

[src/protect-types.ts:66](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L66)

___

### isAway

• `Optional` **isAway**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:67](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L67)

___

### isHardware

• `Optional` **isHardware**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:68](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L68)

___

### isRecordingDisabled

• `Optional` **isRecordingDisabled**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:69](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L69)

___

### isRecordingMotionOnly

• `Optional` **isRecordingMotionOnly**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:70](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L70)

___

### isRecycling

• `Optional` **isRecycling**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:71](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L71)

___

### isSetup

• `Optional` **isSetup**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:72](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L72)

___

### isSshEnabled

• `Optional` **isSshEnabled**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:73](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L73)

___

### isStation

• `Optional` **isStation**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:74](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L74)

___

### isStatsGatheringEnabled

• `Optional` **isStatsGatheringEnabled**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:75](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L75)

___

### isUpdating

• `Optional` **isUpdating**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:76](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L76)

___

### isWirelessUplinkEnabled

• `Optional` **isWirelessUplinkEnabled**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:77](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L77)

___

### lastSeen

• `Optional` **lastSeen**: `number`

#### Defined in

[src/protect-types.ts:78](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L78)

___

### lastUpdateAt

• `Optional` **lastUpdateAt**: `DeepPartial`\<``null`` \| `number`\>

#### Defined in

[src/protect-types.ts:79](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L79)

___

### locationSettings

• `Optional` **locationSettings**: `DeepPartial`\<\{ `isAway`: `boolean` ; `isGeofencingEnabled`: `boolean` ; `latitude`: `number` ; `longitude`: `number` ; `radius`: `number`  }\>

#### Defined in

[src/protect-types.ts:80](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L80)

___

### mac

• `Optional` **mac**: `string`

#### Defined in

[src/protect-types.ts:88](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L88)

___

### marketName

• `Optional` **marketName**: `string`

#### Defined in

[src/protect-types.ts:89](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L89)

___

### maxCameraCapacity

• `Optional` **maxCameraCapacity**: `DeepPartial`\<`Record`\<`string`, `number`\>\>

#### Defined in

[src/protect-types.ts:90](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L90)

___

### modelKey

• `Optional` **modelKey**: `string`

#### Defined in

[src/protect-types.ts:91](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L91)

___

### name

• `Optional` **name**: `string`

#### Defined in

[src/protect-types.ts:92](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L92)

___

### network

• `Optional` **network**: `string`

#### Defined in

[src/protect-types.ts:93](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L93)

___

### ports

• `Optional` **ports**: `DeepPartial`\<\{ `cameraEvents`: `number` ; `cameraHttps`: `number` ; `cameraTcp`: `number` ; `devicesWss`: `number` ; `discoveryClient`: `number` ; `emsCLI`: `number` ; `emsLiveFLV`: `number` ; `http`: `number` ; `https`: `number` ; `liveWs`: `number` ; `liveWss`: `number` ; `playback`: `number` ; `rtmp`: `number` ; `rtsp`: `number` ; `rtsps`: `number` ; `tcpBridge`: `number` ; `tcpStreams`: `number` ; `ucore`: `number` ; `ump`: `number`  }\>

#### Defined in

[src/protect-types.ts:94](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L94)

___

### recordingRetentionDurationMs

• `Optional` **recordingRetentionDurationMs**: `string`

#### Defined in

[src/protect-types.ts:116](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L116)

___

### releaseChannel

• `Optional` **releaseChannel**: `string`

#### Defined in

[src/protect-types.ts:117](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L117)

___

### skipFirmwareUpdate

• `Optional` **skipFirmwareUpdate**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:118](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L118)

___

### smartDetectAgreement

• `Optional` **smartDetectAgreement**: `DeepPartial`\<\{ `lastUpdateAt`: ``null`` \| `number` ; `status`: `string`  }\>

#### Defined in

[src/protect-types.ts:119](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L119)

___

### ssoChannel

• `Optional` **ssoChannel**: `DeepPartial`\<``null`` \| `string`\>

#### Defined in

[src/protect-types.ts:124](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L124)

___

### storageStats

• `Optional` **storageStats**: `DeepPartial`\<`unknown`\>

#### Defined in

[src/protect-types.ts:125](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L125)

___

### systemInfo

• `Optional` **systemInfo**: `DeepPartial`\<[`ProtectNvrSystemInfoInterface`](ProtectNvrSystemInfoInterface.md)\>

#### Defined in

[src/protect-types.ts:126](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L126)

___

### temperatureUnit

• `Optional` **temperatureUnit**: `string`

#### Defined in

[src/protect-types.ts:127](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L127)

___

### timeFormat

• `Optional` **timeFormat**: `string`

#### Defined in

[src/protect-types.ts:128](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L128)

___

### timezone

• `Optional` **timezone**: `string`

#### Defined in

[src/protect-types.ts:129](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L129)

___

### type

• `Optional` **type**: `string`

#### Defined in

[src/protect-types.ts:130](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L130)

___

### ucoreVersion

• `Optional` **ucoreVersion**: `string`

#### Defined in

[src/protect-types.ts:131](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L131)

___

### uiVersion

• `Optional` **uiVersion**: `string`

#### Defined in

[src/protect-types.ts:132](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L132)

___

### upSince

• `Optional` **upSince**: `number`

#### Defined in

[src/protect-types.ts:133](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L133)

___

### uptime

• `Optional` **uptime**: `number`

#### Defined in

[src/protect-types.ts:134](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L134)

___

### version

• `Optional` **version**: `string`

#### Defined in

[src/protect-types.ts:135](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L135)

___

### wifiSettings

• `Optional` **wifiSettings**: `DeepPartial`\<\{ `password`: ``null`` \| `string` ; `ssid`: ``null`` \| `string` ; `useThirdPartyWifi`: `boolean`  }\>

#### Defined in

[src/protect-types.ts:136](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-types.ts#L136)
