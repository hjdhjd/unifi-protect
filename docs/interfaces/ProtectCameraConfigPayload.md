[unifi-protect](../README.md) / [Exports](../modules.md) / ProtectCameraConfigPayload

# Interface: ProtectCameraConfigPayload

## Table of contents

### Properties

- [apMac](ProtectCameraConfigPayload.md#apmac)
- [apRssi](ProtectCameraConfigPayload.md#aprssi)
- [audioBitrate](ProtectCameraConfigPayload.md#audiobitrate)
- [canManage](ProtectCameraConfigPayload.md#canmanage)
- [channels](ProtectCameraConfigPayload.md#channels)
- [chimeDuration](ProtectCameraConfigPayload.md#chimeduration)
- [connectedSince](ProtectCameraConfigPayload.md#connectedsince)
- [connectionHost](ProtectCameraConfigPayload.md#connectionhost)
- [elementInfo](ProtectCameraConfigPayload.md#elementinfo)
- [featureFlags](ProtectCameraConfigPayload.md#featureflags)
- [firmwareBuild](ProtectCameraConfigPayload.md#firmwarebuild)
- [firmwareVersion](ProtectCameraConfigPayload.md#firmwareversion)
- [hardwareRevision](ProtectCameraConfigPayload.md#hardwarerevision)
- [hasSpeaker](ProtectCameraConfigPayload.md#hasspeaker)
- [hasWifi](ProtectCameraConfigPayload.md#haswifi)
- [hdrMode](ProtectCameraConfigPayload.md#hdrmode)
- [host](ProtectCameraConfigPayload.md#host)
- [id](ProtectCameraConfigPayload.md#id)
- [isAdopted](ProtectCameraConfigPayload.md#isadopted)
- [isAdoptedByOther](ProtectCameraConfigPayload.md#isadoptedbyother)
- [isAdopting](ProtectCameraConfigPayload.md#isadopting)
- [isAttemptingToConnect](ProtectCameraConfigPayload.md#isattemptingtoconnect)
- [isConnected](ProtectCameraConfigPayload.md#isconnected)
- [isDark](ProtectCameraConfigPayload.md#isdark)
- [isDeleting](ProtectCameraConfigPayload.md#isdeleting)
- [isHidden](ProtectCameraConfigPayload.md#ishidden)
- [isLiveHeatmapEnabled](ProtectCameraConfigPayload.md#isliveheatmapenabled)
- [isManaged](ProtectCameraConfigPayload.md#ismanaged)
- [isMicEnabled](ProtectCameraConfigPayload.md#ismicenabled)
- [isMotionDetected](ProtectCameraConfigPayload.md#ismotiondetected)
- [isProbingForWifi](ProtectCameraConfigPayload.md#isprobingforwifi)
- [isProvisioned](ProtectCameraConfigPayload.md#isprovisioned)
- [isRebooting](ProtectCameraConfigPayload.md#isrebooting)
- [isRecording](ProtectCameraConfigPayload.md#isrecording)
- [isSshEnabled](ProtectCameraConfigPayload.md#issshenabled)
- [isUpdating](ProtectCameraConfigPayload.md#isupdating)
- [ispSettings](ProtectCameraConfigPayload.md#ispsettings)
- [lastMotion](ProtectCameraConfigPayload.md#lastmotion)
- [lastRing](ProtectCameraConfigPayload.md#lastring)
- [lastSeen](ProtectCameraConfigPayload.md#lastseen)
- [latestFirmwareVersion](ProtectCameraConfigPayload.md#latestfirmwareversion)
- [lcdMessage](ProtectCameraConfigPayload.md#lcdmessage)
- [ledSettings](ProtectCameraConfigPayload.md#ledsettings)
- [lenses](ProtectCameraConfigPayload.md#lenses)
- [mac](ProtectCameraConfigPayload.md#mac)
- [marketName](ProtectCameraConfigPayload.md#marketname)
- [micVolume](ProtectCameraConfigPayload.md#micvolume)
- [modelKey](ProtectCameraConfigPayload.md#modelkey)
- [name](ProtectCameraConfigPayload.md#name)
- [osdSettings](ProtectCameraConfigPayload.md#osdsettings)
- [phyRate](ProtectCameraConfigPayload.md#phyrate)
- [pirSettings](ProtectCameraConfigPayload.md#pirsettings)
- [platform](ProtectCameraConfigPayload.md#platform)
- [recordingSchedule](ProtectCameraConfigPayload.md#recordingschedule)
- [recordingSettings](ProtectCameraConfigPayload.md#recordingsettings)
- [smartDetectLines](ProtectCameraConfigPayload.md#smartdetectlines)
- [smartDetectSettings](ProtectCameraConfigPayload.md#smartdetectsettings)
- [smartDetectZones](ProtectCameraConfigPayload.md#smartdetectzones)
- [speakerSettings](ProtectCameraConfigPayload.md#speakersettings)
- [state](ProtectCameraConfigPayload.md#state)
- [stats](ProtectCameraConfigPayload.md#stats)
- [talkbackSettings](ProtectCameraConfigPayload.md#talkbacksettings)
- [type](ProtectCameraConfigPayload.md#type)
- [upSince](ProtectCameraConfigPayload.md#upsince)
- [wifiConnectionState](ProtectCameraConfigPayload.md#wificonnectionstate)
- [wiredConnectionState](ProtectCameraConfigPayload.md#wiredconnectionstate)

## Properties

### apMac

• `Optional` **apMac**: `string`

#### Defined in

[src/protect-types.ts:182](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L182)

___

### apRssi

• `Optional` **apRssi**: `string`

#### Defined in

[src/protect-types.ts:183](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L183)

___

### audioBitrate

• `Optional` **audioBitrate**: `number`

#### Defined in

[src/protect-types.ts:184](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L184)

___

### canManage

• `Optional` **canManage**: `DeepPartial`<`boolean`\>

#### Defined in

[src/protect-types.ts:185](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L185)

___

### channels

• `Optional` **channels**: `DeepPartial`<[`ProtectCameraChannelConfigInterface`](ProtectCameraChannelConfigInterface.md)\>[]

#### Defined in

[src/protect-types.ts:186](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L186)

___

### chimeDuration

• `Optional` **chimeDuration**: `number`

#### Defined in

[src/protect-types.ts:187](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L187)

___

### connectedSince

• `Optional` **connectedSince**: `number`

#### Defined in

[src/protect-types.ts:188](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L188)

___

### connectionHost

• `Optional` **connectionHost**: `string`

#### Defined in

[src/protect-types.ts:189](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L189)

___

### elementInfo

• `Optional` **elementInfo**: ``null``

#### Defined in

[src/protect-types.ts:190](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L190)

___

### featureFlags

• `Optional` **featureFlags**: `DeepPartial`<{ `canAdjustIrLedLevel`: `boolean` ; `canMagicZoom`: `boolean` ; `canOpticalZoom`: `boolean` ; `canTouchFocus`: `boolean` ; `hasAccelerometer`: `boolean` ; `hasAec`: `boolean` ; `hasAutoICROnly`: `boolean` ; `hasBattery`: `boolean` ; `hasBluetooth`: `boolean` ; `hasChime`: `boolean` ; `hasExternalIr`: `boolean` ; `hasHdr`: `boolean` ; `hasIcrSensitivity`: `boolean` ; `hasLcdScreen`: `boolean` ; `hasLdc`: `boolean` ; `hasLedIr`: `boolean` ; `hasLedStatus`: `boolean` ; `hasLineIn`: `boolean` ; `hasMic`: `boolean` ; `hasMotionZones`: `boolean` ; `hasNewMotionAlgorithm`: `boolean` ; `hasPackageCamera`: `boolean` ; `hasPrivacyMask`: `boolean` ; `hasRtc`: `boolean` ; `hasSdCard`: `boolean` ; `hasSmartDetect`: `boolean` ; `hasSpeaker`: `boolean` ; `hasSquareEventThumbnail`: `boolean` ; `hasWifi`: `boolean` ; `isDoorbell`: `boolean` ; `motionAlgorithms`: `string`[] ; `privacyMaskCapability`: { `maxMasks`: `number` ; `rectangleOnly`: `boolean`  } ; `smartDetectTypes`: `string`[] ; `videoModeMaxFps`: `number`[] ; `videoModes`: `string`[]  }\>

#### Defined in

[src/protect-types.ts:191](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L191)

___

### firmwareBuild

• `Optional` **firmwareBuild**: `string`

#### Defined in

[src/protect-types.ts:232](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L232)

___

### firmwareVersion

• `Optional` **firmwareVersion**: `string`

#### Defined in

[src/protect-types.ts:233](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L233)

___

### hardwareRevision

• `Optional` **hardwareRevision**: `string`

#### Defined in

[src/protect-types.ts:234](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L234)

___

### hasSpeaker

• `Optional` **hasSpeaker**: `DeepPartial`<`boolean`\>

#### Defined in

[src/protect-types.ts:235](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L235)

___

### hasWifi

• `Optional` **hasWifi**: `DeepPartial`<`boolean`\>

#### Defined in

[src/protect-types.ts:236](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L236)

___

### hdrMode

• `Optional` **hdrMode**: `DeepPartial`<`boolean`\>

#### Defined in

[src/protect-types.ts:237](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L237)

___

### host

• `Optional` **host**: `string`

#### Defined in

[src/protect-types.ts:238](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L238)

___

### id

• `Optional` **id**: `string`

#### Defined in

[src/protect-types.ts:239](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L239)

___

### isAdopted

• `Optional` **isAdopted**: `DeepPartial`<`boolean`\>

#### Defined in

[src/protect-types.ts:240](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L240)

___

### isAdoptedByOther

• `Optional` **isAdoptedByOther**: `DeepPartial`<`boolean`\>

#### Defined in

[src/protect-types.ts:241](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L241)

___

### isAdopting

• `Optional` **isAdopting**: `DeepPartial`<`boolean`\>

#### Defined in

[src/protect-types.ts:242](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L242)

___

### isAttemptingToConnect

• `Optional` **isAttemptingToConnect**: `DeepPartial`<`boolean`\>

#### Defined in

[src/protect-types.ts:243](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L243)

___

### isConnected

• `Optional` **isConnected**: `DeepPartial`<`boolean`\>

#### Defined in

[src/protect-types.ts:244](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L244)

___

### isDark

• `Optional` **isDark**: `DeepPartial`<`boolean`\>

#### Defined in

[src/protect-types.ts:245](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L245)

___

### isDeleting

• `Optional` **isDeleting**: `DeepPartial`<`boolean`\>

#### Defined in

[src/protect-types.ts:246](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L246)

___

### isHidden

• `Optional` **isHidden**: `DeepPartial`<`boolean`\>

#### Defined in

[src/protect-types.ts:247](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L247)

___

### isLiveHeatmapEnabled

• `Optional` **isLiveHeatmapEnabled**: `DeepPartial`<`boolean`\>

#### Defined in

[src/protect-types.ts:248](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L248)

___

### isManaged

• `Optional` **isManaged**: `DeepPartial`<`boolean`\>

#### Defined in

[src/protect-types.ts:249](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L249)

___

### isMicEnabled

• `Optional` **isMicEnabled**: `DeepPartial`<`boolean`\>

#### Defined in

[src/protect-types.ts:250](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L250)

___

### isMotionDetected

• `Optional` **isMotionDetected**: `DeepPartial`<`boolean`\>

#### Defined in

[src/protect-types.ts:251](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L251)

___

### isProbingForWifi

• `Optional` **isProbingForWifi**: `DeepPartial`<`boolean`\>

#### Defined in

[src/protect-types.ts:252](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L252)

___

### isProvisioned

• `Optional` **isProvisioned**: `DeepPartial`<`boolean`\>

#### Defined in

[src/protect-types.ts:253](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L253)

___

### isRebooting

• `Optional` **isRebooting**: `DeepPartial`<`boolean`\>

#### Defined in

[src/protect-types.ts:254](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L254)

___

### isRecording

• `Optional` **isRecording**: `DeepPartial`<`boolean`\>

#### Defined in

[src/protect-types.ts:255](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L255)

___

### isSshEnabled

• `Optional` **isSshEnabled**: `DeepPartial`<`boolean`\>

#### Defined in

[src/protect-types.ts:256](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L256)

___

### isUpdating

• `Optional` **isUpdating**: `DeepPartial`<`boolean`\>

#### Defined in

[src/protect-types.ts:257](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L257)

___

### ispSettings

• `Optional` **ispSettings**: `DeepPartial`<{ `aeMode`: `string` ; `brightness`: `number` ; `contrast`: `number` ; `dZoomCenterX`: `number` ; `dZoomCenterY`: `number` ; `dZoomScale`: `number` ; `dZoomStreamId`: `number` ; `denoise`: `number` ; `focusMode`: `string` ; `focusPosition`: `number` ; `hue`: `number` ; `icrSensitivity`: `number` ; `irLedLevel`: `number` ; `irLedMode`: `string` ; `is3dnrEnabled`: `boolean` ; `isAggressiveAntiFlickerEnabled`: `boolean` ; `isAutoRotateEnabled`: `boolean` ; `isExternalIrEnabled`: `boolean` ; `isFlippedHorizontal`: `boolean` ; `isFlippedVertical`: `boolean` ; `isLdcEnabled`: `boolean` ; `isPauseMotionEnabled`: `boolean` ; `saturation`: `number` ; `sharpness`: `number` ; `touchFocusX`: `number` ; `touchFocusY`: `number` ; `wdr`: `number` ; `zoomPosition`: `number`  }\>

#### Defined in

[src/protect-types.ts:258](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L258)

___

### lastMotion

• `Optional` **lastMotion**: `number`

#### Defined in

[src/protect-types.ts:289](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L289)

___

### lastRing

• `Optional` **lastRing**: `DeepPartial`<``null`` \| `number`\>

#### Defined in

[src/protect-types.ts:290](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L290)

___

### lastSeen

• `Optional` **lastSeen**: `number`

#### Defined in

[src/protect-types.ts:291](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L291)

___

### latestFirmwareVersion

• `Optional` **latestFirmwareVersion**: `string`

#### Defined in

[src/protect-types.ts:292](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L292)

___

### lcdMessage

• `Optional` **lcdMessage**: `DeepPartial`<[`ProtectCameraLcdMessageConfigInterface`](ProtectCameraLcdMessageConfigInterface.md)\>

#### Defined in

[src/protect-types.ts:293](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L293)

___

### ledSettings

• `Optional` **ledSettings**: `DeepPartial`<{ `blinkRate`: `number` ; `isEnabled`: `boolean`  }\>

#### Defined in

[src/protect-types.ts:294](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L294)

___

### lenses

• `Optional` **lenses**: `DeepPartial`<{ `id`: `number` ; `video`: { `recordingEnd`: ``null`` \| `number` ; `recordingEndLQ`: ``null`` \| `number` ; `recordingStart`: ``null`` \| `number` ; `recordingStartLQ`: ``null`` \| `number` ; `timelapseEnd`: ``null`` \| `number` ; `timelapseEndLQ`: ``null`` \| `number` ; `timelapseStart`: ``null`` \| `number` ; `timelapseStartLQ`: ``null`` \| `number`  }  }\>[]

#### Defined in

[src/protect-types.ts:299](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L299)

___

### mac

• `Optional` **mac**: `string`

#### Defined in

[src/protect-types.ts:313](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L313)

___

### marketName

• `Optional` **marketName**: `string`

#### Defined in

[src/protect-types.ts:314](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L314)

___

### micVolume

• `Optional` **micVolume**: `number`

#### Defined in

[src/protect-types.ts:315](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L315)

___

### modelKey

• `Optional` **modelKey**: `string`

#### Defined in

[src/protect-types.ts:316](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L316)

___

### name

• `Optional` **name**: `string`

#### Defined in

[src/protect-types.ts:317](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L317)

___

### osdSettings

• `Optional` **osdSettings**: `DeepPartial`<{ `isDateEnabled`: `boolean` ; `isDebugEnabled`: `boolean` ; `isLogoEnabled`: `boolean` ; `isNameEnabled`: `boolean`  }\>

#### Defined in

[src/protect-types.ts:318](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L318)

___

### phyRate

• `Optional` **phyRate**: `number`

#### Defined in

[src/protect-types.ts:325](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L325)

___

### pirSettings

• `Optional` **pirSettings**: `DeepPartial`<{ `pirMotionClipLength`: `number` ; `pirSensitivity`: `number` ; `timelapseFrameInterval`: `number` ; `timelapseTransferInterval`: `number`  }\>

#### Defined in

[src/protect-types.ts:326](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L326)

___

### platform

• `Optional` **platform**: `string`

#### Defined in

[src/protect-types.ts:333](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L333)

___

### recordingSchedule

• `Optional` **recordingSchedule**: ``null``

#### Defined in

[src/protect-types.ts:334](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L334)

___

### recordingSettings

• `Optional` **recordingSettings**: `DeepPartial`<{ `enablePirTimelapse`: `boolean` ; `endMotionEventDelay`: `number` ; `geofencing`: `string` ; `minMotionEventTrigger`: `number` ; `mode`: `string` ; `postPaddingSecs`: `number` ; `prePaddingSecs`: `number` ; `retentionDurationMs`: ``null`` \| `number` ; `suppressIlluminationSurge`: `boolean` ; `useNewMotionAlgorithm`: `boolean`  }\>

#### Defined in

[src/protect-types.ts:335](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L335)

___

### smartDetectLines

• `Optional` **smartDetectLines**: `never`[]

#### Defined in

[src/protect-types.ts:348](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L348)

___

### smartDetectSettings

• `Optional` **smartDetectSettings**: `DeepPartial`<{ `objectTypes`: `string`[]  }\>

#### Defined in

[src/protect-types.ts:349](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L349)

___

### smartDetectZones

• `Optional` **smartDetectZones**: `DeepPartial`<{ `color`: `string` ; `name`: `string` ; `objectTypes`: `string`[] ; `points`: [`number`, `number`][] ; `sensitivity`: `number`  }\>[]

#### Defined in

[src/protect-types.ts:353](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L353)

___

### speakerSettings

• `Optional` **speakerSettings**: `DeepPartial`<{ `areSystemSoundsEnabled`: `boolean` ; `isEnabled`: `boolean` ; `volume`: `number`  }\>

#### Defined in

[src/protect-types.ts:361](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L361)

___

### state

• `Optional` **state**: `string`

#### Defined in

[src/protect-types.ts:367](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L367)

___

### stats

• `Optional` **stats**: `DeepPartial`<{ `battery`: { `isCharging`: `boolean` ; `percentage`: ``null`` \| `number` ; `sleepState`: `string`  } ; `rxBytes`: `number` ; `storage`: { `rate`: `number` ; `used`: `number`  } ; `txBytes`: `number` ; `video`: { `recordingEnd`: `number` ; `recordingEndLQ`: `number` ; `recordingStart`: `number` ; `recordingStartLQ`: `number` ; `timelapseEnd`: `number` ; `timelapseEndLQ`: `number` ; `timelapseStart`: `number` ; `timelapseStartLQ`: `number`  } ; `wifi`: { `channel`: ``null`` \| `number` ; `frequency`: ``null`` \| `number` ; `linkSpeedMbps`: ``null`` \| `number` ; `signalQuality`: `number` ; `signalStrength`: `number`  } ; `wifiQuality`: `number` ; `wifiStrength`: `number`  }\>

#### Defined in

[src/protect-types.ts:368](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L368)

___

### talkbackSettings

• `Optional` **talkbackSettings**: `DeepPartial`<{ `bindAddr`: `string` ; `bindPort`: `number` ; `bitsPerSample`: `number` ; `channels`: `number` ; `filterAddr`: `string` ; `filterPort`: `number` ; `quality`: `number` ; `samplingRate`: `number` ; `typeFmt`: `string` ; `typeIn`: `string`  }\>

#### Defined in

[src/protect-types.ts:405](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L405)

___

### type

• `Optional` **type**: `string`

#### Defined in

[src/protect-types.ts:418](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L418)

___

### upSince

• `Optional` **upSince**: `number`

#### Defined in

[src/protect-types.ts:419](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L419)

___

### wifiConnectionState

• `Optional` **wifiConnectionState**: `DeepPartial`<{ `channel`: `number` ; `frequency`: `number` ; `phyRate`: `number` ; `signalQuality`: `number` ; `signalStrength`: `number`  }\>

#### Defined in

[src/protect-types.ts:420](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L420)

___

### wiredConnectionState

• `Optional` **wiredConnectionState**: `DeepPartial`<{ `phyRate`: `number`  }\>

#### Defined in

[src/protect-types.ts:428](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-types.ts#L428)
