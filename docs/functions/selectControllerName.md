[**unifi-protect**](../README.md)

***

[Home](../README.md) / selectControllerName

# Function: selectControllerName()

```ts
function selectControllerName(state): string | null;
```

The controller's display label - its user-assigned name, else the always-present `marketName` - or `null` only before the first bootstrap (no `nvr` record yet), never
for a merely-unnamed controller (which surfaces its model). Single-sourced with `Nvr.name`, so the projection getter and this primitive never disagree; a consumer
needing the raw "was it explicitly named?" distinction reads `client.nvr.config.name`. Returns a primitive, so it needs no memoization: the value is its own
`Object.is` key for the observer's dedup, and two property reads are already cheaper than a cache lookup.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `state` | [`ProtectState`](../type-aliases/ProtectState.md) | The current state. |

## Returns

`string` \| `null`

The NVR's display label, or `null` when the NVR is not yet known.
