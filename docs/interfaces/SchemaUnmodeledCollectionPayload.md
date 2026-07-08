[**unifi-protect**](../README.md)

***

[Home](../README.md) / SchemaUnmodeledCollectionPayload

# Interface: SchemaUnmodeledCollectionPayload

Payload published on [channels.schemaUnmodeledCollection](../variables/channels.md#property-schemaunmodeledcollection). `collection` is the bootstrap array key (e.g. `"aiports"`), `modelKey` is the record's self-declared
type (e.g. `"aiport"`), `count` is the array length, and `exampleId` is the first record's id - enough to correlate the signal with the bootstrap shape. `known`
distinguishes a recognized-but-unreduced class (a model key the library knows about but does not project, `true`) from genuine schema drift the controller introduced
(`false`). The library does not aggregate beyond the first-occurrence-per-`modelKey` dedup; consumers building dashboards add their own counters from this channel.

## Properties

| Property | Type |
| ------ | ------ |
| <a id="collection"></a> `collection` | `string` |
| <a id="count"></a> `count` | `number` |
| <a id="exampleid"></a> `exampleId` | `string` |
| <a id="known"></a> `known` | `boolean` |
| <a id="modelkey"></a> `modelKey` | `string` |
