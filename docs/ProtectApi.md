[**unifi-protect**](README.md) • **Docs**

***

[Home](README.md) / ProtectApi

# ProtectApi

A complete implementation of the UniFi Protect API, including access to the events, livestream data (not just RTSP), and websockets endpoints.

The UniFi Protect API is largely undocumented and has been reverse engineered mostly through the Protect native web interface as well as trial and error. This
implementation provides a high-performance, event-driven interface into the Protect API, allowing you to access all of Protect's rich capabilities.

## Classes

### ProtectApi

This class provides an event-driven API to access the UniFi Protect API. Here's how to quickly get up and running with this library once you've instantiated the class:

1. [Login](ProtectApi.md#login) to the UniFi Protect controller and acquire security credentials for further calls to the API.

2. Retrieve the current configuration and state of the Protect controller by calling the [bootstrap](ProtectApi.md#bootstrap) endpoint. This contains everything you would want to know
   about this particular UniFi Protect controller, including enumerating all the devices it knows about.

3. Listen for `message` events emitted by [ProtectApi](ProtectApi.md#protectapi) containing all Protect controller events, in realtime. They are delivered as
   [ProtectEventPacket](ProtectApiEvents.md#protecteventpacket) packets, containing the event-specific details.

Those are the basics that gets us up and running.

#### Extends

- `EventEmitter`

#### Constructors

##### new ProtectApi()

```ts
new ProtectApi(log?): ProtectApi
```

Create an instance of the UniFi Protect API.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `log`? | [`ProtectLogging`](ProtectLogging.md#protectlogging) | Logging functions to use. |

###### Returns

[`ProtectApi`](ProtectApi.md#protectapi)

###### Default Value

`none` - Logging will be done to stdout and stderr.

###### Overrides

`EventEmitter.constructor`

#### API Access

##### bootstrap

```ts
get bootstrap(): null | ProtectNvrBootstrapInterface
```

Access the Protect controller bootstrap JSON.

###### Remarks

A call to [getBootstrap](ProtectApi.md#getbootstrap) is required before calling this getter. Otherwise, it will return `null`. Put another way, you need to execute a bootstrap
request to the Protect controller before accessing the bootstrap JSON.

###### Returns

`null` \| [`ProtectNvrBootstrapInterface`](ProtectTypes.md#protectnvrbootstrapinterface)

Returns the bootstrap JSON if the Protect controller has been bootstrapped, `null` otherwise.

##### createLivestream()

```ts
createLivestream(): ProtectLivestream
```

Return a new instance of the Protect livestream API.

###### Returns

[`ProtectLivestream`](ProtectLivestream.md#protectlivestream)

Returns a new livestream API object.

###### Remarks

This method should be used to create a new livestream API object. It allows you to create access livestreams of individual cameras and interact
  directly with the H.264 fMP4 streams for a given camera.

##### getApiEndpoint()

```ts
getApiEndpoint(endpoint): string
```

Return an API endpoint for the requested endpoint type.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `endpoint` | `string` | Requested endpoint type. |

###### Returns

`string`

Returns a URL to the requested endpoint if successful, and an empty string otherwise.

###### Remarks

Valid API endpoints are `bootstrap`, `camera`, `chime`, `light`, `login`, `nvr`, `self`, `sensor`, `websocket` and `viewer`.

##### getBootstrap()

```ts
getBootstrap(): Promise<boolean>
```

Retrieve the bootstrap JSON from a UniFi Protect controller.

###### Returns

`Promise`\<`boolean`\>

Returns a promise that will resolve to `true` if successful and `false` otherwise.

###### Remarks

A `bootstrap` event will be emitted each time this method is successfully called, with the [ProtectNvrBootstrap](ProtectTypes.md#protectnvrbootstrap) JSON as an argument.

###### Example

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

##### getSnapshot()

```ts
getSnapshot(device, options): Promise<null | Buffer>
```

Retrieve a snapshot image from a Protect camera.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `device` | [`ProtectCameraConfigInterface`](ProtectTypes.md#protectcameraconfiginterface) | Protect device. |
| `options` | `Partial`\<\{ `height`: `number`; `usePackageCamera`: `boolean`; `width`: `number`; \}\> | Parameters to pass on for the snapshot request. |

###### Returns

`Promise`\<`null` \| `Buffer`\>

Returns a promise that will resolve to a Buffer containing the JPEG image snapshot if successful, and `null` otherwise.

###### Remarks

The `options` object for snapshot parameters accepts the following properties, all of which are optional:

| Property          | Description                                                                                                |
|-------------------|------------------------------------------------------------------------------------------------------------|
| height            | The image height to request. Defaults selected by the Protect controller, based on the camera resolution.  |
| width             | The image width to request. Defaults selected by the Protect controller, based on the camera resolution.   |
| usePackageCamera  | Retriver a snapshot fron the package camera rather than the primary camera lens. Defaults to `false`.      |

##### getWsEndpoint()

```ts
getWsEndpoint(endpoint, params?): Promise<null | string>
```

Return a websocket API endpoint for the requested endpoint type.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `endpoint` | `"livestream"` \| `"talkback"` | Requested endpoint type. Valid types are `livestream` and `talkback`. |
| `params`? | `URLSearchParams` | Parameters to pass on for the endpoint request. |

###### Returns

`Promise`\<`null` \| `string`\>

Returns a promise that will resolve to a URL to the requested endpoint if successful, and `null` otherwise.

###### Remarks

Valid API endpoints are `livestream` and `talkback`.

- The `livestream` endpoint will return a URL to a websocket that provides an encoded livestream from a given camera. **Do not access this endpoint directly, use
  [createLivestream](ProtectApi.md#createlivestream) instead.** Accessing the livestream endpoint directly is not directly useful without additional manipulation, which, unless you have
  a need for, you should avoid dealing with and use the [ProtectLivestream](ProtectLivestream.md#protectlivestream) API instead that provides you direct access to the livestream as an H.264 fMP4.
- The `talkback` endpoint creates a talkback connection to a Protect camera that contains a speaker (e.g. Protect doorbells).
  The returned websocket accepts an AAC-encoded ADTS stream. The only valid parameter is `camera`, containing the ID of the Protect camera you want to connect to.

##### retrieve()

```ts
retrieve(
   url, 
   options, 
logErrors): Promise<null | Response>
```

Execute an HTTP fetch request to the Protect controller.

###### Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `url` | `string` | `undefined` | Complete URL to execute **without** any additional parameters you want to pass (e.g. https://unvr.local/proxy/protect/cameras/someid/snapshot). |
| `options` | `RequestOptions` | `...` | Parameters to pass on for the endpoint request. |
| `logErrors` | `boolean` | `true` | Log errors that aren't already accounted for and handled, rather than failing silently. Defaults to `true`. |

###### Returns

`Promise`\<`null` \| `Response`\>

Returns a promise that will resolve to a Response object successful, and `null` otherwise.

###### Remarks

This method should be used when direct access to the Protect controller is needed, or when this library doesn't have a needed method to access
  controller capabilities. `options` must be a
  [Fetch API compatible](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options) request options object.

##### updateDevice()

```ts
updateDevice<DeviceType>(device, payload): Promise<null | DeviceType>
```

Update a Protect device's configuration on the UniFi Protect controller.

###### Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| `DeviceType` *extends* [`ProtectKnownDeviceTypes`](ProtectApi.md#protectknowndevicetypes) | Generic for any known Protect device type. |

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `device` | `DeviceType` | Protect device. |
| `payload` | [`ProtectKnownDevicePayloads`](ProtectApi.md#protectknowndevicepayloads) | Device configuration payload to upload, usually a subset of the device-specific configuration JSON. |

###### Returns

`Promise`\<`null` \| `DeviceType`\>

Returns a promise that will resolve to the updated device-specific configuration JSON if successful, and `null` otherwise.

###### Remarks

Use this method to change the configuration of a given Protect device or controller. It requires the credentials used to login to the Protect API
  to have administrative privileges for most settings.

#### Utilities

##### isAdminUser

```ts
get isAdminUser(): boolean
```

Utility method that returns whether the credentials that were used to login to the Protect controller have administrative privileges or not.

###### Returns

`boolean`

Returns `true` if the logged in user has administrative privileges, `false` otherwise.

##### isThrottled

```ts
get isThrottled(): boolean
```

Utility method that returns whether our connection to the Protect controller is currently throttled or not.

###### Returns

`boolean`

Returns `true` if the API has returned too many errors and is now throttled for a period of time, `false` otherwise.

##### name

```ts
get name(): string
```

Utility method that returns a nicely formatted version of the Protect controller name.

###### Returns

`string`

Returns the Protect controller name in the following format:
  <code>*Protect controller name* [*Protect controller type*]</code>.

##### enableRtsp()

```ts
enableRtsp(device): Promise<null | ProtectCameraConfigInterface>
```

Utility method that enables all RTSP channels on a given Protect camera.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `device` | [`ProtectCameraConfigInterface`](ProtectTypes.md#protectcameraconfiginterface) | Protect camera to modify. |

###### Returns

`Promise`\<`null` \| [`ProtectCameraConfigInterface`](ProtectTypes.md#protectcameraconfiginterface)\>

Returns a promise that will resolve to the updated [ProtectCameraConfig](ProtectTypes.md#protectcameraconfig) if successful, and `null` otherwise.

##### getDeviceName()

```ts
getDeviceName(
   device, 
   name, 
   deviceInfo): string
```

Utility method that generates a nicely formatted device information string.

###### Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `device` | [`ProtectKnownDeviceTypes`](ProtectApi.md#protectknowndevicetypes) | `undefined` | Protect device. |
| `name` | `string` | `device.name` | Optional name for the device. Defaults to the device type (e.g. `G4 Pro`). |
| `deviceInfo` | `boolean` | `false` | Optionally specify whether or not to include the IP address and MAC address in the returned string. Defaults to `false`. |

###### Returns

`string`

Returns the Protect device name in the following format: <code>*Protect device name* [*Protect device type*] (address: *IP address*
         mac: *MAC address*)</code>.

###### Remarks

The example above assumed the `deviceInfo` parameter is set to `true`.

##### getFullName()

```ts
getFullName(device): string
```

Utility method that generates a combined, nicely formatted device and NVR string.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `device` | [`ProtectKnownDeviceTypes`](ProtectApi.md#protectknowndevicetypes) | Protect device. |

###### Returns

`string`

Returns the Protect device name in the following format:
  <code>*Protect controller name* [*Protect controller type*] *Protect device name* [*Protect device type*]</code>.

##### reset()

```ts
reset(): void
```

Terminate any open connection to the UniFi Protect API.

###### Returns

`void`

#### Authentication

##### login()

```ts
login(
   nvrAddress, 
   username, 
password): Promise<boolean>
```

Execute a login attempt to the UniFi Protect API.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `nvrAddress` | `string` | Address of the UniFi Protect controller, expressed as an FQDN or IP address. |
| `username` | `string` | Username to use when logging into the controller. |
| `password` | `string` | Password to use when logging into the controller. |

###### Returns

`Promise`\<`boolean`\>

Returns a promise that will resolve to `true` if successful and `false` otherwise.

###### Remarks

A `login` event will be emitted each time this method is called, with the result of the attempt as an argument. If there are any existing logins from prior
         calls to login, they will be terminated.

###### Example

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

##### logout()

```ts
logout(): void
```

Clear the login credentials and terminate any open connection to the UniFi Protect API.

###### Returns

`void`

## Type Aliases

### ProtectKnownDevicePayloads

```ts
type ProtectKnownDevicePayloads: 
  | ProtectCameraConfigPayload
  | ProtectChimeConfigPayload
  | ProtectLightConfigPayload
  | ProtectNvrConfigPayload
  | ProtectSensorConfigPayload
  | ProtectViewerConfigPayload;
```

Define our known Protect device payload types.

***

### ProtectKnownDeviceTypes

```ts
type ProtectKnownDeviceTypes: 
  | ProtectCameraConfig
  | ProtectChimeConfig
  | ProtectLightConfig
  | ProtectNvrConfig
  | ProtectSensorConfig
  | ProtectViewerConfig;
```

Define our known Protect device types.
