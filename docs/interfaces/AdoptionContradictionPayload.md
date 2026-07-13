[**unifi-protect**](../README.md)

***

[Home](../README.md) / AdoptionContradictionPayload

# Interface: AdoptionContradictionPayload

Payload published on [channels.adoptionContradiction](../variables/channels.md#property-adoptioncontradiction). `modelKey` and `id` identify the device whose record was self-contradictory; `mac` is the device's own
hardware address; `nvrMac` is the owning-controller address the record asserted, which equals this controller's own MAC (that equality is what makes the
adopted-by-another claim provably false). The library corrects the record and publishes this once per episode; consumers building dashboards add their own counters.

## Properties

| Property | Type |
| ------ | ------ |
| <a id="id"></a> `id` | `string` |
| <a id="mac"></a> `mac` | `string` |
| <a id="modelkey"></a> `modelKey` | `string` |
| <a id="nvrmac"></a> `nvrMac` | `string` |
