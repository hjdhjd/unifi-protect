[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectCameraConfigInterface

# Interface: ProtectCameraConfigInterface

A semi-complete description of the UniFi Protect camera JSON.

## Extends

- [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md)

## Indexable

```ts
[key: string]: ProtectKnownJsonValue
```

## Properties

| Property | Type | Overrides | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="accessdevicemetadata"></a> `accessDeviceMetadata?` | \{ `channels`: \{ `bitrate`: `number`; `fps`: `number`; `fpsValues`: `number`[]; `height`: `number`; `id`: `number`; `localStreamName`: `string`; `quality`: `string`; `width`: `number`; \}[]; `connectedSince`: `number`; `disableRecordingByDefault`: `boolean`; `doorInfo`: \{ `canLock`: `boolean`; `lockState`: `string`; \}; `featureFlags`: \{ `supportLivestream`: `boolean`; `supportMicManagement`: `boolean`; `supportUnlock`: `boolean`; \}; `ledSettings`: \{ `isEnabled`: `boolean`; \}; `micVolume`: `number`; `pairedInfo`: \{ `guid`: `Nullable`\<`string`\>; `name`: `string`; `uri`: `string`; \}; `speakerSettings`: \{ `areSystemSoundsEnabled`: `boolean`; \}; `talkbackSettings`: [`ProtectCameraTalkbackConfigInterface`](ProtectCameraTalkbackConfigInterface.md)[]; \} | - | - |
| `accessDeviceMetadata.channels` | \{ `bitrate`: `number`; `fps`: `number`; `fpsValues`: `number`[]; `height`: `number`; `id`: `number`; `localStreamName`: `string`; `quality`: `string`; `width`: `number`; \}[] | - | - |
| `accessDeviceMetadata.connectedSince` | `number` | - | - |
| `accessDeviceMetadata.disableRecordingByDefault` | `boolean` | - | - |
| `accessDeviceMetadata.doorInfo` | \{ `canLock`: `boolean`; `lockState`: `string`; \} | - | - |
| `accessDeviceMetadata.doorInfo.canLock` | `boolean` | - | - |
| `accessDeviceMetadata.doorInfo.lockState` | `string` | - | - |
| `accessDeviceMetadata.featureFlags` | \{ `supportLivestream`: `boolean`; `supportMicManagement`: `boolean`; `supportUnlock`: `boolean`; \} | - | - |
| `accessDeviceMetadata.featureFlags.supportLivestream` | `boolean` | - | - |
| `accessDeviceMetadata.featureFlags.supportMicManagement` | `boolean` | - | - |
| `accessDeviceMetadata.featureFlags.supportUnlock` | `boolean` | - | - |
| `accessDeviceMetadata.ledSettings` | \{ `isEnabled`: `boolean`; \} | - | - |
| `accessDeviceMetadata.ledSettings.isEnabled` | `boolean` | - | - |
| `accessDeviceMetadata.micVolume` | `number` | - | - |
| `accessDeviceMetadata.pairedInfo` | \{ `guid`: `Nullable`\<`string`\>; `name`: `string`; `uri`: `string`; \} | - | - |
| `accessDeviceMetadata.pairedInfo.guid` | `Nullable`\<`string`\> | - | - |
| `accessDeviceMetadata.pairedInfo.name` | `string` | - | - |
| `accessDeviceMetadata.pairedInfo.uri` | `string` | - | - |
| `accessDeviceMetadata.speakerSettings` | \{ `areSystemSoundsEnabled`: `boolean`; \} | - | - |
| `accessDeviceMetadata.speakerSettings.areSystemSoundsEnabled` | `boolean` | - | - |
| `accessDeviceMetadata.talkbackSettings` | [`ProtectCameraTalkbackConfigInterface`](ProtectCameraTalkbackConfigInterface.md)[] | - | - |
| <a id="accessmethodsettings"></a> `accessMethodSettings` | \{ `methods`: `string`[]; \} | - | - |
| `accessMethodSettings.methods` | `string`[] | - | - |
| <a id="activepatrolslot"></a> `activePatrolSlot` | `Nullable`\<`string`\> | - | - |
| <a id="aiportcapacitypoints"></a> `aiPortCapacityPoints` | `number` | - | - |
| <a id="aiportcompatibleresolutions"></a> `aiPortCompatibleResolutions` | `string`[] | - | - |
| <a id="aiportcompatibleresolutionsinhallway"></a> `aiPortCompatibleResolutionsInHallway` | `string`[] | - | - |
| <a id="alarms"></a> `alarms` | \{ `autoTrackingThermalThresholdReached`: `boolean`; `lensThermal`: `number`; `lensThermalThresholdReached`: `boolean`; `motorOverheated`: `boolean`; `panTiltMotorFaults`: `string`[]; `tiltThermal`: `number`; \} | - | - |
| `alarms.autoTrackingThermalThresholdReached` | `boolean` | - | - |
| `alarms.lensThermal` | `number` | - | - |
| `alarms.lensThermalThresholdReached` | `boolean` | - | - |
| `alarms.motorOverheated` | `boolean` | - | - |
| `alarms.panTiltMotorFaults` | `string`[] | - | - |
| `alarms.tiltThermal` | `number` | - | - |
| <a id="anonymousdeviceid"></a> `anonymousDeviceId` | `Nullable`\<`string`\> | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`anonymousDeviceId`](ProtectDeviceBaseInterface.md#anonymousdeviceid) |
| <a id="apmac"></a> `apMac` | `string` | - | - |
| <a id="apmgmtip"></a> `apMgmtIp` | `Nullable`\<`string`\> | - | - |
| <a id="aprssi"></a> `apRssi` | `Nullable`\<`string`\> | - | - |
| <a id="audiobitrate"></a> `audioBitrate` | `number` | - | - |
| <a id="audiosettings"></a> `audioSettings` | \{ `style`: `string`[]; \} | - | - |
| `audioSettings.style` | `string`[] | - | - |
| <a id="autoretentionlqms"></a> `autoRetentionLqMs` | `Nullable`\<`number`\> | - | - |
| <a id="autoretentionms"></a> `autoRetentionMs` | `Nullable`\<`number`\> | - | - |
| <a id="brightnesssettings"></a> `brightnessSettings` | \{ `autoBrightness`: `boolean`; `brightness`: `number`; \} | - | - |
| `brightnessSettings.autoBrightness` | `boolean` | - | - |
| `brightnessSettings.brightness` | `number` | - | - |
| <a id="canadopt"></a> `canAdopt` | `boolean` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`canAdopt`](ProtectDeviceBaseInterface.md#canadopt) |
| <a id="cancreateaccessevent"></a> `canCreateAccessEvent` | `boolean` | - | - |
| <a id="canmanage"></a> `canManage` | `boolean` | - | - |
| <a id="channels"></a> `channels` | [`ProtectCameraChannelConfigInterface`](ProtectCameraChannelConfigInterface.md)[] | - | - |
| <a id="chimeduration"></a> `chimeDuration` | `number` | - | - |
| <a id="clarityzones"></a> `clarityZones` | `ProtectKnownJsonValue`[] | - | - |
| <a id="connectedsince"></a> `connectedSince` | `number` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`connectedSince`](ProtectDeviceBaseInterface.md#connectedsince) |
| <a id="connectionhost"></a> `connectionHost` | `Nullable`\<`string`\> | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`connectionHost`](ProtectDeviceBaseInterface.md#connectionhost) |
| <a id="currentresolution"></a> `currentResolution` | `string` | - | - |
| <a id="displayname"></a> `displayName` | `string` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`displayName`](ProtectDeviceBaseInterface.md#displayname) |
| <a id="doorbellsession"></a> `doorbellSession` | \{ `sessionId`: `Nullable`\<`string`\>; `status`: `Nullable`\<`string`\>; \} | - | - |
| `doorbellSession.sessionId` | `Nullable`\<`string`\> | - | - |
| `doorbellSession.status` | `Nullable`\<`string`\> | - | - |
| <a id="downscalemode"></a> `downScaleMode` | `number` | - | - |
| <a id="elementinfo"></a> `elementInfo` | `Nullable`\<`string`\> | - | - |
| <a id="enablenfc"></a> `enableNfc` | `boolean` | - | - |
| <a id="excludezones"></a> `excludeZones` | `ProtectKnownJsonValue`[] | - | - |
| <a id="extendedaifeatures"></a> `extendedAiFeatures` | \{ `smartDetectTypes`: `string`[]; \} | - | - |
| `extendedAiFeatures.smartDetectTypes` | `string`[] | - | - |
| <a id="faceunlocksettings"></a> `faceUnlockSettings` | \{ `faceDetectionSensitive`: `string`; `lastUpdateTime`: `number`; `licenseConfigured`: `boolean`; \} | - | - |
| `faceUnlockSettings.faceDetectionSensitive` | `string` | - | - |
| `faceUnlockSettings.lastUpdateTime` | `number` | - | - |
| `faceUnlockSettings.licenseConfigured` | `boolean` | - | - |
| <a id="featureflags"></a> `featureFlags` | \{ `audio`: `string`[]; `audioCodecs`: `string`[]; `audioStyle`: `string`[]; `canAdjustIrLedLevel`: `boolean`; `canAdjustIspSettings`: `boolean`; `canAdjustSpeakerVolume`: `boolean`; `canMagicZoom`: `boolean`; `canOpticalZoom`: `boolean`; `canTouchFocus`: `boolean`; `clarityZones`: `Nullable`\<\{ `maxZones`: `number`; `rectangleOnly`: `boolean`; \}\>; `downScaleResolutions`: `number`[][]; `excludeZones`: \{ `maxZones`: `number`; `rectangleOnly`: `boolean`; \}; `flashRange`: `Nullable`\<`number`\>; `focus`: [`ProtectPtzAxisRangeInterface`](ProtectPtzAxisRangeInterface.md); `hallwayModeWarningRequired`: `boolean`; `hasAccelerometer`: `boolean`; `hasAec`: `boolean`; `hasAutoICROnly`: `boolean`; `hasBluetooth`: `boolean`; `hasChime`: `boolean`; `hasColorLcdScreen`: `boolean`; `hasEdgeRecording`: `boolean`; `hasExternalIr`: `boolean`; `hasFingerprintSensor`: `boolean`; `hasFisheye`: `boolean`; `hasFlash`: `boolean`; `hasHallwayMode`: `boolean`; `hasHallwayModeHdrOnRequired`: `boolean`; `hasHdr`: `boolean`; `hasHorizontalFlip`: `boolean`; `hasIcrSensitivity`: `boolean`; `hasInfrared`: `boolean`; `hasLcdScreen`: `boolean`; `hasLdc`: `boolean`; `hasLedIr`: `boolean`; `hasLedStatus`: `boolean`; `hasLineCrossing`: `boolean`; `hasLineCrossingCounting`: `boolean`; `hasLineIn`: `boolean`; `hasLiveviewTracking`: `boolean`; `hasLprReflex`: `boolean`; `hasLuxCheck`: `boolean`; `hasManualPersonOfInterest`: `boolean`; `hasMic`: `boolean`; `hasMotionZones`: `boolean`; `hasOptimizeIr`: `boolean`; `hasPackageCamera`: `boolean`; `hasPackageZoneSupportForPrimaryLens`: `boolean`; `hasPackageZoneSupportForSecondaryLens`: `boolean`; `hasPrivacyMask`: `boolean`; `hasRtc`: `boolean`; `hasSdCard`: `boolean`; `hasSmartDetect`: `boolean`; `hasSmartZoom`: `boolean`; `hasSmokeCover`: `boolean`; `hasSpeaker`: `boolean`; `hasSquareEventThumbnail`: `boolean`; `hasTamperDetection`: `boolean`; `hasVerticalFlip`: `boolean`; `hasWdr`: `boolean`; `hasWifi`: `boolean`; `hotplug`: \{ `audio`: `Nullable`\<`string`\>; `extender`: \{ `flashRange`: `Nullable`\<`number`\>; `hasFlash`: `boolean`; `hasIR`: `boolean`; `hasRadar`: `boolean`; `isAttached`: `boolean`; `radarRangeMax`: `Nullable`\<`number`\>; `radarRangeMin`: `Nullable`\<`number`\>; \}; `sdCardAttached`: `boolean`; `standaloneAdoption`: `boolean`; `video`: `Nullable`\<`string`\>; \}; `isDoorbell`: `boolean`; `isPtz`: `boolean`; `lensModel`: `Nullable`\<`string`\>; `lensType`: `Nullable`\<`string`\>; `maxScaleDownLevel`: `number`; `motionAlgorithms`: `string`[]; `mountPositions`: `string`[]; `pan`: [`ProtectPtzAxisRangeInterface`](ProtectPtzAxisRangeInterface.md); `presetMinDuration`: `Nullable`\<`number`\>; `presetTour`: `boolean`; `privacyMaskCapability`: \{ `maxMasks`: `number`; `rectangleOnly`: `boolean`; \}; `reader`: \{ `canAdjustBrightness`: `boolean`; `support2fa`: `boolean`; `supportAccessMethods`: `string`[]; `supportAdjustSpeakerVolume`: `boolean`; `supportAudioCodecs`: `string`[]; `supportAutoBrightness`: `boolean`; `supportAutoTurnOffDisplay`: `boolean`; `supportCallerManager`: `boolean`; `supportDoorbellTriggerMethod`: `boolean`; `supportDoorDirection`: `boolean`; `supportFloodLed`: `boolean`; `supportGateStop`: `boolean`; `supportGreetings`: `boolean`; `supportInterfaceDesigner`: `boolean`; `supportInterfaceDirectory`: `boolean`; `supportInterfaceLayout`: `boolean`; `supportLocate`: `boolean`; `supportManualDownloadSupportFile`: `boolean`; `supportManualFirmwareUpdate`: `boolean`; `supportMic`: `boolean`; `supportShowHeading`: `boolean`; `supportShowInterfaceImage`: `boolean`; `supportShowStatusBar`: `boolean`; `supportShowUnlockSchedule`: `boolean`; `supportSpeaker`: `boolean`; `supportSsh`: `boolean`; `supportStatusLed`: `boolean`; `supportStreamEncryption`: `boolean`; `supportTwilioSip`: `boolean`; `supportWelcomeLed`: `boolean`; \}; `smartDetectAudioTypes`: `string`[]; `smartDetectTypes`: `string`[]; `stitchDistance`: \{ `support`: `boolean`; \}; `storage`: \{ `sdSlotCount`: `number`; `ssdSlotCount`: `number`; \}; `streamEncryptable`: `boolean`; `supportCustomRingtone`: `boolean`; `supportDoorAccessConfig`: `boolean`; `supportFullHdSnapshot`: `boolean`; `supportLocate`: `boolean`; `supportLpDetectionWithoutVehicle`: `boolean`; `supportMinMotionAdaptiveBitrate`: `boolean`; `supportNfc`: `boolean`; `supportPtzTrackingTimeout`: `boolean`; `tilt`: [`ProtectPtzAxisRangeInterface`](ProtectPtzAxisRangeInterface.md); `verticalFlipWarning`: `boolean`; `videoCodecs`: `string`[]; `videoDeviceCount`: `Nullable`\<`number`\>; `videoInputModes`: `string`[]; `videoModeMaxFps`: `number`[]; `videoModes`: `string`[]; `zoom`: [`ProtectPtzAxisRangeInterface`](ProtectPtzAxisRangeInterface.md) & \{ `ratio`: `number`; \}; \} | - | - |
| `featureFlags.audio` | `string`[] | - | - |
| `featureFlags.audioCodecs` | `string`[] | - | - |
| `featureFlags.audioStyle` | `string`[] | - | - |
| `featureFlags.canAdjustIrLedLevel` | `boolean` | - | - |
| `featureFlags.canAdjustIspSettings` | `boolean` | - | - |
| `featureFlags.canAdjustSpeakerVolume` | `boolean` | - | - |
| `featureFlags.canMagicZoom` | `boolean` | - | - |
| `featureFlags.canOpticalZoom` | `boolean` | - | - |
| `featureFlags.canTouchFocus` | `boolean` | - | - |
| `featureFlags.clarityZones` | `Nullable`\<\{ `maxZones`: `number`; `rectangleOnly`: `boolean`; \}\> | - | - |
| `featureFlags.downScaleResolutions` | `number`[][] | - | - |
| `featureFlags.excludeZones` | \{ `maxZones`: `number`; `rectangleOnly`: `boolean`; \} | - | - |
| `featureFlags.excludeZones.maxZones` | `number` | - | - |
| `featureFlags.excludeZones.rectangleOnly` | `boolean` | - | - |
| `featureFlags.flashRange` | `Nullable`\<`number`\> | - | - |
| `featureFlags.focus` | [`ProtectPtzAxisRangeInterface`](ProtectPtzAxisRangeInterface.md) | - | - |
| `featureFlags.hallwayModeWarningRequired` | `boolean` | - | - |
| `featureFlags.hasAccelerometer` | `boolean` | - | - |
| `featureFlags.hasAec` | `boolean` | - | - |
| `featureFlags.hasAutoICROnly` | `boolean` | - | - |
| `featureFlags.hasBluetooth` | `boolean` | - | - |
| `featureFlags.hasChime` | `boolean` | - | - |
| `featureFlags.hasColorLcdScreen` | `boolean` | - | - |
| `featureFlags.hasEdgeRecording` | `boolean` | - | - |
| `featureFlags.hasExternalIr` | `boolean` | - | - |
| `featureFlags.hasFingerprintSensor` | `boolean` | - | - |
| `featureFlags.hasFisheye` | `boolean` | - | - |
| `featureFlags.hasFlash` | `boolean` | - | - |
| `featureFlags.hasHallwayMode` | `boolean` | - | - |
| `featureFlags.hasHallwayModeHdrOnRequired` | `boolean` | - | - |
| `featureFlags.hasHdr` | `boolean` | - | - |
| `featureFlags.hasHorizontalFlip` | `boolean` | - | - |
| `featureFlags.hasIcrSensitivity` | `boolean` | - | - |
| `featureFlags.hasInfrared` | `boolean` | - | - |
| `featureFlags.hasLcdScreen` | `boolean` | - | - |
| `featureFlags.hasLdc` | `boolean` | - | - |
| `featureFlags.hasLedIr` | `boolean` | - | - |
| `featureFlags.hasLedStatus` | `boolean` | - | - |
| `featureFlags.hasLineCrossing` | `boolean` | - | - |
| `featureFlags.hasLineCrossingCounting` | `boolean` | - | - |
| `featureFlags.hasLineIn` | `boolean` | - | - |
| `featureFlags.hasLiveviewTracking` | `boolean` | - | - |
| `featureFlags.hasLprReflex` | `boolean` | - | - |
| `featureFlags.hasLuxCheck` | `boolean` | - | - |
| `featureFlags.hasManualPersonOfInterest` | `boolean` | - | - |
| `featureFlags.hasMic` | `boolean` | - | - |
| `featureFlags.hasMotionZones` | `boolean` | - | - |
| `featureFlags.hasOptimizeIr` | `boolean` | - | - |
| `featureFlags.hasPackageCamera` | `boolean` | - | - |
| `featureFlags.hasPackageZoneSupportForPrimaryLens` | `boolean` | - | - |
| `featureFlags.hasPackageZoneSupportForSecondaryLens` | `boolean` | - | - |
| `featureFlags.hasPrivacyMask` | `boolean` | - | - |
| `featureFlags.hasRtc` | `boolean` | - | - |
| `featureFlags.hasSdCard` | `boolean` | - | - |
| `featureFlags.hasSmartDetect` | `boolean` | - | - |
| `featureFlags.hasSmartZoom` | `boolean` | - | - |
| `featureFlags.hasSmokeCover` | `boolean` | - | - |
| `featureFlags.hasSpeaker` | `boolean` | - | - |
| `featureFlags.hasSquareEventThumbnail` | `boolean` | - | - |
| `featureFlags.hasTamperDetection` | `boolean` | - | - |
| `featureFlags.hasVerticalFlip` | `boolean` | - | - |
| `featureFlags.hasWdr` | `boolean` | - | - |
| `featureFlags.hasWifi` | `boolean` | - | - |
| `featureFlags.hotplug` | \{ `audio`: `Nullable`\<`string`\>; `extender`: \{ `flashRange`: `Nullable`\<`number`\>; `hasFlash`: `boolean`; `hasIR`: `boolean`; `hasRadar`: `boolean`; `isAttached`: `boolean`; `radarRangeMax`: `Nullable`\<`number`\>; `radarRangeMin`: `Nullable`\<`number`\>; \}; `sdCardAttached`: `boolean`; `standaloneAdoption`: `boolean`; `video`: `Nullable`\<`string`\>; \} | - | - |
| `featureFlags.hotplug.audio` | `Nullable`\<`string`\> | - | - |
| `featureFlags.hotplug.extender` | \{ `flashRange`: `Nullable`\<`number`\>; `hasFlash`: `boolean`; `hasIR`: `boolean`; `hasRadar`: `boolean`; `isAttached`: `boolean`; `radarRangeMax`: `Nullable`\<`number`\>; `radarRangeMin`: `Nullable`\<`number`\>; \} | - | - |
| `featureFlags.hotplug.extender.flashRange` | `Nullable`\<`number`\> | - | - |
| `featureFlags.hotplug.extender.hasFlash` | `boolean` | - | - |
| `featureFlags.hotplug.extender.hasIR` | `boolean` | - | - |
| `featureFlags.hotplug.extender.hasRadar` | `boolean` | - | - |
| `featureFlags.hotplug.extender.isAttached` | `boolean` | - | - |
| `featureFlags.hotplug.extender.radarRangeMax` | `Nullable`\<`number`\> | - | - |
| `featureFlags.hotplug.extender.radarRangeMin` | `Nullable`\<`number`\> | - | - |
| `featureFlags.hotplug.sdCardAttached` | `boolean` | - | - |
| `featureFlags.hotplug.standaloneAdoption` | `boolean` | - | - |
| `featureFlags.hotplug.video` | `Nullable`\<`string`\> | - | - |
| `featureFlags.isDoorbell` | `boolean` | - | - |
| `featureFlags.isPtz` | `boolean` | - | - |
| `featureFlags.lensModel` | `Nullable`\<`string`\> | - | - |
| `featureFlags.lensType` | `Nullable`\<`string`\> | - | - |
| `featureFlags.maxScaleDownLevel` | `number` | - | - |
| `featureFlags.motionAlgorithms` | `string`[] | - | - |
| `featureFlags.mountPositions` | `string`[] | - | - |
| `featureFlags.pan` | [`ProtectPtzAxisRangeInterface`](ProtectPtzAxisRangeInterface.md) | - | - |
| `featureFlags.presetMinDuration` | `Nullable`\<`number`\> | - | - |
| `featureFlags.presetTour` | `boolean` | - | - |
| `featureFlags.privacyMaskCapability` | \{ `maxMasks`: `number`; `rectangleOnly`: `boolean`; \} | - | - |
| `featureFlags.privacyMaskCapability.maxMasks` | `number` | - | - |
| `featureFlags.privacyMaskCapability.rectangleOnly` | `boolean` | - | - |
| `featureFlags.reader` | \{ `canAdjustBrightness`: `boolean`; `support2fa`: `boolean`; `supportAccessMethods`: `string`[]; `supportAdjustSpeakerVolume`: `boolean`; `supportAudioCodecs`: `string`[]; `supportAutoBrightness`: `boolean`; `supportAutoTurnOffDisplay`: `boolean`; `supportCallerManager`: `boolean`; `supportDoorbellTriggerMethod`: `boolean`; `supportDoorDirection`: `boolean`; `supportFloodLed`: `boolean`; `supportGateStop`: `boolean`; `supportGreetings`: `boolean`; `supportInterfaceDesigner`: `boolean`; `supportInterfaceDirectory`: `boolean`; `supportInterfaceLayout`: `boolean`; `supportLocate`: `boolean`; `supportManualDownloadSupportFile`: `boolean`; `supportManualFirmwareUpdate`: `boolean`; `supportMic`: `boolean`; `supportShowHeading`: `boolean`; `supportShowInterfaceImage`: `boolean`; `supportShowStatusBar`: `boolean`; `supportShowUnlockSchedule`: `boolean`; `supportSpeaker`: `boolean`; `supportSsh`: `boolean`; `supportStatusLed`: `boolean`; `supportStreamEncryption`: `boolean`; `supportTwilioSip`: `boolean`; `supportWelcomeLed`: `boolean`; \} | - | - |
| `featureFlags.reader.canAdjustBrightness` | `boolean` | - | - |
| `featureFlags.reader.support2fa` | `boolean` | - | - |
| `featureFlags.reader.supportAccessMethods` | `string`[] | - | - |
| `featureFlags.reader.supportAdjustSpeakerVolume` | `boolean` | - | - |
| `featureFlags.reader.supportAudioCodecs` | `string`[] | - | - |
| `featureFlags.reader.supportAutoBrightness` | `boolean` | - | - |
| `featureFlags.reader.supportAutoTurnOffDisplay` | `boolean` | - | - |
| `featureFlags.reader.supportCallerManager` | `boolean` | - | - |
| `featureFlags.reader.supportDoorbellTriggerMethod` | `boolean` | - | - |
| `featureFlags.reader.supportDoorDirection` | `boolean` | - | - |
| `featureFlags.reader.supportFloodLed` | `boolean` | - | - |
| `featureFlags.reader.supportGateStop` | `boolean` | - | - |
| `featureFlags.reader.supportGreetings` | `boolean` | - | - |
| `featureFlags.reader.supportInterfaceDesigner` | `boolean` | - | - |
| `featureFlags.reader.supportInterfaceDirectory` | `boolean` | - | - |
| `featureFlags.reader.supportInterfaceLayout` | `boolean` | - | - |
| `featureFlags.reader.supportLocate` | `boolean` | - | - |
| `featureFlags.reader.supportManualDownloadSupportFile` | `boolean` | - | - |
| `featureFlags.reader.supportManualFirmwareUpdate` | `boolean` | - | - |
| `featureFlags.reader.supportMic` | `boolean` | - | - |
| `featureFlags.reader.supportShowHeading` | `boolean` | - | - |
| `featureFlags.reader.supportShowInterfaceImage` | `boolean` | - | - |
| `featureFlags.reader.supportShowStatusBar` | `boolean` | - | - |
| `featureFlags.reader.supportShowUnlockSchedule` | `boolean` | - | - |
| `featureFlags.reader.supportSpeaker` | `boolean` | - | - |
| `featureFlags.reader.supportSsh` | `boolean` | - | - |
| `featureFlags.reader.supportStatusLed` | `boolean` | - | - |
| `featureFlags.reader.supportStreamEncryption` | `boolean` | - | - |
| `featureFlags.reader.supportTwilioSip` | `boolean` | - | - |
| `featureFlags.reader.supportWelcomeLed` | `boolean` | - | - |
| `featureFlags.smartDetectAudioTypes` | `string`[] | - | - |
| `featureFlags.smartDetectTypes` | `string`[] | - | - |
| `featureFlags.stitchDistance` | \{ `support`: `boolean`; \} | - | - |
| `featureFlags.stitchDistance.support` | `boolean` | - | - |
| `featureFlags.storage` | \{ `sdSlotCount`: `number`; `ssdSlotCount`: `number`; \} | - | - |
| `featureFlags.storage.sdSlotCount` | `number` | - | - |
| `featureFlags.storage.ssdSlotCount` | `number` | - | - |
| `featureFlags.streamEncryptable` | `boolean` | - | - |
| `featureFlags.supportCustomRingtone` | `boolean` | - | - |
| `featureFlags.supportDoorAccessConfig` | `boolean` | - | - |
| `featureFlags.supportFullHdSnapshot` | `boolean` | - | - |
| `featureFlags.supportLocate` | `boolean` | - | - |
| `featureFlags.supportLpDetectionWithoutVehicle` | `boolean` | - | - |
| `featureFlags.supportMinMotionAdaptiveBitrate` | `boolean` | - | - |
| `featureFlags.supportNfc` | `boolean` | - | - |
| `featureFlags.supportPtzTrackingTimeout` | `boolean` | - | - |
| `featureFlags.tilt` | [`ProtectPtzAxisRangeInterface`](ProtectPtzAxisRangeInterface.md) | - | - |
| `featureFlags.verticalFlipWarning` | `boolean` | - | - |
| `featureFlags.videoCodecs` | `string`[] | - | - |
| `featureFlags.videoDeviceCount` | `Nullable`\<`number`\> | - | - |
| `featureFlags.videoInputModes` | `string`[] | - | - |
| `featureFlags.videoModeMaxFps` | `number`[] | - | - |
| `featureFlags.videoModes` | `string`[] | - | - |
| `featureFlags.zoom` | [`ProtectPtzAxisRangeInterface`](ProtectPtzAxisRangeInterface.md) & \{ `ratio`: `number`; \} | - | - |
| <a id="fingerprintsettings"></a> `fingerprintSettings` | \{ `enable`: `boolean`; `enablePrintLatency`: `boolean`; `mode`: `string`; `reportCaptureComplete`: `boolean`; `reportFingerTouch`: `boolean`; \} | - | - |
| `fingerprintSettings.enable` | `boolean` | - | - |
| `fingerprintSettings.enablePrintLatency` | `boolean` | - | - |
| `fingerprintSettings.mode` | `string` | - | - |
| `fingerprintSettings.reportCaptureComplete` | `boolean` | - | - |
| `fingerprintSettings.reportFingerTouch` | `boolean` | - | - |
| <a id="fingerprintstate"></a> `fingerprintState` | \{ `fingerprintId`: `string`; `free`: `number`; `progress`: `string`; `status`: `string`; `total`: `number`; \} | - | - |
| `fingerprintState.fingerprintId` | `string` | - | - |
| `fingerprintState.free` | `number` | - | - |
| `fingerprintState.progress` | `string` | - | - |
| `fingerprintState.status` | `string` | - | - |
| `fingerprintState.total` | `number` | - | - |
| <a id="firmwarebuild"></a> `firmwareBuild` | `string` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`firmwareBuild`](ProtectDeviceBaseInterface.md#firmwarebuild) |
| <a id="firmwareversion"></a> `firmwareVersion` | `Nullable`\<`string`\> | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`firmwareVersion`](ProtectDeviceBaseInterface.md#firmwareversion) |
| <a id="fwupdatestate"></a> `fwUpdateState` | `Nullable`\<`string`\> | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`fwUpdateState`](ProtectDeviceBaseInterface.md#fwupdatestate) |
| <a id="globalalarmmanagerscopenames"></a> `globalAlarmManagerScopeNames` | `string`[] | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`globalAlarmManagerScopeNames`](ProtectDeviceBaseInterface.md#globalalarmmanagerscopenames) |
| <a id="greetingsettings"></a> `greetingSettings` | \{ `greetingBroadcastName`: `string`; `greetingText`: `string`; \} | - | - |
| `greetingSettings.greetingBroadcastName` | `string` | - | - |
| `greetingSettings.greetingText` | `string` | - | - |
| <a id="guid"></a> `guid` | `Nullable`\<`string`\> | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`guid`](ProtectDeviceBaseInterface.md#guid) |
| <a id="hallwaymode"></a> `hallwayMode` | `string` | - | - |
| <a id="hardwarerevision"></a> `hardwareRevision` | `Nullable`\<`string`\> | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`hardwareRevision`](ProtectDeviceBaseInterface.md#hardwarerevision) |
| <a id="haspackagecamera"></a> `hasPackageCamera` | `boolean` | - | - |
| <a id="hasrecordings"></a> `hasRecordings` | `boolean` | - | - |
| <a id="hasrecordingstarted"></a> `hasRecordingStarted` | `boolean` | - | - |
| <a id="hasspeaker"></a> `hasSpeaker` | `boolean` | - | - |
| <a id="haswifi"></a> `hasWifi` | `boolean` | - | - |
| <a id="hdrmode"></a> `hdrMode` | `boolean` | - | - |
| <a id="hdrtype"></a> `hdrType` | `string` | - | - |
| <a id="homekitaccessoryid"></a> `homekitAccessoryId` | `Nullable`\<`string`\> | - | - |
| <a id="homekitsettings"></a> `homekitSettings` | \{ `doorbellMuted`: `Nullable`\<`boolean`\>; `microphoneMuted`: `boolean`; `recordingActive`: `boolean`; `speakerMuted`: `boolean`; `streamInProgress`: `boolean`; `talkbackSettingsActive`: `boolean`; \} | - | - |
| `homekitSettings.doorbellMuted` | `Nullable`\<`boolean`\> | - | - |
| `homekitSettings.microphoneMuted` | `boolean` | - | - |
| `homekitSettings.recordingActive` | `boolean` | - | - |
| `homekitSettings.speakerMuted` | `boolean` | - | - |
| `homekitSettings.streamInProgress` | `boolean` | - | - |
| `homekitSettings.talkbackSettingsActive` | `boolean` | - | - |
| <a id="host"></a> `host` | `string` | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`host`](ProtectDeviceBaseInterface.md#host) | - |
| <a id="hqbytesperday"></a> `hqBytesPerDay` | `number` | - | - |
| <a id="hubmac"></a> `hubMac` | `string` | - | - |
| <a id="id"></a> `id` | `string` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`id`](ProtectDeviceBaseInterface.md#id) |
| <a id="interfacesettings"></a> `interfaceSettings` | \{ `bgImageId`: `Nullable`\<`string`\>; `callMethod`: `string`; `heading`: `Nullable`\<`string`\>; `layout`: `string`; `logoImageId`: `Nullable`\<`string`\>; `showLogo`: `boolean`; `showTime`: `boolean`; `showWeather`: `boolean`; `subHeading`: `Nullable`\<`string`\>; \} | - | - |
| `interfaceSettings.bgImageId` | `Nullable`\<`string`\> | - | - |
| `interfaceSettings.callMethod` | `string` | - | - |
| `interfaceSettings.heading` | `Nullable`\<`string`\> | - | - |
| `interfaceSettings.layout` | `string` | - | - |
| `interfaceSettings.logoImageId` | `Nullable`\<`string`\> | - | - |
| `interfaceSettings.showLogo` | `boolean` | - | - |
| `interfaceSettings.showTime` | `boolean` | - | - |
| `interfaceSettings.showWeather` | `boolean` | - | - |
| `interfaceSettings.subHeading` | `Nullable`\<`string`\> | - | - |
| <a id="is2k"></a> `is2K` | `boolean` | - | - |
| <a id="is4k"></a> `is4K` | `boolean` | - | - |
| <a id="isaccessdevice"></a> `isAccessDevice` | `boolean` | - | - |
| <a id="isaccessfloodlighttriggerenabled"></a> `isAccessFloodlightTriggerEnabled` | `boolean` | - | - |
| <a id="isadopted"></a> `isAdopted` | `boolean` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`isAdopted`](ProtectDeviceBaseInterface.md#isadopted) |
| <a id="isadoptedbyaccessapp"></a> `isAdoptedByAccessApp` | `boolean` | - | - |
| <a id="isadoptedbyother"></a> `isAdoptedByOther` | `boolean` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`isAdoptedByOther`](ProtectDeviceBaseInterface.md#isadoptedbyother) |
| <a id="isadopting"></a> `isAdopting` | `boolean` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`isAdopting`](ProtectDeviceBaseInterface.md#isadopting) |
| <a id="isattemptingtoconnect"></a> `isAttemptingToConnect` | `boolean` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`isAttemptingToConnect`](ProtectDeviceBaseInterface.md#isattemptingtoconnect) |
| <a id="isblockedbyarmmode"></a> `isBlockedByArmMode` | `boolean` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`isBlockedByArmMode`](ProtectDeviceBaseInterface.md#isblockedbyarmmode) |
| <a id="isconnected"></a> `isConnected` | `boolean` | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`isConnected`](ProtectDeviceBaseInterface.md#isconnected) | - |
| <a id="isdark"></a> `isDark` | `boolean` | - | - |
| <a id="isdeleting"></a> `isDeleting` | `boolean` | - | - |
| <a id="isdownloadingfw"></a> `isDownloadingFW` | `boolean` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`isDownloadingFW`](ProtectDeviceBaseInterface.md#isdownloadingfw) |
| <a id="isextenderinstalledever"></a> `isExtenderInstalledEver` | `boolean` | - | - |
| <a id="isintercom"></a> `isIntercom` | `boolean` | - | - |
| <a id="isliveheatmapenabled"></a> `isLiveHeatmapEnabled` | `boolean` | - | - |
| <a id="ismanaged"></a> `isManaged` | `boolean` | - | - |
| <a id="ismicenabled"></a> `isMicEnabled` | `boolean` | - | - |
| <a id="ismissingrecordingdetected"></a> `isMissingRecordingDetected` | `boolean` | - | - |
| <a id="ismotiondetected"></a> `isMotionDetected` | `boolean` | - | - |
| <a id="ispairedwithaiport"></a> `isPairedWithAiPort` | `boolean` | - | - |
| <a id="ispoornetwork"></a> `isPoorNetwork` | `boolean` | - | - |
| <a id="isprobingforwifi"></a> `isProbingForWifi` | `boolean` | - | - |
| <a id="isprovisioned"></a> `isProvisioned` | `boolean` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`isProvisioned`](ProtectDeviceBaseInterface.md#isprovisioned) |
| <a id="ispsettings"></a> `ispSettings` | \{ `aeMode`: `string`; `brightness`: `number`; `contrast`: `number`; `denoise`: `number`; `dZoomCenterX`: `number`; `dZoomCenterY`: `number`; `dZoomScale`: `number`; `dZoomStreamId`: `number`; `focusMode`: `string`; `focusPosition`: `number`; `hdrMode`: `string`; `hue`: `number`; `icrCustomValue`: `number`; `icrSensitivity`: `number`; `icrSwitchMode`: `string`; `irLedLevel`: `number`; `irLedMode`: `string`; `is3dnrEnabled`: `boolean`; `isAggressiveAntiFlickerEnabled`: `boolean`; `isAutoRotateEnabled`: `boolean`; `isColorNightVisionEnabled`: `boolean`; `isExternalIrEnabled`: `boolean`; `isFlippedHorizontal`: `boolean`; `isFlippedVertical`: `boolean`; `isLdcEnabled`: `boolean`; `isPauseMotionEnabled`: `boolean`; `isSmokeCoverModeEnabled`: `boolean`; `mountPosition`: `string`; `saturation`: `number`; `sceneMode`: `string`; `sharpness`: `number`; `spotlightDuration`: `number`; `touchFocusX`: `number`; `touchFocusY`: `number`; `wdr`: `number`; `zoomPosition`: `number`; \} | - | - |
| `ispSettings.aeMode` | `string` | - | - |
| `ispSettings.brightness` | `number` | - | - |
| `ispSettings.contrast` | `number` | - | - |
| `ispSettings.denoise` | `number` | - | - |
| `ispSettings.dZoomCenterX` | `number` | - | - |
| `ispSettings.dZoomCenterY` | `number` | - | - |
| `ispSettings.dZoomScale` | `number` | - | - |
| `ispSettings.dZoomStreamId` | `number` | - | - |
| `ispSettings.focusMode` | `string` | - | - |
| `ispSettings.focusPosition` | `number` | - | - |
| `ispSettings.hdrMode` | `string` | - | - |
| `ispSettings.hue` | `number` | - | - |
| `ispSettings.icrCustomValue` | `number` | - | - |
| `ispSettings.icrSensitivity` | `number` | - | - |
| `ispSettings.icrSwitchMode` | `string` | - | - |
| `ispSettings.irLedLevel` | `number` | - | - |
| `ispSettings.irLedMode` | `string` | - | - |
| `ispSettings.is3dnrEnabled` | `boolean` | - | - |
| `ispSettings.isAggressiveAntiFlickerEnabled` | `boolean` | - | - |
| `ispSettings.isAutoRotateEnabled` | `boolean` | - | - |
| `ispSettings.isColorNightVisionEnabled` | `boolean` | - | - |
| `ispSettings.isExternalIrEnabled` | `boolean` | - | - |
| `ispSettings.isFlippedHorizontal` | `boolean` | - | - |
| `ispSettings.isFlippedVertical` | `boolean` | - | - |
| `ispSettings.isLdcEnabled` | `boolean` | - | - |
| `ispSettings.isPauseMotionEnabled` | `boolean` | - | - |
| `ispSettings.isSmokeCoverModeEnabled` | `boolean` | - | - |
| `ispSettings.mountPosition` | `string` | - | - |
| `ispSettings.saturation` | `number` | - | - |
| `ispSettings.sceneMode` | `string` | - | - |
| `ispSettings.sharpness` | `number` | - | - |
| `ispSettings.spotlightDuration` | `number` | - | - |
| `ispSettings.touchFocusX` | `number` | - | - |
| `ispSettings.touchFocusY` | `number` | - | - |
| `ispSettings.wdr` | `number` | - | - |
| `ispSettings.zoomPosition` | `number` | - | - |
| <a id="isreaderpro"></a> `isReaderPro` | `boolean` | - | - |
| <a id="isrebooting"></a> `isRebooting` | `boolean` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`isRebooting`](ProtectDeviceBaseInterface.md#isrebooting) |
| <a id="isrecording"></a> `isRecording` | `boolean` | - | - |
| <a id="isrecordingspaused"></a> `isRecordingsPaused` | `boolean` | - | - |
| <a id="isrecordingspausedchangedat"></a> `isRecordingsPausedChangedAt` | `Nullable`\<`number`\> | - | - |
| <a id="isrestoring"></a> `isRestoring` | `boolean` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`isRestoring`](ProtectDeviceBaseInterface.md#isrestoring) |
| <a id="isreverting"></a> `isReverting` | `boolean` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`isReverting`](ProtectDeviceBaseInterface.md#isreverting) |
| <a id="issmartdetected"></a> `isSmartDetected` | `boolean` | - | - |
| <a id="issshenabled"></a> `isSshEnabled` | `boolean` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`isSshEnabled`](ProtectDeviceBaseInterface.md#issshenabled) |
| <a id="isthirdpartycamera"></a> `isThirdPartyCamera` | `boolean` | - | - |
| <a id="isupdating"></a> `isUpdating` | `boolean` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`isUpdating`](ProtectDeviceBaseInterface.md#isupdating) |
| <a id="iswaterproofcaseattached"></a> `isWaterproofCaseAttached` | `boolean` | - | - |
| <a id="iswirelessuplinkenabled"></a> `isWirelessUplinkEnabled` | `boolean` | - | - |
| <a id="lastdisconnect"></a> `lastDisconnect` | `Nullable`\<`number`\> | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`lastDisconnect`](ProtectDeviceBaseInterface.md#lastdisconnect) |
| <a id="lastmotion"></a> `lastMotion` | `number` | - | - |
| <a id="lastring"></a> `lastRing` | `Nullable`\<`number`\> | - | - |
| <a id="lastseen"></a> `lastSeen` | `number` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`lastSeen`](ProtectDeviceBaseInterface.md#lastseen) |
| <a id="latestfirmwaresizebytes"></a> `latestFirmwareSizeBytes` | `Nullable`\<`number`\> | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`latestFirmwareSizeBytes`](ProtectDeviceBaseInterface.md#latestfirmwaresizebytes) |
| <a id="latestfirmwareversion"></a> `latestFirmwareVersion` | `string` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`latestFirmwareVersion`](ProtectDeviceBaseInterface.md#latestfirmwareversion) |
| <a id="lcdmessage"></a> `lcdMessage?` | `DeepPartial`\<[`ProtectCameraLcdMessageConfigInterface`](ProtectCameraLcdMessageConfigInterface.md)\> | - | - |
| <a id="ledsettings"></a> `ledSettings` | \{ `floodLed`: `boolean`; `isEnabled`: `boolean`; `welcomeLed`: `boolean`; \} | - | - |
| `ledSettings.floodLed` | `boolean` | - | - |
| `ledSettings.isEnabled` | `boolean` | - | - |
| `ledSettings.welcomeLed` | `boolean` | - | - |
| <a id="lenses"></a> `lenses` | \{ `id`: `number`; `video`: \{ `recordingEnd`: `Nullable`\<`number`\>; `recordingEndLQ`: `Nullable`\<`number`\>; `recordingStart`: `Nullable`\<`number`\>; `recordingStartLQ`: `Nullable`\<`number`\>; `timelapseEnd`: `Nullable`\<`number`\>; `timelapseEndLQ`: `Nullable`\<`number`\>; `timelapseStart`: `Nullable`\<`number`\>; `timelapseStartLQ`: `Nullable`\<`number`\>; \}; \}[] | - | - |
| <a id="lowmemorydisabledprocesses"></a> `lowMemoryDisabledProcesses` | `Nullable`\<`string`[]\> | - | - |
| <a id="lqbytesperday"></a> `lqBytesPerDay` | `number` | - | - |
| <a id="mac"></a> `mac` | `string` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`mac`](ProtectDeviceBaseInterface.md#mac) |
| <a id="marketname"></a> `marketName` | `string` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`marketName`](ProtectDeviceBaseInterface.md#marketname) |
| <a id="micvolume"></a> `micVolume` | `number` | - | - |
| <a id="minfirmwareversion"></a> `minFirmwareVersion` | `string` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`minFirmwareVersion`](ProtectDeviceBaseInterface.md#minfirmwareversion) |
| <a id="modelkey"></a> `modelKey` | `"camera"` | - | - |
| <a id="motionzones"></a> `motionZones` | [`ProtectSmartZoneInterface`](ProtectSmartZoneInterface.md)[] | - | - |
| <a id="name"></a> `name?` | `string` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`name`](ProtectDeviceBaseInterface.md#name) |
| <a id="needupdatebeforeadoption"></a> `needUpdateBeforeAdoption` | `boolean` | - | - |
| <a id="nfcsettings"></a> `nfcSettings` | \{ `enableNfc`: `boolean`; `supportThirdPartyCard`: `boolean`; \} | - | - |
| `nfcSettings.enableNfc` | `boolean` | - | - |
| `nfcSettings.supportThirdPartyCard` | `boolean` | - | - |
| <a id="nfcstate"></a> `nfcState` | \{ `cardId`: `string`; `isUACard`: `boolean`; `lastSeen`: `number`; `mode`: `string`; \} | - | - |
| `nfcState.cardId` | `string` | - | - |
| `nfcState.isUACard` | `boolean` | - | - |
| `nfcState.lastSeen` | `number` | - | - |
| `nfcState.mode` | `string` | - | - |
| <a id="nvrmac"></a> `nvrMac` | `string` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`nvrMac`](ProtectDeviceBaseInterface.md#nvrmac) |
| <a id="optimizeirsettings"></a> `optimizeIrSettings` | \{ `irZones`: `ProtectKnownJsonValue`[]; `mode`: `string`; \} | - | - |
| `optimizeIrSettings.irZones` | `ProtectKnownJsonValue`[] | - | - |
| `optimizeIrSettings.mode` | `string` | - | - |
| <a id="osdsettings"></a> `osdSettings` | \{ `isDateEnabled`: `boolean`; `isDebugEnabled`: `boolean`; `isLogoEnabled`: `boolean`; `isNameEnabled`: `boolean`; `overlayLocation`: `string`; \} | - | - |
| `osdSettings.isDateEnabled` | `boolean` | - | - |
| `osdSettings.isDebugEnabled` | `boolean` | - | - |
| `osdSettings.isLogoEnabled` | `boolean` | - | - |
| `osdSettings.isNameEnabled` | `boolean` | - | - |
| `osdSettings.overlayLocation` | `string` | - | - |
| <a id="parentcameragroupid"></a> `parentCameraGroupId` | `Nullable`\<`string`\> | - | - |
| <a id="phyrate"></a> `phyRate` | `number` | - | - |
| <a id="pincodesettings"></a> `pinCodeSettings` | \{ `pinCodeLengthRange`: `string`; `pinCodeShuffle`: `boolean`; \} | - | - |
| `pinCodeSettings.pinCodeLengthRange` | `string` | - | - |
| `pinCodeSettings.pinCodeShuffle` | `boolean` | - | - |
| <a id="platform"></a> `platform?` | `Nullable`\<`string`\> | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`platform`](ProtectDeviceBaseInterface.md#platform) |
| <a id="previousfirmwareurl"></a> `previousFirmwareUrl` | `Nullable`\<`string`\> | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`previousFirmwareUrl`](ProtectDeviceBaseInterface.md#previousfirmwareurl) |
| <a id="previousfirmwareversion"></a> `previousFirmwareVersion` | `Nullable`\<`string`\> | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`previousFirmwareVersion`](ProtectDeviceBaseInterface.md#previousfirmwareversion) |
| <a id="privacyzones"></a> `privacyZones` | `ProtectKnownJsonValue`[] | - | - |
| <a id="ptz"></a> `ptz` | \{ `pauseAutoTrackingUntilTs`: `Nullable`\<`number`\>; `recentAutoHomeReturnAt`: `Nullable`\<`number`\>; `recentMoveAutoTrackResumeAtTs`: `Nullable`\<`number`\>; `returnHomeAfterInactivityMs`: `Nullable`\<`number`\>; \} | - | - |
| `ptz.pauseAutoTrackingUntilTs` | `Nullable`\<`number`\> | - | - |
| `ptz.recentAutoHomeReturnAt` | `Nullable`\<`number`\> | - | - |
| `ptz.recentMoveAutoTrackResumeAtTs` | `Nullable`\<`number`\> | - | - |
| `ptz.returnHomeAfterInactivityMs` | `Nullable`\<`number`\> | - | - |
| <a id="ptzcontrolenabled"></a> `ptzControlEnabled` | `boolean` | - | - |
| <a id="readersettings"></a> `readerSettings` | \{ `allowThirdPartyNfcCards`: `boolean`; `doorEntryMethod`: `string`; `doorId`: `Nullable`\<`string`\>; `doorName`: `Nullable`\<`string`\>; `language`: `string`; `screenOffTimeout`: `string`; `unlockDuration`: `number`; \} | - | - |
| `readerSettings.allowThirdPartyNfcCards` | `boolean` | - | - |
| `readerSettings.doorEntryMethod` | `string` | - | - |
| `readerSettings.doorId` | `Nullable`\<`string`\> | - | - |
| `readerSettings.doorName` | `Nullable`\<`string`\> | - | - |
| `readerSettings.language` | `string` | - | - |
| `readerSettings.screenOffTimeout` | `string` | - | - |
| `readerSettings.unlockDuration` | `number` | - | - |
| <a id="receivergroups"></a> `receiverGroups` | `ProtectKnownJsonValue`[] | - | - |
| <a id="recordingpath"></a> `recordingPath` | `Nullable`\<`string`\> | - | - |
| <a id="recordingpathfailedat"></a> `recordingPathFailedAt` | `Nullable`\<`number`\> | - | - |
| <a id="recordingpathsettings"></a> `recordingPathSettings` | [`ProtectCameraRecordingPathSettingsInterface`](ProtectCameraRecordingPathSettingsInterface.md) | - | - |
| <a id="recordingschedulesv2"></a> `recordingSchedulesV2` | `ProtectKnownJsonValue`[] | - | - |
| <a id="recordingsettings"></a> `recordingSettings` | \{ `accessEventPostPaddingSecs`: `number`; `accessEventPrePaddingSecs`: `number`; `createAccessEvent`: `boolean`; `enableMotionDetection`: `boolean`; `endMotionEventDelay`: `number`; `geofencing`: `string`; `inScheduleMode`: `string`; `minMotionEventTrigger`: `number`; `mode`: `string`; `motionAlgorithm`: `string`; `outScheduleMode`: `string`; `postPaddingSecs`: `number`; `prePaddingSecs`: `number`; `recordAudio`: `boolean`; `recordVideo`: `boolean`; `retentionDurationLQMs`: `Nullable`\<`number`\>; `retentionDurationMs`: `Nullable`\<`number`\>; `smartDetectPostPaddingSecs`: `number`; `smartDetectPrePaddingSecs`: `number`; `suppressIlluminationSurge`: `boolean`; `useNewMotionAlgorithm`: `boolean`; \} | - | - |
| `recordingSettings.accessEventPostPaddingSecs` | `number` | - | - |
| `recordingSettings.accessEventPrePaddingSecs` | `number` | - | - |
| `recordingSettings.createAccessEvent` | `boolean` | - | - |
| `recordingSettings.enableMotionDetection` | `boolean` | - | - |
| `recordingSettings.endMotionEventDelay` | `number` | - | - |
| `recordingSettings.geofencing` | `string` | - | - |
| `recordingSettings.inScheduleMode` | `string` | - | - |
| `recordingSettings.minMotionEventTrigger` | `number` | - | - |
| `recordingSettings.mode` | `string` | - | - |
| `recordingSettings.motionAlgorithm` | `string` | - | - |
| `recordingSettings.outScheduleMode` | `string` | - | - |
| `recordingSettings.postPaddingSecs` | `number` | - | - |
| `recordingSettings.prePaddingSecs` | `number` | - | - |
| `recordingSettings.recordAudio` | `boolean` | - | - |
| `recordingSettings.recordVideo` | `boolean` | - | - |
| `recordingSettings.retentionDurationLQMs` | `Nullable`\<`number`\> | - | - |
| `recordingSettings.retentionDurationMs` | `Nullable`\<`number`\> | - | - |
| `recordingSettings.smartDetectPostPaddingSecs` | `number` | - | - |
| `recordingSettings.smartDetectPrePaddingSecs` | `number` | - | - |
| `recordingSettings.suppressIlluminationSurge` | `boolean` | - | - |
| `recordingSettings.useNewMotionAlgorithm` | `boolean` | - | - |
| <a id="recordingspausedreason"></a> `recordingsPausedReason` | `Nullable`\<`string`\> | - | - |
| <a id="releasenotepath"></a> `releaseNotePath` | `Nullable`\<`string`\> | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`releaseNotePath`](ProtectDeviceBaseInterface.md#releasenotepath) |
| <a id="rtspclient"></a> `rtspClient` | `Nullable`\<`ProtectKnownJsonValue`\> | - | - |
| <a id="secondlenssmartdetectzones"></a> `secondLensSmartDetectZones` | `ProtectKnownJsonValue`[] | - | - |
| <a id="shortcuts"></a> `shortcuts` | `ProtectKnownJsonValue`[] | - | - |
| <a id="skipcameraupdatedecallistener"></a> `skipCameraUpdateDecalListener` | `boolean` | - | - |
| <a id="smartdetectlines"></a> `smartDetectLines` | `ProtectKnownJsonValue`[] | - | - |
| <a id="smartdetectloiterzones"></a> `smartDetectLoiterZones` | [`ProtectSmartZoneInterface`](ProtectSmartZoneInterface.md) & \{ `loiterTriggers`: \{ `loiterTriggerTime`: `number`; `objectType`: `string`; \}[]; `triggerAccessTypes`: `string`[]; \}[] | - | - |
| <a id="smartdetectsettings"></a> `smartDetectSettings` | \{ `audioTypes`: `string`[]; `autoTrackingObjectTypes`: `string`[]; `autoTrackingTimeoutSec`: `number`; `autoTrackingWithZoom`: `boolean`; `detectionRange`: \{ `max`: `Nullable`\<`number`\>; `min`: `Nullable`\<`number`\>; \}; `enableTamperDetection`: `boolean`; `objectTypes`: `string`[]; \} | - | - |
| `smartDetectSettings.audioTypes` | `string`[] | - | - |
| `smartDetectSettings.autoTrackingObjectTypes` | `string`[] | - | - |
| `smartDetectSettings.autoTrackingTimeoutSec` | `number` | - | - |
| `smartDetectSettings.autoTrackingWithZoom` | `boolean` | - | - |
| `smartDetectSettings.detectionRange` | \{ `max`: `Nullable`\<`number`\>; `min`: `Nullable`\<`number`\>; \} | - | - |
| `smartDetectSettings.detectionRange.max` | `Nullable`\<`number`\> | - | - |
| `smartDetectSettings.detectionRange.min` | `Nullable`\<`number`\> | - | - |
| `smartDetectSettings.enableTamperDetection` | `boolean` | - | - |
| `smartDetectSettings.objectTypes` | `string`[] | - | - |
| <a id="smartdetectzones"></a> `smartDetectZones` | [`ProtectSmartZoneInterface`](ProtectSmartZoneInterface.md) & \{ `objectTypes`: `string`[]; \}[] | - | - |
| <a id="speakersettings"></a> `speakerSettings` | \{ `areSystemSoundsEnabled`: `boolean`; `isEnabled`: `boolean`; `repeatTimes`: `number`; `ringtoneId`: `Nullable`\<`string`\>; `ringVolume`: `number`; `speakerVolume`: `number`; `volume`: `number`; \} | - | - |
| `speakerSettings.areSystemSoundsEnabled` | `boolean` | - | - |
| `speakerSettings.isEnabled` | `boolean` | - | - |
| `speakerSettings.repeatTimes` | `number` | - | - |
| `speakerSettings.ringtoneId` | `Nullable`\<`string`\> | - | - |
| `speakerSettings.ringVolume` | `number` | - | - |
| `speakerSettings.speakerVolume` | `number` | - | - |
| `speakerSettings.volume` | `number` | - | - |
| <a id="state"></a> `state` | `string` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`state`](ProtectDeviceBaseInterface.md#state) |
| <a id="stats"></a> `stats` | \{ `edgeRecording`: \{ `deviceMac`: `Nullable`\<`string`\>; `recordMode`: `string`; `recordStreamNumber`: `Nullable`\<`number`\>; \}; `sdCard`: \{ `health`: `Nullable`\<`string`\>; `healthStatus`: `string`; `hotPlugCapable`: `Nullable`\<`boolean`\>; `mounts`: `ProtectKnownJsonValue`[]; `sdRecordingSupported`: `Nullable`\<`boolean`\>; `serial`: `Nullable`\<`string`\>; `size`: `Nullable`\<`number`\>; `slotId`: `string`; `slotIdx`: `Nullable`\<`number`\>; `state`: `string`; `type`: `Nullable`\<`string`\>; `usedSize`: `number`; \}; `sdCardStorageCapacityMs`: `Nullable`\<`number`\>; `storage`: \{ `rate`: `number`; `used`: `number`; \}; `storageSlots`: `ProtectKnownJsonValue`[]; `totalStorageCapacityMs`: `Nullable`\<`number`\>; `video`: \{ `recordingEnd`: `number`; `recordingEndLQ`: `number`; `recordingStart`: `number`; `recordingStartLQ`: `number`; `timelapseEnd`: `number`; `timelapseEndLQ`: `number`; `timelapseStart`: `number`; `timelapseStartLQ`: `number`; \}; `wifi`: \{ `channel`: `Nullable`\<`number`\>; `frequency`: `Nullable`\<`number`\>; `linkSpeedMbps`: `Nullable`\<`number`\>; `signalQuality`: `number`; `signalStrength`: `number`; \}; `wifiQuality`: `number`; `wifiStrength`: `number`; \} | - | - |
| `stats.edgeRecording` | \{ `deviceMac`: `Nullable`\<`string`\>; `recordMode`: `string`; `recordStreamNumber`: `Nullable`\<`number`\>; \} | - | - |
| `stats.edgeRecording.deviceMac` | `Nullable`\<`string`\> | - | - |
| `stats.edgeRecording.recordMode` | `string` | - | - |
| `stats.edgeRecording.recordStreamNumber` | `Nullable`\<`number`\> | - | - |
| `stats.sdCard` | \{ `health`: `Nullable`\<`string`\>; `healthStatus`: `string`; `hotPlugCapable`: `Nullable`\<`boolean`\>; `mounts`: `ProtectKnownJsonValue`[]; `sdRecordingSupported`: `Nullable`\<`boolean`\>; `serial`: `Nullable`\<`string`\>; `size`: `Nullable`\<`number`\>; `slotId`: `string`; `slotIdx`: `Nullable`\<`number`\>; `state`: `string`; `type`: `Nullable`\<`string`\>; `usedSize`: `number`; \} | - | - |
| `stats.sdCard.health` | `Nullable`\<`string`\> | - | - |
| `stats.sdCard.healthStatus` | `string` | - | - |
| `stats.sdCard.hotPlugCapable` | `Nullable`\<`boolean`\> | - | - |
| `stats.sdCard.mounts` | `ProtectKnownJsonValue`[] | - | - |
| `stats.sdCard.sdRecordingSupported` | `Nullable`\<`boolean`\> | - | - |
| `stats.sdCard.serial` | `Nullable`\<`string`\> | - | - |
| `stats.sdCard.size` | `Nullable`\<`number`\> | - | - |
| `stats.sdCard.slotId` | `string` | - | - |
| `stats.sdCard.slotIdx` | `Nullable`\<`number`\> | - | - |
| `stats.sdCard.state` | `string` | - | - |
| `stats.sdCard.type` | `Nullable`\<`string`\> | - | - |
| `stats.sdCard.usedSize` | `number` | - | - |
| `stats.sdCardStorageCapacityMs` | `Nullable`\<`number`\> | - | - |
| `stats.storage` | \{ `rate`: `number`; `used`: `number`; \} | - | - |
| `stats.storage.rate` | `number` | - | - |
| `stats.storage.used` | `number` | - | - |
| `stats.storageSlots` | `ProtectKnownJsonValue`[] | - | - |
| `stats.totalStorageCapacityMs` | `Nullable`\<`number`\> | - | - |
| `stats.video` | \{ `recordingEnd`: `number`; `recordingEndLQ`: `number`; `recordingStart`: `number`; `recordingStartLQ`: `number`; `timelapseEnd`: `number`; `timelapseEndLQ`: `number`; `timelapseStart`: `number`; `timelapseStartLQ`: `number`; \} | - | - |
| `stats.video.recordingEnd` | `number` | - | - |
| `stats.video.recordingEndLQ` | `number` | - | - |
| `stats.video.recordingStart` | `number` | - | - |
| `stats.video.recordingStartLQ` | `number` | - | - |
| `stats.video.timelapseEnd` | `number` | - | - |
| `stats.video.timelapseEndLQ` | `number` | - | - |
| `stats.video.timelapseStart` | `number` | - | - |
| `stats.video.timelapseStartLQ` | `number` | - | - |
| `stats.wifi` | \{ `channel`: `Nullable`\<`number`\>; `frequency`: `Nullable`\<`number`\>; `linkSpeedMbps`: `Nullable`\<`number`\>; `signalQuality`: `number`; `signalStrength`: `number`; \} | - | - |
| `stats.wifi.channel` | `Nullable`\<`number`\> | - | - |
| `stats.wifi.frequency` | `Nullable`\<`number`\> | - | - |
| `stats.wifi.linkSpeedMbps` | `Nullable`\<`number`\> | - | - |
| `stats.wifi.signalQuality` | `number` | - | - |
| `stats.wifi.signalStrength` | `number` | - | - |
| `stats.wifiQuality` | `number` | - | - |
| `stats.wifiStrength` | `number` | - | - |
| <a id="stitchdistance"></a> `stitchDistance` | `Nullable`\<`number`\> | - | - |
| <a id="stopstreamlevel"></a> `stopStreamLevel` | `Nullable`\<`number`\> | - | - |
| <a id="streamingchannels"></a> `streamingChannels` | `ProtectKnownJsonValue`[] | - | - |
| <a id="streamsharing"></a> `streamSharing` | \{ `enabled`: `boolean`; `expires`: `Nullable`\<`number`\>; `maxStreams`: `Nullable`\<`number`\>; `sharedByUser`: `Nullable`\<`string`\>; `sharedByUserId`: `Nullable`\<`string`\>; `shareLink`: `Nullable`\<`string`\>; `token`: `Nullable`\<`string`\>; \} | - | - |
| `streamSharing.enabled` | `boolean` | - | - |
| `streamSharing.expires` | `Nullable`\<`number`\> | - | - |
| `streamSharing.maxStreams` | `Nullable`\<`number`\> | - | - |
| `streamSharing.sharedByUser` | `Nullable`\<`string`\> | - | - |
| `streamSharing.sharedByUserId` | `Nullable`\<`string`\> | - | - |
| `streamSharing.shareLink` | `Nullable`\<`string`\> | - | - |
| `streamSharing.token` | `Nullable`\<`string`\> | - | - |
| <a id="supportaiportresolution"></a> `supportAiPortResolution` | `boolean` | - | - |
| <a id="supportaiportresolutioninhallway"></a> `supportAiPortResolutionInHallway` | `boolean` | - | - |
| <a id="supportedscalingresolutions"></a> `supportedScalingResolutions` | `string`[] | - | - |
| <a id="supportfilecreatedat"></a> `supportFileCreatedAt` | `Nullable`\<`number`\> | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`supportFileCreatedAt`](ProtectDeviceBaseInterface.md#supportfilecreatedat) |
| <a id="supportfilename"></a> `supportFileName` | `Nullable`\<`string`\> | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`supportFileName`](ProtectDeviceBaseInterface.md#supportfilename) |
| <a id="supportfilestate"></a> `supportFileState` | `Nullable`\<`string`\> | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`supportFileState`](ProtectDeviceBaseInterface.md#supportfilestate) |
| <a id="supportucp4"></a> `supportUcp4` | `boolean` | - | - |
| <a id="sysid"></a> `sysid` | `Nullable`\<`string`\> | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`sysid`](ProtectDeviceBaseInterface.md#sysid) |
| <a id="talkbacksettings"></a> `talkbackSettings` | [`ProtectCameraTalkbackConfigInterface`](ProtectCameraTalkbackConfigInterface.md) | - | - |
| <a id="template"></a> `template` | `Nullable`\<`ProtectKnownJsonValue`\> | - | - |
| <a id="thirdpartycamerainfo"></a> `thirdPartyCameraInfo` | \{ `enableRtspAudio`: `Nullable`\<`boolean`\>; `errors`: `ProtectKnownJsonValue`[]; `forceTcp`: `Nullable`\<`boolean`\>; `hasAudio`: `Nullable`\<`boolean`\>; `port`: `number`; `rtspUrl`: `string`; `rtspUrlLQ`: `string`; `snapshotUrl`: `string`; \} | - | - |
| `thirdPartyCameraInfo.enableRtspAudio` | `Nullable`\<`boolean`\> | - | - |
| `thirdPartyCameraInfo.errors` | `ProtectKnownJsonValue`[] | - | - |
| `thirdPartyCameraInfo.forceTcp` | `Nullable`\<`boolean`\> | - | - |
| `thirdPartyCameraInfo.hasAudio` | `Nullable`\<`boolean`\> | - | - |
| `thirdPartyCameraInfo.port` | `number` | - | - |
| `thirdPartyCameraInfo.rtspUrl` | `string` | - | - |
| `thirdPartyCameraInfo.rtspUrlLQ` | `string` | - | - |
| `thirdPartyCameraInfo.snapshotUrl` | `string` | - | - |
| <a id="tiltlimitsofprivacyzones"></a> `tiltLimitsOfPrivacyZones` | \{ `limit`: `number`; `side`: `string`; \} | - | - |
| `tiltLimitsOfPrivacyZones.limit` | `number` | - | - |
| `tiltLimitsOfPrivacyZones.side` | `string` | - | - |
| <a id="type"></a> `type` | `string` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`type`](ProtectDeviceBaseInterface.md#type) |
| <a id="uplinkdevice"></a> `uplinkDevice` | `Nullable`\<`string`\> | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`uplinkDevice`](ProtectDeviceBaseInterface.md#uplinkdevice) |
| <a id="upsince"></a> `upSince` | `number` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`upSince`](ProtectDeviceBaseInterface.md#upsince) |
| <a id="uptime"></a> `uptime` | `number` | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`uptime`](ProtectDeviceBaseInterface.md#uptime) |
| <a id="userconfiguredap"></a> `userConfiguredAp` | `boolean` | - | - |
| <a id="videocodec"></a> `videoCodec` | `string` | - | - |
| <a id="videocodeclastswitchat"></a> `videoCodecLastSwitchAt` | `Nullable`\<`number`\> | - | - |
| <a id="videocodecstate"></a> `videoCodecState` | `number` | - | - |
| <a id="videocodecswitchingsince"></a> `videoCodecSwitchingSince` | `number` | - | - |
| <a id="videoinputmode"></a> `videoInputMode` | `Nullable`\<`string`\> | - | - |
| <a id="videomode"></a> `videoMode` | `string` | - | - |
| <a id="videoreconfigurationinprogress"></a> `videoReconfigurationInProgress` | `boolean` | - | - |
| <a id="voltage"></a> `voltage` | `number` | - | - |
| <a id="wificonnectionstate"></a> `wifiConnectionState` | [`ProtectWifiConnectionStateInterface`](ProtectWifiConnectionStateInterface.md) | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`wifiConnectionState`](ProtectDeviceBaseInterface.md#wificonnectionstate) |
| <a id="wiredconnectionstate"></a> `wiredConnectionState` | [`ProtectWiredConnectionStateInterface`](ProtectWiredConnectionStateInterface.md) | - | [`ProtectDeviceBaseInterface`](ProtectDeviceBaseInterface.md).[`wiredConnectionState`](ProtectDeviceBaseInterface.md#wiredconnectionstate) |
