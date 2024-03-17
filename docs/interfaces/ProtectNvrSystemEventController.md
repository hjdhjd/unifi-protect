[unifi-protect](../README.md) / [Exports](../modules.md) / ProtectNvrSystemEventController

# Interface: ProtectNvrSystemEventController

## Table of contents

### Properties

- [harddriveRequired](ProtectNvrSystemEventController.md#harddriverequired)
- [info](ProtectNvrSystemEventController.md#info)
- [installState](ProtectNvrSystemEventController.md#installstate)
- [isConfigured](ProtectNvrSystemEventController.md#isconfigured)
- [isInstalled](ProtectNvrSystemEventController.md#isinstalled)
- [isRunning](ProtectNvrSystemEventController.md#isrunning)
- [name](ProtectNvrSystemEventController.md#name)
- [port](ProtectNvrSystemEventController.md#port)
- [required](ProtectNvrSystemEventController.md#required)
- [state](ProtectNvrSystemEventController.md#state)
- [status](ProtectNvrSystemEventController.md#status)
- [statusMessage](ProtectNvrSystemEventController.md#statusmessage)
- [swaiVersion](ProtectNvrSystemEventController.md#swaiversion)
- [type](ProtectNvrSystemEventController.md#type)
- [ui](ProtectNvrSystemEventController.md#ui)
- [uiNpmPackageName](ProtectNvrSystemEventController.md#uinpmpackagename)
- [uiVersion](ProtectNvrSystemEventController.md#uiversion)
- [unadoptedDevices](ProtectNvrSystemEventController.md#unadopteddevices)
- [updateAvailable](ProtectNvrSystemEventController.md#updateavailable)
- [version](ProtectNvrSystemEventController.md#version)

## Properties

### harddriveRequired

• `Readonly` **harddriveRequired**: `boolean`

#### Defined in

[src/protect-types.ts:656](https://github.com/hjdhjd/unifi-protect/blob/a536a5f/src/protect-types.ts#L656)

___

### info

• `Readonly` **info**: `Object`

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

[src/protect-types.ts:657](https://github.com/hjdhjd/unifi-protect/blob/a536a5f/src/protect-types.ts#L657)

___

### installState

• `Readonly` **installState**: `string`

#### Defined in

[src/protect-types.ts:680](https://github.com/hjdhjd/unifi-protect/blob/a536a5f/src/protect-types.ts#L680)

___

### isConfigured

• `Readonly` **isConfigured**: `boolean`

#### Defined in

[src/protect-types.ts:681](https://github.com/hjdhjd/unifi-protect/blob/a536a5f/src/protect-types.ts#L681)

___

### isInstalled

• `Readonly` **isInstalled**: `boolean`

#### Defined in

[src/protect-types.ts:682](https://github.com/hjdhjd/unifi-protect/blob/a536a5f/src/protect-types.ts#L682)

___

### isRunning

• `Readonly` **isRunning**: `boolean`

#### Defined in

[src/protect-types.ts:683](https://github.com/hjdhjd/unifi-protect/blob/a536a5f/src/protect-types.ts#L683)

___

### name

• `Readonly` **name**: `string`

#### Defined in

[src/protect-types.ts:684](https://github.com/hjdhjd/unifi-protect/blob/a536a5f/src/protect-types.ts#L684)

___

### port

• `Readonly` **port**: `number`

#### Defined in

[src/protect-types.ts:685](https://github.com/hjdhjd/unifi-protect/blob/a536a5f/src/protect-types.ts#L685)

___

### required

• `Readonly` **required**: `boolean`

#### Defined in

[src/protect-types.ts:686](https://github.com/hjdhjd/unifi-protect/blob/a536a5f/src/protect-types.ts#L686)

___

### state

• `Readonly` **state**: `string`

#### Defined in

[src/protect-types.ts:687](https://github.com/hjdhjd/unifi-protect/blob/a536a5f/src/protect-types.ts#L687)

___

### status

• `Readonly` **status**: `string`

#### Defined in

[src/protect-types.ts:688](https://github.com/hjdhjd/unifi-protect/blob/a536a5f/src/protect-types.ts#L688)

___

### statusMessage

• `Readonly` **statusMessage**: `string`

#### Defined in

[src/protect-types.ts:689](https://github.com/hjdhjd/unifi-protect/blob/a536a5f/src/protect-types.ts#L689)

___

### swaiVersion

• `Readonly` **swaiVersion**: `number`

#### Defined in

[src/protect-types.ts:690](https://github.com/hjdhjd/unifi-protect/blob/a536a5f/src/protect-types.ts#L690)

___

### type

• `Readonly` **type**: `string`

#### Defined in

[src/protect-types.ts:691](https://github.com/hjdhjd/unifi-protect/blob/a536a5f/src/protect-types.ts#L691)

___

### ui

• `Readonly` **ui**: `Object`

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

[src/protect-types.ts:692](https://github.com/hjdhjd/unifi-protect/blob/a536a5f/src/protect-types.ts#L692)

___

### uiNpmPackageName

• `Readonly` **uiNpmPackageName**: `string`

#### Defined in

[src/protect-types.ts:703](https://github.com/hjdhjd/unifi-protect/blob/a536a5f/src/protect-types.ts#L703)

___

### uiVersion

• `Readonly` **uiVersion**: `string`

#### Defined in

[src/protect-types.ts:704](https://github.com/hjdhjd/unifi-protect/blob/a536a5f/src/protect-types.ts#L704)

___

### unadoptedDevices

• `Readonly` **unadoptedDevices**: `unknown`[]

#### Defined in

[src/protect-types.ts:705](https://github.com/hjdhjd/unifi-protect/blob/a536a5f/src/protect-types.ts#L705)

___

### updateAvailable

• `Readonly` **updateAvailable**: `string`

#### Defined in

[src/protect-types.ts:706](https://github.com/hjdhjd/unifi-protect/blob/a536a5f/src/protect-types.ts#L706)

___

### version

• `Readonly` **version**: `string`

#### Defined in

[src/protect-types.ts:707](https://github.com/hjdhjd/unifi-protect/blob/a536a5f/src/protect-types.ts#L707)
