[**unifi-protect**](../README.md)

***

[Home](../README.md) / LivestreamSubscriptionState

# Type Alias: LivestreamSubscriptionState

```ts
type LivestreamSubscriptionState = "closed" | "connecting" | "live" | "recovering";
```

The coarse, stable lifecycle of a pooled stream as a subscriber observes it. `connecting` is bounded establishment (no MEDIA segment has ever flowed); `live` is a
healthy stream; `recovering` is an in-flight recovery episode (a recoverable stall shows here *without* ending iteration); `closed` is terminal (disposed, codec
change, a `"direct"` or Opus stream offered no direct address, another audio codec than the one asked for, a socket that cannot send, or the policy gave up).
