#!/usr/bin/env node
/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * index.ts: The ufp CLI entry point - argv dispatch, the single Ctrl-C abort controller, and uniform error rendering. The reference consumer of the library.
 */
import { CliError, commandList, wireAbortSignal } from "./shared.ts";
import { Output, alignedList } from "./output/format.ts";
import { ProtectAbortedError, ProtectError } from "../../index.ts";
import type { CommandSpec } from "./shared.ts";
import { camera } from "./commands/camera.ts";
import { chime } from "./commands/chime.ts";
import { decode } from "./commands/decode.ts";
import { diagnostics } from "./commands/diagnostics.ts";
import { doctor } from "./commands/doctor.ts";
import { info } from "./commands/info.ts";
import { openClient } from "./client.ts";
import { readFileSync } from "node:fs";
import { reboot } from "./commands/reboot.ts";
import { relay } from "./commands/relay.ts";
import { update } from "./commands/update.ts";
import { watch } from "./commands/watch.ts";

// The command table. The dispatcher and the usage text both derive from this one object, so a new command is registered in exactly one place and can never be listed but
// unroutable (or routable but unlisted).
const COMMANDS: Record<string, CommandSpec> = {

  camera,
  chime,
  decode,
  diagnostics,
  doctor,
  info,
  reboot,
  relay,
  update,
  watch
};

// A curated set of cross-command examples for the top-level usage - the few things a new user most likely wants to do, spanning inspect, stream, and act. They live here,
// the one place that knows the whole command surface, because each is a composition no single command owns. The order is deliberate (inspect, then stream, then act), so
// this list is authored, not sorted.
const EXAMPLES: readonly (readonly [string, string])[] = [

  [ "ufp info", "# the controller summary and full device inventory" ],
  [ "ufp info --bootstrap | jq", "# the full controller bootstrap (uncurated, not the modeled state)" ],
  [ "ufp watch events", "# stream realtime events as they happen" ],
  [ "ufp watch raw --json", "# the decoded frame firehose, as NDJSON for capture" ],
  [ "ufp camera snapshot <camera>", "# save a current JPEG from a camera" ],
  [ "ufp camera unlock <camera>", "# release a camera's paired Access lock" ],
  [ "ufp doctor", "# health-check every subsystem against the controller" ]
];

// Top-level usage. The command list (each command beside its one-line summary) renders through `commandList` from COMMANDS - the same helper the `watch` group uses - so
// the screen cannot drift from what actually dispatches; the examples render through the shared `alignedList` so both blocks stay aligned as entries change.
function usage(): string {

  return [

    "ufp - a command-line client for the UniFi Protect API.",
    "",
    "Usage: ufp <command> [options]",
    "",
    "Commands:",
    ...commandList(COMMANDS),
    "",
    "Examples:",
    ...alignedList(EXAMPLES),
    "",
    "Run \"ufp <command> --help\" for command-specific options.",
    "Credentials are read from ./ufp.json or ~/.ufp.json (\"controller\", \"username\", \"password\")."
  ].join("\n");
}

// Read the package version for `--version`, relative to this module so it resolves identically whether the CLI runs from source (via --strip-types) or from dist.
function readVersion(): string {

  try {

    const pkg = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")) as { version?: string };

    return pkg.version ?? "unknown";
  } catch {

    return "unknown";
  }
}

// Render a thrown value to stderr and set the process exit code. Each case below is deliberate: a CliError or a typed ProtectError is an expected outcome and gets a calm
// one-line message; a caller abort (Ctrl-C during connect) exits 130 silently per convention; an argument-parse error is a usage error (exit 2); anything else is an
// unexpected bug and gets its stack so it can be diagnosed.
function renderError(error: unknown): void {

  if(error instanceof ProtectAbortedError) {

    process.exitCode = 130;

    return;
  }

  if(error instanceof CliError) {

    process.stderr.write("ufp: " + error.message + "\n");
    process.exitCode = error.exitCode;

    return;
  }

  if(error instanceof ProtectError) {

    process.stderr.write("ufp: " + error.message + "\n");
    process.exitCode = 1;

    return;
  }

  const code = (error as NodeJS.ErrnoException | null)?.code;

  if((typeof code === "string") && code.startsWith("ERR_PARSE_ARGS")) {

    process.stderr.write("ufp: " + ((error instanceof Error) ? error.message : String(error)) + "\n");
    process.exitCode = 2;

    return;
  }

  process.stderr.write("ufp: " + ((error instanceof Error) ? (error.stack ?? error.message) : String(error)) + "\n");
  process.exitCode = 1;
}

// Parse the verb, handle the help/version short-circuits, then dispatch the rest of argv to the matching command with the shared output and Ctrl-C signal. The signal
// listeners are detached in the finally so a short command leaves no handlers attached to the process.
async function main(): Promise<void> {

  const output = new Output();
  const [ verb, ...rest ] = process.argv.slice(2);

  if((verb === undefined) || (verb === "help") || (verb === "--help") || (verb === "-h")) {

    output.line(usage());

    return;
  }

  if((verb === "--version") || (verb === "-v")) {

    output.line(readVersion());

    return;
  }

  const command = COMMANDS[verb];

  if(command === undefined) {

    throw new CliError("Unknown command \"" + verb + "\". Run \"ufp --help\" for usage.", { exitCode: 2 });
  }

  const { dispose, signal } = wireAbortSignal();

  try {

    await command.run({ args: rest, env: process.env, openClient, output, signal });
  } finally {

    dispose();
  }
}

// A reader closing the pipe (piping into head, less, or ffmpeg that exits) makes a stdout write fail with EPIPE. For a streaming CLI that is a clean, expected end, so we
// exit 0 rather than crash with an unhandled error.
function onPipeError(error: NodeJS.ErrnoException): void {

  if(error.code === "EPIPE") {

    process.exit(0);
  }
}

process.stdout.on("error", onPipeError);
process.stderr.on("error", onPipeError);

void main().catch((error: unknown) => renderError(error));
