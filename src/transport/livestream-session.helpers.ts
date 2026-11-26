/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * livestream-session.helpers.ts: Frame builders for the UniFi Protect livestream wire protocol, for driving LivestreamSession tests through a fake WebSocket. The byte
 * values mirror the (private) LiveFrame map in livestream-session-intake.ts; each frame is a 1-byte type, a 3-byte big-endian length, then the payload. Beside them,
 * the UBV records a UBV stream's suites build, through the UBV and codec builders, each value synthetic.
 */
import { H264_IDR, H264_NON_IDR, adtsFrame, h264Pps, h264Sps, h264Unit, lengthPrefixed, opusPacket } from "../protocol/media/codecs.helpers.ts";
import { UBV_AAC, UBV_H264, UBV_OPUS, ubvRecord } from "../protocol/media/ubv.helpers.ts";
import type { LivestreamAudioCodec } from "../protocol/media/codecs.ts";

// Frame-type tag bytes. Mirror the production LiveFrame map byte-for-byte.
export const FRAME_TIMESTAMP = 247;
export const FRAME_CODEC_INFORMATION = 248;
export const FRAME_BEGIN_SEGMENT = 249;
export const FRAME_INIT_SEGMENT = 250;
export const FRAME_MOOF = 251;
export const FRAME_VIDEO = 252;
export const FRAME_AUDIO = 253;
export const FRAME_MDAT = 254;
export const FRAME_END_SEGMENT = 255;

/**
 * Build one livestream frame: a 1-byte type, a 3-byte big-endian payload length, then the payload.
 *
 * @param frameType - The frame-type byte (one of the `FRAME_*` constants).
 * @param payload   - The frame payload.
 *
 * @returns The encoded frame bytes.
 */
export function buildLiveFrame(frameType: number, payload: Buffer = Buffer.alloc(0)): Buffer {

  const header = Buffer.alloc(4);

  header.writeUInt8(frameType, 0);
  header.writeUIntBE(payload.length, 1, 3);

  return Buffer.concat([ header, payload ]);
}

/**
 * Build the frames that initialize a stream: an optional codec-information frame followed by the init-segment frame, in the order the controller sends them.
 *
 * @param opts - The init segment bytes and an optional codec descriptor.
 *
 * @returns The concatenated init frames.
 */
export function buildInitSegment(opts: { codec?: string; data: Buffer }): Buffer {

  const frames: Buffer[] = [];

  if(opts.codec !== undefined) {

    frames.push(buildLiveFrame(FRAME_CODEC_INFORMATION, Buffer.from(opts.codec)));
  }

  frames.push(buildLiveFrame(FRAME_INIT_SEGMENT, opts.data));

  return Buffer.concat(frames);
}

/**
 * Build a timestamp frame from an array of decode timestamps, each an 8-byte big-endian unsigned integer (the wire shape the session reads back as a `number[]`).
 *
 * @param timestamps - The decode timestamps.
 *
 * @returns The encoded timestamp frame.
 */
export function buildTimestampFrame(timestamps: readonly number[]): Buffer {

  const payload = Buffer.alloc(timestamps.length * 8);

  for(let index = 0; index < timestamps.length; index++) {

    payload.writeBigUInt64BE(BigInt(timestamps[index] ?? 0), index * 8);
  }

  return buildLiveFrame(FRAME_TIMESTAMP, payload);
}

/**
 * Build a complete media segment: a begin-segment frame, an optional timestamp frame, the moof and mdat boxes, optional video and audio boxes, and an end-segment frame -
 * the order the controller delivers them, which the session assembles into one fragment buffer.
 *
 * @param opts - The boxes that make up the segment and optional decode timestamps.
 *
 * @returns The concatenated segment frames.
 */
export function buildMediaSegment(opts: { audio?: Buffer; mdat: Buffer; moof: Buffer; timestamps?: readonly number[]; video?: Buffer }): Buffer {

  const frames: Buffer[] = [buildLiveFrame(FRAME_BEGIN_SEGMENT)];

  if(opts.timestamps !== undefined) {

    frames.push(buildTimestampFrame(opts.timestamps));
  }

  frames.push(buildLiveFrame(FRAME_MOOF, opts.moof), buildLiveFrame(FRAME_MDAT, opts.mdat));

  if(opts.video !== undefined) {

    frames.push(buildLiveFrame(FRAME_VIDEO, opts.video));
  }

  if(opts.audio !== undefined) {

    frames.push(buildLiveFrame(FRAME_AUDIO, opts.audio));
  }

  frames.push(buildLiveFrame(FRAME_END_SEGMENT));

  return Buffer.concat(frames);
}

// UBV records.

// The H.264 stream a UBV stream's video carries unless a row states its own SPS: Main (77) at level 3.0 (30) with no constraint flags, 20 by 15 macroblocks (320 by
// 240), its PPS, an IDR slice and the slice of a frame that is not a keyframe, each slice over the payload bytes given.
export const UBV_SPS = h264Sps({ constraints: 0, heightInMapUnitsMinus1: 14, levelIdc: 30, profileIdc: 77, widthInMbsMinus1: 19 });
const UBV_PPS = h264Pps();
const UBV_IDR = h264Unit(H264_IDR, Buffer.from([ 0x88, 0x84, 0x21 ]));
const UBV_SLICE = h264Unit(H264_NON_IDR, Buffer.from([ 0x9a, 0x02, 0x4c ]));

/**
 * Build a UBV record of an H.264 frame on the 90 kHz clock: a keyframe carrying the stream's parameter sets with its IDR slice, or a frame carrying its slice alone.
 *
 * @param ticks - The frame's timestamp on the 90 kHz clock.
 * @param opts  - `keyframe` marks a keyframe, and `sps` replaces the SPS a keyframe carries.
 *
 * @returns The record's bytes.
 */
export function ubvVideo(ticks: number, opts: { keyframe?: boolean; sps?: Buffer } = {}): Buffer {

  const { keyframe = false, sps = UBV_SPS } = opts;

  return ubvRecord({ keyframe, payload: keyframe ? lengthPrefixed(sps, UBV_PPS, UBV_IDR) : lengthPrefixed(UBV_SLICE), timestamp: ticks, track: UBV_H264 });
}

/**
 * Build a UBV record of an audio frame on its 48 kHz clock: AAC-LC in one channel at sampling-frequency index 3 behind its ADTS header, or an Opus packet of
 * configuration 9 in one channel.
 *
 * @param codec - The frame's codec.
 * @param ticks - The frame's timestamp on the 48 kHz clock.
 *
 * @returns The record's bytes.
 */
export function ubvAudio(codec: LivestreamAudioCodec, ticks: number): Buffer {

  if(codec === "aac") {

    return ubvRecord({ payload: adtsFrame({ channelConfiguration: 1, objectType: 2, payload: Buffer.from([ 0x21, 0x10 ]), samplingFrequencyIndex: 3 }),
      timestamp: ticks, track: UBV_AAC });
  }

  return ubvRecord({ payload: opusPacket({ config: 9, payload: Buffer.from([0x0c]), stereo: false }), timestamp: ticks, track: UBV_OPUS });
}

/**
 * Build a UBV stream's opening: a keyframe at `ticks` on the 90 kHz clock, an audio frame of the codec given 20 ms after it on the 48 kHz clock, left out when the
 * codec is null, and three frames 40 ms apart, the last of which closes the first segment at the default segment length. A writer that has learned an audio
 * configuration, or waits for none, answers its init and first media segment as that last frame arrives.
 *
 * @param audio - The audio frame's codec, or null for an opening of video alone.
 * @param ticks - The keyframe's timestamp on the 90 kHz clock, a multiple of 15 so the audio frame's lands on a whole tick.
 *
 * @returns The opening's records, in one buffer.
 */
export function ubvOpening(audio: LivestreamAudioCodec | null, ticks = 0): Buffer {

  return Buffer.concat([ ubvVideo(ticks, { keyframe: true }), ...((audio === null) ? [] : [ubvAudio(audio, ((ticks * 8) / 15) + 960)]), ubvVideo(ticks + 3600),
    ubvVideo(ticks + 7200), ubvVideo(ticks + 10800) ]);
}
