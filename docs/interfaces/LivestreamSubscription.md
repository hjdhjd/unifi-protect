[**unifi-protect**](../README.md)

***

[Home](../README.md) / LivestreamSubscription

# Interface: LivestreamSubscription

A consumer's handle into a pooled livestream. It is an `AsyncIterable<Segment>` (the iterator *is* the surface - no callback rail) and `AsyncDisposable`. Each
subscription has its **own unbounded queue**: the pool pushes every segment to every subscriber, so one slow consumer cannot stall a fast one, and nothing is dropped.

The stream is **resilient by default**: a recoverable stall or reconnect is invisible to the iterator - it pauses while the underlying session is re-established and
resumes uninterrupted when segments flow again (a reconnect to the same stream, whose init carries the same codec label and description, suppresses the redundant
init). The iterator terminates only on these conditions: disposal (a clean `done`), a reconnect whose init differs in its codec label or its description (it throws
[ProtectCodecChangeError](../classes/ProtectCodecChangeError.md)), and the recovery policy giving up (it throws [ProtectLivestreamUnavailableError](../classes/ProtectLivestreamUnavailableError.md)). A recoverable stall is *not* one of them.

## Implements

- `AsyncIterable`\<[`Segment`](../type-aliases/Segment.md)\>
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
it; a reconnect to the same stream, one whose init carries the same label and description, keeps it (the redundant re-init is suppressed and the cache is
retained); any later init within the same session refreshes it. A reconnect whose label or description differs is terminal and never replaces it.

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
[asyncIterator](): AsyncIterator<Segment>;
```

Iterate the segments of this subscription. The iterator yields every queued segment, then either ends (clean close / disposal) or throws the terminal error (codec
change or give-up). A recoverable stall is invisible - the iterator parks and resumes. Breaking out of the loop disposes the subscription.

#### Returns

`AsyncIterator`\<[`Segment`](../type-aliases/Segment.md)\>

An async iterator of segments.

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
establishing, or this subscription itself was disposed - its own signal aborting, an explicit `await using` exit, or breaking its iterator - so a departed
subscriber's own wait ends with the subscription rather than hanging on the shared establishment latch until the remaining subscribers happen to settle it. The
boolean deliberately does not distinguish these outcomes because every consumer's correct reaction is identical: stop waiting and clean up.

#### Returns

`Promise`\<`boolean`\>

A promise resolving `true` once the first media segment flows, `false` if establishment was abandoned or this subscription was disposed first.
