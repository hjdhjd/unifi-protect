/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * diagnostics.ts: `ufp diagnostics` - subscribe to the library's named diagnostics channels and render them live. Validates the taxonomy and surfaces schema drift.
 */
import { COMMON_OPTIONS, CliError, boundedSignal, compilePattern, parseDuration, parseList, parsePositiveInt } from "../shared.ts";
import type { CommandHandler, CommandSpec } from "../shared.ts";
import { renderDiagnostic, subscribeDiagnostics } from "../diagnostics-feed.ts";
import { channels } from "../../../index.ts";
import { parseArgs } from "node:util";

const USAGE = [

  "Usage: ufp diagnostics [--channel <pattern>] [--count N] [--duration <dur>] [--debug]",
  "",
  "Subscribe to the library's node:diagnostics_channel publishers and render each message live, while a connected client",
  "drives controller activity. The observability counterpart to the library's logging.",
  "",
  "Options:",
  "  --channel <pattern>  Only subscribe to channels whose name matches (comma-separated list; substring or * / ? glob).",
  "                       e.g. --channel http, --channel schema (to watch for unknown-model-key schema drift).",
  "",
  "Bounds (stop on whichever fires first; Ctrl-C always works):",
  "  --count N            Stop after N messages.",
  "  --duration <dur>     Stop after a duration: 30s, 5m, 1h.",
  "  --debug              Emit the library's debug logging to stderr.",
  "  -h, --help           Show this help.",
  "",
  "Examples:",
  "  ufp diagnostics --channel schema             # alarm bell: fires when the controller emits a model key we don't model",
  "  ufp diagnostics --channel http --count 20    # the next 20 HTTP request/response diagnostics",
  "  ufp diagnostics --duration 5m                # everything, for five minutes"
].join("\n");

/**
 * `ufp diagnostics`. Subscribes to every named diagnostics channel (optionally filtered by `--channel`), connects a client to drive activity, and renders each published
 * message until Ctrl-C (or --count N messages). This is how schema drift becomes visible: `--channel schema` surfaces any unknown-modelKey the controller emits, so a
 * device class the library does not yet model is reported rather than silently dropped.
 *
 * @category CLI
 */
const diagnosticsHandler: CommandHandler = async (ctx) => {

  const { values } = parseArgs({ allowPositionals: true, args: ctx.args,
    options: { ...COMMON_OPTIONS, channel: { type: "string" }, count: { type: "string" }, duration: { type: "string" } }, strict: true });

  if(values.help === true) {

    ctx.output.line(USAGE);

    return;
  }

  const limit = (values.count !== undefined) ? parsePositiveInt(values.count, "--count") : undefined;
  const durationMs = (values.duration !== undefined) ? parseDuration(values.duration, "--duration") : undefined;
  const patterns = parseList(values.channel).map((pattern) => compilePattern(pattern, "substring"));
  const selected = Object.values(channels).filter((channel) => (patterns.length === 0) || patterns.some((matches) => matches(String(channel.name))));

  if(selected.length === 0) {

    throw new CliError("No diagnostics channel matches \"" + (values.channel ?? "") + "\".", { exitCode: 2 });
  }

  const output = ctx.output;

  // Resolve the wait when the operator aborts (Ctrl-C) or the message budget is reached. Each rendered message counts toward --count.
  const { promise, resolve } = Promise.withResolvers<undefined>();

  let count = 0;

  // Subscribe before connecting, so the connect handshake's own http/events diagnostics are captured rather than missed. The feed is a Disposable, so it detaches every
  // handler at function scope exit - after the client below disposes, capturing its teardown diagnostics too. The render + subscribe mechanism is shared with
  // `ufp watch livestream --diagnostics`.
  using _feed = subscribeDiagnostics(selected, (name, message) => {

    renderDiagnostic(output, name, message);

    count += 1;

    if((limit !== undefined) && (count >= limit)) {

      resolve(undefined);
    }
  });

  // The wait ends on Ctrl-C or, when --duration is set, on the deadline: boundedSignal folds the timeout into the Ctrl-C signal, and aborting it (either way) resolves
  // the promise. The connect below still uses the bare ctx.signal, so --duration bounds the observation window, not the connection handshake.
  const signal = boundedSignal(ctx.signal, durationMs);
  const onAbort = (): void => resolve(undefined);

  if(signal.aborted) {

    resolve(undefined);
  } else {

    signal.addEventListener("abort", onAbort, { once: true });
  }

  try {

    await using _client = await ctx.openClient({ debug: values.debug === true, signal: ctx.signal });

    output.line(output.colors.dim("Subscribed to " + selected.length.toString() + " diagnostics channel(s); waiting for activity. Press Ctrl-C to stop."));

    await promise;
  } finally {

    signal.removeEventListener("abort", onAbort);
  }
};

// The command descriptor: the handler above plus the one-line summary the usage screen lists it by, so the listing derives from the same object that dispatches.
export const diagnostics: CommandSpec = {

  run: diagnosticsHandler,
  summary: "Subscribe to the library's diagnostics channels and render each message live."
};
