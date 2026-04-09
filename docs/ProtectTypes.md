[**unifi-protect**](README.md)

***

[Home](README.md) / ProtectTypes

# ProtectTypes

A semi-complete description of all the object types used by the UniFi Protect API.

The UniFi Protect API is largely undocumented - these interfaces and types have been gleaned through a lot of experimentation and observation. Protect is always
evolving and I will attempt to keep up with the changes over time.

Each device has an **Interface** (the full definition with all properties) and a **Config** type alias (for reads). For PATCH/update payloads, consumers use
`DeepPartial<...Config>` directly. All device interfaces include `[key: string]: ProtectKnownJsonValue` index signatures so that untyped API fields are accessible
without casting. Common device properties are inherited from `ProtectDeviceBaseInterface`.

## Interfaces

### ProtectAirQualityMetricInterface

A description of a single air quality metric reading from a UniFi Protect sensor.

#### Indexable

```ts
[key: string]: ProtectKnownJsonValue
```

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="status"></a> `status` | `string` |
| <a id="value"></a> `value` | `Nullable`\<`number`\> |

***

### ProtectAirQualityThresholdSettingsInterface

A description of threshold settings for a single air quality metric on a UniFi Protect sensor.

#### Indexable

```ts
[key: string]: ProtectKnownJsonValue
```

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="highthreshold"></a> `highThreshold` | `Nullable`\<`number`\> |
| <a id="isenabled"></a> `isEnabled` | `boolean` |
| <a id="lowthreshold"></a> `lowThreshold` | `Nullable`\<`number`\> |

***

### ProtectCameraChannelConfigInterface

A semi-complete description of the UniFi Protect camera channel JSON.

#### Indexable

```ts
[key: string]: ProtectKnownJsonValue
```

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
| <a id="internalrtspalias"></a> `internalRtspAlias` | `Nullable`\<`string`\> |
| <a id="isinternalrtspenabled"></a> `isInternalRtspEnabled` | `boolean` |
| <a id="isrtspenabled"></a> `isRtspEnabled` | `boolean` |
| <a id="maxbitrate"></a> `maxBitrate` | `number` |
| <a id="minbitrate"></a> `minBitrate` | `number` |
| <a id="minclientadaptivebitrate"></a> `minClientAdaptiveBitRate` | `number` |
| <a id="minmotionadaptivebitrate"></a> `minMotionAdaptiveBitRate` | `number` |
| <a id="name"></a> `name` | `string` |
| <a id="rtspalias"></a> `rtspAlias` | `string` |
| <a id="validbitraterangemargin"></a> `validBitrateRangeMargin` | `Nullable`\<`number`\> |
| <a id="videoid"></a> `videoId` | `string` |
| <a id="width"></a> `width` | `number` |

***

### ProtectCameraConfigInterface

A semi-complete description of the UniFi Protect camera JSON.

#### Extends

- [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface)

#### Indexable

```ts
[key: string]: ProtectKnownJsonValue
```

#### Properties

| Property | Type | Inherited from |
| ------ | ------ | ------ |
| <a id="accessdevicemetadata"></a> `accessDeviceMetadata?` | \{ `channels`: \{ `bitrate`: `number`; `fps`: `number`; `fpsValues`: `number`[]; `height`: `number`; `id`: `number`; `localStreamName`: `string`; `quality`: `string`; `width`: `number`; \}[]; `connectedSince`: `number`; `disableRecordingByDefault`: `boolean`; `doorInfo`: \{ `canLock`: `boolean`; `lockState`: `string`; \}; `featureFlags`: \{ `supportLivestream`: `boolean`; `supportMicManagement`: `boolean`; `supportUnlock`: `boolean`; \}; `ledSettings`: \{ `isEnabled`: `boolean`; \}; `micVolume`: `number`; `pairedInfo`: \{ `guid`: `Nullable`\<`string`\>; `name`: `string`; `uri`: `string`; \}; `speakerSettings`: \{ `areSystemSoundsEnabled`: `boolean`; \}; `talkbackSettings`: [`ProtectCameraTalkbackConfigInterface`](#protectcameratalkbackconfiginterface)[]; \} | - |
| `accessDeviceMetadata.channels` | \{ `bitrate`: `number`; `fps`: `number`; `fpsValues`: `number`[]; `height`: `number`; `id`: `number`; `localStreamName`: `string`; `quality`: `string`; `width`: `number`; \}[] | - |
| `accessDeviceMetadata.connectedSince` | `number` | - |
| `accessDeviceMetadata.disableRecordingByDefault` | `boolean` | - |
| `accessDeviceMetadata.doorInfo` | \{ `canLock`: `boolean`; `lockState`: `string`; \} | - |
| `accessDeviceMetadata.doorInfo.canLock` | `boolean` | - |
| `accessDeviceMetadata.doorInfo.lockState` | `string` | - |
| `accessDeviceMetadata.featureFlags` | \{ `supportLivestream`: `boolean`; `supportMicManagement`: `boolean`; `supportUnlock`: `boolean`; \} | - |
| `accessDeviceMetadata.featureFlags.supportLivestream` | `boolean` | - |
| `accessDeviceMetadata.featureFlags.supportMicManagement` | `boolean` | - |
| `accessDeviceMetadata.featureFlags.supportUnlock` | `boolean` | - |
| `accessDeviceMetadata.ledSettings` | \{ `isEnabled`: `boolean`; \} | - |
| `accessDeviceMetadata.ledSettings.isEnabled` | `boolean` | - |
| `accessDeviceMetadata.micVolume` | `number` | - |
| `accessDeviceMetadata.pairedInfo` | \{ `guid`: `Nullable`\<`string`\>; `name`: `string`; `uri`: `string`; \} | - |
| `accessDeviceMetadata.pairedInfo.guid` | `Nullable`\<`string`\> | - |
| `accessDeviceMetadata.pairedInfo.name` | `string` | - |
| `accessDeviceMetadata.pairedInfo.uri` | `string` | - |
| `accessDeviceMetadata.speakerSettings` | \{ `areSystemSoundsEnabled`: `boolean`; \} | - |
| `accessDeviceMetadata.speakerSettings.areSystemSoundsEnabled` | `boolean` | - |
| `accessDeviceMetadata.talkbackSettings` | [`ProtectCameraTalkbackConfigInterface`](#protectcameratalkbackconfiginterface)[] | - |
| <a id="accessmethodsettings"></a> `accessMethodSettings` | \{ `methods`: `string`[]; \} | - |
| `accessMethodSettings.methods` | `string`[] | - |
| <a id="activepatrolslot"></a> `activePatrolSlot` | `Nullable`\<`string`\> | - |
| <a id="aiportcapacitypoints"></a> `aiPortCapacityPoints` | `number` | - |
| <a id="aiportcompatibleresolutions"></a> `aiPortCompatibleResolutions` | `string`[] | - |
| <a id="aiportcompatibleresolutionsinhallway"></a> `aiPortCompatibleResolutionsInHallway` | `string`[] | - |
| <a id="alarms"></a> `alarms` | \{ `autoTrackingThermalThresholdReached`: `boolean`; `lensThermal`: `number`; `lensThermalThresholdReached`: `boolean`; `motorOverheated`: `boolean`; `panTiltMotorFaults`: `string`[]; `tiltThermal`: `number`; \} | - |
| `alarms.autoTrackingThermalThresholdReached` | `boolean` | - |
| `alarms.lensThermal` | `number` | - |
| `alarms.lensThermalThresholdReached` | `boolean` | - |
| `alarms.motorOverheated` | `boolean` | - |
| `alarms.panTiltMotorFaults` | `string`[] | - |
| `alarms.tiltThermal` | `number` | - |
| <a id="anonymousdeviceid"></a> `anonymousDeviceId` | `Nullable`\<`string`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`anonymousDeviceId`](#anonymousdeviceid-2) |
| <a id="apmac"></a> `apMac` | `string` | - |
| <a id="apmgmtip"></a> `apMgmtIp` | `Nullable`\<`string`\> | - |
| <a id="aprssi"></a> `apRssi` | `string` | - |
| <a id="audiobitrate"></a> `audioBitrate` | `number` | - |
| <a id="audiosettings"></a> `audioSettings` | \{ `style`: `string`[]; \} | - |
| `audioSettings.style` | `string`[] | - |
| <a id="autoretentionlqms"></a> `autoRetentionLqMs` | `Nullable`\<`number`\> | - |
| <a id="autoretentionms"></a> `autoRetentionMs` | `Nullable`\<`number`\> | - |
| <a id="brightnesssettings"></a> `brightnessSettings` | \{ `autoBrightness`: `boolean`; `brightness`: `number`; \} | - |
| `brightnessSettings.autoBrightness` | `boolean` | - |
| `brightnessSettings.brightness` | `number` | - |
| <a id="canadopt"></a> `canAdopt` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`canAdopt`](#canadopt-2) |
| <a id="cancreateaccessevent"></a> `canCreateAccessEvent` | `boolean` | - |
| <a id="canmanage"></a> `canManage` | `boolean` | - |
| <a id="channels"></a> `channels` | [`ProtectCameraChannelConfigInterface`](#protectcamerachannelconfiginterface)[] | - |
| <a id="chimeduration"></a> `chimeDuration` | `number` | - |
| <a id="clarityzones"></a> `clarityZones` | `ProtectKnownJsonValue`[] | - |
| <a id="connectedsince"></a> `connectedSince` | `number` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`connectedSince`](#connectedsince-2) |
| <a id="connectionhost"></a> `connectionHost` | `Nullable`\<`string`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`connectionHost`](#connectionhost-2) |
| <a id="currentresolution"></a> `currentResolution` | `string` | - |
| <a id="displayname"></a> `displayName` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`displayName`](#displayname-2) |
| <a id="doorbellsession"></a> `doorbellSession` | \{ `sessionId`: `Nullable`\<`string`\>; `status`: `Nullable`\<`string`\>; \} | - |
| `doorbellSession.sessionId` | `Nullable`\<`string`\> | - |
| `doorbellSession.status` | `Nullable`\<`string`\> | - |
| <a id="downscalemode"></a> `downScaleMode` | `number` | - |
| <a id="elementinfo"></a> `elementInfo` | `null` | - |
| <a id="enablenfc"></a> `enableNfc` | `boolean` | - |
| <a id="excludezones"></a> `excludeZones` | `ProtectKnownJsonValue`[] | - |
| <a id="extendedaifeatures"></a> `extendedAiFeatures` | \{ `smartDetectTypes`: `string`[]; \} | - |
| `extendedAiFeatures.smartDetectTypes` | `string`[] | - |
| <a id="faceunlocksettings"></a> `faceUnlockSettings` | \{ `faceDetectionSensitive`: `string`; `lastUpdateTime`: `number`; `licenseConfigured`: `boolean`; \} | - |
| `faceUnlockSettings.faceDetectionSensitive` | `string` | - |
| `faceUnlockSettings.lastUpdateTime` | `number` | - |
| `faceUnlockSettings.licenseConfigured` | `boolean` | - |
| <a id="featureflags"></a> `featureFlags` | \{ `audio`: `string`[]; `audioCodecs`: `string`[]; `audioStyle`: `string`[]; `canAdjustIrLedLevel`: `boolean`; `canAdjustIspSettings`: `boolean`; `canAdjustSpeakerVolume`: `boolean`; `canMagicZoom`: `boolean`; `canOpticalZoom`: `boolean`; `canTouchFocus`: `boolean`; `clarityZones`: `Nullable`\<\{ `maxZones`: `number`; `rectangleOnly`: `boolean`; \}\>; `downScaleResolutions`: `number`[][]; `excludeZones`: \{ `maxZones`: `number`; `rectangleOnly`: `boolean`; \}; `flashRange`: `Nullable`\<`number`\>; `focus`: [`ProtectPtzAxisRangeInterface`](#protectptzaxisrangeinterface); `hallwayModeWarningRequired`: `boolean`; `hasAccelerometer`: `boolean`; `hasAec`: `boolean`; `hasAutoICROnly`: `boolean`; `hasBluetooth`: `boolean`; `hasChime`: `boolean`; `hasColorLcdScreen`: `boolean`; `hasEdgeRecording`: `boolean`; `hasExternalIr`: `boolean`; `hasFingerprintSensor`: `boolean`; `hasFisheye`: `boolean`; `hasFlash`: `boolean`; `hasHallwayMode`: `boolean`; `hasHallwayModeHdrOnRequired`: `boolean`; `hasHdr`: `boolean`; `hasHorizontalFlip`: `boolean`; `hasIcrSensitivity`: `boolean`; `hasInfrared`: `boolean`; `hasLcdScreen`: `boolean`; `hasLdc`: `boolean`; `hasLedIr`: `boolean`; `hasLedStatus`: `boolean`; `hasLineCrossing`: `boolean`; `hasLineCrossingCounting`: `boolean`; `hasLineIn`: `boolean`; `hasLiveviewTracking`: `boolean`; `hasLprReflex`: `boolean`; `hasLuxCheck`: `boolean`; `hasManualPersonOfInterest`: `boolean`; `hasMic`: `boolean`; `hasMotionZones`: `boolean`; `hasOptimizeIr`: `boolean`; `hasPackageCamera`: `boolean`; `hasPackageZoneSupportForPrimaryLens`: `boolean`; `hasPackageZoneSupportForSecondaryLens`: `boolean`; `hasPrivacyMask`: `boolean`; `hasRtc`: `boolean`; `hasSdCard`: `boolean`; `hasSmartDetect`: `boolean`; `hasSmartZoom`: `boolean`; `hasSmokeCover`: `boolean`; `hasSpeaker`: `boolean`; `hasSquareEventThumbnail`: `boolean`; `hasTamperDetection`: `boolean`; `hasVerticalFlip`: `boolean`; `hasWdr`: `boolean`; `hasWifi`: `boolean`; `hotplug`: \{ `audio`: `Nullable`\<`string`\>; `extender`: \{ `flashRange`: `Nullable`\<`number`\>; `hasFlash`: `boolean`; `hasIR`: `boolean`; `hasRadar`: `boolean`; `isAttached`: `boolean`; `radarRangeMax`: `Nullable`\<`number`\>; `radarRangeMin`: `Nullable`\<`number`\>; \}; `sdCardAttached`: `boolean`; `standaloneAdoption`: `boolean`; `video`: `Nullable`\<`string`\>; \}; `isDoorbell`: `boolean`; `isPtz`: `boolean`; `lensModel`: `Nullable`\<`string`\>; `lensType`: `Nullable`\<`string`\>; `maxScaleDownLevel`: `number`; `motionAlgorithms`: `string`[]; `mountPositions`: `string`[]; `pan`: [`ProtectPtzAxisRangeInterface`](#protectptzaxisrangeinterface); `presetMinDuration`: `Nullable`\<`number`\>; `presetTour`: `boolean`; `privacyMaskCapability`: \{ `maxMasks`: `number`; `rectangleOnly`: `boolean`; \}; `reader`: \{ `canAdjustBrightness`: `boolean`; `support2fa`: `boolean`; `supportAccessMethods`: `string`[]; `supportAdjustSpeakerVolume`: `boolean`; `supportAudioCodecs`: `string`[]; `supportAutoBrightness`: `boolean`; `supportAutoTurnOffDisplay`: `boolean`; `supportCallerManager`: `boolean`; `supportDoorbellTriggerMethod`: `boolean`; `supportDoorDirection`: `boolean`; `supportFloodLed`: `boolean`; `supportGateStop`: `boolean`; `supportGreetings`: `boolean`; `supportInterfaceDesigner`: `boolean`; `supportInterfaceDirectory`: `boolean`; `supportInterfaceLayout`: `boolean`; `supportLocate`: `boolean`; `supportManualDownloadSupportFile`: `boolean`; `supportManualFirmwareUpdate`: `boolean`; `supportMic`: `boolean`; `supportShowHeading`: `boolean`; `supportShowInterfaceImage`: `boolean`; `supportShowStatusBar`: `boolean`; `supportShowUnlockSchedule`: `boolean`; `supportSpeaker`: `boolean`; `supportSsh`: `boolean`; `supportStatusLed`: `boolean`; `supportStreamEncryption`: `boolean`; `supportTwilioSip`: `boolean`; `supportWelcomeLed`: `boolean`; \}; `smartDetectAudioTypes`: `string`[]; `smartDetectTypes`: `string`[]; `stitchDistance`: \{ `support`: `boolean`; \}; `storage`: \{ `sdSlotCount`: `number`; `ssdSlotCount`: `number`; \}; `streamEncryptable`: `boolean`; `supportCustomRingtone`: `boolean`; `supportDoorAccessConfig`: `boolean`; `supportFullHdSnapshot`: `boolean`; `supportLocate`: `boolean`; `supportLpDetectionWithoutVehicle`: `boolean`; `supportMinMotionAdaptiveBitrate`: `boolean`; `supportNfc`: `boolean`; `supportPtzTrackingTimeout`: `boolean`; `tilt`: [`ProtectPtzAxisRangeInterface`](#protectptzaxisrangeinterface); `verticalFlipWarning`: `boolean`; `videoCodecs`: `string`[]; `videoDeviceCount`: `Nullable`\<`number`\>; `videoInputModes`: `string`[]; `videoModeMaxFps`: `number`[]; `videoModes`: `string`[]; `zoom`: [`ProtectPtzAxisRangeInterface`](#protectptzaxisrangeinterface) & \{ `ratio`: `number`; \}; \} | - |
| `featureFlags.audio` | `string`[] | - |
| `featureFlags.audioCodecs` | `string`[] | - |
| `featureFlags.audioStyle` | `string`[] | - |
| `featureFlags.canAdjustIrLedLevel` | `boolean` | - |
| `featureFlags.canAdjustIspSettings` | `boolean` | - |
| `featureFlags.canAdjustSpeakerVolume` | `boolean` | - |
| `featureFlags.canMagicZoom` | `boolean` | - |
| `featureFlags.canOpticalZoom` | `boolean` | - |
| `featureFlags.canTouchFocus` | `boolean` | - |
| `featureFlags.clarityZones` | `Nullable`\<\{ `maxZones`: `number`; `rectangleOnly`: `boolean`; \}\> | - |
| `featureFlags.downScaleResolutions` | `number`[][] | - |
| `featureFlags.excludeZones` | \{ `maxZones`: `number`; `rectangleOnly`: `boolean`; \} | - |
| `featureFlags.excludeZones.maxZones` | `number` | - |
| `featureFlags.excludeZones.rectangleOnly` | `boolean` | - |
| `featureFlags.flashRange` | `Nullable`\<`number`\> | - |
| `featureFlags.focus` | [`ProtectPtzAxisRangeInterface`](#protectptzaxisrangeinterface) | - |
| `featureFlags.hallwayModeWarningRequired` | `boolean` | - |
| `featureFlags.hasAccelerometer` | `boolean` | - |
| `featureFlags.hasAec` | `boolean` | - |
| `featureFlags.hasAutoICROnly` | `boolean` | - |
| `featureFlags.hasBluetooth` | `boolean` | - |
| `featureFlags.hasChime` | `boolean` | - |
| `featureFlags.hasColorLcdScreen` | `boolean` | - |
| `featureFlags.hasEdgeRecording` | `boolean` | - |
| `featureFlags.hasExternalIr` | `boolean` | - |
| `featureFlags.hasFingerprintSensor` | `boolean` | - |
| `featureFlags.hasFisheye` | `boolean` | - |
| `featureFlags.hasFlash` | `boolean` | - |
| `featureFlags.hasHallwayMode` | `boolean` | - |
| `featureFlags.hasHallwayModeHdrOnRequired` | `boolean` | - |
| `featureFlags.hasHdr` | `boolean` | - |
| `featureFlags.hasHorizontalFlip` | `boolean` | - |
| `featureFlags.hasIcrSensitivity` | `boolean` | - |
| `featureFlags.hasInfrared` | `boolean` | - |
| `featureFlags.hasLcdScreen` | `boolean` | - |
| `featureFlags.hasLdc` | `boolean` | - |
| `featureFlags.hasLedIr` | `boolean` | - |
| `featureFlags.hasLedStatus` | `boolean` | - |
| `featureFlags.hasLineCrossing` | `boolean` | - |
| `featureFlags.hasLineCrossingCounting` | `boolean` | - |
| `featureFlags.hasLineIn` | `boolean` | - |
| `featureFlags.hasLiveviewTracking` | `boolean` | - |
| `featureFlags.hasLprReflex` | `boolean` | - |
| `featureFlags.hasLuxCheck` | `boolean` | - |
| `featureFlags.hasManualPersonOfInterest` | `boolean` | - |
| `featureFlags.hasMic` | `boolean` | - |
| `featureFlags.hasMotionZones` | `boolean` | - |
| `featureFlags.hasOptimizeIr` | `boolean` | - |
| `featureFlags.hasPackageCamera` | `boolean` | - |
| `featureFlags.hasPackageZoneSupportForPrimaryLens` | `boolean` | - |
| `featureFlags.hasPackageZoneSupportForSecondaryLens` | `boolean` | - |
| `featureFlags.hasPrivacyMask` | `boolean` | - |
| `featureFlags.hasRtc` | `boolean` | - |
| `featureFlags.hasSdCard` | `boolean` | - |
| `featureFlags.hasSmartDetect` | `boolean` | - |
| `featureFlags.hasSmartZoom` | `boolean` | - |
| `featureFlags.hasSmokeCover` | `boolean` | - |
| `featureFlags.hasSpeaker` | `boolean` | - |
| `featureFlags.hasSquareEventThumbnail` | `boolean` | - |
| `featureFlags.hasTamperDetection` | `boolean` | - |
| `featureFlags.hasVerticalFlip` | `boolean` | - |
| `featureFlags.hasWdr` | `boolean` | - |
| `featureFlags.hasWifi` | `boolean` | - |
| `featureFlags.hotplug` | \{ `audio`: `Nullable`\<`string`\>; `extender`: \{ `flashRange`: `Nullable`\<`number`\>; `hasFlash`: `boolean`; `hasIR`: `boolean`; `hasRadar`: `boolean`; `isAttached`: `boolean`; `radarRangeMax`: `Nullable`\<`number`\>; `radarRangeMin`: `Nullable`\<`number`\>; \}; `sdCardAttached`: `boolean`; `standaloneAdoption`: `boolean`; `video`: `Nullable`\<`string`\>; \} | - |
| `featureFlags.hotplug.audio` | `Nullable`\<`string`\> | - |
| `featureFlags.hotplug.extender` | \{ `flashRange`: `Nullable`\<`number`\>; `hasFlash`: `boolean`; `hasIR`: `boolean`; `hasRadar`: `boolean`; `isAttached`: `boolean`; `radarRangeMax`: `Nullable`\<`number`\>; `radarRangeMin`: `Nullable`\<`number`\>; \} | - |
| `featureFlags.hotplug.extender.flashRange` | `Nullable`\<`number`\> | - |
| `featureFlags.hotplug.extender.hasFlash` | `boolean` | - |
| `featureFlags.hotplug.extender.hasIR` | `boolean` | - |
| `featureFlags.hotplug.extender.hasRadar` | `boolean` | - |
| `featureFlags.hotplug.extender.isAttached` | `boolean` | - |
| `featureFlags.hotplug.extender.radarRangeMax` | `Nullable`\<`number`\> | - |
| `featureFlags.hotplug.extender.radarRangeMin` | `Nullable`\<`number`\> | - |
| `featureFlags.hotplug.sdCardAttached` | `boolean` | - |
| `featureFlags.hotplug.standaloneAdoption` | `boolean` | - |
| `featureFlags.hotplug.video` | `Nullable`\<`string`\> | - |
| `featureFlags.isDoorbell` | `boolean` | - |
| `featureFlags.isPtz` | `boolean` | - |
| `featureFlags.lensModel` | `Nullable`\<`string`\> | - |
| `featureFlags.lensType` | `Nullable`\<`string`\> | - |
| `featureFlags.maxScaleDownLevel` | `number` | - |
| `featureFlags.motionAlgorithms` | `string`[] | - |
| `featureFlags.mountPositions` | `string`[] | - |
| `featureFlags.pan` | [`ProtectPtzAxisRangeInterface`](#protectptzaxisrangeinterface) | - |
| `featureFlags.presetMinDuration` | `Nullable`\<`number`\> | - |
| `featureFlags.presetTour` | `boolean` | - |
| `featureFlags.privacyMaskCapability` | \{ `maxMasks`: `number`; `rectangleOnly`: `boolean`; \} | - |
| `featureFlags.privacyMaskCapability.maxMasks` | `number` | - |
| `featureFlags.privacyMaskCapability.rectangleOnly` | `boolean` | - |
| `featureFlags.reader` | \{ `canAdjustBrightness`: `boolean`; `support2fa`: `boolean`; `supportAccessMethods`: `string`[]; `supportAdjustSpeakerVolume`: `boolean`; `supportAudioCodecs`: `string`[]; `supportAutoBrightness`: `boolean`; `supportAutoTurnOffDisplay`: `boolean`; `supportCallerManager`: `boolean`; `supportDoorbellTriggerMethod`: `boolean`; `supportDoorDirection`: `boolean`; `supportFloodLed`: `boolean`; `supportGateStop`: `boolean`; `supportGreetings`: `boolean`; `supportInterfaceDesigner`: `boolean`; `supportInterfaceDirectory`: `boolean`; `supportInterfaceLayout`: `boolean`; `supportLocate`: `boolean`; `supportManualDownloadSupportFile`: `boolean`; `supportManualFirmwareUpdate`: `boolean`; `supportMic`: `boolean`; `supportShowHeading`: `boolean`; `supportShowInterfaceImage`: `boolean`; `supportShowStatusBar`: `boolean`; `supportShowUnlockSchedule`: `boolean`; `supportSpeaker`: `boolean`; `supportSsh`: `boolean`; `supportStatusLed`: `boolean`; `supportStreamEncryption`: `boolean`; `supportTwilioSip`: `boolean`; `supportWelcomeLed`: `boolean`; \} | - |
| `featureFlags.reader.canAdjustBrightness` | `boolean` | - |
| `featureFlags.reader.support2fa` | `boolean` | - |
| `featureFlags.reader.supportAccessMethods` | `string`[] | - |
| `featureFlags.reader.supportAdjustSpeakerVolume` | `boolean` | - |
| `featureFlags.reader.supportAudioCodecs` | `string`[] | - |
| `featureFlags.reader.supportAutoBrightness` | `boolean` | - |
| `featureFlags.reader.supportAutoTurnOffDisplay` | `boolean` | - |
| `featureFlags.reader.supportCallerManager` | `boolean` | - |
| `featureFlags.reader.supportDoorbellTriggerMethod` | `boolean` | - |
| `featureFlags.reader.supportDoorDirection` | `boolean` | - |
| `featureFlags.reader.supportFloodLed` | `boolean` | - |
| `featureFlags.reader.supportGateStop` | `boolean` | - |
| `featureFlags.reader.supportGreetings` | `boolean` | - |
| `featureFlags.reader.supportInterfaceDesigner` | `boolean` | - |
| `featureFlags.reader.supportInterfaceDirectory` | `boolean` | - |
| `featureFlags.reader.supportInterfaceLayout` | `boolean` | - |
| `featureFlags.reader.supportLocate` | `boolean` | - |
| `featureFlags.reader.supportManualDownloadSupportFile` | `boolean` | - |
| `featureFlags.reader.supportManualFirmwareUpdate` | `boolean` | - |
| `featureFlags.reader.supportMic` | `boolean` | - |
| `featureFlags.reader.supportShowHeading` | `boolean` | - |
| `featureFlags.reader.supportShowInterfaceImage` | `boolean` | - |
| `featureFlags.reader.supportShowStatusBar` | `boolean` | - |
| `featureFlags.reader.supportShowUnlockSchedule` | `boolean` | - |
| `featureFlags.reader.supportSpeaker` | `boolean` | - |
| `featureFlags.reader.supportSsh` | `boolean` | - |
| `featureFlags.reader.supportStatusLed` | `boolean` | - |
| `featureFlags.reader.supportStreamEncryption` | `boolean` | - |
| `featureFlags.reader.supportTwilioSip` | `boolean` | - |
| `featureFlags.reader.supportWelcomeLed` | `boolean` | - |
| `featureFlags.smartDetectAudioTypes` | `string`[] | - |
| `featureFlags.smartDetectTypes` | `string`[] | - |
| `featureFlags.stitchDistance` | \{ `support`: `boolean`; \} | - |
| `featureFlags.stitchDistance.support` | `boolean` | - |
| `featureFlags.storage` | \{ `sdSlotCount`: `number`; `ssdSlotCount`: `number`; \} | - |
| `featureFlags.storage.sdSlotCount` | `number` | - |
| `featureFlags.storage.ssdSlotCount` | `number` | - |
| `featureFlags.streamEncryptable` | `boolean` | - |
| `featureFlags.supportCustomRingtone` | `boolean` | - |
| `featureFlags.supportDoorAccessConfig` | `boolean` | - |
| `featureFlags.supportFullHdSnapshot` | `boolean` | - |
| `featureFlags.supportLocate` | `boolean` | - |
| `featureFlags.supportLpDetectionWithoutVehicle` | `boolean` | - |
| `featureFlags.supportMinMotionAdaptiveBitrate` | `boolean` | - |
| `featureFlags.supportNfc` | `boolean` | - |
| `featureFlags.supportPtzTrackingTimeout` | `boolean` | - |
| `featureFlags.tilt` | [`ProtectPtzAxisRangeInterface`](#protectptzaxisrangeinterface) | - |
| `featureFlags.verticalFlipWarning` | `boolean` | - |
| `featureFlags.videoCodecs` | `string`[] | - |
| `featureFlags.videoDeviceCount` | `Nullable`\<`number`\> | - |
| `featureFlags.videoInputModes` | `string`[] | - |
| `featureFlags.videoModeMaxFps` | `number`[] | - |
| `featureFlags.videoModes` | `string`[] | - |
| `featureFlags.zoom` | [`ProtectPtzAxisRangeInterface`](#protectptzaxisrangeinterface) & \{ `ratio`: `number`; \} | - |
| <a id="fingerprintsettings"></a> `fingerprintSettings` | \{ `enable`: `boolean`; `enablePrintLatency`: `boolean`; `mode`: `string`; `reportCaptureComplete`: `boolean`; `reportFingerTouch`: `boolean`; \} | - |
| `fingerprintSettings.enable` | `boolean` | - |
| `fingerprintSettings.enablePrintLatency` | `boolean` | - |
| `fingerprintSettings.mode` | `string` | - |
| `fingerprintSettings.reportCaptureComplete` | `boolean` | - |
| `fingerprintSettings.reportFingerTouch` | `boolean` | - |
| <a id="fingerprintstate"></a> `fingerprintState` | \{ `fingerprintId`: `string`; `free`: `number`; `progress`: `string`; `status`: `string`; `total`: `number`; \} | - |
| `fingerprintState.fingerprintId` | `string` | - |
| `fingerprintState.free` | `number` | - |
| `fingerprintState.progress` | `string` | - |
| `fingerprintState.status` | `string` | - |
| `fingerprintState.total` | `number` | - |
| <a id="firmwarebuild"></a> `firmwareBuild` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`firmwareBuild`](#firmwarebuild-2) |
| <a id="firmwareversion"></a> `firmwareVersion` | `Nullable`\<`string`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`firmwareVersion`](#firmwareversion-2) |
| <a id="fwupdatestate"></a> `fwUpdateState` | `Nullable`\<`string`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`fwUpdateState`](#fwupdatestate-2) |
| <a id="globalalarmmanagerscopenames"></a> `globalAlarmManagerScopeNames` | `string`[] | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`globalAlarmManagerScopeNames`](#globalalarmmanagerscopenames-2) |
| <a id="greetingsettings"></a> `greetingSettings` | \{ `greetingBroadcastName`: `string`; `greetingText`: `string`; \} | - |
| `greetingSettings.greetingBroadcastName` | `string` | - |
| `greetingSettings.greetingText` | `string` | - |
| <a id="guid"></a> `guid` | `Nullable`\<`string`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`guid`](#guid-2) |
| <a id="hallwaymode"></a> `hallwayMode` | `string` | - |
| <a id="hardwarerevision"></a> `hardwareRevision` | `Nullable`\<`string`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`hardwareRevision`](#hardwarerevision-2) |
| <a id="hasrecordings"></a> `hasRecordings` | `boolean` | - |
| <a id="hasrecordingstarted"></a> `hasRecordingStarted` | `boolean` | - |
| <a id="hasspeaker"></a> `hasSpeaker` | `boolean` | - |
| <a id="haswifi"></a> `hasWifi` | `boolean` | - |
| <a id="hdrmode"></a> `hdrMode` | `boolean` | - |
| <a id="hdrtype"></a> `hdrType` | `string` | - |
| <a id="homekitaccessoryid"></a> `homekitAccessoryId` | `Nullable`\<`string`\> | - |
| <a id="homekitsettings"></a> `homekitSettings` | \{ `doorbellMuted`: `Nullable`\<`boolean`\>; `microphoneMuted`: `boolean`; `recordingActive`: `boolean`; `speakerMuted`: `boolean`; `streamInProgress`: `boolean`; `talkbackSettingsActive`: `boolean`; \} | - |
| `homekitSettings.doorbellMuted` | `Nullable`\<`boolean`\> | - |
| `homekitSettings.microphoneMuted` | `boolean` | - |
| `homekitSettings.recordingActive` | `boolean` | - |
| `homekitSettings.speakerMuted` | `boolean` | - |
| `homekitSettings.streamInProgress` | `boolean` | - |
| `homekitSettings.talkbackSettingsActive` | `boolean` | - |
| <a id="host"></a> `host` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`host`](#host-2) |
| <a id="hqbytesperday"></a> `hqBytesPerDay` | `number` | - |
| <a id="hubmac"></a> `hubMac` | `string` | - |
| <a id="id-1"></a> `id` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`id`](#id-3) |
| <a id="interfacesettings"></a> `interfaceSettings` | \{ `bgImageId`: `Nullable`\<`string`\>; `callMethod`: `string`; `heading`: `Nullable`\<`string`\>; `layout`: `string`; `logoImageId`: `Nullable`\<`string`\>; `showLogo`: `boolean`; `showTime`: `boolean`; `showWeather`: `boolean`; `subHeading`: `Nullable`\<`string`\>; \} | - |
| `interfaceSettings.bgImageId` | `Nullable`\<`string`\> | - |
| `interfaceSettings.callMethod` | `string` | - |
| `interfaceSettings.heading` | `Nullable`\<`string`\> | - |
| `interfaceSettings.layout` | `string` | - |
| `interfaceSettings.logoImageId` | `Nullable`\<`string`\> | - |
| `interfaceSettings.showLogo` | `boolean` | - |
| `interfaceSettings.showTime` | `boolean` | - |
| `interfaceSettings.showWeather` | `boolean` | - |
| `interfaceSettings.subHeading` | `Nullable`\<`string`\> | - |
| <a id="is2k"></a> `is2K` | `boolean` | - |
| <a id="is4k"></a> `is4K` | `boolean` | - |
| <a id="isaccessdevice"></a> `isAccessDevice` | `boolean` | - |
| <a id="isaccessfloodlighttriggerenabled"></a> `isAccessFloodlightTriggerEnabled` | `boolean` | - |
| <a id="isadopted"></a> `isAdopted` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isAdopted`](#isadopted-2) |
| <a id="isadoptedbyaccessapp"></a> `isAdoptedByAccessApp` | `boolean` | - |
| <a id="isadoptedbyother"></a> `isAdoptedByOther` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isAdoptedByOther`](#isadoptedbyother-2) |
| <a id="isadopting"></a> `isAdopting` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isAdopting`](#isadopting-2) |
| <a id="isattemptingtoconnect"></a> `isAttemptingToConnect` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isAttemptingToConnect`](#isattemptingtoconnect-2) |
| <a id="isblockedbyarmmode"></a> `isBlockedByArmMode` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isBlockedByArmMode`](#isblockedbyarmmode-2) |
| <a id="isconnected"></a> `isConnected` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isConnected`](#isconnected-2) |
| <a id="isdark"></a> `isDark` | `boolean` | - |
| <a id="isdeleting"></a> `isDeleting` | `boolean` | - |
| <a id="isdownloadingfw"></a> `isDownloadingFW` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isDownloadingFW`](#isdownloadingfw-2) |
| <a id="isextenderinstalledever"></a> `isExtenderInstalledEver` | `boolean` | - |
| <a id="isintercom"></a> `isIntercom` | `boolean` | - |
| <a id="isliveheatmapenabled"></a> `isLiveHeatmapEnabled` | `boolean` | - |
| <a id="ismanaged"></a> `isManaged` | `boolean` | - |
| <a id="ismicenabled"></a> `isMicEnabled` | `boolean` | - |
| <a id="ismissingrecordingdetected"></a> `isMissingRecordingDetected` | `boolean` | - |
| <a id="ismotiondetected"></a> `isMotionDetected` | `boolean` | - |
| <a id="ispairedwithaiport"></a> `isPairedWithAiPort` | `boolean` | - |
| <a id="ispoornetwork"></a> `isPoorNetwork` | `boolean` | - |
| <a id="isprobingforwifi"></a> `isProbingForWifi` | `boolean` | - |
| <a id="isprovisioned"></a> `isProvisioned` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isProvisioned`](#isprovisioned-2) |
| <a id="ispsettings"></a> `ispSettings` | \{ `aeMode`: `string`; `brightness`: `number`; `contrast`: `number`; `denoise`: `number`; `dZoomCenterX`: `number`; `dZoomCenterY`: `number`; `dZoomScale`: `number`; `dZoomStreamId`: `number`; `focusMode`: `string`; `focusPosition`: `number`; `hdrMode`: `string`; `hue`: `number`; `icrCustomValue`: `number`; `icrSensitivity`: `number`; `icrSwitchMode`: `string`; `irLedLevel`: `number`; `irLedMode`: `string`; `is3dnrEnabled`: `boolean`; `isAggressiveAntiFlickerEnabled`: `boolean`; `isAutoRotateEnabled`: `boolean`; `isColorNightVisionEnabled`: `boolean`; `isExternalIrEnabled`: `boolean`; `isFlippedHorizontal`: `boolean`; `isFlippedVertical`: `boolean`; `isLdcEnabled`: `boolean`; `isPauseMotionEnabled`: `boolean`; `isSmokeCoverModeEnabled`: `boolean`; `mountPosition`: `string`; `saturation`: `number`; `sceneMode`: `string`; `sharpness`: `number`; `spotlightDuration`: `number`; `touchFocusX`: `number`; `touchFocusY`: `number`; `wdr`: `number`; `zoomPosition`: `number`; \} | - |
| `ispSettings.aeMode` | `string` | - |
| `ispSettings.brightness` | `number` | - |
| `ispSettings.contrast` | `number` | - |
| `ispSettings.denoise` | `number` | - |
| `ispSettings.dZoomCenterX` | `number` | - |
| `ispSettings.dZoomCenterY` | `number` | - |
| `ispSettings.dZoomScale` | `number` | - |
| `ispSettings.dZoomStreamId` | `number` | - |
| `ispSettings.focusMode` | `string` | - |
| `ispSettings.focusPosition` | `number` | - |
| `ispSettings.hdrMode` | `string` | - |
| `ispSettings.hue` | `number` | - |
| `ispSettings.icrCustomValue` | `number` | - |
| `ispSettings.icrSensitivity` | `number` | - |
| `ispSettings.icrSwitchMode` | `string` | - |
| `ispSettings.irLedLevel` | `number` | - |
| `ispSettings.irLedMode` | `string` | - |
| `ispSettings.is3dnrEnabled` | `boolean` | - |
| `ispSettings.isAggressiveAntiFlickerEnabled` | `boolean` | - |
| `ispSettings.isAutoRotateEnabled` | `boolean` | - |
| `ispSettings.isColorNightVisionEnabled` | `boolean` | - |
| `ispSettings.isExternalIrEnabled` | `boolean` | - |
| `ispSettings.isFlippedHorizontal` | `boolean` | - |
| `ispSettings.isFlippedVertical` | `boolean` | - |
| `ispSettings.isLdcEnabled` | `boolean` | - |
| `ispSettings.isPauseMotionEnabled` | `boolean` | - |
| `ispSettings.isSmokeCoverModeEnabled` | `boolean` | - |
| `ispSettings.mountPosition` | `string` | - |
| `ispSettings.saturation` | `number` | - |
| `ispSettings.sceneMode` | `string` | - |
| `ispSettings.sharpness` | `number` | - |
| `ispSettings.spotlightDuration` | `number` | - |
| `ispSettings.touchFocusX` | `number` | - |
| `ispSettings.touchFocusY` | `number` | - |
| `ispSettings.wdr` | `number` | - |
| `ispSettings.zoomPosition` | `number` | - |
| <a id="isreaderpro"></a> `isReaderPro` | `boolean` | - |
| <a id="isrebooting"></a> `isRebooting` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isRebooting`](#isrebooting-2) |
| <a id="isrecording"></a> `isRecording` | `boolean` | - |
| <a id="isrestoring"></a> `isRestoring` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isRestoring`](#isrestoring-2) |
| <a id="issmartdetected"></a> `isSmartDetected` | `boolean` | - |
| <a id="issshenabled"></a> `isSshEnabled` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isSshEnabled`](#issshenabled-2) |
| <a id="isthirdpartycamera"></a> `isThirdPartyCamera` | `boolean` | - |
| <a id="isupdating"></a> `isUpdating` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isUpdating`](#isupdating-2) |
| <a id="iswaterproofcaseattached"></a> `isWaterproofCaseAttached` | `boolean` | - |
| <a id="iswirelessuplinkenabled"></a> `isWirelessUplinkEnabled` | `boolean` | - |
| <a id="lastdisconnect"></a> `lastDisconnect` | `Nullable`\<`number`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`lastDisconnect`](#lastdisconnect-2) |
| <a id="lastmotion"></a> `lastMotion` | `number` | - |
| <a id="lastring"></a> `lastRing` | `Nullable`\<`number`\> | - |
| <a id="lastseen"></a> `lastSeen` | `number` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`lastSeen`](#lastseen-2) |
| <a id="latestfirmwaresizebytes"></a> `latestFirmwareSizeBytes` | `Nullable`\<`number`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`latestFirmwareSizeBytes`](#latestfirmwaresizebytes-2) |
| <a id="latestfirmwareversion"></a> `latestFirmwareVersion` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`latestFirmwareVersion`](#latestfirmwareversion-2) |
| <a id="lcdmessage"></a> `lcdMessage?` | `DeepPartial`\<[`ProtectCameraLcdMessageConfigInterface`](#protectcameralcdmessageconfiginterface)\> | - |
| <a id="ledsettings"></a> `ledSettings` | \{ `floodLed`: `boolean`; `isEnabled`: `boolean`; `welcomeLed`: `boolean`; \} | - |
| `ledSettings.floodLed` | `boolean` | - |
| `ledSettings.isEnabled` | `boolean` | - |
| `ledSettings.welcomeLed` | `boolean` | - |
| <a id="lenses"></a> `lenses` | \{ `id`: `number`; `video`: \{ `recordingEnd`: `Nullable`\<`number`\>; `recordingEndLQ`: `Nullable`\<`number`\>; `recordingStart`: `Nullable`\<`number`\>; `recordingStartLQ`: `Nullable`\<`number`\>; `timelapseEnd`: `Nullable`\<`number`\>; `timelapseEndLQ`: `Nullable`\<`number`\>; `timelapseStart`: `Nullable`\<`number`\>; `timelapseStartLQ`: `Nullable`\<`number`\>; \}; \}[] | - |
| <a id="lqbytesperday"></a> `lqBytesPerDay` | `number` | - |
| <a id="mac"></a> `mac` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`mac`](#mac-2) |
| <a id="marketname"></a> `marketName` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`marketName`](#marketname-2) |
| <a id="micvolume"></a> `micVolume` | `number` | - |
| <a id="modelkey"></a> `modelKey` | `"camera"` | - |
| <a id="motionzones"></a> `motionZones` | [`ProtectSmartZoneInterface`](#protectsmartzoneinterface)[] | - |
| <a id="name-1"></a> `name?` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`name`](#name-3) |
| <a id="needupdatebeforeadoption"></a> `needUpdateBeforeAdoption` | `boolean` | - |
| <a id="nfcsettings"></a> `nfcSettings` | \{ `enableNfc`: `boolean`; `supportThirdPartyCard`: `boolean`; \} | - |
| `nfcSettings.enableNfc` | `boolean` | - |
| `nfcSettings.supportThirdPartyCard` | `boolean` | - |
| <a id="nfcstate"></a> `nfcState` | \{ `cardId`: `string`; `isUACard`: `boolean`; `lastSeen`: `number`; `mode`: `string`; \} | - |
| `nfcState.cardId` | `string` | - |
| `nfcState.isUACard` | `boolean` | - |
| `nfcState.lastSeen` | `number` | - |
| `nfcState.mode` | `string` | - |
| <a id="nvrmac"></a> `nvrMac` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`nvrMac`](#nvrmac-2) |
| <a id="optimizeirsettings"></a> `optimizeIrSettings` | \{ `irZones`: `ProtectKnownJsonValue`[]; `mode`: `string`; \} | - |
| `optimizeIrSettings.irZones` | `ProtectKnownJsonValue`[] | - |
| `optimizeIrSettings.mode` | `string` | - |
| <a id="osdsettings"></a> `osdSettings` | \{ `isDateEnabled`: `boolean`; `isDebugEnabled`: `boolean`; `isLogoEnabled`: `boolean`; `isNameEnabled`: `boolean`; `overlayLocation`: `string`; \} | - |
| `osdSettings.isDateEnabled` | `boolean` | - |
| `osdSettings.isDebugEnabled` | `boolean` | - |
| `osdSettings.isLogoEnabled` | `boolean` | - |
| `osdSettings.isNameEnabled` | `boolean` | - |
| `osdSettings.overlayLocation` | `string` | - |
| <a id="parentcameragroupid"></a> `parentCameraGroupId` | `Nullable`\<`string`\> | - |
| <a id="phyrate"></a> `phyRate` | `number` | - |
| <a id="pincodesettings"></a> `pinCodeSettings` | \{ `pinCodeLengthRange`: `string`; `pinCodeShuffle`: `boolean`; \} | - |
| `pinCodeSettings.pinCodeLengthRange` | `string` | - |
| `pinCodeSettings.pinCodeShuffle` | `boolean` | - |
| <a id="platform"></a> `platform` | `string` | - |
| <a id="privacyzones"></a> `privacyZones` | `ProtectKnownJsonValue`[] | - |
| <a id="ptz"></a> `ptz` | \{ `pauseAutoTrackingUntilTs`: `Nullable`\<`number`\>; `recentAutoHomeReturnAt`: `Nullable`\<`number`\>; `recentMoveAutoTrackResumeAtTs`: `Nullable`\<`number`\>; `returnHomeAfterInactivityMs`: `Nullable`\<`number`\>; \} | - |
| `ptz.pauseAutoTrackingUntilTs` | `Nullable`\<`number`\> | - |
| `ptz.recentAutoHomeReturnAt` | `Nullable`\<`number`\> | - |
| `ptz.recentMoveAutoTrackResumeAtTs` | `Nullable`\<`number`\> | - |
| `ptz.returnHomeAfterInactivityMs` | `Nullable`\<`number`\> | - |
| <a id="ptzcontrolenabled"></a> `ptzControlEnabled` | `boolean` | - |
| <a id="readersettings"></a> `readerSettings` | \{ `allowThirdPartyNfcCards`: `boolean`; `doorEntryMethod`: `string`; `doorId`: `Nullable`\<`string`\>; `doorName`: `Nullable`\<`string`\>; `language`: `string`; `screenOffTimeout`: `string`; `unlockDuration`: `number`; \} | - |
| `readerSettings.allowThirdPartyNfcCards` | `boolean` | - |
| `readerSettings.doorEntryMethod` | `string` | - |
| `readerSettings.doorId` | `Nullable`\<`string`\> | - |
| `readerSettings.doorName` | `Nullable`\<`string`\> | - |
| `readerSettings.language` | `string` | - |
| `readerSettings.screenOffTimeout` | `string` | - |
| `readerSettings.unlockDuration` | `number` | - |
| <a id="receivergroups"></a> `receiverGroups` | `ProtectKnownJsonValue`[] | - |
| <a id="recordingpath"></a> `recordingPath` | `Nullable`\<`string`\> | - |
| <a id="recordingschedulesv2"></a> `recordingSchedulesV2` | `ProtectKnownJsonValue`[] | - |
| <a id="recordingsettings"></a> `recordingSettings` | \{ `accessEventPostPaddingSecs`: `number`; `accessEventPrePaddingSecs`: `number`; `createAccessEvent`: `boolean`; `enableMotionDetection`: `boolean`; `endMotionEventDelay`: `number`; `geofencing`: `string`; `inScheduleMode`: `string`; `minMotionEventTrigger`: `number`; `mode`: `string`; `motionAlgorithm`: `string`; `outScheduleMode`: `string`; `postPaddingSecs`: `number`; `prePaddingSecs`: `number`; `recordAudio`: `boolean`; `recordVideo`: `boolean`; `retentionDurationLQMs`: `Nullable`\<`number`\>; `retentionDurationMs`: `Nullable`\<`number`\>; `smartDetectPostPaddingSecs`: `number`; `smartDetectPrePaddingSecs`: `number`; `suppressIlluminationSurge`: `boolean`; `useNewMotionAlgorithm`: `boolean`; \} | - |
| `recordingSettings.accessEventPostPaddingSecs` | `number` | - |
| `recordingSettings.accessEventPrePaddingSecs` | `number` | - |
| `recordingSettings.createAccessEvent` | `boolean` | - |
| `recordingSettings.enableMotionDetection` | `boolean` | - |
| `recordingSettings.endMotionEventDelay` | `number` | - |
| `recordingSettings.geofencing` | `string` | - |
| `recordingSettings.inScheduleMode` | `string` | - |
| `recordingSettings.minMotionEventTrigger` | `number` | - |
| `recordingSettings.mode` | `string` | - |
| `recordingSettings.motionAlgorithm` | `string` | - |
| `recordingSettings.outScheduleMode` | `string` | - |
| `recordingSettings.postPaddingSecs` | `number` | - |
| `recordingSettings.prePaddingSecs` | `number` | - |
| `recordingSettings.recordAudio` | `boolean` | - |
| `recordingSettings.recordVideo` | `boolean` | - |
| `recordingSettings.retentionDurationLQMs` | `Nullable`\<`number`\> | - |
| `recordingSettings.retentionDurationMs` | `Nullable`\<`number`\> | - |
| `recordingSettings.smartDetectPostPaddingSecs` | `number` | - |
| `recordingSettings.smartDetectPrePaddingSecs` | `number` | - |
| `recordingSettings.suppressIlluminationSurge` | `boolean` | - |
| `recordingSettings.useNewMotionAlgorithm` | `boolean` | - |
| <a id="rtspclient"></a> `rtspClient` | `Nullable`\<`ProtectKnownJsonValue`\> | - |
| <a id="secondlenssmartdetectzones"></a> `secondLensSmartDetectZones` | `ProtectKnownJsonValue`[] | - |
| <a id="shortcuts"></a> `shortcuts` | `ProtectKnownJsonValue`[] | - |
| <a id="skipcameraupdatedecallistener"></a> `skipCameraUpdateDecalListener` | `boolean` | - |
| <a id="smartdetectlines"></a> `smartDetectLines` | \[\] | - |
| <a id="smartdetectloiterzones"></a> `smartDetectLoiterZones` | [`ProtectSmartZoneInterface`](#protectsmartzoneinterface) & \{ `loiterTriggers`: \{ `loiterTriggerTime`: `number`; `objectType`: `string`; \}[]; `triggerAccessTypes`: `string`[]; \}[] | - |
| <a id="smartdetectsettings"></a> `smartDetectSettings` | \{ `audioTypes`: `string`[]; `autoTrackingObjectTypes`: `string`[]; `autoTrackingTimeoutSec`: `number`; `autoTrackingWithZoom`: `boolean`; `detectionRange`: \{ `max`: `Nullable`\<`number`\>; `min`: `Nullable`\<`number`\>; \}; `enableTamperDetection`: `boolean`; `objectTypes`: `string`[]; \} | - |
| `smartDetectSettings.audioTypes` | `string`[] | - |
| `smartDetectSettings.autoTrackingObjectTypes` | `string`[] | - |
| `smartDetectSettings.autoTrackingTimeoutSec` | `number` | - |
| `smartDetectSettings.autoTrackingWithZoom` | `boolean` | - |
| `smartDetectSettings.detectionRange` | \{ `max`: `Nullable`\<`number`\>; `min`: `Nullable`\<`number`\>; \} | - |
| `smartDetectSettings.detectionRange.max` | `Nullable`\<`number`\> | - |
| `smartDetectSettings.detectionRange.min` | `Nullable`\<`number`\> | - |
| `smartDetectSettings.enableTamperDetection` | `boolean` | - |
| `smartDetectSettings.objectTypes` | `string`[] | - |
| <a id="smartdetectzones"></a> `smartDetectZones` | [`ProtectSmartZoneInterface`](#protectsmartzoneinterface) & \{ `objectTypes`: `string`[]; \}[] | - |
| <a id="speakersettings"></a> `speakerSettings` | \{ `areSystemSoundsEnabled`: `boolean`; `isEnabled`: `boolean`; `repeatTimes`: `number`; `ringtoneId`: `Nullable`\<`string`\>; `ringVolume`: `number`; `speakerVolume`: `number`; `volume`: `number`; \} | - |
| `speakerSettings.areSystemSoundsEnabled` | `boolean` | - |
| `speakerSettings.isEnabled` | `boolean` | - |
| `speakerSettings.repeatTimes` | `number` | - |
| `speakerSettings.ringtoneId` | `Nullable`\<`string`\> | - |
| `speakerSettings.ringVolume` | `number` | - |
| `speakerSettings.speakerVolume` | `number` | - |
| `speakerSettings.volume` | `number` | - |
| <a id="state"></a> `state` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`state`](#state-2) |
| <a id="stats"></a> `stats` | \{ `edgeRecording`: \{ `deviceMac`: `Nullable`\<`string`\>; `recordMode`: `string`; `recordStreamNumber`: `Nullable`\<`number`\>; \}; `sdCard`: \{ `health`: `Nullable`\<`string`\>; `healthStatus`: `string`; `hotPlugCapable`: `Nullable`\<`boolean`\>; `mounts`: `ProtectKnownJsonValue`[]; `sdRecordingSupported`: `Nullable`\<`boolean`\>; `serial`: `Nullable`\<`string`\>; `size`: `Nullable`\<`number`\>; `slotId`: `string`; `slotIdx`: `Nullable`\<`number`\>; `state`: `string`; `type`: `Nullable`\<`string`\>; `usedSize`: `number`; \}; `sdCardStorageCapacityMs`: `Nullable`\<`number`\>; `storage`: \{ `rate`: `number`; `used`: `number`; \}; `storageSlots`: `ProtectKnownJsonValue`[]; `totalStorageCapacityMs`: `Nullable`\<`number`\>; `video`: \{ `recordingEnd`: `number`; `recordingEndLQ`: `number`; `recordingStart`: `number`; `recordingStartLQ`: `number`; `timelapseEnd`: `number`; `timelapseEndLQ`: `number`; `timelapseStart`: `number`; `timelapseStartLQ`: `number`; \}; `wifi`: \{ `channel`: `Nullable`\<`number`\>; `frequency`: `Nullable`\<`number`\>; `linkSpeedMbps`: `Nullable`\<`number`\>; `signalQuality`: `number`; `signalStrength`: `number`; \}; `wifiQuality`: `number`; `wifiStrength`: `number`; \} | - |
| `stats.edgeRecording` | \{ `deviceMac`: `Nullable`\<`string`\>; `recordMode`: `string`; `recordStreamNumber`: `Nullable`\<`number`\>; \} | - |
| `stats.edgeRecording.deviceMac` | `Nullable`\<`string`\> | - |
| `stats.edgeRecording.recordMode` | `string` | - |
| `stats.edgeRecording.recordStreamNumber` | `Nullable`\<`number`\> | - |
| `stats.sdCard` | \{ `health`: `Nullable`\<`string`\>; `healthStatus`: `string`; `hotPlugCapable`: `Nullable`\<`boolean`\>; `mounts`: `ProtectKnownJsonValue`[]; `sdRecordingSupported`: `Nullable`\<`boolean`\>; `serial`: `Nullable`\<`string`\>; `size`: `Nullable`\<`number`\>; `slotId`: `string`; `slotIdx`: `Nullable`\<`number`\>; `state`: `string`; `type`: `Nullable`\<`string`\>; `usedSize`: `number`; \} | - |
| `stats.sdCard.health` | `Nullable`\<`string`\> | - |
| `stats.sdCard.healthStatus` | `string` | - |
| `stats.sdCard.hotPlugCapable` | `Nullable`\<`boolean`\> | - |
| `stats.sdCard.mounts` | `ProtectKnownJsonValue`[] | - |
| `stats.sdCard.sdRecordingSupported` | `Nullable`\<`boolean`\> | - |
| `stats.sdCard.serial` | `Nullable`\<`string`\> | - |
| `stats.sdCard.size` | `Nullable`\<`number`\> | - |
| `stats.sdCard.slotId` | `string` | - |
| `stats.sdCard.slotIdx` | `Nullable`\<`number`\> | - |
| `stats.sdCard.state` | `string` | - |
| `stats.sdCard.type` | `Nullable`\<`string`\> | - |
| `stats.sdCard.usedSize` | `number` | - |
| `stats.sdCardStorageCapacityMs` | `Nullable`\<`number`\> | - |
| `stats.storage` | \{ `rate`: `number`; `used`: `number`; \} | - |
| `stats.storage.rate` | `number` | - |
| `stats.storage.used` | `number` | - |
| `stats.storageSlots` | `ProtectKnownJsonValue`[] | - |
| `stats.totalStorageCapacityMs` | `Nullable`\<`number`\> | - |
| `stats.video` | \{ `recordingEnd`: `number`; `recordingEndLQ`: `number`; `recordingStart`: `number`; `recordingStartLQ`: `number`; `timelapseEnd`: `number`; `timelapseEndLQ`: `number`; `timelapseStart`: `number`; `timelapseStartLQ`: `number`; \} | - |
| `stats.video.recordingEnd` | `number` | - |
| `stats.video.recordingEndLQ` | `number` | - |
| `stats.video.recordingStart` | `number` | - |
| `stats.video.recordingStartLQ` | `number` | - |
| `stats.video.timelapseEnd` | `number` | - |
| `stats.video.timelapseEndLQ` | `number` | - |
| `stats.video.timelapseStart` | `number` | - |
| `stats.video.timelapseStartLQ` | `number` | - |
| `stats.wifi` | \{ `channel`: `Nullable`\<`number`\>; `frequency`: `Nullable`\<`number`\>; `linkSpeedMbps`: `Nullable`\<`number`\>; `signalQuality`: `number`; `signalStrength`: `number`; \} | - |
| `stats.wifi.channel` | `Nullable`\<`number`\> | - |
| `stats.wifi.frequency` | `Nullable`\<`number`\> | - |
| `stats.wifi.linkSpeedMbps` | `Nullable`\<`number`\> | - |
| `stats.wifi.signalQuality` | `number` | - |
| `stats.wifi.signalStrength` | `number` | - |
| `stats.wifiQuality` | `number` | - |
| `stats.wifiStrength` | `number` | - |
| <a id="stitchdistance"></a> `stitchDistance` | `Nullable`\<`number`\> | - |
| <a id="stopstreamlevel"></a> `stopStreamLevel` | `Nullable`\<`number`\> | - |
| <a id="streamingchannels"></a> `streamingChannels` | `ProtectKnownJsonValue`[] | - |
| <a id="streamsharing"></a> `streamSharing` | \{ `enabled`: `boolean`; `expires`: `Nullable`\<`number`\>; `maxStreams`: `Nullable`\<`number`\>; `sharedByUser`: `Nullable`\<`string`\>; `sharedByUserId`: `Nullable`\<`string`\>; `shareLink`: `Nullable`\<`string`\>; `token`: `Nullable`\<`string`\>; \} | - |
| `streamSharing.enabled` | `boolean` | - |
| `streamSharing.expires` | `Nullable`\<`number`\> | - |
| `streamSharing.maxStreams` | `Nullable`\<`number`\> | - |
| `streamSharing.sharedByUser` | `Nullable`\<`string`\> | - |
| `streamSharing.sharedByUserId` | `Nullable`\<`string`\> | - |
| `streamSharing.shareLink` | `Nullable`\<`string`\> | - |
| `streamSharing.token` | `Nullable`\<`string`\> | - |
| <a id="supportaiportresolution"></a> `supportAiPortResolution` | `boolean` | - |
| <a id="supportaiportresolutioninhallway"></a> `supportAiPortResolutionInHallway` | `boolean` | - |
| <a id="supportedscalingresolutions"></a> `supportedScalingResolutions` | `string`[] | - |
| <a id="supportfilecreatedat"></a> `supportFileCreatedAt` | `Nullable`\<`number`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`supportFileCreatedAt`](#supportfilecreatedat-2) |
| <a id="supportfilename"></a> `supportFileName` | `Nullable`\<`string`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`supportFileName`](#supportfilename-2) |
| <a id="supportfilestate"></a> `supportFileState` | `Nullable`\<`string`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`supportFileState`](#supportfilestate-2) |
| <a id="supportucp4"></a> `supportUcp4` | `boolean` | - |
| <a id="sysid"></a> `sysid` | `Nullable`\<`string`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`sysid`](#sysid-2) |
| <a id="talkbacksettings"></a> `talkbackSettings` | [`ProtectCameraTalkbackConfigInterface`](#protectcameratalkbackconfiginterface) | - |
| <a id="template"></a> `template` | `Nullable`\<`ProtectKnownJsonValue`\> | - |
| <a id="thirdpartycamerainfo"></a> `thirdPartyCameraInfo` | \{ `enableRtspAudio`: `Nullable`\<`boolean`\>; `errors`: `ProtectKnownJsonValue`[]; `forceTcp`: `Nullable`\<`boolean`\>; `hasAudio`: `Nullable`\<`boolean`\>; `port`: `number`; `rtspUrl`: `string`; `rtspUrlLQ`: `string`; `snapshotUrl`: `string`; \} | - |
| `thirdPartyCameraInfo.enableRtspAudio` | `Nullable`\<`boolean`\> | - |
| `thirdPartyCameraInfo.errors` | `ProtectKnownJsonValue`[] | - |
| `thirdPartyCameraInfo.forceTcp` | `Nullable`\<`boolean`\> | - |
| `thirdPartyCameraInfo.hasAudio` | `Nullable`\<`boolean`\> | - |
| `thirdPartyCameraInfo.port` | `number` | - |
| `thirdPartyCameraInfo.rtspUrl` | `string` | - |
| `thirdPartyCameraInfo.rtspUrlLQ` | `string` | - |
| `thirdPartyCameraInfo.snapshotUrl` | `string` | - |
| <a id="tiltlimitsofprivacyzones"></a> `tiltLimitsOfPrivacyZones` | \{ `limit`: `number`; `side`: `string`; \} | - |
| `tiltLimitsOfPrivacyZones.limit` | `number` | - |
| `tiltLimitsOfPrivacyZones.side` | `string` | - |
| <a id="type"></a> `type` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`type`](#type-3) |
| <a id="uplinkdevice"></a> `uplinkDevice` | `Nullable`\<`string`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`uplinkDevice`](#uplinkdevice-2) |
| <a id="upsince"></a> `upSince` | `number` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`upSince`](#upsince-2) |
| <a id="uptime"></a> `uptime` | `number` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`uptime`](#uptime-2) |
| <a id="userconfiguredap"></a> `userConfiguredAp` | `boolean` | - |
| <a id="videocodec"></a> `videoCodec` | `string` | - |
| <a id="videocodeclastswitchat"></a> `videoCodecLastSwitchAt` | `Nullable`\<`number`\> | - |
| <a id="videocodecstate"></a> `videoCodecState` | `number` | - |
| <a id="videocodecswitchingsince"></a> `videoCodecSwitchingSince` | `number` | - |
| <a id="videoinputmode"></a> `videoInputMode` | `Nullable`\<`string`\> | - |
| <a id="videomode"></a> `videoMode` | `string` | - |
| <a id="videoreconfigurationinprogress"></a> `videoReconfigurationInProgress` | `boolean` | - |
| <a id="voltage"></a> `voltage` | `number` | - |
| <a id="wificonnectionstate"></a> `wifiConnectionState` | [`ProtectWifiConnectionStateInterface`](#protectwificonnectionstateinterface) | - |
| <a id="wiredconnectionstate"></a> `wiredConnectionState` | [`ProtectWiredConnectionStateInterface`](#protectwiredconnectionstateinterface) | - |

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

#### Indexable

```ts
[key: string]: ProtectKnownJsonValue
```

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

#### Extends

- [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface)

#### Indexable

```ts
[key: string]: ProtectKnownJsonValue
```

#### Properties

| Property | Type | Inherited from |
| ------ | ------ | ------ |
| <a id="anonymousdeviceid-1"></a> `anonymousDeviceId` | `Nullable`\<`string`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`anonymousDeviceId`](#anonymousdeviceid-2) |
| <a id="apmac-1"></a> `apMac` | `string` | - |
| <a id="apmgmtip-1"></a> `apMgmtIp` | `string` | - |
| <a id="aprssi-1"></a> `apRssi` | `Nullable`\<`string`\> | - |
| <a id="cameraids"></a> `cameraIds` | `string`[] | - |
| <a id="canadopt-1"></a> `canAdopt` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`canAdopt`](#canadopt-2) |
| <a id="connectedsince-1"></a> `connectedSince` | `number` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`connectedSince`](#connectedsince-2) |
| <a id="connectionhost-1"></a> `connectionHost` | `Nullable`\<`string`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`connectionHost`](#connectionhost-2) |
| <a id="displayname-1"></a> `displayName` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`displayName`](#displayname-2) |
| <a id="elementinfo-1"></a> `elementInfo` | `Nullable`\<`string`\> | - |
| <a id="featureflags-1"></a> `featureFlags` | \{ `hasHttpsClientOTA`: `boolean`; `hasWifi`: `boolean`; `supportCustomRingtone`: `boolean`; \} | - |
| `featureFlags.hasHttpsClientOTA` | `boolean` | - |
| `featureFlags.hasWifi` | `boolean` | - |
| `featureFlags.supportCustomRingtone` | `boolean` | - |
| <a id="firmwarebuild-1"></a> `firmwareBuild` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`firmwareBuild`](#firmwarebuild-2) |
| <a id="firmwareversion-1"></a> `firmwareVersion` | `Nullable`\<`string`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`firmwareVersion`](#firmwareversion-2) |
| <a id="fwupdatestate-1"></a> `fwUpdateState` | `Nullable`\<`string`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`fwUpdateState`](#fwupdatestate-2) |
| <a id="globalalarmmanagerscopenames-1"></a> `globalAlarmManagerScopeNames` | `string`[] | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`globalAlarmManagerScopeNames`](#globalalarmmanagerscopenames-2) |
| <a id="guid-1"></a> `guid` | `Nullable`\<`string`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`guid`](#guid-2) |
| <a id="hardwarerevision-1"></a> `hardwareRevision` | `Nullable`\<`string`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`hardwareRevision`](#hardwarerevision-2) |
| <a id="haswifi-1"></a> `hasWifi` | `boolean` | - |
| <a id="host-1"></a> `host` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`host`](#host-2) |
| <a id="id-2"></a> `id` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`id`](#id-3) |
| <a id="isadopted-1"></a> `isAdopted` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isAdopted`](#isadopted-2) |
| <a id="isadoptedbyother-1"></a> `isAdoptedByOther` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isAdoptedByOther`](#isadoptedbyother-2) |
| <a id="isadopting-1"></a> `isAdopting` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isAdopting`](#isadopting-2) |
| <a id="isattemptingtoconnect-1"></a> `isAttemptingToConnect` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isAttemptingToConnect`](#isattemptingtoconnect-2) |
| <a id="isblockedbyarmmode-1"></a> `isBlockedByArmMode` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isBlockedByArmMode`](#isblockedbyarmmode-2) |
| <a id="isconnected-1"></a> `isConnected` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isConnected`](#isconnected-2) |
| <a id="isdownloadingfw-1"></a> `isDownloadingFW` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isDownloadingFW`](#isdownloadingfw-2) |
| <a id="isprobingforwifi-1"></a> `isProbingForWifi` | `boolean` | - |
| <a id="isprovisioned-1"></a> `isProvisioned` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isProvisioned`](#isprovisioned-2) |
| <a id="isrebooting-1"></a> `isRebooting` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isRebooting`](#isrebooting-2) |
| <a id="isrestoring-1"></a> `isRestoring` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isRestoring`](#isrestoring-2) |
| <a id="issshenabled-1"></a> `isSshEnabled` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isSshEnabled`](#issshenabled-2) |
| <a id="isupdating-1"></a> `isUpdating` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isUpdating`](#isupdating-2) |
| <a id="iswirelessuplinkenabled-1"></a> `isWirelessUplinkEnabled` | `boolean` | - |
| <a id="lastdisconnect-1"></a> `lastDisconnect` | `Nullable`\<`number`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`lastDisconnect`](#lastdisconnect-2) |
| <a id="lastring-1"></a> `lastRing` | `number` | - |
| <a id="lastseen-1"></a> `lastSeen` | `number` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`lastSeen`](#lastseen-2) |
| <a id="latestfirmwaresizebytes-1"></a> `latestFirmwareSizeBytes` | `Nullable`\<`number`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`latestFirmwareSizeBytes`](#latestfirmwaresizebytes-2) |
| <a id="latestfirmwareversion-1"></a> `latestFirmwareVersion` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`latestFirmwareVersion`](#latestfirmwareversion-2) |
| <a id="mac-1"></a> `mac` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`mac`](#mac-2) |
| <a id="marketname-1"></a> `marketName` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`marketName`](#marketname-2) |
| <a id="modelkey-1"></a> `modelKey` | `"chime"` | - |
| <a id="name-2"></a> `name?` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`name`](#name-3) |
| <a id="nvrmac-1"></a> `nvrMac` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`nvrMac`](#nvrmac-2) |
| <a id="platform-1"></a> `platform` | `string` | - |
| <a id="repeattimes"></a> `repeatTimes` | `number` | - |
| <a id="ringsettings"></a> `ringSettings` | \{ `cameraId`: `string`; `repeatTimes`: `number`; `ringtoneId`: `string`; `volume`: `number`; \}[] | - |
| <a id="speakertracklist"></a> `speakerTrackList` | \{ `md5`: `string`; `name`: `string`; `size`: `number`; `state`: `string`; `track_no`: `number`; `volume`: `number`; \}[] | - |
| <a id="state-1"></a> `state` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`state`](#state-2) |
| <a id="supportfilecreatedat-1"></a> `supportFileCreatedAt` | `Nullable`\<`number`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`supportFileCreatedAt`](#supportfilecreatedat-2) |
| <a id="supportfilename-1"></a> `supportFileName` | `Nullable`\<`string`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`supportFileName`](#supportfilename-2) |
| <a id="supportfilestate-1"></a> `supportFileState` | `Nullable`\<`string`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`supportFileState`](#supportfilestate-2) |
| <a id="sysid-1"></a> `sysid` | `Nullable`\<`string`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`sysid`](#sysid-2) |
| <a id="type-2"></a> `type` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`type`](#type-3) |
| <a id="uplinkdevice-1"></a> `uplinkDevice` | `Nullable`\<`string`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`uplinkDevice`](#uplinkdevice-2) |
| <a id="upsince-1"></a> `upSince` | `number` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`upSince`](#upsince-2) |
| <a id="uptime-1"></a> `uptime` | `number` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`uptime`](#uptime-2) |
| <a id="userconfiguredap-1"></a> `userConfiguredAp` | `boolean` | - |
| <a id="volume"></a> `volume` | `number` | - |
| <a id="wificonnectionstate-1"></a> `wifiConnectionState` | [`ProtectWifiConnectionStateInterface`](#protectwificonnectionstateinterface) | - |
| <a id="wiredconnectionstate-1"></a> `wiredConnectionState` | [`ProtectWiredConnectionStateInterface`](#protectwiredconnectionstateinterface) | - |

***

### ProtectDeviceBaseInterface

The common properties shared by all UniFi Protect device configuration objects.

#### Extended by

- [`ProtectCameraConfigInterface`](#protectcameraconfiginterface)
- [`ProtectChimeConfigInterface`](#protectchimeconfiginterface)
- [`ProtectLightConfigInterface`](#protectlightconfiginterface)
- [`ProtectSensorConfigInterface`](#protectsensorconfiginterface)
- [`ProtectViewerConfigInterface`](#protectviewerconfiginterface)

#### Indexable

```ts
[key: string]: ProtectKnownJsonValue
```

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="anonymousdeviceid-2"></a> `anonymousDeviceId` | `Nullable`\<`string`\> |
| <a id="canadopt-2"></a> `canAdopt` | `boolean` |
| <a id="connectedsince-2"></a> `connectedSince` | `number` |
| <a id="connectionhost-2"></a> `connectionHost` | `Nullable`\<`string`\> |
| <a id="displayname-2"></a> `displayName` | `string` |
| <a id="firmwarebuild-2"></a> `firmwareBuild` | `string` |
| <a id="firmwareversion-2"></a> `firmwareVersion` | `Nullable`\<`string`\> |
| <a id="fwupdatestate-2"></a> `fwUpdateState` | `Nullable`\<`string`\> |
| <a id="globalalarmmanagerscopenames-2"></a> `globalAlarmManagerScopeNames` | `string`[] |
| <a id="guid-2"></a> `guid` | `Nullable`\<`string`\> |
| <a id="hardwarerevision-2"></a> `hardwareRevision` | `Nullable`\<`string`\> |
| <a id="host-2"></a> `host` | `string` |
| <a id="id-3"></a> `id` | `string` |
| <a id="isadopted-2"></a> `isAdopted` | `boolean` |
| <a id="isadoptedbyother-2"></a> `isAdoptedByOther` | `boolean` |
| <a id="isadopting-2"></a> `isAdopting` | `boolean` |
| <a id="isattemptingtoconnect-2"></a> `isAttemptingToConnect` | `boolean` |
| <a id="isblockedbyarmmode-2"></a> `isBlockedByArmMode` | `boolean` |
| <a id="isconnected-2"></a> `isConnected` | `boolean` |
| <a id="isdownloadingfw-2"></a> `isDownloadingFW` | `boolean` |
| <a id="isprovisioned-2"></a> `isProvisioned` | `boolean` |
| <a id="isrebooting-2"></a> `isRebooting` | `boolean` |
| <a id="isrestoring-2"></a> `isRestoring` | `boolean` |
| <a id="issshenabled-2"></a> `isSshEnabled` | `boolean` |
| <a id="isupdating-2"></a> `isUpdating` | `boolean` |
| <a id="lastdisconnect-2"></a> `lastDisconnect` | `Nullable`\<`number`\> |
| <a id="lastseen-2"></a> `lastSeen` | `number` |
| <a id="latestfirmwaresizebytes-2"></a> `latestFirmwareSizeBytes` | `Nullable`\<`number`\> |
| <a id="latestfirmwareversion-2"></a> `latestFirmwareVersion` | `string` |
| <a id="mac-2"></a> `mac` | `string` |
| <a id="marketname-2"></a> `marketName` | `string` |
| <a id="name-3"></a> `name?` | `string` |
| <a id="nvrmac-2"></a> `nvrMac` | `string` |
| <a id="state-2"></a> `state` | `string` |
| <a id="supportfilecreatedat-2"></a> `supportFileCreatedAt` | `Nullable`\<`number`\> |
| <a id="supportfilename-2"></a> `supportFileName` | `Nullable`\<`string`\> |
| <a id="supportfilestate-2"></a> `supportFileState` | `Nullable`\<`string`\> |
| <a id="sysid-2"></a> `sysid` | `Nullable`\<`string`\> |
| <a id="type-3"></a> `type` | `string` |
| <a id="uplinkdevice-2"></a> `uplinkDevice` | `Nullable`\<`string`\> |
| <a id="upsince-2"></a> `upSince` | `number` |
| <a id="uptime-2"></a> `uptime` | `number` |

***

### ProtectEventAddInterface

A semi-complete description of the UniFi Protect smart motion detection event JSON.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="camera"></a> `camera?` | `string` |
| <a id="cameraid"></a> `cameraId` | `string` |
| <a id="detectedat"></a> `detectedAt` | `number` |
| <a id="end"></a> `end` | `number` |
| <a id="eventid"></a> `eventId` | `string` |
| <a id="id-4"></a> `id` | `string` |
| <a id="locked"></a> `locked` | `boolean` |
| <a id="metadata"></a> `metadata?` | `DeepPartial`\<[`ProtectEventMetadataInterface`](#protecteventmetadatainterface)\> |
| <a id="modelkey-2"></a> `modelKey` | `"event"` |
| <a id="partition"></a> `partition` | `string` |
| <a id="score"></a> `score` | `number` |
| <a id="smartdetectevents"></a> `smartDetectEvents` | `string`[] |
| <a id="smartdetecttypes"></a> `smartDetectTypes?` | `string`[] |
| <a id="start"></a> `start` | `number` |
| <a id="thumbnailid"></a> `thumbnailId` | `string` |
| <a id="type-4"></a> `type` | `string` |
| <a id="user"></a> `user` | `string` |

***

### ProtectEventMetadataDetectedThumbnailInterface

A semi-complete description of the UniFi Protect smart motion detection thumbnail metadata JSON.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="attributes"></a> `attributes` | \{ `color`: \{ `confidence`: `number`; `val`: `string`; \}; `faceMask`: \{ `confidence`: `number`; `val`: `string`; \}; `trackerId`: `string`; `vehicleType`: \{ `confidence`: `number`; `val`: `string`; \}; `zone`: `number`[]; \} |
| `attributes.color` | \{ `confidence`: `number`; `val`: `string`; \} |
| `attributes.color.confidence` | `number` |
| `attributes.color.val` | `string` |
| `attributes.faceMask` | \{ `confidence`: `number`; `val`: `string`; \} |
| `attributes.faceMask.confidence` | `number` |
| `attributes.faceMask.val` | `string` |
| `attributes.trackerId` | `string` |
| `attributes.vehicleType` | \{ `confidence`: `number`; `val`: `string`; \} |
| `attributes.vehicleType.confidence` | `number` |
| `attributes.vehicleType.val` | `string` |
| `attributes.zone` | `number`[] |
| <a id="clockbestwall"></a> `clockBestWall` | `number` |
| <a id="confidence"></a> `confidence` | `number` |
| <a id="coord"></a> `coord` | \[`number`, `number`, `number`, `number`\] |
| <a id="croppedid"></a> `croppedId` | `string` |
| <a id="name-4"></a> `name` | `string` |
| <a id="objectid"></a> `objectId` | `string` |
| <a id="type-5"></a> `type` | `string` |

***

### ProtectEventMetadataInterface

A description of metadata in UniFi Protect smart motion detect events.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="accesseventid"></a> `accessEventId` | `string` |
| <a id="action"></a> `action` | `string` |
| <a id="detectedareas"></a> `detectedAreas` | \{ `areaIndexes`: `number`[]; `smartDetectObject`: `string`; \}[] |
| <a id="detectedthumbnails"></a> `detectedThumbnails` | `DeepPartial`\<[`ProtectEventMetadataDetectedThumbnailInterface`](#protecteventmetadatadetectedthumbnailinterface)\>[] |
| <a id="deviceid"></a> `deviceId` | \{ `text`: `string`; \} |
| `deviceId.text` | `string` |
| <a id="direction"></a> `direction` | `string` |
| <a id="doorname"></a> `doorName` | `string` |
| <a id="fingerprint"></a> `fingerprint` | \{ `ulpId`: `string`; \} |
| `fingerprint.ulpId` | `string` |
| <a id="firstname"></a> `firstName` | `string` |
| <a id="hallwaymode-1"></a> `hallwayMode` | `string` |
| <a id="islowbattery"></a> `isLowBattery` | `boolean` |
| <a id="iswireless"></a> `isWireless` | `boolean` |
| <a id="lastname"></a> `lastName` | `string` |
| <a id="licenseplate"></a> `licensePlate` | \{ `confidenceLevel`: `number`; `name`: `string`; \} |
| `licensePlate.confidenceLevel` | `number` |
| `licensePlate.name` | `string` |
| <a id="name-5"></a> `name` | \{ `text`: `string`; \} |
| `name.text` | `string` |
| <a id="nfc"></a> `nfc` | \{ `nfcId`: `string`; `ulpId`: `string`; \} |
| `nfc.nfcId` | `string` |
| `nfc.ulpId` | `string` |
| <a id="openmethod"></a> `openMethod` | `string` |
| <a id="opensuccess"></a> `openSuccess` | `boolean` |
| <a id="reason"></a> `reason` | `string` |
| <a id="uniqueid"></a> `uniqueId` | `string` |
| <a id="usertype"></a> `userType` | `string` |
| <a id="zonesstatus"></a> `zonesStatus` | `Record`\<`string`, \{ `level`: `number`; `status`: `string`; \}\> |

***

### ProtectLightConfigInterface

A semi-complete description of the UniFi Protect light JSON.

#### Extends

- [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface)

#### Indexable

```ts
[key: string]: ProtectKnownJsonValue
```

#### Properties

| Property | Type | Inherited from |
| ------ | ------ | ------ |
| <a id="anonymousdeviceid-3"></a> `anonymousDeviceId` | `Nullable`\<`string`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`anonymousDeviceId`](#anonymousdeviceid-2) |
| <a id="camera-1"></a> `camera` | `Nullable`\<`string`\> | - |
| <a id="canadopt-3"></a> `canAdopt` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`canAdopt`](#canadopt-2) |
| <a id="connectedsince-3"></a> `connectedSince` | `number` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`connectedSince`](#connectedsince-2) |
| <a id="connectionhost-3"></a> `connectionHost` | `Nullable`\<`string`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`connectionHost`](#connectionhost-2) |
| <a id="displayname-3"></a> `displayName` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`displayName`](#displayname-2) |
| <a id="firmwarebuild-3"></a> `firmwareBuild` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`firmwareBuild`](#firmwarebuild-2) |
| <a id="firmwareversion-3"></a> `firmwareVersion` | `Nullable`\<`string`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`firmwareVersion`](#firmwareversion-2) |
| <a id="fwupdatestate-3"></a> `fwUpdateState` | `Nullable`\<`string`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`fwUpdateState`](#fwupdatestate-2) |
| <a id="globalalarmmanagerscopenames-3"></a> `globalAlarmManagerScopeNames` | `string`[] | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`globalAlarmManagerScopeNames`](#globalalarmmanagerscopenames-2) |
| <a id="guid-3"></a> `guid` | `Nullable`\<`string`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`guid`](#guid-2) |
| <a id="hardwarerevision-3"></a> `hardwareRevision` | `Nullable`\<`string`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`hardwareRevision`](#hardwarerevision-2) |
| <a id="host-3"></a> `host` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`host`](#host-2) |
| <a id="id-5"></a> `id` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`id`](#id-3) |
| <a id="isadopted-3"></a> `isAdopted` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isAdopted`](#isadopted-2) |
| <a id="isadoptedbyother-3"></a> `isAdoptedByOther` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isAdoptedByOther`](#isadoptedbyother-2) |
| <a id="isadopting-3"></a> `isAdopting` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isAdopting`](#isadopting-2) |
| <a id="isattemptingtoconnect-3"></a> `isAttemptingToConnect` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isAttemptingToConnect`](#isattemptingtoconnect-2) |
| <a id="isblockedbyarmmode-3"></a> `isBlockedByArmMode` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isBlockedByArmMode`](#isblockedbyarmmode-2) |
| <a id="iscamerapaired"></a> `isCameraPaired` | `boolean` | - |
| <a id="isconnected-3"></a> `isConnected` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isConnected`](#isconnected-2) |
| <a id="isdark-1"></a> `isDark` | `boolean` | - |
| <a id="isdownloadingfw-3"></a> `isDownloadingFW` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isDownloadingFW`](#isdownloadingfw-2) |
| <a id="islighton"></a> `isLightOn` | `boolean` | - |
| <a id="islocating"></a> `isLocating` | `boolean` | - |
| <a id="ispirmotiondetected"></a> `isPirMotionDetected` | `boolean` | - |
| <a id="isprovisioned-3"></a> `isProvisioned` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isProvisioned`](#isprovisioned-2) |
| <a id="isrebooting-3"></a> `isRebooting` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isRebooting`](#isrebooting-2) |
| <a id="isrestoring-3"></a> `isRestoring` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isRestoring`](#isrestoring-2) |
| <a id="issshenabled-3"></a> `isSshEnabled` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isSshEnabled`](#issshenabled-2) |
| <a id="isupdating-3"></a> `isUpdating` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isUpdating`](#isupdating-2) |
| <a id="lastdisconnect-3"></a> `lastDisconnect` | `Nullable`\<`number`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`lastDisconnect`](#lastdisconnect-2) |
| <a id="lastmotion-1"></a> `lastMotion` | `Nullable`\<`number`\> | - |
| <a id="lastseen-3"></a> `lastSeen` | `number` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`lastSeen`](#lastseen-2) |
| <a id="latestfirmwaresizebytes-3"></a> `latestFirmwareSizeBytes` | `Nullable`\<`number`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`latestFirmwareSizeBytes`](#latestfirmwaresizebytes-2) |
| <a id="latestfirmwareversion-3"></a> `latestFirmwareVersion` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`latestFirmwareVersion`](#latestfirmwareversion-2) |
| <a id="lightdevicesettings"></a> `lightDeviceSettings` | \{ `isIndicatorEnabled`: `boolean`; `ledLevel`: `number`; `luxSensitivity`: `string`; `pirDuration`: `number`; `pirSensitivity`: `number`; \} | - |
| `lightDeviceSettings.isIndicatorEnabled` | `boolean` | - |
| `lightDeviceSettings.ledLevel` | `number` | - |
| `lightDeviceSettings.luxSensitivity` | `string` | - |
| `lightDeviceSettings.pirDuration` | `number` | - |
| `lightDeviceSettings.pirSensitivity` | `number` | - |
| <a id="lightmodesettings"></a> `lightModeSettings` | \{ `enableAt`: `string`; `mode`: `string`; \} | - |
| `lightModeSettings.enableAt` | `string` | - |
| `lightModeSettings.mode` | `string` | - |
| <a id="lightonsettings"></a> `lightOnSettings` | \{ `isLedForceOn`: `boolean`; \} | - |
| `lightOnSettings.isLedForceOn` | `boolean` | - |
| <a id="mac-3"></a> `mac` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`mac`](#mac-2) |
| <a id="marketname-3"></a> `marketName` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`marketName`](#marketname-2) |
| <a id="modelkey-3"></a> `modelKey` | `"light"` | - |
| <a id="name-6"></a> `name?` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`name`](#name-3) |
| <a id="nvrmac-3"></a> `nvrMac` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`nvrMac`](#nvrmac-2) |
| <a id="state-3"></a> `state` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`state`](#state-2) |
| <a id="supportfilecreatedat-3"></a> `supportFileCreatedAt` | `Nullable`\<`number`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`supportFileCreatedAt`](#supportfilecreatedat-2) |
| <a id="supportfilename-3"></a> `supportFileName` | `Nullable`\<`string`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`supportFileName`](#supportfilename-2) |
| <a id="supportfilestate-3"></a> `supportFileState` | `Nullable`\<`string`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`supportFileState`](#supportfilestate-2) |
| <a id="sysid-3"></a> `sysid` | `Nullable`\<`string`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`sysid`](#sysid-2) |
| <a id="type-6"></a> `type` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`type`](#type-3) |
| <a id="uplinkdevice-3"></a> `uplinkDevice` | `Nullable`\<`string`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`uplinkDevice`](#uplinkdevice-2) |
| <a id="upsince-3"></a> `upSince` | `number` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`upSince`](#upsince-2) |
| <a id="uptime-3"></a> `uptime` | `number` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`uptime`](#uptime-2) |
| <a id="wiredconnectionstate-2"></a> `wiredConnectionState` | [`ProtectWiredConnectionStateInterface`](#protectwiredconnectionstateinterface) | - |

***

### ProtectNvrBootstrapInterface

A semi-complete description of the UniFi Protect NVR bootstrap JSON.

#### Indexable

```ts
[key: string]: ProtectKnownJsonValue
```

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="accesskey"></a> `accessKey` | `string` |
| <a id="aiports"></a> `aiports` | `ProtectKnownJsonValue`[] |
| <a id="aiprocessors"></a> `aiprocessors` | `ProtectKnownJsonValue`[] |
| <a id="authuserid"></a> `authUserId` | `string` |
| <a id="bridges"></a> `bridges` | `ProtectKnownJsonValue`[] |
| <a id="cameragroups"></a> `cameraGroups` | `ProtectKnownJsonValue`[] |
| <a id="cameras"></a> `cameras` | [`ProtectCameraConfigInterface`](#protectcameraconfiginterface)[] |
| <a id="chimes"></a> `chimes` | [`ProtectChimeConfigInterface`](#protectchimeconfiginterface)[] |
| <a id="devicegroups"></a> `deviceGroups` | `ProtectKnownJsonValue`[] |
| <a id="fobs"></a> `fobs` | `ProtectKnownJsonValue`[] |
| <a id="groups"></a> `groups` | `ProtectKnownJsonValue`[] |
| <a id="hubs"></a> `hubs` | `ProtectKnownJsonValue`[] |
| <a id="lastupdateid"></a> `lastUpdateId` | `string` |
| <a id="lights"></a> `lights` | [`ProtectLightConfigInterface`](#protectlightconfiginterface)[] |
| <a id="linkstations"></a> `linkstations` | `ProtectKnownJsonValue`[] |
| <a id="liveviews"></a> `liveviews` | [`ProtectNvrLiveviewConfigInterface`](#protectnvrliveviewconfiginterface)[] |
| <a id="nvr"></a> `nvr` | [`ProtectNvrConfigInterface`](#protectnvrconfiginterface) |
| <a id="readers"></a> `readers` | `ProtectKnownJsonValue`[] |
| <a id="relays"></a> `relays` | `ProtectKnownJsonValue`[] |
| <a id="ringtones"></a> `ringtones` | [`ProtectRingtoneConfigInterface`](#protectringtoneconfiginterface)[] |
| <a id="sensors"></a> `sensors` | [`ProtectSensorConfigInterface`](#protectsensorconfiginterface)[] |
| <a id="sirens"></a> `sirens` | `ProtectKnownJsonValue`[] |
| <a id="speakers"></a> `speakers` | `ProtectKnownJsonValue`[] |
| <a id="users"></a> `users` | [`ProtectNvrUserConfigInterface`](#protectnvruserconfiginterface)[] |
| <a id="viewers"></a> `viewers` | [`ProtectViewerConfigInterface`](#protectviewerconfiginterface)[] |

***

### ProtectNvrConfigInterface

A semi-complete description of the UniFi Protect NVR configuration JSON.

#### Indexable

```ts
[key: string]: ProtectKnownJsonValue
```

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="analyticsdata"></a> `analyticsData` | `string` |
| <a id="anonymousdeviceid-4"></a> `anonymousDeviceId` | `string` |
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
| <a id="doorbellsettings"></a> `doorbellSettings?` | \{ `allMessages`: \{ `text`: `string`; `type`: `string`; \}[]; `customImages`: `string`[]; `customMessages`: `string`[]; `defaultMessageResetTimeoutMs`: `number`; `defaultMessageText`: `string`; \} |
| `doorbellSettings.allMessages` | \{ `text`: `string`; `type`: `string`; \}[] |
| `doorbellSettings.customImages` | `string`[] |
| `doorbellSettings.customMessages` | `string`[] |
| `doorbellSettings.defaultMessageResetTimeoutMs` | `number` |
| `doorbellSettings.defaultMessageText` | `string` |
| <a id="enableautomaticbackups"></a> `enableAutomaticBackups` | `boolean` |
| <a id="enablebridgeautoadoption"></a> `enableBridgeAutoAdoption` | `boolean` |
| <a id="enablecrashreporting"></a> `enableCrashReporting` | `boolean` |
| <a id="errorcode"></a> `errorCode` | `Nullable`\<`string`\> |
| <a id="featureflags-2"></a> `featureFlags` | \{ `beta`: `boolean`; `detectionLabels`: `boolean`; `dev`: `boolean`; `hasTwoWayAudioMediaStreams`: `boolean`; `homekitPaired`: `boolean`; `notificationsV2`: `boolean`; `ulpRoleManagement`: `boolean`; \} |
| `featureFlags.beta` | `boolean` |
| `featureFlags.detectionLabels` | `boolean` |
| `featureFlags.dev` | `boolean` |
| `featureFlags.hasTwoWayAudioMediaStreams` | `boolean` |
| `featureFlags.homekitPaired` | `boolean` |
| `featureFlags.notificationsV2` | `boolean` |
| `featureFlags.ulpRoleManagement` | `boolean` |
| <a id="firmwareversion-4"></a> `firmwareVersion` | `string` |
| <a id="hardwareid"></a> `hardwareId` | `string` |
| <a id="hardwarerevision-4"></a> `hardwareRevision` | `string` |
| <a id="hasgateway"></a> `hasGateway` | `boolean` |
| <a id="host-4"></a> `host` | `string` |
| <a id="hosts"></a> `hosts` | `string`[] |
| <a id="hostshortname"></a> `hostShortname` | `string` |
| <a id="hosttype"></a> `hostType` | `number` |
| <a id="id-6"></a> `id` | `string` |
| <a id="isaccessinstalled"></a> `isAccessInstalled` | `boolean` |
| <a id="isaireportingenabled"></a> `isAiReportingEnabled` | `boolean` |
| <a id="isaway"></a> `isAway` | `boolean` |
| <a id="isinsightsenabled"></a> `isInsightsEnabled` | `boolean` |
| <a id="isnetworkinstalled"></a> `isNetworkInstalled` | `boolean` |
| <a id="isprimary"></a> `isPrimary` | `boolean` |
| <a id="isprotectupdatable"></a> `isProtectUpdatable` | `boolean` |
| <a id="isrecordingdisabled"></a> `isRecordingDisabled` | `boolean` |
| <a id="isrecordingmotiononly"></a> `isRecordingMotionOnly` | `boolean` |
| <a id="isrecycling"></a> `isRecycling` | `boolean` |
| <a id="isremoteaccessenabled"></a> `isRemoteAccessEnabled` | `boolean` |
| <a id="issetup"></a> `isSetup` | `boolean` |
| <a id="issshenabled-4"></a> `isSshEnabled` | `boolean` |
| <a id="isstacked"></a> `isStacked` | `boolean` |
| <a id="isucoresetup"></a> `isUCoreSetup` | `boolean` |
| <a id="isucorestacked"></a> `isUCoreStacked` | `boolean` |
| <a id="isucoreupdatable"></a> `isUcoreUpdatable` | `boolean` |
| <a id="isupdating-4"></a> `isUpdating` | `boolean` |
| <a id="iswirelessuplinkenabled-2"></a> `isWirelessUplinkEnabled` | `Nullable`\<`boolean`\> |
| <a id="lastseen-4"></a> `lastSeen` | `number` |
| <a id="lastupdateat"></a> `lastUpdateAt` | `Nullable`\<`number`\> |
| <a id="locationsettings"></a> `locationSettings` | \{ `isAway`: `boolean`; `isGeofencingEnabled`: `boolean`; `latitude`: `number`; `longitude`: `number`; `radius`: `number`; \} |
| `locationSettings.isAway` | `boolean` |
| `locationSettings.isGeofencingEnabled` | `boolean` |
| `locationSettings.latitude` | `number` |
| `locationSettings.longitude` | `number` |
| `locationSettings.radius` | `number` |
| <a id="mac-4"></a> `mac` | `string` |
| <a id="marketname-4"></a> `marketName` | `string` |
| <a id="maxcameracapacity"></a> `maxCameraCapacity` | `Record`\<`string`, `number`\> |
| <a id="modelkey-4"></a> `modelKey` | `"nvr"` |
| <a id="name-7"></a> `name?` | `string` |
| <a id="ports"></a> `ports` | \{ `aiFeatureConsole`: `number`; `cameraEvents`: `number`; `cameraHttps`: `number`; `devicesWss`: `number`; `discoveryClient`: `number`; `emsCLI`: `number`; `emsJsonCLI`: `number`; `emsLiveFLV`: `number`; `http`: `number`; `https`: `number`; `liveWs`: `number`; `liveWss`: `number`; `playback`: `number`; `rtmp`: `number`; `rtsp`: `number`; `rtsps`: `number`; `stacking`: `number`; `tcpBridge`: `number`; `tcpStreams`: `number`; `ucore`: `number`; `ump`: `number`; \} |
| `ports.aiFeatureConsole` | `number` |
| `ports.cameraEvents` | `number` |
| `ports.cameraHttps` | `number` |
| `ports.devicesWss` | `number` |
| `ports.discoveryClient` | `number` |
| `ports.emsCLI` | `number` |
| `ports.emsJsonCLI` | `number` |
| `ports.emsLiveFLV` | `number` |
| `ports.http` | `number` |
| `ports.https` | `number` |
| `ports.liveWs` | `number` |
| `ports.liveWss` | `number` |
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
| <a id="recordingretentiondurationms"></a> `recordingRetentionDurationMs` | `Nullable`\<`string`\> |
| <a id="releasechannel"></a> `releaseChannel` | `string` |
| <a id="skipfirmwareupdate"></a> `skipFirmwareUpdate` | `boolean` |
| <a id="smartdetectagreement"></a> `smartDetectAgreement` | \{ `lastUpdateAt`: `Nullable`\<`number`\>; `status`: `string`; \} |
| `smartDetectAgreement.lastUpdateAt` | `Nullable`\<`number`\> |
| `smartDetectAgreement.status` | `string` |
| <a id="smartdetection"></a> `smartDetection` | \{ `enable`: `boolean`; `faceRecognition`: `boolean`; `licensePlateRecognition`: `boolean`; \} |
| `smartDetection.enable` | `boolean` |
| `smartDetection.faceRecognition` | `boolean` |
| `smartDetection.licensePlateRecognition` | `boolean` |
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
| <a id="type-7"></a> `type` | `string` |
| <a id="ucoreversion"></a> `ucoreVersion` | `string` |
| <a id="upsince-4"></a> `upSince` | `number` |
| <a id="version"></a> `version` | `string` |
| <a id="wanip"></a> `wanIp` | `string` |

***

### ProtectNvrLiveviewConfigInterface

A semi-complete description of the UniFi Protect NVR liveview JSON.

#### Indexable

```ts
[key: string]: ProtectKnownJsonValue
```

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="id-7"></a> `id` | `string` |
| <a id="isdefault"></a> `isDefault` | `boolean` |
| <a id="isglobal"></a> `isGlobal` | `boolean` |
| <a id="layout"></a> `layout` | `number` |
| <a id="modelkey-5"></a> `modelKey` | `"liveview"` |
| <a id="name-8"></a> `name` | `string` |
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
| <a id="name-9"></a> `name` | `string` |
| <a id="port"></a> `port` | `number` |
| <a id="required"></a> `required` | `boolean` |
| <a id="state-4"></a> `state` | `string` |
| <a id="status-1"></a> `status` | `string` |
| <a id="statusmessage"></a> `statusMessage` | `string` |
| <a id="swaiversion"></a> `swaiVersion` | `number` |
| <a id="type-8"></a> `type` | `string` |
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
| <a id="uiversion"></a> `uiVersion` | `string` |
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
| <a id="type-9"></a> `type` | `string` |

***

### ProtectNvrSystemInfoInterface

A semi-complete description of the UniFi Protect NVR system information configuration JSON.

#### Indexable

```ts
[key: string]: ProtectKnownJsonValue
```

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

#### Indexable

```ts
[key: string]: ProtectKnownJsonValue
```

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="alertrules"></a> `alertRules` | `ProtectKnownJsonValue`[] |
| <a id="allpermissions"></a> `allPermissions` | `string`[] |
| <a id="cloudaccount"></a> `cloudAccount?` | \{ `cloudId`: `string`; `email`: `string`; `firstName`: `string`; `id`: `string`; `lastName`: `string`; `modelKey`: `string`; `name`: `string`; `profileImg`: `string`; `user`: `string`; \} |
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
| <a id="id-8"></a> `id` | `string` |
| <a id="isowner"></a> `isOwner` | `boolean` |
| <a id="lastloginip"></a> `lastLoginIp` | `Nullable`\<`string`\> |
| <a id="lastlogintime"></a> `lastLoginTime` | `Nullable`\<`number`\> |
| <a id="lastname-1"></a> `lastName` | `string` |
| <a id="localusername"></a> `localUsername` | `string` |
| <a id="location"></a> `location?` | \{ `isAway`: `boolean`; `latitude`: `Nullable`\<`number`\>; `longitude`: `Nullable`\<`number`\>; \} |
| `location.isAway` | `boolean` |
| `location.latitude` | `Nullable`\<`number`\> |
| `location.longitude` | `Nullable`\<`number`\> |
| <a id="modelkey-6"></a> `modelKey` | `"user"` |
| <a id="name-10"></a> `name` | `string` |
| <a id="permissions"></a> `permissions` | `string`[] |

***

### ProtectPtzAxisRangeInterface

A description of a PTZ axis range for UniFi Protect camera feature flags.

#### Indexable

```ts
[key: string]: ProtectKnownJsonValue
```

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="degrees"></a> `degrees` | \{ `max`: `Nullable`\<`number`\>; `min`: `Nullable`\<`number`\>; `step`: `Nullable`\<`number`\>; \} |
| `degrees.max` | `Nullable`\<`number`\> |
| `degrees.min` | `Nullable`\<`number`\> |
| `degrees.step` | `Nullable`\<`number`\> |
| <a id="steps"></a> `steps` | \{ `max`: `Nullable`\<`number`\>; `min`: `Nullable`\<`number`\>; `step`: `Nullable`\<`number`\>; \} |
| `steps.max` | `Nullable`\<`number`\> |
| `steps.min` | `Nullable`\<`number`\> |
| `steps.step` | `Nullable`\<`number`\> |

***

### ProtectRingtoneConfigInterface

A semi-complete description of the UniFi Protect ringtone JSON.

#### Indexable

```ts
[key: string]: ProtectKnownJsonValue
```

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="id-9"></a> `id` | `string` |
| <a id="isdefault-1"></a> `isDefault` | `boolean` |
| <a id="modelkey-7"></a> `modelKey` | `"ringtone"` |
| <a id="name-11"></a> `name` | `string` |
| <a id="nvrmac-4"></a> `nvrMac` | `string` |
| <a id="size"></a> `size` | `number` |

***

### ProtectSensorConfigInterface

A semi-complete description of the UniFi Protect sensor JSON.

#### Extends

- [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface)

#### Indexable

```ts
[key: string]: ProtectKnownJsonValue
```

#### Properties

| Property | Type | Inherited from |
| ------ | ------ | ------ |
| <a id="alarmsettings"></a> `alarmSettings` | \{ `isEnabled`: `boolean`; \} | - |
| `alarmSettings.isEnabled` | `boolean` | - |
| <a id="alarmtriggeredat"></a> `alarmTriggeredAt` | `Nullable`\<`number`\> | - |
| <a id="anonymousdeviceid-5"></a> `anonymousDeviceId` | `Nullable`\<`string`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`anonymousDeviceId`](#anonymousdeviceid-2) |
| <a id="batterystatus"></a> `batteryStatus` | \{ `isLow`: `boolean`; `percentage`: `Nullable`\<`number`\>; \} | - |
| `batteryStatus.isLow` | `boolean` | - |
| `batteryStatus.percentage` | `Nullable`\<`number`\> | - |
| <a id="bluetoothconnectionstate"></a> `bluetoothConnectionState` | \{ `signalQuality`: `number`; `signalStrength`: `number`; \} | - |
| `bluetoothConnectionState.signalQuality` | `number` | - |
| `bluetoothConnectionState.signalStrength` | `number` | - |
| <a id="bridge"></a> `bridge` | `string` | - |
| <a id="bridgecandidates"></a> `bridgeCandidates` | \[\] | - |
| <a id="camera-2"></a> `camera` | `string` | - |
| <a id="canadopt-4"></a> `canAdopt` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`canAdopt`](#canadopt-2) |
| <a id="connectedsince-4"></a> `connectedSince` | `number` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`connectedSince`](#connectedsince-2) |
| <a id="connectionhost-4"></a> `connectionHost` | `Nullable`\<`string`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`connectionHost`](#connectionhost-2) |
| <a id="connectiontype"></a> `connectionType` | `string` | - |
| <a id="displayname-4"></a> `displayName` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`displayName`](#displayname-2) |
| <a id="firmwarebuild-4"></a> `firmwareBuild` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`firmwareBuild`](#firmwarebuild-2) |
| <a id="firmwareversion-5"></a> `firmwareVersion` | `Nullable`\<`string`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`firmwareVersion`](#firmwareversion-2) |
| <a id="fwupdatestate-4"></a> `fwUpdateState` | `Nullable`\<`string`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`fwUpdateState`](#fwupdatestate-2) |
| <a id="globalalarmmanagerscopenames-4"></a> `globalAlarmManagerScopeNames` | `string`[] | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`globalAlarmManagerScopeNames`](#globalalarmmanagerscopenames-2) |
| <a id="guid-4"></a> `guid` | `Nullable`\<`string`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`guid`](#guid-2) |
| <a id="hardwarerevision-5"></a> `hardwareRevision` | `Nullable`\<`string`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`hardwareRevision`](#hardwarerevision-2) |
| <a id="host-5"></a> `host` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`host`](#host-2) |
| <a id="humiditysettings"></a> `humiditySettings` | [`ProtectThresholdSettingsInterface`](#protectthresholdsettingsinterface) | - |
| <a id="id-10"></a> `id` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`id`](#id-3) |
| <a id="isadopted-4"></a> `isAdopted` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isAdopted`](#isadopted-2) |
| <a id="isadoptedbyother-4"></a> `isAdoptedByOther` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isAdoptedByOther`](#isadoptedbyother-2) |
| <a id="isadopting-4"></a> `isAdopting` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isAdopting`](#isadopting-2) |
| <a id="isattemptingtoconnect-4"></a> `isAttemptingToConnect` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isAttemptingToConnect`](#isattemptingtoconnect-2) |
| <a id="isblockedbyarmmode-4"></a> `isBlockedByArmMode` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isBlockedByArmMode`](#isblockedbyarmmode-2) |
| <a id="isconnected-4"></a> `isConnected` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isConnected`](#isconnected-2) |
| <a id="isdownloadingfw-4"></a> `isDownloadingFW` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isDownloadingFW`](#isdownloadingfw-2) |
| <a id="ismotiondetected-1"></a> `isMotionDetected` | `boolean` | - |
| <a id="isopened"></a> `isOpened` | `Nullable`\<`boolean`\> | - |
| <a id="isprovisioned-4"></a> `isProvisioned` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isProvisioned`](#isprovisioned-2) |
| <a id="isrebooting-4"></a> `isRebooting` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isRebooting`](#isrebooting-2) |
| <a id="isrestoring-4"></a> `isRestoring` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isRestoring`](#isrestoring-2) |
| <a id="issshenabled-5"></a> `isSshEnabled` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isSshEnabled`](#issshenabled-2) |
| <a id="isupdating-5"></a> `isUpdating` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isUpdating`](#isupdating-2) |
| <a id="lastdisconnect-4"></a> `lastDisconnect` | `Nullable`\<`number`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`lastDisconnect`](#lastdisconnect-2) |
| <a id="lastseen-5"></a> `lastSeen` | `number` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`lastSeen`](#lastseen-2) |
| <a id="latestfirmwaresizebytes-4"></a> `latestFirmwareSizeBytes` | `Nullable`\<`number`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`latestFirmwareSizeBytes`](#latestfirmwaresizebytes-2) |
| <a id="latestfirmwareversion-4"></a> `latestFirmwareVersion` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`latestFirmwareVersion`](#latestfirmwareversion-2) |
| <a id="leakdetectedat"></a> `leakDetectedAt` | `Nullable`\<`number`\> | - |
| <a id="leaksettings"></a> `leakSettings` | \{ `isExternalEnabled`: `boolean`; `isInternalEnabled`: `boolean`; \} | - |
| `leakSettings.isExternalEnabled` | `boolean` | - |
| `leakSettings.isInternalEnabled` | `boolean` | - |
| <a id="ledsettings-1"></a> `ledSettings` | \{ `isEnabled`: `boolean`; \} | - |
| `ledSettings.isEnabled` | `boolean` | - |
| <a id="lightsettings"></a> `lightSettings` | [`ProtectThresholdSettingsInterface`](#protectthresholdsettingsinterface) | - |
| <a id="mac-5"></a> `mac` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`mac`](#mac-2) |
| <a id="marketname-5"></a> `marketName` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`marketName`](#marketname-2) |
| <a id="modelkey-8"></a> `modelKey` | `"sensor"` | - |
| <a id="motiondetectedat"></a> `motionDetectedAt` | `number` | - |
| <a id="motionsettings"></a> `motionSettings` | \{ `isEnabled`: `boolean`; `sensitivity`: `number`; \} | - |
| `motionSettings.isEnabled` | `boolean` | - |
| `motionSettings.sensitivity` | `number` | - |
| <a id="mounttype"></a> `mountType` | `string` | - |
| <a id="name-12"></a> `name?` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`name`](#name-3) |
| <a id="nvrmac-5"></a> `nvrMac` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`nvrMac`](#nvrmac-2) |
| <a id="openstatuschangedat"></a> `openStatusChangedAt` | `number` | - |
| <a id="state-5"></a> `state` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`state`](#state-2) |
| <a id="stats-1"></a> `stats?` | \{ `humidity?`: [`ProtectAirQualityMetricInterface`](#protectairqualitymetricinterface); `light?`: [`ProtectAirQualityMetricInterface`](#protectairqualitymetricinterface); `temperature?`: [`ProtectAirQualityMetricInterface`](#protectairqualitymetricinterface); \} | - |
| `stats.humidity?` | [`ProtectAirQualityMetricInterface`](#protectairqualitymetricinterface) | - |
| `stats.light?` | [`ProtectAirQualityMetricInterface`](#protectairqualitymetricinterface) | - |
| `stats.temperature?` | [`ProtectAirQualityMetricInterface`](#protectairqualitymetricinterface) | - |
| <a id="supportfilecreatedat-4"></a> `supportFileCreatedAt` | `Nullable`\<`number`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`supportFileCreatedAt`](#supportfilecreatedat-2) |
| <a id="supportfilename-4"></a> `supportFileName` | `Nullable`\<`string`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`supportFileName`](#supportfilename-2) |
| <a id="supportfilestate-4"></a> `supportFileState` | `Nullable`\<`string`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`supportFileState`](#supportfilestate-2) |
| <a id="sysid-4"></a> `sysid` | `Nullable`\<`string`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`sysid`](#sysid-2) |
| <a id="tamperingdetectedat"></a> `tamperingDetectedAt` | `Nullable`\<`number`\> | - |
| <a id="temperaturesettings"></a> `temperatureSettings` | [`ProtectThresholdSettingsInterface`](#protectthresholdsettingsinterface) | - |
| <a id="type-10"></a> `type` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`type`](#type-3) |
| <a id="uplinkdevice-4"></a> `uplinkDevice` | `Nullable`\<`string`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`uplinkDevice`](#uplinkdevice-2) |
| <a id="upsince-5"></a> `upSince` | `number` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`upSince`](#upsince-2) |
| <a id="uptime-4"></a> `uptime` | `number` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`uptime`](#uptime-2) |
| <a id="wificonnectionstate-2"></a> `wifiConnectionState` | [`ProtectWifiConnectionStateInterface`](#protectwificonnectionstateinterface) | - |
| <a id="wiredconnectionstate-3"></a> `wiredConnectionState` | [`ProtectWiredConnectionStateInterface`](#protectwiredconnectionstateinterface) | - |

***

### ProtectSmartZoneInterface

The common properties shared by all UniFi Protect smart detection and motion zone objects.

#### Indexable

```ts
[key: string]: ProtectKnownJsonValue
```

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="color"></a> `color` | `string` |
| <a id="id-11"></a> `id` | `number` |
| <a id="istriggerlightenabled"></a> `isTriggerLightEnabled` | `boolean` |
| <a id="mergeid"></a> `mergeId` | `Nullable`\<`string`\> |
| <a id="name-13"></a> `name` | `string` |
| <a id="points"></a> `points` | \[`number`, `number`\][] |
| <a id="sensitivity"></a> `sensitivity` | `number` |

***

### ProtectThresholdSettingsInterface

A description of threshold settings for environmental metrics (humidity, light, temperature) on a UniFi Protect sensor.

#### Indexable

```ts
[key: string]: ProtectKnownJsonValue
```

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="highthreshold-1"></a> `highThreshold` | `number` |
| <a id="isenabled-1"></a> `isEnabled` | `boolean` |
| <a id="lowthreshold-1"></a> `lowThreshold` | `number` |
| <a id="margin"></a> `margin` | `number` |

***

### ProtectViewerConfigInterface

A semi-complete description of the UniFi Protect viewer JSON.

#### Extends

- [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface)

#### Indexable

```ts
[key: string]: ProtectKnownJsonValue
```

#### Properties

| Property | Type | Inherited from |
| ------ | ------ | ------ |
| <a id="anonymousdeviceid-6"></a> `anonymousDeviceId` | `Nullable`\<`string`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`anonymousDeviceId`](#anonymousdeviceid-2) |
| <a id="canadopt-5"></a> `canAdopt` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`canAdopt`](#canadopt-2) |
| <a id="connectedsince-5"></a> `connectedSince` | `number` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`connectedSince`](#connectedsince-2) |
| <a id="connectionhost-5"></a> `connectionHost` | `Nullable`\<`string`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`connectionHost`](#connectionhost-2) |
| <a id="displayname-5"></a> `displayName` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`displayName`](#displayname-2) |
| <a id="enablecontinuousmonitoring"></a> `enableContinuousMonitoring` | `boolean` | - |
| <a id="featureflags-3"></a> `featureFlags` | \{ `supportAdjustBrightness`: `boolean`; `supportLiveview`: `boolean`; `supportLocate`: `boolean`; `supportManualDownloadSupportFile`: `boolean`; `supportManualFirmwareUpdate`: `boolean`; `supportMic`: `boolean`; `supportSsh`: `boolean`; \} | - |
| `featureFlags.supportAdjustBrightness` | `boolean` | - |
| `featureFlags.supportLiveview` | `boolean` | - |
| `featureFlags.supportLocate` | `boolean` | - |
| `featureFlags.supportManualDownloadSupportFile` | `boolean` | - |
| `featureFlags.supportManualFirmwareUpdate` | `boolean` | - |
| `featureFlags.supportMic` | `boolean` | - |
| `featureFlags.supportSsh` | `boolean` | - |
| <a id="firmwarebuild-5"></a> `firmwareBuild` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`firmwareBuild`](#firmwarebuild-2) |
| <a id="firmwareversion-6"></a> `firmwareVersion` | `Nullable`\<`string`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`firmwareVersion`](#firmwareversion-2) |
| <a id="fwupdatestate-5"></a> `fwUpdateState` | `Nullable`\<`string`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`fwUpdateState`](#fwupdatestate-2) |
| <a id="globalalarmmanagerscopenames-5"></a> `globalAlarmManagerScopeNames` | `string`[] | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`globalAlarmManagerScopeNames`](#globalalarmmanagerscopenames-2) |
| <a id="guid-5"></a> `guid` | `Nullable`\<`string`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`guid`](#guid-2) |
| <a id="hardwarerevision-6"></a> `hardwareRevision` | `Nullable`\<`string`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`hardwareRevision`](#hardwarerevision-2) |
| <a id="host-6"></a> `host` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`host`](#host-2) |
| <a id="id-12"></a> `id` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`id`](#id-3) |
| <a id="isaccessdevice-1"></a> `isAccessDevice` | `boolean` | - |
| <a id="isadopted-5"></a> `isAdopted` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isAdopted`](#isadopted-2) |
| <a id="isadoptedbyother-5"></a> `isAdoptedByOther` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isAdoptedByOther`](#isadoptedbyother-2) |
| <a id="isadopting-5"></a> `isAdopting` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isAdopting`](#isadopting-2) |
| <a id="isattemptingtoconnect-5"></a> `isAttemptingToConnect` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isAttemptingToConnect`](#isattemptingtoconnect-2) |
| <a id="isblockedbyarmmode-5"></a> `isBlockedByArmMode` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isBlockedByArmMode`](#isblockedbyarmmode-2) |
| <a id="isconnected-5"></a> `isConnected` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isConnected`](#isconnected-2) |
| <a id="isdownloadingfw-5"></a> `isDownloadingFW` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isDownloadingFW`](#isdownloadingfw-2) |
| <a id="isprovisioned-5"></a> `isProvisioned` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isProvisioned`](#isprovisioned-2) |
| <a id="isrebooting-5"></a> `isRebooting` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isRebooting`](#isrebooting-2) |
| <a id="isrestoring-5"></a> `isRestoring` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isRestoring`](#isrestoring-2) |
| <a id="issshenabled-6"></a> `isSshEnabled` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isSshEnabled`](#issshenabled-2) |
| <a id="isupdating-6"></a> `isUpdating` | `boolean` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`isUpdating`](#isupdating-2) |
| <a id="lastdisconnect-5"></a> `lastDisconnect` | `Nullable`\<`number`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`lastDisconnect`](#lastdisconnect-2) |
| <a id="lastseen-6"></a> `lastSeen` | `number` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`lastSeen`](#lastseen-2) |
| <a id="latestfirmwaresizebytes-5"></a> `latestFirmwareSizeBytes` | `Nullable`\<`number`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`latestFirmwareSizeBytes`](#latestfirmwaresizebytes-2) |
| <a id="latestfirmwareversion-5"></a> `latestFirmwareVersion` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`latestFirmwareVersion`](#latestfirmwareversion-2) |
| <a id="liveview"></a> `liveview` | `Nullable`\<`string`\> | - |
| <a id="mac-6"></a> `mac` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`mac`](#mac-2) |
| <a id="marketname-6"></a> `marketName` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`marketName`](#marketname-2) |
| <a id="modelkey-9"></a> `modelKey` | `"viewer"` | - |
| <a id="name-14"></a> `name?` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`name`](#name-3) |
| <a id="needupdatebeforeadoption-1"></a> `needUpdateBeforeAdoption` | `boolean` | - |
| <a id="nvrmac-6"></a> `nvrMac` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`nvrMac`](#nvrmac-2) |
| <a id="softwareversion"></a> `softwareVersion` | `Nullable`\<`string`\> | - |
| <a id="state-6"></a> `state` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`state`](#state-2) |
| <a id="streamlimit"></a> `streamLimit` | `number` | - |
| <a id="supportfilecreatedat-5"></a> `supportFileCreatedAt` | `Nullable`\<`number`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`supportFileCreatedAt`](#supportfilecreatedat-2) |
| <a id="supportfilename-5"></a> `supportFileName` | `Nullable`\<`string`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`supportFileName`](#supportfilename-2) |
| <a id="supportfilestate-5"></a> `supportFileState` | `Nullable`\<`string`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`supportFileState`](#supportfilestate-2) |
| <a id="supportucp4-1"></a> `supportUcp4` | `boolean` | - |
| <a id="sysid-5"></a> `sysid` | `Nullable`\<`string`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`sysid`](#sysid-2) |
| <a id="type-11"></a> `type` | `string` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`type`](#type-3) |
| <a id="uplinkdevice-5"></a> `uplinkDevice` | `Nullable`\<`string`\> | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`uplinkDevice`](#uplinkdevice-2) |
| <a id="upsince-6"></a> `upSince` | `number` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`upSince`](#upsince-2) |
| <a id="uptime-5"></a> `uptime` | `number` | [`ProtectDeviceBaseInterface`](#protectdevicebaseinterface).[`uptime`](#uptime-2) |
| <a id="wificonnectionstate-3"></a> `wifiConnectionState` | [`ProtectWifiConnectionStateInterface`](#protectwificonnectionstateinterface) | - |
| <a id="wiredconnectionstate-4"></a> `wiredConnectionState` | [`ProtectWiredConnectionStateInterface`](#protectwiredconnectionstateinterface) | - |

***

### ProtectWifiConnectionStateInterface

A description of the UniFi Protect device WiFi connection state JSON.

#### Indexable

```ts
[key: string]: ProtectKnownJsonValue
```

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="apname"></a> `apName` | `Nullable`\<`string`\> |
| <a id="bssid"></a> `bssid` | `Nullable`\<`string`\> |
| <a id="channel"></a> `channel` | `Nullable`\<`number`\> |
| <a id="connectivity"></a> `connectivity` | `Nullable`\<`string`\> |
| <a id="experience"></a> `experience` | `Nullable`\<`number`\> |
| <a id="frequency"></a> `frequency` | `Nullable`\<`number`\> |
| <a id="phyrate-1"></a> `phyRate` | `Nullable`\<`number`\> |
| <a id="signalquality"></a> `signalQuality` | `Nullable`\<`number`\> |
| <a id="signalstrength"></a> `signalStrength` | `Nullable`\<`number`\> |
| <a id="ssid"></a> `ssid` | `Nullable`\<`string`\> |
| <a id="txrate"></a> `txRate` | `Nullable`\<`number`\> |

***

### ProtectWiredConnectionStateInterface

A description of the UniFi Protect device wired connection state JSON.

#### Indexable

```ts
[key: string]: ProtectKnownJsonValue
```

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="phyrate-2"></a> `phyRate` | `number` |

## Type Aliases

### ProtectAirQualityMetric

```ts
type ProtectAirQualityMetric = ProtectAirQualityMetricInterface;
```

#### See

[ProtectAirQualityMetricInterface](#protectairqualitymetricinterface)

***

### ProtectAirQualityThresholdSettings

```ts
type ProtectAirQualityThresholdSettings = ProtectAirQualityThresholdSettingsInterface;
```

#### See

[ProtectAirQualityThresholdSettingsInterface](#protectairqualitythresholdsettingsinterface)

***

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

### ProtectCameraLcdMessageConfig

```ts
type ProtectCameraLcdMessageConfig = ProtectCameraLcdMessageConfigInterface;
```

#### See

[ProtectCameraLcdMessageConfigInterface](#protectcameralcdmessageconfiginterface)

***

### ProtectCameraTalkbackConfig

```ts
type ProtectCameraTalkbackConfig = ProtectCameraTalkbackConfigInterface;
```

#### See

[ProtectCameraTalkbackConfigInterface](#protectcameratalkbackconfiginterface)

***

### ProtectChimeConfig

```ts
type ProtectChimeConfig = ProtectChimeConfigInterface;
```

#### See

[ProtectChimeConfigInterface](#protectchimeconfiginterface)

***

### ProtectDeviceBase

```ts
type ProtectDeviceBase = ProtectDeviceBaseInterface;
```

#### See

[ProtectDeviceBaseInterface](#protectdevicebaseinterface)

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
type ProtectEventMetadata = DeepPartial<ProtectEventMetadataInterface>;
```

#### See

[ProtectEventMetadataInterface](#protecteventmetadatainterface)

***

### ProtectEventMetadataDetectedThumbnail

```ts
type ProtectEventMetadataDetectedThumbnail = DeepPartial<ProtectEventMetadataDetectedThumbnailInterface>;
```

#### See

[ProtectEventMetadataDetectedThumbnailInterface](#protecteventmetadatadetectedthumbnailinterface)

***

### ProtectLightConfig

```ts
type ProtectLightConfig = ProtectLightConfigInterface;
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

[ProtectNvrSystemEventControllerInterface](#protectnvrsystemeventcontrollerinterface)

***

### ProtectNvrSystemInfo

```ts
type ProtectNvrSystemInfo = ProtectNvrSystemInfoInterface;
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

### ProtectPtzAxisRange

```ts
type ProtectPtzAxisRange = ProtectPtzAxisRangeInterface;
```

#### See

[ProtectPtzAxisRangeInterface](#protectptzaxisrangeinterface)

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

### ProtectSmartZone

```ts
type ProtectSmartZone = ProtectSmartZoneInterface;
```

#### See

[ProtectSmartZoneInterface](#protectsmartzoneinterface)

***

### ProtectThresholdSettings

```ts
type ProtectThresholdSettings = ProtectThresholdSettingsInterface;
```

#### See

[ProtectThresholdSettingsInterface](#protectthresholdsettingsinterface)

***

### ProtectViewerConfig

```ts
type ProtectViewerConfig = ProtectViewerConfigInterface;
```

#### See

[ProtectViewerConfigInterface](#protectviewerconfiginterface)

***

### ProtectWifiConnectionState

```ts
type ProtectWifiConnectionState = ProtectWifiConnectionStateInterface;
```

#### See

[ProtectWifiConnectionStateInterface](#protectwificonnectionstateinterface)

***

### ProtectWiredConnectionState

```ts
type ProtectWiredConnectionState = ProtectWiredConnectionStateInterface;
```

#### See

[ProtectWiredConnectionStateInterface](#protectwiredconnectionstateinterface)
