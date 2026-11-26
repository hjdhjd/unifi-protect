/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * boxes.ts: The ISO base media file format box primitives the media group shares - the bounded box walk and field readers, and the box and field writers.
 */

/**
 * The ISO base media file format box primitives the media group shares. This module is Layer 1: no I/O, no time, no side effects - bytes in, boxes and fields out,
 * and values in, bytes out. The readers walk a box tree within a span and read each field bounded by the span holding it; the writers compose a box from its type
 * and its payloads, or write a header or a field in place into a buffer a caller has sized for the whole of what it writes.
 *
 * Every box opens with a header, and a full box adds a version and flags ahead of its payload:
 *
 * ```
 * size        u32    the whole box in bytes, its header included; 0 runs the box to its parent's end, and 1 defers to the largesize
 * type        4cc    the box's four-character type
 * largesize   u64    present only when size reads 1: the whole box in bytes, its 16-byte header included
 * version     u8     full boxes only: the layout version of the payload that follows
 * flags       u24    full boxes only: the payload's flags
 * ```
 *
 * Offsets are counted from a box's payload, past its header, and every field is big-endian.
 *
 * @module ProtectBoxes
 */

// A byte range within any buffer the media group reads, from `start` up to `end`: a box's payload, a descriptor's body, a NAL unit, an OBU. Every field a reader
// takes is bounded by the range holding it.
export interface Span {

  readonly end: number;
  readonly start: number;
}

// One box: its four-character type and the span of its payload, which begins past the 8- or 16-byte header and ends at the box's end clamped to its parent's, and
// whether that clamp cut the box short.
export interface Box extends Span {

  readonly clamped: boolean;
  readonly type: string;
}

// A box header's two sizes: the compact form carries a 32-bit size and the type, and a size of 1 adds a 64-bit `largesize` after the type.
export const BOX_HEADER_SIZE = 8;
export const LARGE_BOX_HEADER_SIZE = 16;

// A full box's header: the compact header, then the version byte and 24 bits of flags.
export const FULL_BOX_HEADER_SIZE = 12;

// The declared sizes that carry a meaning of their own: zero runs the box to the end of its parent, and one defers to the 64-bit `largesize`.
export const BoxSize = {

  LARGE: 1,
  TO_END: 0
} as const;

// Iterate the boxes within a span. A size of one reads the 64-bit `largesize`, a size of zero runs to the span's end, a size past the span's end is clamped to it and
// the box still yielded marked as clamped, and a size smaller than its own header, or a header the span cannot hold, ends the walk.
export function *children(bytes: Buffer, parent: Span): Generator<Box> {

  let offset = parent.start;

  while((parent.end - offset) >= BOX_HEADER_SIZE) {

    const declared = bytes.readUInt32BE(offset);
    const type = bytes.toString("latin1", offset + 4, offset + 8);

    let headerSize = BOX_HEADER_SIZE;
    let size = declared;

    if(declared === BoxSize.TO_END) {

      size = parent.end - offset;
    } else if(declared === BoxSize.LARGE) {

      if((parent.end - offset) < LARGE_BOX_HEADER_SIZE) {

        return;
      }

      headerSize = LARGE_BOX_HEADER_SIZE;
      size = readUInt64(bytes, offset + BOX_HEADER_SIZE);
    }

    if(size < headerSize) {

      return;
    }

    const end = Math.min(offset + size, parent.end);

    yield { clamped: (offset + size) > parent.end, end, start: offset + headerSize, type };

    offset = end;
  }
}

// The first child box of a type within a span, or undefined when the span is absent or holds none.
export function findChild(bytes: Buffer, parent: Span | undefined, type: string): Box | undefined {

  if(parent === undefined) {

    return undefined;
  }

  for(const box of children(bytes, parent)) {

    if(box.type === type) {

      return box;
    }
  }

  return undefined;
}

// Read an unsigned big-endian integer `width` bytes wide at `offset` within a span, or undefined when the span is absent or the field runs past its end. The read
// is bounded by its span before it is made, so it never throws: a reader that never throws carries the undefined through to its description, and a reader that
// refuses a malformed input turns it into its refusal.
export function readUInt(bytes: Buffer, span: Span | undefined, offset: number, width: 1 | 2 | 4): number | undefined {

  if((span === undefined) || ((span.start + offset + width) > span.end)) {

    return undefined;
  }

  return bytes.readUIntBE(span.start + offset, width);
}

// Read a four-character code at `offset` within a span, or undefined when the span is absent or the code runs past its end.
export function readFourCc(bytes: Buffer, span: Span | undefined, offset: number): string | undefined {

  if((span === undefined) || ((span.start + offset + 4) > span.end)) {

    return undefined;
  }

  return bytes.toString("latin1", span.start + offset, span.start + offset + 4);
}

/**
 * Read an unsigned big-endian 64-bit field as a number: the 32-bit half at `offset` times 2 ** 32, plus the half after it. The read is exact for every value up to
 * 2 ** 53, far past any timestamp or size the media group reads, so a caller needs no `bigint`.
 *
 * @param bytes - The bytes holding the field.
 * @param offset - Where the field begins. The caller bounds the read, so the eight bytes from `offset` lie within `bytes`.
 *
 * @returns The field's value.
 *
 * @category Codec
 */
export function readUInt64(bytes: Buffer, offset: number): number {

  return (bytes.readUInt32BE(offset) * (2 ** 32)) + bytes.readUInt32BE(offset + 4);
}

/**
 * Write a box's header in place: its 32-bit size, then its four-character type.
 *
 * @param target - The buffer the box is written into, sized by the caller for the whole box.
 * @param offset - Where the box begins.
 * @param header - The box's whole size in bytes, its header included, and its type.
 *
 * @returns The offset past the header, where the box's payload begins.
 *
 * @category Codec
 */
export function writeBoxHeader(target: Buffer, offset: number, header: { readonly size: number; readonly type: string }): number {

  target.writeUInt32BE(header.size, offset);
  target.write(header.type, offset + 4, 4, "latin1");

  return offset + BOX_HEADER_SIZE;
}

/**
 * Write a full box's header in place: the compact header, then the version byte and 24 bits of flags.
 *
 * @param target - The buffer the box is written into, sized by the caller for the whole box.
 * @param offset - Where the box begins.
 * @param header - The box's flags, its whole size in bytes with its header included, its type, and its version.
 *
 * @returns The offset past the header, where the box's payload begins.
 *
 * @category Codec
 */
export function writeFullBoxHeader(target: Buffer, offset: number,
  header: { readonly flags: number; readonly size: number; readonly type: string; readonly version: number }): number {

  const versionOffset = writeBoxHeader(target, offset, header);

  target.writeUInt8(header.version, versionOffset);
  target.writeUIntBE(header.flags, versionOffset + 1, 3);

  return offset + FULL_BOX_HEADER_SIZE;
}

/**
 * Write an unsigned big-endian 64-bit field in place from a number, as its two 32-bit halves: `value` over 2 ** 32, then `value` modulo 2 ** 32.
 *
 * @param target - The buffer the field is written into.
 * @param offset - Where the field begins.
 * @param value - A whole number from 0 up to 2 ** 53.
 *
 * @returns The offset past the field.
 *
 * @category Codec
 */
export function writeUInt64(target: Buffer, offset: number, value: number): number {

  target.writeUInt32BE(Math.floor(value / (2 ** 32)), offset);

  return target.writeUInt32BE(value % (2 ** 32), offset + 4);
}

// A plain box: a 32-bit size covering the 8-byte header and the payloads, then the four-character type, then the payloads in order.
export function box(type: string, ...payloads: Uint8Array[]): Buffer {

  const header = Buffer.alloc(BOX_HEADER_SIZE);

  writeBoxHeader(header, 0, { size: BOX_HEADER_SIZE + byteLength(payloads), type });

  return Buffer.concat([ header, ...payloads ]);
}

// A full box: a plain box whose payload opens with a version byte and 24 bits of flags.
export function fullBox(type: string, version: number, flags: number, ...payloads: Uint8Array[]): Buffer {

  const header = Buffer.alloc(FULL_BOX_HEADER_SIZE);

  writeFullBoxHeader(header, 0, { flags, size: FULL_BOX_HEADER_SIZE + byteLength(payloads), type, version });

  return Buffer.concat([ header, ...payloads ]);
}

// Big-endian unsigned fields of each width the boxes use.
export function u8(value: number): Buffer {

  return Buffer.from([value]);
}

export function u16(value: number): Buffer {

  const field = Buffer.alloc(2);

  field.writeUInt16BE(value, 0);

  return field;
}

export function u32(value: number): Buffer {

  const field = Buffer.alloc(4);

  field.writeUInt32BE(value, 0);

  return field;
}

// A 16.16 fixed-point field, the form `tkhd` and the audio sample entry write their dimensions and sample rate in.
export function fixed16(value: number): Buffer {

  return u32(value * 65536);
}

// The payloads' total length in bytes.
function byteLength(payloads: readonly Uint8Array[]): number {

  return payloads.reduce((length, payload) => length + payload.length, 0);
}
