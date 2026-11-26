/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * h265.test.ts: Tests for the HEVC reader - the facts, the hvcC record and the label for each branch of the SPS walk, the split of a frame into its parameter sets
 * and its sample, and each refusal.
 */
import { H265_IDR_W_RADL, H265_PREFIX_SEI, H265_TRAIL_R, h265Pps, h265Sps, h265Unit, h265Vps, lengthPrefixed } from "./codecs.helpers.ts";
import { describe, test } from "node:test";
import { readH265Configuration, splitH265Frame } from "./h265.ts";
import type { H265SpsFields } from "./codecs.helpers.ts";
import { ProtectProtocolError } from "../../errors.ts";
import assert from "node:assert/strict";

// One of the record's arrays: the completeness bit over the type, a count of 1, then the unit behind its 16-bit length.
function recordArray(type: number, unit: Buffer): Buffer {

  return Buffer.concat([ Buffer.from([ 0x80 | type, 0x00, 0x01, unit.length >> 8, unit.length & 0xff ]), unit ]);
}

// The VPS and PPS every row pairs its SPS with, each id 0.
const VPS = h265Vps();
const PPS = h265Pps();

// Main (profile 1, compatible with Main and Main 10, the word `60 00 00 00`) at main tier, level 3.1 (93), with the progressive and frame-only constraint flags
// (`90`): 1280 by 736 in 4:2:0, its conformance window 1 left, 2 right, 3 top and 4 bottom in units of two samples, so 1274 by 722.
const MAIN: H265SpsFields = { compatibility: 0x60000000, conformanceWindow: { bottom: 4, left: 1, right: 2, top: 3 }, constraints: [ 0x90, 0, 0, 0, 0, 0 ],
  height: 736, levelIdc: 93, profileIdc: 1, width: 1280 };

/* Profile space 1 (`A`), high tier, profile 2 compatible with itself alone (`20 00 00 00`), level 6.1 (183), and the constraint bytes `b0 00 00 00 00 01`, over three
 * sub-layers whose temporal ids do not nest. Sub-layer 0 carries a profile of 11 bytes and the level `5a`, and sub-layer 1 the level `3c` alone, so the walk steps
 * over the six reserved slots' two bits each, 88 bits and 8, then 8. The picture is 3840 by 2160 in 4:2:0 at depths of 10 and 11 (minus 8: 2 and 3).
 */
const TIERED: H265SpsFields = { bitDepthChromaMinus8: 3, bitDepthLumaMinus8: 2, compatibility: 0x20000000, constraints: [ 0xb0, 0, 0, 0, 0, 0x01 ], height: 2160,
  levelIdc: 183, maxSubLayersMinus1: 2, profileIdc: 2, profileSpace: 1, subLayers: [ { level: 0x5a, profile: [ 0xa2, 0x40, 0, 0, 0, 0xb0, 0, 0, 0, 0, 0x5a ] },
    { level: 0x3c } ], temporalIdNesting: 0, tier: 1, width: 3840 };

// Format range extensions (profile 4, compatible with itself, `08 00 00 00`) at level 5 (150), 4:4:4 with each color plane coded apart, at depths of 12 (minus 8:
// 4): 1920 by 1088, its conformance window 1 left, 2 right, 3 top and 4 bottom in units of one sample, so 1917 by 1081.
const SEPARATE_PLANES: H265SpsFields = { bitDepthChromaMinus8: 4, bitDepthLumaMinus8: 4, chromaFormatIdc: 3, compatibility: 0x08000000,
  conformanceWindow: { bottom: 4, left: 1, right: 2, top: 3 }, constraints: [ 0x80, 0, 0, 0, 0, 0 ], height: 1088, levelIdc: 150, profileIdc: 4,
  separateColourPlane: 1, width: 1920 };

describe("readH265Configuration", () => {

  test("Main with a conformance window reads its windowed size and writes the compatibility word as read", () => {

    const sps = h265Sps(MAIN);

    assert.deepEqual(readH265Configuration([ VPS, sps, PPS ]), { codec: "h265", height: 722, label: "hvc1.1.6.L93.90", level: 93, profile: 1,
      record: Buffer.concat([ Buffer.from([ 0x01, 0x01, 0x60, 0x00, 0x00, 0x00, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00, 0x5d, 0xf0, 0x00, 0xfc, 0xfd, 0xf8, 0xf8, 0x00,
        0x00, 0x0f, 0x03 ]), recordArray(32, VPS), recordArray(33, sps), recordArray(34, PPS) ]), width: 1274 });
  });

  test("a profile space, a high tier and sub-layers read through the sub-layer fields, the label keeping a constraint byte past its zeros", () => {

    const vps = h265Vps({ maxSubLayersMinus1: 2 });
    const sps = h265Sps(TIERED);

    assert.deepEqual(readH265Configuration([ vps, sps, PPS ]), { codec: "h265", height: 2160, label: "hvc1.A2.4.H183.b0.0.0.0.0.1", level: 183, profile: 2,
      record: Buffer.concat([ Buffer.from([ 0x01, 0x62, 0x20, 0x00, 0x00, 0x00, 0xb0, 0x00, 0x00, 0x00, 0x00, 0x01, 0xb7, 0xf0, 0x00, 0xfc, 0xfd, 0xfa, 0xfb, 0x00,
        0x00, 0x1b, 0x03 ]), recordArray(32, vps), recordArray(33, sps), recordArray(34, PPS) ]), width: 3840 });
  });

  test("4:4:4 with a separate color plane reads the plane's flag and windows in units of one sample", () => {

    const sps = h265Sps(SEPARATE_PLANES);

    assert.deepEqual(readH265Configuration([ VPS, sps, PPS ]), { codec: "h265", height: 1081, label: "hvc1.4.10.L150.80", level: 150, profile: 4,
      record: Buffer.concat([ Buffer.from([ 0x01, 0x04, 0x08, 0x00, 0x00, 0x00, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x96, 0xf0, 0x00, 0xfc, 0xff, 0xfc, 0xfc, 0x00,
        0x00, 0x0f, 0x03 ]), recordArray(32, VPS), recordArray(33, sps), recordArray(34, PPS) ]), width: 1917 });
  });

  test("refuses a set without a VPS, without an SPS or without a PPS, and a unit shorter than its header", () => {

    const sps = h265Sps(MAIN);

    assert.throws(() => readH265Configuration([ sps, PPS ]), { constructor: ProtectProtocolError, message: /no video parameter set/ });
    assert.throws(() => readH265Configuration([ VPS, PPS ]), { constructor: ProtectProtocolError, message: /no sequence parameter set/ });
    assert.throws(() => readH265Configuration([ VPS, sps ]), { constructor: ProtectProtocolError, message: /no picture parameter set/ });
    assert.throws(() => readH265Configuration([ VPS, Buffer.from([0x42]), sps, PPS ]), { constructor: ProtectProtocolError, message: /two-byte header/ });
  });

  test("refuses an SPS of a layer other than the base layer, though its fields would read", () => {

    assert.throws(() => readH265Configuration([ VPS, h265Sps({ ...MAIN, layerId: 1 }), PPS ]), { constructor: ProtectProtocolError, message: /base layer/ });
  });

  test("refuses an SPS cut before its last field, and one naming a reserved chroma format", () => {

    assert.throws(() => readH265Configuration([ VPS, h265Sps(MAIN).subarray(0, 8), PPS ]), { constructor: ProtectProtocolError, message: /ends before its last field/ });
    assert.throws(() => readH265Configuration([ VPS, h265Sps({ ...MAIN, chromaFormatIdc: 4 }), PPS ]),
      { constructor: ProtectProtocolError, message: /reserved chroma format/ });
  });

  test("refuses an SPS that leaves no picture once its conformance window is applied, across or down", () => {

    // A picture of 16 by 16 in 4:2:0, its window in units of two samples: 8 at the left leaves a width of 0, 9 a width of -2, and 8 at the bottom a height of 0;
    // and a picture coded 0 samples across under an empty window.
    const windows = { bottom: { bottom: 8, left: 0, right: 0, top: 0 }, left: { bottom: 0, left: 8, right: 0, top: 0 }, past: { bottom: 0, left: 9, right: 0, top: 0 } };

    for(const [ name, conformanceWindow ] of Object.entries(windows)) {

      assert.throws(() => readH265Configuration([ VPS, h265Sps({ ...MAIN, conformanceWindow, height: 16, width: 16 }), PPS ]),
        { constructor: ProtectProtocolError, message: /leaves no picture/ }, name);
    }

    assert.throws(() => readH265Configuration([ VPS, h265Sps({ ...MAIN, conformanceWindow: { bottom: 0, left: 0, right: 0, top: 0 }, width: 0 }), PPS ]),
      { constructor: ProtectProtocolError, message: /leaves no picture/ });
  });

  test("refuses a parameter set too long for the record's 16-bit length, and more units of one type than an array's count holds", () => {

    // A PPS padded to 65536 bytes, one past the 16-bit length, beside one of 65535, which it holds; and 65536 PPS, one past the 16-bit count, beside 65535,
    // which it holds.
    const sps = h265Sps(MAIN);
    const padded = (length: number): Buffer => Buffer.concat([ PPS, Buffer.alloc(length - PPS.length) ]);

    assert.throws(() => readH265Configuration([ VPS, sps, padded(65536) ]), { constructor: ProtectProtocolError, message: /16-bit length/ });
    assert.doesNotThrow(() => readH265Configuration([ VPS, sps, padded(65535) ]));
    assert.throws(() => readH265Configuration([ VPS, sps, ...Array<Buffer>(65536).fill(PPS) ]), { constructor: ProtectProtocolError, message: /array count/ });
    assert.doesNotThrow(() => readH265Configuration([ VPS, sps, ...Array<Buffer>(65535).fill(PPS) ]));
  });
});

describe("splitH265Frame", () => {

  // A prefix SEI, two IDR slices and two trailing slices of a few synthetic bytes each.
  const SEI = h265Unit(H265_PREFIX_SEI, Buffer.from([ 0x01, 0x04, 0x11, 0x22, 0x33, 0x44, 0x80 ]));
  const IDR_TOP = h265Unit(H265_IDR_W_RADL, Buffer.from([ 0xaf, 0x08, 0x40 ]));
  const IDR_BOTTOM = h265Unit(H265_IDR_W_RADL, Buffer.from([ 0x26, 0x15, 0x90 ]));
  const TRAIL_TOP = h265Unit(H265_TRAIL_R, Buffer.from([ 0xd0, 0x04 ]));
  const TRAIL_BOTTOM = h265Unit(H265_TRAIL_R, Buffer.from([ 0x21, 0xe4 ]));

  test("a keyframe's VPS, SPS and PPS become its parameter sets and its other units, each with its prefix, its sample, all views of the frame", () => {

    const sps = h265Sps(MAIN);
    const frame = lengthPrefixed(VPS, sps, PPS, SEI, IDR_TOP, IDR_BOTTOM);
    const parts = splitH265Frame(frame);

    assert.deepEqual(parts, { parameterSets: [ VPS, sps, PPS ], sample: [ lengthPrefixed(SEI), lengthPrefixed(IDR_TOP), lengthPrefixed(IDR_BOTTOM) ] });
    assert.ok([ ...parts.parameterSets, ...parts.sample ].every((part) => part.buffer === frame.buffer));
  });

  test("a frame of slices alone is its sample", () => {

    assert.deepEqual(splitH265Frame(lengthPrefixed(TRAIL_TOP, TRAIL_BOTTOM)), { parameterSets: [], sample: [ lengthPrefixed(TRAIL_TOP), lengthPrefixed(TRAIL_BOTTOM) ] });
  });

  test("refuses a unit shorter than its two-byte header", () => {

    assert.throws(() => splitH265Frame(lengthPrefixed(Buffer.from([0x02]))), { constructor: ProtectProtocolError, message: /two-byte header/ });
  });
});
