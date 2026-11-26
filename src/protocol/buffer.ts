/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * buffer.ts: The one view of a binary view's bytes as a Buffer, sharing its memory rather than copying it.
 */

/**
 * The buffer view: the one statement of reading a binary view's bytes as a `Buffer` without copying them.
 *
 * This module is Layer 1: no I/O, no time, no state, no dependency on anything else in the library. Every reader that takes a `Uint8Array` or another binary view
 * and wants `Buffer`'s readers and its zero-copy `subarray` over those bytes views them through this one function: the realtime codec's decoder, the UBV reader, the
 * init reader, the socket-message normalizer and the capture command's payload encoding. It is internal, and the barrel exports none of it.
 *
 * @module ProtectBuffer
 */

/**
 * View a binary view's bytes as a `Buffer` without copying them: a `Buffer` over the same memory, at the view's offset and for its length, so a write through
 * either shows in the other.
 *
 * A fresh `Buffer` object is made even for a view that is already a `Buffer`, so only that wrapper is new and every byte is shared. A `Buffer` held from here keeps
 * the whole memory beneath the view alive, the cost a zero-copy reader accepts.
 *
 * @param view - The bytes to view: any `ArrayBufferView`, a `Uint8Array` and a `Buffer` included.
 *
 * @returns A `Buffer` over exactly the view's bytes.
 *
 * @category Utilities
 */
export function asBuffer(view: ArrayBufferView): Buffer {

  return Buffer.from(view.buffer, view.byteOffset, view.byteLength);
}
