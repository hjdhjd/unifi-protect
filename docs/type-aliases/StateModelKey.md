[**unifi-protect**](../README.md)

***

[Home](../README.md) / StateModelKey

# Type Alias: StateModelKey

```ts
type StateModelKey = typeof STATE_MODEL_KEYS[number];
```

The model keys the library reduces into canonical [ProtectState](ProtectState.md) *from the realtime stream*: the devices, the NVR, the user roster, and the liveview collection.
A superset of `DeviceModelKey` (it adds `user` and `liveview`, reduced but not device-addressed) and a subset of `ModelKey` (the full observed wire vocabulary).

"Reduced into state" and "is a `StateModelKey`" are two independent axes. `applyBootstrap` reconciles *every* reduced collection (it is the universal input), so a
collection can live in [ProtectState](ProtectState.md) without being a `StateModelKey`: `ringtones` is reduced and observable, but the controller broadcasts no `ringtone` packet,
so it advances bootstrap-only and is intentionally excluded here (and from `ModelKey`). `StateModelKey` is precisely the subset the controller *also* emits
realtime deltas for - the keys the reducer's realtime upsert/patch/remove path touches.
