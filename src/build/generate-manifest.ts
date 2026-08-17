/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * generate-manifest.ts: The build step that derives the schema manifest from the library's own type tier and the protocol vocabularies.
 */
import { DEVICE_COLLECTION_KEYS, DEVICE_MODEL_KEYS, KNOWN_EVENT_TYPES, KNOWN_MODEL_KEYS, STATE_MODEL_KEYS } from "../protocol/events.ts";
import type { JsonTypeName, ModelKeyVocabulary, SchemaManifest, SchemaNode } from "../util/cli/manifest.ts";
import { MAP_BACKED_STATE_MODEL_KEYS, mapFieldFor } from "../protocol/reducer.ts";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

/**
 * Generate the schema manifest the `ufp capture` command diffs live controller traffic against.
 *
 * The manifest is derived, never authored. Its record trees come from the library's own type declarations, read through the TypeScript checker rather than by walking
 * syntax: several device interfaces inherit their index signature from a base type, `Record<string, T>` members are structurally distinct from ordinary objects, and
 * a `DeepPartial`-wrapped shape resolves only through the checker. A syntax walk would get each of those wrong, and every one of those errors would show up as a false
 * novelty report in the field.
 *
 * Its vocabularies come from the protocol modules by direct import, so the constants there stay the single source of their own values. `recordKeys` in particular is
 * assembled from the reducer's own modelKey-to-field mapping rather than a pluralization table written out here, because a second copy of that mapping is exactly the
 * kind of duplicate that drifts silently.
 *
 * Determinism is a property of the data this builds: every key is inserted in sorted order and every array is sorted, so the emitted file is byte-identical across
 * runs and a real change to the type tier is the only thing that moves it. Nothing timestamped is written.
 *
 * @module ProtectBuildManifest
 */

// The repo root, relative to this module. The generator resolves the project it reads and the artifact it writes from here, so it behaves the same whatever directory
// the build was launched from.
const PROJECT_ROOT = new URL("../../", import.meta.url);
const BOOTSTRAP_INTERFACE = "ProtectNvrBootstrapInterface";
const BOOTSTRAP_SOURCE = "src/types/nvr.ts";
const MANIFEST_OUTPUT = "dist/schema-manifest.json";
const OPAQUE_TYPE_ALIAS = "ProtectKnownJsonValue";

// How deep the walk descends before it declares a shape opaque. The Protect types nest a handful of levels; this bound exists so a pathological or self-referential
// shape terminates with a usable manifest rather than exhausting the stack.
const MAX_DEPTH = 24;

// Build an object whose keys are inserted in sorted order, which is what makes the emitted JSON byte-stable across runs.
function sortedRecord<T>(entries: Iterable<readonly [string, T]>): Record<string, T> {

  const sorted: Record<string, T> = {};

  for(const [ key, value ] of [...entries].sort((left, right) => left[0].localeCompare(right[0]))) {

    sorted[key] = value;
  }

  return sorted;
}

// Sort and de-duplicate a vocabulary array.
function sortedUnique(values: Iterable<string>): string[] {

  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

// Sort and de-duplicate the JSON type names a primitive node declares.
function sortedTypeNames(values: Iterable<JsonTypeName>): JsonTypeName[] {

  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

// The JSON scalar name a primitive type flag maps to, or undefined for a type that is not a JSON scalar. `undefined` and `void` deliberately map to nothing: an
// optional property's declared type includes undefined, but JSON has no such value, so it contributes no type name to the manifest.
function scalarNameOf(type: ts.Type): JsonTypeName | undefined {

  const { flags } = type;

  if(flags & (ts.TypeFlags.String | ts.TypeFlags.StringLiteral | ts.TypeFlags.TemplateLiteral)) {

    return "string";
  }

  if(flags & (ts.TypeFlags.Number | ts.TypeFlags.NumberLiteral)) {

    return "number";
  }

  if(flags & (ts.TypeFlags.Boolean | ts.TypeFlags.BooleanLiteral)) {

    return "boolean";
  }

  if(flags & ts.TypeFlags.Null) {

    return "null";
  }

  return undefined;
}

// Whether a type is the library's opaque JSON value - the declared "we carry this but do not describe it" type. Recognized by its alias rather than its structure,
// because structurally it is a recursive union that no shape walk should ever descend into.
function isOpaqueType(type: ts.Type): boolean {

  return type.aliasSymbol?.name === OPAQUE_TYPE_ALIAS;
}

// The constituents of a type, flattened one level out of a union. A non-union type is its own single constituent.
function constituentsOf(type: ts.Type): readonly ts.Type[] {

  return type.isUnion() ? type.types : [type];
}

// The walk's shared state: the checker it asks, and the types currently on the descent stack, so a shape that refers back to itself terminates as opaque rather than
// recursing forever.
interface WalkState {

  checker: ts.TypeChecker;
  stack: Set<ts.Type>;
}

// Merge several described shapes into one. Nodes of the same kind combine - fields union, declared scalar types union, containers merge their contents - while a
// genuine mix of kinds has no single describable form and is carried opaque rather than described wrongly.
//
// Merging rather than intersecting is deliberate throughout: a field one variant declares is a field the library knows about, so treating it as undeclared would
// report ordinary traffic as novelty.
function mergeNodes(nodes: readonly SchemaNode[]): SchemaNode {

  const first = nodes[0];

  if(first === undefined) {

    return { kind: "opaque" };
  }

  if(nodes.length === 1) {

    return first;
  }

  const objects = nodes.filter((node) => node.kind === "object");

  if(objects.length === nodes.length) {

    const fields = new Map<string, SchemaNode>();

    for(const node of objects) {

      for(const [ name, field ] of Object.entries(node.fields)) {

        fields.set(name, field);
      }
    }

    return { fields: sortedRecord(fields), kind: "object", open: objects.some((node) => node.open) };
  }

  const primitives = nodes.filter((node) => node.kind === "primitive");

  if(primitives.length === nodes.length) {

    return { kind: "primitive", types: sortedTypeNames(primitives.flatMap((node) => node.types)) };
  }

  const arrays = nodes.filter((node) => node.kind === "array");

  if(arrays.length === nodes.length) {

    return { element: mergeNodes(arrays.map((node) => node.element)), kind: "array" };
  }

  const dictionaries = nodes.filter((node) => node.kind === "dictionary");

  if(dictionaries.length === nodes.length) {

    return { kind: "dictionary", values: mergeNodes(dictionaries.map((node) => node.values)) };
  }

  return { kind: "opaque" };
}

// Describe an object-ish type: an array by its element, a keys-are-data map by its values, and anything else by its declared fields plus whether it admits keys it
// does not declare.
function describeObject(type: ts.Type, depth: number, state: WalkState): SchemaNode {

  const { checker } = state;

  if(checker.isArrayType(type) || checker.isTupleType(type)) {

    const elements = checker.getTypeArguments(type as ts.TypeReference);

    // A tuple declares each position separately while the manifest carries one element shape per array, so the positions merge into that one shape.
    return { element: mergeNodes(elements.map((element) => describeType(element, depth + 1, state))), kind: "array" };
  }

  const indexInfos = checker.getIndexInfosOfType(type);
  const properties = checker.getPropertiesOfType(type);

  // A `Record<string, T>` carries an index signature and declares nothing else, so its keys are data rather than schema. An interface that has both is an ordinary
  // shape that happens to be open, which is the distinction the `open` flag records below.
  if((properties.length === 0) && (indexInfos.length > 0)) {

    const values = indexInfos[0];

    return { kind: "dictionary", values: (values === undefined) ? { kind: "opaque" } : describeType(values.type, depth + 1, state) };
  }

  const fields = sortedRecord(properties.map((property) => {

    const declaration = property.valueDeclaration ?? property.declarations?.[0];
    const propertyType = (declaration === undefined) ? checker.getDeclaredTypeOfSymbol(property) : checker.getTypeOfSymbolAtLocation(property, declaration);

    return [ property.name, describeType(propertyType, depth + 1, state) ] as const;
  }));

  return { fields, kind: "object", open: indexInfos.length > 0 };
}

// Describe any type as a manifest node. Scalars collapse to a primitive carrying every JSON type the declaration admits; a shape that is only ever null or a scalar
// stays a primitive; anything object-shaped is described structurally.
function describeType(type: ts.Type, depth: number, state: WalkState): SchemaNode {

  if(isOpaqueType(type) || (depth > MAX_DEPTH) || state.stack.has(type)) {

    return { kind: "opaque" };
  }

  const scalars = new Set<JsonTypeName>();
  const shapes: ts.Type[] = [];

  for(const constituent of constituentsOf(type)) {

    if(isOpaqueType(constituent)) {

      return { kind: "opaque" };
    }

    // An untyped constituent describes nothing, so the whole member is opaque rather than a shape with an empty field list that would report every key as novelty.
    if(constituent.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) {

      return { kind: "opaque" };
    }

    if(constituent.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void | ts.TypeFlags.Never)) {

      continue;
    }

    const scalar = scalarNameOf(constituent);

    if(scalar !== undefined) {

      scalars.add(scalar);

      continue;
    }

    shapes.push(constituent);
  }

  if(shapes.length === 0) {

    return { kind: "primitive", types: sortedTypeNames(scalars) };
  }

  state.stack.add(type);

  try {

    return mergeNodes(shapes.map((shape) => describeObject(shape, depth, state)));
  } finally {

    state.stack.delete(type);
  }
}

// Unwrap a collection member to the record it holds, so a `records` entry always describes one record whether the bootstrap carries one or many of them.
function elementTypeOf(type: ts.Type, checker: ts.TypeChecker): ts.Type {

  if(checker.isArrayType(type)) {

    return checker.getTypeArguments(type as ts.TypeReference)[0] ?? type;
  }

  return type;
}

// Resolve the bootstrap interface's declared type from a program built over the repo's own compiler options.
function resolveBootstrapType(): { checker: ts.TypeChecker; type: ts.Type } {

  const configPath = fileURLToPath(new URL("tsconfig.json", PROJECT_ROOT));
  const configFile = ts.readConfigFile(configPath, (path) => ts.sys.readFile(path));

  if(configFile.error !== undefined) {

    throw new Error("Unable to read " + configPath + ": " + ts.flattenDiagnosticMessageText(configFile.error.messageText, " "));
  }

  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, fileURLToPath(PROJECT_ROOT));
  const bootstrapPath = fileURLToPath(new URL(BOOTSTRAP_SOURCE, PROJECT_ROOT));

  // The program is rooted at the one file the manifest derives from rather than the whole project: module resolution pulls in exactly its transitive type
  // dependencies, which is the entire tier this reads, and skipping the rest keeps the build step and its test quick.
  const program = ts.createProgram({ options: parsed.options, rootNames: [bootstrapPath] });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(bootstrapPath);

  if(source === undefined) {

    throw new Error("The manifest generator could not load " + BOOTSTRAP_SOURCE + " into its program.");
  }

  for(const statement of source.statements) {

    if(ts.isInterfaceDeclaration(statement) && (statement.name.text === BOOTSTRAP_INTERFACE)) {

      const symbol = checker.getSymbolAtLocation(statement.name);

      if(symbol !== undefined) {

        return { checker, type: checker.getDeclaredTypeOfSymbol(symbol) };
      }
    }
  }

  throw new Error("The manifest generator could not resolve " + BOOTSTRAP_INTERFACE + " in " + BOOTSTRAP_SOURCE + ".");
}

// The modelKey vocabulary, lifted from the protocol module's own tiers.
function buildVocabulary(): ModelKeyVocabulary {

  return {

    collection: sortedUnique(DEVICE_COLLECTION_KEYS),
    device: sortedUnique(DEVICE_MODEL_KEYS),
    known: sortedUnique(KNOWN_MODEL_KEYS),
    state: sortedUnique(STATE_MODEL_KEYS)
  };
}

// The modelKey-to-record-tree mapping, assembled from the reducer's own mapping plus the NVR singleton, which is the one reduced key with no backing map and so is
// absent from that mapping by construction.
function buildRecordKeys(): Record<string, string> {

  const entries = MAP_BACKED_STATE_MODEL_KEYS.map((modelKey) => [ modelKey, mapFieldFor(modelKey) ] as const);

  return sortedRecord([ ...entries, [ "nvr", "nvr" ] as const ]);
}

// This package's version, which is what makes the manifest a dated artifact a consumer can reason about rather than an anonymous file.
function readPackageVersion(): string {

  const parsed = JSON.parse(readFileSync(new URL("package.json", PROJECT_ROOT), "utf8")) as { version?: string };

  return parsed.version ?? "unknown";
}

/**
 * Build the schema manifest from the library's types and protocol vocabularies.
 *
 * @returns The manifest, with every key inserted in sorted order and every array sorted.
 *
 * @throws When the bootstrap interface cannot be resolved, which means the type tier moved and the generator needs to be pointed at its new home.
 *
 * @category Build
 */
export function buildSchemaManifest(): SchemaManifest {

  const { checker, type } = resolveBootstrapType();
  const state: WalkState = { checker, stack: new Set() };
  const records = sortedRecord(checker.getPropertiesOfType(type).map((property) => {

    const declaration = property.valueDeclaration ?? property.declarations?.[0];
    const memberType = (declaration === undefined) ? checker.getDeclaredTypeOfSymbol(property) : checker.getTypeOfSymbolAtLocation(property, declaration);

    return [ property.name, describeType(elementTypeOf(memberType, checker), 0, state) ] as const;
  }));

  return {

    eventTypes: sortedUnique(KNOWN_EVENT_TYPES),
    modelKeys: buildVocabulary(),
    recordKeys: buildRecordKeys(),
    records,
    version: readPackageVersion()
  };
}

/**
 * Build the manifest and write it out.
 *
 * @param location - Where to write it; defaults to the spot beside the compiled output that the CLI loader resolves by default.
 *
 * @returns The absolute path written.
 *
 * @category Build
 */
export function writeSchemaManifest(location: URL | string = new URL(MANIFEST_OUTPUT, PROJECT_ROOT)): string {

  const target = (typeof location === "string") ? location : fileURLToPath(location);

  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(buildSchemaManifest()) + "\n", "utf8");

  return target;
}

// Run when invoked as the build step, stay inert when imported by the test. The entry-script comparison is the portable form across the supported Node range.
if((process.argv[1] !== undefined) && (process.argv[1] === fileURLToPath(import.meta.url))) {

  process.stdout.write("Generated the schema manifest at " + writeSchemaManifest() + ".\n");
}
