/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * relay-toggle.ts: `ufp relay toggle <relay> [output-id]` - flip one of a relay's latching outputs via the first-class library method.
 */
import { COMMON_OPTIONS, CliError, parseNonNegativeInt } from "../shared.ts";
import type { CommandHandler, CommandSpec } from "../shared.ts";
import { findDeviceOfType } from "../lookup.ts";
import { parseArgs } from "node:util";

const USAGE = [

  "Usage: ufp relay toggle <relay> [output-id] [--debug]",
  "",
  "Flip one of a relay's latching outputs (off becomes on, on becomes off). The controller has no momentary pulse and no separate set-on/set-off;",
  "each toggle is a single latching flip. Omit the output id when the relay has exactly one output; otherwise name the numeric id to disambiguate.",
  "",
  "Options:",
  "  --debug     Emit the library's debug logging to stderr.",
  "  -h, --help  Show this help.",
  "",
  "Examples:",
  "  ufp relay toggle \"Garage Relay\"      # the sole output",
  "  ufp relay toggle \"Garage Relay\" 2    # output id 2"
].join("\n");

/**
 * `ufp relay toggle`. Resolves the positional to a relay and flips one of its outputs via {@link Relay.toggleOutput}. The output is chosen by its numeric `id` (the value
 * the controller reports on each `outputs[]` entry), not by array position. When an id is given it is toggled directly; the id is deliberately not pre-validated here -
 * an unknown id surfaces as the controller's classified error, consistent with the library's controller-as-authority grain. When the id is omitted, the relay's single
 * output is toggled; a relay with several outputs asks for the id (listing each output's id and state), and a relay with no outputs is a usage error rather than a call
 * with no target.
 *
 * @category CLI
 */
const relayToggleHandler: CommandHandler = async (ctx) => {

  const { positionals, values } = parseArgs({ allowPositionals: true, args: ctx.args, options: { ...COMMON_OPTIONS }, strict: true });

  if(values.help === true) {

    ctx.output.line(USAGE);

    return;
  }

  const [ target, outputArg ] = positionals;

  if(target === undefined) {

    throw new CliError("Specify a relay by id or name. Run \"ufp relay toggle --help\".", { exitCode: 2 });
  }

  await using client = await ctx.openClient({ debug: values.debug === true, refreshIntervalMs: false, signal: ctx.signal });

  const relay = findDeviceOfType(client, target, "relay");
  const outputs = relay.config.outputs;

  // Resolve which output id to toggle. An explicit id is parsed as a non-negative integer (output ids may legitimately be 0, so a positive-only parse would be wrong) and
  // toggled directly. With no id, the sole output is the unambiguous target; several outputs need the id (we list each id and its current state as the resolve-to-one
  // convenience); zero outputs is a usage error rather than a call with no target. We toggle the output's `id` field, never its array position.
  const [sole] = outputs;

  let outputId: number;

  if(outputArg !== undefined) {

    outputId = parseNonNegativeInt(outputArg, "output-id");
  } else if(sole === undefined) {

    throw new CliError("Relay " + relay.name + " exposes no outputs to toggle.", { exitCode: 2 });
  } else if(outputs.length === 1) {

    outputId = sole.id;
  } else {

    const listed = outputs.map((output) => output.id.toString() + " (" + output.state + ")").join(", ");

    throw new CliError("Relay " + relay.name + " has " + outputs.length.toString() + " outputs; specify which by id: " + listed + ".", { exitCode: 2 });
  }

  await relay.toggleOutput(outputId, { signal: ctx.signal });

  ctx.output.line("Toggled output " + outputId.toString() + " on " + relay.name + ".");
};

// The command descriptor: the handler above plus the one-line summary the group usage screen lists it by, so the listing derives from the same object that dispatches.
export const relayToggle: CommandSpec = {

  run: relayToggleHandler,
  summary: "Toggle one of a relay's outputs."
};
