[**unifi-protect**](../README.md)

***

[Home](../README.md) / RecoveryContext

# Interface: RecoveryContext

What the library can observe at a recovery decision point. Consumer-private state (buffer headroom, controller health) is deliberately *not* here - a consumer that
wants to correlate recovery with controller health reads it in its own policy closure. The fields are exactly what the library itself can compute.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="attempts"></a> `attempts` | `number` | Consecutive failed reconnect attempts this episode; resets to 0 once a media segment flows again. |
| <a id="cameraid"></a> `cameraId` | `string` | The camera this recovery episode belongs to, so a consumer policy can correlate the decision with per-camera state it alone observes. |
| <a id="elapsedms"></a> `elapsedMs` | `number` | Milliseconds since this episode began (the stall moment, or the first establish attempt). Lets a policy enforce a bounded establishment deadline. |
| <a id="phase"></a> `phase` | `"establishing"` \| `"recovering"` | Bounded establishment (fail fast if it never came up) vs. unbounded live recovery (it proved itself once). |
| <a id="tolerancems"></a> `toleranceMs` | `number` | Aggregated delay tolerance across subscribers - the MINIMUM reported, so the most-urgent governs; `Infinity` when none reported. |
