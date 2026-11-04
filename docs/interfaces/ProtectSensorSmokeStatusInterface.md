[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectSensorSmokeStatusInterface

# Interface: ProtectSensorSmokeStatusInterface

A description of the UniFi Protect sensor smoke/CO detector status JSON. It carries the alarm and fault booleans plus the raw smoke, CO, and battery-voltage
readings.

The controller reports the block on sensors of every model: across a field fleet it is populated on air-quality and environmental units and `null` on other units
of those same models, so its presence says nothing about whether a sensor has smoke hardware. Neither does `featureFlags.alarmTypes`: that advertisement names
the alarm kinds a unit deals in, and an environmental unit with no detector hardware advertises smoke and CO because it listens for those alarm sounds. The
model family is the hardware signal.

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
