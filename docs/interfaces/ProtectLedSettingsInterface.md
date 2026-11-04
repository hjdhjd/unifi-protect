[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectLedSettingsInterface

# Interface: ProtectLedSettingsInterface

A description of a UniFi Protect device's status-LED settings. Several device classes expose the identical toggle for their indicator LED, so the shape lives here
once rather than as a copy in each device's file; a class whose LED carries additional settings intersects this with them.

## Indexable

```ts
[key: string]: ProtectKnownJsonValue
```

## Properties

| Property | Type |
| ------ | ------ |
| <a id="isenabled"></a> `isEnabled` | `boolean` |
