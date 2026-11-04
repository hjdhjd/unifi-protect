[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectNvrUserConfigInterface

# Interface: ProtectNvrUserConfigInterface

A semi-complete description of the UniFi Protect NVR user JSON.

## Indexable

```ts
[key: string]: ProtectKnownJsonValue
```

## Properties

| Property | Type |
| ------ | ------ |
| <a id="alertrules"></a> `alertRules` | `ProtectKnownJsonValue`[] |
| <a id="allpermissions"></a> `allPermissions` | `string`[] |
| <a id="archivingsettings"></a> `archivingSettings` | \{ `cameras`: `ProtectKnownJsonValue`[]; `detections`: `ProtectKnownJsonValue`[]; `isAllCameras`: `boolean`; `isAllDetections`: `boolean`; \} |
| `archivingSettings.cameras` | `ProtectKnownJsonValue`[] |
| `archivingSettings.detections` | `ProtectKnownJsonValue`[] |
| `archivingSettings.isAllCameras` | `boolean` |
| `archivingSettings.isAllDetections` | `boolean` |
| <a id="cloudaccount"></a> `cloudAccount` | `Nullable`\<\{ `cloudId`: `string`; `email`: `string`; `firstName`: `string`; `id`: `string`; `lastName`: `string`; `location?`: \{ `isAway`: `boolean`; `latitude`: `Nullable`\<`number`\>; `longitude`: `Nullable`\<`number`\>; `modelKey`: `string`; \}; `modelKey`: `string`; `name`: `string`; `profileImg`: `string`; `user`: `string`; \}\> |
| <a id="cloudproviders"></a> `cloudProviders` | \{ `dropbox`: `ProtectNvrUserCloudProviderInterface`; `google`: `ProtectNvrUserCloudProviderInterface`; `NAS`: `ProtectKnownJsonValue`[]; `oneDrive`: `ProtectNvrUserCloudProviderInterface`; `unifiCloudStorage`: \{ `continuousArchiveConsecutiveFailures`: `number`; `continuousArchiveLastAttemptAt`: `Nullable`\<`number`\>; `continuousArchiveLastFailureAt`: `Nullable`\<`number`\>; `continuousArchiveLastFailureReason`: `Nullable`\<`string`\>; `continuousArchiveLastSuccessfulAt`: `Nullable`\<`number`\>; `continuousArchiveStatus`: `Nullable`\<`string`\>; `isContinuousArchivingEnabled`: `boolean`; `lastStatusSyncAt`: `Nullable`\<`number`\>; `quotaLimitBytes`: `Nullable`\<`number`\>; `subscriptionDataDeletedAt`: `Nullable`\<`number`\>; `subscriptionDataWillBeDeletedAt`: `Nullable`\<`number`\>; `subscriptionExpiredAt`: `Nullable`\<`number`\>; `subscriptionId`: `Nullable`\<`string`\>; `subscriptionIsActive`: `Nullable`\<`boolean`\>; `subscriptionRegion`: `Nullable`\<`string`\>; `subscriptionStatus`: `Nullable`\<`string`\>; `subscriptionType`: `Nullable`\<`string`\>; \}; \} |
| `cloudProviders.dropbox` | `ProtectNvrUserCloudProviderInterface` |
| `cloudProviders.google` | `ProtectNvrUserCloudProviderInterface` |
| `cloudProviders.NAS` | `ProtectKnownJsonValue`[] |
| `cloudProviders.oneDrive` | `ProtectNvrUserCloudProviderInterface` |
| `cloudProviders.unifiCloudStorage` | \{ `continuousArchiveConsecutiveFailures`: `number`; `continuousArchiveLastAttemptAt`: `Nullable`\<`number`\>; `continuousArchiveLastFailureAt`: `Nullable`\<`number`\>; `continuousArchiveLastFailureReason`: `Nullable`\<`string`\>; `continuousArchiveLastSuccessfulAt`: `Nullable`\<`number`\>; `continuousArchiveStatus`: `Nullable`\<`string`\>; `isContinuousArchivingEnabled`: `boolean`; `lastStatusSyncAt`: `Nullable`\<`number`\>; `quotaLimitBytes`: `Nullable`\<`number`\>; `subscriptionDataDeletedAt`: `Nullable`\<`number`\>; `subscriptionDataWillBeDeletedAt`: `Nullable`\<`number`\>; `subscriptionExpiredAt`: `Nullable`\<`number`\>; `subscriptionId`: `Nullable`\<`string`\>; `subscriptionIsActive`: `Nullable`\<`boolean`\>; `subscriptionRegion`: `Nullable`\<`string`\>; `subscriptionStatus`: `Nullable`\<`string`\>; `subscriptionType`: `Nullable`\<`string`\>; \} |
| `cloudProviders.unifiCloudStorage.continuousArchiveConsecutiveFailures` | `number` |
| `cloudProviders.unifiCloudStorage.continuousArchiveLastAttemptAt` | `Nullable`\<`number`\> |
| `cloudProviders.unifiCloudStorage.continuousArchiveLastFailureAt` | `Nullable`\<`number`\> |
| `cloudProviders.unifiCloudStorage.continuousArchiveLastFailureReason` | `Nullable`\<`string`\> |
| `cloudProviders.unifiCloudStorage.continuousArchiveLastSuccessfulAt` | `Nullable`\<`number`\> |
| `cloudProviders.unifiCloudStorage.continuousArchiveStatus` | `Nullable`\<`string`\> |
| `cloudProviders.unifiCloudStorage.isContinuousArchivingEnabled` | `boolean` |
| `cloudProviders.unifiCloudStorage.lastStatusSyncAt` | `Nullable`\<`number`\> |
| `cloudProviders.unifiCloudStorage.quotaLimitBytes` | `Nullable`\<`number`\> |
| `cloudProviders.unifiCloudStorage.subscriptionDataDeletedAt` | `Nullable`\<`number`\> |
| `cloudProviders.unifiCloudStorage.subscriptionDataWillBeDeletedAt` | `Nullable`\<`number`\> |
| `cloudProviders.unifiCloudStorage.subscriptionExpiredAt` | `Nullable`\<`number`\> |
| `cloudProviders.unifiCloudStorage.subscriptionId` | `Nullable`\<`string`\> |
| `cloudProviders.unifiCloudStorage.subscriptionIsActive` | `Nullable`\<`boolean`\> |
| `cloudProviders.unifiCloudStorage.subscriptionRegion` | `Nullable`\<`string`\> |
| `cloudProviders.unifiCloudStorage.subscriptionStatus` | `Nullable`\<`string`\> |
| `cloudProviders.unifiCloudStorage.subscriptionType` | `Nullable`\<`string`\> |
| <a id="email"></a> `email` | `Nullable`\<`string`\> |
| <a id="enablenotifications"></a> `enableNotifications` | `boolean` |
| <a id="featureflags"></a> `featureFlags` | \{ `hasCriticalAlarmNotifications`: `boolean`; `notificationsV2`: `boolean`; \} |
| `featureFlags.hasCriticalAlarmNotifications` | `boolean` |
| `featureFlags.notificationsV2` | `boolean` |
| <a id="firstname"></a> `firstName` | `string` |
| <a id="groups"></a> `groups` | `string`[] |
| <a id="hasacceptedinvite"></a> `hasAcceptedInvite` | `boolean` |
| <a id="id"></a> `id` | `string` |
| <a id="isadmin"></a> `isAdmin` | `boolean` |
| <a id="isowner"></a> `isOwner` | `boolean` |
| <a id="lastloginip"></a> `lastLoginIp` | `Nullable`\<`string`\> |
| <a id="lastlogintime"></a> `lastLoginTime` | `Nullable`\<`number`\> |
| <a id="lastname"></a> `lastName` | `Nullable`\<`string`\> |
| <a id="localusername"></a> `localUsername` | `Nullable`\<`string`\> |
| <a id="location"></a> `location?` | \{ `isAway`: `boolean`; `latitude`: `Nullable`\<`number`\>; `longitude`: `Nullable`\<`number`\>; \} |
| `location.isAway` | `boolean` |
| `location.latitude` | `Nullable`\<`number`\> |
| `location.longitude` | `Nullable`\<`number`\> |
| <a id="modelkey"></a> `modelKey` | `"user"` |
| <a id="name"></a> `name` | `string` |
| <a id="notifications"></a> `notifications` | `Record`\<`string`, `ProtectKnownJsonValue`\> |
| <a id="notificationsnoozesettings"></a> `notificationSnoozeSettings` | \{ `deliveryMethods`: `ProtectKnownJsonValue`[]; `eventTypes`: `ProtectKnownJsonValue`[]; `excludedDevices`: \{ `bridges`: `ProtectKnownJsonValue`[]; `cameras`: `ProtectKnownJsonValue`[]; `chimes`: `ProtectKnownJsonValue`[]; `lights`: `ProtectKnownJsonValue`[]; `sensors`: `ProtectKnownJsonValue`[]; `viewers`: `ProtectKnownJsonValue`[]; \}; `validUntil`: `number`; \} |
| `notificationSnoozeSettings.deliveryMethods` | `ProtectKnownJsonValue`[] |
| `notificationSnoozeSettings.eventTypes` | `ProtectKnownJsonValue`[] |
| `notificationSnoozeSettings.excludedDevices` | \{ `bridges`: `ProtectKnownJsonValue`[]; `cameras`: `ProtectKnownJsonValue`[]; `chimes`: `ProtectKnownJsonValue`[]; `lights`: `ProtectKnownJsonValue`[]; `sensors`: `ProtectKnownJsonValue`[]; `viewers`: `ProtectKnownJsonValue`[]; \} |
| `notificationSnoozeSettings.excludedDevices.bridges` | `ProtectKnownJsonValue`[] |
| `notificationSnoozeSettings.excludedDevices.cameras` | `ProtectKnownJsonValue`[] |
| `notificationSnoozeSettings.excludedDevices.chimes` | `ProtectKnownJsonValue`[] |
| `notificationSnoozeSettings.excludedDevices.lights` | `ProtectKnownJsonValue`[] |
| `notificationSnoozeSettings.excludedDevices.sensors` | `ProtectKnownJsonValue`[] |
| `notificationSnoozeSettings.excludedDevices.viewers` | `ProtectKnownJsonValue`[] |
| `notificationSnoozeSettings.validUntil` | `number` |
| <a id="notificationsv2"></a> `notificationsV2` | `Record`\<`string`, `ProtectKnownJsonValue`\> |
| <a id="permissions"></a> `permissions` | `string`[] |
| <a id="scopes"></a> `scopes` | `string`[] |
| <a id="settings"></a> `settings` | \{ `android?`: `Record`\<`string`, `ProtectKnownJsonValue`\>; `cameraOrder?`: `string`[]; `dashboardDevices?`: `string`[]; `showFeaturesIntroduction`: `boolean`; `smartDetectionHighlightSettings?`: \{ `cameraID`: `string`; `enabledSmartDetectStats`: `ProtectKnownJsonValue`[]; `enabledSmartDetectTypes`: `string`[]; \}[]; `web?`: `Record`\<`string`, `ProtectKnownJsonValue`\>; \} |
| `settings.android?` | `Record`\<`string`, `ProtectKnownJsonValue`\> |
| `settings.cameraOrder?` | `string`[] |
| `settings.dashboardDevices?` | `string`[] |
| `settings.showFeaturesIntroduction` | `boolean` |
| `settings.smartDetectionHighlightSettings?` | \{ `cameraID`: `string`; `enabledSmartDetectStats`: `ProtectKnownJsonValue`[]; `enabledSmartDetectTypes`: `string`[]; \}[] |
| `settings.web?` | `Record`\<`string`, `ProtectKnownJsonValue`\> |
| <a id="ucoreuserid"></a> `ucoreUserId` | `Nullable`\<`string`\> |
