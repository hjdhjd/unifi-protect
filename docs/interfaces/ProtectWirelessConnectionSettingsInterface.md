[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectWirelessConnectionSettingsInterface

# Interface: ProtectWirelessConnectionSettingsInterface

A description of the UniFi Protect device wireless (LoRa) connection settings JSON, carried by long-range radio devices such as the relay, sensors, and the fob: the
paired bridge, the LoRa spreading factor and the spreading factors the device supports, and the telemetry update interval.

## Indexable

```ts
[key: string]: ProtectKnownJsonValue
```

## Properties

| Property | Type |
| ------ | ------ |
| <a id="chosenbridge"></a> `chosenBridge` | `Nullable`\<`string`\> |
| <a id="loraspreadingfactor"></a> `loraSpreadingFactor` | `Nullable`\<`number`\> |
| <a id="supportedloraspreadingfactors"></a> `supportedLoraSpreadingFactors` | `number`[] |
| <a id="updateinterval"></a> `updateInterval` | `Nullable`\<`number`\> |
