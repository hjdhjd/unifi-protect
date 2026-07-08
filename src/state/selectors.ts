/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * selectors.ts: Pure, memoized derived views over ProtectState - the data-layer projections the store's observers dedup against.
 */

/**
 * Pre-built selectors over {@link ProtectState}. Every selector is a **pure function returning config records** (`ProtectCameraConfig`, ...), never a Layer-3 `Camera`
 * projection - selectors live in the data layer, and a projection needs the client (Layer 3, built by the `DeviceRegistry`).
 *
 * Returning config records is load-bearing, not stylistic. {@link StateStore.observe} detects change with `Object.is`; the reducer keeps a record's reference stable
 * across dispatches that did not touch it (structural sharing), and these selectors keep a *derived array's* reference stable across dispatches that did not touch its
 * backing map (memoization on map identity). A selector that constructed a fresh `Camera` on each call would compare unequal every time, fire every observer on every
 * dispatch, and defeat the "refresh is invisible when nothing drifted" guarantee.
 *
 * Memoization is keyed on the backing `Map` reference via a `WeakMap`: when the map identity is unchanged, the previously computed array is returned (`Object.is`-equal
 * to the prior return) and is garbage-collected automatically once the state that held the map is gone.
 *
 * That map-identity memo is the right regime for a selector that returns *records* (`all`, `online`): those views must change reference whenever any member's config
 * changes, because the consumer reads the records. A selector that returns a *membership set* - the ids adopted by this controller - wants the opposite: it must stay
 * referentially stable through config churn and change only when an id enters or leaves the set. That is a second, distinct regime, **content memoization** (see
 * {@link memoizeArrayByContent}): layered over the map-identity memo, it returns the previously computed array whenever the freshly derived one is element-for-element
 * equal, so a `lastSeen`/stats patch that rebuilds the backing map does not wake a membership observer - only a real add, removal, or adoption flip does.
 *
 * @module StateSelectors
 */
import type { ProtectCameraConfig, ProtectChimeConfig, ProtectFobConfig, ProtectLightConfig, ProtectNvrConfig, ProtectNvrLiveviewConfig, ProtectNvrUserConfig,
  ProtectRelayConfig, ProtectRingtoneConfig, ProtectSensorConfig, ProtectViewerConfig } from "../types/index.ts";
import type { ProtectState } from "../protocol/reducer.ts";

// The device-lifecycle string that marks a device reachable. Every device carries this `state` enum, whereas the boolean `isConnected` is present only on the wired
// device classes (camera/chime/light/sensor/viewer) and is optional/absent on the LoRa devices (relay, fob) per base.ts; we read the universal enum because it is the
// controller's authoritative lifecycle value (CONNECTED / CONNECTING / DISCONNECTED / ...) and "online" means precisely "fully connected", not "attempting".
const DEVICE_STATE_CONNECTED = "CONNECTED";

/**
 * Whether a device is currently connected to the controller. The single definition of "online" shared by the `online` selectors and the device projections'
 * `isOnline` getter, so the collection views and the per-device view never disagree.
 *
 * @param device - Any device config (only its `state` field is read).
 *
 * @returns `true` when the device is fully connected.
 *
 * @category State
 */
export function isDeviceOnline(device: { state: string }): boolean {

  return device.state === DEVICE_STATE_CONNECTED;
}

/**
 * Whether a device is adopted by *this* controller - owned and managed here, rather than merely visible on the network or owned by a different NVR. The single
 * definition of "adopted by us", shared by the membership-id selectors so the collection views and any per-device check never disagree, exactly as {@link isDeviceOnline}
 * is the single definition of "online".
 *
 * The predicate is **ownership**, not **readiness**: `isAdopted` is set once any controller has adopted the device, and `isAdoptedByOther` marks one adopted by a
 * *different* NVR, so `isAdopted && !isAdoptedByOther` is precisely "ours". We deliberately do not also exclude the transient `isAdopting`: a device mid-adoption has not
 * yet flipped `isAdopted` true (so it is already excluded), and a device being *re*-provisioned is still owned by us - dropping it from the membership set on a transient
 * would churn the set, the opposite of what the membership selectors are for. "Can it stream right now?" is liveness ({@link isDeviceOnline}), a separate question.
 *
 * @param device - Any device config (only its adoption flags are read).
 *
 * @returns `true` when the device is adopted by this controller and not by another.
 *
 * @category State
 */
export function isDeviceAdopted(device: { isAdopted: boolean; isAdoptedByOther: boolean }): boolean {

  return device.isAdopted && !device.isAdoptedByOther;
}

/**
 * The base pair of selectors every id-keyed collection exposes: the full array (memoized on the backing map's identity) and an O(1) by-id lookup.
 *
 * @typeParam T - The collection's config record type.
 *
 * @category State
 */
export interface CollectionViews<T> {

  all: (state: ProtectState) => readonly T[];
  byId: (id: string) => (state: ProtectState) => T | undefined;
}

/**
 * The selectors every *device* collection exposes: the {@link CollectionViews} pair (records, memoized on map identity), the connected-only subset, and the
 * content-memoized set of ids adopted by this controller - the membership set a reactive consumer observes to react to devices being adopted or removed without waking on
 * every config patch. See {@link memoizeArrayByContent} for the content-vs-identity memoization distinction `adoptedIds` rests on.
 *
 * @typeParam T - The collection's config record type.
 *
 * @category State
 */
export interface CollectionSelectors<T> extends CollectionViews<T> {

  adoptedIds: (state: ProtectState) => readonly string[];
  online: (state: ProtectState) => readonly T[];
}

// Build the base views (full array + by-id) for one id-keyed collection, memoizing the `all` array on the backing map's identity. Shared by every collection - the device
// collections layer an `online` filter on top, while the read-only NVR-scoped collections (liveviews, ringtones) use these views directly, since they have no connection
// lifecycle. One definition, so the memoization and iteration logic is single-source rather than copied per collection.
function collectionViews<T>(pick: (state: ProtectState) => ReadonlyMap<string, T>): CollectionViews<T> {

  const allCache = new WeakMap<ReadonlyMap<string, T>, readonly T[]>();

  const all = (state: ProtectState): readonly T[] => {

    const map = pick(state);
    const cached = allCache.get(map);

    if(cached !== undefined) {

      return cached;
    }

    const derived = [...map.values()];

    allCache.set(map, derived);

    return derived;
  };

  // A by-id selector reads straight through the map: `Map.get` is O(1) and returns the structural-sharing-stable record reference, so no memoization is needed for the
  // single-record case - the value is already reference-stable across dispatches that did not touch it.
  const byId = (id: string): ((state: ProtectState) => T | undefined) => (state: ProtectState): T | undefined => pick(state).get(id);

  return { all, byId };
}

// Element-wise array equality: same length, with `Object.is`-equal members in order. The reference-identity short-circuit makes the common "same array" case O(1), so a
// content-memoized selector layered over a map-identity-memoized source pays the full O(n) scan only when the source array was actually rebuilt.
function shallowEqualArrays<T>(a: readonly T[], b: readonly T[]): boolean {

  if(a === b) {

    return true;
  }

  if(a.length !== b.length) {

    return false;
  }

  for(let index = 0; index < a.length; index++) {

    if(!Object.is(a[index], b[index])) {

      return false;
    }
  }

  return true;
}

/**
 * Content memoization - the second of this file's two memo regimes, and the one a membership selector needs. The map-identity memo (the `WeakMap` in
 * {@link collectionViews}) is right for record-returning views: it returns a fresh array whenever the backing map's identity moves, which is *any* change including a
 * `lastSeen` patch on one member - correct, because a records consumer reads those members. A membership selector returning a set of ids wants the opposite: it must wake
 * only when an id enters or leaves the set, and stay referentially stable through that same config churn.
 *
 * So this wrapper memoizes on the derived value's **content** rather than on the identity of the slice it came from: it holds the last array it returned and hands that
 * *same reference* back whenever the freshly derived one is element-for-element equal, so an observer's `Object.is` dedup sees no change and stays asleep through churn.
 * It is layered *over* the map-identity memo, not instead of it - the caller's `derive` reuses the map-identity-memoized `all` (and a per-collection `WeakMap`) so a
 * dispatch that did not touch this collection's map skips re-derivation entirely, and this content layer suppresses the wake on the dispatches that did touch the map but
 * left the id-set unchanged.
 *
 * The single closure slot assumes calls progress with the latest state - true for `observe` (it only ever evaluates against the just-committed state) and for
 * `snapshot()`-based reads. A caller replaying an *older* snapshot would thrash the slot (and lose the reference-stability optimization), but never get a wrong answer:
 * the derived value is always correct for the state passed in; only the memo's effectiveness degrades.
 *
 * @typeParam T - The array element type.
 *
 * @param derive - The underlying selector producing a freshly derived array on each call.
 *
 * @returns A selector that returns the prior array reference whenever the derived content is unchanged.
 */
function memoizeArrayByContent<T>(derive: (state: ProtectState) => readonly T[]): (state: ProtectState) => readonly T[] {

  let last: readonly T[] | undefined;

  return (state: ProtectState): readonly T[] => {

    const next = derive(state);

    if((last !== undefined) && shallowEqualArrays(last, next)) {

      return last;
    }

    last = next;

    return next;
  };
}

// The fields every device-collection record exposes that the device selectors read: the `id` (for the membership set), the connection-lifecycle `state` (for `online`),
// and the two adoption flags (for `adoptedIds`). Naming the constraint keeps the `collectionSelectors` signature on one line and documents what a "device collection" is.
interface DeviceCollectionRecord {

  id: string;
  isAdopted: boolean;
  isAdoptedByOther: boolean;
  state: string;
}

// Extend the base views with the connected-only subset and the adopted-id membership set for a device collection. Defined once and instantiated per device type so the
// filtering and memoization logic is single-source rather than duplicated per device collection.
function collectionSelectors<T extends DeviceCollectionRecord>(pick: (state: ProtectState) => ReadonlyMap<string, T>): CollectionSelectors<T> {

  const { all, byId } = collectionViews(pick);
  const onlineCache = new WeakMap<ReadonlyMap<string, T>, readonly T[]>();

  const online = (state: ProtectState): readonly T[] => {

    const map = pick(state);
    const cached = onlineCache.get(map);

    if(cached !== undefined) {

      return cached;
    }

    // Filtered off the memoized `all` array, then memoized itself - so both views are stable across a no-change dispatch and observers on either stay quiet.
    const derived = all(state).filter((device) => isDeviceOnline(device));

    onlineCache.set(map, derived);

    return derived;
  };

  // The adopted-id membership set, where the two memo regimes compose - and that composition is the entire point of the selector. The map-identity layer
  // (`adoptedIdCache`, keyed on the map-identity-stable array `all` returns) derives the id list at most once per backing-map identity, so any dispatch that did not
  // touch this collection's map costs O(1) - the same regime `online` uses for its filtered subset. The content layer ({@link memoizeArrayByContent}) sits on top: when
  // the map *did* change but the membership id-set did not - the overwhelmingly common case of a `lastSeen`/stats patch on an already-adopted device - it returns the
  // prior array reference, so the observer stays asleep. The ids are sorted into a canonical order so that a bootstrap which merely reorders the device array (same set,
  // different order) is not mistaken for a membership change.
  const adoptedIdCache = new WeakMap<readonly T[], readonly string[]>();
  const adoptedIds = memoizeArrayByContent((state: ProtectState): readonly string[] => {

    const devices = all(state);
    const cached = adoptedIdCache.get(devices);

    if(cached !== undefined) {

      return cached;
    }

    const ids = devices.filter((device) => isDeviceAdopted(device)).map((device) => device.id).sort();

    adoptedIdCache.set(devices, ids);

    return ids;
  });

  return { adoptedIds, all, byId, online };
}

// One selector quartet per device collection. The exported selectors below are thin, named aliases onto these.
const cameras = collectionSelectors<ProtectCameraConfig>((state) => state.cameras);
const chimes = collectionSelectors<ProtectChimeConfig>((state) => state.chimes);
const fobs = collectionSelectors<ProtectFobConfig>((state) => state.fobs);
const lights = collectionSelectors<ProtectLightConfig>((state) => state.lights);
const relays = collectionSelectors<ProtectRelayConfig>((state) => state.relays);
const sensors = collectionSelectors<ProtectSensorConfig>((state) => state.sensors);
const viewers = collectionSelectors<ProtectViewerConfig>((state) => state.viewers);

// The read-only NVR-scoped collections. Liveviews and ringtones are config entities with no connection lifecycle, so they use the base views (no `online` subset): the
// full array and a by-id lookup. Liveviews advance in realtime (the `liveview` StateModelKey); ringtones advance bootstrap-only - but both reconcile through the same
// engine, so the selectors are identical in shape.
const liveviews = collectionViews<ProtectNvrLiveviewConfig>((state) => state.liveviews);
const ringtones = collectionViews<ProtectRingtoneConfig>((state) => state.ringtones);

/** All cameras, memoized on the camera-map identity. @category State */
export const selectCameras = cameras.all;

/** A single camera by id, or `undefined` when absent. @category State */
export const selectCamera = cameras.byId;

/** The connected cameras only. @category State */
export const selectOnlineCameras = cameras.online;

/** The ids of the cameras adopted by this controller, content-memoized to change reference only when the membership set changes. @category State */
export const selectAdoptedCameraIds = cameras.adoptedIds;

/** All chimes, memoized on the chime-map identity. @category State */
export const selectChimes = chimes.all;

/** A single chime by id, or `undefined` when absent. @category State */
export const selectChime = chimes.byId;

/** The connected chimes only. @category State */
export const selectOnlineChimes = chimes.online;

/** The ids of the chimes adopted by this controller, content-memoized to change reference only when the membership set changes. @category State */
export const selectAdoptedChimeIds = chimes.adoptedIds;

/** All fobs, memoized on the fob-map identity. @category State */
export const selectFobs = fobs.all;

/** A single fob by id, or `undefined` when absent. @category State */
export const selectFob = fobs.byId;

/** The connected fobs only. @category State */
export const selectOnlineFobs = fobs.online;

/** The ids of the fobs adopted by this controller, content-memoized to change reference only when the membership set changes. @category State */
export const selectAdoptedFobIds = fobs.adoptedIds;

/** All lights, memoized on the light-map identity. @category State */
export const selectLights = lights.all;

/** A single light by id, or `undefined` when absent. @category State */
export const selectLight = lights.byId;

/** The connected lights only. @category State */
export const selectOnlineLights = lights.online;

/** The ids of the lights adopted by this controller, content-memoized to change reference only when the membership set changes. @category State */
export const selectAdoptedLightIds = lights.adoptedIds;

/** All relays, memoized on the relay-map identity. @category State */
export const selectRelays = relays.all;

/** A single relay by id, or `undefined` when absent. @category State */
export const selectRelay = relays.byId;

/** The connected relays only. @category State */
export const selectOnlineRelays = relays.online;

/** The ids of the relays adopted by this controller, content-memoized to change reference only when the membership set changes. @category State */
export const selectAdoptedRelayIds = relays.adoptedIds;

/** All sensors, memoized on the sensor-map identity. @category State */
export const selectSensors = sensors.all;

/** A single sensor by id, or `undefined` when absent. @category State */
export const selectSensor = sensors.byId;

/** The connected sensors only. @category State */
export const selectOnlineSensors = sensors.online;

/** The ids of the sensors adopted by this controller, content-memoized to change reference only when the membership set changes. @category State */
export const selectAdoptedSensorIds = sensors.adoptedIds;

/** All viewers, memoized on the viewer-map identity. @category State */
export const selectViewers = viewers.all;

/** A single viewer by id, or `undefined` when absent. @category State */
export const selectViewer = viewers.byId;

/** The connected viewers only. @category State */
export const selectOnlineViewers = viewers.online;

/** The ids of the viewers adopted by this controller, content-memoized to change reference only when the membership set changes. @category State */
export const selectAdoptedViewerIds = viewers.adoptedIds;

/** All liveviews, memoized on the liveview-map identity. Each record carries its `slots[].cameras`. @category State */
export const selectLiveviews = liveviews.all;

/** A single liveview by id, or `undefined` when absent. @category State */
export const selectLiveview = liveviews.byId;

/** All ringtones, memoized on the ringtone-map identity. @category State */
export const selectRingtones = ringtones.all;

/** A single ringtone by id, or `undefined` when absent. @category State */
export const selectRingtone = ringtones.byId;

// Session identity selectors. These derive facts about the authenticated session rather than a device collection, but follow the same purity and reference-stability
// discipline: each is a pure function over ProtectState, and memoizes only where useful - whether to preserve reference-stability for the observer's Object.is dedup, or
// purely as a per-dispatch performance choice when the input record is reference-stable across dispatches.

// The Protect permission grammar marker for administrative (Super Admin) access: a `camera:...,write,...` entry in the user's resolved permission set. Encoded as a
// `<resource>:<action,action,...>` string, so we split once into the two semantic halves and check each - the optional chain treats a malformed colon-less entry as a
// non-match rather than a crash.
const ADMIN_PERMISSION_ACTION = "write";
const ADMIN_PERMISSION_RESOURCE = "camera";

// Whether a user holds the administrative camera-write permission. Reads `allPermissions` (the resolved set, including group-derived grants).
function hasAdminPermission(user: ProtectNvrUserConfig): boolean {

  return user.allPermissions.some((entry) => {

    const [ resource, actions ] = entry.split(":", 2);

    return (resource === ADMIN_PERMISSION_RESOURCE) && (actions?.split(",").includes(ADMIN_PERMISSION_ACTION) === true);
  });
}

// Memoize the admin verdict on the authenticated user's record identity. observers re-run every selector on every dispatch, and the user record's reference is stable
// across dispatches that did not change it (structural sharing), so this turns the common case - the user is unchanged - into a single WeakMap lookup instead of a
// permission re-parse. A boolean needs no memoization for dedup correctness (the value is its own Object.is key); this is purely the per-dispatch performance choice.
const isAdminCache = new WeakMap<ProtectNvrUserConfig, boolean>();

/**
 * The authenticated session's own user record, or `null` when there is no such user (before the first bootstrap, or if the id is absent from the roster). The
 * single-source primitive for session-identity facts: {@link selectIsAdmin} derives from it, and consumers can `observe` it directly to react to "who am I" changes.
 * Reads straight through the roster map, so the returned record reference is structurally-sharing-stable across dispatches that did not touch it - no memoization needed.
 *
 * @param state - The current state.
 *
 * @returns The authenticated user's config record, or `null`.
 *
 * @category State
 */
export function selectAuthUser(state: ProtectState): ProtectNvrUserConfig | null {

  return (state.authUserId !== null) ? (state.users.get(state.authUserId) ?? null) : null;
}

/**
 * Whether the authenticated session has Super Admin (camera-write) privileges. Derived from the session user's record and the controller's permission grammar; `false`
 * before the first bootstrap or when the session's user is absent. Re-evaluated whenever the user's record changes, so a role change at the controller surfaces on the
 * next bootstrap refresh.
 *
 * @param state - The current state.
 *
 * @returns `true` when the authenticated user holds the administrative camera-write permission.
 *
 * @category State
 */
export function selectIsAdmin(state: ProtectState): boolean {

  const user = selectAuthUser(state);

  if(user === null) {

    return false;
  }

  const cached = isAdminCache.get(user);

  if(cached !== undefined) {

    return cached;
  }

  const result = hasAdminPermission(user);

  isAdminCache.set(user, result);

  return result;
}

/**
 * The controller's NVR configuration record, or `null` before the first bootstrap. The single-source primitive the {@link Nvr} singleton projection reads through (its
 * `config` getter and `observe()`), and the record the narrower NVR-derived selectors ({@link selectControllerName}, ...) pull their fields from. Reads straight through
 * the `nvr` singleton field, so the returned reference is structurally-sharing-stable across dispatches that did not touch it - no memoization needed; the observer's
 * `Object.is` dedup yields only when the record actually changes.
 *
 * @param state - The current state.
 *
 * @returns The NVR config record, or `null` when no bootstrap has been applied.
 *
 * @category State
 */
export function selectNvr(state: ProtectState): ProtectNvrConfig | null {

  return state.nvr;
}

/**
 * The controller's display label - its user-assigned name, else the always-present `marketName` - or `null` only before the first bootstrap (no `nvr` record yet), never
 * for a merely-unnamed controller (which surfaces its model). Single-sourced with `Nvr.name`, so the projection getter and this primitive never disagree; a consumer
 * needing the raw "was it explicitly named?" distinction reads `client.nvr.config.name`. Returns a primitive, so it needs no memoization: the value is its own
 * `Object.is` key for the observer's dedup, and two property reads are already cheaper than a cache lookup.
 *
 * @param state - The current state.
 *
 * @returns The NVR's display label, or `null` when the NVR is not yet known.
 *
 * @category State
 */
export function selectControllerName(state: ProtectState): string | null {

  return state.nvr ? (state.nvr.name ?? state.nvr.marketName) : null;
}

/**
 * The controller's self-reported boot time (`nvr.upSince`), or `null` before the first bootstrap. We mirror the controller's own field name rather than inventing one,
 * exactly as {@link selectControllerName} mirrors `nvr.name` - the library renames only derived facts, never a value it passes straight through.
 *
 * This is the `ConnectionMonitor`'s **internal** reboot-detection input, not a consumer-facing selector, which is why it is not exported from the package surface.
 * Reboot is a derived, policy-laden fact with a single home: the monitor applies a noise-floor threshold to `upSince` (the wire value jitters by milliseconds across
 * bootstraps) and emits the blessed `controllerRebooted` event. A consumer wanting "did the controller reboot?" subscribes to that event; observing this raw selector
 * directly would re-derive reboot detection while bypassing the jitter threshold, firing spuriously on every refresh - a second, wrong source of truth.
 *
 * Returns a primitive, so it needs no memoization: even though the `nvr` record reference churns on nearly every refresh (`lastSeen`, `storageStats`), the monitor's
 * `Object.is` dedup over this selector yields only when the boot time itself changes.
 *
 * @param state - The current state.
 *
 * @returns The controller's boot time in epoch milliseconds, or `null` when the NVR is not yet known.
 *
 * @internal
 */
export function selectControllerUpSince(state: ProtectState): number | null {

  return state.nvr?.upSince ?? null;
}
