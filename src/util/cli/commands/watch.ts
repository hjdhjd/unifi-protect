/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * watch.ts: `ufp watch <events|raw|state|livestream>` - the watch command group, dispatching to the streaming subcommands.
 */
import type { CommandSpec } from "../shared.ts";
import { commandGroup } from "../shared.ts";
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

// The command descriptor: the handler `commandGroup` builds from the table above plus the one-line summary the usage screen lists it by, so the listing derives from
// the same object that dispatches.
export const watch: CommandSpec = {

  run: commandGroup("watch", SUBCOMMANDS),
  summary: "Stream realtime events, raw frames, state changes, or a livestream."
};
