/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * watch-state.ts: `ufp watch state <target>` - observe a slice of reduced state as it changes and print on every change, demonstrating client.state.observe.
 */
import { COMMON_OPTIONS, CliError, boundedSignal, parseDuration, parsePositiveInt, take } from "../shared.ts";
import type { CommandHandler, CommandSpec } from "../shared.ts";
import type { ProtectClient, ProtectDeviceConfig, ProtectState } from "../../../index.ts";
import { findDevice, isDeviceCategory } from "../lookup.ts";
import { isDeviceOnline, selectCameras, selectChimes, selectControllerName, selectFobs, selectIsAdmin, selectLights,
  selectOnlineCameras, selectOnlineChimes, selectOnlineFobs, selectOnlineLights, selectOnlineRelays, selectOnlineSensors, selectOnlineViewers, selectRelays,
  selectSensors, selectViewers } from "../../../index.ts";
import type { DeviceCategory } from "../lookup.ts";
import type { Output } from "../output/format.ts";
import { parseArgs } from "node:util";

const USAGE = [

  "Usage: ufp watch state <target> [--online] [--json] [--count N] [--duration <dur>] [--debug]",
  "",
  "Observe a slice of reduced controller state and print on every change.",
  "",
  "Targets:",
  "  cameras | lights | sensors | chimes | viewers | relays   A device category (use --online to watch only connected devices).",
  "  isAdmin | controllerName                                 A controller fact derived from state.",
  "  <device id or name>                                      A single device.",
  "",
  "Options:",
  "  --online          Narrow a device category to connected devices only.",
  "  --json            Emit each change as a JSON object instead of a pretty block.",
  "",
  "Bounds (stop on whichever fires first; Ctrl-C always works):",
  "  --count N         Stop after N changes.",
  "  --duration <dur>  Stop after a duration: 30s, 5m, 1h.",
  "  --debug           Emit the library's debug logging to stderr.",
  "  -h, --help        Show this help.",
  "",
  "Examples:",
  "  ufp watch state cameras --online        # watch connected cameras come and go",
  "  ufp watch state isAdmin                 # watch a permission change flip live",
  "  ufp watch state \"Front Door\" --json     # one device's changes as JSON"
].join("\n");

// A device category's two selectors (the full set and the connected-only subset) plus its display label. Typed against the config-record union so every category
// shares one shape; each concrete selector's narrower return type is assignable here by return-type covariance.
interface CategorySelectors {

  all: (state: ProtectState) => readonly ProtectDeviceConfig[];
  label: string;
  online: (state: ProtectState) => readonly ProtectDeviceConfig[];
}

// The device-category family of the registry, keyed by the canonical DeviceCategory set so it cannot drift from the vocabulary `reboot` / `info` share. Each entry
// mirrors a library collection selector pair, so the menu never offers a slice the library cannot model.
const CATEGORIES: Record<DeviceCategory, CategorySelectors> = {

  cameras: { all: selectCameras, label: "Cameras", online: selectOnlineCameras },
  chimes: { all: selectChimes, label: "Chimes", online: selectOnlineChimes },
  fobs: { all: selectFobs, label: "Fobs", online: selectOnlineFobs },
  lights: { all: selectLights, label: "Lights", online: selectOnlineLights },
  relays: { all: selectRelays, label: "Relays", online: selectOnlineRelays },
  sensors: { all: selectSensors, label: "Sensors", online: selectOnlineSensors },
  viewers: { all: selectViewers, label: "Viewers", online: selectOnlineViewers }
};

// The controller-fact family: derived facts that are not device collections. These mirror the client's derived getters (isAdmin, controllerName) and update live - a
// permission edit on the controller flips isAdmin via the realtime user rail, which is exactly the security-model change this lets an operator watch live.
const FACTS: Record<string, (state: ProtectState) => boolean | string | null> = {

  controllerName: selectControllerName,
  isAdmin: selectIsAdmin
};

// One observed change, in both renderable and JSON form, so the command body stays agnostic to which target family produced it.
interface Change {

  json: unknown;
  render: (output: Output) => void;
}

// The current wall-clock time as a compact HH:MM:SS.mmm stamp - enough to correlate changes without the date noise of a full ISO string on every line.
function timestamp(): string {

  return new Date().toISOString().slice(11, 23);
}

// Render a device's connectivity as a colored lowercase word, using the library's own "online" predicate so the CLI and the library agree on the definition.
function stateLabel(output: Output, state: string): string {

  return isDeviceOnline({ state }) ? output.colors.green(state.toLowerCase()) : output.colors.red(state.toLowerCase());
}

// Build a change for a device-category observation: a count header plus one line per device.
function categoryChange(target: string, label: string, records: readonly ProtectDeviceConfig[]): Change {

  return {

    json: { count: records.length, devices: records.map((record) => ({ id: record.id, name: record.name ?? record.displayName, state: record.state })),
      selector: target },
    render: (output: Output): void => {

      output.line(output.colors.dim(timestamp()) + "  " + output.colors.bold(label) + " (" + records.length.toString() + ")");

      for(const record of records) {

        output.line("  " + (record.name ?? record.displayName) + "  " + stateLabel(output, record.state));
      }
    }
  };
}

// Build a change for a controller-fact observation. A boolean renders as a colored yes/no, a string as itself, and null as a dim placeholder.
function factChange(target: string, value: boolean | string | null): Change {

  return {

    json: { selector: target, value },
    render: (output: Output): void => {

      const rendered = (typeof value === "boolean") ? (value ? output.colors.green("yes") : output.colors.yellow("no")) : (value ?? output.colors.dim("null"));

      output.line(output.colors.dim(timestamp()) + "  " + output.colors.bold(target) + ": " + rendered);
    }
  };
}

// Build a change for a single-device observation: the device's name, connectivity, and the firmware it currently reports.
function deviceChange(name: string, config: ProtectDeviceConfig): Change {

  return {

    json: config,
    render: (output: Output): void => {

      output.line(output.colors.dim(timestamp()) + "  " + output.colors.bold(name) + "  " + stateLabel(output, config.state) +
        "  " + output.colors.dim("fw=" + (config.firmwareVersion ?? "unknown")));
    }
  };
}

// Resolve the target to a change stream. A category or fact observes the matching selector; anything else is treated as a device id or name and observed through its
// projection. Each branch is a thin adapter from `client.state.observe` (or `device.observe`) to the uniform Change the command renders.
async function *watchTarget(client: ProtectClient, target: string, online: boolean, signal: AbortSignal): AsyncGenerator<Change> {

  if(isDeviceCategory(target)) {

    const category = CATEGORIES[target];

    for await (const records of client.state.observe(online ? category.online : category.all, { signal })) {

      yield categoryChange(target, category.label, records);
    }

    return;
  }

  const fact = FACTS[target];

  if(fact !== undefined) {

    for await (const value of client.state.observe(fact, { signal })) {

      yield factChange(target, value);
    }

    return;
  }

  const device = findDevice(client, target);

  for await (const updated of device.observe({ signal })) {

    yield deviceChange(updated.name, updated.config);
  }
}

/**
 * `ufp watch state`. Resolves the target to a change stream and prints each change until Ctrl-C (or a --count / --duration bound). The single-device branch is the
 * focused, least-chatty mode; a device category fires on any member's change, and `--online` narrows the watched population to the currently connected devices.
 *
 * @category CLI
 */
const watchStateHandler: CommandHandler = async (ctx) => {

  const { positionals, values } = parseArgs({ allowPositionals: true, args: ctx.args,
    options: { ...COMMON_OPTIONS, count: { type: "string" }, duration: { type: "string" }, json: { type: "boolean" }, online: { type: "boolean" } }, strict: true });

  if(values.help === true) {

    ctx.output.line(USAGE);

    return;
  }

  const [target] = positionals;

  if(target === undefined) {

    throw new CliError("Specify a target: a device category, a controller fact, or a device id/name. Run \"ufp watch state --help\".", { exitCode: 2 });
  }

  const limit = (values.count !== undefined) ? parsePositiveInt(values.count, "--count") : undefined;
  const durationMs = (values.duration !== undefined) ? parseDuration(values.duration, "--duration") : undefined;

  await using client = await ctx.openClient({ debug: values.debug === true, signal: ctx.signal });

  // --duration bounds the observation (not the connect): boundedSignal folds the deadline into the Ctrl-C signal, so observe() returns cleanly on whichever fires first.
  const changes = watchTarget(client, target, values.online === true, boundedSignal(ctx.signal, durationMs));
  const limited = (limit !== undefined) ? take(changes, limit) : changes;

  for await (const change of limited) {

    if(values.json === true) {

      ctx.output.json(change.json);
    } else {

      change.render(ctx.output);
    }
  }
};

// The command descriptor: the handler above plus the one-line summary the usage screen lists it by, so the listing derives from the same object that dispatches.
export const watchState: CommandSpec = {

  run: watchStateHandler,
  summary: "Observe a slice of reduced state and print on every change."
};
