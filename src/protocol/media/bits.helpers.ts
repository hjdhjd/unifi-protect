/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * bits.helpers.ts: Test-only bit writer and emulation prevention, so the media suites build parameter sets from stated field values rather than by hand.
 *
 * The writer is the mirror image of the bit reader in `bits.ts`: it packs fields most significant bit first and codes the Exp-Golomb forms H.264 § 9.1 states, so a
 * fixture names each field's value and the reader under test reads it back. It restates the coding apart from the reader, so a coding error on either side fails a
 * row rather than cancelling out.
 */

// The writer of a bit string, field by field. Each write appends to the string, and the buffer it yields pads the last byte with zero bits.
export class BitWriter {

  readonly #bits: number[] = [];

  // Append `value` as `bits` bits, most significant first. Values up to 2 ** 53 are written exactly.
  write(bits: number, value: number): this {

    for(let bit = bits - 1; bit >= 0; bit--) {

      this.#bits.push(Math.floor(value / (2 ** bit)) % 2);
    }

    return this;
  }

  // Append an unsigned Exp-Golomb code: as many zero bits as the binary form of `value + 1` has bits after its first, then that binary form.
  writeUe(value: number): this {

    const coded = value + 1;
    const width = Math.floor(Math.log2(coded)) + 1;

    return this.write(width - 1, 0).write(width, coded);
  }

  // Append a signed Exp-Golomb code: a positive value v as code number 2v - 1, and zero or a negative value v as -2v.
  writeSe(value: number): this {

    return this.writeUe((value > 0) ? ((2 * value) - 1) : (-2 * value));
  }

  // Append the RBSP trailing bits: a one bit, then zero bits up to the next byte boundary.
  writeTrailingBits(): this {

    this.write(1, 1);

    while((this.#bits.length % 8) !== 0) {

      this.#bits.push(0);
    }

    return this;
  }

  // The bit string as bytes, the last byte padded with zero bits.
  toBuffer(): Buffer {

    const bytes = Buffer.alloc(Math.ceil(this.#bits.length / 8));

    for(const [ index, bit ] of this.#bits.entries()) {

      bytes[index >> 3] = (bytes[index >> 3] ?? 0) | (bit << (7 - (index & 7)));
    }

    return bytes;
  }
}

// Insert the emulation prevention bytes an encoder writes into a NAL unit's payload (H.264 § 7.4.1, H.265 § 7.4.2): a `03` after every two zero bytes that a byte of 3
// or less follows, the count of zeros starting over after each insertion.
export function addEmulationPrevention(rbsp: Buffer): Buffer {

  const escaped: number[] = [];
  let zeros = 0;

  for(const byte of rbsp) {

    if((zeros === 2) && (byte <= 3)) {

      escaped.push(3);
      zeros = 0;
    }

    escaped.push(byte);
    zeros = (byte === 0) ? (zeros + 1) : 0;
  }

  return Buffer.from(escaped);
}
