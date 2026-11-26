/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * fmp4-writer.test.ts: Tests for the fMP4 writer - the init each stream writes and its fields, every sample read back in sample form, the one timeline and its exact
 * conversions, the segment close, the restarts on a video or audio change, the parameter sets a frame may repeat or change, the drops, the bounds, and the one
 * allocation behind each segment.
 */
import { AV1_FRAME, H264_IDR, H264_NON_IDR, H265_IDR_W_RADL, H265_TRAIL_R, adtsFrame, av1SequenceHeader, h264Pps, h264Sps, h264Unit, h265Pps, h265Sps, h265Unit,
  h265Vps, lengthPrefixed, obu, opusPacket, temporalDelimiter } from "./codecs.helpers.ts";
import type { AudioCodec, VideoCodec } from "./codecs.ts";
import type { AudioFrame, MediaFrame, VideoFrame } from "./frames.ts";
import type { Av1SequenceHeaderFields, H264SpsFields, H265SpsFields } from "./codecs.helpers.ts";
import { audioFrame, readFragment, videoFrame } from "./fmp4-writer.helpers.ts";
import { box, fixed16, fullBox, u16, u32 } from "./boxes.ts";
import { describe, test } from "node:test";
import type { Fmp4Segment } from "./fmp4-writer.ts";
import { Fmp4Writer } from "./fmp4-writer.ts";
import type { Fragment } from "./fmp4-writer.helpers.ts";
import { ProtectProtocolError } from "../../errors.ts";
import assert from "node:assert/strict";
import { describeInitSegment } from "./init-segment.ts";

// Video configurations, each field a stated value.

// H.264 High (profile 100) at level 4.0 (40) with no constraint flags, 4:2:0 at 8 bits, 64 by 36 macroblocks: 1024 by 576, labelled `avc1.640028`.
const H264_HIGH: H264SpsFields = { constraints: 0, heightInMapUnitsMinus1: 35, high: { bitDepthChromaMinus8: 0, bitDepthLumaMinus8: 0, chromaFormatIdc: 1 },
  levelIdc: 40, profileIdc: 100, widthInMbsMinus1: 63 };

// H.264 Main (77) at level 4.1 (41) with no constraint flags, 100 by 56 macroblocks: 1600 by 896, labelled `avc1.4d0029`.
const H264_MAIN: H264SpsFields = { constraints: 0, heightInMapUnitsMinus1: 55, levelIdc: 41, profileIdc: 77, widthInMbsMinus1: 99 };

// HEVC Main (profile 1, compatible with Main and Main 10) at main tier, level 3.1 (93), with the progressive and frame-only constraint flags: 1280 by 736 less a
// conformance window of 1 left, 2 right, 3 top and 4 bottom in units of two samples, so 1274 by 722, labelled `hvc1.1.6.L93.90`.
const HEVC_MAIN: H265SpsFields = { compatibility: 0x60000000, conformanceWindow: { bottom: 4, left: 1, right: 2, top: 3 }, constraints: [ 0x90, 0, 0, 0, 0, 0 ],
  height: 736, levelIdc: 93, profileIdc: 1, width: 1280 };

// HEVC at profile space 1, high tier, profile 2 compatible with itself alone, level 6.1 (183), constraint bytes `b0 00 00 00 00 01`, over three sub-layers: 3840
// by 2160 at depths of 10 and 11, labelled `hvc1.A2.4.H183.b0.0.0.0.0.1`.
const HEVC_TIERED: H265SpsFields = { bitDepthChromaMinus8: 3, bitDepthLumaMinus8: 2, compatibility: 0x20000000, constraints: [ 0xb0, 0, 0, 0, 0, 0x01 ],
  height: 2160, levelIdc: 183, maxSubLayersMinus1: 2, profileIdc: 2, profileSpace: 1, subLayers: [ { level: 0x5a, profile: [ 0xa2, 0x40, 0, 0, 0, 0xb0, 0, 0, 0,
    0, 0x5a ] }, { level: 0x3c } ], temporalIdNesting: 0, tier: 1, width: 3840 };

// AV1 Main (profile 0) at level 5 (3.1), main tier, its maximum frame 1600 by 900, at 8 bits in 4:2:0 with no color description: labelled `av01.0.05M.08`.
const AV1_PLAIN: Av1SequenceHeaderFields = { maxFrameHeightMinus1: 899, maxFrameWidthMinus1: 1599, operatingPoints: [{ idc: 0, level: 5 }] };

// AV1 Main at level 8 (4.0), main tier, its maximum frame 2560 by 1440, at 10 bits in 4:2:0, described as BT.2100 PQ (primaries 9, transfer 16, matrix 9) at
// limited range: labelled `av01.0.08M.10.0.110.09.16.09.0`.
const AV1_PQ: Av1SequenceHeaderFields = { color: { description: { matrix: 9, primaries: 9, transfer: 16 }, highBitdepth: 1 }, maxFrameHeightMinus1: 1439,
  maxFrameWidthMinus1: 2559, operatingPoints: [{ idc: 0, level: 8, tier: 0 }] };

// Frame payloads, each NAL unit and OBU payload a stated value.

const SPS = h264Sps(H264_HIGH);
const PPS = h264Pps();
const IDR = h264Unit(H264_IDR, Buffer.from([ 0x88, 0x80, 0x40, 0x1f, 0xe3 ]));
const SLICE = h264Unit(H264_NON_IDR, Buffer.from([ 0x9a, 0x21, 0x6c ]));
const H264_KEY = lengthPrefixed(SPS, PPS, IDR);
const H264_DELTA = lengthPrefixed(SLICE);

const VPS = h265Vps();
const HEVC_SPS = h265Sps(HEVC_MAIN);
const HEVC_PPS = h265Pps();
const HEVC_IDR = [ h265Unit(H265_IDR_W_RADL, Buffer.from([ 0xaf, 0x08, 0x41 ])), h265Unit(H265_IDR_W_RADL, Buffer.from([ 0x27, 0x8c ])) ];
const HEVC_TRAIL = h265Unit(H265_TRAIL_R, Buffer.from([ 0x01, 0xd4, 0x70, 0x02 ]));
const HEVC_KEY = lengthPrefixed(VPS, HEVC_SPS, HEVC_PPS, ...HEVC_IDR);
const HEVC_DELTA = lengthPrefixed(HEVC_TRAIL);

const AV1_SEQUENCE = av1SequenceHeader(AV1_PLAIN);
const AV1_KEY_FRAME = obu(AV1_FRAME, Buffer.from([ 0x10, 0x00, 0x18, 0x00, 0x42, 0x7a ]));
const AV1_DELTA_FRAME = obu(AV1_FRAME, Buffer.from([ 0x30, 0x0c, 0x93 ]));
const AV1_KEY = Buffer.concat([ temporalDelimiter(), AV1_SEQUENCE, AV1_KEY_FRAME ]);
const AV1_DELTA = Buffer.concat([ temporalDelimiter(), AV1_DELTA_FRAME ]);

// AAC-LC at sampling-frequency index 3 (48000 Hz) in two channels, behind a seven-byte header, over a raw frame of the bytes given.
function aac(raw: number[], fields: { channelConfiguration?: number; samplingFrequencyIndex?: number } = {}): Buffer {

  const { channelConfiguration = 2, samplingFrequencyIndex = 3 } = fields;

  return adtsFrame({ channelConfiguration, objectType: 2, payload: Buffer.from(raw), samplingFrequencyIndex });
}

// An Opus packet of configuration 9, coded in stereo unless asked otherwise, over the bytes given.
function opus(payload: number[], stereo = true): Buffer {

  return opusPacket({ config: 9, payload: Buffer.from(payload), stereo });
}

// The esds an AAC-LC track at 48000 Hz in two channels writes: size 39, version and flags, the elementary stream descriptor (tag 3 over 25 bytes) with the audio
// track's id 2 and clear flags, the decoder configuration (tag 4 over 17 bytes) for MPEG-4 audio (`40`) as an audio stream (`15`) with zero buffer size and
// bitrates, the decoder-specific info (tag 5 over 2 bytes) holding `11 90`, and the SL configuration (tag 6 over 1 byte) holding `02`.
const ESDS = Buffer.from([ 0x00, 0x00, 0x00, 0x27, 0x65, 0x73, 0x64, 0x73, 0x00, 0x00, 0x00, 0x00, 0x03, 0x19, 0x00, 0x02, 0x00, 0x04, 0x11, 0x40, 0x15, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x05, 0x02, 0x11, 0x90, 0x06, 0x01, 0x02 ]);

// Timelines.

// The origin every stream opens its first keyframe at, 2000 seconds into a 90 kHz clock, and the same instant on a 48 kHz clock.
const ORIGIN = 180000000;
const AUDIO_ORIGIN = 96000000;

/* A stream opening on a keyframe at the origin: video frames 3600 ticks apart, `key` first and then each of `deltas`, interleaved in time with the audio frames given,
 * which sit 1920 ticks apart on a 48 kHz clock from 1440 ticks past the origin. At the default segment length of 100 ms, the fourth video frame closes the first
 * segment over the first three.
 */
function stream(opts: { audio?: readonly Buffer[]; audioCodec?: AudioCodec; codec: VideoCodec; deltas: readonly Buffer[]; key: Buffer }): MediaFrame[] {

  const { audio = [], audioCodec = "aac", codec, deltas, key } = opts;
  const video = [ key, ...deltas ].map((data, index) => ({ at: index * 0.04, frame: videoFrame(codec, data, { keyframe: index === 0,
    timestamp: ORIGIN + (index * 3600) }) }));
  const sound = audio.map((data, index) => ({ at: 0.03 + (index * 0.04), frame: audioFrame(audioCodec, data, { rate: 48000,
    timestamp: AUDIO_ORIGIN + 1440 + (index * 1920) }) }));

  return [ ...video, ...sound ].toSorted((first, second) => first.at - second.at).map(({ frame }) => frame);
}

// An H.264 keyframe or frame `ticks` past the origin on the 90 kHz clock, and an AAC frame `ticks` past the origin on the 48 kHz clock.
function key(ticks: number, data = H264_KEY): VideoFrame {

  return videoFrame("h264", data, { keyframe: true, timestamp: ORIGIN + ticks });
}

function delta(ticks: number, data = H264_DELTA): VideoFrame {

  return videoFrame("h264", data, { timestamp: ORIGIN + ticks });
}

function sound(ticks: number, data = aac([0x11])): AudioFrame {

  return audioFrame("aac", data, { rate: 48000, timestamp: AUDIO_ORIGIN + ticks });
}

// Every frame pushed through one writer in order, and every segment the pushes answer.
function write(frames: readonly MediaFrame[], segmentLength = 100): Fmp4Segment[] {

  const writer = new Fmp4Writer({ segmentLength });

  return frames.flatMap((frame) => writer.push(frame));
}

// The kind of each segment, in order.
function kinds(segments: readonly Fmp4Segment[]): string[] {

  return segments.map((segment) => segment.type);
}

// Every init among segments, as its label and its description.
function inits(segments: readonly Fmp4Segment[]): { codec: string; data: Buffer }[] {

  return segments.flatMap((segment) => (segment.type === "init") ? [{ codec: segment.codec, data: segment.data }] : []);
}

// Every media segment read back.
function fragments(segments: readonly Fmp4Segment[]): Fragment[] {

  return segments.flatMap((segment) => (segment.type === "media") ? [readFragment(segment.data)] : []);
}

// The samples of one track across fragments, as bytes, durations or flags.
function trackSamples(read: readonly Fragment[], trackId: number): { bytes: Buffer; duration: number; flags: number }[] {

  return read.flatMap((fragment) => fragment.tracks.filter((track) => track.trackId === trackId).flatMap((track) => track.samples));
}

// The decode times of one track's fragments, with the durations each fragment's samples add up to.
function decodeTimes(read: readonly Fragment[], trackId: number): { decodeTime: number; duration: number }[] {

  return read.flatMap((fragment) => fragment.tracks.filter((track) => track.trackId === trackId).map((track) => ({ decodeTime: track.decodeTime,
    duration: track.samples.reduce((total, sample) => total + sample.duration, 0) })));
}

describe("Fmp4Writer inits", () => {

  test("a written init describes through describeInitSegment as the configurations it was written from", () => {

    const described = (frames: MediaFrame[]): unknown => inits(write(frames)).map(({ data }) => describeInitSegment(data).tracks);
    const deltas = (delta: Buffer): Buffer[] => [ delta, delta, delta ];

    // H.264 with AAC, HEVC with Opus, AV1 with AAC, and HEVC alone.
    assert.deepEqual(described(stream({ audio: [aac([1])], codec: "h264", deltas: deltas(H264_DELTA), key: H264_KEY })), [[
      { codec: "h264", height: 576, id: 1, kind: "video", level: 40, profile: 100, width: 1024 },
      { channels: 2, codec: "aac", id: 2, kind: "audio", sampleRate: 48000 } ]]);
    assert.deepEqual(described(stream({ audio: [opus([2])], audioCodec: "opus", codec: "h265", deltas: deltas(HEVC_DELTA), key: HEVC_KEY })), [[
      { codec: "h265", height: 722, id: 1, kind: "video", level: 93, profile: 1, width: 1274 },
      { channels: 2, codec: "opus", id: 2, kind: "audio", sampleRate: 48000 } ]]);
    assert.deepEqual(described(stream({ audio: [aac([3])], codec: "av1", deltas: deltas(AV1_DELTA), key: AV1_KEY })), [[
      { codec: "av1", height: 900, id: 1, kind: "video", level: 5, profile: 0, width: 1600 },
      { channels: 2, codec: "aac", id: 2, kind: "audio", sampleRate: 48000 } ]]);
    assert.deepEqual(described(stream({ codec: "h265", deltas: deltas(HEVC_DELTA), key: lengthPrefixed(h265Vps({ maxSubLayersMinus1: 2 }), h265Sps(HEVC_TIERED),
      HEVC_PPS, ...HEVC_IDR) })), [[{ codec: "h265", height: 2160, id: 1, kind: "video", level: 183, profile: 2, width: 3840 }]]);
  });

  test("the init's boxes and fields are the format's, in its order, with no edit list", () => {

    // The init an H.264 stream with AAC writes, restated box by box: a matrix of 1.0 in 16.16 with 1.0 in 2.30 last, the language `und`, and the esds the next row
    // states byte for byte.
    const matrix = [ 0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000 ].map((entry) => u32(entry));
    const trak = (id: number, handler: string, name: string, opts: { entry: Buffer; height: number; mediaHeader: Buffer; rate: number; volume: number;
      width: number; }): Buffer => box("trak", fullBox("tkhd", 0, 7, u32(0), u32(0), u32(id), u32(0), u32(0), Buffer.alloc(8), u16(0), u16(0), u16(opts.volume),
      u16(0), ...matrix, fixed16(opts.width), fixed16(opts.height)), box("mdia", fullBox("mdhd", 0, 0, u32(0), u32(0), u32(opts.rate), u32(0), u16(0x55c4), u16(0)),
      fullBox("hdlr", 0, 0, u32(0), Buffer.from(handler, "latin1"), Buffer.alloc(12), Buffer.from(name + "\0", "latin1")), box("minf", opts.mediaHeader,
        box("dinf", fullBox("dref", 0, 0, u32(1), fullBox("url ", 0, 1))), box("stbl", fullBox("stsd", 0, 0, u32(1), opts.entry), fullBox("stts", 0, 0, u32(0)),
          fullBox("stsc", 0, 0, u32(0)), fullBox("stsz", 0, 0, u32(0), u32(0)), fullBox("stco", 0, 0, u32(0))))));
    const record = Buffer.concat([ Buffer.from([ 0x01, 100, 0, 40, 0xff, 0xe1 ]), u16(SPS.length), SPS, Buffer.from([0x01]), u16(PPS.length), PPS,
      Buffer.from([ 0xfd, 0xf8, 0xf8, 0x00 ]) ]);
    const visual = box("avc1", Buffer.alloc(6), u16(1), Buffer.alloc(16), u16(1024), u16(576), fixed16(72), fixed16(72), u32(0), u16(1), Buffer.alloc(32), u16(24),
      u16(0xffff), box("avcC", record));
    const sound = box("mp4a", Buffer.alloc(6), u16(1), Buffer.alloc(8), u16(2), u16(16), u16(0), u16(0), fixed16(48000), ESDS);
    const expected = Buffer.concat([ box("ftyp", Buffer.from("dash", "latin1"), u32(0), Buffer.from("iso6hvc1avc1mp41", "latin1")), box("moov",
      fullBox("mvhd", 0, 0, u32(0), u32(0), u32(1000), u32(0), u32(0x10000), u16(0x100), Buffer.alloc(10), ...matrix, Buffer.alloc(24), u32(3)),
      box("mvex", fullBox("trex", 0, 0, u32(1), u32(1), u32(0), u32(0), u32(0)), fullBox("trex", 0, 0, u32(2), u32(1), u32(0), u32(0), u32(0))),
      trak(1, "vide", "VideoHandler", { entry: visual, height: 576, mediaHeader: fullBox("vmhd", 0, 1, Buffer.alloc(8)), rate: 90000, volume: 0, width: 1024 }),
      trak(2, "soun", "SoundHandler", { entry: sound, height: 0, mediaHeader: fullBox("smhd", 0, 0, u16(0), u16(0)), rate: 48000, volume: 0x100, width: 0 })) ]);
    const [init] = inits(write(stream({ audio: [aac([4])], codec: "h264", deltas: [ H264_DELTA, H264_DELTA, H264_DELTA ], key: H264_KEY })));

    assert.deepEqual(init?.data, expected);
  });

  test("an AV1 init lists the av01 brand among its compatible brands, and every other init lists the four", () => {

    const [av1] = inits(write(stream({ codec: "av1", deltas: [ AV1_DELTA, AV1_DELTA, AV1_DELTA ], key: AV1_KEY })));
    const [h264] = inits(write(stream({ codec: "h264", deltas: [ H264_DELTA, H264_DELTA, H264_DELTA ], key: H264_KEY })));

    // The ftyp: its 8-byte header, the major brand, the minor version, then the compatible brands.
    assert.deepEqual(av1?.data.subarray(16, 36).toString("latin1"), "iso6hvc1avc1mp41av01");
    assert.equal(av1.data.readUInt32BE(0), 36);
    assert.deepEqual(h264?.data.subarray(16, 32).toString("latin1"), "iso6hvc1avc1mp41");
    assert.equal(h264.data.readUInt32BE(0), 32);
  });

  test("the init is written when its first segment closes and answered ahead of it, video alone when no audio is seen", () => {

    const writer = new Fmp4Writer({ segmentLength: 100 });
    const frames = stream({ codec: "h264", deltas: [ H264_DELTA, H264_DELTA, H264_DELTA ], key: H264_KEY });
    const answers = frames.map((frame) => writer.push(frame));

    assert.deepEqual(answers.map(kinds), [ [], [], [], [ "init", "media" ] ]);
    assert.deepEqual(inits(answers.flat()).map(({ codec, data }) => ({ codec, tracks: describeInitSegment(data).tracks.length })),
      [{ codec: "avc1.640028", tracks: 1 }]);
  });
});

describe("Fmp4Writer records and labels", () => {

  test("the dOps box, the esds box and each label are the values their specifications state", () => {

    const deltas3 = (delta: Buffer): Buffer[] => [ delta, delta, delta ];
    const initOf = (frames: MediaFrame[]): { codec: string; data: Buffer } | undefined => inits(write(frames))[0];
    const aacInit = initOf(stream({ audio: [aac([5])], codec: "h264", deltas: deltas3(H264_DELTA), key: H264_KEY }));
    const monoInit = initOf(stream({ audio: [opus([6], false)], audioCodec: "opus", codec: "h265", deltas: deltas3(HEVC_DELTA), key: HEVC_KEY }));
    const stereoInit = initOf(stream({ audio: [opus([7])], audioCodec: "opus", codec: "h265", deltas: deltas3(HEVC_DELTA), key: HEVC_KEY }));
    const contains = (init: { data: Buffer } | undefined, bytes: Buffer): boolean => (init?.data.indexOf(bytes) ?? -1) >= 0;

    // The mono dOps: size 19, `dOps`, version 0, one output channel, a pre-skip of 3840 (`0f 00`), an input rate of 48000 (`00 00 bb 80`), no output gain and
    // mapping family 0. The stereo dOps differs only in its channel count.
    assert.ok(contains(aacInit, ESDS));
    assert.ok(contains(monoInit, Buffer.from([ 0x00, 0x00, 0x00, 0x13, 0x64, 0x4f, 0x70, 0x73, 0x00, 0x01, 0x0f, 0x00, 0x00, 0x00, 0xbb, 0x80, 0x00, 0x00, 0x00 ])));
    assert.ok(contains(stereoInit, Buffer.from([ 0x00, 0x00, 0x00, 0x13, 0x64, 0x4f, 0x70, 0x73, 0x00, 0x02, 0x0f, 0x00, 0x00, 0x00, 0xbb, 0x80, 0x00, 0x00,
      0x00 ])));

    assert.deepEqual([
      aacInit?.codec,
      initOf(stream({ codec: "h264", deltas: deltas3(H264_DELTA), key: lengthPrefixed(h264Sps(H264_MAIN), PPS, IDR) }))?.codec,
      monoInit?.codec,
      initOf(stream({ codec: "h265", deltas: deltas3(HEVC_DELTA), key: lengthPrefixed(h265Vps({ maxSubLayersMinus1: 2 }), h265Sps(HEVC_TIERED), HEVC_PPS,
        ...HEVC_IDR) }))?.codec,
      initOf(stream({ audio: [aac([8])], codec: "av1", deltas: deltas3(AV1_DELTA), key: AV1_KEY }))?.codec,
      initOf(stream({ codec: "av1", deltas: deltas3(AV1_DELTA), key: Buffer.concat([ temporalDelimiter(), av1SequenceHeader(AV1_PQ), AV1_KEY_FRAME ]) }))?.codec
    ], [ "avc1.640028,mp4a.40.2", "avc1.4d0029", "hvc1.1.6.L93.90,opus", "hvc1.A2.4.H183.b0.0.0.0.0.1", "av01.0.05M.08,mp4a.40.2",
      "av01.0.08M.10.0.110.09.16.09.0" ]);
  });

  test("an AAC rate above 65535 writes 0 in the entry's rate field and still describes at its rate", () => {

    // AAC-LC at index 0 (96000 Hz) in two channels, its frames 1920 ticks apart on its own clock.
    const frames = stream({ codec: "h264", deltas: [ H264_DELTA, H264_DELTA, H264_DELTA ], key: H264_KEY }).toSpliced(1, 0,
      audioFrame("aac", aac([9], { samplingFrequencyIndex: 0 }), { rate: 96000, timestamp: (AUDIO_ORIGIN * 2) + 1440 }));
    const [init] = inits(write(frames));
    const rateField = init?.data.indexOf(Buffer.from("mp4a", "latin1")) ?? 0;

    // The entry's 16.16 rate sits 28 bytes past its type: 6 reserved bytes, the data reference index, 8 version bytes, the channel count, the sample size and 4
    // more bytes.
    assert.equal(init?.data.readUInt32BE(rateField + 28), 0);
    assert.deepEqual(describeInitSegment(init.data).tracks[1], { channels: 2, codec: "aac", id: 2, kind: "audio", sampleRate: 96000 });
  });
});

describe("Fmp4Writer samples", () => {

  test("every sample read back through its trun is its frame's payload in sample form, in order, with none lost", () => {

    // Seven video frames and seven audio frames each. The fourth and the seventh video frames close a segment, so the first six video frames and the first five
    // audio frames are written, and the rest are still held or in the open segment when the stream ends.
    const cases = [

      { audio: [ 1, 2, 3, 4, 5, 6, 7 ].map((byte) => aac([ byte, byte ])), audioCodec: "aac" as const, codec: "h264" as const,
        deltas: [ 1, 2, 3, 4, 5, 6 ].map((byte) => lengthPrefixed(h264Unit(H264_NON_IDR, Buffer.from([byte])))), key: H264_KEY,
        keySample: lengthPrefixed(IDR), sampleAudio: (frame: Buffer): Buffer => frame.subarray(7), sampleDelta: (delta: Buffer): Buffer => delta },
      { audio: [ 1, 2, 3, 4, 5, 6, 7 ].map((byte) => opus([byte])), audioCodec: "opus" as const, codec: "h265" as const,
        deltas: [ 1, 2, 3, 4, 5, 6 ].map((byte) => lengthPrefixed(h265Unit(H265_TRAIL_R, Buffer.from([byte])))), key: HEVC_KEY,
        keySample: lengthPrefixed(...HEVC_IDR), sampleAudio: (frame: Buffer): Buffer => frame, sampleDelta: (delta: Buffer): Buffer => delta },
      { audio: [ 1, 2, 3, 4, 5, 6, 7 ].map((byte) => aac([byte])), audioCodec: "aac" as const, codec: "av1" as const,
        deltas: [ 1, 2, 3, 4, 5, 6 ].map((byte) => Buffer.concat([ temporalDelimiter(), obu(AV1_FRAME, Buffer.from([byte])) ])), key: AV1_KEY,
        keySample: Buffer.concat([ AV1_SEQUENCE, AV1_KEY_FRAME ]), sampleAudio: (frame: Buffer): Buffer => frame.subarray(7),
        sampleDelta: (delta: Buffer): Buffer => delta.subarray(2) }
    ];

    for(const { audio, audioCodec, codec, deltas, key, keySample, sampleAudio, sampleDelta } of cases) {

      const read = fragments(write(stream({ audio, audioCodec, codec, deltas, key })));

      assert.deepEqual(trackSamples(read, 1).map(({ bytes }) => bytes), [ keySample, ...deltas.slice(0, 5).map(sampleDelta) ], codec);
      assert.deepEqual(trackSamples(read, 2).map(({ bytes }) => bytes), audio.slice(0, 5).map(sampleAudio), audioCodec);
    }
  });

  test("tfdt continues on each track across segments, and the first audio sample keeps its offset from the first keyframe", () => {

    // Video steps of 3600, 3590, 3615, 3600, 3585, 3610 and 3600, and audio steps of 1920, 1900, 1945, 1915 and 1930, the first audio frame 1440 ticks past the
    // origin on its clock. At 100 ms, the first segment closes over three video samples (10805 ticks) and the second over three more (10795).
    const videoSteps = [ 3600, 3590, 3615, 3600, 3585, 3610, 3600 ];
    const audioSteps = [ 1920, 1900, 1945, 1915, 1930 ];
    const videoTimes = videoSteps.reduce((times, step) => [ ...times, (times.at(-1) ?? ORIGIN) + step ], [ORIGIN]);
    const audioTimes = audioSteps.reduce((times, step) => [ ...times, (times.at(-1) ?? 0) + step ], [AUDIO_ORIGIN + 1440]);
    const frames = [ ...videoTimes.map((timestamp, index) => ({ at: (timestamp - ORIGIN) / 90000, frame: videoFrame("h264", (index === 0) ? H264_KEY : H264_DELTA,
      { keyframe: index === 0, timestamp }) })), ...audioTimes.map((timestamp) => ({ at: (timestamp - AUDIO_ORIGIN) / 48000,
      frame: audioFrame("aac", aac([0x55]), { rate: 48000, timestamp }) })) ].toSorted((first, second) => first.at - second.at).map(({ frame }) => frame);
    const read = fragments(write(frames));

    assert.deepEqual(decodeTimes(read, 1), [ { decodeTime: 0, duration: 10805 }, { decodeTime: 10805, duration: 10795 } ]);
    assert.deepEqual(trackSamples(read, 1).map(({ duration }) => duration), videoSteps.slice(0, 6));
    assert.deepEqual(decodeTimes(read, 2), [ { decodeTime: 1440, duration: 3820 }, { decodeTime: 5260, duration: 5790 } ]);
  });

  test("a camera time past 24 days of uptime writes exact timestamps", () => {

    // Two origins on a 90 kHz clock and each converted to 48 kHz: 238163607510 (high half 55) is 127020590672, and 24019397514375 is 12810345341000. The first
    // audio frame sits 1440 ticks past each converted origin, so its tfdt reads 1440 only when the conversion is exact.
    for(const [ origin, converted ] of [ [ 238163607510, 127020590672 ], [ 24019397514375, 12810345341000 ] ] as const) {

      const frames = [ videoFrame("h264", H264_KEY, { keyframe: true, timestamp: origin }),
        audioFrame("aac", aac([1]), { rate: 48000, timestamp: converted + 1440 }), videoFrame("h264", H264_DELTA, { timestamp: origin + 3600 }),
        audioFrame("aac", aac([2]), { rate: 48000, timestamp: converted + 3360 }), videoFrame("h264", H264_DELTA, { timestamp: origin + 7200 }),
        videoFrame("h264", H264_DELTA, { timestamp: origin + 10800 }) ];

      assert.deepEqual(decodeTimes(fragments(write(frames)), 2), [{ decodeTime: 1440, duration: 1920 }], String(origin));
    }
  });
});

// An H.264 Main keyframe, whose parameter sets differ from the High stream's.
const MAIN_KEY = lengthPrefixed(h264Sps(H264_MAIN), PPS, IDR);

describe("Fmp4Writer opening and dropping", () => {

  test("frames before the first keyframe are dropped, and the audio configuration they carry is the init's", () => {

    // An AAC frame, an H.264 frame and another AAC frame ahead of the keyframe, then the keyframe and three frames with no audio among them.
    const segments = write([ sound(-2400), delta(-3600), sound(-480), key(0), delta(3600), delta(7200), delta(10800) ]);

    assert.deepEqual(kinds(segments), [ "init", "media" ]);
    assert.deepEqual(inits(segments).map(({ codec }) => codec), ["avc1.640028,mp4a.40.2"]);
    assert.deepEqual(fragments(segments).map(({ tracks }) => tracks.map(({ samples, trackId }) => ({ count: samples.length, trackId }))),
      [[{ count: 3, trackId: 1 }]]);
  });

  test("audio that starts before the origin is dropped, and the first audio sample is the first frame at or past it", () => {

    // After the keyframe, AAC frames 480 ticks before the origin and then 480 and 2400 ticks past it.
    const read = fragments(write([ key(0), sound(-480, aac([1])), sound(480, aac([2])), delta(3600), sound(2400, aac([3])), delta(7200), delta(10800) ]));

    assert.deepEqual(decodeTimes(read, 2), [{ decodeTime: 480, duration: 1920 }]);
    assert.deepEqual(trackSamples(read, 2).map(({ bytes }) => bytes), [Buffer.from([2])]);
  });

  test("a segment that holds no audio sample carries no audio traf", () => {

    // Audio through the first segment alone: the second segment holds video alone.
    const read = fragments(write([ key(0), sound(1440), delta(3600), sound(3360), delta(7200), delta(10800), delta(14400), delta(18000), delta(21600) ]));

    assert.deepEqual(read.map(({ moofBoxes, tracks }) => ({ moofBoxes, trackIds: tracks.map(({ trackId }) => trackId) })),
      [ { moofBoxes: [ "mfhd", "traf", "traf" ], trackIds: [ 1, 2 ] }, { moofBoxes: [ "mfhd", "traf" ], trackIds: [1] } ]);
  });

  test("a video record of parameter sets alone and an ADTS frame of its header alone are each dropped, and no zero-size sample is written", () => {

    // A record of the SPS and PPS alone at 5000 ticks, and an ADTS frame with no raw data at 3360: had either been kept, it would have finished the frame before
    // it with a shorter step and been written as a sample of no bytes.
    const read = fragments(write([ key(0), sound(1440, aac([1])), delta(3600), delta(5000, lengthPrefixed(SPS, PPS)), sound(3360, aac([])), delta(7200),
      sound(5280, aac([2])), delta(10800) ]));

    assert.deepEqual(trackSamples(read, 1).map(({ bytes, duration }) => ({ bytes, duration })), [ { bytes: lengthPrefixed(IDR), duration: 3600 },
      { bytes: H264_DELTA, duration: 3600 }, { bytes: H264_DELTA, duration: 3600 } ]);
    assert.deepEqual(trackSamples(read, 2).map(({ bytes, duration }) => ({ bytes, duration })), [{ bytes: Buffer.from([1]), duration: 3840 }]);
  });

  test("a frame that is not a keyframe and belongs to no init drops video until the next keyframe, the held frame's duration spanning the gap", () => {

    // Under an H.264 High init: an HEVC frame, followed by an H.264 frame dropped with it and then a High keyframe, which finishes the frame held at 3600 ticks
    // with a step of 10800 and closes the first segment. The keyframe ends the drop, so the frames after it fill the second segment.
    const read = fragments(write([ key(0), delta(3600), videoFrame("h265", HEVC_DELTA, { timestamp: ORIGIN + 7200 }), delta(10800), key(14400), delta(18000),
      delta(21600), delta(25200) ]));

    assert.deepEqual(read.map(({ tracks }) => tracks.flatMap(({ samples }) => samples.map(({ bytes, duration }) => ({ bytes, duration })))), [
      [ { bytes: lengthPrefixed(IDR), duration: 3600 }, { bytes: H264_DELTA, duration: 10800 } ],
      [ { bytes: lengthPrefixed(IDR), duration: 3600 }, { bytes: H264_DELTA, duration: 3600 }, { bytes: H264_DELTA, duration: 3600 } ]
    ]);
  });

  test("an audio frame dropped below the keyframe after it cannot fix the init's audio", () => {

    // After the keyframe, a mono AAC frame 480 ticks before the origin, dropped and its configuration learned, then stereo frames from 1440 ticks: the first stereo
    // frame accepted fixes the init's audio, so the init is stereo and carries the stereo samples.
    const segments = write([ key(0), sound(-480, aac([1], { channelConfiguration: 1 })), sound(1440, aac([2])), delta(3600), sound(3360, aac([3])), delta(7200),
      delta(10800) ]);

    assert.deepEqual(describeInitSegment(inits(segments)[0]?.data ?? Buffer.alloc(0)).tracks[1], { channels: 2, codec: "aac", id: 2, kind: "audio",
      sampleRate: 48000 });
    assert.deepEqual(trackSamples(fragments(segments), 2).map(({ bytes }) => bytes), [Buffer.from([2])]);
  });
});

describe("Fmp4Writer segments", () => {

  test("a segment closes when its video reaches the segment length exactly, and not one tick short of it", () => {

    // A clock of 25000 and a length of 80 ms: a segment closes once its video durations reach 2000 ticks. Frames 500 ticks apart reach it as the fifth frame
    // arrives; with the fourth step one tick short they reach 1999 there, and close as the sixth arrives.
    const at = (ticks: number, keyframe = false): VideoFrame => videoFrame("h264", keyframe ? H264_KEY : H264_DELTA, { keyframe, rate: 25000,
      timestamp: 50000000 + ticks });
    const answers = (frames: VideoFrame[]): string[][] => {

      const writer = new Fmp4Writer({ segmentLength: 80 });

      return frames.map((frame) => kinds(writer.push(frame)));
    };

    assert.deepEqual(answers([ at(0, true), at(500), at(1000), at(1500), at(2000) ]), [ [], [], [], [], [ "init", "media" ] ]);
    assert.deepEqual(answers([ at(0, true), at(500), at(1000), at(1500), at(1999), at(2499) ]), [ [], [], [], [], [], [ "init", "media" ] ]);
  });

  test("each fragment's mfhd counts from 1, its video traf comes first, and its tfhd, tfdt, trun and sample flags are the format's", () => {

    // Seven video frames and seven AAC frames: two segments of three video samples each, the first with two audio samples and the second with three.
    const segments = write(stream({ audio: [ 1, 2, 3, 4, 5, 6, 7 ].map((byte) => aac([byte])), codec: "h264", deltas: [ 1, 2, 3, 4, 5, 6 ].map(() => H264_DELTA),
      key: H264_KEY }));
    const media = segments.flatMap((segment) => (segment.type === "media") ? [segment] : []);
    const fields = media.map(({ data, moof }) => {

      const { boxes, mfhdVersion, moofBoxes, sequence, tracks } = readFragment(data);
      const [ video, audio ] = tracks;
      const videoBytes = video?.samples.reduce((total, { bytes }) => total + bytes.length, 0) ?? 0;

      // Each run's data offset, less where the format places it: video just past the mdat's header, and audio past the video samples.
      return { audioOffset: (audio?.dataOffset ?? 0) - (moof.length + 8 + videoBytes), boxes, flags: tracks.map(({ samples }) => samples.map(({ flags }) => flags)),
        headers: tracks.map(({ tfdtVersion, tfhdFlags, tfhdVersion, trackId, trunFlags, trunVersion }) => [ trackId, tfhdVersion, tfhdFlags, tfdtVersion,
          trunVersion, trunFlags ]), mfhdVersion, moofBoxes, sequence, videoOffset: (video?.dataOffset ?? 0) - (moof.length + 8) };
    });
    const headers = [ [ 1, 0, 0x020000, 1, 0, 0x000701 ], [ 2, 0, 0x020000, 1, 0, 0x000701 ] ];

    assert.deepEqual(fields, [
      { audioOffset: 0, boxes: [ "moof", "mdat" ], flags: [ [ 0x02600000, 0x00010000, 0x00010000 ], [ 0x02000000, 0x02000000 ] ], headers, mfhdVersion: 0,
        moofBoxes: [ "mfhd", "traf", "traf" ], sequence: 1, videoOffset: 0 },
      { audioOffset: 0, boxes: [ "moof", "mdat" ], flags: [ [ 0x00010000, 0x00010000, 0x00010000 ], [ 0x02000000, 0x02000000, 0x02000000 ] ], headers,
        mfhdVersion: 0, moofBoxes: [ "mfhd", "traf", "traf" ], sequence: 2, videoOffset: 0 }
    ]);
  });

  test("a media segment is one allocation, its moof and its mdat views into it", () => {

    // A segment under 4096 bytes, which a pooled or concatenated buffer would share with other allocations.
    const [media] = write(stream({ audio: [ aac([1]), aac([2]) ], codec: "h264", deltas: [ H264_DELTA, H264_DELTA, H264_DELTA ], key: H264_KEY }))
      .filter((segment) => segment.type === "media");

    assert.ok(media?.type === "media");
    assert.ok(media.data.length < 4096);
    assert.equal(media.data.byteOffset, 0);
    assert.equal(media.data.buffer.byteLength, media.data.length);
    assert.equal(media.moof.buffer, media.data.buffer);
    assert.equal(media.moof.byteOffset, 0);
    assert.equal(media.moof.length, media.data.readUInt32BE(0));
    assert.equal(media.mdat.buffer, media.data.buffer);
    assert.equal(media.mdat.byteOffset, media.moof.length);
    assert.equal(media.mdat.length, media.data.length - media.moof.length);
    assert.equal(media.mdat.toString("latin1", 4, 8), "mdat");
  });
});

describe("Fmp4Writer restarts", () => {

  test("a keyframe whose parameter sets change closes the segment and opens a new init at itself, on the same timeline", () => {

    // At a length of 1000 ms no segment closes on its length: a Main keyframe closes the High init's segment, and a High keyframe then closes the Main init's.
    const writer = new Fmp4Writer({ segmentLength: 1000 });
    const answers = [ key(0), delta(3600), delta(7200), key(10800, MAIN_KEY), delta(14400), key(18000) ].map((frame) => writer.push(frame));

    assert.deepEqual(answers.map(kinds), [ [], [], [], [ "init", "media" ], [], [ "init", "media" ] ]);
    assert.deepEqual(inits(answers.flat()).map(({ codec }) => codec), [ "avc1.640028", "avc1.4d0029" ]);
    assert.deepEqual(fragments(answers.flat()).map(({ sequence, tracks }) => ({ decodeTime: tracks[0]?.decodeTime,
      flags: tracks[0]?.samples.map(({ flags }) => flags), sequence })), [ { decodeTime: 0, flags: [ 0x02600000, 0x00010000, 0x00010000 ], sequence: 1 },
      { decodeTime: 10800, flags: [ 0x02600000, 0x00010000 ], sequence: 1 } ]);
  });

  test("a changed keyframe whose finish closes the segment on its length writes no second, empty segment", () => {

    // At 120 ms a segment closes at 10800 ticks, which the third step reaches as the changed keyframe finishes the frame before it.
    const writer = new Fmp4Writer({ segmentLength: 120 });

    assert.deepEqual([ key(0), delta(3600), delta(7200), key(10800, MAIN_KEY) ].map((frame) => kinds(writer.push(frame))), [ [], [], [], [ "init", "media" ] ]);
  });

  test("a keyframe that carries no parameter sets continues its init, and a first keyframe that carries none is refused", () => {

    // At 200 ms a segment closes at 18000 ticks. The second keyframe is its IDR slice alone.
    const segments = write([ key(0), delta(3600), delta(7200), key(10800, lengthPrefixed(IDR)), delta(14400), delta(18000) ], 200);

    assert.deepEqual(kinds(segments), [ "init", "media" ]);
    assert.deepEqual(trackSamples(fragments(segments), 1).map(({ flags }) => flags), [ 0x02600000, 0x00010000, 0x00010000, 0x02600000, 0x00010000 ]);
    assert.throws(() => new Fmp4Writer({ segmentLength: 100 }).push(key(0, lengthPrefixed(IDR))), { constructor: ProtectProtocolError,
      message: /no sequence parameter set/ });
  });

  test("a frame carrying some of its init's parameter sets belongs to it, and one carrying a set its init lacks does not, on a keyframe and on any other frame", () => {

    // Under a High init read from its SPS and its PPS: a frame carrying the PPS alone with its slice, then a keyframe carrying the PPS and the SPS twice with its
    // IDR slice. Each belongs, so one init is written over the three samples, each without its parameter sets.
    const repeated = write([ key(0), delta(3600, lengthPrefixed(PPS, SLICE)), key(7200, lengthPrefixed(PPS, SPS, SPS, IDR)), delta(10800) ]);

    assert.deepEqual(kinds(repeated), [ "init", "media" ]);
    assert.deepEqual(trackSamples(fragments(repeated), 1).map(({ bytes, flags }) => ({ bytes, flags })), [ { bytes: lengthPrefixed(IDR), flags: 0x02600000 },
      { bytes: H264_DELTA, flags: 0x00010000 }, { bytes: lengthPrefixed(IDR), flags: 0x02600000 } ]);

    // A second PPS the init lacks: a keyframe carrying it with the init's own sets starts a new init, closing the first init's segment at a length of 1000 ms
    // that no step reaches, and a frame that is not a keyframe carrying it is refused.
    const second = h264Pps({ ppsId: 1 });
    const writer = new Fmp4Writer({ segmentLength: 1000 });

    assert.deepEqual([ key(0), delta(3600), key(7200, lengthPrefixed(SPS, PPS, second, IDR)) ].map((frame) => kinds(writer.push(frame))),
      [ [], [], [ "init", "media" ] ]);
    assert.throws(() => write([ key(0), delta(3600, lengthPrefixed(second, SLICE)) ]), { constructor: ProtectProtocolError, message: /outside a keyframe/ });
  });

  test("audio that first appears under a video-only init is dropped until the next keyframe, which starts an init carrying it", () => {

    // A keyframe and three frames with no audio close a video-only init's first segment. Audio then appears and is dropped, and the keyframe at 21600 ticks, whose
    // step closes the second segment, starts the init the audio is written under.
    const segments = write([ key(0), delta(3600), delta(7200), delta(10800), sound(6240), delta(14400), sound(8160), delta(18000), key(21600), sound(12000),
      delta(25200), sound(13920), delta(28800), sound(15840), delta(32400) ]);

    assert.deepEqual(kinds(segments), [ "init", "media", "media", "init", "media" ]);
    assert.deepEqual(inits(segments).map(({ codec }) => codec), [ "avc1.640028", "avc1.640028,mp4a.40.2" ]);
    assert.deepEqual(fragments(segments).map(({ sequence, tracks }) => ({ sequence, trackIds: tracks.map(({ trackId }) => trackId) })),
      [ { sequence: 1, trackIds: [1] }, { sequence: 2, trackIds: [1] }, { sequence: 1, trackIds: [ 1, 2 ] } ]);
  });

  test("an audio change drops the held audio frame and audio after it until the next keyframe, which starts an init with the new configuration", () => {

    // AAC in two channels, then in one from 5280 ticks: the frame held at 3360 is discarded and every later one dropped until the keyframe at 21600.
    const mono = (ticks: number): AudioFrame => sound(ticks, aac([0x3c], { channelConfiguration: 1 }));
    const segments = write([ key(0), sound(1440, aac([1])), delta(3600), sound(3360, aac([2])), delta(7200), mono(5280), delta(10800), mono(7200), delta(14400),
      mono(9120), delta(18000), key(21600), mono(12000), delta(25200), mono(13920), delta(28800), delta(32400) ]);
    const audio = fragments(segments).map(({ tracks }) => tracks.filter(({ trackId }) => trackId === 2).map(({ decodeTime, samples }) => ({ decodeTime,
      samples: samples.map(({ bytes }) => bytes) })));

    assert.deepEqual(kinds(segments), [ "init", "media", "media", "init", "media" ]);
    assert.deepEqual(audio, [ [{ decodeTime: 1440, samples: [Buffer.from([1])] }], [], [{ decodeTime: 12000, samples: [Buffer.from([0x3c])] }] ]);
    assert.deepEqual(inits(segments).map(({ data }) => describeInitSegment(data).tracks[1]), [ { channels: 2, codec: "aac", id: 2, kind: "audio", sampleRate: 48000 },
      { channels: 1, codec: "aac", id: 2, kind: "audio", sampleRate: 48000 } ]);
  });

  test("an audio change discards the held audio frame when it lies past the next keyframe", () => {

    // Audio leads video. A stereo frame at 11640 ticks, past the keyframe at 21600 (11520 on the 48 kHz clock), is held when a mono frame arrives ahead of that
    // keyframe. The change discards the held frame, so the keyframe starts an init whose audio the first mono frame after it fixes, and the mono samples are
    // written under it.
    const mono = (ticks: number, byte: number): AudioFrame => sound(ticks, aac([byte], { channelConfiguration: 1 }));
    const segments = write([ key(0), sound(1440, aac([1])), delta(3600), sound(3360, aac([2])), delta(7200), sound(5280, aac([3])), delta(10800),
      sound(7200, aac([4])), delta(14400), sound(9120, aac([5])), delta(18000), sound(11640, aac([6])), mono(13560, 0x3c), key(21600), mono(15480, 0x3d),
      delta(25200), mono(17400, 0x3e), delta(28800), mono(19320, 0x3f), delta(32400) ]);
    const audio = fragments(segments).map(({ tracks }) => tracks.filter(({ trackId }) => trackId === 2).map(({ decodeTime, samples }) => ({ decodeTime,
      samples: samples.map(({ bytes }) => bytes) })));

    assert.deepEqual(kinds(segments), [ "init", "media", "media", "init", "media" ]);
    assert.deepEqual(inits(segments).map(({ data }) => describeInitSegment(data).tracks[1]), [ { channels: 2, codec: "aac", id: 2, kind: "audio", sampleRate: 48000 },
      { channels: 1, codec: "aac", id: 2, kind: "audio", sampleRate: 48000 } ]);
    assert.deepEqual(audio.at(-1), [{ decodeTime: 15480, samples: [ Buffer.from([0x3d]), Buffer.from([0x3e]) ] }]);
  });

  test("after an audio change that reverts before the next keyframe, audio stays dropped and the keyframe still starts a new init", () => {

    // AAC in two channels, one frame in one channel at 3360 ticks, then two channels again at 5280: the reverted frame is dropped, and the keyframe at 21600
    // starts an init with the newest configuration, two channels again.
    const segments = write([ key(0), sound(1440, aac([1])), delta(3600), sound(3360, aac([2], { channelConfiguration: 1 })), sound(5280, aac([3])), delta(7200),
      delta(10800), delta(14400), delta(18000), key(21600), sound(12000, aac([4])), delta(25200), sound(13920, aac([5])), delta(28800), delta(32400) ]);

    assert.deepEqual(kinds(segments), [ "init", "media", "media", "init", "media" ]);
    assert.deepEqual(fragments(segments).map(({ tracks }) => tracks.map(({ trackId }) => trackId)), [ [1], [1], [ 1, 2 ] ]);
    assert.deepEqual(inits(segments).map(({ codec }) => codec), [ "avc1.640028,mp4a.40.2", "avc1.640028,mp4a.40.2" ]);
  });

  test("an AAC rate change between keyframes starts a new init at the next keyframe and is never measured as a step", () => {

    // AAC at 48000 Hz, then at index 6 (24000 Hz) from 2640 ticks on its own clock, which counts half as fast, so its timestamp falls far below the frame held at
    // 48000 Hz and would read as a step backwards.
    const slow = (ticks: number): AudioFrame => audioFrame("aac", aac([0x24], { samplingFrequencyIndex: 6 }), { rate: 24000, timestamp: 48000000 + ticks });
    const segments = write([ key(0), sound(1440), delta(3600), sound(3360), delta(7200), slow(2640), delta(10800), slow(3600), delta(14400), delta(18000),
      key(21600), slow(6000), delta(25200), slow(6900), delta(28800), delta(32400) ]);

    assert.deepEqual(kinds(segments), [ "init", "media", "media", "init", "media" ]);
    assert.deepEqual(describeInitSegment(inits(segments)[1]?.data ?? Buffer.alloc(0)).tracks[1], { channels: 2, codec: "aac", id: 2, kind: "audio",
      sampleRate: 24000 });
    assert.deepEqual(decodeTimes(fragments(segments), 2).at(-1), { decodeTime: 6000, duration: 900 });
  });

  test("audio below a new init's keyframe is dropped, and the audio frame held across the restart is judged against the new init", () => {

    // A Main keyframe at 10800 ticks, 5760 on the 48 kHz clock, and a High keyframe at 21600 closing the Main init's segment, at a length of 1000 ms. In the
    // first stream the frame held when the Main keyframe arrives sits at 3360 and is discarded, and a late frame at 5280 is dropped; in the second, a frame at
    // 6000 arrives ahead of the keyframe, is held, and is kept as the new init's first audio sample.
    const first = fragments(write([ key(0), sound(1440, aac([1])), delta(3600), sound(3360, aac([2])), delta(7200), key(10800, MAIN_KEY), sound(5280, aac([3])),
      sound(7200, aac([4])), delta(14400), sound(9120, aac([5])), delta(18000), key(21600) ], 1000));
    const second = fragments(write([ key(0), sound(1440, aac([1])), delta(3600), sound(3360, aac([2])), delta(7200), sound(6000, aac([6])), key(10800, MAIN_KEY),
      sound(7920, aac([7])), delta(14400), delta(18000), key(21600) ], 1000));
    const audio = (read: Fragment[]): { decodeTime: number; samples: Buffer[] }[][] => read.map(({ tracks }) => tracks.filter(({ trackId }) => trackId === 2)
      .map(({ decodeTime, samples }) => ({ decodeTime, samples: samples.map(({ bytes }) => bytes) })));

    assert.deepEqual(audio(first), [ [{ decodeTime: 1440, samples: [Buffer.from([1])] }], [{ decodeTime: 7200, samples: [Buffer.from([4])] }] ]);
    assert.deepEqual(audio(second), [ [{ decodeTime: 1440, samples: [ Buffer.from([1]), Buffer.from([2]) ] }], [{ decodeTime: 6000, samples: [Buffer.from([6])] }] ]);
  });

  test("a header-only ADTS frame ahead of a restart leaves the new init with the held frame's configuration", () => {

    // A stereo frame at 7680 ticks, on the Main keyframe's own instant on the 48 kHz clock, is held when a mono ADTS frame with no raw data arrives: its mono
    // configuration is learned and the frame dropped. The Main keyframe keeps the held frame, which fixes the new init's audio, so with no audio frame after it the
    // new init is written stereo, as the held frame is.
    const segments = write([ key(0), sound(1440, aac([1])), delta(3600), sound(3360, aac([2])), delta(7200), sound(5280, aac([3])), delta(10800),
      sound(7680, aac([4])), sound(9600, aac([], { channelConfiguration: 1 })), key(14400, MAIN_KEY), delta(18000), delta(21600), delta(25200) ]);

    assert.deepEqual(kinds(segments), [ "init", "media", "media", "init", "media" ]);
    assert.deepEqual(inits(segments).map(({ data }) => describeInitSegment(data).tracks[1]), [ { channels: 2, codec: "aac", id: 2, kind: "audio", sampleRate: 48000 },
      { channels: 2, codec: "aac", id: 2, kind: "audio", sampleRate: 48000 } ]);
  });

  test("the newest audio configuration learned is the one an init takes", () => {

    // Ahead of the keyframe, AAC at 48000 Hz in two channels and then at index 6 (24000 Hz) in one; no audio follows the keyframe.
    const segments = write([ sound(-4800), audioFrame("aac", aac([1], { channelConfiguration: 1, samplingFrequencyIndex: 6 }), { rate: 24000, timestamp: 47998000 }),
      key(0), delta(3600), delta(7200), delta(10800) ]);

    assert.deepEqual(describeInitSegment(inits(segments)[0]?.data ?? Buffer.alloc(0)).tracks[1], { channels: 1, codec: "aac", id: 2, kind: "audio",
      sampleRate: 24000 });
  });
});

describe("Fmp4Writer refusals", () => {

  test("a step that is zero or backwards is refused on each track", () => {

    const pushAll = (frames: MediaFrame[]): void => {

      const writer = new Fmp4Writer({ segmentLength: 100 });

      for(const frame of frames) {

        writer.push(frame);
      }
    };

    for(const frames of [ [ key(3600), delta(3600) ], [ key(3600), delta(0) ], [ key(0), sound(1440), sound(1440) ], [ key(0), sound(1440), sound(1439) ] ]) {

      assert.throws(() => pushAll(frames), { constructor: ProtectProtocolError, message: /step forward/ });
    }
  });

  test("parameter sets that change outside a keyframe are refused, on a record with no sample and on a frame that is not a keyframe", () => {

    // Under a High init, Main's parameter sets arrive at 7200 ticks in a record of them alone, in the same record flagged as a keyframe, and in a frame that is not
    // a keyframe beside its slice. Dropping any of them would leave the pictures after it decoding under High's sets, so each is refused as it arrives.
    const main = [ h264Sps(H264_MAIN), PPS ];
    const records = { keyframe: key(7200, lengthPrefixed(...main)), sets: delta(7200, lengthPrefixed(...main)), slice: delta(7200, lengthPrefixed(...main, SLICE)) };

    for(const [ name, changed ] of Object.entries(records)) {

      const writer = new Fmp4Writer({ segmentLength: 100 });

      assert.deepEqual([ key(0), delta(3600) ].map((frame) => kinds(writer.push(frame))), [ [], [] ]);
      assert.throws(() => writer.push(changed), { constructor: ProtectProtocolError, message: /parameter sets changed outside a keyframe/ }, name);
    }
  });

  test("an audio step past 32 bits is refused", () => {

    // A step of 2 ** 32 - 1 ticks on the audio track fits a trun entry's duration and is held; one tick more is refused as the frame that ends it arrives.
    assert.deepEqual(kinds(write([ key(0), sound(1440), sound(1440 + (2 ** 32) - 1) ])), []);
    assert.throws(() => write([ key(0), sound(1440), sound(1440 + (2 ** 32)) ]), { constructor: ProtectProtocolError, message: /step forward/ });
  });

  test("a segment length that is not a positive, finite number, a step past 32 bits and a coded size past 16 bits are refused", () => {

    for(const segmentLength of [ 0, -1, Number.NaN, Number.POSITIVE_INFINITY ]) {

      assert.throws(() => new Fmp4Writer({ segmentLength }), { constructor: ProtectProtocolError, message: /segment length/ }, String(segmentLength));
    }

    // A step of 2 ** 32 - 1 ticks fits a trun entry's duration and is written; one tick more is refused.
    assert.deepEqual(kinds(write([ key(0), delta((2 ** 32) - 1) ])), [ "init", "media" ]);
    assert.throws(() => write([ key(0), delta(2 ** 32) ]), { constructor: ProtectProtocolError, message: /step forward/ });

    // An SPS 4097 macroblocks across (65552 samples), and one 4097 map units down: each keyframe is accepted, and refused as its init would be written, at the
    // first close.
    for(const sps of [ h264Sps({ ...H264_HIGH, widthInMbsMinus1: 4096 }), h264Sps({ ...H264_HIGH, heightInMapUnitsMinus1: 4096 }) ]) {

      const writer = new Fmp4Writer({ segmentLength: 100 });

      assert.deepEqual([ key(0, lengthPrefixed(sps, PPS, IDR)), delta(3600), delta(7200) ].map((frame) => kinds(writer.push(frame))), [ [], [], [] ]);
      assert.throws(() => writer.push(delta(10800)), { constructor: ProtectProtocolError, message: /16-bit/ });
    }
  });
});
