[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectWirelessConnectionStateInterface

# Interface: ProtectWirelessConnectionStateInterface

A description of the UniFi Protect device wireless (LoRa) connection state JSON. Carried by long-range radio devices such as the relay: the live link telemetry - the
battery status, the bridge it is paired with and the bridges it can hear, the last function-button press time, and the radio signal state (SNR plus signal quality and
strength). The candidates are modeled inline rather than as [ProtectBridgeCandidate](ProtectBridgeCandidate.md) because the relay's entries omit that type's required `modelKey`.

## Indexable

```ts
[key: string]: ProtectKnownJsonValue
```

## Properties

| Property | Type |
| ------ | ------ |
| <a id="batterystatus"></a> `batteryStatus` | \{ `isLow`: `boolean`; `percentage`: `Nullable`\<`number`\>; \} |
| `batteryStatus.isLow` | `boolean` |
| `batteryStatus.percentage` | `Nullable`\<`number`\> |
| <a id="bridge"></a> `bridge` | `Nullable`\<`string`\> |
| <a id="bridgecandidates"></a> `bridgeCandidates` | \{ `id`: `string`; `lastSeen`: `number`; `signalQuality`: `number`; \}[] |
| <a id="functionbuttonpressedat"></a> `functionButtonPressedAt` | `Nullable`\<`number`\> |
| <a id="signalstate"></a> `signalState` | \{ `signalNoiseRatio`: `number`; `signalQuality`: `number`; `signalStrength`: `number`; \} |
| `signalState.signalNoiseRatio` | `number` |
| `signalState.signalQuality` | `number` |
| `signalState.signalStrength` | `number` |
