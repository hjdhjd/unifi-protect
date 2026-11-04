[**unifi-protect**](../README.md)

***

[Home](../README.md) / isSignInRefusal

# Function: isSignInRefusal()

```ts
function isSignInRefusal(error): boolean;
```

Whether a failure is the controller refusing the sign-in, on either ground: the identity itself, which the transport classifies as a [ProtectAuthError](../classes/ProtectAuthError.md),
or a privilege the identity lacks, which it classifies as a [ProtectAuthorizationError](../classes/ProtectAuthorizationError.md). It is the narrower reading of a refusal, and it chooses the
library's refused announcement, because nothing changes until a person corrects the credentials or the privilege. It chooses no schedule: a caller retrying a
connection chooses its schedule by [isControllerRefusal](isControllerRefusal.md), which reads a refused sign-in and a rate limit alike.

A [ProtectBootstrapError](../classes/ProtectBootstrapError.md) handed in is read by the `cause` it carries, because a refused bootstrap read arrives wrapped in that error at the fetch stage,
and no further, so a bootstrap error wrapping another bootstrap error answers false. Every other error is read as itself, so a network fault carrying a refusal
somewhere below it is the network fault it is.

The answer is a plain `boolean` rather than a type guard, because in the wrapped case the value handed in is the wrapper and the refusal is its `cause`, so
narrowing the value handed in would claim something untrue of it.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `error` | `unknown` | The error value to classify. Typed `unknown` because catch bindings, event handlers, and rejected promises all deliver untyped values. |

## Returns

`boolean`

`true` when the failure, or the cause a bootstrap error carries, is a refused identity or a refused privilege; `false` for anything else, a rate limit
  among them.
