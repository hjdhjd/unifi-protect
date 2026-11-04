[**unifi-protect**](../README.md)

***

[Home](../README.md) / PROTECT\_RECOVERY\_REFUSAL\_SCHEDULE\_MS

# Variable: PROTECT\_RECOVERY\_REFUSAL\_SCHEDULE\_MS

```ts
const PROTECT_RECOVERY_REFUSAL_SCHEDULE_MS: {
  backoff: readonly [30000, 60000, 120000, 240000];
  steady: 300000;
};
```

The published refusal schedule, in milliseconds: the delays before each successive attempt to recover a connection the controller refused, on identity or
privilege grounds or by refusing the request rate, followed by the steady interval recovery settles onto and polls at for as long as the refusal lasts. A
refusal is the controller's answer rather than the network's silence - the controller answered, and asking it again moments later cannot change its answer -
so probing at the network tracks' pace buys nothing. It would also cost something they never risk: UniFi OS refuses sign-ins once an account passes a threshold
of failed attempts it does not publish, and a rate limit is the controller asking to be asked less often, so the network pace would send more of exactly what
it asked to shed. The cadence is therefore kept deliberately sparse. It is not slower still, because a credential or permission corrected on the controller, or
a rate limit it lifts, is picked up within one interval. A consumer's own connect retry waits by this same schedule, choosing it by `isControllerRefusal` as
recovery does, which is why it is published rather than held inside the recovery loop.

## Type Declaration

| Name | Type | Default value |
| ------ | ------ | ------ |
| <a id="property-backoff"></a> `backoff` | readonly \[`30000`, `60000`, `120000`, `240000`\] | - |
| <a id="property-steady"></a> `steady` | `300000` | `300000` |
