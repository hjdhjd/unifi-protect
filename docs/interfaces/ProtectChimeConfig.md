[unifi-protect](../README.md) / [Exports](../modules.md) / ProtectChimeConfig

# Interface: ProtectChimeConfig

## Table of contents

### Properties

- [apMac](ProtectChimeConfig.md#apmac)
- [apMgmtIp](ProtectChimeConfig.md#apmgmtip)
- [apRssi](ProtectChimeConfig.md#aprssi)
- [cameraIds](ProtectChimeConfig.md#cameraids)
- [canAdopt](ProtectChimeConfig.md#canadopt)
- [connectedSince](ProtectChimeConfig.md#connectedsince)
- [connectionHost](ProtectChimeConfig.md#connectionhost)
- [elementInfo](ProtectChimeConfig.md#elementinfo)
- [featureFlags](ProtectChimeConfig.md#featureflags)
- [firmwareBuild](ProtectChimeConfig.md#firmwarebuild)
- [firmwareVersion](ProtectChimeConfig.md#firmwareversion)
- [fwUpdateState](ProtectChimeConfig.md#fwupdatestate)
- [hardwareRevision](ProtectChimeConfig.md#hardwarerevision)
- [host](ProtectChimeConfig.md#host)
- [id](ProtectChimeConfig.md#id)
- [isAdopted](ProtectChimeConfig.md#isadopted)
- [isAdoptedByOther](ProtectChimeConfig.md#isadoptedbyother)
- [isAdopting](ProtectChimeConfig.md#isadopting)
- [isAttemptingToConnect](ProtectChimeConfig.md#isattemptingtoconnect)
- [isConnected](ProtectChimeConfig.md#isconnected)
- [isDownloadingFW](ProtectChimeConfig.md#isdownloadingfw)
- [isProbingForWifi](ProtectChimeConfig.md#isprobingforwifi)
- [isProvisioned](ProtectChimeConfig.md#isprovisioned)
- [isRebooting](ProtectChimeConfig.md#isrebooting)
- [isSshEnabled](ProtectChimeConfig.md#issshenabled)
- [isUpdating](ProtectChimeConfig.md#isupdating)
- [isWirelessUplinkEnabled](ProtectChimeConfig.md#iswirelessuplinkenabled)
- [lastRing](ProtectChimeConfig.md#lastring)
- [lastSeen](ProtectChimeConfig.md#lastseen)
- [latestFirmwareVersion](ProtectChimeConfig.md#latestfirmwareversion)
- [mac](ProtectChimeConfig.md#mac)
- [marketName](ProtectChimeConfig.md#marketname)
- [modelKey](ProtectChimeConfig.md#modelkey)
- [name](ProtectChimeConfig.md#name)
- [state](ProtectChimeConfig.md#state)
- [type](ProtectChimeConfig.md#type)
- [upSince](ProtectChimeConfig.md#upsince)
- [uptime](ProtectChimeConfig.md#uptime)
- [volume](ProtectChimeConfig.md#volume)
- [wifiConnectionState](ProtectChimeConfig.md#wificonnectionstate)
- [wiredConnectionState](ProtectChimeConfig.md#wiredconnectionstate)

## Properties

### apMac

• `Readonly` **apMac**: `string`

#### Defined in

[src/protect-types.ts:467](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L467)

___

### apMgmtIp

• `Readonly` **apMgmtIp**: `string`

#### Defined in

[src/protect-types.ts:468](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L468)

___

### apRssi

• `Readonly` **apRssi**: `string`

#### Defined in

[src/protect-types.ts:469](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L469)

___

### cameraIds

• `Readonly` **cameraIds**: `string`[]

#### Defined in

[src/protect-types.ts:470](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L470)

___

### canAdopt

• `Readonly` **canAdopt**: `boolean`

#### Defined in

[src/protect-types.ts:471](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L471)

___

### connectedSince

• `Readonly` **connectedSince**: `number`

#### Defined in

[src/protect-types.ts:472](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L472)

___

### connectionHost

• `Readonly` **connectionHost**: `string`

#### Defined in

[src/protect-types.ts:473](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L473)

___

### elementInfo

• `Readonly` **elementInfo**: `string`

#### Defined in

[src/protect-types.ts:474](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L474)

___

### featureFlags

• `Readonly` **featureFlags**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `hasWifi` | `boolean` |

#### Defined in

[src/protect-types.ts:475](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L475)

___

### firmwareBuild

• `Readonly` **firmwareBuild**: `string`

#### Defined in

[src/protect-types.ts:478](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L478)

___

### firmwareVersion

• `Readonly` **firmwareVersion**: `string`

#### Defined in

[src/protect-types.ts:479](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L479)

___

### fwUpdateState

• `Readonly` **fwUpdateState**: `string`

#### Defined in

[src/protect-types.ts:480](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L480)

___

### hardwareRevision

• `Readonly` **hardwareRevision**: `string`

#### Defined in

[src/protect-types.ts:481](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L481)

___

### host

• `Readonly` **host**: `string`

#### Defined in

[src/protect-types.ts:482](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L482)

___

### id

• `Readonly` **id**: `string`

#### Defined in

[src/protect-types.ts:483](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L483)

___

### isAdopted

• `Readonly` **isAdopted**: `boolean`

#### Defined in

[src/protect-types.ts:484](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L484)

___

### isAdoptedByOther

• `Readonly` **isAdoptedByOther**: `boolean`

#### Defined in

[src/protect-types.ts:485](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L485)

___

### isAdopting

• `Readonly` **isAdopting**: `boolean`

#### Defined in

[src/protect-types.ts:486](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L486)

___

### isAttemptingToConnect

• `Readonly` **isAttemptingToConnect**: `boolean`

#### Defined in

[src/protect-types.ts:487](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L487)

___

### isConnected

• `Readonly` **isConnected**: `boolean`

#### Defined in

[src/protect-types.ts:488](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L488)

___

### isDownloadingFW

• `Readonly` **isDownloadingFW**: `boolean`

#### Defined in

[src/protect-types.ts:489](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L489)

___

### isProbingForWifi

• `Readonly` **isProbingForWifi**: `boolean`

#### Defined in

[src/protect-types.ts:490](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L490)

___

### isProvisioned

• `Readonly` **isProvisioned**: `boolean`

#### Defined in

[src/protect-types.ts:491](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L491)

___

### isRebooting

• `Readonly` **isRebooting**: `boolean`

#### Defined in

[src/protect-types.ts:492](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L492)

___

### isSshEnabled

• `Readonly` **isSshEnabled**: `boolean`

#### Defined in

[src/protect-types.ts:493](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L493)

___

### isUpdating

• `Readonly` **isUpdating**: `boolean`

#### Defined in

[src/protect-types.ts:494](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L494)

___

### isWirelessUplinkEnabled

• `Readonly` **isWirelessUplinkEnabled**: `boolean`

#### Defined in

[src/protect-types.ts:495](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L495)

___

### lastRing

• `Readonly` **lastRing**: `number`

#### Defined in

[src/protect-types.ts:496](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L496)

___

### lastSeen

• `Readonly` **lastSeen**: `number`

#### Defined in

[src/protect-types.ts:497](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L497)

___

### latestFirmwareVersion

• `Readonly` **latestFirmwareVersion**: `string`

#### Defined in

[src/protect-types.ts:498](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L498)

___

### mac

• `Readonly` **mac**: `string`

#### Defined in

[src/protect-types.ts:499](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L499)

___

### marketName

• `Readonly` **marketName**: `string`

#### Defined in

[src/protect-types.ts:500](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L500)

___

### modelKey

• `Readonly` **modelKey**: `string`

#### Defined in

[src/protect-types.ts:501](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L501)

___

### name

• `Readonly` **name**: `string`

#### Defined in

[src/protect-types.ts:502](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L502)

___

### state

• `Readonly` **state**: `string`

#### Defined in

[src/protect-types.ts:503](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L503)

___

### type

• `Readonly` **type**: `string`

#### Defined in

[src/protect-types.ts:504](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L504)

___

### upSince

• `Readonly` **upSince**: `number`

#### Defined in

[src/protect-types.ts:505](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L505)

___

### uptime

• `Readonly` **uptime**: `number`

#### Defined in

[src/protect-types.ts:506](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L506)

___

### volume

• `Readonly` **volume**: `number`

#### Defined in

[src/protect-types.ts:507](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L507)

___

### wifiConnectionState

• `Readonly` **wifiConnectionState**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `apName` | ``null`` \| `string` |
| `bssid` | ``null`` \| `string` |
| `channel` | ``null`` \| `string` |
| `connectivity` | `string` |
| `experience` | ``null`` |
| `frequency` | ``null`` |
| `phyRate` | `number` |
| `signalQuality` | `number` |
| `signalStrength` | `number` |
| `ssid` | ``null`` \| `string` |
| `txRate` | ``null`` |

#### Defined in

[src/protect-types.ts:508](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L508)

___

### wiredConnectionState

• `Readonly` **wiredConnectionState**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `phyRate` | `number` |

#### Defined in

[src/protect-types.ts:521](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L521)
