/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * ubv.ts: The UBV reader - a livestream's record stream, read incrementally into media frames.
 */

/**
 * The UBV reader: a livestream's record stream, read incrementally into media frames. This module is Layer 1: no I/O, no time, no side effects - bytes in, frames
 * out, or a {@link ProtectProtocolError} naming the fault.
 *
 * The stream is a run of records, each a header, its payload padded with zero bytes to a four-byte boundary, and a 32-bit trailer counting the header and the padded
 * payload. A record's header is 20 bytes, or 16 when it carries no timestamp:
 *
 * | Byte offset | Field     | Bits | Values                                                                                                  |
 * |-------------|-----------|------|---------------------------------------------------------------------------------------------------------|
 * | 0           | marker    | 8    | `a0`                                                                                                    |
 * | 1-2         | track     | 16   | the track id                                                                                            |
 * | 3           | kind      | 8    | not read                                                                                                |
 * | 4           | flags     | 8    | `04` selects the 20-byte header, and `20` marks a keyframe                                              |
 * | 5-7         | code      | 24   | a per-track code and counter, not read                                                                  |
 * | 8-15        | timestamp | 64   | the 20-byte header: ticks at the track's clock, read as two 32-bit halves                               |
 * | 16-19       | size      | 32   | the 20-byte header: the payload's length in bytes                                                       |
 * | 8-11        |           | 32   | the 16-byte header: not read                                                                            |
 * | 12-15       | size      | 32   | the 16-byte header: the payload's length in bytes                                                       |
 *
 * The track names what a record carries and the clock its timestamp counts at:
 *
 * | Track   | Payload                                         | Clock                                              |
 * |---------|-------------------------------------------------|----------------------------------------------------|
 * | 7       | an H.264 frame                                  | 90000                                              |
 * | 1000    | an AAC frame in its ADTS header                 | the sampling frequency its ADTS header names       |
 * | 1002    | an Opus packet                                  | 48000                                              |
 * | 1003    | an HEVC frame                                   | 90000                                              |
 * | 1004    | an AV1 temporal unit                            | 90000                                              |
 * | `da7e`  | the stream's clock, under the 16-byte header    |                                                    |
 *
 * The clock and every track outside this vocabulary are read past and yield nothing, so a track the stream adds never ends it. A media track's record carries the
 * 20-byte header, since its frame needs the timestamp.
 *
 * The reader is fed the stream in chunks cut anywhere, and answers the frames each chunk completes. A record whole within a chunk yields a frame that is a view into
 * that chunk. A record a chunk's end cuts is joined into one buffer, allocated once its length is known, and its frame is a view into that buffer; a header a chunk's
 * end cuts before its length can be read is held, as a copy of its few bytes, until the next chunk completes it. A record's structure is checked as it is read: a
 * record that does not open with the marker, declares a payload past any frame a camera sends, or ends in a trailer other than its length is refused. There is no
 * resynchronization, because a stream that has lost its framing cannot be trusted again.
 *
 * @module ProtectUbv
 */
import type { AudioCodec, VideoCodec } from "./codecs.ts";
import type { MediaFrame } from "./frames.ts";
import { OPUS_DECODE_RATE } from "./opus.ts";
import { ProtectProtocolError } from "../../errors.ts";
import { readAdtsHeader } from "./aac.ts";
import { readUInt64 } from "./boxes.ts";

// The byte every record opens with.
const RECORD_MARKER = 0xa0;

// The two header lengths. The 20-byte header adds the 64-bit timestamp ahead of the payload's size, which is the last field of either header.
const SHORT_HEADER_SIZE = 16;
const LONG_HEADER_SIZE = 20;

// The header's fields at fixed offsets: the track id, the flags and, in the 20-byte header, the timestamp.
const HeaderOffset = {

  FLAGS: 4,
  TIMESTAMP: 8,
  TRACK: 1
} as const;

// The flag bits the reader acts on: one selects the 20-byte header, and one marks a video record as a keyframe.
const RecordFlag = {

  KEYFRAME: 0x20,
  LONG_HEADER: 0x04
} as const;

// The width of the payload's size field and of the trailer, each a 32-bit count of bytes.
const COUNT_SIZE = 4;

// The boundary a payload is padded to with zero bytes.
const PAYLOAD_ALIGNMENT = 4;

/* The largest payload a record may declare, 16 MiB. It sits far above any frame a camera sends, and it is checked as soon as a header is read, before anything is
 * allocated for the record, so a corrupt size never becomes an allocation.
 */
const UBV_PAYLOAD_LIMIT = 16777216;

// The clock every video track counts its timestamps at.
const VIDEO_CLOCK_RATE = 90000;

// What a media track carries: the codec of its frames, and whether they are video or audio.
type TrackFormat = { readonly codec: AudioCodec; readonly kind: "audio" } | { readonly codec: VideoCodec; readonly kind: "video" };

// The tracks the reader yields frames for. The clock track and every other id are absent, so their records are read past.
const TRACKS: ReadonlyMap<number, TrackFormat> = new Map<number, TrackFormat>([

  [ 7, { codec: "h264", kind: "video" } ],
  [ 1000, { codec: "aac", kind: "audio" } ],
  [ 1002, { codec: "opus", kind: "audio" } ],
  [ 1003, { codec: "h265", kind: "video" } ],
  [ 1004, { codec: "av1", kind: "video" } ]
]);

// What an earlier chunk's end cut: nothing, a header whose length could not yet be read, held as a copy of its bytes, or a record whose length was known, joined
// into one buffer as its bytes arrive.
type Cut = { readonly kind: "none" } | { readonly bytes: Buffer; readonly kind: "header" } |
  { readonly filled: number; readonly kind: "record"; readonly record: Buffer };

const NOTHING_CUT: Cut = { kind: "none" };

/**
 * An incremental reader of a UBV record stream. The stream's chunks are pushed as they arrive, cut anywhere, and each push answers the frames that chunk
 * completes. One reader serves one stream, carrying a record a chunk cuts into the next chunk; after a refusal the stream's framing cannot be trusted, so its caller
 * ends the stream rather than pushing more.
 *
 * @category Codec
 */
export class UbvReader {

  #cut: Cut = NOTHING_CUT;

  /**
   * Read the frames a chunk of the stream completes.
   *
   * @param chunk - The stream's next bytes, cut anywhere. Accepts any `Uint8Array` (a `Buffer` included) and reads it without copying.
   *
   * @returns Every media frame the chunk completes, in record order. A frame whose record lies whole within the chunk is a view into the chunk, and one whose record
   *   the chunk completes is a view into the buffer that record was joined into.
   *
   * @throws {@link ProtectProtocolError} if a record does not open with the marker, declares a payload above 16 MiB, ends in a trailer other than its length, or
   *   carries a media track under the 16-byte header, or if an AAC record's ADTS header is malformed.
   */
  push(chunk: Uint8Array): MediaFrame[] {

    const bytes = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    const frames: MediaFrame[] = [];
    let offset = 0;

    while(offset < bytes.length) {

      const cut = this.#cut;

      // A record an earlier chunk cut takes the chunk's bytes until it is whole, and is read once it is.
      if(cut.kind === "record") {

        const filled = cut.filled + bytes.copy(cut.record, cut.filled, offset);

        offset += filled - cut.filled;

        if(filled < cut.record.length) {

          this.#cut = { filled, kind: "record", record: cut.record };

          continue;
        }

        this.#cut = NOTHING_CUT;
        readRecord(cut.record, frames);

        continue;
      }

      // A header an earlier chunk cut is joined with the chunk's leading bytes, up to the longest header's length. Every record is at least that long, so the
      // joined bytes all belong to the cut record, and they stay in the chunk for the record to take once its length is known.
      const head = (cut.kind === "header") ? Buffer.concat([ cut.bytes, bytes.subarray(offset, offset + LONG_HEADER_SIZE - cut.bytes.length) ]) :
        bytes.subarray(offset);
      const length = recordLength(head);

      // The chunk ends inside a header: its bytes are held as a copy, so the chunk is never kept alive for the few bytes the next one completes.
      if(length === undefined) {

        this.#cut = { bytes: Buffer.from(head), kind: "header" };

        break;
      }

      // A record whole within the chunk is read in place.
      if((cut.kind === "none") && (length <= head.length)) {

        readRecord(bytes.subarray(offset, offset + length), frames);
        offset += length;

        continue;
      }

      // A record the chunk does not complete is joined into one buffer of its length, which takes any header bytes an earlier chunk held and then the chunk's own.
      const record = Buffer.alloc(length);

      this.#cut = { filled: (cut.kind === "header") ? cut.bytes.copy(record) : 0, kind: "record", record };
    }

    return frames;
  }
}

// The length of the record a header opens - its header, its padded payload and its trailer - or undefined while the bytes so far cannot hold the header's size
// field. The marker is refused as soon as it arrives, and a size past the limit as soon as it is read, before anything is allocated for the record.
function recordLength(head: Buffer): number | undefined {

  if(head.readUInt8(0) !== RECORD_MARKER) {

    throw new ProtectProtocolError("UBV record does not open with the record marker.");
  }

  if(head.length <= HeaderOffset.FLAGS) {

    return undefined;
  }

  const headerSize = headerSizeOf(head.readUInt8(HeaderOffset.FLAGS));

  if(head.length < headerSize) {

    return undefined;
  }

  const size = head.readUInt32BE(headerSize - COUNT_SIZE);

  if(size > UBV_PAYLOAD_LIMIT) {

    throw new ProtectProtocolError("UBV record declares a payload larger than any frame a camera sends.");
  }

  return headerSize + paddedSize(size) + COUNT_SIZE;
}

// Read one whole record into the frame it carries, checking its trailer first. A record of the clock or of a track outside the vocabulary yields nothing.
function readRecord(record: Buffer, frames: MediaFrame[]): void {

  const flags = record.readUInt8(HeaderOffset.FLAGS);
  const headerSize = headerSizeOf(flags);
  const trailerOffset = record.length - COUNT_SIZE;

  if(record.readUInt32BE(trailerOffset) !== trailerOffset) {

    throw new ProtectProtocolError("UBV record ends in a trailer other than the length of its header and padded payload.");
  }

  const track = TRACKS.get(record.readUInt16BE(HeaderOffset.TRACK));

  if(track === undefined) {

    return;
  }

  if(headerSize !== LONG_HEADER_SIZE) {

    throw new ProtectProtocolError("UBV record of a media track carries the 16-byte header, which holds no timestamp.");
  }

  const data = record.subarray(headerSize, headerSize + record.readUInt32BE(headerSize - COUNT_SIZE));
  const timestamp = readUInt64(record, HeaderOffset.TIMESTAMP);

  if(track.kind === "video") {

    frames.push({ codec: track.codec, data, keyframe: (flags & RecordFlag.KEYFRAME) !== 0, kind: "video", rate: VIDEO_CLOCK_RATE, timestamp });

    return;
  }

  // An Opus track counts at the rate Opus decodes at, and an AAC track at the sampling frequency each frame's ADTS header names, which also refuses a malformed
  // header.
  frames.push({ codec: track.codec, data, kind: "audio", rate: (track.codec === "aac") ? readAdtsHeader(data).sampleRate : OPUS_DECODE_RATE, timestamp });
}

// The header length a record's flags select.
function headerSizeOf(flags: number): number {

  return ((flags & RecordFlag.LONG_HEADER) !== 0) ? LONG_HEADER_SIZE : SHORT_HEADER_SIZE;
}

// A payload's length with its padding, rounded up to the next four-byte boundary.
function paddedSize(size: number): number {

  return Math.ceil(size / PAYLOAD_ALIGNMENT) * PAYLOAD_ALIGNMENT;
}
