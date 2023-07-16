[unifi-protect](../README.md) / [Exports](../modules.md) / FetchError

# Class: FetchError

## Hierarchy

- `FetchBaseError`

  ↳ **`FetchError`**

## Table of contents

### Constructors

- [constructor](FetchError.md#constructor)

### Properties

- [code](FetchError.md#code)
- [errno](FetchError.md#errno)
- [erroredSysCall](FetchError.md#erroredsyscall)
- [message](FetchError.md#message)
- [name](FetchError.md#name)
- [stack](FetchError.md#stack)
- [type](FetchError.md#type)
- [prepareStackTrace](FetchError.md#preparestacktrace)
- [stackTraceLimit](FetchError.md#stacktracelimit)

### Methods

- [captureStackTrace](FetchError.md#capturestacktrace)

## Constructors

### constructor

• **new FetchError**(`message?`)

#### Parameters

| Name | Type |
| :------ | :------ |
| `message?` | `string` |

#### Inherited from

FetchBaseError.constructor

#### Defined in

node_modules/typescript/lib/lib.es5.d.ts:1073

## Properties

### code

• **code**: `string`

#### Defined in

node_modules/@adobe/fetch/src/api.d.ts:304

___

### errno

• `Optional` **errno**: `number`

#### Defined in

node_modules/@adobe/fetch/src/api.d.ts:305

___

### erroredSysCall

• `Optional` **erroredSysCall**: `string`

#### Defined in

node_modules/@adobe/fetch/src/api.d.ts:306

___

### message

• **message**: `string`

#### Inherited from

FetchBaseError.message

#### Defined in

node_modules/typescript/lib/lib.es5.d.ts:1068

___

### name

• **name**: `string`

#### Inherited from

FetchBaseError.name

#### Defined in

node_modules/typescript/lib/lib.es5.d.ts:1067

___

### stack

• `Optional` **stack**: `string`

#### Inherited from

FetchBaseError.stack

#### Defined in

node_modules/typescript/lib/lib.es5.d.ts:1069

___

### type

• `Optional` **type**: `string`

#### Inherited from

FetchBaseError.type

#### Defined in

node_modules/@adobe/fetch/src/api.d.ts:288

___

### prepareStackTrace

▪ `Static` `Optional` **prepareStackTrace**: (`err`: `Error`, `stackTraces`: `CallSite`[]) => `any`

#### Type declaration

▸ (`err`, `stackTraces`): `any`

Optional override for formatting stack traces

**`See`**

https://v8.dev/docs/stack-trace-api#customizing-stack-traces

##### Parameters

| Name | Type |
| :------ | :------ |
| `err` | `Error` |
| `stackTraces` | `CallSite`[] |

##### Returns

`any`

#### Inherited from

FetchBaseError.prepareStackTrace

#### Defined in

node_modules/@types/node/globals.d.ts:11

___

### stackTraceLimit

▪ `Static` **stackTraceLimit**: `number`

#### Inherited from

FetchBaseError.stackTraceLimit

#### Defined in

node_modules/@types/node/globals.d.ts:13

## Methods

### captureStackTrace

▸ `Static` **captureStackTrace**(`targetObject`, `constructorOpt?`): `void`

Create .stack property on a target object

#### Parameters

| Name | Type |
| :------ | :------ |
| `targetObject` | `object` |
| `constructorOpt?` | `Function` |

#### Returns

`void`

#### Inherited from

FetchBaseError.captureStackTrace

#### Defined in

node_modules/@types/node/globals.d.ts:4
