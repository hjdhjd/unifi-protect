[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectAuthorizationError

# Class: ProtectAuthorizationError

The credentials authenticated but lack the privilege the operation requires (typically a `403`; Protect reserves many operations for administrator accounts).
Fatal because the same account will keep being refused.

## Extends

- [`FatalError`](FatalError.md)

## Constructors

### Constructor

```ts
new ProtectAuthorizationError(message, options?): ProtectAuthorizationError;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `message` | `string` |
| `options?` | \{ `cause?`: `unknown`; `statusCode?`: `number`; \} |
| `options.cause?` | `unknown` |
| `options.statusCode?` | `number` |

#### Returns

`ProtectAuthorizationError`

#### Overrides

```ts
FatalError.constructor
```

## Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="statuscode"></a> `statusCode` | `readonly` | `number` \| `undefined` | The HTTP status that triggered the classification, when the failure originated from a response (typically `403`). |
