[**unifi-protect**](../README.md)

***

[Home](../README.md) / RequestOptions

# Interface: RequestOptions

Per-request options accepted by [Transport.request](Transport.md#request) and [Transport.send](Transport.md#send). The library composes the caller's `signal` with its own timeout deadline, so
a caller can cancel independently of the timeout. `headers` here override the auth headers the transport stamps on automatically.

## Extended by

- [`SendOptions`](SendOptions.md)

## Properties

| Property | Type |
| ------ | ------ |
| <a id="body"></a> `body?` | `string` \| `Uint8Array`\<`ArrayBufferLike`\> |
| <a id="headers"></a> `headers?` | `Record`\<`string`, `string`\> |
| <a id="method"></a> `method?` | `HttpMethod` |
| <a id="signal"></a> `signal?` | `AbortSignal` |
| <a id="timeout"></a> `timeout?` | `number` |
