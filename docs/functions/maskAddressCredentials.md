[**unifi-protect**](../README.md)

***

[Home](../README.md) / maskAddressCredentials

# Function: maskAddressCredentials()

```ts
function maskAddressCredentials(address): string;
```

Mask the userinfo a controller address can carry, for a message or a log line that names the address: an address carrying no `@` is returned as given, and
otherwise everything up to and including its last `@` is shown as `***@`, an empty marker (`@nvr.local`) included. Every refusal of the controller address is a
[ProtectConfigurationError](../classes/ProtectConfigurationError.md), and each refusal that names the address quotes it through this mask, so a consumer naming the address in its own log applies
the library's own rule.

The cut reads the raw text rather than a parse of it, because a parse can misplace a userinfo: behind a composed `https://`, `https://user:pass@10.0.0.1` parses
as the host `https`. It falls at the last `@` because a password may itself carry an `@`, a `/`, a `?`, a `#` or a `\`, so a cut at any earlier `@` can leave
part of one showing.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `address` | `string` | The controller address as configured. |

## Returns

`string`

The address as given when it carries no `@`, and otherwise `***@` followed by the text after its last `@`.
