/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * codecs.test.ts: Tests for the shared codec vocabulary - the walk of a length-prefixed frame and its refusals, the video sample entry map and the chroma
 * subsampling table.
 */
import { CHROMA_SUBSAMPLING, LENGTH_PREFIX_SIZE, VIDEO_FORMATS, lengthPrefixedUnits } from "./codecs.ts";
import { describe, test } from "node:test";
import { ProtectProtocolError } from "../../errors.ts";
import assert from "node:assert/strict";

describe("lengthPrefixedUnits", () => {

  test("answers each unit's span, its four-byte prefix just before it", () => {

    // A unit of 3 bytes behind `00 00 00 03`, then a unit of 1 byte behind `00 00 00 01`.
    const data = Buffer.from([ 0, 0, 0, 3, 0x65, 0x88, 0x80, 0, 0, 0, 1, 0x41 ]);
    const units = lengthPrefixedUnits(data);

    assert.deepEqual(units, [ { end: 7, start: 4 }, { end: 12, start: 11 } ]);
    assert.deepEqual(units.map(({ start }) => data.readUInt32BE(start - LENGTH_PREFIX_SIZE)), [ 3, 1 ]);
  });

  test("a frame of no bytes holds no unit", () => {

    assert.deepEqual(lengthPrefixedUnits(Buffer.alloc(0)), []);
  });

  test("refuses a prefix the frame cannot hold, a zero length, and a length past the frame's end", () => {

    // A whole unit, then three bytes where a four-byte prefix belongs; a prefix reading zero; a prefix reading 5 over the 4 bytes that follow it.
    assert.throws(() => lengthPrefixedUnits(Buffer.from([ 0, 0, 0, 1, 0x41, 0, 0, 0 ])), { constructor: ProtectProtocolError, message: /four-byte length/ });
    assert.throws(() => lengthPrefixedUnits(Buffer.from([ 0, 0, 0, 0, 0x41 ])), { constructor: ProtectProtocolError, message: /length reads zero/ });
    assert.throws(() => lengthPrefixedUnits(Buffer.from([ 0, 0, 0, 5, 1, 2, 3, 4 ])), { constructor: ProtectProtocolError, message: /runs past the frame's end/ });
  });
});

describe("codec vocabulary", () => {

  test("each video sample entry names its codec and the box holding its record, each codec's first entry carrying the parameter sets in the record", () => {

    assert.deepEqual([...VIDEO_FORMATS], [

      [ "av01", { codec: "av1", config: "av1C" } ],
      [ "avc1", { codec: "h264", config: "avcC" } ],
      [ "avc3", { codec: "h264", config: "avcC" } ],
      [ "hvc1", { codec: "h265", config: "hvcC" } ],
      [ "hev1", { codec: "h265", config: "hvcC" } ]
    ]);
  });

  test("each chroma format names its horizontal and vertical subsampling", () => {

    // 4:0:0, 4:2:0, 4:2:2 and 4:4:4.
    assert.deepEqual(CHROMA_SUBSAMPLING, [ [ 1, 1 ], [ 2, 2 ], [ 2, 1 ], [ 1, 1 ] ]);
  });
});
