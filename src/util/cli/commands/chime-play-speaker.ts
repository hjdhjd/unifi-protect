/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * chime-play-speaker.ts: `ufp chime play-speaker <chime>` - play a ringtone through a chime's speaker via the first-class library method.
 */
import { COMMON_OPTIONS, CliError, parseNonNegativeInt } from "../shared.ts";
import type { CommandHandler, CommandSpec } from "../shared.ts";
import type { PlaySpeakerOptions } from "../../../index.ts";
import { findDeviceOfType } from "../lookup.ts";
import { parseArgs } from "node:util";

const USAGE = [

  "Usage: ufp chime play-speaker <chime> [--ringtone <id>] [--volume <n>] [--repeat <n>] [--debug]",
  "",
  "Play a ringtone through a chime's speaker. With no options the controller plays the chime's default assigned ringtone at its own",
  "volume and repeat count; supply any of the flags to select a specific ringtone or override its playback.",
  "",
  "Options:",
  "  --ringtone <id>  Play a specific ringtone (from the controller's ringtones list) instead of the default.",
  "  --volume <n>     Playback volume. The controller is the authority for the valid range.",
  "  --repeat <n>     How many times to repeat the ringtone.",
  "  --debug          Emit the library's debug logging to stderr.",
  "  -h, --help       Show this help.",
  "",
  "Examples:",
  "  ufp chime play-speaker \"Hallway Chime\"",
  "  ufp chime play-speaker \"Hallway Chime\" --ringtone abc123 --volume 80 --repeat 2"
].join("\n");

/**
 * `ufp chime play-speaker`. Resolves the positional to a chime and plays a ringtone through its speaker via {@link Chime.playSpeaker}, mapping the optional flags 1:1
 * into {@link PlaySpeakerOptions}. `--volume` and `--repeat` are validated only for syntactic non-negativity: the library imposes no range and treats the controller as
 * the authority for a valid volume, so a CLI-side bound would fork that source of truth - an out-of-range value is left for the controller to reject. This command is not
 * capability-gated (every chime has a speaker).
 *
 * @category CLI
 */
const chimePlaySpeakerHandler: CommandHandler = async (ctx) => {

  const { positionals, values } = parseArgs({ allowPositionals: true, args: ctx.args,
    options: { ...COMMON_OPTIONS, repeat: { type: "string" }, ringtone: { type: "string" }, volume: { type: "string" } }, strict: true });

  if(values.help === true) {

    ctx.output.line(USAGE);

    return;
  }

  const [target] = positionals;

  if(target === undefined) {

    throw new CliError("Specify a chime by id or name. Run \"ufp chime play-speaker --help\".", { exitCode: 2 });
  }

  // Map the flags 1:1 into the library options, including only those the operator supplied so an omitted flag lets the controller pick its default. `--volume`/`--repeat`
  // are parsed for non-negative integer syntax only; the controller validates the value itself.
  const repeatTimes = (values.repeat !== undefined) ? parseNonNegativeInt(values.repeat, "--repeat") : undefined;
  const volume = (values.volume !== undefined) ? parseNonNegativeInt(values.volume, "--volume") : undefined;
  const options: PlaySpeakerOptions = {

    signal: ctx.signal,
    ...((repeatTimes !== undefined) && { repeatTimes }),
    ...((values.ringtone !== undefined) && { ringtoneId: values.ringtone }),
    ...((volume !== undefined) && { volume })
  };

  await using client = await ctx.openClient({ debug: values.debug === true, refreshIntervalMs: false, signal: ctx.signal });

  const chime = findDeviceOfType(client, target, "chime");

  await chime.playSpeaker(options);

  ctx.output.line("Played " + chime.name + "'s speaker.");
};

// The command descriptor: the handler above plus the one-line summary the group usage screen lists it by, so the listing derives from the same object that dispatches.
export const chimePlaySpeaker: CommandSpec = {

  run: chimePlaySpeakerHandler,
  summary: "Play a ringtone through a chime's speaker."
};
