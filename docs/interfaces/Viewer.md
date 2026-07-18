[**unifi-protect**](../README.md)

***

[Home](../README.md) / Viewer

# Interface: Viewer

A viewer projection. Inherits the read-through getters, live `observe`, and write-through `update` from [DeviceProjection](DeviceProjection.md); viewer-specific behavior
(assigned liveview) is expressed through `update` payloads.

## Extends

- [`DeviceProjection`](DeviceProjection.md)\<[`ProtectViewerConfig`](../type-aliases/ProtectViewerConfig.md)\>

## Properties

| Property | Modifier | Type | Default value | Description | Overrides | Inherited from |
| ------ | ------ | ------ | ------ | ------ | ------ | ------ |
| <a id="id"></a> `id` | `readonly` | `string` | `undefined` | The device's stable id. | - | [`DeviceProjection`](DeviceProjection.md).[`id`](DeviceProjection.md#id) |
| <a id="modelkey"></a> `modelKey` | `readonly` | `"viewer"` | `"viewer"` | The device category tag, fixed by the concrete subclass. | [`DeviceProjection`](DeviceProjection.md).[`modelKey`](DeviceProjection.md#modelkey) | - |

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

### observe()

```ts
observe(opts?): AsyncGenerator<Viewer>;
```

Observe this projection. The returned async iterable yields `this` each time the record's config changes by reference, and stays silent on dispatches that did not
touch it. Pair it with the sync getters: getters for "what is it now", observe for "tell me when it changes".

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `opts` | \{ `signal?`: `AbortSignal`; \} | Optional abort signal that terminates the iteration. |
| `opts.signal?` | `AbortSignal` | - |

#### Returns

`AsyncGenerator`\<`Viewer`\>

An async iterable of this projection, yielding once per change.

#### Inherited from

[`DeviceProjection`](DeviceProjection.md).[`observe`](DeviceProjection.md#observe)

***

### peek()

```ts
peek(): 
  | Readonly<ProtectViewerConfigInterface>
  | undefined;
```

The record's current config if it is present, or `undefined` if it is not - the non-throwing companion to [config](#config). Reach for `peek()` to ask "is it present,
and if so what is it?": a record leaving the controller state (a device unadopted or removed, or the NVR before the first bootstrap) is an expected runtime
condition, so `peek()` reports its absence as `undefined` rather than treating it as an error. Reach for [config](#config) instead where the record's presence is a
precondition and an absence is a defect that should fail loudly. `peek() !== undefined` is the idiom for "is it still here?" on a held handle.

Like every projection read this is a live read-through to the current store snapshot, not a value cached at construction, so it always reflects the latest reduced
state. It is the single home of the raw snapshot read; [config](#config) is this read plus the absent-record guard.

#### Returns

  \| `Readonly`\<[`ProtectViewerConfigInterface`](ProtectViewerConfigInterface.md)\>
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

### update()

```ts
update(payload, opts?): Promise<Viewer>;
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

`Promise`\<`Viewer`\>

This projection.

#### Throws

The classified `FatalError` on a non-2xx (e.g., [ProtectAuthorizationError](../classes/ProtectAuthorizationError.md) when the account lacks admin rights), or a transport-level
  `ProtectError` on failure.

#### Inherited from

[`DeviceProjection`](DeviceProjection.md).[`update`](DeviceProjection.md#update)
