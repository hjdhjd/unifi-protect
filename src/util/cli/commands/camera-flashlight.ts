/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * camera-flashlight.ts: `ufp camera flashlight <camera>` - activate a package camera's downlight via the first-class library method.
 */
import { COMMON_OPTIONS, CliError } from "../shared.ts";
import type { CommandHandler, CommandSpec } from "../shared.ts";
import { findDeviceOfType } from "../lookup.ts";
import { parseArgs } from "node:util";

const USAGE = [

  "Usage: ufp camera flashlight <camera> [--debug]",
  "",
  "Turn on a package camera's downlight (the flashlight on dual-camera doorbells). It is momentary: the controller self-extinguishes it",
  "roughly 25 seconds after the last activation, so keeping it lit means re-issuing this on a cadence.",
  "",
  "Options:",
  "  --debug     Emit the library's debug logging to stderr.",
  "  -h, --help  Show this help.",
  "",
  "Examples:",
  "  ufp camera flashlight \"Front Door\""
].join("\n");

/**
 * `ufp camera flashlight`. Resolves the positional to a camera and activates its package-camera downlight via {@link Camera.turnOnFlashlight}. The capability guard lives
 * in the library: a camera with no package camera throws `ProtectUnsupportedError`, which the entry point renders as a calm one-line message; the command re-checks
 * nothing itself. The operation is momentary - the controller exposes no off endpoint - so this issues a single activation and returns.
 *
 * @category CLI
 */
const cameraFlashlightHandler: CommandHandler = async (ctx) => {

  const { positionals, values } = parseArgs({ allowPositionals: true, args: ctx.args, options: { ...COMMON_OPTIONS }, strict: true });

  if(values.help === true) {

    ctx.output.line(USAGE);

    return;
  }

  const [target] = positionals;

  if(target === undefined) {

    throw new CliError("Specify a camera by id or name. Run \"ufp camera flashlight --help\".", { exitCode: 2 });
  }

  await using client = await ctx.openClient({ debug: values.debug === true, refreshIntervalMs: false, signal: ctx.signal });

  const camera = findDeviceOfType(client, target, "camera");

  await camera.turnOnFlashlight({ signal: ctx.signal });

  ctx.output.line("Turned on " + camera.name + "'s flashlight.");
};

// The command descriptor: the handler above plus the one-line summary the group usage screen lists it by, so the listing derives from the same object that dispatches.
export const cameraFlashlight: CommandSpec = {

  run: cameraFlashlightHandler,
  summary: "Turn on a package camera's flashlight."
};
