[**unifi-protect**](../README.md)

***

[Home](../README.md) / PROTECT\_LIVESTREAM\_DEFAULT\_TOLERANCE\_MS

# Variable: PROTECT\_LIVESTREAM\_DEFAULT\_TOLERANCE\_MS

```ts
const PROTECT_LIVESTREAM_DEFAULT_TOLERANCE_MS: 10000 = 10000;
```

Default livestream delay tolerance, in milliseconds, used by the default recovery policy's live-recovery branch when no subscriber reported an urgency. Urgency is each
subscriber's "how long can I receive no segment" budget, aggregated across a shared stream by the minimum (the most-urgent governs); when the aggregate is Infinity
(nobody reported), recovery treats the stream as patient and uses this value as the headroom ceiling. It sits at the upper await clamp so an un-urgent stream re-probes
on a relaxed pace. (Establishment ignores this entirely - it is hardware-bound, not headroom-bound.)
