[**unifi-protect**](../README.md)

***

[Home](../README.md) / selectLiveview

# Variable: selectLiveview

```ts
const selectLiveview: (id) => (state) => 
  | ProtectNvrLiveviewConfigInterface
  | undefined = liveviews.byId;
```

A single liveview by id, or `undefined` when absent.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

## Returns

(`state`) => 
  \| [`ProtectNvrLiveviewConfigInterface`](../interfaces/ProtectNvrLiveviewConfigInterface.md)
  \| `undefined`
