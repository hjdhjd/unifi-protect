[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectSensorAirQualitySettingsInterface

# Interface: ProtectSensorAirQualitySettingsInterface

A description of the UniFi Protect sensor air-quality settings JSON: the per-metric alert thresholds (each a [ProtectAirQualityThresholdSettingsInterface](ProtectAirQualityThresholdSettingsInterface.md)), the
reading and alert intervals, the ring-LED display, the night-mode schedule, and the vape sensitivity.

## Indexable

```ts
[key: string]: ProtectKnownJsonValue
```

## Properties

| Property | Type |
| ------ | ------ |
| <a id="alertinterval"></a> `alertInterval` | `Nullable`\<`number`\> |
| <a id="aqisettings"></a> `aqiSettings` | [`ProtectAirQualityThresholdSettingsInterface`](ProtectAirQualityThresholdSettingsInterface.md) |
| <a id="co2settings"></a> `co2Settings` | [`ProtectAirQualityThresholdSettingsInterface`](ProtectAirQualityThresholdSettingsInterface.md) |
| <a id="humiditysettings"></a> `humiditySettings` | [`ProtectAirQualityThresholdSettingsInterface`](ProtectAirQualityThresholdSettingsInterface.md) |
| <a id="nightmodebrightness"></a> `nightModeBrightness` | `number` |
| <a id="nightmodeenabled"></a> `nightModeEnabled` | `boolean` |
| <a id="nightmodeendtime"></a> `nightModeEndTime` | `string` |
| <a id="nightmodestarttime"></a> `nightModeStartTime` | `string` |
| <a id="pm10p0settings"></a> `pm10p0Settings` | [`ProtectAirQualityThresholdSettingsInterface`](ProtectAirQualityThresholdSettingsInterface.md) |
| <a id="pm1p0settings"></a> `pm1p0Settings` | [`ProtectAirQualityThresholdSettingsInterface`](ProtectAirQualityThresholdSettingsInterface.md) |
| <a id="pm2p5settings"></a> `pm2p5Settings` | [`ProtectAirQualityThresholdSettingsInterface`](ProtectAirQualityThresholdSettingsInterface.md) |
| <a id="pm4p0settings"></a> `pm4p0Settings` | [`ProtectAirQualityThresholdSettingsInterface`](ProtectAirQualityThresholdSettingsInterface.md) |
| <a id="readinginterval"></a> `readingInterval` | `number` |
| <a id="ringledbrightness"></a> `ringLedBrightness` | `number` |
| <a id="ringledmetric"></a> `ringLedMetric` | `number` |
| <a id="temperaturesettings"></a> `temperatureSettings` | [`ProtectAirQualityThresholdSettingsInterface`](ProtectAirQualityThresholdSettingsInterface.md) |
| <a id="tvocsettings"></a> `tvocSettings` | [`ProtectAirQualityThresholdSettingsInterface`](ProtectAirQualityThresholdSettingsInterface.md) |
| <a id="vapesensitivitysettings"></a> `vapeSensitivitySettings` | \{ `isEnabled`: `boolean`; `sensitivity`: `number`; \} |
| `vapeSensitivitySettings.isEnabled` | `boolean` |
| `vapeSensitivitySettings.sensitivity` | `number` |
| <a id="vapesettings"></a> `vapeSettings` | [`ProtectAirQualityThresholdSettingsInterface`](ProtectAirQualityThresholdSettingsInterface.md) |
| <a id="vocsettings"></a> `vocSettings` | [`ProtectAirQualityThresholdSettingsInterface`](ProtectAirQualityThresholdSettingsInterface.md) |
