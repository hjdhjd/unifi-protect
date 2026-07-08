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
  `awaitMs` doubles as the inter-attempt spacing (a fast-failing attempt still occupies its full window), so the single policy governs both disposition and timing.
- `wait` does nothing for `forMs`, then re-consults - unifying defer-soak (a still-connecting session's late segment cancels it early) and inter-attempt backoff.
- `giveUp` is terminal: the give-up error is thrown into every subscriber and the stream is torn down.
