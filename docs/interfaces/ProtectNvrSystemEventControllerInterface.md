[unifi-protect](../README.md) / [Exports](../modules.md) / ProtectNvrSystemEventControllerInterface

# Interface: ProtectNvrSystemEventControllerInterface

## Table of contents

### Properties

- [harddriveRequired](ProtectNvrSystemEventControllerInterface.md#harddriverequired)
- [info](ProtectNvrSystemEventControllerInterface.md#info)
- [installState](ProtectNvrSystemEventControllerInterface.md#installstate)
- [isConfigured](ProtectNvrSystemEventControllerInterface.md#isconfigured)
- [isInstalled](ProtectNvrSystemEventControllerInterface.md#isinstalled)
- [isRunning](ProtectNvrSystemEventControllerInterface.md#isrunning)
- [name](ProtectNvrSystemEventControllerInterface.md#name)
- [port](ProtectNvrSystemEventControllerInterface.md#port)
- [required](ProtectNvrSystemEventControllerInterface.md#required)
- [state](ProtectNvrSystemEventControllerInterface.md#state)
- [status](ProtectNvrSystemEventControllerInterface.md#status)
- [statusMessage](ProtectNvrSystemEventControllerInterface.md#statusmessage)
- [swaiVersion](ProtectNvrSystemEventControllerInterface.md#swaiversion)
- [type](ProtectNvrSystemEventControllerInterface.md#type)
- [ui](ProtectNvrSystemEventControllerInterface.md#ui)
- [uiNpmPackageName](ProtectNvrSystemEventControllerInterface.md#uinpmpackagename)
- [uiVersion](ProtectNvrSystemEventControllerInterface.md#uiversion)
- [unadoptedDevices](ProtectNvrSystemEventControllerInterface.md#unadopteddevices)
- [updateAvailable](ProtectNvrSystemEventControllerInterface.md#updateavailable)
- [version](ProtectNvrSystemEventControllerInterface.md#version)

## Properties

### harddriveRequired

• **harddriveRequired**: `boolean`

#### Defined in

[src/protect-types.ts:656](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L656)

___

### info

• **info**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `events` | `number`[] |
| `isAdopted` | `boolean` |
| `isConnectedToCloud` | `boolean` |
| `isSetup` | `boolean` |
| `lastMotion` | `number` |
| `lastMotionCamera` | `string` |
| `lastMotionCameraAddress` | `string` |
| `lastMotionCameraModel` | `string` |
| `managedCameras` | `number` |
| `offlineCameras` | `number` |
| `oldestRecording` | `number` |
| `onlineCameras` | `number` |
| `recordingSpaceTotal` | `number` |
| `recordingSpaceUsed` | `number` |
| `retentionTime` | `number` |
| `startedAt` | `number` |
| `throughput` | `number` |
| `timeFormat` | `string` |
| `updateAvailable` | `boolean` |
| `updateVersion` | `string` |

#### Defined in

[src/protect-types.ts:657](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L657)

___

### installState

• **installState**: `string`

#### Defined in

[src/protect-types.ts:680](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L680)

___

### isConfigured

• **isConfigured**: `boolean`

#### Defined in

[src/protect-types.ts:681](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L681)

___

### isInstalled

• **isInstalled**: `boolean`

#### Defined in

[src/protect-types.ts:682](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L682)

___

### isRunning

• **isRunning**: `boolean`

#### Defined in

[src/protect-types.ts:683](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L683)

___

### name

• **name**: `string`

#### Defined in

[src/protect-types.ts:684](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L684)

___

### port

• **port**: `number`

#### Defined in

[src/protect-types.ts:685](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L685)

___

### required

• **required**: `boolean`

#### Defined in

[src/protect-types.ts:686](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L686)

___

### state

• **state**: `string`

#### Defined in

[src/protect-types.ts:687](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L687)

___

### status

• **status**: `string`

#### Defined in

[src/protect-types.ts:688](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L688)

___

### statusMessage

• **statusMessage**: `string`

#### Defined in

[src/protect-types.ts:689](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L689)

___

### swaiVersion

• **swaiVersion**: `number`

#### Defined in

[src/protect-types.ts:690](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L690)

___

### type

• **type**: `string`

#### Defined in

[src/protect-types.ts:691](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L691)

___

### ui

• **ui**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `apiPrefix` | `string` |
| `baseUrl` | `string` |
| `cdnPublicPaths` | `string`[] |
| `entrypoint` | `string` |
| `hotkey` | `string` |
| `icon` | `string` |
| `publicPath` | `string` |
| `swaiVersion` | `number` |

#### Defined in

[src/protect-types.ts:692](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L692)

___

### uiNpmPackageName

• **uiNpmPackageName**: `string`

#### Defined in

[src/protect-types.ts:703](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L703)

___

### uiVersion

• **uiVersion**: `string`

#### Defined in

[src/protect-types.ts:704](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L704)

___

### unadoptedDevices

• **unadoptedDevices**: `unknown`[]

#### Defined in

[src/protect-types.ts:705](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L705)

___

### updateAvailable

• **updateAvailable**: `string`

#### Defined in

[src/protect-types.ts:706](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L706)

___

### version

• **version**: `string`

#### Defined in

[src/protect-types.ts:707](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L707)
