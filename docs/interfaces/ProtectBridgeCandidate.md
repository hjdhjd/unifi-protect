[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectBridgeCandidate

# Interface: ProtectBridgeCandidate

A bridge candidate entry observed by a sensor. The Protect controller advertises every reachable bridge a sensor can hear, with signal-quality telemetry per
candidate, so the radio-management layer can pick the best uplink. Modeled as a typed shape rather than `ProtectKnownJsonValue[]` because the field is genuinely
structured...consumers reading `sensor.bridgeCandidates[0].signalQuality` get full type-checking instead of having to narrow an opaque blob at every call site.

## Indexable

```ts
[key: string]: ProtectKnownJsonValue
```

## Properties

| Property | Type |
| ------ | ------ |
| <a id="id"></a> `id` | `string` |
| <a id="lastseen"></a> `lastSeen` | `number` |
| <a id="modelkey"></a> `modelKey` | `"bridgeCandidate"` |
| <a id="signalquality"></a> `signalQuality` | `number` |
