[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectStateRecord

# Type Alias: ProtectStateRecord

```ts
type ProtectStateRecord = 
  | ProtectKnownDevice
  | ProtectNvrLiveviewConfig
  | ProtectNvrUserConfig;
```

The union of every config record the reducer stores in [ProtectState](ProtectState.md): the devices and NVR of [ProtectKnownDevice](ProtectKnownDevice.md), plus the controller's user and liveview
records. A realtime state transition (`deviceAdded` / `devicePatched`) carries one of these, distinguished by the packet's `modelKey`. The `user` roster is included
because the controller emits `modelKey: "user"` updates - permission and login changes - on the realtime stream; the `liveview` collection because it emits
`modelKey: "liveview"` updates as liveviews are added, edited, or removed. The reducer folds both in through the same dispatch path as any device. This widens
[ProtectKnownDevice](ProtectKnownDevice.md) by exactly the record types the user roster (`user`) and the liveview collection (`liveview`) introduce; consumers narrow on `modelKey` to
recover the shape. (`ringtones` is reduced into [ProtectState](ProtectState.md) too, but bootstrap-only - the controller broadcasts no `ringtone` realtime packet - so it never
arrives as a state transition and is deliberately absent from this union.)
