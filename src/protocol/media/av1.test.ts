/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * av1.test.ts: Tests for the AV1 reader - the facts, the av1C record and the label for each branch of the sequence header walk and of its color configuration, the
 * split of a temporal unit into its sequence header and its sample, and each refusal.
 */
import { AV1_FRAME, AV1_METADATA, av1SequenceHeader, av1SequenceHeaderPayload, obu, temporalDelimiter } from "./codecs.helpers.ts";
import { describe, test } from "node:test";
import { readAv1Configuration, splitAv1Frame } from "./av1.ts";
import type { Av1SequenceHeaderFields } from "./codecs.helpers.ts";
import { ProtectProtocolError } from "../../errors.ts";
import assert from "node:assert/strict";

// The record's first four bytes, then the sequence header OBU whole as its `configOBUs`.
function record(head: number[], sequenceHeader: Buffer): Buffer {

  return Buffer.concat([ Buffer.from(head), sequenceHeader ]);
}

// Main (profile 0) at level 4 (3.0), main tier, its maximum frame 1280 by 720, at 8 bits in 4:2:0 with no color description.
const PLAIN: Av1SequenceHeaderFields = { maxFrameHeightMinus1: 719, maxFrameWidthMinus1: 1279, operatingPoints: [{ idc: 0, level: 4 }] };

/* Main with timing info - a display tick of 1001 over a time scale of 60000, an equal picture interval of 3 ticks (minus 1: 2), and a decoder model whose delays
 * are 10 bits wide over a decoding tick of 1001 - and display delays announced. Operating point 0 (idc `103`) sits at level 12 (5.0) on the high tier with a decoder
 * buffer delay of 700, an encoder buffer delay of 300, low delay mode and an initial display delay of 4 (minus 1: 3); operating point 1 (idc `101`) at level 8 (4.0)
 * on the main tier with neither. Frame ids are present, the order hint takes 7 bits (minus 1: 6), and screen content tools are forced on with integer motion
 * vectors forced off. The maximum frame is 3840 by 2160 in fields of 13 and 12 bits, at 10 bits in 4:2:0 with the colocated sample position (2), described as
 * BT.2100 PQ: primaries 9, transfer 16 and matrix 9.
 */
const TIMED: Av1SequenceHeaderFields = { color: { chromaSamplePosition: 2, description: { matrix: 9, primaries: 9, transfer: 16 }, highBitdepth: 1 },
  displayDelays: true, forceIntegerMv: 0, forceScreenContentTools: 1, frameHeightBitsMinus1: 11, frameIds: { additionalMinus1: 2, deltaMinus2: 3 },
  frameWidthBitsMinus1: 12, maxFrameHeightMinus1: 2159, maxFrameWidthMinus1: 3839, operatingPoints: [ { decoderModel: { decoderBufferDelay: 700,
    encoderBufferDelay: 300, lowDelayMode: 1 }, idc: 0x103, initialDisplayDelayMinus1: 3, level: 12, tier: 1 }, { idc: 0x101, level: 8 } ], orderHintBitsMinus1: 6,
  timing: { decoderModel: { bufferDelayLengthMinus1: 9, bufferRemovalTimeLengthMinus1: 4, framePresentationTimeLengthMinus1: 5, numUnitsInDecodingTick: 1001 },
    numTicksPerPictureMinus1: 2, numUnitsInDisplayTick: 1001, timeScale: 60000 } };

// A reduced still picture header at level 6 (3.2), its maximum frame 1920 by 1080, at 8 bits in 4:2:0.
const REDUCED: Av1SequenceHeaderFields = { maxFrameHeightMinus1: 1079, maxFrameWidthMinus1: 1919, operatingPoints: [{ idc: 0, level: 6 }], reducedStillPicture: true };

describe("readAv1Configuration", () => {

  test("a plain header reads its level, size and depth and writes the short label", () => {

    const header = av1SequenceHeader(PLAIN);

    assert.deepEqual(readAv1Configuration([header]), { codec: "av1", height: 720, label: "av01.0.04M.08", level: 4, profile: 0,
      record: record([ 0x81, 0x04, 0x0c, 0x00 ], header), width: 1280 });
  });

  test("timing info with a decoder model over two operating points reads operating point 0's level and tier and writes the long label", () => {

    const header = av1SequenceHeader(TIMED);

    assert.deepEqual(readAv1Configuration([header]), { codec: "av1", height: 2160, label: "av01.0.12H.10.0.112.09.16.09.0", level: 12, profile: 0,
      record: record([ 0x81, 0x0c, 0xce, 0x00 ], header), width: 3840 });
  });

  test("a reduced still picture header reads its one level", () => {

    const header = av1SequenceHeader(REDUCED);

    assert.deepEqual(readAv1Configuration([header]), { codec: "av1", height: 1080, label: "av01.0.06M.08", level: 6, profile: 0,
      record: record([ 0x81, 0x06, 0x0c, 0x00 ], header), width: 1920 });
  });

  test("each color configuration branch reads its depth, subsampling and range into the record and the label", () => {

    // Monochrome at full range, screen content tools forced off; profile 1 described as sRGB (primaries 1, transfer 13, matrix 0), which codes 4:4:4 at full range;
    // profile 1 undescribed; profile 2 at 12 bits in 4:2:0 with the vertical sample position (1); profile 2 at 12 bits in 4:4:4; and profile 2 at 10 bits.
    const rows: [ Av1SequenceHeaderFields, string, number[] ][] = [

      [ { ...PLAIN, color: { colorRange: 1, monoChrome: 1 }, forceScreenContentTools: 0 }, "av01.0.04M.08.1.110.01.01.01.1", [ 0x81, 0x04, 0x1c, 0x00 ] ],
      [ { ...PLAIN, color: { description: { matrix: 0, primaries: 1, transfer: 13 } }, profile: 1 }, "av01.1.04M.08.0.000.01.13.00.1", [ 0x81, 0x24, 0x00, 0x00 ] ],
      [ { ...PLAIN, profile: 1 }, "av01.1.04M.08.0.000.01.01.01.0", [ 0x81, 0x24, 0x00, 0x00 ] ],
      [ { ...PLAIN, color: { chromaSamplePosition: 1, highBitdepth: 1, subsamplingX: 1, subsamplingY: 1, twelveBit: 1 }, profile: 2 },
        "av01.2.04M.12.0.111.01.01.01.0", [ 0x81, 0x44, 0x6d, 0x00 ] ],
      [ { ...PLAIN, color: { highBitdepth: 1, subsamplingX: 0, twelveBit: 1 }, profile: 2 }, "av01.2.04M.12.0.000.01.01.01.0", [ 0x81, 0x44, 0x60, 0x00 ] ],
      [ { ...PLAIN, color: { highBitdepth: 1 }, profile: 2 }, "av01.2.04M.10.0.100.01.01.01.0", [ 0x81, 0x44, 0x48, 0x00 ] ]
    ];

    for(const [ fields, label, head ] of rows) {

      const header = av1SequenceHeader(fields);
      const configuration = readAv1Configuration([header]);

      assert.deepEqual([ configuration.label, configuration.record, configuration.width, configuration.height ], [ label, record(head, header), 1280, 720 ], label);
    }
  });

  test("refuses a set without a sequence header and a sequence header without its size field", () => {

    assert.throws(() => readAv1Configuration([obu(AV1_FRAME, Buffer.from([0x10]))]), { constructor: ProtectProtocolError, message: /no sequence header OBU/ });
    assert.throws(() => readAv1Configuration([av1SequenceHeader(PLAIN, { sizeField: false })]), { constructor: ProtectProtocolError, message: /no size field/ });
  });

  test("refuses a profile above 2, a sequence header cut before its last field, and an empty unit", () => {

    const cut = obu(1, av1SequenceHeaderPayload(PLAIN).subarray(0, 3));

    assert.throws(() => readAv1Configuration([av1SequenceHeader({ ...PLAIN, profile: 3 })]), { constructor: ProtectProtocolError, message: /profile above 2/ });
    assert.throws(() => readAv1Configuration([cut]), { constructor: ProtectProtocolError, message: /ends before its last field/ });
    assert.throws(() => readAv1Configuration([Buffer.alloc(0)]), { constructor: ProtectProtocolError, message: /empty/ });
  });
});

describe("splitAv1Frame", () => {

  // A frame OBU of a few synthetic bytes, and a metadata OBU.
  const FRAME = obu(AV1_FRAME, Buffer.from([ 0x30, 0x2a, 0x7f, 0x01 ]));
  const METADATA = obu(AV1_METADATA, Buffer.from([ 0x04, 0x80 ]));

  test("a keyframe's sequence header becomes its parameter set and stays in its sample, its temporal delimiter dropped, all views of the unit", () => {

    const header = av1SequenceHeader(PLAIN);
    const unit = Buffer.concat([ temporalDelimiter(), header, METADATA, FRAME ]);
    const parts = splitAv1Frame(unit);

    assert.deepEqual(parts, { parameterSets: [header], sample: [ header, METADATA, FRAME ] });
    assert.ok([ ...parts.parameterSets, ...parts.sample ].every((part) => part.buffer === unit.buffer));
  });

  test("a temporal unit without a sequence header is its sample alone", () => {

    assert.deepEqual(splitAv1Frame(Buffer.concat([ temporalDelimiter(), FRAME ])), { parameterSets: [], sample: [FRAME] });
  });

  test("an OBU without its size field runs to the end, one with an extension byte reads past it, and a two-byte size reads both groups", () => {

    // A frame OBU with no size field; a frame OBU whose extension byte `28` names temporal id 1 and spatial id 1; and a frame OBU of 130 bytes behind the leb128
    // `82 01`, 2 in its low group and 1 in its next.
    const unsized = obu(AV1_FRAME, Buffer.from([ 0x10, 0x20, 0x30 ]), { sizeField: false });
    const extended = obu(AV1_FRAME, Buffer.from([ 0x40, 0x50 ]), { extension: 0x28 });
    const wide = Buffer.concat([ Buffer.from([ 0x32, 0x82, 0x01 ]), Buffer.alloc(130, 0x5a) ]);

    assert.deepEqual(splitAv1Frame(Buffer.concat([ temporalDelimiter(), unsized ])).sample, [unsized]);
    assert.deepEqual(splitAv1Frame(Buffer.concat([ extended, FRAME ])).sample, [ extended, FRAME ]);
    assert.deepEqual(splitAv1Frame(Buffer.concat([ wide, FRAME ])).sample, [ wide, FRAME ]);
  });

  test("refuses an OBU that sets its forbidden bit, ends inside its header or its size field, or runs past the end of its data", () => {

    // `b2` sets the forbidden bit over a frame OBU's type and size flag; `36` flags an extension byte the data lacks; `32 81` opens a size field whose next group is
    // missing; `32 05 01` declares 5 payload bytes over 1.
    assert.throws(() => splitAv1Frame(Buffer.from([ 0xb2, 0x00 ])), { constructor: ProtectProtocolError, message: /forbidden bit/ });
    assert.throws(() => splitAv1Frame(Buffer.from([0x36])), { constructor: ProtectProtocolError, message: /extension byte/ });
    assert.throws(() => splitAv1Frame(Buffer.from([ 0x32, 0x81 ])), { constructor: ProtectProtocolError, message: /size field/ });
    assert.throws(() => splitAv1Frame(Buffer.from([ 0x32, 0x05, 0x01 ])), { constructor: ProtectProtocolError, message: /runs past the end/ });
  });
});
