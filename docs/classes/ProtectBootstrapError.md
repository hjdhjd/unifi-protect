[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectBootstrapError

# Class: ProtectBootstrapError

The bootstrap sequence failed while fetching, parsing or applying the controller bootstrap document. `stage` marks which - `"fetch"` when the bootstrap endpoint
returns a non-2xx status, `"parse"` when the body cannot be decoded, `"apply"` when a decoded document cannot be folded into the state model - so the caller and the
diagnostics surface can report the precise point of failure rather than a generic "connect failed." A login or reachability failure is not wrapped here: a
transport-level failure reaching the endpoint propagates as its own typed error
(`ProtectNetworkError`, `ProtectTimeoutError`, `ProtectThrottledError`, `ProtectAbortedError`), and a login failure as `ProtectAuthError` when the controller
rejected the sign-in or as `ProtectRequestError` when it answered with a status that is no verdict on the credentials (a readiness answer in the transport's
retried set, a rate limit, a 3xx, or a 5xx outside the retried set).

## Extends

- [`FatalError`](FatalError.md)

## Constructors

### Constructor

```ts
new ProtectBootstrapError(message, options): ProtectBootstrapError;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `message` | `string` |
| `options` | \{ `cause?`: `unknown`; `stage`: [`ProtectBootstrapStage`](../type-aliases/ProtectBootstrapStage.md); \} |
| `options.cause?` | `unknown` |
| `options.stage` | [`ProtectBootstrapStage`](../type-aliases/ProtectBootstrapStage.md) |

#### Returns

`ProtectBootstrapError`

#### Overrides

`FatalError.constructor`

## Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="stage"></a> `stage` | `readonly` | [`ProtectBootstrapStage`](../type-aliases/ProtectBootstrapStage.md) | The stage of the connect sequence at which the failure occurred. |
