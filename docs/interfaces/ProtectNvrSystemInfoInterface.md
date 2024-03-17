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

[src/protect-types.ts:147](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L147)

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

[src/protect-types.ts:152](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L152)

___

### storage

• **storage**: `Object`

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

• **tmpfs**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `available` | `number` |
| `path` | `string` |
| `total` | `number` |
| `used` | `number` |

#### Defined in

[src/protect-types.ts:172](https://github.com/hjdhjd/unifi-protect/blob/12bffbb/src/protect-types.ts#L172)
