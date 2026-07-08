[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectSensorSmokeStatusInterface

# Interface: ProtectSensorSmokeStatusInterface

A description of the UniFi Protect sensor smoke/CO detector status JSON, reported by a sensor with a smoke sensor and `null` on one without. It carries the alarm and
fault booleans plus the raw smoke, CO, and battery-voltage readings.

## Indexable

```ts
[key: string]: ProtectKnownJsonValue
```

## Properties

| Property | Type |
| ------ | ------ |
| <a id="alarmsilenced"></a> `alarmSilenced` | `boolean` |
| <a id="batterylow"></a> `batteryLow` | `boolean` |
| <a id="batteryvoltage"></a> `batteryVoltage` | `number` |
| <a id="cleansmokesensor"></a> `cleanSmokeSensor` | `boolean` |
| <a id="coalarm"></a> `coAlarm` | `boolean` |
| <a id="cosensorfault"></a> `coSensorFault` | `boolean` |
| <a id="covalue"></a> `coValue` | `number` |
| <a id="enabled"></a> `enabled` | `boolean` |
| <a id="endoflife"></a> `endOfLife` | `boolean` |
| <a id="ready"></a> `ready` | `boolean` |
| <a id="smokealarm"></a> `smokeAlarm` | `boolean` |
| <a id="smokesensorfault"></a> `smokeSensorFault` | `boolean` |
| <a id="smokevalue"></a> `smokeValue` | `number` |
| <a id="testing"></a> `testing` | `boolean` |
| <a id="troublehushed"></a> `troubleHushed` | `boolean` |
| <a id="wasmounted"></a> `wasMounted` | `boolean` |
