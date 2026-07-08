[**unifi-protect**](../README.md)

***

[Home](../README.md) / selectViewer

# Variable: selectViewer

```ts
const selectViewer: (id) => (state) => 
  | ProtectViewerConfigInterface
  | undefined = viewers.byId;
```

A single viewer by id, or `undefined` when absent.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

## Returns

(`state`) => 
  \| [`ProtectViewerConfigInterface`](../interfaces/ProtectViewerConfigInterface.md)
  \| `undefined`
