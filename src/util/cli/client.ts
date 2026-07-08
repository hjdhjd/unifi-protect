/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * client.ts: How the CLI connects - credential-to-client assembly and the stderr-routed logger every command shares.
 */
import type { OutputStream } from "./output/format.ts";
import { ProtectClient } from "../../index.ts";
import type { ProtectLogging } from "../../index.ts";
import { inspect } from "node:util";
import { loadCredentials } from "./credentials.ts";

/**
 * Options for {@link openClient}. `cwd`/`home` are forwarded to credential discovery (tests point them at a fixture); `log` is the logger the library emits through;
 * `debug` turns on verbose logging in the default stderr logger and has no effect when the caller supplies its own `log`; `refreshIntervalMs` overrides the
 * bootstrap-refresh failsafe cadence (a short command may pass `false` to skip the failsafe entirely); `signal` is the Ctrl-C lifetime.
 *
 * @category CLI
 */
export interface OpenClientOptions {

  cwd?: string;
  debug?: boolean;
  home?: string;
  log?: ProtectLogging;
  refreshIntervalMs?: number | false;
  signal?: AbortSignal;
}

// Render a log line's trailing context. Library calls pass structured context (`log.warn("...", { reason })`) or an error; we inspect non-string parameters so an object
// or Error prints legibly on stderr rather than as "[object Object]" or an empty "{}". Colors are off - log noise should not compete with the command's own output.
function renderParameters(parameters: unknown[]): string {

  if(parameters.length === 0) {

    return "";
  }

  // We set `depth` to 4 rather than Node's default of 2 so a nested context object - an outer bag holding an error or a device detail a level or two down - renders in
  // full instead of collapsing its inner levels to "[Object]".
  return " " + parameters.map((parameter) => (typeof parameter === "string") ? parameter : inspect(parameter, { colors: false, depth: 4 })).join(" ");
}

/**
 * Build the CLI's {@link ProtectLogging} adapter. Every library log line is routed to stderr - never stdout - so a command's payload (a JPEG, an fMP4 stream, NDJSON) is
 * never interleaved with diagnostics. Warnings and errors always print (a throttle, a stall, a reboot is something the operator wants told); the lower-volume `info`
 * lifecycle lines and `debug` detail print only with `--debug`, so a plain command emits just its own output on stdout and nothing on stderr unless something went wrong.
 * Each line is tagged with its level so a human reading stderr can tell a warning from an error at a glance.
 *
 * @param opts - Whether debug is enabled, and the stream to write to (defaults to stderr).
 *
 * @returns A `ProtectLogging` implementation.
 *
 * @category CLI
 */
export function createCliLogger(opts: { debug?: boolean; stream?: OutputStream } = {}): ProtectLogging {

  const stream = opts.stream ?? process.stderr;
  const debugEnabled = opts.debug ?? false;
  const emit = (level: string, message: string, parameters: unknown[]): void => void stream.write("[" + level + "] " + message + renderParameters(parameters) + "\n");

  return {

    debug: (message: string, ...parameters: unknown[]): void => {

      if(debugEnabled) {

        emit("debug", message, parameters);
      }
    },
    error: (message: string, ...parameters: unknown[]): void => emit("error", message, parameters),
    info: (message: string, ...parameters: unknown[]): void => {

      if(debugEnabled) {

        emit("info", message, parameters);
      }
    },
    warn: (message: string, ...parameters: unknown[]): void => emit("warn", message, parameters)
  };
}

/**
 * Load credentials and connect a ready {@link ProtectClient}. The single home for "how the ufp CLI connects" - commands reach it through the injected `ctx.openClient`
 * seam (`await using client = await ctx.openClient({ debug, signal })`, never by importing this opener directly), so the `await using` lifetime is visible at each call
 * site while the credential-loading and connect-assembly live in exactly one place. `log` serves direct library callers; CLI commands leave it to the default logger.
 *
 * @param opts - Discovery overrides, logger, refresh cadence, and the Ctrl-C signal.
 *
 * @returns A connected client.
 *
 * @throws {@link CliError} when credentials cannot be loaded, or the typed `FatalError` the library throws on a failed connect.
 *
 * @category CLI
 */
export async function openClient(opts: OpenClientOptions = {}): Promise<ProtectClient> {

  const credentials = await loadCredentials({ ...((opts.cwd !== undefined) && { cwd: opts.cwd }), ...((opts.home !== undefined) && { home: opts.home }) });

  // Use the caller's logger if it supplied one; otherwise build the standard stderr logger, honoring --debug. Either way the library logs land on stderr, never stdout.
  const log = opts.log ?? createCliLogger({ debug: opts.debug ?? false });

  return ProtectClient.connect({

    host: credentials.host,
    log,
    password: credentials.password,
    username: credentials.username,
    ...((opts.refreshIntervalMs !== undefined) && { refreshIntervalMs: opts.refreshIntervalMs }),
    ...((opts.signal !== undefined) && { signal: opts.signal })
  });
}
