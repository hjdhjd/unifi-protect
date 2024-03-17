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

[src/protect-types.ts:713](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L713)

___

### alarmTriggeredAt

• `Optional` **alarmTriggeredAt**: `DeepPartial`\<``null`` \| `number`\>

#### Defined in

[src/protect-types.ts:717](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L717)

___

### batteryStatus

• `Optional` **batteryStatus**: `DeepPartial`\<\{ `isLow`: `boolean` ; `percentage`: `number`  }\>

#### Defined in

[src/protect-types.ts:718](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L718)

___

### bluetoothConnectionState

• `Optional` **bluetoothConnectionState**: `DeepPartial`\<\{ `signalQuality`: `number` ; `signalStrength`: `number`  }\>

#### Defined in

[src/protect-types.ts:723](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L723)

___

### bridge

• `Optional` **bridge**: `string`

#### Defined in

[src/protect-types.ts:728](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L728)

___

### bridgeCandidates

• `Optional` **bridgeCandidates**: `never`[]

#### Defined in

[src/protect-types.ts:729](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L729)

___

### camera

• `Optional` **camera**: `string`

#### Defined in

[src/protect-types.ts:730](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L730)

___

### canAdopt

• `Optional` **canAdopt**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:731](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L731)

___

### connectedSince

• `Optional` **connectedSince**: `number`

#### Defined in

[src/protect-types.ts:732](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L732)

___

### connectionHost

• `Optional` **connectionHost**: `string`

#### Defined in

[src/protect-types.ts:733](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L733)

___

### firmwareBuild

• `Optional` **firmwareBuild**: `string`

#### Defined in

[src/protect-types.ts:734](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L734)

___

### firmwareVersion

• `Optional` **firmwareVersion**: `string`

#### Defined in

[src/protect-types.ts:735](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L735)

___

### hardwareRevision

• `Optional` **hardwareRevision**: `string`

#### Defined in

[src/protect-types.ts:736](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L736)

___

### humiditySettings

• `Optional` **humiditySettings**: `DeepPartial`\<\{ `highThreshold`: `number` ; `isEnabled`: `boolean` ; `lowThreshold`: `number` ; `margin`: `number`  }\>

#### Defined in

[src/protect-types.ts:737](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L737)

___

### id

• `Optional` **id**: `string`

#### Defined in

[src/protect-types.ts:744](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L744)

___

### isAdopted

• `Optional` **isAdopted**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:745](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L745)

___

### isAdoptedByOther

• `Optional` **isAdoptedByOther**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:746](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L746)

___

### isAdopting

• `Optional` **isAdopting**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:747](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L747)

___

### isAttemptingToConnect

• `Optional` **isAttemptingToConnect**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:748](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L748)

___

### isConnected

• `Optional` **isConnected**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:749](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L749)

___

### isMotionDetected

• `Optional` **isMotionDetected**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:750](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L750)

___

### isOpened

• `Optional` **isOpened**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:751](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L751)

___

### isProvisioned

• `Optional` **isProvisioned**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:752](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L752)

___

### isRebooting

• `Optional` **isRebooting**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:753](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L753)

___

### isSshEnabled

• `Optional` **isSshEnabled**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:754](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L754)

___

### isUpdating

• `Optional` **isUpdating**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:755](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L755)

___

### lastSeen

• `Optional` **lastSeen**: `number`

#### Defined in

[src/protect-types.ts:756](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L756)

___

### latestFirmwareVersion

• `Optional` **latestFirmwareVersion**: `string`

#### Defined in

[src/protect-types.ts:757](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L757)

___

### leakDetectedAt

• `Optional` **leakDetectedAt**: `number`

#### Defined in

[src/protect-types.ts:758](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L758)

___

### ledSettings

• `Optional` **ledSettings**: `DeepPartial`\<\{ `isEnabled`: `boolean`  }\>

#### Defined in

[src/protect-types.ts:759](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L759)

___

### lightSettings

• `Optional` **lightSettings**: `DeepPartial`\<\{ `highThreshold`: `number` ; `isEnabled`: `boolean` ; `lowThreshold`: `number` ; `margin`: `number`  }\>

#### Defined in

[src/protect-types.ts:763](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L763)

___

### mac

• `Optional` **mac**: `string`

#### Defined in

[src/protect-types.ts:770](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L770)

___

### marketName

• `Optional` **marketName**: `string`

#### Defined in

[src/protect-types.ts:771](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L771)

___

### modelKey

• `Optional` **modelKey**: `string`

#### Defined in

[src/protect-types.ts:772](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L772)

___

### motionDetectedAt

• `Optional` **motionDetectedAt**: `number`

#### Defined in

[src/protect-types.ts:773](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L773)

___

### motionSettings

• `Optional` **motionSettings**: `DeepPartial`\<\{ `isEnabled`: `boolean` ; `sensitivity`: `number`  }\>

#### Defined in

[src/protect-types.ts:774](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L774)

___

### mountType

• `Optional` **mountType**: `string`

#### Defined in

[src/protect-types.ts:779](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L779)

___

### name

• `Optional` **name**: `string`

#### Defined in

[src/protect-types.ts:780](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L780)

___

### openStatusChangedAt

• `Optional` **openStatusChangedAt**: `number`

#### Defined in

[src/protect-types.ts:781](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L781)

___

### state

• `Optional` **state**: `string`

#### Defined in

[src/protect-types.ts:782](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L782)

___

### stats

• `Optional` **stats**: `DeepPartial`\<\{ `humidity`: \{ `status`: `string` ; `value`: ``null`` \| `number`  } ; `light`: \{ `status`: `string` ; `value`: ``null`` \| `number`  } ; `temperature`: \{ `status`: `string` ; `value`: ``null`` \| `number`  }  }\>

#### Defined in

[src/protect-types.ts:783](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L783)

___

### tamperingDetectedAt

• `Optional` **tamperingDetectedAt**: `DeepPartial`\<``null`` \| `number`\>

#### Defined in

[src/protect-types.ts:801](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L801)

___

### temperatureSettings

• `Optional` **temperatureSettings**: `DeepPartial`\<\{ `highThreshold`: `number` ; `isEnabled`: `boolean` ; `lowThreshold`: `number` ; `margin`: `number`  }\>

#### Defined in

[src/protect-types.ts:802](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L802)

___

### type

• `Optional` **type**: `string`

#### Defined in

[src/protect-types.ts:809](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L809)

___

### upSince

• `Optional` **upSince**: `number`

#### Defined in

[src/protect-types.ts:810](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L810)

___

### uptime

• `Optional` **uptime**: `number`

#### Defined in

[src/protect-types.ts:811](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L811)

___

### wiredConnectionState

• `Optional` **wiredConnectionState**: `DeepPartial`\<\{ `phyRate`: `number`  }\>

#### Defined in

[src/protect-types.ts:812](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L812)
