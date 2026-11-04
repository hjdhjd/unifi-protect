[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectCodecChangeError

# Class: ProtectCodecChangeError

A pooled livestream reconnected and the controller delivered a different stream than the one in flight: its codec label or its description differs (H.264 to HEVC,
a channel reconfigured mid-stream, or a sample rate, channel count or dimensions that moved under the same label). Fatal because no fixed-format consumer can adapt
in place: an FFmpeg pipe cannot re-initialize, and HKSV tolerates no second init segment. The pool surfaces this as a terminal a recovering stream can raise -
alongside [ProtectLivestreamUnavailableError](ProtectLivestreamUnavailableError.md) when the recovery policy gives up instead - after which the consumer re-subscribes for a fresh stream against
the new format. `from` and `to` are the inits themselves, each with its codec label, its bytes and its description, so a consumer can log precisely what changed.

## Extends

- [`FatalError`](FatalError.md)

## Constructors

### Constructor

```ts
new ProtectCodecChangeError(message, options): ProtectCodecChangeError;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `message` | `string` |
| `options` | \{ `cause?`: `unknown`; `from`: [`LivestreamInit`](../interfaces/LivestreamInit.md); `to`: [`LivestreamInit`](../interfaces/LivestreamInit.md); \} |
| `options.cause?` | `unknown` |
| `options.from` | [`LivestreamInit`](../interfaces/LivestreamInit.md) |
| `options.to` | [`LivestreamInit`](../interfaces/LivestreamInit.md) |

#### Returns

`ProtectCodecChangeError`

#### Overrides

`FatalError.constructor`

## Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="from"></a> `from` | `readonly` | [`LivestreamInit`](../interfaces/LivestreamInit.md) | The init the stream began with, before the reconnect: its codec label, bytes and description. |
| <a id="to"></a> `to` | `readonly` | [`LivestreamInit`](../interfaces/LivestreamInit.md) | The init the reconnected stream delivered: its codec label, bytes and description. |
