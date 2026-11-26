[**unifi-protect**](../README.md)

***

[Home](../README.md) / RecoveryDecision

# Type Alias: RecoveryDecision

```ts
type RecoveryDecision = 
  | {
  awaitMs: number;
  kind: "reconnect";
}
  | {
  forMs: number;
  kind: "wait";
}
  | {
  kind: "giveUp";
};
```

A recovery decision the [RecoveryPolicy](RecoveryPolicy.md) returns. Its arms are exhaustive:

- `reconnect` tears down any socket and connects fresh; the attempt is treated as failed if no media segment arrives within `awaitMs`, then the policy is re-consulted.
  `awaitMs` doubles as the inter-attempt spacing (a fast-failing attempt still occupies its full window, except a `"preferDirect"` stream's direct attempt that fails
  at its dial or is offered no direct address, which falls back to the proxied route at once, or ends the stream when it asks for Opus and was offered no direct
  address), so the single policy governs both disposition and timing. The pool keeps an attempt past `awaitMs` while its frames keep arriving - until its first
  media, until its frames fall silent for the stream's media-stall detection threshold, until its session closes, or until
  [PROTECT\_LIVESTREAM\_ESTABLISH\_DEADLINE\_MS](../variables/PROTECT_LIVESTREAM_ESTABLISH_DEADLINE_MS.md) has passed since its first frame - because a UBV stream's writer can hold the stream's first media while it
  waits for audio.
- `wait` does nothing for `forMs`, then re-consults - unifying defer-soak (a still-connecting session's late media segment cancels it early) and inter-attempt backoff.
  A `"preferDirect"` stream's direct attempt that had not reached its dial when its window elapsed, and so did not fall back then, ends the wait early if its dial
  then fails or it is offered no direct address, and the stream falls back to the proxied route, or ends when it asks for Opus and was offered no direct address.
  A direct session already dialing at the elapse fell back then, and its later end is absorbed.
- `giveUp` is terminal: the give-up error is thrown into every subscriber and the stream is torn down.
