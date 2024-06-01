[**unifi-protect**](README.md) • **Docs**

***

[Home](README.md) / ProtectTypes

# ProtectTypes

A semi-complete description of all the object types used by the UniFi Protect API.

The UniFi Protect API is largely undocumented - these interfaces and types have been gleaned through a lot of experimentation and observation. Protect is always
evolving and U will attempt to keep up with the changes over time.

We use types instead of interfaces because we have a need to provide two versions of each interface: one that represents the interface and one that is recursively
partial, for patching the configuration objects and receiving event updates related to them.

- We append **Config** to the primary version of a device configuration object.
- We append **Payload** to the version of a device configuration object that can have partial components of the object in it, used for patching or updates.

## Interfaces

### ProtectCameraChannelConfigInterface

A semi-complete description of the UniFi Protect camera channel JSON.

#### Properties

| Property | Type |
| :------ | :------ |
| `bitrate` | `number` |
| `enabled` | `boolean` |
| `fps` | `number` |
| `fpsValues` | `number`[] |
| `height` | `number` |
| `id` | `number` |
| `idrInterval` | `number` |
| `isRtspEnabled` | `boolean` |
| `maxBitrate` | `number` |
| `minBitrate` | `number` |
| `minClientAdaptiveBitRate` | `number` |
| `minMotionAdaptiveBitRate` | `number` |
| `name` | `string` |
| `rtspAlias` | `string` |
| `videoId` | `string` |
| `width` | `number` |

***

### ProtectCameraConfigInterface

A semi-complete description of the UniFi Protect camera JSON.

#### Properties

| Property | Type |
| :------ | :------ |
| `apMac` | `string` |
| `apRssi` | `string` |
| `audioBitrate` | `number` |
| `canManage` | `boolean` |
| `channels` | [`ProtectCameraChannelConfigInterface`](ProtectTypes.md#protectcamerachannelconfiginterface)[] |
| `chimeDuration` | `number` |
| `connectedSince` | `number` |
| `connectionHost` | `string` |
| `currentResolution` | `string` |
| `displayName` | `string` |
| `elementInfo` | `null` |
| `featureFlags` | \{ `audio`: `string`[]; `audioCodecs`: `string`[]; `audioStyle`: `string`[]; `canAdjustIrLedLevel`: `boolean`; `canMagicZoom`: `boolean`; `canOpticalZoom`: `boolean`; `canTouchFocus`: `boolean`; `hasAccelerometer`: `boolean`; `hasAec`: `boolean`; `hasAutoICROnly`: `boolean`; `hasBattery`: `boolean`; `hasBluetooth`: `boolean`; `hasChime`: `boolean`; `hasColorLcdScreen`: `boolean`; `hasExternalIr`: `boolean`; `hasFlash`: `boolean`; `hasHdr`: `boolean`; `hasIcrSensitivity`: `boolean`; `hasInfrared`: `boolean`; `hasLcdScreen`: `boolean`; `hasLdc`: `boolean`; `hasLedIr`: `boolean`; `hasLedStatus`: `boolean`; `hasLineCrossing`: `boolean`; `hasLineCrossingCounting`: `boolean`; `hasLineIn`: `boolean`; `hasLiveviewTracking`: `boolean`; `hasLuxCheck`: `boolean`; `hasMic`: `boolean`; `hasMotionZones`: `boolean`; `hasNewMotionAlgorithm`: `boolean`; `hasPackageCamera`: `boolean`; `hasPrivacyMask`: `boolean`; `hasRtc`: `boolean`; `hasSdCard`: `boolean`; `hasSmartDetect`: `boolean`; `hasSpeaker`: `boolean`; `hasSquareEventThumbnail`: `boolean`; `hasVerticalFlip`: `boolean`; `hasWifi`: `boolean`; `isDoorbell`: `boolean`; `isPtz`: `boolean`; `motionAlgorithms`: `string`[]; `privacyMaskCapability`: \{ `maxMasks`: `number`; `rectangleOnly`: `boolean`; \}; `smartDetectAudioTypes`: `string`[]; `smartDetectTypes`: `string`[]; `supportDoorAccessConfig`: `boolean`; `videoCodecs`: `string`[]; `videoModeMaxFps`: `number`[]; `videoModes`: `string`[]; \} |
| `featureFlags.audio` | `string`[] |
| `featureFlags.audioCodecs` | `string`[] |
| `featureFlags.audioStyle` | `string`[] |
| `featureFlags.canAdjustIrLedLevel` | `boolean` |
| `featureFlags.canMagicZoom` | `boolean` |
| `featureFlags.canOpticalZoom` | `boolean` |
| `featureFlags.canTouchFocus` | `boolean` |
| `featureFlags.hasAccelerometer` | `boolean` |
| `featureFlags.hasAec` | `boolean` |
| `featureFlags.hasAutoICROnly` | `boolean` |
| `featureFlags.hasBattery` | `boolean` |
| `featureFlags.hasBluetooth` | `boolean` |
| `featureFlags.hasChime` | `boolean` |
| `featureFlags.hasColorLcdScreen` | `boolean` |
| `featureFlags.hasExternalIr` | `boolean` |
| `featureFlags.hasFlash` | `boolean` |
| `featureFlags.hasHdr` | `boolean` |
| `featureFlags.hasIcrSensitivity` | `boolean` |
| `featureFlags.hasInfrared` | `boolean` |
| `featureFlags.hasLcdScreen` | `boolean` |
| `featureFlags.hasLdc` | `boolean` |
| `featureFlags.hasLedIr` | `boolean` |
| `featureFlags.hasLedStatus` | `boolean` |
| `featureFlags.hasLineCrossing` | `boolean` |
| `featureFlags.hasLineCrossingCounting` | `boolean` |
| `featureFlags.hasLineIn` | `boolean` |
| `featureFlags.hasLiveviewTracking` | `boolean` |
| `featureFlags.hasLuxCheck` | `boolean` |
| `featureFlags.hasMic` | `boolean` |
| `featureFlags.hasMotionZones` | `boolean` |
| `featureFlags.hasNewMotionAlgorithm` | `boolean` |
| `featureFlags.hasPackageCamera` | `boolean` |
| `featureFlags.hasPrivacyMask` | `boolean` |
| `featureFlags.hasRtc` | `boolean` |
| `featureFlags.hasSdCard` | `boolean` |
| `featureFlags.hasSmartDetect` | `boolean` |
| `featureFlags.hasSpeaker` | `boolean` |
| `featureFlags.hasSquareEventThumbnail` | `boolean` |
| `featureFlags.hasVerticalFlip` | `boolean` |
| `featureFlags.hasWifi` | `boolean` |
| `featureFlags.isDoorbell` | `boolean` |
| `featureFlags.isPtz` | `boolean` |
| `featureFlags.motionAlgorithms` | `string`[] |
| `featureFlags.privacyMaskCapability` | \{ `maxMasks`: `number`; `rectangleOnly`: `boolean`; \} |
| `featureFlags.privacyMaskCapability.maxMasks` | `number` |
| `featureFlags.privacyMaskCapability.rectangleOnly` | `boolean` |
| `featureFlags.smartDetectAudioTypes` | `string`[] |
| `featureFlags.smartDetectTypes` | `string`[] |
| `featureFlags.supportDoorAccessConfig` | `boolean` |
| `featureFlags.videoCodecs` | `string`[] |
| `featureFlags.videoModeMaxFps` | `number`[] |
| `featureFlags.videoModes` | `string`[] |
| `firmwareBuild` | `string` |
| `firmwareVersion` | `string` |
| `hardwareRevision` | `string` |
| `hasRecordings` | `boolean` |
| `hasSpeaker` | `boolean` |
| `hasWifi` | `boolean` |
| `hdrMode` | `boolean` |
| `homekitSettings` | \{ `microphoneMuted`: `boolean`; `speakerMuted`: `boolean`; `streamInProgress`: `boolean`; `talkbackSettingsActive`: `boolean`; \} |
| `homekitSettings.microphoneMuted` | `boolean` |
| `homekitSettings.speakerMuted` | `boolean` |
| `homekitSettings.streamInProgress` | `boolean` |
| `homekitSettings.talkbackSettingsActive` | `boolean` |
| `host` | `string` |
| `hubMac` | `string` |
| `id` | `string` |
| `is2K` | `boolean` |
| `is4K` | `boolean` |
| `isAdopted` | `boolean` |
| `isAdoptedByOther` | `boolean` |
| `isAdopting` | `boolean` |
| `isAttemptingToConnect` | `boolean` |
| `isConnected` | `boolean` |
| `isDark` | `boolean` |
| `isDeleting` | `boolean` |
| `isDownloadingFW` | `boolean` |
| `isExtenderInstalledEver` | `boolean` |
| `isHidden` | `boolean` |
| `isLiveHeatmapEnabled` | `boolean` |
| `isManaged` | `boolean` |
| `isMicEnabled` | `boolean` |
| `isMotionDetected` | `boolean` |
| `isPoorNetwork` | `boolean` |
| `isProbingForWifi` | `boolean` |
| `isProvisioned` | `boolean` |
| `isRebooting` | `boolean` |
| `isRecording` | `boolean` |
| `isRestoring` | `boolean` |
| `isSmartDetected` | `boolean` |
| `isSshEnabled` | `boolean` |
| `isUpdating` | `boolean` |
| `isWaterproofCaseAttached` | `boolean` |
| `isWirelessUplinkEnabled` | `boolean` |
| `ispSettings` | \{ `aeMode`: `string`; `brightness`: `number`; `contrast`: `number`; `dZoomCenterX`: `number`; `dZoomCenterY`: `number`; `dZoomScale`: `number`; `dZoomStreamId`: `number`; `denoise`: `number`; `focusMode`: `string`; `focusPosition`: `number`; `hue`: `number`; `icrSensitivity`: `number`; `irLedLevel`: `number`; `irLedMode`: `string`; `is3dnrEnabled`: `boolean`; `isAggressiveAntiFlickerEnabled`: `boolean`; `isAutoRotateEnabled`: `boolean`; `isExternalIrEnabled`: `boolean`; `isFlippedHorizontal`: `boolean`; `isFlippedVertical`: `boolean`; `isLdcEnabled`: `boolean`; `isPauseMotionEnabled`: `boolean`; `saturation`: `number`; `sharpness`: `number`; `touchFocusX`: `number`; `touchFocusY`: `number`; `wdr`: `number`; `zoomPosition`: `number`; \} |
| `ispSettings.aeMode` | `string` |
| `ispSettings.brightness` | `number` |
| `ispSettings.contrast` | `number` |
| `ispSettings.dZoomCenterX` | `number` |
| `ispSettings.dZoomCenterY` | `number` |
| `ispSettings.dZoomScale` | `number` |
| `ispSettings.dZoomStreamId` | `number` |
| `ispSettings.denoise` | `number` |
| `ispSettings.focusMode` | `string` |
| `ispSettings.focusPosition` | `number` |
| `ispSettings.hue` | `number` |
| `ispSettings.icrSensitivity` | `number` |
| `ispSettings.irLedLevel` | `number` |
| `ispSettings.irLedMode` | `string` |
| `ispSettings.is3dnrEnabled` | `boolean` |
| `ispSettings.isAggressiveAntiFlickerEnabled` | `boolean` |
| `ispSettings.isAutoRotateEnabled` | `boolean` |
| `ispSettings.isExternalIrEnabled` | `boolean` |
| `ispSettings.isFlippedHorizontal` | `boolean` |
| `ispSettings.isFlippedVertical` | `boolean` |
| `ispSettings.isLdcEnabled` | `boolean` |
| `ispSettings.isPauseMotionEnabled` | `boolean` |
| `ispSettings.saturation` | `number` |
| `ispSettings.sharpness` | `number` |
| `ispSettings.touchFocusX` | `number` |
| `ispSettings.touchFocusY` | `number` |
| `ispSettings.wdr` | `number` |
| `ispSettings.zoomPosition` | `number` |
| `lastMotion` | `number` |
| `lastRing` | `null` \| `number` |
| `lastSeen` | `number` |
| `latestFirmwareVersion` | `string` |
| `lcdMessage` | [`ProtectCameraLcdMessageConfigInterface`](ProtectTypes.md#protectcameralcdmessageconfiginterface) |
| `ledSettings` | \{ `blinkRate`: `number`; `isEnabled`: `boolean`; \} |
| `ledSettings.blinkRate` | `number` |
| `ledSettings.isEnabled` | `boolean` |
| `lenses` | \{ `id`: `number`; `video`: \{ `recordingEnd`: `null` \| `number`; `recordingEndLQ`: `null` \| `number`; `recordingStart`: `null` \| `number`; `recordingStartLQ`: `null` \| `number`; `timelapseEnd`: `null` \| `number`; `timelapseEndLQ`: `null` \| `number`; `timelapseStart`: `null` \| `number`; `timelapseStartLQ`: `null` \| `number`; \}; \}[] |
| `mac` | `string` |
| `marketName` | `string` |
| `micVolume` | `number` |
| `modelKey` | `string` |
| `name` | `string` |
| `nvrMac` | `string` |
| `osdSettings` | \{ `isDateEnabled`: `boolean`; `isDebugEnabled`: `boolean`; `isLogoEnabled`: `boolean`; `isNameEnabled`: `boolean`; \} |
| `osdSettings.isDateEnabled` | `boolean` |
| `osdSettings.isDebugEnabled` | `boolean` |
| `osdSettings.isLogoEnabled` | `boolean` |
| `osdSettings.isNameEnabled` | `boolean` |
| `phyRate` | `number` |
| `pirSettings` | \{ `pirMotionClipLength`: `number`; `pirSensitivity`: `number`; `timelapseFrameInterval`: `number`; `timelapseTransferInterval`: `number`; \} |
| `pirSettings.pirMotionClipLength` | `number` |
| `pirSettings.pirSensitivity` | `number` |
| `pirSettings.timelapseFrameInterval` | `number` |
| `pirSettings.timelapseTransferInterval` | `number` |
| `platform` | `string` |
| `recordingSchedule` | `null` |
| `recordingSettings` | \{ `enablePirTimelapse`: `boolean`; `endMotionEventDelay`: `number`; `geofencing`: `string`; `minMotionEventTrigger`: `number`; `mode`: `string`; `postPaddingSecs`: `number`; `prePaddingSecs`: `number`; `retentionDurationMs`: `null` \| `number`; `suppressIlluminationSurge`: `boolean`; `useNewMotionAlgorithm`: `boolean`; \} |
| `recordingSettings.enablePirTimelapse` | `boolean` |
| `recordingSettings.endMotionEventDelay` | `number` |
| `recordingSettings.geofencing` | `string` |
| `recordingSettings.minMotionEventTrigger` | `number` |
| `recordingSettings.mode` | `string` |
| `recordingSettings.postPaddingSecs` | `number` |
| `recordingSettings.prePaddingSecs` | `number` |
| `recordingSettings.retentionDurationMs` | `null` \| `number` |
| `recordingSettings.suppressIlluminationSurge` | `boolean` |
| `recordingSettings.useNewMotionAlgorithm` | `boolean` |
| `smartDetectLines` | [] |
| `smartDetectSettings` | \{ `audioTypes`: `string`[]; `autoTrackingObjectTypes`: `string`[]; `detectionRange`: [`number`, `number`]; `objectTypes`: `string`[]; \} |
| `smartDetectSettings.audioTypes` | `string`[] |
| `smartDetectSettings.autoTrackingObjectTypes` | `string`[] |
| `smartDetectSettings.detectionRange` | [`number`, `number`] |
| `smartDetectSettings.objectTypes` | `string`[] |
| `smartDetectZones` | \{ `color`: `string`; `name`: `string`; `objectTypes`: `string`[]; `points`: [`number`, `number`][]; `sensitivity`: `number`; \}[] |
| `speakerSettings` | \{ `areSystemSoundsEnabled`: `boolean`; `isEnabled`: `boolean`; `volume`: `number`; \} |
| `speakerSettings.areSystemSoundsEnabled` | `boolean` |
| `speakerSettings.isEnabled` | `boolean` |
| `speakerSettings.volume` | `number` |
| `state` | `string` |
| `stats` | \{ `battery`: \{ `isCharging`: `boolean`; `percentage`: `null` \| `number`; `sleepState`: `string`; \}; `rxBytes`: `number`; `storage`: \{ `rate`: `number`; `used`: `number`; \}; `txBytes`: `number`; `video`: \{ `recordingEnd`: `number`; `recordingEndLQ`: `number`; `recordingStart`: `number`; `recordingStartLQ`: `number`; `timelapseEnd`: `number`; `timelapseEndLQ`: `number`; `timelapseStart`: `number`; `timelapseStartLQ`: `number`; \}; `wifi`: \{ `channel`: `null` \| `number`; `frequency`: `null` \| `number`; `linkSpeedMbps`: `null` \| `number`; `signalQuality`: `number`; `signalStrength`: `number`; \}; `wifiQuality`: `number`; `wifiStrength`: `number`; \} |
| `stats.battery` | \{ `isCharging`: `boolean`; `percentage`: `null` \| `number`; `sleepState`: `string`; \} |
| `stats.battery.isCharging` | `boolean` |
| `stats.battery.percentage` | `null` \| `number` |
| `stats.battery.sleepState` | `string` |
| `stats.rxBytes` | `number` |
| `stats.storage` | \{ `rate`: `number`; `used`: `number`; \} |
| `stats.storage.rate` | `number` |
| `stats.storage.used` | `number` |
| `stats.txBytes` | `number` |
| `stats.video` | \{ `recordingEnd`: `number`; `recordingEndLQ`: `number`; `recordingStart`: `number`; `recordingStartLQ`: `number`; `timelapseEnd`: `number`; `timelapseEndLQ`: `number`; `timelapseStart`: `number`; `timelapseStartLQ`: `number`; \} |
| `stats.video.recordingEnd` | `number` |
| `stats.video.recordingEndLQ` | `number` |
| `stats.video.recordingStart` | `number` |
| `stats.video.recordingStartLQ` | `number` |
| `stats.video.timelapseEnd` | `number` |
| `stats.video.timelapseEndLQ` | `number` |
| `stats.video.timelapseStart` | `number` |
| `stats.video.timelapseStartLQ` | `number` |
| `stats.wifi` | \{ `channel`: `null` \| `number`; `frequency`: `null` \| `number`; `linkSpeedMbps`: `null` \| `number`; `signalQuality`: `number`; `signalStrength`: `number`; \} |
| `stats.wifi.channel` | `null` \| `number` |
| `stats.wifi.frequency` | `null` \| `number` |
| `stats.wifi.linkSpeedMbps` | `null` \| `number` |
| `stats.wifi.signalQuality` | `number` |
| `stats.wifi.signalStrength` | `number` |
| `stats.wifiQuality` | `number` |
| `stats.wifiStrength` | `number` |
| `talkbackSettings` | \{ `bindAddr`: `string`; `bindPort`: `number`; `bitsPerSample`: `number`; `channels`: `number`; `filterAddr`: `string`; `filterPort`: `number`; `quality`: `number`; `samplingRate`: `number`; `typeFmt`: `string`; `typeIn`: `string`; \} |
| `talkbackSettings.bindAddr` | `string` |
| `talkbackSettings.bindPort` | `number` |
| `talkbackSettings.bitsPerSample` | `number` |
| `talkbackSettings.channels` | `number` |
| `talkbackSettings.filterAddr` | `string` |
| `talkbackSettings.filterPort` | `number` |
| `talkbackSettings.quality` | `number` |
| `talkbackSettings.samplingRate` | `number` |
| `talkbackSettings.typeFmt` | `string` |
| `talkbackSettings.typeIn` | `string` |
| `type` | `string` |
| `upSince` | `number` |
| `videoCodec` | `string` |
| `videoMode` | `string` |
| `wifiConnectionState` | \{ `channel`: `number`; `frequency`: `number`; `phyRate`: `number`; `signalQuality`: `number`; `signalStrength`: `number`; \} |
| `wifiConnectionState.channel` | `number` |
| `wifiConnectionState.frequency` | `number` |
| `wifiConnectionState.phyRate` | `number` |
| `wifiConnectionState.signalQuality` | `number` |
| `wifiConnectionState.signalStrength` | `number` |
| `wiredConnectionState` | \{ `phyRate`: `number`; \} |
| `wiredConnectionState.phyRate` | `number` |

***

### ProtectCameraLcdMessageConfigInterface

A semi-complete description of the UniFi Protect LCD message JSON.

#### Properties

| Property | Type |
| :------ | :------ |
| `duration` | `number` |
| `resetAt` | `null` \| `number` |
| `text` | `string` |
| `type` | `string` |

***

### ProtectChimeConfigInterface

A semi-complete description of the UniFi Protect chime JSON.

#### Properties

| Property | Type |
| :------ | :------ |
| `apMac` | `string` |
| `apMgmtIp` | `string` |
| `apRssi` | `string` |
| `cameraIds` | `string`[] |
| `canAdopt` | `boolean` |
| `connectedSince` | `number` |
| `connectionHost` | `string` |
| `elementInfo` | `string` |
| `featureFlags` | \{ `hasWifi`: `boolean`; \} |
| `featureFlags.hasWifi` | `boolean` |
| `firmwareBuild` | `string` |
| `firmwareVersion` | `string` |
| `fwUpdateState` | `string` |
| `hardwareRevision` | `string` |
| `host` | `string` |
| `id` | `string` |
| `isAdopted` | `boolean` |
| `isAdoptedByOther` | `boolean` |
| `isAdopting` | `boolean` |
| `isAttemptingToConnect` | `boolean` |
| `isConnected` | `boolean` |
| `isDownloadingFW` | `boolean` |
| `isProbingForWifi` | `boolean` |
| `isProvisioned` | `boolean` |
| `isRebooting` | `boolean` |
| `isSshEnabled` | `boolean` |
| `isUpdating` | `boolean` |
| `isWirelessUplinkEnabled` | `boolean` |
| `lastRing` | `number` |
| `lastSeen` | `number` |
| `latestFirmwareVersion` | `string` |
| `mac` | `string` |
| `marketName` | `string` |
| `modelKey` | `string` |
| `name` | `string` |
| `state` | `string` |
| `type` | `string` |
| `upSince` | `number` |
| `uptime` | `number` |
| `volume` | `number` |
| `wifiConnectionState` | \{ `apName`: `null` \| `string`; `bssid`: `null` \| `string`; `channel`: `null` \| `string`; `connectivity`: `string`; `experience`: `null`; `frequency`: `null`; `phyRate`: `number`; `signalQuality`: `number`; `signalStrength`: `number`; `ssid`: `null` \| `string`; `txRate`: `null`; \} |
| `wifiConnectionState.apName` | `null` \| `string` |
| `wifiConnectionState.bssid` | `null` \| `string` |
| `wifiConnectionState.channel` | `null` \| `string` |
| `wifiConnectionState.connectivity` | `string` |
| `wifiConnectionState.experience` | `null` |
| `wifiConnectionState.frequency` | `null` |
| `wifiConnectionState.phyRate` | `number` |
| `wifiConnectionState.signalQuality` | `number` |
| `wifiConnectionState.signalStrength` | `number` |
| `wifiConnectionState.ssid` | `null` \| `string` |
| `wifiConnectionState.txRate` | `null` |
| `wiredConnectionState` | \{ `phyRate`: `number`; \} |
| `wiredConnectionState.phyRate` | `number` |

***

### ProtectEventAddInterface

A semi-complete description of the UniFi Protect smart motion detection event JSON.

#### Properties

| Property | Type |
| :------ | :------ |
| `camera` | `string` |
| `end` | `number` |
| `id` | `string` |
| `metadata` | [`ProtectEventMetadataInterface`](ProtectTypes.md#protecteventmetadatainterface) |
| `modelKey` | `string` |
| `partition` | `string` |
| `score` | `number` |
| `smartDetectEvents` | `string`[] |
| `smartDetectTypes` | `string`[] |
| `start` | `number` |
| `type` | `string` |
| `user` | `string` |

***

### ProtectEventMetadataInterface

A description of metadata in UniFi Protect smart motion detect events.

#### Properties

| Property | Type |
| :------ | :------ |
| `deviceId` | \{ `text`: `string`; \} |
| `deviceId.text` | `string` |
| `isLowBattery` | `boolean` |
| `isWireless` | `boolean` |
| `licensePlate` | \{ `confidenceLevel`: `number`; `name`: `string`; \} |
| `licensePlate.confidenceLevel` | `number` |
| `licensePlate.name` | `string` |
| `name` | \{ `text`: `string`; \} |
| `name.text` | `string` |
| `reason` | `string` |

***

### ProtectLightConfigInterface

A semi-complete description of the UniFi Protect light JSON.

#### Properties

| Property | Type |
| :------ | :------ |
| `camera` | `string` |
| `canAdopt` | `boolean` |
| `connectedSince` | `number` |
| `connectionHost` | `string` |
| `firmwareBuild` | `string` |
| `firmwareVersion` | `string` |
| `hardwareRevision` | `string` |
| `host` | `string` |
| `id` | `string` |
| `isAdopted` | `boolean` |
| `isAdoptedByOther` | `boolean` |
| `isAdopting` | `boolean` |
| `isAttemptingToConnect` | `boolean` |
| `isCameraPaired` | `boolean` |
| `isConnected` | `boolean` |
| `isDark` | `boolean` |
| `isLightOn` | `boolean` |
| `isLocating` | `boolean` |
| `isPirMotionDetected` | `boolean` |
| `isProvisioned` | `boolean` |
| `isRebooting` | `boolean` |
| `isSshEnabled` | `boolean` |
| `isUpdating` | `boolean` |
| `lastMotion` | `number` |
| `lastSeen` | `number` |
| `latestFirmwareVersion` | `string` |
| `lightDeviceSettings` | \{ `isIndicatorEnabled`: `boolean`; `ledLevel`: `number`; `luxSensitivity`: `string`; `pirDuration`: `number`; `pirSensitivity`: `number`; \} |
| `lightDeviceSettings.isIndicatorEnabled` | `boolean` |
| `lightDeviceSettings.ledLevel` | `number` |
| `lightDeviceSettings.luxSensitivity` | `string` |
| `lightDeviceSettings.pirDuration` | `number` |
| `lightDeviceSettings.pirSensitivity` | `number` |
| `lightModeSettings` | \{ `enableAt`: `string`; `mode`: `string`; \} |
| `lightModeSettings.enableAt` | `string` |
| `lightModeSettings.mode` | `string` |
| `lightOnSettings` | \{ `isLedForceOn`: `boolean`; \} |
| `lightOnSettings.isLedForceOn` | `boolean` |
| `mac` | `string` |
| `marketName` | `string` |
| `modelKey` | `string` |
| `name` | `string` |
| `state` | `string` |
| `type` | `string` |
| `upSince` | `number` |
| `uptime` | `number` |
| `wiredConnectionState` | \{ `phyRate`: `number`; \} |
| `wiredConnectionState.phyRate` | `number` |

***

### ProtectNvrBootstrapInterface

An semi-complete description of the UniFi Protect NVR bootstrap JSON.

#### Indexable

 \[`key`: `string`\]: 
  \| [`ProtectCameraConfig`](ProtectTypes.md#protectcameraconfig)[]
  \| [`ProtectChimeConfig`](ProtectTypes.md#protectchimeconfig)[]
  \| [`ProtectLightConfig`](ProtectTypes.md#protectlightconfig)[]
  \| [`ProtectNvrConfig`](ProtectTypes.md#protectnvrconfig)
  \| [`ProtectNvrLiveviewConfig`](ProtectTypes.md#protectnvrliveviewconfig)[]
  \| [`ProtectNvrUserConfig`](ProtectTypes.md#protectnvruserconfig)[]
  \| [`ProtectSensorConfig`](ProtectTypes.md#protectsensorconfig)[]
  \| [`ProtectViewerConfig`](ProtectTypes.md#protectviewerconfig)[]
  \| `string`
  \| `unknown`[]

#### Properties

| Property | Type |
| :------ | :------ |
| `accessKey` | `string` |
| `authUserId` | `string` |
| `bridges` | `unknown`[] |
| `cameras` | [`ProtectCameraConfigInterface`](ProtectTypes.md#protectcameraconfiginterface)[] |
| `chimes` | [`ProtectChimeConfigInterface`](ProtectTypes.md#protectchimeconfiginterface)[] |
| `cloudPortalUrl` | `string` |
| `groups` | `unknown`[] |
| `lastUpdateId` | `string` |
| `lights` | [`ProtectLightConfigInterface`](ProtectTypes.md#protectlightconfiginterface)[] |
| `liveviews` | [`ProtectNvrLiveviewConfigInterface`](ProtectTypes.md#protectnvrliveviewconfiginterface)[] |
| `nvr` | [`ProtectNvrConfigInterface`](ProtectTypes.md#protectnvrconfiginterface) |
| `sensors` | [`ProtectSensorConfigInterface`](ProtectTypes.md#protectsensorconfiginterface)[] |
| `users` | [`ProtectNvrUserConfigInterface`](ProtectTypes.md#protectnvruserconfiginterface)[] |
| `viewers` | [`ProtectViewerConfigInterface`](ProtectTypes.md#protectviewerconfiginterface)[] |

***

### ProtectNvrConfigInterface

A semi-complete description of the UniFi Protect NVR configuration JSON.

#### Properties

| Property | Type |
| :------ | :------ |
| `analyticsData` | `string` |
| `anonymouseDeviceId` | `string` |
| `availableUpdate` | `string` |
| `avgMotions` | `number`[] |
| `cameraUtilization` | `number` |
| `canAutoUpdate` | `boolean` |
| `consoleEnv` | `string` |
| `corruptionState` | `string` |
| `countryCode` | `string` |
| `deviceFirmwareSettings` | \{ `configuredBy`: `string`; `isAutoUpdateEnabled`: `boolean`; `schedule`: \{ `hour`: `number`; \}; \} |
| `deviceFirmwareSettings.configuredBy` | `string` |
| `deviceFirmwareSettings.isAutoUpdateEnabled` | `boolean` |
| `deviceFirmwareSettings.schedule` | \{ `hour`: `number`; \} |
| `deviceFirmwareSettings.schedule.hour` | `number` |
| `disableAudio` | `boolean` |
| `disableAutoLink` | `boolean` |
| `doorbellSettings` | \{ `allMessages`: \{ `text`: `string`; `type`: `string`; \}[]; `customImages`: `string`[]; `customMessages`: `string`[]; `defaultMessageResetTimeoutMs`: `number`; `defaultMessageText`: `string`; \} |
| `doorbellSettings.allMessages` | \{ `text`: `string`; `type`: `string`; \}[] |
| `doorbellSettings.customImages` | `string`[] |
| `doorbellSettings.customMessages` | `string`[] |
| `doorbellSettings.defaultMessageResetTimeoutMs` | `number` |
| `doorbellSettings.defaultMessageText` | `string` |
| `enableAutomaticBackups` | `boolean` |
| `enableBridgeAutoAdoption` | `boolean` |
| `enableCrashReporting` | `boolean` |
| `enableStatsReporting` | `boolean` |
| `errorCode` | `null` \| `string` |
| `featureFlags` | \{ `beta`: `boolean`; `detectionLabels`: `boolean`; `dev`: `boolean`; `hasTwoWayAudioMediaStreams`: `boolean`; `homekitPaired`: `boolean`; `notificationsV2`: `boolean`; `ulpRoleManagement`: `boolean`; \} |
| `featureFlags.beta` | `boolean` |
| `featureFlags.detectionLabels` | `boolean` |
| `featureFlags.dev` | `boolean` |
| `featureFlags.hasTwoWayAudioMediaStreams` | `boolean` |
| `featureFlags.homekitPaired` | `boolean` |
| `featureFlags.notificationsV2` | `boolean` |
| `featureFlags.ulpRoleManagement` | `boolean` |
| `firmwareVersion` | `string` |
| `hardwareId` | `string` |
| `hardwarePlatform` | `string` |
| `hardwareRevision` | `string` |
| `hasGateway` | `boolean` |
| `host` | `string` |
| `hostShortname` | `string` |
| `hostType` | `string` |
| `hosts` | `string`[] |
| `id` | `string` |
| `isAway` | `boolean` |
| `isHardware` | `boolean` |
| `isInsightsEnabled` | `boolean` |
| `isNetworkInstalled` | `boolean` |
| `isPrimary` | `boolean` |
| `isProtectUpdatable` | `boolean` |
| `isRecordingDisabled` | `boolean` |
| `isRecordingMotionOnly` | `boolean` |
| `isRecycling` | `boolean` |
| `isSetup` | `boolean` |
| `isSshEnabled` | `boolean` |
| `isStacked` | `boolean` |
| `isStation` | `boolean` |
| `isStatsGatheringEnabled` | `boolean` |
| `isUCoreSetup` | `boolean` |
| `isUCoreStacked` | `boolean` |
| `isUcoreUpdatable` | `boolean` |
| `isUpdating` | `boolean` |
| `isWirelessUplinkEnabled` | `boolean` |
| `lastSeen` | `number` |
| `lastUpdateAt` | `null` \| `number` |
| `locationSettings` | \{ `isAway`: `boolean`; `isGeofencingEnabled`: `boolean`; `latitude`: `number`; `longitude`: `number`; `radius`: `number`; \} |
| `locationSettings.isAway` | `boolean` |
| `locationSettings.isGeofencingEnabled` | `boolean` |
| `locationSettings.latitude` | `number` |
| `locationSettings.longitude` | `number` |
| `locationSettings.radius` | `number` |
| `mac` | `string` |
| `marketName` | `string` |
| `maxCameraCapacity` | `Record`\<`string`, `number`\> |
| `modelKey` | `string` |
| `name` | `string` |
| `network` | `string` |
| `ports` | \{ `aiFeatureConsole`: `number`; `cameraEvents`: `number`; `cameraHttps`: `number`; `cameraTcp`: `number`; `devicesWss`: `number`; `discoveryClient`: `number`; `emsCLI`: `number`; `emsJsonCLI`: `number`; `emsLiveFLV`: `number`; `http`: `number`; `https`: `number`; `liveWs`: `number`; `liveWss`: `number`; `piongw`: `number`; `playback`: `number`; `rtmp`: `number`; `rtsp`: `number`; `rtsps`: `number`; `stacking`: `number`; `tcpBridge`: `number`; `tcpStreams`: `number`; `ucore`: `number`; `ump`: `number`; \} |
| `ports.aiFeatureConsole` | `number` |
| `ports.cameraEvents` | `number` |
| `ports.cameraHttps` | `number` |
| `ports.cameraTcp` | `number` |
| `ports.devicesWss` | `number` |
| `ports.discoveryClient` | `number` |
| `ports.emsCLI` | `number` |
| `ports.emsJsonCLI` | `number` |
| `ports.emsLiveFLV` | `number` |
| `ports.http` | `number` |
| `ports.https` | `number` |
| `ports.liveWs` | `number` |
| `ports.liveWss` | `number` |
| `ports.piongw` | `number` |
| `ports.playback` | `number` |
| `ports.rtmp` | `number` |
| `ports.rtsp` | `number` |
| `ports.rtsps` | `number` |
| `ports.stacking` | `number` |
| `ports.tcpBridge` | `number` |
| `ports.tcpStreams` | `number` |
| `ports.ucore` | `number` |
| `ports.ump` | `number` |
| `publicIp` | `string` |
| `recordingRetentionDurationMs` | `string` |
| `releaseChannel` | `string` |
| `skipFirmwareUpdate` | `boolean` |
| `smartDetectAgreement` | \{ `lastUpdateAt`: `null` \| `number`; `status`: `string`; \} |
| `smartDetectAgreement.lastUpdateAt` | `null` \| `number` |
| `smartDetectAgreement.status` | `string` |
| `smartDetection` | \{ `enable`: `boolean`; `faceRecognition`: `boolean`; `licensePlateRecognition`: `boolean`; \} |
| `smartDetection.enable` | `boolean` |
| `smartDetection.faceRecognition` | `boolean` |
| `smartDetection.licensePlateRecognition` | `boolean` |
| `ssoChannel` | `null` \| `string` |
| `storageStats` | \{ `capacity`: `number`; `recordingSpace`: \{ `available`: `number`; `total`: `number`; `used`: `number`; \}; `remainingCapacity`: `number`; `storageDistribution`: \{ `recordingTypeDistributions`: \{ `percentage`: `number`; `recordingType`: `string`; `size`: `number`; \}[]; `resolutionDistributions`: \{ `percentage`: `number`; `recordingType`: `string`; `size`: `number`; \}[]; \}; `utilization`: `number`; \} |
| `storageStats.capacity` | `number` |
| `storageStats.recordingSpace` | \{ `available`: `number`; `total`: `number`; `used`: `number`; \} |
| `storageStats.recordingSpace.available` | `number` |
| `storageStats.recordingSpace.total` | `number` |
| `storageStats.recordingSpace.used` | `number` |
| `storageStats.remainingCapacity` | `number` |
| `storageStats.storageDistribution` | \{ `recordingTypeDistributions`: \{ `percentage`: `number`; `recordingType`: `string`; `size`: `number`; \}[]; `resolutionDistributions`: \{ `percentage`: `number`; `recordingType`: `string`; `size`: `number`; \}[]; \} |
| `storageStats.storageDistribution.recordingTypeDistributions` | \{ `percentage`: `number`; `recordingType`: `string`; `size`: `number`; \}[] |
| `storageStats.storageDistribution.resolutionDistributions` | \{ `percentage`: `number`; `recordingType`: `string`; `size`: `number`; \}[] |
| `storageStats.utilization` | `number` |
| `streamSharingAvailable` | `boolean` |
| `systemInfo` | [`ProtectNvrSystemInfoInterface`](ProtectTypes.md#protectnvrsysteminfointerface) |
| `temperatureUnit` | `string` |
| `timeFormat` | `string` |
| `timezone` | `string` |
| `type` | `string` |
| `ucoreVersion` | `string` |
| `uiVersion` | `string` |
| `upSince` | `number` |
| `uptime` | `number` |
| `version` | `string` |
| `wanIp` | `string` |
| `wifiSettings` | \{ `password`: `null` \| `string`; `ssid`: `null` \| `string`; `useThirdPartyWifi`: `boolean`; \} |
| `wifiSettings.password` | `null` \| `string` |
| `wifiSettings.ssid` | `null` \| `string` |
| `wifiSettings.useThirdPartyWifi` | `boolean` |

***

### ProtectNvrLiveviewConfigInterface

A semi-complete description of the UniFi Protect NVR liveview JSON.

#### Properties

| Property | Type |
| :------ | :------ |
| `id` | `string` |
| `isDefault` | `boolean` |
| `isGlobal` | `boolean` |
| `layout` | `number` |
| `modelKey` | `string` |
| `name` | `string` |
| `owner` | `string` |
| `slots` | \{ `cameras`: `string`[]; `cycleInterval`: `number`; `cycleMode`: `string`; \}[] |

***

### ProtectNvrSystemEventControllerInterface

A semi-complete description of the UniFi Protect system events controller JSON.

#### Properties

| Property | Type |
| :------ | :------ |
| `harddriveRequired` | `boolean` |
| `info` | \{ `events`: `number`[]; `isAdopted`: `boolean`; `isConnectedToCloud`: `boolean`; `isSetup`: `boolean`; `lastMotion`: `number`; `lastMotionCamera`: `string`; `lastMotionCameraAddress`: `string`; `lastMotionCameraModel`: `string`; `managedCameras`: `number`; `offlineCameras`: `number`; `oldestRecording`: `number`; `onlineCameras`: `number`; `recordingSpaceTotal`: `number`; `recordingSpaceUsed`: `number`; `retentionTime`: `number`; `startedAt`: `number`; `throughput`: `number`; `timeFormat`: `string`; `updateAvailable`: `boolean`; `updateVersion`: `string`; \} |
| `info.events` | `number`[] |
| `info.isAdopted` | `boolean` |
| `info.isConnectedToCloud` | `boolean` |
| `info.isSetup` | `boolean` |
| `info.lastMotion` | `number` |
| `info.lastMotionCamera` | `string` |
| `info.lastMotionCameraAddress` | `string` |
| `info.lastMotionCameraModel` | `string` |
| `info.managedCameras` | `number` |
| `info.offlineCameras` | `number` |
| `info.oldestRecording` | `number` |
| `info.onlineCameras` | `number` |
| `info.recordingSpaceTotal` | `number` |
| `info.recordingSpaceUsed` | `number` |
| `info.retentionTime` | `number` |
| `info.startedAt` | `number` |
| `info.throughput` | `number` |
| `info.timeFormat` | `string` |
| `info.updateAvailable` | `boolean` |
| `info.updateVersion` | `string` |
| `installState` | `string` |
| `isConfigured` | `boolean` |
| `isInstalled` | `boolean` |
| `isRunning` | `boolean` |
| `name` | `string` |
| `port` | `number` |
| `required` | `boolean` |
| `state` | `string` |
| `status` | `string` |
| `statusMessage` | `string` |
| `swaiVersion` | `number` |
| `type` | `string` |
| `ui` | \{ `apiPrefix`: `string`; `baseUrl`: `string`; `cdnPublicPaths`: `string`[]; `entrypoint`: `string`; `hotkey`: `string`; `icon`: `string`; `publicPath`: `string`; `swaiVersion`: `number`; \} |
| `ui.apiPrefix` | `string` |
| `ui.baseUrl` | `string` |
| `ui.cdnPublicPaths` | `string`[] |
| `ui.entrypoint` | `string` |
| `ui.hotkey` | `string` |
| `ui.icon` | `string` |
| `ui.publicPath` | `string` |
| `ui.swaiVersion` | `number` |
| `uiNpmPackageName` | `string` |
| `uiVersion` | `string` |
| `unadoptedDevices` | `unknown`[] |
| `updateAvailable` | `string` |
| `version` | `string` |

***

### ProtectNvrSystemEventInterface

A semi-complete description of the UniFi Protect system events JSON.

#### Properties

| Property | Type |
| :------ | :------ |
| `apps` | \{ `apps`: `unknown`[]; `controllers`: [`ProtectNvrSystemEventControllerInterface`](ProtectTypes.md#protectnvrsystemeventcontrollerinterface)[]; \} |
| `apps.apps` | `unknown`[] |
| `apps.controllers` | [`ProtectNvrSystemEventControllerInterface`](ProtectTypes.md#protectnvrsystemeventcontrollerinterface)[] |
| `system` | `unknown` |
| `type` | `string` |

***

### ProtectNvrSystemInfoInterface

A semi-complete description of the UniFi Protect NVR system information configuration JSON.

#### Properties

| Property | Type |
| :------ | :------ |
| `cpu` | \{ `averageLoad`: `number`; `temperature`: `number`; \} |
| `cpu.averageLoad` | `number` |
| `cpu.temperature` | `number` |
| `memory` | \{ `available`: `number`; `free`: `number`; `total`: `number`; \} |
| `memory.available` | `number` |
| `memory.free` | `number` |
| `memory.total` | `number` |
| `storage` | \{ `available`: `number`; `devices`: \{ `healthy`: `boolean`; `model`: `string`; `size`: `number`; \}[]; `isRecycling`: `boolean`; `size`: `number`; `type`: `string`; `used`: `number`; \} |
| `storage.available` | `number` |
| `storage.devices` | \{ `healthy`: `boolean`; `model`: `string`; `size`: `number`; \}[] |
| `storage.isRecycling` | `boolean` |
| `storage.size` | `number` |
| `storage.type` | `string` |
| `storage.used` | `number` |
| `tmpfs` | \{ `available`: `number`; `path`: `string`; `total`: `number`; `used`: `number`; \} |
| `tmpfs.available` | `number` |
| `tmpfs.path` | `string` |
| `tmpfs.total` | `number` |
| `tmpfs.used` | `number` |

***

### ProtectNvrUserConfigInterface

A semi-complete description of the UniFi Protect NVR user JSON.

#### Properties

| Property | Type |
| :------ | :------ |
| `alertRules` | `unknown`[] |
| `allPermissions` | `string`[] |
| `cloudAccount` | `string` |
| `email` | `string` |
| `enableNotifications` | `boolean` |
| `firstName` | `string` |
| `groups` | `string`[] |
| `hasAcceptedInvite` | `boolean` |
| `id` | `string` |
| `isOwner` | `boolean` |
| `lastLoginIp` | `string` |
| `lastLoginTime` | `number` |
| `lastName` | `string` |
| `localUsername` | `string` |
| `location` | \{ `isAway`: `boolean`; `latitude`: `string`; `longitude`: `string`; \} |
| `location.isAway` | `boolean` |
| `location.latitude` | `string` |
| `location.longitude` | `string` |
| `modelKey` | `string` |
| `name` | `string` |
| `permissions` | `string`[] |
| `role` | `string` |
| `settings` | \{ `flags`: `string`[]; \} |
| `settings.flags` | `string`[] |
| `syncSso` | `boolean` |

***

### ProtectSensorConfigInterface

A semi-complete description of the UniFi Protect sensor JSON.

#### Properties

| Property | Type |
| :------ | :------ |
| `alarmSettings` | \{ `isEnabled`: `boolean`; \} |
| `alarmSettings.isEnabled` | `boolean` |
| `alarmTriggeredAt` | `null` \| `number` |
| `batteryStatus` | \{ `isLow`: `boolean`; `percentage`: `number`; \} |
| `batteryStatus.isLow` | `boolean` |
| `batteryStatus.percentage` | `number` |
| `bluetoothConnectionState` | \{ `signalQuality`: `number`; `signalStrength`: `number`; \} |
| `bluetoothConnectionState.signalQuality` | `number` |
| `bluetoothConnectionState.signalStrength` | `number` |
| `bridge` | `string` |
| `bridgeCandidates` | [] |
| `camera` | `string` |
| `canAdopt` | `boolean` |
| `connectedSince` | `number` |
| `connectionHost` | `string` |
| `firmwareBuild` | `string` |
| `firmwareVersion` | `string` |
| `hardwareRevision` | `string` |
| `humiditySettings` | \{ `highThreshold`: `number`; `isEnabled`: `boolean`; `lowThreshold`: `number`; `margin`: `number`; \} |
| `humiditySettings.highThreshold` | `number` |
| `humiditySettings.isEnabled` | `boolean` |
| `humiditySettings.lowThreshold` | `number` |
| `humiditySettings.margin` | `number` |
| `id` | `string` |
| `isAdopted` | `boolean` |
| `isAdoptedByOther` | `boolean` |
| `isAdopting` | `boolean` |
| `isAttemptingToConnect` | `boolean` |
| `isConnected` | `boolean` |
| `isMotionDetected` | `boolean` |
| `isOpened` | `boolean` |
| `isProvisioned` | `boolean` |
| `isRebooting` | `boolean` |
| `isSshEnabled` | `boolean` |
| `isUpdating` | `boolean` |
| `lastSeen` | `number` |
| `latestFirmwareVersion` | `string` |
| `leakDetectedAt` | `number` |
| `ledSettings` | \{ `isEnabled`: `boolean`; \} |
| `ledSettings.isEnabled` | `boolean` |
| `lightSettings` | \{ `highThreshold`: `number`; `isEnabled`: `boolean`; `lowThreshold`: `number`; `margin`: `number`; \} |
| `lightSettings.highThreshold` | `number` |
| `lightSettings.isEnabled` | `boolean` |
| `lightSettings.lowThreshold` | `number` |
| `lightSettings.margin` | `number` |
| `mac` | `string` |
| `marketName` | `string` |
| `modelKey` | `string` |
| `motionDetectedAt` | `number` |
| `motionSettings` | \{ `isEnabled`: `boolean`; `sensitivity`: `number`; \} |
| `motionSettings.isEnabled` | `boolean` |
| `motionSettings.sensitivity` | `number` |
| `mountType` | `string` |
| `name` | `string` |
| `openStatusChangedAt` | `number` |
| `state` | `string` |
| `stats` | \{ `humidity`: \{ `status`: `string`; `value`: `null` \| `number`; \}; `light`: \{ `status`: `string`; `value`: `null` \| `number`; \}; `temperature`: \{ `status`: `string`; `value`: `null` \| `number`; \}; \} |
| `stats.humidity` | \{ `status`: `string`; `value`: `null` \| `number`; \} |
| `stats.humidity.status` | `string` |
| `stats.humidity.value` | `null` \| `number` |
| `stats.light` | \{ `status`: `string`; `value`: `null` \| `number`; \} |
| `stats.light.status` | `string` |
| `stats.light.value` | `null` \| `number` |
| `stats.temperature` | \{ `status`: `string`; `value`: `null` \| `number`; \} |
| `stats.temperature.status` | `string` |
| `stats.temperature.value` | `null` \| `number` |
| `tamperingDetectedAt` | `null` \| `number` |
| `temperatureSettings` | \{ `highThreshold`: `number`; `isEnabled`: `boolean`; `lowThreshold`: `number`; `margin`: `number`; \} |
| `temperatureSettings.highThreshold` | `number` |
| `temperatureSettings.isEnabled` | `boolean` |
| `temperatureSettings.lowThreshold` | `number` |
| `temperatureSettings.margin` | `number` |
| `type` | `string` |
| `upSince` | `number` |
| `uptime` | `number` |
| `wiredConnectionState` | \{ `phyRate`: `number`; \} |
| `wiredConnectionState.phyRate` | `number` |

***

### ProtectViewerConfigInterface

A semi-complete description of the UniFi Protect viewer JSON.

#### Properties

| Property | Type |
| :------ | :------ |
| `canAdopt` | `boolean` |
| `connectedSince` | `number` |
| `connectionHost` | `string` |
| `firmwareBuild` | `string` |
| `firmwareVersion` | `string` |
| `hardwareRevision` | `string` |
| `host` | `string` |
| `id` | `string` |
| `isAdopted` | `boolean` |
| `isAdoptedByOther` | `boolean` |
| `isAdopting` | `boolean` |
| `isAttemptingToConnect` | `boolean` |
| `isConnected` | `boolean` |
| `isProvisioned` | `boolean` |
| `isRebooting` | `boolean` |
| `isSshEnabled` | `boolean` |
| `isUpdating` | `boolean` |
| `lastSeen` | `number` |
| `latestFirmwareVersion` | `string` |
| `liveview` | `null` \| `string` |
| `mac` | `string` |
| `marketName` | `string` |
| `modelKey` | `string` |
| `name` | `string` |
| `softwareVersion` | `string` |
| `state` | `string` |
| `streamLimit` | `number` |
| `type` | `string` |
| `upSince` | `number` |
| `uptime` | `number` |
| `wiredConnectionState` | \{ `phyRate`: `number`; \} |
| `wiredConnectionState.phyRate` | `number` |

## Type Aliases

### ProtectCameraChannelConfig

```ts
type ProtectCameraChannelConfig: ProtectCameraChannelConfigInterface;
```

#### See

[ProtectCameraChannelConfigInterface](ProtectTypes.md#protectcamerachannelconfiginterface)

***

### ProtectCameraConfig

```ts
type ProtectCameraConfig: ProtectCameraConfigInterface;
```

#### See

[ProtectCameraConfigInterface](ProtectTypes.md#protectcameraconfiginterface)

***

### ProtectCameraConfigPayload

```ts
type ProtectCameraConfigPayload: DeepPartial<ProtectCameraConfigInterface>;
```

#### See

[ProtectCameraConfigInterface](ProtectTypes.md#protectcameraconfiginterface)

***

### ProtectCameraLcdMessageConfig

```ts
type ProtectCameraLcdMessageConfig: ProtectCameraLcdMessageConfigInterface;
```

#### See

[ProtectCameraLcdMessageConfigInterface](ProtectTypes.md#protectcameralcdmessageconfiginterface)

***

### ProtectCameraLcdMessagePayload

```ts
type ProtectCameraLcdMessagePayload: DeepPartial<ProtectCameraLcdMessageConfigInterface>;
```

#### See

[ProtectCameraLcdMessageConfigInterface](ProtectTypes.md#protectcameralcdmessageconfiginterface)

***

### ProtectChimeConfig

```ts
type ProtectChimeConfig: ProtectChimeConfigInterface;
```

#### See

[ProtectChimeConfigInterface](ProtectTypes.md#protectchimeconfiginterface)

***

### ProtectChimeConfigPayload

```ts
type ProtectChimeConfigPayload: DeepPartial<ProtectChimeConfigInterface>;
```

#### See

[ProtectChimeConfigInterface](ProtectTypes.md#protectchimeconfiginterface)

***

### ProtectEventAdd

```ts
type ProtectEventAdd: ProtectEventAddInterface;
```

#### See

[ProtectEventAddInterface](ProtectTypes.md#protecteventaddinterface)

***

### ProtectEventMetadata

```ts
type ProtectEventMetadata: ProtectEventMetadataInterface;
```

#### See

[ProtectEventMetadataInterface](ProtectTypes.md#protecteventmetadatainterface)

***

### ProtectLightConfig

```ts
type ProtectLightConfig: ProtectLightConfigInterface;
```

#### See

[ProtectLightConfigInterface](ProtectTypes.md#protectlightconfiginterface)

***

### ProtectLightConfigPayload

```ts
type ProtectLightConfigPayload: DeepPartial<ProtectLightConfigInterface>;
```

#### See

[ProtectLightConfigInterface](ProtectTypes.md#protectlightconfiginterface)

***

### ProtectNvrBootstrap

```ts
type ProtectNvrBootstrap: ProtectNvrBootstrapInterface;
```

#### See

[ProtectNvrBootstrapInterface](ProtectTypes.md#protectnvrbootstrapinterface)

***

### ProtectNvrConfig

```ts
type ProtectNvrConfig: ProtectNvrConfigInterface;
```

#### See

[ProtectNvrConfigInterface](ProtectTypes.md#protectnvrconfiginterface)

***

### ProtectNvrConfigPayload

```ts
type ProtectNvrConfigPayload: DeepPartial<ProtectNvrConfigInterface>;
```

#### See

[ProtectNvrConfigInterface](ProtectTypes.md#protectnvrconfiginterface)

***

### ProtectNvrLiveviewConfig

```ts
type ProtectNvrLiveviewConfig: ProtectNvrLiveviewConfigInterface;
```

#### See

[ProtectNvrLiveviewConfigInterface](ProtectTypes.md#protectnvrliveviewconfiginterface)

***

### ProtectNvrSystemEvent

```ts
type ProtectNvrSystemEvent: ProtectNvrSystemEventInterface;
```

#### See

[ProtectNvrSystemEventInterface](ProtectTypes.md#protectnvrsystemeventinterface)

***

### ProtectNvrSystemEventController

```ts
type ProtectNvrSystemEventController: ProtectNvrSystemEventControllerInterface;
```

#### See

[ProtectNvrSystemEventInterface](ProtectTypes.md#protectnvrsystemeventinterface)

***

### ProtectNvrSystemInfoConfig

```ts
type ProtectNvrSystemInfoConfig: ProtectNvrSystemInfoInterface;
```

#### See

[ProtectNvrSystemInfoInterface](ProtectTypes.md#protectnvrsysteminfointerface)

***

### ProtectNvrUserConfig

```ts
type ProtectNvrUserConfig: ProtectNvrUserConfigInterface;
```

#### See

[ProtectNvrUserConfigInterface](ProtectTypes.md#protectnvruserconfiginterface)

***

### ProtectSensorConfig

```ts
type ProtectSensorConfig: ProtectSensorConfigInterface;
```

#### See

[ProtectSensorConfigInterface](ProtectTypes.md#protectsensorconfiginterface)

***

### ProtectSensorConfigPayload

```ts
type ProtectSensorConfigPayload: DeepPartial<ProtectSensorConfigInterface>;
```

#### See

[ProtectSensorConfigInterface](ProtectTypes.md#protectsensorconfiginterface)

***

### ProtectViewerConfig

```ts
type ProtectViewerConfig: ProtectViewerConfigInterface;
```

#### See

[ProtectViewerConfigInterface](ProtectTypes.md#protectviewerconfiginterface)

***

### ProtectViewerConfigPayload

```ts
type ProtectViewerConfigPayload: DeepPartial<ProtectViewerConfigInterface>;
```

#### See

[ProtectViewerConfigInterface](ProtectTypes.md#protectviewerconfiginterface)
