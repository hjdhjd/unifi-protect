/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * boxes.test.ts: Tests for the shared box primitives - the box walk over plain and 64-bit headers, the bounded field readers, and the box and field writers.
 */
import { BOX_HEADER_SIZE, BoxSize, LARGE_BOX_HEADER_SIZE, box, children, findChild, fixed16, fullBox, readFourCc, readUInt, readUInt64, u16, u32, u8,
  writeBoxHeader, writeFullBoxHeader, writeUInt64 } from "./boxes.ts";
import { describe, test } from "node:test";
import assert from "node:assert/strict";

describe("box walk", () => {

  test("children yields each box in a span with the span of its payload", () => {

    // A `free` box with a 3-byte payload, then a `skip` box with none, at offsets 0 and 11 of a 19-byte span.
    const bytes = Buffer.concat([ box("free", Buffer.from([ 1, 2, 3 ])), box("skip") ]);

    assert.deepEqual([...children(bytes, { end: bytes.length, start: 0 })], [

      { clamped: false, end: 11, start: BOX_HEADER_SIZE, type: "free" },
      { clamped: false, end: 19, start: 11 + BOX_HEADER_SIZE, type: "skip" }
    ]);
  });

  test("a 64-bit box followed by a sibling reads back as two boxes", () => {

    // A `wide` box whose 32-bit size reads 1 and whose 64-bit `largesize` reads 20, its 16-byte header and a 4-byte payload, then an empty `next` box.
    const wide = Buffer.concat([ u32(BoxSize.LARGE), Buffer.from("wide", "latin1"), u32(0), u32(LARGE_BOX_HEADER_SIZE + 4), Buffer.from([ 9, 9, 9, 9 ]) ]);
    const bytes = Buffer.concat([ wide, box("next") ]);

    assert.deepEqual([...children(bytes, { end: bytes.length, start: 0 })], [

      { clamped: false, end: 20, start: LARGE_BOX_HEADER_SIZE, type: "wide" },
      { clamped: false, end: 28, start: 28, type: "next" }
    ]);
  });

  test("findChild answers the first box of a type, and undefined for an absent span or type", () => {

    const bytes = Buffer.concat([ box("free"), box("moov", Buffer.from([7])), box("moov") ]);
    const span = { end: bytes.length, start: 0 };

    assert.deepEqual(findChild(bytes, span, "moov"), { clamped: false, end: 17, start: 16, type: "moov" });
    assert.equal(findChild(bytes, span, "trak"), undefined);
    assert.equal(findChild(bytes, undefined, "moov"), undefined);
  });
});

describe("bounded field readers", () => {

  test("readUInt reads a big-endian field of each width within its span, and undefined past its end or without a span", () => {

    const bytes = Buffer.from([ 0xff, 0x01, 0x02, 0x03, 0x04, 0x05 ]);
    const span = { end: 6, start: 1 };

    assert.equal(readUInt(bytes, span, 0, 1), 0x01);
    assert.equal(readUInt(bytes, span, 1, 2), 0x0203);
    assert.equal(readUInt(bytes, span, 1, 4), 0x02030405);
    assert.equal(readUInt(bytes, span, 2, 4), undefined);
    assert.equal(readUInt(bytes, undefined, 0, 1), undefined);
  });

  test("readFourCc reads a four-character code within its span, and undefined past its end or without a span", () => {

    const bytes = Buffer.from("xxsounyy", "latin1");
    const span = { end: 7, start: 2 };

    assert.equal(readFourCc(bytes, span, 0), "soun");
    assert.equal(readFourCc(bytes, span, 2), undefined);
    assert.equal(readFourCc(bytes, undefined, 0), undefined);
  });

  test("readUInt64 reads a 64-bit field across its two 32-bit halves, exactly up to 2 ** 53", () => {

    // A marker byte, then 2 ** 32 (high half 1, low half 0), then 2 ** 53 - 1 (high half 0x1fffff, low half all ones), then 5 in the low half alone.
    const bytes = Buffer.from([ 0xee, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0x1f, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0, 0, 0, 0, 0, 0, 0, 5 ]);

    assert.equal(readUInt64(bytes, 1), 2 ** 32);
    assert.equal(readUInt64(bytes, 9), Number.MAX_SAFE_INTEGER);
    assert.equal(readUInt64(bytes, 17), 5);
  });
});

describe("box and field writers", () => {

  test("box writes its size, its type and its payloads in order", () => {

    assert.deepEqual(box("abcd", Buffer.from([1]), Buffer.from([ 2, 3 ])), Buffer.from([ 0, 0, 0, 11, 0x61, 0x62, 0x63, 0x64, 1, 2, 3 ]));
  });

  test("fullBox opens its payload with the version byte and 24 bits of flags", () => {

    assert.deepEqual(fullBox("abcd", 1, 0x020304, Buffer.from([9])), Buffer.from([ 0, 0, 0, 13, 0x61, 0x62, 0x63, 0x64, 1, 2, 3, 4, 9 ]));
  });

  test("the unsigned field writers write big-endian fields of their width", () => {

    assert.deepEqual(u8(0xab), Buffer.from([0xab]));
    assert.deepEqual(u16(0x0102), Buffer.from([ 1, 2 ]));
    assert.deepEqual(u32(0x01020304), Buffer.from([ 1, 2, 3, 4 ]));
  });

  test("fixed16 writes a 16.16 fixed-point field", () => {

    assert.deepEqual(fixed16(300), Buffer.from([ 0x01, 0x2c, 0, 0 ]));
  });
});

describe("in-place writers", () => {

  test("writeBoxHeader and writeFullBoxHeader write a header at an offset and answer the offset past it", () => {

    // Two bytes of 0xee ahead of each header, so a header written at offset 0 would show.
    const plain = Buffer.alloc(10, 0xee);
    const full = Buffer.alloc(14, 0xee);

    assert.equal(writeBoxHeader(plain, 2, { size: 300, type: "abcd" }), 10);
    assert.deepEqual(plain, Buffer.from([ 0xee, 0xee, 0, 0, 0x01, 0x2c, 0x61, 0x62, 0x63, 0x64 ]));
    assert.equal(writeFullBoxHeader(full, 2, { flags: 0x020304, size: 20, type: "wxyz", version: 1 }), 14);
    assert.deepEqual(full, Buffer.from([ 0xee, 0xee, 0, 0, 0, 20, 0x77, 0x78, 0x79, 0x7a, 1, 2, 3, 4 ]));
  });

  test("writeUInt64 writes a number as its two 32-bit halves and answers the offset past them", () => {

    // 238163607510 is 55 times 2 ** 32 plus 0x73a83fd6, written one byte past a byte of 0xee.
    const field = Buffer.alloc(9, 0xee);

    assert.equal(writeUInt64(field, 1, 238163607510), 9);
    assert.deepEqual(field, Buffer.from([ 0xee, 0x00, 0x00, 0x00, 0x37, 0x73, 0xa8, 0x3f, 0xd6 ]));
    assert.equal(readUInt64(field, 1), 238163607510);
  });
});
