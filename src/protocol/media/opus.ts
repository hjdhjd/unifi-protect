/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * opus.ts: The Opus reader - a packet's channel count from its TOC byte, and the configuration an fMP4 track is written from.
 */

/**
 * The Opus reader: a packet's channel count from its TOC byte, and the configuration an fMP4 track is written from. This module is Layer 1: no I/O, no time, no
 * side effects - bytes in, a configuration out, or a {@link ProtectProtocolError} naming the fault.
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
 * The record is the `dOps` payload (Encapsulation of Opus in ISO Base Media File Format § 4.3.2): `Version` 0 (u8), `OutputChannelCount` (u8), `PreSkip` (u16),
 * `InputSampleRate` (u32), `OutputGain` 0 (s16) and `ChannelMappingFamily` 0 (u8), the family that one and two channels allow. A mono record reads
 * `00 01 0f 00 00 00 bb 80 00 00 00`.
 *
 * @module ProtectOpus
 */
import { u16, u32, u8 } from "./boxes.ts";
import type { AudioConfiguration } from "./codecs.ts";
import { ProtectProtocolError } from "../../errors.ts";

// The rate every Opus stream decodes at. The `dOps` box's input sample rate names the encoder's source and not the playback rate, so it is never the rate reported.
export const OPUS_DECODE_RATE = 48000;

/* The pre-skip the record states: 3840 samples, 80 ms at the decode rate. The ISO binding requires at least 80 ms of pre-skip, and RFC 7845 § 5.1 recommends at
 * least 3840 for a stream whose beginning is cut, as a subscriber's is when it joins mid-stream: the decoder discards that much of its output while it converges.
 */
const OPUS_PRE_SKIP = 3840;

// The TOC byte's stereo flag.
const TOC_STEREO = 0x04;

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
