/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * watch.ts: `ufp watch <events|raw|state|livestream>` - the watch command group, dispatching to the streaming subcommands.
 */
import { CliError, commandList } from "../shared.ts";
import type { CommandHandler, CommandSpec } from "../shared.ts";
import { watchEvents } from "./watch-events.ts";
import { watchLivestream } from "./watch-livestream.ts";
import { watchRaw } from "./watch-raw.ts";
import { watchState } from "./watch-state.ts";

// The watch subcommand table. The dispatcher and the usage text both derive from it, so a subcommand is registered in exactly one place and its listed summary is the one
// the subcommand itself declares.
const SUBCOMMANDS: Record<string, CommandSpec> = {

  events: watchEvents,
  livestream: watchLivestream,
  raw: watchRaw,
  state: watchState
};

// Group usage, rendered from SUBCOMMANDS through the shared `commandList` helper - the same one the top-level `ufp` screen uses - so the listed subcommands and their
// summaries cannot drift from what actually dispatches, and both screens list commands by one rule.
const USAGE = [

  "Usage: ufp watch <subcommand> [options]",
  "",
  "Subcommands:",
  ...commandList(SUBCOMMANDS),
  "",
  "Run \"ufp watch <subcommand> --help\" for subcommand options."
].join("\n");

/**
 * `ufp watch`. Consumes the first argument as the subcommand and forwards the rest to it, sharing the same context (output, signal). A missing subcommand (or
 * `help`/`--help`/`-h`) prints the group usage; an unrecognized subcommand throws a usage error (exit 2) naming the valid subcommands.
 *
 * @category CLI
 */
const watchHandler: CommandHandler = async (ctx) => {

  const [ subcommand, ...rest ] = ctx.args;

  if((subcommand === undefined) || (subcommand === "help") || (subcommand === "--help") || (subcommand === "-h")) {

    ctx.output.line(USAGE);

    return;
  }

  const command = SUBCOMMANDS[subcommand];

  if(command === undefined) {

    throw new CliError("Unknown watch subcommand \"" + subcommand + "\". Expected events, raw, state, or livestream.", { exitCode: 2 });
  }

  await command.run({ ...ctx, args: rest });
};

// The command descriptor: the handler above plus the one-line summary the usage screen lists it by, so the listing derives from the same object that dispatches.
export const watch: CommandSpec = {

  run: watchHandler,
  summary: "Stream realtime events, raw frames, state changes, or a livestream."
};
