[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectWiredConnectionStateInterface

# Interface: ProtectWiredConnectionStateInterface

A description of the UniFi Protect device wired connection state JSON. `phyRate` is nullable because a device with no wired link reports it as `null` (the relay, a
LoRa device, carries `wiredConnectionState: { phyRate: null }`); a genuinely wired device reports the negotiated rate as a number.

## Indexable

```ts
[key: string]: ProtectKnownJsonValue
```

## Properties

| Property | Type |
| ------ | ------ |
| <a id="phyrate"></a> `phyRate` | `Nullable`\<`number`\> |
