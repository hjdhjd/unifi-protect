[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectLogging

# Interface: ProtectLogging

Logging interface, leveraging what we do for Homebridge and elsewhere as a good template.

## Remarks

The library is silent by default, falling back to a no-op logger. To route output somewhere, inject your own logging functions covering all the alert levels
the library uses: `debug`, `error`, `info`, and `warn`.

Each function is expected to return normally. The library logs from inside its own control flow - a recovery loop, the reboot watch, the line that records a
throwing event listener or state selector - so a logger that throws ends that work where the line sat, and the library contains a consumer's handler but not the
logger it would report that handler through.

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
