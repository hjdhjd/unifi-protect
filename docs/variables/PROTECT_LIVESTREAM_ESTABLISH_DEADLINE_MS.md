[**unifi-protect**](../README.md)

***

[Home](../README.md) / PROTECT\_LIVESTREAM\_ESTABLISH\_DEADLINE\_MS

# Variable: PROTECT\_LIVESTREAM\_ESTABLISH\_DEADLINE\_MS

```ts
const PROTECT_LIVESTREAM_ESTABLISH_DEADLINE_MS: 30000 = 30000;
```

Livestream establishment deadline, in milliseconds. The pool's recovery runs in two regimes: bounded establishment (the stream has never produced a media segment)
and unbounded live recovery (it produced one once and then faulted). The default recovery policy gives up - surfacing ProtectLivestreamUnavailableError - once an
establishing episode has run for longer than this without a first media segment - a stream that connects but never produces media. Live recovery has no such
deadline: a stream that proved itself once keeps being retried (throttled by the backoff curve) until it returns or every subscriber leaves.
