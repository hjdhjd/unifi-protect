[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectRelayOutputConfigInterface

# Interface: ProtectRelayOutputConfigInterface

A description of a single relay output. Each output is a latching switch the controller flips via the dedicated activate endpoint (see `Relay.toggleOutput`); its
`state` is reported in the record and broadcast in realtime on change. The numeric `id` and the `"off" | "on"` `state` are always present; the remaining fields are
nullable on the wire.

## Indexable

```ts
[key: string]: ProtectKnownJsonValue
```

## Properties

| Property | Type |
| ------ | ------ |
| <a id="delay"></a> `delay` | `Nullable`\<`number`\> |
| <a id="id"></a> `id` | `number` |
| <a id="name"></a> `name` | `Nullable`\<`string`\> |
| <a id="pulseduration"></a> `pulseDuration` | `Nullable`\<`number`\> |
| <a id="rebootstate"></a> `rebootState` | `Nullable`\<`string`\> |
| <a id="state"></a> `state` | `"off"` \| `"on"` |
| <a id="type"></a> `type` | `Nullable`\<`string`\> |
