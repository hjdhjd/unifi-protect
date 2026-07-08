[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectCameraRecordingPathSettingsInterface

# Interface: ProtectCameraRecordingPathSettingsInterface

A description of the UniFi Protect camera recording-path settings JSON: the storage console the camera records to, whether it automatically fails over to another, and
the failover timeout.

## Indexable

```ts
[key: string]: ProtectKnownJsonValue
```

## Properties

| Property | Type |
| ------ | ------ |
| <a id="failovertimeoutms"></a> `failoverTimeoutMs` | `Nullable`\<`number`\> |
| <a id="isautofailoverenabled"></a> `isAutoFailoverEnabled` | `boolean` |
| <a id="storageconsoleindex"></a> `storageConsoleIndex` | `number` |
