[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectUnsupportedError

# Class: ProtectUnsupportedError

The requested operation is not available on this device. This is a *client-side precondition* failure - distinct from [ProtectRequestError](ProtectRequestError.md), which classifies a
status the controller actually returned - raised before any request is issued because the device lacks the capability the operation requires (for example, a package
snapshot on a camera that has no secondary package sensor). Fatal because a device's capabilities do not change on retry; the caller should pick a different operation
or device. The optional `feature` names the missing capability flag, for precise logging and programmatic branching.

## Extends

- [`FatalError`](FatalError.md)

## Constructors

### Constructor

```ts
new ProtectUnsupportedError(message, options?): ProtectUnsupportedError;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `message` | `string` |
| `options?` | \{ `cause?`: `unknown`; `feature?`: `string`; \} |
| `options.cause?` | `unknown` |
| `options.feature?` | `string` |

#### Returns

`ProtectUnsupportedError`

#### Overrides

```ts
FatalError.constructor
```

## Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="feature"></a> `feature` | `readonly` | `string` \| `undefined` | The device capability flag whose absence triggered the rejection (e.g., `"hasPackageCamera"`), when the call site identified one. |
