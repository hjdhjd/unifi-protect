/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * aac.test.ts: Tests for the AAC reader - ADTS headers of seven and nine bytes, the configuration's record, label and facts, each refusal of a malformed or
 * non-AAC-LC header, and the stream reader that cuts an ADTS stream into its frames across chunks cut anywhere, with its refusals of a stream that lost its framing.
 */
import { AAC_LC_OBJECT_TYPE, AdtsReader, CHANNEL_COUNTS, SAMPLING_FREQUENCIES, readAacConfiguration, readAdtsHeader } from "./aac.ts";
import { describe, test } from "node:test";
import { ProtectProtocolError } from "../../../shared/errors.ts";
import { adtsFrame } from "./codecs.helpers.ts";
import assert from "node:assert/strict";

// A raw frame's bytes, which the reader carries past and never reads.
const RAW = Buffer.from([ 0x21, 0x10, 0x05, 0x40, 0x9c ]);

// AAC-LC at sampling-frequency index 3 (48000 Hz) in channel configuration 2 (two channels), the CRC absent: header `ff f1 4c 80 01 9f fc` and the raw frame.
const STEREO_48000 = adtsFrame({ channelConfiguration: 2, objectType: AAC_LC_OBJECT_TYPE, payload: RAW, samplingFrequencyIndex: 3 });

describe("readAdtsHeader", () => {

  test("a seven-byte header reads its object type, rate, index and channel configuration", () => {

    assert.deepEqual(STEREO_48000.subarray(0, 7), Buffer.from([ 0xff, 0xf1, 0x4c, 0x80, 0x01, 0x9f, 0xfc ]));
    assert.deepEqual(readAdtsHeader(STEREO_48000), { channelConfiguration: 2, headerLength: 7, objectType: 2, sampleRate: 48000, samplingFrequencyIndex: 3 });
  });

  test("a nine-byte header carries its CRC after the seven bytes", () => {

    // AAC-LC at index 4 (44100 Hz) in channel configuration 1, protection_absent 0 and the CRC `12 34`.
    const frame = adtsFrame({ channelConfiguration: 1, crc: 0x1234, objectType: AAC_LC_OBJECT_TYPE, payload: RAW, samplingFrequencyIndex: 4 });

    assert.deepEqual(readAdtsHeader(frame), { channelConfiguration: 1, headerLength: 9, objectType: 2, sampleRate: 44100, samplingFrequencyIndex: 4 });
  });

  test("refuses a frame shorter than its header, with or without its CRC", () => {

    const withCrc = adtsFrame({ channelConfiguration: 2, crc: 0x1234, objectType: AAC_LC_OBJECT_TYPE, payload: Buffer.alloc(0), samplingFrequencyIndex: 3 });

    assert.throws(() => readAdtsHeader(STEREO_48000.subarray(0, 5)), { constructor: ProtectProtocolError, message: /seven-byte header/ });
    assert.throws(() => readAdtsHeader(withCrc.subarray(0, 8)), { constructor: ProtectProtocolError, message: /nine-byte header/ });
  });

  test("refuses another syncword and a layer other than 0", () => {

    const syncword = adtsFrame({ channelConfiguration: 2, objectType: AAC_LC_OBJECT_TYPE, payload: RAW, samplingFrequencyIndex: 3, syncword: 0xff0 });
    const layer = adtsFrame({ channelConfiguration: 2, layer: 1, objectType: AAC_LC_OBJECT_TYPE, payload: RAW, samplingFrequencyIndex: 3 });

    assert.throws(() => readAdtsHeader(syncword), { constructor: ProtectProtocolError, message: /syncword/ });
    assert.throws(() => readAdtsHeader(layer), { constructor: ProtectProtocolError, message: /layer/ });
  });

  test("refuses a reserved sampling-frequency index and channel configuration 0", () => {

    const index = adtsFrame({ channelConfiguration: 2, objectType: AAC_LC_OBJECT_TYPE, payload: RAW, samplingFrequencyIndex: 13 });
    const channels = adtsFrame({ channelConfiguration: 0, objectType: AAC_LC_OBJECT_TYPE, payload: RAW, samplingFrequencyIndex: 3 });

    assert.throws(() => readAdtsHeader(index), { constructor: ProtectProtocolError, message: /reserved sampling-frequency index/ });
    assert.throws(() => readAdtsHeader(channels), { constructor: ProtectProtocolError, message: /channel configuration 0/ });
  });

  test("refuses more than one raw data block and a frame length other than the frame's own", () => {

    const blocks = adtsFrame({ channelConfiguration: 2, objectType: AAC_LC_OBJECT_TYPE, payload: RAW, rawDataBlocks: 2, samplingFrequencyIndex: 3 });
    const length = adtsFrame({ channelConfiguration: 2, frameLength: 100, objectType: AAC_LC_OBJECT_TYPE, payload: RAW, samplingFrequencyIndex: 3 });

    assert.throws(() => readAdtsHeader(blocks), { constructor: ProtectProtocolError, message: /more than one raw data block/ });
    assert.throws(() => readAdtsHeader(length), { constructor: ProtectProtocolError, message: /frame length other than its own/ });
  });

  test("refuses AAC Main, SSR and LTP, every object type but AAC-LC", () => {

    // Object types 1 (Main), 3 (SSR) and 4 (LTP), written as profile_ObjectType 0, 2 and 3.
    for(const objectType of [ 1, 3, 4 ]) {

      const frame = adtsFrame({ channelConfiguration: 2, objectType, payload: RAW, samplingFrequencyIndex: 3 });

      assert.throws(() => readAdtsHeader(frame), { constructor: ProtectProtocolError, message: /other than AAC-LC/ }, String(objectType));
    }
  });
});

describe("readAacConfiguration", () => {

  test("AAC-LC at 48000 Hz in two channels writes the AudioSpecificConfig 11 90 and the label mp4a.40.2", () => {

    assert.deepEqual(readAacConfiguration(STEREO_48000), { channels: 2, codec: "aac", label: "mp4a.40.2", record: Buffer.from([ 0x11, 0x90 ]), sampleRate: 48000 });
  });

  test("channel configuration 7 reads as eight channels, its record naming the configuration", () => {

    // Index 5 (32000 Hz) in configuration 7: 00010 0101 0111 000, `12 b8`.
    const frame = adtsFrame({ channelConfiguration: 7, objectType: AAC_LC_OBJECT_TYPE, payload: RAW, samplingFrequencyIndex: 5 });

    assert.deepEqual(readAacConfiguration(frame), { channels: 8, codec: "aac", label: "mp4a.40.2", record: Buffer.from([ 0x12, 0xb8 ]), sampleRate: 32000 });
  });

  test("refuses a malformed header as readAdtsHeader does", () => {

    assert.throws(() => readAacConfiguration(STEREO_48000.subarray(0, 3)), ProtectProtocolError);
  });
});

describe("AdtsReader", () => {

  // Frames of different lengths, one of them carrying its CRC, so a reader that cut every frame at one length, or at the header's length without the CRC, would
  // cut the stream wrong.
  const FIRST = adtsFrame({ channelConfiguration: 1, objectType: AAC_LC_OBJECT_TYPE, payload: Buffer.alloc(11, 0x21), samplingFrequencyIndex: 8 });
  const SECOND = adtsFrame({ channelConfiguration: 1, crc: 0xbeef, objectType: AAC_LC_OBJECT_TYPE, payload: Buffer.alloc(23, 0x42), samplingFrequencyIndex: 8 });
  const THIRD = adtsFrame({ channelConfiguration: 1, objectType: AAC_LC_OBJECT_TYPE, payload: Buffer.alloc(5, 0x63), samplingFrequencyIndex: 8 });
  const STREAM = Buffer.concat([ FIRST, SECOND, THIRD ]);

  test("a chunk holding whole frames answers each, cut at the length its header states, as a view into the chunk", () => {

    const frames = new AdtsReader().push(STREAM);

    assert.deepEqual(frames, [ FIRST, SECOND, THIRD ]);
    assert.ok(frames.every((frame) => frame.buffer === STREAM.buffer), "a frame whole within the chunk is read in place");
  });

  test("a stream cut at every byte answers every frame once it is whole, and nothing before", () => {

    const reader = new AdtsReader();
    const answered: Buffer[][] = [];

    for(const byte of STREAM) {

      answered.push(reader.push(Uint8Array.of(byte)));
    }

    assert.deepEqual(answered.flat(), [ FIRST, SECOND, THIRD ]);
    assert.deepEqual(answered.map((frames) => frames.length).reduce((ends: number[], count, index) => ((count === 0) ? ends : [ ...ends, index + 1 ]), []),
      [ FIRST.length, FIRST.length + SECOND.length, STREAM.length ], "each frame is answered by the chunk that completes it");
  });

  test("a frame the stream's end cuts is held and never answered", () => {

    const reader = new AdtsReader();

    assert.deepEqual(reader.push(Buffer.concat([ FIRST, SECOND.subarray(0, 10) ])), [FIRST]);
    assert.deepEqual(reader.push(new Uint8Array()), [], "a chunk that completes nothing answers nothing");
  });

  test("a frame of 2048 bytes or more is read at the whole length its header states", () => {

    // A frame of 6157 bytes, 0x180d, states its length with its two top bits set, 4096 and 2048, which sit in the low bits of the header's fourth byte.
    const long = adtsFrame({ channelConfiguration: 1, objectType: AAC_LC_OBJECT_TYPE, payload: Buffer.alloc(6150, 0x21), samplingFrequencyIndex: 8 });

    assert.equal(long.length, 6157);
    assert.deepEqual(new AdtsReader().push(Buffer.concat([ long, THIRD ])), [ long, THIRD ], "the stream reader cuts the frame at its whole length");
    assert.equal(readAdtsHeader(long).headerLength, 7, "and the header reader reads that length as the frame's own");
  });

  test("a frame cut inside its header is joined with the chunk that completes it", () => {

    const reader = new AdtsReader();

    assert.deepEqual(reader.push(SECOND.subarray(0, 3)), []);
    assert.deepEqual(reader.push(Buffer.concat([ SECOND.subarray(3), THIRD ])), [ SECOND, THIRD ]);
  });

  test("a stream that does not open with the syncword, or loses it between frames, is refused", () => {

    assert.throws(() => new AdtsReader().push(Buffer.alloc(16, 0x00)), { constructor: ProtectProtocolError, message: /syncword/ });
    assert.throws(() => new AdtsReader().push(Buffer.concat([ FIRST, Buffer.from([ 0xff, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 ]) ])),
      { constructor: ProtectProtocolError, message: /syncword/ });
  });

  test("a frame stating a length shorter than its header is refused rather than read forever", () => {

    assert.throws(() => new AdtsReader().push(adtsFrame({ channelConfiguration: 1, frameLength: 0, objectType: AAC_LC_OBJECT_TYPE, payload: RAW,
      samplingFrequencyIndex: 8 })), { constructor: ProtectProtocolError, message: /shorter than its seven-byte header/ });
  });
});

describe("AAC vocabulary", () => {

  test("the sampling frequencies, the channel counts and the AAC-LC object type are the ones ISO/IEC 14496-3 states", () => {

    assert.deepEqual(SAMPLING_FREQUENCIES, [ 96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350 ]);
    assert.deepEqual([...CHANNEL_COUNTS], [ [ 1, 1 ], [ 2, 2 ], [ 3, 3 ], [ 4, 4 ], [ 5, 5 ], [ 6, 6 ], [ 7, 8 ] ]);
    assert.equal(AAC_LC_OBJECT_TYPE, 2);
  });
});
