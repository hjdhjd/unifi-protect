[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectNvrLiveviewConfigInterface

# Interface: ProtectNvrLiveviewConfigInterface

A semi-complete description of the UniFi Protect NVR liveview JSON.

## Indexable

```ts
[key: string]: ProtectKnownJsonValue
```

## Properties

| Property | Type |
| ------ | ------ |
| <a id="id"></a> `id` | `string` |
| <a id="isdefault"></a> `isDefault` | `boolean` |
| <a id="isglobal"></a> `isGlobal` | `boolean` |
| <a id="layout"></a> `layout` | `number` |
| <a id="modelkey"></a> `modelKey` | `"liveview"` |
| <a id="name"></a> `name` | `string` |
| <a id="owner"></a> `owner` | `string` |
| <a id="slots"></a> `slots` | \{ `cameras`: `string`[]; `cycleInterval`: `number`; `cycleMode`: `string`; \}[] |
