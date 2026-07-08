[**unifi-protect**](../README.md)

***

[Home](../README.md) / selectRelay

# Variable: selectRelay

```ts
const selectRelay: (id) => (state) => 
  | ProtectRelayConfigInterface
  | undefined = relays.byId;
```

A single relay by id, or `undefined` when absent.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

## Returns

(`state`) => 
  \| [`ProtectRelayConfigInterface`](../interfaces/ProtectRelayConfigInterface.md)
  \| `undefined`
