[**unifi-protect**](../README.md)

***

[Home](../README.md) / selectLiveviews

# Variable: selectLiveviews

```ts
const selectLiveviews: (state) => readonly ProtectNvrLiveviewConfigInterface[] = liveviews.all;
```

All liveviews, memoized on the liveview-map identity. Each record carries its `slots[].cameras`.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `state` | [`ProtectState`](../type-aliases/ProtectState.md) |

## Returns

readonly [`ProtectNvrLiveviewConfigInterface`](../interfaces/ProtectNvrLiveviewConfigInterface.md)[]
