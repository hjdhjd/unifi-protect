/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * capture.test.ts: Unit tests for `ufp capture` - the bundle it writes, what each rail keeps and excludes, mid-window subject growth, the dedup and its granularity,
 * the finalize-time inventory read, the three-phase Ctrl-C contract, and the end-to-end scrub.
 *
 * These live beside the command rather than in the shared commands.test.ts because the fixtures a capture run needs - a manifest, a bootstrap, two scripted rails, and
 * a temporary directory to write into - would dwarf the per-command blocks there. The command's --help path stays in that file's shared table with every other command.
 */
import { ProtectAbortedError, channels } from "../../../index.ts";
import type { ProtectClient, RawPacket, TypedEvent } from "../../../index.ts";
import type { SchemaManifest, SchemaNode } from "../manifest.ts";
import { describe, test } from "node:test";
import { makeCommandContext, makeFakeClient } from "../fake-client.helpers.ts";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import type { FakeClientOptions } from "../fake-client.helpers.ts";
import assert from "node:assert/strict";
import { createCaptureHandler } from "./capture.ts";
import { loadSchemaManifest } from "../manifest.ts";
import path from "node:path";
import { tmpdir } from "node:os";

// A string field, the shape most of the fixture's declarations take.
const text: SchemaNode = { kind: "primitive", types: ["string"] };

/* The manifest a capture run is judged against. Small enough that every declaration is visible beside the assertions, which is what lets a test say "this field is
 * undeclared" and have the reader see why.
 *
 * The sensor tree carries a closed air-quality block, which is where the planted novelty lands; `aiports` is opaque, standing in for a collection the library carries
 * without describing.
 */
const MANIFEST: SchemaManifest = {

  eventTypes: [ "access", "motion", "ring" ],
  modelKeys: {

    collection: [ "camera", "sensor" ],
    device: [ "camera", "nvr", "sensor" ],
    // `user` is recognized without being device-addressable or reduced here, which is exactly the class the --device gate has to decline.
    known: [ "camera", "event", "nvr", "sensor", "user" ],
    state: [ "camera", "nvr", "sensor" ]
  },
  recordKeys: { camera: "cameras", nvr: "nvr", sensor: "sensors" },
  records: {

    aiports: { kind: "opaque" },
    cameras: { fields: { id: text, isMotionDetected: { kind: "primitive", types: ["boolean"] }, mac: text, name: text }, kind: "object", open: false },
    nvr: { fields: { id: text, mac: text, name: text }, kind: "object", open: false },
    sensors: { fields: {

      airQuality: { fields: { aqi: { kind: "primitive", types: ["number"] } }, kind: "object", open: false },
      id: text,
      mac: text,
      name: text
    }, kind: "object", open: false }
  },
  version: "0.0.0-fixture"
};

// A bootstrap with nothing undeclared in it, for the runs whose novelty is meant to arrive on the wire instead.
const CLEAN_BOOTSTRAP = {

  cameras: [{ id: "c1", mac: "AABBCCDDEE01", name: "Front Door" }],
  nvr: { id: "n1", mac: "AABBCCDDEE00", name: "Controller" },
  sensors: [{ airQuality: { aqi: 12 }, id: "s1", mac: "AABBCCDDEE02", name: "Air One" }]
};

// The shape of the bundle the assertions read. Only the members a test looks at are named; the bundle carries more.
interface Bundle {

  cadence: Record<string, Record<string, number>>;
  connection: { atMs: number; channel: string; payload: unknown }[];
  drift: { atMs: number; channel: string; payload: unknown }[];
  frames: { occurrences: { kept: TypedEvent[]; seen: number }; raw: { kept: RawPacket[]; seen: number } };
  inventory: { id: string; modelKey: string }[];
  novelty: { collection?: string; kind: string; occurrenceCount: number; path?: string; recordId?: string }[];
  run: { controller: { firmwareVersion: string | null; version: string | null }; manifestVersion: string; mode: string; selection: Record<string, string[]> };
}

// Build a raw frame.
function frame(modelKey: string, action: string, id: string, payload: unknown): RawPacket {

  return { header: { action, id, modelKey, newUpdateId: "u1" }, payload };
}

/* A frame that runs a side effect the instant capture picks it up.
 *
 * Capture reads every frame's header before doing anything else with it, so a getter there fires at a precise point in the middle of the window - after the connect and
 * the bootstrap diff, and before the bundle is assembled. It is the one hook a test has into a run that is otherwise driven entirely by its scripts, and it is what
 * makes "mid-window" mean mid-window rather than "some time after the command started".
 */
function frameTriggering(source: RawPacket, effect: () => void): RawPacket {

  return { get header(): RawPacket["header"] {

    effect();

    return source.header;
  }, payload: source.payload };
}

// How a test grows the fake's device collections while a run is in flight.
type Adopt = (category: "sensors", spec: { id: string; name: string }) => void;

// What a capture run needs beyond the fake client itself: its arguments, a hook that publishes on the real channels as the client opens, and the Ctrl-C signal.
type RunOptions = FakeClientOptions & { args?: string[]; publish?: () => void; signal?: AbortSignal };

// Run capture against a fixture manifest and a fake client, without assuming a bundle was written - the failure paths drive this half too.
async function runCaptureRaw(options: RunOptions, dir: string, withAdopt?: (adopt: Adopt) => void): Promise<{ stdout: string; thrown?: unknown }> {

  const manifestPath = path.join(dir, "schema-manifest.json");

  await writeFile(manifestPath, JSON.stringify(MANIFEST));

  const { adopt, client } = makeFakeClient({ bootstrap: CLEAN_BOOTSTRAP, ...options });

  withAdopt?.(adopt);

  const { ctx, stdout } = makeCommandContext({ args: options.args ?? [], client, ...((options.signal !== undefined) && { signal: options.signal }) });
  const realOpen = ctx.openClient;

  // Publishing inside the opener lands on the subscriptions capture established before connecting, which is the pattern the doctor and diagnostics tests use.
  ctx.openClient = (opts?: { debug?: boolean; refreshIntervalMs?: number | false; signal?: AbortSignal }): Promise<ProtectClient> => {

    options.publish?.();

    return realOpen(opts);
  };

  const run = createCaptureHandler(() => loadSchemaManifest(manifestPath));

  try {

    await run(ctx);

    return { stdout: stdout() };
  } catch(error) {

    return { stdout: stdout(), thrown: error };
  }
}

// Run capture into a throwaway directory and hand back the parsed bundle.
async function runCapture(options: RunOptions, withAdopt?: (adopt: Adopt) => void): Promise<{ bundle: Bundle; stdout: string }> {

  const dir = await mkdtemp(path.join(tmpdir(), "ufp-capture-"));

  try {

    const out = path.join(dir, "bundle.json");
    const result = await runCaptureRaw({ ...options, args: [ "--out", out, ...(options.args ?? []) ] }, dir, withAdopt);

    assert.equal(result.thrown, undefined, "the run completed");

    return { bundle: JSON.parse(await readFile(out, "utf8")) as Bundle, stdout: result.stdout };
  } finally {

    await rm(dir, { force: true, recursive: true });
  }
}

describe("capture", () => {

  test("writes a parseable bundle naming the manifest it was judged against", async () => {

    const { bundle, stdout } = await runCapture({ nvr: { firmwareVersion: "4.74.88", version: "5.4.24" } });

    assert.equal(bundle.run.manifestVersion, "0.0.0-fixture");
    assert.equal(bundle.run.mode, "discovery");
    assert.match(stdout, /Wrote /);
    assert.match(stdout, /Send that file back/);

    // Which Protect application and which firmware produced a capture is what tells a reader whether an unmodeled shape is drift or simply a newer controller than
    // the version that was built against it. Version strings are not identifying, so they survive the scrub verbatim.
    assert.deepEqual(bundle.run.controller, { firmwareVersion: "4.74.88", version: "5.4.24" });
  });

  test("a bootstrap field the manifest does not declare is reported with its exact path and record", async () => {

    const bootstrap = { ...CLEAN_BOOTSTRAP, sensors: [{ airQuality: { aqi: 12, voc: 7 }, id: "s1", mac: "AABBCCDDEE02", name: "Air One" }] };
    const { bundle } = await runCapture({ bootstrap });
    const finding = bundle.novelty.find((entry) => entry.kind === "unknownField");

    assert.equal(finding?.path, "airQuality.voc");
    assert.equal(finding?.recordId, "s1");
    assert.equal(finding?.collection, "sensors");

    // A device the controller describes in terms this version does not know is a device worth following for the rest of the window.
    assert.deepEqual(bundle.run.selection["s1"], ["novelty"]);
  });

  test("an in-vocabulary frame for a device nobody is following is excluded, and counted", async () => {

    // Presence of the kept frames plus a count field alone would pass a build that kept everything, so the assertion is that this frame is absent AND that the rail
    // reports having seen it.
    const { bundle } = await runCapture({ rawPackets: [frame("camera", "update", "c1", { isMotionDetected: true })] });

    assert.deepEqual(bundle.frames.raw.kept, []);
    assert.equal(bundle.frames.raw.seen, 1);
  });

  test("a frame carrying an unknown event type is kept and reported", async () => {

    const { bundle } = await runCapture({ rawPackets: [frame("event", "add", "e1", { type: "vocThresholdCrossed" })] });

    assert.equal(bundle.frames.raw.kept.length, 1);
    assert.equal(bundle.novelty.filter((entry) => entry.kind === "unknownEventType").length, 1);
  });

  test("a recognized event type is neither novelty nor a reason to keep a frame", async () => {

    // The login audit type specifically: the controller emits it on every authentication, this library's own connect included, so a build that reported it would
    // bury every capture in noise.
    const { bundle } = await runCapture({ rawPackets: [frame("event", "add", "e1", { type: "access" })] });

    assert.deepEqual(bundle.novelty, []);
    assert.deepEqual(bundle.frames.raw.kept, []);
  });

  test("a frame whose model key is outside the vocabulary is kept for that reason alone", async () => {

    // No subject-map entry and no event type: the unknown class is the only thing keeping this frame.
    const { bundle } = await runCapture({ rawPackets: [frame("vocsensor", "add", "v1", { id: "v1" })] });

    assert.equal(bundle.frames.raw.kept.length, 1);
    assert.equal(bundle.novelty.filter((entry) => entry.kind === "unknownModelKey").length, 1);
  });

  test("--device follows a device that is not novel at all", async () => {

    const { bundle } = await runCapture({ args: [ "--device", "Front" ], rawPackets: [frame("camera", "update", "c1", { isMotionDetected: true })] });

    assert.deepEqual(bundle.run.selection["c1"], ["deviceFlag"]);
    assert.equal(bundle.run.mode, "targeted");
    assert.equal(bundle.frames.raw.kept.length, 1);
  });

  test("--device does not follow a non-device record that happens to share the name", async () => {

    // The name match is gated on the device-addressable vocabulary. A user record carries a name too, and following one would put a person's record in a bundle that
    // was asked to follow a camera.
    const { bundle } = await runCapture({ args: [ "--device", "Front" ], rawPackets: [

      frame("user", "add", "u1", { id: "u1", name: "Front Desk" }),
      frame("user", "update", "u1", { name: "Front Desk" })
    ] });

    assert.equal(bundle.run.selection["u1"], undefined, "a user is not a device, whatever it is called");
    assert.deepEqual(bundle.frames.raw.kept, []);
  });

  test("a device that turns novel mid-window is followed from its own triggering frame onward", async () => {

    // The pre-novelty frame arrives while nothing is following this sensor and must be excluded; the frame that reveals the undeclared field must be kept, because it
    // is the evidence; the frame after it must be kept because the device is now followed. Together these fail a build that filters at the end over everything it
    // buffered, and a build that decides a frame's fate before diffing it.
    const { bundle } = await runCapture({ rawPackets: [

      frame("sensor", "update", "s1", { name: "Air One" }),
      frame("sensor", "update", "s1", { airQuality: { voc: 3 } }),
      frame("sensor", "update", "s1", { airQuality: { aqi: 12 } })
    ] });

    assert.equal(bundle.frames.raw.seen, 3);
    assert.equal(bundle.frames.raw.kept.length, 2, "the triggering frame and the one after it");
    assert.deepEqual(bundle.frames.raw.kept.map((packet) => packet.payload), [ { airQuality: { voc: 3 } }, { airQuality: { aqi: 12 } } ]);
    assert.deepEqual(bundle.run.selection["s1"], ["novelty"]);
  });

  test("an undeclared field on the controller singleton resolves through the irregular record key", async () => {

    const { bundle } = await runCapture({ rawPackets: [frame("nvr", "update", "n1", { vocReporting: true })] });
    const finding = bundle.novelty.find((entry) => entry.kind === "unknownField");

    assert.equal(finding?.collection, "nvr");
    assert.equal(finding?.path, "vocReporting");
    assert.equal(finding?.recordId, "n1");
  });

  test("a binary frame payload neither crashes the diff nor invents findings", async () => {

    const { bundle } = await runCapture({ rawPackets: [frame("sensor", "update", "s1", Buffer.from([ 1, 2, 3 ]))] });

    assert.deepEqual(bundle.novelty, []);
    assert.deepEqual(bundle.frames.raw.kept, []);
  });

  test("one finding seen three times is one entry with a count of three", async () => {

    const bootstrap = { ...CLEAN_BOOTSTRAP, sensors: [{ airQuality: { aqi: 12, voc: 7 }, id: "s1", mac: "AABBCCDDEE02", name: "Air One" }] };
    const { bundle } = await runCapture({ bootstrap, rawPackets: [

      frame("sensor", "update", "s1", { airQuality: { voc: 8 } }),
      frame("sensor", "update", "s1", { airQuality: { voc: 9 } })
    ] });

    const fields = bundle.novelty.filter((entry) => entry.kind === "unknownField");

    assert.equal(fields.length, 1, "a chatty device reports one finding, not one per frame");
    assert.equal(fields[0]?.occurrenceCount, 3);
  });

  test("the same undeclared field on two records is two findings", async () => {

    // The counterpart to the dedup above: merging is only correct while identity is fine-grained enough to keep two devices apart.
    const bootstrap = { ...CLEAN_BOOTSTRAP, sensors: [

      { airQuality: { aqi: 12, voc: 7 }, id: "s1", mac: "AABBCCDDEE02", name: "Air One" },
      { airQuality: { aqi: 13, voc: 8 }, id: "s2", mac: "AABBCCDDEE03", name: "Air Two" }
    ] };

    const { bundle } = await runCapture({ bootstrap });
    const fields = bundle.novelty.filter((entry) => entry.kind === "unknownField");

    assert.equal(fields.length, 2);
    assert.deepEqual(fields.map((entry) => entry.recordId).sort(), [ "s1", "s2" ]);
  });

  test("one scrub context spans the whole bundle, so an identifier reads the same wherever it surfaces", async () => {

    /* Both directions of the referential guarantee, read from the written file rather than from the scrub's own state - this test exists to catch a capture-layer
     * regression that scrubs different parts of the bundle with different contexts, which the scrub module's own tests cannot see.
     *
     * The record id reaches the bundle by two independent routes: the bootstrap diff writes it into a novelty finding, and the raw rail writes it into a kept frame's
     * header. Split the contexts and those two stop naming one device. The address does the same across two field kinds: one the manifest declares and one it has
     * never heard of, which is where shape-driven replacement has to reach or novelty evidence would leak. A third, different address holds the distinctness side, so
     * a build that collapsed everything onto a single token fails here too.
     */
    const id = "01234567-89ab-cdef-0123-456789abcdef";
    const bootstrap = { ...CLEAN_BOOTSTRAP, sensors: [{ airQuality: { aqi: 12, voc: 7 }, id, mac: "AABBCCDDEE02", name: "Air One" }] };
    const { bundle } = await runCapture({ bootstrap,
      rawPackets: [frame("sensor", "update", id, { mac: "AABBCCDDEE02", vocGateway: "AABBCCDDEE01", vocPeer: "AABBCCDDEE02" })] });

    const finding = bundle.novelty.find((entry) => entry.path === "airQuality.voc");
    const kept = bundle.frames.raw.kept[0];
    const payload = kept?.payload as { mac: string; vocGateway: string; vocPeer: string };

    assert.notEqual(finding?.recordId, id, "the real identifier never reaches the bundle");
    assert.equal(finding?.recordId, kept?.header.id, "the diff's record and the rail's frame name one device, not two");

    assert.notEqual(payload.mac, "AABBCCDDEE02", "the real address never reaches the bundle");
    assert.equal(payload.mac, payload.vocPeer, "a declared field and a field this version has never heard of resolve to one pseudonym");
    assert.notEqual(payload.mac, payload.vocGateway, "two different devices keep two different pseudonyms");
    assert.match(payload.mac, /^[0-9A-F]{12}$/, "the replacement is still address-shaped");
  });

  test("the drift and health channels reach the bundle with window-relative times", async () => {

    const { bundle } = await runCapture({ publish: () => {

      channels.schemaUnknownModelKey.publish({ action: "add", exampleId: "v1", modelKey: "vocsensor" });
      channels.connectionTransition.publish({ from: "connecting", to: "healthy" });
    } });

    assert.equal(bundle.drift.length, 1);
    assert.equal((bundle.drift[0]?.payload as { modelKey: string }).modelKey, "vocsensor");
    assert.equal(bundle.connection.length, 1);
    assert.equal((bundle.connection[0]?.payload as { to: string }).to, "healthy");
    assert.ok((bundle.connection[0]?.atMs ?? -1) >= 0, "the observation is stamped against the start of the window, not a wall clock");
  });

  test("the inventory is read after the window closes, so a device adopted during it appears", async () => {

    let adoptMidWindow = (): void => undefined;

    const { bundle } = await runCapture({

      rawPackets: [frameTriggering(frame("camera", "update", "c1", { isMotionDetected: true }), () => adoptMidWindow())],
      sensors: [{ id: "s1", name: "Air One" }]
    }, (adopt) => {

      adoptMidWindow = (): void => adopt("sensors", { id: "s9", name: "Air Nine" });
    });

    assert.ok(bundle.inventory.some((entry) => entry.id === "s9"), "a device that arrived mid-window is described in the bundle");
    assert.ok(bundle.inventory.some((entry) => entry.id === "s1"));
  });

  test("a cadence tally records what a followed device reports", async () => {

    const { bundle } = await runCapture({ args: [ "--device", "Front" ], rawPackets: [

      frame("camera", "update", "c1", { isMotionDetected: true }),
      frame("camera", "update", "c1", { isMotionDetected: false })
    ] });

    assert.equal(bundle.cadence["c1"]?.["isMotionDetected"], 2);
  });

  test("an occurrence is kept when it concerns a followed device and dropped when it does not", async () => {

    const events: TypedEvent[] = [

      { at: 0, cameraId: "c1", eventId: "e1", kind: "motionDetected" },
      { at: 0, cameraId: "c9", eventId: "e2", kind: "motionDetected" }
    ];

    const { bundle } = await runCapture({ args: [ "--device", "Front" ], events });

    assert.equal(bundle.frames.occurrences.seen, 2);
    assert.equal(bundle.frames.occurrences.kept.length, 1);
    assert.equal((bundle.frames.occurrences.kept[0] as { eventId: string }).eventId, "e1");
  });
});

describe("capture lifetime", () => {

  test("Ctrl-C mid-window still writes a bundle, and the window really was cut short", async () => {

    const cancel = new AbortController();
    const scripted = [

      frameTriggering(frame("vocsensor", "add", "v1", { id: "v1" }), () => cancel.abort()),
      frame("vocsensor", "add", "v2", { id: "v2" }),
      frame("vocsensor", "add", "v3", { id: "v3" })
    ];

    const { bundle, stdout } = await runCapture({ rawPackets: scripted, rawPacketsHoldOpen: true, signal: cancel.signal });

    assert.ok(bundle.frames.raw.seen < scripted.length, "the frames after the abort were never delivered, so this is truncation and not exhaustion");
    assert.ok(bundle.frames.raw.kept.length > 0, "whatever did arrive before the abort is still in the bundle");
    assert.match(stdout, /Wrote /);
  });

  test("an abort while the bootstrap is still being fetched takes the cancellation path", async () => {

    // A cancellation before the subject map exists has nothing to finalize, so the run ends as a cancellation rather than as a bundle.
    const cancel = new AbortController();
    const dir = await mkdtemp(path.join(tmpdir(), "ufp-capture-"));

    try {

      const result = await runCaptureRaw({ bootstrapHoldsOpen: true, publish: () => cancel.abort(), signal: cancel.signal }, dir);

      assert.ok(result.thrown instanceof ProtectAbortedError, "a cancelled fetch surfaces as the library's typed abort, which the entry point renders as exit 130");
      assert.deepEqual((await readdir(dir)).filter((entry) => entry !== "schema-manifest.json"), [], "nothing was written");
    } finally {

      await rm(dir, { force: true, recursive: true });
    }
  });

  test("a rail that dies still leaves a bundle behind, written and announced before the error is raised", async () => {

    const dir = await mkdtemp(path.join(tmpdir(), "ufp-capture-"));

    try {

      const out = path.join(dir, "bundle.json");
      const boom = new Error("the events rail died");
      const result = await runCaptureRaw({ args: [ "--out", out ], eventsError: boom, rawPackets: [frame("vocsensor", "add", "v1", { id: "v1" })] }, dir);
      const bundle = JSON.parse(await readFile(out, "utf8")) as Bundle;

      // Captured evidence is never discarded because a rail failed: the file is complete, its path is already on standard output, and only then does the error
      // surface for the entry point to render and exit non-zero on.
      assert.equal(bundle.frames.raw.kept.length, 1);
      assert.match(result.stdout, /Wrote /);
      assert.equal(result.thrown, boom);
    } finally {

      await rm(dir, { force: true, recursive: true });
    }
  });

  test("the default filename is identity-neutral", async () => {

    // Nothing about the controller, the site, or the operator belongs in a filename that will be attached to an email.
    const dir = await mkdtemp(path.join(tmpdir(), "ufp-capture-"));
    const cwd = process.cwd();

    try {

      process.chdir(dir);

      await runCaptureRaw({}, dir);

      assert.ok((await readdir(dir)).some((entry) => /^ufp-capture-\d{8}-\d{6}\.json$/.test(entry)));
    } finally {

      process.chdir(cwd);
      await rm(dir, { force: true, recursive: true });
    }
  });
});
