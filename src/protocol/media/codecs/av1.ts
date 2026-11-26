/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * av1.ts: The AV1 reader - a temporal unit split into its sequence header and its sample, and the configuration an fMP4 track is written from.
 */

/**
 * The AV1 reader: a temporal unit split into its sequence header and its sample, and the configuration an fMP4 track is written from, read once from the
 * stream's own sequence header. This module is Layer 1: no I/O, no time, no side effects - bytes in, values out, or a {@link ProtectProtocolError} naming the
 * fault.
 *
 * A temporal unit is a run of OBUs (AV1 § 5.3), each a header byte, an extension byte when flagged, and the payload's size as a leb128 when the size field is
 * present, which is at most eight bytes of seven bits each, the low group first (§ 4.10.5). An OBU without the size field runs to the end of the data
 * (AV1-ISOBMFF § 2.4). Type 1 is the sequence header and type 2 the temporal delimiter.
 *
 * ```
 * bit    7                   6 5 4 3    2                    1                    0
 *        obu_forbidden_bit   obu_type   obu_extension_flag   obu_has_size_field   obu_reserved_1bit
 * ```
 *
 * The configuration's facts come from the sequence header (§ 5.5.1): `seq_profile`, operating point 0's level and tier, the maximum frame size, and the color
 * configuration (§ 5.5.2), with every field between them read to reach the next. The coded size is the maximum frame size (AV1-ISOBMFF § 2.2.4).
 *
 * The record is the `AV1CodecConfigurationRecord` an `av1C` box carries (AV1-ISOBMFF § 2.3.3):
 *
 * | Field                                                                                    | Bits             | Value                                 |
 * |------------------------------------------------------------------------------------------|------------------|---------------------------------------|
 * | `marker`, `version`                                                                      | 1, 7             | 1, then 1                             |
 * | `seq_profile`, `seq_level_idx_0`                                                         | 3, 5             | the sequence header's                 |
 * | `seq_tier_0`, `high_bitdepth`, `twelve_bit`, `monochrome`                                | 1, 1, 1, 1       | the sequence header's                 |
 * | `chroma_subsampling_x`, `chroma_subsampling_y`, `chroma_sample_position`                 | 1, 1, 2          | the sequence header's                 |
 * | reserved, `initial_presentation_delay_present`, reserved                                 | 3, 1, 4          | 0                                     |
 * | `configOBUs`                                                                             | the rest         | the sequence header OBU, whole        |
 *
 * The label follows AV1-ISOBMFF § 5: `av01.`, `seq_profile`, `.` and the level in two digits with `M` or `H` for the tier, `.` and the bit depth in two digits.
 * When the color configuration differs from the defaults the short form asserts, the long form follows: `.` and `mono_chrome`, `.` and the subsampling as three
 * digits (`subsampling_x`, `subsampling_y`, and `chroma_sample_position` when both are 1, 0 otherwise), then `.` and the color primaries, the transfer
 * characteristics and the matrix coefficients in two digits each, 01 when the stream describes no color, and `.` and the full range flag. A default stream reads
 * `av01.0.05M.08`, and a 10-bit BT.2100 PQ stream `av01.0.08M.10.0.110.09.16.09.0`.
 *
 * @module ProtectAv1
 */
import type { VideoConfiguration, VideoFrameParts } from "./codecs.ts";
import { readUInt, u8 } from "../boxes.ts";
import { BitReader } from "../bits.ts";
import { ProtectProtocolError } from "../../../shared/errors.ts";
import type { Span } from "../boxes.ts";

// The OBU types the reader acts on.
const ObuType = {

  SEQUENCE_HEADER: 1,
  TEMPORAL_DELIMITER: 2
} as const;

// The OBU header byte's fields, and the size field's longest form.
const OBU_FORBIDDEN = 0x80;
const OBU_EXTENSION = 0x04;
const OBU_HAS_SIZE = 0x02;
const LEB128_MAX_BYTES = 8;

// The highest `seq_profile` the specification defines: 0 is Main, 1 High and 2 Professional.
const MAX_SEQ_PROFILE = 2;

// The level above which an operating point codes its tier; every level up to it is main tier.
const TIERED_LEVEL = 7;

// A uvlc value of 32 or more leading zeros carries no value bits (§ 4.10.3).
const UVLC_MAX_VALUE_BITS = 32;

// The color description `color_config` infers when the stream describes none: 2 for each field, unspecified.
const COLOR_UNSPECIFIED = 2;

// The sRGB color description, BT.709 primaries, the sRGB transfer and the identity matrix, which codes 4:4:4 at full range with no subsampling field.
const SRGB = { matrix: 0, primaries: 1, transfer: 13 } as const;

// The record's marker and version byte.
const RECORD_MARKER_VERSION = 0x81;

// The long form's fields that the short form asserts: not monochrome, 4:2:0 with an unknown sample position, BT.709 primaries, transfer and matrix, limited range.
const LABEL_DEFAULT_COLOR = ".0.110.01.01.01.0";

// The label's code for a color field the stream does not describe, BT.709 under the short form's defaults.
const LABEL_UNDESCRIBED_COLOR = 1;

// One OBU within its data: where it starts and ends, where its payload starts, its type, and whether it carries the size field.
interface Obu {

  readonly end: number;
  readonly payload: number;
  readonly sizeField: boolean;
  readonly start: number;
  readonly type: number;
}

// What the reader takes from a sequence header: the fields the record and the label carry, and the coded size.
interface SequenceHeader {

  readonly bitDepth: number;
  readonly chromaSamplePosition: number;
  readonly colorDescribed: boolean;
  readonly colorPrimaries: number;
  readonly colorRange: number;
  readonly height: number;
  readonly highBitdepth: number;
  readonly level: number;
  readonly matrixCoefficients: number;
  readonly monoChrome: number;
  readonly profile: number;
  readonly subsamplingX: number;
  readonly subsamplingY: number;
  readonly tier: number;
  readonly transferCharacteristics: number;
  readonly twelveBit: number;
  readonly width: number;
}

/**
 * Split an AV1 temporal unit into its sequence header and its sample.
 *
 * @param data - The temporal unit's OBUs.
 *
 * @returns Each sequence header OBU, whole, as a parameter set, and every OBU but the temporal delimiters, the sequence header kept, as the sample an `av01` track
 *   carries, each a view of the whole OBU.
 *
 * @throws {@link ProtectProtocolError} if an OBU sets its forbidden bit, ends inside its header or its size field, or runs past the end of the data.
 *
 * @category Codec
 */
export function splitAv1Frame(data: Buffer): VideoFrameParts {

  const parameterSets: Buffer[] = [];
  const sample: Buffer[] = [];

  let offset = 0;

  while(offset < data.length) {

    const obu = readObu(data, offset);
    const whole = data.subarray(obu.start, obu.end);

    if(obu.type === ObuType.SEQUENCE_HEADER) {

      parameterSets.push(whole);
    }

    if(obu.type !== ObuType.TEMPORAL_DELIMITER) {

      sample.push(whole);
    }

    offset = obu.end;
  }

  return { parameterSets, sample };
}

/**
 * Read the configuration an fMP4 track is written from out of an AV1 stream's sequence header.
 *
 * @param parameterSets - The stream's sequence header OBUs, each whole. The first states the facts and becomes the record's `configOBUs`.
 *
 * @returns The configuration: the coded width and height, `seq_profile` and `seq_level_idx[0]`, the `av1C` record, and the `av01` label.
 *
 * @throws {@link ProtectProtocolError} if an OBU is malformed as {@link splitAv1Frame} refuses it, the set holds no sequence header, the first lacks its size field,
 *   or its sequence header names a profile above 2 or ends before its last field.
 *
 * @category Codec
 */
export function readAv1Configuration(parameterSets: readonly Buffer[]): VideoConfiguration {

  const [first] = parameterSets.map((unit) => ({ obu: readObu(unit, 0), unit })).filter(({ obu }) => obu.type === ObuType.SEQUENCE_HEADER);

  if(first === undefined) {

    throw new ProtectProtocolError("AV1 parameter sets carry no sequence header OBU.");
  }

  // An `av1C` record's `configOBUs` must carry their size fields (AV1-ISOBMFF § 2.3.4).
  if(!first.obu.sizeField) {

    throw new ProtectProtocolError("AV1 sequence header OBU carries no size field, which an av1C record requires.");
  }

  const header = readSequenceHeader(first.unit, { end: first.obu.end, start: first.obu.payload });
  const fields = (header.tier << 7) | (header.highBitdepth << 6) | (header.twelveBit << 5) | (header.monoChrome << 4) | (header.subsamplingX << 3) |
    (header.subsamplingY << 2) | header.chromaSamplePosition;

  return {

    codec: "av1",
    height: header.height,
    label: label(header),
    level: header.level,
    profile: header.profile,
    record: Buffer.concat([ u8(RECORD_MARKER_VERSION), u8((header.profile << 5) | header.level), u8(fields), u8(0),
      first.unit.subarray(first.obu.start, first.obu.end) ]),
    width: header.width
  };
}

// Read the OBU that starts at `start` within its data: its header byte, its extension byte when flagged, and its size field when present.
function readObu(data: Buffer, start: number): Obu {

  const whole = { end: data.length, start: 0 };
  const header = readUInt(data, whole, start, 1);

  if(header === undefined) {

    throw new ProtectProtocolError("AV1 OBU is empty and carries no header.");
  }

  if((header & OBU_FORBIDDEN) !== 0) {

    throw new ProtectProtocolError("AV1 OBU sets its forbidden bit.");
  }

  const type = (header >> 3) & 0x0f;
  const sizeField = (header & OBU_HAS_SIZE) !== 0;
  let offset = start + (((header & OBU_EXTENSION) !== 0) ? 2 : 1);

  if(offset > data.length) {

    throw new ProtectProtocolError("AV1 OBU ends inside its extension byte.");
  }

  if(!sizeField) {

    return { end: data.length, payload: offset, sizeField, start, type };
  }

  let size = 0;

  for(let group = 0; group < LEB128_MAX_BYTES; group++) {

    const byte = readUInt(data, whole, offset, 1);

    if(byte === undefined) {

      throw new ProtectProtocolError("AV1 OBU ends inside its size field.");
    }

    offset++;
    size += (byte & 0x7f) * (128 ** group);

    if((byte & 0x80) === 0) {

      break;
    }
  }

  if((offset + size) > data.length) {

    throw new ProtectProtocolError("AV1 OBU's size runs past the end of its data.");
  }

  return { end: offset + size, payload: offset, sizeField, start, type };
}

// The label's short form, then the long form's color fields when they differ from the defaults the short form asserts.
function label(header: SequenceHeader): string {

  const twoDigits = (value: number): string => String(value).padStart(2, "0");
  const color = header.colorDescribed ? [ header.colorPrimaries, header.transferCharacteristics, header.matrixCoefficients ] :
    [ LABEL_UNDESCRIBED_COLOR, LABEL_UNDESCRIBED_COLOR, LABEL_UNDESCRIBED_COLOR ];
  const samplePosition = ((header.subsamplingX === 1) && (header.subsamplingY === 1)) ? header.chromaSamplePosition : 0;
  const long = "." + [ String(header.monoChrome), String(header.subsamplingX) + String(header.subsamplingY) + String(samplePosition), ...color.map(twoDigits),
    String(header.colorRange) ].join(".");

  return "av01." + String(header.profile) + "." + twoDigits(header.level) + ((header.tier === 1) ? "H" : "M") + "." + twoDigits(header.bitDepth) +
    ((long === LABEL_DEFAULT_COLOR) ? "" : long);
}

/* Read a sequence header's fields through its color configuration, in the order § 5.5.1 and § 5.5.2 code them. Nothing after the color configuration is read.
 *
 * The walk reads every field it passes, those the configuration does not keep among them, because each field's position depends on the ones before it. A reduced
 * still picture header codes only its level, its tier being main. The reader marks itself overrun on a read past the payload's end, so one check after the walk
 * refuses a cut header.
 */
function readSequenceHeader(unit: Buffer, payload: Span): SequenceHeader {

  const reader = new BitReader(unit, payload);
  const profile = reader.read(3);

  if(profile > MAX_SEQ_PROFILE) {

    throw new ProtectProtocolError("AV1 sequence header names a profile above 2.");
  }

  // still_picture, then reduced_still_picture_header.
  reader.skip(1);

  const reduced = reader.read(1) === 1;
  const { level, tier } = reduced ? { level: reader.read(5), tier: 0 } : readOperatingPoints(reader);
  const widthBits = reader.read(4) + 1;
  const heightBits = reader.read(4) + 1;
  const width = reader.read(widthBits) + 1;
  const height = reader.read(heightBits) + 1;

  if(reduced) {

    // use_128x128_superblock, enable_filter_intra and enable_intra_edge_filter, the frame tools a reduced header still codes.
    reader.skip(3);
  } else {

    skipFrameTools(reader);
  }

  // enable_superres, enable_cdef and enable_restoration.
  reader.skip(3);

  const color = readColorConfig(reader, profile);

  if(reader.overrun) {

    throw new ProtectProtocolError("AV1 sequence header ends before its last field is read.");
  }

  return { ...color, height, level, profile, tier, width };
}

/* Read the timing, decoder model and operating point fields of a full sequence header, answering operating point 0's level and tier.
 *
 * The timing info carries the decoder model info within it, and the decoder model's delay length sets the width of each operating point's delays. An operating
 * point codes its tier only above level 7, then its decoder model and its initial display delay when the header announces them.
 */
function readOperatingPoints(reader: BitReader): { level: number; tier: number } {

  let bufferDelayBits = 0;
  let decoderModel = false;

  if(reader.read(1) === 1) {

    // num_units_in_display_tick and time_scale, then equal_picture_interval with num_ticks_per_picture_minus_1 when set.
    reader.skip(64);

    if(reader.read(1) === 1) {

      skipUvlc(reader);
    }

    decoderModel = reader.read(1) === 1;

    // buffer_delay_length_minus_1, then num_units_in_decoding_tick, buffer_removal_time_length_minus_1 and frame_presentation_time_length_minus_1.
    if(decoderModel) {

      bufferDelayBits = reader.read(5) + 1;
      reader.skip(32 + 5 + 5);
    }
  }

  const displayDelay = reader.read(1) === 1;
  const operatingPoints = reader.read(5) + 1;
  let first = { level: 0, tier: 0 };

  for(let point = 0; point < operatingPoints; point++) {

    // operating_point_idc, then the level and, above level 7, the tier.
    reader.skip(12);

    const level = reader.read(5);
    const tier = (level > TIERED_LEVEL) ? reader.read(1) : 0;

    // decoder_model_present_for_this_op with its two delays and low_delay_mode_flag.
    if(decoderModel && (reader.read(1) === 1)) {

      reader.skip((2 * bufferDelayBits) + 1);
    }

    // initial_display_delay_present_for_this_op with initial_display_delay_minus_1.
    if(displayDelay && (reader.read(1) === 1)) {

      reader.skip(4);
    }

    if(point === 0) {

      first = { level, tier };
    }
  }

  return first;
}

/* Step over the frame tool flags of a full sequence header: the frame id numbers' lengths when present, the superblock size and the intra tools, the inter tools,
 * the order hint with the tools it enables, and the screen content and integer motion vector choices. Screen content tools are forced off, forced on or left to
 * each frame (2), and an integer motion vector choice is coded only when screen content tools may be on.
 */
function skipFrameTools(reader: BitReader): void {

  // frame_id_numbers_present_flag with delta_frame_id_length_minus_2 and additional_frame_id_length_minus_1.
  if(reader.read(1) === 1) {

    reader.skip(7);
  }

  // use_128x128_superblock, enable_filter_intra, enable_intra_edge_filter, enable_interintra_compound, enable_masked_compound, enable_warped_motion and
  // enable_dual_filter.
  reader.skip(7);

  const orderHint = reader.read(1) === 1;

  // enable_jnt_comp and enable_ref_frame_mvs.
  if(orderHint) {

    reader.skip(2);
  }

  const screenContent = (reader.read(1) === 1) ? 2 : reader.read(1);

  // seq_choose_integer_mv, then seq_force_integer_mv when the choice is not left to each frame.
  if((screenContent > 0) && (reader.read(1) === 0)) {

    reader.skip(1);
  }

  // order_hint_bits_minus_1.
  if(orderHint) {

    reader.skip(3);
  }
}

/* Read `color_config` (§ 5.5.2). The bit depth is 8 or 10, or 12 for the Professional profile; profile 1 is never monochrome; a stream that describes no color
 * reads each description field as 2. A monochrome stream codes its range alone, an sRGB stream nothing but its implied full range and 4:4:4, and every other
 * stream its range, then, for the Professional profile at 12 bits, its subsampling, and its chroma sample position when it subsamples both ways.
 */
function readColorConfig(reader: BitReader, profile: number): Omit<SequenceHeader, "height" | "level" | "profile" | "tier" | "width"> {

  const highBitdepth = reader.read(1);
  const twelveBit = ((profile === 2) && (highBitdepth === 1)) ? reader.read(1) : 0;
  const bitDepth = (twelveBit === 1) ? 12 : ((highBitdepth === 1) ? 10 : 8);
  const monoChrome = (profile === 1) ? 0 : reader.read(1);
  const colorDescribed = reader.read(1) === 1;
  const [ colorPrimaries, transferCharacteristics, matrixCoefficients ] = colorDescribed ? [ reader.read(8), reader.read(8), reader.read(8) ] :
    [ COLOR_UNSPECIFIED, COLOR_UNSPECIFIED, COLOR_UNSPECIFIED ];
  const described = { bitDepth, colorDescribed, colorPrimaries, highBitdepth, matrixCoefficients, monoChrome, transferCharacteristics, twelveBit };

  if(monoChrome === 1) {

    return { ...described, chromaSamplePosition: 0, colorRange: reader.read(1), subsamplingX: 1, subsamplingY: 1 };
  }

  if((colorPrimaries === SRGB.primaries) && (transferCharacteristics === SRGB.transfer) && (matrixCoefficients === SRGB.matrix)) {

    return { ...described, chromaSamplePosition: 0, colorRange: 1, subsamplingX: 0, subsamplingY: 0 };
  }

  const colorRange = reader.read(1);
  let subsamplingX = 1;
  let subsamplingY = 1;

  if(profile === 1) {

    subsamplingX = 0;
    subsamplingY = 0;
  } else if(profile === 2) {

    subsamplingX = (bitDepth === 12) ? reader.read(1) : 1;
    subsamplingY = ((bitDepth === 12) && (subsamplingX === 1)) ? reader.read(1) : 0;
  }

  const chromaSamplePosition = ((subsamplingX === 1) && (subsamplingY === 1)) ? reader.read(2) : 0;

  return { ...described, chromaSamplePosition, colorRange, subsamplingX, subsamplingY };
}

// Step over a uvlc value (§ 4.10.3): the zero bits up to the first one bit, then as many value bits, none when the run reaches 32 zeros, the value then reading
// as 2 ** 32 - 1. A run past the payload's end reads as zeros, so the overrun ends the count.
function skipUvlc(reader: BitReader): void {

  let zeros = 0;

  while((reader.read(1) === 0) && !reader.overrun) {

    zeros++;
  }

  if(zeros < UVLC_MAX_VALUE_BITS) {

    reader.skip(zeros);
  }
}
