[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectDeviceConfigMap

# Interface: ProtectDeviceConfigMap

The key-to-config map for the id-keyed device collections: each [DeviceCollectionKey](../type-aliases/DeviceCollectionKey.md) paired with the config-record type its collection holds. The catalog below
is typed against it, and consumers derive the device-config union from it (the library's `ProtectDeviceConfig`), so the collection vocabulary and its record types stay
locked to one map rather than drifting across a hand-maintained union.

## Properties

| Property | Type |
| ------ | ------ |
| <a id="camera"></a> `camera` | [`ProtectCameraConfigInterface`](ProtectCameraConfigInterface.md) |
| <a id="chime"></a> `chime` | [`ProtectChimeConfigInterface`](ProtectChimeConfigInterface.md) |
| <a id="fob"></a> `fob` | [`ProtectFobConfigInterface`](ProtectFobConfigInterface.md) |
| <a id="light"></a> `light` | [`ProtectLightConfigInterface`](ProtectLightConfigInterface.md) |
| <a id="relay"></a> `relay` | [`ProtectRelayConfigInterface`](ProtectRelayConfigInterface.md) |
| <a id="sensor"></a> `sensor` | [`ProtectSensorConfigInterface`](ProtectSensorConfigInterface.md) |
| <a id="viewer"></a> `viewer` | [`ProtectViewerConfigInterface`](ProtectViewerConfigInterface.md) |
