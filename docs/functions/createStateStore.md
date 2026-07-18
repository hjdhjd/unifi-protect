[**unifi-protect**](../README.md)

***

[Home](../README.md) / createStateStore

# Function: createStateStore()

```ts
function createStateStore(options): StateStore;
```

Construct a [StateStore](../interfaces/StateStore.md) directly - the single, documented exception to the package's export law, which otherwise keeps `StateStore` type-only so a client has
exactly one composition path (`ProtectClient.connect()`). This factory exists for the test harnesses that need the real reducer and observer engine standalone: a
consumer driving the genuine store never has to hand-mirror its dispatch, dedup, and refresh semantics in a double. Constructing a client remains exactly one path;
this widens only the store's own construction, for tests.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`StateStoreOptions`](../interfaces/StateStoreOptions.md) | The store options: the required refresh seam, and the optional clock, initial state, logger, and refresh interval. |

## Returns

[`StateStore`](../interfaces/StateStore.md)

A new state store.
