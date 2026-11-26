[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectLivestreamRouteError

# Class: ProtectLivestreamRouteError

A livestream's request needs a direct address the controller's negotiation did not offer: none at all, one that does not parse, or one that is not `wss:`. A
request needs one when it is a stream on its `"direct"` route, which dials it, or a stream asking for Opus over UBV, whose proxied route names its stream by
that address's path. A session raises it as it tears down, before it builds any socket, and the pool ends such a stream on it, the way a codec change ends one,
rather than through the recovery policy, so `livestreamRecoveryExhausted` never publishes for a request that could never succeed. A `"preferDirect"` stream
asking for Opus ends on it at its direct attempt, since its proxied route needs the same address. Fatal because the controller answers every renegotiation the
same way; the consumer re-subscribes on the `"proxied"` or `"preferDirect"` route, or asking for AAC.

## Extends

- [`FatalError`](FatalError.md)

## Constructors

### Constructor

```ts
new ProtectLivestreamRouteError(message, options?): ProtectLivestreamRouteError;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `message` | `string` |
| `options?` | \{ `cause?`: `unknown`; \} |
| `options.cause?` | `unknown` |

#### Returns

`ProtectLivestreamRouteError`

#### Overrides

`FatalError.constructor`
