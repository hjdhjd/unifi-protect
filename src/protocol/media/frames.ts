/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * frames.ts: The media group's frame model - one video or audio frame as the camera sends it, on the camera's own timeline.
 */

/**
 * The media group's frame model: one frame of a livestream as the camera sends it, the currency the UBV reader yields and the fMP4 writer takes. This module is
 * Layer 1 and declares types alone: no I/O, no time, no side effects.
 *
 * A frame carries its codec, its payload exactly as the camera sent it, and its timestamp. The payload is the most self-describing raw form of its codec, so a
 * consumer of frames needs nothing beside it, and rewriting it into a container's sample form is the writer's work:
 *
 * | Codec           | `data`                                                                                                     |
 * |-----------------|------------------------------------------------------------------------------------------------------------|
 * | `h264`, `h265`  | the frame's NAL units, each behind a four-byte big-endian length, a keyframe's parameter sets among them   |
 * | `av1`           | the frame's temporal unit, its OBUs carrying their size fields, a keyframe's sequence header among them    |
 * | `aac`           | one ADTS frame, its header and its raw data                                                                |
 * | `opus`          | one Opus packet                                                                                            |
 *
 * A timestamp counts ticks at the frame's `rate` on the camera's own timeline, as a `number`: it stays exact up to 2 ** 53, which a 90 kHz clock reaches only after
 * thousands of years, so no frame carries a `bigint`.
 *
 * @module ProtectFrames
 */
import type { LivestreamAudioCodec, LivestreamVideoCodec } from "./codecs.ts";

/**
 * One audio frame: its codec, its payload as the camera sent it (`data`, a view rather than a copy), and its `timestamp` in ticks at `rate`.
 *
 * @category Transport
 */
export interface AudioFrame {

  readonly codec: LivestreamAudioCodec;
  readonly data: Buffer;
  readonly kind: "audio";
  readonly rate: number;
  readonly timestamp: number;
}

/**
 * One frame of a livestream, video or audio, told apart by `kind`.
 *
 * @category Transport
 */
export type MediaFrame = AudioFrame | VideoFrame;

/**
 * One video frame: its codec, whether it is a keyframe, its payload as the camera sent it (`data`, a view rather than a copy), and its `timestamp` in ticks at
 * `rate`.
 *
 * @category Transport
 */
export interface VideoFrame {

  readonly codec: LivestreamVideoCodec;
  readonly data: Buffer;
  readonly keyframe: boolean;
  readonly kind: "video";
  readonly rate: number;
  readonly timestamp: number;
}
