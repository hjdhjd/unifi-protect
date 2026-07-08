/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * camera-talkback.ts: `ufp camera talkback <camera>` - open a two-way-audio channel to a camera's speaker and feed it audio from stdin or a file.
 */
import { COMMON_OPTIONS, CliError } from "../shared.ts";
import type { CommandHandler, CommandSpec } from "../shared.ts";
import { createReadStream } from "node:fs";
import { findCamera } from "../lookup.ts";
import { formatBytes } from "../output/format.ts";
import { parseArgs } from "node:util";

const USAGE = [

  "Usage: ufp camera talkback <camera> [--file <path>] [--debug]",
  "",
  "Open a two-way-audio (talkback) channel to a camera's speaker and stream audio to it until the source ends.",
  "",
  "The audio bytes must already be in the format the camera expects (read it from the camera's talkbackSettings:",
  "typically AAC in an ADTS stream). The library neither inspects nor transcodes them - pipe through ffmpeg to convert.",
  "",
  "Input:",
  "  (default)     Read audio from stdin (pipe ffmpeg into it).",
  "  --file <path> Read audio from a file instead of stdin.",
  "  --debug       Emit the library's debug logging to stderr.",
  "  -h, --help    Show this help.",
  "",
  "Examples:",
  "  ffmpeg -i greeting.wav -ar 16000 -ac 1 -f adts - | ufp camera talkback \"Front Door\"",
  "  ufp camera talkback \"Front Door\" --file greeting.aac"
].join("\n");

/**
 * `ufp camera talkback`. Opens a {@link TalkbackSession} to the camera's speaker and drains an audio source - stdin by default, or a file via `--file` - into it, then
 * reports the byte count. The source is a Node `Readable`, which is already an `AsyncIterable<Buffer>`, so it drains cleanly through a byte-tallying wrapper into
 * `session.send`; the session's structural backpressure paces a real-time producer (an ffmpeg pipe) automatically. It is the send-direction validation vehicle, the dual
 * of `watch livestream`.
 *
 * @category CLI
 */
const cameraTalkbackHandler: CommandHandler = async (ctx) => {

  const { positionals, values } = parseArgs({ allowPositionals: true, args: ctx.args, options: { ...COMMON_OPTIONS, file: { type: "string" } }, strict: true });

  if(values.help === true) {

    ctx.output.line(USAGE);

    return;
  }

  const [target] = positionals;

  if(target === undefined) {

    throw new CliError("Specify a camera by id or name. Run \"ufp camera talkback --help\".", { exitCode: 2 });
  }

  // Without --file the audio must arrive on stdin; refuse an interactive terminal, where there is nothing to read and the command would simply hang.
  if((values.file === undefined) && process.stdin.isTTY) {

    throw new CliError("No audio on stdin. Pipe audio in (e.g. ffmpeg ... | ufp camera talkback <camera>) or use --file <path>.", { exitCode: 2 });
  }

  const source = (values.file !== undefined) ? createReadStream(values.file) : process.stdin;

  await using client = await ctx.openClient({ debug: values.debug === true, refreshIntervalMs: false, signal: ctx.signal });

  const camera = findCamera(client, target);

  // Open the channel atomically (ready or throws), guarded by the camera's hasSpeaker capability. The session is an AsyncDisposable, so `await using` closes it - and
  // destroys its socket - whether the drain completes or throws.
  await using session = await camera.talkback({ signal: ctx.signal });

  // Tally the bytes streamed as they pass through, so the closing summary is accurate without buffering the source.
  let bytes = 0;
  const metered = async function *(): AsyncGenerator<Uint8Array> {

    for await (const chunk of source) {

      bytes += (chunk as Uint8Array).length;

      yield chunk as Uint8Array;
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
