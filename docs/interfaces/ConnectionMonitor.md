[**unifi-protect**](../README.md)

***

[Home](../README.md) / ConnectionMonitor

# Interface: ConnectionMonitor

The connection-state coordinator. Constructed by `ProtectClient.connect()`; consumers read it as `client.connection`.

## Accessors

### isHealthy

#### Get Signature

```ts
get isHealthy(): boolean;
```

Whether the connection is in steady operation.

##### Returns

`boolean`

***

### isThrottled

#### Get Signature

```ts
get isThrottled(): boolean;
```

Whether the transport's throttle breaker is open. Delegates verbatim to the transport - the single source of truth for reachability backoff.

##### Returns

`boolean`

***

### opened

#### Get Signature

```ts
get opened(): Promise<void>;
```

The initial events-channel open handshake. The composition root awaits this to complete the atomic connect; a failure tears the client down.

##### Returns

`Promise`\<`void`\>

***

### state

#### Get Signature

```ts
get state(): ConnectionState;
```

The current connection state. Derived live from the recovery phase and the transport's throttle verdict, so it can never drift from a separately-stored enum.

##### Returns

[`ConnectionState`](../type-aliases/ConnectionState.md)

## Methods

### \[asyncDispose\]()

```ts
asyncDispose: Promise<void>;
```

Dispose the monitor: end the reboot-observation loop and any recovery wait, detach the throttle subscriptions, and tear the events stream down. Idempotent.

#### Returns

`Promise`\<`void`\>

***

### expectReboot()

```ts
expectReboot(): void;
```

Arm the monitor to treat the next connection fault as a *known* controller reboot, so recovery enters the long, return-time-anticipating backoff track rather than
the prompt one. Called by [ProtectClient.reboot](../classes/ProtectClient.md#reboot) after the controller accepts the reboot - the one moment a fault's cause is certain. Package-internal: it is
not a consumer recovery trigger, only a hint that colors the recovery episode the imminent fault will trigger on its own.

The anticipation is bounded: it self-expires [PROTECT\_REBOOT\_ANTICIPATION\_WINDOW\_MS](../variables/PROTECT_REBOOT_ANTICIPATION_WINDOW_MS.md) after now, and is consumed by the next fault. So a reboot whose fault
never arrives cannot mis-route a much-later unrelated fault into the known track, and a fault after the window correctly takes the unknown track.

#### Returns

`void`

***

### observe()

```ts
observe(opts?): AsyncGenerator<ConnectionTransition>;
```

Observe the connection-state machine: every [ConnectionTransition](ConnectionTransition.md) until the signal aborts. Sugar over `stream("stateChanged")` that unwraps the single-element
argument tuple and ends quietly on the caller's own abort.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `opts` | \{ `signal?`: `AbortSignal`; \} | Optional abort signal that terminates the iteration. |
| `opts.signal?` | `AbortSignal` | - |

#### Returns

`AsyncGenerator`\<[`ConnectionTransition`](ConnectionTransition.md)\>

An async iterable of state transitions.

***

### on()

```ts
on<K>(event, handler): Disposable;
```

Subscribe to a connection event. Returns a `Disposable`; prefer `using sub = connection.on(...)` so the listener detaches at scope exit.

#### Type Parameters

| Type Parameter |
| ------ |
| `K` *extends* keyof [`ConnectionEvents`](ConnectionEvents.md) |

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
once<K>(event, opts?): Promise<ConnectionEvents[K]>;
```

Wait for the next emission of a connection event.

#### Type Parameters

| Type Parameter |
| ------ |
| `K` *extends* keyof [`ConnectionEvents`](ConnectionEvents.md) |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `event` | `K` | The event to await. |
| `opts` | \{ `signal?`: `AbortSignal`; \} | Optional abort signal. |
| `opts.signal?` | `AbortSignal` | - |

#### Returns

`Promise`\<[`ConnectionEvents`](ConnectionEvents.md)\[`K`\]\>

A promise resolving to the event's argument tuple.

***

### stream()

```ts
stream<K>(event, opts?): AsyncIterable<ConnectionEvents[K]>;
```

Stream every subsequent emission of a connection event until the signal aborts.

#### Type Parameters

| Type Parameter |
| ------ |
| `K` *extends* keyof [`ConnectionEvents`](ConnectionEvents.md) |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `event` | `K` | The event to stream. |
| `opts` | [`StreamOptions`](StreamOptions.md) | Stream options, including the abort signal. |

#### Returns

`AsyncIterable`\<[`ConnectionEvents`](ConnectionEvents.md)\[`K`\]\>

An async iterable of the event's argument tuples.

***

### verify()

```ts
verify(opts?): Promise<void>;
```

Explicitly probe the controller's liveness (a GET against the bootstrap endpoint). Resolves when the controller answers, throws the classified error otherwise. The
same probe the recovery loop uses; exposed so a consumer can check reachability on demand.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `opts` | \{ `signal?`: `AbortSignal`; \} | Optional abort signal. |
| `opts.signal?` | `AbortSignal` | - |

#### Returns

`Promise`\<`void`\>

#### Throws

The classified `FatalError` on a non-2xx, or a transport-level `ProtectError` when the controller is unreachable.
