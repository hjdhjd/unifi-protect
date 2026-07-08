[**unifi-protect**](../README.md)

***

[Home](../README.md) / Nvr

# Interface: Nvr

The NVR projection - a read-only, observable view over the controller's configuration singleton (`state.nvr`). It is the singleton sibling of the device projections:
exactly like `Camera` it is a live view whose getters read through to the current store snapshot, so a held handle always reflects the latest reduced state. It
differs only in being constructed from just a context, since the NVR is a singleton with no id to bind, where `Camera` binds a `(context, id)` pair.

It extends the read-only [Projection](Projection.md) core, **not** [DeviceProjection](DeviceProjection.md), and so bears no commands: NVR configuration writes are out of scope, and the
controller-level reboot is `client.reboot()` (a UniFi-OS operation, not a Protect device op). This honors the device-method rule - a method exists iff it maps to an
operation the subject supports - and is why the NVR is a projection over the read-only core rather than a device projection with `update`/`reboot` it must hide. It
exposes only fields of its own `ProtectNvrConfig` record; the controller's liveviews and ringtones are peer top-level collections (`client.liveviews` /
`client.ringtones`), not children of the NVR record, so they are surfaced as selectors, not as getters here.

Unlike the device projections there is no id and no `undefined` lookup: the NVR is a singleton, so `client.nvr` always returns a handle. Its getters throw
`ReferenceError` only before the first bootstrap (when `state.nvr` is still `null`) - the same absent-record contract a device projection uses for a removed device. A
connected client never hits that case, because `ProtectClient.connect()` awaits the initial bootstrap before returning.

## Extends

- [`Projection`](Projection.md)\<[`ProtectNvrConfig`](../type-aliases/ProtectNvrConfig.md)\>

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

### host

#### Get Signature

```ts
get host(): string;
```

The controller's host address (IP or hostname).

##### Returns

`string`

***

### marketName

#### Get Signature

```ts
get marketName(): string;
```

The controller's hardware market name (the product model, e.g. "UDM Pro"). Always present; it is both useful on its own and the always-present fallback that
[name](#name) cooks in when the controller has not been user-named.

##### Returns

`string`

***

### name

#### Get Signature

```ts
get name(): string;
```

The controller's display label - its user-assigned name when set, otherwise the always-present [marketName](#marketname). Always a `string`, honoring the projection-wide
`.name` convention (a device's `name ?? displayName`): `marketName` is the NVR's analog of a device's `displayName`. This is single-sourced with
`client.controllerName` (which mirrors the same `name ?? marketName` label), so the two never disagree. The raw, possibly-unset user name stays reachable via
`nvr.config.name` for a consumer that needs the "was it explicitly named?" distinction - the getter-cooks / `config`-is-raw split also used for [rtspPort](#rtspport).

##### Returns

`string`

***

### rtspPort

#### Get Signature

```ts
get rtspPort(): number;
```

The controller's RTSP service port (`ports.rtsp`) - the one port a consumer building RTSP URLs needs. Other ports remain available through `nvr.config.ports`.

##### Returns

`number`

## Methods

### observe()

```ts
observe(opts?): AsyncGenerator<Nvr>;
```

Observe this projection. The returned async iterable yields `this` each time the record's config changes by reference, and stays silent on dispatches that did not
touch it. Pair it with the sync getters: getters for "what is it now", observe for "tell me when it changes".

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `opts` | \{ `signal?`: `AbortSignal`; \} | Optional abort signal that terminates the iteration. |
| `opts.signal?` | `AbortSignal` | - |

#### Returns

`AsyncGenerator`\<`Nvr`\>

An async iterable of this projection, yielding once per change.

#### Inherited from

[`Projection`](Projection.md).[`observe`](Projection.md#observe)

***

### peek()

```ts
peek(): 
  | Readonly<ProtectNvrConfigInterface>
  | undefined;
```

The record's current config if it is present, or `undefined` if it is not - the non-throwing companion to [config](#config). Reach for `peek()` to ask "is it present,
and if so what is it?": a record leaving the controller state (a device unadopted or removed, or the NVR before the first bootstrap) is an expected runtime
condition, so `peek()` reports its absence as `undefined` rather than treating it as an error. Reach for [config](#config) instead where the record's presence is a
precondition and an absence is a defect that should fail loudly. `peek() !== undefined` is the idiom for "is it still here?" on a held handle.

Like every projection read this is a live read-through to the current store snapshot, not a value cached at construction, so it always reflects the latest reduced
state. It is the single home of the raw snapshot read; [config](#config) is this read plus the absent-record guard.

#### Returns

  \| `Readonly`\<[`ProtectNvrConfigInterface`](ProtectNvrConfigInterface.md)\>
  \| `undefined`

The current config, or `undefined` if the record is not present in the controller state.

#### Inherited from

[`Projection`](Projection.md).[`peek`](Projection.md#peek)
