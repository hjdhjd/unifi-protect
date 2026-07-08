[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectNetworkError

# Class: ProtectNetworkError

A connect, DNS, TLS, or socket-level failure reaching the controller. The originating Node `ErrnoException` is preserved on the `cause` chain (the shape undici
raises as `TypeError("fetch failed", { cause: errnoError })`); `code` lifts the errno string out for convenient branching.

## Extends

- [`RecoverableError`](RecoverableError.md)

## Constructors

### Constructor

```ts
new ProtectNetworkError(message, options?): ProtectNetworkError;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `message` | `string` |
| `options?` | \{ `cause?`: `unknown`; `code?`: `string`; \} |
| `options.cause?` | `unknown` |
| `options.code?` | `string` |

#### Returns

`ProtectNetworkError`

#### Overrides

```ts
RecoverableError.constructor
```

## Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="code"></a> `code` | `readonly` | `string` \| `undefined` | The Node errno string (e.g., `"ECONNREFUSED"`, `"ETIMEDOUT"`), when one could be resolved from the cause chain. |
