/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * packet.ts: Binary codec for the UniFi Protect realtime events wire protocol.
 */

/**
 * Pure binary codec for the UniFi Protect realtime events wire protocol. This module is Layer 1: no I/O, no time, no side effects - just bytes in, structure out
 * (and back). It establishes one half of the protocol contract; {@link ../realtime/events | events.ts} establishes the other half by lifting a {@link RawPacket}
 * into a typed event. Splitting the two lets us test the binary protocol independently of the type classification.
 *
 * A complete update packet is four frames - two 8-byte headers, each followed by its payload:
 *
 * ```
 * ----------------
 * | Header Frame | (8 bytes)  describes the action frame that follows
 * ----------------
 * | Action Frame |            JSON: { action, id, modelKey, newUpdateId, ... }
 * ----------------
 * | Header Frame | (8 bytes)  describes the data frame that follows
 * ----------------
 * | Data Frame   |            JSON | UTF-8 string | raw Buffer
 * ----------------
 * ```
 *
 * Each 8-byte header frame is laid out as:
 *
 * | Byte Offset | Description    | Bits | Values                                                                |
 * |-------------|----------------|------|-----------------------------------------------------------------------|
 * | 0           | Packet Type    | 8    | 1 - action frame, 2 - data frame.                                     |
 * | 1           | Payload Format | 8    | 1 - JSON object, 2 - UTF8-encoded string, 3 - Node Buffer.            |
 * | 2           | Deflated       | 8    | 0 - uncompressed, 1 - compressed / deflated (zlib-based compression). |
 * | 3           | Unknown        | 8    | Always 0. Possibly reserved for future use by Ubiquiti?               |
 * | 4-7         | Payload Size   | 32   | Size of payload in network-byte order (big endian).                   |
 *
 * The action frame describes what changed (`action`, `id`, `modelKey`, `newUpdateId`); the data frame carries the change itself. In practice every payload observed
 * on the wire is JSON, though the protocol permits UTF-8 strings and raw buffers and the codec handles all three.
 *
 * {@link parsePacket} is the decoder's counterpart for a recorded packet. A recording of the raw firehose holds the packets the decoder returned, as the JSON text a
 * {@link RawPacket} serializes to, rather than the bytes they arrived as, so reading one back applies the decoder's own header rule and restores a `Buffer` payload
 * from its JSON form. The header rule has one spelling whether a packet arrives as bytes or as a recorded line.
 *
 * @module ProtectPacket
 */
import { jsonRefusal, readJson } from "../../shared/json.ts";
import { ProtectProtocolError } from "../../shared/errors.ts";
import { asBuffer } from "../buffer.ts";
import { inflateSync } from "node:zlib";
import { isPlainObject } from "./plain-object.ts";

// Header frame size, in bytes. Two of these prefix every packet - one before the action payload, one before the data payload.
const HEADER_SIZE = 8;

// Frame tag byte (header offset 0). Action frames are first (1), data frames second (2). The `as const` map plus value-union alias gives dot-access without
// the non-erasable runtime emit of a numeric enum.
const FrameType = {

  ACTION: 1,
  DATA: 2
} as const;

type FrameType = typeof FrameType[keyof typeof FrameType];

// Payload format byte (header offset 1). Keys are alphabetized to satisfy the sort-keys convention; the wire-protocol values are documented in the frame table above.
const PayloadFormat = {

  BUFFER: 3,
  JSON: 1,
  STRING: 2
} as const;

type PayloadFormat = typeof PayloadFormat[keyof typeof PayloadFormat];

// Named byte offsets within an 8-byte header frame. These are positions, not flags; the frame table above is the authoritative spec.
const HeaderOffset = {

  DEFLATED: 2,
  PAYLOAD_FORMAT: 1,
  PAYLOAD_SIZE: 4,
  TYPE: 0
} as const;

/**
 * The realtime-events action header. Every action frame is a JSON object carrying at least these four string fields; controllers may include arbitrary additional
 * keys, which are preserved on the index signature. The decoder validates this shape, so a {@link RawPacket}'s `header` is always trustworthy downstream.
 */
export interface ProtectEventHeader {

  action: string;
  id: string;
  modelKey: string;
  newUpdateId: string;
  [key: string]: boolean | number | object | string;
}

/**
 * The decoded, still-untyped form of a realtime-events packet: the validated action {@link ProtectEventHeader} and the raw data-frame payload. The payload is
 * `unknown` because the data frame may be parsed JSON (the dominant case), a UTF-8 string, or a raw `Buffer`; interpreting it is the classifier's job, not the codec's.
 * It is the element type of the raw firehose (`client.rawPackets()`) and the input/output of the static `ProtectClient.decodePacket` / `ProtectClient.classifyPacket`.
 */
export interface RawPacket {

  header: ProtectEventHeader;
  payload: unknown;
}

/**
 * Decode a realtime-events packet from its on-the-wire bytes into a {@link RawPacket}.
 *
 * This is a total, synchronous, pure function: given bytes, it either returns a structurally valid `RawPacket` or throws {@link ProtectProtocolError}. It never
 * returns `null` and never logs - classification of *valid-but-unmodeled* packets is the classifier's concern, and observability is the caller's. zlib inflation is
 * performed synchronously: realtime payloads are small (device-health deltas), so the cost is microseconds, and a pure synchronous codec is far simpler to compose
 * and test than an async one.
 *
 * @param buf - The raw packet bytes. Accepts any `Uint8Array` (a `Buffer` included) and reads it without copying.
 *
 * @returns The decoded {@link RawPacket}.
 *
 * @throws {@link ProtectProtocolError} if the bytes are malformed: too short to hold a header, internally inconsistent frame sizes, frames in the wrong order, an
 *   action frame that is not a valid JSON header, an unrecognized payload-format byte, unparseable JSON, or a corrupt deflate stream.
 *
 * @category Codec
 */
export function decodePacket(buf: Uint8Array): RawPacket {

  const packet = asBuffer(buf);

  // A packet must hold at least the first 8-byte header frame, or reading the payload size below would run past the end of the buffer.
  if(packet.length < HEADER_SIZE) {

    throw new ProtectProtocolError("Realtime events packet is shorter than the 8-byte header frame.");
  }

  // The payload size at offset 4 plus the header size lands us at the start of the second (data) header frame. We then cross-check the total buffer length against
  // both declared frame sizes so a truncated, padded, or corrupted packet fails fast here rather than producing nonsense downstream.
  const dataOffset = packet.readUInt32BE(HeaderOffset.PAYLOAD_SIZE) + HEADER_SIZE;

  if((dataOffset + HEADER_SIZE) > packet.length) {

    throw new ProtectProtocolError("Realtime events packet declares an action frame larger than the packet itself.");
  }

  const expectedLength = dataOffset + HEADER_SIZE + packet.readUInt32BE(dataOffset + HeaderOffset.PAYLOAD_SIZE);

  if(packet.length !== expectedLength) {

    throw new ProtectProtocolError("Realtime events packet length does not match its header information.");
  }

  // The action frame must be a JSON object matching the documented header shape; the data frame is whatever its format byte declares.
  const header = decodeActionFrame(packet.subarray(0, dataOffset));
  const payload = decodeDataFrame(packet.subarray(dataOffset));

  return { header, payload };
}

/**
 * Encode a {@link RawPacket} back into its on-the-wire byte representation. The inverse of {@link decodePacket}; round-tripping `decode(encode(packet))` reproduces
 * the packet. Frames are written uncompressed (the deflate flag is the controller's optimization, not something a consumer needs to reproduce, and the decoder reads
 * both forms). The data frame's format byte is chosen from the payload's runtime type: a `Buffer`/`Uint8Array` encodes as a raw buffer, a `string` as UTF-8, and
 * anything else as JSON.
 *
 * @param packet - The packet to encode.
 *
 * @returns The encoded bytes as a `Buffer`.
 *
 * @throws `TypeError` if `packet.header` or a non-`Buffer`/non-`string` `packet.payload` holds a value `JSON.stringify` cannot serialize (a circular
 *   reference or a `BigInt`). This propagates unwrapped rather than as the library's typed {@link ProtectProtocolError}.
 *
 * @category Codec
 */
export function encodePacket(packet: RawPacket): Buffer {

  const actionFrame = buildFrame(FrameType.ACTION, PayloadFormat.JSON, Buffer.from(JSON.stringify(packet.header)));
  const dataFrame = encodeDataFrame(packet.payload);

  return Buffer.concat([ actionFrame, dataFrame ]);
}

/**
 * Read a packet back from the JSON text a {@link RawPacket} serializes to: the decoder's counterpart for a recorded packet.
 *
 * A recording of the raw firehose holds packets rather than bytes, one a line as `JSON.stringify` writes it, so this reads a line back by the decoder's own rules.
 * The header passes the check an action frame's does, and a `Buffer` payload, which JSON carries in its `{ type: "Buffer", data }` form, is restored to the bytes
 * it holds; every other payload is returned as parsed. The form is matched exactly, `type` and `data` with no other key, because a JSON payload that carries them
 * beside a field of its own is a record the controller sent. Like {@link decodePacket}, it returns a structurally valid `RawPacket` or throws.
 *
 * @param json - The JSON text of one packet.
 *
 * @returns The packet, with a `Buffer` payload restored from its JSON form.
 *
 * @throws {@link ProtectProtocolError} if the text is not JSON, is not an object carrying a `header` and a `payload`, or carries a header missing one of the
 *   required string fields.
 *
 * @category Codec
 */
export function parsePacket(json: string): RawPacket {

  const value = parseJson(json, "Recorded realtime events packet is not valid JSON");

  if(!isPlainObject(value) || !Object.hasOwn(value, "header") || !Object.hasOwn(value, "payload")) {

    throw new ProtectProtocolError("Recorded realtime events packet is not an object carrying a header and a payload.");
  }

  const { header, payload } = value;

  if(!isProtectEventHeader(header)) {

    throw new ProtectProtocolError("Recorded realtime events packet header is missing one or more required header fields.");
  }

  return { header, payload: restoreBuffer(payload) };
}

// Decode the action frame: inflate if needed, require JSON, and validate the documented header shape. Anything else is a malformed action frame.
function decodeActionFrame(frame: Buffer): ProtectEventHeader {

  if(frame.readUInt8(HeaderOffset.TYPE) !== FrameType.ACTION) {

    throw new ProtectProtocolError("Realtime events packet has its frames in the wrong order; expected an action frame first.");
  }

  if(frame.readUInt8(HeaderOffset.PAYLOAD_FORMAT) !== PayloadFormat.JSON) {

    throw new ProtectProtocolError("Realtime events action frame is not JSON.");
  }

  const parsed = parseJson(inflateIfNeeded(frame));

  if(!isProtectEventHeader(parsed)) {

    throw new ProtectProtocolError("Realtime events action frame is missing one or more required header fields.");
  }

  return parsed;
}

// Decode the data frame: inflate if needed, then interpret per the payload-format byte. JSON parses to a value, STRING decodes to UTF-8, BUFFER returns the raw bytes.
function decodeDataFrame(frame: Buffer): unknown {

  if(frame.readUInt8(HeaderOffset.TYPE) !== FrameType.DATA) {

    throw new ProtectProtocolError("Realtime events packet has its frames in the wrong order; expected a data frame second.");
  }

  const payloadFormat = frame.readUInt8(HeaderOffset.PAYLOAD_FORMAT);
  const body = inflateIfNeeded(frame);

  switch(payloadFormat) {

    case PayloadFormat.JSON:

      return parseJson(body);

    case PayloadFormat.STRING:

      return body.toString("utf8");

    case PayloadFormat.BUFFER:

      return body;

    default:

      throw new ProtectProtocolError("Realtime events data frame has an unrecognized payload format: " + String(payloadFormat) + ".");
  }
}

// Encode a data frame from a payload value, choosing the format byte from the runtime type.
function encodeDataFrame(payload: unknown): Buffer {

  if(payload instanceof Uint8Array) {

    return buildFrame(FrameType.DATA, PayloadFormat.BUFFER, Buffer.from(payload));
  }

  if(typeof payload === "string") {

    return buildFrame(FrameType.DATA, PayloadFormat.STRING, Buffer.from(payload, "utf8"));
  }

  return buildFrame(FrameType.DATA, PayloadFormat.JSON, Buffer.from(JSON.stringify(payload)));
}

// Compose a single uncompressed frame: an 8-byte header (type, format, deflated=0, reserved=0, big-endian payload size) followed by the payload body.
function buildFrame(type: FrameType, format: PayloadFormat, body: Buffer): Buffer {

  const header = Buffer.alloc(HEADER_SIZE);

  header.writeUInt8(type, HeaderOffset.TYPE);
  header.writeUInt8(format, HeaderOffset.PAYLOAD_FORMAT);
  header.writeUInt8(0, HeaderOffset.DEFLATED);
  header.writeUInt32BE(body.length, HeaderOffset.PAYLOAD_SIZE);

  return Buffer.concat([ header, body ]);
}

// Return the frame's payload bytes, inflating them first if the deflate flag is set. A corrupt deflate stream surfaces as a ProtectProtocolError rather than a raw
// zlib error so callers catch one error type for all malformed-packet conditions.
function inflateIfNeeded(frame: Buffer): Buffer {

  const body = frame.subarray(HEADER_SIZE);

  if(!frame.readUInt8(HeaderOffset.DEFLATED)) {

    return body;
  }

  try {

    return inflateSync(body);
  } catch(error) {

    throw new ProtectProtocolError("Realtime events packet payload could not be inflated.", { cause: error });
  }
}

// Parse a JSON body, refusing text that is not JSON with a ProtectProtocolError. The refusal names what failed to parse and is written without its closing period,
// because the position the parse failed at goes before that period when the parser reports one.
function parseJson(body: Buffer | string, refusal = "Realtime events packet payload is not valid JSON"): unknown {

  const read = readJson(body.toString());

  if(!read.parsed) {

    throw new ProtectProtocolError(jsonRefusal(refusal, read));
  }

  return read.value;
}

// Restore a recorded `Buffer` payload from the `{ type: "Buffer", data }` form a Buffer's own `toJSON` gives it, and return every other payload as it was parsed. The
// cheap reads come first, so a record that is no Buffer's form is told apart without counting its keys.
function restoreBuffer(payload: unknown): unknown {

  if(!isPlainObject(payload) || (payload["type"] !== "Buffer")) {

    return payload;
  }

  const data = payload["data"];

  return (Array.isArray(data) && (Object.keys(payload).length === 2)) ? Buffer.from(data) : payload;
}

// Validate the documented action-frame rules: a non-null object whose four required fields are all strings. A controller bug or corrupted frame surfaces here
// rather than as a TypeError at the first downstream property access.
function isProtectEventHeader(value: unknown): value is ProtectEventHeader {

  if((value === null) || (typeof value !== "object")) {

    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (typeof candidate["action"] === "string") && (typeof candidate["id"] === "string") &&
    (typeof candidate["modelKey"] === "string") && (typeof candidate["newUpdateId"] === "string");
}
