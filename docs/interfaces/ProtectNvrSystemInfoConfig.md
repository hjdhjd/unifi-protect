[unifi-protect](../README.md) / [Exports](../modules.md) / ProtectNvrSystemInfoConfig

# Interface: ProtectNvrSystemInfoConfig

## Table of contents

### Properties

- [cpu](ProtectNvrSystemInfoConfig.md#cpu)
- [memory](ProtectNvrSystemInfoConfig.md#memory)
- [storage](ProtectNvrSystemInfoConfig.md#storage)
- [tmpfs](ProtectNvrSystemInfoConfig.md#tmpfs)

## Properties

### cpu

• `Readonly` **cpu**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `averageLoad` | `number` |
| `temperature` | `number` |

#### Defined in

[src/protect-types.ts:145](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L145)

___

### memory

• `Readonly` **memory**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `available` | `number` |
| `free` | `number` |
| `total` | `number` |

#### Defined in

[src/protect-types.ts:150](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L150)

___

### storage

• `Readonly` **storage**: `Object`

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

[src/protect-types.ts:156](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L156)

___

### tmpfs

• `Readonly` **tmpfs**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `available` | `number` |
| `path` | `string` |
| `total` | `number` |
| `used` | `number` |

#### Defined in

[src/protect-types.ts:170](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L170)
