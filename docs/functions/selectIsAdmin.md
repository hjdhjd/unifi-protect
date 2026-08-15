[**unifi-protect**](../README.md)

***

[Home](../README.md) / selectIsAdmin

# Function: selectIsAdmin()

```ts
function selectIsAdmin(state): boolean;
```

Whether the authenticated session has Super Admin (camera-write) privileges. Derived from the session user's record and the controller's permission grammar; `false`
before the first bootstrap or when the session's user is absent. Re-evaluated whenever the user's record changes, so a role change at the controller surfaces as
soon as the record next changes, whether through a realtime `user` patch (the common, low-latency path) or a periodic bootstrap refresh (the failsafe).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `state` | [`ProtectState`](../type-aliases/ProtectState.md) | The current state. |

## Returns

`boolean`

`true` when the authenticated user holds the administrative camera-write permission.
