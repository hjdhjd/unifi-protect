[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectThrottledError

# Class: ProtectThrottledError

We are inside the throttle cooldown window. The library has seen enough consecutive failures to back off from the controller, and this request was rejected
locally rather than sent. Retry once the cooldown elapses.

## Extends

- [`RecoverableError`](RecoverableError.md)

## Constructors

### Constructor

```ts
new ProtectThrottledError(message, options): ProtectThrottledError;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `message` | `string` |
| `options` | \{ `cause?`: `unknown`; `cooldownMs`: `number`; \} |
| `options.cause?` | `unknown` |
| `options.cooldownMs` | `number` |

#### Returns

`ProtectThrottledError`

#### Overrides

```ts
RecoverableError.constructor
```

## Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="cooldownms"></a> `cooldownMs` | `readonly` | `number` | Milliseconds remaining (at throw time) before the cooldown window is expected to clear. |
