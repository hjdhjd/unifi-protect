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

### isLost

#### Get Signature

```ts
get isLost(): boolean;
```

Whether the current recovery episode has concluded the connection lost. It turns true at the episode's first loss, the edge into `lost` that fires
`controllerLost`, holds through every failed attempt and every `reconnecting` that follows, and turns false at the edge recovery completes on, into `healthy` or
into `throttled` when the transport's breaker is open, which is the edge `controllerRecovered` follows. A fault that recovers before any attempt fails never
turns it on.

It changes only on a `stateChanged` transition: it is set before the edge into `lost` emits and cleared before the edge recovery completes on emits, so a
listener reads at each edge the value that edge stands for. It can read true together with [ConnectionMonitor.isRebooting](#isrebooting), since an anticipated reboot
can be lost too. Disposal emits no edge, so a disposed monitor keeps the value it last held.

##### Returns

`boolean`

***

### isRebooting

#### Get Signature

```ts
get isRebooting(): boolean;
```

Whether the current recovery episode is an anticipated controller reboot. It turns true at the edge into `degraded` when the fault that opens the episode lands
inside the window [ProtectClient.reboot](../classes/ProtectClient.md#reboot) arms once the controller accepts the reboot, holds through every phase recovery walks, a refusal or a long outage
among them, and turns false at the edge recovery completes on, into `healthy` or into `throttled` when the transport's breaker is open. A reboot armed while an
episode is underway leaves that episode as it opened and colors the next one if that episode opens inside the window.

It changes only on a `stateChanged` transition: it is set before the edge into `degraded` emits and cleared before the edge recovery completes on emits, so a
listener reads at each edge the value that edge stands for. It can read true together with [ConnectionMonitor.isLost](#islost), since a controller that is slow to
return from its reboot is lost as well. Disposal emits no edge, so a disposed monitor keeps the value it last held.

This describes the connection to the controller, unlike the `isRebooting` field of a device record, which is the controller's report on that device. Recovery
never gives up, so a controller that never returns keeps this true for as long as the monitor lives: a consumer that quiets its own presentation on it brings its
own time limit.

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
[asyncDispose](): Promise<void>;
```

Dispose the monitor: end the reboot-observation loop and any recovery wait, detach the throttle subscriptions, and tear the events stream down. A no-op on repeat.

#### Returns

`Promise`\<`void`\>

***

### expectReboot()

```ts
expectReboot(): void;
```

Arm the monitor to treat the fault that opens the next recovery episode as a *known* controller reboot, so recovery enters the long, return-time-anticipating
backoff track rather than the prompt one and [ConnectionMonitor.isRebooting](#isrebooting) reads true until recovery. Called by [ProtectClient.reboot](../classes/ProtectClient.md#reboot) after the
controller accepts the reboot - the one moment a fault's cause is certain. Package-internal: it is not a consumer recovery trigger, only a hint that colors the
recovery episode the imminent fault will trigger on its own.

The anticipation is bounded: it self-expires [PROTECT\_REBOOT\_ANTICIPATION\_WINDOW\_MS](../variables/PROTECT_REBOOT_ANTICIPATION_WINDOW_MS.md) after this call, and is consumed by the fault that opens the next episode,
while a fault inside an episode already underway neither consumes it nor changes that episode's track. So a reboot whose fault never arrives cannot mis-route a
much-later unrelated fault into the known track, and a fault after the window correctly takes the unknown track.

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
| `opts?` | \{ `signal?`: `AbortSignal`; \} | Optional abort signal that terminates the iteration. |
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
| <a id="type-parameter-k"></a> `K` *extends* keyof [`ConnectionEvents`](ConnectionEvents.md) |

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
| <a id="type-parameter-k-1"></a> `K` *extends* keyof [`ConnectionEvents`](ConnectionEvents.md) |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `event` | `K` | The event to await. |
| `opts?` | \{ `signal?`: `AbortSignal`; \} | Optional abort signal. |
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
| <a id="type-parameter-k-2"></a> `K` *extends* keyof [`ConnectionEvents`](ConnectionEvents.md) |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `event` | `K` | The event to stream. |
| `opts?` | [`StreamOptions`](StreamOptions.md) | Stream options, including the abort signal. |

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
| `opts?` | \{ `signal?`: `AbortSignal`; \} | Optional abort signal. |
| `opts.signal?` | `AbortSignal` | - |

#### Returns

`Promise`\<`void`\>

#### Throws

The classified `FatalError` on a non-2xx, or a transport-level `ProtectError` when the controller is unreachable.
