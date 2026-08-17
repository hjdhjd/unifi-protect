/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * diagnostics-feed.ts: The shared subscribe-and-render mechanism for the library's named diagnostics channels, used by both `ufp diagnostics` (every channel, to stdout)
 * and `ufp watch livestream --diagnostics` (the livestream channels, to stderr). One definition of how a diagnostics event is colored, formatted, and subscribed, so the
 * two commands never drift.
 */
import type { AnyProtectDiagnosticsChannel } from "../../index.ts";
import type { Output } from "./output/format.ts";
import { nowStamp } from "./output/format.ts";
import { subscribeToChannel } from "../../index.ts";

// Color a channel name by its subsystem (the second colon-delimited segment of "unifi-protect:<subsystem>:..."), so a glance separates http from events from a schema
// signal. Unknown subsystems fall back to gray.
export function colorChannel(output: Output, name: string): string {

  const subsystem = name.split(":")[1] ?? "";
  const palette: Record<string, (text: string) => string> = {

    connection: output.colors.magenta,
    events: output.colors.cyan,
    http: output.colors.blue,
    livestream: output.colors.green,
    schema: output.colors.yellow
  };

  return (palette[subsystem] ?? output.colors.gray)(name);
}

/**
 * Render one diagnostics event to the given {@link Output}. The single source for how a diagnostics message looks across `ufp diagnostics` and `ufp watch livestream
 * --diagnostics`: a JSON object per event when `json` is set (so the line is analyzable with `jq`), otherwise a color-coded, timestamped human line.
 *
 * @param output  - The sink to write the rendered line to (the caller chooses stdout or stderr by how it constructed the `Output`).
 * @param name    - The channel name.
 * @param message - The published payload (`undefined` for payload-less channels).
 * @param opts    - `json` selects the machine-readable object form over the human line.
 *
 * @category CLI
 */
export function renderDiagnostic(output: Output, name: string, message: unknown, opts: { json?: boolean } = {}): void {

  if(opts.json === true) {

    output.json({ channel: name, payload: message ?? null });

    return;
  }

  output.line(output.colors.dim(nowStamp()) + "  " + colorChannel(output, name) + "  " + output.colors.dim((message === undefined) ? "" : JSON.stringify(message)));
}

/**
 * Subscribe to a set of diagnostics channels, routing each published message to `onMessage(name, message)`. Returns a `Disposable` that detaches every handler, so a
 * caller uses `using feed = subscribeDiagnostics(...)` and the subscriptions tear down at scope exit with no bookkeeping - the same lifetime discipline the rest of the
 * library uses for its event subscriptions.
 *
 * @param selected  - The channels to subscribe to.
 * @param onMessage - Invoked with the channel name and payload on each publication.
 *
 * @returns A `Disposable` that unsubscribes every handler when disposed.
 *
 * @category CLI
 */
export function subscribeDiagnostics(selected: readonly AnyProtectDiagnosticsChannel[], onMessage: (name: string, message: unknown) => void): Disposable {

  // A `DisposableStack` is the aggregate: each per-channel handle goes in, and disposing the stack detaches every one of them. The channels here carry different payload
  // types, so this is the generic arm of `subscribeToChannel` - the payload reaches `onMessage` as `unknown`, which is what a feed that renders whatever arrives wants.
  const stack = new DisposableStack();

  for(const channel of selected) {

    stack.use(subscribeToChannel(channel, (message) => onMessage(String(channel.name), message)));
  }

  return stack;
}
