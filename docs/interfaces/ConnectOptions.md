[**unifi-protect**](../README.md)

***

[Home](../README.md) / ConnectOptions

# Interface: ConnectOptions

Options for [ProtectClient.connect](../classes/ProtectClient.md#connect). `host`, `username`, and `password` are the required controller address and credentials; the rest are optional injected
seams, each defaulted at the composition root:

- `clock` is the time source threaded into every subsystem (transport, store, event stream, livestream pool); it defaults to the wall clock, and tests inject a
  fake to drive timers deterministically.
- `dispatcher` is an undici `Dispatcher` for the transport's connection pool; when omitted the transport builds and owns its own pool.
- `log` is the structured logger; it defaults to a no-op sink.
- `recoveryPolicy` is the per-stream livestream recovery decision authority handed to the livestream pool; it defaults to [defaultLivestreamRecoveryPolicy](../functions/defaultLivestreamRecoveryPolicy.md).
- `refreshIntervalMs` sets the [StateStore](StateStore.md)'s bootstrap-refresh failsafe cadence; it defaults to the store's interval, and passing `false` disables the
  failsafe entirely so the consumer relies solely on the realtime event stream.
- `signal` cancels the initial login and bootstrap fetch; it is bound only to connect, never to a later recovery relaunch.
- `webSocket` is the receive-direction [ProtectWebSocket](ProtectWebSocket.md) factory used by the events stream and livestream pool; it defaults to a real socket and is the
  socket-injection seam for tests. It does not apply to the write-direction talkback socket.

## Properties

| Property | Type |
| ------ | ------ |
| <a id="clock"></a> `clock?` | [`Clock`](Clock.md) |
| <a id="dispatcher"></a> `dispatcher?` | `Dispatcher` |
| <a id="host"></a> `host` | `string` |
| <a id="log"></a> `log?` | [`ProtectLogging`](ProtectLogging.md) |
| <a id="password"></a> `password` | `string` |
| <a id="recoverypolicy"></a> `recoveryPolicy?` | [`RecoveryPolicy`](../type-aliases/RecoveryPolicy.md) |
| <a id="refreshintervalms"></a> `refreshIntervalMs?` | `number` \| `false` |
| <a id="signal"></a> `signal?` | `AbortSignal` |
| <a id="username"></a> `username` | `string` |
| <a id="websocket"></a> `webSocket?` | (`url`) => [`ProtectWebSocket`](ProtectWebSocket.md) |
