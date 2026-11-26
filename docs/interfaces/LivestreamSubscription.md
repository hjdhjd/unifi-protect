[**unifi-protect**](../README.md)

***

[Home](../README.md) / LivestreamSubscription

# Interface: LivestreamSubscription\<T\>

A consumer's handle into a pooled livestream. It is an `AsyncIterable` of what the subscriber asked for (the iterator *is* the surface - no callback rail) and
`AsyncDisposable`: fMP4 [Segment](../type-aliases/Segment.md)s by default, or, for a frames subscription, the [LivestreamFrame](../type-aliases/LivestreamFrame.md)s of a UBV stream, which need no init and are
replayed none. Each subscription has its **own unbounded queue**: the pool pushes every item of its output to every subscriber of that output, so one slow
consumer cannot stall a fast one, and nothing is dropped.

The stream is **resilient by default**: a recoverable stall or reconnect is invisible to the iterator - it pauses while the underlying session is re-established and
resumes uninterrupted when segments flow again (a reconnect to the same stream, whose init carries the same codec label, description and sample descriptions,
suppresses the redundant init, as an identical init on a live session is swallowed). The iterator terminates only on these conditions: disposal (a clean `done`),
an init, on a reconnect or on a live session, whose codec label, description or a track's sample description differs from the stream's (it throws
[ProtectCodecChangeError](../classes/ProtectCodecChangeError.md)), a `"direct"` stream or one asking for Opus whose negotiation offered no direct address (it throws
[ProtectLivestreamRouteError](../classes/ProtectLivestreamRouteError.md)), a UBV stream carrying an audio codec other than the one it asked for (it throws [ProtectLivestreamAudioError](../classes/ProtectLivestreamAudioError.md)), an
Opus stream whose socket cannot send its play command (it throws [ProtectConfigurationError](../classes/ProtectConfigurationError.md)), and the recovery policy giving up (it throws
[ProtectLivestreamUnavailableError](../classes/ProtectLivestreamUnavailableError.md)). A recoverable stall is *not* one of them. A frames subscription meets the same terminals, the codec gate reading the
stream's segments for it.

## Type Parameters

| Type Parameter | Default type | Description |
| ------ | ------ | ------ |
| <a id="type-parameter-t"></a> `T` | [`Segment`](../type-aliases/Segment.md) | What the subscription iterates: [Segment](../type-aliases/Segment.md), the default, or [LivestreamFrame](../type-aliases/LivestreamFrame.md) for a frames subscription. |

## Implements

- `AsyncIterable`\<`T`\>
- `AsyncDisposable`

## Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="id"></a> `id` | `readonly` | `string` | This subscription's unique id, correlated with the `subscription:created` / `:disposed` diagnostics. |

## Accessors

### codec

#### Get Signature

```ts
get codec(): string;
```

The negotiated RFC 6381 codec descriptor once the init segment has arrived, otherwise `""`. Read through to the shared session's cached init, the single source.

##### Returns

`string`

***

### initSegment

#### Get Signature

```ts
get initSegment(): LivestreamInit | null;
```

The cached initialization segment of the shared stream once it has arrived, otherwise `null`: its codec label, its bytes and its description. The first init sets
it, and nothing replaces it: a later init of the same stream, one carrying the same label, description and sample descriptions, on a reconnect or on a live
session, is suppressed and the cache retained, and a later init whose label, description or a track's sample description differs is terminal.

##### Returns

[`LivestreamInit`](LivestreamInit.md) \| `null`

***

### state

#### Get Signature

```ts
get state(): LivestreamSubscriptionState;
```

The coarse, stable lifecycle state. `"closed"` once this subscription is disposed; else the shared stream's state (a recoverable stall reads `"recovering"`).

##### Returns

[`LivestreamSubscriptionState`](../type-aliases/LivestreamSubscriptionState.md)

***

### stats

#### Get Signature

```ts
get stats(): LivestreamSubscriptionStats;
```

The live delivery counters for this subscription. `queueDepth` / `peakQueueDepth` let a consumer detect that it is falling behind.

##### Returns

[`LivestreamSubscriptionStats`](LivestreamSubscriptionStats.md)

## Methods

### \[asyncDispose\]()

```ts
[asyncDispose](): Promise<void>;
```

Dispose the subscription: detach it from its shared session when it joined one (decrementing the reference count, which tears the session down if it was the
last), end any in-flight iteration, and detach the consumer's abort listener. Safe to call more than once.

#### Returns

`Promise`\<`void`\>

#### Implementation of

`AsyncDisposable.[asyncDispose]`

***

### \[asyncIterator\]()

```ts
[asyncIterator](): AsyncIterator<T>;
```

Iterate this subscription's items: its segments, or its frames for a frames subscription. The iterator yields every queued item, then either ends (clean close /
disposal) or throws the terminal error (a codec change, a missing direct address, another audio codec, a socket that cannot send, or a give-up). A recoverable
stall is invisible - the iterator parks and resumes. Breaking out of the loop disposes the subscription.

#### Returns

`AsyncIterator`\<`T`\>

An async iterator of the subscription's items.

#### Implementation of

`AsyncIterable.[asyncIterator]`

***

### reassess()

```ts
reassess(): void;
```

Ask the shared stream's recovery policy to re-decide now - for example when this consumer's urgency just changed. It only re-decides an *in-flight* recovery episode,
so on a healthy stream it is a no-op; it never forces a reconnect of a working connection.

#### Returns

`void`

***

### whenEstablished()

```ts
whenEstablished(): Promise<boolean>;
```

Resolve `true` once the shared stream has produced its first MEDIA segment, or `false` once this subscription's wait for it is over. Liveness is
media-keyed: a controller that connects and acks with an init but then produces no media is NOT established - it elapses its recovery window and reconnects, so this
resolves `true` only when media is actually flowing. It resolves `false` in every case where the wait is over without media: the shared stream gave up
establishing or ended on a terminal first, or this subscription itself was disposed - its own signal aborting, an explicit `await using` exit, or breaking its
iterator - so a departed subscriber's own wait ends with the subscription rather than hanging on the shared establishment latch until the remaining subscribers
happen to settle it. The boolean deliberately does not distinguish these outcomes because every consumer's correct reaction is identical: stop waiting and clean
up. A frames subscription is established by the same media: a UBV stream always writes its segments, whether or not a subscriber iterates them, so its first
media segment, not its first frame, resolves the wait.

#### Returns

`Promise`\<`boolean`\>

A promise resolving `true` once the first media segment flows, `false` if establishment was abandoned or this subscription was disposed first.
