[**unifi-protect**](README.md)

***

[Home](README.md) / ProtectApiEvents

# ProtectApiEvents

Utilities to help decode packets from the UniFi Protect realtime events API.

UniFi OS update events data packets are used to provide a realtime stream of updates to Protect. It differs from the system events API in that the system events API
appears to be shared across other applications (Network, Access, etc.) while the updates events API appears to only be utilized by Protect and not shared by other
applications, although the protocol is shared.

So how does it all work? Cameras continuously stream updates to the UniFi Protect controller containing things like camera health, statistics, and, crucially for us,
events such as motion and doorbell ring. A complete update packet is composed of four frames:

```
----------------
| Header Frame | (8 bytes)
----------------
| Action Frame |
----------------
| Header Frame | (8 bytes)
----------------
| Data Frame   |
----------------
```

The header frame is required overhead since websockets provide only a transport medium. It's purpose is to tell us what's coming in the frame that follows.

The action frame identifies what the action and category that the update contains:

| Property    | Description                                                                      |
|-------------|----------------------------------------------------------------------------------|
| action      | What action is being taken. Known actions are `add` and `update`.                |
| id          | The identifier for the device we're updating.                                    |
| modelKey    | The device model category that we're updating.                                   |
| newUpdateId | A new UUID generated on a per-update basis. This can be safely ignored it seems. |

The final part of the update packet is the data frame. The data frame can be three different types of data - although in practice, I've only seen JSONs come across.
Those types are:

| Payload Type |                                                 Description                                                |
|--------------|------------------------------------------------------------------------------------------------------------|
| 1            | JSON. For update actions that are not events, this is always a subset of the configuration bootstrap JSON. |
| 2            | A UTF8-encoded string                                                                                      |
| 3            | Node Buffer                                                                                                |

Some tips:

- `update` actions are always tied to the following modelKeys: camera, event, nvr, and user.

- `add` actions are always tied to the `event` modelKey and indicate the beginning of an event item in the Protect events list. A subsequent `update` action is sent
  signaling the end of the event capture, and it's confidence score for motion detection.

- The above is NOT the same thing as motion detection. If you want to detect motion, you should watch the `update` action for `camera` modelKeys, and look for a JSON
  that updates lastMotion. For doorbell rings, lastRing. The Protect events list is useful for the Protect app, but it's of limited utility to HomeKit, and it's slow
  = relative to looking for lastMotion that is. If you want true realtime updates, you want to look at the `update` action.

- JSONs are only payload type that seems to be sent, although the protocol is designed to accept all three.

- With the exception of update actions with a modelKey of event, JSONs are always a subset of the bootstrap JSON, indexed off of modelKey. So for a modelKey of camera,
  the data payload is always a subset of [ProtectCameraConfigInterface](ProtectTypes.md#protectcameraconfiginterface).

## Classes

### ProtectApiEvents

UniFi Protect event utility class that provides functions for decoding realtime event API packet frames.

#### Methods

##### decodePacket()

```ts
static decodePacket(log, packet): Nullable<ProtectEventPacket>
```

Decode a UniFi Protect event packet.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `log` | [`ProtectLogging`](ProtectLogging.md#protectlogging) | Logging functions to use. |
| `packet` | `Buffer` | Input packet to decode. |

###### Returns

`Nullable`\<[`ProtectEventPacket`](ProtectApiEvents.md#protecteventpacket)\>

###### Remarks

A UniFi Protect event packet is an encoded representation of state updates that occur in a UniFi Protect controller. This utility function takes an
encoded packet as an input, and decodes it into an event header and payload that can be acted upon. An example of it's use is in [ProtectApi](ProtectApi.md) where, once
successfully logged into the Protect controller, events are generated automatically and can be accessed by listening to `message` events emitted by
[ProtectApi](ProtectApi.md).

## Type Aliases

### ProtectEventHeader

```ts
type ProtectEventHeader = {
[key: string]: string | number | boolean | object;   action: string;
  id: string;
  modelKey: string;
  newUpdateId: string;
};
```

UniFi Protect event header.

#### Type declaration

#### Index Signature

```ts
[key: string]: string | number | boolean | object
```

| Name | Type |
| ------ | ------ |
| <a id="action"></a> `action` | `string` |
| <a id="id"></a> `id` | `string` |
| <a id="modelkey"></a> `modelKey` | `string` |
| <a id="newupdateid"></a> `newUpdateId` | `string` |

#### Param

Protect event header.

#### Param

Protect event payload.

#### Remarks

A UniFi Protect event packet represents a realtime event update from a UniFi Protect controller. There are two components to each packet, a `header` and
  a `payload`. The `header` contains information about which Protect device and what action category it belongs to and can contain arbitrary information, though has
  a few properties that are always present (`action`, `id`, `modelKey`, and `newUpdateId`). The `payload` contains the detailed information related to the device and
  action specified in the header.

***

### ProtectEventPacket

```ts
type ProtectEventPacket = {
  header: ProtectEventHeader;
  payload: unknown;
};
```

UniFi Protect event packet.

#### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="header"></a> `header` | [`ProtectEventHeader`](ProtectApiEvents.md#protecteventheader) |
| <a id="payload"></a> `payload` | `unknown` |

#### Param

Protect event header.

#### Param

Protect event payload.

#### Remarks

A UniFi Protect event packet represents a realtime event update from a UniFi Protect controller. There are two components to each packet, a `header` and
  a `payload`. The `header` contains information about which Protect device and what action category it belongs to. The `payload` contains the detailed information
  related to the device and action specified in the header.
