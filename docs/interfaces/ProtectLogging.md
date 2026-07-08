[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectLogging

# Interface: ProtectLogging

Logging interface, leveraging what we do for Homebridge and elsewhere as a good template.

## Remarks

The library is silent by default, falling back to a no-op logger. To route output somewhere, inject your own logging functions covering all the alert levels
the library uses: `debug`, `error`, `info`, and `warn`.

## Methods

### debug()

```ts
debug(message, ...parameters): void;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `message` | `string` |
| ...`parameters` | `unknown`[] |

#### Returns

`void`

***

### error()

```ts
error(message, ...parameters): void;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `message` | `string` |
| ...`parameters` | `unknown`[] |

#### Returns

`void`

***

### info()

```ts
info(message, ...parameters): void;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `message` | `string` |
| ...`parameters` | `unknown`[] |

#### Returns

`void`

***

### warn()

```ts
warn(message, ...parameters): void;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `message` | `string` |
| ...`parameters` | `unknown`[] |

#### Returns

`void`
