[unifi-protect](../README.md) / [Exports](../modules.md) / ProtectSensorConfig

# Interface: ProtectSensorConfig

## Table of contents

### Properties

- [alarmSettings](ProtectSensorConfig.md#alarmsettings)
- [alarmTriggeredAt](ProtectSensorConfig.md#alarmtriggeredat)
- [batteryStatus](ProtectSensorConfig.md#batterystatus)
- [bluetoothConnectionState](ProtectSensorConfig.md#bluetoothconnectionstate)
- [bridge](ProtectSensorConfig.md#bridge)
- [bridgeCandidates](ProtectSensorConfig.md#bridgecandidates)
- [camera](ProtectSensorConfig.md#camera)
- [canAdopt](ProtectSensorConfig.md#canadopt)
- [connectedSince](ProtectSensorConfig.md#connectedsince)
- [connectionHost](ProtectSensorConfig.md#connectionhost)
- [firmwareBuild](ProtectSensorConfig.md#firmwarebuild)
- [firmwareVersion](ProtectSensorConfig.md#firmwareversion)
- [hardwareRevision](ProtectSensorConfig.md#hardwarerevision)
- [humiditySettings](ProtectSensorConfig.md#humiditysettings)
- [id](ProtectSensorConfig.md#id)
- [isAdopted](ProtectSensorConfig.md#isadopted)
- [isAdoptedByOther](ProtectSensorConfig.md#isadoptedbyother)
- [isAdopting](ProtectSensorConfig.md#isadopting)
- [isAttemptingToConnect](ProtectSensorConfig.md#isattemptingtoconnect)
- [isConnected](ProtectSensorConfig.md#isconnected)
- [isMotionDetected](ProtectSensorConfig.md#ismotiondetected)
- [isOpened](ProtectSensorConfig.md#isopened)
- [isProvisioned](ProtectSensorConfig.md#isprovisioned)
- [isRebooting](ProtectSensorConfig.md#isrebooting)
- [isSshEnabled](ProtectSensorConfig.md#issshenabled)
- [isUpdating](ProtectSensorConfig.md#isupdating)
- [lastSeen](ProtectSensorConfig.md#lastseen)
- [latestFirmwareVersion](ProtectSensorConfig.md#latestfirmwareversion)
- [leakDetectedAt](ProtectSensorConfig.md#leakdetectedat)
- [ledSettings](ProtectSensorConfig.md#ledsettings)
- [lightSettings](ProtectSensorConfig.md#lightsettings)
- [mac](ProtectSensorConfig.md#mac)
- [marketName](ProtectSensorConfig.md#marketname)
- [modelKey](ProtectSensorConfig.md#modelkey)
- [motionDetectedAt](ProtectSensorConfig.md#motiondetectedat)
- [motionSettings](ProtectSensorConfig.md#motionsettings)
- [mountType](ProtectSensorConfig.md#mounttype)
- [name](ProtectSensorConfig.md#name)
- [openStatusChangedAt](ProtectSensorConfig.md#openstatuschangedat)
- [state](ProtectSensorConfig.md#state)
- [stats](ProtectSensorConfig.md#stats)
- [tamperingDetectedAt](ProtectSensorConfig.md#tamperingdetectedat)
- [temperatureSettings](ProtectSensorConfig.md#temperaturesettings)
- [type](ProtectSensorConfig.md#type)
- [upSince](ProtectSensorConfig.md#upsince)
- [uptime](ProtectSensorConfig.md#uptime)
- [wiredConnectionState](ProtectSensorConfig.md#wiredconnectionstate)

## Properties

### alarmSettings

• `Readonly` **alarmSettings**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `isEnabled` | `boolean` |

#### Defined in

[src/protect-types.ts:711](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L711)

___

### alarmTriggeredAt

• `Readonly` **alarmTriggeredAt**: ``null`` \| `number`

#### Defined in

[src/protect-types.ts:715](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L715)

___

### batteryStatus

• `Readonly` **batteryStatus**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `isLow` | `boolean` |
| `percentage` | `number` |

#### Defined in

[src/protect-types.ts:716](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L716)

___

### bluetoothConnectionState

• `Readonly` **bluetoothConnectionState**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `signalQuality` | `number` |
| `signalStrength` | `number` |

#### Defined in

[src/protect-types.ts:721](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L721)

___

### bridge

• `Readonly` **bridge**: `string`

#### Defined in

[src/protect-types.ts:726](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L726)

___

### bridgeCandidates

• `Readonly` **bridgeCandidates**: []

#### Defined in

[src/protect-types.ts:727](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L727)

___

### camera

• `Readonly` **camera**: `string`

#### Defined in

[src/protect-types.ts:728](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L728)

___

### canAdopt

• `Readonly` **canAdopt**: `boolean`

#### Defined in

[src/protect-types.ts:729](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L729)

___

### connectedSince

• `Readonly` **connectedSince**: `number`

#### Defined in

[src/protect-types.ts:730](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L730)

___

### connectionHost

• `Readonly` **connectionHost**: `string`

#### Defined in

[src/protect-types.ts:731](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L731)

___

### firmwareBuild

• `Readonly` **firmwareBuild**: `string`

#### Defined in

[src/protect-types.ts:732](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L732)

___

### firmwareVersion

• `Readonly` **firmwareVersion**: `string`

#### Defined in

[src/protect-types.ts:733](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L733)

___

### hardwareRevision

• `Readonly` **hardwareRevision**: `string`

#### Defined in

[src/protect-types.ts:734](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L734)

___

### humiditySettings

• `Readonly` **humiditySettings**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `highThreshold` | `number` |
| `isEnabled` | `boolean` |
| `lowThreshold` | `number` |
| `margin` | `number` |

#### Defined in

[src/protect-types.ts:735](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L735)

___

### id

• `Readonly` **id**: `string`

#### Defined in

[src/protect-types.ts:742](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L742)

___

### isAdopted

• `Readonly` **isAdopted**: `boolean`

#### Defined in

[src/protect-types.ts:743](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L743)

___

### isAdoptedByOther

• `Readonly` **isAdoptedByOther**: `boolean`

#### Defined in

[src/protect-types.ts:744](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L744)

___

### isAdopting

• `Readonly` **isAdopting**: `boolean`

#### Defined in

[src/protect-types.ts:745](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L745)

___

### isAttemptingToConnect

• `Readonly` **isAttemptingToConnect**: `boolean`

#### Defined in

[src/protect-types.ts:746](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L746)

___

### isConnected

• `Readonly` **isConnected**: `boolean`

#### Defined in

[src/protect-types.ts:747](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L747)

___

### isMotionDetected

• `Readonly` **isMotionDetected**: `boolean`

#### Defined in

[src/protect-types.ts:748](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L748)

___

### isOpened

• `Readonly` **isOpened**: `boolean`

#### Defined in

[src/protect-types.ts:749](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L749)

___

### isProvisioned

• `Readonly` **isProvisioned**: `boolean`

#### Defined in

[src/protect-types.ts:750](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L750)

___

### isRebooting

• `Readonly` **isRebooting**: `boolean`

#### Defined in

[src/protect-types.ts:751](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L751)

___

### isSshEnabled

• `Readonly` **isSshEnabled**: `boolean`

#### Defined in

[src/protect-types.ts:752](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L752)

___

### isUpdating

• `Readonly` **isUpdating**: `boolean`

#### Defined in

[src/protect-types.ts:753](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L753)

___

### lastSeen

• `Readonly` **lastSeen**: `number`

#### Defined in

[src/protect-types.ts:754](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L754)

___

### latestFirmwareVersion

• `Readonly` **latestFirmwareVersion**: `string`

#### Defined in

[src/protect-types.ts:755](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L755)

___

### leakDetectedAt

• `Readonly` **leakDetectedAt**: `number`

#### Defined in

[src/protect-types.ts:756](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L756)

___

### ledSettings

• `Readonly` **ledSettings**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `isEnabled` | `boolean` |

#### Defined in

[src/protect-types.ts:757](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L757)

___

### lightSettings

• `Readonly` **lightSettings**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `highThreshold` | `number` |
| `isEnabled` | `boolean` |
| `lowThreshold` | `number` |
| `margin` | `number` |

#### Defined in

[src/protect-types.ts:761](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L761)

___

### mac

• `Readonly` **mac**: `string`

#### Defined in

[src/protect-types.ts:768](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L768)

___

### marketName

• `Readonly` **marketName**: `string`

#### Defined in

[src/protect-types.ts:769](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L769)

___

### modelKey

• `Readonly` **modelKey**: `string`

#### Defined in

[src/protect-types.ts:770](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L770)

___

### motionDetectedAt

• `Readonly` **motionDetectedAt**: `number`

#### Defined in

[src/protect-types.ts:771](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L771)

___

### motionSettings

• `Readonly` **motionSettings**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `isEnabled` | `boolean` |
| `sensitivity` | `number` |

#### Defined in

[src/protect-types.ts:772](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L772)

___

### mountType

• `Readonly` **mountType**: `string`

#### Defined in

[src/protect-types.ts:777](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L777)

___

### name

• `Readonly` **name**: `string`

#### Defined in

[src/protect-types.ts:778](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L778)

___

### openStatusChangedAt

• `Readonly` **openStatusChangedAt**: `number`

#### Defined in

[src/protect-types.ts:779](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L779)

___

### state

• `Readonly` **state**: `string`

#### Defined in

[src/protect-types.ts:780](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L780)

___

### stats

• `Readonly` **stats**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `humidity` | \{ `status`: `string` ; `value`: ``null`` \| `number`  } |
| `humidity.status` | `string` |
| `humidity.value` | ``null`` \| `number` |
| `light` | \{ `status`: `string` ; `value`: ``null`` \| `number`  } |
| `light.status` | `string` |
| `light.value` | ``null`` \| `number` |
| `temperature` | \{ `status`: `string` ; `value`: ``null`` \| `number`  } |
| `temperature.status` | `string` |
| `temperature.value` | ``null`` \| `number` |

#### Defined in

[src/protect-types.ts:781](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L781)

___

### tamperingDetectedAt

• `Readonly` **tamperingDetectedAt**: ``null`` \| `number`

#### Defined in

[src/protect-types.ts:799](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L799)

___

### temperatureSettings

• `Readonly` **temperatureSettings**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `highThreshold` | `number` |
| `isEnabled` | `boolean` |
| `lowThreshold` | `number` |
| `margin` | `number` |

#### Defined in

[src/protect-types.ts:800](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L800)

___

### type

• `Readonly` **type**: `string`

#### Defined in

[src/protect-types.ts:807](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L807)

___

### upSince

• `Readonly` **upSince**: `number`

#### Defined in

[src/protect-types.ts:808](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L808)

___

### uptime

• `Readonly` **uptime**: `number`

#### Defined in

[src/protect-types.ts:809](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L809)

___

### wiredConnectionState

• `Readonly` **wiredConnectionState**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `phyRate` | `number` |

#### Defined in

[src/protect-types.ts:810](https://github.com/hjdhjd/unifi-protect/blob/f89bcca/src/protect-types.ts#L810)
