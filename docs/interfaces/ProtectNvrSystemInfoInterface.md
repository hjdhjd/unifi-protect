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
| <a id="degradation"></a> `degradation` | \{ `level`: `number`; `loadLevel`: `string`; `pressures`: `Nullable`\<`ProtectKnownJsonValue`[]\>; `updatedAt`: `number`; \} |
| `degradation.level` | `number` |
| `degradation.loadLevel` | `string` |
| `degradation.pressures` | `Nullable`\<`ProtectKnownJsonValue`[]\> |
| `degradation.updatedAt` | `number` |
| <a id="memory"></a> `memory` | \{ `available`: `number`; `free`: `number`; `total`: `number`; \} |
| `memory.available` | `number` |
| `memory.free` | `number` |
| `memory.total` | `number` |
| <a id="storage"></a> `storage` | \{ `available`: `number`; `capability`: `string`; `devices`: \{ `healthy`: `boolean`; `model`: `string`; `size`: `number`; \}[]; `isRecycling`: `boolean`; `size`: `number`; `type`: `string`; `used`: `number`; \} |
| `storage.available` | `number` |
| `storage.capability` | `string` |
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
| <a id="ustorage"></a> `ustorage` | \{ `disks`: \{ `action`: `string`; `ata`: `string`; `bad_sector`: `number`; `estimate`: `Nullable`\<`number`\>; `firmware`: `string`; `healthy`: `string`; `model`: `string`; `poweronhrs`: `number`; `progress`: `Nullable`\<`number`\>; `reason`: `ProtectKnownJsonValue`[]; `rpm`: `number`; `sata`: `string`; `serial`: `string`; `size`: `number`; `slot`: `number`; `state`: `string`; `temperature`: `number`; `type`: `string`; \}[]; `hotspare`: `boolean`; `raid`: `string`; `sdcards`: `ProtectKnownJsonValue`[]; `space`: \{ `action`: `string`; `device`: `string`; `estimate`: `Nullable`\<`number`\>; `health`: `string`; `progress`: `Nullable`\<`number`\>; `reasons`: `ProtectKnownJsonValue`[]; `space_type`: `string`; `total_bytes`: `number`; `used_bytes`: `number`; \}[]; \} |
| `ustorage.disks` | \{ `action`: `string`; `ata`: `string`; `bad_sector`: `number`; `estimate`: `Nullable`\<`number`\>; `firmware`: `string`; `healthy`: `string`; `model`: `string`; `poweronhrs`: `number`; `progress`: `Nullable`\<`number`\>; `reason`: `ProtectKnownJsonValue`[]; `rpm`: `number`; `sata`: `string`; `serial`: `string`; `size`: `number`; `slot`: `number`; `state`: `string`; `temperature`: `number`; `type`: `string`; \}[] |
| `ustorage.hotspare` | `boolean` |
| `ustorage.raid` | `string` |
| `ustorage.sdcards` | `ProtectKnownJsonValue`[] |
| `ustorage.space` | \{ `action`: `string`; `device`: `string`; `estimate`: `Nullable`\<`number`\>; `health`: `string`; `progress`: `Nullable`\<`number`\>; `reasons`: `ProtectKnownJsonValue`[]; `space_type`: `string`; `total_bytes`: `number`; `used_bytes`: `number`; \}[] |
