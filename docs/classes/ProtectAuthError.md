[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectAuthError

# Class: ProtectAuthError

Authentication failed: invalid credentials, an expired session that could not be renewed, or a CSRF-token rotation that did not complete. Fatal because retrying
with the same credentials reproduces the failure.

## Extends

- [`FatalError`](FatalError.md)

## Constructors

### Constructor

```ts
new ProtectAuthError(message, options?): ProtectAuthError;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `message` | `string` |
| `options?` | \{ `cause?`: `unknown`; `statusCode?`: `number`; \} |
| `options.cause?` | `unknown` |
| `options.statusCode?` | `number` |

#### Returns

`ProtectAuthError`

#### Overrides

```ts
FatalError.constructor
```

## Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="statuscode"></a> `statusCode` | `readonly` | `number` \| `undefined` | The HTTP status that triggered the classification, when the failure originated from a response (typically `401`). |
