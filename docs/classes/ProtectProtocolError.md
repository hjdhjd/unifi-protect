[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectProtocolError

# Class: ProtectProtocolError

A wire- or response-level violation the library cannot make sense of: an event packet that does not match the documented frame structure, a WebSocket message that
breaks the spec the library decodes against, an HTTP response body that fails to parse, or a response missing data the operation requires. Fatal because the same
bytes will not decode or validate differently on retry - the defect is in the payload, not in reaching it.

## Extends

- [`FatalError`](FatalError.md)

## Constructors

### Constructor

```ts
new ProtectProtocolError(message, options?): ProtectProtocolError;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `message` | `string` |
| `options?` | \{ `cause?`: `unknown`; \} |
| `options.cause?` | `unknown` |

#### Returns

`ProtectProtocolError`

#### Overrides

```ts
FatalError.constructor
```
