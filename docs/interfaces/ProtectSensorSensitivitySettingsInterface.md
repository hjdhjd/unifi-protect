[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectSensorSensitivitySettingsInterface

# Interface: ProtectSensorSensitivitySettingsInterface

A description of a UniFi Protect sensor sensitivity toggle - the shared shape of the sensor's motion and glass-break settings: whether the capability is enabled, its
base sensitivity, and the sensitivity applied while the sensor is armed.

## Indexable

```ts
[key: string]: ProtectKnownJsonValue
```

## Properties

| Property | Type |
| ------ | ------ |
| <a id="isenabled"></a> `isEnabled` | `boolean` |
| <a id="sensitivity"></a> `sensitivity` | `number` |
| <a id="sensitivitywhenarmed"></a> `sensitivityWhenArmed` | `number` |
