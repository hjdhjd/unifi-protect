[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectConfigurationError

# Class: ProtectConfigurationError

A connect option the library cannot act on, refused by `connect()` before any request is sent: a host that is missing or not a string, or a controller address no
URL can carry, such as an IPv6 literal with a zone (`fe80::1%en0`), a value carrying a userinfo before its last `@`, which a host never does, or one carrying a
path, a query or a fragment. An empty marker before the `@` (`@nvr.local`, `:@nvr.local`) names no account and folds away rather than being refused. Each refusal
that names the address quotes it with its userinfo masked by [maskAddressCredentials](../functions/maskAddressCredentials.md), so a userinfo written into the address is never
printed. Fatal because the same configuration is refused the same way on every attempt, so the caller corrects it rather than retrying.

## Extends

- [`FatalError`](FatalError.md)

## Constructors

### Constructor

```ts
new ProtectConfigurationError(message, options?): ProtectConfigurationError;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `message` | `string` |
| `options?` | \{ `cause?`: `unknown`; \} |
| `options.cause?` | `unknown` |

#### Returns

`ProtectConfigurationError`

#### Overrides

`FatalError.constructor`
