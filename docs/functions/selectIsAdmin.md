[**unifi-protect**](../README.md)

***

[Home](../README.md) / selectIsAdmin

# Function: selectIsAdmin()

```ts
function selectIsAdmin(state): boolean;
```

Whether the authenticated session has Super Admin (camera-write) privileges. Derived from the session user's record and the controller's permission grammar; `false`
before the first bootstrap or when the session's user is absent. Re-evaluated whenever the user's record changes, so a role change at the controller surfaces on the
next bootstrap refresh.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `state` | [`ProtectState`](../type-aliases/ProtectState.md) | The current state. |

## Returns

`boolean`

`true` when the authenticated user holds the administrative camera-write permission.
