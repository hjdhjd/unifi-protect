/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * info.ts: `ufp info` - the controller summary and device inventory. The canonical "what am I connected to" command and the simplest reference consumer of the client.
 */
import type { AnyDevice, DeviceCategory } from "../lookup.ts";
import { COMMON_OPTIONS, CliError } from "../shared.ts";
import type { CommandHandler, CommandSpec } from "../shared.ts";
import { DEVICE_CATEGORIES, allDevices, devicesInCategory, isDeviceCategory } from "../lookup.ts";
import type { ProtectClient, ProtectState } from "../../../index.ts";
import { formatDuration, formatTimestamp } from "../output/format.ts";
import type { Output } from "../output/format.ts";
import { parseArgs } from "node:util";
import { selectAuthUser } from "../../../index.ts";

const USAGE = [

  "Usage: ufp info [category] [--json] [--raw] [--bootstrap] [--debug]",
  "",
  "Show the controller summary and a device inventory.",
  "",
  "Arguments:",
  "  category    One of cameras, lights, sensors, chimes, viewers, relays - narrows the inventory to that class (default + --json views). Omit for everything.",
  "",
  "Options:",
  "  --json      Emit the curated summary (controller, devices, identity) as a JSON object instead of a table.",
  "  --raw       Dump the full reduced state - every modeled record, uncurated - as JSON (a superset of --json; ignores any category).",
  "  --bootstrap Dump the controller's raw bootstrap JSON - the full payload, not the modeled state (a fresh fetch; keys sorted; ignores any category).",
  "  --debug     Emit the library's debug logging to stderr.",
  "  -h, --help  Show this help.",
  "",
  "Examples:",
  "  ufp info                         # controller summary + every device category",
  "  ufp info cameras                 # just the camera inventory",
  "  ufp info --bootstrap | jq 'keys' # every top-level key the controller reports, modeled or not"
].join("\n");

// The columns of the per-category device table, in display order.
const DEVICE_COLUMNS = [ "Name", "Id", "Model", "State", "Firmware" ];

// Render a device's connectivity as a colored word. We label it "online"/"offline" to match the controller's UI vocabulary and the library's `isOnline` predicate (which
// reads the device's lifecycle state, not the rawer `isConnected` boolean).
function onlineLabel(output: Output, isOnline: boolean): string {

  return isOnline ? output.colors.green("online") : output.colors.red("offline");
}

// One inventory row for a device: name, id, market model name, colored connectivity, and firmware. All fields come from the live config record the projection reads
// through to, so the inventory reflects current state.
function deviceRow(output: Output, device: AnyDevice): string[] {

  return [ device.name, device.id, device.config.marketName, onlineLabel(output, device.isOnline), device.config.firmwareVersion ?? "unknown" ];
}

// Render the human-readable summary: a controller header, then a table per device category - or, when a `category` is given, only that one class. The category list is
// the canonical DEVICE_CATEGORIES, so the inventory cannot drift from the vocabulary `reboot` / `watch state` share, and each label is the capitalized category word.
function renderPretty(output: Output, client: ProtectClient, category?: DeviceCategory): void {

  const colors = output.colors;
  const nvr = client.state.snapshot().nvr;

  output.line(colors.bold(client.controllerName ?? "UniFi Protect controller"));

  if(nvr !== null) {

    output.line("  Host:     " + nvr.host);
    output.line("  Version:  " + nvr.version + " (firmware " + nvr.firmwareVersion + ")");
    output.line("  Up since: " + formatTimestamp(nvr.upSince) + "  (" + formatDuration(Date.now() - nvr.upSince) + ")");
  }

  output.line("  Admin:    " + (client.isAdmin ? colors.green("yes") : colors.yellow("no")));
  output.line();

  // One table per category, including empty ones (the count alone is informative - "Sensors (0)" tells the operator there are none, which is a fact worth stating). A
  // category argument narrows this to the single requested class.
  for(const cat of DEVICE_CATEGORIES) {

    if((category !== undefined) && (cat !== category)) {

      continue;
    }

    const devices = devicesInCategory(client, cat);
    const label = cat.charAt(0).toUpperCase() + cat.slice(1);

    output.line(colors.bold(label + " (" + devices.length.toString() + ")"));

    if(devices.length > 0) {

      output.table(DEVICE_COLUMNS, devices.map((device) => deviceRow(output, device)));
    }

    output.line();
  }
}

// Build the structured summary for `--json`: a controller block, a concise per-device record, and the session identity. We project a curated subset (not the full config)
// so the JSON is a stable, readable summary rather than a dump of every controller field - `--raw` is the uncurated dump for when the full state is wanted. The identity
// block surfaces the derived getters (`isAdmin`, `controllerName`) and the authenticated user so a script can read "who am I, and what may I do" without parsing devices.
function buildJson(client: ProtectClient, category?: DeviceCategory): unknown {

  const nvr = client.state.snapshot().nvr;
  const authUser = selectAuthUser(client.state.snapshot());

  // The object shape is constant; a category only narrows the `devices` array, so `info cameras --json` is `info --json` with the inventory filtered - same keys, fewer
  // devices - rather than a different document a script would have to special-case.
  const devices = (category !== undefined) ? devicesInCategory(client, category) : allDevices(client);

  return {

    authUser: (authUser === null) ? null : { id: authUser.id, name: authUser.name },
    controller: (nvr === null) ? null : {

      firmwareVersion: nvr.firmwareVersion,
      host: nvr.host,
      id: nvr.id,
      mac: nvr.mac,
      name: nvr.name,
      upSince: nvr.upSince,
      version: nvr.version
    },
    controllerName: client.controllerName,
    devices: devices.map((device) => ({

      firmwareVersion: device.config.firmwareVersion,
      id: device.id,
      isOnline: device.isOnline,
      mac: device.config.mac,
      marketName: device.config.marketName,
      modelKey: device.modelKey,
      name: device.name,
      state: device.config.state,
      type: device.config.type
    })),
    isAdmin: client.isAdmin
  };
}

// Serialize the full reduced state for `--raw`. The state holds its collections as `Map`s, which `JSON.stringify` would flatten to `{}`, so we convert any map value
// to an array of its records and pass every other, non-Map-valued field through unchanged. Iterating the entries generically rather than naming each collection means a
// state field added later is dumped automatically, with no risk of this serializer drifting from the state shape.
function serializeState(state: ProtectState): Record<string, unknown> {

  const out: Record<string, unknown> = {};

  for(const [ key, value ] of Object.entries(state)) {

    out[key] = (value instanceof Map) ? [...value.values()] : value;
  }

  return out;
}

/**
 * `ufp info`. Connects, reads the current state synchronously through the client's getters, and prints one of four views: the human-readable summary (default), the
 * curated JSON summary (`--json`), the full reduced state (`--raw`), or the controller's raw bootstrap JSON (`--bootstrap`). An optional `category` narrows the
 * summary / `--json` inventory to one device class. A one-shot read, so the bootstrap-refresh failsafe is disabled - we want the state as of connect, then we leave.
 * `--bootstrap` issues its own fresh fetch on top of that connect-time state.
 *
 * @category CLI
 */
const infoHandler: CommandHandler = async (ctx) => {

  const { positionals, values } = parseArgs({ allowPositionals: true, args: ctx.args,
    options: { ...COMMON_OPTIONS, bootstrap: { type: "boolean" }, json: { type: "boolean" }, raw: { type: "boolean" } }, strict: true });

  if(values.help === true) {

    ctx.output.line(USAGE);

    return;
  }

  // An optional category narrows the inventory to one class, reusing the vocabulary `reboot` / `watch state` share. An unknown positional is a usage error rather than a
  // silently-ignored argument. It applies to the summary and `--json`; the full-dump flags below are whole-controller views and ignore it.
  const [categoryArg] = positionals;

  if((categoryArg !== undefined) && !isDeviceCategory(categoryArg)) {

    throw new CliError("Unknown category \"" + categoryArg + "\". Expected one of: " + DEVICE_CATEGORIES.join(", ") + ".", { exitCode: 2 });
  }

  await using client = await ctx.openClient({ debug: values.debug === true, refreshIntervalMs: false, signal: ctx.signal });

  // The raw controller bootstrap, fetched fresh - the full payload, not the modeled state, its keys sorted by the Output serializer like every JSON view (so it is "raw"
  // in the sense of uncurated, not a byte-for-byte reproduction of wire field order). Highest precedence since it is the most explicit request and a distinct fetch.
  if(values.bootstrap === true) {

    ctx.output.jsonPretty(await client.fetchBootstrap({ signal: ctx.signal }));

    return;
  }

  // The full reduced state, uncurated - every modeled record as the store holds it.
  if(values.raw === true) {

    ctx.output.jsonPretty(serializeState(client.state.snapshot()));

    return;
  }

  if(values.json === true) {

    ctx.output.jsonPretty(buildJson(client, categoryArg));

    return;
  }

  renderPretty(ctx.output, client, categoryArg);
};

// The command descriptor: the handler above plus the one-line summary the usage screen lists it by, so the listing derives from the same object that dispatches.
export const info: CommandSpec = {

  run: infoHandler,
  summary: "Show the controller summary and a device inventory."
};
