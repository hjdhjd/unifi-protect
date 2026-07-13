[**unifi-protect**](../README.md)

***

[Home](../README.md) / TalkbackSession

# Interface: TalkbackSession

One talkback WebSocket, write-only. Constructed atomically via the static `connect()` (the constructor is private): it negotiates the URL, opens the socket,
and resolves to a live session or throws a typed `FatalError` - there is no half-open session. Feed it audio with [TalkbackSession.send](#send) and dispose it (or abort
its signal) to close.

## Implements

- `AsyncDisposable`

## Accessors

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
asyncDispose: Promise<void>;
```

Dispose the session. Delegates to [TalkbackSession.close](#close) so `await using session = ...` tears the socket down cleanly.

#### Returns

`Promise`\<`void`\>

#### Implementation of

```ts
AsyncDisposable.[asyncDispose]
```

***

### close()

```ts
close(): Promise<void>;
```

Close the session: request the WebSocket close, detach every listener, and destroy the owned agent. Idempotent and awaitable. An in-flight [TalkbackSession.send](#send) rejects.

#### Returns

`Promise`\<`void`\>

***

### send()

```ts
send(source, opts?): Promise<void>;
```

Drain a consumer-supplied audio source to the camera speaker. The single write entry: it sends each `Uint8Array` and pulls the next as fast as the source yields it,
so a real-time, producer-paced source streams at its own rate with no buffer growth. Resolves when the source is
exhausted; rejects with a typed [ProtectError](../classes/ProtectError.md) if the socket errors or closes mid-drain, if the caller's `signal` aborts, or if the socket's send buffer
crosses the `PROTECT_TALKBACK_MAX_BUFFERED_BYTES` safety ceiling (a non-real-time source the wire cannot keep up with). The bytes are opaque - whatever audio
format the camera expects (read `camera.config.talkbackSettings`); the library neither inspects nor transcodes them.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `source` | `AsyncIterable`\<`Uint8Array`\<`ArrayBufferLike`\>\> | The audio source to drain. A Node `Readable` (e.g. `ffmpeg.stdout`) is an `AsyncIterable<Buffer>` and feeds in directly. |
| `opts` | \{ `signal?`: `AbortSignal`; \} | An optional abort signal that ends this drain. |
| `opts.signal?` | `AbortSignal` | - |

#### Returns

`Promise`\<`void`\>

A promise that resolves when the source is exhausted.

#### Throws

[ProtectNetworkError](../classes/ProtectNetworkError.md) on a socket failure mid-drain or a buffer-ceiling overrun; [ProtectAbortedError](../classes/ProtectAbortedError.md) when the per-send `opts.signal` aborts or
  the session's own caller signal aborts mid-drain; any error the source itself raises propagates unwrapped.
