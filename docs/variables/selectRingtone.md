[**unifi-protect**](../README.md)

***

[Home](../README.md) / selectRingtone

# Variable: selectRingtone

```ts
const selectRingtone: (id) => (state) => 
  | ProtectRingtoneConfigInterface
  | undefined = ringtones.byId;
```

A single ringtone by id, or `undefined` when absent.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

## Returns

(`state`) => 
  \| [`ProtectRingtoneConfigInterface`](../interfaces/ProtectRingtoneConfigInterface.md)
  \| `undefined`
