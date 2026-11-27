[**unifi-protect**](../README.md)

***

[Home](../README.md) / TalkbackSession

# Interface: TalkbackSession

One talkback channel, write-only. Constructed atomically via the static `connect()` (the constructor is private): it negotiates the endpoint, opens the socket
the endpoint names, and resolves to a live session or throws a typed `ProtectError` - there is no half-open session. Feed it audio with
[TalkbackSession.send](#send) and dispose it (or abort its signal) to close.

## Implements

- `AsyncDisposable`

## Accessors

### samplingRate

#### Get Signature

```ts
get samplingRate(): number;
```

The sampling rate, in hertz, the camera's talkback settings name, read from the controller once the negotiation had switched the camera to this session's codec,
so it is the rate the camera plays at while the session is live. An AAC source is encoded at it; an Opus stream decodes at 48000 whatever rate its encoder took,
so for an Opus source it is the rate the camera is set to, which an encoder may take as its own.

##### Returns

`number`

***

### state

#### Get Signature

```ts
get state(): TalkbackState;
```

The session's current lifecycle state, for diagnostics and tests.

##### Returns

[`TalkbackState`](../type-aliases/TalkbackState.md)

## Methods

### \[asyncDispose\]()

```ts
[asyncDispose](): Promise<void>;
```

Dispose the session. Delegates to [TalkbackSession.close](#close) so `await using session = ...` tears the socket down cleanly.

#### Returns

`Promise`\<`void`\>

#### Implementation of

`AsyncDisposable.[asyncDispose]`

***

### close()

```ts
close(): Promise<void>;
```

Close the session: detach every listener, request the socket's close, and release the connection the session owns. Safe to call more than once, and awaitable.
An in-flight [TalkbackSession.send](#send) rejects.

#### Returns

`Promise`\<`void`\>

***

### send()

```ts
send(source, opts?): Promise<void>;
```

Drain a consumer-supplied audio source to the camera speaker. The single write entry: it sends each `Uint8Array` and pulls the next as fast as the source yields it,
so a real-time, producer-paced source streams at its own rate with no buffer growth. Resolves when the source is exhausted; rejects with a typed
[ProtectError](../classes/ProtectError.md) if the socket errors or closes mid-drain, if the caller's `signal` aborts, or if the socket's send buffer crosses the
`PROTECT_TALKBACK_MAX_BUFFERED_BYTES` safety ceiling (a non-real-time source the wire cannot keep up with). On a socket fault, an abort, or the source's own error,
the source's cleanup (its `return()`) is requested and not awaited, so the rejection arrives at once and a generator's `finally` runs once its parked pull settles.

What a chunk holds is the codec's contract, and the library transcodes nothing. An AAC session passes its chunks through as bytes, in the ADTS stream the camera
plays at [TalkbackSession.samplingRate](#samplingrate), cut anywhere. An Opus session takes each chunk as exactly one raw Opus packet, the packet an Ogg or WebM container
carries with the container removed, and refuses a chunk that is not one. Every source paces itself, yielding audio no faster than it plays.

Await one drain before starting the next. Nothing serializes concurrent calls, so overlapping drains interleave their audio on the shared socket.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `source` | `AsyncIterable`\<`Uint8Array`\<`ArrayBufferLike`\>\> | The audio source to drain. A Node `Readable` (e.g. `ffmpeg.stdout`) is an `AsyncIterable<Buffer>` and feeds an AAC session directly. |
| `opts?` | \{ `signal?`: `AbortSignal`; \} | An optional abort signal that ends this drain. |
| `opts.signal?` | `AbortSignal` | - |

#### Returns

`Promise`\<`void`\>

A promise that resolves when the source is exhausted.

#### Throws

[ProtectNetworkError](../classes/ProtectNetworkError.md) on a socket failure mid-drain, a buffer-ceiling overrun, or a call made while the session is not live (never
  connected, or already closed/faulted); [ProtectAbortedError](../classes/ProtectAbortedError.md) when the per-send `opts.signal` aborts, the session's own caller signal aborts
  mid-drain, or when send() is called after an earlier caller-signal abort already tore the session down; [ProtectProtocolError](../classes/ProtectProtocolError.md) when an Opus session is
  handed a chunk that is not one Opus packet, which ends the drain and leaves the session live; any error the source itself raises propagates unwrapped.
