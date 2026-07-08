/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * doctor.ts: `ufp doctor` - a structured, per-subsystem health check exercising every public surface of the library. The canonical "is my install healthy?" command.
 */
import type { Camera, ProtectClient } from "../../../index.ts";
import type { CommandHandler, CommandSpec } from "../shared.ts";
import { DEVICE_CATEGORIES, devicesInCategory } from "../lookup.ts";
import { COMMON_OPTIONS } from "../shared.ts";
import type { Output } from "../output/format.ts";
import { channels } from "../../../index.ts";
import { parseArgs } from "node:util";

const USAGE = [

  "Usage: ufp doctor [--json] [--debug]",
  "",
  "Run a structured health check of every library subsystem against the controller and report pass/fail per check.",
  "Exits non-zero if any check fails, so it is usable as a monitoring probe.",
  "",
  "Options:",
  "  --json      Emit the results as a JSON object instead of a report.",
  "  --debug     Emit the library's debug logging to stderr.",
  "  -h, --help  Show this help.",
  "",
  "Examples:",
  "  ufp doctor                       # human-readable pass/fail report",
  "  ufp doctor --json || echo failed # machine-readable; non-zero exit on any failure"
].join("\n");

// How long to wait for live signals during the health check - long enough that a healthy controller always produces them, short enough that doctor stays a quick probe.
const EVENT_WAIT_MS = 8000;
const LIVESTREAM_WAIT_MS = 12000;

// A single check's verdict. `pass` is healthy, `warn` is a non-fatal observation worth flagging (e.g. zero users seen or schema drift), `fail` is a real problem (and
// fails the exit code), `skip` means the check did not apply (e.g. no online camera to snapshot, so there is nothing to test).
type CheckStatus = "fail" | "pass" | "skip" | "warn";

interface CheckResult {

  detail?: string;
  name: string;
  status: CheckStatus;
}

// Render a status as a fixed-width, colored tag so the report reads as an aligned column.
function statusTag(output: Output, status: CheckStatus): string {

  switch(status) {

    case "pass":

      return output.colors.green("PASS");

    case "warn":

      return output.colors.yellow("WARN");

    case "fail":

      return output.colors.red("FAIL");

    default:

      return output.colors.dim("SKIP");
  }
}

// Wait for the first realtime event (or time out). A healthy controller broadcasts device-health patches every few seconds, so receiving one proves the events channel is
// flowing end to end. Returns the kind of the first event seen, or null on timeout.
async function firstEvent(client: ProtectClient, signal: AbortSignal): Promise<string | null> {

  const deadline = AbortSignal.any([ signal, AbortSignal.timeout(EVENT_WAIT_MS) ]);

  for await (const event of client.events({ signal: deadline })) {

    return event.kind;
  }

  return null;
}

// Subscribe to a camera's livestream just long enough to confirm an init segment (with a codec) and at least one media segment arrive, then leave. Proves the livestream
// pool, session negotiation, and frame decode all work against real hardware.
async function probeLivestream(camera: Camera, signal: AbortSignal): Promise<{ codec: string; init: boolean; media: boolean }> {

  const deadline = AbortSignal.any([ signal, AbortSignal.timeout(LIVESTREAM_WAIT_MS) ]);

  await using sub = camera.livestream({ signal: deadline, source: { channel: 0, type: "channel" } });

  let codec = "";
  let init = false;
  let media = false;

  for await (const segment of sub) {

    if(segment.type === "init") {

      init = true;
      codec = segment.codec;
    } else {

      media = true;
    }

    if(init && media) {

      break;
    }
  }

  return { codec, init, media };
}

// Render the report as an aligned list of checks plus a summary, returning whether every check passed (for the exit code).
function renderReport(output: Output, results: CheckResult[]): boolean {

  for(const result of results) {

    const detail = (result.detail !== undefined) ? ("  " + output.colors.dim(result.detail)) : "";

    output.line(statusTag(output, result.status) + "  " + output.colors.bold(result.name) + detail);
  }

  const passed = results.filter((result) => result.status === "pass").length;
  const warned = results.filter((result) => result.status === "warn").length;
  const failed = results.filter((result) => result.status === "fail").length;

  output.line();
  output.line(output.colors.bold(passed.toString() + " passed, " + warned.toString() + " warnings, " + failed.toString() + " failed."));

  return failed === 0;
}

/**
 * `ufp doctor`. Connects once and exercises every public subsystem as a discrete check: state and derived selectors, device projections, snapshot, the realtime firehose,
 * the connection monitor, the livestream pool, the diagnostics channels (asserted to fire during the run), schema drift (unknown modelKeys), and the user roster
 * (populated at connect, the precondition for `isAdmin` to derive correctly). Designed as a permanent health probe: it exits non-zero if any check fails.
 *
 * @category CLI
 */
const doctorHandler: CommandHandler = async (ctx) => {

  const { values } = parseArgs({ allowPositionals: true, args: ctx.args, options: { ...COMMON_OPTIONS, json: { type: "boolean" } }, strict: true });

  if(values.help === true) {

    ctx.output.line(USAGE);

    return;
  }

  const results: CheckResult[] = [];

  // Every check runs through this single chokepoint: it centralizes turning an unexpected thrown error into a `fail` result, so one probe's crash demotes to a failed
  // check rather than aborting the whole doctor run and taking the remaining checks down with it.
  const check = async (name: string, run: () => Promise<Omit<CheckResult, "name">>): Promise<void> => {

    try {

      results.push({ name, ...(await run()) });
    } catch(error) {

      results.push({ detail: (error instanceof Error) ? error.message : String(error), name, status: "fail" });
    }
  };

  // Observe which diagnostics channels fire during the run, and capture any schema-drift signals, by subscribing before we connect so the connect handshake's own
  // diagnostics are counted.
  const fired = new Set<string>();
  const unknownModelKeys = new Set<string>();
  const unmodeledDrift = new Set<string>();
  const unmodeledRecognized = new Set<string>();
  const subscriptions = Object.values(channels).map((channel) => {

    const name = String(channel.name);
    const handler = (message: unknown): void => {

      fired.add(name);

      if((name === "unifi-protect:schema:unknownModelKey") && (typeof message === "object") && (message !== null) && ("modelKey" in message)) {

        unknownModelKeys.add(String((message).modelKey));
      }

      // The bootstrap-dimension twin, split by the payload's `known` flag so it mirrors the realtime dimension's severity: a class the library does not recognize at
      // all (known:false) is genuine drift and warns, while a recognized-but-unreduced class (known:true, e.g. aiport) is named as an informational pass detail.
      if((name === "unifi-protect:schema:unmodeledCollection") && (typeof message === "object") && (message !== null) && ("modelKey" in message) &&
        ("known" in message)) {

        ((message).known === true ? unmodeledRecognized : unmodeledDrift).add(String((message).modelKey));
      }
    };

    channel.subscribe(handler);

    return { channel, handler };
  });

  let client: ProtectClient | undefined;

  try {

    // The connect itself is the first check; a failure here aborts the rest (there is nothing to test without a client).
    try {

      client = await ctx.openClient({ debug: values.debug === true, signal: ctx.signal });
      results.push({ detail: "connected to " + (client.controllerName ?? "the controller"), name: "Connect and authenticate", status: "pass" });
    } catch(error) {

      results.push({ detail: (error instanceof Error) ? error.message : String(error), name: "Connect and authenticate", status: "fail" });

      const ok = (values.json === true) ? false : renderReport(ctx.output, results);

      if(values.json === true) {

        ctx.output.jsonPretty({ ok, results });
      }

      process.exitCode = 1;

      return;
    }

    const connected = client;
    const snapshot = connected.state.snapshot();

    await check("State and bootstrap", () => Promise.resolve({

      // The inventory line is built off the canonical DEVICE_CATEGORIES vocabulary rather than a hand-listed set, so a newly modeled device class (the relay) appears
      // here automatically and the count can never drift from the categories `info` / `reboot` / `watch state` share.
      detail: DEVICE_CATEGORIES.map((category) => devicesInCategory(connected, category).length.toString() + " " + category).join(", "),
      status: (snapshot.nvr !== null) ? "pass" : "fail"
    }));

    await check("Derived state (selectors)", () => Promise.resolve({

      detail: "isAdmin=" + connected.isAdmin.toString() + ", controllerName=" + (connected.controllerName ?? "null"),
      status: (connected.controllerName !== null) ? "pass" : "fail"
    }));

    await check("User roster (realtime isAdmin)", () => Promise.resolve({

      detail: snapshot.users.size.toString() + " users reduced into state; isAdmin derives from the authenticated user and advances on the realtime user rail",
      status: (snapshot.users.size > 0) ? "pass" : "warn"
    }));

    const onlineCamera = connected.cameras.find((camera) => camera.isOnline);

    await check("Snapshot", async () => {

      if(onlineCamera === undefined) {

        return { detail: "no online camera to snapshot", status: "skip" };
      }

      const image = await onlineCamera.snapshot({ signal: ctx.signal });
      const isJpeg = (image.length >= 2) && (image[0] === 0xFF) && (image[1] === 0xD8);

      return { detail: onlineCamera.name + ": " + image.length.toString() + " bytes" + (isJpeg ? " (JPEG)" : ""), status: isJpeg ? "pass" : "fail" };
    });

    await check("Realtime event firehose", async () => {

      const kind = await firstEvent(connected, ctx.signal);
      const detail = (kind !== null) ? ("first event: " + kind) : ("no event within " + (EVENT_WAIT_MS / 1000).toString() + "s");

      return { detail, status: (kind !== null) ? "pass" : "fail" };
    });

    await check("Connection monitor", () => Promise.resolve({

      detail: "state=" + connected.connection.state + ", throttled=" + connected.connection.isThrottled.toString(),
      status: connected.connection.isHealthy ? "pass" : "fail"
    }));

    await check("Livestream pool", async () => {

      if(onlineCamera === undefined) {

        return { detail: "no online camera to stream", status: "skip" };
      }

      const { codec, init, media } = await probeLivestream(onlineCamera, ctx.signal);

      return {

        detail: onlineCamera.name + ": init=" + init.toString() + ", media=" + media.toString() + (codec !== "" ? (", codec " + codec) : ""),
        status: (init && media) ? "pass" : "fail"
      };
    });

    await check("Diagnostics channels", () => Promise.resolve({

      detail: fired.size.toString() + " of " + Object.keys(channels).length.toString() + " channels fired during the run",
      status: (fired.has("unifi-protect:events:packet") && fired.has("unifi-protect:http:request:start")) ? "pass" : "warn"
    }));

    await check("Schema drift", () => Promise.resolve({

      // Genuine drift warns; recognition does not. A realtime packet carrying an unknown modelKey, or a bootstrap collection whose class the library does not recognize
      // at all (known:false), is genuine drift and warns. A recognized-but-unreduced bootstrap class (known:true, e.g. aiport) is named as an informational pass detail -
      // the library knows it exists, it just does not project it yet - so it never warns. The detail always lists all three buckets, using a "no X observed" placeholder
      // when a bucket is empty, so a support log always shows the full picture at a glance.
      detail: [
        (unknownModelKeys.size === 0) ? "no unknown modelKeys observed" : ("unknown modelKeys: " + [...unknownModelKeys].join(", ")),
        (unmodeledDrift.size === 0) ? "no unmodeled drift observed" : ("unmodeled drift (known:false): " + [...unmodeledDrift].join(", ")),
        (unmodeledRecognized.size === 0) ? "none recognized-but-unmodeled" : ("recognized-but-unmodeled: " + [...unmodeledRecognized].join(", ") + " (not a defect)")
      ].join("; "),
      status: ((unknownModelKeys.size === 0) && (unmodeledDrift.size === 0)) ? "pass" : "warn"
    }));

    const ok = (values.json === true) ? (results.every((result) => result.status !== "fail")) : renderReport(ctx.output, results);

    if(values.json === true) {

      ctx.output.jsonPretty({ ok, results });
    }

    process.exitCode = ok ? 0 : 1;
  } finally {

    for(const { channel, handler } of subscriptions) {

      channel.unsubscribe(handler);
    }

    if(client !== undefined) {

      await client[Symbol.asyncDispose]();
    }
  }
};

// The command descriptor: the handler above plus the one-line summary the usage screen lists it by, so the listing derives from the same object that dispatches.
export const doctor: CommandSpec = {

  run: doctorHandler,
  summary: "Run a per-subsystem health check against the controller and report pass/fail."
};
