/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * relay.ts: `ufp relay <toggle>` - the relay command group, dispatching to the relay-specific device actions.
 */
import { CliError, commandList } from "../shared.ts";
import type { CommandHandler, CommandSpec } from "../shared.ts";
import { relayToggle } from "./relay-toggle.ts";

// The relay subcommand table. The dispatcher, the usage text, and the unknown-subcommand diagnostic all derive from it, so a subcommand is registered in exactly one
// place and its listed summary is the one the subcommand itself declares.
const SUBCOMMANDS: Record<string, CommandSpec> = {

  toggle: relayToggle
};

// Group usage, rendered from SUBCOMMANDS through the shared `commandList` helper - the same one the top-level `ufp` screen and the `watch` group use - so the listed
// subcommands and their summaries cannot drift from what actually dispatches.
const USAGE = [

  "Usage: ufp relay <subcommand> [options]",
  "",
  "Subcommands:",
  ...commandList(SUBCOMMANDS),
  "",
  "Run \"ufp relay <subcommand> --help\" for subcommand options."
].join("\n");

/**
 * `ufp relay`. Consumes the first argument as the subcommand and forwards the rest to it, sharing the same context (output, signal). A missing or `--help` subcommand
 * prints the group usage and exits zero; an unknown subcommand is a usage error (exit 2), its diagnostic listing the valid subcommands read from the dispatch table.
 *
 * @category CLI
 */
const relayHandler: CommandHandler = async (ctx) => {

  const [ subcommand, ...rest ] = ctx.args;

  if((subcommand === undefined) || (subcommand === "help") || (subcommand === "--help") || (subcommand === "-h")) {

    ctx.output.line(USAGE);

    return;
  }

  const command = SUBCOMMANDS[subcommand];

  if(command === undefined) {

    throw new CliError("Unknown relay subcommand \"" + subcommand + "\". Expected one of: " + Object.keys(SUBCOMMANDS).sort().join(", ") + ".", { exitCode: 2 });
  }

  await command.run({ ...ctx, args: rest });
};

// The command descriptor: the handler above plus the one-line summary the usage screen lists it by, so the listing derives from the same object that dispatches. The
// summary is descriptive rather than an enumeration of the subcommands - the sub-help already lists them via `commandList`, so an enumeration here would be a second copy
// that drifts.
export const relay: CommandSpec = {

  run: relayHandler,
  summary: "Relay-specific device actions."
};
