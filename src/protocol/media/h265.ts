/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * h265.ts: The HEVC reader - a frame split into its parameter sets and its sample, and the configuration an fMP4 track is written from.
 */

/**
 * The HEVC reader: a length-prefixed frame split into its parameter sets and its sample, and the configuration an fMP4 track is written from, read once from the
 * stream's own parameter sets. This module is Layer 1: no I/O, no time, no side effects - bytes in, values out, or a {@link ProtectProtocolError} naming the fault.
 *
 * Every NAL unit opens with a two-byte header (H.265 § 7.3.1.2): type 32 is a video parameter set (VPS), 33 a sequence parameter set (SPS) and 34 a picture
 * parameter set (PPS), and every other type is a part of the picture itself.
 *
 * ```
 * bit    15                    14 ... 9         8 ... 3       2 1 0
 *        forbidden_zero_bit    nal_unit_type    nuh_layer_id  nuh_temporal_id_plus1
 * ```
 *
 * The configuration's facts come from the first SPS, read past its header with emulation prevention removed (§ 7.3.2.2.1): its sub-layer count and its
 * `profile_tier_level` (§ 7.3.3), which carries the general profile space, tier, profile, compatibility flags, constraint flags and level, then the chroma format,
 * the picture's size in luma samples, its conformance window and its bit depths. The coded size is the picture less the conformance window, which counts in units
 * of the chroma subsampling (§ 7.4.3.2.1). An SPS of a layer other than the base layer codes its fields differently, so it is refused.
 *
 * The record is the `HEVCDecoderConfigurationRecord` an `hvcC` box carries (ISO/IEC 14496-15 § 8.3.3.1.2):
 *
 * | Field                                                                    | Bits      | Value                                                       |
 * |--------------------------------------------------------------------------|-----------|-------------------------------------------------------------|
 * | `configurationVersion`                                                   | 8         | 1                                                           |
 * | `general_profile_space`, `general_tier_flag`, `general_profile_idc`      | 2, 1, 5   | the SPS's                                                   |
 * | `general_profile_compatibility_flags`                                    | 32        | the SPS's, flag 0 most significant, as the SPS codes them   |
 * | `general_constraint_indicator_flags`                                     | 48        | the SPS's                                                   |
 * | `general_level_idc`                                                      | 8         | the SPS's                                                   |
 * | reserved, `min_spatial_segmentation_idc`                                 | 4, 12     | all ones, then 0                                            |
 * | reserved, `parallelismType`                                              | 6, 2      | all ones, then 0                                            |
 * | reserved, `chromaFormat`                                                 | 6, 2      | all ones, then the SPS's `chroma_format_idc`                |
 * | reserved, `bitDepthLumaMinus8`                                           | 5, 3      | all ones, then the SPS's                                    |
 * | reserved, `bitDepthChromaMinus8`                                         | 5, 3      | all ones, then the SPS's                                    |
 * | `avgFrameRate`                                                           | 16        | 0, unspecified                                              |
 * | `constantFrameRate`, `numTemporalLayers`, `temporalIdNested`             | 2, 3, 1   | 0, the SPS's sub-layer count, the SPS's nesting flag        |
 * | `lengthSizeMinusOne`                                                     | 2         | 3, for four-byte length prefixes                            |
 * | `numOfArrays`                                                            | 8         | 3: the VPS, SPS and PPS arrays, in that order               |
 *
 * Each array is `array_completeness` (1, as an `hvc1` entry requires), a reserved zero bit and the NAL unit type in one byte, a 16-bit count, then each unit
 * behind a 16-bit length.
 *
 * The label follows ISO/IEC 14496-15 Annex E.3: `hvc1.`, the profile space as nothing, `A`, `B` or `C` ahead of `general_profile_idc` in decimal, `.` and the
 * compatibility flags bit-reversed, flag 31 most significant, in hex, `.` and `L` or `H` for the tier ahead of `general_level_idc` in decimal, then each
 * constraint byte as `.` and its hex, the trailing zero bytes dropped. Every hex digit is lowercase, with no leading zeros, so Main at level 3.1 with the
 * progressive and frame-only constraint flags reads `hvc1.1.6.L93.90`.
 *
 * @module ProtectH265
 */
import { BitReader, removeEmulationPrevention } from "./bits.ts";
import { CHROMA_SUBSAMPLING, LENGTH_PREFIX_SIZE, lengthPrefixed16, lengthPrefixedUnits } from "./codecs.ts";
import type { VideoConfiguration, VideoFrameParts } from "./codecs.ts";
import { u16, u32, u8 } from "./boxes.ts";
import { ProtectProtocolError } from "../../errors.ts";

// The NAL unit header's size, and the types of the three parameter sets.
const NAL_HEADER_SIZE = 2;

const NalUnitType = {

  PPS: 34,
  SPS: 33,
  VPS: 32
} as const;

// The most sub-layers `profile_tier_level` reserves room for, and the bits each sub-layer's profile and level occupy when present.
const MAX_SUB_LAYERS = 8;
const SUB_LAYER_PROFILE_BITS = 88;
const SUB_LAYER_LEVEL_BITS = 8;

// The constraint indicator flags' width in bytes.
const CONSTRAINT_BYTES = 6;

// The chroma format of 4:4:4, the one under which a separate color plane flag is coded.
const CHROMA_FORMAT_444 = 3;

// The record's fixed fields: its version, the reserved ones above a zero `min_spatial_segmentation_idc`, above a zero `parallelismType`, above the chroma format
// and above each bit depth, the reserved ones under the sub-layer fields with a length size of 4, and the completeness bit of each array.
const RECORD_VERSION = 1;
const RECORD_MIN_SPATIAL_SEGMENTATION = 0xf000;
const RECORD_PARALLELISM = 0xfc;
const RECORD_CHROMA_FORMAT_RESERVED = 0xfc;
const RECORD_BIT_DEPTH_RESERVED = 0xf8;
const RECORD_LENGTH_SIZE = 0x03;
const RECORD_ARRAY_COMPLETE = 0x80;

// The most units of one type an array can count, its count field being 16 bits wide.
const MAX_ARRAY_COUNT = 0xffff;

// What the reader takes from an SPS: the fields the record and the label carry, and the coded size.
interface SequenceParameterSet {

  readonly bitDepthChromaMinus8: number;
  readonly bitDepthLumaMinus8: number;
  readonly chromaFormatIdc: number;
  readonly compatibility: number;
  readonly constraints: Buffer;
  readonly height: number;
  readonly levelIdc: number;
  readonly maxSubLayersMinus1: number;
  readonly profileIdc: number;
  readonly profileSpace: number;
  readonly temporalIdNesting: number;
  readonly tier: number;
  readonly width: number;
}

/**
 * Split an HEVC frame into its parameter sets and its sample.
 *
 * @param data - The frame's NAL units, each behind a four-byte big-endian length.
 *
 * @returns Each VPS, SPS and PPS as a view of the unit alone, and each other unit as a view of the unit with its length prefix, the sample an `hvc1` track carries.
 *
 * @throws {@link ProtectProtocolError} if the frame's length prefixes are malformed, as {@link lengthPrefixedUnits} refuses them, or a unit is shorter than its
 *   two-byte header.
 *
 * @category Codec
 */
export function splitH265Frame(data: Buffer): VideoFrameParts {

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
 * Read the configuration an fMP4 track is written from out of an HEVC stream's parameter sets.
 *
 * @param parameterSets - The stream's parameter sets, each a whole NAL unit with no length prefix. The first SPS states the facts, and the record carries every
 *   VPS, SPS and PPS in the order given.
 *
 * @returns The configuration: the coded width and height, `general_profile_idc` and `general_level_idc`, the `hvcC` record, and the `hvc1` label.
 *
 * @throws {@link ProtectProtocolError} if a unit is shorter than its header or too long for the record's 16-bit length, the set lacks a VPS, an SPS or a PPS or
 *   holds more units of one type than an array's count holds, or the first SPS belongs to a layer other than the base layer, ends before its last field, names a
 *   reserved chroma format or leaves no picture once its conformance window is applied.
 *
 * @category Codec
 */
export function readH265Configuration(parameterSets: readonly Buffer[]): VideoConfiguration {

  const videoSets = parameterSets.filter((unit) => nalUnitType(unit) === NalUnitType.VPS);
  const sequenceSets = parameterSets.filter((unit) => nalUnitType(unit) === NalUnitType.SPS);
  const pictureSets = parameterSets.filter((unit) => nalUnitType(unit) === NalUnitType.PPS);
  const [first] = sequenceSets;

  if(videoSets.length === 0) {

    throw new ProtectProtocolError("HEVC parameter sets carry no video parameter set.");
  }

  if(first === undefined) {

    throw new ProtectProtocolError("HEVC parameter sets carry no sequence parameter set.");
  }

  if(pictureSets.length === 0) {

    throw new ProtectProtocolError("HEVC parameter sets carry no picture parameter set.");
  }

  if(nuhLayerId(first) !== 0) {

    throw new ProtectProtocolError("HEVC sequence parameter set belongs to a layer other than the base layer.");
  }

  const sps = readSequenceParameterSet(first);

  return {

    codec: "h265",
    height: sps.height,
    label: label(sps),
    level: sps.levelIdc,
    profile: sps.profileIdc,
    record: Buffer.concat([ u8(RECORD_VERSION), u8((sps.profileSpace << 6) | (sps.tier << 5) | sps.profileIdc), u32(sps.compatibility), sps.constraints,
      u8(sps.levelIdc), u16(RECORD_MIN_SPATIAL_SEGMENTATION), u8(RECORD_PARALLELISM), u8(RECORD_CHROMA_FORMAT_RESERVED | sps.chromaFormatIdc),
      u8(RECORD_BIT_DEPTH_RESERVED | sps.bitDepthLumaMinus8), u8(RECORD_BIT_DEPTH_RESERVED | sps.bitDepthChromaMinus8), u16(0),
      u8(((sps.maxSubLayersMinus1 + 1) << 3) | (sps.temporalIdNesting << 2) | RECORD_LENGTH_SIZE), u8(3), ...parameterArray(NalUnitType.VPS, videoSets),
      ...parameterArray(NalUnitType.SPS, sequenceSets), ...parameterArray(NalUnitType.PPS, pictureSets) ]),
    width: sps.width
  };
}

// The type a NAL unit's header names, six bits below the forbidden bit. A unit too short to hold its header is refused.
function nalUnitType(unit: Buffer): number {

  if(unit.length < NAL_HEADER_SIZE) {

    throw new ProtectProtocolError("HEVC NAL unit is shorter than its two-byte header.");
  }

  return (unit.readUInt8(0) >> 1) & 0x3f;
}

// The layer a NAL unit's header names, six bits spanning its two bytes.
function nuhLayerId(unit: Buffer): number {

  return ((unit.readUInt8(0) & 0x01) << 5) | (unit.readUInt8(1) >> 3);
}

// Whether a NAL unit is a parameter set, which the record carries rather than the sample.
function isParameterSet(unit: Buffer): boolean {

  const type = nalUnitType(unit);

  return (type === NalUnitType.VPS) || (type === NalUnitType.SPS) || (type === NalUnitType.PPS);
}

// One of the record's arrays: the completeness bit and the type, the count, then each unit behind its 16-bit length. More units than the count can state are
// refused.
function parameterArray(type: number, units: readonly Buffer[]): Buffer[] {

  if(units.length > MAX_ARRAY_COUNT) {

    throw new ProtectProtocolError("HEVC parameter sets hold more units of one type than the record's 16-bit array count can state.");
  }

  return [ u8(RECORD_ARRAY_COMPLETE | type), u16(units.length), ...lengthPrefixed16(units) ];
}

// The label's profile space letter, compatibility word, tier and level, and constraint bytes, in the forms Annex E.3 writes them.
function label(sps: SequenceParameterSet): string {

  let lastConstraint = sps.constraints.length;

  while((lastConstraint > 0) && (sps.constraints.readUInt8(lastConstraint - 1) === 0)) {

    lastConstraint--;
  }

  const space = (sps.profileSpace === 0) ? "" : String.fromCharCode(0x40 + sps.profileSpace);
  const constraints = [...sps.constraints.subarray(0, lastConstraint)].map((byte) => "." + byte.toString(16)).join("");

  return "hvc1." + space + String(sps.profileIdc) + "." + reverseBits32(sps.compatibility).toString(16) + "." + ((sps.tier === 1) ? "H" : "L") +
    String(sps.levelIdc) + constraints;
}

// A 32-bit word with its bit order reversed, so flag 0, the word's most significant bit, becomes its least.
function reverseBits32(word: number): number {

  let reversed = 0;

  for(let bit = 0; bit < 32; bit++) {

    reversed = (reversed * 2) + ((word >>> bit) & 1);
  }

  return reversed;
}

/* Read an SPS's fields through its bit depths, in the order § 7.3.2.2.1 codes them. Nothing after the bit depths is read.
 *
 * The walk reads every field it passes, those the configuration does not keep among them, because each field's position depends on the ones before it. The
 * reader marks itself overrun on a read past the RBSP's end, and on an Exp-Golomb code too long to hold, so one check after the walk refuses both.
 */
function readSequenceParameterSet(unit: Buffer): SequenceParameterSet {

  const rbsp = removeEmulationPrevention(unit.subarray(NAL_HEADER_SIZE));
  const reader = new BitReader(rbsp, { end: rbsp.length, start: 0 });

  // sps_video_parameter_set_id, then the sub-layer count and the nesting flag.
  reader.skip(4);

  const maxSubLayersMinus1 = reader.read(3);
  const temporalIdNesting = reader.read(1);

  // The general profile, tier and level of profile_tier_level(1, sps_max_sub_layers_minus1).
  const profileSpace = reader.read(2);
  const tier = reader.read(1);
  const profileIdc = reader.read(5);
  const compatibility = reader.read(32);
  const constraints = Buffer.from(Array.from({ length: CONSTRAINT_BYTES }, () => reader.read(8)));
  const levelIdc = reader.read(8);

  skipSubLayers(reader, maxSubLayersMinus1);

  // sps_seq_parameter_set_id, then the chroma format.
  reader.readUe();

  const chromaFormatIdc = reader.readUe();
  const separateColourPlane = (chromaFormatIdc === CHROMA_FORMAT_444) ? reader.read(1) : 0;
  const widthInSamples = reader.readUe();
  const heightInSamples = reader.readUe();
  const [ windowLeft, windowRight, windowTop, windowBottom ] = (reader.read(1) === 1) ?
    [ reader.readUe(), reader.readUe(), reader.readUe(), reader.readUe() ] : [ 0, 0, 0, 0 ];
  const bitDepthLumaMinus8 = reader.readUe();
  const bitDepthChromaMinus8 = reader.readUe();

  if(reader.overrun) {

    throw new ProtectProtocolError("HEVC sequence parameter set ends before its last field is read.");
  }

  // The conformance window counts in units of the chroma subsampling, a separate color plane reading as monochrome.
  const subsampling = CHROMA_SUBSAMPLING[(separateColourPlane === 1) ? 0 : chromaFormatIdc];

  if(subsampling === undefined) {

    throw new ProtectProtocolError("HEVC sequence parameter set names a reserved chroma format.");
  }

  const [ subWidth, subHeight ] = subsampling;
  const height = heightInSamples - (subHeight * (windowTop + windowBottom));
  const width = widthInSamples - (subWidth * (windowLeft + windowRight));

  // A picture of no samples, or a window that reaches its far edge, leaves no picture to describe, so no track can be written from it.
  if((height < 1) || (width < 1)) {

    throw new ProtectProtocolError("HEVC sequence parameter set leaves no picture once its conformance window is applied.");
  }

  return {

    bitDepthChromaMinus8,
    bitDepthLumaMinus8,
    chromaFormatIdc,
    compatibility,
    constraints,
    height,
    levelIdc,
    maxSubLayersMinus1,
    profileIdc,
    profileSpace,
    temporalIdNesting,
    tier,
    width
  };
}

/* Step over the sub-layer part of `profile_tier_level` (§ 7.3.3): a profile-present and a level-present flag for each sub-layer below the highest, two reserved
 * bits for each slot from there to the eighth when any sub-layer is coded, then each sub-layer's profile when its flag is set and its level when its flag is set.
 */
function skipSubLayers(reader: BitReader, maxSubLayersMinus1: number): void {

  const present: { level: number; profile: number }[] = [];

  for(let layer = 0; layer < maxSubLayersMinus1; layer++) {

    const profile = reader.read(1);
    const level = reader.read(1);

    present.push({ level, profile });
  }

  if(maxSubLayersMinus1 > 0) {

    for(let slot = maxSubLayersMinus1; slot < MAX_SUB_LAYERS; slot++) {

      reader.skip(2);
    }
  }

  for(const { level, profile } of present) {

    reader.skip((profile * SUB_LAYER_PROFILE_BITS) + (level * SUB_LAYER_LEVEL_BITS));
  }
}
