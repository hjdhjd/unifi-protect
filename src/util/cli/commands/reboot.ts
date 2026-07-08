/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * reboot.ts: `ufp reboot <device|category|nvr>` - reboot one device, a whole device class, or the UniFi OS controller, via first-class library methods (no raw HTTP).
 */
import { COMMON_OPTIONS, CliError } from "../shared.ts";
import type { CommandContext, CommandHandler, CommandSpec } from "../shared.ts";
import { devicesInCategory, findDeviceMatches, isDeviceCategory } from "../lookup.ts";
import type { DeviceCategory } from "../lookup.ts";
import { ProtectAbortedError } from "../../../index.ts";
import type { ProtectClient } from "../../../index.ts";
import { parseArgs } from "node:util";

const USAGE = [

  "Usage: ufp reboot <device|category|nvr> [--debug]",
  "",
  "Reboot a single device, every device of a class, or the UniFi OS controller hosting Protect.",
  "",
  "Targets:",
  "  <device id or name>                                     Reboot that device (it drops and re-adopts).",
  "  cameras | lights | sensors | chimes | viewers | relays  Reboot every connected device of that class.",
  "  nvr                                                     Reboot the whole controller/console - every device drops; the library recovers automatically.",
  "",
  "An exact device id or name always wins over a category word, so a device named like a category is never mistaken for the class.",
  "",
  "Options:",
  "  --debug     Emit the library's debug logging to stderr.",
  "  -h, --help  Show this help.",
  "",
  "Examples:",
  "  ufp reboot \"Front Door\"   # one device",
  "  ufp reboot cameras        # every connected camera",
  "  ufp reboot nvr            # the whole console"
].join("\n");

// Reboot every connected device of a class, sequentially. Sequential is deliberate, not accidental serialization: it keeps the per-device output ordered and the cadence
// polite to a controller that may be juggling its own work. Offline devices are skipped (an unreachable device cannot be rebooted) rather than failed; a real
// failure is reported inline and continues the run, and any failure makes the command exit non-zero so a script can tell. A Ctrl-C between devices ends the run cleanly.
async function rebootCategory(ctx: CommandContext, client: ProtectClient, category: DeviceCategory): Promise<void> {

  const devices = devicesInCategory(client, category);

  if(devices.length === 0) {

    ctx.output.line("No " + category + " to reboot.");

    return;
  }

  let rebooted = 0;
  let failures = 0;

  for(const device of devices) {

    // A Ctrl-C aborts the whole tree; stop issuing reboots rather than racing the teardown.
    if(ctx.signal.aborted) {

      break;
    }

    if(!device.isOnline) {

      ctx.output.line("  " + device.name + " (" + device.id + ") - skipped (offline).");

      continue;
    }

    try {

      // Sequential await is intentional - see the function comment. Parallelizing would interleave the per-device output and burst the controller with N reboots at once.
      // eslint-disable-next-line no-await-in-loop
      await device.reboot({ signal: ctx.signal });

      rebooted += 1;

      ctx.output.line("  " + device.name + " (" + device.id + ") - rebooting.");
    } catch(error) {

      // A Ctrl-C surfaces as the reboot throwing ProtectAbortedError; that ends the whole command. Any other failure - a rejected reboot request, a controller error - is
      // reported and the run continues. We key off the error type, not the signal flag, which the compiler narrows across the await.
      if(error instanceof ProtectAbortedError) {

        throw error;
      }

      failures += 1;

      ctx.output.line("  " + device.name + " (" + device.id + ") - failed: " + ((error instanceof Error) ? error.message : String(error)));
    }
  }

  // On a clean run, a plain summary; on any failure, a CliError carries the summary to stderr and sets a non-zero exit so a script can detect it.
  if(failures > 0) {

    throw new CliError("Rebooted " + rebooted.toString() + " of " + devices.length.toString() + " " + category + "; " + failures.toString() + " failed.");
  }

  ctx.output.line("Rebooted " + rebooted.toString() + " " + category + ".");
}

/**
 * `ufp reboot`. The target `nvr` (or `controller`) reboots the whole console via {@link ProtectClient.reboot}; a device category (`cameras`/`lights`/...) reboots every
 * connected device of that class; any other token is resolved to a single device and rebooted via its {@link DeviceProjection.reboot}. Resolution is device-first - an
 * exact id or unique name wins over a category word - because reboot is destructive and an operator who named a specific device must never reboot a whole class by
 * accident. Neither path touches raw HTTP. The command issues the reboot(s) and returns; watching the controller drop and come back - the realtime events resuming on
 * `watch events`, or a re-run of `doctor` reporting a healthy connection - is a separate concern from issuing the reboot.
 *
 * @category CLI
 */
const rebootHandler: CommandHandler = async (ctx) => {

  const { positionals, values } = parseArgs({ allowPositionals: true, args: ctx.args, options: { ...COMMON_OPTIONS }, strict: true });

  if(values.help === true) {

    ctx.output.line(USAGE);

    return;
  }

  const [target] = positionals;

  if(target === undefined) {

    throw new CliError("Specify a device by id or name, a device category (cameras, lights, ...), or \"nvr\" for the controller. Run \"ufp reboot --help\".",
      { exitCode: 2 });
  }

  // A one-shot action, so the periodic bootstrap-refresh failsafe is disabled (`refreshIntervalMs: false`): we connect, issue the reboot(s), and exit, so there is no
  // long-lived session for that failsafe to guard.
  await using client = await ctx.openClient({ debug: values.debug === true, refreshIntervalMs: false, signal: ctx.signal });

  const lower = target.toLowerCase();

  if((lower === "nvr") || (lower === "controller")) {

    await client.reboot({ signal: ctx.signal });

    ctx.output.line("Rebooting the UniFi Protect controller (" + (client.controllerName ?? "console") + ").");

    return;
  }

  // Device-first resolution: an explicit id or unique name takes precedence over a category word, so a destructive bulk reboot never fires when the operator named a
  // single device. Only a token that matches no device at all falls through to the category interpretation.
  const matches = findDeviceMatches(client, target);

  if(matches.length > 1) {

    throw new CliError("\"" + target + "\" matches " + matches.length.toString() + " devices by name; use the device id to disambiguate.");
  }

  const [device] = matches;

  if(device !== undefined) {

    await device.reboot({ signal: ctx.signal });

    ctx.output.line("Rebooting " + device.modelKey + " \"" + device.name + "\" (" + device.id + ").");

    return;
  }

  if(isDeviceCategory(target)) {

    await rebootCategory(ctx, client, target);

    return;
  }

  throw new CliError("No device or category matches \"" + target + "\". Run \"ufp reboot --help\".", { exitCode: 2 });
};

// The command descriptor: the handler above plus the one-line summary the usage screen lists it by, so the listing derives from the same object that dispatches.
export const reboot: CommandSpec = {

  run: rebootHandler,
  summary: "Reboot a device, a whole device class, or the controller."
};
