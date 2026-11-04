[**unifi-protect**](../README.md)

***

[Home](../README.md) / SendOptions

# Interface: SendOptions

The lower-level [Transport.send](Transport.md#send) options. Each flag is a special caller opting out of one default send behavior.

- `authRetry` controls the injected 401-relogin hook: the authenticated request path leaves it at its default of `true`, while the `AuthSession` login handshake
  passes `false` so its own 401 cannot recurse back into relogin.
- `probe` marks a request as the connection-recovery reachability trial. It skips the open breaker's cooldown gate so the trial can dispatch at the
  `ConnectionMonitor`'s cadence rather than waiting out the breaker's cooldown ([PROTECT\_API\_RETRY\_INTERVAL](../variables/PROTECT_API_RETRY_INTERVAL.md)), while its outcome still books through the normal
  path - so a probe drawing the first answer `controllerServing` accepts closes the breaker exactly as the autonomous half-open trial would, and a probe its
  caller cancels books nothing, like any cancelled request. The monitor's recovery hooks (`verify`, recovery `reBootstrap`) pass `true`, and so does the handshake
  of a relogin a 401 on one of them triggers, so that relogin reaches the controller as the trial did; the refresh failsafe and device commands leave it `false` and
  stay gated, as does a relogin one of them triggers, so the breaker still protects against operational hammering.

## Extends

- [`RequestOptions`](RequestOptions.md)

## Properties

| Property | Type | Inherited from |
| ------ | ------ | ------ |
| <a id="authretry"></a> `authRetry?` | `boolean` | - |
| <a id="body"></a> `body?` | `string` \| `Uint8Array`\<`ArrayBufferLike`\> | [`RequestOptions`](RequestOptions.md).[`body`](RequestOptions.md#body) |
| <a id="headers"></a> `headers?` | `Record`\<`string`, `string`\> | [`RequestOptions`](RequestOptions.md).[`headers`](RequestOptions.md#headers) |
| <a id="method"></a> `method?` | `HttpMethod` | [`RequestOptions`](RequestOptions.md).[`method`](RequestOptions.md#method) |
| <a id="probe"></a> `probe?` | `boolean` | - |
| <a id="signal"></a> `signal?` | `AbortSignal` | [`RequestOptions`](RequestOptions.md).[`signal`](RequestOptions.md#signal) |
| <a id="timeout"></a> `timeout?` | `number` | [`RequestOptions`](RequestOptions.md).[`timeout`](RequestOptions.md#timeout) |
