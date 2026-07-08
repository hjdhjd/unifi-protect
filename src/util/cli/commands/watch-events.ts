/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * watch-events.ts: `ufp watch events` - the realtime event firehose with a rich filter surface. The primary tool for probing and capturing the Protect wire protocol.
 */
import { COMMON_OPTIONS, boundedSignal, buildEventFilter, matchesEvent, parseDuration, parsePositiveInt, take } from "../shared.ts";
import type { CommandHandler, CommandSpec, EventFilter } from "../shared.ts";
import type { Output } from "../output/format.ts";
import { ProtectClient } from "../../../index.ts";
import type { TypedEvent } from "../../../index.ts";
import { buildNameResolver } from "../lookup.ts";
import { parseArgs } from "node:util";

const USAGE = [

  "Usage: ufp watch events [filters] [--json] [--count N] [--duration <dur>] [--debug]",
  "",
  "Stream realtime events from the controller until Ctrl-C (or a --count / --duration bound).",
  "",
  "Filters (comma-separated lists; * and ? globs; AND across axes, OR within an axis):",
  "  --kind <list>               Filter on the event kind (motionDetected, smartDetect, devicePatched, ...).",
  "  --model-key <list>          Filter on the device-transition model key (camera, light, sensor, chime, viewer, nvr, user).",
  "  --device <list>             Filter on the resolved device name or id (substring or glob).",
  "  --object <list>             Filter on smartDetect object types (person, vehicle, ...).",
  "  --exclude-kind <list>       Inverse of --kind (e.g. --exclude-kind devicePatched to drop lastSeen noise).",
  "  --exclude-model-key <list>  Inverse of --model-key.",
  "  --exclude-device <list>     Inverse of --device.",
  "  --exclude-object <list>     Inverse of --object.",
  "",
  "Output:",
  "  (default)   Pretty, color-coded, one event per line with the device name resolved.",
  "  --json      NDJSON: one full event object per line, no color - the capture format for jq and fixture replay.",
  "",
  "Bounds (stop on whichever fires first; Ctrl-C always works):",
  "  --count N         Stop after N events (post-filter).",
  "  --duration <dur>  Stop after a duration: 30s, 5m, 1h.",
  "  --debug           Emit the library's debug logging to stderr.",
  "  -h, --help        Show this help.",
  "",
  "Examples:",
  "  ufp watch events --kind motionDetected --device \"Front Door\"",
  "  ufp watch events --model-key camera --exclude-kind devicePatched   # drop the lastSeen churn",
  "  ufp watch events --json --count 100 --duration 1h                  # capture, bounded two ways"
].join("\n");

// The parseArgs option set: the common flags, every filter axis (each in an include and an exclude form), the output flag, and the stop-condition bounds.
const OPTIONS = {

  ...COMMON_OPTIONS,
  count: { type: "string" },
  device: { type: "string" },
  duration: { type: "string" },
  "exclude-device": { type: "string" },
  "exclude-kind": { type: "string" },
  "exclude-model-key": { type: "string" },
  "exclude-object": { type: "string" },
  json: { type: "boolean" },
  kind: { type: "string" },
  "model-key": { type: "string" },
  object: { type: "string" }
} as const;

// Map each event kind to a palette color, so a glance at the stream separates motion from smart-detect from a device patch. The switch is exhaustive over every modeled
// kind; `bootstrapLoaded` (synthetic, never on the firehose) is colored gray explicitly, and the `default` asserts exhaustiveness via `satisfies never` while keeping a
// gray fallback - a color function must never crash the renderer, so this is the presentation counterpart of the throwing `assertNever`.
function kindColor(colors: Output["colors"], kind: TypedEvent["kind"]): (text: string) => string {

  switch(kind) {

    case "motionDetected":

      return colors.yellow;

    case "smartDetect":

      return colors.magenta;

    case "doorbellRing":

      return colors.cyan;

    // Tamper is a security alert; red carries that weight. It shares red with `deviceRemoved` - the palette has no free distinct hue, and the kind label
    // printed alongside disambiguates the two.
    case "tamperDetected":

      return colors.red;

    // Auth, access, and a fob's security-action button press are all interactions at an entry point - a credential scan, an access-device occurrence, and a deliberate
    // press on an access credential device - so they share blue as a visual family. They remain distinct kinds (an auth scan is camera-attributed, while an access
    // occurrence and a button press are device-attributed) and the printed kind label tells them apart, the same latitude tamper and deviceRemoved take with red.
    case "authDetected":
    case "accessEvent":
    case "buttonPressed":

      return colors.blue;

    case "deviceAdded":

      return colors.green;

    case "deviceRemoved":

      return colors.red;

    case "devicePatched":

      return colors.dim;

    case "bootstrapLoaded":

      return colors.gray;

    default:

      kind satisfies never;

      return colors.gray;
  }
}

// A compact, human-readable detail suffix for an event - the discriminating fields for its kind. Activity signals carry their occurrence id (so start and finalize
// correlate); a patch lists the fields it touched; an add/remove names the modelKey.
function eventDetail(event: TypedEvent): string | undefined {

  switch(event.kind) {

    case "smartDetect":

      return "objects=" + event.objectTypes.join(",") + " id=" + event.eventId;

    case "authDetected":

      return "method=" + event.method + " id=" + event.eventId;

    case "doorbellRing":
    case "motionDetected":
    case "tamperDetected":

      return "id=" + event.eventId;

    case "accessEvent":

      return "action=" + event.action + " id=" + event.eventId;

    case "buttonPressed":

      return "button=" + event.button + " press=" + event.pressType + " id=" + event.eventId;

    case "deviceAdded":
    case "deviceRemoved":

      return "modelKey=" + event.modelKey;

    case "devicePatched":

      return "modelKey=" + event.modelKey + " fields=" + Object.keys(event.patch).join(",");

    case "bootstrapLoaded":

      return undefined;

    default:

      event satisfies never;

      return undefined;
  }
}

// Render one event as a pretty line: a dim wall-clock receive time, the color-coded kind, the resolved device name, and the kind's detail suffix.
function renderEvent(output: Output, event: TypedEvent, resolveName: (id: string) => string | undefined): void {

  const colors = output.colors;
  const [id] = ProtectClient.eventSubjects(event);

  // `slice(11, 23)` is the "HH:MM:SS.mmm" time-of-day portion of the ISO 8601 string (the date prefix and trailing "Z" dropped).
  const parts = [ colors.dim(new Date().toISOString().slice(11, 23)), kindColor(colors, event.kind)(event.kind) ];

  if(id !== undefined) {

    parts.push(colors.bold(resolveName(id) ?? id));
  }

  const detail = eventDetail(event);

  if(detail !== undefined) {

    parts.push(colors.dim(detail));
  }

  output.line(parts.join("  "));
}

// Apply the compiled filter to the firehose. A pure pass-through generator, so it composes cleanly with `take` (the early return propagates back through here and into
// `client.events`, unsubscribing the firehose).
async function *filterEvents(source: AsyncIterable<TypedEvent>, filter: EventFilter, resolveName: (id: string) => string | undefined): AsyncGenerator<TypedEvent> {

  for await (const event of source) {

    if(matchesEvent(filter, event, resolveName)) {

      yield event;
    }
  }
}

/**
 * `ufp watch events`. Connects, then iterates the realtime firehose through the compiled filter, rendering each surviving event as a pretty line or NDJSON. `--count N`
 * stops after N post-filter events via the async-iterator `take`; `--duration <dur>` after a wall-clock bound (folded into the Ctrl-C signal by `boundedSignal`);
 * otherwise it runs until Ctrl-C, whose signal ends the firehose and unwinds the `await using` client.
 *
 * @category CLI
 */
const watchEventsHandler: CommandHandler = async (ctx) => {

  const { values } = parseArgs({ allowPositionals: true, args: ctx.args, options: OPTIONS, strict: true });

  if(values.help === true) {

    ctx.output.line(USAGE);

    return;
  }

  const limit = (values.count !== undefined) ? parsePositiveInt(values.count, "--count") : undefined;
  const durationMs = (values.duration !== undefined) ? parseDuration(values.duration, "--duration") : undefined;
  const filter = buildEventFilter({

    device: values.device,
    excludeDevice: values["exclude-device"],
    excludeKind: values["exclude-kind"],
    excludeModelKey: values["exclude-model-key"],
    excludeObject: values["exclude-object"],
    kind: values.kind,
    modelKey: values["model-key"],
    object: values.object
  });

  await using client = await ctx.openClient({ debug: values.debug === true, signal: ctx.signal });

  // The resolver is built once from the connect-time snapshot - device names are stable in practice, and an event for a device added mid-watch simply renders by id.
  // --duration bounds the stream (not the connect): boundedSignal folds the deadline into the Ctrl-C signal, so the firehose ends cleanly on whichever fires first.
  const resolveName = buildNameResolver(client);
  const source = filterEvents(client.events({ signal: boundedSignal(ctx.signal, durationMs) }), filter, resolveName);
  const limited = (limit !== undefined) ? take(source, limit) : source;

  for await (const event of limited) {

    if(values.json === true) {

      ctx.output.json(event);
    } else {

      renderEvent(ctx.output, event, resolveName);
    }
  }
};

// The command descriptor: the handler above plus the one-line summary the usage screen lists it by, so the listing derives from the same object that dispatches.
export const watchEvents: CommandSpec = {

  run: watchEventsHandler,
  summary: "Stream realtime events (classified, modeled) with a rich filter surface."
};
