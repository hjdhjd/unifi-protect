[**unifi-protect**](../README.md)

***

[Home](../README.md) / selectAdoptedViewerIds

# Variable: selectAdoptedViewerIds

```ts
const selectAdoptedViewerIds: (state) => readonly string[] = viewers.adoptedIds;
```

The ids of the viewers adopted by this controller, content-memoized to change reference only when the membership set changes.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `state` | [`ProtectState`](../type-aliases/ProtectState.md) |

## Returns

readonly `string`[]
