[**unifi-protect**](../README.md)

***

[Home](../README.md) / RecoveryContext

# Interface: RecoveryContext

What the library can observe at a recovery decision point. Consumer-private state (buffer headroom, controller health) is deliberately *not* here - a consumer that
wants to correlate recovery with controller health reads it in its own policy closure. The fields are exactly what the library itself can compute.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="attempts"></a> `attempts` | `number` | The failed reconnect attempts this episode has counted; resets to 0 once a media segment flows again. A `"preferDirect"` stream's direct attempt whose session ended before its first media, after reaching its dial or on being offered no direct address, is not among them: it falls back to the proxied route at once, and the policy is consulted again with the count as it stood. A stream asking for Opus that is offered no direct address ends there instead, with no fallback. A direct attempt still dialing when its window elapses, and one whose negotiation failed, are each counted as any failed attempt is. |
| <a id="cameraid"></a> `cameraId` | `string` | The camera this recovery episode belongs to, so a consumer policy can correlate the decision with per-camera state it alone observes. |
| <a id="elapsedms"></a> `elapsedMs` | `number` | Milliseconds since this episode began (the stall moment, or the first establish attempt). Lets a policy enforce a bounded establishment deadline. |
| <a id="phase"></a> `phase` | `"establishing"` \| `"recovering"` | Bounded establishment (fail fast if it never came up) vs. unbounded live recovery (it proved itself once). |
| <a id="tolerancems"></a> `toleranceMs` | `number` | Aggregated delay tolerance across subscribers - the MINIMUM reported, so the most-urgent governs; `Infinity` when none reported. |
