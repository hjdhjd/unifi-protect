[**unifi-protect**](../README.md)

***

[Home](../README.md) / Camera

# Interface: Camera

A camera projection. Inherits the read-through getters, live `observe`, and the write-through `update` and `reboot` commands from [DeviceProjection](DeviceProjection.md), and adds
the commands specific to cameras: a JPEG snapshot and a pooled livestream subscription. Camera-specific *configuration* (RTSP enablement, recording settings, and so
on) is expressed through `update` payloads rather than bespoke methods.

## Extends

- [`DeviceProjection`](DeviceProjection.md)\<[`ProtectCameraConfig`](../type-aliases/ProtectCameraConfig.md)\>

## Properties

| Property | Modifier | Type | Default value | Description | Overrides | Inherited from |
| ------ | ------ | ------ | ------ | ------ | ------ | ------ |
| <a id="id"></a> `id` | `readonly` | `string` | `undefined` | The device's stable id. | - | [`DeviceProjection`](DeviceProjection.md).[`id`](DeviceProjection.md#id) |
| <a id="modelkey"></a> `modelKey` | `readonly` | `"camera"` | `"camera"` | The device category discriminant, fixed by the concrete subclass. | [`DeviceProjection`](DeviceProjection.md).[`modelKey`](DeviceProjection.md#modelkey) | - |

## Accessors

### config

#### Get Signature

```ts
get config(): Readonly<TConfig>;
```

The record's current config, read through to the live store snapshot.

##### Throws

If the record is not present in the controller state.

##### Returns

`Readonly`\<`TConfig`\>

The current config.

#### Inherited from

[`DeviceProjection`](DeviceProjection.md).[`config`](DeviceProjection.md#config)

***

### isOnline

#### Get Signature

```ts
get isOnline(): boolean;
```

Whether the device is currently connected to the controller. Uses the same definition as the `online` selectors, so the projection and the collection views never
disagree about what "online" means.

##### Throws

If the device is no longer present in the controller state.

##### Returns

`boolean`

#### Inherited from

[`DeviceProjection`](DeviceProjection.md).[`isOnline`](DeviceProjection.md#isonline)

***

### name

#### Get Signature

```ts
get name(): string;
```

The device's display name - its user-assigned `name` when set, otherwise the controller's `displayName`.

##### Throws

If the device is no longer present in the controller state.

##### Returns

`string`

#### Inherited from

[`DeviceProjection`](DeviceProjection.md).[`name`](DeviceProjection.md#name)

## Methods

### livestream()

```ts
livestream(opts): LivestreamSubscription;
```

Subscribe to a live fMP4 stream from this camera. Delegates to the library-owned pool, which shares one underlying WebSocket across every consumer of an identical
stream and replays the cached init segment to late joiners. The returned subscription is an `AsyncIterable<Segment>` and `AsyncDisposable`; iterate it for segments,
dispose it (or abort its signal) to leave - the underlying session closes once the last subscriber departs.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `opts` | [`LivestreamOptions`](LivestreamOptions.md) | The stream source and tuning, plus the per-subscription options (abort signal, urgency, and discard-on-dispose). |

#### Returns

[`LivestreamSubscription`](LivestreamSubscription.md)

A live subscription.

***

### lux()

```ts
lux(opts?): Promise<number>;
```

Read the camera's current ambient-light level. This is a live *query* of the camera's lux sensor - the instantaneous illuminance reading - and is distinct from the
config's `isDark` boolean (a derived day/night flag the reducer already holds). Because the reading is telemetry the controller does not broadcast as state, there is
nothing for the reducer to fold it into, so it is a direct request rather than an observable field.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `opts` | \{ `signal?`: `AbortSignal`; \} | An optional abort signal. |
| `opts.signal?` | `AbortSignal` | - |

#### Returns

`Promise`\<`number`\>

The live illuminance reading, in lux.

#### Throws

When the camera has no ambient-light sensor (`featureFlags.hasLuxCheck` is unset), checked before any request is issued.

#### Throws

When the controller's 2xx response carries no numeric `illuminance` reading.

#### Throws

The classified `FatalError` on a non-2xx, or a transport-level `ProtectError` on failure.

***

### observe()

```ts
observe(opts?): AsyncGenerator<Camera>;
```

Observe this projection. The returned async iterable yields `this` each time the record's config changes by reference, and stays silent on dispatches that did not
touch it. Pair it with the sync getters: getters for "what is it now", observe for "tell me when it changes".

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `opts` | \{ `signal?`: `AbortSignal`; \} | Optional abort signal that terminates the iteration. |
| `opts.signal?` | `AbortSignal` | - |

#### Returns

`AsyncGenerator`\<`Camera`\>

An async iterable of this projection, yielding once per change.

#### Inherited from

[`DeviceProjection`](DeviceProjection.md).[`observe`](DeviceProjection.md#observe)

***

### peek()

```ts
peek(): 
  | Readonly<ProtectCameraConfigInterface>
  | undefined;
```

The record's current config if it is present, or `undefined` if it is not - the non-throwing companion to [config](#config). Reach for `peek()` to ask "is it present,
and if so what is it?": a record leaving the controller state (a device unadopted or removed, or the NVR before the first bootstrap) is an expected runtime
condition, so `peek()` reports its absence as `undefined` rather than treating it as an error. Reach for [config](#config) instead where the record's presence is a
precondition and an absence is a defect that should fail loudly. `peek() !== undefined` is the idiom for "is it still here?" on a held handle.

Like every projection read this is a live read-through to the current store snapshot, not a value cached at construction, so it always reflects the latest reduced
state. It is the single home of the raw snapshot read; [config](#config) is this read plus the absent-record guard.

#### Returns

  \| `Readonly`\<[`ProtectCameraConfigInterface`](ProtectCameraConfigInterface.md)\>
  \| `undefined`

The current config, or `undefined` if the record is not present in the controller state.

#### Inherited from

[`DeviceProjection`](DeviceProjection.md).[`peek`](DeviceProjection.md#peek)

***

### reboot()

```ts
reboot(opts?): Promise<void>;
```

Reboot the device. Every Protect device category exposes a reboot endpoint, so this is shared device behavior. Write-through: the controller drops and
re-establishes the device; the projection reflects the cycle as the realtime stream reports it (the response is not folded into the store).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `opts` | \{ `signal?`: `AbortSignal`; \} | Optional abort signal. |
| `opts.signal?` | `AbortSignal` | - |

#### Returns

`Promise`\<`void`\>

#### Throws

The classified `FatalError` on a non-2xx, or a transport-level `ProtectError` on failure.

#### Inherited from

[`DeviceProjection`](DeviceProjection.md).[`reboot`](DeviceProjection.md#reboot)

***

### snapshot()

```ts
snapshot(opts?): Promise<Buffer<ArrayBufferLike>>;
```

Fetch a current JPEG snapshot from the camera.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `opts` | [`SnapshotOptions`](SnapshotOptions.md) | Snapshot sizing and an optional abort signal. |

#### Returns

`Promise`\<`Buffer`\<`ArrayBufferLike`\>\>

The snapshot image bytes.

#### Throws

When `opts.packageCamera` is set but the camera has no package sensor (checked before any request is issued).

#### Throws

The classified `FatalError` on a non-2xx, or a transport-level `ProtectError` on failure.

***

### talkback()

```ts
talkback(opts?): Promise<TalkbackSession>;
```

Open a send-direction two-way-audio (talkback) channel to this camera's speaker. Negotiates the WebSocket and connects atomically: the returned promise resolves with
a live [TalkbackSession](TalkbackSession.md) or throws. The session is an `AsyncDisposable` - feed it audio with `session.send(source)` (a consumer-supplied
`AsyncIterable<Uint8Array>`, e.g. an ffmpeg `stdout` producing the format `config.talkbackSettings` describes) and dispose it (or abort its signal) to close. The
bytes are opaque; the library neither inspects nor transcodes them.

A client-side precondition is checked before any negotiation: a camera without a speaker cannot receive talkback, so this throws [ProtectUnsupportedError](../classes/ProtectUnsupportedError.md) up front rather than issuing a request the controller would reject - the package-snapshot precedent applied to the send channel. The
projection holds no talkback state (a set-once "talkback active" flag on a live view would be the stale-flag failure mode); each call mints an independent session.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `opts` | \{ `signal?`: `AbortSignal`; \} | An optional abort signal that cancels the connect and, once live, tears the session down. |
| `opts.signal?` | `AbortSignal` | - |

#### Returns

`Promise`\<[`TalkbackSession`](TalkbackSession.md)\>

A connected talkback session.

#### Throws

When the camera has no speaker (`featureFlags.hasSpeaker` is unset), checked before any negotiation.

#### Throws

The classified `FatalError` on a non-2xx negotiation, or a transport-level `ProtectError` when the socket fails to open.

***

### turnOnFlashlight()

```ts
turnOnFlashlight(opts?): Promise<void>;
```

Activate the package-camera downlight (the flashlight on dual-camera doorbells such as the G4/G5 Doorbell Pro). This is a **momentary** operation: the controller
exposes no off endpoint, and the light self-extinguishes roughly 25 seconds after the last activation. A consumer that wants the light to stay lit re-issues this
call on its own cadence (Protect's own apps pulse it every ~20 seconds); turning it off is simply ceasing to re-issue. The keepalive cadence is therefore consumer
policy - the library exposes only the single primitive operation. Write-through: the request is issued and the method returns.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `opts` | \{ `signal?`: `AbortSignal`; \} | An optional abort signal. |
| `opts.signal?` | `AbortSignal` | - |

#### Returns

`Promise`\<`void`\>

#### Throws

When the camera has no package sensor (`featureFlags.hasPackageCamera` is unset), checked before any request is issued.

#### Throws

The classified `FatalError` on a non-2xx, or a transport-level `ProtectError` on failure.

***

### unlock()

```ts
unlock(opts?): Promise<void>;
```

Release a paired UniFi Access lock on this camera. Currently the controller supports unlocking only Access readers attached to a camera on the same controller as
Protect. Write-through: the command is issued and the method returns; it does not fold any response into the store. Unlike a config command, an unlock has no
lock-state result to observe - the Access bridge is one-way. `accessDeviceMetadata.doorInfo.lockState` is static capability metadata that does *not* change on an
unlock (confirmed live against an Access reader, via both the realtime stream and a REST refresh), and the controller emits no firehose occurrence a consumer can act
on: a software unlock arrives as a device-less, bare `type: "access"` packet byte-identical to the user-session audit event the controller emits on every
authentication, so the library deliberately surfaces no unlock-confirmation event. Treat `unlock()` as fire-and-forget - it issues the command and resolves;
there is no realtime acknowledgement to await.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `opts` | \{ `signal?`: `AbortSignal`; \} | An optional abort signal. |
| `opts.signal?` | `AbortSignal` | - |

#### Returns

`Promise`\<`void`\>

#### Throws

When the camera has no paired Access lock (`accessDeviceMetadata.featureFlags.supportUnlock` is unset), checked before any
  request is issued.

#### Throws

The classified `FatalError` on a non-2xx, or a transport-level `ProtectError` on failure.

***

### update()

```ts
update(payload, opts?): Promise<Camera>;
```

Apply a configuration change to the device. Write-through: PATCHes the controller and returns this live handle on success. Does not mutate the store - the change
is reflected once the realtime stream (or the next refresh) delivers it.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `payload` | `DeepPartial`\<`TConfig`\> | The partial configuration to apply. |
| `opts` | \{ `signal?`: `AbortSignal`; \} | Optional abort signal. |
| `opts.signal?` | `AbortSignal` | - |

#### Returns

`Promise`\<`Camera`\>

This projection.

#### Throws

The classified `FatalError` on a non-2xx (e.g., [ProtectAuthorizationError](../classes/ProtectAuthorizationError.md) when the account lacks admin rights), or a transport-level
  `ProtectError` on failure.

#### Inherited from

[`DeviceProjection`](DeviceProjection.md).[`update`](DeviceProjection.md#update)
