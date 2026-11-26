/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * ubv.test.ts: Tests for the UBV reader - each track's record read as its frame, the records read past, the timestamp's halves, the payload's padding, the
 * zero-copy views and the copy a cut header is held as, a stream cut anywhere, and each refusal.
 */
import { AV1_FRAME, H264_IDR, H264_NON_IDR, H265_TRAIL_R, adtsFrame, h264Unit, h265Unit, lengthPrefixed, obu, opusPacket,
  temporalDelimiter } from "./codecs.helpers.ts";
import { UBV_AAC, UBV_AV1, UBV_CLOCK, UBV_H264, UBV_H265, UBV_OPUS, ubvRecord } from "./ubv.helpers.ts";
import { describe, test } from "node:test";
import type { MediaFrame } from "./frames.ts";
import { ProtectProtocolError } from "../../errors.ts";
import { UbvReader } from "./ubv.ts";
import assert from "node:assert/strict";

// The payloads each track carries, every byte a stated value. The H.264 frame is one IDR slice behind its length prefix; the HEVC frame one trailing slice; the
// AV1 temporal unit a temporal delimiter and a frame OBU, 13 bytes; the AAC frame AAC-LC at sampling-frequency index 3 (48000 Hz) in two channels behind a
// seven-byte header; the Opus packet a configuration 12 TOC coded in mono and three bytes.
const H264_PAYLOAD = lengthPrefixed(h264Unit(H264_IDR, Buffer.from([ 0x88, 0x84, 0x21, 0xa0, 0x5e ])));
const H265_PAYLOAD = lengthPrefixed(h265Unit(H265_TRAIL_R, Buffer.from([ 0xaf, 0x09, 0x40 ])));
const AV1_PAYLOAD = Buffer.concat([ temporalDelimiter(), obu(AV1_FRAME, Buffer.from([ 0x10, 0x00, 0x2a, 0x7e, 0xc3, 0x11, 0x42, 0x05, 0x99 ])) ]);
const AAC_PAYLOAD = adtsFrame({ channelConfiguration: 2, objectType: 2, payload: Buffer.from([ 0x21, 0x1b, 0x94, 0x0c ]), samplingFrequencyIndex: 3 });
const OPUS_PAYLOAD = opusPacket({ config: 12, payload: Buffer.from([ 0x5d, 0x03, 0xe8 ]), stereo: false });

// One record of each media track, near 4000 seconds into its track's clock, and the frame the reader answers for each.
const H264_RECORD = ubvRecord({ keyframe: true, payload: H264_PAYLOAD, timestamp: 360000000, track: UBV_H264 });
const H265_RECORD = ubvRecord({ payload: H265_PAYLOAD, timestamp: 360003600, track: UBV_H265 });
const AV1_RECORD = ubvRecord({ keyframe: true, payload: AV1_PAYLOAD, timestamp: 360007200, track: UBV_AV1 });
const AAC_RECORD = ubvRecord({ payload: AAC_PAYLOAD, timestamp: 192000040, track: UBV_AAC });
const OPUS_RECORD = ubvRecord({ payload: OPUS_PAYLOAD, timestamp: 192001440, track: UBV_OPUS });

const H264_READ: MediaFrame = { codec: "h264", data: H264_PAYLOAD, keyframe: true, kind: "video", rate: 90000, timestamp: 360000000 };
const H265_READ: MediaFrame = { codec: "h265", data: H265_PAYLOAD, keyframe: false, kind: "video", rate: 90000, timestamp: 360003600 };
const AV1_READ: MediaFrame = { codec: "av1", data: AV1_PAYLOAD, keyframe: true, kind: "video", rate: 90000, timestamp: 360007200 };
const AAC_READ: MediaFrame = { codec: "aac", data: AAC_PAYLOAD, kind: "audio", rate: 48000, timestamp: 192000040 };
const OPUS_READ: MediaFrame = { codec: "opus", data: OPUS_PAYLOAD, kind: "audio", rate: 48000, timestamp: 192001440 };

// A clock record under the 16-byte header with an eight-byte payload, a record of track 2048 under the 20-byte header, one of track 77 under the 16-byte header,
// and an empty one of track 512 under the 16-byte header, 20 bytes, the shortest record and exactly the longest header's length: none is a media track, so each
// is read past.
const CLOCK_RECORD = ubvRecord({ longHeader: false, payload: Buffer.from([ 0, 0, 0, 0, 0x3b, 0x9a, 0xca, 0x07 ]), shortField: 0x1234, track: UBV_CLOCK });
const UNKNOWN_RECORD = ubvRecord({ payload: Buffer.from([ 9, 8, 7, 6, 5 ]), timestamp: 5, track: 2048 });
const UNKNOWN_SHORT_RECORD = ubvRecord({ longHeader: false, payload: Buffer.from([ 1, 2 ]), track: 77 });
const EMPTY_RECORD = ubvRecord({ longHeader: false, payload: Buffer.alloc(0), track: 512 });

// A non-key H.264 frame whose kind byte and code carry values the reader passes over.
const SLICE_PAYLOAD = lengthPrefixed(h264Unit(H264_NON_IDR, Buffer.from([ 0x9a, 0x02 ])));
const SLICE_RECORD = ubvRecord({ code: 0xabcdef, kind: 0x5a, payload: SLICE_PAYLOAD, timestamp: 360010800, track: UBV_H264 });

// A stream mixing every record above, and the frames it yields.
const STREAM = Buffer.concat([ CLOCK_RECORD, H264_RECORD, H265_RECORD, UNKNOWN_RECORD, AV1_RECORD, AAC_RECORD, EMPTY_RECORD, OPUS_RECORD, UNKNOWN_SHORT_RECORD,
  SLICE_RECORD ]);
const STREAM_FRAMES: MediaFrame[] = [ H264_READ, H265_READ, AV1_READ, AAC_READ, OPUS_READ,
  { codec: "h264", data: SLICE_PAYLOAD, keyframe: false, kind: "video", rate: 90000, timestamp: 360010800 } ];

describe("UbvReader", () => {

  test("a record of each media track reads as its frame, with its codec, its clock, its timestamp and its keyframe flag", () => {

    assert.deepEqual(new UbvReader().push(Buffer.concat([ H264_RECORD, H265_RECORD, AV1_RECORD, AAC_RECORD, OPUS_RECORD ])),
      [ H264_READ, H265_READ, AV1_READ, AAC_READ, OPUS_READ ]);
  });

  test("the clock and a track outside the vocabulary yield nothing, under either header", () => {

    const reader = new UbvReader();

    assert.deepEqual(reader.push(Buffer.concat([ CLOCK_RECORD, UNKNOWN_RECORD, UNKNOWN_SHORT_RECORD ])), []);
    assert.deepEqual(reader.push(STREAM), STREAM_FRAMES);
  });

  test("a timestamp reads its high 32 bits above its low 32 bits", () => {

    // High half 41 and low half 0x89abcdef, so a reader of the low half alone reads 2309737967.
    const [frame] = new UbvReader().push(ubvRecord({ payload: OPUS_PAYLOAD, timestamp: (41 * (2 ** 32)) + 0x89abcdef, track: UBV_OPUS }));

    assert.equal(frame?.timestamp, 178403397103);
  });

  test("payloads at each remainder of four read back whole, past their padding", () => {

    // Opus packets of 8, 9, 10 and 11 bytes, padded by 0, 3, 2 and 1 zero bytes, 1920 ticks apart.
    const packets = [ 7, 8, 9, 10 ].map((length) => opusPacket({ config: 3, payload: Buffer.alloc(length, length), stereo: true }));
    const frames = new UbvReader().push(Buffer.concat(packets.map((payload, index) => ubvRecord({ payload, timestamp: 96000 + (index * 1920), track: UBV_OPUS }))));

    assert.deepEqual(frames.map(({ data }) => data), packets);
    assert.deepEqual(frames.map(({ timestamp }) => timestamp), [ 96000, 97920, 99840, 101760 ]);
  });

  test("a record whole within a chunk yields its payload as a view into the chunk, at the payload's offset", () => {

    // The stream sits 7 bytes into a larger buffer and is handed over as a plain Uint8Array, so the view must count from the chunk's own offset.
    const backing = Buffer.alloc(7 + CLOCK_RECORD.length + H264_RECORD.length);

    Buffer.concat([ CLOCK_RECORD, H264_RECORD ]).copy(backing, 7);

    const chunk = new Uint8Array(backing.buffer, backing.byteOffset + 7, backing.length - 7);
    const [frame] = new UbvReader().push(chunk);

    assert.ok(frame?.kind === "video");
    assert.equal(frame.data.buffer, chunk.buffer);
    assert.equal(frame.data.byteOffset, chunk.byteOffset + CLOCK_RECORD.length + 20);
    assert.deepEqual(frame.data, H264_PAYLOAD);
  });
});

describe("UbvReader across chunks", () => {

  test("a stream cut at every byte offset yields the frames the whole stream yields", () => {

    for(let cut = 0; cut <= STREAM.length; cut++) {

      const reader = new UbvReader();

      assert.deepEqual([ ...reader.push(STREAM.subarray(0, cut)), ...reader.push(STREAM.subarray(cut)) ], STREAM_FRAMES, "cut at " + String(cut));
    }
  });

  test("a stream fed a byte at a time yields the frames the whole stream yields", () => {

    const reader = new UbvReader();
    const frames: MediaFrame[] = [];

    for(let offset = 0; offset < STREAM.length; offset++) {

      frames.push(...reader.push(STREAM.subarray(offset, offset + 1)));
    }

    assert.deepEqual(frames, STREAM_FRAMES);
  });

  test("a header a chunk's end cuts is held as a copy, so a chunk changed after its push reads as it was pushed", () => {

    // The H.264 record cut 11 bytes in, inside its header, and that first chunk zeroed once pushed: a reader holding a view of its bytes would read a record
    // that does not open with the marker.
    const reader = new UbvReader();
    const first = Buffer.from(H264_RECORD.subarray(0, 11));

    assert.deepEqual(reader.push(first), []);

    first.fill(0);

    assert.deepEqual(reader.push(H264_RECORD.subarray(11)), [H264_READ]);
  });

  test("a record across three chunks is joined into one buffer of its own length, its frame a view into it", () => {

    // The AV1 record, 20 header bytes, the 13-byte payload with 3 bytes of padding, and the trailer, cut inside its header and then inside its payload.
    const reader = new UbvReader();

    assert.equal(AV1_RECORD.length, 40);
    assert.deepEqual(reader.push(AV1_RECORD.subarray(0, 11)), []);
    assert.deepEqual(reader.push(AV1_RECORD.subarray(11, 27)), []);

    const [frame] = reader.push(AV1_RECORD.subarray(27));

    assert.ok(frame?.kind === "video");
    assert.deepEqual(frame, AV1_READ);
    assert.equal(frame.data.buffer.byteLength, 40);
    assert.equal(frame.data.byteOffset, 20);
  });
});

describe("UbvReader refusals", () => {

  test("refuses a record that does not open with the marker, as soon as its first byte arrives", () => {

    assert.throws(() => new UbvReader().push(ubvRecord({ marker: 0xa1, payload: OPUS_PAYLOAD, track: UBV_OPUS })),
      { constructor: ProtectProtocolError, message: /record marker/ });
    assert.throws(() => new UbvReader().push(Buffer.concat([ CLOCK_RECORD, Buffer.from([0x00]) ])), { constructor: ProtectProtocolError, message: /record marker/ });
  });

  test("refuses a record whose trailer is not the length of its header and padded payload", () => {

    // An Opus record of 20 header bytes and a 4-byte payload, whose trailer reads 23 rather than 24.
    const record = ubvRecord({ payload: opusPacket({ config: 3, payload: Buffer.from([ 1, 2, 3 ]), stereo: false }), track: UBV_OPUS, trailer: 23 });

    assert.throws(() => new UbvReader().push(record), { constructor: ProtectProtocolError, message: /trailer/ });
  });

  test("refuses a media track's record under the 16-byte header, which carries no timestamp", () => {

    assert.throws(() => new UbvReader().push(ubvRecord({ longHeader: false, payload: H264_PAYLOAD, track: UBV_H264 })),
      { constructor: ProtectProtocolError, message: /16-byte header/ });
  });

  test("refuses an AAC record whose ADTS header is malformed", () => {

    // The AAC frame above with its syncword's last four bits cleared.
    const payload = Buffer.from(AAC_PAYLOAD);

    payload[1] = 0x01;

    assert.throws(() => new UbvReader().push(ubvRecord({ payload, track: UBV_AAC })), { constructor: ProtectProtocolError, message: /syncword/ });
  });

  test("refuses a payload size past 16 MiB as soon as its header is read, and accepts one at 16 MiB", () => {

    // Only the 20-byte header arrives, so a reader that did not refuse here would wait for the rest of the record.
    const header = (size: number): Buffer => ubvRecord({ payload: Buffer.alloc(0), size, track: UBV_H264 }).subarray(0, 20);

    assert.throws(() => new UbvReader().push(header(16777217)), { constructor: ProtectProtocolError, message: /larger than any frame/ });
    assert.deepEqual(new UbvReader().push(header(16777216)), []);
  });
});

describe("UbvReader AAC clock", () => {

  test("an AAC record counts at the sampling frequency its ADTS header names", () => {

    // AAC-LC in one channel at index 6 (24000 Hz), then in two channels at index 11 (8000 Hz).
    const frames = new UbvReader().push(Buffer.concat([
      ubvRecord({ payload: adtsFrame({ channelConfiguration: 1, objectType: 2, payload: Buffer.from([ 1, 2 ]), samplingFrequencyIndex: 6 }), timestamp: 24000,
        track: UBV_AAC }),
      ubvRecord({ payload: adtsFrame({ channelConfiguration: 2, objectType: 2, payload: Buffer.from([ 3, 4 ]), samplingFrequencyIndex: 11 }), timestamp: 8000,
        track: UBV_AAC })
    ]));

    assert.deepEqual(frames.map(({ rate }) => rate), [ 24000, 8000 ]);
  });
});
