/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * livestream-session.helpers.ts: Frame builders for the UniFi Protect livestream wire protocol, for driving LivestreamSession tests through a fake WebSocket. The byte
 * values mirror the (private) LiveFrame map in livestream-session.ts; each frame is a 1-byte type, a 3-byte big-endian length, then the payload.
 */

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
