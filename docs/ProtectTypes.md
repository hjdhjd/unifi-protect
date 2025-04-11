[**unifi-protect**](README.md)

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
| ------ | ------ |
| <a id="autobitrate"></a> `autoBitrate` | `boolean` |
| <a id="autofps"></a> `autoFps` | `boolean` |
| <a id="bitrate"></a> `bitrate` | `number` |
| <a id="enabled"></a> `enabled` | `boolean` |
| <a id="fps"></a> `fps` | `number` |
| <a id="fpsvalues"></a> `fpsValues` | `number`[] |
| <a id="height"></a> `height` | `number` |
| <a id="id"></a> `id` | `number` |
| <a id="idrinterval"></a> `idrInterval` | `number` |
| <a id="isrtspenabled"></a> `isRtspEnabled` | `boolean` |
| <a id="maxbitrate"></a> `maxBitrate` | `number` |
| <a id="minbitrate"></a> `minBitrate` | `number` |
| <a id="minclientadaptivebitrate"></a> `minClientAdaptiveBitRate` | `number` |
| <a id="minmotionadaptivebitrate"></a> `minMotionAdaptiveBitRate` | `number` |
| <a id="name"></a> `name` | `string` |
| <a id="rtspalias"></a> `rtspAlias` | `string` |
| <a id="videoid"></a> `videoId` | `string` |
| <a id="width"></a> `width` | `number` |

***

### ProtectCameraConfigInterface

A semi-complete description of the UniFi Protect camera JSON.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="accessdevicemetadata"></a> `accessDeviceMetadata` | \{ `channels`: \{ `bitrate`: `number`; `fps`: `number`; `fpsValues`: `number`[]; `height`: `number`; `id`: `number`; `localStreamName`: `string`; `quality`: `string`; `width`: `number`; \}[]; `connectedSince`: `number`; `disableRecordingByDefault`: `boolean`; `doorInfo`: \{ `canLock`: `boolean`; `lockState`: `string`; \}; `featureFlags`: \{ `supportLivestream`: `boolean`; `supportUnlock`: `boolean`; \}; `ledSettings`: \{ `isEnabled`: `boolean`; \}; `micVolume`: `number`; `pairedInfo`: \{ `name`: `string`; `uri`: `string`; \}; `speakerSettings`: \{ `areSystemSoundsEnabled`: `boolean`; \}; `talkbackSettings`: [`ProtectCameraTalkbackConfigInterface`](#protectcameratalkbackconfiginterface)[]; \} |
| `accessDeviceMetadata.channels` | \{ `bitrate`: `number`; `fps`: `number`; `fpsValues`: `number`[]; `height`: `number`; `id`: `number`; `localStreamName`: `string`; `quality`: `string`; `width`: `number`; \}[] |
| `accessDeviceMetadata.connectedSince` | `number` |
| `accessDeviceMetadata.disableRecordingByDefault` | `boolean` |
| `accessDeviceMetadata.doorInfo` | \{ `canLock`: `boolean`; `lockState`: `string`; \} |
| `accessDeviceMetadata.doorInfo.canLock` | `boolean` |
| `accessDeviceMetadata.doorInfo.lockState` | `string` |
| `accessDeviceMetadata.featureFlags` | \{ `supportLivestream`: `boolean`; `supportUnlock`: `boolean`; \} |
| `accessDeviceMetadata.featureFlags.supportLivestream` | `boolean` |
| `accessDeviceMetadata.featureFlags.supportUnlock` | `boolean` |
| `accessDeviceMetadata.ledSettings` | \{ `isEnabled`: `boolean`; \} |
| `accessDeviceMetadata.ledSettings.isEnabled` | `boolean` |
| `accessDeviceMetadata.micVolume` | `number` |
| `accessDeviceMetadata.pairedInfo` | \{ `name`: `string`; `uri`: `string`; \} |
| `accessDeviceMetadata.pairedInfo.name` | `string` |
| `accessDeviceMetadata.pairedInfo.uri` | `string` |
| `accessDeviceMetadata.speakerSettings` | \{ `areSystemSoundsEnabled`: `boolean`; \} |
| `accessDeviceMetadata.speakerSettings.areSystemSoundsEnabled` | `boolean` |
| `accessDeviceMetadata.talkbackSettings` | [`ProtectCameraTalkbackConfigInterface`](#protectcameratalkbackconfiginterface)[] |
| <a id="apmac"></a> `apMac` | `string` |
| <a id="aprssi"></a> `apRssi` | `string` |
| <a id="audiobitrate"></a> `audioBitrate` | `number` |
| <a id="canmanage"></a> `canManage` | `boolean` |
| <a id="channels"></a> `channels` | [`ProtectCameraChannelConfigInterface`](#protectcamerachannelconfiginterface)[] |
| <a id="chimeduration"></a> `chimeDuration` | `number` |
| <a id="connectedsince"></a> `connectedSince` | `number` |
| <a id="connectionhost"></a> `connectionHost` | `string` |
| <a id="currentresolution"></a> `currentResolution` | `string` |
| <a id="displayname"></a> `displayName` | `string` |
| <a id="elementinfo"></a> `elementInfo` | `null` |
| <a id="enablenfc"></a> `enableNfc` | `boolean` |
| <a id="featureflags"></a> `featureFlags` | \{ `audio`: `string`[]; `audioCodecs`: `string`[]; `audioStyle`: `string`[]; `canAdjustIrLedLevel`: `boolean`; `canMagicZoom`: `boolean`; `canOpticalZoom`: `boolean`; `canTouchFocus`: `boolean`; `hasAccelerometer`: `boolean`; `hasAec`: `boolean`; `hasAutoICROnly`: `boolean`; `hasBattery`: `boolean`; `hasBluetooth`: `boolean`; `hasChime`: `boolean`; `hasColorLcdScreen`: `boolean`; `hasExternalIr`: `boolean`; `hasFingerprintSensor`: `boolean`; `hasFlash`: `boolean`; `hasHdr`: `boolean`; `hasIcrSensitivity`: `boolean`; `hasInfrared`: `boolean`; `hasLcdScreen`: `boolean`; `hasLdc`: `boolean`; `hasLedIr`: `boolean`; `hasLedStatus`: `boolean`; `hasLineCrossing`: `boolean`; `hasLineCrossingCounting`: `boolean`; `hasLineIn`: `boolean`; `hasLiveviewTracking`: `boolean`; `hasLuxCheck`: `boolean`; `hasMic`: `boolean`; `hasMotionZones`: `boolean`; `hasNewMotionAlgorithm`: `boolean`; `hasPackageCamera`: `boolean`; `hasPrivacyMask`: `boolean`; `hasRtc`: `boolean`; `hasSdCard`: `boolean`; `hasSmartDetect`: `boolean`; `hasSpeaker`: `boolean`; `hasSquareEventThumbnail`: `boolean`; `hasVerticalFlip`: `boolean`; `hasWifi`: `boolean`; `isDoorbell`: `boolean`; `isPtz`: `boolean`; `maxScaleDownLevel`: `number`; `motionAlgorithms`: `string`[]; `privacyMaskCapability`: \{ `maxMasks`: `number`; `rectangleOnly`: `boolean`; \}; `smartDetectAudioTypes`: `string`[]; `smartDetectTypes`: `string`[]; `supportDoorAccessConfig`: `boolean`; `supportLpDetectionWithoutVehicle`: `boolean`; `supportNfc`: `boolean`; `videoCodecs`: `string`[]; `videoModeMaxFps`: `number`[]; `videoModes`: `string`[]; \} |
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
| `featureFlags.hasFingerprintSensor` | `boolean` |
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
| `featureFlags.maxScaleDownLevel` | `number` |
| `featureFlags.motionAlgorithms` | `string`[] |
| `featureFlags.privacyMaskCapability` | \{ `maxMasks`: `number`; `rectangleOnly`: `boolean`; \} |
| `featureFlags.privacyMaskCapability.maxMasks` | `number` |
| `featureFlags.privacyMaskCapability.rectangleOnly` | `boolean` |
| `featureFlags.smartDetectAudioTypes` | `string`[] |
| `featureFlags.smartDetectTypes` | `string`[] |
| `featureFlags.supportDoorAccessConfig` | `boolean` |
| `featureFlags.supportLpDetectionWithoutVehicle` | `boolean` |
| `featureFlags.supportNfc` | `boolean` |
| `featureFlags.videoCodecs` | `string`[] |
| `featureFlags.videoModeMaxFps` | `number`[] |
| `featureFlags.videoModes` | `string`[] |
| <a id="fingerprintsettings"></a> `fingerprintSettings` | \{ `enable`: `boolean`; `enablePrintLatency`: `boolean`; `mode`: `string`; `reportCaptureComplete`: `boolean`; `reportFingerTouch`: `boolean`; \} |
| `fingerprintSettings.enable` | `boolean` |
| `fingerprintSettings.enablePrintLatency` | `boolean` |
| `fingerprintSettings.mode` | `string` |
| `fingerprintSettings.reportCaptureComplete` | `boolean` |
| `fingerprintSettings.reportFingerTouch` | `boolean` |
| <a id="fingerprintstate"></a> `fingerprintState` | \{ `fingerprintId`: `string`; `free`: `number`; `progress`: `string`; `status`: `string`; `total`: `number`; \} |
| `fingerprintState.fingerprintId` | `string` |
| `fingerprintState.free` | `number` |
| `fingerprintState.progress` | `string` |
| `fingerprintState.status` | `string` |
| `fingerprintState.total` | `number` |
| <a id="firmwarebuild"></a> `firmwareBuild` | `string` |
| <a id="firmwareversion"></a> `firmwareVersion` | `string` |
| <a id="fwupdatestate"></a> `fwUpdateState` | `string` |
| <a id="guid"></a> `guid` | `string` |
| <a id="hardwarerevision"></a> `hardwareRevision` | `string` |
| <a id="hasrecordings"></a> `hasRecordings` | `boolean` |
| <a id="hasspeaker"></a> `hasSpeaker` | `boolean` |
| <a id="haswifi"></a> `hasWifi` | `boolean` |
| <a id="hdrmode"></a> `hdrMode` | `boolean` |
| <a id="homekitsettings"></a> `homekitSettings` | \{ `microphoneMuted`: `boolean`; `speakerMuted`: `boolean`; `streamInProgress`: `boolean`; `talkbackSettingsActive`: `boolean`; \} |
| `homekitSettings.microphoneMuted` | `boolean` |
| `homekitSettings.speakerMuted` | `boolean` |
| `homekitSettings.streamInProgress` | `boolean` |
| `homekitSettings.talkbackSettingsActive` | `boolean` |
| <a id="host"></a> `host` | `string` |
| <a id="hubmac"></a> `hubMac` | `string` |
| <a id="id-1"></a> `id` | `string` |
| <a id="is2k"></a> `is2K` | `boolean` |
| <a id="is4k"></a> `is4K` | `boolean` |
| <a id="isadopted"></a> `isAdopted` | `boolean` |
| <a id="isadoptedbyaccessapp"></a> `isAdoptedByAccessApp` | `boolean` |
| <a id="isadoptedbyother"></a> `isAdoptedByOther` | `boolean` |
| <a id="isadopting"></a> `isAdopting` | `boolean` |
| <a id="isattemptingtoconnect"></a> `isAttemptingToConnect` | `boolean` |
| <a id="isconnected"></a> `isConnected` | `boolean` |
| <a id="isdark"></a> `isDark` | `boolean` |
| <a id="isdeleting"></a> `isDeleting` | `boolean` |
| <a id="isdownloadingfw"></a> `isDownloadingFW` | `boolean` |
| <a id="isextenderinstalledever"></a> `isExtenderInstalledEver` | `boolean` |
| <a id="ishidden"></a> `isHidden` | `boolean` |
| <a id="isliveheatmapenabled"></a> `isLiveHeatmapEnabled` | `boolean` |
| <a id="ismanaged"></a> `isManaged` | `boolean` |
| <a id="ismicenabled"></a> `isMicEnabled` | `boolean` |
| <a id="ismissingrecordingdetected"></a> `isMissingRecordingDetected` | `boolean` |
| <a id="ismotiondetected"></a> `isMotionDetected` | `boolean` |
| <a id="ispairedwithaiport"></a> `isPairedWithAiPort` | `boolean` |
| <a id="ispoornetwork"></a> `isPoorNetwork` | `boolean` |
| <a id="isprobingforwifi"></a> `isProbingForWifi` | `boolean` |
| <a id="isprovisioned"></a> `isProvisioned` | `boolean` |
| <a id="ispsettings"></a> `ispSettings` | \{ `aeMode`: `string`; `brightness`: `number`; `contrast`: `number`; `denoise`: `number`; `dZoomCenterX`: `number`; `dZoomCenterY`: `number`; `dZoomScale`: `number`; `dZoomStreamId`: `number`; `focusMode`: `string`; `focusPosition`: `number`; `hotplug`: \{ `audio`: `Nullable`\<`string`\>; `extender`: \{ `flashRange`: `number`; `hasFlash`: `boolean`; `hasIR`: `boolean`; `hasRadar`: `boolean`; `isAttached`: `boolean`; `radarRangeMax`: `number`; `radarRangeMin`: `number`; \}; `standaloneAdoption`: `boolean`; `video`: `Nullable`\<`string`\>; \}; `hue`: `number`; `icrCustomValue`: `number`; `icrSensitivity`: `number`; `irLedLevel`: `number`; `irLedMode`: `string`; `is3dnrEnabled`: `boolean`; `isAggressiveAntiFlickerEnabled`: `boolean`; `isAutoRotateEnabled`: `boolean`; `isExternalIrEnabled`: `boolean`; `isFlippedHorizontal`: `boolean`; `isFlippedVertical`: `boolean`; `isLdcEnabled`: `boolean`; `isPauseMotionEnabled`: `boolean`; `saturation`: `number`; `sharpness`: `number`; `touchFocusX`: `number`; `touchFocusY`: `number`; `wdr`: `number`; `zoomPosition`: `number`; \} |
| `ispSettings.aeMode` | `string` |
| `ispSettings.brightness` | `number` |
| `ispSettings.contrast` | `number` |
| `ispSettings.denoise` | `number` |
| `ispSettings.dZoomCenterX` | `number` |
| `ispSettings.dZoomCenterY` | `number` |
| `ispSettings.dZoomScale` | `number` |
| `ispSettings.dZoomStreamId` | `number` |
| `ispSettings.focusMode` | `string` |
| `ispSettings.focusPosition` | `number` |
| `ispSettings.hotplug` | \{ `audio`: `Nullable`\<`string`\>; `extender`: \{ `flashRange`: `number`; `hasFlash`: `boolean`; `hasIR`: `boolean`; `hasRadar`: `boolean`; `isAttached`: `boolean`; `radarRangeMax`: `number`; `radarRangeMin`: `number`; \}; `standaloneAdoption`: `boolean`; `video`: `Nullable`\<`string`\>; \} |
| `ispSettings.hotplug.audio` | `Nullable`\<`string`\> |
| `ispSettings.hotplug.extender` | \{ `flashRange`: `number`; `hasFlash`: `boolean`; `hasIR`: `boolean`; `hasRadar`: `boolean`; `isAttached`: `boolean`; `radarRangeMax`: `number`; `radarRangeMin`: `number`; \} |
| `ispSettings.hotplug.extender.flashRange` | `number` |
| `ispSettings.hotplug.extender.hasFlash` | `boolean` |
| `ispSettings.hotplug.extender.hasIR` | `boolean` |
| `ispSettings.hotplug.extender.hasRadar` | `boolean` |
| `ispSettings.hotplug.extender.isAttached` | `boolean` |
| `ispSettings.hotplug.extender.radarRangeMax` | `number` |
| `ispSettings.hotplug.extender.radarRangeMin` | `number` |
| `ispSettings.hotplug.standaloneAdoption` | `boolean` |
| `ispSettings.hotplug.video` | `Nullable`\<`string`\> |
| `ispSettings.hue` | `number` |
| `ispSettings.icrCustomValue` | `number` |
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
| <a id="isrebooting"></a> `isRebooting` | `boolean` |
| <a id="isrecording"></a> `isRecording` | `boolean` |
| <a id="isrestoring"></a> `isRestoring` | `boolean` |
| <a id="issmartdetected"></a> `isSmartDetected` | `boolean` |
| <a id="issshenabled"></a> `isSshEnabled` | `boolean` |
| <a id="isthirdpartycamera"></a> `isThirdPartyCamera` | `boolean` |
| <a id="isupdating"></a> `isUpdating` | `boolean` |
| <a id="iswaterproofcaseattached"></a> `isWaterproofCaseAttached` | `boolean` |
| <a id="iswirelessuplinkenabled"></a> `isWirelessUplinkEnabled` | `boolean` |
| <a id="lastmotion"></a> `lastMotion` | `number` |
| <a id="lastring"></a> `lastRing` | `Nullable`\<`number`\> |
| <a id="lastseen"></a> `lastSeen` | `number` |
| <a id="latestfirmwareversion"></a> `latestFirmwareVersion` | `string` |
| <a id="lcdmessage"></a> `lcdMessage` | [`ProtectCameraLcdMessageConfigInterface`](#protectcameralcdmessageconfiginterface) |
| <a id="ledsettings"></a> `ledSettings` | \{ `blinkRate`: `number`; `isEnabled`: `boolean`; \} |
| `ledSettings.blinkRate` | `number` |
| `ledSettings.isEnabled` | `boolean` |
| <a id="lenses"></a> `lenses` | \{ `id`: `number`; `video`: \{ `recordingEnd`: `Nullable`\<`number`\>; `recordingEndLQ`: `Nullable`\<`number`\>; `recordingStart`: `Nullable`\<`number`\>; `recordingStartLQ`: `Nullable`\<`number`\>; `timelapseEnd`: `Nullable`\<`number`\>; `timelapseEndLQ`: `Nullable`\<`number`\>; `timelapseStart`: `Nullable`\<`number`\>; `timelapseStartLQ`: `Nullable`\<`number`\>; \}; \}[] |
| <a id="mac"></a> `mac` | `string` |
| <a id="marketname"></a> `marketName` | `string` |
| <a id="micvolume"></a> `micVolume` | `number` |
| <a id="modelkey"></a> `modelKey` | `string` |
| <a id="name-1"></a> `name` | `string` |
| <a id="nfcsettings"></a> `nfcSettings` | \{ `enableNfc`: `boolean`; `supportThirdPartyCard`: `boolean`; \} |
| `nfcSettings.enableNfc` | `boolean` |
| `nfcSettings.supportThirdPartyCard` | `boolean` |
| <a id="nfcstate"></a> `nfcState` | \{ `cardId`: `string`; `isUACard`: `boolean`; `lastSeen`: `number`; `mode`: `string`; \} |
| `nfcState.cardId` | `string` |
| `nfcState.isUACard` | `boolean` |
| `nfcState.lastSeen` | `number` |
| `nfcState.mode` | `string` |
| <a id="nvrmac"></a> `nvrMac` | `string` |
| <a id="osdsettings"></a> `osdSettings` | \{ `isDateEnabled`: `boolean`; `isDebugEnabled`: `boolean`; `isLogoEnabled`: `boolean`; `isNameEnabled`: `boolean`; \} |
| `osdSettings.isDateEnabled` | `boolean` |
| `osdSettings.isDebugEnabled` | `boolean` |
| `osdSettings.isLogoEnabled` | `boolean` |
| `osdSettings.isNameEnabled` | `boolean` |
| <a id="phyrate"></a> `phyRate` | `number` |
| <a id="pirsettings"></a> `pirSettings` | \{ `pirMotionClipLength`: `number`; `pirSensitivity`: `number`; `timelapseFrameInterval`: `number`; `timelapseTransferInterval`: `number`; \} |
| `pirSettings.pirMotionClipLength` | `number` |
| `pirSettings.pirSensitivity` | `number` |
| `pirSettings.timelapseFrameInterval` | `number` |
| `pirSettings.timelapseTransferInterval` | `number` |
| <a id="platform"></a> `platform` | `string` |
| <a id="recordingschedule"></a> `recordingSchedule` | `null` |
| <a id="recordingsettings"></a> `recordingSettings` | \{ `enablePirTimelapse`: `boolean`; `endMotionEventDelay`: `number`; `geofencing`: `string`; `minMotionEventTrigger`: `number`; `mode`: `string`; `postPaddingSecs`: `number`; `prePaddingSecs`: `number`; `retentionDurationMs`: `Nullable`\<`number`\>; `suppressIlluminationSurge`: `boolean`; `useNewMotionAlgorithm`: `boolean`; \} |
| `recordingSettings.enablePirTimelapse` | `boolean` |
| `recordingSettings.endMotionEventDelay` | `number` |
| `recordingSettings.geofencing` | `string` |
| `recordingSettings.minMotionEventTrigger` | `number` |
| `recordingSettings.mode` | `string` |
| `recordingSettings.postPaddingSecs` | `number` |
| `recordingSettings.prePaddingSecs` | `number` |
| `recordingSettings.retentionDurationMs` | `Nullable`\<`number`\> |
| `recordingSettings.suppressIlluminationSurge` | `boolean` |
| `recordingSettings.useNewMotionAlgorithm` | `boolean` |
| <a id="smartdetectlines"></a> `smartDetectLines` | \[\] |
| <a id="smartdetectsettings"></a> `smartDetectSettings` | \{ `audioTypes`: `string`[]; `autoTrackingObjectTypes`: `string`[]; `detectionRange`: \[`number`, `number`\]; `objectTypes`: `string`[]; \} |
| `smartDetectSettings.audioTypes` | `string`[] |
| `smartDetectSettings.autoTrackingObjectTypes` | `string`[] |
| `smartDetectSettings.detectionRange` | \[`number`, `number`\] |
| `smartDetectSettings.objectTypes` | `string`[] |
| <a id="smartdetectzones"></a> `smartDetectZones` | \{ `color`: `string`; `name`: `string`; `objectTypes`: `string`[]; `points`: \[`number`, `number`\][]; `sensitivity`: `number`; \}[] |
| <a id="speakersettings"></a> `speakerSettings` | \{ `areSystemSoundsEnabled`: `boolean`; `isEnabled`: `boolean`; `volume`: `number`; \} |
| `speakerSettings.areSystemSoundsEnabled` | `boolean` |
| `speakerSettings.isEnabled` | `boolean` |
| `speakerSettings.volume` | `number` |
| <a id="state"></a> `state` | `string` |
| <a id="stats"></a> `stats` | \{ `battery`: \{ `isCharging`: `boolean`; `percentage`: `Nullable`\<`number`\>; `sleepState`: `string`; \}; `rxBytes`: `number`; `storage`: \{ `rate`: `number`; `used`: `number`; \}; `txBytes`: `number`; `video`: \{ `recordingEnd`: `number`; `recordingEndLQ`: `number`; `recordingStart`: `number`; `recordingStartLQ`: `number`; `timelapseEnd`: `number`; `timelapseEndLQ`: `number`; `timelapseStart`: `number`; `timelapseStartLQ`: `number`; \}; `wifi`: \{ `channel`: `Nullable`\<`number`\>; `frequency`: `Nullable`\<`number`\>; `linkSpeedMbps`: `Nullable`\<`number`\>; `signalQuality`: `number`; `signalStrength`: `number`; \}; `wifiQuality`: `number`; `wifiStrength`: `number`; \} |
| `stats.battery` | \{ `isCharging`: `boolean`; `percentage`: `Nullable`\<`number`\>; `sleepState`: `string`; \} |
| `stats.battery.isCharging` | `boolean` |
| `stats.battery.percentage` | `Nullable`\<`number`\> |
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
| `stats.wifi` | \{ `channel`: `Nullable`\<`number`\>; `frequency`: `Nullable`\<`number`\>; `linkSpeedMbps`: `Nullable`\<`number`\>; `signalQuality`: `number`; `signalStrength`: `number`; \} |
| `stats.wifi.channel` | `Nullable`\<`number`\> |
| `stats.wifi.frequency` | `Nullable`\<`number`\> |
| `stats.wifi.linkSpeedMbps` | `Nullable`\<`number`\> |
| `stats.wifi.signalQuality` | `number` |
| `stats.wifi.signalStrength` | `number` |
| `stats.wifiQuality` | `number` |
| `stats.wifiStrength` | `number` |
| <a id="streamsharing"></a> `streamSharing` | \{ `enabled`: `boolean`; `expires`: `Nullable`\<`number`\>; `maxStreams`: `Nullable`\<`number`\>; `sharedByUser`: `Nullable`\<`string`\>; `sharedByUserId`: `Nullable`\<`string`\>; `shareLink`: `Nullable`\<`string`\>; `token`: `Nullable`\<`string`\>; \} |
| `streamSharing.enabled` | `boolean` |
| `streamSharing.expires` | `Nullable`\<`number`\> |
| `streamSharing.maxStreams` | `Nullable`\<`number`\> |
| `streamSharing.sharedByUser` | `Nullable`\<`string`\> |
| `streamSharing.sharedByUserId` | `Nullable`\<`string`\> |
| `streamSharing.shareLink` | `Nullable`\<`string`\> |
| `streamSharing.token` | `Nullable`\<`string`\> |
| <a id="supportedscalingresolutions"></a> `supportedScalingResolutions` | `string`[] |
| <a id="talkbacksettings"></a> `talkbackSettings` | [`ProtectCameraTalkbackConfigInterface`](#protectcameratalkbackconfiginterface) |
| <a id="thirdpartycamerainfo"></a> `thirdPartyCameraInfo` | \{ `port`: `number`; `rtspUrl`: `string`; `rtspUrlLQ`: `string`; `snapshotUrl`: `string`; \} |
| `thirdPartyCameraInfo.port` | `number` |
| `thirdPartyCameraInfo.rtspUrl` | `string` |
| `thirdPartyCameraInfo.rtspUrlLQ` | `string` |
| `thirdPartyCameraInfo.snapshotUrl` | `string` |
| <a id="tiltlimitsofprivacyzones"></a> `tiltLimitsOfPrivacyZones` | \{ `limit`: `number`; `side`: `string`; \} |
| `tiltLimitsOfPrivacyZones.limit` | `number` |
| `tiltLimitsOfPrivacyZones.side` | `string` |
| <a id="type"></a> `type` | `string` |
| <a id="upsince"></a> `upSince` | `number` |
| <a id="uptime"></a> `uptime` | `number` |
| <a id="useglobal"></a> `useGlobal` | `boolean` |
| <a id="videocodec"></a> `videoCodec` | `string` |
| <a id="videocodecstate"></a> `videoCodecState` | `number` |
| <a id="videocodecswitchingsince"></a> `videoCodecSwitchingSince` | `number` |
| <a id="videomode"></a> `videoMode` | `string` |
| <a id="videoreconfigurationinprogress"></a> `videoReconfigurationInProgress` | `boolean` |
| <a id="voltage"></a> `voltage` | `number` |
| <a id="wificonnectionstate"></a> `wifiConnectionState` | \{ `channel`: `number`; `frequency`: `number`; `phyRate`: `number`; `signalQuality`: `number`; `signalStrength`: `number`; \} |
| `wifiConnectionState.channel` | `number` |
| `wifiConnectionState.frequency` | `number` |
| `wifiConnectionState.phyRate` | `number` |
| `wifiConnectionState.signalQuality` | `number` |
| `wifiConnectionState.signalStrength` | `number` |
| <a id="wiredconnectionstate"></a> `wiredConnectionState` | \{ `phyRate`: `number`; \} |
| `wiredConnectionState.phyRate` | `number` |

***

### ProtectCameraLcdMessageConfigInterface

A semi-complete description of the UniFi Protect LCD message JSON.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="duration"></a> `duration` | `number` |
| <a id="resetat"></a> `resetAt` | `Nullable`\<`number`\> |
| <a id="text"></a> `text` | `string` |
| <a id="type-1"></a> `type` | `string` |

***

### ProtectCameraTalkbackConfigInterface

A semi-complete description of the UniFi Protect talkback settings JSON.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="bindaddr"></a> `bindAddr` | `string` |
| <a id="bindport"></a> `bindPort` | `number` |
| <a id="bitspersample"></a> `bitsPerSample` | `number` |
| <a id="channels-1"></a> `channels` | `number` |
| <a id="filteraddr"></a> `filterAddr` | `string` |
| <a id="filterport"></a> `filterPort` | `number` |
| <a id="quality"></a> `quality` | `number` |
| <a id="samplingrate"></a> `samplingRate` | `number` |
| <a id="typefmt"></a> `typeFmt` | `string` |
| <a id="typein"></a> `typeIn` | `string` |
| <a id="url"></a> `url` | `string` |

***

### ProtectChimeConfigInterface

A semi-complete description of the UniFi Protect chime JSON.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="apmac-1"></a> `apMac` | `string` |
| <a id="apmgmtip"></a> `apMgmtIp` | `string` |
| <a id="aprssi-1"></a> `apRssi` | `string` |
| <a id="cameraids"></a> `cameraIds` | `string`[] |
| <a id="canadopt"></a> `canAdopt` | `boolean` |
| <a id="connectedsince-1"></a> `connectedSince` | `number` |
| <a id="connectionhost-1"></a> `connectionHost` | `string` |
| <a id="elementinfo-1"></a> `elementInfo` | `string` |
| <a id="featureflags-1"></a> `featureFlags` | \{ `hasHttpsClientOTA`: `boolean`; `hasWifi`: `boolean`; `supportCustomRingtone`: `boolean`; \} |
| `featureFlags.hasHttpsClientOTA` | `boolean` |
| `featureFlags.hasWifi` | `boolean` |
| `featureFlags.supportCustomRingtone` | `boolean` |
| <a id="firmwarebuild-1"></a> `firmwareBuild` | `string` |
| <a id="firmwareversion-1"></a> `firmwareVersion` | `string` |
| <a id="fwupdatestate-1"></a> `fwUpdateState` | `string` |
| <a id="hardwarerevision-1"></a> `hardwareRevision` | `string` |
| <a id="host-1"></a> `host` | `string` |
| <a id="id-2"></a> `id` | `string` |
| <a id="isadopted-1"></a> `isAdopted` | `boolean` |
| <a id="isadoptedbyother-1"></a> `isAdoptedByOther` | `boolean` |
| <a id="isadopting-1"></a> `isAdopting` | `boolean` |
| <a id="isattemptingtoconnect-1"></a> `isAttemptingToConnect` | `boolean` |
| <a id="isconnected-1"></a> `isConnected` | `boolean` |
| <a id="isdownloadingfw-1"></a> `isDownloadingFW` | `boolean` |
| <a id="isprobingforwifi-1"></a> `isProbingForWifi` | `boolean` |
| <a id="isprovisioned-1"></a> `isProvisioned` | `boolean` |
| <a id="isrebooting-1"></a> `isRebooting` | `boolean` |
| <a id="issshenabled-1"></a> `isSshEnabled` | `boolean` |
| <a id="isupdating-1"></a> `isUpdating` | `boolean` |
| <a id="iswirelessuplinkenabled-1"></a> `isWirelessUplinkEnabled` | `boolean` |
| <a id="lastring-1"></a> `lastRing` | `number` |
| <a id="lastseen-1"></a> `lastSeen` | `number` |
| <a id="latestfirmwareversion-1"></a> `latestFirmwareVersion` | `string` |
| <a id="mac-1"></a> `mac` | `string` |
| <a id="marketname-1"></a> `marketName` | `string` |
| <a id="modelkey-1"></a> `modelKey` | `string` |
| <a id="name-2"></a> `name` | `string` |
| <a id="nvrmac-1"></a> `nvrMac` | `string` |
| <a id="platform-1"></a> `platform` | `string` |
| <a id="repeattimes"></a> `repeatTimes` | `number` |
| <a id="ringsettings"></a> `ringSettings` | \{ `cameraId`: `string`; `repeatTimes`: `number`; `ringtoneId`: `string`; `volume`: `number`; \}[] |
| <a id="speakertracklist"></a> `speakerTrackList` | \{ `md5`: `string`; `name`: `string`; `size`: `number`; `state`: `string`; `track_no`: `number`; `volume`: `number`; \}[] |
| <a id="state-1"></a> `state` | `string` |
| <a id="sysid"></a> `sysId` | `string` |
| <a id="type-2"></a> `type` | `string` |
| <a id="upsince-1"></a> `upSince` | `number` |
| <a id="uptime-1"></a> `uptime` | `number` |
| <a id="userconfiguredap"></a> `userConfiguredAp` | `boolean` |
| <a id="volume"></a> `volume` | `number` |
| <a id="wificonnectionstate-1"></a> `wifiConnectionState` | \{ `apName`: `Nullable`\<`string`\>; `bssid`: `Nullable`\<`string`\>; `channel`: `Nullable`\<`string`\>; `connectivity`: `string`; `experience`: `null`; `frequency`: `null`; `phyRate`: `number`; `signalQuality`: `number`; `signalStrength`: `number`; `ssid`: `Nullable`\<`string`\>; `txRate`: `null`; \} |
| `wifiConnectionState.apName` | `Nullable`\<`string`\> |
| `wifiConnectionState.bssid` | `Nullable`\<`string`\> |
| `wifiConnectionState.channel` | `Nullable`\<`string`\> |
| `wifiConnectionState.connectivity` | `string` |
| `wifiConnectionState.experience` | `null` |
| `wifiConnectionState.frequency` | `null` |
| `wifiConnectionState.phyRate` | `number` |
| `wifiConnectionState.signalQuality` | `number` |
| `wifiConnectionState.signalStrength` | `number` |
| `wifiConnectionState.ssid` | `Nullable`\<`string`\> |
| `wifiConnectionState.txRate` | `null` |
| <a id="wiredconnectionstate-1"></a> `wiredConnectionState` | \{ `phyRate`: `number`; \} |
| `wiredConnectionState.phyRate` | `number` |

***

### ProtectEventAddInterface

A semi-complete description of the UniFi Protect smart motion detection event JSON.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="camera"></a> `camera` | `string` |
| <a id="cameraid"></a> `cameraId` | `string` |
| <a id="detectedat"></a> `detectedAt` | `number` |
| <a id="end"></a> `end` | `number` |
| <a id="eventid"></a> `eventId` | `string` |
| <a id="id-3"></a> `id` | `string` |
| <a id="locked"></a> `locked` | `boolean` |
| <a id="metadata"></a> `metadata` | [`ProtectEventMetadataInterface`](#protecteventmetadatainterface) |
| <a id="modelkey-2"></a> `modelKey` | `string` |
| <a id="partition"></a> `partition` | `string` |
| <a id="score"></a> `score` | `number` |
| <a id="smartdetectevents"></a> `smartDetectEvents` | `string`[] |
| <a id="smartdetecttypes"></a> `smartDetectTypes` | `string`[] |
| <a id="start"></a> `start` | `number` |
| <a id="thumbnailid"></a> `thumbnailId` | `string` |
| <a id="type-3"></a> `type` | `string` |
| <a id="user"></a> `user` | `string` |

***

### ProtectEventMetadataInterface

A description of metadata in UniFi Protect smart motion detect events.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="accesseventid"></a> `accessEventId` | `string` |
| <a id="action"></a> `action` | `string` |
| <a id="deviceid"></a> `deviceId` | \{ `text`: `string`; \} |
| `deviceId.text` | `string` |
| <a id="direction"></a> `direction` | `string` |
| <a id="doorname"></a> `doorName` | `string` |
| <a id="fingerprint"></a> `fingerprint` | \{ `ulpId`: `string`; \} |
| `fingerprint.ulpId` | `string` |
| <a id="firstname"></a> `firstName` | `string` |
| <a id="islowbattery"></a> `isLowBattery` | `boolean` |
| <a id="iswireless"></a> `isWireless` | `boolean` |
| <a id="lastname"></a> `lastName` | `string` |
| <a id="licenseplate"></a> `licensePlate` | \{ `confidenceLevel`: `number`; `name`: `string`; \} |
| `licensePlate.confidenceLevel` | `number` |
| `licensePlate.name` | `string` |
| <a id="name-3"></a> `name` | \{ `text`: `string`; \} |
| `name.text` | `string` |
| <a id="nfc"></a> `nfc` | \{ `nfcId`: `string`; `ulpId`: `string`; \} |
| `nfc.nfcId` | `string` |
| `nfc.ulpId` | `string` |
| <a id="openmethod"></a> `openMethod` | `string` |
| <a id="opensuccess"></a> `openSuccess` | `boolean` |
| <a id="reason"></a> `reason` | `string` |
| <a id="uniqueid"></a> `uniqueId` | `string` |
| <a id="usertype"></a> `userType` | `string` |

***

### ProtectLightConfigInterface

A semi-complete description of the UniFi Protect light JSON.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="camera-1"></a> `camera` | `string` |
| <a id="canadopt-1"></a> `canAdopt` | `boolean` |
| <a id="connectedsince-2"></a> `connectedSince` | `number` |
| <a id="connectionhost-2"></a> `connectionHost` | `string` |
| <a id="firmwarebuild-2"></a> `firmwareBuild` | `string` |
| <a id="firmwareversion-2"></a> `firmwareVersion` | `string` |
| <a id="hardwarerevision-2"></a> `hardwareRevision` | `string` |
| <a id="host-2"></a> `host` | `string` |
| <a id="id-4"></a> `id` | `string` |
| <a id="isadopted-2"></a> `isAdopted` | `boolean` |
| <a id="isadoptedbyother-2"></a> `isAdoptedByOther` | `boolean` |
| <a id="isadopting-2"></a> `isAdopting` | `boolean` |
| <a id="isattemptingtoconnect-2"></a> `isAttemptingToConnect` | `boolean` |
| <a id="iscamerapaired"></a> `isCameraPaired` | `boolean` |
| <a id="isconnected-2"></a> `isConnected` | `boolean` |
| <a id="isdark-1"></a> `isDark` | `boolean` |
| <a id="islighton"></a> `isLightOn` | `boolean` |
| <a id="islocating"></a> `isLocating` | `boolean` |
| <a id="ispirmotiondetected"></a> `isPirMotionDetected` | `boolean` |
| <a id="isprovisioned-2"></a> `isProvisioned` | `boolean` |
| <a id="isrebooting-2"></a> `isRebooting` | `boolean` |
| <a id="issshenabled-2"></a> `isSshEnabled` | `boolean` |
| <a id="isupdating-2"></a> `isUpdating` | `boolean` |
| <a id="lastmotion-1"></a> `lastMotion` | `number` |
| <a id="lastseen-2"></a> `lastSeen` | `number` |
| <a id="latestfirmwareversion-2"></a> `latestFirmwareVersion` | `string` |
| <a id="lightdevicesettings"></a> `lightDeviceSettings` | \{ `isIndicatorEnabled`: `boolean`; `ledLevel`: `number`; `luxSensitivity`: `string`; `pirDuration`: `number`; `pirSensitivity`: `number`; \} |
| `lightDeviceSettings.isIndicatorEnabled` | `boolean` |
| `lightDeviceSettings.ledLevel` | `number` |
| `lightDeviceSettings.luxSensitivity` | `string` |
| `lightDeviceSettings.pirDuration` | `number` |
| `lightDeviceSettings.pirSensitivity` | `number` |
| <a id="lightmodesettings"></a> `lightModeSettings` | \{ `enableAt`: `string`; `mode`: `string`; \} |
| `lightModeSettings.enableAt` | `string` |
| `lightModeSettings.mode` | `string` |
| <a id="lightonsettings"></a> `lightOnSettings` | \{ `isLedForceOn`: `boolean`; \} |
| `lightOnSettings.isLedForceOn` | `boolean` |
| <a id="mac-2"></a> `mac` | `string` |
| <a id="marketname-2"></a> `marketName` | `string` |
| <a id="modelkey-3"></a> `modelKey` | `string` |
| <a id="name-4"></a> `name` | `string` |
| <a id="nvrmac-2"></a> `nvrMac` | `string` |
| <a id="state-2"></a> `state` | `string` |
| <a id="type-4"></a> `type` | `string` |
| <a id="upsince-2"></a> `upSince` | `number` |
| <a id="uptime-2"></a> `uptime` | `number` |
| <a id="wiredconnectionstate-2"></a> `wiredConnectionState` | \{ `phyRate`: `number`; \} |
| `wiredConnectionState.phyRate` | `number` |

***

### ProtectNvrBootstrapInterface

An semi-complete description of the UniFi Protect NVR bootstrap JSON.

#### Indexable

```ts
[key: string]: 
  | string
  | unknown[]
  | ProtectCameraConfigInterface[]
  | ProtectChimeConfigInterface[]
  | ProtectLightConfigInterface[]
  | ProtectNvrConfigInterface
  | ProtectNvrLiveviewConfigInterface[]
  | ProtectNvrUserConfigInterface[]
  | ProtectSensorConfigInterface[]
  | ProtectViewerConfigInterface[]
```

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="accesskey"></a> `accessKey` | `string` |
| <a id="authuserid"></a> `authUserId` | `string` |
| <a id="bridges"></a> `bridges` | `unknown`[] |
| <a id="cameras"></a> `cameras` | [`ProtectCameraConfigInterface`](#protectcameraconfiginterface)[] |
| <a id="chimes"></a> `chimes` | [`ProtectChimeConfigInterface`](#protectchimeconfiginterface)[] |
| <a id="cloudportalurl"></a> `cloudPortalUrl` | `string` |
| <a id="groups"></a> `groups` | `unknown`[] |
| <a id="lastupdateid"></a> `lastUpdateId` | `string` |
| <a id="lights"></a> `lights` | [`ProtectLightConfigInterface`](#protectlightconfiginterface)[] |
| <a id="liveviews"></a> `liveviews` | [`ProtectNvrLiveviewConfigInterface`](#protectnvrliveviewconfiginterface)[] |
| <a id="nvr"></a> `nvr` | [`ProtectNvrConfigInterface`](#protectnvrconfiginterface) |
| <a id="ringtones"></a> `ringtones` | [`ProtectRingtoneConfigInterface`](#protectringtoneconfiginterface)[] |
| <a id="sensors"></a> `sensors` | [`ProtectSensorConfigInterface`](#protectsensorconfiginterface)[] |
| <a id="users"></a> `users` | [`ProtectNvrUserConfigInterface`](#protectnvruserconfiginterface)[] |
| <a id="viewers"></a> `viewers` | [`ProtectViewerConfigInterface`](#protectviewerconfiginterface)[] |

***

### ProtectNvrConfigInterface

A semi-complete description of the UniFi Protect NVR configuration JSON.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="analyticsdata"></a> `analyticsData` | `string` |
| <a id="anonymousedeviceid"></a> `anonymouseDeviceId` | `string` |
| <a id="availableupdate"></a> `availableUpdate` | `string` |
| <a id="avgmotions"></a> `avgMotions` | `number`[] |
| <a id="cameracapacity"></a> `cameraCapacity` | \{ `qualities`: \{ `count`: `number`; `fraction`: `number`; `type`: `string`; \}[]; `state`: `string`; \} |
| `cameraCapacity.qualities` | \{ `count`: `number`; `fraction`: `number`; `type`: `string`; \}[] |
| `cameraCapacity.state` | `string` |
| <a id="camerautilization"></a> `cameraUtilization` | `number` |
| <a id="canautoupdate"></a> `canAutoUpdate` | `boolean` |
| <a id="consoleenv"></a> `consoleEnv` | `string` |
| <a id="corruptionstate"></a> `corruptionState` | `string` |
| <a id="countrycode"></a> `countryCode` | `string` |
| <a id="devicefirmwaresettings"></a> `deviceFirmwareSettings` | \{ `configuredBy`: `string`; `isAutoUpdateEnabled`: `boolean`; `schedule`: \{ `hour`: `number`; \}; \} |
| `deviceFirmwareSettings.configuredBy` | `string` |
| `deviceFirmwareSettings.isAutoUpdateEnabled` | `boolean` |
| `deviceFirmwareSettings.schedule` | \{ `hour`: `number`; \} |
| `deviceFirmwareSettings.schedule.hour` | `number` |
| <a id="disableaudio"></a> `disableAudio` | `boolean` |
| <a id="disableautolink"></a> `disableAutoLink` | `boolean` |
| <a id="doorbellsettings"></a> `doorbellSettings` | \{ `allMessages`: \{ `text`: `string`; `type`: `string`; \}[]; `customImages`: `string`[]; `customMessages`: `string`[]; `defaultMessageResetTimeoutMs`: `number`; `defaultMessageText`: `string`; \} |
| `doorbellSettings.allMessages` | \{ `text`: `string`; `type`: `string`; \}[] |
| `doorbellSettings.customImages` | `string`[] |
| `doorbellSettings.customMessages` | `string`[] |
| `doorbellSettings.defaultMessageResetTimeoutMs` | `number` |
| `doorbellSettings.defaultMessageText` | `string` |
| <a id="enableautomaticbackups"></a> `enableAutomaticBackups` | `boolean` |
| <a id="enablebridgeautoadoption"></a> `enableBridgeAutoAdoption` | `boolean` |
| <a id="enablecrashreporting"></a> `enableCrashReporting` | `boolean` |
| <a id="enablestatsreporting"></a> `enableStatsReporting` | `boolean` |
| <a id="errorcode"></a> `errorCode` | `Nullable`\<`string`\> |
| <a id="featureflags-2"></a> `featureFlags` | \{ `beta`: `boolean`; `detectionLabels`: `boolean`; `dev`: `boolean`; `hasTwoWayAudioMediaStreams`: `boolean`; `homekitPaired`: `boolean`; `notificationsV2`: `boolean`; `ulpRoleManagement`: `boolean`; \} |
| `featureFlags.beta` | `boolean` |
| `featureFlags.detectionLabels` | `boolean` |
| `featureFlags.dev` | `boolean` |
| `featureFlags.hasTwoWayAudioMediaStreams` | `boolean` |
| `featureFlags.homekitPaired` | `boolean` |
| `featureFlags.notificationsV2` | `boolean` |
| `featureFlags.ulpRoleManagement` | `boolean` |
| <a id="firmwareversion-3"></a> `firmwareVersion` | `string` |
| <a id="hardwareid"></a> `hardwareId` | `string` |
| <a id="hardwareplatform"></a> `hardwarePlatform` | `string` |
| <a id="hardwarerevision-3"></a> `hardwareRevision` | `string` |
| <a id="hasgateway"></a> `hasGateway` | `boolean` |
| <a id="host-3"></a> `host` | `string` |
| <a id="hosts"></a> `hosts` | `string`[] |
| <a id="hostshortname"></a> `hostShortname` | `string` |
| <a id="hosttype"></a> `hostType` | `string` |
| <a id="id-5"></a> `id` | `string` |
| <a id="isaccessinstalled"></a> `isAccessInstalled` | `boolean` |
| <a id="isaireportingenabled"></a> `isAiReportingEnabled` | `boolean` |
| <a id="isaway"></a> `isAway` | `boolean` |
| <a id="ishardware"></a> `isHardware` | `boolean` |
| <a id="isinsightsenabled"></a> `isInsightsEnabled` | `boolean` |
| <a id="isnetworkinstalled"></a> `isNetworkInstalled` | `boolean` |
| <a id="isprimary"></a> `isPrimary` | `boolean` |
| <a id="isprotectupdatable"></a> `isProtectUpdatable` | `boolean` |
| <a id="isrecordingdisabled"></a> `isRecordingDisabled` | `boolean` |
| <a id="isrecordingmotiononly"></a> `isRecordingMotionOnly` | `boolean` |
| <a id="isrecycling"></a> `isRecycling` | `boolean` |
| <a id="isremoteaccessenabled"></a> `isRemoteAccessEnabled` | `boolean` |
| <a id="issetup"></a> `isSetup` | `boolean` |
| <a id="issshenabled-3"></a> `isSshEnabled` | `boolean` |
| <a id="isstacked"></a> `isStacked` | `boolean` |
| <a id="isstation"></a> `isStation` | `boolean` |
| <a id="isstatsgatheringenabled"></a> `isStatsGatheringEnabled` | `boolean` |
| <a id="isucoresetup"></a> `isUCoreSetup` | `boolean` |
| <a id="isucorestacked"></a> `isUCoreStacked` | `boolean` |
| <a id="isucoreupdatable"></a> `isUcoreUpdatable` | `boolean` |
| <a id="isupdating-3"></a> `isUpdating` | `boolean` |
| <a id="iswirelessuplinkenabled-2"></a> `isWirelessUplinkEnabled` | `boolean` |
| <a id="lastseen-3"></a> `lastSeen` | `number` |
| <a id="lastupdateat"></a> `lastUpdateAt` | `Nullable`\<`number`\> |
| <a id="locationsettings"></a> `locationSettings` | \{ `isAway`: `boolean`; `isGeofencingEnabled`: `boolean`; `latitude`: `number`; `longitude`: `number`; `radius`: `number`; \} |
| `locationSettings.isAway` | `boolean` |
| `locationSettings.isGeofencingEnabled` | `boolean` |
| `locationSettings.latitude` | `number` |
| `locationSettings.longitude` | `number` |
| `locationSettings.radius` | `number` |
| <a id="mac-3"></a> `mac` | `string` |
| <a id="marketname-3"></a> `marketName` | `string` |
| <a id="maxcameracapacity"></a> `maxCameraCapacity` | `Record`\<`string`, `number`\> |
| <a id="modelkey-4"></a> `modelKey` | `string` |
| <a id="name-5"></a> `name` | `string` |
| <a id="network"></a> `network` | `string` |
| <a id="ports"></a> `ports` | \{ `aiFeatureConsole`: `number`; `cameraEvents`: `number`; `cameraHttps`: `number`; `cameraTcp`: `number`; `devicesWss`: `number`; `discoveryClient`: `number`; `emsCLI`: `number`; `emsJsonCLI`: `number`; `emsLiveFLV`: `number`; `http`: `number`; `https`: `number`; `liveWs`: `number`; `liveWss`: `number`; `piongw`: `number`; `playback`: `number`; `rtmp`: `number`; `rtsp`: `number`; `rtsps`: `number`; `stacking`: `number`; `tcpBridge`: `number`; `tcpStreams`: `number`; `ucore`: `number`; `ump`: `number`; \} |
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
| <a id="publicip"></a> `publicIp` | `string` |
| <a id="recordingretentiondurationms"></a> `recordingRetentionDurationMs` | `string` |
| <a id="releasechannel"></a> `releaseChannel` | `string` |
| <a id="skipfirmwareupdate"></a> `skipFirmwareUpdate` | `boolean` |
| <a id="smartdetectagreement"></a> `smartDetectAgreement` | \{ `lastUpdateAt`: `Nullable`\<`number`\>; `status`: `string`; \} |
| `smartDetectAgreement.lastUpdateAt` | `Nullable`\<`number`\> |
| `smartDetectAgreement.status` | `string` |
| <a id="smartdetection"></a> `smartDetection` | \{ `enable`: `boolean`; `faceRecognition`: `boolean`; `licensePlateRecognition`: `boolean`; \} |
| `smartDetection.enable` | `boolean` |
| `smartDetection.faceRecognition` | `boolean` |
| `smartDetection.licensePlateRecognition` | `boolean` |
| <a id="ssochannel"></a> `ssoChannel` | `Nullable`\<`string`\> |
| <a id="storagestats"></a> `storageStats` | \{ `capacity`: `number`; `recordingSpace`: \{ `available`: `number`; `total`: `number`; `used`: `number`; \}; `remainingCapacity`: `number`; `storageDistribution`: \{ `recordingTypeDistributions`: \{ `percentage`: `number`; `recordingType`: `string`; `size`: `number`; \}[]; `resolutionDistributions`: \{ `percentage`: `number`; `recordingType`: `string`; `size`: `number`; \}[]; \}; `utilization`: `number`; \} |
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
| <a id="streamsharingavailable"></a> `streamSharingAvailable` | `boolean` |
| <a id="systeminfo"></a> `systemInfo` | [`ProtectNvrSystemInfoInterface`](#protectnvrsysteminfointerface) |
| <a id="temperatureunit"></a> `temperatureUnit` | `string` |
| <a id="timeformat"></a> `timeFormat` | `string` |
| <a id="timezone"></a> `timezone` | `string` |
| <a id="type-5"></a> `type` | `string` |
| <a id="ucoreversion"></a> `ucoreVersion` | `string` |
| <a id="uiversion"></a> `uiVersion` | `string` |
| <a id="upsince-3"></a> `upSince` | `number` |
| <a id="uptime-3"></a> `uptime` | `number` |
| <a id="version"></a> `version` | `string` |
| <a id="wanip"></a> `wanIp` | `string` |
| <a id="wifisettings"></a> `wifiSettings` | \{ `password`: `Nullable`\<`string`\>; `ssid`: `Nullable`\<`string`\>; `useThirdPartyWifi`: `boolean`; \} |
| `wifiSettings.password` | `Nullable`\<`string`\> |
| `wifiSettings.ssid` | `Nullable`\<`string`\> |
| `wifiSettings.useThirdPartyWifi` | `boolean` |

***

### ProtectNvrLiveviewConfigInterface

A semi-complete description of the UniFi Protect NVR liveview JSON.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="id-6"></a> `id` | `string` |
| <a id="isdefault"></a> `isDefault` | `boolean` |
| <a id="isglobal"></a> `isGlobal` | `boolean` |
| <a id="layout"></a> `layout` | `number` |
| <a id="modelkey-5"></a> `modelKey` | `string` |
| <a id="name-6"></a> `name` | `string` |
| <a id="owner"></a> `owner` | `string` |
| <a id="slots"></a> `slots` | \{ `cameras`: `string`[]; `cycleInterval`: `number`; `cycleMode`: `string`; \}[] |

***

### ProtectNvrSystemEventControllerInterface

A semi-complete description of the UniFi Protect system events controller JSON.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="harddriverequired"></a> `harddriveRequired` | `boolean` |
| <a id="info"></a> `info` | \{ `events`: `number`[]; `isAdopted`: `boolean`; `isConnectedToCloud`: `boolean`; `isSetup`: `boolean`; `lastMotion`: `number`; `lastMotionCamera`: `string`; `lastMotionCameraAddress`: `string`; `lastMotionCameraModel`: `string`; `managedCameras`: `number`; `offlineCameras`: `number`; `oldestRecording`: `number`; `onlineCameras`: `number`; `recordingSpaceTotal`: `number`; `recordingSpaceUsed`: `number`; `retentionTime`: `number`; `startedAt`: `number`; `throughput`: `number`; `timeFormat`: `string`; `updateAvailable`: `boolean`; `updateVersion`: `string`; \} |
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
| <a id="installstate"></a> `installState` | `string` |
| <a id="isconfigured"></a> `isConfigured` | `boolean` |
| <a id="isinstalled"></a> `isInstalled` | `boolean` |
| <a id="isrunning"></a> `isRunning` | `boolean` |
| <a id="name-7"></a> `name` | `string` |
| <a id="port"></a> `port` | `number` |
| <a id="required"></a> `required` | `boolean` |
| <a id="state-3"></a> `state` | `string` |
| <a id="status"></a> `status` | `string` |
| <a id="statusmessage"></a> `statusMessage` | `string` |
| <a id="swaiversion"></a> `swaiVersion` | `number` |
| <a id="type-6"></a> `type` | `string` |
| <a id="ui"></a> `ui` | \{ `apiPrefix`: `string`; `baseUrl`: `string`; `cdnPublicPaths`: `string`[]; `entrypoint`: `string`; `hotkey`: `string`; `icon`: `string`; `publicPath`: `string`; `swaiVersion`: `number`; \} |
| `ui.apiPrefix` | `string` |
| `ui.baseUrl` | `string` |
| `ui.cdnPublicPaths` | `string`[] |
| `ui.entrypoint` | `string` |
| `ui.hotkey` | `string` |
| `ui.icon` | `string` |
| `ui.publicPath` | `string` |
| `ui.swaiVersion` | `number` |
| <a id="uinpmpackagename"></a> `uiNpmPackageName` | `string` |
| <a id="uiversion-1"></a> `uiVersion` | `string` |
| <a id="unadopteddevices"></a> `unadoptedDevices` | `unknown`[] |
| <a id="updateavailable"></a> `updateAvailable` | `string` |
| <a id="version-1"></a> `version` | `string` |

***

### ProtectNvrSystemEventInterface

A semi-complete description of the UniFi Protect system events JSON.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="apps"></a> `apps` | \{ `apps`: `unknown`[]; `controllers`: [`ProtectNvrSystemEventControllerInterface`](#protectnvrsystemeventcontrollerinterface)[]; \} |
| `apps.apps` | `unknown`[] |
| `apps.controllers` | [`ProtectNvrSystemEventControllerInterface`](#protectnvrsystemeventcontrollerinterface)[] |
| <a id="system"></a> `system` | `unknown` |
| <a id="type-7"></a> `type` | `string` |

***

### ProtectNvrSystemInfoInterface

A semi-complete description of the UniFi Protect NVR system information configuration JSON.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="cpu"></a> `cpu` | \{ `averageLoad`: `number`; `temperature`: `number`; \} |
| `cpu.averageLoad` | `number` |
| `cpu.temperature` | `number` |
| <a id="memory"></a> `memory` | \{ `available`: `number`; `free`: `number`; `total`: `number`; \} |
| `memory.available` | `number` |
| `memory.free` | `number` |
| `memory.total` | `number` |
| <a id="storage"></a> `storage` | \{ `available`: `number`; `devices`: \{ `healthy`: `boolean`; `model`: `string`; `size`: `number`; \}[]; `isRecycling`: `boolean`; `size`: `number`; `type`: `string`; `used`: `number`; \} |
| `storage.available` | `number` |
| `storage.devices` | \{ `healthy`: `boolean`; `model`: `string`; `size`: `number`; \}[] |
| `storage.isRecycling` | `boolean` |
| `storage.size` | `number` |
| `storage.type` | `string` |
| `storage.used` | `number` |
| <a id="tmpfs"></a> `tmpfs` | \{ `available`: `number`; `path`: `string`; `total`: `number`; `used`: `number`; \} |
| `tmpfs.available` | `number` |
| `tmpfs.path` | `string` |
| `tmpfs.total` | `number` |
| `tmpfs.used` | `number` |

***

### ProtectNvrUserConfigInterface

A semi-complete description of the UniFi Protect NVR user JSON.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="alertrules"></a> `alertRules` | `unknown`[] |
| <a id="allpermissions"></a> `allPermissions` | `string`[] |
| <a id="cloudaccount"></a> `cloudAccount` | \{ `cloudId`: `string`; `email`: `string`; `firstName`: `string`; `id`: `string`; `lastName`: `string`; `modelKey`: `string`; `name`: `string`; `profileImg`: `string`; `user`: `string`; \} |
| `cloudAccount.cloudId` | `string` |
| `cloudAccount.email` | `string` |
| `cloudAccount.firstName` | `string` |
| `cloudAccount.id` | `string` |
| `cloudAccount.lastName` | `string` |
| `cloudAccount.modelKey` | `string` |
| `cloudAccount.name` | `string` |
| `cloudAccount.profileImg` | `string` |
| `cloudAccount.user` | `string` |
| <a id="email"></a> `email` | `string` |
| <a id="enablenotifications"></a> `enableNotifications` | `boolean` |
| <a id="firstname-1"></a> `firstName` | `string` |
| <a id="groups-1"></a> `groups` | `string`[] |
| <a id="hasacceptedinvite"></a> `hasAcceptedInvite` | `boolean` |
| <a id="id-7"></a> `id` | `string` |
| <a id="isowner"></a> `isOwner` | `boolean` |
| <a id="lastloginip"></a> `lastLoginIp` | `string` |
| <a id="lastlogintime"></a> `lastLoginTime` | `number` |
| <a id="lastname-1"></a> `lastName` | `string` |
| <a id="localusername"></a> `localUsername` | `string` |
| <a id="location"></a> `location` | \{ `isAway`: `boolean`; `latitude`: `string`; `longitude`: `string`; \} |
| `location.isAway` | `boolean` |
| `location.latitude` | `string` |
| `location.longitude` | `string` |
| <a id="modelkey-6"></a> `modelKey` | `string` |
| <a id="name-8"></a> `name` | `string` |
| <a id="permissions"></a> `permissions` | `string`[] |
| <a id="role"></a> `role` | `string` |
| <a id="settings"></a> `settings` | \{ `flags`: `string`[]; \} |
| `settings.flags` | `string`[] |
| <a id="syncsso"></a> `syncSso` | `boolean` |

***

### ProtectRingtoneConfigInterface

A semi-complete description of the UniFi Protect ringtone JSON.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="id-8"></a> `id` | `string` |
| <a id="isdefault-1"></a> `isDefault` | `boolean` |
| <a id="modelkey-7"></a> `modelKey` | `string` |
| <a id="name-9"></a> `name` | `string` |
| <a id="nvrmac-3"></a> `nvrMac` | `string` |
| <a id="size"></a> `size` | `number` |

***

### ProtectSensorConfigInterface

A semi-complete description of the UniFi Protect sensor JSON.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="alarmsettings"></a> `alarmSettings` | \{ `isEnabled`: `boolean`; \} |
| `alarmSettings.isEnabled` | `boolean` |
| <a id="alarmtriggeredat"></a> `alarmTriggeredAt` | `Nullable`\<`number`\> |
| <a id="batterystatus"></a> `batteryStatus` | \{ `isLow`: `boolean`; `percentage`: `number`; \} |
| `batteryStatus.isLow` | `boolean` |
| `batteryStatus.percentage` | `number` |
| <a id="bluetoothconnectionstate"></a> `bluetoothConnectionState` | \{ `signalQuality`: `number`; `signalStrength`: `number`; \} |
| `bluetoothConnectionState.signalQuality` | `number` |
| `bluetoothConnectionState.signalStrength` | `number` |
| <a id="bridge"></a> `bridge` | `string` |
| <a id="bridgecandidates"></a> `bridgeCandidates` | \[\] |
| <a id="camera-2"></a> `camera` | `string` |
| <a id="canadopt-2"></a> `canAdopt` | `boolean` |
| <a id="connectedsince-3"></a> `connectedSince` | `number` |
| <a id="connectionhost-3"></a> `connectionHost` | `string` |
| <a id="displayname-1"></a> `displayName` | `string` |
| <a id="firmwarebuild-3"></a> `firmwareBuild` | `string` |
| <a id="firmwareversion-4"></a> `firmwareVersion` | `string` |
| <a id="fwupdatestate-2"></a> `fwUpdateState` | `string` |
| <a id="hardwarerevision-4"></a> `hardwareRevision` | `string` |
| <a id="host-4"></a> `host` | `string` |
| <a id="humiditysettings"></a> `humiditySettings` | \{ `highThreshold`: `number`; `isEnabled`: `boolean`; `lowThreshold`: `number`; `margin`: `number`; \} |
| `humiditySettings.highThreshold` | `number` |
| `humiditySettings.isEnabled` | `boolean` |
| `humiditySettings.lowThreshold` | `number` |
| `humiditySettings.margin` | `number` |
| <a id="id-9"></a> `id` | `string` |
| <a id="isadopted-3"></a> `isAdopted` | `boolean` |
| <a id="isadoptedbyother-3"></a> `isAdoptedByOther` | `boolean` |
| <a id="isadopting-3"></a> `isAdopting` | `boolean` |
| <a id="isattemptingtoconnect-3"></a> `isAttemptingToConnect` | `boolean` |
| <a id="isconnected-3"></a> `isConnected` | `boolean` |
| <a id="isdownloadingfw-2"></a> `isDownloadingFW` | `boolean` |
| <a id="ismotiondetected-1"></a> `isMotionDetected` | `boolean` |
| <a id="isopened"></a> `isOpened` | `boolean` |
| <a id="isprovisioned-3"></a> `isProvisioned` | `boolean` |
| <a id="isrebooting-3"></a> `isRebooting` | `boolean` |
| <a id="isrestoring-1"></a> `isRestoring` | `boolean` |
| <a id="issshenabled-4"></a> `isSshEnabled` | `boolean` |
| <a id="isupdating-4"></a> `isUpdating` | `boolean` |
| <a id="lastdisconnect"></a> `lastDisconnect` | `number` |
| <a id="lastseen-4"></a> `lastSeen` | `number` |
| <a id="latestfirmwareversion-3"></a> `latestFirmwareVersion` | `string` |
| <a id="leakdetectedat"></a> `leakDetectedAt` | `number` |
| <a id="ledsettings-1"></a> `ledSettings` | \{ `isEnabled`: `boolean`; \} |
| `ledSettings.isEnabled` | `boolean` |
| <a id="lightsettings"></a> `lightSettings` | \{ `highThreshold`: `number`; `isEnabled`: `boolean`; `lowThreshold`: `number`; `margin`: `number`; \} |
| `lightSettings.highThreshold` | `number` |
| `lightSettings.isEnabled` | `boolean` |
| `lightSettings.lowThreshold` | `number` |
| `lightSettings.margin` | `number` |
| <a id="mac-4"></a> `mac` | `string` |
| <a id="marketname-4"></a> `marketName` | `string` |
| <a id="modelkey-8"></a> `modelKey` | `string` |
| <a id="motiondetectedat"></a> `motionDetectedAt` | `number` |
| <a id="motionsettings"></a> `motionSettings` | \{ `isEnabled`: `boolean`; `sensitivity`: `number`; \} |
| `motionSettings.isEnabled` | `boolean` |
| `motionSettings.sensitivity` | `number` |
| <a id="mounttype"></a> `mountType` | `string` |
| <a id="name-10"></a> `name` | `string` |
| <a id="nvrmac-4"></a> `nvrMac` | `string` |
| <a id="openstatuschangedat"></a> `openStatusChangedAt` | `number` |
| <a id="state-4"></a> `state` | `string` |
| <a id="stats-1"></a> `stats` | \{ `humidity`: \{ `status`: `string`; `value`: `Nullable`\<`number`\>; \}; `light`: \{ `status`: `string`; `value`: `Nullable`\<`number`\>; \}; `temperature`: \{ `status`: `string`; `value`: `Nullable`\<`number`\>; \}; \} |
| `stats.humidity` | \{ `status`: `string`; `value`: `Nullable`\<`number`\>; \} |
| `stats.humidity.status` | `string` |
| `stats.humidity.value` | `Nullable`\<`number`\> |
| `stats.light` | \{ `status`: `string`; `value`: `Nullable`\<`number`\>; \} |
| `stats.light.status` | `string` |
| `stats.light.value` | `Nullable`\<`number`\> |
| `stats.temperature` | \{ `status`: `string`; `value`: `Nullable`\<`number`\>; \} |
| `stats.temperature.status` | `string` |
| `stats.temperature.value` | `Nullable`\<`number`\> |
| <a id="tamperingdetectedat"></a> `tamperingDetectedAt` | `Nullable`\<`number`\> |
| <a id="temperaturesettings"></a> `temperatureSettings` | \{ `highThreshold`: `number`; `isEnabled`: `boolean`; `lowThreshold`: `number`; `margin`: `number`; \} |
| `temperatureSettings.highThreshold` | `number` |
| `temperatureSettings.isEnabled` | `boolean` |
| `temperatureSettings.lowThreshold` | `number` |
| `temperatureSettings.margin` | `number` |
| <a id="type-8"></a> `type` | `string` |
| <a id="upsince-4"></a> `upSince` | `number` |
| <a id="uptime-4"></a> `uptime` | `number` |
| <a id="wificonnectionstate-2"></a> `wifiConnectionState` | \{ `apName`: `Nullable`\<`string`\>; `bssid`: `Nullable`\<`string`\>; `channel`: `Nullable`\<`string`\>; `connectivity`: `string`; `experience`: `null`; `frequency`: `null`; `phyRate`: `number`; `signalQuality`: `number`; `signalStrength`: `number`; `ssid`: `Nullable`\<`string`\>; `txRate`: `null`; \} |
| `wifiConnectionState.apName` | `Nullable`\<`string`\> |
| `wifiConnectionState.bssid` | `Nullable`\<`string`\> |
| `wifiConnectionState.channel` | `Nullable`\<`string`\> |
| `wifiConnectionState.connectivity` | `string` |
| `wifiConnectionState.experience` | `null` |
| `wifiConnectionState.frequency` | `null` |
| `wifiConnectionState.phyRate` | `number` |
| `wifiConnectionState.signalQuality` | `number` |
| `wifiConnectionState.signalStrength` | `number` |
| `wifiConnectionState.ssid` | `Nullable`\<`string`\> |
| `wifiConnectionState.txRate` | `null` |
| <a id="wiredconnectionstate-3"></a> `wiredConnectionState` | \{ `phyRate`: `number`; \} |
| `wiredConnectionState.phyRate` | `number` |

***

### ProtectViewerConfigInterface

A semi-complete description of the UniFi Protect viewer JSON.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="canadopt-3"></a> `canAdopt` | `boolean` |
| <a id="connectedsince-4"></a> `connectedSince` | `number` |
| <a id="connectionhost-4"></a> `connectionHost` | `string` |
| <a id="firmwarebuild-4"></a> `firmwareBuild` | `string` |
| <a id="firmwareversion-5"></a> `firmwareVersion` | `string` |
| <a id="hardwarerevision-5"></a> `hardwareRevision` | `string` |
| <a id="host-5"></a> `host` | `string` |
| <a id="id-10"></a> `id` | `string` |
| <a id="isadopted-4"></a> `isAdopted` | `boolean` |
| <a id="isadoptedbyother-4"></a> `isAdoptedByOther` | `boolean` |
| <a id="isadopting-4"></a> `isAdopting` | `boolean` |
| <a id="isattemptingtoconnect-4"></a> `isAttemptingToConnect` | `boolean` |
| <a id="isconnected-4"></a> `isConnected` | `boolean` |
| <a id="isprovisioned-4"></a> `isProvisioned` | `boolean` |
| <a id="isrebooting-4"></a> `isRebooting` | `boolean` |
| <a id="issshenabled-5"></a> `isSshEnabled` | `boolean` |
| <a id="isupdating-5"></a> `isUpdating` | `boolean` |
| <a id="lastseen-5"></a> `lastSeen` | `number` |
| <a id="latestfirmwareversion-4"></a> `latestFirmwareVersion` | `string` |
| <a id="liveview"></a> `liveview` | `Nullable`\<`string`\> |
| <a id="mac-5"></a> `mac` | `string` |
| <a id="marketname-5"></a> `marketName` | `string` |
| <a id="modelkey-9"></a> `modelKey` | `string` |
| <a id="name-11"></a> `name` | `string` |
| <a id="nvrmac-5"></a> `nvrMac` | `string` |
| <a id="softwareversion"></a> `softwareVersion` | `string` |
| <a id="state-5"></a> `state` | `string` |
| <a id="streamlimit"></a> `streamLimit` | `number` |
| <a id="type-9"></a> `type` | `string` |
| <a id="upsince-5"></a> `upSince` | `number` |
| <a id="uptime-5"></a> `uptime` | `number` |
| <a id="wiredconnectionstate-4"></a> `wiredConnectionState` | \{ `phyRate`: `number`; \} |
| `wiredConnectionState.phyRate` | `number` |

## Type Aliases

### ProtectCameraChannelConfig

```ts
type ProtectCameraChannelConfig = ProtectCameraChannelConfigInterface;
```

#### See

[ProtectCameraChannelConfigInterface](#protectcamerachannelconfiginterface)

***

### ProtectCameraConfig

```ts
type ProtectCameraConfig = ProtectCameraConfigInterface;
```

#### See

[ProtectCameraConfigInterface](#protectcameraconfiginterface)

***

### ProtectCameraConfigPayload

```ts
type ProtectCameraConfigPayload = DeepPartial<ProtectCameraConfigInterface>;
```

#### See

[ProtectCameraConfigInterface](#protectcameraconfiginterface)

***

### ProtectCameraLcdMessageConfig

```ts
type ProtectCameraLcdMessageConfig = ProtectCameraLcdMessageConfigInterface;
```

#### See

[ProtectCameraLcdMessageConfigInterface](#protectcameralcdmessageconfiginterface)

***

### ProtectCameraLcdMessagePayload

```ts
type ProtectCameraLcdMessagePayload = DeepPartial<ProtectCameraLcdMessageConfigInterface>;
```

#### See

[ProtectCameraLcdMessageConfigInterface](#protectcameralcdmessageconfiginterface)

***

### ProtectChimeConfig

```ts
type ProtectChimeConfig = ProtectChimeConfigInterface;
```

#### See

[ProtectChimeConfigInterface](#protectchimeconfiginterface)

***

### ProtectChimeConfigPayload

```ts
type ProtectChimeConfigPayload = DeepPartial<ProtectChimeConfigInterface>;
```

#### See

[ProtectChimeConfigInterface](#protectchimeconfiginterface)

***

### ProtectEventAdd

```ts
type ProtectEventAdd = ProtectEventAddInterface;
```

#### See

[ProtectEventAddInterface](#protecteventaddinterface)

***

### ProtectEventMetadata

```ts
type ProtectEventMetadata = ProtectEventMetadataInterface;
```

#### See

[ProtectEventMetadataInterface](#protecteventmetadatainterface)

***

### ProtectLightConfig

```ts
type ProtectLightConfig = ProtectLightConfigInterface;
```

#### See

[ProtectLightConfigInterface](#protectlightconfiginterface)

***

### ProtectLightConfigPayload

```ts
type ProtectLightConfigPayload = DeepPartial<ProtectLightConfigInterface>;
```

#### See

[ProtectLightConfigInterface](#protectlightconfiginterface)

***

### ProtectNvrBootstrap

```ts
type ProtectNvrBootstrap = ProtectNvrBootstrapInterface;
```

#### See

[ProtectNvrBootstrapInterface](#protectnvrbootstrapinterface)

***

### ProtectNvrConfig

```ts
type ProtectNvrConfig = ProtectNvrConfigInterface;
```

#### See

[ProtectNvrConfigInterface](#protectnvrconfiginterface)

***

### ProtectNvrConfigPayload

```ts
type ProtectNvrConfigPayload = DeepPartial<ProtectNvrConfigInterface>;
```

#### See

[ProtectNvrConfigInterface](#protectnvrconfiginterface)

***

### ProtectNvrLiveviewConfig

```ts
type ProtectNvrLiveviewConfig = ProtectNvrLiveviewConfigInterface;
```

#### See

[ProtectNvrLiveviewConfigInterface](#protectnvrliveviewconfiginterface)

***

### ProtectNvrSystemEvent

```ts
type ProtectNvrSystemEvent = ProtectNvrSystemEventInterface;
```

#### See

[ProtectNvrSystemEventInterface](#protectnvrsystemeventinterface)

***

### ProtectNvrSystemEventController

```ts
type ProtectNvrSystemEventController = ProtectNvrSystemEventControllerInterface;
```

#### See

[ProtectNvrSystemEventInterface](#protectnvrsystemeventinterface)

***

### ProtectNvrSystemInfoConfig

```ts
type ProtectNvrSystemInfoConfig = ProtectNvrSystemInfoInterface;
```

#### See

[ProtectNvrSystemInfoInterface](#protectnvrsysteminfointerface)

***

### ProtectNvrUserConfig

```ts
type ProtectNvrUserConfig = ProtectNvrUserConfigInterface;
```

#### See

[ProtectNvrUserConfigInterface](#protectnvruserconfiginterface)

***

### ProtectRingtoneConfig

```ts
type ProtectRingtoneConfig = ProtectRingtoneConfigInterface;
```

#### See

[ProtectRingtoneConfigInterface](#protectringtoneconfiginterface)

***

### ProtectSensorConfig

```ts
type ProtectSensorConfig = ProtectSensorConfigInterface;
```

#### See

[ProtectSensorConfigInterface](#protectsensorconfiginterface)

***

### ProtectSensorConfigPayload

```ts
type ProtectSensorConfigPayload = DeepPartial<ProtectSensorConfigInterface>;
```

#### See

[ProtectSensorConfigInterface](#protectsensorconfiginterface)

***

### ProtectViewerConfig

```ts
type ProtectViewerConfig = ProtectViewerConfigInterface;
```

#### See

[ProtectViewerConfigInterface](#protectviewerconfiginterface)

***

### ProtectViewerConfigPayload

```ts
type ProtectViewerConfigPayload = DeepPartial<ProtectViewerConfigInterface>;
```

#### See

[ProtectViewerConfigInterface](#protectviewerconfiginterface)
