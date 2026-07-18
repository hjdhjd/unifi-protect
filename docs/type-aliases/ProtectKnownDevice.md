[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectKnownDevice

# Type Alias: ProtectKnownDevice

```ts
type ProtectKnownDevice = 
  | ProtectCameraConfig
  | ProtectChimeConfig
  | ProtectFobConfig
  | ProtectLightConfig
  | ProtectNvrConfig
  | ProtectRelayConfig
  | ProtectSensorConfig
  | ProtectViewerConfig;
```

The union of every device-config record the reducer maintains as canonical state. A realtime device transition (`deviceAdded` / `devicePatched`) carries one of
these shapes, distinguished by the packet's `modelKey`. The NVR config is included because the controller emits `modelKey: "nvr"` updates that patch the NVR's
own configuration through the same dispatch path as any other device. Consumers narrow on `modelKey` (or on a structural field) to recover the specific shape.
