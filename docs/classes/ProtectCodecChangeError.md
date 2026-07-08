[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectCodecChangeError

# Class: ProtectCodecChangeError

A pooled livestream reconnected and the controller negotiated a different codec than the one in flight (H.264 to HEVC, or a channel reconfigured mid-stream). Fatal
because no fixed-codec consumer can adapt in place: an FFmpeg pipe cannot re-initialize, and HKSV tolerates no second init segment. The pool surfaces this as the one
terminal a recovering stream can raise, after which the consumer re-subscribes for a fresh stream against the new codec. The `from` / `to` descriptors are the RFC 6381
codec strings the two init segments carried, so a consumer can log precisely what changed.

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
| `options` | \{ `cause?`: `unknown`; `from`: `string`; `to`: `string`; \} |
| `options.cause?` | `unknown` |
| `options.from` | `string` |
| `options.to` | `string` |

#### Returns

`ProtectCodecChangeError`

#### Overrides

```ts
FatalError.constructor
```

## Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="from"></a> `from` | `readonly` | `string` | The RFC 6381 codec descriptor the stream began with, before the reconnect. |
| <a id="to"></a> `to` | `readonly` | `string` | The RFC 6381 codec descriptor the reconnected stream negotiated. |
