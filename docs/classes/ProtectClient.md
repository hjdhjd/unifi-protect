[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectClient

# Class: ProtectClient

The UniFi Protect client. Construct via [ProtectClient.connect](#connect).

## Implements

- `AsyncDisposable`

## Accessors

### cameras

#### Get Signature

```ts
get cameras(): readonly Camera[];
```

Every camera in the current state, as live projections.

##### Returns

readonly [`Camera`](../interfaces/Camera.md)[]

***

### chimes

#### Get Signature

```ts
get chimes(): readonly Chime[];
```

Every chime in the current state, as live projections.

##### Returns

readonly [`Chime`](../interfaces/Chime.md)[]

***

### connection

#### Get Signature

```ts
get connection(): ConnectionMonitor;
```

The connection monitor: the observable connection-state FSM, reboot detection, throttle/stall folding, and auto-recovery of the realtime events channel.

##### Returns

[`ConnectionMonitor`](../interfaces/ConnectionMonitor.md)

***

### controllerName

#### Get Signature

```ts
get controllerName(): string | null;
```

The controller's display name, or `null` before the first bootstrap. Sync sugar over [selectControllerName](../functions/selectControllerName.md) of the current snapshot.

##### Returns

`string` \| `null`

***

### fobs

#### Get Signature

```ts
get fobs(): readonly Fob[];
```

Every fob in the current state, as live projections.

##### Returns

readonly [`Fob`](../interfaces/Fob.md)[]

***

### isAdmin

#### Get Signature

```ts
get isAdmin(): boolean;
```

Whether the authenticated session holds Super Admin (camera-write) privileges. Sync sugar over [selectIsAdmin](../functions/selectIsAdmin.md) of the current snapshot, for the hot-path read
where awaiting an iterator is overkill; consumers `observe` the selector instead. Re-evaluated from state, so a role change surfaces on the next refresh.

##### Returns

`boolean`

***

### lights

#### Get Signature

```ts
get lights(): readonly Light[];
```

Every light in the current state, as live projections.

##### Returns

readonly [`Light`](../interfaces/Light.md)[]

***

### liveviews

#### Get Signature

```ts
get liveviews(): readonly ProtectNvrLiveviewConfigInterface[];
```

The controller's saved liveviews, as read-only config records. Sync sugar over [selectLiveviews](../variables/selectLiveviews.md) of the current snapshot - the common "list them" read; for a
by-id lookup use `selectLiveview(id)`, and for reactivity `client.state.observe(selectLiveviews)`. Liveviews are read-only config (no commands), so they are bare
records rather than a command-bearing projection, and a top-level collection rather than a child of `client.nvr` - they ride the realtime wire exactly as devices do.

##### Returns

readonly [`ProtectNvrLiveviewConfigInterface`](../interfaces/ProtectNvrLiveviewConfigInterface.md)[]

***

### nvr

#### Get Signature

```ts
get nvr(): Nvr;
```

The NVR configuration as a read-only, observable projection. A singleton sibling of the device projections: `client.nvr` always returns a handle (the NVR is a
singleton, so there is no `undefined` lookup), whose read-through getters (`host`, `rtspPort`, `name`, `marketName`) and `observe()` reflect the live reduced state.
It bears no commands - NVR config writes are out of scope and controller reboot is [ProtectClient.reboot](#reboot). The getters throw only before the first bootstrap,
which a connected client never reaches (`connect()` awaits it).

##### Returns

[`Nvr`](../interfaces/Nvr.md)

***

### relays

#### Get Signature

```ts
get relays(): readonly Relay[];
```

Every relay in the current state, as live projections.

##### Returns

readonly [`Relay`](../interfaces/Relay.md)[]

***

### ringtones

#### Get Signature

```ts
get ringtones(): readonly ProtectRingtoneConfigInterface[];
```

The controller's ringtone library, as read-only config records. Sync sugar over [selectRingtones](../variables/selectRingtones.md) of the current snapshot; for a by-id lookup use
`selectRingtone(id)`, and for reactivity `client.state.observe(selectRingtones)`. Surfaced identically to [liveviews](#liveviews) - the difference is only in lifecycle
(ringtones advance on the bootstrap refresh, as the controller broadcasts no realtime ringtone delta), which is invisible at this read-through surface.

##### Returns

readonly [`ProtectRingtoneConfigInterface`](../interfaces/ProtectRingtoneConfigInterface.md)[]

***

### sensors

#### Get Signature

```ts
get sensors(): readonly Sensor[];
```

Every sensor in the current state, as live projections.

##### Returns

readonly [`Sensor`](../interfaces/Sensor.md)[]

***

### state

#### Get Signature

```ts
get state(): StateStore;
```

The data layer: synchronous `snapshot()` and live `observe(selector)` over the reduced controller state.

##### Returns

[`StateStore`](../interfaces/StateStore.md)

***

### transport

#### Get Signature

```ts
get transport(): Transport;
```

The HTTP transport - the documented escape hatch for raw API calls the typed surface does not cover.

##### Returns

[`Transport`](../interfaces/Transport.md)

***

### viewers

#### Get Signature

```ts
get viewers(): readonly Viewer[];
```

Every viewer in the current state, as live projections.

##### Returns

readonly [`Viewer`](../interfaces/Viewer.md)[]

## Methods

### \[asyncDispose\]()

```ts
asyncDispose: Promise<void>;
```

Dispose the client: tear down the connection monitor (stopping recovery and closing the events stream), close every livestream session in the pool, stop the refresh
failsafe and terminate observers, end the session, and destroy the connection pool - in that order, so ingestion stops before the state and transport it feeds.
Safe to call more than once, and the canonical teardown via `await using client = await ProtectClient.connect(...)`.

#### Returns

`Promise`\<`void`\>

#### Implementation of

```ts
AsyncDisposable.[asyncDispose]
```

***

### camera()

```ts
camera(id): Camera | undefined;
```

Look up a camera by id, or `undefined` when no such camera is in the current state.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

#### Returns

[`Camera`](../interfaces/Camera.md) \| `undefined`

***

### chime()

```ts
chime(id): Chime | undefined;
```

Look up a chime by id, or `undefined` when absent.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

#### Returns

[`Chime`](../interfaces/Chime.md) \| `undefined`

***

### events()

```ts
events(opts?): AsyncGenerator<TypedEvent>;
```

The realtime event firehose: every [TypedEvent](../type-aliases/TypedEvent.md) the controller emits, until the signal aborts or the client is disposed. Sugar over `stream("packet")` that
unwraps the single-element argument tuple. Each event has already been dispatched into the store by the time it reaches here, so reading `client.state` inside the
loop observes the post-event state.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `opts` | \{ `signal?`: `AbortSignal`; \} | Optional abort signal that terminates the iteration. |
| `opts.signal?` | `AbortSignal` | - |

#### Returns

`AsyncGenerator`\<[`TypedEvent`](../type-aliases/TypedEvent.md)\>

An async iterable of typed events.

***

### fetchBootstrap()

```ts
fetchBootstrap(opts?): Promise<unknown>;
```

Fetch the controller bootstrap on demand and return the untouched parsed JSON. The library does not *retain* the raw bootstrap - it is consumed once at connect (and
on each refresh / recovery re-bootstrap) as a synthetic `bootstrapLoaded` event, and only the reduced state survives - so this is a fresh GET over the single shared
bootstrap-fetch path, returning the controller's response verbatim *without* dispatching it into the store. It is a faithful raw dump for diagnostics, not a cached
blob; the reduced, observable model remains `client.state`. The return type is `unknown` deliberately: this is whatever the controller sent, not the curated model.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `opts` | \{ `signal?`: `AbortSignal`; \} | Optional abort signal. |
| `opts.signal?` | `AbortSignal` | - |

#### Returns

`Promise`\<`unknown`\>

The raw bootstrap JSON as returned by the controller.

#### Throws

[ProtectBootstrapError](ProtectBootstrapError.md) when the bootstrap cannot be fetched or parsed, or a transport-level `ProtectError`.

***

### fob()

```ts
fob(id): Fob | undefined;
```

Look up a fob by id, or `undefined` when absent.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

#### Returns

[`Fob`](../interfaces/Fob.md) \| `undefined`

***

### light()

```ts
light(id): Light | undefined;
```

Look up a light by id, or `undefined` when absent.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

#### Returns

[`Light`](../interfaces/Light.md) \| `undefined`

***

### on()

```ts
on<K>(event, handler): Disposable;
```

Subscribe to a client event. Returns a `Disposable`; prefer `using sub = client.on(...)` so the listener detaches at scope exit.

#### Type Parameters

| Type Parameter |
| ------ |
| `K` *extends* keyof [`ProtectClientEvents`](../interfaces/ProtectClientEvents.md) |

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
once<K>(event, opts?): Promise<ProtectClientEvents[K]>;
```

Wait for the next emission of a client event.

#### Type Parameters

| Type Parameter |
| ------ |
| `K` *extends* keyof [`ProtectClientEvents`](../interfaces/ProtectClientEvents.md) |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `event` | `K` | The event to await. |
| `opts` | \{ `signal?`: `AbortSignal`; \} | Optional abort signal. |
| `opts.signal?` | `AbortSignal` | - |

#### Returns

`Promise`\<[`ProtectClientEvents`](../interfaces/ProtectClientEvents.md)\[`K`\]\>

A promise resolving to the event's argument tuple.

***

### rawPackets()

```ts
rawPackets(opts?): AsyncGenerator<RawPacket>;
```

The raw realtime firehose: every decoded [RawPacket](../interfaces/RawPacket.md) the controller emits - header plus payload, *before* classification - until the signal aborts or the
client is disposed. Unlike [ProtectClient.events](#events), this carries the valid-but-unmodeled frames the classifier drops (an unrecognized model key, an unhandled
action, a non-self-describing `event`), so it is the surface for protocol exploration and capture rather than the modeled state/event model. It is pure
observability: a raw packet is never dispatched into the store, so reading `client.state` inside this loop carries no ordering guarantee relative to the frame. Sugar
over `stream("rawPacket")` that unwraps the single-element argument tuple and smooths the caller's own abort into a clean return.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `opts` | \{ `signal?`: `AbortSignal`; \} | Optional abort signal that terminates the iteration. |
| `opts.signal?` | `AbortSignal` | - |

#### Returns

`AsyncGenerator`\<[`RawPacket`](../interfaces/RawPacket.md)\>

An async iterable of raw packets.

***

### reboot()

```ts
reboot(opts?): Promise<void>;
```

Reboot the UniFi OS controller hosting Protect. This is a controller-level operation - a UniFi-OS call (`POST /api/system/reboot`), distinct from a device's [DeviceProjection.reboot](../interfaces/DeviceProjection.md#reboot): it restarts the whole console, so every device drops and re-adopts. It lives on the client, not a projection, because it is out of the
Protect device model. The connection monitor observes the resulting outage and recovers automatically, firing `controllerLost` / `controllerRecovered` and - on the
controller's new boot time - `controllerRebooted`.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `opts` | \{ `signal?`: `AbortSignal`; \} | Optional abort signal. |
| `opts.signal?` | `AbortSignal` | - |

#### Returns

`Promise`\<`void`\>

#### Throws

The classified `FatalError` on a non-2xx (e.g. [ProtectAuthorizationError](ProtectAuthorizationError.md) when the account lacks reboot rights), or a transport-level `ProtectError`.

***

### relay()

```ts
relay(id): Relay | undefined;
```

Look up a relay by id, or `undefined` when absent.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

#### Returns

[`Relay`](../interfaces/Relay.md) \| `undefined`

***

### sensor()

```ts
sensor(id): Sensor | undefined;
```

Look up a sensor by id, or `undefined` when absent.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

#### Returns

[`Sensor`](../interfaces/Sensor.md) \| `undefined`

***

### stream()

```ts
stream<K>(event, opts?): AsyncIterable<ProtectClientEvents[K]>;
```

Stream every subsequent emission of a client event until the signal aborts.

#### Type Parameters

| Type Parameter |
| ------ |
| `K` *extends* keyof [`ProtectClientEvents`](../interfaces/ProtectClientEvents.md) |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `event` | `K` | The event to stream. |
| `opts` | [`StreamOptions`](../interfaces/StreamOptions.md) | Stream options, including the abort signal. |

#### Returns

`AsyncIterable`\<[`ProtectClientEvents`](../interfaces/ProtectClientEvents.md)\[`K`\]\>

An async iterable of the event's argument tuples.

***

### viewer()

```ts
viewer(id): Viewer | undefined;
```

Look up a viewer by id, or `undefined` when absent.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

#### Returns

[`Viewer`](../interfaces/Viewer.md) \| `undefined`

***

### classifyPacket()

```ts
static classifyPacket(packet): TypedEvent | null;
```

Classify a decoded [RawPacket](../interfaces/RawPacket.md) into a [TypedEvent](../type-aliases/TypedEvent.md), or `null` when the packet is valid but describes something the library does not model. The static,
pure, connection-independent counterpart of the [ProtectClient.events](#events) rail (which is this same classification applied to the live socket). Takes the output of
[ProtectClient.decodePacket](#decodepacket), so the two compose to turn captured bytes into a typed event exactly as the realtime path does - one decode/classify
implementation, reached the same way live and offline.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `packet` | [`RawPacket`](../interfaces/RawPacket.md) | The decoded raw packet. |

#### Returns

[`TypedEvent`](../type-aliases/TypedEvent.md) \| `null`

The classified event, or `null` for a valid-but-unmodeled packet.

***

### connect()

```ts
static connect(opts): Promise<ProtectClient>;
```

Connect to a Protect controller. Logs in, fetches the initial bootstrap, seeds the reducer, and wires the periodic refresh failsafe - all as one atomic operation.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `opts` | [`ConnectOptions`](../interfaces/ConnectOptions.md) | The controller address, credentials, and optional seams (logger, clock, refresh interval, injected dispatcher, abort signal). |

#### Returns

`Promise`\<`ProtectClient`\>

A fully-ready client.

#### Throws

[ProtectAuthError](ProtectAuthError.md) on bad credentials, [ProtectNetworkError](ProtectNetworkError.md) when the controller is unreachable, [ProtectBootstrapError](ProtectBootstrapError.md) when the
  bootstrap cannot be fetched or parsed - and any other typed `FatalError` the login or fetch surfaces. No partial client escapes a failure.

***

### decodePacket()

```ts
static decodePacket(buf): RawPacket;
```

Decode a raw realtime packet's bytes into a [RawPacket](../interfaces/RawPacket.md) - the validated wire header plus the data-frame payload, *before* classification. A static, pure,
connection-independent operation: it is the offline counterpart of the [ProtectClient.rawPackets](#rawpackets) rail (which is this same decode applied to the live socket),
and it is a `static` rather than an instance method precisely because decoding needs no client - it reads no connection state. Pair it with [ProtectClient.classifyPacket](#classifypacket) to reproduce the live pipeline (`classifyPacket(decodePacket(bytes))`) over captured bytes.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `buf` | `Uint8Array` | The raw packet bytes (a `Buffer` included; read without copying). |

#### Returns

[`RawPacket`](../interfaces/RawPacket.md)

The decoded raw packet.

#### Throws

[ProtectProtocolError](ProtectProtocolError.md) if the bytes are not a well-formed packet.

***

### eventSubjects()

```ts
static eventSubjects(event): readonly string[];
```

The id(s) of the record(s) a [TypedEvent](../type-aliases/TypedEvent.md) concerns - a camera for a camera activity signal, the access device for an access occurrence, the reduced
record for a state transition, none for the synthetic bootstrap. The static, pure counterpart that attributes any firehose event to its device(s) without a
consumer re-deriving the mapping - the single source of truth the CLI's `--device` filter and event rendering both read, surfaced on the object model exactly
like [ProtectClient.classifyPacket](#classifypacket). Total and exhaustive: it cannot silently lag a new event kind.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `event` | [`TypedEvent`](../type-aliases/TypedEvent.md) | Any [TypedEvent](../type-aliases/TypedEvent.md), e.g. from [ProtectClient.events](#events) or [ProtectClient.classifyPacket](#classifypacket). |

#### Returns

readonly `string`[]

The subject record id(s), possibly empty.
