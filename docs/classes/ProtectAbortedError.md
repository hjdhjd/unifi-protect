[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectAbortedError

# Class: ProtectAbortedError

The operation was cancelled rather than failed: the caller's `AbortSignal` fired, or the resource the operation needed closed - a wait pending on the events of a
subsystem that was disposed or tore down, or a request sent to a transport already disposed. Neither is the library's own deadline. Recoverable in the sense that
nothing went wrong with the controller - re-issuing the operation with a fresh signal, or on a fresh resource, is valid.

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

`RecoverableError.constructor`
