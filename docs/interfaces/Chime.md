[**unifi-protect**](../README.md)

***

[Home](../README.md) / Chime

# Interface: Chime

A chime projection. Inherits the read-through getters, live `observe`, and write-through `update` from [DeviceProjection](DeviceProjection.md); chime *configuration* (default
volume, per-camera ringtone assignment) is expressed through `update` payloads, while the things a chime can be told to *do* are first-class commands.

The controller exposes each of the chime's sound sources through its own endpoint, so each is a distinct method rather than a single parameterized call:
[Chime.playSpeaker](#playspeaker) plays a ringtone through the speaker, and [Chime.playBuzzer](#playbuzzer) plays the piezo buzzer. None is capability-gated - every chime has them
all, and the controller advertises no per-chime flag for any of them - so, like [DeviceProjection.reboot](DeviceProjection.md#reboot), they are universal operations of the chime class.

## Extends

- [`DeviceProjection`](DeviceProjection.md)\<[`ProtectChimeConfig`](../type-aliases/ProtectChimeConfig.md)\>

## Properties

| Property | Modifier | Type | Default value | Description | Overrides | Inherited from |
| ------ | ------ | ------ | ------ | ------ | ------ | ------ |
| <a id="id"></a> `id` | `readonly` | `string` | `undefined` | The device's stable id. | - | [`DeviceProjection`](DeviceProjection.md).[`id`](DeviceProjection.md#id) |
| <a id="modelkey"></a> `modelKey` | `readonly` | `"chime"` | `"chime"` | The device category tag, fixed by the concrete subclass. | [`DeviceProjection`](DeviceProjection.md).[`modelKey`](DeviceProjection.md#modelkey) | - |

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
observe(opts?): AsyncGenerator<Chime>;
```

Observe this projection. The returned async iterable yields `this` each time the record's config changes by reference, and stays silent on dispatches that did not
touch it. Pair it with the sync getters: getters for "what is it now", observe for "tell me when it changes".

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `opts` | \{ `signal?`: `AbortSignal`; \} | Optional abort signal that terminates the iteration. |
| `opts.signal?` | `AbortSignal` | - |

#### Returns

`AsyncGenerator`\<`Chime`\>

An async iterable of this projection, yielding once per change.

#### Inherited from

[`DeviceProjection`](DeviceProjection.md).[`observe`](DeviceProjection.md#observe)

***

### peek()

```ts
peek(): 
  | Readonly<ProtectChimeConfigInterface>
  | undefined;
```

The record's current config if it is present, or `undefined` if it is not - the non-throwing companion to [config](#config). Reach for `peek()` to ask "is it present,
and if so what is it?": a record leaving the controller state (a device unadopted or removed, or the NVR before the first bootstrap) is an expected runtime
condition, so `peek()` reports its absence as `undefined` rather than treating it as an error. Reach for [config](#config) instead where the record's presence is a
precondition and an absence is a defect that should fail loudly. `peek() !== undefined` is the idiom for "is it still here?" on a held handle.

Like every projection read this is a live read-through to the current store snapshot, not a value cached at construction, so it always reflects the latest reduced
state. It is the single home of the raw snapshot read; [config](#config) is this read plus the absent-record guard.

#### Returns

  \| `Readonly`\<[`ProtectChimeConfigInterface`](ProtectChimeConfigInterface.md)\>
  \| `undefined`

The current config, or `undefined` if the record is not present in the controller state.

#### Inherited from

[`DeviceProjection`](DeviceProjection.md).[`peek`](DeviceProjection.md#peek)

***

### playBuzzer()

```ts
playBuzzer(opts?): Promise<void>;
```

Play the chime's buzzer - the simple piezo tone, distinct from a ringtone. The buzzer takes no parameters. Write-through: the command is issued and the method
returns; it does not fold any response into the store.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `opts` | \{ `signal?`: `AbortSignal`; \} | An optional abort signal. |
| `opts.signal?` | `AbortSignal` | - |

#### Returns

`Promise`\<`void`\>

#### Throws

The classified `FatalError` on a non-2xx, or a transport-level `ProtectError` on failure.

***

### playSpeaker()

```ts
playSpeaker(opts?): Promise<void>;
```

Play a ringtone through the chime's speaker. Write-through: the command is issued and the method returns; it does not fold any response into the store. With no
options the controller plays the chime's default assigned ringtone; supply [PlaySpeakerOptions](PlaySpeakerOptions.md) to select a specific ringtone or override its playback.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `opts` | [`PlaySpeakerOptions`](PlaySpeakerOptions.md) | The ringtone selection and playback overrides, plus an optional abort signal. All fields are optional. |

#### Returns

`Promise`\<`void`\>

#### Throws

The classified `FatalError` on a non-2xx (e.g., [ProtectRequestError](../classes/ProtectRequestError.md) when the controller rejects an unknown `ringtoneId`), or a transport-level
  `ProtectError` on failure.

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
update(payload, opts?): Promise<Chime>;
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

`Promise`\<`Chime`\>

This projection.

#### Throws

The classified `FatalError` on a non-2xx (e.g., [ProtectAuthorizationError](../classes/ProtectAuthorizationError.md) when the account lacks admin rights), or a transport-level
  `ProtectError` on failure.

#### Inherited from

[`DeviceProjection`](DeviceProjection.md).[`update`](DeviceProjection.md#update)
