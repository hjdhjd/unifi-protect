[**unifi-protect**](../README.md)

***

[Home](../README.md) / StateStoreOptions

# Interface: StateStoreOptions

Construction options for [StateStore](StateStore.md).

- `refresh` is the only required option: the seam the failsafe calls to fetch a fresh bootstrap. The composition root wires it to a transport request; tests wire a
  fake. Injecting a function rather than a `Transport` is what keeps the store at the data layer (it never imports the transport) and deterministically testable.
- `refreshIntervalMs` defaults to [PROTECT\_BOOTSTRAP\_REFRESH\_INTERVAL](../variables/PROTECT_BOOTSTRAP_REFRESH_INTERVAL.md); pass `false` or a non-positive interval to disable the failsafe entirely (the consumer
  then relies solely on the realtime event stream).

## Properties

| Property | Type |
| ------ | ------ |
| <a id="clock"></a> `clock?` | [`Clock`](Clock.md) |
| <a id="initialstate"></a> `initialState?` | `Readonly`\<\{ `authUserId`: `string` \| `null`; `bootstrapId`: `number`; `cameras`: `ReadonlyMap`\<`string`, [`ProtectCameraConfigInterface`](ProtectCameraConfigInterface.md)\>; `chimes`: `ReadonlyMap`\<`string`, [`ProtectChimeConfigInterface`](ProtectChimeConfigInterface.md)\>; `fobs`: `ReadonlyMap`\<`string`, [`ProtectFobConfigInterface`](ProtectFobConfigInterface.md)\>; `lights`: `ReadonlyMap`\<`string`, [`ProtectLightConfigInterface`](ProtectLightConfigInterface.md)\>; `liveviews`: `ReadonlyMap`\<`string`, [`ProtectNvrLiveviewConfigInterface`](ProtectNvrLiveviewConfigInterface.md)\>; `nvr`: [`ProtectNvrConfigInterface`](ProtectNvrConfigInterface.md) \| `null`; `relays`: `ReadonlyMap`\<`string`, [`ProtectRelayConfigInterface`](ProtectRelayConfigInterface.md)\>; `ringtones`: `ReadonlyMap`\<`string`, [`ProtectRingtoneConfigInterface`](ProtectRingtoneConfigInterface.md)\>; `sensors`: `ReadonlyMap`\<`string`, [`ProtectSensorConfigInterface`](ProtectSensorConfigInterface.md)\>; `users`: `ReadonlyMap`\<`string`, [`ProtectNvrUserConfigInterface`](ProtectNvrUserConfigInterface.md)\>; `viewers`: `ReadonlyMap`\<`string`, [`ProtectViewerConfigInterface`](ProtectViewerConfigInterface.md)\>; \}\> |
| <a id="log"></a> `log?` | [`ProtectLogging`](ProtectLogging.md) |
| <a id="refresh"></a> `refresh` | () => `Promise`\<[`ProtectNvrBootstrapInterface`](ProtectNvrBootstrapInterface.md)\> |
| <a id="refreshintervalms"></a> `refreshIntervalMs?` | `number` \| `false` |
