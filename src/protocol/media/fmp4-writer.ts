/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * fmp4-writer.ts: The fMP4 writer - a livestream's media frames in, an init segment and media segments out, on one timeline.
 */

/**
 * The fMP4 writer: a livestream's media frames in, an initialization segment and its media segments out. This module is Layer 1: no I/O, no time, no side
 * effects - frames in, segments out, or a {@link ProtectProtocolError} naming the fault.
 *
 * An init describes the stream's tracks, each from the configuration its codec's reader yields:
 *
 * ```
 * ftyp                     major brand dash, minor 0; compatible iso6, hvc1, avc1 and mp41, and av01 for an AV1 stream
 * moov
 *   mvhd                   timescale 1000, every time and duration zero, the next track id one past the last
 *   mvex
 *     trex                 one per track, every default zero
 *   trak                   the video track, id 1, then the audio track, id 2, when the stream has audio
 *     tkhd                 the track id, with the coded width and height for video and the full volume for audio
 *     mdia
 *       mdhd               the track's clock as its timescale
 *       hdlr               vide, named VideoHandler, or soun, named SoundHandler
 *       minf
 *         vmhd or smhd
 *         dinf
 *           dref           one url entry, its media in the same file
 *         stbl
 *           stsd           the one sample entry: avc1, hvc1 or av01 with its record box, or mp4a with its esds, or Opus with its dOps
 *           stts, stsc, stsz, stco    empty, since every sample lives in a fragment
 * ```
 *
 * A media segment is one fragment, a `moof` and its `mdat`:
 *
 * ```
 * moof
 *   mfhd                   the sequence number, counting from 1 at each init
 *   traf                   the video track, then the audio track when the segment holds audio
 *     tfhd                 the track id, its data offsets counted from the moof's first byte
 *     tfdt                 the decode time of the track's first sample in the segment, in 64 bits
 *     trun                 the sample count, the data offset to the track's first sample, and each sample's duration, size and flags
 * mdat                     the video samples, then the audio samples
 * ```
 *
 * A sample is its frame's payload in the form its sample entry takes: an H.264 or HEVC frame without its parameter sets, which the record carries; an AV1 temporal
 * unit without its temporal delimiters, its sequence header kept; an AAC frame without its ADTS header; and an Opus packet whole.
 *
 * The writer opens on a keyframe: every frame before the first video keyframe is dropped, though each audio frame's configuration is learned as it arrives, the
 * newest winning. That keyframe's timestamp is the origin of one timeline for the writer's life, and every track is placed against it, so audio keeps its offset
 * from video. A sample's duration is the step from its frame's timestamp to that of its track's next frame, so each track holds its newest frame until the next
 * one arrives. A segment closes once the video durations it holds reach the segment length, taking every finished audio sample with it, so every segment holds
 * video. An init is written when its first segment closes, ahead of that segment, with the audio configuration learned by the earlier of the first audio frame it
 * accepts and that close, or with no audio track when none was learned by then.
 *
 * An init states its audio track once, and a track that appears after the init is written starts a new init, which a consumer of one format cannot follow. So a
 * writer given an audio wait holds an unwritten init's segment open while it has learned no audio configuration, until its video reaches the longer of the segment
 * length and the wait. The first audio configuration learned ends the wait, and the video frame after it closes the segment, already past the segment length; an
 * init written without audio, once the wait has passed, closes every later segment at the segment length.
 *
 * A video frame belongs to the open init when it is of the init's codec and every parameter set it carries is one the init was read from. A keyframe that does
 * not belong starts a new init at itself, on the same timeline. Parameter sets of the init's codec that do not belong are read only from a keyframe that carries a
 * sample, so any other record carrying them is refused: the pictures after it would otherwise decode under the init's sets. An audio frame whose configuration
 * differs from the open init's, or the first audio frame under an init written without audio, drops audio until the next keyframe, which starts a new init with the
 * newest configuration learned. A video frame of another codec that is not a keyframe drops video until the next keyframe. So the first sample under every init is
 * a video keyframe, and segment boundaries move only on video.
 *
 * @module ProtectFmp4Writer
 */
import { AUDIO_FORMATS, VIDEO_FORMATS } from "./codecs.ts";
import type { AudioConfiguration, LivestreamAudioCodec, LivestreamVideoCodec, VideoConfiguration, VideoFrameParts } from "./codecs.ts";
import type { AudioFrame, MediaFrame, VideoFrame } from "./frames.ts";
import { BOX_HEADER_SIZE, FULL_BOX_HEADER_SIZE, box, fixed16, fullBox, u16, u32, u8, writeBoxHeader, writeFullBoxHeader, writeUInt64 } from "./boxes.ts";
import { DECODER_CONFIG_FIXED_SIZE, DescriptorTag, OBJECT_TYPE_MPEG4_AUDIO } from "./init-segment.ts";
import { opusChannels, readOpusConfiguration } from "./opus.ts";
import { readAacConfiguration, readAdtsHeader } from "./aac.ts";
import { readAv1Configuration, splitAv1Frame } from "./av1.ts";
import { readH264Configuration, splitH264Frame } from "./h264.ts";
import { readH265Configuration, splitH265Frame } from "./h265.ts";
import { ProtectProtocolError } from "../../errors.ts";

/**
 * One segment the writer answers. An init carries the stream's RFC 6381 label (`codec`, the video label, then a comma and the audio label when the stream has
 * audio) beside its bytes; a media segment carries its bytes with its `moof` and `mdat` as views into them.
 *
 * @category Transport
 */
export type Fmp4Segment = { readonly codec: string; readonly data: Buffer; readonly type: "init" } |
  { readonly data: Buffer; readonly mdat: Buffer; readonly moof: Buffer; readonly type: "media" };

/**
 * The writer's options: `segmentLength`, the video duration in milliseconds at which a media segment closes, and `audioWait`, the longest video duration in
 * milliseconds an unwritten init's segment stays open for an audio configuration while the writer has learned none. Left out, nothing waits.
 *
 * @category Transport
 */
export interface Fmp4WriterOptions {

  readonly audioWait?: number;
  readonly segmentLength: number;
}

// The track ids an init assigns: the video track first, then the audio track.
const VIDEO_TRACK_ID = 1;
const AUDIO_TRACK_ID = 2;

// The brands an init's `ftyp` names: the major brand, then the compatible brands, to which an AV1 stream adds `av01`, which AV1-ISOBMFF § 2.1 requires.
const MAJOR_BRAND = "dash";
const COMPATIBLE_BRANDS: readonly string[] = [ "iso6", "hvc1", "avc1", "mp41" ];
const AV1_BRAND = "av01";

// The movie header's timescale. Every time and duration an init states is zero, since its samples live in fragments, so the timescale only has to be valid.
const MOVIE_TIMESCALE = 1000;

// The fixed-point values the headers state: a rate of 1.0 in 16.16, a volume of 1.0 in 8.8, and the unity matrix, its last entry 1.0 in 2.30 and the others in
// 16.16. The language `und` packs three five-bit letters, each less 0x60, under a zero pad bit.
const UNITY_RATE = 0x00010000;
const FULL_VOLUME = 0x0100;
const UNITY_MATRIX = Buffer.concat([ 0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000 ].map((entry) => u32(entry)));
const LANGUAGE_UNDETERMINED = 0x55c4;

// The header flags an init writes: a track enabled, in the movie and in the preview; a `url ` entry whose media is in the same file; and the video media header's
// flag, which the format fixes at 1.
const TKHD_FLAGS = 0x000007;
const URL_SELF_CONTAINED = 0x000001;
const VMHD_FLAGS = 0x000001;

// The handler each kind of track names.
const VIDEO_HANDLER = { name: "VideoHandler", type: "vide" } as const;
const SOUND_HANDLER = { name: "SoundHandler", type: "soun" } as const;

// A visual sample entry's template fields (ISO/IEC 14496-12 § 12.1.3): 72 dpi each way, one frame per sample, an empty 32-byte compressor name, a depth of 24 and
// the pre-defined -1.
const VISUAL_RESOLUTION = 72;
const VISUAL_FRAME_COUNT = 1;
const COMPRESSOR_NAME_SIZE = 32;
const VISUAL_DEPTH = 0x0018;
const VISUAL_PRE_DEFINED = 0xffff;

// An audio sample entry's sample size (ISO/IEC 14496-12 § 12.2.3).
const AUDIO_SAMPLE_SIZE = 16;

// The largest value a 16-bit field holds: a visual sample entry's width and height, and the integer half of an audio sample entry's 16.16 sample rate.
const MAX_UINT16 = 0xffff;

// The `esds` fields beside the record: the stream type byte, audio (5) above a clear upstream flag and the reserved bit, set; and the SL configuration's
// predefined value 2, the one an MP4 file's elementary stream takes.
const AUDIO_STREAM_TYPE = 0x15;
const SL_CONFIG_PREDEFINED = 2;

// A track fragment header's flag, default-base-is-moof, so each data offset counts from the moof's first byte, and a track run's flags: a data offset, then each
// sample's duration, size and flags.
const TFHD_DEFAULT_BASE_IS_MOOF = 0x020000;
const TRUN_FLAGS = 0x000701;

/* The flags each sample carries, from the fields of ISO/IEC 14496-12's `sample_flags`. A keyframe depends on no other sample (`sample_depends_on` 2), other samples
 * depend on it (`sample_is_depended_on` 1), and it carries no redundant coding (`sample_has_redundancy` 2). Any other video sample is not a sync sample
 * (`sample_is_non_sync_sample`), its dependencies left unknown. An audio sample depends on no other sample and is a sync sample.
 */
const SampleFlag = {

  AUDIO: 0x02000000,
  KEYFRAME: 0x02600000,
  VIDEO: 0x00010000
} as const;

// The sizes of a fragment's fixed boxes: `mfhd` holds its 32-bit sequence number, `tfhd` its 32-bit track id, `tfdt` at version 1 its 64-bit decode time, and
// `trun` its 32-bit sample count and data offset ahead of its entries, each a 32-bit duration, size and flags.
const MFHD_SIZE = FULL_BOX_HEADER_SIZE + 4;
const TFHD_SIZE = FULL_BOX_HEADER_SIZE + 4;
const TFDT_SIZE = FULL_BOX_HEADER_SIZE + 8;
const TRUN_FIXED_SIZE = FULL_BOX_HEADER_SIZE + 8;
const TRUN_ENTRY_SIZE = 12;

// The longest duration a `trun` entry's 32 bits hold.
const MAX_SAMPLE_DURATION = (2 ** 32) - 1;

// A segment length counts milliseconds, and a clock ticks per second.
const MILLISECONDS_PER_SECOND = 1000;

// What the writer does with each video codec: split a frame into its parameter sets and its sample, and read the configuration a track is written from.
const VIDEO_CODECS: Readonly<Record<LivestreamVideoCodec, { readonly read: (parameterSets: readonly Buffer[]) => VideoConfiguration;
  readonly split: (data: Buffer) => VideoFrameParts; }>> = {

  av1: { read: readAv1Configuration, split: splitAv1Frame },
  h264: { read: readH264Configuration, split: splitH264Frame },
  h265: { read: readH265Configuration, split: splitH265Frame }
};

/* The sample entry the writer writes for each video codec, with the box holding its record: the first entry the media group's map lists for the codec, which is
 * the one carrying the stream's parameter sets in its record. The map is walked in reverse so each codec's first entry is the last one set, and it lists an entry
 * for every codec, which its own suite asserts.
 */
const VIDEO_SAMPLE_ENTRIES = Object.fromEntries([...VIDEO_FORMATS].toReversed().map(([ type, { codec, config } ]) => [ codec, { config, type } ])) as
  Readonly<Record<LivestreamVideoCodec, { readonly config: string; readonly type: string }>>;

// What the writer does with each audio codec: read the configuration fields and the sample a frame carries, read the configuration a track is written from, and
// write the box carrying the configuration's record.
const AUDIO_CODECS: Readonly<Record<LivestreamAudioCodec, { readonly read: (data: Buffer) => AudioConfiguration; readonly readFrame: (data: Buffer) => AudioFrameParts;
  readonly recordBox: (record: Buffer) => Buffer; }>> = {

  aac: { read: readAacConfiguration, readFrame: readAdtsFrame, recordBox: esds },
  opus: { read: readOpusConfiguration, readFrame: readOpusFrame, recordBox: (record) => box("dOps", record) }
};

// The sample entry the writer writes for each audio codec: the one the media group's map names for it, so the writer and the init reader spell each entry once.
const AUDIO_SAMPLE_ENTRIES = Object.fromEntries([...AUDIO_FORMATS].map(([ type, codec ]) => [ codec, type ])) as Readonly<Record<LivestreamAudioCodec, string>>;

// An audio frame's configuration fields, as its codec's reader states them, and its sample.
interface AudioFrameParts {

  readonly fields: readonly number[];
  readonly sample: Buffer;
}

// An audio stream as the writer compares one to another: its codec, the clock its timestamps count at, and its configuration fields.
interface AudioStream {

  readonly codec: LivestreamAudioCodec;
  readonly fields: readonly number[];
  readonly rate: number;
}

// A learned audio stream, with the configuration its track is written from.
interface AudioFormat extends AudioStream {

  readonly configuration: AudioConfiguration;
}

// A timestamp with the clock it counts at.
interface Instant {

  readonly rate: number;
  readonly timestamp: number;
}

// A video track: the configuration it is written from, the clock its timestamps count at, and copies of the parameter sets that configuration was read from.
interface VideoTrack {

  readonly configuration: VideoConfiguration;
  readonly parameterSets: readonly Buffer[];
  readonly rate: number;
}

// One sample's bytes as views of its frame's payload, their total size, the sample's flags, and its decode time on its track's timeline.
interface SampleData {

  readonly decodeTime: number;
  readonly flags: number;
  readonly parts: readonly Buffer[];
  readonly size: number;
}

// A sample a track's next frame has finished, with its duration.
interface Sample extends SampleData {

  readonly duration: number;
}

// A frame a track holds until its next frame gives its duration. A held audio frame also carries its stream, which a new init takes when the frame is kept.
interface HeldFrame extends SampleData {

  readonly timestamp: number;
}

interface HeldAudioFrame extends HeldFrame {

  readonly format: AudioFormat;
}

// The samples of the segment being filled, with the video duration they add up to.
interface OpenSegment {

  readonly audio: Sample[];
  readonly video: Sample[];
  videoDuration: number;
}

// An init's audio track: open until the earlier of the first audio frame it accepts and its first segment's close, then fixed with the configuration learned by
// then, or with none when none was.
type InitAudio = { readonly format: AudioFormat | undefined; readonly kind: "fixed" } | { readonly kind: "open" };

/* The open init and everything the writer holds under it: its tracks, its keyframe, the origin of the writer's timeline, each track's held frame, the segment being
 * filled with the sequence number it takes, whether the init has been written, and each drop mode. An audio change drops audio until the next keyframe starts a
 * new init, and a video frame that does not belong drops video until the next keyframe, so each mode is cleared with the init or by the keyframe that ends it.
 */
interface OpenInit {

  audio: InitAudio;
  audioDropped: boolean;
  heldAudio: HeldAudioFrame | undefined;
  heldVideo: HeldFrame;
  readonly keyframe: Instant;
  readonly origin: Instant;
  segment: OpenSegment;
  sequence: number;
  readonly video: VideoTrack;
  videoDropped: boolean;
  written: boolean;
}

// One track's samples in a segment, with the decode time of the first.
interface TrackRun {

  readonly decodeTime: number;
  readonly id: number;
  readonly samples: readonly Sample[];
}

/**
 * A writer of one livestream's frames into fMP4. Frames are pushed in arrival order, and each push answers the segments that frame completes. One writer serves one
 * stream and is discarded with it, so a reconnect starts a new writer, a new origin and a new init. Nothing flushes: when the stream ends, the segment being filled
 * and each track's held frame are discarded, as a segment a socket cuts is.
 *
 * @category Codec
 */
export class Fmp4Writer {

  #audio: AudioFormat | undefined;
  #init: OpenInit | undefined;
  readonly #segmentLength: number;

  // The length an unwritten init's segment needs while no audio configuration has been learned: the longer of the segment length and the audio wait, or the
  // segment length alone when nothing waits.
  readonly #waitLength: number;

  /**
   * Create a writer for one stream.
   *
   * @param options - The writer's options.
   *
   * @throws {@link ProtectProtocolError} if `segmentLength`, or an `audioWait` given, is not a positive, finite number of milliseconds.
   */
  constructor(options: Fmp4WriterOptions) {

    this.#segmentLength = milliseconds(options.segmentLength, "segment length");
    this.#waitLength = Math.max(this.#segmentLength, (options.audioWait === undefined) ? 0 : milliseconds(options.audioWait, "audio wait"));
  }

  /**
   * Write a frame.
   *
   * @param frame - The stream's next frame, in arrival order.
   *
   * @returns The segments the frame completes, in order: none, a media segment, or an init and then the first media segment written under it.
   *
   * @throws {@link ProtectProtocolError} if the frame's payload is one its codec's reader refuses, a keyframe that opens an init carries no parameter sets its
   *   codec's reader can read, a record other than a keyframe carrying a sample carries parameter sets of the open init's codec that the init was not read from,
   *   a frame's timestamp does not step forward from its track's previous frame by a duration a sample can state, or an init would be written for a coded size its
   *   sample entry cannot hold.
   */
  push(frame: MediaFrame): Fmp4Segment[] {

    const segments: Fmp4Segment[] = [];

    if(frame.kind === "audio") {

      this.#pushAudio(frame);
    } else {

      this.#pushVideo(frame, segments);
    }

    return segments;
  }

  /* An audio frame's configuration is learned first. The frame is then judged for an audio change, then dropped when it starts before its init's keyframe, and only
   * then does it finish the held frame with its step. The change is judged before the step is measured because a new rate changes the clock the step counts in,
   * so a change measured as a step would read as a step backwards.
   */
  #pushAudio(frame: AudioFrame): void {

    const codec = AUDIO_CODECS[frame.codec];
    const { fields, sample } = codec.readFrame(frame.data);
    const stream = { codec: frame.codec, fields, rate: frame.rate };

    if((this.#audio === undefined) || !sameStream(this.#audio, stream)) {

      this.#audio = { ...stream, configuration: codec.read(frame.data) };
    }

    const format = this.#audio;
    const init = this.#init;

    // A frame with no sample, a frame before the first keyframe, and every frame while an audio change waits for the next keyframe are dropped.
    if((sample.length === 0) || (init === undefined) || init.audioDropped) {

      return;
    }

    // A frame that differs from the audio its init has fixed, or any frame under an init fixed without audio, is an audio change: the held frame is discarded, and
    // audio is dropped until the next keyframe starts a new init.
    if((init.audio.kind === "fixed") && ((init.audio.format === undefined) || !sameStream(init.audio.format, format))) {

      init.audioDropped = true;
      init.heldAudio = undefined;

      return;
    }

    if(frame.timestamp < rescale(init.keyframe, frame.rate)) {

      return;
    }

    if(init.audio.kind === "open") {

      init.audio = { format, kind: "fixed" };
    }

    if(init.heldAudio !== undefined) {

      init.segment.audio.push({ ...init.heldAudio, duration: sampleDuration(frame.timestamp - init.heldAudio.timestamp) });
    }

    init.heldAudio = { decodeTime: frame.timestamp - rescale(init.origin, frame.rate), flags: SampleFlag.AUDIO, format, parts: [sample], size: sample.length,
      timestamp: frame.timestamp };
  }

  /* A video frame's parameter sets are judged against the open init before a frame with no sample is dropped, so a record carrying sets alone is judged as any
   * other. A frame that is not a keyframe is then judged for whether it belongs to the open init, and a keyframe for whether it starts a new one; a frame that
   * continues the open init finishes the held frame with its step, which may close the segment.
   */
  #pushVideo(frame: VideoFrame, segments: Fmp4Segment[]): void {

    const init = this.#init;

    // Before the first keyframe every video frame is dropped, and a frame that opens no init teaches the writer nothing.
    if((init === undefined) && !frame.keyframe) {

      return;
    }

    const { parameterSets, sample } = VIDEO_CODECS[frame.codec].split(frame.data);
    const size = sample.reduce((length, part) => length + part.length, 0);

    // The first keyframe that carries a sample opens the first init and is the origin of the timeline. Its configuration is read from the parameter sets it
    // carries, so one carrying none is refused by its codec's reader.
    if(init === undefined) {

      if(size > 0) {

        const origin = { rate: frame.rate, timestamp: frame.timestamp };

        this.#init = openInit(frame, { origin, parts: sample, size, video: readVideoTrack(frame, parameterSets) });
      }

      return;
    }

    const sameCodec = frame.codec === init.video.configuration.codec;
    const belongs = sameCodec && sameSets(parameterSets, init.video.parameterSets);

    // Parameter sets of the init's codec that it was not read from are read only from a keyframe that carries a sample, which starts a new init. Carried by any
    // other record, with a sample or without, they would leave the pictures after it decoding under the init's sets, so they are refused.
    if(sameCodec && !belongs && (!frame.keyframe || (size === 0))) {

      throw new ProtectProtocolError("Video stream's parameter sets changed outside a keyframe.");
    }

    if(size === 0) {

      return;
    }

    // A frame that is not a keyframe and does not belong to the open init drops video until the next keyframe, whose step then spans the frames dropped.
    if(!frame.keyframe) {

      if(init.videoDropped || !belongs) {

        init.videoDropped = true;

        return;
      }

      this.#finishVideo(init, frame.timestamp, segments);
      init.heldVideo = heldVideo(frame, { origin: init.origin, parts: sample, size });

      return;
    }

    if(belongs && !init.audioDropped) {

      init.videoDropped = false;
      this.#finishVideo(init, frame.timestamp, segments);
      init.heldVideo = heldVideo(frame, { origin: init.origin, parts: sample, size });

      return;
    }

    // A keyframe of another codec or carrying a parameter set the init was not read from, or one that ends an audio change, starts a new init at itself. The held
    // video frame is finished into the segment being filled, which closes when it still holds a sample, its init written first when it never was. The new init
    // keeps the open init's video when the keyframe changes none of it.
    const video = belongs ? init.video : readVideoTrack(frame, parameterSets);

    this.#finishVideo(init, frame.timestamp, segments);

    if(init.segment.video.length > 0) {

      this.#close(init, segments);
    }

    const next = openInit(frame, { origin: init.origin, parts: sample, size, video });
    const heldAudio = init.heldAudio;

    // The held audio frame is judged against the new init as an arriving frame is: it is kept, and fixes the new init's audio, unless it starts before the keyframe.
    if((heldAudio !== undefined) && (heldAudio.timestamp >= rescale(next.keyframe, heldAudio.format.rate))) {

      next.audio = { format: heldAudio.format, kind: "fixed" };
      next.heldAudio = heldAudio;
    }

    this.#init = next;
  }

  // Finish the held video frame with the step to the frame that follows it, and close the segment once the video it holds reaches its length: the segment length,
  // or the wait's length while the open init is unwritten and no audio configuration has been learned, a frame dropped below its keyframe teaching one as well.
  #finishVideo(init: OpenInit, timestamp: number, segments: Fmp4Segment[]): void {

    const duration = sampleDuration(timestamp - init.heldVideo.timestamp);
    const length = ((this.#audio === undefined) && !init.written) ? this.#waitLength : this.#segmentLength;

    init.segment.video.push({ ...init.heldVideo, duration });
    init.segment.videoDuration += duration;

    if(init.segment.videoDuration >= ((length * init.video.rate) / MILLISECONDS_PER_SECOND)) {

      this.#close(init, segments);
    }
  }

  // Close the segment being filled. An init's first close fixes its audio when no accepted audio frame has, and writes the init ahead of the segment.
  #close(init: OpenInit, segments: Fmp4Segment[]): void {

    if(init.audio.kind === "open") {

      init.audio = { format: this.#audio, kind: "fixed" };
    }

    if(!init.written) {

      segments.push(writeInit(init.video, init.audio.format));
      init.written = true;
    }

    segments.push(writeSegment(init.segment, init.sequence));
    init.segment = { audio: [], video: [], videoDuration: 0 };
    init.sequence++;
  }
}

// An init opened at a keyframe, which it holds as its first video frame, with its audio open, its first segment empty and numbered 1, unwritten, and neither drop
// mode set.
function openInit(keyframe: VideoFrame, opts: { origin: Instant; parts: readonly Buffer[]; size: number; video: VideoTrack }): OpenInit {

  const { origin, parts, size, video } = opts;

  return { audio: { kind: "open" }, audioDropped: false, heldAudio: undefined, heldVideo: heldVideo(keyframe, { origin, parts, size }),
    keyframe: { rate: keyframe.rate, timestamp: keyframe.timestamp }, origin, segment: { audio: [], video: [], videoDuration: 0 }, sequence: 1, video,
    videoDropped: false, written: false };
}

// The video frame a track holds: its sample, flagged as a keyframe or not, at its decode time against the origin.
function heldVideo(frame: VideoFrame, opts: { origin: Instant; parts: readonly Buffer[]; size: number }): HeldFrame {

  const { origin, parts, size } = opts;

  return { decodeTime: frame.timestamp - origin.timestamp, flags: frame.keyframe ? SampleFlag.KEYFRAME : SampleFlag.VIDEO, parts, size,
    timestamp: frame.timestamp };
}

// A video track read from a keyframe's parameter sets, with copies of them in one buffer the writer owns, so the init never holds the keyframe's payload, and the
// socket message it is a view into, alive past the segment that copied its bytes.
function readVideoTrack(frame: VideoFrame, parameterSets: readonly Buffer[]): VideoTrack {

  const configuration = VIDEO_CODECS[frame.codec].read(parameterSets);
  const owned = Buffer.concat(parameterSets);
  const copies: Buffer[] = [];
  let offset = 0;

  for(const set of parameterSets) {

    copies.push(owned.subarray(offset, offset + set.length));
    offset += set.length;
  }

  return { configuration, parameterSets: copies, rate: frame.rate };
}

// Whether every parameter set a frame carries equals, byte for byte, one of the copies an init was read from, in any order and any number of times. A frame that
// repeats some of its init's sets carries nothing new, and one that carries none carries nothing that differs.
function sameSets(parameterSets: readonly Buffer[], copies: readonly Buffer[]): boolean {

  return parameterSets.every((set) => copies.some((copy) => copy.equals(set)));
}

// Whether one audio stream matches another: the same codec, the same clock, and the same configuration fields.
function sameStream(first: AudioStream, second: AudioStream): boolean {

  return (first.codec === second.codec) && (first.rate === second.rate) && (first.fields.length === second.fields.length) &&
    first.fields.every((field, index) => field === second.fields[index]);
}

// An AAC frame's configuration fields, its object type, sampling-frequency index and channel configuration, and its sample, the frame past its ADTS header.
function readAdtsFrame(data: Buffer): AudioFrameParts {

  const header = readAdtsHeader(data);

  return { fields: [ header.objectType, header.samplingFrequencyIndex, header.channelConfiguration ], sample: data.subarray(header.headerLength) };
}

// An Opus packet's configuration field, its channel count, and its sample, the packet whole.
function readOpusFrame(data: Buffer): AudioFrameParts {

  return { fields: [opusChannels(data)], sample: data };
}

/* Convert an instant to another clock, rounding down: floor(timestamp * rate / instant's rate), computed by splitting off the whole seconds first so no product
 * outgrows the integers a number holds exactly. The plain product of a 90 kHz camera time and a 48 kHz clock passes 2 ** 53 once a camera has been up about 24
 * days, and dividing before multiplying rounds the quotient and is wrong within about a month of uptime.
 */
function rescale(instant: Instant, rate: number): number {

  const seconds = Math.floor(instant.timestamp / instant.rate);

  return (seconds * rate) + Math.floor(((instant.timestamp - (seconds * instant.rate)) * rate) / instant.rate);
}

// A length the writer is given, in milliseconds. One that is not a positive, finite number is refused, naming the option it was given as.
function milliseconds(length: number, option: string): number {

  if(!Number.isFinite(length) || (length <= 0)) {

    throw new ProtectProtocolError("fMP4 writer's " + option + " is not a positive, finite number of milliseconds.");
  }

  return length;
}

// A step between two frames of a track as a sample's duration. A step that is not positive, or too long for a `trun` entry's 32 bits, is refused: the writer
// cannot place a frame that does not advance its track, nor state a duration its fragment cannot hold.
function sampleDuration(step: number): number {

  if((step <= 0) || (step > MAX_SAMPLE_DURATION)) {

    throw new ProtectProtocolError("Media frame's timestamp does not step forward from its track's previous frame by a duration a sample can state.");
  }

  return step;
}

// Write an init: the `ftyp`, then the `moov` with the video track and, when the stream has audio, the audio track. A coded size past the 16 bits a visual sample
// entry holds is refused.
function writeInit(video: VideoTrack, audio: AudioFormat | undefined): Fmp4Segment {

  const { configuration } = video;

  if((configuration.width > MAX_UINT16) || (configuration.height > MAX_UINT16)) {

    throw new ProtectProtocolError("Video configuration's coded width or height is too large for the 16-bit fields of a visual sample entry.");
  }

  const tracks = [ videoTrak(video), ...((audio === undefined) ? [] : [audioTrak(audio)]) ];
  const trackIds = (audio === undefined) ? [VIDEO_TRACK_ID] : [ VIDEO_TRACK_ID, AUDIO_TRACK_ID ];
  const brands = (configuration.codec === "av1") ? [ ...COMPATIBLE_BRANDS, AV1_BRAND ] : COMPATIBLE_BRANDS;
  const movieHeader = fullBox("mvhd", 0, 0, u32(0), u32(0), u32(MOVIE_TIMESCALE), u32(0), u32(UNITY_RATE), u16(FULL_VOLUME), Buffer.alloc(10), UNITY_MATRIX,
    Buffer.alloc(24), u32(trackIds.length + 1));
  const trackExtends = trackIds.map((id) => fullBox("trex", 0, 0, u32(id), u32(1), u32(0), u32(0), u32(0)));

  return {

    codec: (audio === undefined) ? configuration.label : (configuration.label + "," + audio.configuration.label),
    data: Buffer.concat([ box("ftyp", latin1(MAJOR_BRAND), u32(0), ...brands.map(latin1)), box("moov", movieHeader, box("mvex", ...trackExtends), ...tracks) ]),
    type: "init"
  };
}

// The video track: its visual sample entry, in the template layout with an empty compressor name, the coded width and height, and the record's box.
function videoTrak(video: VideoTrack): Buffer {

  const { height, record, width } = video.configuration;
  const { config, type } = VIDEO_SAMPLE_ENTRIES[video.configuration.codec];
  const entry = box(type, Buffer.alloc(6), u16(1), Buffer.alloc(16), u16(width), u16(height), fixed16(VISUAL_RESOLUTION), fixed16(VISUAL_RESOLUTION), u32(0),
    u16(VISUAL_FRAME_COUNT), Buffer.alloc(COMPRESSOR_NAME_SIZE), u16(VISUAL_DEPTH), u16(VISUAL_PRE_DEFINED), box(config, record));

  return trak({ entry, handler: VIDEO_HANDLER, height, id: VIDEO_TRACK_ID, mediaHeader: fullBox("vmhd", 0, VMHD_FLAGS, Buffer.alloc(8)), rate: video.rate,
    volume: 0, width });
}

// The audio track: its sample entry at version 0 with the channel count, a sample size of 16 and the sample rate in 16.16, then the box carrying the record. A rate
// past the integer half's 16 bits writes 0 there; a reader takes such a rate from the record, never from this field.
function audioTrak(audio: AudioFormat): Buffer {

  const { channels, codec, record, sampleRate } = audio.configuration;
  const { recordBox } = AUDIO_CODECS[codec];
  const sampleEntry = box(AUDIO_SAMPLE_ENTRIES[codec], Buffer.alloc(6), u16(1), Buffer.alloc(8), u16(channels), u16(AUDIO_SAMPLE_SIZE), u16(0), u16(0),
    fixed16((sampleRate > MAX_UINT16) ? 0 : sampleRate), recordBox(record));

  return trak({ entry: sampleEntry, handler: SOUND_HANDLER, height: 0, id: AUDIO_TRACK_ID, mediaHeader: fullBox("smhd", 0, 0, u16(0), u16(0)), rate: audio.rate,
    volume: FULL_VOLUME, width: 0 });
}

// A track: its header, then its media, whose sample table lists its one sample entry and holds no sample.
function trak(track: { entry: Buffer; handler: { readonly name: string; readonly type: string }; height: number; id: number; mediaHeader: Buffer; rate: number;
  volume: number; width: number; }): Buffer {

  const { entry, handler, height, id, mediaHeader, rate, volume, width } = track;
  const header = fullBox("tkhd", 0, TKHD_FLAGS, u32(0), u32(0), u32(id), u32(0), u32(0), Buffer.alloc(8), u16(0), u16(0), u16(volume), u16(0), UNITY_MATRIX,
    fixed16(width), fixed16(height));
  const media = box("mdia", fullBox("mdhd", 0, 0, u32(0), u32(0), u32(rate), u32(0), u16(LANGUAGE_UNDETERMINED), u16(0)),
    fullBox("hdlr", 0, 0, u32(0), latin1(handler.type), Buffer.alloc(12), latin1(handler.name + "\0")),
    box("minf", mediaHeader, box("dinf", fullBox("dref", 0, 0, u32(1), fullBox("url ", 0, URL_SELF_CONTAINED))),
      box("stbl", fullBox("stsd", 0, 0, u32(1), entry), fullBox("stts", 0, 0, u32(0)), fullBox("stsc", 0, 0, u32(0)), fullBox("stsz", 0, 0, u32(0), u32(0)),
        fullBox("stco", 0, 0, u32(0)))));

  return box("trak", header, media);
}

// An `esds` wrapping an `AudioSpecificConfig` (ISO/IEC 14496-1 § 7.2.6.5): the elementary stream descriptor, its id the audio track's and its flags clear, holding
// a decoder configuration descriptor for an MPEG-4 audio stream with zero buffer size and bitrates and the record as its decoder-specific info, then the SL
// configuration descriptor.
function esds(record: Buffer): Buffer {

  const decoderConfig = Buffer.alloc(DECODER_CONFIG_FIXED_SIZE);

  decoderConfig.writeUInt8(OBJECT_TYPE_MPEG4_AUDIO, 0);
  decoderConfig.writeUInt8(AUDIO_STREAM_TYPE, 1);

  return fullBox("esds", 0, 0, descriptor(DescriptorTag.ELEMENTARY_STREAM, u16(AUDIO_TRACK_ID), u8(0),
    descriptor(DescriptorTag.DECODER_CONFIG, decoderConfig, descriptor(DescriptorTag.DECODER_SPECIFIC_INFO, record)),
    descriptor(DescriptorTag.SL_CONFIG, u8(SL_CONFIG_PREDEFINED))));
}

// An MPEG-4 Systems descriptor: its tag, its length in one byte, which holds every body an `esds` here carries, and its body.
function descriptor(tag: number, ...body: Buffer[]): Buffer {

  const content = Buffer.concat(body);

  return Buffer.concat([ u8(tag), u8(content.length), content ]);
}

// A four-character code or a handler's name as its bytes.
function latin1(text: string): Buffer {

  return Buffer.from(text, "latin1");
}

// A track's run in a segment, or undefined when the segment holds none of its samples.
function trackRun(id: number, samples: readonly Sample[]): TrackRun | undefined {

  const [first] = samples;

  return (first === undefined) ? undefined : { decodeTime: first.decodeTime, id, samples };
}

/* Write a media segment in one allocation: the `moof` and `mdat` sizes are counted first, then every header and field is written in place and each sample's bytes
 * copied in after the `mdat` header, so the segment is one buffer with its `moof` and `mdat` as views into it. A track with no sample in the segment has no `traf`.
 */
function writeSegment(segment: OpenSegment, sequence: number): Fmp4Segment {

  const runs = [ trackRun(VIDEO_TRACK_ID, segment.video), trackRun(AUDIO_TRACK_ID, segment.audio) ].filter((run) => run !== undefined);
  const trunSize = (run: TrackRun): number => TRUN_FIXED_SIZE + (run.samples.length * TRUN_ENTRY_SIZE);
  const trafSize = (run: TrackRun): number => BOX_HEADER_SIZE + TFHD_SIZE + TFDT_SIZE + trunSize(run);
  const moofSize = runs.reduce((size, run) => size + trafSize(run), BOX_HEADER_SIZE + MFHD_SIZE);
  const mdatSize = runs.reduce((size, run) => run.samples.reduce((total, sample) => total + sample.size, size), BOX_HEADER_SIZE);
  const data = Buffer.alloc(moofSize + mdatSize);
  let dataOffset = moofSize + BOX_HEADER_SIZE;
  let offset = writeBoxHeader(data, 0, { size: moofSize, type: "moof" });

  offset = writeFullBoxHeader(data, offset, { flags: 0, size: MFHD_SIZE, type: "mfhd", version: 0 });
  offset = data.writeUInt32BE(sequence, offset);

  for(const run of runs) {

    offset = writeBoxHeader(data, offset, { size: trafSize(run), type: "traf" });
    offset = writeFullBoxHeader(data, offset, { flags: TFHD_DEFAULT_BASE_IS_MOOF, size: TFHD_SIZE, type: "tfhd", version: 0 });
    offset = data.writeUInt32BE(run.id, offset);
    offset = writeFullBoxHeader(data, offset, { flags: 0, size: TFDT_SIZE, type: "tfdt", version: 1 });
    offset = writeUInt64(data, offset, run.decodeTime);
    offset = writeFullBoxHeader(data, offset, { flags: TRUN_FLAGS, size: trunSize(run), type: "trun", version: 0 });
    offset = data.writeUInt32BE(run.samples.length, offset);
    offset = data.writeInt32BE(dataOffset, offset);

    for(const sample of run.samples) {

      offset = data.writeUInt32BE(sample.duration, offset);
      offset = data.writeUInt32BE(sample.size, offset);
      offset = data.writeUInt32BE(sample.flags, offset);
      dataOffset += sample.size;
    }
  }

  offset = writeBoxHeader(data, offset, { size: mdatSize, type: "mdat" });

  for(const run of runs) {

    for(const sample of run.samples) {

      for(const part of sample.parts) {

        data.set(part, offset);
        offset += part.length;
      }
    }
  }

  return { data, mdat: data.subarray(moofSize), moof: data.subarray(0, moofSize), type: "media" };
}
