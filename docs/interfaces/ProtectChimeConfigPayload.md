[unifi-protect](../README.md) / [Exports](../modules.md) / ProtectChimeConfigPayload

# Interface: ProtectChimeConfigPayload

## Table of contents

### Properties

- [apMac](ProtectChimeConfigPayload.md#apmac)
- [apMgmtIp](ProtectChimeConfigPayload.md#apmgmtip)
- [apRssi](ProtectChimeConfigPayload.md#aprssi)
- [cameraIds](ProtectChimeConfigPayload.md#cameraids)
- [canAdopt](ProtectChimeConfigPayload.md#canadopt)
- [connectedSince](ProtectChimeConfigPayload.md#connectedsince)
- [connectionHost](ProtectChimeConfigPayload.md#connectionhost)
- [elementInfo](ProtectChimeConfigPayload.md#elementinfo)
- [featureFlags](ProtectChimeConfigPayload.md#featureflags)
- [firmwareBuild](ProtectChimeConfigPayload.md#firmwarebuild)
- [firmwareVersion](ProtectChimeConfigPayload.md#firmwareversion)
- [fwUpdateState](ProtectChimeConfigPayload.md#fwupdatestate)
- [hardwareRevision](ProtectChimeConfigPayload.md#hardwarerevision)
- [host](ProtectChimeConfigPayload.md#host)
- [id](ProtectChimeConfigPayload.md#id)
- [isAdopted](ProtectChimeConfigPayload.md#isadopted)
- [isAdoptedByOther](ProtectChimeConfigPayload.md#isadoptedbyother)
- [isAdopting](ProtectChimeConfigPayload.md#isadopting)
- [isAttemptingToConnect](ProtectChimeConfigPayload.md#isattemptingtoconnect)
- [isConnected](ProtectChimeConfigPayload.md#isconnected)
- [isDownloadingFW](ProtectChimeConfigPayload.md#isdownloadingfw)
- [isProbingForWifi](ProtectChimeConfigPayload.md#isprobingforwifi)
- [isProvisioned](ProtectChimeConfigPayload.md#isprovisioned)
- [isRebooting](ProtectChimeConfigPayload.md#isrebooting)
- [isSshEnabled](ProtectChimeConfigPayload.md#issshenabled)
- [isUpdating](ProtectChimeConfigPayload.md#isupdating)
- [isWirelessUplinkEnabled](ProtectChimeConfigPayload.md#iswirelessuplinkenabled)
- [lastRing](ProtectChimeConfigPayload.md#lastring)
- [lastSeen](ProtectChimeConfigPayload.md#lastseen)
- [latestFirmwareVersion](ProtectChimeConfigPayload.md#latestfirmwareversion)
- [mac](ProtectChimeConfigPayload.md#mac)
- [marketName](ProtectChimeConfigPayload.md#marketname)
- [modelKey](ProtectChimeConfigPayload.md#modelkey)
- [name](ProtectChimeConfigPayload.md#name)
- [state](ProtectChimeConfigPayload.md#state)
- [type](ProtectChimeConfigPayload.md#type)
- [upSince](ProtectChimeConfigPayload.md#upsince)
- [uptime](ProtectChimeConfigPayload.md#uptime)
- [volume](ProtectChimeConfigPayload.md#volume)
- [wifiConnectionState](ProtectChimeConfigPayload.md#wificonnectionstate)
- [wiredConnectionState](ProtectChimeConfigPayload.md#wiredconnectionstate)

## Properties

### apMac

• `Optional` **apMac**: `string`

#### Defined in

[src/protect-types.ts:469](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L469)

___

### apMgmtIp

• `Optional` **apMgmtIp**: `string`

#### Defined in

[src/protect-types.ts:470](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L470)

___

### apRssi

• `Optional` **apRssi**: `string`

#### Defined in

[src/protect-types.ts:471](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L471)

___

### cameraIds

• `Optional` **cameraIds**: `string`[]

#### Defined in

[src/protect-types.ts:472](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L472)

___

### canAdopt

• `Optional` **canAdopt**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:473](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L473)

___

### connectedSince

• `Optional` **connectedSince**: `number`

#### Defined in

[src/protect-types.ts:474](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L474)

___

### connectionHost

• `Optional` **connectionHost**: `string`

#### Defined in

[src/protect-types.ts:475](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L475)

___

### elementInfo

• `Optional` **elementInfo**: `string`

#### Defined in

[src/protect-types.ts:476](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L476)

___

### featureFlags

• `Optional` **featureFlags**: `DeepPartial`\<\{ `hasWifi`: `boolean`  }\>

#### Defined in

[src/protect-types.ts:477](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L477)

___

### firmwareBuild

• `Optional` **firmwareBuild**: `string`

#### Defined in

[src/protect-types.ts:480](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L480)

___

### firmwareVersion

• `Optional` **firmwareVersion**: `string`

#### Defined in

[src/protect-types.ts:481](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L481)

___

### fwUpdateState

• `Optional` **fwUpdateState**: `string`

#### Defined in

[src/protect-types.ts:482](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L482)

___

### hardwareRevision

• `Optional` **hardwareRevision**: `string`

#### Defined in

[src/protect-types.ts:483](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L483)

___

### host

• `Optional` **host**: `string`

#### Defined in

[src/protect-types.ts:484](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L484)

___

### id

• `Optional` **id**: `string`

#### Defined in

[src/protect-types.ts:485](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L485)

___

### isAdopted

• `Optional` **isAdopted**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:486](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L486)

___

### isAdoptedByOther

• `Optional` **isAdoptedByOther**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:487](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L487)

___

### isAdopting

• `Optional` **isAdopting**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:488](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L488)

___

### isAttemptingToConnect

• `Optional` **isAttemptingToConnect**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:489](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L489)

___

### isConnected

• `Optional` **isConnected**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:490](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L490)

___

### isDownloadingFW

• `Optional` **isDownloadingFW**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:491](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L491)

___

### isProbingForWifi

• `Optional` **isProbingForWifi**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:492](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L492)

___

### isProvisioned

• `Optional` **isProvisioned**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:493](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L493)

___

### isRebooting

• `Optional` **isRebooting**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:494](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L494)

___

### isSshEnabled

• `Optional` **isSshEnabled**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:495](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L495)

___

### isUpdating

• `Optional` **isUpdating**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:496](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L496)

___

### isWirelessUplinkEnabled

• `Optional` **isWirelessUplinkEnabled**: `DeepPartial`\<`boolean`\>

#### Defined in

[src/protect-types.ts:497](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L497)

___

### lastRing

• `Optional` **lastRing**: `number`

#### Defined in

[src/protect-types.ts:498](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L498)

___

### lastSeen

• `Optional` **lastSeen**: `number`

#### Defined in

[src/protect-types.ts:499](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L499)

___

### latestFirmwareVersion

• `Optional` **latestFirmwareVersion**: `string`

#### Defined in

[src/protect-types.ts:500](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L500)

___

### mac

• `Optional` **mac**: `string`

#### Defined in

[src/protect-types.ts:501](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L501)

___

### marketName

• `Optional` **marketName**: `string`

#### Defined in

[src/protect-types.ts:502](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L502)

___

### modelKey

• `Optional` **modelKey**: `string`

#### Defined in

[src/protect-types.ts:503](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L503)

___

### name

• `Optional` **name**: `string`

#### Defined in

[src/protect-types.ts:504](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L504)

___

### state

• `Optional` **state**: `string`

#### Defined in

[src/protect-types.ts:505](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L505)

___

### type

• `Optional` **type**: `string`

#### Defined in

[src/protect-types.ts:506](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L506)

___

### upSince

• `Optional` **upSince**: `number`

#### Defined in

[src/protect-types.ts:507](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L507)

___

### uptime

• `Optional` **uptime**: `number`

#### Defined in

[src/protect-types.ts:508](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L508)

___

### volume

• `Optional` **volume**: `number`

#### Defined in

[src/protect-types.ts:509](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L509)

___

### wifiConnectionState

• `Optional` **wifiConnectionState**: `DeepPartial`\<\{ `apName`: ``null`` \| `string` ; `bssid`: ``null`` \| `string` ; `channel`: ``null`` \| `string` ; `connectivity`: `string` ; `experience`: ``null`` ; `frequency`: ``null`` ; `phyRate`: `number` ; `signalQuality`: `number` ; `signalStrength`: `number` ; `ssid`: ``null`` \| `string` ; `txRate`: ``null``  }\>

#### Defined in

[src/protect-types.ts:510](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L510)

___

### wiredConnectionState

• `Optional` **wiredConnectionState**: `DeepPartial`\<\{ `phyRate`: `number`  }\>

#### Defined in

[src/protect-types.ts:523](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L523)
