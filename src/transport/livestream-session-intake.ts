/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * livestream-session-intake.ts: The boundary a livestream session hands each socket message to, and the intakes behind it - the decode of the controller's
 * fMP4 frame protocol, and the UBV record stream read into frames and written as fMP4.
 */

/**
 * The boundary between a livestream session's socket and the stream its messages carry. A {@link LivestreamSession} hands every binary message to one
 * {@link LivestreamIntake} for its life, picked by the stream's upstream, and the intake hands back, through the session's {@link LivestreamIntakeSink}, the
 * initialization segment and the media segments the session publishes, and on UBV the frames beside them. The session keeps everything about the socket - its
 * liveness, the messages it skips, the cached init and the lifecycle the first init advances - and the intake keeps everything about the bytes. An intake's throw
 * is a refusal of what the stream sent, which ends the session.
 *
 * {@link Fmp4Intake} decodes the controller's fMP4 frame protocol. Each frame is a 1-byte type and a 3-byte big-endian payload length ahead of its payload, a frame
 * split across messages is reassembled, a codec-information frame labels the init that follows it, and the boxes between a `beginSegment` frame and an `endSegment`
 * frame are assembled into one media segment, carrying the decode timestamps the controller sent ahead of it when the session asked for them.
 *
 * {@link UbvIntake} reads a UBV record stream through one {@link UbvReader} into frames and writes them through one {@link Fmp4Writer} into an init and media
 * segments, so every behavior keyed on segments serves a UBV stream exactly as it serves Protect's own fMP4.
 *
 * @module LivestreamSessionIntake
 */
import { Fmp4Writer } from "../protocol/media/fmp4-writer.ts";
import type { LivestreamAudioCodec } from "../protocol/media/codecs.ts";
import type { LivestreamInit } from "../protocol/media/init-segment.ts";
import type { MediaFrame } from "../protocol/media/frames.ts";
import { PROTECT_LIVESTREAM_AUDIO_WAIT_MS } from "../settings.ts";
import { ProtectLivestreamAudioError } from "../errors.ts";
import type { ProtectLogging } from "../logging.ts";
import type { Segment } from "./livestream-session.ts";
import { UbvReader } from "../protocol/media/ubv.ts";
import { describeInitSegment } from "../protocol/media/init-segment.ts";

// The frame-type identifier byte that prefixes every UniFi Protect livestream WebSocket payload. The single byte tells us how to read the body that follows it. An
// erasable `as const` map gives the dot-access shape of a numeric enum without the non-erasable runtime emit; keys are alphabetized per the project convention, and the
// wire-protocol byte values speak for themselves at the call sites.
const LiveFrame = {

  audio: 253,
  beginSegment: 249,
  codecInformation: 248,
  endSegment: 255,
  initSegment: 250,
  mdat: 254,
  moof: 251,
  timestamp: 247,
  video: 252
} as const;

// The set of valid frame-type bytes, for O(1) validation on the decode hot path. `Object.values` over the `as const` map yields just the literal bytes - no enum
// reverse-mapping artifacts to filter.
const VALID_LIVE_FRAMES: ReadonlySet<number> = new Set(Object.values(LiveFrame));

// A reused zero-length buffer so the common "no partial frame carried over" case allocates nothing.
const EMPTY_BUFFER: Buffer = Buffer.alloc(0);

// The byte width of each decode timestamp on the wire: a 64-bit big-endian unsigned integer, mirroring the `tfdt` box's baseMediaDecodeTime.
const TIMESTAMP_BYTES = 8;

// The audio wait counts milliseconds, and an audio track's clock ticks per second.
const MILLISECONDS_PER_SECOND = 1000;

/**
 * The boundary a {@link LivestreamSession} hands each socket message to. An intake decodes what the messages carry and hands the session each segment it completes
 * through the {@link LivestreamIntakeSink} it was built with.
 *
 * @category Transport
 */
export interface LivestreamIntake {

  /**
   * Take the stream's next socket message.
   *
   * @param message - The message's bytes, a view of the socket's own buffer.
   */
  push(message: Buffer): void;
}

/**
 * Where an intake hands what it decodes: `frame` takes each media frame a UBV stream carries, as a view of the message it arrived in, `init` takes each
 * initialization segment, with its bytes ones no socket message holds, which the caller may keep for the stream's life, and its description read once, and `media`
 * takes each media segment.
 *
 * @category Transport
 */
export interface LivestreamIntakeSink {

  frame(frame: MediaFrame): void;
  init(init: LivestreamInit): void;
  media(segment: Extract<Segment, { type: "media" }>): void;
}

// The mutable accumulator for the segment under construction. Chunks are collected per box during a segment and assembled into a single buffer at `endSegment`, so the
// hot path makes one allocation per segment rather than one per chunk. The controller delivers boxes in moof, mdat, video, audio order, the order we concatenate.
interface SegmentAccumulator {

  audio: Buffer[];
  mdat: Buffer[];
  moof: Buffer[];
  video: Buffer[];
}

/**
 * The intake for the controller's own fMP4 frame protocol. One instance serves one session's socket, carrying a partial frame from one message into the next.
 *
 * @category Transport
 */
export class Fmp4Intake implements LivestreamIntake {

  readonly #log: ProtectLogging;
  readonly #sink: LivestreamIntakeSink;
  readonly #timestamps: boolean;

  // The codec string captured from the controller, which labels each init that follows it.
  #codec = "";

  // The segment under construction, the partial-frame tail carried between WebSocket messages, and the decode timestamps awaiting the next media segment.
  #current: SegmentAccumulator = { audio: [], mdat: [], moof: [], video: [] };
  #packetRemaining: Buffer = EMPTY_BUFFER;
  #pendingTimestamps: number[] | null = null;

  /**
   * Create the intake for one session.
   *
   * @param options - `log` takes the decode's debug lines, `sink` takes each segment the intake completes, and `timestamps` says whether the session asked the
   *   controller for decode timestamps, which the intake attaches to the media segment after them only then.
   */
  constructor(options: { log: ProtectLogging; sink: LivestreamIntakeSink; timestamps: boolean }) {

    this.#log = options.log;
    this.#sink = options.sink;
    this.#timestamps = options.timestamps;
  }

  /**
   * Decode every complete frame a message holds, carrying a partial tail to the next message. The wire layout per frame is a 1-byte type, a 3-byte big-endian length,
   * then that many payload bytes.
   *
   * @param message - The message's bytes.
   */
  push(message: Buffer): void {

    // Prepend any leftover partial frame from the previous message so a frame split across two messages is reassembled before we decode it.
    let packet = message;

    if(this.#packetRemaining.length > 0) {

      packet = Buffer.concat([ this.#packetRemaining, packet ]);
      this.#packetRemaining = EMPTY_BUFFER;
    }

    let offset = 0;

    for(;;) {

      // Fewer than 4 bytes left is an incomplete header; save the tail to prepend to the next message.
      if((packet.length - offset) < 4) {

        this.#packetRemaining = packet.subarray(offset);

        break;
      }

      const frameType = packet.readUInt8(offset);

      // An unrecognized frame type means we have lost frame sync within this packet; we cannot resync mid-buffer, so we abandon the remainder and start fresh on the
      // next message. Genuine corruption is rare and the watchdog covers a wedged stream.
      if(!VALID_LIVE_FRAMES.has(frameType)) {

        this.#log.debug("Discarding a livestream packet after an invalid frame header.", { frameType });

        break;
      }

      // Protect encodes the length of the frame payload in the three bytes after the type, as a big-endian 24-bit unsigned integer.
      const length = packet.readUIntBE(offset + 1, 3);

      // If the full payload is not yet in hand, save the frame (header included) to prepend to the next message.
      if(packet.length < (offset + 4 + length)) {

        this.#packetRemaining = packet.subarray(offset);

        break;
      }

      const dataStart = offset + 4;
      const dataEnd = dataStart + length;

      this.#handleFrame(frameType, packet.subarray(dataStart, dataEnd));

      offset = dataEnd;
    }
  }

  // Dispatch one decoded frame. Media boxes accumulate into the current segment; control frames reset the accumulator, capture the codec or timestamps, or emit a
  // completed segment.
  #handleFrame(frameType: number, data: Buffer): void {

    switch(frameType) {

      case LiveFrame.audio:

        this.#current.audio.push(data);

        break;

      case LiveFrame.beginSegment:

        // Reset with fresh arrays so any leftovers from a prior segment cannot leak in if frames arrive out of the expected order.
        this.#current = { audio: [], mdat: [], moof: [], video: [] };

        break;

      case LiveFrame.codecInformation:

        this.#codec = data.toString();
        this.#log.debug("Livestream codec information received.", { codec: this.#codec });

        break;

      case LiveFrame.endSegment:

        this.#emitMediaSegment();

        break;

      case LiveFrame.initSegment:

        this.#emitInitSegment(data);

        break;

      case LiveFrame.mdat:

        this.#current.mdat.push(data);

        break;

      case LiveFrame.moof:

        this.#current.moof.push(data);

        break;

      case LiveFrame.timestamp:

        // Capture decode timestamps only when the consumer opted in; otherwise the controller would not be sending them and we ignore any that appear. Each is a 64-bit
        // big-endian value, read as a BigInt and narrowed to a number - safe because we always negotiate rebaseTimestampsToZero, keeping the values near zero.
        if(this.#timestamps) {

          this.#pendingTimestamps = Array.from({ length: Math.floor(data.length / TIMESTAMP_BYTES) },
            (_value, index) => Number(data.readBigUInt64BE(index * TIMESTAMP_BYTES)));
        }

        break;

      case LiveFrame.video:

        this.#current.video.push(data);

        break;
    }
  }

  // Hand the initialization segment to the sink. We take a detached copy because the session caches it for its lifetime and the pool replays it to late joiners;
  // holding the zero-copy view would keep the whole originating message buffer alive. The description is read here, once per init frame, so the cache and every
  // segment built from it share one description and nothing on the media path ever parses.
  #emitInitSegment(raw: Buffer): void {

    const data = Buffer.from(raw);
    const description = describeInitSegment(data);

    this.#sink.init({ codec: this.#codec, data, description });
  }

  // Assemble the accumulated boxes into one media segment and hand it to the sink. We sum the box lengths, allocate once, and copy each chunk into place; `moof` and
  // `mdat` are then zero-copy views into that single buffer. `alloc` (not `allocUnsafe`) means a length miscount surfaces as zero padding rather than leaked memory,
  // at negligible cost.
  #emitMediaSegment(): void {

    const moofLength = this.#sumChunks(this.#current.moof);
    const mdatLength = this.#sumChunks(this.#current.mdat);
    const total = moofLength + mdatLength + this.#sumChunks(this.#current.video) + this.#sumChunks(this.#current.audio);
    const data = Buffer.alloc(total);

    let position = 0;

    for(const chunks of [ this.#current.moof, this.#current.mdat, this.#current.video, this.#current.audio ]) {

      for(const chunk of chunks) {

        data.set(chunk, position);
        position += chunk.length;
      }
    }

    const moof = data.subarray(0, moofLength);
    const mdat = data.subarray(moofLength, moofLength + mdatLength);
    const timestamps = this.#pendingTimestamps;

    this.#pendingTimestamps = null;
    this.#sink.media((timestamps !== null) ? { data, mdat, moof, timestamps, type: "media" } : { data, mdat, moof, type: "media" });
  }

  #sumChunks(chunks: readonly Buffer[]): number {

    let total = 0;

    for(const chunk of chunks) {

      total += chunk.length;
    }

    return total;
  }
}

/**
 * The intake for a UBV record stream. One instance serves one session's socket: its reader reads each message into frames, carrying a record a message cuts into
 * the next, and its writer writes the frames into an init and media segments. Each frame reaches the sink's `frame` as it arrives, a view of the message it came in,
 * and then the writer. The writer's init needs no copy, since no socket message holds its bytes, and its description is read once.
 *
 * Audio of a codec other than the one the stream asked for is dropped before the sink and the writer. A run of it ends the stream on
 * {@link ProtectLivestreamAudioError} once a frame's timestamp lies the audio wait or more past the run's first, on that track's own clock, and a frame of the asked
 * codec ends the run: the controller is not honoring the request.
 *
 * A stream that expects audio gives its writer the audio wait, so the first segment stays open until audio of the asked codec arrives, under that safety net. The
 * wait exists because a stream's audio can begin after its video, and a proxied stream asked for Opus carries the other codec, which the intake drops, until the
 * controller acts on the play command, while an init written before the audio arrives states no audio track. A camera that sends no audio streams video alone, at
 * once when none is expected and at the wait's length when it was.
 *
 * @category Transport
 */
export class UbvIntake implements LivestreamIntake {

  readonly #audio: LivestreamAudioCodec;
  readonly #reader = new UbvReader();
  readonly #sink: LivestreamIntakeSink;
  readonly #writer: Fmp4Writer;

  // The timestamp at which the current run of the other codec's audio ends the stream, on that audio's own clock, or undefined while no run is open. Only the number
  // is held, so a run never keeps a socket message alive.
  #mismatchDeadline: number | undefined;

  /**
   * Create the intake for one session.
   *
   * @param options - `audio` is the codec the stream asked for, `audioExpected` says whether the camera sends audio, which decides whether the writer waits for it,
   *   `segmentLength` is the writer's segment length in milliseconds, and `sink` takes each frame and each segment the intake completes.
   */
  constructor(options: { audio: LivestreamAudioCodec; audioExpected: boolean; segmentLength: number; sink: LivestreamIntakeSink }) {

    this.#audio = options.audio;
    this.#sink = options.sink;
    this.#writer = new Fmp4Writer({ ...(options.audioExpected ? { audioWait: PROTECT_LIVESTREAM_AUDIO_WAIT_MS } : {}), segmentLength: options.segmentLength });
  }

  /**
   * Read every frame a message completes, hand each to the sink and the writer, and hand every segment the writer answers to the sink.
   *
   * @param message - The message's bytes.
   *
   * @throws {@link ProtectProtocolError} if the reader or the writer refuses what the stream sent, and {@link ProtectLivestreamAudioError} once the other codec's
   *   audio has run for the audio wait.
   */
  push(message: Buffer): void {

    for(const frame of this.#reader.push(message)) {

      if(frame.kind === "audio") {

        if(frame.codec !== this.#audio) {

          this.#dropMismatch(frame.rate, frame.timestamp);

          continue;
        }

        this.#mismatchDeadline = undefined;
      }

      this.#sink.frame(frame);

      for(const segment of this.#writer.push(frame)) {

        if(segment.type === "init") {

          this.#sink.init({ codec: segment.codec, data: segment.data, description: describeInitSegment(segment.data) });

          continue;
        }

        this.#sink.media(segment);
      }
    }
  }

  // Drop a frame of the other codec's audio. The first of a run sets the run's deadline on its own clock, and a frame at the deadline or past it ends the stream.
  #dropMismatch(rate: number, timestamp: number): void {

    this.#mismatchDeadline ??= timestamp + ((PROTECT_LIVESTREAM_AUDIO_WAIT_MS * rate) / MILLISECONDS_PER_SECOND);

    if(timestamp >= this.#mismatchDeadline) {

      throw new ProtectLivestreamAudioError("The UniFi Protect controller is streaming an audio codec other than the one the livestream asked for.");
    }
  }
}
