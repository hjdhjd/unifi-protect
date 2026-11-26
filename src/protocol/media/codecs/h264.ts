/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * h264.ts: The H.264 reader - a frame split into its parameter sets and its sample, and the configuration an fMP4 track is written from.
 */

/**
 * The H.264 reader: a length-prefixed frame split into its parameter sets and its sample, and the configuration an fMP4 track is written from, read once from the
 * stream's own parameter sets. This module is Layer 1: no I/O, no time, no side effects - bytes in, values out, or a {@link ProtectProtocolError} naming the fault.
 *
 * Every NAL unit opens with a one-byte header (H.264 § 7.3.1), whose low five bits name the unit's type: 7 is a sequence parameter set (SPS) and 8 a picture
 * parameter set (PPS), and every other type is a part of the picture itself.
 *
 * ```
 * bit    7                     6 5           4 3 2 1 0
 *        forbidden_zero_bit    nal_ref_idc   nal_unit_type
 * ```
 *
 * The configuration's facts come from the first SPS, read past its header with emulation prevention removed (§ 7.3.2.1.1): `profile_idc`, the constraint byte
 * and `level_idc`, then the chroma format and bit depths a high profile states, the scaling matrix a high profile may carry, the picture order count fields, the
 * picture's size in macroblocks and its frame cropping. The coded size is the macroblock grid less the cropping, which counts in units of the chroma subsampling
 * and, for a stream that codes fields, of the two fields a frame holds (§ 7.4.2.1.1).
 *
 * The record is the `AVCDecoderConfigurationRecord` an `avcC` box carries (ISO/IEC 14496-15 § 5.3.3.1.2):
 *
 * | Field                                  | Bits | Value                                                                                   |
 * |----------------------------------------|------|-----------------------------------------------------------------------------------------|
 * | `configurationVersion`                 | 8    | 1                                                                                       |
 * | `AVCProfileIndication`                 | 8    | the SPS's `profile_idc`                                                                 |
 * | `profile_compatibility`                | 8    | the SPS's constraint byte                                                               |
 * | `AVCLevelIndication`                   | 8    | the SPS's `level_idc`                                                                   |
 * | reserved, `lengthSizeMinusOne`         | 6, 2 | all ones, then 3 for four-byte length prefixes                                          |
 * | reserved, `numOfSequenceParameterSets` | 3, 5 | all ones, then the SPS count, each SPS after it behind a 16-bit length                  |
 * | `numOfPictureParameterSets`            | 8    | the PPS count, each PPS after it behind a 16-bit length                                 |
 * | reserved, `chroma_format`              | 6, 2 | every profile but 66, 77 and 88: all ones, then `chroma_format_idc`                     |
 * | reserved, `bit_depth_luma_minus8`      | 5, 3 | the same profiles: all ones, then the luma bit depth less 8                             |
 * | reserved, `bit_depth_chroma_minus8`    | 5, 3 | the same profiles: all ones, then the chroma bit depth less 8                           |
 * | `numOfSequenceParameterSetExt`         | 8    | the same profiles: 0                                                                    |
 *
 * The label is `avc1.` and two lowercase hex digits each of `profile_idc`, the constraint byte and `level_idc` (RFC 6381 § 3.3), so High at level 4.0 with no
 * constraint flags reads `avc1.640028`.
 *
 * @module ProtectH264
 */
import { BitReader, removeEmulationPrevention } from "../bits.ts";
import { CHROMA_SUBSAMPLING, LENGTH_PREFIX_SIZE, lengthPrefixed16, lengthPrefixedUnits } from "./codecs.ts";
import type { VideoConfiguration, VideoFrameParts } from "./codecs.ts";
import { ProtectProtocolError } from "../../../shared/errors.ts";
import { u8 } from "../boxes.ts";

// The NAL unit header's size, and the types of the two parameter sets. The type is the header's low five bits.
const NAL_HEADER_SIZE = 1;
const NAL_TYPE_MASK = 0x1f;

const NalUnitType = {

  PPS: 8,
  SPS: 7
} as const;

// The profiles whose SPS states its chroma format, bit depths and scaling matrix (§ 7.3.2.1.1). Every other profile codes 4:2:0 at 8 bits.
const HIGH_PROFILES: ReadonlySet<number> = new Set([ 100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134, 135 ]);

// The profiles whose record ends after its picture parameter sets. Every other profile's record adds the chroma format, the bit depths and the count of SPS
// extensions.
const UNEXTENDED_PROFILES: ReadonlySet<number> = new Set([ 66, 77, 88 ]);

// The most parameter sets of each kind the record can count: its SPS count field is five bits wide and its PPS count field eight.
const MAX_SPS_COUNT = 0x1f;
const MAX_PPS_COUNT = 0xff;

// A scaling matrix's lists: the six 4x4 lists of 16 entries come first, then the 8x8 lists of 64, two of them, or six when the chroma format is 4:4:4.
const SCALING_LISTS_4X4 = 6;
const SCALING_LISTS = 8;
const SCALING_LISTS_444 = 12;
const SCALING_LIST_4X4_SIZE = 16;
const SCALING_LIST_8X8_SIZE = 64;

// The chroma format of 4:4:4, the one under which a separate color plane flag and the extra scaling lists are coded.
const CHROMA_FORMAT_444 = 3;

// A macroblock's width and height in luma samples.
const MACROBLOCK_SIZE = 16;

// The record's fixed bytes: its version, the length size of 4 under six reserved ones, and the reserved ones above the SPS count, the chroma format and each bit
// depth.
const RECORD_VERSION = 1;
const RECORD_LENGTH_SIZE = 0xff;
const RECORD_SPS_COUNT_RESERVED = 0xe0;
const RECORD_CHROMA_FORMAT_RESERVED = 0xfc;
const RECORD_BIT_DEPTH_RESERVED = 0xf8;

// What the reader takes from an SPS: the fields the record and the label carry, and the coded size.
interface SequenceParameterSet {

  readonly bitDepthChromaMinus8: number;
  readonly bitDepthLumaMinus8: number;
  readonly chromaFormatIdc: number;
  readonly constraints: number;
  readonly height: number;
  readonly levelIdc: number;
  readonly profileIdc: number;
  readonly width: number;
}

/**
 * Split an H.264 frame into its parameter sets and its sample.
 *
 * @param data - The frame's NAL units, each behind a four-byte big-endian length.
 *
 * @returns Each SPS and PPS as a view of the unit alone, and each other unit as a view of the unit with its length prefix, the sample an `avc1` track carries.
 *
 * @throws {@link ProtectProtocolError} if the frame's length prefixes are malformed, as {@link lengthPrefixedUnits} refuses them.
 *
 * @category Codec
 */
export function splitH264Frame(data: Buffer): VideoFrameParts {

  const parameterSets: Buffer[] = [];
  const sample: Buffer[] = [];

  for(const { end, start } of lengthPrefixedUnits(data)) {

    const unit = data.subarray(start, end);

    if(isParameterSet(unit)) {

      parameterSets.push(unit);

      continue;
    }

    sample.push(data.subarray(start - LENGTH_PREFIX_SIZE, end));
  }

  return { parameterSets, sample };
}

/**
 * Read the configuration an fMP4 track is written from out of an H.264 stream's parameter sets.
 *
 * @param parameterSets - The stream's parameter sets, each a whole NAL unit with no length prefix. The first SPS states the facts, and the record carries every
 *   SPS and PPS in the order given.
 *
 * @returns The configuration: the coded width and height, `profile_idc` and `level_idc`, the `avcC` record, and the `avc1` label.
 *
 * @throws {@link ProtectProtocolError} if a unit is empty or too long for the record's 16-bit length, the set holds no SPS or no PPS or more of either than the
 *   record's count fields hold, or the first SPS ends before its last field, names a reserved chroma format or crops away its whole picture.
 *
 * @category Codec
 */
export function readH264Configuration(parameterSets: readonly Buffer[]): VideoConfiguration {

  const sequenceSets = parameterSets.filter((unit) => nalUnitType(unit) === NalUnitType.SPS);
  const pictureSets = parameterSets.filter((unit) => nalUnitType(unit) === NalUnitType.PPS);
  const [first] = sequenceSets;

  if(first === undefined) {

    throw new ProtectProtocolError("H.264 parameter sets carry no sequence parameter set.");
  }

  if(pictureSets.length === 0) {

    throw new ProtectProtocolError("H.264 parameter sets carry no picture parameter set.");
  }

  if((sequenceSets.length > MAX_SPS_COUNT) || (pictureSets.length > MAX_PPS_COUNT)) {

    throw new ProtectProtocolError("H.264 parameter sets hold more sequence or picture parameter sets than the record's count fields can state.");
  }

  const sps = readSequenceParameterSet(first);
  const extension = UNEXTENDED_PROFILES.has(sps.profileIdc) ? [] : [ u8(RECORD_CHROMA_FORMAT_RESERVED | sps.chromaFormatIdc),
    u8(RECORD_BIT_DEPTH_RESERVED | sps.bitDepthLumaMinus8), u8(RECORD_BIT_DEPTH_RESERVED | sps.bitDepthChromaMinus8), u8(0) ];

  return {

    codec: "h264",
    height: sps.height,
    label: "avc1." + [ sps.profileIdc, sps.constraints, sps.levelIdc ].map((byte) => byte.toString(16).padStart(2, "0")).join(""),
    level: sps.levelIdc,
    profile: sps.profileIdc,
    record: Buffer.concat([ u8(RECORD_VERSION), u8(sps.profileIdc), u8(sps.constraints), u8(sps.levelIdc), u8(RECORD_LENGTH_SIZE),
      u8(RECORD_SPS_COUNT_RESERVED | sequenceSets.length), ...lengthPrefixed16(sequenceSets), u8(pictureSets.length), ...lengthPrefixed16(pictureSets),
      ...extension ]),
    width: sps.width
  };
}

// The type a NAL unit's header names. A unit too short to hold its header is refused.
function nalUnitType(unit: Buffer): number {

  if(unit.length < NAL_HEADER_SIZE) {

    throw new ProtectProtocolError("H.264 NAL unit is shorter than its one-byte header.");
  }

  return unit.readUInt8(0) & NAL_TYPE_MASK;
}

// Whether a NAL unit is a parameter set, which the record carries rather than the sample.
function isParameterSet(unit: Buffer): boolean {

  const type = nalUnitType(unit);

  return (type === NalUnitType.SPS) || (type === NalUnitType.PPS);
}

/* Read an SPS's fields through its frame cropping, in the order § 7.3.2.1.1 codes them. Nothing after the cropping is read.
 *
 * The walk reads every field it passes, those the configuration does not keep among them, because each field's position depends on the ones before it. The
 * reader marks itself overrun on a read past the RBSP's end, and on an Exp-Golomb code too long to hold, so one check after the walk refuses both.
 */
function readSequenceParameterSet(unit: Buffer): SequenceParameterSet {

  const rbsp = removeEmulationPrevention(unit.subarray(NAL_HEADER_SIZE));
  const reader = new BitReader(rbsp, { end: rbsp.length, start: 0 });
  const profileIdc = reader.read(8);
  const constraints = reader.read(8);
  const levelIdc = reader.read(8);

  let bitDepthChromaMinus8 = 0;
  let bitDepthLumaMinus8 = 0;
  let chromaFormatIdc = 1;
  let separateColourPlane = 0;

  // seq_parameter_set_id.
  reader.readUe();

  if(HIGH_PROFILES.has(profileIdc)) {

    chromaFormatIdc = reader.readUe();

    if(chromaFormatIdc === CHROMA_FORMAT_444) {

      separateColourPlane = reader.read(1);
    }

    bitDepthLumaMinus8 = reader.readUe();
    bitDepthChromaMinus8 = reader.readUe();

    // qpprime_y_zero_transform_bypass_flag, then seq_scaling_matrix_present_flag and, when set, a present flag for each list and the lists present.
    reader.skip(1);

    if(reader.read(1) === 1) {

      const lists = (chromaFormatIdc === CHROMA_FORMAT_444) ? SCALING_LISTS_444 : SCALING_LISTS;

      for(let list = 0; list < lists; list++) {

        if(reader.read(1) === 1) {

          skipScalingList(reader, (list < SCALING_LISTS_4X4) ? SCALING_LIST_4X4_SIZE : SCALING_LIST_8X8_SIZE);
        }
      }
    }
  }

  // log2_max_frame_num_minus4, then pic_order_cnt_type and the fields its type adds.
  reader.readUe();
  skipPictureOrderCount(reader, reader.readUe());

  // max_num_ref_frames and gaps_in_frame_num_value_allowed_flag.
  reader.readUe();
  reader.skip(1);

  const widthInMacroblocks = reader.readUe() + 1;
  const heightInMapUnits = reader.readUe() + 1;
  const frameMbsOnly = reader.read(1);

  // mb_adaptive_frame_field_flag when the stream may code fields, then direct_8x8_inference_flag.
  if(frameMbsOnly === 0) {

    reader.skip(1);
  }

  reader.skip(1);

  const [ cropLeft, cropRight, cropTop, cropBottom ] = (reader.read(1) === 1) ? [ reader.readUe(), reader.readUe(), reader.readUe(), reader.readUe() ] :
    [ 0, 0, 0, 0 ];

  if(reader.overrun) {

    throw new ProtectProtocolError("H.264 sequence parameter set ends before its last field is read.");
  }

  // The crop units follow the chroma format, a separate color plane reading as monochrome, and a stream that may code fields counts its height in field pairs.
  const subsampling = CHROMA_SUBSAMPLING[(separateColourPlane === 1) ? 0 : chromaFormatIdc];

  if(subsampling === undefined) {

    throw new ProtectProtocolError("H.264 sequence parameter set names a reserved chroma format.");
  }

  const [ subWidth, subHeight ] = subsampling;
  const fields = 2 - frameMbsOnly;
  const height = (fields * heightInMapUnits * MACROBLOCK_SIZE) - (subHeight * fields * (cropTop + cropBottom));
  const width = (widthInMacroblocks * MACROBLOCK_SIZE) - (subWidth * (cropLeft + cropRight));

  // A cropping that reaches the picture's far edge leaves no picture to describe, so no track can be written from it.
  if((height < 1) || (width < 1)) {

    throw new ProtectProtocolError("H.264 sequence parameter set leaves no picture once its cropping is applied.");
  }

  return {

    bitDepthChromaMinus8,
    bitDepthLumaMinus8,
    chromaFormatIdc,
    constraints,
    height,
    levelIdc,
    profileIdc,
    width
  };
}

/* Step over one scaling list of `size` entries (§ 7.3.2.1.1.1). Each entry's `delta_scale` is read only while the next scale is not zero: a next scale of zero
 * repeats the last scale through the rest of the list, so the list's remaining entries are not coded.
 */
function skipScalingList(reader: BitReader, size: number): void {

  let lastScale = 8;
  let nextScale = 8;

  for(let entry = 0; entry < size; entry++) {

    if(nextScale !== 0) {

      nextScale = (lastScale + reader.readSe() + 256) % 256;
    }

    lastScale = (nextScale === 0) ? lastScale : nextScale;
  }
}

/* Step over the fields a picture order count type adds. Type 0 codes the width of its counter's low bits; type 1 codes its offsets, the last of them a cycle of
 * one offset per reference frame; type 2 codes nothing. A cycle's length is read from the stream, so the walk ends at the first read past the RBSP rather than
 * counting out a corrupt length.
 */
function skipPictureOrderCount(reader: BitReader, picOrderCntType: number): void {

  switch(picOrderCntType) {

    case 0: {

      reader.readUe();

      break;
    }

    case 1: {

      reader.skip(1);
      reader.readSe();
      reader.readSe();

      const cycle = reader.readUe();

      for(let frame = 0; (frame < cycle) && !reader.overrun; frame++) {

        reader.readSe();
      }

      break;
    }

    default: {

      break;
    }
  }
}
