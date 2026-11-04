[**unifi-protect**](../README.md)

***

[Home](../README.md) / isPlainObject

# Function: isPlainObject()

```ts
function isPlainObject(value): value is Record<string, unknown>;
```

Whether a value is a plain object: a non-null object whose prototype is the ordinary object prototype or null, the shape parsed JSON gives a record.

The test is the prototype rather than `typeof`, because a payload is whatever the codec produced: parsed JSON, a UTF-8 string, or a `Buffer`. A buffer answers
`typeof` as an object and enumerates as numeric index keys, so a looser test would merge one into a record or walk it and read every byte as a field. Parsed JSON
always carries the ordinary object prototype, so this admits exactly what a record can be, and an array, a `Buffer` or any other typed array, a class instance and
a function each answer false.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `value` | `unknown` | The value to test. |

## Returns

`value is Record<string, unknown>`

`true` when the value is an object whose prototype is the ordinary object prototype or null.
