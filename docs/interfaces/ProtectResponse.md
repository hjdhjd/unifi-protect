[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectResponse

# Interface: ProtectResponse

An HTTP response from the Protect controller, returned by [Transport.send](Transport.md#send). The body is eagerly buffered (so no undrained stream can hold a slot in the
connection pool), and decoding is synchronous and lazy on top of that buffer. `send` returns this for *any* status; call [ProtectResponse.ensureOk](#ensureok) to turn
a non-2xx into its typed `FatalError`.

## Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="body"></a> `body` | `readonly` | `Buffer` | The fully buffered response body. Consumers needing raw bytes (e.g., a snapshot JPEG) read this directly. |
| <a id="headers"></a> `headers` | `readonly` | `IncomingHttpHeaders` | The response headers as undici delivered them. |
| <a id="statuscode"></a> `statusCode` | `readonly` | `number` | The HTTP status code. |

## Methods

### ensureOk()

```ts
ensureOk(): this;
```

Assert a successful response. Returns `this` unchanged on a 2xx so the call chains (`(await send(...)).ensureOk().json<T>()`); throws the classified
`FatalError` on any non-2xx.

#### Returns

`this`

`this`, for chaining.

#### Throws

[ProtectAuthError](../classes/ProtectAuthError.md) on 401, [ProtectAuthorizationError](../classes/ProtectAuthorizationError.md) on 403, [ProtectRequestError](../classes/ProtectRequestError.md) on any other non-2xx.

***

### json()

```ts
json<T>(): T;
```

Parse the body as JSON. Synchronous - the bytes are already in hand.

#### Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| `T` | The expected shape of the parsed document. |

#### Returns

`T`

The parsed body.

#### Throws

[ProtectProtocolError](../classes/ProtectProtocolError.md) if the body is not valid JSON.

***

### text()

```ts
text(): string;
```

Decode the body as a UTF-8 string.

#### Returns

`string`

The body text.
