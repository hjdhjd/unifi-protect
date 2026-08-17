/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * generate-manifest.test.ts: Unit tests for the schema-manifest generator, run against the library's real type tier so the checker-level resolutions a syntax walk
 * would get wrong are pinned on the actual declarations rather than on a synthetic stand-in.
 */
import type { SchemaManifest, SchemaNode } from "../util/cli/manifest.ts";
import { buildSchemaManifest, writeSchemaManifest } from "./generate-manifest.ts";
import { describe, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import assert from "node:assert/strict";
import { loadSchemaManifest } from "../util/cli/manifest.ts";
import path from "node:path";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";

// The generator builds a TypeScript program, so it is built once here and shared by every assertion below rather than per test.
const manifest: SchemaManifest = buildSchemaManifest();

// Resolve a dotted path through a record tree, so an assertion names the field it means rather than indexing through nested unions by hand. Returns undefined when any
// segment is absent, which is itself a failure the caller asserts against.
function nodeAt(root: SchemaNode, path: string): SchemaNode | undefined {

  let current: SchemaNode | undefined = root;

  for(const segment of path.split(".")) {

    if(current?.kind !== "object") {

      return undefined;
    }

    current = current.fields[segment];
  }

  return current;
}

describe("generate-manifest", () => {

  test("a device tree is open on an index signature it inherits rather than declares", () => {

    // Chime, fob, light, and viewer declare no index signature in their own files - they inherit one from the shared device base. Openness therefore resolves only
    // through the checker's view of the apparent type; a walk over each interface's own syntax would report every one of them as closed and turn every extra field a
    // controller sends into a false novelty report.
    for(const collection of [ "chimes", "fobs", "lights", "viewers" ]) {

      const node = manifest.records[collection];

      assert.ok(node !== undefined, collection + " has a record tree");
      assert.equal(node.kind, "object", collection + " resolves to an object shape");
      assert.equal((node.kind === "object") && node.open, true, collection + " is open through its inherited index signature");
    }
  });

  test("a nested anonymous shape that declares no index signature stays closed", () => {

    // The counterpart to the inherited-openness case above: openness has to be resolved, not assumed in either direction, or the manifest would either suppress every
    // novelty finding or rank them all as though the library had left room for them.
    const featureFlags = nodeAt(manifest.records["cameras"] ?? { kind: "opaque" }, "featureFlags");

    assert.equal(featureFlags?.kind, "object");
    assert.equal((featureFlags?.kind === "object") && featureFlags.open, false, "a shape with no index signature of its own is closed");
  });

  test("a keys-are-data member resolves to a dictionary rather than an empty object", () => {

    // `maxCameraCapacity` is declared `Record<string, number>`. Described as an ordinary object it would carry no fields, and every capacity key the controller sent
    // would then read as an undeclared field.
    const capacity = nodeAt(manifest.records["nvr"] ?? { kind: "opaque" }, "maxCameraCapacity");

    assert.deepEqual(capacity, { kind: "dictionary", values: { kind: "primitive", types: ["number"] } });
  });

  test("a sensor tree carries its air-quality metric paths", () => {

    const aqi = nodeAt(manifest.records["sensors"] ?? { kind: "opaque" }, "airQuality.aqi");

    assert.equal(aqi?.kind, "object", "airQuality.aqi resolves through two levels of nesting");
    assert.deepEqual((aqi?.kind === "object") ? aqi.fields["value"] : undefined, { kind: "primitive", types: [ "null", "number" ] },
      "a nullable numeric metric declares both JSON types");
  });

  test("the collections the library carries but does not describe are opaque", () => {

    for(const collection of [ "aiports", "aiprocessors", "bridges", "linkstations" ]) {

      assert.deepEqual(manifest.records[collection], { kind: "opaque" }, collection + " is carried without a described shape");
    }
  });

  test("recordKeys maps every realtime-reduced model key to its record tree, the irregular singleton included", () => {

    // The regular case is a bare-s plural; the NVR singleton is the one that is not, which is exactly why this mapping is generated from the reducer's own mapping
    // rather than from a pluralization rule written out in the generator.
    assert.equal(manifest.recordKeys["camera"], "cameras");
    assert.equal(manifest.recordKeys["nvr"], "nvr");

    for(const modelKey of manifest.modelKeys.state) {

      const collection = manifest.recordKeys[modelKey];

      assert.ok(collection !== undefined, modelKey + " resolves to a record key");
      assert.ok((collection !== undefined) && (collection in manifest.records), modelKey + " resolves to a record tree that exists");
    }
  });

  test("the recognized event vocabulary carries the login audit type the classifier declines to model", () => {

    // The controller emits this type on every authentication, this library's own connect included. Recognition and modeling are separate questions, and leaving it
    // out of the vocabulary would make every login read as an unrecognized wire type.
    assert.ok(manifest.eventTypes.includes("access"), "the login audit type is recognized");
    assert.ok(manifest.eventTypes.includes("motion"), "the modeled occurrence types are recognized too");
  });

  test("the manifest reports the generating package version", () => {

    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string };

    assert.equal(manifest.version, pkg.version);
  });

  test("two builds emit byte-identical JSON", () => {

    // Determinism lives in the data the generator constructs - sorted keys, sorted arrays, nothing timestamped - so a diff of the shipped artifact only ever moves
    // when the type tier actually moved.
    assert.equal(JSON.stringify(buildSchemaManifest()), JSON.stringify(manifest));
  });

  test("the written artifact is what the CLI loader accepts", async () => {

    // The generator and the loader are two halves of one contract, so the emitted bytes are round-tripped through the loader's own validation rather than merely
    // inspected: anything the generator could emit that the loader would reject is a build that ships a manifest the CLI refuses to read.
    const dir = await mkdtemp(path.join(tmpdir(), "ufp-manifest-build-"));

    try {

      const target = writeSchemaManifest(path.join(dir, "schema-manifest.json"));

      assert.deepEqual(await loadSchemaManifest(target), manifest);
    } finally {

      await rm(dir, { force: true, recursive: true });
    }
  });

  test("every vocabulary tier nests inside the next", () => {

    for(const modelKey of manifest.modelKeys.collection) {

      assert.ok(manifest.modelKeys.device.includes(modelKey), modelKey + " is device-addressable");
    }

    for(const modelKey of manifest.modelKeys.state) {

      assert.ok(manifest.modelKeys.known.includes(modelKey), modelKey + " is a recognized wire model key");
    }
  });
});
