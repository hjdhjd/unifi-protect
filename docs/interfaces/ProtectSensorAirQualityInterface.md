[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectSensorAirQualityInterface

# Interface: ProtectSensorAirQualityInterface

A description of the UniFi Protect sensor air-quality readings JSON. Each member is a [ProtectAirQualityMetricInterface](ProtectAirQualityMetricInterface.md) reading for one measured quantity; a
sensor without a given capability reports that metric with a `null` value.

## Indexable

```ts
[key: string]: ProtectKnownJsonValue
```

## Properties

| Property | Type |
| ------ | ------ |
| <a id="aqi"></a> `aqi` | [`ProtectAirQualityMetricInterface`](ProtectAirQualityMetricInterface.md) |
| <a id="co2"></a> `co2` | [`ProtectAirQualityMetricInterface`](ProtectAirQualityMetricInterface.md) |
| <a id="humidity"></a> `humidity` | [`ProtectAirQualityMetricInterface`](ProtectAirQualityMetricInterface.md) |
| <a id="pm10p0"></a> `pm10p0` | [`ProtectAirQualityMetricInterface`](ProtectAirQualityMetricInterface.md) |
| <a id="pm1p0"></a> `pm1p0` | [`ProtectAirQualityMetricInterface`](ProtectAirQualityMetricInterface.md) |
| <a id="pm2p5"></a> `pm2p5` | [`ProtectAirQualityMetricInterface`](ProtectAirQualityMetricInterface.md) |
| <a id="pm4p0"></a> `pm4p0` | [`ProtectAirQualityMetricInterface`](ProtectAirQualityMetricInterface.md) |
| <a id="temperature"></a> `temperature` | [`ProtectAirQualityMetricInterface`](ProtectAirQualityMetricInterface.md) |
| <a id="tvoc"></a> `tvoc` | [`ProtectAirQualityMetricInterface`](ProtectAirQualityMetricInterface.md) |
| <a id="vape"></a> `vape` | [`ProtectAirQualityMetricInterface`](ProtectAirQualityMetricInterface.md) |
| <a id="voc"></a> `voc` | [`ProtectAirQualityMetricInterface`](ProtectAirQualityMetricInterface.md) |
