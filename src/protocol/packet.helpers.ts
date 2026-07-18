/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * packet.helpers.ts: Test-only factory for synthesizing valid (and intentionally malformed) UniFi Protect realtime events packets. The wire protocol is described in
 * packet.ts; this helper encodes that spec into a single source of truth so tests build packets through the spec, not by hand-rolling byte arrays.
 *
 * The decoder under test (`decodePacket` in `packet.ts`) reads the same byte offsets we write here, so this factory and that production decoder are mirror images of
 * each other and a wire-level regression in either side surfaces as a test failure rather than a corrupted runtime payload. Any edit to the wire spec lands in both
 * files in lockstep.
 */
import { deflateSync } from "node:zlib";

// Frame tag byte. Action frames go first (1), data frames second (2).
export const PACKET_TYPE_ACTION = 1;
export const PACKET_TYPE_DATA = 2;

// Payload format byte. Action frames are always JSON in practice; data frames may be JSON, UTF-8 string, or a raw Node Buffer.
export const PAYLOAD_FORMAT_JSON = 1;
export const PAYLOAD_FORMAT_STRING = 2;
export const PAYLOAD_FORMAT_BUFFER = 3;

// Header frame size in bytes. Two of these prefix every full packet (one before the action payload, one before the data payload).
export const HEADER_SIZE = 8;

// Build a single frame: 8-byte header + payload bytes. Optionally zlib-deflate the payload and set the deflate flag in the header. Header layout (per the protocol
// spec): byte 0 = packet type, byte 1 = payload format, byte 2 = deflated flag, byte 3 = reserved (always 0), bytes 4-7 = payload size (big endian).
export function buildFrame(options: {

  deflated?: boolean;
  packetType: number;
  payload: Buffer;
  payloadFormat: number;
}): Buffer {

  const { deflated = false, packetType, payload, payloadFormat } = options;
  const body = deflated ? deflateSync(payload) : payload;
  const header = Buffer.alloc(HEADER_SIZE);

  header.writeUInt8(packetType, 0);
  header.writeUInt8(payloadFormat, 1);
  header.writeUInt8(deflated ? 1 : 0, 2);
  header.writeUInt8(0, 3);
  header.writeUInt32BE(body.length, 4);

  return Buffer.concat([ header, body ]);
}

// Compose a complete packet from action and data frames. The decoder splits these by the action frame's declared size, so this composition matches the wire
// expectation byte-for-byte.
export function buildPacket(actionFrame: Buffer, dataFrame: Buffer): Buffer {

  return Buffer.concat([ actionFrame, dataFrame ]);
}

// Convenience: a JSON action frame (the only shape the decoder accepts for action frames).
export function jsonActionFrame(json: object, options: { deflated?: boolean } = {}): Buffer {

  return buildFrame({ deflated: options.deflated, packetType: PACKET_TYPE_ACTION, payload: Buffer.from(JSON.stringify(json)), payloadFormat: PAYLOAD_FORMAT_JSON });
}

// Convenience: a JSON data frame.
export function jsonDataFrame(json: object, options: { deflated?: boolean } = {}): Buffer {

  return buildFrame({ deflated: options.deflated, packetType: PACKET_TYPE_DATA, payload: Buffer.from(JSON.stringify(json)), payloadFormat: PAYLOAD_FORMAT_JSON });
}

// Convenience: a UTF-8 string data frame.
export function stringDataFrame(text: string, options: { deflated?: boolean } = {}): Buffer {

  return buildFrame({ deflated: options.deflated, packetType: PACKET_TYPE_DATA, payload: Buffer.from(text, "utf8"), payloadFormat: PAYLOAD_FORMAT_STRING });
}

// Convenience: a raw-buffer data frame.
export function bufferDataFrame(payload: Buffer, options: { deflated?: boolean } = {}): Buffer {

  return buildFrame({ deflated: options.deflated, packetType: PACKET_TYPE_DATA, payload, payloadFormat: PAYLOAD_FORMAT_BUFFER });
}

// Reasonable default action header used across happy-path tests. Tests can override fields when the specific identifier or modelKey matters.
export function makeActionHeader(overrides: Partial<{ action: string; id: string; modelKey: string; newUpdateId: string }> = {}): {

  action: string;
  id: string;
  modelKey: string;
  newUpdateId: string;
} {

  return { action: "update", id: "test-device-001", modelKey: "camera", newUpdateId: "00000000-0000-0000-0000-000000000001", ...overrides };
}
