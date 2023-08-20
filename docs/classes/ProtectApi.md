[unifi-protect](../README.md) / [Exports](../modules.md) / ProtectApi

# Class: ProtectApi

The UniFi Protect API is largely undocumented and has been reverse engineered mostly through
the web interface, and trial and error.

Here's how the UniFi Protect API works:

1. [Login](ProtectApi.md#login) to the UniFi Protect controller and acquire security credentials for further calls to the API.

2. Enumerate the list of UniFi Protect devices by calling the [bootstrap](ProtectApi.md#bootstrap) endpoint. This contains everything you would want to know about this particular
   UniFi Protect controller, including enumerating all the devices it knows about.

3. Listen for `message` events emitted by [ProtectApi](ProtectApi.md) containing all Protect controller events, in realtime. They are delivered as [ProtectEventPacket](../modules.md#protecteventpacket)
   packets, containing the event-specific details.

Those are the basics that gets us up and running.

## Hierarchy

- `EventEmitter`

  ↳ **`ProtectApi`**

## Table of contents

### Constructors

- [constructor](ProtectApi.md#constructor)

### Properties

- [captureRejectionSymbol](ProtectApi.md#capturerejectionsymbol)
- [captureRejections](ProtectApi.md#capturerejections)
- [defaultMaxListeners](ProtectApi.md#defaultmaxlisteners)
- [errorMonitor](ProtectApi.md#errormonitor)

### Accessors

- [bootstrap](ProtectApi.md#bootstrap)
- [isAdminUser](ProtectApi.md#isadminuser)
- [name](ProtectApi.md#name)

### Methods

- [addListener](ProtectApi.md#addlistener)
- [clearLoginCredentials](ProtectApi.md#clearlogincredentials)
- [createLivestream](ProtectApi.md#createlivestream)
- [emit](ProtectApi.md#emit)
- [enableRtsp](ProtectApi.md#enablertsp)
- [eventNames](ProtectApi.md#eventnames)
- [getApiEndpoint](ProtectApi.md#getapiendpoint)
- [getBootstrap](ProtectApi.md#getbootstrap)
- [getDeviceName](ProtectApi.md#getdevicename)
- [getFullName](ProtectApi.md#getfullname)
- [getMaxListeners](ProtectApi.md#getmaxlisteners)
- [getSnapshot](ProtectApi.md#getsnapshot)
- [getWsEndpoint](ProtectApi.md#getwsendpoint)
- [listenerCount](ProtectApi.md#listenercount)
- [listeners](ProtectApi.md#listeners)
- [login](ProtectApi.md#login)
- [off](ProtectApi.md#off)
- [on](ProtectApi.md#on)
- [once](ProtectApi.md#once)
- [prependListener](ProtectApi.md#prependlistener)
- [prependOnceListener](ProtectApi.md#prependoncelistener)
- [rawListeners](ProtectApi.md#rawlisteners)
- [removeAllListeners](ProtectApi.md#removealllisteners)
- [removeListener](ProtectApi.md#removelistener)
- [retrieve](ProtectApi.md#retrieve)
- [setMaxListeners](ProtectApi.md#setmaxlisteners)
- [updateDevice](ProtectApi.md#updatedevice)
- [addAbortListener](ProtectApi.md#addabortlistener)
- [getEventListeners](ProtectApi.md#geteventlisteners)
- [getMaxListeners](ProtectApi.md#getmaxlisteners-1)
- [listenerCount](ProtectApi.md#listenercount-1)
- [on](ProtectApi.md#on-1)
- [once](ProtectApi.md#once-1)
- [setMaxListeners](ProtectApi.md#setmaxlisteners-1)

## Constructors

### constructor

• **new ProtectApi**(`log?`)

Create an instance of the UniFi Protect API.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `log?` | [`ProtectLogging`](../interfaces/ProtectLogging.md) | Logging functions to use. |

**`Default Value`**

`none` - Logging will be done to stdout and stderr.

#### Overrides

EventEmitter.constructor

#### Defined in

[src/protect-api.ts:79](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-api.ts#L79)

## Properties

### captureRejectionSymbol

▪ `Static` `Readonly` **captureRejectionSymbol**: typeof [`captureRejectionSymbol`](ProtectLivestream.md#capturerejectionsymbol)

Value: `Symbol.for('nodejs.rejection')`

See how to write a custom `rejection handler`.

**`Since`**

v13.4.0, v12.16.0

#### Inherited from

EventEmitter.captureRejectionSymbol

#### Defined in

node_modules/@types/node/events.d.ts:390

___

### captureRejections

▪ `Static` **captureRejections**: `boolean`

Value: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#Boolean_type)

Change the default `captureRejections` option on all new `EventEmitter` objects.

**`Since`**

v13.4.0, v12.16.0

#### Inherited from

EventEmitter.captureRejections

#### Defined in

node_modules/@types/node/events.d.ts:397

___

### defaultMaxListeners

▪ `Static` **defaultMaxListeners**: `number`

By default, a maximum of `10` listeners can be registered for any single
event. This limit can be changed for individual `EventEmitter` instances
using the `emitter.setMaxListeners(n)` method. To change the default
for _all_`EventEmitter` instances, the `events.defaultMaxListeners`property can be used. If this value is not a positive number, a `RangeError`is thrown.

Take caution when setting the `events.defaultMaxListeners` because the
change affects _all_`EventEmitter` instances, including those created before
the change is made. However, calling `emitter.setMaxListeners(n)` still has
precedence over `events.defaultMaxListeners`.

This is not a hard limit. The `EventEmitter` instance will allow
more listeners to be added but will output a trace warning to stderr indicating
that a "possible EventEmitter memory leak" has been detected. For any single`EventEmitter`, the `emitter.getMaxListeners()` and `emitter.setMaxListeners()`methods can be used to
temporarily avoid this warning:

```js
import { EventEmitter } from 'node:events';
const emitter = new EventEmitter();
emitter.setMaxListeners(emitter.getMaxListeners() + 1);
emitter.once('event', () => {
  // do stuff
  emitter.setMaxListeners(Math.max(emitter.getMaxListeners() - 1, 0));
});
```

The `--trace-warnings` command-line flag can be used to display the
stack trace for such warnings.

The emitted warning can be inspected with `process.on('warning')` and will
have the additional `emitter`, `type`, and `count` properties, referring to
the event emitter instance, the event's name and the number of attached
listeners, respectively.
Its `name` property is set to `'MaxListenersExceededWarning'`.

**`Since`**

v0.11.2

#### Inherited from

EventEmitter.defaultMaxListeners

#### Defined in

node_modules/@types/node/events.d.ts:434

___

### errorMonitor

▪ `Static` `Readonly` **errorMonitor**: typeof [`errorMonitor`](ProtectLivestream.md#errormonitor)

This symbol shall be used to install a listener for only monitoring `'error'`events. Listeners installed using this symbol are called before the regular`'error'` listeners are called.

Installing a listener using this symbol does not change the behavior once an`'error'` event is emitted. Therefore, the process will still crash if no
regular `'error'` listener is installed.

**`Since`**

v13.6.0, v12.17.0

#### Inherited from

EventEmitter.errorMonitor

#### Defined in

node_modules/@types/node/events.d.ts:383

## Accessors

### bootstrap

• `get` **bootstrap**(): ``null`` \| `Readonly`<[`ProtectNvrBootstrapInterface`](../interfaces/ProtectNvrBootstrapInterface.md)\>

Access the Protect controller bootstrap JSON.

#### Returns

``null`` \| `Readonly`<[`ProtectNvrBootstrapInterface`](../interfaces/ProtectNvrBootstrapInterface.md)\>

Returns the bootstrap JSON if the Protect controller has been bootstrapped, `null` otherwise.

#### Defined in

[src/protect-api.ts:1206](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-api.ts#L1206)

___

### isAdminUser

• `get` **isAdminUser**(): `boolean`

Utility method that returns whether the credentials that were used to login to the Protect controller have administrative privileges or not.

#### Returns

`boolean`

Returns `true` if the logged in user has administrative privileges, `false` otherwise.

#### Defined in

[src/protect-api.ts:1217](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-api.ts#L1217)

___

### name

• `get` **name**(): `string`

Utility method that returns a nicely formatted version of the Protect controller name.

#### Returns

`string`

Returns the Protect controller name in the following format:
  <code>*Protect controller name* [*Protect controller type*]</code>.

#### Defined in

[src/protect-api.ts:1229](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-api.ts#L1229)

## Methods

### addListener

▸ **addListener**(`eventName`, `listener`): [`ProtectApi`](ProtectApi.md)

Alias for `emitter.on(eventName, listener)`.

#### Parameters

| Name | Type |
| :------ | :------ |
| `eventName` | `string` \| `symbol` |
| `listener` | (...`args`: `any`[]) => `void` |

#### Returns

[`ProtectApi`](ProtectApi.md)

**`Since`**

v0.1.26

#### Inherited from

EventEmitter.addListener

#### Defined in

node_modules/@types/node/events.d.ts:454

___

### clearLoginCredentials

▸ **clearLoginCredentials**(): `void`

Clear the login credentials and terminate any open connection to the UniFi Protect events API.

#### Returns

`void`

#### Defined in

[src/protect-api.ts:775](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-api.ts#L775)

___

### createLivestream

▸ **createLivestream**(): [`ProtectLivestream`](ProtectLivestream.md)

Return a new instance of the Protect livestream API.

#### Returns

[`ProtectLivestream`](ProtectLivestream.md)

Returns a new livestream API object.

**`Remarks`**

This method should be used to create a new livestream API object. It allows you to create access livestreams of individual cameras and interact
  directly with the H.264 fMP4 streams for a given camera.

#### Defined in

[src/protect-api.ts:1114](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-api.ts#L1114)

___

### emit

▸ **emit**(`eventName`, `...args`): `boolean`

Synchronously calls each of the listeners registered for the event named`eventName`, in the order they were registered, passing the supplied arguments
to each.

Returns `true` if the event had listeners, `false` otherwise.

```js
import { EventEmitter } from 'node:events';
const myEmitter = new EventEmitter();

// First listener
myEmitter.on('event', function firstListener() {
  console.log('Helloooo! first listener');
});
// Second listener
myEmitter.on('event', function secondListener(arg1, arg2) {
  console.log(`event with parameters ${arg1}, ${arg2} in second listener`);
});
// Third listener
myEmitter.on('event', function thirdListener(...args) {
  const parameters = args.join(', ');
  console.log(`event with parameters ${parameters} in third listener`);
});

console.log(myEmitter.listeners('event'));

myEmitter.emit('event', 1, 2, 3, 4, 5);

// Prints:
// [
//   [Function: firstListener],
//   [Function: secondListener],
//   [Function: thirdListener]
// ]
// Helloooo! first listener
// event with parameters 1, 2 in second listener
// event with parameters 1, 2, 3, 4, 5 in third listener
```

#### Parameters

| Name | Type |
| :------ | :------ |
| `eventName` | `string` \| `symbol` |
| `...args` | `any`[] |

#### Returns

`boolean`

**`Since`**

v0.1.26

#### Inherited from

EventEmitter.emit

#### Defined in

node_modules/@types/node/events.d.ts:716

___

### enableRtsp

▸ **enableRtsp**(`device`): `Promise`<``null`` \| `Readonly`<[`ProtectCameraConfigInterface`](../interfaces/ProtectCameraConfigInterface.md)\>\>

Utility method that enables all RTSP channels on a given Protect camera.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `device` | [`ProtectCameraConfigInterface`](../interfaces/ProtectCameraConfigInterface.md) | Protect camera to modify. |

#### Returns

`Promise`<``null`` \| `Readonly`<[`ProtectCameraConfigInterface`](../interfaces/ProtectCameraConfigInterface.md)\>\>

Returns a promise that will resolve to the updated [ProtectCameraConfig](../interfaces/ProtectCameraConfig.md) if successful, and `null` otherwise.

#### Defined in

[src/protect-api.ts:699](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-api.ts#L699)

___

### eventNames

▸ **eventNames**(): (`string` \| `symbol`)[]

Returns an array listing the events for which the emitter has registered
listeners. The values in the array are strings or `Symbol`s.

```js
import { EventEmitter } from 'node:events';

const myEE = new EventEmitter();
myEE.on('foo', () => {});
myEE.on('bar', () => {});

const sym = Symbol('symbol');
myEE.on(sym, () => {});

console.log(myEE.eventNames());
// Prints: [ 'foo', 'bar', Symbol(symbol) ]
```

#### Returns

(`string` \| `symbol`)[]

**`Since`**

v6.0.0

#### Inherited from

EventEmitter.eventNames

#### Defined in

node_modules/@types/node/events.d.ts:779

___

### getApiEndpoint

▸ **getApiEndpoint**(`endpoint`): `string`

Return an API endpoint for the requested endpoint type.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `endpoint` | `string` | Requested endpoint type. |

#### Returns

`string`

Returns a URL to the requested endpoint if successful, and an empty string otherwise.

**`Remarks`**

Valid API endpoints are `bootstrap`, `camera`, `chime`, `light`, `login`, `nvr`, `self`, `sensor`, `websocket` and `viewer`.

#### Defined in

[src/protect-api.ts:1129](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-api.ts#L1129)

___

### getBootstrap

▸ **getBootstrap**(): `Promise`<`boolean`\>

Retrieve the bootstrap JSON from a UniFi Protect controller.

#### Returns

`Promise`<`boolean`\>

Returns a promise that will resolve to `true` if successful and `false` otherwise.

**`Remarks`**

A `bootstrap` event will be emitted each time this method is successfully called, with the [ProtectNvrBootstrap](../interfaces/ProtectNvrBootstrap.md) JSON as an argument.

**`Example`**

Retrieve the bootstrap JSON. You can selectively choose to either `await` the promise that is returned by `getBootstrap`, or subscribe to the `bootstrap` event.

```ts
import { ProtectApi, ProtectNvrBootstrap } from "unifi-protect";
import util from "node:util";

// Create a new Protect API instance.
const ufp = new ProtectApi();

// Set a listener to wait for the bootstrap event to occur.
ufp.once("bootstrap", (bootstrapJSON: ProtectNvrBootstrap) => {

  // Once we've bootstrapped the Protect controller, output the bootstrap JSON and we're done.
  process.stdout.write(util.inspect(bootstrapJSON, { colors: true, depth: null, sorted: true }) + "\n", () => process.exit(0));
});

// Login to the Protect controller.
if(!(await ufp.login("protect-controller.local", "username", "password"))) {

  console.log("Invalid login credentials.");
  process.exit(0);
};

// Bootstrap the controller. It will emit a message once it's received the bootstrap JSON, or you can alternatively wait for the promise to resolve.
if(!(await ufp.getBootstrap())) {

  console.log("Unable to bootstrap the Protect controller.");
  process.exit(0);
}
```

Alternatively, you can access the bootstrap JSON directly through the [bootstrap](ProtectApi.md#bootstrap) accessor:

```ts
import { ProtectApi } from "unifi-protect";
import util from "node:util";

// Create a new Protect API instance.
const ufp = new ProtectApi();

// Login to the Protect controller.
if(!(await ufp.login("protect-controller.local", "username", "password"))) {

  console.log("Invalid login credentials.");
  process.exit(0);
};

// Bootstrap the controller.
if(!(await ufp.getBootstrap())) {

  console.log("Unable to bootstrap the Protect controller.");
  process.exit(0);
}

// Once we've bootstrapped the Protect controller, access the bootstrap JSON through the bootstrap accessor and we're done.
process.stdout.write(util.inspect(ufp.bootstrap, { colors: true, depth: null, sorted: true }) + "\n", () => process.exit(0));
```

#### Defined in

[src/protect-api.ts:475](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-api.ts#L475)

___

### getDeviceName

▸ **getDeviceName**(`device`, `name?`, `deviceInfo?`): `string`

Utility method that generates a nicely formatted device information string.

#### Parameters

| Name | Type | Default value | Description |
| :------ | :------ | :------ | :------ |
| `device` | [`ProtectKnownDeviceTypes`](../modules.md#protectknowndevicetypes) | `undefined` | Protect device. |
| `name` | `string` | `device.name` | Optional name for the device. Defaults to the device type (e.g. `G4 Pro`). |
| `deviceInfo` | `boolean` | `false` | Optionally specify whether or not to include the IP address and MAC address in the returned string. Defaults to `false`. |

#### Returns

`string`

Returns the Protect device name in the following format: <code>*Protect device name* [*Protect device type*] (address: *IP address* mac: *MAC address*)</code>.

**`Remarks`**

The example above assumed the `deviceInfo` parameter is set to `true`.

#### Defined in

[src/protect-api.ts:736](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-api.ts#L736)

___

### getFullName

▸ **getFullName**(`device`): `string`

Utility method that generates a combined, nicely formatted device and NVR string.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `device` | [`ProtectKnownDeviceTypes`](../modules.md#protectknowndevicetypes) | Protect device. |

#### Returns

`string`

Returns the Protect device name in the following format:
  <code>*Protect controller name* [*Protect controller type*] *Protect device name* [*Protect device type*]</code>.

#### Defined in

[src/protect-api.ts:763](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-api.ts#L763)

___

### getMaxListeners

▸ **getMaxListeners**(): `number`

Returns the current max listener value for the `EventEmitter` which is either
set by `emitter.setMaxListeners(n)` or defaults to [defaultMaxListeners](ProtectApi.md#defaultmaxlisteners).

#### Returns

`number`

**`Since`**

v1.0.0

#### Inherited from

EventEmitter.getMaxListeners

#### Defined in

node_modules/@types/node/events.d.ts:631

___

### getSnapshot

▸ **getSnapshot**(`device`, `width?`, `height?`, `timestamp?`, `usePackageCamera?`): `Promise`<``null`` \| `Buffer`\>

Retrieve a snapshot image from a Protect camera.

#### Parameters

| Name | Type | Default value | Description |
| :------ | :------ | :------ | :------ |
| `device` | `Readonly`<[`ProtectCameraConfigInterface`](../interfaces/ProtectCameraConfigInterface.md)\> | `undefined` | Protect device. |
| `width?` | `number` | `undefined` | Optionally specify the image width to request. Defaults selected by the Protect controller, based on the camera resolution. |
| `height?` | `number` | `undefined` | Optionally specify the image height to request. Defaults selected by the Protect controller, based on the camera resolution. |
| `timestamp` | `number` | `undefined` | Optionally specify the timestamp index to retrieve. Defaults to the current time. |
| `usePackageCamera` | `boolean` | `false` | Optionally specify retrieving a snapshot fron the package camera, rather than the primary camera lens. Defaults to `false`. |

#### Returns

`Promise`<``null`` \| `Buffer`\>

Returns a promise that will resolve to a Buffer containing the JPEG image snapshot if successful, and `null` otherwise.

#### Defined in

[src/protect-api.ts:550](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-api.ts#L550)

___

### getWsEndpoint

▸ **getWsEndpoint**(`endpoint`, `params?`): `Promise`<``null`` \| `string`\>

Return a websocket API endpoint for the requested endpoint type.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `endpoint` | ``"livestream"`` \| ``"talkback"`` | Requested endpoint type. Valid types are `livestream` and `talkback`. |
| `params?` | `URLSearchParams` | Parameters to pass on for the endpoint request. |

#### Returns

`Promise`<``null`` \| `string`\>

Returns a promise that will resolve to a URL to the requested endpoint if successful, and `null` otherwise.

**`Remarks`**

Valid API endpoints are `livestream` and `talkback`.

* The `livestream` endpoint will return a URL to a websocket that provides an encoded livestream from a given camera. **Do not access this endpoint directly, use
  [createLivestream](ProtectApi.md#createlivestream) instead.** Accessing the livestream endpoint directly is not directly useful without additional manipulation, which, unless you have
  a need for, you should avoid dealing with and use the [ProtectLivestream](ProtectLivestream.md) API instead that provides you direct access to the livestream as an H.264 fMP4.
* The `talkback` endpoint creates a talkback connection to a Protect camera that contains a speaker (e.g. Protect doorbells).
  The returned websocket accepts an AAC-encoded ADTS stream. The only valid parameter is `camera`, containing the ID of the Protect camera you want to connect to.

#### Defined in

[src/protect-api.ts:839](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-api.ts#L839)

___

### listenerCount

▸ **listenerCount**(`eventName`, `listener?`): `number`

Returns the number of listeners listening for the event named `eventName`.
If `listener` is provided, it will return how many times the listener is found
in the list of the listeners of the event.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `eventName` | `string` \| `symbol` | The name of the event being listened for |
| `listener?` | `Function` | The event handler function |

#### Returns

`number`

**`Since`**

v3.2.0

#### Inherited from

EventEmitter.listenerCount

#### Defined in

node_modules/@types/node/events.d.ts:725

___

### listeners

▸ **listeners**(`eventName`): `Function`[]

Returns a copy of the array of listeners for the event named `eventName`.

```js
server.on('connection', (stream) => {
  console.log('someone connected!');
});
console.log(util.inspect(server.listeners('connection')));
// Prints: [ [Function] ]
```

#### Parameters

| Name | Type |
| :------ | :------ |
| `eventName` | `string` \| `symbol` |

#### Returns

`Function`[]

**`Since`**

v0.1.26

#### Inherited from

EventEmitter.listeners

#### Defined in

node_modules/@types/node/events.d.ts:644

___

### login

▸ **login**(`nvrAddress`, `username`, `password`): `Promise`<`boolean`\>

Execute a login attempt to the UniFi Protect API.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `nvrAddress` | `string` | Address of the UniFi Protect controller, expressed as an FQDN or IP address. |
| `username` | `string` | Username to use when logging into the controller. |
| `password` | `string` | Password to use when logging into the controller. |

#### Returns

`Promise`<`boolean`\>

Returns a promise that will resolve to `true` if successful and `false` otherwise.

**`Remarks`**

A `login` event will be emitted each time this method is called, with the result of the attempt as an argument.

**`Example`**

Login to the Protect controller. You can selectively choose to either `await` the promise that is returned by `login`, or subscribe to the `login` event.

```ts
import { ProtectApi } from "unifi-protect";

// Create a new Protect API instance.
const ufp = new ProtectApi();

// Set a listener to wait for the login event to occur.
ufp.once("login", (successfulLogin: boolean) => {

  // Indicate if we are successful.
  if(successfulLogin) {

    console.log("Logged in successfully.");
    process.exit(0);
  }
});

// Login to the Protect controller.
if(!(await ufp.login("protect-controller.local", "username", "password"))) {

  console.log("Invalid login credentials.");
  process.exit(0);
};
```

#### Defined in

[src/protect-api.ts:164](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-api.ts#L164)

___

### off

▸ **off**(`eventName`, `listener`): [`ProtectApi`](ProtectApi.md)

Alias for `emitter.removeListener()`.

#### Parameters

| Name | Type |
| :------ | :------ |
| `eventName` | `string` \| `symbol` |
| `listener` | (...`args`: `any`[]) => `void` |

#### Returns

[`ProtectApi`](ProtectApi.md)

**`Since`**

v10.0.0

#### Inherited from

EventEmitter.off

#### Defined in

node_modules/@types/node/events.d.ts:604

___

### on

▸ **on**(`eventName`, `listener`): [`ProtectApi`](ProtectApi.md)

Adds the `listener` function to the end of the listeners array for the
event named `eventName`. No checks are made to see if the `listener` has
already been added. Multiple calls passing the same combination of `eventName`and `listener` will result in the `listener` being added, and called, multiple
times.

```js
server.on('connection', (stream) => {
  console.log('someone connected!');
});
```

Returns a reference to the `EventEmitter`, so that calls can be chained.

By default, event listeners are invoked in the order they are added. The`emitter.prependListener()` method can be used as an alternative to add the
event listener to the beginning of the listeners array.

```js
import { EventEmitter } from 'node:events';
const myEE = new EventEmitter();
myEE.on('foo', () => console.log('a'));
myEE.prependListener('foo', () => console.log('b'));
myEE.emit('foo');
// Prints:
//   b
//   a
```

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `eventName` | `string` \| `symbol` | The name of the event. |
| `listener` | (...`args`: `any`[]) => `void` | The callback function |

#### Returns

[`ProtectApi`](ProtectApi.md)

**`Since`**

v0.1.101

#### Inherited from

EventEmitter.on

#### Defined in

node_modules/@types/node/events.d.ts:486

___

### once

▸ **once**(`eventName`, `listener`): [`ProtectApi`](ProtectApi.md)

Adds a **one-time**`listener` function for the event named `eventName`. The
next time `eventName` is triggered, this listener is removed and then invoked.

```js
server.once('connection', (stream) => {
  console.log('Ah, we have our first user!');
});
```

Returns a reference to the `EventEmitter`, so that calls can be chained.

By default, event listeners are invoked in the order they are added. The`emitter.prependOnceListener()` method can be used as an alternative to add the
event listener to the beginning of the listeners array.

```js
import { EventEmitter } from 'node:events';
const myEE = new EventEmitter();
myEE.once('foo', () => console.log('a'));
myEE.prependOnceListener('foo', () => console.log('b'));
myEE.emit('foo');
// Prints:
//   b
//   a
```

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `eventName` | `string` \| `symbol` | The name of the event. |
| `listener` | (...`args`: `any`[]) => `void` | The callback function |

#### Returns

[`ProtectApi`](ProtectApi.md)

**`Since`**

v0.3.0

#### Inherited from

EventEmitter.once

#### Defined in

node_modules/@types/node/events.d.ts:516

___

### prependListener

▸ **prependListener**(`eventName`, `listener`): [`ProtectApi`](ProtectApi.md)

Adds the `listener` function to the _beginning_ of the listeners array for the
event named `eventName`. No checks are made to see if the `listener` has
already been added. Multiple calls passing the same combination of `eventName`and `listener` will result in the `listener` being added, and called, multiple
times.

```js
server.prependListener('connection', (stream) => {
  console.log('someone connected!');
});
```

Returns a reference to the `EventEmitter`, so that calls can be chained.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `eventName` | `string` \| `symbol` | The name of the event. |
| `listener` | (...`args`: `any`[]) => `void` | The callback function |

#### Returns

[`ProtectApi`](ProtectApi.md)

**`Since`**

v6.0.0

#### Inherited from

EventEmitter.prependListener

#### Defined in

node_modules/@types/node/events.d.ts:743

___

### prependOnceListener

▸ **prependOnceListener**(`eventName`, `listener`): [`ProtectApi`](ProtectApi.md)

Adds a **one-time**`listener` function for the event named `eventName` to the _beginning_ of the listeners array. The next time `eventName` is triggered, this
listener is removed, and then invoked.

```js
server.prependOnceListener('connection', (stream) => {
  console.log('Ah, we have our first user!');
});
```

Returns a reference to the `EventEmitter`, so that calls can be chained.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `eventName` | `string` \| `symbol` | The name of the event. |
| `listener` | (...`args`: `any`[]) => `void` | The callback function |

#### Returns

[`ProtectApi`](ProtectApi.md)

**`Since`**

v6.0.0

#### Inherited from

EventEmitter.prependOnceListener

#### Defined in

node_modules/@types/node/events.d.ts:759

___

### rawListeners

▸ **rawListeners**(`eventName`): `Function`[]

Returns a copy of the array of listeners for the event named `eventName`,
including any wrappers (such as those created by `.once()`).

```js
import { EventEmitter } from 'node:events';
const emitter = new EventEmitter();
emitter.once('log', () => console.log('log once'));

// Returns a new Array with a function `onceWrapper` which has a property
// `listener` which contains the original listener bound above
const listeners = emitter.rawListeners('log');
const logFnWrapper = listeners[0];

// Logs "log once" to the console and does not unbind the `once` event
logFnWrapper.listener();

// Logs "log once" to the console and removes the listener
logFnWrapper();

emitter.on('log', () => console.log('log persistently'));
// Will return a new Array with a single function bound by `.on()` above
const newListeners = emitter.rawListeners('log');

// Logs "log persistently" twice
newListeners[0]();
emitter.emit('log');
```

#### Parameters

| Name | Type |
| :------ | :------ |
| `eventName` | `string` \| `symbol` |

#### Returns

`Function`[]

**`Since`**

v9.4.0

#### Inherited from

EventEmitter.rawListeners

#### Defined in

node_modules/@types/node/events.d.ts:675

___

### removeAllListeners

▸ **removeAllListeners**(`event?`): [`ProtectApi`](ProtectApi.md)

Removes all listeners, or those of the specified `eventName`.

It is bad practice to remove listeners added elsewhere in the code,
particularly when the `EventEmitter` instance was created by some other
component or module (e.g. sockets or file streams).

Returns a reference to the `EventEmitter`, so that calls can be chained.

#### Parameters

| Name | Type |
| :------ | :------ |
| `event?` | `string` \| `symbol` |

#### Returns

[`ProtectApi`](ProtectApi.md)

**`Since`**

v0.1.26

#### Inherited from

EventEmitter.removeAllListeners

#### Defined in

node_modules/@types/node/events.d.ts:615

___

### removeListener

▸ **removeListener**(`eventName`, `listener`): [`ProtectApi`](ProtectApi.md)

Removes the specified `listener` from the listener array for the event named`eventName`.

```js
const callback = (stream) => {
  console.log('someone connected!');
};
server.on('connection', callback);
// ...
server.removeListener('connection', callback);
```

`removeListener()` will remove, at most, one instance of a listener from the
listener array. If any single listener has been added multiple times to the
listener array for the specified `eventName`, then `removeListener()` must be
called multiple times to remove each instance.

Once an event is emitted, all listeners attached to it at the
time of emitting are called in order. This implies that any`removeListener()` or `removeAllListeners()` calls _after_ emitting and _before_ the last listener finishes execution
will not remove them from`emit()` in progress. Subsequent events behave as expected.

```js
import { EventEmitter } from 'node:events';
class MyEmitter extends EventEmitter {}
const myEmitter = new MyEmitter();

const callbackA = () => {
  console.log('A');
  myEmitter.removeListener('event', callbackB);
};

const callbackB = () => {
  console.log('B');
};

myEmitter.on('event', callbackA);

myEmitter.on('event', callbackB);

// callbackA removes listener callbackB but it will still be called.
// Internal listener array at time of emit [callbackA, callbackB]
myEmitter.emit('event');
// Prints:
//   A
//   B

// callbackB is now removed.
// Internal listener array [callbackA]
myEmitter.emit('event');
// Prints:
//   A
```

Because listeners are managed using an internal array, calling this will
change the position indices of any listener registered _after_ the listener
being removed. This will not impact the order in which listeners are called,
but it means that any copies of the listener array as returned by
the `emitter.listeners()` method will need to be recreated.

When a single function has been added as a handler multiple times for a single
event (as in the example below), `removeListener()` will remove the most
recently added instance. In the example the `once('ping')`listener is removed:

```js
import { EventEmitter } from 'node:events';
const ee = new EventEmitter();

function pong() {
  console.log('pong');
}

ee.on('ping', pong);
ee.once('ping', pong);
ee.removeListener('ping', pong);

ee.emit('ping');
ee.emit('ping');
```

Returns a reference to the `EventEmitter`, so that calls can be chained.

#### Parameters

| Name | Type |
| :------ | :------ |
| `eventName` | `string` \| `symbol` |
| `listener` | (...`args`: `any`[]) => `void` |

#### Returns

[`ProtectApi`](ProtectApi.md)

**`Since`**

v0.1.26

#### Inherited from

EventEmitter.removeListener

#### Defined in

node_modules/@types/node/events.d.ts:599

___

### retrieve

▸ **retrieve**(`url`, `options?`, `logErrors?`): `Promise`<``null`` \| `Response`\>

Execute an HTTP fetch request to the Protect controller.

#### Parameters

| Name | Type | Default value | Description |
| :------ | :------ | :------ | :------ |
| `url` | `string` | `undefined` | Requested endpoint type. Valid types are `livestream` and `talkback`. |
| `options` | `RequestOptions` | `undefined` | Parameters to pass on for the endpoint request. |
| `logErrors` | `boolean` | `true` | Log errors that aren't already accounted for and handled, rather than failing silently. Defaults to `true`. |

#### Returns

`Promise`<``null`` \| `Response`\>

Returns a promise that will resolve to a Response object successful, and `null` otherwise.

**`Remarks`**

This method should be used when direct access to the Protect controller is needed, or when this library doesn't have a needed method to access
  controller capabilities.

#### Defined in

[src/protect-api.ts:926](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-api.ts#L926)

___

### setMaxListeners

▸ **setMaxListeners**(`n`): [`ProtectApi`](ProtectApi.md)

By default `EventEmitter`s will print a warning if more than `10` listeners are
added for a particular event. This is a useful default that helps finding
memory leaks. The `emitter.setMaxListeners()` method allows the limit to be
modified for this specific `EventEmitter` instance. The value can be set to`Infinity` (or `0`) to indicate an unlimited number of listeners.

Returns a reference to the `EventEmitter`, so that calls can be chained.

#### Parameters

| Name | Type |
| :------ | :------ |
| `n` | `number` |

#### Returns

[`ProtectApi`](ProtectApi.md)

**`Since`**

v0.3.5

#### Inherited from

EventEmitter.setMaxListeners

#### Defined in

node_modules/@types/node/events.d.ts:625

___

### updateDevice

▸ **updateDevice**<`DeviceType`\>(`device`, `payload`): `Promise`<``null`` \| `DeviceType`\>

Update a Protect device's configuration on the UniFi Protect controller.

#### Type parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `DeviceType` | extends [`ProtectKnownDeviceTypes`](../modules.md#protectknowndevicetypes) | Generic for any known Protect device type. |

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `device` | `DeviceType` | Protect device. |
| `payload` | [`ProtectKnownDevicePayloads`](../modules.md#protectknowndevicepayloads) | Device configuration payload to upload, usually a subset of the device-specific configuration JSON. |

#### Returns

`Promise`<``null`` \| `DeviceType`\>

Returns a promise that will resolve to the updated device-specific configuration JSON if successful, and `null` otherwise.

**`Remarks`**

Use this method to change the configuration of a given Protect device or controller. It requires the credentials used to login to the Protect API
  to have administrative privileges for most settings.

#### Defined in

[src/protect-api.ts:610](https://github.com/hjdhjd/unifi-protect/blob/a66ec94/src/protect-api.ts#L610)

___

### addAbortListener

▸ `Static` **addAbortListener**(`signal`, `resource`): `Disposable`

Listens once to the `abort` event on the provided `signal`.

Listening to the `abort` event on abort signals is unsafe and may
lead to resource leaks since another third party with the signal can
call `e.stopImmediatePropagation()`. Unfortunately Node.js cannot change
this since it would violate the web standard. Additionally, the original
API makes it easy to forget to remove listeners.

This API allows safely using `AbortSignal`s in Node.js APIs by solving these
two issues by listening to the event such that `stopImmediatePropagation` does
not prevent the listener from running.

Returns a disposable so that it may be unsubscribed from more easily.

```js
import { addAbortListener } from 'node:events';

function example(signal) {
  let disposable;
  try {
    signal.addEventListener('abort', (e) => e.stopImmediatePropagation());
    disposable = addAbortListener(signal, (e) => {
      // Do something when signal is aborted.
    });
  } finally {
    disposable?.[Symbol.dispose]();
  }
}
```

#### Parameters

| Name | Type |
| :------ | :------ |
| `signal` | `AbortSignal` |
| `resource` | (`event`: `Event`) => `void` |

#### Returns

`Disposable`

that removes the `abort` listener.

**`Since`**

v20.5.0

#### Inherited from

EventEmitter.addAbortListener

#### Defined in

node_modules/@types/node/events.d.ts:375

___

### getEventListeners

▸ `Static` **getEventListeners**(`emitter`, `name`): `Function`[]

Returns a copy of the array of listeners for the event named `eventName`.

For `EventEmitter`s this behaves exactly the same as calling `.listeners` on
the emitter.

For `EventTarget`s this is the only way to get the event listeners for the
event target. This is useful for debugging and diagnostic purposes.

```js
import { getEventListeners, EventEmitter } from 'node:events';

{
  const ee = new EventEmitter();
  const listener = () => console.log('Events are fun');
  ee.on('foo', listener);
  console.log(getEventListeners(ee, 'foo')); // [ [Function: listener] ]
}
{
  const et = new EventTarget();
  const listener = () => console.log('Events are fun');
  et.addEventListener('foo', listener);
  console.log(getEventListeners(et, 'foo')); // [ [Function: listener] ]
}
```

#### Parameters

| Name | Type |
| :------ | :------ |
| `emitter` | `EventEmitter` \| `_DOMEventTarget` |
| `name` | `string` \| `symbol` |

#### Returns

`Function`[]

**`Since`**

v15.2.0, v14.17.0

#### Inherited from

EventEmitter.getEventListeners

#### Defined in

node_modules/@types/node/events.d.ts:296

___

### getMaxListeners

▸ `Static` **getMaxListeners**(`emitter`): `number`

Returns the currently set max amount of listeners.

For `EventEmitter`s this behaves exactly the same as calling `.getMaxListeners` on
the emitter.

For `EventTarget`s this is the only way to get the max event listeners for the
event target. If the number of event handlers on a single EventTarget exceeds
the max set, the EventTarget will print a warning.

```js
import { getMaxListeners, setMaxListeners, EventEmitter } from 'node:events';

{
  const ee = new EventEmitter();
  console.log(getMaxListeners(ee)); // 10
  setMaxListeners(11, ee);
  console.log(getMaxListeners(ee)); // 11
}
{
  const et = new EventTarget();
  console.log(getMaxListeners(et)); // 10
  setMaxListeners(11, et);
  console.log(getMaxListeners(et)); // 11
}
```

#### Parameters

| Name | Type |
| :------ | :------ |
| `emitter` | `EventEmitter` \| `_DOMEventTarget` |

#### Returns

`number`

**`Since`**

v19.9.0

#### Inherited from

EventEmitter.getMaxListeners

#### Defined in

node_modules/@types/node/events.d.ts:325

___

### listenerCount

▸ `Static` **listenerCount**(`emitter`, `eventName`): `number`

A class method that returns the number of listeners for the given `eventName`registered on the given `emitter`.

```js
import { EventEmitter, listenerCount } from 'node:events';

const myEmitter = new EventEmitter();
myEmitter.on('event', () => {});
myEmitter.on('event', () => {});
console.log(listenerCount(myEmitter, 'event'));
// Prints: 2
```

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `emitter` | `EventEmitter` | The emitter to query |
| `eventName` | `string` \| `symbol` | The event name |

#### Returns

`number`

**`Since`**

v0.9.12

**`Deprecated`**

Since v3.2.0 - Use `listenerCount` instead.

#### Inherited from

EventEmitter.listenerCount

#### Defined in

node_modules/@types/node/events.d.ts:268

___

### on

▸ `Static` **on**(`emitter`, `eventName`, `options?`): `AsyncIterableIterator`<`any`\>

```js
import { on, EventEmitter } from 'node:events';
import process from 'node:process';

const ee = new EventEmitter();

// Emit later on
process.nextTick(() => {
  ee.emit('foo', 'bar');
  ee.emit('foo', 42);
});

for await (const event of on(ee, 'foo')) {
  // The execution of this inner block is synchronous and it
  // processes one event at a time (even with await). Do not use
  // if concurrent execution is required.
  console.log(event); // prints ['bar'] [42]
}
// Unreachable here
```

Returns an `AsyncIterator` that iterates `eventName` events. It will throw
if the `EventEmitter` emits `'error'`. It removes all listeners when
exiting the loop. The `value` returned by each iteration is an array
composed of the emitted event arguments.

An `AbortSignal` can be used to cancel waiting on events:

```js
import { on, EventEmitter } from 'node:events';
import process from 'node:process';

const ac = new AbortController();

(async () => {
  const ee = new EventEmitter();

  // Emit later on
  process.nextTick(() => {
    ee.emit('foo', 'bar');
    ee.emit('foo', 42);
  });

  for await (const event of on(ee, 'foo', { signal: ac.signal })) {
    // The execution of this inner block is synchronous and it
    // processes one event at a time (even with await). Do not use
    // if concurrent execution is required.
    console.log(event); // prints ['bar'] [42]
  }
  // Unreachable here
})();

process.nextTick(() => ac.abort());
```

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `emitter` | `EventEmitter` | - |
| `eventName` | `string` | The name of the event being listened for |
| `options?` | `StaticEventEmitterOptions` | - |

#### Returns

`AsyncIterableIterator`<`any`\>

that iterates `eventName` events emitted by the `emitter`

**`Since`**

v13.6.0, v12.16.0

#### Inherited from

EventEmitter.on

#### Defined in

node_modules/@types/node/events.d.ts:250

___

### once

▸ `Static` **once**(`emitter`, `eventName`, `options?`): `Promise`<`any`[]\>

Creates a `Promise` that is fulfilled when the `EventEmitter` emits the given
event or that is rejected if the `EventEmitter` emits `'error'` while waiting.
The `Promise` will resolve with an array of all the arguments emitted to the
given event.

This method is intentionally generic and works with the web platform [EventTarget](https://dom.spec.whatwg.org/#interface-eventtarget) interface, which has no special`'error'` event
semantics and does not listen to the `'error'` event.

```js
import { once, EventEmitter } from 'node:events';
import process from 'node:process';

const ee = new EventEmitter();

process.nextTick(() => {
  ee.emit('myevent', 42);
});

const [value] = await once(ee, 'myevent');
console.log(value);

const err = new Error('kaboom');
process.nextTick(() => {
  ee.emit('error', err);
});

try {
  await once(ee, 'myevent');
} catch (err) {
  console.error('error happened', err);
}
```

The special handling of the `'error'` event is only used when `events.once()`is used to wait for another event. If `events.once()` is used to wait for the
'`error'` event itself, then it is treated as any other kind of event without
special handling:

```js
import { EventEmitter, once } from 'node:events';

const ee = new EventEmitter();

once(ee, 'error')
  .then(([err]) => console.log('ok', err.message))
  .catch((err) => console.error('error', err.message));

ee.emit('error', new Error('boom'));

// Prints: ok boom
```

An `AbortSignal` can be used to cancel waiting for the event:

```js
import { EventEmitter, once } from 'node:events';

const ee = new EventEmitter();
const ac = new AbortController();

async function foo(emitter, event, signal) {
  try {
    await once(emitter, event, { signal });
    console.log('event emitted!');
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('Waiting for the event was canceled!');
    } else {
      console.error('There was an error', error.message);
    }
  }
}

foo(ee, 'foo', ac.signal);
ac.abort(); // Abort waiting for the event
ee.emit('foo'); // Prints: Waiting for the event was canceled!
```

#### Parameters

| Name | Type |
| :------ | :------ |
| `emitter` | `_NodeEventTarget` |
| `eventName` | `string` \| `symbol` |
| `options?` | `StaticEventEmitterOptions` |

#### Returns

`Promise`<`any`[]\>

**`Since`**

v11.13.0, v10.16.0

#### Inherited from

EventEmitter.once

#### Defined in

node_modules/@types/node/events.d.ts:189

▸ `Static` **once**(`emitter`, `eventName`, `options?`): `Promise`<`any`[]\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `emitter` | `_DOMEventTarget` |
| `eventName` | `string` |
| `options?` | `StaticEventEmitterOptions` |

#### Returns

`Promise`<`any`[]\>

#### Inherited from

EventEmitter.once

#### Defined in

node_modules/@types/node/events.d.ts:190

___

### setMaxListeners

▸ `Static` **setMaxListeners**(`n?`, `...eventTargets`): `void`

```js
import { setMaxListeners, EventEmitter } from 'node:events';

const target = new EventTarget();
const emitter = new EventEmitter();

setMaxListeners(5, target, emitter);
```

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `n?` | `number` | A non-negative number. The maximum number of listeners per `EventTarget` event. |
| `...eventTargets` | (`EventEmitter` \| `_DOMEventTarget`)[] | - |

#### Returns

`void`

**`Since`**

v15.4.0

#### Inherited from

EventEmitter.setMaxListeners

#### Defined in

node_modules/@types/node/events.d.ts:340
