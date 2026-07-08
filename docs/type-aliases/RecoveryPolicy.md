[**unifi-protect**](../README.md)

***

[Home](../README.md) / RecoveryPolicy

# Type Alias: RecoveryPolicy

```ts
type RecoveryPolicy = (context) => RecoveryDecision;
```

The single decision authority for a stream's recovery, injected at the pool (the same dependency-inversion seam as `resolveUrl`). Pure: given the library-observable
[RecoveryContext](../interfaces/RecoveryContext.md), it returns a [RecoveryDecision](RecoveryDecision.md). The library ships [defaultLivestreamRecoveryPolicy](../functions/defaultLivestreamRecoveryPolicy.md), a health-agnostic default; a consumer
injects its own to add the controller-health correlation only it can observe.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `context` | [`RecoveryContext`](../interfaces/RecoveryContext.md) |

## Returns

[`RecoveryDecision`](RecoveryDecision.md)
