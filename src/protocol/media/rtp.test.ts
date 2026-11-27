/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * rtp.test.ts: Tests for the RTP writer - the fixed header's every field and the payload behind it in one buffer, read back byte by byte and through an independent
 * reader, and the sequence number's and the timestamp's advances, each at its wrap.
 */
import { OPUS_RTP_PAYLOAD_TYPE, nextRtpSequence, nextRtpTimestamp, writeRtpPacket } from "./rtp.ts";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readRtpPacket } from "./rtp.helpers.ts";

describe("writeRtpPacket", () => {

  test("writes version 2 with no padding, extension or CSRC, the marker clear, then the payload type, sequence, timestamp and SSRC big-endian, then the payload", () => {

    const packet = writeRtpPacket({ payloadType: OPUS_RTP_PAYLOAD_TYPE, sequence: 0x1234, ssrc: 0xdeadbeef, timestamp: 0x01020304 }, Uint8Array.of(0xaa, 0xbb));

    assert.ok(Buffer.isBuffer(packet));
    assert.deepEqual(packet, Buffer.from([ 0x80, 0x6f, 0x12, 0x34, 0x01, 0x02, 0x03, 0x04, 0xde, 0xad, 0xbe, 0xef, 0xaa, 0xbb ]));
    assert.deepEqual(readRtpPacket(packet), { csrcCount: 0, extension: 0, marker: 0, padding: 0, payload: Buffer.from([ 0xaa, 0xbb ]), payloadType: 111,
      sequence: 0x1234, ssrc: 0xdeadbeef, timestamp: 0x01020304, version: 2 });
  });

  test("copies the payload into the packet, so a payload changed afterwards leaves the packet as written", () => {

    const payload = Uint8Array.of(1, 2, 3);
    const packet = writeRtpPacket({ payloadType: OPUS_RTP_PAYLOAD_TYPE, sequence: 0, ssrc: 1, timestamp: 0 }, payload);

    payload.fill(9);

    assert.equal(packet.length, 15);
    assert.deepEqual(packet.subarray(12), Buffer.from([ 1, 2, 3 ]));
  });

  test("an empty payload writes the bare twelve-byte header", () => {

    assert.equal(writeRtpPacket({ payloadType: OPUS_RTP_PAYLOAD_TYPE, sequence: 65535, ssrc: 4294967295, timestamp: 4294967295 }, new Uint8Array()).length, 12);
  });
});

describe("the sequence number and timestamp advances", () => {

  test("the sequence number counts up by one and wraps from 65535 to 0", () => {

    assert.equal(nextRtpSequence(0), 1);
    assert.equal(nextRtpSequence(41234), 41235);
    assert.equal(nextRtpSequence(65535), 0);
  });

  test("the timestamp advances by a packet's samples and wraps at 2^32", () => {

    assert.equal(nextRtpTimestamp(0, 960), 960);
    assert.equal(nextRtpTimestamp(4294967295, 960), 959);
    assert.equal(nextRtpTimestamp(4294966336, 960), 0);
  });
});
