/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * camera-unlock.ts: `ufp camera unlock <camera>` - release a camera's paired UniFi Access lock via the first-class library method.
 */
import { COMMON_OPTIONS, CliError } from "../shared.ts";
import type { CommandHandler, CommandSpec } from "../shared.ts";
import { findDeviceOfType } from "../lookup.ts";
import { parseArgs } from "node:util";

const USAGE = [

  "Usage: ufp camera unlock <camera> [--debug]",
  "",
  "Release the UniFi Access lock paired to a camera (e.g. a doorbell with an attached Access reader).",
  "",
  "Options:",
  "  --debug     Emit the library's debug logging to stderr.",
  "  -h, --help  Show this help.",
  "",
  "Examples:",
  "  ufp camera unlock \"Front Door\""
].join("\n");

/**
 * `ufp camera unlock`. Resolves the positional to a camera and releases its paired Access lock via {@link Camera.unlock}. The capability guard lives in the library: a
 * camera with no paired Access lock throws `ProtectUnsupportedError`, which the entry point renders as a calm one-line message; the command re-checks nothing itself.
 *
 * @category CLI
 */
const cameraUnlockHandler: CommandHandler = async (ctx) => {

  const { positionals, values } = parseArgs({ allowPositionals: true, args: ctx.args, options: { ...COMMON_OPTIONS }, strict: true });

  if(values.help === true) {

    ctx.output.line(USAGE);

    return;
  }

  const [target] = positionals;

  if(target === undefined) {

    throw new CliError("Specify a camera by id or name. Run \"ufp camera unlock --help\".", { exitCode: 2 });
  }

  await using client = await ctx.openClient({ debug: values.debug === true, refreshIntervalMs: false, signal: ctx.signal });

  const camera = findDeviceOfType(client, target, "camera");

  await camera.unlock({ signal: ctx.signal });

  ctx.output.line("Unlocked " + camera.name + ".");
};

// The command descriptor: the handler above plus the one-line summary the group usage screen lists it by, so the listing derives from the same object that dispatches.
export const cameraUnlock: CommandSpec = {

  run: cameraUnlockHandler,
  summary: "Unlock a camera's paired Access lock."
};
