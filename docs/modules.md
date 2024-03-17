[unifi-protect](README.md) / Exports

# unifi-protect

## Table of contents

### Classes

- [FetchError](classes/FetchError.md)
- [ProtectApi](classes/ProtectApi.md)
- [ProtectApiEvents](classes/ProtectApiEvents.md)
- [ProtectLivestream](classes/ProtectLivestream.md)

### Interfaces

- [ProtectCameraChannelConfig](interfaces/ProtectCameraChannelConfig.md)
- [ProtectCameraChannelConfigInterface](interfaces/ProtectCameraChannelConfigInterface.md)
- [ProtectCameraConfig](interfaces/ProtectCameraConfig.md)
- [ProtectCameraConfigInterface](interfaces/ProtectCameraConfigInterface.md)
- [ProtectCameraConfigPayload](interfaces/ProtectCameraConfigPayload.md)
- [ProtectCameraLcdMessageConfig](interfaces/ProtectCameraLcdMessageConfig.md)
- [ProtectCameraLcdMessageConfigInterface](interfaces/ProtectCameraLcdMessageConfigInterface.md)
- [ProtectCameraLcdMessagePayload](interfaces/ProtectCameraLcdMessagePayload.md)
- [ProtectChimeConfig](interfaces/ProtectChimeConfig.md)
- [ProtectChimeConfigInterface](interfaces/ProtectChimeConfigInterface.md)
- [ProtectChimeConfigPayload](interfaces/ProtectChimeConfigPayload.md)
- [ProtectEventAdd](interfaces/ProtectEventAdd.md)
- [ProtectEventAddInterface](interfaces/ProtectEventAddInterface.md)
- [ProtectEventMetadata](interfaces/ProtectEventMetadata.md)
- [ProtectEventMetadataInterface](interfaces/ProtectEventMetadataInterface.md)
- [ProtectLightConfig](interfaces/ProtectLightConfig.md)
- [ProtectLightConfigInterface](interfaces/ProtectLightConfigInterface.md)
- [ProtectLightConfigPayload](interfaces/ProtectLightConfigPayload.md)
- [ProtectLogging](interfaces/ProtectLogging.md)
- [ProtectNvrBootstrap](interfaces/ProtectNvrBootstrap.md)
- [ProtectNvrBootstrapInterface](interfaces/ProtectNvrBootstrapInterface.md)
- [ProtectNvrConfig](interfaces/ProtectNvrConfig.md)
- [ProtectNvrConfigInterface](interfaces/ProtectNvrConfigInterface.md)
- [ProtectNvrConfigPayload](interfaces/ProtectNvrConfigPayload.md)
- [ProtectNvrLiveviewConfig](interfaces/ProtectNvrLiveviewConfig.md)
- [ProtectNvrLiveviewConfigInterface](interfaces/ProtectNvrLiveviewConfigInterface.md)
- [ProtectNvrSystemEvent](interfaces/ProtectNvrSystemEvent.md)
- [ProtectNvrSystemEventController](interfaces/ProtectNvrSystemEventController.md)
- [ProtectNvrSystemEventControllerInterface](interfaces/ProtectNvrSystemEventControllerInterface.md)
- [ProtectNvrSystemEventInterface](interfaces/ProtectNvrSystemEventInterface.md)
- [ProtectNvrSystemInfoConfig](interfaces/ProtectNvrSystemInfoConfig.md)
- [ProtectNvrSystemInfoInterface](interfaces/ProtectNvrSystemInfoInterface.md)
- [ProtectNvrUserConfig](interfaces/ProtectNvrUserConfig.md)
- [ProtectNvrUserConfigInterface](interfaces/ProtectNvrUserConfigInterface.md)
- [ProtectSensorConfig](interfaces/ProtectSensorConfig.md)
- [ProtectSensorConfigInterface](interfaces/ProtectSensorConfigInterface.md)
- [ProtectSensorConfigPayload](interfaces/ProtectSensorConfigPayload.md)
- [ProtectViewerConfig](interfaces/ProtectViewerConfig.md)
- [ProtectViewerConfigInterface](interfaces/ProtectViewerConfigInterface.md)
- [ProtectViewerConfigPayload](interfaces/ProtectViewerConfigPayload.md)

### Type Aliases

- [ProtectEventPacket](modules.md#protecteventpacket)
- [ProtectKnownDevicePayloads](modules.md#protectknowndevicepayloads)
- [ProtectKnownDeviceTypes](modules.md#protectknowndevicetypes)

## Type Aliases

### ProtectEventPacket

Ƭ **ProtectEventPacket**: `Object`

UniFi Protect event packet.

**`Param`**

Protect event header.

**`Param`**

Protect event payload.

**`Remarks`**

A UniFi Protect event packet represents a realtime event update from a UniFi Protect controller. There are two components to each packet, a `header` and
  a `payload`. The `header` contains information about which Protect device and what action category it belongs to. The `payload` contains the detailed information
  related to the device and action specified in the header.

#### Type declaration

| Name | Type |
| :------ | :------ |
| `header` | `ProtectEventHeader` |
| `payload` | `unknown` |

#### Defined in

[src/protect-api-events.ts:120](https://github.com/hjdhjd/unifi-protect/blob/a536a5f/src/protect-api-events.ts#L120)

___

### ProtectKnownDevicePayloads

Ƭ **ProtectKnownDevicePayloads**: [`ProtectCameraConfigPayload`](interfaces/ProtectCameraConfigPayload.md) \| [`ProtectChimeConfigPayload`](interfaces/ProtectChimeConfigPayload.md) \| [`ProtectLightConfigPayload`](interfaces/ProtectLightConfigPayload.md) \| [`ProtectNvrConfigPayload`](interfaces/ProtectNvrConfigPayload.md) \| [`ProtectSensorConfigPayload`](interfaces/ProtectSensorConfigPayload.md) \| [`ProtectViewerConfigPayload`](interfaces/ProtectViewerConfigPayload.md)

#### Defined in

[src/protect-api.ts:36](https://github.com/hjdhjd/unifi-protect/blob/a536a5f/src/protect-api.ts#L36)

___

### ProtectKnownDeviceTypes

Ƭ **ProtectKnownDeviceTypes**: [`ProtectCameraConfig`](interfaces/ProtectCameraConfig.md) \| [`ProtectChimeConfig`](interfaces/ProtectChimeConfig.md) \| [`ProtectLightConfig`](interfaces/ProtectLightConfig.md) \| [`ProtectNvrConfig`](interfaces/ProtectNvrConfig.md) \| [`ProtectSensorConfig`](interfaces/ProtectSensorConfig.md) \| [`ProtectViewerConfig`](interfaces/ProtectViewerConfig.md)

#### Defined in

[src/protect-api.ts:33](https://github.com/hjdhjd/unifi-protect/blob/a536a5f/src/protect-api.ts#L33)
