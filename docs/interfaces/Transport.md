[**unifi-protect**](../README.md)

***

[Home](../README.md) / Transport

# Interface: Transport

The HTTP transport. Owns the undici connection pool, composes each request's deadline with the caller's cancellation, classifies every failure into the typed
`ProtectError` hierarchy, and runs the throttle circuit breaker that protects a degraded controller from being hammered.

The breaker is the canonical three-state model - `closed -> open -> half-open -> closed`:

- **closed:** normal operation. Each completed request books an outcome; a 2xx resets the consecutive-failure count, a non-2xx or transport exception increments
  it. Crossing [PROTECT\_API\_ERROR\_LIMIT](../variables/PROTECT_API_ERROR_LIMIT.md) consecutive failures trips the breaker open.
- **open:** for [PROTECT\_API\_RETRY\_INTERVAL](../variables/PROTECT_API_RETRY_INTERVAL.md) seconds, `send` throws [ProtectThrottledError](../classes/ProtectThrottledError.md) before dispatching - no traffic reaches the controller.
- **half-open:** once the cooldown elapses, requests are allowed through again as recovery probes. The first success closes the breaker (and emits `throttleExited`
  only then, so the public signal never flaps); a failure re-arms the cooldown from that moment and stays open silently.

Reachability lives here; session validity lives in `AuthSession`. The breaker never calls login to probe recovery - the next real request is
the probe, and the orthogonal 401-relogin concern is the injected `onUnauthorized` seam. The clock is injected so every transition is deterministically testable.

## Implements

- `AsyncDisposable`

## Accessors

### isThrottled

#### Get Signature

```ts
get isThrottled(): boolean;
```

Whether the throttle breaker is currently open (refusing or probing). Reads the breaker state synchronously - safe to call on a hot path. The
`ConnectionMonitor` reads this to fold transport health into the connection FSM.

##### Returns

`boolean`

## Methods

### \[asyncDispose\]()

```ts
asyncDispose: Promise<void>;
```

Dispose the transport, destroying the owned pool. A no-op on an injected dispatcher.

#### Returns

`Promise`\<`void`\>

#### Implementation of

```ts
AsyncDisposable.[asyncDispose]
```

***

### on()

```ts
on<K>(event, handler): Disposable;
```

Subscribe to a transport event. Returns a `Disposable`; prefer `using sub = transport.on(...)` so the listener detaches at scope exit.

#### Type Parameters

| Type Parameter |
| ------ |
| `K` *extends* keyof [`TransportEvents`](TransportEvents.md) |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `event` | `K` | The event to listen for. |
| `handler` | (...`args`) => `void` | Invoked on each emission. |

#### Returns

`Disposable`

A `Disposable` that removes the listener when disposed.

***

### once()

```ts
once<K>(event, opts?): Promise<TransportEvents[K]>;
```

Wait for the next emission of a transport event.

#### Type Parameters

| Type Parameter |
| ------ |
| `K` *extends* keyof [`TransportEvents`](TransportEvents.md) |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `event` | `K` | The event to await. |
| `opts` | \{ `signal?`: `AbortSignal`; \} | Optional abort signal. |
| `opts.signal?` | `AbortSignal` | - |

#### Returns

`Promise`\<[`TransportEvents`](TransportEvents.md)\[`K`\]\>

A promise resolving to the event's argument tuple.

***

### request()

```ts
request<T>(url, opts?): Promise<T>;
```

Send a request, assert a 2xx, and parse the body as JSON. The ergonomic path over [Transport.send](#send) for the common JSON case.

#### Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| `T` | The expected shape of the parsed body. |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `url` | `string` | The fully-qualified request URL. |
| `opts` | [`RequestOptions`](RequestOptions.md) | Per-request options. |

#### Returns

`Promise`\<`T`\>

The parsed body.

#### Throws

The classified `FatalError` on a non-2xx, or a transport-level `ProtectError` on failure.

***

### reset()

```ts
reset(): void;
```

Rebuild the owned connection pool, dropping every keepalive connection to the controller. Called when the breaker trips so the next attempt starts from a clean
pool rather than reusing sockets to a degraded controller. A no-op when the dispatcher was injected - that lifecycle belongs to the injector.

#### Returns

`void`

***

### send()

```ts
send(url, opts?): Promise<ProtectResponse>;
```

Send a request and return the [ProtectResponse](ProtectResponse.md) for any HTTP status. Throttle-gates before dispatching, composes the caller's signal with the timeout
deadline, classifies transport failures into typed errors, books the breaker outcome, and runs the 401-relogin retry (once) when a hook is wired.

This is the transport primitive. Callers that want the ergonomic "throw on non-2xx and parse JSON" path use [Transport.request](#request); callers that need raw
status, headers, or bytes (the auth handshake, snapshots) use `send` directly.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `url` | `string` | The fully-qualified request URL. |
| `opts` | [`SendOptions`](SendOptions.md) | Per-request options. |

#### Returns

`Promise`\<[`ProtectResponse`](ProtectResponse.md)\>

The response.

#### Throws

[ProtectThrottledError](../classes/ProtectThrottledError.md) while the breaker is open and cooling; [ProtectTimeoutError](../classes/ProtectTimeoutError.md), [ProtectAbortedError](../classes/ProtectAbortedError.md), or
  [ProtectNetworkError](../classes/ProtectNetworkError.md) on transport-level failures.

***

### stream()

```ts
stream<K>(event, opts?): AsyncIterable<TransportEvents[K]>;
```

Stream every subsequent emission of a transport event until the signal aborts.

#### Type Parameters

| Type Parameter |
| ------ |
| `K` *extends* keyof [`TransportEvents`](TransportEvents.md) |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `event` | `K` | The event to stream. |
| `opts` | [`StreamOptions`](StreamOptions.md) | Stream options, including the abort signal. |

#### Returns

`AsyncIterable`\<[`TransportEvents`](TransportEvents.md)\[`K`\]\>

An async iterable of the event's argument tuples.
