[unifi-protect](../README.md) / [Exports](../modules.md) / ProtectNvrSystemInfoInterface

# Interface: ProtectNvrSystemInfoInterface

## Table of contents

### Properties

- [cpu](ProtectNvrSystemInfoInterface.md#cpu)
- [memory](ProtectNvrSystemInfoInterface.md#memory)
- [storage](ProtectNvrSystemInfoInterface.md#storage)
- [tmpfs](ProtectNvrSystemInfoInterface.md#tmpfs)

## Properties

### cpu

• **cpu**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `averageLoad` | `number` |
| `temperature` | `number` |

#### Defined in

[src/protect-types.ts:145](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L145)

___

### memory

• **memory**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `available` | `number` |
| `free` | `number` |
| `total` | `number` |

#### Defined in

[src/protect-types.ts:150](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L150)

___

### storage

• **storage**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `available` | `number` |
| `devices` | { `healthy`: `boolean` ; `model`: `string` ; `size`: `number`  }[] |
| `isRecycling` | `boolean` |
| `size` | `number` |
| `type` | `string` |
| `used` | `number` |

#### Defined in

[src/protect-types.ts:156](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L156)

___

### tmpfs

• **tmpfs**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `available` | `number` |
| `path` | `string` |
| `total` | `number` |
| `used` | `number` |

#### Defined in

[src/protect-types.ts:170](https://github.com/hjdhjd/unifi-protect/blob/28b6712/src/protect-types.ts#L170)
