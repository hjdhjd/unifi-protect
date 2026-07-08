[**unifi-protect**](../README.md)

***

[Home](../README.md) / DeviceProjection

# Abstract Interface: DeviceProjection\<TConfig\>

The shared base of every *device* projection (`Camera`, `Chime`, `Fob`, `Light`, `Relay`, `Sensor`, `Viewer`). It extends the read-only [Projection](Projection.md) core with
what every device category adds: a stable `id`, the `modelKey` discriminant, the `name` / `isOnline` getters, and the write-through `update` and `reboot` commands
(every Protect device type exposes a reboot endpoint).

Commands are **write-through**: `update` PATCHes the controller and returns the same live handle, but does *not* fold the response into the store. State advances
solely through the reducer's two universal inputs - the realtime event stream and the bootstrap refresh failsafe - so the issuer learns of its own change the way every
other subscriber does (the controller broadcasts the resulting `devicePatched` to all WebSocket subscribers). The consequence is that a projection reflects a command's
effect once the stream (or the next refresh) delivers it, not synchronously after the `await`; consumers `observe()` rather than read-after-write.

## Extends

- [`Projection`](Projection.md)\<`TConfig`\>

## Extended by

- [`Camera`](Camera.md)
- [`Chime`](Chime.md)
- [`Fob`](Fob.md)
- [`Light`](Light.md)
- [`Relay`](Relay.md)
- [`Sensor`](Sensor.md)
- [`Viewer`](Viewer.md)

## Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| `TConfig` *extends* [`ProtectDeviceConfig`](../type-aliases/ProtectDeviceConfig.md) | The concrete device-config-record type this projection wraps. |

## Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="id"></a> `id` | `readonly` | `string` | The device's stable id. |
| <a id="modelkey"></a> `modelKey` | `abstract` | \| `"camera"` \| `"chime"` \| `"fob"` \| `"light"` \| `"relay"` \| `"sensor"` \| `"viewer"` \| `"nvr"` | The device category discriminant, fixed by the concrete subclass. |

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

[`Projection`](Projection.md).[`config`](Projection.md#config)

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

## Methods

### observe()

```ts
observe(opts?): AsyncGenerator<DeviceProjection<TConfig>>;
```

Observe this projection. The returned async iterable yields `this` each time the record's config changes by reference, and stays silent on dispatches that did not
touch it. Pair it with the sync getters: getters for "what is it now", observe for "tell me when it changes".

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `opts` | \{ `signal?`: `AbortSignal`; \} | Optional abort signal that terminates the iteration. |
| `opts.signal?` | `AbortSignal` | - |

#### Returns

`AsyncGenerator`\<`DeviceProjection`\<`TConfig`\>\>

An async iterable of this projection, yielding once per change.

#### Inherited from

[`Projection`](Projection.md).[`observe`](Projection.md#observe)

***

### peek()

```ts
peek(): Readonly<TConfig> | undefined;
```

The record's current config if it is present, or `undefined` if it is not - the non-throwing companion to [config](#config). Reach for `peek()` to ask "is it present,
and if so what is it?": a record leaving the controller state (a device unadopted or removed, or the NVR before the first bootstrap) is an expected runtime
condition, so `peek()` reports its absence as `undefined` rather than treating it as an error. Reach for [config](#config) instead where the record's presence is a
precondition and an absence is a defect that should fail loudly. `peek() !== undefined` is the idiom for "is it still here?" on a held handle.

Like every projection read this is a live read-through to the current store snapshot, not a value cached at construction, so it always reflects the latest reduced
state. It is the single home of the raw snapshot read; [config](#config) is this read plus the absent-record guard.

#### Returns

`Readonly`\<`TConfig`\> \| `undefined`

The current config, or `undefined` if the record is not present in the controller state.

#### Inherited from

[`Projection`](Projection.md).[`peek`](Projection.md#peek)

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

***

### update()

```ts
update(payload, opts?): Promise<DeviceProjection<TConfig>>;
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

`Promise`\<`DeviceProjection`\<`TConfig`\>\>

This projection.

#### Throws

The classified `FatalError` on a non-2xx (e.g., [ProtectAuthorizationError](../classes/ProtectAuthorizationError.md) when the account lacks admin rights), or a transport-level
  `ProtectError` on failure.
