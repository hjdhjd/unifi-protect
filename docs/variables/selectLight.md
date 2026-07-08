[**unifi-protect**](../README.md)

***

[Home](../README.md) / selectLight

# Variable: selectLight

```ts
const selectLight: (id) => (state) => 
  | ProtectLightConfigInterface
  | undefined = lights.byId;
```

A single light by id, or `undefined` when absent.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

## Returns

(`state`) => 
  \| [`ProtectLightConfigInterface`](../interfaces/ProtectLightConfigInterface.md)
  \| `undefined`
