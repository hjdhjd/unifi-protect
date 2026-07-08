[**unifi-protect**](../README.md)

***

[Home](../README.md) / selectAdoptedFobIds

# Variable: selectAdoptedFobIds

```ts
const selectAdoptedFobIds: (state) => readonly string[] = fobs.adoptedIds;
```

The ids of the fobs adopted by this controller, content-memoized to change reference only when the membership set changes.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `state` | [`ProtectState`](../type-aliases/ProtectState.md) |

## Returns

readonly `string`[]
