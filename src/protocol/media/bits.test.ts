/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * bits.test.ts: Tests for the shared bit reader - fields read most significant bit first across byte boundaries, the sticky overrun past a span's end, the
 * Exp-Golomb codes and their 31-zero limit - and for the removal of emulation prevention from a NAL unit.
 */
import { BitReader, removeEmulationPrevention } from "./bits.ts";
import { describe, test } from "node:test";
import assert from "node:assert/strict";

// A bit string written as text, packed most significant bit first and padded with zero bits to a whole byte, with a reader over all of it.
function readerOf(bits: string): BitReader {

  const bytes = Buffer.alloc(Math.ceil(bits.length / 8));

  for(let index = 0; index < bits.length; index++) {

    if(bits.charAt(index) === "1") {

      bytes[index >> 3] = (bytes[index >> 3] ?? 0) | (1 << (7 - (index & 7)));
    }
  }

  return new BitReader(bytes, { end: bytes.length, start: 0 });
}

describe("BitReader", () => {

  test("reads fields most significant bit first within its span, across byte boundaries, and steps over skipped bits", () => {

    // The span is bytes 1 and 2, `b5 3c`: 10110 (22), then 10 skipped, then 1001 (9) crossing into the second byte, then 11100 (28).
    const reader = new BitReader(Buffer.from([ 0xff, 0xb5, 0x3c, 0xff ]), { end: 3, start: 1 });

    assert.equal(reader.read(5), 22);
    reader.skip(2);
    assert.equal(reader.read(4), 9);
    assert.equal(reader.read(5), 28);
    assert.equal(reader.overrun, false);
  });

  test("a read past its span answers zero and leaves the reader overrun at the span's end", () => {

    // The span is the one byte `a5`, whose first bit is 1. A 9-bit read runs past it, and the 1-bit read after it answers zero too, because the overrun leaves the
    // reader at the span's end rather than at the bit it stopped on.
    const reader = new BitReader(Buffer.from([ 0xa5, 0xff ]), { end: 1, start: 0 });

    assert.equal(reader.read(9), 0);
    assert.equal(reader.overrun, true);
    assert.equal(reader.read(1), 0);
    assert.equal(reader.overrun, true);
  });

  test("readUe reads each unsigned Exp-Golomb code as its value, up to the 31 leading zeros of 2 ** 32 - 2", () => {

    const table: [ string, number ][] = [

      [ "1", 0 ], [ "010", 1 ], [ "011", 2 ], [ "00100", 3 ], [ "0001000", 7 ], [ "000000011111111", 254 ],
      [ "0".repeat(31) + "1" + "1".repeat(31), (2 ** 32) - 2 ]
    ];

    for(const [ bits, value ] of table) {

      const reader = readerOf(bits);

      assert.equal(reader.readUe(), value, bits);
      assert.equal(reader.overrun, false, bits);
    }
  });

  test("readSe maps code numbers 0 to 6 to 0, 1, -1, 2, -2, 3 and -3, code number 0 to 0 and never -0", () => {

    // Code numbers 0 to 6 in turn: 1, 010, 011, 00100, 00101, 00110, 00111.
    const reader = readerOf("1" + "010" + "011" + "00100" + "00101" + "00110" + "00111");

    assert.deepEqual([ 0, 1, 2, 3, 4, 5, 6 ].map(() => reader.readSe()), [ 0, 1, -1, 2, -2, 3, -3 ]);
    assert.equal(readerOf("1").readSe(), 0);
    assert.equal(Object.is(readerOf("1").readSe(), -0), false);
  });

  test("a code of 32 leading zeros reads as an overrun answering zero, though its one bit and value bits follow", () => {

    const reader = readerOf("0".repeat(32) + "1" + "1".repeat(32));

    assert.equal(reader.readUe(), 0);
    assert.equal(reader.overrun, true);
  });

  test("a code that runs past its span reads as an overrun answering zero, in its leading zeros or in its value bits", () => {

    // The one byte `00` holds eight zeros and no one bit; the one byte `08` holds four zeros and a one bit but only three of the four value bits.
    const zeros = new BitReader(Buffer.from([0x00]), { end: 1, start: 0 });
    const value = new BitReader(Buffer.from([0x08]), { end: 1, start: 0 });

    assert.equal(zeros.readUe(), 0);
    assert.equal(zeros.overrun, true);
    assert.equal(value.readUe(), 0);
    assert.equal(value.overrun, true);
  });
});

describe("removeEmulationPrevention", () => {

  test("drops each 03 that follows two zero bytes, the count of zeros starting over after it", () => {

    const table: [ number[], number[] ][] = [

      [ [ 0x00, 0x00, 0x03, 0x01 ], [ 0x00, 0x00, 0x01 ] ],
      [ [ 0x00, 0x00, 0x03, 0x00, 0x00, 0x03 ], [ 0x00, 0x00, 0x00, 0x00 ] ],
      [ [ 0x00, 0x00, 0x03 ], [ 0x00, 0x00 ] ],
      [ [ 0x00, 0x00, 0x03, 0x03 ], [ 0x00, 0x00, 0x03 ] ]
    ];

    for(const [ input, output ] of table) {

      assert.deepEqual(removeEmulationPrevention(Buffer.from(input)), Buffer.from(output), Buffer.from(input).toString("hex"));
    }
  });

  test("answers its input itself when the input holds no emulation prevention byte", () => {

    for(const input of [ Buffer.from([ 0x67, 0x42, 0x00, 0x1e ]), Buffer.from([ 0x00, 0x03 ]) ]) {

      assert.equal(removeEmulationPrevention(input), input);
    }
  });
});
