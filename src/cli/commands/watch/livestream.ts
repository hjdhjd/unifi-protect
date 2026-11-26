/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * livestream.ts: `ufp watch livestream <camera>` - subscribe to a camera's livestream. Emits raw fMP4 bytes for ffmpeg/ffprobe, a per-segment summary / NDJSON,
 * or the stream's frames as lines / NDJSON.
 */
import { COMMON_OPTIONS, CliError, boundedSignal, parseChoice, parseDuration, parseNonNegativeInt, parsePositiveInt, take } from "../../shared.ts";
import type { CommandHandler, CommandSpec } from "../../shared.ts";
import type { LivestreamAudioCodec, LivestreamFrame, LivestreamOptions, LivestreamOutput, LivestreamRoute, LivestreamSource, LivestreamSubscription,
  Segment } from "../../../index.ts";
import { Output, formatBytes, formatTracks, nowStamp } from "../../output/format.ts";
import { renderDiagnostic, subscribeDiagnostics } from "../../diagnostics-feed.ts";
import { channels } from "../../../index.ts";
import { createWriteStream } from "node:fs";
import { findCamera } from "../../lookup.ts";
import { once } from "node:events";
import { parseArgs } from "node:util";

const USAGE = [

  "Usage: ufp watch livestream <camera> [--channel N] [--lens N] [--route <route>] [--audio <codec>] [--upstream ubv] [--output <output>] [--out <path|->]",
  "       [--json] [--diagnostics] [--count N] [--duration <dur>] [--timestamps] [--debug]",
  "",
  "Subscribe to a camera's livestream, as fMP4 segments or as its frames, until Ctrl-C (or a --count / --duration bound).",
  "",
  "Output:",
  "  (default, TTY)    A color-coded per-segment summary.",
  "  --out <path>      Write the concatenated fMP4 to a file (then: ffprobe <path>).",
  "  --out -           Write the fMP4 to stdout (auto-selected when stdout is piped): ufp watch livestream <cam> --out - | ffmpeg -i - ...",
  "  --json            NDJSON per-segment metadata (size, codec, queue depth) to stdout.",
  "  --output frames   One line per frame (time, kind, codec, size, timestamp, and key on a keyframe) to stdout, to a terminal and to a pipe",
  "                    alike, or with --json one JSON object per frame. Frames carry no container, so --out is refused.",
  "",
  "Observability:",
  "  --diagnostics   Print the livestream diagnostics channels (session, subscription, stall, recovery, codec) live to stderr",
  "                  alongside the stream, so resilient reconnects and codec changes are observable. Honors --json for the line",
  "                  format. Always stderr, so stdout stays byte-clean for --out - / --json.",
  "",
  "Stream options:",
  "  --channel N        The camera channel to stream (default 0).",
  "  --lens N           The lens index for multi-lens cameras (default 0).",
  "  --route <route>    How the stream reaches the controller: proxied (default) through the UniFi OS proxy, direct to the",
  "                     controller's media server (its certificate is never verified), or preferDirect, direct with the",
  "                     proxied route as the fallback.",
  "  --audio <codec>    The audio codec the stream carries: aac (default) or opus. Opus reads the camera's UBV record stream,",
  "                     which the library writes as fMP4 itself, on every route.",
  "  --upstream ubv     Read the camera's UBV record stream even for AAC. Left out, the library chooses: Protect's own fMP4",
  "                     for AAC segments, and UBV for Opus or frames.",
  "  --output <output>  What the stream yields: segments (default), its fMP4 init and media segments, or frames, each video",
  "                     and audio frame as the camera sent it, read from the UBV record stream.",
  "  --timestamps       Request Protect's own fMP4 per-frame decode timestamps (adds extendedVideoMetadata to the negotiation).",
  "                     A UBV stream does not carry them.",
  "  --segment-length N The fMP4 segment length in milliseconds (default and floor 100).",
  "  --chunk-size N     The WebSocket frame payload size in bytes (default 4096).",
  "",
  "Bounds (stop on whichever fires first; Ctrl-C always works):",
  "  --count N          Stop after N items: segments, or frames with --output frames.",
  "  --duration <dur>   Stop after a duration: 30s, 5m, 1h.",
  "  --debug            Emit the library's debug logging to stderr.",
  "  -h, --help         Show this help.",
  "",
  "Examples:",
  "  ufp watch livestream \"Front Door\" --out - | ffmpeg -i - -c copy out.mp4",
  "  ufp watch livestream \"Front Door\" --out clip.mp4 --duration 30s   # a 30-second capture",
  "  ufp watch livestream \"Front Door\" --json --diagnostics            # per-segment metadata + recovery events",
  "  ufp watch livestream \"Front Door\" --audio opus --out clip.mp4     # fMP4 with Opus audio",
  "  ufp watch livestream \"Front Door\" --output frames --count 100     # the first 100 frames"
].join("\n");

const OPTIONS = {

  ...COMMON_OPTIONS,
  audio: { type: "string" },
  channel: { type: "string" },
  "chunk-size": { type: "string" },
  count: { type: "string" },
  diagnostics: { type: "boolean" },
  duration: { type: "string" },
  json: { type: "boolean" },
  lens: { type: "string" },
  out: { type: "string" },
  output: { type: "string" },
  route: { type: "string" },
  "segment-length": { type: "string" },
  timestamps: { type: "boolean" },
  upstream: { type: "string" }
} as const;

// Whether a choice list names every member of the library union it is held against: a member the list leaves out makes the type `never`, which fails the list's
// assertion below, an assignment of `true`. The union is wrapped in a tuple so it is compared whole rather than member by member.
type ListsEvery<Union, List extends readonly unknown[]> = [Union] extends [List[number]] ? true : never;

// The choices of each flag that picks a library value: --route every livestream route, --audio every audio codec, --upstream every upstream a consumer may name, and
// --output every output. The `satisfies` on each literal refuses a choice the library lacks, and the list's assertion refuses a value the list leaves out, so no
// flag can fall behind the library's union.
const ROUTES = [ "direct", "preferDirect", "proxied" ] as const satisfies readonly LivestreamRoute[];
const AUDIO_CODECS = [ "aac", "opus" ] as const satisfies readonly LivestreamAudioCodec[];
const UPSTREAMS = ["ubv"] as const satisfies readonly NonNullable<LivestreamOptions["upstream"]>[];
const OUTPUTS = [ "frames", "segments" ] as const satisfies readonly LivestreamOutput[];

const _routesComplete: ListsEvery<LivestreamRoute, typeof ROUTES> = true;
const _audioCodecsComplete: ListsEvery<LivestreamAudioCodec, typeof AUDIO_CODECS> = true;
const _upstreamsComplete: ListsEvery<NonNullable<LivestreamOptions["upstream"]>, typeof UPSTREAMS> = true;
const _outputsComplete: ListsEvery<LivestreamOutput, typeof OUTPUTS> = true;

// The livestream pool's diagnostics channels - the subset whose name begins with the livestream subsystem prefix. Selecting by prefix rather than listing each channel
// means a channel added to the subsystem later is picked up automatically, the same single-source discipline the `channels` registry exists to enforce.
const LIVESTREAM_DIAGNOSTIC_PREFIX = "unifi-protect:livestream:";

// The structured per-segment record for --json. A curated subset (byte size, the delivered and queue-depth counters, and the init's codec label and description or
// the media's timestamps) rather than the raw bytes, so the metadata stream is analyzable with jq while the byte stream stays on its own sink.
function segmentMeta(segment: Segment, sub: LivestreamSubscription): unknown {

  const stats = sub.stats;

  if(segment.type === "init") {

    return { bytes: segment.data.length, codec: segment.codec, delivered: stats.delivered, description: segment.description, queueDepth: stats.queueDepth,
      type: "init" };
  }

  return { bytes: segment.data.length, delivered: stats.delivered, queueDepth: stats.queueDepth, timestamps: segment.timestamps ?? null, type: "media" };
}

// One pretty summary line for a segment: time, type, size, and either the codec label and the tracks the init describes (init) or the frame-timestamp count and the
// subscriber's queue depth (media). The queue depth is the operator's own backpressure signal - a steadily growing value means this consumer is falling behind the
// stream.
function summaryLine(output: Output, segment: Segment, sub: LivestreamSubscription): string {

  const colors = output.colors;
  const stamp = colors.dim(nowStamp());

  if(segment.type === "init") {

    const tracks = formatTracks(segment.description);

    return stamp + "  " + colors.green("init") + "   " + formatBytes(segment.data.length) + "  " + colors.cyan(segment.codec) + ((tracks !== "") ? ("  " + tracks) : "");
  }

  const timestamps = (segment.timestamps !== undefined) ? "  ts=" + segment.timestamps.length.toString() : "";

  return stamp + "  " + "media" + "  " + formatBytes(segment.data.length) + timestamps + "  " +
    colors.dim("q=" + sub.stats.queueDepth.toString() + " peak=" + sub.stats.peakQueueDepth.toString());
}

// The structured per-frame record for --output frames --json: the payload's size in place of its bytes, the frame's kind and codec, its timestamp with the rate its
// ticks count at, whether a video frame is a keyframe, and the discontinuity marker the pool sets on the first frame after a gap.
function frameMeta(frame: LivestreamFrame): unknown {

  return { bytes: frame.data.length, codec: frame.codec, ...((frame.discontinuity === true) && { discontinuity: true }),
    ...((frame.kind === "video") && { keyframe: frame.keyframe }), kind: frame.kind, rate: frame.rate, timestamp: frame.timestamp };
}

// One summary line for a frame: time, kind, codec, size and timestamp, and `key` on a keyframe.
function frameLine(output: Output, frame: LivestreamFrame): string {

  const colors = output.colors;
  const key = ((frame.kind === "video") && frame.keyframe) ? "  " + colors.green("key") : "";

  return colors.dim(nowStamp()) + "  " + frame.kind + "  " + colors.cyan(frame.codec) + "  " + formatBytes(frame.data.length) + "  ts=" +
    frame.timestamp.toString() + key;
}

/**
 * `ufp watch livestream`. Subscribes to the camera's stream and routes each segment to the chosen sink: a file (`--out <path>`), stdout (`--out -`, or automatically when
 * stdout is piped) for `| ffmpeg`/`| ffprobe`, NDJSON metadata (`--json`), or a TTY summary. When bytes go to stdout, every human-readable line is diverted to stderr so
 * the byte stream stays pristine. Under `--output frames` it subscribes to the stream's frames instead and prints a line, or an NDJSON object under `--json`, for each
 * to stdout, to a terminal and to a pipe alike, since frames carry no container a byte sink could take.
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
  const route = (values.route !== undefined) ? parseChoice(values.route, "--route", ROUTES) : undefined;
  const audio = (values.audio !== undefined) ? parseChoice(values.audio, "--audio", AUDIO_CODECS) : undefined;
  const upstream = (values.upstream !== undefined) ? parseChoice(values.upstream, "--upstream", UPSTREAMS) : undefined;
  const output = (values.output !== undefined) ? parseChoice(values.output, "--output", OUTPUTS) : undefined;
  const segmentLength = (values["segment-length"] !== undefined) ? parsePositiveInt(values["segment-length"], "--segment-length") : undefined;
  const chunkSize = (values["chunk-size"] !== undefined) ? parsePositiveInt(values["chunk-size"], "--chunk-size") : undefined;
  const limit = (values.count !== undefined) ? parsePositiveInt(values.count, "--count") : undefined;
  const durationMs = (values.duration !== undefined) ? parseDuration(values.duration, "--duration") : undefined;

  // Frames carry no container, so there are no bytes for --out to write: the request is refused before the client opens rather than quietly ignoring the sink.
  if((output === "frames") && (values.out !== undefined)) {

    throw new CliError("The --out option writes fMP4 bytes, which --output frames does not produce.", { exitCode: 2 });
  }

  // Resolve the output sink. A file path takes precedence; otherwise bytes go to stdout when explicitly requested (`-`) or when stdout is piped and no other mode was
  // chosen; otherwise NDJSON if asked; otherwise the TTY summary. Only the stdout-bytes mode needs human output diverted to stderr. A frames run reads none of these,
  // since it has no bytes to sink.
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
  using diagnosticsFeed = (diagOutput === null) ? null : subscribeDiagnostics(
    Object.values(channels).filter((channel) => String(channel.name).startsWith(LIVESTREAM_DIAGNOSTIC_PREFIX)),
    (name, message) => renderDiagnostic(diagOutput, name, message, { json: values.json === true }));

  // The parsed flags select one of the mutually-exclusive sources; --lens (when set) wins as a lens source, otherwise the channel (defaulting to 0) is the source.
  // The mutual-exclusion check above guarantees at most one flag is set, so this never silently discards the other.
  const source: LivestreamSource = (lens !== undefined) ? { lens: lens, type: "lens" } : { channel: channel, type: "channel" };

  // Each flag left out leaves its option out, so the library's default applies.
  const options: LivestreamOptions = {

    // --duration bounds the stream via boundedSignal (the deadline folded into the Ctrl-C signal); the subscription disposes cleanly on whichever fires first.
    signal: boundedSignal(ctx.signal, durationMs),
    source,
    ...((audio !== undefined) && { audio }),
    ...((chunkSize !== undefined) && { chunkSize }),
    ...((route !== undefined) && { route }),
    ...((segmentLength !== undefined) && { segmentLength }),
    ...((values.timestamps === true) && { timestamps: true }),
    ...((upstream !== undefined) && { upstream })
  };

  // The output picks the library's overload, so a frames run opens the frames subscription and prints each frame, --count bounding the frames, and closes with
  // their count and bytes unless its stdout is the NDJSON itself.
  if(output === "frames") {

    await using sub = camera.livestream({ ...options, output });

    let count = 0;
    let bytes = 0;

    for await(const frame of (limit !== undefined) ? take(sub, limit) : sub) {

      count += 1;
      bytes += frame.data.length;

      if(values.json === true) {

        ctx.output.json(frameMeta(frame));
      } else {

        ctx.output.line(frameLine(ctx.output, frame));
      }
    }

    if(values.json !== true) {

      ctx.output.line(ctx.output.colors.dim("Received " + count.toString() + " frame(s), " + formatBytes(bytes) + "."));
    }

    return;
  }

  await using sub = camera.livestream({ ...options, ...((output !== undefined) && { output }) });

  const segments = (limit !== undefined) ? take(sub, limit) : sub;

  let count = 0;
  let bytes = 0;
  let codec = "";

  for await(const segment of segments) {

    count += 1;
    bytes += segment.data.length;

    if(segment.type === "init") {

      codec = segment.codec;
    }

    // The byte sinks do not wait for drain: a livestream cannot be paused upstream, so a sink slower than the stream buffers here in the process rather than stalling
    // the subscription.
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
  summary: "Subscribe to a camera's livestream (fMP4 for ffmpeg/ffprobe, a summary, or its frames)."
};
