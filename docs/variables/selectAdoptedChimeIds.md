[**unifi-protect**](../README.md)

***

[Home](../README.md) / selectAdoptedChimeIds

# Variable: selectAdoptedChimeIds

```ts
const selectAdoptedChimeIds: (state) => readonly string[] = chimes.adoptedIds;
```

The ids of the chimes adopted by this controller, content-memoized to change reference only when the membership set changes.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `state` | [`ProtectState`](../type-aliases/ProtectState.md) |

## Returns

readonly `string`[]
