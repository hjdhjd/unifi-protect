/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * init-segment.fixtures.ts: Livestream init segments for the init-segment reader's suite - the inits captured from the wire, and a box builder composing the shapes
 * the wire does not exercise.
 */

/* The captured inits are the real header, byte for byte, and they are what the dimensions, rates and channel counts are asserted from. They come from Protect
 * cameras and from a third-party Amcrest camera streaming through Protect. Every byte of each is a parsed box field: the `moov` carries track, media and
 * sample-table boxes and no serial, MAC, name or address, so embedding them exposes nothing about the site they came from. `AI_PRO_INIT` and `AI_PRO_RECONNECT_INIT`
 * differ only in their creation and modification timestamps, which makes them a realistic pair for a reconnect that delivers the same stream.
 *
 * The composed inits are built through the box builder below rather than written as byte arrays, so each states its shape in the vocabulary of the format - a box,
 * a full box, a sample entry - and each corner's configuration bits are spelled out beside it.
 */

// Captured inits.

// Decode a capture written as base64 chunks, once, at load.
function capture(chunks: string[]): Buffer {

  return Buffer.from(chunks.join(""), "base64");
}

// A G6 Pro Entry doorbell's init: HEVC Main at 3024 by 4096, level 180, and AAC-LC at 16000 Hz mono under an `mp4a` entry that says stereo.
export const DOORBELL_INIT = capture([

  "AAAAIGZ0eXBkYXNoAAAAAGlzbzZodmMxYXZjMW1wNDEAAATCbW9vdgAAAGxtdmhkAAAAAObxyrzm8cq8AAAD6AAAAAAAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAA",
  "AAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAEhtdmV4AAAAIHRyZXgAAAAAAAAAAQAAAAEAABGUAAAAAAABAAAAAAAgdHJleAAAAAAAAAACAAAAAQAABAAAAAAAAAAAAAAA",
  "AkZ0cmFrAAAAXHRraGQAAAAH5vHKvObxyrwAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAC9AAABAAAAAAAAAkZWR0cwAAABxl",
  "bHN0AAAAAAAAAAEAAAAAAAAAAAABAAAAAAG+bWRpYQAAACBtZGhkAAAAAObxyrzm8cq8AAFfkAAAAABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAAB",
  "aW1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAASlzdGJsAAAA3XN0c2QAAAAAAAAAAQAAAM1odmMxAAAAAAAAAAEAAAAAAAAAAAAA",
  "AAAAAAAAC9AQAABIAAAASAAAAAAAAAABFlViaXF1aXRpIE1lZGlhIFNlcnZlciAAAAAAAAAAAAAAGP//AAAAd2h2Y0MBAQAAAAL///////+08AD8/fj4AAADA6AAAQAYQAEMAf//AUAAAAMAAAMA",
  "AAMAAAMAtKwJoQABACpCAQEBQAAAAwAAAwAAAwAAAwC0oAF6IAEAFja5JMku4BAAAD6QAATjQICiAAEAB0QBwHawMyQAAAAQc3R0cwAAAAAAAAAAAAAAEHN0c2MAAAAAAAAAAAAAABRzdHN6AAAA",
  "AAAAAAAAAAAAAAAAEHN0Y28AAAAAAAAAAAAAAcB0cmFrAAAAXHRraGQAAAAH5vHKvObxyrwAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAA",
  "AABAAAAAAAAAAAAAAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAAAAAAAAAABAAAAAAE4bWRpYQAAACBtZGhkAAAAAObxyrzm8cq8AAA+gAAAAABVxAAAAAAALWhkbHIAAAAAAAAAAHNvdW4A",
  "AAAAAAAAAAAAAABTb3VuZEhhbmRsZXIAAAAA421pbmYAAAAQc21oZAAAAAAAAAAAAAAAJGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAAAAABAAAAp3N0YmwAAABbc3RzZAAAAAAAAAABAAAA",
  "S21wNGEAAAAAAAAAAQAAAAAAAAAAAAIAEAAAAAA+gAAAAAAAJ2VzZHMAAAAAAxkAAgAEEUAVAAAAAAAAAAAAAAAFAhQIBgECAAAAEHN0dHMAAAAAAAAAAAAAABBzdHNjAAAAAAAAAAAAAAAUc3Rz",
  "egAAAAAAAAAAAAAAAAAAABBzdGNvAAAAAAAAAAA="
]);

// An AI Pro's init: HEVC Main at 3840 by 2160, level 150, and AAC-LC at 16000 Hz mono.
export const AI_PRO_INIT = capture([

  "AAAAIGZ0eXBkYXNoAAAAAGlzbzZodmMxYXZjMW1wNDEAAATLbW9vdgAAAGxtdmhkAAAAAObp7hzm6e4cAAAD6AAAAAAAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAA",
  "AAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAEhtdmV4AAAAIHRyZXgAAAAAAAAAAQAAAAEAAAu4AAAAAAABAAAAAAAgdHJleAAAAAAAAAACAAAAAQAABAAAAAAAAAAAAAAA",
  "Ak90cmFrAAAAXHRraGQAAAAH5unuHObp7hwAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAADwAAAAhwAAAAAAAkZWR0cwAAABxl",
  "bHN0AAAAAAAAAAEAAAAAAAAAAAABAAAAAAHHbWRpYQAAACBtZGhkAAAAAObp7hzm6e4cAAFfkAAAAABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAAB",
  "cm1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAATJzdGJsAAAA5nN0c2QAAAAAAAAAAQAAANZodmMxAAAAAAAAAAEAAAAAAAAAAAAA",
  "AAAAAAAADwAIcABIAAAASAAAAAAAAAABFlViaXF1aXRpIE1lZGlhIFNlcnZlciAAAAAAAAAAAAAAGP//AAAAgGh2Y0MBAQAAAAb///////+W8AD8/fj4AAADA6AAAQAXQAEMAf//AWAAAAMAgAAA",
  "AwAAAwCWrAmhAAEAMUIBAQFgAAADAIAAAAMAAAMAlqAB4CACHH+Nru8kusBbgICAggAAB9AAAOpgg1aCAQSiAAEACkQBwXKwnAoBRiQAAAAQc3R0cwAAAAAAAAAAAAAAEHN0c2MAAAAAAAAAAAAA",
  "ABRzdHN6AAAAAAAAAAAAAAAAAAAAEHN0Y28AAAAAAAAAAAAAAcB0cmFrAAAAXHRraGQAAAAH5unuHObp7hwAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAA",
  "AAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAAAAAAAAAABAAAAAAE4bWRpYQAAACBtZGhkAAAAAObp7hzm6e4cAAA+gAAAAABVxAAAAAAALWhkbHIAAAAA",
  "AAAAAHNvdW4AAAAAAAAAAAAAAABTb3VuZEhhbmRsZXIAAAAA421pbmYAAAAQc21oZAAAAAAAAAAAAAAAJGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAAAAABAAAAp3N0YmwAAABbc3RzZAAA",
  "AAAAAAABAAAAS21wNGEAAAAAAAAAAQAAAAAAAAAAAAIAEAAAAAA+gAAAAAAAJ2VzZHMAAAAAAxkAAgAEEUAVAAAAAAAAAAAAAAAFAhQIBgECAAAAEHN0dHMAAAAAAAAAAAAAABBzdHNjAAAAAAAA",
  "AAAAAAAUc3RzegAAAAAAAAAAAAAAAAAAABBzdGNvAAAAAAAAAAA="
]);

// The same stream shape as `AI_PRO_INIT`, captured on a later reconnect: only its creation and modification timestamps differ.
export const AI_PRO_RECONNECT_INIT = capture([

  "AAAAIGZ0eXBkYXNoAAAAAGlzbzZodmMxYXZjMW1wNDEAAATLbW9vdgAAAGxtdmhkAAAAAObxysjm8crIAAAD6AAAAAAAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAA",
  "AAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAEhtdmV4AAAAIHRyZXgAAAAAAAAAAQAAAAEAAAu4AAAAAAABAAAAAAAgdHJleAAAAAAAAAACAAAAAQAABAAAAAAAAAAAAAAA",
  "Ak90cmFrAAAAXHRraGQAAAAH5vHKyObxysgAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAADwAAAAhwAAAAAAAkZWR0cwAAABxl",
  "bHN0AAAAAAAAAAEAAAAAAAAAAAABAAAAAAHHbWRpYQAAACBtZGhkAAAAAObxysjm8crIAAFfkAAAAABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAAB",
  "cm1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAATJzdGJsAAAA5nN0c2QAAAAAAAAAAQAAANZodmMxAAAAAAAAAAEAAAAAAAAAAAAA",
  "AAAAAAAADwAIcABIAAAASAAAAAAAAAABFlViaXF1aXRpIE1lZGlhIFNlcnZlciAAAAAAAAAAAAAAGP//AAAAgGh2Y0MBAQAAAAb///////+W8AD8/fj4AAADA6AAAQAXQAEMAf//AWAAAAMAgAAA",
  "AwAAAwCWrAmhAAEAMUIBAQFgAAADAIAAAAMAAAMAlqAB4CACHH+Nru8kusBbgICAggAAB9AAAOpgg1aCAQSiAAEACkQBwXKwnAoBRiQAAAAQc3R0cwAAAAAAAAAAAAAAEHN0c2MAAAAAAAAAAAAA",
  "ABRzdHN6AAAAAAAAAAAAAAAAAAAAEHN0Y28AAAAAAAAAAAAAAcB0cmFrAAAAXHRraGQAAAAH5vHKyObxysgAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAA",
  "AAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAAAAAAAAAABAAAAAAE4bWRpYQAAACBtZGhkAAAAAObxysjm8crIAAA+gAAAAABVxAAAAAAALWhkbHIAAAAA",
  "AAAAAHNvdW4AAAAAAAAAAAAAAABTb3VuZEhhbmRsZXIAAAAA421pbmYAAAAQc21oZAAAAAAAAAAAAAAAJGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAAAAABAAAAp3N0YmwAAABbc3RzZAAA",
  "AAAAAAABAAAAS21wNGEAAAAAAAAAAQAAAAAAAAAAAAIAEAAAAAA+gAAAAAAAJ2VzZHMAAAAAAxkAAgAEEUAVAAAAAAAAAAAAAAAFAhQIBgECAAAAEHN0dHMAAAAAAAAAAAAAABBzdHNjAAAAAAAA",
  "AAAAAAAUc3RzegAAAAAAAAAAAAAAAAAAABBzdGNvAAAAAAAAAAA="
]);

// An Amcrest camera's init through Protect: H.264 Main at 2592 by 1944, level 51, and AAC-LC at 8000 Hz mono.
export const AMCREST_INIT = capture([

  "AAAAIGZ0eXBkYXNoAAAAAGlzbzZodmMxYXZjMW1wNDEAAAR+bW9vdgAAAGxtdmhkAAAAAObxoLPm8aCzAAAD6AAAAAAAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAA",
  "AAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAEhtdmV4AAAAIHRyZXgAAAAAAAAAAQAAAAEAAAjKAAAAAAABAAAAAAAgdHJleAAAAAAAAAACAAAAAQAABAAAAAAAAAAAAAAA",
  "AgJ0cmFrAAAAXHRraGQAAAAH5vGgs+bxoLMAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAACiAAAAeYAAAAAAAkZWR0cwAAABxl",
  "bHN0AAAAAAAAAAEAAAAAAAAAAAABAAAAAAF6bWRpYQAAACBtZGhkAAAAAObxoLPm8aCzAAFfkAAAAABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAAB",
  "JW1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAOVzdGJsAAAAmXN0c2QAAAAAAAAAAQAAAIlhdmMxAAAAAAAAAAEAAAAAAAAAAAAA",
  "AAAAAAAACiAHmABIAAAASAAAAAAAAAABFlViaXF1aXRpIE1lZGlhIFNlcnZlciAAAAAAAAAAAAAAGP//AAAAM2F2Y0MBTUAz/+EAG2dNQDOmgCiA9flm4CAgKAAAAwAIAAADAUQgAAEABWjuPIAA",
  "AAAAEHN0dHMAAAAAAAAAAAAAABBzdHNjAAAAAAAAAAAAAAAUc3RzegAAAAAAAAAAAAAAAAAAABBzdGNvAAAAAAAAAAAAAAHAdHJhawAAAFx0a2hkAAAAB+bxoLPm8aCzAAAAAgAAAAAAAAAAAAAA",
  "AAAAAAAAAAAAAQAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAJGVkdHMAAAAcZWxzdAAAAAAAAAABAAAAAAAAAAAAAQAAAAABOG1kaWEAAAAgbWRoZAAA",
  "AADm8aCz5vGgswAAH0AAAAAAVcQAAAAAAC1oZGxyAAAAAAAAAABzb3VuAAAAAAAAAAAAAAAAU291bmRIYW5kbGVyAAAAAONtaW5mAAAAEHNtaGQAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAA",
  "AAAAAQAAAAx1cmwgAAAAAQAAAKdzdGJsAAAAW3N0c2QAAAAAAAAAAQAAAEttcDRhAAAAAAAAAAEAAAAAAAAAAAACABAAAAAAH0AAAAAAACdlc2RzAAAAAAMZAAIABBFAFQAAAAAAAAAAAAAABQIV",
  "iAYBAgAAABBzdHRzAAAAAAAAAAAAAAAQc3RzYwAAAAAAAAAAAAAAFHN0c3oAAAAAAAAAAAAAAAAAAAAQc3RjbwAAAAAAAAAA"
]);

// A Protect camera's AV1 init: AV1 Main at 3840 by 2160, `seq_level_idx_0` 12 (level 5.0), and AAC-LC at 16000 Hz mono under an `mp4a` entry that says stereo.
export const PROTECT_AV1_INIT = capture([

  "AAAAIGZ0eXBkYXNoAAAAAGlzbzZodmMxYXZjMW1wNDEAAARXbW9vdgAAAGxtdmhkAAAAAObyCGzm8ghsAAAD6AAAAAAAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAA",
  "AAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAEhtdmV4AAAAIHRyZXgAAAAAAAAAAQAAAAEAAAu4AAAAAAABAAAAAAAgdHJleAAAAAAAAAACAAAAAQAABAAAAAAAAAAAAAAA",
  "Adt0cmFrAAAAXHRraGQAAAAH5vIIbObyCGwAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAADwAAAAhwAAAAAAAkZWR0cwAAABxl",
  "bHN0AAAAAAAAAAEAAAAAAAAAAAABAAAAAAFTbWRpYQAAACBtZGhkAAAAAObyCGzm8ghsAAFfkAAAAABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAAA",
  "/m1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAL5zdGJsAAAAcnN0c2QAAAAAAAAAAQAAAGJhdjAxAAAAAAAAAAEAAAAAAAAAAAAA",
  "AAAAAAAADwAIcABIAAAASAAAAAAAAAABFlViaXF1aXRpIE1lZGlhIFNlcnZlciAAAAAAAAAAAAAAGP//AAAADGF2MUOBDCwGAAAAEHN0dHMAAAAAAAAAAAAAABBzdHNjAAAAAAAAAAAAAAAUc3Rz",
  "egAAAAAAAAAAAAAAAAAAABBzdGNvAAAAAAAAAAAAAAHAdHJhawAAAFx0a2hkAAAAB+byCGzm8ghsAAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAA",
  "AAAAAAAAQAAAAAAAAAAAAAAAAAAAJGVkdHMAAAAcZWxzdAAAAAAAAAABAAAAAAAAAAAAAQAAAAABOG1kaWEAAAAgbWRoZAAAAADm8ghs5vIIbAAAPoAAAAAAVcQAAAAAAC1oZGxyAAAAAAAAAABz",
  "b3VuAAAAAAAAAAAAAAAAU291bmRIYW5kbGVyAAAAAONtaW5mAAAAEHNtaGQAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAKdzdGJsAAAAW3N0c2QAAAAAAAAA",
  "AQAAAEttcDRhAAAAAAAAAAEAAAAAAAAAAAACABAAAAAAPoAAAAAAACdlc2RzAAAAAAMZAAIABBFAFQAAAAAAAAAAAAAABQIUCAYBAgAAABBzdHRzAAAAAAAAAAAAAAAQc3RzYwAAAAAAAAAAAAAA",
  "FHN0c3oAAAAAAAAAAAAAAAAAAAAQc3RjbwAAAAAAAAAA"
]);

// Box builder.

// A plain box: a 32-bit size covering the 8-byte header and the payloads, then the four-character type, then the payloads in order.
export function box(type: string, ...payloads: Uint8Array[]): Buffer {

  const body = Buffer.concat(payloads);
  const header = Buffer.alloc(8);

  header.writeUInt32BE(8 + body.length, 0);
  header.write(type, 4, 4, "latin1");

  return Buffer.concat([ header, body ]);
}

// A full box: a plain box whose payload opens with a version byte and 24 bits of flags.
export function fullBox(type: string, version: number, flags: number, ...payloads: Uint8Array[]): Buffer {

  const prefix = Buffer.alloc(4);

  prefix.writeUInt8(version, 0);
  prefix.writeUIntBE(flags, 1, 3);

  return box(type, prefix, ...payloads);
}

// A box with a 64-bit size: the 32-bit size reads 1, and the true size follows the type as a 64-bit `largesize` covering the 16-byte header and the payloads.
export function largeBox(type: string, ...payloads: Uint8Array[]): Buffer {

  const body = Buffer.concat(payloads);
  const header = Buffer.alloc(16);

  header.writeUInt32BE(1, 0);
  header.write(type, 4, 4, "latin1");
  header.writeBigUInt64BE(BigInt(16 + body.length), 8);

  return Buffer.concat([ header, body ]);
}

// A box whose 32-bit size reads 0, which runs it to the end of its parent, or to the end of the file at the top level.
function toEndBox(type: string, ...payloads: Uint8Array[]): Buffer {

  const header = Buffer.alloc(8);

  header.write(type, 4, 4, "latin1");

  return Buffer.concat([ header, ...payloads ]);
}

// Big-endian unsigned fields of each width the boxes use.
function u8(value: number): Buffer {

  return Buffer.from([value]);
}

function u16(value: number): Buffer {

  const field = Buffer.alloc(2);

  field.writeUInt16BE(value, 0);

  return field;
}

function u32(value: number): Buffer {

  const field = Buffer.alloc(4);

  field.writeUInt32BE(value, 0);

  return field;
}

// A 16.16 fixed-point field, the form `tkhd` and the audio sample entry write their dimensions and sample rate in.
function fixed16(value: number): Buffer {

  return u32(value * 65536);
}

// A 64-bit floating-point field, the form a QuickTime sound description at version 2 writes its sample rate in.
function float64(value: number): Buffer {

  const field = Buffer.alloc(8);

  field.writeDoubleBE(value, 0);

  return field;
}

// An init segment: an `ftyp` naming the fragmented brands, then the `moov` holding the given tracks.
function init(...traks: Buffer[]): Buffer {

  return Buffer.concat([ box("ftyp", Buffer.from("iso6", "latin1"), u32(0), Buffer.from("iso6mp41", "latin1")), box("moov", ...traks) ]);
}

/* A `trak`: a `tkhd` carrying the id and the presentation dimensions, then an `mdia` holding the handler and the sample table's `stsd`. The `tkhd` is version 0
 * unless asked otherwise; its version 1 layout widens the creation time, modification time and duration to 64 bits, which moves the track id from payload offset
 * 12 to 20. An absent `id` leaves the `tkhd` out entirely, and an absent `handler` the `hdlr`. The `stsd` writes the number of its entries ahead of them, or
 * `stsdCount` when given, so a count can name entries the box does not hold.
 */
function trak(opts: { entries: Buffer[]; handler?: string; height?: number; id?: number; stsdCount?: number; stsdVersion?: number; tkhdVersion?: number;
  width?: number; }): Buffer {

  const { entries, handler, height = 0, id, stsdCount = entries.length, stsdVersion = 0, tkhdVersion = 0, width = 0 } = opts;
  const times = (tkhdVersion === 1) ? Buffer.alloc(16) : Buffer.alloc(8);
  const duration = (tkhdVersion === 1) ? Buffer.alloc(8) : Buffer.alloc(4);
  const matrix = Buffer.concat([ u32(0x10000), u32(0), u32(0), u32(0), u32(0x10000), u32(0), u32(0), u32(0), u32(0x40000000) ]);
  const tkhd = (id === undefined) ? Buffer.alloc(0) :
    fullBox("tkhd", tkhdVersion, 7, times, u32(id), u32(0), duration, Buffer.alloc(8), u16(0), u16(0), u16(0), u16(0), matrix, fixed16(width), fixed16(height));
  const hdlr = (handler === undefined) ? Buffer.alloc(0) :
    fullBox("hdlr", 0, 0, u32(0), Buffer.from(handler, "latin1"), Buffer.alloc(12), Buffer.from("Handler\0", "latin1"));
  const stsd = fullBox("stsd", stsdVersion, 0, u32(stsdCount), ...entries);

  return box("trak", tkhd, box("mdia", hdlr, box("minf", box("stbl", stsd))));
}

/* A visual sample entry: the sample entry prefix (six reserved bytes and a data reference index of 1), 16 bytes of pre-defined and reserved fields, the width and
 * height, 72 dpi in both directions, a frame count of 1, an empty compressor name, a depth of 24 and the pre-defined -1, then the child boxes.
 */
function visualEntry(type: string, width: number, height: number, ...children: Buffer[]): Buffer {

  return box(type, Buffer.alloc(6), u16(1), Buffer.alloc(16), u16(width), u16(height), fixed16(72), fixed16(72), u32(0), u16(1), Buffer.alloc(32), u16(24),
    u16(0xffff), ...children);
}

/* An audio sample entry: the sample entry prefix, the version field, a revision and vendor, the entry's own channel count, a sample size of 16, a compression id
 * (zero unless given) and a packet size of zero, and the entry's own 16.16 sample rate, then the payloads that follow those fixed fields. The version field is
 * QuickTime's sound-description version under an `stsd` of version 0 and the ISO entry version under an `stsd` of version 1.
 */
function audioEntry(type: string, opts: { channelCount: number; compressionId?: number; sampleRate: number; version?: number }, ...payloads: Buffer[]): Buffer {

  const { channelCount, compressionId = 0, sampleRate, version = 0 } = opts;

  return box(type, Buffer.alloc(6), u16(1), u16(version), u16(0), u32(0), u16(channelCount), u16(16), u16(compressionId), u16(0), fixed16(sampleRate), ...payloads);
}

// The four 32-bit fields a QuickTime sound description at version 1 adds after the fixed fields: samples per packet, bytes per packet, bytes per frame and bytes
// per sample.
const QUICKTIME_V1_SIZES = Buffer.concat([ u32(1024), u32(0), u32(0), u32(2) ]);

// The fields a QuickTime sound description at version 2 adds after the fixed fields: the 72-byte size of the structure, which is where its children begin, the
// sample rate as a 64-bit float, here 48000, the channel count, here 1, the constant 0x7f000000, zero bits per channel, no format flags, zero bytes per packet and
// 1024 frames per packet. The rate and the channel count disagree with the configuration the version 2 fixture carries, so its row tells which source is read.
const QUICKTIME_V2_FIELDS = Buffer.concat([ u32(72), float64(48000), u32(1), u32(0x7f000000), u32(0), u32(0), u32(0), u32(1024) ]);

/* An MPEG-4 Systems descriptor: its tag, its expandable length and its body. The length is written in one byte, which holds a body shorter than 128 bytes, or
 * padded out to `lengthBytes` bytes with the high bit set on every byte but the last - the `80 80 80 nn` form some muxers write at four, and at five the
 * `80 80 80 80 nn` form whose length runs one byte past the four the format allows.
 */
function descriptor(tag: number, body: Buffer, lengthBytes = 1): Buffer {

  const length: number[] = [];

  for(let index = lengthBytes - 1; index >= 0; index--) {

    length.push(((body.length >> (index * 7)) & 0x7f) | ((index > 0) ? 0x80 : 0));
  }

  return Buffer.concat([ u8(tag), Buffer.from(length), body ]);
}

// How an elementary stream descriptor is written: the number of bytes each descriptor's length takes, the decoder configuration's object type indication, and the
// optional fields its flags announce.
interface EsDescriptorOptions {

  readonly lengthBytes?: number;
  readonly objectType?: number;
  readonly optionalFields?: { readonly dependsOnId: number; readonly ocrStreamId: number; readonly url: string };
}

/* The body of an elementary stream descriptor carrying an `AudioSpecificConfig`: id 2 and a flags byte (no optional fields unless given), then a decoder
 * configuration descriptor (MPEG-4 audio unless asked otherwise, an audio stream type, zero buffer size and bitrates) whose decoder-specific info is the
 * configuration, then the SL configuration descriptor Protect also writes. Optional fields, when given, set the descriptor's stream dependence, URL and OCR stream
 * flags (a flags byte of 0xe0) and follow that byte in the order the flags name them: the 16-bit dependency id, the URL behind its length byte, and the 16-bit OCR
 * stream id.
 */
function esDescriptorBody(audioSpecificConfig: Buffer, opts: EsDescriptorOptions = {}): Buffer {

  const { lengthBytes = 1, objectType = 0x40, optionalFields } = opts;
  const decoderConfig = descriptor(4, Buffer.concat([ u8(objectType), u8(0x15), Buffer.alloc(3), u32(0), u32(0), descriptor(5, audioSpecificConfig, lengthBytes) ]),
    lengthBytes);
  const flagsAndFields = (optionalFields === undefined) ? [u8(0)] : [ u8(0xe0), u16(optionalFields.dependsOnId), u8(optionalFields.url.length),
    Buffer.from(optionalFields.url, "latin1"), u16(optionalFields.ocrStreamId) ];

  return Buffer.concat([ u16(2), ...flagsAndFields, decoderConfig, descriptor(6, u8(2), lengthBytes) ]);
}

// An `esds` carrying an `AudioSpecificConfig`: a full box holding the elementary stream descriptor (tag 3) over the body above, its length written as its nested
// descriptors' are.
function esds(audioSpecificConfig: Buffer, opts: EsDescriptorOptions = {}): Buffer {

  return fullBox("esds", 0, 0, descriptor(3, esDescriptorBody(audioSpecificConfig, opts), opts.lengthBytes));
}

// An `mp4a` track under a sound handler whose entry fields say stereo at 16000 Hz, the template Protect writes, over whatever its configuration says.
function aacTrak(id: number, audioSpecificConfig: Buffer): Buffer {

  return trak({ entries: [audioEntry("mp4a", { channelCount: 2, sampleRate: 16000 }, esds(audioSpecificConfig))], handler: "soun", id });
}

// An H.264 video track at 640 by 360, Baseline profile at level 3.0, the companion track the two-track compositions open with.
function companionVideoTrak(id: number): Buffer {

  return trak({ entries: [visualEntry("avc1", 640, 360, box("avcC", Buffer.from([ 1, 66, 0, 30, 0xff, 0xe0, 0 ])))], handler: "vide", height: 360, id, width: 640 });
}

// Composed inits.

// An H.264 track and an Opus track whose `dOps` reads version 0, an output channel count of 2, a pre-skip of 312, an input sample rate of 16000, no output gain
// and channel mapping family 0. The input rate names the encoder's source; the track decodes at 48000. The entry's own fields state one channel at 16000 Hz, so
// the entry disagrees with the `dOps` on the channel count and with the decode rate on the rate, and the row tells which source is read.
export const OPUS_INIT = init(companionVideoTrak(1), trak({ entries: [audioEntry("Opus", { channelCount: 1, sampleRate: 16000 },
  box("dOps", u8(0), u8(2), u16(312), u32(16000), u16(0), u8(0)))], handler: "soun", id: 2 }));

// An Opus track whose entry carries no `dOps`, its own fields stating stereo at 48000 Hz, so a reader that fell back to those fields would describe the track.
export const OPUS_WITHOUT_DOPS_INIT = init(trak({ entries: [audioEntry("Opus", { channelCount: 2, sampleRate: 48000 })], handler: "soun", id: 1 }));

// An AAC track whose descriptor lengths each take the padded four-byte form, `80 80 80 nn`. The configuration is Protect's own, `14 08`: 00010 (AAC-LC),
// 1000 (index 8, 16000 Hz), 0001 (one channel), then 000 (the GASpecificConfig flags).
export const PADDED_DESCRIPTOR_INIT = init(trak({ entries: [audioEntry("mp4a", { channelCount: 2, sampleRate: 16000 },
  esds(Buffer.from([ 0x14, 0x08 ]), { lengthBytes: 4 }))], handler: "soun", id: 1 }));

// An AAC track whose elementary stream descriptor writes its length as `80 80 80 80 nn`, four continuation bytes ahead of the byte holding the true length, over a
// body that is otherwise valid: its nested descriptors take one length byte each, and its configuration `14 08` reads 00010 (AAC-LC), 1000 (index 8, 16000 Hz),
// 0001 (one channel), then 000. A length that has not ended within four bytes ends the walk, so the track reads as unknown.
export const RUNAWAY_DESCRIPTOR_LENGTH_INIT = init(trak({ entries: [audioEntry("mp4a", { channelCount: 2, sampleRate: 16000 },
  fullBox("esds", 0, 0, descriptor(3, esDescriptorBody(Buffer.from([ 0x14, 0x08 ])), 5)))], handler: "soun", id: 1 }));

// An AAC track whose elementary stream descriptor sets its stream dependence, URL and OCR stream flags and carries each field they add ahead of its decoder
// configuration: dependency id 1, the URL `a:b` behind its length byte, and OCR stream id 3. The configuration `13 88` reads 00010 (AAC-LC), 0111 (index 7,
// 22050 Hz), 0001 (one channel), then 000.
export const ES_OPTIONAL_FIELDS_INIT = init(trak({ entries: [audioEntry("mp4a", { channelCount: 2, sampleRate: 16000 },
  esds(Buffer.from([ 0x13, 0x88 ]), { optionalFields: { dependsOnId: 1, ocrStreamId: 3, url: "a:b" } }))], handler: "soun", id: 1 }));

// An AAC track whose `esds` opens with an SL configuration descriptor (tag 6) ahead of its elementary stream descriptor, so the elementary stream descriptor is
// found past a descriptor of another tag. The configuration `14 08` reads 00010 (AAC-LC), 1000 (index 8, 16000 Hz), 0001 (one channel), then 000.
export const DESCRIPTOR_AFTER_OTHER_TAG_INIT = init(trak({ entries: [audioEntry("mp4a", { channelCount: 2, sampleRate: 16000 },
  fullBox("esds", 0, 0, descriptor(6, u8(2)), descriptor(3, esDescriptorBody(Buffer.from([ 0x14, 0x08 ])))))], handler: "soun", id: 1 }));

// An AAC track whose `esds` holds one descriptor, tagged 7 where an elementary stream descriptor is tagged 3, over an elementary stream body whose configuration
// `14 08` reads 00010 (AAC-LC), 1000 (index 8, 16000 Hz), 0001 (one channel), then 000. The `esds` holds no elementary stream descriptor, so the track reads as
// unknown.
export const WRONG_TAG_ES_DESCRIPTOR_INIT = init(trak({ entries: [audioEntry("mp4a", { channelCount: 2, sampleRate: 16000 },
  fullBox("esds", 0, 0, descriptor(7, esDescriptorBody(Buffer.from([ 0x14, 0x08 ])))))], handler: "soun", id: 1 }));

// An AAC track, the last in the init, whose `esds` is the last child of its entry and holds an elementary stream descriptor declaring a 64-byte body over the 25
// bytes the box holds, its nested descriptors inside the box. The configuration `14 08` reads 00010 (AAC-LC), 1000 (index 8, 16000 Hz), 0001 (one channel), then
// 000.
export const OVERRUNNING_DESCRIPTOR_INIT = init(trak({ entries: [audioEntry("mp4a", { channelCount: 2, sampleRate: 16000 },
  fullBox("esds", 0, 0, u8(3), u8(64), esDescriptorBody(Buffer.from([ 0x14, 0x08 ]))))], handler: "soun", id: 1 }));

// An AAC track, the last in the init, whose `esds` is the last child of its entry and holds only an elementary stream descriptor's tag, a declared length of 25
// and the 3 body bytes of its id and flags, so the declared body runs past the end of the init and no decoder configuration lies inside the box. Clamped to the
// `esds`, the search for the decoder configuration begins at the box's end and finds none; unclamped, it would read past the end of the init.
export const OVERRUNNING_DESCRIPTOR_PAST_BUFFER_INIT = init(trak({ entries: [audioEntry("mp4a", { channelCount: 2, sampleRate: 16000 },
  fullBox("esds", 0, 0, u8(3), u8(25), u16(2), u8(0)))], handler: "soun", id: 1 }));

// An `mp4a` track, the last in the init, whose `esds` is the last child of its entry and holds only an elementary stream descriptor's tag, with no length byte
// after it, so a read of that length would run past the end of the init.
export const DESCRIPTOR_TAG_ON_LAST_BYTE_INIT = init(trak({ entries: [audioEntry("mp4a", { channelCount: 2, sampleRate: 16000 }, fullBox("esds", 0, 0, u8(3)))],
  handler: "soun", id: 1 }));

// An `mp4a` track whose decoder configuration names MPEG-2 AAC LC (object type indication 0x67) rather than MPEG-4 audio, over the configuration `14 08` that
// MPEG-4 audio would read as AAC-LC at 16000 Hz mono. The reader interprets an `AudioSpecificConfig` under MPEG-4 audio alone, so the track reads as unknown.
export const MPEG2_AAC_INIT = init(trak({ entries: [audioEntry("mp4a", { channelCount: 2, sampleRate: 16000 },
  esds(Buffer.from([ 0x14, 0x08 ]), { objectType: 0x67 }))], handler: "soun", id: 1 }));

// An AAC track whose configuration escapes to an explicit rate under an entry field of 16000. The configuration `17 80 56 22 08` reads 00010 (AAC-LC), 1111 (the
// escape), 000000001010110001000100 (44100 Hz), 0001 (one channel), then 000 (the GASpecificConfig flags) and a padding bit.
export const EXPLICIT_FREQUENCY_INIT = init(aacTrak(1, Buffer.from([ 0x17, 0x80, 0x56, 0x22, 0x08 ])));

// An AAC track whose sampling-frequency index is a reserved one. The configuration `16 88` reads 00010 (AAC-LC), 1101 (index 13, reserved), 0001 (one channel),
// then 000.
export const RESERVED_FREQUENCY_INIT = init(aacTrak(1, Buffer.from([ 0x16, 0x88 ])));

// An MPEG-4 audio track whose object type escapes past 31. The configuration `f9 50 20` reads 11111 (the escape), 001010 (32 plus 10, object type 42), 1000 (16000
// Hz), 0001 (one channel), then 000 and two padding bits. Object type 42 is not AAC, so the track reads as unknown.
export const ESCAPED_OBJECT_TYPE_INIT = init(aacTrak(1, Buffer.from([ 0xf9, 0x50, 0x20 ])));

// An MPEG-4 audio track whose object type escapes to one whose six bits alone would name AAC-LC. The configuration `f8 50 20` reads 11111 (the escape), 000010 (32
// plus 2, object type 34), 1000 (16000 Hz), 0001 (one channel), then 000 and two padding bits. Object type 34 is not AAC, so the track reads as unknown.
export const ESCAPED_AAC_OBJECT_TYPE_INIT = init(aacTrak(1, Buffer.from([ 0xf8, 0x50, 0x20 ])));

// An AAC track whose configuration is the one byte `11`: 00010 (AAC-LC), then 001, three of the sampling-frequency index's four bits, where the configuration ends.
// Its later fields read past that end, so the track reads as unknown.
export const TRUNCATED_CONFIG_INIT = init(aacTrak(1, Buffer.from([0x11])));

/* An AAC track whose channel configuration defers to a program config element of one front channel pair and one LFE element. The configuration
 * `12 00 04 c4 01 00 20 00 00` reads:
 *
 *   00010 (AAC-LC), 0100 (index 4, 44100 Hz), 0000 (channels from the program config element)
 *   0 0 0 (the GASpecificConfig's frame length, core coder and extension flags)
 *   0000 (element instance tag), 01 (object type LC), 0011 (the element's own sampling-frequency index, 3, 48000 Hz)
 *   0001 0000 0000 01 (one front, no side, no back and one LFE element), 000 0000 (no associated data or coupling channel elements)
 *   0 0 0 (no mono, stereo or matrix mixdown)
 *   1 0000 (the front element is a channel pair, tag 0), 0000 (the LFE element's tag)
 *   00000 (byte alignment), 00000000 (an empty comment field)
 *
 * The front pair counts two and the LFE one, three channels in all. The element's own index names 48000 Hz where the configuration's names 44100, so the row
 * tells which index the rate is read from.
 */
export const PROGRAM_CONFIG_INIT = init(aacTrak(1, Buffer.from([ 0x12, 0x00, 0x04, 0xc4, 0x01, 0x00, 0x20, 0x00, 0x00 ])));

/* An AAC track whose channel configuration defers to a program config element, and whose GASpecificConfig sets its core coder flag, which places a 14-bit core
 * coder delay ahead of the element. The configuration `11 82 aa a8 14 20 14 00 04 64 00 00` reads:
 *
 *   00010 (AAC-LC), 0011 (index 3, 48000 Hz), 0000 (channels from the program config element)
 *   0 1 01010101010101 0 (the frame length flag, the core coder flag set, its 14-bit delay, and the extension flag)
 *   0000 (element instance tag), 01 (object type LC), 0100 (the element's own sampling-frequency index, 4, 44100 Hz)
 *   0010 0000 0001 01 (two front, no side, one back and one LFE element), 000 0000 (no associated data or coupling channel elements)
 *   0 0 0 (no mono, stereo or matrix mixdown)
 *   0 0000 (a front single channel, tag 0), 1 0001 (a front channel pair, tag 1), 1 0010 (a back channel pair, tag 2), 0000 (the LFE element's tag)
 *   00000 (byte alignment), 00000000 (an empty comment field)
 *
 * The single channel counts one, each pair two and the LFE one, six channels in all. The element's own index names 44100 Hz where the configuration's names
 * 48000, so the row tells which index the rate is read from.
 */
export const CORE_CODER_DELAY_INIT = init(aacTrak(1, Buffer.from([ 0x11, 0x82, 0xaa, 0xa8, 0x14, 0x20, 0x14, 0x00, 0x04, 0x64, 0x00, 0x00 ])));

/* An AAC track whose channel configuration defers to a program config element carrying all three optional mixdown fields ahead of its one front channel pair,
 * under an `mp4a` entry whose own fields state one channel at 16000 Hz. The configuration `11 80 05 04 00 01 18 d4 00 00` reads:
 *
 *   00010 (AAC-LC), 0011 (index 3, 48000 Hz), 0000 (channels from the program config element)
 *   0 0 0 (the GASpecificConfig's frame length, core coder and extension flags)
 *   0000 (element instance tag), 01 (object type LC), 0100 (the element's own sampling-frequency index, 4, 44100 Hz)
 *   0001 0000 0000 00 (one front, no side, no back and no LFE element), 000 0000 (no associated data or coupling channel elements)
 *   1 0001 (a mono mixdown, element 1), 1 0001 (a stereo mixdown, element 1), 1 01 0 (a matrix mixdown, index 1, no pseudo surround)
 *   1 0000 (the front element is a channel pair, tag 0)
 *   000000 (byte alignment), 00000000 (an empty comment field)
 *
 * The front pair counts two channels. Each mixdown element number ends in a set bit and the pseudo surround bit is clear, so a reader that steps over any one of
 * the three mixdown fields one bit short reads the pair's flag from the pseudo surround bit and counts a single channel. The element's own index names 44100 Hz
 * where the configuration's names 48000, and the entry disagrees with the configuration on the channel count and the rate, so the row tells which source each
 * fact is read from.
 */
export const MIXDOWN_PCE_INIT = init(trak({ entries: [audioEntry("mp4a", { channelCount: 1, sampleRate: 16000 },
  esds(Buffer.from([ 0x11, 0x80, 0x05, 0x04, 0x00, 0x01, 0x18, 0xd4, 0x00, 0x00 ])))], handler: "soun", id: 1 }));

// An AAC track whose channel configuration names six channels directly. The configuration `11 b0` reads 00010 (AAC-LC), 0011 (index 3, 48000 Hz), 0110
// (configuration 6, six channels), then 000.
export const CHANNEL_CONFIGURATION_SIX_INIT = init(aacTrak(1, Buffer.from([ 0x11, 0xb0 ])));

// An AAC track whose channel configuration names the eight-channel layout. The configuration `11 b8` reads 00010 (AAC-LC), 0011 (index 3, 48000 Hz), 0111
// (configuration 7, eight channels), then 000.
export const CHANNEL_CONFIGURATION_SEVEN_INIT = init(aacTrak(1, Buffer.from([ 0x11, 0xb8 ])));

// An AAC track whose channel configuration is a reserved one. The configuration `11 c0` reads 00010 (AAC-LC), 0011 (index 3, 48000 Hz), 1000 (configuration 8,
// reserved), then 000.
export const RESERVED_CHANNEL_CONFIGURATION_INIT = init(aacTrak(1, Buffer.from([ 0x11, 0xc0 ])));

// An SBR track over an AAC-LC core. The configuration `2b 11 88 00` reads 00101 (SBR), 0110 (index 6, a 24000 Hz core), 0010 (two channels), 0011 (index 3, a
// 48000 Hz extension), 00010 (the core's AAC-LC), then 000 (the GASpecificConfig flags) and padding. The decoder produces the extension rate.
export const SBR_INIT = init(aacTrak(1, Buffer.from([ 0x2b, 0x11, 0x88, 0x00 ])));

// A PS track over a mono AAC-LC core. The configuration `eb 09 88 00` reads 11101 (PS), 0110 (index 6, a 24000 Hz core), 0001 (one channel), 0011 (index 3, a
// 48000 Hz extension), 00010 (the core's AAC-LC), then 000 (the GASpecificConfig flags) and padding. The decoder produces stereo at the extension rate.
export const PS_INIT = init(aacTrak(1, Buffer.from([ 0xeb, 0x09, 0x88, 0x00 ])));

// An H.264 track whose sample entry codes 1280 by 720 under a `tkhd` presenting 1920 by 1080. The `avcC` reads configuration version 1, profile 100 (High),
// compatibility 0 and level 40.
export const AVC_INIT = init(trak({ entries: [visualEntry("avc1", 1280, 720, box("avcC", Buffer.from([ 1, 100, 0, 40, 0xff, 0xe0, 0 ])))], handler: "vide",
  height: 1080, id: 1, width: 1920 }));

// An H.264 track in the `avc3` entry at 1920 by 1080, whose parameter sets travel in the stream rather than in the record. The `avcC` reads configuration version
// 1, profile 77 (Main), compatibility 0 and level 41, with no sequence or picture parameter sets.
export const AVC3_INIT = init(trak({ entries: [visualEntry("avc3", 1920, 1080, box("avcC", Buffer.from([ 1, 77, 0, 41, 0xff, 0xe0, 0 ])))], handler: "vide",
  height: 1080, id: 1, width: 1920 }));

// An HEVC track in the `hev1` entry at 1920 by 1080. The `hvcC` reads configuration version 1, then 0x02 (profile space 0, main tier, `general_profile_idc` 2 for
// Main 10), four compatibility bytes, six constraint bytes, and `general_level_idc` 120 at byte 12.
export const HEV1_INIT = init(trak({ entries: [visualEntry("hev1", 1920, 1080, box("hvcC", Buffer.from([ 1, 0x02, 0x20, 0, 0, 0, 0x90, 0, 0, 0, 0, 0, 120, 0xf0,
  0, 0xfc, 0xfd, 0xf8, 0xf8, 0, 0, 0x0f, 0 ])))], handler: "vide", height: 1080, id: 1, width: 1920 }));

// An AV1 track at 1920 by 1080. The `av1C` reads 0x81 (marker and version 1), then 0x0d: 000 (`seq_profile` 0, Main) and 01101 (`seq_level_idx_0` 13, level 5.1),
// then zeroed tier, depth and chroma fields.
export const AV1_INIT = init(trak({ entries: [visualEntry("av01", 1920, 1080, box("av1C", Buffer.from([ 0x81, 0x0d, 0x0c, 0 ])))], handler: "vide", height: 1080,
  id: 1, width: 1920 }));

// An H.264 track whose `avc1` entry codes 1920 by 1080 and carries no `avcC`, so the entry has no profile or level to read.
export const VIDEO_WITHOUT_CONFIG_INIT = init(trak({ entries: [visualEntry("avc1", 1920, 1080)], handler: "vide", height: 1080, id: 1, width: 1920 }));

// An H.264 track, the last in the init, whose `avc1` entry codes 1920 by 1080 and carries an `avcC` of 2 bytes, configuration version 1 and profile 100, short of
// the level at byte 3. The `avcC` ends where the init does, so a read of the level that ran past the record would run past the init.
export const SHORT_AVCC_INIT = init(trak({ entries: [visualEntry("avc1", 1920, 1080, box("avcC", Buffer.from([ 1, 100 ])))], handler: "vide", height: 1080, id: 1,
  width: 1920 }));

// An AAC track in a QuickTime sound description at version 1, whose children begin 16 bytes later and wrap the `esds` in a `wave` beside a `frma`. The configuration
// `11 90` reads 00010 (AAC-LC), 0011 (index 3, 48000 Hz), 0010 (two channels), then 000.
export const QUICKTIME_V1_INIT = init(trak({ entries: [audioEntry("mp4a", { channelCount: 2, sampleRate: 48000, version: 1 }, QUICKTIME_V1_SIZES,
  box("wave", box("frma", Buffer.from("mp4a", "latin1")), esds(Buffer.from([ 0x11, 0x90 ]))))], handler: "soun", id: 1 }));

/* An AAC track in a QuickTime sound description at version 2, whose children begin at entry offset 72, 20 bytes past where version 1 places them, and wrap the
 * `esds` in a `wave` beside a `frma`. The version 0 fields carry the values version 2 fixes them at - a channel count of 3, a sample size of 16, a compression
 * id of -2, a packet size of 0 and a 16.16 rate of 1 - and the version 2 fields follow them, stating 48000 Hz mono. The configuration `12 10` reads 00010
 * (AAC-LC), 0100 (index 4, 44100 Hz), 0010 (two channels), then 000, so the header disagrees with the configuration on the rate and on the channel count.
 */
export const QUICKTIME_V2_INIT = init(trak({ entries: [audioEntry("mp4a", { channelCount: 3, compressionId: 0xfffe, sampleRate: 1, version: 2 }, QUICKTIME_V2_FIELDS,
  box("wave", box("frma", Buffer.from("mp4a", "latin1")), esds(Buffer.from([ 0x12, 0x10 ]))))], handler: "soun", id: 1 }));

// An AAC track whose QuickTime sound-description version reads 3, a layout the reader does not know, so its children go unlocated. The `esds` sits where version 0
// places it, so a reader that fell back to that layout would read its configuration `11 90` as AAC-LC at 48000 Hz stereo.
export const UNKNOWN_QUICKTIME_VERSION_INIT = init(trak({ entries: [audioEntry("mp4a", { channelCount: 2, sampleRate: 48000, version: 3 },
  esds(Buffer.from([ 0x11, 0x90 ])))], handler: "soun", id: 1 }));

// An AAC track as an ISO `AudioSampleEntryV1` under an `stsd` of version 1: the entry writes 1 where QuickTime writes its sound-description version, yet its
// children begin where version 0 places them. The configuration `12 08` reads 00010 (AAC-LC), 0100 (index 4, 44100 Hz), 0001 (one channel), then 000.
export const ISO_V1_AUDIO_INIT = init(trak({ entries: [audioEntry("mp4a", { channelCount: 1, sampleRate: 44100, version: 1 }, esds(Buffer.from([ 0x12, 0x08 ])))],
  handler: "soun", id: 1, stsdVersion: 1 }));

// An entry type the reader does not describe, under a sound handler.
export const UNKNOWN_ENTRY_INIT = init(trak({ entries: [box("xyz1", Buffer.alloc(6), u16(1), Buffer.alloc(20))], handler: "soun", id: 1 }));

// Tracks under handlers the reader does not know: an H.264 entry under `meta`, which reads as video because the entry decides a codec arm's kind, and a
// `tx3g` text entry under `text`, which reads as unknown in both its codec and its kind.
export const UNKNOWN_HANDLER_INIT = init(trak({ entries: [visualEntry("avc1", 640, 360, box("avcC", Buffer.from([ 1, 66, 0, 30, 0xff, 0xe0, 0 ])))],
  handler: "meta", id: 1 }), trak({ entries: [box("tx3g", Buffer.alloc(6), u16(1), Buffer.alloc(30))], handler: "text", id: 2 }));

// A track whose `mdia` holds no `hdlr`, over an entry of type `zzzz` the reader does not describe, so no handler names the track's kind.
export const MISSING_HDLR_INIT = init(trak({ entries: [box("zzzz", Buffer.alloc(6), u16(1))], id: 1 }));

/* A track whose `hdlr` payload holds 4 bytes, its version and flags alone, short of the handler type at payload offset 8, followed directly by a box of type
 * `soun` holding a 4-byte payload and then the `minf`, over an entry of type `zzzz` the reader does not describe. The `tkhd` is version 0, holding its two times
 * and track id 1.
 *
 * The handler type's offset lies 4 bytes past the `hdlr`'s end, on the type of the box that follows, so a read that ran past the `hdlr` would take `soun` for the
 * handler type. That box carries a payload, so its size exceeds its header's and the walk of the `mdia` reaches the `minf` however a box of exactly its header's
 * size is treated.
 */
export const SHORT_HDLR_INIT = init(box("trak", fullBox("tkhd", 0, 7, Buffer.alloc(8), u32(1)), box("mdia", fullBox("hdlr", 0, 0), box("soun", Buffer.alloc(4)),
  box("minf", box("stbl", fullBox("stsd", 0, 0, u32(1), box("zzzz", Buffer.alloc(6), u16(1))))))));

// A `moov` written with a 64-bit `largesize`, holding the companion H.264 track.
export const LARGESIZE_INIT = Buffer.concat([ box("ftyp", Buffer.from("iso6", "latin1"), u32(0)), largeBox("moov", companionVideoTrak(1)) ]);

// A `moov`, the last box of the init, holding the companion H.264 track and ending with the 8 bytes `00 00 00 01` `xxxx`: a box header whose size of 1 defers to
// a 64-bit `largesize` the `moov` has no room for, so a read of that `largesize` would run past the init.
export const CUT_LARGESIZE_HEADER_INIT = init(companionVideoTrak(1), u32(1), Buffer.from("xxxx", "latin1"));

// A `moov` whose size field reads 0, which runs it to the end of the init, holding the companion H.264 track.
export const TO_END_BOX_INIT = Buffer.concat([ box("ftyp", Buffer.from("iso6", "latin1"), u32(0)), toEndBox("moov", companionVideoTrak(1)) ]);

/* A `moov` of ordinary size holding the companion H.264 track and an AAC `trak` whose size field reads 0 over the AAC track's payload, then a `free` box after the
 * `moov`. The size of zero runs the `trak` to the end of the `moov` holding it, short of the end of the init, which the `free` box lies past. The configuration
 * `14 08` reads 00010 (AAC-LC), 1000 (index 8, 16000 Hz), 0001 (one channel), then 000.
 */
export const NESTED_TO_END_BOX_INIT = Buffer.concat([ box("ftyp", Buffer.from("iso6", "latin1"), u32(0)), box("moov", companionVideoTrak(1),
  toEndBox("trak", aacTrak(2, Buffer.from([ 0x14, 0x08 ])).subarray(8))), box("free") ]);

// A `moov` holding the companion H.264 track, then the four bytes `00 00 00 04`, a box size smaller than the 8-byte header it opens, then an AAC track whose
// configuration `14 08` reads 00010 (AAC-LC), 1000 (index 8, 16000 Hz), 0001 (one channel), then 000. The short size ends the walk of the `moov`, and a walk that
// stepped past it by its four declared bytes would land on the AAC `trak`'s header.
export const SHORT_SIZE_BOX_INIT = init(companionVideoTrak(1), u32(4), aacTrak(2, Buffer.from([ 0x14, 0x08 ])));

// A `moov` holding the companion H.264 track, then an 8-byte `free` box with no payload, a size exactly its header's, then an AAC track whose configuration `14 08`
// reads 00010 (AAC-LC), 1000 (index 8, 16000 Hz), 0001 (one channel), then 000.
export const EMPTY_BOX_INIT = init(companionVideoTrak(1), box("free"), aacTrak(2, Buffer.from([ 0x14, 0x08 ])));

// A track with no `tkhd` at all, which has no id to report, then a track whose `tkhd` is version 1, whose track id sits 8 bytes later than version 0 places it.
export const MISSING_TKHD_INIT = init(trak({ entries: [visualEntry("avc1", 640, 360, box("avcC", Buffer.from([ 1, 66, 0, 30, 0xff, 0xe0, 0 ])))],
  handler: "vide" }), trak({ entries: [visualEntry("avc1", 640, 360, box("avcC", Buffer.from([ 1, 66, 0, 30, 0xff, 0xe0, 0 ])))], handler: "vide", id: 2,
  tkhdVersion: 1 }));

/* The companion H.264 track, then a track whose `tkhd` payload holds 8 bytes, its version 0, flags and creation time, short of the track id at payload offset 12,
 * ahead of an `mdia` holding an AAC entry whose configuration `14 08` reads 00010 (AAC-LC), 1000 (index 8, 16000 Hz), 0001 (one channel), then 000. The `mdia`
 * is the one a `trak` built without an id holds, its payload past the `trak` header.
 *
 * The track id's offset lies 4 bytes past the `tkhd`'s end, on the `mdia` header's type, so a read that ran past the `tkhd` would take `mdia` for the track id
 * and describe the track.
 */
export const SHORT_TKHD_INIT = init(companionVideoTrak(1), box("trak", fullBox("tkhd", 0, 7, u32(0)), trak({ entries: [audioEntry("mp4a",
  { channelCount: 2, sampleRate: 16000 }, esds(Buffer.from([ 0x14, 0x08 ])))], handler: "soun" }).subarray(8)));

// A video track whose `stsd` lists no entry.
export const EMPTY_STSD_INIT = init(trak({ entries: [], handler: "vide", id: 1 }));

// An audio track whose `stsd` counts one entry and holds none.
export const STSD_COUNT_WITHOUT_ENTRY_INIT = init(trak({ entries: [], handler: "soun", id: 1, stsdCount: 1 }));

// An audio track whose `stsd` count reads 0 while one `mp4a` entry follows it, an entry whose configuration `14 08` reads 00010 (AAC-LC), 1000 (index 8,
// 16000 Hz), 0001 (one channel), then 000.
export const STSD_ZERO_COUNT_WITH_ENTRY_INIT = init(trak({ entries: [audioEntry("mp4a", { channelCount: 2, sampleRate: 16000 }, esds(Buffer.from([ 0x14, 0x08 ])))],
  handler: "soun", id: 1, stsdCount: 0 }));

// An audio track whose `stsd` lists two entries: an `mp4a` entry whose configuration `14 08` reads 00010 (AAC-LC), 1000 (index 8, 16000 Hz), 0001 (one channel),
// then 000, and then an Opus entry whose `dOps` reads an output channel count of 2.
export const TWO_ENTRY_STSD_INIT = init(trak({ entries: [ audioEntry("mp4a", { channelCount: 2, sampleRate: 16000 }, esds(Buffer.from([ 0x14, 0x08 ]))),
  audioEntry("Opus", { channelCount: 2, sampleRate: 48000 }, box("dOps", u8(0), u8(2), u16(312), u32(48000), u16(0), u8(0))) ], handler: "soun", id: 1 }));

// The AI Pro's video `trak`, bytes 220 to 811 of its capture, beside an AAC track at 48000 Hz mono where the capture's runs at 16000 Hz: the stream a reconnect
// delivers when the audio rate moves under an unchanged codec label. The configuration `11 88` reads 00010 (AAC-LC), 0011 (index 3, 48000 Hz), 0001 (one channel),
// then 000.
export const AUDIO_RATE_CHANGED_INIT = init(AI_PRO_INIT.subarray(220, 811), aacTrak(2, Buffer.from([ 0x11, 0x88 ])));
