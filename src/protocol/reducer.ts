/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * reducer.ts: The pure state reducer at the heart of the architecture.
 */

/**
 * The pure reducer that models a Protect controller's state as a fold over a typed packet stream.
 *
 * This module is Layer 1 and the conceptual center of the library: {@link reduce} is `(state, event) -> state`, where `event` is a {@link TypedEvent} from the
 * classifier and `state` is an immutable {@link ProtectState}. Bootstrap is not a thing the library fetches and holds - it is the initial state the reducer starts
 * from (via the synthetic `bootstrapLoaded` event), then continuously advances. Periodic re-bootstrap is a permanent failsafe against the controller's occasionally
 * lossy event delivery, reconciled here so that a refresh which finds no drift produces no observable change at all.
 *
 * Three invariants make the observation layer above this cheap and correct:
 *
 * - **Immutability.** No function here mutates its input. Every step returns either the same reference (nothing changed) or a new one (something did).
 * - **Structural sharing.** A change rebuilds only the path from the root to the changed node; every untouched device, map, and nested object keeps its existing
 *   reference. This is what makes `Object.is`-based change detection in selectors and observers both correct and nearly free.
 * - **No-op fidelity.** A patch, upsert, removal, or full re-bootstrap that changes nothing by *value* returns the same reference by *identity*. This is the
 *   load-bearing property for "the 120-second refresh is invisible when nothing drifted."
 *
 * @module ProtectReducer
 */
import type { DeepPartial, ProtectCameraConfig, ProtectChimeConfig, ProtectFobConfig, ProtectLightConfig, ProtectNvrBootstrap, ProtectNvrConfig, ProtectNvrLiveviewConfig,
  ProtectNvrUserConfig, ProtectRelayConfig, ProtectRingtoneConfig, ProtectSensorConfig, ProtectStateRecord, ProtectViewerConfig } from "../types/index.ts";
import type { StateModelKey, TypedEvent } from "./events.ts";
import { assertNever } from "../errors.ts";
import { isDeepStrictEqual } from "node:util";

/**
 * The immutable snapshot of a controller's modeled state. Devices are normalized into `id -> config` maps for O(1) lookup; selectors derive arrays on demand and
 * memoize on map identity. `bootstrapId` is a monotonic counter incremented on every applied bootstrap - internal bookkeeping that guarantees a bootstrap always mints a
 * fresh state reference (the store's dispatch gate relies on this), surfaced for diagnostics but read by no device observer.
 *
 * There is deliberately no `lastEventAt` here. Channel liveness is intrinsic to the realtime channel, so the events-WebSocket watchdog reads its timestamp from the
 * `EventStream` (which clock-stamps every message), not from this state: a pure reducer cannot write a wall-clock field without minting a new state reference on every
 * packet, which would destroy the no-op/structural-sharing invariant the observation layer depends on.
 *
 * Beyond devices, the state carries session identity and the controller's read-only collections, all lifted from the bootstrap: `authUserId` (the authenticated session's
 * user id, a singleton like `nvr`), `users` (the controller's roster), `liveviews` (the saved camera layouts), and `ringtones` (the chime ringtone library), each
 * normalized like the device collections. These are real controller state, not connect-time constants - a user's permissions change, liveviews are edited, ringtones are
 * uploaded - so they must be reducer-derived and observable as they change.
 *
 * Two of those collections advance differently, and the distinction is deliberate. `user` and `liveview` are `StateModelKey`s, so they advance in realtime through the
 * generic upsert/patch/remove paths as a device (a change reflects within event latency), with the periodic bootstrap as the failsafe. `ringtones`, by contrast, is
 * reduced *bootstrap-only*: the controller broadcasts no `ringtone` realtime packet, so this map is written exclusively by `applyBootstrap` (never by `mapFieldFor`) and
 * is intentionally absent from `DeviceMapField`. That is the honest encoding of "reduced and observable, but not realtime-addressed" - see the two-axis note on
 * {@link StateModelKey}.
 */
export type ProtectState = Readonly<{

  authUserId: string | null;
  bootstrapId: number;
  cameras: ReadonlyMap<string, ProtectCameraConfig>;
  chimes: ReadonlyMap<string, ProtectChimeConfig>;
  fobs: ReadonlyMap<string, ProtectFobConfig>;
  lights: ReadonlyMap<string, ProtectLightConfig>;
  liveviews: ReadonlyMap<string, ProtectNvrLiveviewConfig>;
  nvr: ProtectNvrConfig | null;
  relays: ReadonlyMap<string, ProtectRelayConfig>;
  ringtones: ReadonlyMap<string, ProtectRingtoneConfig>;
  sensors: ReadonlyMap<string, ProtectSensorConfig>;
  users: ReadonlyMap<string, ProtectNvrUserConfig>;
  viewers: ReadonlyMap<string, ProtectViewerConfig>;
}>;

// The state fields the realtime reducer path writes via mapFieldFor - the maps backed by a StateModelKey. The NVR is excluded (a singleton field, not a map); `ringtones`
// is excluded because it is reduced bootstrap-only (no `ringtone` realtime packet), so applyBootstrap writes it directly rather than through withDeviceMap. The user and
// liveview rosters are included alongside the devices, as both are realtime-addressed StateModelKeys. Exported so a downward consumer (the store's adoption scan) can
// name the field it looks a pre-fold record up in, rather than re-deriving the mapping.
export type DeviceMapField = "cameras" | "chimes" | "fobs" | "lights" | "liveviews" | "relays" | "sensors" | "users" | "viewers";

// The reduced model keys whose state is stored as a map (every StateModelKey except "nvr", which is the singleton). It lets mapFieldFor return a non-optional
// DeviceMapField, so the impossible "model key with no map" case is unrepresentable rather than defended against at runtime. Exported alongside mapFieldFor and
// MAP_BACKED_STATE_MODEL_KEYS as the single source of "which model keys are map-backed collections", shared by the store's adoption scan.
export type MapBackedStateModelKey = Exclude<StateModelKey, "nvr">;

// The map-backed state model keys as a runtime list, so both this reducer's adoption normalization and the store's adoption scan iterate one enumeration derived from the
// vocabulary rather than a hand-maintained second list. The `satisfies Record<MapBackedStateModelKey, ...>` forces the object to name every map-backed key exactly - a
// new device category added to the vocabulary fails to compile here until it is listed, and mapFieldFor's exhaustiveness guard forces its field mapping in the same
// edit - so the enumeration cannot silently drift from the model. Ordering is the literal's declaration order, which is deterministic and unobservable to consumers.
export const MAP_BACKED_STATE_MODEL_KEYS = Object.keys({

  camera: true, chime: true, fob: true, light: true, liveview: true, relay: true, sensor: true, user: true, viewer: true
} satisfies Record<MapBackedStateModelKey, true>) as readonly MapBackedStateModelKey[];

// A state-record map viewed uniformly across the concrete config types. All stored records are assignable to ProtectStateRecord and ReadonlyMap is covariant in its
// value, so this view is sound; it lets the upsert/patch/remove logic operate once over any record map rather than being duplicated per concrete record-map type.
type DeviceMap = ReadonlyMap<string, ProtectStateRecord>;

/**
 * Build the empty starting state. The reducer begins here and advances via `bootstrapLoaded`; every map is fresh, the NVR and `authUserId` are null, and the lone
 * counter `bootstrapId` is zero.
 *
 * @returns A new, empty {@link ProtectState}.
 *
 * @category Reducer
 */
export function createInitialState(): ProtectState {

  return {

    authUserId: null,
    bootstrapId: 0,
    cameras: new Map(),
    chimes: new Map(),
    fobs: new Map(),
    lights: new Map(),
    liveviews: new Map(),
    nvr: null,
    relays: new Map(),
    ringtones: new Map(),
    sensors: new Map(),
    users: new Map(),
    viewers: new Map()
  };
}

/**
 * Advance the state by one typed event. Pure: returns a new state when the event changes something, or the *same reference* when it does not.
 *
 * State transitions advance the model: `bootstrapLoaded` reconciles against a fresh bootstrap, `deviceAdded` upserts a full record, `devicePatched` deep-merges a
 * partial, `deviceRemoved` deletes. Activity signals (`motionDetected`, `smartDetect`, `tamperDetected`, `authDetected`, `doorbellRing`, `accessEvent`)
 * are occurrences rather than state - they reach consumers through the firehose, and the reducer returns the state unchanged for them.
 *
 * @param state - The current state.
 * @param event - The typed event to apply.
 *
 * @returns The next state, identical by reference to `state` when nothing changed.
 *
 * @throws {@link ProtectProtocolError} only if an unrecognized event kind reaches the reducer - a defect that the exhaustiveness guard converts from a silent
 *   fall-through into a loud failure.
 *
 * @category Reducer
 */
export function reduce(state: ProtectState, event: TypedEvent): ProtectState {

  switch(event.kind) {

    case "bootstrapLoaded":

      return applyBootstrap(state, event.data);

    case "deviceAdded":

      return upsertDevice(state, event.modelKey, event.id, event.data);

    case "devicePatched":

      return patchDevice(state, event.modelKey, event.id, event.patch);

    case "deviceRemoved":

      return removeDevice(state, event.modelKey, event.id);

    // Activity signals are occurrences, not state. They are delivered to consumers via the firehose; the reducer is deliberately a no-op for them and returns the
    // current state reference so no observer is notified.
    case "accessEvent":
    case "authDetected":
    case "buttonPressed":
    case "doorbellRing":
    case "motionDetected":
    case "smartDetect":
    case "tamperDetected":

      return state;

    default:

      // Exhaustiveness guard. If a new TypedEvent kind is added to the union without a case above, `event` is no longer `never` here and this fails to compile -
      // turning a silent fall-through into a build error. At runtime (a malformed dispatch from untyped code) we throw rather than silently ignore it.
      return assertNever(event);
  }
}

/**
 * Recursively merge a partial patch onto a device record. Objects merge by key; arrays and primitives replace wholesale; an explicit `null` clears a field. The
 * merge is value-aware: it returns the *same reference* when the patch changes nothing, and rebuilds only the nodes on the path to an actual change (every untouched
 * nested object keeps its reference). This is the structural-sharing engine the no-op fidelity invariant depends on.
 *
 * @param device - The current device record.
 * @param patch  - The partial update to merge onto it.
 *
 * @returns The merged record, identical by reference to `device` when the patch changed nothing.
 *
 * @category Reducer
 */
export function applyDevicePatch<T>(device: T, patch: DeepPartial<T>): T {

  // Guard for the recursion's degenerate cases. At the top level a device is always an object; this handles a caller passing a non-object, where there is nothing to
  // merge key-wise and the patch simply replaces (unless it is value-equal, in which case the original reference is preserved).
  if(!isPlainObject(device) || !isPlainObject(patch)) {

    return (isDeepStrictEqual(device, patch) ? device : patch) as T;
  }

  return mergeObjects(device, patch) as T;
}

/**
 * Atomically reconcile the state against a fresh bootstrap. Each device present in the bootstrap is matched against the current state: an unchanged device keeps its
 * existing reference (so selectors and observers see no change), a changed device takes the new reference, and a device absent from the bootstrap is dropped. A map
 * with no net change keeps its own reference, so a refresh that finds zero drift produces zero observer notifications. `bootstrapId` always increments - it counts
 * applied bootstraps and guarantees each mints a fresh state reference for the store's dispatch gate, internal bookkeeping no device observer reads.
 *
 * @param state     - The current state.
 * @param bootstrap - The freshly fetched bootstrap document.
 *
 * @returns The reconciled state.
 *
 * @category Reducer
 */
export function applyBootstrap(state: ProtectState, bootstrap: ProtectNvrBootstrap): ProtectState {

  // Repair the self-contradictory adopted-by-other record on the incoming side, before reconcileMap's value comparison runs. `source` is the same bootstrap reference
  // when nothing needed repair, so a coherent bootstrap reconciles exactly as before; when a device did need it, `source` is a copy carrying corrected device arrays and
  // the original bootstrap is left untouched for the wire-faithful surfaces. Because the repair happens ahead of the comparison, a re-normalized repeat of an
  // already-normalized record compares equal by value and reconcileMap preserves its map and record identity - no re-mint for the hours the controller defect repeats.
  const source = normalizeBootstrapAdoption(bootstrap);
  const nvr = ((state.nvr !== null) && isDeepStrictEqual(state.nvr, source.nvr)) ? state.nvr : source.nvr;

  return {

    authUserId: source.authUserId,
    bootstrapId: state.bootstrapId + 1,
    cameras: reconcileMap(state.cameras, source.cameras),
    chimes: reconcileMap(state.chimes, source.chimes),
    fobs: reconcileMap(state.fobs, source.fobs),
    lights: reconcileMap(state.lights, source.lights),
    liveviews: reconcileMap(state.liveviews, source.liveviews),
    nvr,
    relays: reconcileMap(state.relays, source.relays),
    ringtones: reconcileMap(state.ringtones, source.ringtones),
    sensors: reconcileMap(state.sensors, source.sensors),
    users: reconcileMap(state.users, source.users),
    viewers: reconcileMap(state.viewers, source.viewers)
  };
}

// Upsert a full device record: insert a new id, or replace an existing one. A re-sent identical record is a no-op (the existing reference is kept), so a realtime `add`
// carrying unchanged data produces no churn. This path serves the `deviceAdded` action only; a bootstrap reconciles through `reconcileMap` instead.
function upsertDevice(state: ProtectState, modelKey: StateModelKey, id: string, data: ProtectStateRecord): ProtectState {

  // Repair the incoming full record on its way in, as a copy, before either comparison below sees it. A full record is self-describing, so the detector reads its own
  // adoption fields (no stored fallback needed). A coherent record passes through by reference and every existing comparison is unchanged.
  const record = normalizeAdoptedByOther(undefined, data, readOwnMac(state.nvr));

  if(modelKey === "nvr") {

    return ((state.nvr !== null) && isDeepStrictEqual(state.nvr, record)) ? state : { ...state, nvr: record as ProtectNvrConfig };
  }

  // modelKey is now narrowed by TypeScript to MapBackedStateModelKey - the nvr singleton was handled above, so every remaining value maps to a real DeviceMapField.
  const field = mapFieldFor(modelKey);
  const current = state[field] as DeviceMap;
  const existing = current.get(id);

  if((existing !== undefined) && isDeepStrictEqual(existing, record)) {

    return state;
  }

  const next = new Map(current);

  next.set(id, record);

  return withDeviceMap(state, field, next);
}

// Deep-merge a partial onto an existing device. A patch for an unknown id is a no-op: a partial has no full base to merge onto, and the next bootstrap will add the
// device if it is real. A patch that changes nothing is a no-op via applyDevicePatch's reference preservation.
function patchDevice(state: ProtectState, modelKey: StateModelKey, id: string, patch: DeepPartial<ProtectStateRecord>): ProtectState {

  const ownMac = readOwnMac(state.nvr);

  if(modelKey === "nvr") {

    if(state.nvr === null) {

      return state;
    }

    // The NVR carries no adoption fields, so this repair is a pass-through; we route it through the same helper for one normalization path rather than a special case.
    const normalizedPatch = normalizeAdoptedByOther(state.nvr, patch, ownMac);
    const patchedNvr = applyDevicePatch(state.nvr, normalizedPatch as DeepPartial<ProtectNvrConfig>);

    return Object.is(patchedNvr, state.nvr) ? state : { ...state, nvr: patchedNvr };
  }

  // modelKey is now narrowed to MapBackedStateModelKey - nvr was handled above and mapFieldFor's input excludes it by type, so the lookup is total.
  const field = mapFieldFor(modelKey);
  const current = state[field] as DeviceMap;
  const existing = current.get(id);

  if(existing === undefined) {

    return state;
  }

  // Repair the incoming patch's adoption contribution against the merged view of the stored record and this patch, before applyDevicePatch merges it. A flip patch on an
  // already-correct stored record then merges to no change and returns the same record reference, so the stored record never changes because of the flag alone.
  const normalizedPatch = normalizeAdoptedByOther(existing, patch, ownMac);
  const patched = applyDevicePatch(existing, normalizedPatch);

  if(Object.is(patched, existing)) {

    return state;
  }

  const next = new Map(current);

  next.set(id, patched);

  return withDeviceMap(state, field, next);
}

// Delete a device by id. A removal for an absent id is a no-op. The NVR singleton has no remove semantics on the wire (the controller does not delete itself), so we
// explicitly no-op it here rather than dispatching through mapFieldFor; this also keeps mapFieldFor's input type narrowed to the map-backed subset.
function removeDevice(state: ProtectState, modelKey: StateModelKey, id: string): ProtectState {

  if(modelKey === "nvr") {

    return state;
  }

  // modelKey is now narrowed to MapBackedStateModelKey - the singleton was handled above.
  const field = mapFieldFor(modelKey);
  const current = state[field] as DeviceMap;

  if(!current.has(id)) {

    return state;
  }

  const next = new Map(current);

  next.delete(id);

  return withDeviceMap(state, field, next);
}

// Reconcile one device map against the bootstrap's device array. Generic over the concrete config type so each map keeps its precise typing (no widening, no casts).
// Reuses an existing record reference when it is value-equal to its bootstrap counterpart, and returns the existing map reference outright when nothing in it changed
// (no additions, removals, or value changes), so a drift-free refresh notifies no observer.
function reconcileMap<T extends { id: string }>(existing: ReadonlyMap<string, T>, devices: readonly T[]): ReadonlyMap<string, T> {

  // A size mismatch means a device was added or removed, which is necessarily a change. We seed `changed` from it so the same-size-but-different-membership case is
  // still caught below by the per-device add/replace checks.
  let changed = devices.length !== existing.size;
  const next = new Map<string, T>();

  for(const device of devices) {

    const prior = existing.get(device.id);

    if((prior !== undefined) && isDeepStrictEqual(prior, device)) {

      next.set(device.id, prior);
    } else {

      next.set(device.id, device);
      changed = true;
    }
  }

  return changed ? next : existing;
}

// Recursive object merge backing applyDevicePatch. Lazily clones the device only on the first actual change, so an all-no-op patch returns the original reference.
function mergeObjects(device: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {

  let result: Record<string, unknown> | null = null;

  for(const key of Object.keys(patch)) {

    const patchValue = patch[key];
    const deviceValue = device[key];
    let isChange: boolean;
    let nextValue: unknown;

    // Object onto object recurses (and inherits the reference-preserving no-op). Anything else - primitives, arrays, null, or a type mismatch - replaces wholesale,
    // and counts as a change only when the new value differs by value from the old one (or introduces a previously absent key).
    if(isPlainObject(patchValue) && isPlainObject(deviceValue)) {

      nextValue = mergeObjects(deviceValue, patchValue);
      isChange = !Object.is(nextValue, deviceValue);
    } else {

      nextValue = patchValue;
      isChange = !(key in device) || !isDeepStrictEqual(deviceValue, patchValue);
    }

    if(isChange) {

      result ??= { ...device };
      result[key] = nextValue;
    }
  }

  return result ?? device;
}

// Produce a new state with one device map replaced. The value-type widening to DeviceMap is sound at runtime - every id maps to its correct concrete config - and is
// confined here behind a single cast so the upsert/patch/remove paths stay generic and duplication-free.
function withDeviceMap(state: ProtectState, field: DeviceMapField, map: DeviceMap): ProtectState {

  return { ...state, [field]: map };
}

// Map a map-backed reduced model key to its backing state field. Total: every value of MapBackedStateModelKey enumerates here, and the exhaustiveness guard on the
// switch's default arm fails to compile if a new map-backed category is added without updating this mapping. The NVR singleton is excluded from the input type by
// construction, so the function returns a non-optional DeviceMapField - no defensive null-handling at the call sites. Exported so the store's adoption scan resolves a
// model key to its pre-fold state field through this one mapping rather than a copy of it.
export function mapFieldFor(modelKey: MapBackedStateModelKey): DeviceMapField {

  switch(modelKey) {

    case "camera":

      return "cameras";

    case "chime":

      return "chimes";

    case "fob":

      return "fobs";

    case "light":

      return "lights";

    case "liveview":

      return "liveviews";

    case "relay":

      return "relays";

    case "sensor":

      return "sensors";

    case "user":

      return "users";

    case "viewer":

      return "viewers";

    default:

      return assertNever(modelKey);
  }
}

// A non-null, non-array object - the shape that deep-merges rather than replaces.
function isPlainObject(value: unknown): value is Record<string, unknown> {

  return (typeof value === "object") && (value !== null) && !Array.isArray(value);
}

// Adoption normalization: refuse the self-contradictory adopted-by-other record at the ingestion boundary.
//
// A G2-generation controller can flip a connected device's `isAdoptedByOther` to true while its `nvrMac` still names this controller as the owner - a record that claims
// another controller owns it and that this controller owns it at once, which cannot both be true. Left as-is, the adoption judgment (isAdopted && !isAdoptedByOther)
// evicts a healthy device from every consumer's adopted set until the controller reboots. So the reducer corrects `isAdoptedByOther` to false on the incoming side of
// every path, always as a copy, before the value comparisons run; the predicate stays untouched and consumers heal through the corrected data. The store's diagnostics
// scan reuses the view and detector below, so normalization and observability never disagree on what the record effectively says.

/**
 * The effective adoption fields the self-contradiction detector reads: `isAdopted`, `isAdoptedByOther`, and `nvrMac`, each resolved from the incoming record-or-patch
 * when it carries a value of the right runtime type, else from the stored record. This is the one place the loosely-typed adoption fields are narrowed at runtime, since
 * they widen when read off a partial patch under strict typing, so this reducer's normalization and the store's diagnostics scan can never disagree on what a merged
 * record's adoption fields would be.
 *
 * @category Reducer
 */
export interface AdoptionView {

  isAdopted: boolean | undefined;
  isAdoptedByOther: boolean | undefined;
  nvrMac: string | undefined;
}

/**
 * Build the merged {@link AdoptionView} for an optional stored record and the incoming record-or-patch. Consumed by both this reducer's normalization and the store's
 * adoption scan, so the two share one definition of a field's effective value.
 *
 * @param stored   - The record already in state for this id, or undefined when there is none (a first add, or a bootstrap element).
 * @param incoming - The full record (add or bootstrap) or partial patch (update) arriving from the wire.
 *
 * @returns The three-field adoption view.
 *
 * @category Reducer
 */
export function adoptionView(stored: ProtectStateRecord | undefined, incoming: ProtectStateRecord | DeepPartial<ProtectStateRecord>): AdoptionView {

  const source = incoming as Record<string, unknown>;
  const prior = stored as Record<string, unknown> | undefined;

  return {

    isAdopted: mergedBoolean(source, prior, "isAdopted"),
    isAdoptedByOther: mergedBoolean(source, prior, "isAdoptedByOther"),
    nvrMac: mergedString(source, prior, "nvrMac")
  };
}

/**
 * Whether an adoption view is the provably-false self-contradiction this normalization refuses: the device is adopted, claims to be adopted by another controller, and
 * names a non-empty owning-controller MAC that equals this controller's own non-empty MAC. "Another controller owns me" and "this controller owns me" cannot both hold,
 * so the record is nonsense the model declines to honor. Anything less - not adopted, not flagged, a missing or empty MAC on either side, or two different MACs (a real
 * foreign adoption) - is not the contradiction and returns false.
 *
 * @param view   - The merged adoption view.
 * @param ownMac - This controller's own MAC (from the incoming bootstrap during a bootstrap, else the stored NVR record), or undefined before the first bootstrap.
 *
 * @returns `true` only for the self-contradictory shape.
 *
 * @category Reducer
 */
export function isAdoptionContradiction(view: AdoptionView, ownMac: string | undefined): boolean {

  return (view.isAdopted === true) && (view.isAdoptedByOther === true) && (typeof view.nvrMac === "string") && (view.nvrMac.length > 0) &&
    (typeof ownMac === "string") && (ownMac.length > 0) && (view.nvrMac === ownMac);
}

/**
 * The one runtime-narrowed read of the `isAdoptedByOther` flag an incoming record-or-patch carries on its own: the boolean the wire explicitly asserts, or undefined when
 * the payload is silent on adoption. The merged {@link adoptionView} reads through it, and the store's scan reads it directly to tell an explicit adoption assertion
 * (which drives an engaged-set transition) from a patch that says nothing about adoption (which must leave the set steady).
 *
 * @param incoming - The full record or partial patch arriving from the wire.
 *
 * @returns The explicitly asserted flag, or undefined when absent.
 *
 * @category Reducer
 */
export function adoptedByOtherAssertion(incoming: ProtectStateRecord | DeepPartial<ProtectStateRecord>): boolean | undefined {

  return wireBoolean(incoming, "isAdoptedByOther");
}

// Return the incoming record-or-patch unchanged when it is not the self-contradiction, else a copy with isAdoptedByOther forced false. Never mutates the incoming object:
// packetSink hands the same event object to the events() firehose, so the wire-faithful stream must still carry the raw flag after dispatch.
function normalizeAdoptedByOther<T extends ProtectStateRecord | DeepPartial<ProtectStateRecord>>(stored: ProtectStateRecord | undefined, incoming: T,
  ownMac: string | undefined): T {

  if(!isAdoptionContradiction(adoptionView(stored, incoming), ownMac)) {

    return incoming;
  }

  return { ...incoming, isAdoptedByOther: false };
}

// Normalize every self-contradictory element of one incoming device collection to a copy with isAdoptedByOther false, returning the same array reference when no element
// needed it - so applyBootstrap's reconcileMap sees an unchanged array and preserves its map identity. Each element is a full record, so the detector reads its own
// fields with no stored fallback. Clones the array lazily on the first correction, exactly as mergeObjects clones the object lazily, so the untouched common case
// allocates nothing.
function normalizeAdoptionCollection<T extends ProtectStateRecord>(devices: readonly T[], ownMac: string): readonly T[] {

  let copy: T[] | null = null;

  for(const [ index, device ] of devices.entries()) {

    const normalized = normalizeAdoptedByOther(undefined, device, ownMac);

    if(!Object.is(normalized, device)) {

      copy ??= [...devices];
      copy[index] = normalized;
    }
  }

  return copy ?? devices;
}

// Repair the self-contradictory adopted-by-other record across the incoming bootstrap's device collections, as a copy, before applyBootstrap reconciles it. Reads this
// controller's own MAC from the incoming bootstrap's own NVR record; when that is not a known non-empty string the detector is inert and the bootstrap passes through
// untouched. Threads over the map-backed collections via the shared enumeration and mapFieldFor - the user and liveview rosters carry no adoption fields, so the detector
// never matches them and their arrays pass through by reference (ringtones is bootstrap-only, never map-backed, so it is never visited). Returns the same bootstrap
// reference when nothing matched anywhere, and clones the bootstrap lazily on the first corrected collection, so a coherent bootstrap allocates nothing and the original
// object is never mutated.
function normalizeBootstrapAdoption(bootstrap: ProtectNvrBootstrap): ProtectNvrBootstrap {

  const ownMac = readOwnMac(bootstrap.nvr);

  if(ownMac === undefined) {

    return bootstrap;
  }

  const source = bootstrap as unknown as Record<string, unknown>;
  let copy: Record<string, unknown> | null = null;

  for(const modelKey of MAP_BACKED_STATE_MODEL_KEYS) {

    const field = mapFieldFor(modelKey);
    const original = source[field] as readonly ProtectStateRecord[] | undefined;

    if(original === undefined) {

      continue;
    }

    const normalized = normalizeAdoptionCollection(original, ownMac);

    if(!Object.is(normalized, original)) {

      copy ??= { ...source };
      copy[field] = normalized;
    }
  }

  return (copy ?? bootstrap) as ProtectNvrBootstrap;
}

// This controller's own MAC, read defensively off the NVR record (the stored singleton, or the incoming bootstrap's own NVR), or undefined when there is no NVR yet or it
// carries no string MAC - which keeps the detector inert until the controller identity is known.
function readOwnMac(nvr: ProtectNvrConfig | null): string | undefined {

  return isPlainObject(nvr) ? wireString(nvr, "mac") : undefined;
}

// A boolean field read from the incoming payload when present, else the stored record; `??` falls through only on undefined, so an explicit false on the incoming is
// honored rather than masked by a truthy stored value.
function mergedBoolean(incoming: Record<string, unknown>, stored: Record<string, unknown> | undefined, key: string): boolean | undefined {

  return wireBoolean(incoming, key) ?? ((stored !== undefined) ? wireBoolean(stored, key) : undefined);
}

// A string field read from the incoming payload when present, else the stored record. Mirrors mergedBoolean for the nvrMac field.
function mergedString(incoming: Record<string, unknown>, stored: Record<string, unknown> | undefined, key: string): string | undefined {

  return wireString(incoming, key) ?? ((stored !== undefined) ? wireString(stored, key) : undefined);
}

// Read a property as a boolean only when it is one at runtime; undefined otherwise. The adoption fields flow through untyped wire records, so the typeof guard both
// narrows the type and rejects a malformed value.
function wireBoolean(record: Record<string, unknown>, key: string): boolean | undefined {

  const value = record[key];

  return (typeof value === "boolean") ? value : undefined;
}

// Read a property as a string only when it is one at runtime; undefined otherwise.
function wireString(record: Record<string, unknown>, key: string): string | undefined {

  const value = record[key];

  return (typeof value === "string") ? value : undefined;
}
