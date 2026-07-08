[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectAbortedError

# Class: ProtectAbortedError

The caller's `AbortSignal` fired. The operation was cancelled by the consumer, not by the library's own deadline. Recoverable in the sense that the caller chose
to stop - re-issuing the operation with a fresh signal is valid.

## Extends

- [`RecoverableError`](RecoverableError.md)

## Constructors

### Constructor

```ts
new ProtectAbortedError(message, options?): ProtectAbortedError;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `message` | `string` |
| `options?` | \{ `cause?`: `unknown`; \} |
| `options.cause?` | `unknown` |

#### Returns

`ProtectAbortedError`

#### Overrides

```ts
RecoverableError.constructor
```
