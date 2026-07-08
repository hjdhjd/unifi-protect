[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectNvrSystemInfoInterface

# Interface: ProtectNvrSystemInfoInterface

A semi-complete description of the UniFi Protect NVR system information configuration JSON.

## Indexable

```ts
[key: string]: ProtectKnownJsonValue
```

## Properties

| Property | Type |
| ------ | ------ |
| <a id="cpu"></a> `cpu` | \{ `averageLoad`: `number`; `temperature`: `number`; \} |
| `cpu.averageLoad` | `number` |
| `cpu.temperature` | `number` |
| <a id="memory"></a> `memory` | \{ `available`: `number`; `free`: `number`; `total`: `number`; \} |
| `memory.available` | `number` |
| `memory.free` | `number` |
| `memory.total` | `number` |
| <a id="storage"></a> `storage` | \{ `available`: `number`; `devices`: \{ `healthy`: `boolean`; `model`: `string`; `size`: `number`; \}[]; `isRecycling`: `boolean`; `size`: `number`; `type`: `string`; `used`: `number`; \} |
| `storage.available` | `number` |
| `storage.devices` | \{ `healthy`: `boolean`; `model`: `string`; `size`: `number`; \}[] |
| `storage.isRecycling` | `boolean` |
| `storage.size` | `number` |
| `storage.type` | `string` |
| `storage.used` | `number` |
| <a id="tmpfs"></a> `tmpfs` | \{ `available`: `number`; `path`: `string`; `total`: `number`; `used`: `number`; \} |
| `tmpfs.available` | `number` |
| `tmpfs.path` | `string` |
| `tmpfs.total` | `number` |
| `tmpfs.used` | `number` |
