/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * bits.ts: The big-endian bit reader the media group shares for the packed fields of a codec configuration, with its Exp-Golomb reads and the removal of
 * emulation prevention from a NAL unit.
 */

/**
 * The big-endian bit reader the media group shares. This module is Layer 1: no I/O, no time, no side effects - bytes in, values out. A codec configuration packs
 * its fields at bit granularity, each field's width fixed by the format or by a field read before it, so a reader walks the configuration one field at a time. A
 * five-bit field `a`, then a four-bit field `b` crossing into the next byte, then the field `c` that follows, lie as:
 *
 * ```
 * byte     0                  1
 * bit      7 6 5 4 3 2 1 0    7 6 5 4 3 2 1 0
 * field    a a a a a b b b    b c c c c c c c
 * ```
 *
 * Bits are read most significant first, from the first byte of a span to its last. The H.264 and H.265 parameter sets add the Exp-Golomb codes of H.264 § 9.1,
 * a run of zero bits, a one bit, then as many value bits as the run held zeros:
 *
 * ```
 * 1          ue 0    se 0
 * 010        ue 1    se 1
 * 011        ue 2    se -1
 * 00100      ue 3    se 2
 * 0001000    ue 7    se 4
 * ```
 *
 * A NAL unit carries its fields with emulation prevention (H.264 § 7.3.1, H.265 § 7.3.1.1): wherever two zero bytes would be followed by a byte of 3 or less, the
 * encoder inserts a `03` after the two zeros, so no start code appears inside a unit. A reader removes those bytes before it reads a field.
 *
 * @module ProtectBits
 */
import type { Span } from "./boxes.ts";

// The byte an encoder inserts after two zero bytes, and the run of zero bytes it follows.
const EMULATION_PREVENTION_BYTE = 0x03;
const EMULATION_PREVENTION_ZEROS = 2;

// The longest run of leading zeros an Exp-Golomb code may carry. Thirty-one zeros reach code number 2 ** 32 - 2, which spans the widest field the parameter sets
// code this way, a signed 32-bit offset.
const EXP_GOLOMB_MAX_ZEROS = 31;

/* A big-endian bit reader over a span, for packed fields.
 *
 * A read that runs past the span answers zero and marks the reader overrun, rather than answering undefined at each call: a structure's later fields depend on its
 * earlier ones, so a caller reads the whole structure and checks `overrun` once, and turns an overrun into whatever its contract makes of a structure that is cut
 * short - an unknown description for a reader that never throws, a refusal for one that does.
 */
export class BitReader {

  readonly #bytes: Buffer;
  readonly #end: number;
  #overrun = false;
  #position: number;

  constructor(bytes: Buffer, span: Span) {

    this.#bytes = bytes;
    this.#end = span.end * 8;
    this.#position = span.start * 8;
  }

  // Whether any read ran past the span.
  get overrun(): boolean {

    return this.#overrun;
  }

  // Read the next `bits` bits as an unsigned integer, most significant bit first.
  read(bits: number): number {

    if((this.#position + bits) > this.#end) {

      this.#overrun = true;
      this.#position = this.#end;

      return 0;
    }

    let value = 0;

    for(let index = 0; index < bits; index++) {

      const bit = (this.#bytes.readUInt8(this.#position >> 3) >> (7 - (this.#position & 7))) & 1;

      value = (value * 2) + bit;
      this.#position++;
    }

    return value;
  }

  // Read an unsigned Exp-Golomb code, `ue(v)`: the zero bits up to the first one bit, then as many value bits, answering `2 ** zeros - 1` plus those bits. A code
  // carrying more than 31 leading zeros, or running past the span, answers zero and marks the reader overrun.
  readUe(): number {

    let zeros = 0;

    // A run past the span reads as zeros forever, so the overrun ends the count as surely as the cap does.
    while(this.read(1) === 0) {

      if(this.#overrun || (++zeros > EXP_GOLOMB_MAX_ZEROS)) {

        this.#overrun = true;

        return 0;
      }
    }

    const value = (2 ** zeros) - 1 + this.read(zeros);

    return this.#overrun ? 0 : value;
  }

  // Read a signed Exp-Golomb code, `se(v)`: an unsigned code number k mapped to `(k + 1) / 2` when odd and to `-(k / 2)` when even, and answering zero with the
  // reader overrun as the unsigned read does.
  readSe(): number {

    const code = this.readUe();

    // Code number 0 maps to 0 itself, never to the -0 the even rule's negation would make of it.
    if(code === 0) {

      return 0;
    }

    return ((code % 2) === 1) ? ((code + 1) / 2) : -(code / 2);
  }

  // Step over the next `bits` bits.
  skip(bits: number): void {

    this.read(bits);
  }
}

/**
 * Remove the emulation prevention bytes from a NAL unit's payload: each `03` that follows two zero bytes of the input is dropped, and the count of zeros starts over
 * after it, so `00 00 03 03` keeps its second `03`.
 *
 * @param unit - The payload of a NAL unit, past its header.
 *
 * @returns The payload as its fields are read, the input itself when it holds no emulation prevention byte and a new buffer otherwise.
 *
 * @category Codec
 */
export function removeEmulationPrevention(unit: Buffer): Buffer {

  const dropped: number[] = [];
  let zeros = 0;

  for(let index = 0; index < unit.length; index++) {

    const byte = unit.readUInt8(index);

    if((zeros >= EMULATION_PREVENTION_ZEROS) && (byte === EMULATION_PREVENTION_BYTE)) {

      dropped.push(index);
      zeros = 0;

      continue;
    }

    zeros = (byte === 0) ? (zeros + 1) : 0;
  }

  if(dropped.length === 0) {

    return unit;
  }

  const payload = Buffer.alloc(unit.length - dropped.length);
  let from = 0;
  let to = 0;

  for(const index of dropped) {

    to += unit.copy(payload, to, from, index);
    from = index + 1;
  }

  unit.copy(payload, to, from);

  return payload;
}
