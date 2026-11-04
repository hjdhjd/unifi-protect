[**unifi-protect**](../README.md)

***

[Home](../README.md) / normalizeMacAddress

# Function: normalizeMacAddress()

```ts
function normalizeMacAddress(value): string;
```

Fold a hardware address into the library's single spelling of it: uppercase, with no separators. Every spelling [isMacAddress](isMacAddress.md) accepts folds the same way,
whether the digits are joined by colons, by hyphens, by dots, or by nothing at all.

Uppercase without separators is the spelling this library carries because it is the spelling a device record's `mac` arrives in on this wire, and the spelling
the companion UniFi Access library carries, so a consumer serving both families keys every device one way. One spelling is the whole point: a consumer keyed on
an address must never be re-keyed by the case a record happened to arrive in. A value that is not an address passes through untouched, because this folds a
known split rather than filtering a vocabulary it does not own.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `value` | `string` | The address exactly as a record spelled it. |

## Returns

`string`

The address in the library's spelling, or the value unchanged when it is not an address.
