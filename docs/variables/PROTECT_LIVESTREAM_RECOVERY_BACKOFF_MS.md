[**unifi-protect**](../README.md)

***

[Home](../README.md) / PROTECT\_LIVESTREAM\_RECOVERY\_BACKOFF\_MS

# Variable: PROTECT\_LIVESTREAM\_RECOVERY\_BACKOFF\_MS

```ts
const PROTECT_LIVESTREAM_RECOVERY_BACKOFF_MS: number[];
```

Livestream live-recovery backoff curve, in milliseconds, indexed by consecutive failed attempts. Live recovery - the stream produced a media segment once and then
faulted - uses this curve as the headroom-clamped per-attempt window: the default policy grants the stage this long for a media segment, having torn down and
negotiated a fresh URL (which often clears a wedged endpoint), before abandoning the attempt and consulting the policy again. The window doubles as the inter-attempt
spacing - a fast-failing attempt still occupies its full window - so one curve expresses both "how long to give this attempt" and "how hard to back off," growing
with each failure; the last value is the steady ceiling. Unlike establishment, recovery is clamped by the consumer's reported headroom (see the await clamp below), so
an urgent consumer recovers faster than this curve and a patient one follows it.
