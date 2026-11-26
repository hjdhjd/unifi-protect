/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * writer-parity.test.ts: Differential tests reading the fMP4 writer's output through homebridge-plugin-utils' own fMP4 readers, the ones a livestream's
 * consumer reads an init and its segments with. The library takes no runtime dependency on that package, so this suite holds the writer to those readers: from a
 * written init and its segments they answer the video track and its timescale, whether the stream has audio, a keyframe at the sample that carries one, and one
 * piece per video sample with its size and its duration.
 */
import { H264_IDR, H264_NON_IDR, adtsFrame, h264Pps, h264Sps, h264Unit, lengthPrefixed } from "../codecs/codecs.helpers.ts";
import { audioFrame, videoFrame } from "./writer.helpers.ts";
import { describe, test } from "node:test";
import { findKeyframe, findVideoTrack, hasAudioTrack, splitVideoFrames, startsWithKeyframe } from "homebridge-plugin-utils";
import { Fmp4Writer } from "./writer.ts";
import type { MediaFrame } from "../frames.ts";
import assert from "node:assert/strict";

// An H.264 High (profile 100) stream at level 3.1 (31), 4:2:0 at 8 bits, 80 by 45 macroblocks (1280 by 720): a keyframe of its SPS, its PPS and an IDR slice, and a
// frame of one slice, each slice's payload a stated value.
const SPS = h264Sps({ constraints: 0, heightInMapUnitsMinus1: 44, high: { bitDepthChromaMinus8: 0, bitDepthLumaMinus8: 0, chromaFormatIdc: 1 }, levelIdc: 31,
  profileIdc: 100, widthInMbsMinus1: 79 });
const IDR = h264Unit(H264_IDR, Buffer.from([ 0x88, 0x84, 0x00, 0x33, 0xff, 0x02 ]));
const SLICE = h264Unit(H264_NON_IDR, Buffer.from([ 0x9a, 0x02, 0x0c ]));
const KEY = lengthPrefixed(SPS, h264Pps(), IDR);
const DELTA = lengthPrefixed(SLICE);

// The writer's sample of each: a keyframe without its parameter sets, and a frame whole.
const KEY_SAMPLE = lengthPrefixed(IDR).length;
const DELTA_SAMPLE = DELTA.length;

/* Seven video frames 3600 ticks apart on a 90 kHz clock, with a keyframe at the first and the fifth, and AAC-LC frames at 48000 Hz in two channels 1920 ticks apart
 * from 1440 ticks past the first keyframe, each a 7-byte header over 3 bytes. At 100 ms the fourth frame closes the first segment over the first three video
 * frames, which opens on a keyframe, and the seventh closes the second over the next three, whose keyframe is its second sample.
 */
function stream(audio: boolean): MediaFrame[] {

  const video = [ 0, 1, 2, 3, 4, 5, 6 ].map((index) => ({ at: index * 0.04, frame: videoFrame("h264", [ 0, 4 ].includes(index) ? KEY : DELTA,
    { keyframe: [ 0, 4 ].includes(index), timestamp: 90000000 + (index * 3600) }) }));
  const sound = [ 0, 1, 2, 3, 4, 5 ].map((index) => ({ at: 0.03 + (index * 0.04), frame: audioFrame("aac", adtsFrame({ channelConfiguration: 2, objectType: 2,
    payload: Buffer.from([ index, index, index ]), samplingFrequencyIndex: 3 }), { rate: 48000, timestamp: 48000000 + 1440 + (index * 1920) }) }));

  return [ ...video, ...(audio ? sound : []) ].toSorted((first, second) => first.at - second.at).map(({ frame }) => frame);
}

// The init and the media segments one writer answers for a stream.
function written(audio: boolean): { init: Buffer; media: Buffer[] } {

  const writer = new Fmp4Writer({ segmentLength: 100 });
  const segments = stream(audio).flatMap((frame) => writer.push(frame));

  return { init: segments.find((segment) => segment.type === "init")?.data ?? Buffer.alloc(0),
    media: segments.flatMap((segment) => (segment.type === "media") ? [segment.data] : []) };
}

describe("fMP4 writer parity with the plugin utilities' readers", () => {

  test("findVideoTrack reads the video track and its timescale, and hasAudioTrack whether the stream has audio", () => {

    assert.deepEqual(findVideoTrack(written(true).init), { id: 1, timescale: 90000 });
    assert.equal(hasAudioTrack(written(true).init), true);
    assert.equal(hasAudioTrack(written(false).init), false);
  });

  test("findKeyframe and startsWithKeyframe read the keyframe at the sample that carries it, with and without a track", () => {

    const { init, media } = written(true);
    const track = findVideoTrack(init) ?? undefined;

    assert.equal(media.length, 2);
    assert.deepEqual(media.map((segment) => findKeyframe(segment)), [ 0, 1 ]);
    assert.deepEqual(media.map((segment) => findKeyframe(segment, track)), [ 0, 1 ]);
    assert.deepEqual(media.map((segment) => startsWithKeyframe(segment)), [ true, false ]);
    assert.deepEqual(media.map((segment) => startsWithKeyframe(segment, track)), [ true, false ]);
  });

  test("splitVideoFrames cuts one piece per video sample, each ending where its sample does and lasting its duration", () => {

    const { init, media } = written(true);
    const track = findVideoTrack(init);

    assert.ok(track);

    for(const [ index, segment ] of media.entries()) {

      const pieces = splitVideoFrames(segment, track);
      const sizes = (index === 0) ? [ KEY_SAMPLE, DELTA_SAMPLE, DELTA_SAMPLE ] : [ DELTA_SAMPLE, KEY_SAMPLE, DELTA_SAMPLE ];
      const moofSize = segment.readUInt32BE(0);

      // The first piece runs from the segment's start through the first sample, and the last runs from its sample to the segment's end, the audio samples
      // after it included, so the pieces join back to the whole segment.
      assert.ok(pieces);
      assert.deepEqual(pieces.map(({ duration }) => duration), [ 40, 40, 40 ]);
      assert.deepEqual(pieces.slice(0, -1).map(({ bytes }) => bytes.length), [ moofSize + 8 + (sizes[0] ?? 0), sizes[1] ?? 0 ]);
      assert.deepEqual(Buffer.concat(pieces.map(({ bytes }) => bytes)), segment);
    }
  });
});
