[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectNvrAgreementInterface

# Interface: ProtectNvrAgreementInterface

A description of a UniFi Protect NVR legal-agreement record: the contract identifier, its link, the contract version, and the acceptance status (`null` until the
agreement is accepted).

## Indexable

```ts
[key: string]: ProtectKnownJsonValue
```

## Properties

| Property | Type |
| ------ | ------ |
| <a id="actualcontract"></a> `actualContract` | `string` |
| <a id="actualcontractlink"></a> `actualContractLink` | `string` |
| <a id="actualversion"></a> `actualVersion` | `string` |
| <a id="status"></a> `status` | `Nullable`\<`string`\> |
