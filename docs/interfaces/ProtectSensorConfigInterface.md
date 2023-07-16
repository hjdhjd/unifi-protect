[unifi-protect](../README.md) / [Exports](../modules.md) / ProtectSensorConfigInterface

# Interface: ProtectSensorConfigInterface

## Table of contents

### Properties

- [alarmSettings](ProtectSensorConfigInterface.md#alarmsettings)
- [alarmTriggeredAt](ProtectSensorConfigInterface.md#alarmtriggeredat)
- [batteryStatus](ProtectSensorConfigInterface.md#batterystatus)
- [bluetoothConnectionState](ProtectSensorConfigInterface.md#bluetoothconnectionstate)
- [bridge](ProtectSensorConfigInterface.md#bridge)
- [bridgeCandidates](ProtectSensorConfigInterface.md#bridgecandidates)
- [camera](ProtectSensorConfigInterface.md#camera)
- [canAdopt](ProtectSensorConfigInterface.md#canadopt)
- [connectedSince](ProtectSensorConfigInterface.md#connectedsince)
- [connectionHost](ProtectSensorConfigInterface.md#connectionhost)
- [firmwareBuild](ProtectSensorConfigInterface.md#firmwarebuild)
- [firmwareVersion](ProtectSensorConfigInterface.md#firmwareversion)
- [hardwareRevision](ProtectSensorConfigInterface.md#hardwarerevision)
- [humiditySettings](ProtectSensorConfigInterface.md#humiditysettings)
- [id](ProtectSensorConfigInterface.md#id)
- [isAdopted](ProtectSensorConfigInterface.md#isadopted)
- [isAdoptedByOther](ProtectSensorConfigInterface.md#isadoptedbyother)
- [isAdopting](ProtectSensorConfigInterface.md#isadopting)
- [isAttemptingToConnect](ProtectSensorConfigInterface.md#isattemptingtoconnect)
- [isConnected](ProtectSensorConfigInterface.md#isconnected)
- [isMotionDetected](ProtectSensorConfigInterface.md#ismotiondetected)
- [isOpened](ProtectSensorConfigInterface.md#isopened)
- [isProvisioned](ProtectSensorConfigInterface.md#isprovisioned)
- [isRebooting](ProtectSensorConfigInterface.md#isrebooting)
- [isSshEnabled](ProtectSensorConfigInterface.md#issshenabled)
- [isUpdating](ProtectSensorConfigInterface.md#isupdating)
- [lastSeen](ProtectSensorConfigInterface.md#lastseen)
- [latestFirmwareVersion](ProtectSensorConfigInterface.md#latestfirmwareversion)
- [leakDetectedAt](ProtectSensorConfigInterface.md#leakdetectedat)
- [ledSettings](ProtectSensorConfigInterface.md#ledsettings)
- [lightSettings](ProtectSensorConfigInterface.md#lightsettings)
- [mac](ProtectSensorConfigInterface.md#mac)
- [marketName](ProtectSensorConfigInterface.md#marketname)
- [modelKey](ProtectSensorConfigInterface.md#modelkey)
- [motionDetectedAt](ProtectSensorConfigInterface.md#motiondetectedat)
- [motionSettings](ProtectSensorConfigInterface.md#motionsettings)
- [mountType](ProtectSensorConfigInterface.md#mounttype)
- [name](ProtectSensorConfigInterface.md#name)
- [openStatusChangedAt](ProtectSensorConfigInterface.md#openstatuschangedat)
- [state](ProtectSensorConfigInterface.md#state)
- [stats](ProtectSensorConfigInterface.md#stats)
- [tamperingDetectedAt](ProtectSensorConfigInterface.md#tamperingdetectedat)
- [temperatureSettings](ProtectSensorConfigInterface.md#temperaturesettings)
- [type](ProtectSensorConfigInterface.md#type)
- [upSince](ProtectSensorConfigInterface.md#upsince)
- [uptime](ProtectSensorConfigInterface.md#uptime)
- [wiredConnectionState](ProtectSensorConfigInterface.md#wiredconnectionstate)

## Properties

### alarmSettings

• **alarmSettings**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `isEnabled` | `boolean` |

#### Defined in

[src/protect-types.ts:711](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L711)

___

### alarmTriggeredAt

• **alarmTriggeredAt**: ``null`` \| `number`

#### Defined in

[src/protect-types.ts:715](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L715)

___

### batteryStatus

• **batteryStatus**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `isLow` | `boolean` |
| `percentage` | `number` |

#### Defined in

[src/protect-types.ts:716](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L716)

___

### bluetoothConnectionState

• **bluetoothConnectionState**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `signalQuality` | `number` |
| `signalStrength` | `number` |

#### Defined in

[src/protect-types.ts:721](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L721)

___

### bridge

• **bridge**: `string`

#### Defined in

[src/protect-types.ts:726](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L726)

___

### bridgeCandidates

• **bridgeCandidates**: []

#### Defined in

[src/protect-types.ts:727](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L727)

___

### camera

• **camera**: `string`

#### Defined in

[src/protect-types.ts:728](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L728)

___

### canAdopt

• **canAdopt**: `boolean`

#### Defined in

[src/protect-types.ts:729](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L729)

___

### connectedSince

• **connectedSince**: `number`

#### Defined in

[src/protect-types.ts:730](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L730)

___

### connectionHost

• **connectionHost**: `string`

#### Defined in

[src/protect-types.ts:731](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L731)

___

### firmwareBuild

• **firmwareBuild**: `string`

#### Defined in

[src/protect-types.ts:732](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L732)

___

### firmwareVersion

• **firmwareVersion**: `string`

#### Defined in

[src/protect-types.ts:733](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L733)

___

### hardwareRevision

• **hardwareRevision**: `string`

#### Defined in

[src/protect-types.ts:734](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L734)

___

### humiditySettings

• **humiditySettings**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `highThreshold` | `number` |
| `isEnabled` | `boolean` |
| `lowThreshold` | `number` |
| `margin` | `number` |

#### Defined in

[src/protect-types.ts:735](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L735)

___

### id

• **id**: `string`

#### Defined in

[src/protect-types.ts:742](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L742)

___

### isAdopted

• **isAdopted**: `boolean`

#### Defined in

[src/protect-types.ts:743](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L743)

___

### isAdoptedByOther

• **isAdoptedByOther**: `boolean`

#### Defined in

[src/protect-types.ts:744](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L744)

___

### isAdopting

• **isAdopting**: `boolean`

#### Defined in

[src/protect-types.ts:745](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L745)

___

### isAttemptingToConnect

• **isAttemptingToConnect**: `boolean`

#### Defined in

[src/protect-types.ts:746](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L746)

___

### isConnected

• **isConnected**: `boolean`

#### Defined in

[src/protect-types.ts:747](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L747)

___

### isMotionDetected

• **isMotionDetected**: `boolean`

#### Defined in

[src/protect-types.ts:748](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L748)

___

### isOpened

• **isOpened**: `boolean`

#### Defined in

[src/protect-types.ts:749](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L749)

___

### isProvisioned

• **isProvisioned**: `boolean`

#### Defined in

[src/protect-types.ts:750](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L750)

___

### isRebooting

• **isRebooting**: `boolean`

#### Defined in

[src/protect-types.ts:751](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L751)

___

### isSshEnabled

• **isSshEnabled**: `boolean`

#### Defined in

[src/protect-types.ts:752](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L752)

___

### isUpdating

• **isUpdating**: `boolean`

#### Defined in

[src/protect-types.ts:753](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L753)

___

### lastSeen

• **lastSeen**: `number`

#### Defined in

[src/protect-types.ts:754](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L754)

___

### latestFirmwareVersion

• **latestFirmwareVersion**: `string`

#### Defined in

[src/protect-types.ts:755](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L755)

___

### leakDetectedAt

• **leakDetectedAt**: `number`

#### Defined in

[src/protect-types.ts:756](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L756)

___

### ledSettings

• **ledSettings**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `isEnabled` | `boolean` |

#### Defined in

[src/protect-types.ts:757](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L757)

___

### lightSettings

• **lightSettings**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `highThreshold` | `number` |
| `isEnabled` | `boolean` |
| `lowThreshold` | `number` |
| `margin` | `number` |

#### Defined in

[src/protect-types.ts:761](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L761)

___

### mac

• **mac**: `string`

#### Defined in

[src/protect-types.ts:768](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L768)

___

### marketName

• **marketName**: `string`

#### Defined in

[src/protect-types.ts:769](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L769)

___

### modelKey

• **modelKey**: `string`

#### Defined in

[src/protect-types.ts:770](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L770)

___

### motionDetectedAt

• **motionDetectedAt**: `number`

#### Defined in

[src/protect-types.ts:771](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L771)

___

### motionSettings

• **motionSettings**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `isEnabled` | `boolean` |
| `sensitivity` | `number` |

#### Defined in

[src/protect-types.ts:772](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L772)

___

### mountType

• **mountType**: `string`

#### Defined in

[src/protect-types.ts:777](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L777)

___

### name

• **name**: `string`

#### Defined in

[src/protect-types.ts:778](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L778)

___

### openStatusChangedAt

• **openStatusChangedAt**: `number`

#### Defined in

[src/protect-types.ts:779](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L779)

___

### state

• **state**: `string`

#### Defined in

[src/protect-types.ts:780](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L780)

___

### stats

• **stats**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `humidity` | { `status`: `string` ; `value`: ``null`` \| `number`  } |
| `humidity.status` | `string` |
| `humidity.value` | ``null`` \| `number` |
| `light` | { `status`: `string` ; `value`: ``null`` \| `number`  } |
| `light.status` | `string` |
| `light.value` | ``null`` \| `number` |
| `temperature` | { `status`: `string` ; `value`: ``null`` \| `number`  } |
| `temperature.status` | `string` |
| `temperature.value` | ``null`` \| `number` |

#### Defined in

[src/protect-types.ts:781](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L781)

___

### tamperingDetectedAt

• **tamperingDetectedAt**: ``null`` \| `number`

#### Defined in

[src/protect-types.ts:799](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L799)

___

### temperatureSettings

• **temperatureSettings**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `highThreshold` | `number` |
| `isEnabled` | `boolean` |
| `lowThreshold` | `number` |
| `margin` | `number` |

#### Defined in

[src/protect-types.ts:800](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L800)

___

### type

• **type**: `string`

#### Defined in

[src/protect-types.ts:807](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L807)

___

### upSince

• **upSince**: `number`

#### Defined in

[src/protect-types.ts:808](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L808)

___

### uptime

• **uptime**: `number`

#### Defined in

[src/protect-types.ts:809](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L809)

___

### wiredConnectionState

• **wiredConnectionState**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `phyRate` | `number` |

#### Defined in

[src/protect-types.ts:810](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L810)
