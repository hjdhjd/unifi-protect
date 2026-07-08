[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectRelayInputConfigInterface

# Interface: ProtectRelayInputConfigInterface

A description of a single relay input. An input maps an external trigger to an action on one of the relay's outputs; every field but the numeric `id` is reported
nullable on the wire.

## Indexable

```ts
[key: string]: ProtectKnownJsonValue
```

## Properties

| Property | Type |
| ------ | ------ |
| <a id="actionoutputid"></a> `actionOutputId` | `Nullable`\<`number`\> |
| <a id="actiontrigger"></a> `actionTrigger` | `Nullable`\<`string`\> |
| <a id="actiontype"></a> `actionType` | `Nullable`\<`string`\> |
| <a id="id"></a> `id` | `number` |
| <a id="name"></a> `name` | `Nullable`\<`string`\> |
| <a id="state"></a> `state` | `Nullable`\<`string`\> |
