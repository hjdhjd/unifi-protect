[**unifi-protect**](../README.md)

***

[Home](../README.md) / TalkbackState

# Type Alias: TalkbackState

```ts
type TalkbackState = "closed" | "closing" | "connecting" | "live";
```

The deterministic lifecycle of a talkback session. The transitions are: construction begins connecting (`connecting`); WebSocket `open` advances to `live` (and the
static `connect()`'s promise resolves); an error, the caller's abort, or an explicit `close()` requests a graceful close and moves to `closing`; the socket fully
closing and the owned agent being destroyed is `closed`, which a peer-initiated close reaches directly without passing through `closing`. There is no `handshaking`
arm - talkback has no init segment.
