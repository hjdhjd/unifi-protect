/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * codecs.helpers.ts: Test-only builders of the codec payloads the media suites read - H.264 and HEVC parameter sets and NAL units, AV1 OBUs and sequence headers,
 * ADTS frames, Opus packets and length-prefixed frames - each from stated field values.
 *
 * Each builder restates its format's syntax apart from the reader under test, in the order the specification codes it, so a fixture names its fields and a misread
 * on either side fails a row rather than cancelling out. Every builder writes synthetic values a suite states; none carries bytes from a real stream.
 */
import { BitWriter, addEmulationPrevention } from "./bits.helpers.ts";

// Length-prefixed frames.

// A frame of NAL units, each behind a four-byte big-endian length, the form H.264 and HEVC frames travel in.
export function lengthPrefixed(...units: Uint8Array[]): Buffer {

  return Buffer.concat(units.flatMap((unit) => {

    const prefix = Buffer.alloc(4);

    prefix.writeUInt32BE(unit.length, 0);

    return [ prefix, unit ];
  }));
}

// H.264.

// The H.264 NAL unit types the suites build.
export const H264_IDR = 5;
export const H264_NON_IDR = 1;
export const H264_PPS = 8;
export const H264_SEI = 6;
export const H264_SPS = 7;

// An H.264 NAL unit: its one-byte header, `nal_ref_idc` 3 unless asked otherwise above the type, then the payload as given.
export function h264Unit(type: number, payload: Uint8Array, nalRefIdc = 3): Buffer {

  return Buffer.concat([ Buffer.from([(nalRefIdc << 5) | type]), payload ]);
}

// The picture order count fields of each type: type 0 codes the width of its counter's low bits, type 1 its offsets and its cycle of reference frame offsets, and
// type 2 nothing.
export type H264PictureOrderCount = { readonly log2MaxLsbMinus4: number; readonly type: 0 } | H264PictureOrderCountCycle | { readonly type: 2 };

export interface H264PictureOrderCountCycle {

  readonly deltaAlwaysZero: number;
  readonly offsetForNonRefPic: number;
  readonly offsetForTopToBottomField: number;
  readonly offsetsForRefFrame: readonly number[];
  readonly type: 1;
}

// The fields a high profile's SPS codes after its id. Each entry of `scalingLists` is one list's present flag and, when it is an array, the `delta_scale` values
// written for it; giving the lists sets `seq_scaling_matrix_present_flag`, and the builder writes as many present flags as entries given.
export interface H264HighFields {

  readonly bitDepthChromaMinus8: number;
  readonly bitDepthLumaMinus8: number;
  readonly chromaFormatIdc: number;
  readonly scalingLists?: readonly (readonly number[] | undefined)[];
  readonly separateColourPlane?: number;
}

// The fields of an H.264 SPS. `high` is written when given, whatever the profile, so a fixture states which layout it carries; `crop` sets the frame cropping
// flag; `mbAdaptiveFrameField` is written when `frameMbsOnly` is 0.
export interface H264SpsFields {

  readonly constraints: number;
  readonly crop?: { readonly bottom: number; readonly left: number; readonly right: number; readonly top: number };
  readonly frameMbsOnly?: number;
  readonly heightInMapUnitsMinus1: number;
  readonly high?: H264HighFields;
  readonly levelIdc: number;
  readonly log2MaxFrameNumMinus4?: number;
  readonly maxNumRefFrames?: number;
  readonly mbAdaptiveFrameField?: number;
  readonly pictureOrderCount?: H264PictureOrderCount;
  readonly profileIdc: number;
  readonly spsId?: number;
  readonly widthInMbsMinus1: number;
}

// The RBSP of an H.264 SPS (§ 7.3.2.1.1) through `vui_parameters_present_flag`, which reads 0, then the trailing bits.
export function h264SpsRbsp(fields: H264SpsFields): Buffer {

  const { constraints, crop, frameMbsOnly = 1, heightInMapUnitsMinus1, high, levelIdc, log2MaxFrameNumMinus4 = 0, maxNumRefFrames = 1, mbAdaptiveFrameField = 0,
    pictureOrderCount = { type: 2 }, profileIdc, spsId = 0, widthInMbsMinus1 } = fields;
  const writer = new BitWriter().write(8, profileIdc).write(8, constraints).write(8, levelIdc).writeUe(spsId);

  if(high !== undefined) {

    writer.writeUe(high.chromaFormatIdc);

    if(high.chromaFormatIdc === 3) {

      writer.write(1, high.separateColourPlane ?? 0);
    }

    writer.writeUe(high.bitDepthLumaMinus8).writeUe(high.bitDepthChromaMinus8).write(1, 0).write(1, (high.scalingLists === undefined) ? 0 : 1);

    for(const list of high.scalingLists ?? []) {

      writer.write(1, (list === undefined) ? 0 : 1);

      for(const delta of list ?? []) {

        writer.writeSe(delta);
      }
    }
  }

  writer.writeUe(log2MaxFrameNumMinus4).writeUe(pictureOrderCount.type);

  if(pictureOrderCount.type === 0) {

    writer.writeUe(pictureOrderCount.log2MaxLsbMinus4);
  } else if(pictureOrderCount.type === 1) {

    writer.write(1, pictureOrderCount.deltaAlwaysZero).writeSe(pictureOrderCount.offsetForNonRefPic).writeSe(pictureOrderCount.offsetForTopToBottomField)
      .writeUe(pictureOrderCount.offsetsForRefFrame.length);

    for(const offset of pictureOrderCount.offsetsForRefFrame) {

      writer.writeSe(offset);
    }
  }

  writer.writeUe(maxNumRefFrames).write(1, 0).writeUe(widthInMbsMinus1).writeUe(heightInMapUnitsMinus1).write(1, frameMbsOnly);

  if(frameMbsOnly === 0) {

    writer.write(1, mbAdaptiveFrameField);
  }

  writer.write(1, 1).write(1, (crop === undefined) ? 0 : 1);

  if(crop !== undefined) {

    writer.writeUe(crop.left).writeUe(crop.right).writeUe(crop.top).writeUe(crop.bottom);
  }

  return writer.write(1, 0).writeTrailingBits().toBuffer();
}

// An H.264 SPS NAL unit: the header, then the RBSP with emulation prevention added.
export function h264Sps(fields: H264SpsFields): Buffer {

  return h264Unit(H264_SPS, addEmulationPrevention(h264SpsRbsp(fields)));
}

// An H.264 PPS NAL unit (§ 7.3.2.2) of a baseline picture: its id and its SPS's id, CAVLC with one slice group, one reference index each way, no weighted
// prediction, zero quantizer offsets and the deblocking filter control present. The configuration reader carries a PPS whole and never reads it.
export function h264Pps(ids: { readonly ppsId?: number; readonly spsId?: number } = {}): Buffer {

  const { ppsId = 0, spsId = 0 } = ids;
  const rbsp = new BitWriter().writeUe(ppsId).writeUe(spsId).write(1, 0).write(1, 0).writeUe(0).writeUe(0).writeUe(0).write(1, 0).write(2, 0).writeSe(0)
    .writeSe(0).writeSe(0).write(1, 1).write(1, 0).write(1, 0).writeTrailingBits().toBuffer();

  return h264Unit(H264_PPS, addEmulationPrevention(rbsp));
}

// HEVC.

// The HEVC NAL unit types the suites build.
export const H265_IDR_W_RADL = 19;
export const H265_PPS = 34;
export const H265_PREFIX_SEI = 39;
export const H265_SPS = 33;
export const H265_TRAIL_R = 1;
export const H265_VPS = 32;

// An HEVC NAL unit: its two-byte header, the forbidden bit clear, the type, the layer (0 unless asked otherwise) and a temporal id plus one of 1, then the payload as
// given.
export function h265Unit(type: number, payload: Uint8Array, layerId = 0): Buffer {

  const header = new BitWriter().write(1, 0).write(6, type).write(6, layerId).write(3, 1).toBuffer();

  return Buffer.concat([ header, payload ]);
}

// The fields of an HEVC SPS through its bit depths. `subLayers` holds one entry per sub-layer below the highest, each carrying the 11 bytes of its profile and the
// byte of its level when present; `conformanceWindow` sets the conformance window flag; `separateColourPlane` is written when the chroma format is 4:4:4.
export interface H265SpsFields {

  readonly bitDepthChromaMinus8?: number;
  readonly bitDepthLumaMinus8?: number;
  readonly chromaFormatIdc?: number;
  readonly compatibility: number;
  readonly conformanceWindow?: { readonly bottom: number; readonly left: number; readonly right: number; readonly top: number };
  readonly constraints: readonly number[];
  readonly height: number;
  readonly layerId?: number;
  readonly levelIdc: number;
  readonly maxSubLayersMinus1?: number;
  readonly profileIdc: number;
  readonly profileSpace?: number;
  readonly separateColourPlane?: number;
  readonly spsId?: number;
  readonly subLayers?: readonly { readonly level?: number; readonly profile?: readonly number[] }[];
  readonly temporalIdNesting?: number;
  readonly tier?: number;
  readonly vpsId?: number;
  readonly width: number;
}

// An HEVC SPS NAL unit (§ 7.3.2.2.1): its fields through `bit_depth_chroma_minus8`, every field the configuration reader reads, then the trailing bits, with
// emulation prevention added.
export function h265Sps(fields: H265SpsFields): Buffer {

  const { bitDepthChromaMinus8 = 0, bitDepthLumaMinus8 = 0, chromaFormatIdc = 1, compatibility, conformanceWindow, constraints, height, layerId = 0, levelIdc,
    maxSubLayersMinus1 = 0, profileIdc, profileSpace = 0, separateColourPlane = 0, spsId = 0, subLayers = [], temporalIdNesting = 1, tier = 0, vpsId = 0,
    width } = fields;
  const writer = new BitWriter().write(4, vpsId).write(3, maxSubLayersMinus1).write(1, temporalIdNesting).write(2, profileSpace).write(1, tier)
    .write(5, profileIdc).write(32, compatibility);

  for(const byte of constraints) {

    writer.write(8, byte);
  }

  writer.write(8, levelIdc);

  for(const layer of subLayers) {

    writer.write(1, (layer.profile === undefined) ? 0 : 1).write(1, (layer.level === undefined) ? 0 : 1);
  }

  if(maxSubLayersMinus1 > 0) {

    for(let slot = maxSubLayersMinus1; slot < 8; slot++) {

      writer.write(2, 0);
    }
  }

  for(const layer of subLayers) {

    for(const byte of layer.profile ?? []) {

      writer.write(8, byte);
    }

    if(layer.level !== undefined) {

      writer.write(8, layer.level);
    }
  }

  writer.writeUe(spsId).writeUe(chromaFormatIdc);

  if(chromaFormatIdc === 3) {

    writer.write(1, separateColourPlane);
  }

  writer.writeUe(width).writeUe(height).write(1, (conformanceWindow === undefined) ? 0 : 1);

  if(conformanceWindow !== undefined) {

    writer.writeUe(conformanceWindow.left).writeUe(conformanceWindow.right).writeUe(conformanceWindow.top).writeUe(conformanceWindow.bottom);
  }

  writer.writeUe(bitDepthLumaMinus8).writeUe(bitDepthChromaMinus8);

  return h265Unit(H265_SPS, addEmulationPrevention(writer.writeTrailingBits().toBuffer()), layerId);
}

// An HEVC VPS NAL unit (§ 7.3.2.1): its id, the base layer flags, one layer, the sub-layer count and nesting flag, and the reserved 0xffff, then the trailing bits.
// The configuration reader carries a VPS whole and never reads it.
export function h265Vps(fields: { readonly maxSubLayersMinus1?: number; readonly vpsId?: number } = {}): Buffer {

  const { maxSubLayersMinus1 = 0, vpsId = 0 } = fields;
  const rbsp = new BitWriter().write(4, vpsId).write(1, 1).write(1, 1).write(6, 0).write(3, maxSubLayersMinus1).write(1, 1).write(16, 0xffff).writeTrailingBits()
    .toBuffer();

  return h265Unit(H265_VPS, addEmulationPrevention(rbsp));
}

// An HEVC PPS NAL unit (§ 7.3.2.3.1): its id and its SPS's id, then the trailing bits. The configuration reader carries a PPS whole and never reads it.
export function h265Pps(ids: { readonly ppsId?: number; readonly spsId?: number } = {}): Buffer {

  const { ppsId = 0, spsId = 0 } = ids;

  return h265Unit(H265_PPS, addEmulationPrevention(new BitWriter().writeUe(ppsId).writeUe(spsId).writeTrailingBits().toBuffer()));
}

// AV1.

// The AV1 OBU types the suites build.
export const AV1_FRAME = 6;
export const AV1_METADATA = 5;
export const AV1_SEQUENCE_HEADER = 1;
export const AV1_TEMPORAL_DELIMITER = 2;

// An AV1 OBU (§ 5.3): its header byte, an extension byte when `extension` is given, and the payload's size as a one-byte leb128 when `sizeField` is true, which it is
// unless asked otherwise, then the payload. The builder writes the size in one byte, so a payload under 128 bytes.
export function obu(type: number, payload: Uint8Array, options: { readonly extension?: number; readonly sizeField?: boolean } = {}): Buffer {

  const { extension, sizeField = true } = options;
  const header = (type << 3) | ((extension === undefined) ? 0 : 0x04) | (sizeField ? 0x02 : 0);

  return Buffer.concat([ Buffer.from([header]), Buffer.from((extension === undefined) ? [] : [extension]), Buffer.from(sizeField ? [payload.length] : []),
    payload ]);
}

// An AV1 temporal delimiter OBU, an empty payload behind its size field.
export function temporalDelimiter(): Buffer {

  return obu(AV1_TEMPORAL_DELIMITER, Buffer.alloc(0));
}

// One operating point of an AV1 sequence header: its idc and level, its tier (written above level 7), its decoder model delays and low delay flag (written when the
// header carries a decoder model and the point states them), and its initial display delay (written when the header announces display delays and the point states
// one).
export interface Av1OperatingPoint {

  readonly decoderModel?: { readonly decoderBufferDelay: number; readonly encoderBufferDelay: number; readonly lowDelayMode: number };
  readonly idc: number;
  readonly initialDisplayDelayMinus1?: number;
  readonly level: number;
  readonly tier?: number;
}

// The color configuration of an AV1 sequence header (§ 5.5.2). The builder writes each field the syntax codes for the profile and the values given: `twelveBit` for
// profile 2 at a high bit depth, `monoChrome` unless profile 1, the description when given, then the range and, for profile 2 at 12 bits, the subsampling and the
// sample position as the syntax calls for them.
export interface Av1ColorFields {

  readonly chromaSamplePosition?: number;
  readonly colorRange?: number;
  readonly description?: { readonly matrix: number; readonly primaries: number; readonly transfer: number };
  readonly highBitdepth?: number;
  readonly monoChrome?: number;
  readonly subsamplingX?: number;
  readonly subsamplingY?: number;
  readonly twelveBit?: number;
}

/* The fields of an AV1 sequence header. A reduced still picture header codes only the first operating point's level; every other header codes its timing info when
 * given, its decoder model inside that timing info when given, and each operating point.
 *
 * A full header's frame tools are coded as given: the frame id lengths when `frameIds` is given, the order hint and its two tools when `orderHintBitsMinus1` is
 * given, screen content tools forced to `forceScreenContentTools` or left to each frame when it is absent, and, when screen content tools may be on, integer motion
 * vectors forced to `forceIntegerMv` or left to each frame when it is absent. The superblock size, the intra tools and the inter tools take fixed values.
 */
export interface Av1SequenceHeaderFields {

  readonly color?: Av1ColorFields;
  readonly displayDelays?: boolean;
  readonly forceIntegerMv?: number;
  readonly forceScreenContentTools?: number;
  readonly frameHeightBitsMinus1?: number;
  readonly frameIds?: { readonly additionalMinus1: number; readonly deltaMinus2: number };
  readonly frameWidthBitsMinus1?: number;
  readonly maxFrameHeightMinus1: number;
  readonly maxFrameWidthMinus1: number;
  readonly operatingPoints?: readonly Av1OperatingPoint[];
  readonly orderHintBitsMinus1?: number;
  readonly profile?: number;
  readonly reducedStillPicture?: boolean;
  readonly timing?: Av1Timing;
}

// An AV1 sequence header's timing info: the display tick and time scale, the ticks per picture when every picture lasts the same, and the decoder model it carries.
export interface Av1Timing {

  readonly decoderModel?: Av1DecoderModel;
  readonly numTicksPerPictureMinus1?: number;
  readonly numUnitsInDisplayTick: number;
  readonly timeScale: number;
}

// An AV1 sequence header's decoder model info: the width of each operating point's delays less one, the decoding tick, and two more field widths less one.
export interface Av1DecoderModel {

  readonly bufferDelayLengthMinus1: number;
  readonly bufferRemovalTimeLengthMinus1: number;
  readonly framePresentationTimeLengthMinus1: number;
  readonly numUnitsInDecodingTick: number;
}

// The payload of an AV1 sequence header (§ 5.5.1) through its color configuration and `film_grain_params_present`, which reads 0, then the trailing bits.
export function av1SequenceHeaderPayload(fields: Av1SequenceHeaderFields): Buffer {

  const { color = {}, displayDelays = false, frameHeightBitsMinus1 = 15, frameWidthBitsMinus1 = 15, maxFrameHeightMinus1, maxFrameWidthMinus1,
    operatingPoints = [{ idc: 0, level: 9 }], profile = 0, reducedStillPicture = false, timing } = fields;
  const writer = new BitWriter().write(3, profile).write(1, reducedStillPicture ? 1 : 0).write(1, reducedStillPicture ? 1 : 0);

  if(reducedStillPicture) {

    writer.write(5, operatingPoints[0]?.level ?? 0);
  } else {

    writer.write(1, (timing === undefined) ? 0 : 1);

    if(timing !== undefined) {

      writer.write(32, timing.numUnitsInDisplayTick).write(32, timing.timeScale).write(1, (timing.numTicksPerPictureMinus1 === undefined) ? 0 : 1);

      // num_ticks_per_picture_minus_1 is a uvlc (§ 4.10.3), which codes a value as the unsigned Exp-Golomb code does.
      if(timing.numTicksPerPictureMinus1 !== undefined) {

        writer.writeUe(timing.numTicksPerPictureMinus1);
      }

      writer.write(1, (timing.decoderModel === undefined) ? 0 : 1);

      if(timing.decoderModel !== undefined) {

        writer.write(5, timing.decoderModel.bufferDelayLengthMinus1).write(32, timing.decoderModel.numUnitsInDecodingTick)
          .write(5, timing.decoderModel.bufferRemovalTimeLengthMinus1).write(5, timing.decoderModel.framePresentationTimeLengthMinus1);
      }
    }

    writer.write(1, displayDelays ? 1 : 0).write(5, operatingPoints.length - 1);

    const delayBits = (timing?.decoderModel?.bufferDelayLengthMinus1 ?? 0) + 1;

    for(const point of operatingPoints) {

      writer.write(12, point.idc).write(5, point.level);

      if(point.level > 7) {

        writer.write(1, point.tier ?? 0);
      }

      if(timing?.decoderModel !== undefined) {

        writer.write(1, (point.decoderModel === undefined) ? 0 : 1);

        if(point.decoderModel !== undefined) {

          writer.write(delayBits, point.decoderModel.decoderBufferDelay).write(delayBits, point.decoderModel.encoderBufferDelay)
            .write(1, point.decoderModel.lowDelayMode);
        }
      }

      if(displayDelays) {

        writer.write(1, (point.initialDisplayDelayMinus1 === undefined) ? 0 : 1);

        if(point.initialDisplayDelayMinus1 !== undefined) {

          writer.write(4, point.initialDisplayDelayMinus1);
        }
      }
    }
  }

  writer.write(4, frameWidthBitsMinus1).write(4, frameHeightBitsMinus1).write(frameWidthBitsMinus1 + 1, maxFrameWidthMinus1)
    .write(frameHeightBitsMinus1 + 1, maxFrameHeightMinus1);

  // use_128x128_superblock, enable_filter_intra and enable_intra_edge_filter, then a full header's frame tools.
  if(reducedStillPicture) {

    writer.write(3, 0b011);
  } else {

    writeFrameTools(writer, fields);
  }

  // enable_superres, enable_cdef and enable_restoration.
  writer.write(3, 0b011);
  writeColorConfig(writer, profile, color);

  return writer.write(1, 0).writeTrailingBits().toBuffer();
}

// An AV1 sequence header OBU, its payload behind its size field unless asked otherwise.
export function av1SequenceHeader(fields: Av1SequenceHeaderFields, options: { readonly sizeField?: boolean } = {}): Buffer {

  return obu(AV1_SEQUENCE_HEADER, av1SequenceHeaderPayload(fields), options);
}

/* Write a full header's frame tools: the frame id flag with its lengths; use_128x128_superblock, the two intra tools and the four inter tools, 0110101; the order
 * hint flag with enable_jnt_comp and enable_ref_frame_mvs; seq_choose_screen_content_tools with seq_force_screen_content_tools; seq_choose_integer_mv with
 * seq_force_integer_mv when screen content tools may be on; then order_hint_bits_minus_1.
 */
function writeFrameTools(writer: BitWriter, fields: Av1SequenceHeaderFields): void {

  const { forceIntegerMv, forceScreenContentTools, frameIds, orderHintBitsMinus1 } = fields;

  writer.write(1, (frameIds === undefined) ? 0 : 1);

  if(frameIds !== undefined) {

    writer.write(4, frameIds.deltaMinus2).write(3, frameIds.additionalMinus1);
  }

  writer.write(7, 0b0110101).write(1, (orderHintBitsMinus1 === undefined) ? 0 : 1);

  if(orderHintBitsMinus1 !== undefined) {

    writer.write(2, 0b11);
  }

  writer.write(1, (forceScreenContentTools === undefined) ? 1 : 0);

  if(forceScreenContentTools !== undefined) {

    writer.write(1, forceScreenContentTools);
  }

  if(forceScreenContentTools !== 0) {

    writer.write(1, (forceIntegerMv === undefined) ? 1 : 0);

    if(forceIntegerMv !== undefined) {

      writer.write(1, forceIntegerMv);
    }
  }

  if(orderHintBitsMinus1 !== undefined) {

    writer.write(3, orderHintBitsMinus1);
  }
}

// Write `color_config` (§ 5.5.2) for a profile from the fields given, `separate_uv_delta_q` reading 0 where the syntax codes it.
function writeColorConfig(writer: BitWriter, profile: number, color: Av1ColorFields): void {

  const { chromaSamplePosition = 0, colorRange = 0, description, highBitdepth = 0, monoChrome = 0, subsamplingX = 1, subsamplingY = 0, twelveBit = 0 } = color;

  writer.write(1, highBitdepth);

  if((profile === 2) && (highBitdepth === 1)) {

    writer.write(1, twelveBit);
  }

  if(profile !== 1) {

    writer.write(1, monoChrome);
  }

  writer.write(1, (description === undefined) ? 0 : 1);

  if(description !== undefined) {

    writer.write(8, description.primaries).write(8, description.transfer).write(8, description.matrix);
  }

  if(monoChrome === 1) {

    writer.write(1, colorRange);

    return;
  }

  const srgb = (description?.primaries === 1) && (description.transfer === 13) && (description.matrix === 0);

  if(!srgb) {

    writer.write(1, colorRange);

    const twelve = (profile === 2) && (highBitdepth === 1) && (twelveBit === 1);
    const both = (profile === 0) || (twelve && (subsamplingX === 1) && (subsamplingY === 1));

    if(twelve) {

      writer.write(1, subsamplingX);

      if(subsamplingX === 1) {

        writer.write(1, subsamplingY);
      }
    }

    if(both) {

      writer.write(2, chromaSamplePosition);
    }
  }

  writer.write(1, 0);
}

// AAC.

// The fields of an ADTS frame. The builder writes `objectType` less 1 as `profile_ObjectType`, a CRC after the header when `crc` is given, the whole frame's
// length unless `frameLength` states another, and `rawDataBlocks` less 1, one block unless asked otherwise.
export interface AdtsFields {

  readonly channelConfiguration: number;
  readonly crc?: number;
  readonly frameLength?: number;
  readonly layer?: number;
  readonly objectType: number;
  readonly payload: Uint8Array;
  readonly rawDataBlocks?: number;
  readonly samplingFrequencyIndex: number;
  readonly syncword?: number;
}

// An ADTS frame (ISO/IEC 13818-7 § 6.2): the header, the CRC when given, then the payload.
export function adtsFrame(fields: AdtsFields): Buffer {

  const { channelConfiguration, crc, frameLength, layer = 0, objectType, payload, rawDataBlocks = 1, samplingFrequencyIndex, syncword = 0xfff } = fields;
  const headerLength = (crc === undefined) ? 7 : 9;
  const writer = new BitWriter().write(12, syncword).write(1, 0).write(2, layer).write(1, (crc === undefined) ? 1 : 0).write(2, objectType - 1)
    .write(4, samplingFrequencyIndex).write(1, 0).write(3, channelConfiguration).write(4, 0).write(13, frameLength ?? (headerLength + payload.length))
    .write(11, 0x7ff).write(2, rawDataBlocks - 1);

  if(crc !== undefined) {

    writer.write(16, crc);
  }

  return Buffer.concat([ writer.toBuffer(), payload ]);
}

// Opus.

// An Opus packet (RFC 6716 § 3.1): the TOC byte of the configuration number, the stereo flag and the frame count code, then the payload.
export function opusPacket(fields: { readonly config: number; readonly frameCountCode?: number; readonly payload: Uint8Array; readonly stereo: boolean }): Buffer {

  const { config, frameCountCode = 0, payload, stereo } = fields;

  return Buffer.concat([ Buffer.from([(config << 3) | (stereo ? 0x04 : 0) | frameCountCode]), payload ]);
}
