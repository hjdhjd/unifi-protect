[**unifi-protect**](../README.md)

***

[Home](../README.md) / selectCamera

# Variable: selectCamera

```ts
const selectCamera: (id) => (state) => 
  | ProtectCameraConfigInterface
  | undefined = cameras.byId;
```

A single camera by id, or `undefined` when absent.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

## Returns

(`state`) => 
  \| [`ProtectCameraConfigInterface`](../interfaces/ProtectCameraConfigInterface.md)
  \| `undefined`
