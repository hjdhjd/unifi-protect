/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * camera.ts: `ufp camera <snapshot|talkback|unlock|flashlight>` - the camera command group, dispatching to the camera-specific device actions.
 */
import type { CommandSpec } from "../shared.ts";
import { cameraFlashlight } from "./camera-flashlight.ts";
import { cameraSnapshot } from "./camera-snapshot.ts";
import { cameraTalkback } from "./camera-talkback.ts";
import { cameraUnlock } from "./camera-unlock.ts";
import { commandGroup } from "../shared.ts";

// The camera subcommand table. The dispatcher, the usage text, and the unknown-subcommand diagnostic all derive from it, so a subcommand is registered in exactly one
// place and its listed summary is the one the subcommand itself declares.
const SUBCOMMANDS: Record<string, CommandSpec> = {

  flashlight: cameraFlashlight,
  snapshot: cameraSnapshot,
  talkback: cameraTalkback,
  unlock: cameraUnlock
};

// The command descriptor: the handler `commandGroup` builds from the table above plus the one-line summary the usage screen lists it by, so the listing derives from
// the same object that dispatches. The summary is descriptive rather than an enumeration of the subcommands - the sub-help already lists them via `commandList`, so an
// enumeration here would be a second copy that drifts.
export const camera: CommandSpec = {

  // The "See also" line closes the discoverability gap that a camera's live video feed is addressed under the streaming family (`watch livestream`), not here, even
  // though both act on a camera: the split is by interaction mode, an open-ended subscription versus a bounded action.
  run: commandGroup("camera", SUBCOMMANDS, { seeAlso: "ufp watch livestream <camera> (the live video feed)." }),
  summary: "Camera-specific device actions."
};
