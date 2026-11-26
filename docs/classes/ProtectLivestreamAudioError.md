[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectLivestreamAudioError

# Class: ProtectLivestreamAudioError

A livestream asked for one audio codec, and the controller is streaming another. A UBV stream drops audio of a codec other than the one it asked for, and ends on
this once that audio has run, on its own clock and with none of the asked codec between, for as long as the library waits for a stream's audio
(`PROTECT_LIVESTREAM_AUDIO_WAIT_MS`): the controller is not honoring the request. The pool ends the stream on it at once, the way a codec change ends one,
rather than through the recovery policy, so `livestreamRecoveryExhausted` never publishes for it. A `"preferDirect"` stream whose direct socket carries the other
codec ends on it without trying the proxied route, because the fallback answers a failed dial and this is none. Fatal because no retry changes what the
controller streams; the consumer re-subscribes asking for the codec it gets.

## Extends

- [`FatalError`](FatalError.md)

## Constructors

### Constructor

```ts
new ProtectLivestreamAudioError(message, options?): ProtectLivestreamAudioError;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `message` | `string` |
| `options?` | \{ `cause?`: `unknown`; \} |
| `options.cause?` | `unknown` |

#### Returns

`ProtectLivestreamAudioError`

#### Overrides

`FatalError.constructor`
