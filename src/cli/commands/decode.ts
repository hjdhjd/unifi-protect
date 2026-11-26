/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * decode.ts: `ufp decode [--replay] <file|->` - decode and classify a captured realtime packet, or replay a recording of the raw firehose, offline: the worked
 * example of the static codec surface. No controller connection.
 */
import type { CommandContext, CommandHandler, CommandSpec } from "../shared.ts";
import { CliError } from "../shared.ts";
import { ProtectClient } from "../../index.ts";
import type { RawPacket } from "../../index.ts";
import { createInterface } from "node:readline";
import { createReadStream } from "node:fs";
import { on } from "node:events";
import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";

const USAGE = [

  "Usage: ufp decode [--replay] <file|->",
  "",
  "Decode a captured realtime packet from a file (or - for stdin) and print the raw frame and its classification.",
  "Offline: no controller connection or credentials are needed - it runs the library's codec over the bytes you provide,",
  "decoding and classifying the frame on its own, so it is the way to inspect a frame you captured elsewhere.",
  "",
  "With --replay, the source is a recording of the raw firehose instead, one frame per line as \"ufp watch raw --json\"",
  "writes it. Each line is read back as it arrives, and every frame is lifted in order through one classifier, built as",
  "the live firehose's is, so a recording of one connection, taken unfiltered from its start, lifts as the live firehose",
  "lifted it: a camera-attributed event's later update that names no camera lifts with the camera from the event's add.",
  "",
  "Output: a JSON object { event, raw } where `raw` is the decoded { header, payload } and `event` is the TypedEvent the",
  "        frame lifts to on its own - or null for a valid-but-unmodeled frame (which `raw` still shows in full). A",
  "        camera-attributed event's later update that names no camera lifts only on the live firehose or a replay,",
  "        which carry the camera from the event's add. With --replay, one compact { event, raw } object per line,",
  "        one for each frame of the recording.",
  "",
  "Options:",
  "  --replay    Read the source as a recording, one frame per line, and lift every frame through one classifier.",
  "  -h, --help  Show this help.",
  "",
  "Examples:",
  "  ufp decode capture.bin                         # decode a captured frame from a file",
  "  some-source | ufp decode -                     # decode frame bytes from stdin",
  "  ufp decode --replay frames.ndjson              # replay a recording of the raw firehose",
  "  ufp watch raw --json | ufp decode --replay -   # lift the raw firehose as it arrives"
].join("\n");

// `decode` is connection-free, so it does not carry the usual --debug flag (there is no client to emit library logging); only --help and --replay apply.
const OPTIONS = {

  help: { short: "h", type: "boolean" },
  replay: { type: "boolean" }
} as const;

// Name a source the way a read failure reports it: stdin for "-", or the quoted path.
function sourceName(source: string): string {

  return (source === "-") ? "stdin" : ("\"" + source + "\"");
}

/* Read every byte from stdin as one Buffer, or nothing when the signal aborts first. Used when the source is "-". The read iterates the stream's data events to its
 * end rather than the stream's own iterator, because returning an iteration of events ends it at once, where the stream's iterator would first finish the read it
 * is waiting on; the abort returns it, so Ctrl-C ends a read whose input never ends. stdin is the process's own, so it is paused rather than destroyed, which lets
 * the process exit while a live pipe stays open, and a signal already aborted ends the read before stdin is touched.
 */
async function readStdin(signal: AbortSignal): Promise<Buffer | undefined> {

  if(signal.aborted) {

    return undefined;
  }

  const chunks: Buffer[] = [];
  const reading = on(process.stdin, "data", { close: ["end"] });
  const stop = (): void => void reading.return?.();

  signal.addEventListener("abort", stop);

  try {

    for await(const [chunk] of reading) {

      chunks.push(chunk as Buffer);
    }
  } finally {

    signal.removeEventListener("abort", stop);
    process.stdin.pause();
  }

  // The iteration ends with the input's end or with the abort's return, so an input that has not ended is a read the abort cut short.
  return process.stdin.readableEnded ? Buffer.concat(chunks) : undefined;
}

/* Yield a recording's lines as they arrive, each with its line number in the source, so a refusal names the line an editor shows. A read failure (a missing file,
 * unreadable stdin) is an expected user error, so it surfaces as a CliError, as the single-packet mode's does. readline sets its input flowing and keeps it so
 * until the interface closes, so the interface is closed whenever the reading ends, early on a refusal included. Closing it pauses stdin, which is the process's
 * own and stays open, so a live pipe lets the process exit once the replay ends; a file's stream is destroyed besides. On stdin the signal's abort closes the
 * interface as well, which ends the reading quietly once the lines already read are yielded, so Ctrl-C ends a replay whose input never ends; a file is read to its
 * end. An interface closed before its reading begins leaves that reading waiting for good, so a signal already aborted ends a stdin reading before any is made.
 */
async function *recordingLines(source: string, signal: AbortSignal): AsyncGenerator<{ line: string; lineNumber: number }> {

  if((source === "-") && signal.aborted) {

    return;
  }

  const file = (source === "-") ? undefined : createReadStream(source);
  const lines = createInterface({ crlfDelay: Infinity, input: file ?? process.stdin });
  const close = (): void => lines.close();
  let lineNumber = 0;

  if(file === undefined) {

    signal.addEventListener("abort", close);
  }

  try {

    for await(const line of lines) {

      lineNumber++;

      yield { line, lineNumber };
    }
  } catch(error) {

    throw new CliError("Unable to read the recording from " + sourceName(source) + ".", { cause: error });
  } finally {

    signal.removeEventListener("abort", close);
    lines.close();
    file?.destroy();
  }
}

// Read one recorded line back through the codec. The codec's refusal is the cause, and the line number is what lets the operator find the line it refused.
function readRecordedPacket(line: string, lineNumber: number): RawPacket {

  try {

    return ProtectClient.parsePacket(line);
  } catch(error) {

    throw new CliError("Line " + String(lineNumber) + " of the recording is not a recorded packet.", { cause: error });
  }
}

// Replay a recording through one classifier, built as the live firehose's is, so in a recording of one connection, taken unfiltered from its start, an open event's
// camera and start reach its later frames here as they did live. A blank line holds no frame, so it is skipped.
async function replayRecording(ctx: CommandContext, source: string): Promise<void> {

  const classifier = ProtectClient.createClassifier();

  for await(const { line, lineNumber } of recordingLines(source, ctx.signal)) {

    if(line.trim().length === 0) {

      continue;
    }

    const raw = readRecordedPacket(line, lineNumber);

    ctx.output.json({ event: classifier.classify(raw), raw });
  }
}

/**
 * `ufp decode`. Reads a captured packet's bytes from a file or stdin and prints the decoded raw frame alongside the library's classification of it. It runs entirely
 * offline through the static codec (`ProtectClient.decodePacket` then `ProtectClient.classifyPacket`) - the single-packet decode and lift the live firehose is built
 * on, reached without a connection - so it never opens a client. A frame is read on its own here, so a camera-attributed event's later update that names neither
 * the event's camera nor its start classifies as null, where the live firehose carries the camera and start from the add that opened the event. A malformed frame
 * surfaces as the codec's typed `ProtectProtocolError`, which the entry point renders as a calm one-liner.
 *
 * With `--replay` the source is a recording of the raw firehose, the frames `ufp watch raw --json` writes, one a line. Each line is read back through
 * `ProtectClient.parsePacket` and every frame is lifted, in order, through one classifier from `ProtectClient.createClassifier`, built as the live firehose's is,
 * so in a recording of one connection, taken unfiltered from its start, such an update lifts as it did live; each frame prints as one compact `{ event, raw }`
 * line. A line the codec refuses surfaces as a `CliError` naming the line, the codec's refusal its cause. The command holds no rule of its own about what a frame is.
 *
 * Reading stdin, each mode ends quietly when the command's signal aborts, so Ctrl-C ends a read whose input never ends: the replay keeps what it printed, and the
 * single-packet mode prints nothing. A file is read to its end.
 *
 * @category CLI
 */
const decodeHandler: CommandHandler = async (ctx) => {

  const { positionals, values } = parseArgs({ allowPositionals: true, args: ctx.args, options: OPTIONS, strict: true });

  if(values.help === true) {

    ctx.output.line(USAGE);

    return;
  }

  const [source] = positionals;

  if(source === undefined) {

    throw new CliError("Specify a file path, or - for stdin. Run \"ufp decode --help\".", { exitCode: 2 });
  }

  if(values.replay === true) {

    await replayRecording(ctx, source);

    return;
  }

  // Read the raw bytes. A read failure (missing file, unreadable stdin) is an expected user error, so we render it as a clean CliError rather than an uncaught stack.
  let bytes: Buffer | undefined;

  try {

    bytes = (source === "-") ? await readStdin(ctx.signal) : await readFile(source);
  } catch(error) {

    throw new CliError("Unable to read packet bytes from " + sourceName(source) + ".", { cause: error });
  }

  // An abort leaves a read of stdin with no frame to decode, so the command ends quietly, as a watch does on Ctrl-C.
  if(bytes === undefined) {

    return;
  }

  // Without --replay the source is one frame's bytes, decoded then classified through the static codec on its own: the rawPackets() rail's decode, and the events()
  // rail's lift without the camera and start the live rail carries to an open event's later frames. Decode throws ProtectProtocolError on malformed bytes; classify
  // returns null for a valid-but-unmodeled frame, in which case `raw` is still the full decoded frame, which is the point of decoding offline.
  const raw = ProtectClient.decodePacket(bytes);
  const event = ProtectClient.classifyPacket(raw);

  ctx.output.jsonPretty({ event, raw });
};

// The command descriptor: the handler above plus the one-line summary the usage screen lists it by, so the listing derives from the same object that dispatches.
export const decode: CommandSpec = {

  run: decodeHandler,
  summary: "Decode and classify a captured packet, or replay a recording of the raw firehose, offline from a file or stdin."
};
