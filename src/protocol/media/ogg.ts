/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * ogg.ts: The Ogg Opus reader - an Ogg Opus stream's Opus packets, read incrementally from its pages.
 */

/**
 * The Ogg Opus reader: an Ogg Opus stream (RFC 7845) read incrementally into its Opus packets. This module is Layer 1: no I/O, no time, no side effects - bytes in,
 * packets out, or a {@link ProtectProtocolError} naming the fault.
 *
 * An Ogg stream is a run of pages (RFC 3533 § 6), each a 27-byte header, a segment table, and the segments the table lists, every field little-endian:
 *
 * | Byte offset | Field            | Bits | Values                                                                 |
 * |-------------|------------------|------|------------------------------------------------------------------------|
 * | 0-3         | capture pattern  | 32   | `OggS`                                                                 |
 * | 4           | version          | 8    | 0, not read                                                            |
 * | 5           | header type      | 8    | `01` continues a packet, `02` opens a stream, `04` ends one; not read  |
 * | 6-13        | granule position | 64   | not read                                                               |
 * | 14-17       | serial number    | 32   | the logical stream the page belongs to                                 |
 * | 18-21       | sequence number  | 32   | not read                                                               |
 * | 22-25       | CRC              | 32   | not checked                                                            |
 * | 26          | segment count    | 8    | how many lacing values the segment table holds                         |
 * | 27-         | segment table    |      | one lacing value per segment, 0 to 255                                 |
 *
 * A packet is the run of segments up to and including the first one shorter than 255 bytes, so a packet a page's last segment leaves open continues on the stream's
 * next page, and the lacing values alone say where each packet ends. An Ogg Opus stream opens with its `OpusHead` identification packet and then its `OpusTags`
 * comment packet, which may span pages, and every packet after them is one Opus packet (RFC 7845 § 3), which is what the reader answers.
 *
 * The reader is fed the stream in chunks cut anywhere, and answers the packets each chunk completes. It follows the first logical stream it meets, the one whose
 * serial number the first page carries, and reads past the pages of any other. A page whole within a chunk is read in place, a packet whole within a page is a view
 * into it, and a page a chunk's end cuts, or a packet a page's end leaves open, is held as a copy until what completes it arrives, so a chunk is never kept alive
 * for the few bytes the next one completes. Page CRCs are not checked, because the reader's input is a local pipe or file rather than a lossy channel. A page that
 * does not open with the capture pattern, or a stream whose first packet is not `OpusHead`, is refused: there is no resynchronization, because a stream that has
 * lost its framing cannot be trusted again.
 *
 * @module ProtectOgg
 */
import { ProtectProtocolError, assertNever } from "../../shared/errors.ts";
import { asBuffer } from "../buffer.ts";

// The capture pattern every page opens with, and the identification and comment packets' magic signatures.
const CAPTURE_PATTERN = Buffer.from("OggS", "latin1");
const OPUS_HEAD = Buffer.from("OpusHead", "latin1");
const OPUS_TAGS = Buffer.from("OpusTags", "latin1");

// The page header's fields at fixed offsets, and its length ahead of the segment table.
const PageOffset = {

  SEGMENT_COUNT: 26,
  SERIAL: 14
} as const;

const PAGE_HEADER_SIZE = 27;

// The lacing value of a segment a packet continues past: a segment shorter than this ends its packet.
const LACING_CONTINUES = 255;

// What the reader holds when no page is cut and no packet left open, shared so a chunk that ends on a page's boundary allocates nothing.
const NOTHING_HELD = Buffer.alloc(0);

// Where the reader is in the stream: awaiting its identification packet, then its comment packet, then reading audio.
type Phase = "audio" | "head" | "tags";

/**
 * An incremental reader of an Ogg Opus stream. The stream's chunks are pushed as they arrive, cut anywhere, and each push answers the Opus packets that chunk
 * completes. One reader serves one stream, carrying a page a chunk cuts into the next chunk; after a refusal the stream's framing cannot be trusted, so its caller
 * ends the stream rather than pushing more.
 *
 * @category Codec
 */
export class OggOpusReader {

  // The bytes of a page an earlier chunk's end cut, held as a copy; the segments of a packet an earlier page left open, each held as a copy; where the reader is in
  // the stream; and the serial number of the stream it follows, null until the first page arrives.
  #held: Buffer = NOTHING_HELD;
  #open: Buffer[] = [];
  #phase: Phase = "head";
  #serial: number | null = null;

  /**
   * Read the Opus packets a chunk of the stream completes.
   *
   * @param chunk - The stream's next bytes, cut anywhere. Accepts any `Uint8Array` (a `Buffer` included) and reads it without copying.
   *
   * @returns Every Opus packet the chunk completes, in stream order, the identification and comment packets read past.
   *
   * @throws {@link ProtectProtocolError} if a page does not open with the `OggS` capture pattern, or the stream's first packet is not `OpusHead`.
   */
  push(chunk: Uint8Array): Buffer[] {

    const bytes = (this.#held.length === 0) ? asBuffer(chunk) : Buffer.concat([ this.#held, chunk ]);
    const packets: Buffer[] = [];
    let offset = 0;

    for(;;) {

      const length = pageLength(bytes, offset);

      if((length === undefined) || (length > (bytes.length - offset))) {

        break;
      }

      this.#readPage(bytes.subarray(offset, offset + length), packets);
      offset += length;
    }

    this.#held = (offset === bytes.length) ? NOTHING_HELD : Buffer.from(bytes.subarray(offset));

    return packets;
  }

  // Read one whole page of the followed stream into the packets it completes, holding the segments of a packet it leaves open. A page of another stream is read past.
  #readPage(page: Buffer, packets: Buffer[]): void {

    const serial = page.readUInt32LE(PageOffset.SERIAL);

    this.#serial ??= serial;

    if(serial !== this.#serial) {

      return;
    }

    const segments = page.readUInt8(PageOffset.SEGMENT_COUNT);
    let start = PAGE_HEADER_SIZE + segments;
    let end = start;

    for(let index = 0; index < segments; index++) {

      const lacing = page.readUInt8(PAGE_HEADER_SIZE + index);

      end += lacing;

      if(lacing === LACING_CONTINUES) {

        continue;
      }

      // The packet ends with this segment: a view into the page when it lies whole within it, else joined with the segments earlier pages held.
      const tail = page.subarray(start, end);

      this.#emit((this.#open.length === 0) ? tail : Buffer.concat([ ...this.#open, tail ]), packets);
      this.#open = [];
      start = end;
    }

    if(start < end) {

      this.#open.push(Buffer.from(page.subarray(start, end)));
    }
  }

  // Answer a whole packet by where the reader is in the stream: the identification packet is required first and read past, the comment packet that follows it is
  // read past, and every packet after them is an Opus packet.
  #emit(packet: Buffer, packets: Buffer[]): void {

    switch(this.#phase) {

      case "audio":

        packets.push(packet);

        return;

      case "head":

        if(!opens(packet, OPUS_HEAD)) {

          throw new ProtectProtocolError("Ogg stream does not open with an OpusHead packet, so it is not an Ogg Opus stream.");
        }

        this.#phase = "tags";

        return;

      case "tags":

        this.#phase = "audio";

        if(!opens(packet, OPUS_TAGS)) {

          packets.push(packet);
        }

        return;

      default:

        // Exhaustiveness guard. A new phase joining the union without a case above stops `this.#phase` being `never` here, and this fails to compile.
        assertNever(this.#phase);
    }
  }
}

// The length of the page that opens at `offset` - its header, its segment table and its segments - or undefined while the bytes so far cannot hold its header and
// table. The capture pattern is refused as soon as its bytes arrive, so a stream that lost its framing is refused at the first byte that shows it.
function pageLength(bytes: Buffer, offset: number): number | undefined {

  const available = bytes.length - offset;
  const pattern = Math.min(available, CAPTURE_PATTERN.length);

  if(bytes.compare(CAPTURE_PATTERN, 0, pattern, offset, offset + pattern) !== 0) {

    throw new ProtectProtocolError("Ogg stream lost its framing: a page does not open with the OggS capture pattern.");
  }

  if(available <= PageOffset.SEGMENT_COUNT) {

    return undefined;
  }

  const segments = bytes.readUInt8(offset + PageOffset.SEGMENT_COUNT);
  const headerLength = PAGE_HEADER_SIZE + segments;

  if(available < headerLength) {

    return undefined;
  }

  let length = headerLength;

  for(let index = 0; index < segments; index++) {

    length += bytes.readUInt8(offset + PAGE_HEADER_SIZE + index);
  }

  return length;
}

// Whether a packet opens with a magic signature.
function opens(packet: Buffer, magic: Buffer): boolean {

  return (packet.length >= magic.length) && (packet.compare(magic, 0, magic.length, 0, magic.length) === 0);
}
