[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectNvrSystemEventControllerInterface

# Interface: ProtectNvrSystemEventControllerInterface

A semi-complete description of the UniFi Protect NVR system events controller JSON.

## Properties

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
| <a id="name"></a> `name` | `string` |
| <a id="port"></a> `port` | `number` |
| <a id="required"></a> `required` | `boolean` |
| <a id="state"></a> `state` | `string` |
| <a id="status"></a> `status` | `string` |
| <a id="statusmessage"></a> `statusMessage` | `string` |
| <a id="swaiversion"></a> `swaiVersion` | `number` |
| <a id="type"></a> `type` | `string` |
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
| <a id="version"></a> `version` | `string` |
