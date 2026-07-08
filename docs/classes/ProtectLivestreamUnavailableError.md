[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectLivestreamUnavailableError

# Class: ProtectLivestreamUnavailableError

A pooled livestream's recovery policy gave up. The `phase` discriminates the two regimes the pool runs: `establishing` means the first segment never arrived within
the bounded establishment deadline (the stream that never produced media), and `recovering` means a previously-live stream could not be re-established and the policy
elected to stop. Fatal because the policy - the single authority over whether to keep trying - has declared the stream unrecoverable; the consumer re-subscribes if it
still wants the stream. `attempts` carries how many consecutive reconnect attempts the episode made before the policy returned `giveUp`.

## Extends

- [`FatalError`](FatalError.md)

## Constructors

### Constructor

```ts
new ProtectLivestreamUnavailableError(message, options): ProtectLivestreamUnavailableError;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `message` | `string` |
| `options` | \{ `attempts`: `number`; `cause?`: `unknown`; `phase`: `"establishing"` \| `"recovering"`; \} |
| `options.attempts` | `number` |
| `options.cause?` | `unknown` |
| `options.phase` | `"establishing"` \| `"recovering"` |

#### Returns

`ProtectLivestreamUnavailableError`

#### Overrides

```ts
FatalError.constructor
```

## Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="attempts"></a> `attempts` | `readonly` | `number` | The number of consecutive failed reconnect attempts the recovery episode made before the policy gave up. |
| <a id="phase"></a> `phase` | `readonly` | `"establishing"` \| `"recovering"` | Which regime the give-up occurred in: bounded establishment, or unbounded live recovery. |
