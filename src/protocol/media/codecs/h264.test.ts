/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * h264.test.ts: Tests for the H.264 reader - the facts, the avcC record and the label for each branch of the SPS walk, the split of a frame into its parameter sets
 * and its sample, and each refusal.
 */
import { H264_IDR, H264_NON_IDR, H264_SEI, h264Pps, h264Sps, h264SpsRbsp, h264Unit, lengthPrefixed } from "./codecs.helpers.ts";
import { describe, test } from "node:test";
import { readH264Configuration, splitH264Frame } from "./h264.ts";
import type { H264SpsFields } from "./codecs.helpers.ts";
import { ProtectProtocolError } from "../../../shared/errors.ts";
import assert from "node:assert/strict";

// A parameter set as the record lists it: a 16-bit length, then the unit.
function recordEntry(unit: Buffer): Buffer {

  return Buffer.concat([ Buffer.from([ unit.length >> 8, unit.length & 0xff ]), unit ]);
}

// The PPS every row pairs its SPS with: id 0 over SPS id 0.
const PPS = h264Pps();

// Constrained Baseline (profile 66, constraint flags 0 and 1, `c0`) at level 3.1 on a grid of 80 by 45 macroblocks, 1280 by 720, cropped 1 left, 2 right, 3 top and
// 4 bottom in 4:2:0's units of two samples: 1274 by 706.
const BASELINE: H264SpsFields = { constraints: 0xc0, crop: { bottom: 4, left: 1, right: 2, top: 3 }, heightInMapUnitsMinus1: 44, levelIdc: 31, profileIdc: 66,
  widthInMbsMinus1: 79 };

/* High (profile 100) at level 4.2 with its high-profile fields: 4:2:0, a luma depth of 10 and a chroma depth of 11 (minus 8: 2 and 3), no scaling matrix. Its frame
 * number and picture order count widths are 9 and 6 bits (minus 4: 5 and 2), it holds 3 reference frames, and its grid of 120 by 68 macroblocks is cropped 4 at the
 * bottom: 1920 by 1080.
 */
const HIGH: H264SpsFields = { constraints: 0x00, crop: { bottom: 4, left: 0, right: 0, top: 0 }, heightInMapUnitsMinus1: 67,
  high: { bitDepthChromaMinus8: 3, bitDepthLumaMinus8: 2, chromaFormatIdc: 1 }, levelIdc: 42, log2MaxFrameNumMinus4: 5, maxNumRefFrames: 3,
  pictureOrderCount: { log2MaxLsbMinus4: 2, type: 0 }, profileIdc: 100, widthInMbsMinus1: 119 };

/* High 4:2:2 (profile 122) at level 4.1: 4:2:2, depths of 9 and 10 (minus 8: 1 and 2), and a scaling matrix of the eight lists 4:2:2 codes. Lists 0, 2 and 5 of the
 * six 4x4 lists are present - list 0 a delta of -8, which zeroes its next scale at once, list 2 the deltas 5 and -13, and list 5 sixteen deltas of 1 - and both 8x8
 * lists are present, list 6 sixty-four deltas of 0 and list 7 the deltas 3 and -11. Its grid of 80 by 45 macroblocks is cropped 2 left, 1 right, 4 top and 3
 * bottom in 4:2:2's units of two samples across and one down: 1274 by 713.
 */
const HIGH_422: H264SpsFields = { constraints: 0x00, crop: { bottom: 3, left: 2, right: 1, top: 4 }, heightInMapUnitsMinus1: 44,
  high: { bitDepthChromaMinus8: 2, bitDepthLumaMinus8: 1, chromaFormatIdc: 2, scalingLists: [ [-8], undefined, [ 5, -13 ], undefined, undefined,
    Array<number>(16).fill(1), Array<number>(64).fill(0), [ 3, -11 ] ] }, levelIdc: 41, profileIdc: 122, widthInMbsMinus1: 79 };

/* High 4:4:4 Predictive (profile 244) at level 5.0: 4:4:4 with each color plane coded apart, at 8 bits, and a scaling matrix of the twelve lists 4:4:4 codes, of
 * which list 0 (a delta of -8) and the 8x8 lists 8 (the deltas 4 and -12), 10 (-8) and 11 (2 and -10) are present. Its grid of 80 by 45 macroblocks is cropped 1
 * left, 2 right, 3 top and 4 bottom in units of one sample, the planes coded apart reading as monochrome: 1277 by 713.
 */
const SEPARATE_PLANES: H264SpsFields = { constraints: 0x00, crop: { bottom: 4, left: 1, right: 2, top: 3 }, heightInMapUnitsMinus1: 44,
  high: { bitDepthChromaMinus8: 0, bitDepthLumaMinus8: 0, chromaFormatIdc: 3, scalingLists: [ [-8], undefined, undefined, undefined, undefined, undefined,
    undefined, undefined, [ 4, -12 ], undefined, [-8], [ 2, -10 ] ], separateColourPlane: 1 }, levelIdc: 50, profileIdc: 244, widthInMbsMinus1: 79 };

// Extended (profile 88) at level 3.0 with no constraint flags, on a grid of 40 by 30 macroblocks, uncropped: 640 by 480.
const EXTENDED: H264SpsFields = { constraints: 0x00, heightInMapUnitsMinus1: 29, levelIdc: 30, profileIdc: 88, widthInMbsMinus1: 39 };

// Profile 135 at level 5.1 with its high-profile fields: 4:2:2, depths of 10 and 11 (minus 8: 2 and 3), no scaling matrix, and a grid of 120 by 68 macroblocks
// cropped 8 at the bottom in 4:2:2's units of one sample down: 1920 by 1080.
const PROFILE_135: H264SpsFields = { constraints: 0x00, crop: { bottom: 8, left: 0, right: 0, top: 0 }, heightInMapUnitsMinus1: 67,
  high: { bitDepthChromaMinus8: 3, bitDepthLumaMinus8: 2, chromaFormatIdc: 2 }, levelIdc: 51, profileIdc: 135, widthInMbsMinus1: 119 };

// Main (profile 77) at level 2.2, coding fields with macroblock-adaptive frame and field coding, on a grid of 45 macroblocks by 18 map units of a field each, 720
// by 576, cropped 1 top and 2 bottom in units of two samples doubled for the two fields a frame holds: 720 by 564.
const INTERLACED: H264SpsFields = { constraints: 0x00, crop: { bottom: 2, left: 0, right: 0, top: 1 }, frameMbsOnly: 0, heightInMapUnitsMinus1: 17, levelIdc: 22,
  mbAdaptiveFrameField: 1, profileIdc: 77, widthInMbsMinus1: 44 };

// Main at level 3.2 with picture order count type 1: offsets of -3 for a non-reference picture and 2 from top to bottom field, and a cycle of three reference frame
// offsets, 5, -7 and 9. Its grid of 72 by 34 macroblocks is uncropped: 1152 by 544.
const ORDER_CYCLE: H264SpsFields = { constraints: 0x00, heightInMapUnitsMinus1: 33, levelIdc: 32, pictureOrderCount: { deltaAlwaysZero: 0, offsetForNonRefPic: -3,
  offsetForTopToBottomField: 2, offsetsForRefFrame: [ 5, -7, 9 ], type: 1 }, profileIdc: 77, widthInMbsMinus1: 71 };

// Constrained Baseline at level 3.2 holding 2 reference frames, with picture order count type 1 and an offset of -8388608 for a non-reference picture, whose
// Exp-Golomb code opens with 24 zero bits, so its RBSP holds `00 00 02` and `00 00 03`, each escaped. Its grid of 80 by 45 macroblocks is uncropped: 1280 by 720.
const ESCAPED: H264SpsFields = { constraints: 0xc0, heightInMapUnitsMinus1: 44, levelIdc: 32, maxNumRefFrames: 2, pictureOrderCount: { deltaAlwaysZero: 0,
  offsetForNonRefPic: -8388608, offsetForTopToBottomField: 0, offsetsForRefFrame: [], type: 1 }, profileIdc: 66, widthInMbsMinus1: 79 };

describe("readH264Configuration", () => {

  test("Baseline with cropping reads its cropped size and writes a record that ends after its parameter sets", () => {

    const sps = h264Sps(BASELINE);

    assert.deepEqual(readH264Configuration([ sps, PPS ]), { codec: "h264", height: 706, label: "avc1.42c01f", level: 31, profile: 66,
      record: Buffer.concat([ Buffer.from([ 0x01, 0x42, 0xc0, 0x1f, 0xff, 0xe1 ]), recordEntry(sps), Buffer.from([0x01]), recordEntry(PPS) ]), width: 1274 });
  });

  test("High at profile 100 reads its chroma and depth fields and writes them after every PPS it carries", () => {

    const sps = h264Sps(HIGH);
    const second = h264Pps({ ppsId: 1 });

    assert.deepEqual(readH264Configuration([ sps, PPS, second ]), { codec: "h264", height: 1080, label: "avc1.64002a", level: 42, profile: 100,
      record: Buffer.concat([ Buffer.from([ 0x01, 0x64, 0x00, 0x2a, 0xff, 0xe1 ]), recordEntry(sps), Buffer.from([0x02]), recordEntry(PPS), recordEntry(second),
        Buffer.from([ 0xfd, 0xfa, 0xfb, 0x00 ]) ]), width: 1920 });
  });

  test("Extended at profile 88 writes a record that ends after its picture parameter sets", () => {

    const sps = h264Sps(EXTENDED);

    assert.deepEqual(readH264Configuration([ sps, PPS ]), { codec: "h264", height: 480, label: "avc1.58001e", level: 30, profile: 88,
      record: Buffer.concat([ Buffer.from([ 0x01, 0x58, 0x00, 0x1e, 0xff, 0xe1 ]), recordEntry(sps), Buffer.from([0x01]), recordEntry(PPS) ]), width: 640 });
  });

  test("High at profile 135 reads its chroma and depth fields and writes them after its picture parameter sets", () => {

    const sps = h264Sps(PROFILE_135);

    assert.deepEqual(readH264Configuration([ sps, PPS ]), { codec: "h264", height: 1080, label: "avc1.870033", level: 51, profile: 135,
      record: Buffer.concat([ Buffer.from([ 0x01, 0x87, 0x00, 0x33, 0xff, 0xe1 ]), recordEntry(sps), Buffer.from([0x01]), recordEntry(PPS),
        Buffer.from([ 0xfe, 0xfa, 0xfb, 0x00 ]) ]), width: 1920 });
  });

  test("High 4:2:2 steps over its scaling matrix and crops in 4:2:2's units", () => {

    const sps = h264Sps(HIGH_422);

    assert.deepEqual(readH264Configuration([ sps, PPS ]), { codec: "h264", height: 713, label: "avc1.7a0029", level: 41, profile: 122,
      record: Buffer.concat([ Buffer.from([ 0x01, 0x7a, 0x00, 0x29, 0xff, 0xe1 ]), recordEntry(sps), Buffer.from([0x01]), recordEntry(PPS),
        Buffer.from([ 0xfe, 0xf9, 0xfa, 0x00 ]) ]), width: 1274 });
  });

  test("4:4:4 with a separate color plane steps over its twelve scaling lists and crops in units of one sample", () => {

    const sps = h264Sps(SEPARATE_PLANES);

    assert.deepEqual(readH264Configuration([ sps, PPS ]), { codec: "h264", height: 713, label: "avc1.f40032", level: 50, profile: 244,
      record: Buffer.concat([ Buffer.from([ 0x01, 0xf4, 0x00, 0x32, 0xff, 0xe1 ]), recordEntry(sps), Buffer.from([0x01]), recordEntry(PPS),
        Buffer.from([ 0xff, 0xf8, 0xf8, 0x00 ]) ]), width: 1277 });
  });

  test("a stream that codes fields doubles its height and its vertical crop unit", () => {

    const sps = h264Sps(INTERLACED);

    assert.deepEqual(readH264Configuration([ sps, PPS ]), { codec: "h264", height: 564, label: "avc1.4d0016", level: 22, profile: 77,
      record: Buffer.concat([ Buffer.from([ 0x01, 0x4d, 0x00, 0x16, 0xff, 0xe1 ]), recordEntry(sps), Buffer.from([0x01]), recordEntry(PPS) ]), width: 720 });
  });

  test("picture order count type 1 steps over its offsets and its cycle", () => {

    const configuration = readH264Configuration([ h264Sps(ORDER_CYCLE), PPS ]);

    assert.deepEqual([ configuration.width, configuration.height, configuration.label ], [ 1152, 544, "avc1.4d0020" ]);
  });

  test("an SPS whose RBSP needs emulation prevention reads its fields with the escapes removed", () => {

    const sps = h264Sps(ESCAPED);
    const configuration = readH264Configuration([ sps, PPS ]);

    assert.equal(sps.length - 1, h264SpsRbsp(ESCAPED).length + 2);
    assert.deepEqual([ configuration.width, configuration.height, configuration.profile, configuration.level ], [ 1280, 720, 66, 32 ]);
  });

  test("refuses a set without an SPS, without a PPS, or with an empty unit", () => {

    const sps = h264Sps(BASELINE);

    assert.throws(() => readH264Configuration([PPS]), { constructor: ProtectProtocolError, message: /no sequence parameter set/ });
    assert.throws(() => readH264Configuration([sps]), { constructor: ProtectProtocolError, message: /no picture parameter set/ });
    assert.throws(() => readH264Configuration([ Buffer.alloc(0), sps, PPS ]), { constructor: ProtectProtocolError, message: /one-byte header/ });
  });

  test("refuses an SPS cut before its last field, and one naming a reserved chroma format", () => {

    const reserved = h264Sps({ ...HIGH, high: { bitDepthChromaMinus8: 0, bitDepthLumaMinus8: 0, chromaFormatIdc: 4 } });

    assert.throws(() => readH264Configuration([ h264Sps(BASELINE).subarray(0, 6), PPS ]), { constructor: ProtectProtocolError, message: /ends before its last field/ });
    assert.throws(() => readH264Configuration([ reserved, PPS ]), { constructor: ProtectProtocolError, message: /reserved chroma format/ });
  });

  test("refuses an SPS whose cropping leaves no picture, across or down", () => {

    // A grid of one macroblock, 16 by 16, cropped in 4:2:0's units of two samples: 8 at the left leaves a width of 0, 9 a width of -2, and 8 at the bottom a
    // height of 0.
    const crops = { bottom: { bottom: 8, left: 0, right: 0, top: 0 }, left: { bottom: 0, left: 8, right: 0, top: 0 }, past: { bottom: 0, left: 9, right: 0, top: 0 } };

    for(const [ name, crop ] of Object.entries(crops)) {

      assert.throws(() => readH264Configuration([ h264Sps({ ...BASELINE, crop, heightInMapUnitsMinus1: 0, widthInMbsMinus1: 0 }), PPS ]),
        { constructor: ProtectProtocolError, message: /leaves no picture/ }, name);
    }
  });

  test("refuses a parameter set too long for the record's 16-bit length, and more SPS or PPS than the record's count fields hold", () => {

    // A PPS padded to 65536 bytes, one past the 16-bit length, beside one of 65535, which it holds; 32 SPS, one past the five-bit count, beside 31, which it
    // holds; and 256 PPS, one past the eight-bit count.
    const sps = h264Sps(BASELINE);
    const padded = (length: number): Buffer => Buffer.concat([ PPS, Buffer.alloc(length - PPS.length) ]);

    assert.throws(() => readH264Configuration([ sps, padded(65536) ]), { constructor: ProtectProtocolError, message: /16-bit length/ });
    assert.doesNotThrow(() => readH264Configuration([ sps, padded(65535) ]));
    assert.throws(() => readH264Configuration([ ...Array<Buffer>(32).fill(sps), PPS ]), { constructor: ProtectProtocolError, message: /count fields/ });
    assert.equal(readH264Configuration([ ...Array<Buffer>(31).fill(sps), PPS ]).record.readUInt8(5), 0xff);
    assert.throws(() => readH264Configuration([ sps, ...Array<Buffer>(256).fill(PPS) ]), { constructor: ProtectProtocolError, message: /count fields/ });
  });
});

describe("splitH264Frame", () => {

  // An SEI and an IDR slice of a few synthetic bytes, and a non-IDR slice.
  const SEI = h264Unit(H264_SEI, Buffer.from([ 0x05, 0x01, 0xaa, 0x80 ]), 0);
  const IDR = h264Unit(H264_IDR, Buffer.from([ 0x88, 0x84, 0x21, 0xa0 ]));
  const SLICE = h264Unit(H264_NON_IDR, Buffer.from([ 0x9a, 0x02, 0x30 ]), 2);

  test("a keyframe's SPS and PPS become its parameter sets and its other units, each with its prefix, its sample, all views of the frame", () => {

    const sps = h264Sps(BASELINE);
    const frame = lengthPrefixed(sps, PPS, SEI, IDR);
    const parts = splitH264Frame(frame);

    assert.deepEqual(parts, { parameterSets: [ sps, PPS ], sample: [ lengthPrefixed(SEI), lengthPrefixed(IDR) ] });
    assert.ok([ ...parts.parameterSets, ...parts.sample ].every((part) => part.buffer === frame.buffer));
  });

  test("a frame with no parameter set is its sample alone", () => {

    assert.deepEqual(splitH264Frame(lengthPrefixed(SLICE)), { parameterSets: [], sample: [lengthPrefixed(SLICE)] });
  });

  test("refuses a frame whose length prefixes are malformed", () => {

    assert.throws(() => splitH264Frame(lengthPrefixed(IDR).subarray(0, 6)), ProtectProtocolError);
  });
});
