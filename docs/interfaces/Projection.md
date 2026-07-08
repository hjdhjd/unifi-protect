[**unifi-protect**](../README.md)

***

[Home](../README.md) / Projection

# Abstract Interface: Projection\<TConfig\>

The read-only core every projection shares - whether it is a command-bearing device ([DeviceProjection](DeviceProjection.md)) or the read-only NVR singleton (`Nvr`). A projection is
**a live view, not a cached entity**: it holds only its context and a stable selector, and every property access reads through to the current store snapshot. Holding a
projection across hours of state change is safe - its getters always reflect the latest reduced state.

This base supplies exactly what *every* projection has in common - the read-through `config` getter, its non-throwing `peek()` companion, the absent-record guard, and
live `observe()` - and nothing more. It is unbounded in `TConfig` and carries no `id`, because reading-through-and-observing is meaningful for any reduced record,
including a singleton like the NVR that has no id. The command surface (`update`, `reboot`) and device identity (`id`, `modelKey`, `name`, `isOnline`) live one level
down, on [DeviceProjection](DeviceProjection.md). A read-only subject thus inherits the view machinery without the operations it does not support.

If the underlying record has been removed from state (or has not arrived yet, as before the first bootstrap), the asserting getters (`config` and everything built on
it) throw - for a caller whose contract requires the record, a held handle to an absent one is a programming error. A caller that treats absence as an expected runtime
condition asks non-throwingly instead: `peek()` returns the config or `undefined` on the held handle itself, and a fresh lookup (`client.camera(id)`) likewise returns
`undefined` when the record is gone.

## Extended by

- [`DeviceProjection`](DeviceProjection.md)
- [`Nvr`](Nvr.md)

## Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| `TConfig` | The concrete config-record type this projection wraps. |

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

## Methods

### observe()

```ts
observe(opts?): AsyncGenerator<Projection<TConfig>>;
```

Observe this projection. The returned async iterable yields `this` each time the record's config changes by reference, and stays silent on dispatches that did not
touch it. Pair it with the sync getters: getters for "what is it now", observe for "tell me when it changes".

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `opts` | \{ `signal?`: `AbortSignal`; \} | Optional abort signal that terminates the iteration. |
| `opts.signal?` | `AbortSignal` | - |

#### Returns

`AsyncGenerator`\<`Projection`\<`TConfig`\>\>

An async iterable of this projection, yielding once per change.

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
