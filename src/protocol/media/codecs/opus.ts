/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * opus.ts: The Opus reader - a packet's channel count and duration from its TOC byte, and the configuration an fMP4 track is written from.
 */

/**
 * The Opus reader: a packet's channel count and duration from its TOC byte, and the configuration an fMP4 track is written from. This module is Layer 1: no I/O, no
 * time, no side effects - bytes in, a count, a duration or a configuration out, or a {@link ProtectProtocolError} naming the fault.
 *
 * Every Opus packet opens with its TOC byte (RFC 6716 § 3.1):
 *
 * ```
 * bit    7 6 5 4 3    2    1 0
 *        config       s    c
 * ```
 *
 * `config` names the mode, bandwidth and frame duration, `s` is set when the packet is coded in stereo, and `c` counts the frames the packet holds. The stream
 * carries no `OpusHead`, so the channel count is the one fact a packet states about its stream, and every other field of the configuration's record is the
 * binding's own.
 *
 * A packet's duration is its frame size times its frame count (RFC 6716 § 3.1, Table 2, and § 3.2). The configuration's mode and its low bits name the frame size:
 *
 * | `config` | Mode      | `config & 3` or `config & 1` | Frame size                          |
 * |----------|-----------|------------------------------|-------------------------------------|
 * | 0-11     | SILK-only | `config & 3`: 0, 1, 2, 3     | 10, 20, 40, 60 ms                   |
 * | 12-15    | Hybrid    | `config & 1`: 0, 1           | 10, 20 ms                           |
 * | 16-31    | CELT-only | `config & 3`: 0, 1, 2, 3     | 2.5, 5, 10, 20 ms                   |
 *
 * Code 0 holds one frame, codes 1 and 2 hold two, and code 3 holds the count its second byte's low six bits state, the VBR and padding flags above them read past.
 * A packet holds at most 120 ms of audio (§ 3.2.5).
 *
 * The record is the `dOps` payload (Encapsulation of Opus in ISO Base Media File Format § 4.3.2): `Version` 0 (u8), `OutputChannelCount` (u8), `PreSkip` (u16),
 * `InputSampleRate` (u32), `OutputGain` 0 (s16) and `ChannelMappingFamily` 0 (u8), the family that one and two channels allow. A mono record reads
 * `00 01 0f 00 00 00 bb 80 00 00 00`.
 *
 * @module ProtectOpus
 */
import { u16, u32, u8 } from "../boxes.ts";
import type { AudioConfiguration } from "./codecs.ts";
import { ProtectProtocolError } from "../../../shared/errors.ts";

// The rate every Opus stream decodes at. The `dOps` box's input sample rate names the encoder's source and not the playback rate, so it is never the rate reported.
export const OPUS_DECODE_RATE = 48000;

/* The pre-skip the record states: 3840 samples, 80 ms at the decode rate. The ISO binding requires at least 80 ms of pre-skip, and RFC 7845 § 5.1 recommends at
 * least 3840 for a stream whose beginning is cut, as a subscriber's is when it joins mid-stream: the decoder discards that much of its output while it converges.
 */
const OPUS_PRE_SKIP = 3840;

// The TOC byte's stereo flag.
const TOC_STEREO = 0x04;

// The TOC byte's frame count code, and the mask of a code-3 packet's second byte that holds its frame count beneath the VBR and padding flags.
const TOC_FRAME_COUNT_CODE = 0x03;
const FRAME_COUNT_MASK = 0x3f;

// The frame sizes, in samples at the decode rate, a SILK-only configuration's low two bits and a hybrid configuration's low bit name: 10, 20, 40 and 60 ms, and 10
// and 20 ms. Each table is a tuple read at the masked bits' own type, so every index it is read at holds a size. A CELT-only configuration's four sizes double from
// 2.5 ms, 120 samples, so its size is a shift rather than a table.
const SILK_FRAME_SIZES = [ 480, 960, 1920, 2880 ] as const;
const HYBRID_FRAME_SIZES = [ 480, 960 ] as const;
const CELT_SHORTEST_FRAME = 120;

// The first configuration of the hybrid and CELT-only modes, every configuration below the first being SILK-only.
const FIRST_HYBRID_CONFIG = 12;
const FIRST_CELT_CONFIG = 16;

// The most audio one packet may hold: 120 ms, in samples at the decode rate.
const OPUS_PACKET_MAX_SAMPLES = 5760;

/* The label RFC 6381 gives an Opus stream. Read to the letter, § 3.3 takes the sample entry's own spelling, `Opus`, but the label exists to be handed to other
 * software, and the packagers that write one for Opus in MP4, FFmpeg's DASH muxer among them, write it lowercase.
 */
const OPUS_LABEL = "opus";

/**
 * Read the channel count an Opus packet is coded in from its TOC byte.
 *
 * @param packet - One Opus packet.
 *
 * @returns 2 when the TOC byte's stereo flag is set, and 1 otherwise.
 *
 * @throws {@link ProtectProtocolError} if the packet is empty.
 *
 * @category Codec
 */
export function opusChannels(packet: Buffer): number {

  if(packet.length === 0) {

    throw new ProtectProtocolError("Opus packet is empty and carries no TOC byte.");
  }

  return ((packet.readUInt8(0) & TOC_STEREO) !== 0) ? 2 : 1;
}

/**
 * Read how much audio an Opus packet holds from its TOC byte: the frame size its configuration names times the frame count its code names.
 *
 * @param packet - One Opus packet. Accepts any `Uint8Array` (a `Buffer` included) and reads it without copying.
 *
 * @returns The packet's duration in samples at the decode rate, 48000 a second.
 *
 * @throws {@link ProtectProtocolError} if the packet is empty, is a code-3 packet without its frame count byte, counts zero frames, or holds more than 120 ms.
 *
 * @category Codec
 */
export function opusPacketDuration(packet: Uint8Array): number {

  const toc = packet[0];

  if(toc === undefined) {

    throw new ProtectProtocolError("Opus packet is empty and carries no TOC byte.");
  }

  const count = opusFrameCount(packet, toc & TOC_FRAME_COUNT_CODE);
  const duration = opusFrameSize(toc >> 3) * count;

  if(duration > OPUS_PACKET_MAX_SAMPLES) {

    throw new ProtectProtocolError("Opus packet holds more than the 120 ms of audio a packet may hold.");
  }

  return duration;
}

/**
 * Read the configuration an fMP4 track is written from out of an Opus packet.
 *
 * @param packet - One Opus packet.
 *
 * @returns The configuration: the packet's channel count at the decode rate, the `dOps` payload as its record, and the `opus` label.
 *
 * @throws {@link ProtectProtocolError} if the packet is empty.
 *
 * @category Codec
 */
export function readOpusConfiguration(packet: Buffer): AudioConfiguration {

  const channels = opusChannels(packet);

  // The stream states no source rate, so the record's input sample rate names the decode rate, which is the rate the decoder produces in any case.
  return {

    channels,
    codec: "opus",
    label: OPUS_LABEL,
    record: Buffer.concat([ u8(0), u8(channels), u16(OPUS_PRE_SKIP), u32(OPUS_DECODE_RATE), u16(0), u8(0) ]),
    sampleRate: OPUS_DECODE_RATE
  };
}

// The frame size a TOC configuration names, in samples at the decode rate, by its mode and the low bits RFC 6716 Table 2 reads.
function opusFrameSize(config: number): number {

  if(config < FIRST_HYBRID_CONFIG) {

    return SILK_FRAME_SIZES[(config & 3) as 0 | 1 | 2 | 3];
  }

  if(config < FIRST_CELT_CONFIG) {

    return HYBRID_FRAME_SIZES[(config & 1) as 0 | 1];
  }

  return CELT_SHORTEST_FRAME << (config & 3);
}

// The frame count a TOC byte's code names: one for code 0, two for codes 1 and 2, and for code 3 the count its second byte states, which must be there and must count
// at least one frame.
function opusFrameCount(packet: Uint8Array, code: number): number {

  switch(code) {

    case 0:

      return 1;

    case 1:
    case 2:

      return 2;

    default: {

      const countByte = packet[1];

      if(countByte === undefined) {

        throw new ProtectProtocolError("Opus packet of frame count code 3 carries no frame count byte.");
      }

      const count = countByte & FRAME_COUNT_MASK;

      if(count === 0) {

        throw new ProtectProtocolError("Opus packet of frame count code 3 counts zero frames.");
      }

      return count;
    }
  }
}
