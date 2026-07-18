[**unifi-protect**](../README.md)

***

[Home](../README.md) / SchemaUnknownModelKeyPayload

# Interface: SchemaUnknownModelKeyPayload

Payload published on [channels.schemaUnknownModelKey](../variables/channels.md#property-schemaunknownmodelkey). `action` and `exampleId` are the identifying fields from the offending packet's header so a consumer
can correlate the drift signal with concrete wire activity (e.g., "modelKey 'garage' first seen at action 'add' with id <uuid>"). The library does not accumulate or
aggregate beyond the first-occurrence dedup; consumers building dashboards add their own counters from this channel.

## Properties

| Property | Type |
| ------ | ------ |
| <a id="action"></a> `action` | `string` |
| <a id="exampleid"></a> `exampleId` | `string` |
| <a id="modelkey"></a> `modelKey` | `string` |
