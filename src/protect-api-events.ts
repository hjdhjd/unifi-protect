/* Copyright(C) 2019-2024, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * protect-api-events.ts: Our UniFi Protect realtime events API packet utilities.
 */

/**
 * Utilities to help decode packets from the UniFi Protect realtime events API.
 *
 * UniFi OS update events data packets are used to provide a realtime stream of updates to Protect. It differs from the system events API in that the system events API
 * appears to be shared across other applications (Network, Access, etc.) while the updates events API appears to only be utilized by Protect and not shared by other
 * applications, although the protocol is shared.
 *
 * So how does it all work? Cameras continuously stream updates to the UniFi Protect controller containing things like camera health, statistics, and, crucially for us,
 * events such as motion and doorbell ring. A complete update packet is composed of four frames:
 *
 * ```
 * ----------------
 * | Header Frame | (8 bytes)
 * ----------------
 * | Action Frame |
 * ----------------
 * | Header Frame | (8 bytes)
 * ----------------
 * | Data Frame   |
 * ----------------
 * ```
 *
 * The header frame is required overhead since websockets provide only a transport medium. It's purpose is to tell us what's coming in the frame that follows.
 *
 * The action frame identifies what the action and category that the update contains:
 *
 * | Property    | Description                                                                      |
 * |-------------|----------------------------------------------------------------------------------|
 * | action      | What action is being taken. Known actions are `add` and `update`.                |
 * | id          | The identifier for the device we're updating.                                    |
 * | modelKey    | The device model category that we're updating.                                   |
 * | newUpdateId | A new UUID generated on a per-update basis. This can be safely ignored it seems. |
 *
 * The final part of the update packet is the data frame. The data frame can be three different types of data - although in practice, I've only seen JSONs come across.
 * Those types are:
 *
 * | Payload Type |                                                 Description                                                |
 * |--------------|------------------------------------------------------------------------------------------------------------|
 * | 1            | JSON. For update actions that are not events, this is always a subset of the configuration bootstrap JSON. |
 * | 2            | A UTF8-encoded string                                                                                      |
 * | 3            | Node Buffer                                                                                                |
 *
 * Some tips:
 *
 * - `update` actions are always tied to the following modelKeys: camera, event, nvr, and user.
 *
 * - `add` actions are always tied to the `event` modelKey and indicate the beginning of an event item in the Protect events list. A subsequent `update` action is sent
 *   signaling the end of the event capture, and it's confidence score for motion detection.
 *
 * - The above is NOT the same thing as motion detection. If you want to detect motion, you should watch the `update` action for `camera` modelKeys, and look for a JSON
 *   that updates lastMotion. For doorbell rings, lastRing. The Protect events list is useful for the Protect app, but it's of limited utility to HomeKit, and it's slow
 *   = relative to looking for lastMotion that is. If you want true realtime updates, you want to look at the `update` action.
 *
 * - JSONs are only payload type that seems to be sent, although the protocol is designed to accept all three.
 *
 * - With the exception of update actions with a modelKey of event, JSONs are always a subset of the bootstrap JSON, indexed off of modelKey. So for a modelKey of camera,
 *   the data payload is always a subset of {@link ProtectTypes.ProtectCameraConfigInterface | ProtectCameraConfigInterface}.
 *
 * @module ProtectApiEvents
 */
import { ProtectLogging } from "./protect-logging.js";
import zlib from "node:zlib";

// UniFi Protect events API packet header size, in bytes.
const EVENT_PACKET_HEADER_SIZE = 8;

// Update realtime API packet types.
enum ProtectEventPacketType {

  HEADER = 1,
  PAYLOAD = 2
}

// Update realtime API payload types.
enum EventPayloadType {

  JSON = 1,
  STRING = 2,
  BUFFER = 3
}

/**
 * @internal
 *
 * A packet header is composed of 8 bytes in this order:
 *
 * | Byte Offset | Description    | Bits | Values                                                                |
 * |-------------|----------------|------|-----------------------------------------------------------------------|
 * | 0           | Packet Type    | 8    | 1 - header frame, 2 - payload frame.                                  |
 * | 1           | Payload Format | 8    | 1 - JSON object, 2 - UTF8-encoded string, 3 - Node Buffer.            |
 * | 2           | Deflated       | 8    | 0 - uncompressed, 1 - compressed / deflated (zlib-based compression). |
 * | 3           | Unknown        | 8    | Always 0. Possibly reserved for future use by Ubiquiti?               |
 * | 4-7         | Payload Size:  | 32   | Size of payload in network-byte order (big endian).                   |
 */
enum ProtectEventPacketHeader {

  TYPE = 0,
  PAYLOAD_FORMAT = 1,
  DEFLATED = 2,
  UNKNOWN = 3,
  PAYLOAD_SIZE = 4
}

/**
 * UniFi Protect event packet.
 *
 * @param header   - Protect event header.
 * @param payload  - Protect event payload.
 *
 * @remarks A UniFi Protect event packet represents a realtime event update from a UniFi Protect controller. There are two components to each packet, a `header` and
 *   a `payload`. The `header` contains information about which Protect device and what action category it belongs to. The `payload` contains the detailed information
 *   related to the device and action specified in the header.
 */
export type ProtectEventPacket = {

  header: ProtectEventHeader,
  payload: unknown
};

/**
 * UniFi Protect event header.
 *
 * @param header   - Protect event header.
 * @param payload  - Protect event payload.
 *
 * @remarks A UniFi Protect event packet represents a realtime event update from a UniFi Protect controller. There are two components to each packet, a `header` and
 *   a `payload`. The `header` contains information about which Protect device and what action category it belongs to. The `payload` contains the detailed information
 *   related to the device and action specified in the header.
 */
export type ProtectEventHeader = {

  action: string,
  id: string,
  modelKey: string,
  newUpdateId: string
};

/**
 * UniFi Protect event utility class that provides functions for decoding realtime event API packet frames.
 */
export class ProtectApiEvents {

  /** @internal */
  constructor() {

  }

  /**
   * Decode a UniFi Protect event packet.
   *
   * @param log     - Logging functions to use.
   * @param packet  - Input packet to decode.
   *
   * @remarks A UniFi Protect event packet is an encoded representation of state updates that occur in a UniFi Protect controller. This utility function takes an
   * encoded packet as an input, and decodes it into an event header and payload that can be acted upon. An example of it's use is in {@link ProtectApi} where, once
   * successfully logged into the Protect controller, events are generated automatically and can be accessed by listening to `message` events emitted by
   * {@link ProtectApi}.
   */
  public static decodePacket(log: ProtectLogging, packet: Buffer): ProtectEventPacket | null {

    // What we need to do here is to split this packet into the header and payload, and decode them.

    let dataOffset;

    try {

      // The fourth byte holds our payload size. When you add the payload size to our header frame size, you get the location of the
      // data header frame.
      dataOffset = packet.readUInt32BE(ProtectEventPacketHeader.PAYLOAD_SIZE) + EVENT_PACKET_HEADER_SIZE;

      // Validate our packet size, just in case we have more or less data than we expect. If we do, we're done for now.
      if(packet.length !== (dataOffset + EVENT_PACKET_HEADER_SIZE + packet.readUInt32BE(dataOffset + ProtectEventPacketHeader.PAYLOAD_SIZE))) {

        throw new Error("Packet length doesn't match header information.");
      }

    } catch(error) {

      log.error("Realtime events API: error decoding update packet: %s.", error);

      return null;
    }

    // Decode the action and payload frames now that we know where everything is.
    const headerFrame = this.decodeFrame(log, packet.slice(0, dataOffset), ProtectEventPacketType.HEADER) as ProtectEventHeader;
    const payloadFrame = this.decodeFrame(log, packet.slice(dataOffset), ProtectEventPacketType.PAYLOAD);

    if(!headerFrame || !payloadFrame) {

      return null;
    }

    return ({ header: headerFrame, payload: payloadFrame });
  }

  // Decode a frame, composed of a header and payload, received through the update events API.
  private static decodeFrame(log: ProtectLogging, packet: Buffer, packetType: ProtectEventPacketType): Buffer | JSON | ProtectEventHeader | null | string {

    // Read the packet frame type.
    const frameType = packet.readUInt8(ProtectEventPacketHeader.TYPE) as ProtectEventPacketType;

    // This isn't the frame type we were expecting - we're done.
    if(packetType !== frameType) {

      return null;
    }

    // Read the payload format.
    const payloadFormat = packet.readUInt8(ProtectEventPacketHeader.PAYLOAD_FORMAT) as EventPayloadType;

    // Check to see if we're compressed or not, and inflate if needed after skipping past the 8-byte header.
    const payload = packet.readUInt8(ProtectEventPacketHeader.DEFLATED) ?
      zlib.inflateSync(packet.slice(EVENT_PACKET_HEADER_SIZE)) : packet.slice(EVENT_PACKET_HEADER_SIZE);

    // If it's a header, it can only have one format.
    if(frameType === ProtectEventPacketType.HEADER) {

      return (payloadFormat === EventPayloadType.JSON) ? JSON.parse(payload.toString()) as ProtectEventHeader : null;
    }

    // Process the payload format accordingly.
    switch(payloadFormat) {

      case EventPayloadType.JSON:

        // If it's data payload, it can be anything.
        return JSON.parse(payload.toString()) as JSON;

      case EventPayloadType.STRING:

        return payload.toString("utf8");

      case EventPayloadType.BUFFER:

        return payload;

      default:

        log.error("Unknown payload packet type received in the realtime events API: %s.", payloadFormat);

        return null;
    }
  }
}
