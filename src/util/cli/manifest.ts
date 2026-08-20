/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * manifest.ts: The schema manifest - the known-surface vocabulary the build generates, the loader that validates it, the diff that reports wire novelty against it, and
 * the exemplar records that evidence what it does not model.
 */
import { CliError } from "./shared.ts";
import type { RawPacket } from "../../index.ts";
import { readFile } from "node:fs/promises";

/**
 * The schema manifest: the wire vocabulary this package knows about, generated at build time from the library's own type tier and shipped beside the compiled code.
 *
 * The manifest exists so the CLI can answer "is this new?" about anything the controller sends, without the CLI reaching into the library's internals. The library owns
 * protocol truth; the manifest is how that truth crosses into the CLI as data. A consumer diffs a live bootstrap or a realtime frame against it and gets back the
 * novelty findings below - the evidence that a controller is speaking about something this version of the library has never been told about.
 *
 * @module ProtectCliManifest
 */

// Where the generated manifest sits relative to this module once compiled: the build emits it at the root of `dist`, and this module lands in `dist/util/cli`.
const MANIFEST_LOCATION = "../../schema-manifest.json";

/**
 * The JSON scalar type names a {@link SchemaPrimitiveNode} declares. Closed by construction, because JSON has exactly these scalar types - which is what lets an
 * unrecognized type tag in a manifest file be a validation failure rather than silently accepted data.
 *
 * @category CLI
 */
export type JsonTypeName = "boolean" | "null" | "number" | "string";

/**
 * The JSON shapes an observed value can take: the scalars a manifest declares, plus the two container shapes. What a novelty finding reports about the value it found.
 *
 * @category CLI
 */
export type ObservedJsonType = "array" | "object" | JsonTypeName;

/**
 * A declared array member. `element` describes what the array holds.
 *
 * @category CLI
 */
export interface SchemaArrayNode {

  element: SchemaNode;
  kind: "array";
}

/**
 * A member whose keys are data rather than schema - a `Record<string, T>` such as a camera's per-zone status map. Every value is described by `values`, and no key is
 * ever novelty, because the shape declares that any key is expected.
 *
 * @category CLI
 */
export interface SchemaDictionaryNode {

  kind: "dictionary";
  values: SchemaNode;
}

/**
 * A declared object shape. `fields` names what the library knows about; `open` records whether the declaring interface carries an index signature, which the checker
 * resolves including signatures inherited from a base type.
 *
 * `open` is signal metadata, never a suppression: an undeclared field on an open shape is still reported, because the library having left room for unknown keys is not
 * the same as the library knowing what arrived. It ranks the finding rather than hiding it - novelty on a closed shape is the stronger signal.
 *
 * @category CLI
 */
export interface SchemaObjectNode {

  fields: Record<string, SchemaNode>;
  kind: "object";
  open: boolean;
}

/**
 * A member the library carries but does not describe - a collection typed as raw JSON. Nothing inside it can be novelty, because nothing inside it was ever declared.
 *
 * @category CLI
 */
export interface SchemaOpaqueNode {

  kind: "opaque";
}

/**
 * A declared scalar member. `types` is the set of JSON scalar types the declaration admits, so a nullable string arrives as both `"null"` and `"string"`.
 *
 * @category CLI
 */
export interface SchemaPrimitiveNode {

  kind: "primitive";
  types: JsonTypeName[];
}

/**
 * One node in a record's described shape. The tag says which kind it is, and each kind carries only what that kind needs.
 *
 * @category CLI
 */
export type SchemaNode = SchemaArrayNode | SchemaDictionaryNode | SchemaObjectNode | SchemaOpaqueNode | SchemaPrimitiveNode;

/**
 * The modelKey vocabulary, carried as the nested tiers the library declares: the id-keyed device collections, the device-addressable keys, every key the reducer folds
 * into state, and every key the controller is known to emit at all.
 *
 * @category CLI
 */
export interface ModelKeyVocabulary {

  collection: string[];
  device: string[];
  known: string[];
  state: string[];
}

/**
 * The generated manifest. `records` is keyed by bootstrap member name and holds the tree for what that member carries - one record for the NVR singleton, the element
 * record for a collection. `recordKeys` resolves a realtime frame's modelKey to its `records` key, so a consumer never re-derives the protocol's pluralization.
 * `version` is the package version that generated the file, which is what makes version skew visible in anything the manifest is used to produce.
 *
 * @category CLI
 */
export interface SchemaManifest {

  eventTypes: string[];
  modelKeys: ModelKeyVocabulary;
  recordKeys: Record<string, string>;
  records: Record<string, SchemaNode>;
  version: string;
}

/**
 * A top-level bootstrap key the library does not declare at all - a whole collection or member the controller has that this version has never heard of.
 *
 * @category CLI
 */
export interface UnknownCollectionFinding {

  collection: string;
  kind: "unknownCollection";
  valueType: ObservedJsonType;
}

/**
 * A wire event type outside the library's recognized vocabulary. Observable only on the raw rail: an unrecognized type classifies to `null`, so it never reaches the
 * typed event firehose.
 *
 * @category CLI
 */
export interface UnknownEventTypeFinding {

  eventType: string;
  kind: "unknownEventType";
}

/**
 * A field on a known record that the library does not declare. `path` is dotted from the record root, with `[]` for an array hop and `*` for a dictionary key; `open`
 * carries whether the shape it appeared on admits unknown keys.
 *
 * @category CLI
 */
export interface UnknownFieldFinding {

  collection: string;
  kind: "unknownField";
  observedType: ObservedJsonType;
  open: boolean;
  path: string;
  recordId: string;
}

/**
 * A record whose self-declared modelKey is outside the library's known vocabulary - a device class this version cannot place. Reported per record, because a brand-new
 * class never reaches the reduced state and so appears nowhere else: losing per-unit identity here would lose every unit past the first.
 *
 * @category CLI
 */
export interface UnknownModelKeyFinding {

  kind: "unknownModelKey";
  modelKey: string;
  recordId: string;
}

/**
 * Something the controller sent that this version of the library does not describe. Each kind names its own subject, so a consumer reads the finding without
 * re-deriving what it is about.
 *
 * @category CLI
 */
export type NoveltyFinding = UnknownCollectionFinding | UnknownEventTypeFinding | UnknownFieldFinding | UnknownModelKeyFinding;

/**
 * A few records from a bootstrap member no shape is declared for, and how many the controller actually sent.
 *
 * A novelty finding says that something is unmodeled; this says what it looks like. `kept` holds the exemplars, `seen` holds the size of the collection they were drawn
 * from, so a reader knows whether three records are the whole story or the first three of forty.
 *
 * @category CLI
 */
export interface UnmodeledSnapshot {

  collection: string;
  kept: unknown[];
  seen: number;
}

/**
 * The identity of a finding - what makes two observations the same finding rather than two.
 *
 * The key is the JSON serialization of an ordered tuple rather than a joined string, because a delimiter-joined key collides whenever a field's own text contains the
 * delimiter, and record ids and field paths are exactly the values that would.
 *
 * @param finding - The finding to identify.
 *
 * @returns A stable key equal for two findings that describe the same thing, and different otherwise.
 *
 * @category CLI
 */
export function noveltyKey(finding: NoveltyFinding): string {

  // Exhaustive by construction: every kind returns, so a new kind added without its own case leaves the function without an ending return and fails to compile.
  switch(finding.kind) {

    case "unknownCollection":

      return JSON.stringify([ finding.kind, finding.collection ]);

    case "unknownEventType":

      return JSON.stringify([ finding.kind, finding.eventType ]);

    case "unknownField":

      return JSON.stringify([ finding.kind, finding.collection, finding.recordId, finding.path ]);

    case "unknownModelKey":

      return JSON.stringify([ finding.kind, finding.modelKey, finding.recordId ]);
  }
}

// Whether a value is a plain JSON object - the shape a record, an object node, and a dictionary all require.
//
// The test is the prototype rather than `typeof`, because a raw frame's payload is whatever the codec produced: parsed JSON, a UTF-8 string, or a `Buffer`. A buffer
// answers `typeof` as an object and enumerates as numeric index keys, so a looser test would walk one and report every byte as an undeclared field. Parsed JSON always
// carries the ordinary object prototype, so this admits exactly what a record can be and nothing else.
function isPlainObject(value: unknown): value is Record<string, unknown> {

  if((typeof value !== "object") || (value === null)) {

    return false;
  }

  const prototype: unknown = Object.getPrototypeOf(value);

  return (prototype === Object.prototype) || (prototype === null);
}

// Name the JSON shape of an observed value. Total over `unknown` so a novelty finding can always say what it found; parsed JSON only ever produces the six shapes
// below, and the fallback keeps the function total for anything else a caller hands it.
function observedTypeOf(value: unknown): ObservedJsonType {

  if(value === null) {

    return "null";
  }

  if(Array.isArray(value)) {

    return "array";
  }

  switch(typeof value) {

    case "boolean":

      return "boolean";

    case "number":

      return "number";

    case "string":

      return "string";

    case "object":

      return "object";

    default:

      return "null";
  }
}

// Extend a dotted path with one segment. The root of a record walk is the empty path, so the first segment stands alone rather than arriving with a leading dot.
function extendPath(path: string, segment: string): string {

  return (path === "") ? segment : (path + "." + segment);
}

// Read a record's own id, structurally. Records carry `id`; the empty string stands in for one that does not, so a finding always has a record field even when the
// wire gave nothing to attribute it to.
function recordIdOf(record: unknown): string {

  if(isPlainObject(record) && (typeof record["id"] === "string")) {

    return record["id"];
  }

  return "";
}

// The context one record walk carries: which manifest member it is walking, whose record it is, and where the findings accumulate.
interface WalkContext {

  collection: string;
  findings: NoveltyFinding[];
  recordId: string;
}

// Walk a value against the node that describes it, appending an unknownField finding for every key the node does not declare. Only object nodes can produce findings:
// an opaque node declares nothing to be undeclared against, a primitive holds no keys, and array and dictionary nodes describe their contents rather than name them.
// A value whose shape does not match its node is left alone - a type mismatch is a different question from novelty, and reporting it here would drown the real signal.
function walkNode(node: SchemaNode, value: unknown, path: string, ctx: WalkContext): void {

  switch(node.kind) {

    case "array":

      if(Array.isArray(value)) {

        for(const element of value) {

          walkNode(node.element, element, path + "[]", ctx);
        }
      }

      return;

    case "dictionary":

      // A dictionary's keys are data, so none of them is novelty and the path collapses them to one wildcard segment - which also keeps a chatty keyed map from
      // reporting the same undeclared inner field once per key.
      if(isPlainObject(value)) {

        for(const inner of Object.values(value)) {

          walkNode(node.values, inner, extendPath(path, "*"), ctx);
        }
      }

      return;

    case "object":

      if(isPlainObject(value)) {

        for(const [ key, inner ] of Object.entries(value)) {

          const declared = node.fields[key];

          if(declared === undefined) {

            ctx.findings.push({ collection: ctx.collection, kind: "unknownField", observedType: observedTypeOf(inner), open: node.open,
              path: extendPath(path, key), recordId: ctx.recordId });

            continue;
          }

          walkNode(declared, inner, extendPath(path, key), ctx);
        }
      }

      return;

    default:

      return;
  }
}

// Walk one record against its collection's tree. The record's own id attributes every finding it produces, so two units of the same collection stay distinguishable.
function walkRecord(node: SchemaNode, record: unknown, collection: string, findings: NoveltyFinding[]): void {

  walkNode(node, record, "", { collection, findings, recordId: recordIdOf(record) });
}

/**
 * Diff a parsed bootstrap against the manifest, reporting every top-level key the library does not declare and every undeclared field inside the ones it does.
 *
 * The bootstrap arrives as `unknown` and is read structurally throughout. Casting it to the library's bootstrap type would assert the very thing this function exists
 * to check, so the walk trusts nothing about its shape.
 *
 * A `records` entry describes one record, while a bootstrap member holds either one record (the NVR singleton) or a collection of them, so an array member is fanned
 * across its elements here at the top level and a single object member is handed straight through. Below that, each node kind describes exactly one shape.
 *
 * Declared-but-absent is not novelty: optional fields and capability nulls are ordinary, so the walk reports only what arrived and was not declared.
 *
 * @param manifest - The loaded manifest to check against.
 * @param bootstrap - A parsed bootstrap document.
 *
 * @returns Every novelty finding, in the order the bootstrap presented its keys.
 *
 * @category CLI
 */
export function diffBootstrap(manifest: SchemaManifest, bootstrap: unknown): NoveltyFinding[] {

  const findings: NoveltyFinding[] = [];

  if(!isPlainObject(bootstrap)) {

    return findings;
  }

  for(const [ key, value ] of Object.entries(bootstrap)) {

    const node = manifest.records[key];

    if(node === undefined) {

      findings.push({ collection: key, kind: "unknownCollection", valueType: observedTypeOf(value) });

      continue;
    }

    if(Array.isArray(value)) {

      for(const element of value) {

        walkRecord(node, element, key, findings);
      }

      continue;
    }

    walkRecord(node, value, key, findings);
  }

  return findings;
}

/**
 * Take exemplar records from every bootstrap member the manifest describes no shape for.
 *
 * {@link diffBootstrap} reports that a collection is unmodeled; this carries the evidence of what is in it. Both cases matter: a member the manifest has never heard of
 * at all, and one the library carries as raw JSON without describing. Neither can produce a field-level finding - there is no declared shape to be undeclared against -
 * so without a sample of the records themselves, the very device class a capture was run to understand contributes nothing a reader could model it from.
 *
 * A few records rather than the collection: exemplars show which fields vary between units and which are fixed, while a roster only inflates the bundle. `seen` records
 * what was elided, so a truncated snapshot never reads as a complete one.
 *
 * The bootstrap arrives as `unknown` and is read structurally, the same posture {@link diffBootstrap} takes and for the same reason: casting it to the library's own
 * bootstrap type would assert exactly what a document collected for its unmodeled parts cannot be assumed to satisfy.
 *
 * The exemplars are the controller's records verbatim, so a caller that publishes them scrubs them: `ufp capture` scrubs the assembled bundle in one pass, which puts
 * these records under the same replacement memory as the frames and the inventory and keeps every cross-reference between them intact.
 *
 * @param manifest - The loaded manifest to check against.
 * @param bootstrap - A parsed bootstrap document.
 * @param limit - How many records to keep from each collection.
 *
 * @returns One entry per unmodeled member, in the order the bootstrap presented its keys. A member holding an empty collection contributes none.
 *
 * @category CLI
 */
export function snapshotUnmodeled(manifest: SchemaManifest, bootstrap: unknown, limit: number): UnmodeledSnapshot[] {

  const snapshots: UnmodeledSnapshot[] = [];

  if(!isPlainObject(bootstrap)) {

    return snapshots;
  }

  for(const [ key, value ] of Object.entries(bootstrap)) {

    const node = manifest.records[key];

    // A described member is already modeled, and its records are reported field by field by the diff instead.
    if((node !== undefined) && (node.kind !== "opaque")) {

      continue;
    }

    if(Array.isArray(value)) {

      // An empty collection is the controller saying it has none of these, which is worth nothing as shape evidence.
      if(value.length === 0) {

        continue;
      }

      snapshots.push({ collection: key, kept: value.slice(0, limit), seen: value.length });

      continue;
    }

    // A member that is not a collection is one record - the singleton shape a bootstrap uses for a lone object, and equally the scalar an unmodeled member sometimes is.
    snapshots.push({ collection: key, kept: [value], seen: 1 });
  }

  return snapshots;
}

/**
 * Diff one record against the manifest - the realtime counterpart of {@link diffBootstrap}, for a frame carrying a single record's payload.
 *
 * A modelKey outside the known vocabulary is itself the finding, reported per record so each physical unit of an unrecognized class is its own entry. A known modelKey
 * with no record tree (the activity channel, a recognized-but-unreduced class) yields nothing: the library recognizes it and describes no shape for it, so there is
 * nothing to be novel against.
 *
 * @param manifest - The loaded manifest to check against.
 * @param subject - The record's self-declared modelKey, its payload, and the id the frame header attributed it to.
 *
 * @returns Every novelty finding the record produced.
 *
 * @category CLI
 */
export function diffRecord(manifest: SchemaManifest, subject: { modelKey: string; record: unknown; recordId: string }): NoveltyFinding[] {

  if(!manifest.modelKeys.known.includes(subject.modelKey)) {

    return [{ kind: "unknownModelKey", modelKey: subject.modelKey, recordId: subject.recordId }];
  }

  const collection = manifest.recordKeys[subject.modelKey];
  const node = (collection === undefined) ? undefined : manifest.records[collection];

  if((collection === undefined) || (node === undefined)) {

    return [];
  }

  const findings: NoveltyFinding[] = [];

  // The frame header's id attributes the findings rather than the payload's own, because a partial update carries the record's fields without necessarily repeating
  // its identity.
  walkNode(node, subject.record, "", { collection, findings, recordId: subject.recordId });

  return findings;
}

/**
 * Check a wire event type against the manifest's recognized vocabulary.
 *
 * @param manifest - The loaded manifest to check against.
 * @param eventType - The `type` string from an `event`-modelKey payload.
 *
 * @returns A single finding when the type is unrecognized, or an empty array when it is known.
 *
 * @category CLI
 */
export function diffEventType(manifest: SchemaManifest, eventType: string): NoveltyFinding[] {

  return manifest.eventTypes.includes(eventType) ? [] : [{ eventType, kind: "unknownEventType" }];
}

/**
 * Read the wire event type off a raw packet.
 *
 * An occurrence's kind lives in its payload's `type` string, and only `event`-modelKey packets carry one. This is the CLI's single reader of that wire field, and it
 * lives beside the vocabulary the value gets checked against so the two cannot drift apart.
 *
 * @param packet - Any decoded raw packet.
 *
 * @returns The event type, or `undefined` for a packet that is not an activity occurrence or whose payload does not name one.
 *
 * @category CLI
 */
export function eventTypeOf(packet: RawPacket): string | undefined {

  if(packet.header.modelKey !== "event") {

    return undefined;
  }

  const { payload } = packet;

  if(isPlainObject(payload) && (typeof payload["type"] === "string")) {

    return payload["type"];
  }

  return undefined;
}

// Fail with a message that names the manifest file and the defect found in it. Every validation failure below routes through here so the operator always learns which
// file was rejected and why, rather than reading a bare parse error.
function malformed(source: string, defect: string): never {

  throw new CliError("The schema manifest at " + source + " is malformed: " + defect + ".");
}

// The scalar type names a primitive node may declare, as a runtime set. Paired with JsonTypeName so the two cannot drift: the satisfies check forces this to name
// exactly the union's members.
const JSON_TYPE_NAMES = Object.keys({ boolean: true, null: true, number: true, string: true } satisfies Record<JsonTypeName, true>);

// Whether a parsed value is an array of strings.
function isStringArray(value: unknown): value is string[] {

  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

// Whether a parsed value is an array of JSON scalar type names. The closed check is what turns a typo'd or invented type tag into a rejected file rather than data a
// diff would later read as meaningful.
function isJsonTypeNameArray(value: unknown): value is JsonTypeName[] {

  return isStringArray(value) && value.every((entry) => JSON_TYPE_NAMES.includes(entry));
}

// Validate one node and everything beneath it. The walk is recursive rather than a check of the top level alone, because a defect buried deep in a record tree would
// otherwise surface as a confusing failure much later, in the middle of a diff, rather than at the boundary where the file was trusted.
function requireNode(value: unknown, source: string, path: string): SchemaNode {

  if(!isPlainObject(value)) {

    malformed(source, "the node at \"" + path + "\" is not an object");
  }

  const kind = value["kind"];

  switch(kind) {

    case "array": {

      return { element: requireNode(value["element"], source, path + ".element"), kind: "array" };
    }

    case "dictionary": {

      return { kind: "dictionary", values: requireNode(value["values"], source, path + ".values") };
    }

    case "object": {

      const fields = value["fields"];
      const open = value["open"];

      if(!isPlainObject(fields)) {

        malformed(source, "the object node at \"" + path + "\" has no \"fields\" object");
      }

      if(typeof open !== "boolean") {

        malformed(source, "the object node at \"" + path + "\" must express its \"open\" flag as a boolean");
      }

      const validated: Record<string, SchemaNode> = {};

      for(const [ key, field ] of Object.entries(fields)) {

        validated[key] = requireNode(field, source, extendPath(path, key));
      }

      return { fields: validated, kind: "object", open };
    }

    case "opaque": {

      return { kind: "opaque" };
    }

    case "primitive": {

      const types = value["types"];

      if(!isJsonTypeNameArray(types)) {

        malformed(source, "the primitive node at \"" + path + "\" declares a type outside the JSON scalar types");
      }

      return { kind: "primitive", types };
    }

    default: {

      malformed(source, "the node at \"" + path + "\" carries an unrecognized kind " + JSON.stringify(kind));
    }
  }
}

// Pull a required array-of-strings member off the parsed file.
function requireStringArray(record: Record<string, unknown>, key: string, source: string): string[] {

  const value = record[key];

  if(!isStringArray(value)) {

    malformed(source, "its \"" + key + "\" member is not an array of strings");
  }

  return value;
}

// Pull the modelKey vocabulary off the parsed file, checking each tier.
function requireVocabulary(record: Record<string, unknown>, source: string): ModelKeyVocabulary {

  const value = record["modelKeys"];

  if(!isPlainObject(value)) {

    malformed(source, "its \"modelKeys\" member is not an object");
  }

  return {

    collection: requireStringArray(value, "collection", source),
    device: requireStringArray(value, "device", source),
    known: requireStringArray(value, "known", source),
    state: requireStringArray(value, "state", source)
  };
}

/**
 * Parse and validate a manifest document.
 *
 * The file is validated rather than trusted, the same posture the credentials loader takes at its own JSON boundary. A production manifest is complete by construction
 * - the generator builds it from the library's types - but this loader has no way to know it is reading one, and a half-written or hand-edited file failing loudly here
 * is far better than a diff quietly reporting nothing because a record tree went missing.
 *
 * @param text - The manifest file's contents.
 * @param source - Where the text came from, for the error messages.
 *
 * @returns The validated manifest.
 *
 * @throws {@link CliError} when the text is not valid JSON, or is valid JSON that is not a well-formed manifest.
 *
 * @category CLI
 */
export function parseSchemaManifest(text: string, source: string): SchemaManifest {

  let parsed: unknown;

  try {

    parsed = JSON.parse(text);
  } catch(error) {

    throw new CliError("The schema manifest at " + source + " is not valid JSON.", { cause: error });
  }

  if(!isPlainObject(parsed)) {

    malformed(source, "it is not a JSON object");
  }

  const version = parsed["version"];
  const rawRecords = parsed["records"];
  const rawRecordKeys = parsed["recordKeys"];

  if(typeof version !== "string") {

    malformed(source, "its \"version\" member is not a string");
  }

  if(!isPlainObject(rawRecords)) {

    malformed(source, "its \"records\" member is not an object");
  }

  if(!isPlainObject(rawRecordKeys)) {

    malformed(source, "its \"recordKeys\" member is not an object");
  }

  const eventTypes = requireStringArray(parsed, "eventTypes", source);
  const modelKeys = requireVocabulary(parsed, source);
  const records: Record<string, SchemaNode> = {};

  for(const [ key, node ] of Object.entries(rawRecords)) {

    records[key] = requireNode(node, source, key);
  }

  const recordKeys: Record<string, string> = {};

  for(const [ modelKey, collection ] of Object.entries(rawRecordKeys)) {

    if(typeof collection !== "string") {

      malformed(source, "its \"recordKeys\" entry for " + JSON.stringify(modelKey) + " is not a string");
    }

    if(!(collection in records)) {

      malformed(source, "its \"recordKeys\" entry for " + JSON.stringify(modelKey) + " names the absent record " + JSON.stringify(collection));
    }

    recordKeys[modelKey] = collection;
  }

  // Every realtime-reduced modelKey must resolve to a record tree, because that resolution is what lets a frame be diffed at all. Checking it here means a lookup
  // during a diff can never come up empty on a manifest this loader accepted.
  for(const modelKey of modelKeys.state) {

    if(!(modelKey in recordKeys)) {

      malformed(source, "its \"modelKeys.state\" member " + JSON.stringify(modelKey) + " has no \"recordKeys\" entry");
    }
  }

  return { eventTypes, modelKeys, recordKeys, records, version };
}

/**
 * Load the generated schema manifest from disk.
 *
 * @param location - The manifest file to read; defaults to the one this package ships beside its compiled code.
 *
 * @returns The validated manifest.
 *
 * @throws {@link CliError} when the file is missing (with the hint that the build produces it), unreadable, or not a well-formed manifest.
 *
 * @category CLI
 */
export async function loadSchemaManifest(location: URL | string = new URL(MANIFEST_LOCATION, import.meta.url)): Promise<SchemaManifest> {

  const source = (typeof location === "string") ? location : location.pathname;

  let text: string;

  try {

    text = await readFile(location, "utf8");
  } catch(error) {

    if((error as NodeJS.ErrnoException).code === "ENOENT") {

      throw new CliError("No schema manifest was found at " + source + ". Run \"npm run build\" to generate it.", { cause: error });
    }

    throw new CliError("Unable to read the schema manifest at " + source + ".", { cause: error });
  }

  return parseSchemaManifest(text, source);
}
