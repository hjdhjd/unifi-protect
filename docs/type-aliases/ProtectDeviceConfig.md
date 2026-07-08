[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectDeviceConfig

# Type Alias: ProtectDeviceConfig

```ts
type ProtectDeviceConfig = 
  | ProtectCameraConfig
  | ProtectChimeConfig
  | ProtectFobConfig
  | ProtectLightConfig
  | ProtectRelayConfig
  | ProtectSensorConfig
  | ProtectViewerConfig;
```

The config-record union a device projection can wrap - every modeled device except the NVR singleton.
