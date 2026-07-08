[**unifi-protect**](../README.md)

***

[Home](../README.md) / selectChime

# Variable: selectChime

```ts
const selectChime: (id) => (state) => 
  | ProtectChimeConfigInterface
  | undefined = chimes.byId;
```

A single chime by id, or `undefined` when absent.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

## Returns

(`state`) => 
  \| [`ProtectChimeConfigInterface`](../interfaces/ProtectChimeConfigInterface.md)
  \| `undefined`
