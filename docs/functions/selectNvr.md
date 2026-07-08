[**unifi-protect**](../README.md)

***

[Home](../README.md) / selectNvr

# Function: selectNvr()

```ts
function selectNvr(state): 
  | ProtectNvrConfigInterface
  | null;
```

The controller's NVR configuration record, or `null` before the first bootstrap. The single-source primitive the [Nvr](../interfaces/Nvr.md) singleton projection reads through (its
`config` getter and `observe()`), and the record the narrower NVR-derived selectors ([selectControllerName](selectControllerName.md), ...) pull their fields from. Reads straight through
the `nvr` singleton field, so the returned reference is structurally-sharing-stable across dispatches that did not touch it - no memoization needed; the observer's
`Object.is` dedup yields only when the record actually changes.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `state` | [`ProtectState`](../type-aliases/ProtectState.md) | The current state. |

## Returns

  \| [`ProtectNvrConfigInterface`](../interfaces/ProtectNvrConfigInterface.md)
  \| `null`

The NVR config record, or `null` when no bootstrap has been applied.
