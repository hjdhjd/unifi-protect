[**unifi-protect**](../README.md)

***

[Home](../README.md) / defaultLivestreamRecoveryPolicy

# Function: defaultLivestreamRecoveryPolicy()

```ts
function defaultLivestreamRecoveryPolicy(context): RecoveryDecision;
```

The library's default, health-agnostic recovery policy. It is **phase-split**, because the two regimes have different timing authorities:

- **Establishment (`phase === "establishing"`) is hardware-bound and urgency-INDEPENDENT.** A fresh stream is minted at the camera's own first-segment latency, which
  no consumer can hurry - so the per-attempt window follows the fixed, patient [PROTECT\_LIVESTREAM\_ESTABLISH\_BACKOFF\_MS](../variables/PROTECT_LIVESTREAM_ESTABLISH_BACKOFF_MS.md) curve and ignores `toleranceMs` entirely
  (tearing a fresh stream down early just churns the negotiation). It gives up once the episode runs past [PROTECT\_LIVESTREAM\_ESTABLISH\_DEADLINE\_MS](../variables/PROTECT_LIVESTREAM_ESTABLISH_DEADLINE_MS.md) - the
  stream that connects but never produces media, its windows walking the patient establishment curve and holding at the last stage until the deadline.
- **Live recovery (`phase === "recovering"`) is headroom-clamped and unbounded.** A stream that proved itself once is retried forever (never `giveUp`); each window
  grows along [PROTECT\_LIVESTREAM\_RECOVERY\_BACKOFF\_MS](../variables/PROTECT_LIVESTREAM_RECOVERY_BACKOFF_MS.md), capped by the consumer's headroom (the aggregated tolerance less a margin; the patient default when none
  reported) and clamped to [PROTECT\_LIVESTREAM\_AWAIT\_MIN\_MS](../variables/PROTECT_LIVESTREAM_AWAIT_MIN_MS.md)/[PROTECT\_LIVESTREAM\_AWAIT\_MAX\_MS](../variables/PROTECT_LIVESTREAM_AWAIT_MAX_MS.md). An urgent subscriber recovers at the floor; a patient one
  follows the curve.

These are safe **ecosystem** defaults - conservative across the diverse hardware real users run, not tuned for a fast controller. A consumer that has measured its own
controllers' latency (e.g. HBUP) injects a tighter policy; a consumer composing one may delegate here for the timing and override only the disposition, or replace it.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `context` | [`RecoveryContext`](../interfaces/RecoveryContext.md) | The library-observable recovery context. |

## Returns

[`RecoveryDecision`](../type-aliases/RecoveryDecision.md)

The recovery decision for this step.
