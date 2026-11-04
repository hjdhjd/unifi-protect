[**unifi-protect**](../README.md)

***

[Home](../README.md) / PROTECT\_LIVESTREAM\_AWAIT\_MIN\_MS

# Variable: PROTECT\_LIVESTREAM\_AWAIT\_MIN\_MS

```ts
const PROTECT_LIVESTREAM_AWAIT_MIN_MS: 3000 = 3000;
```

Livestream await window clamp, in milliseconds, for the default policy's live-recovery branch (establishment is unclamped - it follows its own patient curve). Recovery
clamps every reconnect attempt's window to [min, max]: the floor keeps even a maximally-urgent consumer (reporting near-zero tolerance) from tearing down a fresh
stream before the controller can plausibly mint its first segment - the same first-segment latency establishment respects - and the ceiling keeps a patient consumer
re-probing often enough to catch the controller's return promptly. The backoff stage and the headroom-derived cap are both clamped into this band, so the policy
self-tunes within sane bounds.
