/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * chime-play-buzzer.ts: `ufp chime play-buzzer <chime>` - play a chime's piezo buzzer via the first-class library method.
 */
import { COMMON_OPTIONS, CliError } from "../shared.ts";
import type { CommandHandler, CommandSpec } from "../shared.ts";
import { findDeviceOfType } from "../lookup.ts";
import { parseArgs } from "node:util";

const USAGE = [

  "Usage: ufp chime play-buzzer <chime> [--debug]",
  "",
  "Play a chime's buzzer - the simple piezo tone, distinct from a ringtone. It takes no parameters.",
  "",
  "Options:",
  "  --debug     Emit the library's debug logging to stderr.",
  "  -h, --help  Show this help.",
  "",
  "Examples:",
  "  ufp chime play-buzzer \"Hallway Chime\""
].join("\n");

/**
 * `ufp chime play-buzzer`. Resolves the positional to a chime and plays its buzzer via {@link Chime.playBuzzer}. The buzzer takes no parameters, and the command is not
 * capability-gated (every chime has a buzzer); it issues the single play and returns.
 *
 * @category CLI
 */
const chimePlayBuzzerHandler: CommandHandler = async (ctx) => {

  const { positionals, values } = parseArgs({ allowPositionals: true, args: ctx.args, options: { ...COMMON_OPTIONS }, strict: true });

  if(values.help === true) {

    ctx.output.line(USAGE);

    return;
  }

  const [target] = positionals;

  if(target === undefined) {

    throw new CliError("Specify a chime by id or name. Run \"ufp chime play-buzzer --help\".", { exitCode: 2 });
  }

  await using client = await ctx.openClient({ debug: values.debug === true, refreshIntervalMs: false, signal: ctx.signal });

  const chime = findDeviceOfType(client, target, "chime");

  await chime.playBuzzer({ signal: ctx.signal });

  ctx.output.line("Played " + chime.name + "'s buzzer.");
};

// The command descriptor: the handler above plus the one-line summary the group usage screen lists it by, so the listing derives from the same object that dispatches.
export const chimePlayBuzzer: CommandSpec = {

  run: chimePlayBuzzerHandler,
  summary: "Play a chime's buzzer."
};
