[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectTimeoutError

# Class: ProtectTimeoutError

The controller did not answer in time. The request path raises it when the deadline the transport arms on its clock for each request elapses, when a connection
attempt times out, and when the controller stops responding before its reply is complete; each socket raises it when its connection attempt times out.

Distinct from [ProtectAbortedError](ProtectAbortedError.md): the deadline raises this when it wins the race, whereas an aborted error fires when the caller's signal wins. The
transport tells the two apart by identity - the failure a cancelled or expired request rejects with is the reason of the signal that fired - never by whether the
caller's signal happens to read aborted once the failure arrives.

## Extends

- [`RecoverableError`](RecoverableError.md)

## Constructors

### Constructor

```ts
new ProtectTimeoutError(message, options): ProtectTimeoutError;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `message` | `string` |
| `options` | \{ `cause?`: `unknown`; `elapsedMs`: `number`; \} |
| `options.cause?` | `unknown` |
| `options.elapsedMs` | `number` |

#### Returns

`ProtectTimeoutError`

#### Overrides

`RecoverableError.constructor`

## Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="elapsedms"></a> `elapsedMs` | `readonly` | `number` | Milliseconds elapsed from the start of the request, or of a socket's connection attempt, to the timeout. |
