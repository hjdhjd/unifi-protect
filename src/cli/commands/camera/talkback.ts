/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * talkback.ts: `ufp camera talkback <camera>` - open a two-way-audio channel to a camera's speaker and feed it audio from stdin or a file, in real time.
 */
import { AAC_FRAME_SAMPLES, AdtsReader, readAdtsHeader } from "../../../protocol/media/codecs/aac.ts";
import { COMMON_OPTIONS, CliError, parseChoice } from "../../shared.ts";
import type { Clock, TalkbackAudioCodec } from "../../../index.ts";
import type { CommandHandler, CommandSpec, ListsEvery } from "../../shared.ts";
import { OPUS_DECODE_RATE, opusPacketDuration } from "../../../protocol/media/codecs/opus.ts";
import { OggOpusReader } from "../../../protocol/media/ogg.ts";
import { createReadStream } from "node:fs";
import { findCamera } from "../../lookup.ts";
import { formatBytes } from "../../output/format.ts";
import { parseArgs } from "node:util";

const USAGE = [

  "Usage: ufp camera talkback <camera> [--audio <aac|opus>] [--file <path>] [--debug]",
  "",
  "Open a two-way-audio (talkback) channel to a camera's speaker and stream audio to it until the source ends.",
  "",
  "The audio is AAC in an ADTS stream by default, at the rate the camera's talkbackSettings name, or with --audio opus, Opus in an",
  "Ogg stream, which switches the camera to Opus. ufp sends it a frame or packet at a time, each once the audio before it has played,",
  "so a file streams in real time; nothing transcodes it - pipe through ffmpeg to convert.",
  "",
  "Input:",
  "  (default)            Read audio from stdin (pipe ffmpeg into it).",
  "  --audio <aac|opus>   The audio's codec: aac (the default), an ADTS stream, or opus, an Ogg Opus stream.",
  "  --file <path>        Read audio from a file instead of stdin.",
  "  --debug              Emit the library's debug logging to stderr.",
  "  -h, --help           Show this help.",
  "",
  "Examples:",
  "  ffmpeg -i greeting.wav -ar 22050 -ac 1 -f adts - | ufp camera talkback \"Front Door\"",
  "  ffmpeg -i greeting.wav -c:a libopus -ar 24000 -ac 1 -f ogg - | ufp camera talkback \"Front Door\" --audio opus",
  "  ufp camera talkback \"Front Door\" --file greeting.aac"
].join("\n");

// The choices of --audio, every talkback codec. The `satisfies` refuses a choice the library lacks, and the assertion refuses a codec the list leaves out, so the
// flag cannot fall behind the library's union.
const AUDIO_CODECS = [ "aac", "opus" ] as const satisfies readonly TalkbackAudioCodec[];

const _audioCodecsComplete: ListsEvery<TalkbackAudioCodec, typeof AUDIO_CODECS> = true;

// One unit of audio the session sends as one chunk: its bytes, and how much audio it holds, in samples at the rate it plays at.
interface AudioUnit {

  readonly data: Buffer;
  readonly rate: number;
  readonly samples: number;
}

// Split an ADTS stream into its frames, each one unit holding an AAC-LC frame's samples at the rate its header names. The reader refuses a stream that has lost its
// framing, and a frame the source's end cuts is never sent.
async function *adtsFrames(source: AsyncIterable<Uint8Array>): AsyncGenerator<AudioUnit> {

  const reader = new AdtsReader();

  for await(const chunk of source) {

    for(const frame of reader.push(chunk)) {

      yield { data: frame, rate: readAdtsHeader(frame).sampleRate, samples: AAC_FRAME_SAMPLES };
    }
  }
}

// Split an Ogg Opus stream into its Opus packets, each one unit holding the samples its TOC byte states at the rate every Opus stream decodes at. The reader
// refuses a stream that has lost its framing or does not open with OpusHead, the duration a packet that is not one, and a packet the source's end cuts is never
// sent.
async function *oggOpusPackets(source: AsyncIterable<Uint8Array>): AsyncGenerator<AudioUnit> {

  const reader = new OggOpusReader();

  for await(const chunk of source) {

    for(const packet of reader.push(chunk)) {

      yield { data: packet, rate: OPUS_DECODE_RATE, samples: opusPacketDuration(packet) };
    }
  }
}

/* Yield each unit once the audio before it has played, so a source that runs ahead of real time - a file, or ffmpeg converting faster than it plays - reaches the
 * camera at the pace it plays at, which is the pace the session takes from its source. The timeline is the integer count of samples yielded since its anchor, read
 * against the clock's monotonic reading, so it never drifts the way a sum of per-unit waits would, and each wait is one clock delay under the command's signal,
 * which a Ctrl-C ends. A unit that arrives after its time re-anchors the timeline at its arrival rather than catching up, so a source that stalls resumes at the
 * pace it plays at instead of bursting the audio it owes, and a unit at another rate starts a timeline of its own, because a count of samples at one rate is no
 * time at another.
 */
async function *paced(units: AsyncIterable<AudioUnit>, { clock, signal }: { clock: Clock; signal: AbortSignal }): AsyncGenerator<Buffer> {

  let anchor = clock.monotonic();
  let rate = 0;
  let samples = 0;

  for await(const unit of units) {

    if(unit.rate !== rate) {

      anchor = clock.monotonic();
      rate = unit.rate;
      samples = 0;
    }

    const wait = anchor + ((samples * 1000) / rate) - clock.monotonic();

    if(wait > 0) {

      await clock.delay(wait, { signal });
    } else if(wait < 0) {

      anchor = clock.monotonic();
      samples = 0;
    }

    yield unit.data;

    samples += unit.samples;
  }
}

/**
 * `ufp camera talkback`. Opens a {@link TalkbackSession} to the camera's speaker and drains an audio source - stdin by default, or a file via `--file` - into it, then
 * reports the byte count. The source is a Node `Readable`, which is already an `AsyncIterable<Buffer>`; the command splits it into its ADTS frames, or with
 * `--audio opus` into the Opus packets of its Ogg stream, and sends each as one chunk once the audio before it has played, because the session takes its pacing
 * from its source, tallying each unit's bytes as it goes. It is the send-direction validation vehicle, the dual of `watch livestream`.
 *
 * @category CLI
 */
const cameraTalkbackHandler: CommandHandler = async (ctx) => {

  const { positionals, values } = parseArgs({ allowPositionals: true, args: ctx.args, options: { ...COMMON_OPTIONS, audio: { type: "string" }, file: { type: "string" } },
    strict: true });

  if(values.help === true) {

    ctx.output.line(USAGE);

    return;
  }

  const [target] = positionals;

  if(target === undefined) {

    throw new CliError("Specify a camera by id or name. Run \"ufp camera talkback --help\".", { exitCode: 2 });
  }

  const audio = (values.audio !== undefined) ? parseChoice(values.audio, "--audio", AUDIO_CODECS) : "aac";

  // Without --file the audio must arrive on stdin; refuse an interactive terminal, where there is nothing to read and the command would simply hang.
  if((values.file === undefined) && process.stdin.isTTY) {

    throw new CliError("No audio on stdin. Pipe audio in (e.g. ffmpeg ... | ufp camera talkback <camera>) or use --file <path>.", { exitCode: 2 });
  }

  const source = (values.file !== undefined) ? createReadStream(values.file) : process.stdin;

  await using client = await ctx.openClient({ debug: values.debug === true, refreshIntervalMs: false, signal: ctx.signal });

  const camera = findCamera(client, target);

  // Open the channel atomically (ready or throws), guarded by the camera's hasSpeaker capability. The session is an AsyncDisposable, so `await using` closes it - and
  // destroys its socket - whether the drain completes or throws.
  await using session = await camera.talkback({ audio, signal: ctx.signal });

  // Tally the bytes streamed as each frame or packet passes through, so the closing summary is accurate without buffering the source.
  let bytes = 0;
  const metered = async function *(): AsyncGenerator<Uint8Array> {

    const units = (audio === "opus") ? oggOpusPackets(source) : adtsFrames(source);

    for await(const chunk of paced(units, { clock: ctx.clock, signal: ctx.signal })) {

      bytes += chunk.length;

      yield chunk;
    }
  };

  try {

    await session.send(metered(), { signal: ctx.signal });
  } catch(error) {

    // A Ctrl-C (or any other abort of the caller's signal) tears the session down under the drain; treat that as a clean stop rather than an error, the same way the
    // streaming read commands end quietly on the caller's own abort. Any other failure propagates to the entry point's typed-error rendering.
    if(ctx.signal.aborted) {

      ctx.output.line("Talkback interrupted after " + formatBytes(bytes) + ".");

      return;
    }

    throw error;
  }

  ctx.output.line("Streamed " + formatBytes(bytes) + " of talkback audio to " + camera.name + ".");
};

// The command descriptor: the handler above plus the one-line summary the usage screen lists it by, so the listing derives from the same object that dispatches.
export const cameraTalkback: CommandSpec = {

  run: cameraTalkbackHandler,
  summary: "Stream two-way audio to a camera's speaker."
};
