[**unifi-protect**](../README.md)

***

[Home](../README.md) / TalkbackState

# Type Alias: TalkbackState

```ts
type TalkbackState = "closed" | "closing" | "connecting" | "live";
```

The deterministic lifecycle of a talkback session. The transitions are: construction begins connecting (`connecting`); WebSocket `open` advances to `live` (and the
static `connect()`'s promise resolves); every teardown path - an error, the caller's abort, an explicit `close()`, or a peer-initiated close - moves to `closed`
synchronously, the release of the owned connection starting in that same step, ahead of anything the teardown reports, and `close()`'s promise settling once the
release completes. `closing` is a momentary arm set inside the teardown call just before `closed`, so a reader of `state` never observes it. There is no
`handshaking` arm - talkback has no init segment.
