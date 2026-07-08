[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectStallError

# Class: ProtectStallError

A realtime channel produced no data for longer than its heartbeat watchdog window - either the events WebSocket (silent beyond `PROTECT_EVENTS_WATCHDOG_TIMEOUT`)
or a livestream session (silent beyond `PROTECT_LIVESTREAM_HEARTBEAT_TIMEOUT`). The underlying channel is presumed dead. As a `RecoverableError`, the error type
itself is the signal to recover: the events stream's subscriber (the `ConnectionMonitor`) re-bootstraps and relaunches, and a stalled livestream session's owner (the
pool's `ManagedSession`) drives a recovery loop that reconnects under the injected policy - the bare `LivestreamSession` escape hatch is the only livestream surface
that surfaces this verbatim to a direct consumer without recovering on its behalf.

## Extends

- [`RecoverableError`](RecoverableError.md)

## Constructors

### Constructor

```ts
new ProtectStallError(message, options): ProtectStallError;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `message` | `string` |
| `options` | \{ `cause?`: `unknown`; `silentForMs`: `number`; \} |
| `options.cause?` | `unknown` |
| `options.silentForMs` | `number` |

#### Returns

`ProtectStallError`

#### Overrides

```ts
RecoverableError.constructor
```

## Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="silentforms"></a> `silentForMs` | `readonly` | `number` | Milliseconds of silence observed before the watchdog tripped. |
