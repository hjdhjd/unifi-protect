[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectNvrConfigInterface

# Interface: ProtectNvrConfigInterface

A semi-complete description of the UniFi Protect NVR configuration JSON.

## Indexable

```ts
[key: string]: ProtectKnownJsonValue
```

## Properties

| Property | Type |
| ------ | ------ |
| <a id="accessversion"></a> `accessVersion` | `string` |
| <a id="agreements"></a> `agreements` | \{ `aiReportingAgreement`: [`ProtectNvrAgreementInterface`](ProtectNvrAgreementInterface.md); `smartDetectAgreement`: [`ProtectNvrAgreementInterface`](ProtectNvrAgreementInterface.md); \} |
| `agreements.aiReportingAgreement` | [`ProtectNvrAgreementInterface`](ProtectNvrAgreementInterface.md) |
| `agreements.smartDetectAgreement` | [`ProtectNvrAgreementInterface`](ProtectNvrAgreementInterface.md) |
| <a id="aifeaturesettings"></a> `aiFeatureSettings` | \{ `aiSummarySettings`: [`ProtectNvrAiFeatureToggleInterface`](ProtectNvrAiFeatureToggleInterface.md); `faceEnhanceSettings`: [`ProtectNvrAiFeatureToggleInterface`](ProtectNvrAiFeatureToggleInterface.md); `faceRecognitionSettings`: [`ProtectNvrAiFeatureToggleInterface`](ProtectNvrAiFeatureToggleInterface.md); `licensePlateRecognitionSettings`: [`ProtectNvrAiFeatureToggleInterface`](ProtectNvrAiFeatureToggleInterface.md); `recognizeAnythingSettings`: [`ProtectNvrAiFeatureToggleInterface`](ProtectNvrAiFeatureToggleInterface.md); `reverificationSettings`: [`ProtectNvrAiFeatureToggleInterface`](ProtectNvrAiFeatureToggleInterface.md); `speechToTextSettings`: [`ProtectNvrAiFeatureToggleInterface`](ProtectNvrAiFeatureToggleInterface.md); \} |
| `aiFeatureSettings.aiSummarySettings` | [`ProtectNvrAiFeatureToggleInterface`](ProtectNvrAiFeatureToggleInterface.md) |
| `aiFeatureSettings.faceEnhanceSettings` | [`ProtectNvrAiFeatureToggleInterface`](ProtectNvrAiFeatureToggleInterface.md) |
| `aiFeatureSettings.faceRecognitionSettings` | [`ProtectNvrAiFeatureToggleInterface`](ProtectNvrAiFeatureToggleInterface.md) |
| `aiFeatureSettings.licensePlateRecognitionSettings` | [`ProtectNvrAiFeatureToggleInterface`](ProtectNvrAiFeatureToggleInterface.md) |
| `aiFeatureSettings.recognizeAnythingSettings` | [`ProtectNvrAiFeatureToggleInterface`](ProtectNvrAiFeatureToggleInterface.md) |
| `aiFeatureSettings.reverificationSettings` | [`ProtectNvrAiFeatureToggleInterface`](ProtectNvrAiFeatureToggleInterface.md) |
| `aiFeatureSettings.speechToTextSettings` | [`ProtectNvrAiFeatureToggleInterface`](ProtectNvrAiFeatureToggleInterface.md) |
| <a id="allowthirdpartynfccards"></a> `allowThirdPartyNfcCards` | `boolean` |
| <a id="analyticsdata"></a> `analyticsData` | `string` |
| <a id="anonymousdeviceid"></a> `anonymousDeviceId` | `string` |
| <a id="armmode"></a> `armMode` | \{ `armedAt`: `Nullable`\<`number`\>; `breachDetectedAt`: `Nullable`\<`number`\>; `breachEventCount`: `number`; `breachEventId`: `Nullable`\<`string`\>; `breachTriggerEventId`: `Nullable`\<`string`\>; `status`: `string`; `willBeArmedAt`: `Nullable`\<`number`\>; \} |
| `armMode.armedAt` | `Nullable`\<`number`\> |
| `armMode.breachDetectedAt` | `Nullable`\<`number`\> |
| `armMode.breachEventCount` | `number` |
| `armMode.breachEventId` | `Nullable`\<`string`\> |
| `armMode.breachTriggerEventId` | `Nullable`\<`string`\> |
| `armMode.status` | `string` |
| `armMode.willBeArmedAt` | `Nullable`\<`number`\> |
| <a id="autobalancestoragebytes"></a> `autoBalanceStorageBytes` | `number` |
| <a id="autoretentionenabled"></a> `autoRetentionEnabled` | `boolean` |
| <a id="cameracapacity"></a> `cameraCapacity` | \{ `qualities`: \{ `count`: `number`; `fraction`: `number`; `type`: `string`; \}[]; `state`: `string`; \} |
| `cameraCapacity.qualities` | \{ `count`: `number`; `fraction`: `number`; `type`: `string`; \}[] |
| `cameraCapacity.state` | `string` |
| <a id="camerautilization"></a> `cameraUtilization` | `number` |
| <a id="canautoupdate"></a> `canAutoUpdate` | `boolean` |
| <a id="cefsettings"></a> `cefSettings` | \{ `enabledCategories`: `string`[]; `server`: \{ `host`: `string`; `port`: `number`; \}; `syslogMode`: `number`; \} |
| `cefSettings.enabledCategories` | `string`[] |
| `cefSettings.server` | \{ `host`: `string`; `port`: `number`; \} |
| `cefSettings.server.host` | `string` |
| `cefSettings.server.port` | `number` |
| `cefSettings.syslogMode` | `number` |
| <a id="consoleenv"></a> `consoleEnv` | `string` |
| <a id="corruptionstate"></a> `corruptionState` | `string` |
| <a id="countrycode"></a> `countryCode` | `string` |
| <a id="dbrecoveryoptions"></a> `dbRecoveryOptions` | \{ `canRecover`: `Nullable`\<`boolean`\>; `hasConfigBackup`: `Nullable`\<`boolean`\>; `hasDbBackup`: `Nullable`\<`boolean`\>; `hddFailing`: `Nullable`\<`boolean`\>; `partitionReadonly`: `Nullable`\<`boolean`\>; \} |
| `dbRecoveryOptions.canRecover` | `Nullable`\<`boolean`\> |
| `dbRecoveryOptions.hasConfigBackup` | `Nullable`\<`boolean`\> |
| `dbRecoveryOptions.hasDbBackup` | `Nullable`\<`boolean`\> |
| `dbRecoveryOptions.hddFailing` | `Nullable`\<`boolean`\> |
| `dbRecoveryOptions.partitionReadonly` | `Nullable`\<`boolean`\> |
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
| <a id="enablethirdpartycamerasdiscovery"></a> `enableThirdPartyCamerasDiscovery` | `boolean` |
| <a id="errorcode"></a> `errorCode` | `Nullable`\<`string`\> |
| <a id="estimatedhqretentiondays"></a> `estimatedHqRetentionDays` | `Nullable`\<`number`\> |
| <a id="estimatedlqretentiondays"></a> `estimatedLqRetentionDays` | `Nullable`\<`number`\> |
| <a id="expansionunitretention"></a> `expansionUnitRetention` | `ProtectKnownJsonValue`[] |
| <a id="expansionunits"></a> `expansionUnits` | `ProtectKnownJsonValue`[] |
| <a id="featureflags"></a> `featureFlags` | \{ `beta`: `boolean`; `detectionLabels`: `boolean`; `dev`: `boolean`; `hasTwoWayAudioMediaStreams`: `boolean`; `homekitPaired`: `boolean`; `notificationsV2`: `boolean`; `ulpRoleManagement`: `boolean`; \} |
| `featureFlags.beta` | `boolean` |
| `featureFlags.detectionLabels` | `boolean` |
| `featureFlags.dev` | `boolean` |
| `featureFlags.hasTwoWayAudioMediaStreams` | `boolean` |
| `featureFlags.homekitPaired` | `boolean` |
| `featureFlags.notificationsV2` | `boolean` |
| `featureFlags.ulpRoleManagement` | `boolean` |
| <a id="firmwareversion"></a> `firmwareVersion` | `string` |
| <a id="foreignpgdumpconsolename"></a> `foreignPgDumpConsoleName` | `Nullable`\<`string`\> |
| <a id="foreignpgdumpdetected"></a> `foreignPgDumpDetected` | `boolean` |
| <a id="guid"></a> `guid` | `string` |
| <a id="harddrivestate"></a> `hardDriveState` | `string` |
| <a id="hardwareid"></a> `hardwareId` | `string` |
| <a id="hardwarerevision"></a> `hardwareRevision` | `string` |
| <a id="hasbackportedretentionsettings"></a> `hasBackportedRetentionSettings` | `boolean` |
| <a id="hasgateway"></a> `hasGateway` | `boolean` |
| <a id="homekiterror"></a> `homekitError` | `Nullable`\<`string`\> |
| <a id="homekitsetupcode"></a> `homekitSetupCode` | `Nullable`\<`string`\> |
| <a id="homekitsetuppayload"></a> `homekitSetupPayload` | `Nullable`\<`string`\> |
| <a id="homekitshutdownreason"></a> `homekitShutdownReason` | `Nullable`\<`string`\> |
| <a id="homekitstatus"></a> `homekitStatus` | `string` |
| <a id="host"></a> `host` | `string` |
| <a id="hosts"></a> `hosts` | `string`[] |
| <a id="hostshortname"></a> `hostShortname` | `string` |
| <a id="hosttype"></a> `hostType` | `number` |
| <a id="id"></a> `id` | `string` |
| <a id="isaccessinstalled"></a> `isAccessInstalled` | `boolean` |
| <a id="isaireportingenabled"></a> `isAiReportingEnabled` | `boolean` |
| <a id="isaway"></a> `isAway` | `boolean` |
| <a id="isedgedevice"></a> `isEdgeDevice` | `boolean` |
| <a id="isfullbackuppreparing"></a> `isFullBackupPreparing` | `boolean` |
| <a id="isfullbackupready"></a> `isFullBackupReady` | `boolean` |
| <a id="ishomekitenabled"></a> `isHomekitEnabled` | `boolean` |
| <a id="isinsightsenabled"></a> `isInsightsEnabled` | `boolean` |
| <a id="ismigrationfailed"></a> `isMigrationFailed` | `boolean` |
| <a id="isnetworkinstalled"></a> `isNetworkInstalled` | `boolean` |
| <a id="isprimary"></a> `isPrimary` | `boolean` |
| <a id="isprotectupdatable"></a> `isProtectUpdatable` | `boolean` |
| <a id="isrecordingdisabled"></a> `isRecordingDisabled` | `boolean` |
| <a id="isrecordingmotiononly"></a> `isRecordingMotionOnly` | `boolean` |
| <a id="isrecordingpauseallowedduringraidsync"></a> `isRecordingPauseAllowedDuringRaidSync` | `Nullable`\<`boolean`\> |
| <a id="isrecycling"></a> `isRecycling` | `boolean` |
| <a id="isremoteaccessenabled"></a> `isRemoteAccessEnabled` | `boolean` |
| <a id="issecondary"></a> `isSecondary` | `boolean` |
| <a id="issetup"></a> `isSetup` | `boolean` |
| <a id="issshenabled"></a> `isSshEnabled` | `boolean` |
| <a id="isstacked"></a> `isStacked` | `boolean` |
| <a id="isucoresetup"></a> `isUCoreSetup` | `boolean` |
| <a id="isucorestacked"></a> `isUCoreStacked` | `boolean` |
| <a id="isucoreupdatable"></a> `isUcoreUpdatable` | `boolean` |
| <a id="isupdating"></a> `isUpdating` | `boolean` |
| <a id="iswirelessuplinkenabled"></a> `isWirelessUplinkEnabled` | `Nullable`\<`boolean`\> |
| <a id="lastdevicefwupdatescheckedat"></a> `lastDeviceFWUpdatesCheckedAt` | `number` |
| <a id="lastseen"></a> `lastSeen` | `number` |
| <a id="lastupdateat"></a> `lastUpdateAt` | `Nullable`\<`number`\> |
| <a id="liveview"></a> `liveview` | `Nullable`\<`string`\> |
| <a id="locationsettings"></a> `locationSettings` | \{ `isAway`: `boolean`; `isGeofencingEnabled`: `boolean`; `latitude`: `number`; `longitude`: `number`; `radius`: `number`; \} |
| `locationSettings.isAway` | `boolean` |
| `locationSettings.isGeofencingEnabled` | `boolean` |
| `locationSettings.latitude` | `number` |
| `locationSettings.longitude` | `number` |
| `locationSettings.radius` | `number` |
| <a id="mac"></a> `mac` | `string` |
| <a id="marketname"></a> `marketName` | `string` |
| <a id="maxcameracapacity"></a> `maxCameraCapacity` | `Record`\<`string`, `number`\> |
| <a id="modelkey"></a> `modelKey` | `"nvr"` |
| <a id="msrservicemeta"></a> `msrServiceMeta` | \{ `inStateSince`: `number`; `isRecycling`: `boolean`; `progress`: `number`; `reasons`: `ProtectKnownJsonValue`[]; \} |
| `msrServiceMeta.inStateSince` | `number` |
| `msrServiceMeta.isRecycling` | `boolean` |
| `msrServiceMeta.progress` | `number` |
| `msrServiceMeta.reasons` | `ProtectKnownJsonValue`[] |
| <a id="msrservicestate"></a> `msrServiceState` | `string` |
| <a id="name"></a> `name?` | `string` |
| <a id="pincodesettings"></a> `pinCodeSettings` | \{ `pinCodeLengthRange`: `string`; \} |
| `pinCodeSettings.pinCodeLengthRange` | `string` |
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
| <a id="portstatus"></a> `portStatus` | `ProtectKnownJsonValue`[] |
| <a id="publicip"></a> `publicIp` | `string` |
| <a id="recordingretentiondurationms"></a> `recordingRetentionDurationMs` | `Nullable`\<`string`\> |
| <a id="releasechannel"></a> `releaseChannel` | `string` |
| <a id="sessionsettings"></a> `sessionSettings` | \{ `doorbellTimeout`: `number`; `liveviewTimeout`: `number`; `supportedClients`: `string`[]; \} |
| `sessionSettings.doorbellTimeout` | `number` |
| `sessionSettings.liveviewTimeout` | `number` |
| `sessionSettings.supportedClients` | `string`[] |
| <a id="skipfirmwareupdate"></a> `skipFirmwareUpdate` | `boolean` |
| <a id="smartdetectagreement"></a> `smartDetectAgreement` | \{ `lastUpdateAt`: `Nullable`\<`number`\>; `status`: `string`; \} |
| `smartDetectAgreement.lastUpdateAt` | `Nullable`\<`number`\> |
| `smartDetectAgreement.status` | `string` |
| <a id="smartdetection"></a> `smartDetection` | \{ `enable`: `boolean`; `faceRecognition`: `boolean`; `licensePlateRecognition`: `boolean`; \} |
| `smartDetection.enable` | `boolean` |
| `smartDetection.faceRecognition` | `boolean` |
| `smartDetection.licensePlateRecognition` | `boolean` |
| <a id="storageallocationhqpercent"></a> `storageAllocationHqPercent` | `number` |
| <a id="storageallocationhqpercentbalanced"></a> `storageAllocationHqPercentBalanced` | `number` |
| <a id="storageallocationhqpercentmaxretention"></a> `storageAllocationHqPercentMaxRetention` | `number` |
| <a id="storageallocationmode"></a> `storageAllocationMode` | `string` |
| <a id="storageconsolecameracounts"></a> `storageConsoleCameraCounts` | \{ `consoleIndex`: `number`; `offlineCameraCount`: `number`; `onlineCameraCount`: `number`; \}[] |
| <a id="storageconsolefailoversettings"></a> `storageConsoleFailoverSettings` | `ProtectKnownJsonValue`[] |
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
| <a id="streamencryptionenabled"></a> `streamEncryptionEnabled` | `boolean` |
| <a id="streamsharingavailable"></a> `streamSharingAvailable` | `boolean` |
| <a id="switchpoebudget"></a> `switchPoeBudget` | `number` |
| <a id="switchports"></a> `switchPorts` | `ProtectKnownJsonValue`[] |
| <a id="syncingestimatems"></a> `syncingEstimateMs` | `Nullable`\<`number`\> |
| <a id="syncingprogress"></a> `syncingProgress` | `Nullable`\<`number`\> |
| <a id="syncingsince"></a> `syncingSince` | `Nullable`\<`number`\> |
| <a id="systeminfo"></a> `systemInfo` | [`ProtectNvrSystemInfoInterface`](ProtectNvrSystemInfoInterface.md) |
| <a id="temperatureunit"></a> `temperatureUnit` | `string` |
| <a id="timeformat"></a> `timeFormat` | `string` |
| <a id="timelapseenabled"></a> `timelapseEnabled` | `boolean` |
| <a id="timezone"></a> `timezone` | `string` |
| <a id="totalhqbytesperday"></a> `totalHqBytesPerDay` | `number` |
| <a id="totallqbytesperday"></a> `totalLqBytesPerDay` | `number` |
| <a id="type"></a> `type` | `string` |
| <a id="ucoreversion"></a> `ucoreVersion` | `string` |
| <a id="ulpversion"></a> `ulpVersion` | `string` |
| <a id="upsince"></a> `upSince` | `number` |
| <a id="version"></a> `version` | `string` |
| <a id="voipforbidden"></a> `voipForbidden` | `boolean` |
| <a id="wanip"></a> `wanIp` | `string` |
| <a id="wanports"></a> `wanPorts` | `ProtectKnownJsonValue`[] |
