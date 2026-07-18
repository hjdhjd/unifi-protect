[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectState

# Type Alias: ProtectState

```ts
type ProtectState = Readonly<{
  authUserId: string | null;
  bootstrapId: number;
  cameras: ReadonlyMap<string, ProtectCameraConfig>;
  chimes: ReadonlyMap<string, ProtectChimeConfig>;
  fobs: ReadonlyMap<string, ProtectFobConfig>;
  lights: ReadonlyMap<string, ProtectLightConfig>;
  liveviews: ReadonlyMap<string, ProtectNvrLiveviewConfig>;
  nvr: ProtectNvrConfig | null;
  relays: ReadonlyMap<string, ProtectRelayConfig>;
  ringtones: ReadonlyMap<string, ProtectRingtoneConfig>;
  sensors: ReadonlyMap<string, ProtectSensorConfig>;
  users: ReadonlyMap<string, ProtectNvrUserConfig>;
  viewers: ReadonlyMap<string, ProtectViewerConfig>;
}>;
```

The immutable snapshot of a controller's modeled state. Devices are normalized into `id -> config` maps for O(1) lookup; selectors derive arrays on demand and
memoize on map identity. `bootstrapId` is a monotonic counter incremented on every applied bootstrap - internal bookkeeping that guarantees a bootstrap always mints a
fresh state reference (the store's dispatch gate relies on this), surfaced for diagnostics but read by no device observer.

There is deliberately no `lastEventAt` here. Channel liveness is intrinsic to the realtime channel, so the events-WebSocket watchdog reads its timestamp from the
`EventStream` (which clock-stamps every message), not from this state: a pure reducer cannot write a wall-clock field without minting a new state reference on every
packet, which would destroy the no-op/structural-sharing guarantee the observation layer depends on.

Beyond devices, the state carries session identity and the controller's read-only collections, all lifted from the bootstrap: `authUserId` (the authenticated session's
user id, a singleton like `nvr`), `users` (the controller's roster), `liveviews` (the saved camera layouts), and `ringtones` (the chime ringtone library), each
normalized like the device collections. These are real controller state, not connect-time constants - a user's permissions change, liveviews are edited, ringtones are
uploaded - so they must be reducer-derived and observable as they change.

Two of those collections advance differently, and the distinction is deliberate. `user` and `liveview` are `StateModelKey`s, so they advance in realtime through the
generic upsert/patch/remove paths as a device (a change reflects within event latency), with the periodic bootstrap as the failsafe. `ringtones`, by contrast, is
reduced *bootstrap-only*: the controller broadcasts no `ringtone` realtime packet, so this map is written exclusively by `applyBootstrap` (never by `mapFieldFor`) and
is intentionally absent from `DeviceMapField`. That is the honest encoding of "reduced and observable, but not realtime-addressed" - see the two-axis note on
[StateModelKey](StateModelKey.md).
