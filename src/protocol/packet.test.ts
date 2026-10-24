/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * packet.test.ts: Unit tests for the binary 4-frame realtime events codec. Decode coverage spans every payload format the protocol allows (uncompressed JSON,
 * deflated JSON, UTF-8 string, raw buffer), the boundary cases (empty and large payloads), and the malformed-input guards - which throw ProtectProtocolError
 * rather than returning null, since a codec either yields a structurally valid packet or it does not. Encode coverage proves the inverse round-trips.
 */
import { HEADER_SIZE, PACKET_TYPE_ACTION, PACKET_TYPE_DATA, PAYLOAD_FORMAT_BUFFER, PAYLOAD_FORMAT_JSON, PAYLOAD_FORMAT_STRING, bufferDataFrame, buildFrame, buildPacket,
  jsonActionFrame, jsonDataFrame, makeActionHeader, stringDataFrame } from "./packet.helpers.ts";
import { decodePacket, encodePacket } from "./packet.ts";
import { describe, test } from "node:test";
import { ProtectProtocolError } from "../errors.ts";
import type { RawPacket } from "./packet.ts";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";

describe("decodePacket - happy paths", () => {

  test("decodes an uncompressed JSON-action plus JSON-data packet", () => {

    const header = makeActionHeader({ action: "update", id: "camera-1", modelKey: "camera" });
    const data = { lastMotion: 1714233600000, mac: "AA:BB:CC:DD:EE:FF" };
    const decoded = decodePacket(buildPacket(jsonActionFrame(header), jsonDataFrame(data)));

    assert.deepEqual(decoded.header, header, "decoded header should equal the original action JSON");
    assert.deepEqual(decoded.payload, data, "decoded payload should equal the original data JSON");
  });

  test("decodes when both frames are zlib-deflated", () => {

    const header = makeActionHeader();
    const data = { lastRing: 1714233601000 };
    const decoded = decodePacket(buildPacket(jsonActionFrame(header, { deflated: true }), jsonDataFrame(data, { deflated: true })));

    assert.deepEqual(decoded.header, header, "deflated action JSON should round-trip through inflate");
    assert.deepEqual(decoded.payload, data, "deflated data JSON should round-trip through inflate");
  });

  test("decodes when only the action frame is deflated (per-frame compression)", () => {

    const data = { plain: true };
    const decoded = decodePacket(buildPacket(jsonActionFrame(makeActionHeader(), { deflated: true }), jsonDataFrame(data, { deflated: false })));

    assert.deepEqual(decoded.payload, data);
  });

  test("decodes a UTF-8 string data frame", () => {

    const text = "the quick brown fox jumps over the lazy dog";
    const decoded = decodePacket(buildPacket(jsonActionFrame(makeActionHeader()), stringDataFrame(text)));

    assert.equal(decoded.payload, text, "string data frame should decode to its UTF-8 string");
  });

  test("decodes a raw-buffer data frame", () => {

    const bytes = Buffer.from([ 0xde, 0xad, 0xbe, 0xef, 0x00, 0xff, 0x10 ]);
    const decoded = decodePacket(buildPacket(jsonActionFrame(makeActionHeader()), bufferDataFrame(bytes)));

    assert.ok(Buffer.isBuffer(decoded.payload), "buffer data frame should decode to a Buffer");
    assert.deepEqual(decoded.payload, bytes, "buffer payload bytes should round-trip exactly");
  });

  test("decodes a raw-buffer data frame from a Uint8Array view at a byte offset without copying its bytes", () => {

    // The packet is laid at a byte offset into a Uint8Array of its own rather than handed over as the pooled Buffer the builders return, because a copy of a pooled
    // Buffer can land in the same pool and share its memory by chance. Over a dedicated backing, the payload shares the backing's memory only when the decoder viewed
    // the input rather than copying it.
    const bytes = Buffer.from([ 0xde, 0xad, 0xbe, 0xef, 0x00, 0xff, 0x10 ]);
    const packet = buildPacket(jsonActionFrame(makeActionHeader()), bufferDataFrame(bytes));
    const backing = new Uint8Array(8 + packet.length);

    backing.set(packet, 8);

    const decoded = decodePacket(backing.subarray(8));

    assert.ok(Buffer.isBuffer(decoded.payload), "buffer data frame should decode to a Buffer");
    assert.deepEqual(decoded.payload, bytes, "buffer payload bytes should round-trip exactly");
    assert.equal(decoded.payload.buffer, backing.buffer, "the payload is a view over the input's memory rather than a copy of it");
  });

  test("preserves arbitrary extra header fields from the action JSON", () => {

    const header = { ...makeActionHeader(), extraField: "value", nested: { inside: true } };
    const decoded = decodePacket(buildPacket(jsonActionFrame(header), jsonDataFrame({ ok: true })));

    assert.equal(decoded.header["extraField"], "value");
    assert.deepEqual(decoded.header["nested"], { inside: true });
  });

  test("matches a hand-built deflated packet (cross-check against the helper)", () => {

    const headerDeflated = deflateSync(Buffer.from(JSON.stringify(makeActionHeader())));
    const dataDeflated = deflateSync(Buffer.from(JSON.stringify({ ok: true })));
    const actionHeader = Buffer.alloc(8);

    actionHeader.writeUInt8(PACKET_TYPE_ACTION, 0);
    actionHeader.writeUInt8(PAYLOAD_FORMAT_JSON, 1);
    actionHeader.writeUInt8(1, 2);
    actionHeader.writeUInt32BE(headerDeflated.length, 4);

    const dataHeader = Buffer.alloc(8);

    dataHeader.writeUInt8(PACKET_TYPE_DATA, 0);
    dataHeader.writeUInt8(PAYLOAD_FORMAT_JSON, 1);
    dataHeader.writeUInt8(1, 2);
    dataHeader.writeUInt32BE(dataDeflated.length, 4);

    const decoded = decodePacket(Buffer.concat([ actionHeader, headerDeflated, dataHeader, dataDeflated ]));

    assert.deepEqual(decoded.header, makeActionHeader());
    assert.deepEqual(decoded.payload, { ok: true });
  });
});

describe("decodePacket - boundaries", () => {

  test("decodes a deflated empty-object payload", () => {

    const decoded = decodePacket(buildPacket(jsonActionFrame(makeActionHeader(), { deflated: true }), jsonDataFrame({}, { deflated: true })));

    assert.deepEqual(decoded.payload, {}, "empty object should round-trip through deflate/inflate");
  });

  test("decodes an empty UTF-8 string data frame to the empty string", () => {

    const decoded = decodePacket(buildPacket(jsonActionFrame(makeActionHeader()), stringDataFrame("")));

    assert.equal(decoded.payload, "", "empty string should decode to empty string");
  });

  test("decodes an empty-buffer data frame", () => {

    const decoded = decodePacket(buildPacket(jsonActionFrame(makeActionHeader()), bufferDataFrame(Buffer.alloc(0))));

    assert.ok(Buffer.isBuffer(decoded.payload));
    assert.equal((decoded.payload).length, 0, "empty buffer should decode to a zero-length Buffer");
  });

  test("decodes a large deflated payload", () => {

    const data = { items: Array.from({ length: 1000 }, (_, i) => ({ idx: i, mac: "AA:BB:CC:DD:EE:" + i.toString(16).padStart(2, "0") })) };
    const decoded = decodePacket(buildPacket(jsonActionFrame(makeActionHeader()), jsonDataFrame(data, { deflated: true })));

    assert.deepEqual(decoded.payload, data);
  });

  test("decodes a deflated UTF-8 string data frame", () => {

    const text = "deflated-string-payload";
    const decoded = decodePacket(buildPacket(jsonActionFrame(makeActionHeader()), stringDataFrame(text, { deflated: true })));

    assert.equal(decoded.payload, text, "deflated string should round-trip through inflate");
  });

  test("decodes a deflated buffer data frame", () => {

    const bytes = Buffer.concat([ Buffer.from("deadbeef", "hex"), Buffer.from("c0ffee00", "hex") ]);
    const decoded = decodePacket(buildPacket(jsonActionFrame(makeActionHeader()), bufferDataFrame(bytes, { deflated: true })));

    assert.deepEqual(decoded.payload, bytes);
  });
});

describe("decodePacket - malformed input throws ProtectProtocolError", () => {

  test("throws when the packet is shorter than the 8-byte header frame", () => {

    assert.throws(() => decodePacket(Buffer.from([ 0x01, 0x01, 0x00, 0x00 ])), ProtectProtocolError);
  });

  test("throws when the packet length is shorter than the declared frame sizes", () => {

    const full = buildPacket(jsonActionFrame(makeActionHeader()), jsonDataFrame({ ok: true }));

    assert.throws(() => decodePacket(full.subarray(0, full.length - 5)), { constructor: ProtectProtocolError, message: /does not match its header/ });
  });

  test("throws when the packet has trailing garbage past the declared frame sizes", () => {

    const full = buildPacket(jsonActionFrame(makeActionHeader()), jsonDataFrame({ ok: true }));

    assert.throws(() => decodePacket(Buffer.concat([ full, Buffer.from([ 0x00, 0x01, 0x02 ]) ])),
      { constructor: ProtectProtocolError, message: /does not match its header/ });
  });

  test("throws when the action frame declares a payload larger than the whole packet", () => {

    const header = Buffer.alloc(8);

    header.writeUInt8(PACKET_TYPE_ACTION, 0);
    header.writeUInt8(PAYLOAD_FORMAT_JSON, 1);
    header.writeUInt32BE(1000, 4);

    assert.throws(() => decodePacket(header), ProtectProtocolError);
  });

  test("throws when the second frame is an action frame rather than a data frame", () => {

    assert.throws(() => decodePacket(buildPacket(jsonActionFrame(makeActionHeader()), jsonActionFrame(makeActionHeader()))), ProtectProtocolError);
  });

  test("throws when the action frame JSON is a bare primitive rather than an object", () => {

    const primitiveAction = buildFrame({ packetType: PACKET_TYPE_ACTION, payload: Buffer.from("5"), payloadFormat: PAYLOAD_FORMAT_JSON });

    assert.throws(() => decodePacket(buildPacket(primitiveAction, jsonDataFrame({ ok: true }))), ProtectProtocolError);
  });

  test("throws when the action frame JSON is null rather than an object", () => {

    // JSON null is the one primitive whose typeof reads "object", so it reaches the header check's own null test rather than the typeof test a bare number meets.
    const nullAction = buildFrame({ packetType: PACKET_TYPE_ACTION, payload: Buffer.from("null"), payloadFormat: PAYLOAD_FORMAT_JSON });

    assert.throws(() => decodePacket(buildPacket(nullAction, jsonDataFrame({ ok: true }))),
      { constructor: ProtectProtocolError, message: /missing one or more required header fields/ });
  });

  test("throws when the action and data frames are swapped (frame ordering)", () => {

    assert.throws(() => decodePacket(buildPacket(jsonDataFrame({ ok: true }), jsonActionFrame(makeActionHeader()))),
      { constructor: ProtectProtocolError, message: /expected an action frame first/ });
  });

  test("throws when the action frame is a UTF-8 string instead of JSON", () => {

    const stringAction = buildFrame({ packetType: PACKET_TYPE_ACTION, payload: Buffer.from("not a json"), payloadFormat: PAYLOAD_FORMAT_STRING });

    assert.throws(() => decodePacket(buildPacket(stringAction, jsonDataFrame({ ok: true }))), { constructor: ProtectProtocolError, message: /action frame is not JSON/ });
  });

  test("throws when the action frame is a raw buffer instead of JSON", () => {

    const bufferAction = buildFrame({ packetType: PACKET_TYPE_ACTION, payload: Buffer.from([ 0x01, 0x02 ]), payloadFormat: PAYLOAD_FORMAT_BUFFER });

    assert.throws(() => decodePacket(buildPacket(bufferAction, jsonDataFrame({ ok: true }))), { constructor: ProtectProtocolError, message: /action frame is not JSON/ });
  });

  test("throws when the action JSON is valid but missing required header fields", () => {

    const partialHeader = buildFrame({ packetType: PACKET_TYPE_ACTION, payload: Buffer.from(JSON.stringify({ action: "update", id: "x" })),
      payloadFormat: PAYLOAD_FORMAT_JSON });

    assert.throws(() => decodePacket(buildPacket(partialHeader, jsonDataFrame({ ok: true }))), ProtectProtocolError);
  });

  test("throws when the data frame's payload format is unknown", () => {

    const unknownFormat = buildFrame({ packetType: PACKET_TYPE_DATA, payload: Buffer.from([ 0x01, 0x02, 0x03 ]), payloadFormat: 99 });

    assert.throws(() => decodePacket(buildPacket(jsonActionFrame(makeActionHeader()), unknownFormat)), ProtectProtocolError);
  });

  test("throws when the action frame's JSON is malformed", () => {

    const malformed = buildFrame({ packetType: PACKET_TYPE_ACTION, payload: Buffer.from("{not-json,"), payloadFormat: PAYLOAD_FORMAT_JSON });

    assert.throws(() => decodePacket(buildPacket(malformed, jsonDataFrame({ ok: true }))), ProtectProtocolError);
  });

  test("throws when the data frame's JSON is malformed", () => {

    const malformed = buildFrame({ packetType: PACKET_TYPE_DATA, payload: Buffer.from("{not-json,"), payloadFormat: PAYLOAD_FORMAT_JSON });

    assert.throws(() => decodePacket(buildPacket(jsonActionFrame(makeActionHeader()), malformed)), ProtectProtocolError);
  });

  test("throws when the deflated flag is set but the payload is not valid zlib", () => {

    const corrupt = buildFrame({ packetType: PACKET_TYPE_DATA, payload: Buffer.from([ 0xff, 0xff, 0xff, 0xff ]), payloadFormat: PAYLOAD_FORMAT_JSON });

    // Force the deflate flag on after construction so the flag and the bytes disagree.
    corrupt.writeUInt8(1, 2);

    assert.throws(() => decodePacket(buildPacket(jsonActionFrame(makeActionHeader()), corrupt)), ProtectProtocolError);
  });

  test("throws when a required header field is present with a non-string type", () => {

    // Every required header field must be a string, so a field that is present but typed otherwise fails the header check just as an absent one does.
    const numericId = buildFrame({ packetType: PACKET_TYPE_ACTION, payload: Buffer.from(JSON.stringify({ ...makeActionHeader(), id: 42 })),
      payloadFormat: PAYLOAD_FORMAT_JSON });

    assert.throws(() => decodePacket(buildPacket(numericId, jsonDataFrame({ ok: true }))),
      { constructor: ProtectProtocolError, message: /missing one or more required header fields/ });
  });

  test("throws when the action frame's deflated flag is set but its payload is not valid zlib", () => {

    const corrupt = buildFrame({ packetType: PACKET_TYPE_ACTION, payload: Buffer.from([ 0xff, 0xff, 0xff, 0xff ]), payloadFormat: PAYLOAD_FORMAT_JSON });

    // Force the deflate flag on after construction so the flag and the bytes disagree, as the data frame's row does: the action frame inflates through the same reader.
    corrupt.writeUInt8(1, 2);

    assert.throws(() => decodePacket(buildPacket(corrupt, jsonDataFrame({ ok: true }))), { constructor: ProtectProtocolError, message: /could not be inflated/ });
  });

  test("encodePacket throws an unwrapped TypeError for a circular payload", () => {

    // A payload JSON cannot serialize fails as the serializer's own TypeError, propagated unwrapped rather than as the codec's typed error, as the encoder documents.
    const payload: Record<string, unknown> = {};

    payload["self"] = payload;

    assert.throws(() => encodePacket({ header: makeActionHeader(), payload }), { constructor: TypeError, message: /circular/ });
  });
});

describe("encodePacket - round-trips through decodePacket", () => {

  test("a JSON payload round-trips", () => {

    const packet: RawPacket = { header: makeActionHeader(), payload: { lastMotion: 123, name: "Front" } };
    const decoded = decodePacket(encodePacket(packet));

    assert.deepEqual(decoded.header, packet.header);
    assert.deepEqual(decoded.payload, packet.payload);
  });

  test("a string payload round-trips", () => {

    const packet: RawPacket = { header: makeActionHeader(), payload: "a plain string payload" };
    const encoded = encodePacket(packet);
    const decoded = decodePacket(encoded);

    assert.equal(decoded.payload, "a plain string payload");

    // A string encoded as JSON would round-trip just the same, so the data frame's format byte is read too: the data frame opens past the action frame's header and
    // the payload size that header carries at byte 4, and the format is the second byte of the data frame's own header.
    assert.equal(encoded.readUInt8(encoded.readUInt32BE(4) + HEADER_SIZE + 1), PAYLOAD_FORMAT_STRING, "a string payload is encoded as a UTF-8 string data frame");
  });

  test("a buffer payload round-trips", () => {

    const packet: RawPacket = { header: makeActionHeader(), payload: Buffer.from([ 0x01, 0x02, 0x03, 0x04 ]) };
    const decoded = decodePacket(encodePacket(packet));

    assert.ok(Buffer.isBuffer(decoded.payload));
    assert.deepEqual(decoded.payload, Buffer.from([ 0x01, 0x02, 0x03, 0x04 ]));
  });

  test("a header with extra fields round-trips", () => {

    const packet: RawPacket = { header: { ...makeActionHeader(), region: "us", revision: 7 }, payload: { ok: true } };
    const decoded = decodePacket(encodePacket(packet));

    assert.equal(decoded.header["region"], "us");
    assert.equal(decoded.header["revision"], 7);
  });
});
