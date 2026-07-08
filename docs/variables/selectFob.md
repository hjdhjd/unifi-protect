[**unifi-protect**](../README.md)

***

[Home](../README.md) / selectFob

# Variable: selectFob

```ts
const selectFob: (id) => (state) => 
  | ProtectFobConfigInterface
  | undefined = fobs.byId;
```

A single fob by id, or `undefined` when absent.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

## Returns

(`state`) => 
  \| [`ProtectFobConfigInterface`](../interfaces/ProtectFobConfigInterface.md)
  \| `undefined`
