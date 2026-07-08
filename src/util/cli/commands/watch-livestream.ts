/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * watch-livestream.ts: `ufp watch livestream <camera>` - subscribe to a camera's fMP4 stream. Emits raw bytes for ffmpeg/ffprobe, or a per-segment summary / NDJSON.
 */
import { COMMON_OPTIONS, CliError, boundedSignal, parseDuration, parseNonNegativeInt, parsePositiveInt, take } from "../shared.ts";
import type { CommandHandler, CommandSpec } from "../shared.ts";
import type { LivestreamSource, LivestreamSubscription, Segment } from "../../../index.ts";
import { Output, formatBytes, nowStamp } from "../output/format.ts";
import { renderDiagnostic, subscribeDiagnostics } from "../diagnostics-feed.ts";
import { channels } from "../../../index.ts";
import { createWriteStream } from "node:fs";
import { findCamera } from "../lookup.ts";
import { once } from "node:events";
import { parseArgs } from "node:util";

const USAGE = [

  "Usage: ufp watch livestream <camera> [--channel N] [--lens N] [--out <path|->] [--json] [--diagnostics] [--count N] [--duration <dur>] [--timestamps] [--debug]",
  "",
  "Subscribe to a camera's live fMP4 stream until Ctrl-C (or a --count / --duration bound).",
  "",
  "Output:",
  "  (default, TTY)  A color-coded per-segment summary.",
  "  --out <path>    Write the concatenated fMP4 to a file (then: ffprobe <path>).",
  "  --out -         Write the fMP4 to stdout (auto-selected when stdout is piped): ufp watch livestream <cam> --out - | ffmpeg -i - ...",
  "  --json          NDJSON per-segment metadata (size, codec, queue depth) to stdout.",
  "",
  "Observability:",
  "  --diagnostics   Print the livestream diagnostics channels (session, subscription, stall, recovery, codec) live to stderr",
  "                  alongside the stream, so resilient reconnects and codec changes are observable. Honors --json for the line",
  "                  format. Always stderr, so stdout stays byte-clean for --out - / --json.",
  "",
  "Stream options:",
  "  --channel N        The camera channel to stream (default 0).",
  "  --lens N           The lens index for multi-lens cameras (default 0).",
  "  --timestamps       Request per-frame decode timestamps (adds extendedVideoMetadata to the negotiation).",
  "  --segment-length N The fMP4 segment length in milliseconds (default and floor 100).",
  "  --chunk-size N     The WebSocket frame payload size in bytes (default 4096).",
  "",
  "Bounds (stop on whichever fires first; Ctrl-C always works):",
  "  --count N          Stop after N segments.",
  "  --duration <dur>   Stop after a duration: 30s, 5m, 1h.",
  "  --debug            Emit the library's debug logging to stderr.",
  "  -h, --help         Show this help.",
  "",
  "Examples:",
  "  ufp watch livestream \"Front Door\" --out - | ffmpeg -i - -c copy out.mp4",
  "  ufp watch livestream \"Front Door\" --out clip.mp4 --duration 30s   # a 30-second capture",
  "  ufp watch livestream \"Front Door\" --json --diagnostics            # per-segment metadata + recovery events"
].join("\n");

const OPTIONS = {

  ...COMMON_OPTIONS,
  channel: { type: "string" },
  "chunk-size": { type: "string" },
  count: { type: "string" },
  diagnostics: { type: "boolean" },
  duration: { type: "string" },
  json: { type: "boolean" },
  lens: { type: "string" },
  out: { type: "string" },
  "segment-length": { type: "string" },
  timestamps: { type: "boolean" }
} as const;

// The livestream pool's diagnostics channels - the subset whose name begins with the livestream subsystem prefix. Selecting by prefix rather than listing each channel
// means a channel added to the subsystem later is picked up automatically, the same single-source discipline the `channels` registry exists to enforce.
const LIVESTREAM_DIAGNOSTIC_PREFIX = "unifi-protect:livestream:";

// The structured per-segment record for --json. A curated subset (byte size, the delivered and queue-depth counters, and the codec or media timestamps) rather than the
// raw bytes, so the metadata stream is analyzable with jq while the byte stream stays on its own sink.
function segmentMeta(segment: Segment, sub: LivestreamSubscription): unknown {

  const stats = sub.stats;

  if(segment.type === "init") {

    return { bytes: segment.data.length, codec: segment.codec, delivered: stats.delivered, queueDepth: stats.queueDepth, type: "init" };
  }

  return { bytes: segment.data.length, delivered: stats.delivered, queueDepth: stats.queueDepth, timestamps: segment.timestamps ?? null, type: "media" };
}

// One pretty summary line for a segment: time, type, size, and either the codec (init) or the frame-timestamp count and the subscriber's queue depth (media). The queue
// depth is the operator's own backpressure signal - a steadily growing value means this consumer is falling behind the stream.
function summaryLine(output: Output, segment: Segment, sub: LivestreamSubscription): string {

  const colors = output.colors;
  const stamp = colors.dim(nowStamp());

  if(segment.type === "init") {

    return stamp + "  " + colors.green("init") + "   " + formatBytes(segment.data.length) + "  " + colors.cyan(segment.codec);
  }

  const timestamps = (segment.timestamps !== undefined) ? "  ts=" + segment.timestamps.length.toString() : "";

  return stamp + "  " + "media" + "  " + formatBytes(segment.data.length) + timestamps + "  " +
    colors.dim("q=" + sub.stats.queueDepth.toString() + " peak=" + sub.stats.peakQueueDepth.toString());
}

/**
 * `ufp watch livestream`. Subscribes to the camera's stream and routes each segment to the chosen sink: a file (`--out <path>`), stdout (`--out -`, or automatically when
 * stdout is piped) for `| ffmpeg`/`| ffprobe`, NDJSON metadata (`--json`), or a TTY summary. When bytes go to stdout, every human-readable line is diverted to stderr so
 * the byte stream stays pristine. Running two invocations against the same camera proves the pool's fan-out: both receive byte-identical segment streams.
 *
 * @category CLI
 */
const watchLivestreamHandler: CommandHandler = async (ctx) => {

  const { positionals, values } = parseArgs({ allowPositionals: true, args: ctx.args, options: OPTIONS, strict: true });

  if(values.help === true) {

    ctx.output.line(USAGE);

    return;
  }

  const [target] = positionals;

  if(target === undefined) {

    throw new CliError("Specify a camera by id or name. Run \"ufp watch livestream --help\".", { exitCode: 2 });
  }

  // --channel and --lens select mutually-exclusive livestream sources (a secondary lens is always addressed on channel 0), so reject a request that sets both rather than
  // silently dropping one.
  if((values.channel !== undefined) && (values.lens !== undefined)) {

    throw new CliError("The --channel and --lens options are mutually exclusive; specify only one.", { exitCode: 2 });
  }

  const channel = (values.channel !== undefined) ? parseNonNegativeInt(values.channel, "--channel") : 0;
  const lens = (values.lens !== undefined) ? parseNonNegativeInt(values.lens, "--lens") : undefined;
  const segmentLength = (values["segment-length"] !== undefined) ? parsePositiveInt(values["segment-length"], "--segment-length") : undefined;
  const chunkSize = (values["chunk-size"] !== undefined) ? parsePositiveInt(values["chunk-size"], "--chunk-size") : undefined;
  const limit = (values.count !== undefined) ? parsePositiveInt(values.count, "--count") : undefined;
  const durationMs = (values.duration !== undefined) ? parseDuration(values.duration, "--duration") : undefined;

  // Resolve the output sink. A file path takes precedence; otherwise bytes go to stdout when explicitly requested (`-`) or when stdout is piped and no other mode was
  // chosen; otherwise NDJSON if asked; otherwise the TTY summary. Only the stdout-bytes mode needs human output diverted to stderr.
  const out = values.out;
  const filePath = ((out !== undefined) && (out !== "-")) ? out : null;
  const toStdoutBytes = (filePath === null) && ((out === "-") || ((out === undefined) && (!process.stdout.isTTY) && (values.json !== true)));
  const toJson = (filePath === null) && !toStdoutBytes && (values.json === true);

  await using client = await ctx.openClient({ debug: values.debug === true, signal: ctx.signal });

  const camera = findCamera(client, target);
  const human = toStdoutBytes ? new Output({ env: ctx.env, stream: process.stderr }) : ctx.output;
  const fileStream = (filePath !== null) ? createWriteStream(filePath) : null;

  // The opt-in in-process diagnostics feed. It subscribes to the livestream channels and renders each event to a dedicated stderr Output (never stdout, which carries the
  // byte/NDJSON stream), honoring --json for the line format. It is the only way to observe recovery / codec events alongside the stream from one process - `ufp
  // diagnostics` runs a separate client with a separate pool and would never see this stream's events. A const Output keeps it narrowed to non-null inside the closure.
  const diagOutput = (values.diagnostics === true) ? new Output({ env: ctx.env, stream: process.stderr }) : null;

  // Subscribe before `camera.livestream()` below (so the session:opened published during subscribe is captured), and declared here so disposal order is subscription
  // first, then this feed, then the client - the feed stays attached through the subscription's teardown to capture the closing session:closed / subscription:disposed.
  using _diagFeed = (diagOutput === null) ? null : subscribeDiagnostics(
    Object.values(channels).filter((channel) => String(channel.name).startsWith(LIVESTREAM_DIAGNOSTIC_PREFIX)),
    (name, message) => renderDiagnostic(diagOutput, name, message, { json: values.json === true }));

  // The parsed flags select one of the two mutually-exclusive sources; --lens (when set) wins as a lens source, otherwise the channel (defaulting to 0) is the source.
  // The mutual-exclusion check above guarantees at most one flag is set, so this never silently discards the other.
  const source: LivestreamSource = (lens !== undefined) ? { lens: lens, type: "lens" } : { channel: channel, type: "channel" };

  await using sub = camera.livestream({

    // --duration bounds the stream via boundedSignal (the deadline folded into the Ctrl-C signal); the subscription disposes cleanly on whichever fires first.
    signal: boundedSignal(ctx.signal, durationMs),
    source,
    ...((chunkSize !== undefined) && { chunkSize }),
    ...((segmentLength !== undefined) && { segmentLength }),
    ...((values.timestamps === true) && { timestamps: true })
  });

  const segments = (limit !== undefined) ? take(sub, limit) : sub;

  let count = 0;
  let bytes = 0;
  let codec = "";

  for await (const segment of segments) {

    count += 1;
    bytes += segment.data.length;

    if(segment.type === "init") {

      codec = segment.codec;
    }

    if(fileStream !== null) {

      fileStream.write(segment.data);
    } else if(toStdoutBytes) {

      process.stdout.write(segment.data);
    } else if(toJson) {

      ctx.output.json(segmentMeta(segment, sub));
    } else {

      human.line(summaryLine(human, segment, sub));
    }
  }

  // Flush the file before we report, so the summary is true once it prints.
  if(fileStream !== null) {

    fileStream.end();

    await once(fileStream, "finish");
  }

  // A closing summary for every mode except the NDJSON stream (whose stdout is the metadata itself).
  if(!toJson) {

    human.line(human.colors.dim("Received " + count.toString() + " segment(s), " + formatBytes(bytes) + ((codec !== "") ? (", codec " + codec) : "") + "."));
  }
};

// The command descriptor: the handler above plus the one-line summary the usage screen lists it by, so the listing derives from the same object that dispatches.
export const watchLivestream: CommandSpec = {

  run: watchLivestreamHandler,
  summary: "Subscribe to a camera's fMP4 stream (for ffmpeg/ffprobe, or a summary)."
};
