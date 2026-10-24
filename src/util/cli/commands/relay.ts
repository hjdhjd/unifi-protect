/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * relay.ts: `ufp relay <toggle>` - the relay command group, dispatching to the relay-specific device actions.
 */
import type { CommandSpec } from "../shared.ts";
import { commandGroup } from "../shared.ts";
import { relayToggle } from "./relay-toggle.ts";

// The relay subcommand table. The dispatcher, the usage text, and the unknown-subcommand diagnostic all derive from it, so a subcommand is registered in exactly one
// place and its listed summary is the one the subcommand itself declares.
const SUBCOMMANDS: Record<string, CommandSpec> = {

  toggle: relayToggle
};

// The command descriptor: the handler `commandGroup` builds from the table above plus the one-line summary the usage screen lists it by, so the listing derives from
// the same object that dispatches. The summary is descriptive rather than an enumeration of the subcommands - the sub-help already lists them via `commandList`, so an
// enumeration here would be a second copy that drifts.
export const relay: CommandSpec = {

  run: commandGroup("relay", SUBCOMMANDS),
  summary: "Relay-specific device actions."
};
