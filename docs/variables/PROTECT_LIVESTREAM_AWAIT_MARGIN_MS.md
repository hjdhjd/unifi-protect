[**unifi-protect**](../README.md)

***

[Home](../README.md) / PROTECT\_LIVESTREAM\_AWAIT\_MARGIN\_MS

# Variable: PROTECT\_LIVESTREAM\_AWAIT\_MARGIN\_MS

```ts
const PROTECT_LIVESTREAM_AWAIT_MARGIN_MS: 1000 = 1000;
```

Livestream await margin, in milliseconds. In the default policy's live-recovery branch, a reconnect attempt's window is the backoff-curve stage, capped by the
most-urgent subscriber's reported tolerance less this margin, so the cap always leaves the consumer some cushion between "the library abandons this attempt" and "the
consumer's own buffer runs dry."
Subtracting a fixed margin rather than a fraction keeps the headroom math legible and the cushion predictable regardless of the reported tolerance's magnitude.
