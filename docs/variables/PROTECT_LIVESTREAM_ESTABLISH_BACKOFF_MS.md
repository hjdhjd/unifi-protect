[**unifi-protect**](../README.md)

***

[Home](../README.md) / PROTECT\_LIVESTREAM\_ESTABLISH\_BACKOFF\_MS

# Variable: PROTECT\_LIVESTREAM\_ESTABLISH\_BACKOFF\_MS

```ts
const PROTECT_LIVESTREAM_ESTABLISH_BACKOFF_MS: number[];
```

Livestream establishment backoff curve, in milliseconds, indexed by consecutive failed attempts. Establishment - the stream has never produced a media segment - is
bound by the camera's own first-segment latency, which no consumer can hurry: an impatient consumer cannot make the hardware mint faster, and tearing a fresh stream
down early only churns the negotiation. So the default policy's establishment windows are deliberately patient and urgency-INDEPENDENT (they ignore the reported
tolerance), each value the time it grants a fresh stream to produce its first media segment before abandoning the attempt and reconnecting. Summed against the 30 s
deadline this yields roughly four attempts (5s + 8s + 10s + 10s) before give-up. The last value is the steady ceiling once attempts exceed the curve length. These are
safe ecosystem defaults sized for diverse real hardware; a consumer that has measured its own controllers may inject a tighter policy.
