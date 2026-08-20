/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * manifest.test.ts: Unit tests for the schema manifest's loader (validate-before-trust at the JSON boundary), its novelty diff in both polarities, the finding
 * identity key, the exemplar snapshots of what it does not model, and the wire event-type reader.
 */
import type { NoveltyFinding, SchemaManifest } from "./manifest.ts";
import { describe, test } from "node:test";
import { diffBootstrap, diffEventType, diffRecord, eventTypeOf, loadSchemaManifest, noveltyKey, parseSchemaManifest, snapshotUnmodeled } from "./manifest.ts";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { CliError } from "./shared.ts";
import type { RawPacket } from "../../index.ts";
import assert from "node:assert/strict";
import path from "node:path";
import { tmpdir } from "node:os";

/* A miniature manifest standing in for the generated one: a couple of described collections, one opaque collection, one scalar member, and a vocabulary small enough
 * to read at a glance. The generator's own output is pinned against the real type tier in its own test; what these tests need is a fixture whose every declaration is
 * visible in the assertions beside it.
 *
 * The sensor tree is open and its air-quality block closed, so a single fixture exercises novelty on both.
 */
const FIXTURE: SchemaManifest = {

  eventTypes: [ "access", "motion", "ring" ],
  modelKeys: {

    collection: [ "camera", "sensor" ],
    device: [ "camera", "nvr", "sensor" ],
    known: [ "camera", "event", "group", "nvr", "sensor" ],
    state: [ "camera", "nvr", "sensor" ]
  },
  recordKeys: { camera: "cameras", nvr: "nvr", sensor: "sensors" },
  records: {

    accessKey: { kind: "primitive", types: ["string"] },
    aiports: { kind: "opaque" },
    cameras: { fields: {

      channels: { element: { fields: { id: { kind: "primitive", types: ["number"] } }, kind: "object", open: false }, kind: "array" },
      id: { kind: "primitive", types: ["string"] },
      mac: { kind: "primitive", types: ["string"] },
      name: { kind: "primitive", types: ["string"] }
    }, kind: "object", open: false },
    nvr: { fields: {

      capacity: { kind: "dictionary", values: { fields: { max: { kind: "primitive", types: ["number"] } }, kind: "object", open: false } },
      id: { kind: "primitive", types: ["string"] },
      mac: { kind: "primitive", types: ["string"] },
      name: { kind: "primitive", types: ["string"] }
    }, kind: "object", open: false },
    sensors: { fields: {

      airQuality: { fields: { aqi: { kind: "primitive", types: [ "null", "number" ] } }, kind: "object", open: false },
      id: { kind: "primitive", types: ["string"] },
      mac: { kind: "primitive", types: ["string"] }
    }, kind: "object", open: true }
  },
  version: "0.0.0-fixture"
};

// Serialize the fixture with one member replaced, so each malformed-manifest test states exactly the one defect it plants.
function fixtureWith(overrides: Record<string, unknown>): string {

  return JSON.stringify({ ...FIXTURE, ...overrides });
}

// Run a test body with a throwaway directory, so a manifest file written for the loader never lands anywhere the developer would notice.
async function withDir(body: (dir: string) => Promise<void>): Promise<void> {

  const dir = await mkdtemp(path.join(tmpdir(), "ufp-manifest-"));

  try {

    await body(dir);
  } finally {

    await rm(dir, { force: true, recursive: true });
  }
}

// Build a raw packet around a payload, for the event-type reader.
function packetOf(modelKey: string, payload: unknown): RawPacket {

  return { header: { action: "add", id: "e1", modelKey, newUpdateId: "u1" }, payload };
}

describe("schema manifest diff", () => {

  test("a bootstrap yields exactly the planted novelty and nothing else", () => {

    // The whole finding set is compared rather than probed for the entries expected: an exactness check is what fails an over-reporting diff, and it is the only
    // check that covers the undeclared-collection axis, where a per-axis negative control has nothing to be negative about.
    const bootstrap = {

      accessKey: "",
      agreements: { contract: "tos" },
      aiports: [{ id: "a1", modelKey: "aiport", vocChannel: 3 }],
      cameras: [{ id: "c1", mac: "AABBCCDDEEFF", name: "Front Door" }],
      nvr: { id: "n1", mac: "001122334455", name: "Controller" },
      sensors: [

        { airQuality: { aqi: 42, voc: 7 }, id: "s1", mac: "AABBCCDDEE01", vocIndex: 3 },
        { id: "s2", mac: "AABBCCDDEE02" }
      ]
    };

    assert.deepEqual(diffBootstrap(FIXTURE, bootstrap), [

      { collection: "agreements", kind: "unknownCollection", valueType: "object" },
      { collection: "sensors", kind: "unknownField", observedType: "number", open: false, path: "airQuality.voc", recordId: "s1" },
      { collection: "sensors", kind: "unknownField", observedType: "number", open: true, path: "vocIndex", recordId: "s1" }
    ]);
  });

  test("a declared field that is simply absent is not novelty", () => {

    // Optional fields and capability nulls are ordinary traffic. A diff that reported them would bury the real signal on every run.
    assert.deepEqual(diffBootstrap(FIXTURE, { sensors: [{ id: "s2", mac: "AABBCCDDEE02" }] }), []);
  });

  test("nothing inside an opaque collection is novelty", () => {

    assert.deepEqual(diffBootstrap(FIXTURE, { aiports: [{ anything: true, id: "a1" }] }), []);
  });

  test("a record of an unknown model key is reported per unit", () => {

    // A brand-new device class never reaches the reduced state, so it appears in no inventory: per-unit identity has to survive here or every unit past the first is
    // lost to the merge.
    assert.deepEqual(diffRecord(FIXTURE, { modelKey: "vocsensor", record: { id: "v1" }, recordId: "v1" }),
      [{ kind: "unknownModelKey", modelKey: "vocsensor", recordId: "v1" }]);
  });

  test("a record of a known model key is not novelty on that axis", () => {

    assert.deepEqual(diffRecord(FIXTURE, { modelKey: "camera", record: { id: "c1", name: "Front Door" }, recordId: "c1" }), []);
  });

  test("a known model key with no record tree yields nothing", () => {

    // The activity channel and the recognized-but-unreduced classes are known without having a described shape, so there is nothing for a record to be novel against.
    assert.deepEqual(diffRecord(FIXTURE, { modelKey: "group", record: { anything: true }, recordId: "g1" }), []);
  });

  test("a frame's undeclared field is attributed to the header id and its path", () => {

    assert.deepEqual(diffRecord(FIXTURE, { modelKey: "sensor", record: { airQuality: { vape: 9 } }, recordId: "s7" }),
      [{ collection: "sensors", kind: "unknownField", observedType: "number", open: false, path: "airQuality.vape", recordId: "s7" }]);
  });

  test("the irregular singleton resolves its record tree like any other model key", () => {

    assert.deepEqual(diffRecord(FIXTURE, { modelKey: "nvr", record: { vocReporting: true }, recordId: "n1" }),
      [{ collection: "nvr", kind: "unknownField", observedType: "boolean", open: false, path: "vocReporting", recordId: "n1" }]);
  });

  test("novelty inside an array or a keyed map is found, and the path names the hop", () => {

    assert.deepEqual(diffRecord(FIXTURE, { modelKey: "camera", record: { channels: [{ fps: 30, id: 0 }] }, recordId: "c1" }),
      [{ collection: "cameras", kind: "unknownField", observedType: "number", open: false, path: "channels[].fps", recordId: "c1" }]);

    // A keyed map's own keys are data, so no key is ever novelty and the path collapses them to a wildcard - which is also what keeps a map with many entries from
    // reporting the same undeclared inner field once per key.
    assert.deepEqual(diffRecord(FIXTURE, { modelKey: "nvr", record: { capacity: { high: { max: 5, spare: 1 } } }, recordId: "n1" }),
      [{ collection: "nvr", kind: "unknownField", observedType: "number", open: false, path: "capacity.*.spare", recordId: "n1" }]);
  });

  test("a finding names the JSON shape of the value it found", () => {

    const record = { vocArray: [], vocFlag: true, vocNull: null, vocNumber: 1, vocObject: {}, vocText: "x" };
    const observed = diffRecord(FIXTURE, { modelKey: "sensor", record, recordId: "s1" })
      .map((finding) => (finding.kind === "unknownField") ? [ finding.path, finding.observedType ] : []);

    assert.deepEqual(observed, [

      [ "vocArray", "array" ],
      [ "vocFlag", "boolean" ],
      [ "vocNull", "null" ],
      [ "vocNumber", "number" ],
      [ "vocObject", "object" ],
      [ "vocText", "string" ]
    ]);
  });

  test("an unrecognized event type is novelty and a recognized one is not", () => {

    assert.deepEqual(diffEventType(FIXTURE, "vocThresholdCrossed"), [{ eventType: "vocThresholdCrossed", kind: "unknownEventType" }]);

    // The login audit type specifically: it is the one whose omission from the vocabulary would fire on every single controller login, this library's own connect
    // included, so it is the control worth pinning.
    assert.deepEqual(diffEventType(FIXTURE, "access"), []);
  });

  test("a non-object payload is walked without crashing and without inventing findings", () => {

    // A raw payload is whatever the codec produced: parsed JSON, a UTF-8 string, or a buffer. Only the first has fields to be undeclared.
    for(const record of [ "a string", Buffer.from([ 1, 2, 3 ]), [ 1, 2 ], null, 7 ]) {

      assert.deepEqual(diffRecord(FIXTURE, { modelKey: "sensor", record, recordId: "s1" }), []);
    }

    assert.deepEqual(diffBootstrap(FIXTURE, "not a bootstrap"), []);
  });
});

describe("unmodeled snapshots", () => {

  test("an unmodeled collection contributes exemplars, capped, beside the count they were drawn from", () => {

    // The cap is the point: a site with forty units of a class this version cannot place should teach a reader what one record looks like, not ship the roster. The
    // count beside them is what keeps the truncation honest, so three exemplars never read as a complete collection.
    const bootstrap = { aiports: [ { id: "a1" }, { id: "a2" }, { id: "a3" }, { id: "a4" } ] };

    assert.deepEqual(snapshotUnmodeled(FIXTURE, bootstrap, 2), [{ collection: "aiports", kept: [ { id: "a1" }, { id: "a2" } ], seen: 4 }]);
  });

  test("a member the manifest has never heard of is sampled the same as a declared-but-opaque one", () => {

    // Two ways to be unmodeled - carried as raw JSON, or not carried at all - and neither can produce a field-level finding, so both need exemplars. A member that is
    // one record rather than a collection is the one exemplar it has.
    assert.deepEqual(snapshotUnmodeled(FIXTURE, { agreements: { contract: "tos" } }, 3), [{ collection: "agreements", kept: [{ contract: "tos" }], seen: 1 }]);
  });

  test("a described collection contributes nothing", () => {

    // Its records are modeled, and anything undeclared inside one is reported field by field by the diff instead. Sampling them too would put the site's whole camera
    // list in a bundle that was asked about what the library does not know.
    assert.deepEqual(snapshotUnmodeled(FIXTURE, { cameras: [{ id: "c1", mac: "AABBCCDDEEFF", name: "Front Door" }], nvr: { id: "n1" } }, 3), []);
  });

  test("an empty unmodeled collection contributes nothing", () => {

    // A controller reporting none of a thing is not shape evidence, and an entry with nothing kept would read as a truncation of something.
    assert.deepEqual(snapshotUnmodeled(FIXTURE, { aiports: [] }, 3), []);
  });

  test("a bootstrap that is not an object yields nothing", () => {

    // The document is read structurally rather than trusted to be a bootstrap at all, the same posture the diff takes.
    assert.deepEqual(snapshotUnmodeled(FIXTURE, "not a bootstrap", 3), []);
  });
});

describe("eventTypeOf", () => {

  test("reads the type off an activity packet and declines everything else", () => {

    assert.equal(eventTypeOf(packetOf("event", { type: "motion" })), "motion");
    assert.equal(eventTypeOf(packetOf("camera", { type: "motion" })), undefined, "only the activity channel carries an occurrence type");
    assert.equal(eventTypeOf(packetOf("event", { type: 7 })), undefined, "a non-string type names nothing");
    assert.equal(eventTypeOf(packetOf("event", "a string payload")), undefined);
    assert.equal(eventTypeOf(packetOf("event", Buffer.from([1]))), undefined);
  });
});

describe("noveltyKey", () => {

  test("two observations of the same thing share a key", () => {

    const first: NoveltyFinding = { collection: "sensors", kind: "unknownField", observedType: "number", open: true, path: "voc", recordId: "s1" };
    const second: NoveltyFinding = { collection: "sensors", kind: "unknownField", observedType: "null", open: true, path: "voc", recordId: "s1" };

    assert.equal(noveltyKey(first), noveltyKey(second), "the observed value's type is evidence, not identity");
  });

  test("findings differing only in record id are two findings", () => {

    const first: NoveltyFinding = { collection: "sensors", kind: "unknownField", observedType: "number", open: true, path: "voc", recordId: "s1" };
    const second: NoveltyFinding = { ...first, recordId: "s2" };

    assert.notEqual(noveltyKey(first), noveltyKey(second));
  });

  test("identity fields carrying delimiter-like text do not collide", () => {

    // The key is a JSON tuple rather than a joined string precisely because record ids and field paths are the values most likely to contain whatever delimiter a
    // join would have picked.
    const first: NoveltyFinding = { collection: "sensors", kind: "unknownField", observedType: "number", open: true, path: "b", recordId: "a:" };
    const second: NoveltyFinding = { ...first, path: "b", recordId: "a" };

    assert.notEqual(noveltyKey(first), noveltyKey(second));
  });

  test("each kind is identified by its own subject", () => {

    assert.notEqual(noveltyKey({ collection: "agreements", kind: "unknownCollection", valueType: "object" }),
      noveltyKey({ collection: "hubs", kind: "unknownCollection", valueType: "array" }));
    assert.equal(noveltyKey({ eventType: "voc", kind: "unknownEventType" }), noveltyKey({ eventType: "voc", kind: "unknownEventType" }));
    assert.notEqual(noveltyKey({ kind: "unknownModelKey", modelKey: "voc", recordId: "v1" }), noveltyKey({ kind: "unknownModelKey", modelKey: "voc", recordId: "v2" }));
  });
});

describe("loadSchemaManifest", () => {

  test("loads and validates a well-formed manifest from an explicit path", async () => {

    await withDir(async (dir) => {

      const file = path.join(dir, "schema-manifest.json");

      await writeFile(file, JSON.stringify(FIXTURE));

      assert.deepEqual(await loadSchemaManifest(file), FIXTURE);
    });
  });

  test("a missing manifest names the build step that produces it", async () => {

    await withDir(async (dir) => {

      await assert.rejects(() => loadSchemaManifest(path.join(dir, "absent.json")),
        (error: unknown) => (error instanceof CliError) && error.message.includes("Run \"npm run build\""));
    });
  });

  test("a present-but-unreadable manifest is a distinct failure from a missing one", async () => {

    // Pointing at a directory is the reachable stand-in for any read failure that is not absence: a permission error, a broken link. Absence means "the build has not
    // run yet" and gets that hint, while anything else is a real problem and must not be reported as a missing build artifact.
    await withDir(async (dir) => {

      await assert.rejects(() => loadSchemaManifest(dir),
        (error: unknown) => (error instanceof CliError) && error.message.includes("Unable to read the schema manifest"));
    });
  });
});

describe("parseSchemaManifest", () => {

  // Each row plants exactly one defect and names the phrase the resulting message must carry, so a validation failure is always traceable to the member that caused it.
  const defects: readonly (readonly [string, string, string])[] = [

    [ "text that is not JSON", "{", "not valid JSON" ],
    [ "a JSON value that is not an object", "[]", "not a JSON object" ],
    [ "a missing top-level member", JSON.stringify({ ...FIXTURE, version: undefined }), "\"version\" member is not a string" ],
    [ "a wrong-typed top-level member", fixtureWith({ eventTypes: "motion" }), "\"eventTypes\" member is not an array of strings" ],
    [ "a wrong-typed vocabulary tier", fixtureWith({ modelKeys: { collection: [], device: [], known: [], state: 7 } }), "\"state\" member is not an array of strings" ],
    [ "a vocabulary that is not an object", fixtureWith({ modelKeys: "camera" }), "\"modelKeys\" member is not an object" ],
    [ "a records member that is not an object", fixtureWith({ records: [] }), "\"records\" member is not an object" ],
    [ "a recordKeys member that is not an object", fixtureWith({ recordKeys: 7 }), "\"recordKeys\" member is not an object" ],
    [ "a recordKeys entry that is not a string", fixtureWith({ recordKeys: { camera: 7 } }), "entry for \"camera\" is not a string" ],
    [ "a record tree that is not a node", fixtureWith({ records: { ...FIXTURE.records, cameras: "an object shape" } }),
      "the node at \"cameras\" is not an object" ],
    [ "a recordKeys entry naming an absent record", fixtureWith({ recordKeys: { ...FIXTURE.recordKeys, doorlock: "doorlocks" } }),
      "names the absent record \"doorlocks\"" ],
    [ "a state model key with no recordKeys entry", fixtureWith({ modelKeys: { ...FIXTURE.modelKeys, state: [ ...FIXTURE.modelKeys.state, "chime" ] } }),
      "\"chime\" has no \"recordKeys\" entry" ],
    [ "a node carrying an unrecognized kind", fixtureWith({ records: { ...FIXTURE.records, cameras: { kind: "scalar" } } }), "unrecognized kind \"scalar\"" ],
    [ "an object node with no fields object", fixtureWith({ records: { ...FIXTURE.records, cameras: { kind: "object", open: false } } }),
      "has no \"fields\" object" ],
    [ "an object node whose open flag is not a boolean", fixtureWith({ records: { ...FIXTURE.records, cameras: { fields: {}, kind: "object", open: "yes" } } }),
      "must express its \"open\" flag as a boolean" ]
  ];

  for(const [ name, text, expected ] of defects) {

    test("rejects " + name, () => {

      assert.throws(() => parseSchemaManifest(text, "fixture.json"), (error: unknown) => (error instanceof CliError) && error.message.includes(expected));
    });
  }

  test("rejects a malformed node buried deep inside a record tree", () => {

    // Validation walks the whole tree rather than checking the top level, so a defect this far down is caught at the boundary where the file was trusted rather than
    // surfacing much later, mid-diff. The planted tag is outside the closed set of JSON scalar types, which is the enforcement this exercises.
    const text = fixtureWith({ records: { ...FIXTURE.records, sensors: { fields: {

      airQuality: { fields: { aqi: { kind: "primitive", types: ["integer"] } }, kind: "object", open: false }
    }, kind: "object", open: true } } });

    assert.throws(() => parseSchemaManifest(text, "fixture.json"), (error: unknown) => (error instanceof CliError) &&
      error.message.includes("the primitive node at \"sensors.airQuality.aqi\" declares a type outside the JSON scalar types"));
  });
});
