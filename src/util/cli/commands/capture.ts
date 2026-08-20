/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * capture.ts: `ufp capture` - observe a controller against the known schema and emit one scrubbed bundle carrying whatever it says that this library does not model.
 */
import { COMMON_OPTIONS, axisMatches, boundedSignal, compileAxis, parseDuration, readVersion } from "../shared.ts";
import type { CommandHandler, CommandSpec, CompiledAxis } from "../shared.ts";
import type { NoveltyFinding, SchemaManifest, UnmodeledSnapshot } from "../manifest.ts";
import { PROTECT_CAPTURE_DEFAULT_DURATION, PROTECT_CAPTURE_SNAPSHOT_EXEMPLARS } from "../../../settings.ts";
import { channels, subscribeToChannel } from "../../../index.ts";
import { createScrubContext, scrub } from "../scrub.ts";
import { diffBootstrap, diffEventType, diffRecord, eventTypeOf, loadSchemaManifest, noveltyKey, snapshotUnmodeled } from "../manifest.ts";
import { fileStamp, formatDuration, serializeJson } from "../output/format.ts";
import type { AnyProtectDiagnosticsChannel } from "../../../index.ts";
import { DEVICE_CATEGORIES } from "../lookup.ts";
import { ProtectClient } from "../../../index.ts";
import type { RawPacket } from "../../../index.ts";
import type { TypedEvent } from "../../../index.ts";
import { parseArgs } from "node:util";
import path from "node:path";
import { writeFile } from "node:fs/promises";

const USAGE = [

  "Usage: ufp capture [--device <list>] [--duration <dur>] [--out <path>] [--debug]",
  "",
  "Watch the controller against the schema this package was built with, and write one scrubbed, self-contained bundle describing anything",
  "it says that this library does not model - an unrecognized device class, an undeclared field, an unknown event type - together with the",
  "traffic that evidences it. Every identifying value is replaced by a stable pseudonym before anything is written, so the bundle can be",
  "sent on as-is.",
  "",
  "Options:",
  "  --device <list>   Also follow these devices by name or id (substring or * / ? globs), whether or not they look new.",
  "  --duration <dur>  How long to watch: 30s, 5m, 1h. Defaults to 15 minutes.",
  "  --out <path>      Write the bundle here instead of a timestamped file in the working directory.",
  "  --debug           Emit the library's debug logging to stderr.",
  "  -h, --help        Show this help.",
  "",
  "Examples:",
  "  npx -p unifi-protect ufp capture --device \"Air\"  # follow a new sensor by name and send back the one file this writes",
  "  ufp capture                                      # watch everything, reporting whatever the controller says that this version does not know",
  "  ufp capture --duration 2m --out /tmp/ufp.json    # a short run written where you want it"
].join("\n");

const OPTIONS = {

  ...COMMON_OPTIONS,
  device: { type: "string" },
  duration: { type: "string" },
  out: { type: "string" }
} as const;

// The channels whose observations explain a window rather than describe schema. A reconnect, a reboot, or a throttle in the middle of a capture is why a device went
// quiet for two minutes, and without these the bundle would show an unexplained gap in the traffic.
const HEALTH_CHANNELS = [ channels.connectionTransition, channels.connectionRebootDetected, channels.eventsReconnecting, channels.httpThrottleEntered,
  channels.httpThrottleExited ];

// Why a device is being followed. A device can be here for both reasons at once, which is worth recording: it says the operator asked for the very device that also
// turned out to be new.
type SelectionReason = "deviceFlag" | "novelty";

// One channel publication, stamped against the start of the window so a reader can line it up with the frames around it rather than against a wall clock.
interface Observation {

  atMs: number;
  channel: string;
  payload: unknown;
}

// A novelty finding plus how many times it was seen. The evidence is the first observation; a device that repeats itself increments the count rather than appending,
// so a chatty new device cannot bury everything else in the bundle.
type NoveltyEntry = NoveltyFinding & { occurrenceCount: number };

// What one window accumulates. Every one of these dies with the command - nothing here is persisted, and nothing survives to need resetting.
interface Window {

  cadence: Map<string, Map<string, number>>;
  connection: Observation[];
  drift: Observation[];
  novelty: Map<string, NoveltyEntry>;
  occurrences: TypedEvent[];
  occurrencesSeen: number;
  raw: RawPacket[];
  rawSeen: number;
  startedAt: number;
  subjects: Map<string, Set<SelectionReason>>;
  unmodeled: UnmodeledSnapshot[];
}

// Record a device as one to follow, keeping any reason it was already followed for.
function follow(window: Window, id: string, reason: SelectionReason): void {

  const reasons = window.subjects.get(id);

  if(reasons === undefined) {

    window.subjects.set(id, new Set([reason]));

    return;
  }

  reasons.add(reason);
}

// Merge findings into the window's accumulation, keeping the first evidence of each and counting repeats. Identity comes from the finding itself, so the same
// undeclared field on two different records stays two findings while the same one seen twice stays one.
function accumulate(window: Window, findings: readonly NoveltyFinding[]): boolean {

  let novel = false;

  for(const finding of findings) {

    const key = noveltyKey(finding);
    const existing = window.novelty.get(key);

    novel = true;

    if(existing === undefined) {

      window.novelty.set(key, { ...finding, occurrenceCount: 1 });

      continue;
    }

    existing.occurrenceCount += 1;
  }

  return novel;
}

// Whether a value is a plain JSON object. A raw frame's payload is whatever the codec produced - parsed JSON, a UTF-8 string, or a buffer - and only the first has
// fields to read, so everything else is left alone rather than walked as though it were a record.
function isPlainObject(value: unknown): value is Record<string, unknown> {

  if((typeof value !== "object") || (value === null)) {

    return false;
  }

  const prototype: unknown = Object.getPrototypeOf(value);

  return (prototype === Object.prototype) || (prototype === null);
}

// Read a record's own id and name, structurally. It matches `--device` against the fetched bootstrap and against an arriving frame without asserting anything about the
// shape of a record this version may never have seen.
function identityOf(record: unknown): { id: string; name: string } {

  if(!isPlainObject(record)) {

    return { id: "", name: "" };
  }

  return { id: (typeof record["id"] === "string") ? record["id"] : "", name: (typeof record["name"] === "string") ? record["name"] : "" };
}

// Seed the subjects from the fetched bootstrap: everything the diff found novelty in, plus everything `--device` names. Matching runs against this same document rather
// than the connect-time snapshot, so one bootstrap generation feeds both the diff and the targeting and the two can never disagree.
function seedSubjects(window: Window, manifest: SchemaManifest, bootstrap: unknown, device: CompiledAxis | undefined): void {

  for(const entry of window.novelty.values()) {

    if(entry.kind === "unknownField") {

      // A field finding names the record it was found on, which is the device worth following.
      follow(window, entry.recordId, "novelty");
    }

    if(entry.kind === "unknownModelKey") {

      follow(window, entry.recordId, "novelty");
    }
  }

  if((device === undefined) || !isPlainObject(bootstrap)) {

    return;
  }

  for(const [ collection, value ] of Object.entries(bootstrap)) {

    // Only the described collections are worth matching names against; an opaque or scalar member holds no device records to target.
    if(!Array.isArray(value) || !(collection in manifest.records)) {

      continue;
    }

    for(const record of value) {

      const { id, name } = identityOf(record);

      if((id !== "") && axisMatches(device, [ id, name ])) {

        follow(window, id, "deviceFlag");
      }
    }
  }
}

// Tally a patched device's top-level field names, so the bundle shows what a followed device actually reports and how often - the cadence that says whether a metric
// updates every few seconds or once an hour.
function tallyCadence(window: Window, id: string, payload: unknown): void {

  if(!isPlainObject(payload)) {

    return;
  }

  const fields = window.cadence.get(id) ?? new Map<string, number>();

  for(const field of Object.keys(payload)) {

    fields.set(field, (fields.get(field) ?? 0) + 1);
  }

  window.cadence.set(id, fields);
}

/* Consume the raw rail: the only writer of the subject map, and the rail where novelty is actually visible.
 *
 * The split between this rail and the events rail is structural rather than stylistic. An unknown model key and an unknown event type both classify to `null`, so
 * neither ever reaches the typed event firehose - checking for them there would capture nothing at all.
 *
 * Each frame is diffed before its keep decision is made, so a device that turns novel mid-window joins the subject map in time for its own triggering frame to be
 * kept. Doing it the other way round would lose the very frame that proved the device was worth following.
 */
async function consumeRaw(source: AsyncIterable<RawPacket>, window: Window, manifest: SchemaManifest, device: CompiledAxis | undefined): Promise<void> {

  for await (const packet of source) {

    const { action, id, modelKey } = packet.header;

    window.rawSeen += 1;

    // A state-transition frame carries a record, so it can be diffed against the manifest as it arrives. The predicate is read from the header against the manifest's
    // own vocabulary rather than from the classified stream, which would never show an unmodeled class at all.
    if(manifest.modelKeys.state.includes(modelKey) && ((action === "add") || (action === "update")) && isPlainObject(packet.payload)) {

      if(accumulate(window, diffRecord(manifest, { modelKey, record: packet.payload, recordId: id }))) {

        follow(window, id, "novelty");
      }
    }

    // A device appearing mid-window under a name the operator asked for joins the same way an already-present one did. Only a device-addressable class is eligible: a
    // user, a liveview, and other reduced records carry names too, and matching one of those would follow something that is not a device at all.
    if((device !== undefined) && (action === "add") && manifest.modelKeys.device.includes(modelKey) &&
      axisMatches(device, [ id, identityOf(packet.payload).name ])) {

      follow(window, id, "deviceFlag");
    }

    const followed = window.subjects.has(id);
    const unknownModelKey = !manifest.modelKeys.known.includes(modelKey);
    const eventType = eventTypeOf(packet);
    const unknownEventType = (eventType !== undefined) && !manifest.eventTypes.includes(eventType);

    if(unknownModelKey) {

      accumulate(window, diffRecord(manifest, { modelKey, record: packet.payload, recordId: id }));
    }

    if(unknownEventType) {

      accumulate(window, diffEventType(manifest, eventType));
    }

    if(!followed && !unknownModelKey && !unknownEventType) {

      continue;
    }

    if(followed && (action === "update")) {

      tallyCadence(window, id, packet.payload);
    }

    window.raw.push(packet);
  }
}

// Consume the events rail. It only reads the subject map - an occurrence is kept when it concerns a device being followed - and never grows it, so the two rails have
// exactly one writer between them and a frame is judged against the map as of the moment it arrived.
async function consumeEvents(source: AsyncIterable<TypedEvent>, window: Window): Promise<void> {

  for await (const event of source) {

    window.occurrencesSeen += 1;

    if(ProtectClient.eventSubjects(event).some((subject) => window.subjects.has(subject))) {

      window.occurrences.push(event);
    }
  }
}

// Read the device inventory from the live reduced state. Taken at the end of the run rather than from the connect-time document, so a device adopted while the window
// was open is described here alongside the traffic that announced it.
function readInventory(client: ProtectClient): Record<string, unknown>[] {

  const snapshot = client.state.snapshot();
  const inventory: Record<string, unknown>[] = [];

  for(const category of DEVICE_CATEGORIES) {

    for(const record of snapshot[category].values()) {

      inventory.push({ firmware: record.firmwareVersion, id: record.id, marketName: record.marketName, modelKey: record.modelKey, type: record.type });
    }
  }

  return inventory;
}

// Read the controller's own versions from the live reduced state, taken at the same finalize-time moment as the inventory. Which Protect application and which firmware
// produced a capture is the first thing anyone reading one needs, because a wire shape this library does not model is often just a controller newer than the version
// that was built against it. Both read null when the reduced state carries no NVR record, which is where a run that never completed a bootstrap would be.
function readControllerVersions(client: ProtectClient): { firmwareVersion: string | null; version: string | null } {

  const { nvr } = client.state.snapshot();

  return { firmwareVersion: nvr?.firmwareVersion ?? null, version: nvr?.version ?? null };
}

// Assemble the bundle. The keys are alphabetical because the lint rule that governs every object literal in this package says so, which happens to read well too: the
// window's own observations come before the evidence they explain.
function assembleBundle(window: Window, client: ProtectClient, manifest: SchemaManifest, mode: string, endedAt: number): Record<string, unknown> {

  return {

    cadence: Object.fromEntries([...window.cadence].map(([ id, fields ]) => [ id, Object.fromEntries(fields) ])),
    connection: window.connection,
    drift: window.drift,
    frames: {

      // The two rails carry structurally different elements - a classified occurrence is not a decoded frame - so they stay separate arrays rather than being merged
      // into one. Each records how many it saw beside what it kept, which is what makes an exclusion count meaningful rather than a bare number.
      occurrences: { kept: window.occurrences, seen: window.occurrencesSeen },
      raw: { kept: encodeBinaryPayloads(window.raw), seen: window.rawSeen }
    },
    inventory: readInventory(client),
    novelty: [...window.novelty.values()],
    run: {

      controller: readControllerVersions(client),
      manifestVersion: manifest.version,
      mode,
      selection: Object.fromEntries([...window.subjects].map(([ id, reasons ]) => [ id, [...reasons].sort() ])),
      tool: readVersion(),
      window: { durationMs: endedAt - window.startedAt, endedAt, startedAt: window.startedAt }
    },
    unmodeled: window.unmodeled
  };
}

// Carry a raw frame's binary payload as an explicitly-wrapped base64 string. Left to `JSON.stringify`, a buffer serializes as an object keyed by byte index, which is
// both enormous and lossy about what it was. The wrapper says what it holds, and the scrub leaves the encoded bytes alone rather than mangling base64 text that happens
// to look like a hardware address.
function encodeBinaryPayloads(packets: readonly RawPacket[]): RawPacket[] {

  return packets.map((packet) => ArrayBuffer.isView(packet.payload) ?
    { header: packet.header, payload: { bytes: Buffer.from(packet.payload.buffer, packet.payload.byteOffset, packet.payload.byteLength).toString("base64"),
      encoding: "base64" } } : packet);
}

/**
 * Build the `ufp capture` handler.
 *
 * The manifest is the command's one file-system dependency beyond the bundle it writes, so it arrives as a parameter rather than being reached for inside the flow.
 * The default is the shipped manifest, which is what the registered command uses and therefore what production runs; a test supplies a fixture loader instead, so the
 * novelty a run reports is decided by a manifest the test can read beside its assertions rather than by whatever the last build happened to emit.
 *
 * @param loadManifest - How to obtain the schema manifest; defaults to the one this package ships.
 *
 * @returns The command handler.
 *
 * @category CLI
 */
export function createCaptureHandler(loadManifest: () => Promise<SchemaManifest> = loadSchemaManifest): CommandHandler {

  return async (ctx) => {

    const { values } = parseArgs({ allowPositionals: true, args: ctx.args, options: OPTIONS, strict: true });

    if(values.help === true) {

      ctx.output.line(USAGE);

      return;
    }

    const durationMs = (values.duration !== undefined) ? parseDuration(values.duration, "--duration") : PROTECT_CAPTURE_DEFAULT_DURATION;
    const device = compileAxis(values.device, "substring");
    const manifest = await loadManifest();
    const window: Window = {

      cadence: new Map(),
      connection: [],
      drift: [],
      novelty: new Map(),
      occurrences: [],
      occurrencesSeen: 0,
      raw: [],
      rawSeen: 0,
      startedAt: Date.now(),
      subjects: new Map(),
      unmodeled: []
    };

    // Route one channel's publications into a list, stamped against the start of the window. Curried so the two destinations - schema drift and connection health - each
    // get a subscriber factory rather than repeating the stamping at every channel.
    const observe = (into: Observation[]): ((channel: AnyProtectDiagnosticsChannel) => Disposable) => {

      return (channel) => subscribeToChannel(channel, (payload) => void into.push({ atMs: Date.now() - window.startedAt, channel: String(channel.name), payload }));
    };

    // Subscribe before connecting, so the connect handshake's own signals are part of the record. The drift channels say the library met something it does not model;
    // the health channels say why the traffic stopped for a while, which is the difference between an unexplained gap and a reconnect.
    using _unknownModelKeyDrift = observe(window.drift)(channels.schemaUnknownModelKey);
    using _unmodeledCollectionDrift = observe(window.drift)(channels.schemaUnmodeledCollection);
    using healthObservations = new DisposableStack();

    for(const channel of HEALTH_CHANNELS) {

      healthObservations.use(observe(window.connection)(channel));
    }

    await using client = await ctx.openClient({ debug: values.debug === true, signal: ctx.signal });

    // A fresh bootstrap rather than the connect-time snapshot: it is the whole document, including the collections the reducer does not model, which is exactly where an
    // unrecognized device class shows up. It is consumed structurally throughout - casting it to the library's own bootstrap type would assert the very thing being
    // checked.
    const bootstrap = await client.fetchBootstrap({ signal: ctx.signal });

    accumulate(window, diffBootstrap(manifest, bootstrap));

    // The findings say which collections this version cannot place; the exemplars say what the records in them look like. A class with no described shape produces no
    // field-level evidence anywhere else in the bundle, so this is the only thing a reader could model one from, and it comes from the same document the diff read.
    window.unmodeled = snapshotUnmodeled(manifest, bootstrap, PROTECT_CAPTURE_SNAPSHOT_EXEMPLARS);

    seedSubjects(window, manifest, bootstrap, device);

    const mode = (device === undefined) ? "discovery" : "targeted";

    ctx.output.line("Watching for " + formatDuration(durationMs) + ". Use the device so its telemetry is captured. Press Ctrl-C to stop early.");

    if(window.novelty.size > 0) {

      ctx.output.line("The controller already describes " + window.novelty.size.toString() + " thing(s) this version does not model; following them.");
    }

    // Both rails run under one window. They end together on whichever comes first, the duration or Ctrl-C, and the join waits for both so nothing is assembled while a
    // rail is still delivering. Each rail smooths the caller's own abort into a clean return, so an ordinary ending - the timer or Ctrl-C alike - settles as fulfilled
    // and the fulfilled pair below is the normal path.
    const windowSignal = boundedSignal(ctx.signal, durationMs);
    const settled = await Promise.allSettled([

      consumeRaw(client.rawPackets({ signal: windowSignal }), window, manifest, device),
      consumeEvents(client.events({ signal: windowSignal }), window)
    ]);

    // Assemble in memory and write once. The write is deliberately not signal-gated: by construction this runs while the signal is already aborted, so gating it would
    // refuse to save the very evidence the run exists to produce.
    const bundle = assembleBundle(window, client, manifest, mode, Date.now());
    const target = path.resolve(values.out ?? ("ufp-capture-" + fileStamp() + ".json"));

    // One scrub context for the whole bundle, so a device referenced from a frame, a finding, and the inventory is recognizably the same device afterward while none of
    // its real identifiers survive.
    await writeFile(target, serializeJson(scrub(bundle, createScrubContext()), { pretty: true }) + "\n", "utf8");

    ctx.output.line("Wrote " + target);
    ctx.output.line("Send that file back - it carries the evidence and no secrets.");

    // A rail that died is abnormal, because an ordinary ending is a clean return. The bundle is already written and its path already printed, so the evidence survives
    // the failure; the error is then surfaced the way every other command surfaces one.
    const failed = settled.find((result) => result.status === "rejected");

    if(failed !== undefined) {

      throw failed.reason;
    }
  };
}

/**
 * `ufp capture`. Fetches a fresh bootstrap, diffs it against the schema manifest this package ships, then watches both realtime rails for the rest of the window and
 * writes one scrubbed bundle describing everything the controller said that this library does not model.
 *
 * The command exists to make one ask of a field user possible: run this, send back the file. So the bundle is the product and standard output is only narration, the
 * scrub is unconditional rather than a flag, and Ctrl-C at any point after the diff still writes a usable file.
 *
 * @category CLI
 */
export const capture: CommandSpec = {

  run: createCaptureHandler(),
  summary: "Watch the controller against the known schema and write one scrubbed bundle of whatever this version does not model."
};
