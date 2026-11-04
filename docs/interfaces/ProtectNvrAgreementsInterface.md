[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectNvrAgreementsInterface

# Interface: ProtectNvrAgreementsInterface

The container holding each of the controller's named legal agreements, every one a [ProtectNvrAgreementInterface](ProtectNvrAgreementInterface.md) record (the singular name is one such
record; this plural one is the set of them). The controller reports the identical shape at the bootstrap's top level and on the NVR record, so both reference this.

## Indexable

```ts
[key: string]: ProtectKnownJsonValue
```

## Properties

| Property | Type |
| ------ | ------ |
| <a id="aireportingagreement"></a> `aiReportingAgreement` | [`ProtectNvrAgreementInterface`](ProtectNvrAgreementInterface.md) |
| <a id="smartdetectagreement"></a> `smartDetectAgreement` | [`ProtectNvrAgreementInterface`](ProtectNvrAgreementInterface.md) |
