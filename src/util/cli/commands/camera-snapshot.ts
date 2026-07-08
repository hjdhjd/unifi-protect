/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * camera-snapshot.ts: `ufp camera snapshot <camera>` - fetch a current JPEG snapshot from a camera to a file or stdout.
 */
import { COMMON_OPTIONS, CliError, parsePositiveInt } from "../shared.ts";
import type { CommandHandler, CommandSpec } from "../shared.ts";
import { Output, formatBytes } from "../output/format.ts";
import { createWriteStream } from "node:fs";
import { findCamera } from "../lookup.ts";
import { once } from "node:events";
import { parseArgs } from "node:util";

const USAGE = [

  "Usage: ufp camera snapshot <camera> [--width N] [--height N] [--out <path|->] [--debug]",
  "",
  "Fetch a current JPEG snapshot from a camera.",
  "",
  "Options:",
  "  --width N   Request a specific width in pixels (the controller picks a default if omitted).",
  "  --height N  Request a specific height in pixels.",
  "  --out <path>  Write the JPEG to a file. Use - (or pipe stdout) to write to stdout.",
  "  --debug     Emit the library's debug logging to stderr.",
  "  -h, --help  Show this help.",
  "",
  "Examples:",
  "  ufp camera snapshot \"Front Door\" --out door.jpg",
  "  ufp camera snapshot \"Front Door\" --width 1920 --out -   # JPEG to stdout"
].join("\n");

/**
 * `ufp camera snapshot`. Fetches a JPEG and writes the bytes to a file (`--out <path>`) or stdout (`--out -`, or automatically when stdout is piped, so
 * `ufp camera snapshot cam > cam.jpg` works). Writing image bytes to an interactive terminal is refused - that only ever produces garbage - so a bare invocation at a
 * TTY asks for `--out`.
 *
 * @category CLI
 */
const cameraSnapshotHandler: CommandHandler = async (ctx) => {

  const { positionals, values } = parseArgs({ allowPositionals: true, args: ctx.args,
    options: { ...COMMON_OPTIONS, height: { type: "string" }, out: { type: "string" }, width: { type: "string" } }, strict: true });

  if(values.help === true) {

    ctx.output.line(USAGE);

    return;
  }

  const [target] = positionals;

  if(target === undefined) {

    throw new CliError("Specify a camera by id or name. Run \"ufp camera snapshot --help\".", { exitCode: 2 });
  }

  const width = (values.width !== undefined) ? parsePositiveInt(values.width, "--width") : undefined;
  const height = (values.height !== undefined) ? parsePositiveInt(values.height, "--height") : undefined;
  const out = values.out;
  const filePath = ((out !== undefined) && (out !== "-")) ? out : null;
  const toStdout = (filePath === null) && ((out === "-") || (!process.stdout.isTTY));

  // Refuse to spray JPEG bytes into an interactive terminal - it is never what the operator meant.
  if((filePath === null) && !toStdout) {

    throw new CliError("Refusing to write image bytes to a terminal. Use --out <path>, or pipe stdout.", { exitCode: 2 });
  }

  await using client = await ctx.openClient({ debug: values.debug === true, refreshIntervalMs: false, signal: ctx.signal });

  const camera = findCamera(client, target);
  const image = await camera.snapshot({ signal: ctx.signal, ...((height !== undefined) && { height }), ...((width !== undefined) && { width }) });

  if(filePath !== null) {

    const file = createWriteStream(filePath);

    file.write(image);
    file.end();

    await once(file, "finish");

    ctx.output.line("Wrote " + camera.name + " snapshot (" + formatBytes(image.length) + ") to " + filePath + ".");

    return;
  }

  // Bytes to stdout; the confirmation goes to stderr so it never contaminates the piped image.
  process.stdout.write(image);

  new Output({ env: ctx.env, stream: process.stderr }).line("Wrote " + camera.name + " snapshot (" + formatBytes(image.length) + ") to stdout.");
};

// The command descriptor: the handler above plus the one-line summary the group usage screen lists it by, so the listing derives from the same object that dispatches.
export const cameraSnapshot: CommandSpec = {

  run: cameraSnapshotHandler,
  summary: "Fetch a current JPEG snapshot from a camera."
};
