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

[src/protect-types.ts:713](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L713)

___

### alarmTriggeredAt

• `Readonly` **alarmTriggeredAt**: ``null`` \| `number`

#### Defined in

[src/protect-types.ts:717](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L717)

___

### batteryStatus

• `Readonly` **batteryStatus**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `isLow` | `boolean` |
| `percentage` | `number` |

#### Defined in

[src/protect-types.ts:718](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L718)

___

### bluetoothConnectionState

• `Readonly` **bluetoothConnectionState**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `signalQuality` | `number` |
| `signalStrength` | `number` |

#### Defined in

[src/protect-types.ts:723](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L723)

___

### bridge

• `Readonly` **bridge**: `string`

#### Defined in

[src/protect-types.ts:728](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L728)

___

### bridgeCandidates

• `Readonly` **bridgeCandidates**: []

#### Defined in

[src/protect-types.ts:729](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L729)

___

### camera

• `Readonly` **camera**: `string`

#### Defined in

[src/protect-types.ts:730](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L730)

___

### canAdopt

• `Readonly` **canAdopt**: `boolean`

#### Defined in

[src/protect-types.ts:731](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L731)

___

### connectedSince

• `Readonly` **connectedSince**: `number`

#### Defined in

[src/protect-types.ts:732](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L732)

___

### connectionHost

• `Readonly` **connectionHost**: `string`

#### Defined in

[src/protect-types.ts:733](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L733)

___

### firmwareBuild

• `Readonly` **firmwareBuild**: `string`

#### Defined in

[src/protect-types.ts:734](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L734)

___

### firmwareVersion

• `Readonly` **firmwareVersion**: `string`

#### Defined in

[src/protect-types.ts:735](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L735)

___

### hardwareRevision

• `Readonly` **hardwareRevision**: `string`

#### Defined in

[src/protect-types.ts:736](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L736)

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

[src/protect-types.ts:737](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L737)

___

### id

• `Readonly` **id**: `string`

#### Defined in

[src/protect-types.ts:744](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L744)

___

### isAdopted

• `Readonly` **isAdopted**: `boolean`

#### Defined in

[src/protect-types.ts:745](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L745)

___

### isAdoptedByOther

• `Readonly` **isAdoptedByOther**: `boolean`

#### Defined in

[src/protect-types.ts:746](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L746)

___

### isAdopting

• `Readonly` **isAdopting**: `boolean`

#### Defined in

[src/protect-types.ts:747](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L747)

___

### isAttemptingToConnect

• `Readonly` **isAttemptingToConnect**: `boolean`

#### Defined in

[src/protect-types.ts:748](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L748)

___

### isConnected

• `Readonly` **isConnected**: `boolean`

#### Defined in

[src/protect-types.ts:749](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L749)

___

### isMotionDetected

• `Readonly` **isMotionDetected**: `boolean`

#### Defined in

[src/protect-types.ts:750](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L750)

___

### isOpened

• `Readonly` **isOpened**: `boolean`

#### Defined in

[src/protect-types.ts:751](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L751)

___

### isProvisioned

• `Readonly` **isProvisioned**: `boolean`

#### Defined in

[src/protect-types.ts:752](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L752)

___

### isRebooting

• `Readonly` **isRebooting**: `boolean`

#### Defined in

[src/protect-types.ts:753](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L753)

___

### isSshEnabled

• `Readonly` **isSshEnabled**: `boolean`

#### Defined in

[src/protect-types.ts:754](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L754)

___

### isUpdating

• `Readonly` **isUpdating**: `boolean`

#### Defined in

[src/protect-types.ts:755](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L755)

___

### lastSeen

• `Readonly` **lastSeen**: `number`

#### Defined in

[src/protect-types.ts:756](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L756)

___

### latestFirmwareVersion

• `Readonly` **latestFirmwareVersion**: `string`

#### Defined in

[src/protect-types.ts:757](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L757)

___

### leakDetectedAt

• `Readonly` **leakDetectedAt**: `number`

#### Defined in

[src/protect-types.ts:758](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L758)

___

### ledSettings

• `Readonly` **ledSettings**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `isEnabled` | `boolean` |

#### Defined in

[src/protect-types.ts:759](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L759)

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

[src/protect-types.ts:763](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L763)

___

### mac

• `Readonly` **mac**: `string`

#### Defined in

[src/protect-types.ts:770](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L770)

___

### marketName

• `Readonly` **marketName**: `string`

#### Defined in

[src/protect-types.ts:771](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L771)

___

### modelKey

• `Readonly` **modelKey**: `string`

#### Defined in

[src/protect-types.ts:772](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L772)

___

### motionDetectedAt

• `Readonly` **motionDetectedAt**: `number`

#### Defined in

[src/protect-types.ts:773](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L773)

___

### motionSettings

• `Readonly` **motionSettings**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `isEnabled` | `boolean` |
| `sensitivity` | `number` |

#### Defined in

[src/protect-types.ts:774](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L774)

___

### mountType

• `Readonly` **mountType**: `string`

#### Defined in

[src/protect-types.ts:779](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L779)

___

### name

• `Readonly` **name**: `string`

#### Defined in

[src/protect-types.ts:780](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L780)

___

### openStatusChangedAt

• `Readonly` **openStatusChangedAt**: `number`

#### Defined in

[src/protect-types.ts:781](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L781)

___

### state

• `Readonly` **state**: `string`

#### Defined in

[src/protect-types.ts:782](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L782)

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

[src/protect-types.ts:783](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L783)

___

### tamperingDetectedAt

• `Readonly` **tamperingDetectedAt**: ``null`` \| `number`

#### Defined in

[src/protect-types.ts:801](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L801)

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

[src/protect-types.ts:802](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L802)

___

### type

• `Readonly` **type**: `string`

#### Defined in

[src/protect-types.ts:809](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L809)

___

### upSince

• `Readonly` **upSince**: `number`

#### Defined in

[src/protect-types.ts:810](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L810)

___

### uptime

• `Readonly` **uptime**: `number`

#### Defined in

[src/protect-types.ts:811](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L811)

___

### wiredConnectionState

• `Readonly` **wiredConnectionState**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `phyRate` | `number` |

#### Defined in

[src/protect-types.ts:812](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L812)
