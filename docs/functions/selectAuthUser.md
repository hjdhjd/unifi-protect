[**unifi-protect**](../README.md)

***

[Home](../README.md) / selectAuthUser

# Function: selectAuthUser()

```ts
function selectAuthUser(state): 
  | ProtectNvrUserConfigInterface
  | null;
```

The authenticated session's own user record, or `null` when there is no such user (before the first bootstrap, or if the id is absent from the roster). The
single-source primitive for session-identity facts: [selectIsAdmin](selectIsAdmin.md) derives from it, and consumers can `observe` it directly to react to "who am I" changes.
Reads straight through the roster map, so the returned record reference is structurally-sharing-stable across dispatches that did not touch it - no memoization needed.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `state` | [`ProtectState`](../type-aliases/ProtectState.md) | The current state. |

## Returns

  \| [`ProtectNvrUserConfigInterface`](../interfaces/ProtectNvrUserConfigInterface.md)
  \| `null`

The authenticated user's config record, or `null`.
