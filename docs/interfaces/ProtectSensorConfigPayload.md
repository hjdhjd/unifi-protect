[unifi-protect](../README.md) / [Exports](../modules.md) / ProtectSensorConfigPayload

# Interface: ProtectSensorConfigPayload

## Table of contents

### Properties

- [alarmSettings](ProtectSensorConfigPayload.md#alarmsettings)
- [alarmTriggeredAt](ProtectSensorConfigPayload.md#alarmtriggeredat)
- [batteryStatus](ProtectSensorConfigPayload.md#batterystatus)
- [bluetoothConnectionState](ProtectSensorConfigPayload.md#bluetoothconnectionstate)
- [bridge](ProtectSensorConfigPayload.md#bridge)
- [bridgeCandidates](ProtectSensorConfigPayload.md#bridgecandidates)
- [camera](ProtectSensorConfigPayload.md#camera)
- [canAdopt](ProtectSensorConfigPayload.md#canadopt)
- [connectedSince](ProtectSensorConfigPayload.md#connectedsince)
- [connectionHost](ProtectSensorConfigPayload.md#connectionhost)
- [firmwareBuild](ProtectSensorConfigPayload.md#firmwarebuild)
- [firmwareVersion](ProtectSensorConfigPayload.md#firmwareversion)
- [hardwareRevision](ProtectSensorConfigPayload.md#hardwarerevision)
- [humiditySettings](ProtectSensorConfigPayload.md#humiditysettings)
- [id](ProtectSensorConfigPayload.md#id)
- [isAdopted](ProtectSensorConfigPayload.md#isadopted)
- [isAdoptedByOther](ProtectSensorConfigPayload.md#isadoptedbyother)
- [isAdopting](ProtectSensorConfigPayload.md#isadopting)
- [isAttemptingToConnect](ProtectSensorConfigPayload.md#isattemptingtoconnect)
- [isConnected](ProtectSensorConfigPayload.md#isconnected)
- [isMotionDetected](ProtectSensorConfigPayload.md#ismotiondetected)
- [isOpened](ProtectSensorConfigPayload.md#isopened)
- [isProvisioned](ProtectSensorConfigPayload.md#isprovisioned)
- [isRebooting](ProtectSensorConfigPayload.md#isrebooting)
- [isSshEnabled](ProtectSensorConfigPayload.md#issshenabled)
- [isUpdating](ProtectSensorConfigPayload.md#isupdating)
- [lastSeen](ProtectSensorConfigPayload.md#lastseen)
- [latestFirmwareVersion](ProtectSensorConfigPayload.md#latestfirmwareversion)
- [leakDetectedAt](ProtectSensorConfigPayload.md#leakdetectedat)
- [ledSettings](ProtectSensorConfigPayload.md#ledsettings)
- [lightSettings](ProtectSensorConfigPayload.md#lightsettings)
- [mac](ProtectSensorConfigPayload.md#mac)
- [marketName](ProtectSensorConfigPayload.md#marketname)
- [modelKey](ProtectSensorConfigPayload.md#modelkey)
- [motionDetectedAt](ProtectSensorConfigPayload.md#motiondetectedat)
- [motionSettings](ProtectSensorConfigPayload.md#motionsettings)
- [mountType](ProtectSensorConfigPayload.md#mounttype)
- [name](ProtectSensorConfigPayload.md#name)
- [openStatusChangedAt](ProtectSensorConfigPayload.md#openstatuschangedat)
- [state](ProtectSensorConfigPayload.md#state)
- [stats](ProtectSensorConfigPayload.md#stats)
- [tamperingDetectedAt](ProtectSensorConfigPayload.md#tamperingdetectedat)
- [temperatureSettings](ProtectSensorConfigPayload.md#temperaturesettings)
- [type](ProtectSensorConfigPayload.md#type)
- [upSince](ProtectSensorConfigPayload.md#upsince)
- [uptime](ProtectSensorConfigPayload.md#uptime)
- [wiredConnectionState](ProtectSensorConfigPayload.md#wiredconnectionstate)

## Properties

### alarmSettings

• `Optional` **alarmSettings**: `DeepPartial`\<\{ `isEnabled`: `boolean`  }\>

#### Defined in

[src/protect-types.ts:711](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L711)

___

### alarmTriggeredAt

• `Optional` **alarmTriggeredAt**: `DeepPartial`\<``null`` \| `number`\>

#### Defined in

[src/protect-types.ts:715](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L715)

___

### batteryStatus

• `Optional` **batteryStatus**: `DeepPartial`\<\{ `isLow`: `boolean` ; `percentage`: `number`  }\>

#### Defined in

[src/protect-types.ts:716](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L716)

___

### bluetoothConnectionState

• `Optional` **bluetoothConnectionState**: `DeepPartial`\<\{ `signalQuality`: `number` ; `signalStrength`: `number`  }\>

#### Defined in

[src/protect-types.ts:721](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L721)

___

### bridge

• `Optional` **bridge**: `string`

#### Defined in

[src/protect-types.ts:726](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L726)

___

### bridgeCandidates

• `Optional` **bridgeCandidates**: `never`[]

#### Defined in

[src/protect-types.ts:727](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L727)

___

### camera

• `Optional` **camera**: `string`

#### Defined in

[src/protect-types.ts:728](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L728)

___

### canAdopt

• `Optional` **canAdopt**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:729](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L729)

___

### connectedSince

• `Optional` **connectedSince**: `number`

#### Defined in

[src/protect-types.ts:730](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L730)

___

### connectionHost

• `Optional` **connectionHost**: `string`

#### Defined in

[src/protect-types.ts:731](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L731)

___

### firmwareBuild

• `Optional` **firmwareBuild**: `string`

#### Defined in

[src/protect-types.ts:732](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L732)

___

### firmwareVersion

• `Optional` **firmwareVersion**: `string`

#### Defined in

[src/protect-types.ts:733](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L733)

___

### hardwareRevision

• `Optional` **hardwareRevision**: `string`

#### Defined in

[src/protect-types.ts:734](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L734)

___

### humiditySettings

• `Optional` **humiditySettings**: `DeepPartial`\<\{ `highThreshold`: `number` ; `isEnabled`: `boolean` ; `lowThreshold`: `number` ; `margin`: `number`  }\>

#### Defined in

[src/protect-types.ts:735](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L735)

___

### id

• `Optional` **id**: `string`

#### Defined in

[src/protect-types.ts:742](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L742)

___

### isAdopted

• `Optional` **isAdopted**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:743](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L743)

___

### isAdoptedByOther

• `Optional` **isAdoptedByOther**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:744](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L744)

___

### isAdopting

• `Optional` **isAdopting**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:745](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L745)

___

### isAttemptingToConnect

• `Optional` **isAttemptingToConnect**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:746](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L746)

___

### isConnected

• `Optional` **isConnected**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:747](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L747)

___

### isMotionDetected

• `Optional` **isMotionDetected**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:748](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L748)

___

### isOpened

• `Optional` **isOpened**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:749](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L749)

___

### isProvisioned

• `Optional` **isProvisioned**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:750](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L750)

___

### isRebooting

• `Optional` **isRebooting**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:751](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L751)

___

### isSshEnabled

• `Optional` **isSshEnabled**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:752](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L752)

___

### isUpdating

• `Optional` **isUpdating**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:753](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L753)

___

### lastSeen

• `Optional` **lastSeen**: `number`

#### Defined in

[src/protect-types.ts:754](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L754)

___

### latestFirmwareVersion

• `Optional` **latestFirmwareVersion**: `string`

#### Defined in

[src/protect-types.ts:755](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L755)

___

### leakDetectedAt

• `Optional` **leakDetectedAt**: `number`

#### Defined in

[src/protect-types.ts:756](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L756)

___

### ledSettings

• `Optional` **ledSettings**: `DeepPartial`\<\{ `isEnabled`: `boolean`  }\>

#### Defined in

[src/protect-types.ts:757](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L757)

___

### lightSettings

• `Optional` **lightSettings**: `DeepPartial`\<\{ `highThreshold`: `number` ; `isEnabled`: `boolean` ; `lowThreshold`: `number` ; `margin`: `number`  }\>

#### Defined in

[src/protect-types.ts:761](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L761)

___

### mac

• `Optional` **mac**: `string`

#### Defined in

[src/protect-types.ts:768](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L768)

___

### marketName

• `Optional` **marketName**: `string`

#### Defined in

[src/protect-types.ts:769](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L769)

___

### modelKey

• `Optional` **modelKey**: `string`

#### Defined in

[src/protect-types.ts:770](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L770)

___

### motionDetectedAt

• `Optional` **motionDetectedAt**: `number`

#### Defined in

[src/protect-types.ts:771](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L771)

___

### motionSettings

• `Optional` **motionSettings**: `DeepPartial`\<\{ `isEnabled`: `boolean` ; `sensitivity`: `number`  }\>

#### Defined in

[src/protect-types.ts:772](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L772)

___

### mountType

• `Optional` **mountType**: `string`

#### Defined in

[src/protect-types.ts:777](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L777)

___

### name

• `Optional` **name**: `string`

#### Defined in

[src/protect-types.ts:778](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L778)

___

### openStatusChangedAt

• `Optional` **openStatusChangedAt**: `number`

#### Defined in

[src/protect-types.ts:779](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L779)

___

### state

• `Optional` **state**: `string`

#### Defined in

[src/protect-types.ts:780](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L780)

___

### stats

• `Optional` **stats**: `DeepPartial`\<\{ `humidity`: \{ `status`: `string` ; `value`: ``null`` \| `number`  } ; `light`: \{ `status`: `string` ; `value`: ``null`` \| `number`  } ; `temperature`: \{ `status`: `string` ; `value`: ``null`` \| `number`  }  }\>

#### Defined in

[src/protect-types.ts:781](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L781)

___

### tamperingDetectedAt

• `Optional` **tamperingDetectedAt**: `DeepPartial`\<``null`` \| `number`\>

#### Defined in

[src/protect-types.ts:799](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L799)

___

### temperatureSettings

• `Optional` **temperatureSettings**: `DeepPartial`\<\{ `highThreshold`: `number` ; `isEnabled`: `boolean` ; `lowThreshold`: `number` ; `margin`: `number`  }\>

#### Defined in

[src/protect-types.ts:800](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L800)

___

### type

• `Optional` **type**: `string`

#### Defined in

[src/protect-types.ts:807](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L807)

___

### upSince

• `Optional` **upSince**: `number`

#### Defined in

[src/protect-types.ts:808](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L808)

___

### uptime

• `Optional` **uptime**: `number`

#### Defined in

[src/protect-types.ts:809](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L809)

___

### wiredConnectionState

• `Optional` **wiredConnectionState**: `DeepPartial`\<\{ `phyRate`: `number`  }\>

#### Defined in

[src/protect-types.ts:810](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L810)
