/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * codecs.ts: The media group's codec vocabulary - the codec names, the configuration each codec's reader yields, and the rules every codec reader shares.
 */

/**
 * The media group's codec vocabulary. This module is Layer 1: no I/O, no time, no side effects. It names the codecs the group reads and writes, declares the
 * configuration each codec's reader yields from one parse of the stream's own parameters, and states the rules more than one codec reader shares.
 *
 * A configuration holds what an fMP4 sample entry carries and what a player is configured from: the record the entry's configuration box holds (`avcC`, `hvcC`,
 * `av1C`, `dOps`, or the `AudioSpecificConfig` an `esds` wraps), the RFC 6381 label naming the codec, profile and level, and the facts the init reader reports back
 * from that entry.
 *
 * H.264 and HEVC frames carry their NAL units length-prefixed, each unit behind a four-byte big-endian length that counts the unit alone:
 *
 * ```
 * +----------------+-------------------+----------------+-------------------+
 * | length (u32)   | unit              | length (u32)   | unit              | ...
 * +----------------+-------------------+----------------+-------------------+
 * ```
 *
 * @module ProtectCodecs
 */
import { readUInt, u16 } from "../boxes.ts";
import { ProtectProtocolError } from "../../../shared/errors.ts";
import type { Span } from "../boxes.ts";

/**
 * The audio codecs a livestream carries and the media group reads and writes. A livestream asks for one of them as its `audio`.
 *
 * @category Transport
 */
export type LivestreamAudioCodec = "aac" | "opus";

/**
 * The video codecs a livestream carries and the media group reads and writes.
 *
 * @category Transport
 */
export type LivestreamVideoCodec = "av1" | "h264" | "h265";

/**
 * What an audio codec's reader yields from one parse: the decoded channel count and sample rate, the codec, its RFC 6381 label, and the record its sample entry
 * carries - the `AudioSpecificConfig` an `esds` wraps for AAC, the `dOps` payload for Opus.
 *
 * @category Transport
 */
export interface AudioConfiguration {

  readonly channels: number;
  readonly codec: LivestreamAudioCodec;
  readonly label: string;
  readonly record: Buffer;
  readonly sampleRate: number;
}

/**
 * What a video codec's reader yields from one parse of the stream's parameter sets: the coded width and height, the profile and level, the codec, its RFC 6381
 * label, and the record its sample entry's configuration box carries (`avcC`, `hvcC`, `av1C`).
 *
 * @category Transport
 */
export interface VideoConfiguration {

  readonly codec: LivestreamVideoCodec;
  readonly height: number;
  readonly label: string;
  readonly level: number;
  readonly profile: number;
  readonly record: Buffer;
  readonly width: number;
}

/**
 * A video frame's payload split by role: its parameter sets, each whole as its codec's reader takes it, and its sample, the views whose concatenation in order is
 * the sample an fMP4 track carries.
 *
 * @category Transport
 */
export interface VideoFrameParts {

  readonly parameterSets: readonly Buffer[];
  readonly sample: readonly Buffer[];
}

// The audio sample entries the media group reads and writes, each with its codec: `mp4a` carries AAC, its record in an `esds`, and `Opus` carries Opus, its record
// in a `dOps`.
export const AUDIO_FORMATS: ReadonlyMap<string, LivestreamAudioCodec> = new Map([

  [ "mp4a", "aac" ],
  [ "Opus", "opus" ]
]);

// The video sample entries the media group reads and writes, each with its codec and the child box holding its decoder configuration record. The entries of one
// codec differ only in where the stream's parameter sets travel - in the record for `avc1` and `hvc1`, in the stream for `avc3` and `hev1` - so both carry the
// same record, and each codec's first entry is the one that carries them in the record.
export const VIDEO_FORMATS: ReadonlyMap<string, { readonly codec: LivestreamVideoCodec; readonly config: string }> = new Map([

  [ "av01", { codec: "av1", config: "av1C" } ],
  [ "avc1", { codec: "h264", config: "avcC" } ],
  [ "avc3", { codec: "h264", config: "avcC" } ],
  [ "hvc1", { codec: "h265", config: "hvcC" } ],
  [ "hev1", { codec: "h265", config: "hvcC" } ]
]);

// The chroma subsampling each `chroma_format_idc` names, horizontal then vertical, as H.264 Table 6-1 and H.265 Table 6-1 both state it: 4:0:0 and 4:4:4
// subsample neither way, 4:2:0 both ways and 4:2:2 across alone. A separate color plane reads as 4:0:0, and an index past the table is one the specifications
// reserve.
export const CHROMA_SUBSAMPLING: readonly (readonly [ number, number ])[] = [ [ 1, 1 ], [ 2, 2 ], [ 2, 1 ], [ 1, 1 ] ];

// A length prefix's width: every unit of a length-prefixed frame follows four bytes holding its length.
export const LENGTH_PREFIX_SIZE = 4;

// The longest unit a decoder configuration record can list, its length held in 16 bits.
const MAX_RECORD_UNIT_LENGTH = 0xffff;

/**
 * List parameter sets in the form an `avcC` or `hvcC` record carries them: each unit behind its 16-bit big-endian length.
 *
 * @param units - The parameter sets, each a whole NAL unit with no length prefix.
 *
 * @returns Each unit's length and then the unit, in order.
 *
 * @throws {@link ProtectProtocolError} if a unit is longer than its 16-bit length can state.
 *
 * @category Codec
 */
export function lengthPrefixed16(units: readonly Buffer[]): Buffer[] {

  if(units.some((unit) => unit.length > MAX_RECORD_UNIT_LENGTH)) {

    throw new ProtectProtocolError("Parameter set is too long for the 16-bit length a decoder configuration record gives it.");
  }

  return units.flatMap((unit) => [ u16(unit.length), unit ]);
}

/**
 * Walk a length-prefixed frame into its units.
 *
 * @param data - A frame of NAL units, each behind a four-byte big-endian length.
 *
 * @returns Each unit's span within `data`, in order, its prefix the four bytes before `start`. A frame of no bytes holds no unit.
 *
 * @throws {@link ProtectProtocolError} if a prefix runs past the frame's end, a unit's length is zero, or a unit runs past the frame's end.
 *
 * @category Codec
 */
export function lengthPrefixedUnits(data: Buffer): Span[] {

  const frame = { end: data.length, start: 0 };
  const units: Span[] = [];
  let offset = 0;

  while(offset < data.length) {

    const length = readUInt(data, frame, offset, LENGTH_PREFIX_SIZE);

    if(length === undefined) {

      throw new ProtectProtocolError("Length-prefixed frame ends inside a unit's four-byte length.");
    }

    if(length === 0) {

      throw new ProtectProtocolError("Length-prefixed frame holds a unit whose length reads zero.");
    }

    const start = offset + LENGTH_PREFIX_SIZE;

    if((start + length) > data.length) {

      throw new ProtectProtocolError("Length-prefixed frame holds a unit whose length runs past the frame's end.");
    }

    units.push({ end: start + length, start });
    offset = start + length;
  }

  return units;
}
