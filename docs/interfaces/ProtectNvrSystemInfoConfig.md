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

[src/protect-types.ts:147](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L147)

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

[src/protect-types.ts:152](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L152)

___

### storage

• `Readonly` **storage**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `available` | `number` |
| `devices` | \{ `healthy`: `boolean` ; `model`: `string` ; `size`: `number`  }[] |
| `isRecycling` | `boolean` |
| `size` | `number` |
| `type` | `string` |
| `used` | `number` |

#### Defined in

[src/protect-types.ts:158](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L158)

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

[src/protect-types.ts:172](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L172)
