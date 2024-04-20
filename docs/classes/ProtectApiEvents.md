[unifi-protect](../README.md) / [Exports](../modules.md) / ProtectApiEvents

# Class: ProtectApiEvents

UniFi Protect event utility class that provides functions for decoding realtime event API packet frames.

## Table of contents

### Constructors

- [constructor](ProtectApiEvents.md#constructor)

### Methods

- [decodePacket](ProtectApiEvents.md#decodepacket)

## Constructors

### constructor

• **new ProtectApiEvents**(): [`ProtectApiEvents`](ProtectApiEvents.md)

#### Returns

[`ProtectApiEvents`](ProtectApiEvents.md)

## Methods

### decodePacket

▸ **decodePacket**(`log`, `packet`): ``null`` \| [`ProtectEventPacket`](../modules.md#protecteventpacket)

Decode a UniFi Protect event packet.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `log` | [`ProtectLogging`](../interfaces/ProtectLogging.md) | Logging functions to use. |
| `packet` | `Buffer` | Input packet to decode. |

#### Returns

``null`` \| [`ProtectEventPacket`](../modules.md#protecteventpacket)

**`Remarks`**

A UniFi Protect event packet is an encoded representation of state updates that occur in a UniFi Protect controller. This utility function takes an
  encoded packet as an input, and decodes it into an event header and payload that can be acted upon. Events are generated automatically once a successful
  login has been made to a Protect controller and can be accessed by listening to `message` events emitted by an instance of [ProtectApi](ProtectApi.md).

#### Defined in

[src/protect-api-events.ts:162](https://github.com/hjdhjd/unifi-protect/blob/393789fc061eae4a69212a8c6e68b2ee3c4f0dc2/src/protect-api-events.ts#L162)
