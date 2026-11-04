[**unifi-protect**](../README.md)

***

[Home](../README.md) / ConnectOptions

# Interface: ConnectOptions

Options for [ProtectClient.connect](../classes/ProtectClient.md#connect). `host`, `username`, and `password` are the required controller address and credentials.

`host` is the controller's address without a scheme: a hostname or an IPv4 address, with an optional `:port`, or an IPv6 literal, accepted bare (`fe80::1`) or
bracketed (`[fe80::1]`), with a port only after the bracketed form (`[fe80::1]:7443`), because a bare literal's own colons leave no way to tell a port from its
last group. A single trailing `/` is accepted and dropped, so `nvr.local/` connects as `nvr.local`, because it is the empty path every URL places after the
address anyway. An address no URL can carry is refused with [ProtectConfigurationError](../classes/ProtectConfigurationError.md) before any request is sent: a host that is missing or not a
string, refused first and quoting nothing, an IPv6 literal with a zone (`fe80::1%en0`), a value carrying a userinfo before its last `@`, because the account
belongs in `username` and `password` rather than in the address, or a value carrying a path, a query or a fragment. An empty marker before the `@` names no
account and folds away, so `@nvr.local` and `:@nvr.local` connect as `nvr.local`. Each refusal that names the address quotes it through
[maskAddressCredentials](../functions/maskAddressCredentials.md), so no userinfo written into `host` is printed.

The rest are optional injected dependencies, each defaulted at the composition root:

- `clock` is the time source threaded into every subsystem (transport, store, event stream, connection monitor, livestream pool, and each talkback session,
  which reads it only to time a connection attempt); it defaults to the wall clock, and tests inject a fake to drive timers deterministically.
- `dispatcher` is an undici `Dispatcher` for the transport's connection pool; when omitted the transport builds and owns its own pool.
- `log` is the structured logger; it defaults to a no-op sink.
- `recoveryPolicy` is the per-stream livestream recovery decision authority handed to the livestream pool; it defaults to [defaultLivestreamRecoveryPolicy](../functions/defaultLivestreamRecoveryPolicy.md).
- `refreshIntervalMs` sets the [StateStore](StateStore.md)'s bootstrap-refresh failsafe cadence; it defaults to the store's interval, and passing `false` disables the
  failsafe entirely so the consumer relies solely on the realtime event stream.
- `signal` cancels the connect alone: the initial login, the bootstrap fetch and the first events stream's connection attempt, which it binds only until the
  stream opens, so an abort once the connect has completed leaves the client running, and no later recovery relaunch carries it.
- `verifyTls` requires the controller to present a certificate that verifies, on the request path and every WebSocket alike. It defaults to `false`, because a
  controller presents a self-signed certificate that no verification chain accepts - turn it on where a trusted certificate has been installed on the controller and
  a connection to an impostor should fail rather than proceed. An injected `dispatcher` or `webSocket` factory brings its own TLS settings, so the option reaches
  only the connections this client builds for itself.
- `webSocket` is the receive-direction [ProtectWebSocket](ProtectWebSocket.md) factory used by the events stream and livestream pool; it defaults to a real socket and is the
  socket-injection point for tests. It does not apply to the write-direction talkback socket.

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
| <a id="verifytls"></a> `verifyTls?` | `boolean` |
| <a id="websocket"></a> `webSocket?` | (`url`) => [`ProtectWebSocket`](ProtectWebSocket.md) |
