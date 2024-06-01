[**unifi-protect**](README.md) • **Docs**

***

[Home](README.md) / ProtectLogging

# ProtectLogging

Logging interface for this library that you can optionally specify.

This interface allows you to leverage your own custom logging capabilities, if you so choose. By default, logging will be done to the console. If you use your own,
you will need to specify the functions to use for the various alert levels that the library uses: `debug`, `error`, `info`, and `warn`.

## Interfaces

### ProtectLogging

Logging interface, leveraging what we do for Homebridge and elsewhere as a good template.

#### Remarks

By default, logging is done to the console. If you use your own logging functions, you must specify all the alert levels that the library uses: `debug`,
`error`, `info`, and `warn`.

#### Methods

##### debug()

```ts
debug(message, ...parameters): void
```

###### Parameters

| Parameter | Type |
| :------ | :------ |
| `message` | `string` |
| ...`parameters` | `unknown`[] |

###### Returns

`void`

##### error()

```ts
error(message, ...parameters): void
```

###### Parameters

| Parameter | Type |
| :------ | :------ |
| `message` | `string` |
| ...`parameters` | `unknown`[] |

###### Returns

`void`

##### info()

```ts
info(message, ...parameters): void
```

###### Parameters

| Parameter | Type |
| :------ | :------ |
| `message` | `string` |
| ...`parameters` | `unknown`[] |

###### Returns

`void`

##### warn()

```ts
warn(message, ...parameters): void
```

###### Parameters

| Parameter | Type |
| :------ | :------ |
| `message` | `string` |
| ...`parameters` | `unknown`[] |

###### Returns

`void`
