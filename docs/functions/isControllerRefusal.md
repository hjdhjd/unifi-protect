[**unifi-protect**](../README.md)

***

[Home](../README.md) / isControllerRefusal

# Function: isControllerRefusal()

```ts
function isControllerRefusal(error): boolean;
```

Whether a failure is the controller refusing in a way that asking again sooner cannot change: a refused identity or privilege, as [isSignInRefusal](isSignInRefusal.md) reads
one, or a refused request rate, the HTTP 429 the transport classifies as a [ProtectRequestError](../classes/ProtectRequestError.md). In each the controller answered, and its answer stands
until a person corrects the credentials or the privilege, or the controller lifts its limit, so a caller retrying a connection waits for any of them on the slower
`PROTECT_RECOVERY_REFUSAL_SCHEDULE_MS` rather than at the pace it keeps for a controller it cannot reach. The library's own recovery chooses its schedule by this
reading, so a connect retry that branches on it walks that schedule for exactly the failures recovery walks it for.

It pairs with [isSignInRefusal](isSignInRefusal.md), the narrower reading: this one chooses the schedule, and that one chooses how a loss is announced, because a refused
sign-in waits on a person to correct the credentials while a rate limit is the controller asking to be asked less often.

A [ProtectBootstrapError](../classes/ProtectBootstrapError.md) handed in is read by the `cause` it carries, because a refused bootstrap read arrives wrapped in that error at the fetch stage,
and no further, so a bootstrap error wrapping another bootstrap error answers false. Every other error is read as itself, so a network fault carrying a refusal
somewhere below it is the network fault it is. The answer is a plain `boolean` rather than a type guard, because in the wrapped case the refusal is the `cause`
of the value handed in rather than that value.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `error` | `unknown` | The error value to classify. Typed `unknown` because catch bindings, event handlers, and rejected promises all deliver untyped values. |

## Returns

`boolean`

`true` when the failure, or the cause a bootstrap error carries, is a refused identity, a refused privilege or a refused request rate; `false` for
  anything else.
