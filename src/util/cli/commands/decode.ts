/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * decode.ts: `ufp decode <file|->` - decode and classify a captured realtime packet offline, the worked example of the static codec surface. No controller connection.
 */
import type { CommandHandler, CommandSpec } from "../shared.ts";
import { CliError } from "../shared.ts";
import { ProtectClient } from "../../../index.ts";
import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";

const USAGE = [

  "Usage: ufp decode <file|->",
  "",
  "Decode a captured realtime packet from a file (or - for stdin) and print the raw frame and its classification.",
  "Offline: no controller connection or credentials are needed - it runs the library's codec over the bytes you provide,",
  "the same decode + classify the live firehose performs, so it is the way to inspect a frame you captured elsewhere.",
  "",
  "Output: a JSON object { event, raw } where `raw` is the decoded { header, payload } and `event` is the TypedEvent the",
  "        library would emit for this frame - or null for a valid-but-unmodeled frame (which `raw` still shows in full).",
  "",
  "Options:",
  "  -h, --help  Show this help.",
  "",
  "Examples:",
  "  ufp decode capture.bin           # decode a captured frame from a file",
  "  some-source | ufp decode -       # decode frame bytes from stdin"
].join("\n");

// `decode` is connection-free, so it does not carry the usual --debug flag (there is no client to emit library logging); only --help applies.
const OPTIONS = {

  help: { short: "h", type: "boolean" }
} as const;

// Read every byte from stdin as one Buffer, using the stream's async iterator - the modern, backpressure-aware way to drain a readable. Used when the source is "-".
async function readStdin(): Promise<Buffer> {

  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {

    chunks.push(chunk as Buffer);
  }

  return Buffer.concat(chunks);
}

/**
 * `ufp decode`. Reads a captured packet's bytes from a file or stdin and prints the decoded raw frame alongside the library's classification of it. It runs entirely
 * offline through the static codec (`ProtectClient.decodePacket` then `ProtectClient.classifyPacket`) - the same two stages the live firehose applies, reached without a
 * connection - so it never opens a client. A malformed frame surfaces as the codec's typed `ProtectProtocolError`, which the entry point renders as a calm one-liner.
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

  // Read the raw bytes. A read failure (missing file, unreadable stdin) is an expected user error, so we render it as a clean CliError rather than an uncaught stack.
  let bytes: Buffer;

  try {

    bytes = (source === "-") ? await readStdin() : await readFile(source);
  } catch(error) {

    throw new CliError("Unable to read packet bytes from " + ((source === "-") ? "stdin" : ("\"" + source + "\"")) + ".", { cause: error });
  }

  // Decode then classify through the static codec - the offline twin of the rawPackets() / events() rails. Decode throws ProtectProtocolError on malformed bytes;
  // classify returns null for a valid-but-unmodeled frame, in which case `raw` is still the full decoded frame, which is the point of decoding offline.
  const raw = ProtectClient.decodePacket(bytes);
  const event = ProtectClient.classifyPacket(raw);

  ctx.output.jsonPretty({ event, raw });
};

// The command descriptor: the handler above plus the one-line summary the usage screen lists it by, so the listing derives from the same object that dispatches.
export const decode: CommandSpec = {

  run: decodeHandler,
  summary: "Decode and classify a captured packet offline, from a file or stdin."
};
