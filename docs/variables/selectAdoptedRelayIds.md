[**unifi-protect**](../README.md)

***

[Home](../README.md) / selectAdoptedRelayIds

# Variable: selectAdoptedRelayIds

```ts
const selectAdoptedRelayIds: (state) => readonly string[] = relays.adoptedIds;
```

The ids of the relays adopted by this controller, content-memoized to change reference only when the membership set changes.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `state` | [`ProtectState`](../type-aliases/ProtectState.md) |

## Returns

readonly `string`[]
