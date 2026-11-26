/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * aac.ts: The AAC reader - an ADTS frame's header, and the configuration an fMP4 track is written from.
 */

/**
 * The AAC reader: an ADTS frame's header, and the configuration an fMP4 track is written from. This module is Layer 1: no I/O, no time, no side effects - bytes
 * in, a header or a configuration out, or a {@link ProtectProtocolError} naming the fault.
 *
 * An ADTS frame is one raw AAC frame behind a header of seven bytes, or nine when a CRC follows it (ISO/IEC 13818-7 § 6.2):
 *
 * | Field                                | Bits | Values                                                     |
 * |--------------------------------------|------|------------------------------------------------------------|
 * | `syncword`                           | 12   | `fff`                                                      |
 * | `ID`                                 | 1    | 0 for MPEG-4, 1 for MPEG-2                                 |
 * | `layer`                              | 2    | 0                                                          |
 * | `protection_absent`                  | 1    | 1 when no CRC follows the header                           |
 * | `profile_ObjectType`                 | 2    | the audio object type less 1                               |
 * | `sampling_frequency_index`           | 4    | an index into the sampling frequencies, 0 to 12            |
 * | `private_bit`                        | 1    |                                                            |
 * | `channel_configuration`              | 3    | the channel layout, 0 leaving it to the raw data           |
 * | `original_copy`, `home`              | 2    |                                                            |
 * | `copyright_identification_bit`       | 1    |                                                            |
 * | `copyright_identification_start`     | 1    |                                                            |
 * | `aac_frame_length`                   | 13   | the whole frame in bytes, its header included              |
 * | `adts_buffer_fullness`               | 11   |                                                            |
 * | `number_of_raw_data_blocks_in_frame` | 2    | the raw data blocks less 1                                 |
 * | `crc_check`                          | 16   | present only when `protection_absent` is 0                 |
 *
 * The configuration's record is the `AudioSpecificConfig` an `esds` wraps (ISO/IEC 14496-3 § 1.6.2.1): the audio object type in five bits, the sampling-frequency
 * index in four, the channel configuration in four, then the `GASpecificConfig`'s three flags, all zero. AAC-LC at 48000 Hz in two channels reads
 * `00010 0011 0010 000`, `11 90`.
 *
 * @module ProtectAac
 */
import type { AudioConfiguration } from "./codecs.ts";
import { BitReader } from "../bits.ts";
import { ProtectProtocolError } from "../../../shared/errors.ts";
import { u16 } from "../boxes.ts";

// The audio object type of AAC-LC, the one object type the media group describes as `aac` from a bare configuration. The init reader also reads the SBR and PS
// extensions over an AAC-LC core; the ADTS header has no room to signal either, so the ADTS reader takes AAC-LC alone.
export const AAC_LC_OBJECT_TYPE = 2;

// The sampling frequencies a four-bit sampling-frequency index names, shared by the `AudioSpecificConfig` and the ADTS header. Indexes 0 to 12 name a rate, 13 and 14
// are reserved, and 15 is the `AudioSpecificConfig`'s escape to an explicit rate, which the ADTS header cannot carry.
export const SAMPLING_FREQUENCIES: readonly number[] = [ 96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350 ];

// The channel count each channel configuration names: 1 to 6 name that many channels, and 7 names eight. Configuration 0 names no count, the layout being carried
// in a program config element instead, and 8 to 15 are reserved, so neither has an entry.
export const CHANNEL_COUNTS: ReadonlyMap<number, number> = new Map([ [ 1, 1 ], [ 2, 2 ], [ 3, 3 ], [ 4, 4 ], [ 5, 5 ], [ 6, 6 ], [ 7, 8 ] ]);

// An ADTS header's two sizes: seven bytes without a CRC, and nine with the 16-bit CRC after them.
const ADTS_HEADER_SIZE = 7;
const ADTS_HEADER_WITH_CRC_SIZE = 9;

// The syncword every ADTS header opens with, twelve one bits.
const ADTS_SYNCWORD = 0xfff;

/**
 * The fields of an ADTS header a reader of the stream needs: the audio object type, the sampling-frequency index with the rate it names, the channel
 * configuration, and the header's length, which the raw frame follows.
 *
 * @category Transport
 */
export interface AdtsHeader {

  readonly channelConfiguration: number;
  readonly headerLength: number;
  readonly objectType: number;
  readonly sampleRate: number;
  readonly samplingFrequencyIndex: number;
}

/**
 * Read an ADTS frame's header.
 *
 * @param frame - One whole ADTS frame, its header and its raw data.
 *
 * @returns The header's fields.
 *
 * @throws {@link ProtectProtocolError} if the frame is shorter than its header, opens with another syncword, names a layer other than 0, a reserved
 *   sampling-frequency index or channel configuration 0, carries more than one raw data block, states a frame length other than its own, or names an audio object
 *   type other than AAC-LC.
 *
 * @category Codec
 */
export function readAdtsHeader(frame: Buffer): AdtsHeader {

  if(frame.length < ADTS_HEADER_SIZE) {

    throw new ProtectProtocolError("ADTS frame is shorter than its seven-byte header.");
  }

  const reader = new BitReader(frame, { end: frame.length, start: 0 });
  const syncword = reader.read(12);

  reader.skip(1);

  const layer = reader.read(2);
  const headerLength = (reader.read(1) === 1) ? ADTS_HEADER_SIZE : ADTS_HEADER_WITH_CRC_SIZE;
  const objectType = reader.read(2) + 1;
  const samplingFrequencyIndex = reader.read(4);

  reader.skip(1);

  const channelConfiguration = reader.read(3);

  reader.skip(4);

  const frameLength = reader.read(13);

  reader.skip(11);

  const rawDataBlocks = reader.read(2) + 1;
  const sampleRate = SAMPLING_FREQUENCIES[samplingFrequencyIndex];

  if(syncword !== ADTS_SYNCWORD) {

    throw new ProtectProtocolError("ADTS frame does not open with the ADTS syncword.");
  }

  if(layer !== 0) {

    throw new ProtectProtocolError("ADTS frame names a layer other than 0.");
  }

  if(frame.length < headerLength) {

    throw new ProtectProtocolError("ADTS frame is shorter than its nine-byte header with its CRC.");
  }

  if(sampleRate === undefined) {

    throw new ProtectProtocolError("ADTS frame names a reserved sampling-frequency index.");
  }

  adtsChannels(channelConfiguration);

  if(rawDataBlocks > 1) {

    throw new ProtectProtocolError("ADTS frame carries more than one raw data block.");
  }

  if(frameLength !== frame.length) {

    throw new ProtectProtocolError("ADTS frame states a frame length other than its own.");
  }

  if(objectType !== AAC_LC_OBJECT_TYPE) {

    throw new ProtectProtocolError("ADTS frame names an audio object type other than AAC-LC.");
  }

  return { channelConfiguration, headerLength, objectType, sampleRate, samplingFrequencyIndex };
}

/**
 * Read the configuration an fMP4 track is written from out of an ADTS frame's header.
 *
 * @param frame - One whole ADTS frame, its header and its raw data.
 *
 * @returns The configuration: the channel count and sample rate, the `AudioSpecificConfig` as its record, and the `mp4a.40.<object type>` label.
 *
 * @throws {@link ProtectProtocolError} if the header is malformed, as {@link readAdtsHeader} refuses it.
 *
 * @category Codec
 */
export function readAacConfiguration(frame: Buffer): AudioConfiguration {

  const { channelConfiguration, objectType, sampleRate, samplingFrequencyIndex } = readAdtsHeader(frame);

  return {

    channels: adtsChannels(channelConfiguration),
    codec: "aac",
    label: "mp4a.40." + String(objectType),
    record: u16((objectType << 11) | (samplingFrequencyIndex << 7) | (channelConfiguration << 3)),
    sampleRate
  };
}

// The channel count an ADTS frame's channel configuration names. Configuration 0 leaves the layout to a program config element in the raw data, which the header
// cannot describe, so it is refused; the three-bit field names no reserved configuration.
function adtsChannels(channelConfiguration: number): number {

  const channels = CHANNEL_COUNTS.get(channelConfiguration);

  if(channels === undefined) {

    throw new ProtectProtocolError("ADTS frame names channel configuration 0, which leaves its channel layout to the raw data.");
  }

  return channels;
}
