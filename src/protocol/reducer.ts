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
// liveview rosters are included alongside the devices, as both are realtime-addressed StateModelKeys.
type DeviceMapField = "cameras" | "chimes" | "fobs" | "lights" | "liveviews" | "relays" | "sensors" | "users" | "viewers";

// The reduced model keys whose state is stored as a map (every StateModelKey except "nvr", which is the singleton). Internal to the reducer: it lets mapFieldFor
// return a non-optional DeviceMapField, so the impossible "model key with no map" case is unrepresentable rather than defended against at runtime.
type MapBackedStateModelKey = Exclude<StateModelKey, "nvr">;

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

  const nvr = ((state.nvr !== null) && isDeepStrictEqual(state.nvr, bootstrap.nvr)) ? state.nvr : bootstrap.nvr;

  return {

    authUserId: bootstrap.authUserId,
    bootstrapId: state.bootstrapId + 1,
    cameras: reconcileMap(state.cameras, bootstrap.cameras),
    chimes: reconcileMap(state.chimes, bootstrap.chimes),
    fobs: reconcileMap(state.fobs, bootstrap.fobs),
    lights: reconcileMap(state.lights, bootstrap.lights),
    liveviews: reconcileMap(state.liveviews, bootstrap.liveviews),
    nvr,
    relays: reconcileMap(state.relays, bootstrap.relays),
    ringtones: reconcileMap(state.ringtones, bootstrap.ringtones),
    sensors: reconcileMap(state.sensors, bootstrap.sensors),
    users: reconcileMap(state.users, bootstrap.users),
    viewers: reconcileMap(state.viewers, bootstrap.viewers)
  };
}

// Upsert a full device record: insert a new id, or replace an existing one. A re-sent identical record is a no-op (the existing reference is kept), so a realtime `add`
// carrying unchanged data produces no churn. This path serves the `deviceAdded` action only; a bootstrap reconciles through `reconcileMap` instead.
function upsertDevice(state: ProtectState, modelKey: StateModelKey, id: string, data: ProtectStateRecord): ProtectState {

  if(modelKey === "nvr") {

    return ((state.nvr !== null) && isDeepStrictEqual(state.nvr, data)) ? state : { ...state, nvr: data as ProtectNvrConfig };
  }

  // modelKey is now narrowed by TypeScript to MapBackedStateModelKey - the nvr singleton was handled above, so every remaining value maps to a real DeviceMapField.
  const field = mapFieldFor(modelKey);
  const current = state[field] as DeviceMap;
  const existing = current.get(id);

  if((existing !== undefined) && isDeepStrictEqual(existing, data)) {

    return state;
  }

  const next = new Map(current);

  next.set(id, data);

  return withDeviceMap(state, field, next);
}

// Deep-merge a partial onto an existing device. A patch for an unknown id is a no-op: a partial has no full base to merge onto, and the next bootstrap will add the
// device if it is real. A patch that changes nothing is a no-op via applyDevicePatch's reference preservation.
function patchDevice(state: ProtectState, modelKey: StateModelKey, id: string, patch: DeepPartial<ProtectStateRecord>): ProtectState {

  if(modelKey === "nvr") {

    if(state.nvr === null) {

      return state;
    }

    const patchedNvr = applyDevicePatch(state.nvr, patch as DeepPartial<ProtectNvrConfig>);

    return Object.is(patchedNvr, state.nvr) ? state : { ...state, nvr: patchedNvr };
  }

  // modelKey is now narrowed to MapBackedStateModelKey - nvr was handled above and mapFieldFor's input excludes it by type, so the lookup is total.
  const field = mapFieldFor(modelKey);
  const current = state[field] as DeviceMap;
  const existing = current.get(id);

  if(existing === undefined) {

    return state;
  }

  const patched = applyDevicePatch(existing, patch);

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
// construction, so the function returns a non-optional DeviceMapField - no defensive null-handling at the call sites.
function mapFieldFor(modelKey: MapBackedStateModelKey): DeviceMapField {

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
