/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * livestream-session-intake.test.ts: Tests for the UBV intake - the frames it hands its sink ahead of its writer, the audio of another codec it drops and the run of
 * it that ends the stream, and the audio wait it gives its writer when the camera sends audio. Every stream is synthetic, built through the UBV and codec builders.
 */
import { UBV_AAC, ubvRecord } from "../protocol/media/ubv.helpers.ts";
import { describe, test } from "node:test";
import { ubvAudio, ubvOpening, ubvVideo } from "./livestream-session.helpers.ts";
import type { LivestreamInit } from "../protocol/media/init-segment.ts";
import type { LivestreamIntakeSink } from "./livestream-session-intake.ts";
import type { MediaFrame } from "../protocol/media/frames.ts";
import { ProtectLivestreamAudioError } from "../errors.ts";
import type { Segment } from "./livestream-session.ts";
import { UbvIntake } from "./livestream-session-intake.ts";
import { adtsFrame } from "../protocol/media/codecs.helpers.ts";
import assert from "node:assert/strict";

// A sink that records what an intake hands it: every frame, every init and every media segment, each in the order it arrived, and the kind of each call in one
// ordered list across the three.
function collector(): { calls: ("frame" | "init" | "media")[]; frames: MediaFrame[]; inits: LivestreamInit[]; media: Extract<Segment, { type: "media" }>[];
  sink: LivestreamIntakeSink; } {

  const calls: ("frame" | "init" | "media")[] = [];
  const frames: MediaFrame[] = [];
  const inits: LivestreamInit[] = [];
  const media: Extract<Segment, { type: "media" }>[] = [];

  return { calls, frames, inits, media, sink: {

    frame: (frame): void => {

      calls.push("frame");
      frames.push(frame);
    },
    init: (init): void => {

      calls.push("init");
      inits.push(init);
    },
    media: (segment): void => {

      calls.push("media");
      media.push(segment);
    }
  } };
}

// A UBV record of an AAC-LC frame in one channel at sampling-frequency index 8, 16000 Hz, whose timestamps count on that clock.
function slowAac(ticks: number): Buffer {

  return ubvRecord({ payload: adtsFrame({ channelConfiguration: 1, objectType: 2, payload: Buffer.from([0x2c]), samplingFrequencyIndex: 8 }), timestamp: ticks,
    track: UBV_AAC });
}

describe("UbvIntake", () => {

  test("audio of a codec other than the one asked for reaches neither the frame rail nor the writer", () => {

    // A stream asking for Opus that carries AAC between its video frames: the writer, waiting for no audio, closes its first segment over video alone.
    const { frames, inits, sink } = collector();
    const intake = new UbvIntake({ audio: "opus", audioExpected: false, segmentLength: 100, sink });

    intake.push(Buffer.concat([ ubvVideo(0, { keyframe: true }), ubvAudio("aac", 960), ubvVideo(3600), ubvAudio("aac", 2880), ubvVideo(7200), ubvVideo(10800) ]));

    assert.deepEqual(frames.map(({ kind }) => kind), [ "video", "video", "video", "video" ]);
    assert.deepEqual(inits.map(({ codec }) => codec), ["avc1.4d001e"]);
  });

  test("a run of the other codec's audio ends the stream once a frame lies the wait's length past the run's first, on its own clock, and not one frame short " +
    "of it", () => {

    // AAC at 16000 Hz in frames 1000 ticks apart, in a stream asking for Opus: the wait of 3000 ms is 48000 ticks on that clock, so the frame at 47000 is dropped and
    // the frame at 48000 ends the stream.
    const intake = new UbvIntake({ audio: "opus", audioExpected: true, segmentLength: 100, sink: collector().sink });

    for(let ticks = 0; ticks <= 47000; ticks += 1000) {

      intake.push(slowAac(ticks));
    }

    assert.throws(() => intake.push(slowAac(48000)), { constructor: ProtectLivestreamAudioError,
      message: "The UniFi Protect controller is streaming an audio codec other than the one the livestream asked for." });
  });

  test("a frame of the asked codec ends the run, so the other codec's audio after it opens a run of its own", () => {

    // AAC from 0 to 30000 ticks, an Opus frame, then AAC again from 31000: the second run reaches 78000 without ending the stream, and ends it at 79000, its own
    // first frame's 31000 plus the wait.
    const { frames, sink } = collector();
    const intake = new UbvIntake({ audio: "opus", audioExpected: true, segmentLength: 100, sink });

    for(let ticks = 0; ticks <= 30000; ticks += 1000) {

      intake.push(slowAac(ticks));
    }

    intake.push(ubvAudio("opus", 96000));

    for(let ticks = 31000; ticks <= 78000; ticks += 1000) {

      intake.push(slowAac(ticks));
    }

    assert.deepEqual(frames.map(({ codec }) => codec), ["opus"]);
    assert.throws(() => intake.push(slowAac(79000)), { constructor: ProtectLivestreamAudioError });
  });

  test("a stream that expects audio and receives none streams video alone, its first segment closing at the wait's length and every later one at the " +
    "segment length", () => {

    // Video 3600 ticks apart: the wait of 3000 ms is 270000 ticks, so the frame at 270000 closes the first segment, and the segment length of 9000 ticks closes the
    // next as the frame at 280800 arrives.
    const { inits, media, sink } = collector();
    const intake = new UbvIntake({ audio: "aac", audioExpected: true, segmentLength: 100, sink });
    const closes: { segments: number; ticks: number }[] = [];

    for(let ticks = 0; ticks <= 280800; ticks += 3600) {

      const before = inits.length + media.length;

      intake.push(ubvVideo(ticks, { keyframe: ticks === 0 }));

      if((inits.length + media.length) > before) {

        closes.push({ segments: inits.length + media.length - before, ticks });
      }
    }

    assert.deepEqual(closes, [ { segments: 2, ticks: 270000 }, { segments: 1, ticks: 280800 } ]);
    assert.deepEqual(inits.map(({ codec }) => codec), ["avc1.4d001e"]);
  });

  test("each frame reaches the frame rail before the segments it completes", () => {

    // Video alone with no audio expected and a 100 ms segment: the fourth frame, 120 ms past the keyframe, completes the init and the first media segment, and it
    // reaches the frame rail ahead of both.
    const { calls, sink } = collector();
    const intake = new UbvIntake({ audio: "aac", audioExpected: false, segmentLength: 100, sink });

    intake.push(ubvOpening(null));

    assert.deepEqual(calls, [ "frame", "frame", "frame", "frame", "init", "media" ]);
  });

  test("a stream that expects no audio closes its first segment at the segment length", () => {

    const { inits, media, sink } = collector();
    const intake = new UbvIntake({ audio: "aac", audioExpected: false, segmentLength: 100, sink });

    intake.push(ubvOpening(null));

    assert.deepEqual(inits.map(({ codec }) => codec), ["avc1.4d001e"]);
    assert.equal(media.length, 1);
  });

  test("a proxied Opus stream whose first records carry a keyframe and the other codec's audio writes one init, carrying Opus", () => {

    // A keyframe, then 600 ms of video with AAC beside it, which the intake drops, and then Opus from 640 ms: the first segment waits for the Opus, and the video
    // frame after the first Opus frame closes it under an init carrying Opus, the only init the stream writes.
    const { inits, sink } = collector();
    const intake = new UbvIntake({ audio: "opus", audioExpected: true, segmentLength: 100, sink });

    intake.push(ubvVideo(0, { keyframe: true }));

    for(let step = 1; step <= 25; step++) {

      intake.push(ubvAudio((step <= 15) ? "aac" : "opus", step * 1920));
      intake.push(ubvVideo(step * 3600));
    }

    assert.deepEqual(inits.map(({ codec }) => codec), ["avc1.4d001e,opus"]);
    assert.deepEqual(inits[0]?.description.tracks.map(({ codec }) => codec), [ "h264", "opus" ]);
  });
});
