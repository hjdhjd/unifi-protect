[**unifi-protect**](../README.md)

***

[Home](../README.md) / LivestreamSubscription

# Interface: LivestreamSubscription

A consumer's handle into a pooled livestream. It is an `AsyncIterable<Segment>` (the iterator *is* the surface - no callback rail) and `AsyncDisposable`. Each
subscription has its **own unbounded queue**: the pool pushes every segment to every subscriber, so one slow consumer cannot stall a fast one, and nothing is dropped.

The stream is **resilient by default**: a recoverable stall or reconnect is invisible to the iterator - it pauses while the underlying session is re-established and
resumes seamlessly when segments flow again (a same-codec reconnect suppresses the redundant init). The iterator terminates only on these conditions: disposal (a
clean `done`), a codec change across a reconnect (it throws [ProtectCodecChangeError](../classes/ProtectCodecChangeError.md)), and the recovery policy giving up (it throws [ProtectLivestreamUnavailableError](../classes/ProtectLivestreamUnavailableError.md)). A recoverable stall is *not* one of them.

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
get initSegment(): 
  | {
  codec: string;
  data: Buffer;
}
  | null;
```

The cached initialization segment of the shared stream once it has arrived, otherwise `null`. Stable across same-codec reconnects (it is suppressed and the cache is
retained), and replaced only on a codec change - which is itself terminal, so a consumer never observes the cached init mutate beneath it mid-stream.

##### Returns

  \| \{
  `codec`: `string`;
  `data`: `Buffer`;
\}
  \| `null`

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
asyncDispose: Promise<void>;
```

Dispose the subscription: detach it from its shared session (decrementing the reference count, which tears the session down if it was the last), end any in-flight
iteration, and detach the consumer's abort listener. Idempotent.

#### Returns

`Promise`\<`void`\>

#### Implementation of

```ts
AsyncDisposable.[asyncDispose]
```

***

### \[asyncIterator\]()

```ts
asyncIterator: AsyncIterator<Segment>;
```

Iterate the segments of this subscription. The iterator yields every queued segment, then either ends (clean close / disposal) or throws the terminal error (codec
change or give-up). A recoverable stall is invisible - the iterator parks and resumes. Breaking out of the loop disposes the subscription.

#### Returns

`AsyncIterator`\<[`Segment`](../type-aliases/Segment.md)\>

An async iterator of segments.

#### Implementation of

```ts
AsyncIterable.[asyncIterator]
```

***

### close()

```ts
close(): void;
```

#### Returns

`void`

***

### fail()

```ts
fail(error): void;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `error` | [`ProtectError`](../classes/ProtectError.md) |

#### Returns

`void`

***

### push()

```ts
push(segment): void;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `segment` | [`Segment`](../type-aliases/Segment.md) |

#### Returns

`void`

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

Resolve once the shared stream has produced its first MEDIA segment (`true`), or once it has given up before ever establishing (`false`). Liveness is media-keyed: a
controller that connects and acks with an init but then produces no media is NOT established - it elapses its recovery window and reconnects, so this resolves `true`
only when media is actually flowing. This is the boundary the two recovery regimes hinge on - a consumer awaits it to know media came up at all before settling into
the resilient steady state.

#### Returns

`Promise`\<`boolean`\>

A promise resolving `true` once the first media segment flows, `false` if establishment was abandoned.
