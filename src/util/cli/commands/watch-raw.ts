/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * watch-raw.ts: `ufp watch raw` - the raw decoded-frame firehose. Every frame the controller emits, unmodeled ones included; the protocol-capture surface.
 */
import { COMMON_OPTIONS, boundedSignal, buildRawFilter, matchesRawPacket, parseDuration, parsePositiveInt, take } from "../shared.ts";
import type { CommandHandler, CommandSpec, RawFilter } from "../shared.ts";
import type { Output } from "../output/format.ts";
import type { RawPacket } from "../../../index.ts";
import { buildNameResolver } from "../lookup.ts";
import { parseArgs } from "node:util";

const USAGE = [

  "Usage: ufp watch raw [filters] [--json] [--count N] [--duration <dur>] [--debug]",
  "",
  "Stream the raw decoded-frame firehose until Ctrl-C (or a --count / --duration bound). Unlike \"watch events\", this carries every decoded",
  "frame - including the valid-but-unmodeled ones the classifier drops - so it is the surface for exploring and capturing the wire protocol.",
  "",
  "Filters (comma-separated lists; * and ? globs; AND across axes, OR within an axis):",
  "  --model-key <list>          Filter on the frame header's model key (camera, light, nvr, event, liveview, ...).",
  "  --action <list>             Filter on the frame header's action (add, update, remove).",
  "  --device <list>             Filter on the header id, resolved to a device name where possible (substring or glob).",
  "  --exclude-model-key <list>  Inverse of --model-key.",
  "  --exclude-action <list>     Inverse of --action (e.g. --exclude-action update to drop the steady update flood).",
  "  --exclude-device <list>     Inverse of --device.",
  "",
  "Output:",
  "  (default)   Pretty, color-coded, one frame per line: model key, action, resolved device, and a payload summary.",
  "  --json      NDJSON: one full { header, payload } object per line, no color - the capture format for jq and fixture replay.",
  "",
  "Bounds (stop on whichever fires first; Ctrl-C always works):",
  "  --count N         Stop after N frames (post-filter).",
  "  --duration <dur>  Stop after a duration: 30s, 5m, 1h.",
  "  --debug           Emit the library's debug logging to stderr.",
  "  -h, --help        Show this help.",
  "",
  "Examples:",
  "  ufp watch raw --json | jq .                     # full structure of every frame, readably",
  "  ufp watch raw --exclude-model-key camera        # surface the less-common / newer model keys",
  "  ufp watch raw --model-key liveview,group --json # inspect recognized-but-unmodeled classes"
].join("\n");

// The parseArgs option set: the two common flags, the three filter axes in both forms, the output flag, and the two stop-condition bounds.
const OPTIONS = {

  ...COMMON_OPTIONS,
  action: { type: "string" },
  count: { type: "string" },
  device: { type: "string" },
  duration: { type: "string" },
  "exclude-action": { type: "string" },
  "exclude-device": { type: "string" },
  "exclude-model-key": { type: "string" },
  json: { type: "boolean" },
  "model-key": { type: "string" }
} as const;

// Color a frame by its action, so a glance separates the lifecycle transitions (add/remove) from the dominant update flood. An unknown action falls back to gray.
function actionColor(colors: Output["colors"], action: string): (text: string) => string {

  switch(action) {

    case "add":

      return colors.green;

    case "remove":

      return colors.red;

    case "update":

      return colors.dim;

    default:

      return colors.gray;
  }
}

// A compact, human-readable summary of a frame's data payload. The common case is a JSON object of changed fields, so we list its keys; arrays and raw byte frames are
// summarized by length, and everything else - a string included - by its type name, enough to see the shape of a frame at a glance without dumping the whole payload
// (--json's job).
function payloadSummary(payload: unknown): string {

  // A JSON-null data frame is a real possibility, and `typeof null` is "object" - so we name it explicitly here rather than let it fall through to the object branch
  // (where it would be reported as a fieldless object) or the final `typeof`.
  if(payload === null) {

    return "null";
  }

  if(payload instanceof Uint8Array) {

    return "bytes=" + payload.length.toString();
  }

  if(Array.isArray(payload)) {

    return "len=" + payload.length.toString();
  }

  // Null was handled above, so an "object" here is non-null: a plain JSON object whose keys are the changed fields.
  if(typeof payload === "object") {

    const keys = Object.keys(payload);

    return "fields=" + (keys.length > 0 ? keys.join(",") : "(none)");
  }

  return typeof payload;
}

// Render one raw packet as a pretty line: a dim wall-clock receive time, the cyan modelKey, the action-colored action, the resolved device name (or the header id when it
// resolves to no device), and the payload summary.
function renderPacket(output: Output, packet: RawPacket, resolveName: (id: string) => string | undefined): void {

  const colors = output.colors;
  const { action, id, modelKey } = packet.header;
  const parts = [ colors.dim(new Date().toISOString().slice(11, 23)), colors.cyan(modelKey), actionColor(colors, action)(action),
    colors.bold(resolveName(id) ?? id), colors.dim(payloadSummary(packet.payload)) ];

  output.line(parts.join("  "));
}

// Apply the compiled filter to the raw firehose. A pure pass-through generator, so it composes cleanly with `take` (the early return propagates back through here
// and into `client.rawPackets`, unsubscribing the firehose).
async function *filterRawPackets(source: AsyncIterable<RawPacket>, filter: RawFilter, resolveName: (id: string) => string | undefined): AsyncGenerator<RawPacket> {

  for await (const packet of source) {

    if(matchesRawPacket(filter, packet, resolveName)) {

      yield packet;
    }
  }
}

/**
 * `ufp watch raw`. Connects, then iterates the raw decoded-frame firehose through the compiled filter, rendering each surviving frame as a pretty line or NDJSON.
 * `--count N` stops after N post-filter frames via the async-iterator `take`; `--duration <dur>` after a wall-clock bound (folded into the Ctrl-C signal by
 * `boundedSignal`); otherwise it runs until Ctrl-C, which ends the firehose and unwinds the `await using` client. This is the unmodeled, pre-classification view - it
 * shows the frames `watch events` drops, so it is the tool for seeing new wire shapes.
 *
 * @category CLI
 */
const watchRawHandler: CommandHandler = async (ctx) => {

  const { values } = parseArgs({ allowPositionals: true, args: ctx.args, options: OPTIONS, strict: true });

  if(values.help === true) {

    ctx.output.line(USAGE);

    return;
  }

  const limit = (values.count !== undefined) ? parsePositiveInt(values.count, "--count") : undefined;
  const durationMs = (values.duration !== undefined) ? parseDuration(values.duration, "--duration") : undefined;
  const filter = buildRawFilter({

    action: values.action,
    device: values.device,
    excludeAction: values["exclude-action"],
    excludeDevice: values["exclude-device"],
    excludeModelKey: values["exclude-model-key"],
    modelKey: values["model-key"]
  });

  await using client = await ctx.openClient({ debug: values.debug === true, signal: ctx.signal });

  // The resolver is built once from the connect-time snapshot - device names are stable in practice, and a frame for a device added mid-watch simply renders by id.
  // --duration bounds the stream (not the connect) via boundedSignal, which folds the deadline into the Ctrl-C signal; the firehose ends on whichever fires first.
  const resolveName = buildNameResolver(client);
  const source = filterRawPackets(client.rawPackets({ signal: boundedSignal(ctx.signal, durationMs) }), filter, resolveName);
  const limited = (limit !== undefined) ? take(source, limit) : source;

  for await (const packet of limited) {

    if(values.json === true) {

      ctx.output.json(packet);
    } else {

      renderPacket(ctx.output, packet, resolveName);
    }
  }
};

// The command descriptor: the handler above plus the one-line summary the usage screen lists it by, so the listing derives from the same object that dispatches.
export const watchRaw: CommandSpec = {

  run: watchRawHandler,
  summary: "Stream the raw decoded-frame firehose - every frame, unmodeled ones included; the protocol-capture surface."
};
