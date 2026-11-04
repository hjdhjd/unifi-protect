[**unifi-protect**](../README.md)

***

[Home](../README.md) / isMacAddress

# Function: isMacAddress()

```ts
function isMacAddress(value): boolean;
```

Whether a value is a hardware address. The accepted spellings are the six pairs joined by colons, the twelve digits run together, the six pairs joined by
hyphens, and the three quads joined by dots, in either case.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `value` | `string` | The value exactly as a record carried it. |

## Returns

`boolean`

`true` when the value is a hardware address, in any of the four spellings and either case.
