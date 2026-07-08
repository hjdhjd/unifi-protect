/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * update.ts: `ufp update <device> --patch <json>` - apply a configuration change to a device, with a --dry-run preview.
 */
import { COMMON_OPTIONS, CliError } from "../shared.ts";
import type { CommandHandler, CommandSpec } from "../shared.ts";
import type { DeviceProjection, ProtectDeviceConfig } from "../../../index.ts";
import { findDevice } from "../lookup.ts";
import { parseArgs } from "node:util";

const USAGE = [

  "Usage: ufp update <device> --patch <json> [--dry-run] [--debug]",
  "",
  "Apply a configuration change to a device by PATCHing it on the controller.",
  "",
  "Options:",
  "  --patch <json>  The configuration change as a JSON object, e.g. --patch '{\"name\":\"Front Door\"}'.",
  "  --dry-run       Print what would be sent without contacting the controller.",
  "  --debug         Emit the library's debug logging to stderr.",
  "  -h, --help      Show this help.",
  "",
  "Examples:",
  "  ufp update \"Front Door\" --patch '{\"name\":\"Front Porch\"}'",
  "  ufp update \"Front Door\" --patch '{\"name\":\"Front Porch\"}' --dry-run   # preview, no controller call",
  "",
  "Note: the change is reflected once the realtime stream (or the next refresh) delivers it, not synchronously - observe the device rather than read-after-write."
].join("\n");

/**
 * `ufp update`. Resolves the device, parses the `--patch` JSON, and either previews it (`--dry-run`) or applies it through the device's write-through `update`. The patch
 * is arbitrary user JSON, so it crosses into the typed `update` through a single explicit cast at this boundary; the controller validates it and the library surfaces a
 * typed error (e.g. `ProtectAuthorizationError` when the account is not admin) on rejection.
 *
 * @category CLI
 */
const updateHandler: CommandHandler = async (ctx) => {

  const { positionals, values } = parseArgs({ allowPositionals: true, args: ctx.args,
    options: { ...COMMON_OPTIONS, "dry-run": { type: "boolean" }, patch: { type: "string" } }, strict: true });

  if(values.help === true) {

    ctx.output.line(USAGE);

    return;
  }

  const [target] = positionals;

  if(target === undefined) {

    throw new CliError("Specify a device by id or name. Run \"ufp update --help\".", { exitCode: 2 });
  }

  if(values.patch === undefined) {

    throw new CliError("Provide the configuration change as a JSON object via --patch.", { exitCode: 2 });
  }

  let patch: unknown;

  try {

    patch = JSON.parse(values.patch);
  } catch(error) {

    throw new CliError("The --patch value is not valid JSON.", { cause: error, exitCode: 2 });
  }

  if((typeof patch !== "object") || (patch === null) || Array.isArray(patch)) {

    throw new CliError("The --patch value must be a JSON object.", { exitCode: 2 });
  }

  await using client = await ctx.openClient({ debug: values.debug === true, refreshIntervalMs: false, signal: ctx.signal });

  const device = findDevice(client, target);

  if(values["dry-run"] === true) {

    ctx.output.line("Dry run: would PATCH " + device.modelKey + " \"" + device.name + "\" (" + device.id + ") with:");
    ctx.output.jsonPretty(patch);

    return;
  }

  // The patch is arbitrary user JSON - it cannot be type-checked against a specific device category at compile time - so we cross into the generically-typed `update`
  // through one explicit cast on the shared base. The controller is the validator; a rejected patch surfaces as a typed error.
  await (device as unknown as DeviceProjection<ProtectDeviceConfig>).update(patch, { signal: ctx.signal });

  ctx.output.line("Updated " + device.modelKey + " \"" + device.name + "\" (" + device.id + ").");
};

// The command descriptor: the handler above plus the one-line summary the usage screen lists it by, so the listing derives from the same object that dispatches.
export const update: CommandSpec = {

  run: updateHandler,
  summary: "Apply a configuration change to a device."
};
