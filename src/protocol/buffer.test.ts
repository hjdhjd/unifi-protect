/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * buffer.test.ts: Unit tests for the buffer view - its bytes shared with the array it views rather than copied, and its bounds the view's own offset and length.
 */
import { describe, test } from "node:test";
import { asBuffer } from "./buffer.ts";
import assert from "node:assert/strict";

describe("asBuffer", () => {

  test("a view shares its bytes with the array it views, so a write through either shows in the other", () => {

    const array = new Uint8Array([ 1, 2, 3, 4 ]);
    const view = asBuffer(array);

    view[0] = 9;
    array[3] = 8;

    assert.deepEqual([...array], [ 9, 2, 3, 8 ]);
    assert.deepEqual([...view], [ 9, 2, 3, 8 ]);
    assert.equal(view.buffer, array.buffer);
  });

  test("a view of a subarray starts at the subarray's offset and runs its length", () => {

    // A subarray from the third byte of an eight-byte backing, four bytes long, so its offset, its length and the backing's length all differ.
    const backing = new Uint8Array([ 0, 1, 2, 3, 4, 5, 6, 7 ]);
    const view = asBuffer(backing.subarray(2, 6));

    assert.deepEqual([ view.byteOffset, view.length ], [ 2, 4 ]);
    assert.deepEqual([...view], [ 2, 3, 4, 5 ]);
    assert.equal(view.buffer, backing.buffer);
  });
});
