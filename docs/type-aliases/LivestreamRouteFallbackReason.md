[**unifi-protect**](../README.md)

***

[Home](../README.md) / LivestreamRouteFallbackReason

# Type Alias: LivestreamRouteFallbackReason

```ts
type LivestreamRouteFallbackReason = "noDirectAddress" | "noMedia" | "unreachable";
```

Why a `"preferDirect"` livestream fell back from its direct route, the `reason` a [LivestreamRouteFallbackPayload](../interfaces/LivestreamRouteFallbackPayload.md) carries: `"noDirectAddress"`, the
controller offered no direct address; `"unreachable"`, the direct connection never opened, its dial refused, reset or left unanswered, or the media server
refusing or never answering its WebSocket upgrade; and `"noMedia"`, it opened and no media arrived before the attempt ended.
