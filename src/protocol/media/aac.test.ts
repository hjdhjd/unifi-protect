/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * aac.test.ts: Tests for the AAC reader - ADTS headers of seven and nine bytes, the configuration's record, label and facts, and each refusal of a malformed or
 * non-AAC-LC header.
 */
import { AAC_LC_OBJECT_TYPE, CHANNEL_COUNTS, SAMPLING_FREQUENCIES, readAacConfiguration, readAdtsHeader } from "./aac.ts";
import { describe, test } from "node:test";
import { ProtectProtocolError } from "../../errors.ts";
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

describe("AAC vocabulary", () => {

  test("the sampling frequencies, the channel counts and the AAC-LC object type are the ones ISO/IEC 14496-3 states", () => {

    assert.deepEqual(SAMPLING_FREQUENCIES, [ 96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350 ]);
    assert.deepEqual([...CHANNEL_COUNTS], [ [ 1, 1 ], [ 2, 2 ], [ 3, 3 ], [ 4, 4 ], [ 5, 5 ], [ 6, 6 ], [ 7, 8 ] ]);
    assert.equal(AAC_LC_OBJECT_TYPE, 2);
  });
});
