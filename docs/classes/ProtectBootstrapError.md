[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectBootstrapError

# Class: ProtectBootstrapError

The bootstrap sequence failed while fetching or parsing the controller bootstrap document. `stage` discriminates which - `"fetch"` when the bootstrap endpoint returns
a non-2xx status or the transport fails reaching it, `"parse"` when the body cannot be decoded - so the caller and the diagnostics surface can report the precise point
of failure rather than a generic "connect failed." A login or reachability failure is not wrapped here; it propagates as its own typed fatal.

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

```ts
FatalError.constructor
```

## Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="stage"></a> `stage` | `readonly` | [`ProtectBootstrapStage`](../type-aliases/ProtectBootstrapStage.md) | The stage of the connect sequence at which the failure occurred. |
