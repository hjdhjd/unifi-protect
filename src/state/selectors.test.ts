/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * selectors.test.ts: Unit tests for the memoized config-record selectors - the identity-stability that makes observer dedup work, the online filter, and by-id lookup -
 * plus the session-identity selectors (selectAuthUser, selectIsAdmin, selectNvr, selectControllerName, selectControllerUpSince).
 */
import { applyBootstrap, createInitialState, reduce } from "../protocol/reducer.ts";
import { describe, test } from "node:test";
import { isDeviceAdopted, isDeviceOnline, selectAdoptedCameraIds, selectAdoptedRelayIds, selectAdoptedSensorIds, selectAuthUser, selectCamera, selectCameras, selectChime,
  selectChimes, selectControllerName, selectControllerUpSince, selectIsAdmin, selectLight, selectLights, selectLiveview, selectLiveviews, selectNvr, selectOnlineCameras,
  selectOnlineChimes, selectOnlineLights, selectOnlineRelays, selectOnlineSensors, selectOnlineViewers, selectRelay, selectRelays, selectRingtone, selectRingtones,
  selectSensor, selectSensors, selectViewer, selectViewers } from "./selectors.ts";
import { makeBootstrap, makeCamera, makeChime, makeLight, makeLiveview, makeNvr, makeRelay, makeRingtone, makeSensor, makeUser,
  makeViewer } from "../fixtures.helpers.ts";
import assert from "node:assert/strict";

describe("selectors", () => {

  describe("selectCameras", () => {

    test("returns every camera in the state", () => {

      const state = applyBootstrap(createInitialState(), makeBootstrap({ cameras: [ makeCamera({ id: "c1" }), makeCamera({ id: "c2" }) ] }));

      assert.deepEqual(selectCameras(state).map((camera) => camera.id), [ "c1", "c2" ]);
    });

    test("memoizes on map identity - the same array reference for the same state", () => {

      const state = applyBootstrap(createInitialState(), makeBootstrap({ cameras: [makeCamera({ id: "c1" })] }));

      // Two reads against the same state must return the identical array, so an observer's Object.is comparison sees no change.
      assert.ok(Object.is(selectCameras(state), selectCameras(state)), "repeat reads of an unchanged state must return the same array reference");
    });

    test("returns a fresh array when the camera map identity changes", () => {

      const first = applyBootstrap(createInitialState(), makeBootstrap({ cameras: [makeCamera({ id: "c1" })] }));
      const second = applyBootstrap(first, makeBootstrap({ cameras: [ makeCamera({ id: "c1" }), makeCamera({ id: "c2" }) ] }));

      assert.ok(!Object.is(selectCameras(first), selectCameras(second)), "a changed map must yield a new array");
      assert.equal(selectCameras(second).length, 2);
    });

    test("preserves the array reference across a dispatch that did not touch cameras", () => {

      const withCamera = applyBootstrap(createInitialState(), makeBootstrap({ cameras: [makeCamera({ id: "c1" })] }));
      const before = selectCameras(withCamera);
      // Re-bootstrapping with the identical camera leaves the camera map reference intact (reconcileMap returns the existing map), so the memoized array survives.
      const after = applyBootstrap(withCamera, makeBootstrap({ cameras: [makeCamera({ id: "c1" })] }));

      assert.ok(Object.is(before, selectCameras(after)), "a drift-free re-bootstrap must keep the cameras array reference stable");
    });
  });

  describe("selectOnlineCameras", () => {

    test("filters to connected cameras only", () => {

      const state = applyBootstrap(createInitialState(), makeBootstrap({ cameras:
        [ makeCamera({ id: "c1", state: "CONNECTED" }), makeCamera({ id: "c2", state: "DISCONNECTED" }) ] }));

      assert.deepEqual(selectOnlineCameras(state).map((camera) => camera.id), ["c1"]);
    });

    test("memoizes on map identity", () => {

      const state = applyBootstrap(createInitialState(), makeBootstrap({ cameras: [makeCamera({ id: "c1", state: "CONNECTED" })] }));

      assert.ok(Object.is(selectOnlineCameras(state), selectOnlineCameras(state)));
    });
  });

  describe("selectAdoptedCameraIds", () => {

    test("returns only the ids of devices adopted by this controller, in canonical order", () => {

      const state = applyBootstrap(createInitialState(), makeBootstrap({ cameras: [
        makeCamera({ id: "c2", isAdopted: true }),
        makeCamera({ id: "c1", isAdopted: true }),
        makeCamera({ id: "other", isAdopted: true, isAdoptedByOther: true }),
        makeCamera({ id: "unadopted", isAdopted: false }) ] }));

      // Only the owned-and-adopted pair, sorted - the device adopted by another controller and the unadopted one are excluded, and the insertion order (c2 before c1) is
      // canonicalized so a bootstrap reorder cannot masquerade as a membership change.
      assert.deepEqual(selectAdoptedCameraIds(state), [ "c1", "c2" ]);
    });

    test("preserves the array reference across a config-churn dispatch (wakes only on a membership change)", () => {

      const state = applyBootstrap(createInitialState(), makeBootstrap({ cameras: [makeCamera({ id: "c1", isAdopted: true, name: "Front" })] }));
      const before = selectAdoptedCameraIds(state);
      // A name patch rebuilds the camera map (its identity changes), but the adopted-id set is unchanged - so the membership selector must hand back the prior array.
      // This is the load-bearing property: an identity-memoized selector would wake the observer here; the content-memoized one does not.
      const churned = reduce(state, { id: "c1", kind: "devicePatched", modelKey: "camera", patch: { name: "Renamed" } });

      assert.ok(!Object.is(selectCameras(state), selectCameras(churned)), "the camera map identity must change on the patch, or the test proves nothing");
      assert.ok(Object.is(before, selectAdoptedCameraIds(churned)), "config churn that leaves the id-set intact must keep the membership array reference stable");
    });

    test("changes the reference and the content when an adopted device is added", () => {

      const state = applyBootstrap(createInitialState(), makeBootstrap({ cameras: [makeCamera({ id: "c1", isAdopted: true })] }));
      const before = selectAdoptedCameraIds(state);
      const withAdded = applyBootstrap(state, makeBootstrap({ cameras: [ makeCamera({ id: "c1", isAdopted: true }), makeCamera({ id: "c2", isAdopted: true }) ] }));
      const after = selectAdoptedCameraIds(withAdded);

      assert.ok(!Object.is(before, after), "adding a member must yield a new array reference");
      assert.deepEqual(after, [ "c1", "c2" ]);
    });

    test("changes the reference and the content when an adopted device is removed", () => {

      const state = applyBootstrap(createInitialState(), makeBootstrap({ cameras:
        [ makeCamera({ id: "c1", isAdopted: true }), makeCamera({ id: "c2", isAdopted: true }) ] }));
      const before = selectAdoptedCameraIds(state);
      const withRemoved = applyBootstrap(state, makeBootstrap({ cameras: [makeCamera({ id: "c1", isAdopted: true })] }));
      const after = selectAdoptedCameraIds(withRemoved);

      assert.ok(!Object.is(before, after), "removing a member must yield a new array reference");
      assert.deepEqual(after, ["c1"]);
    });

    test("detects a same-cardinality membership swap (one id leaves as another joins, count unchanged)", () => {

      const state = applyBootstrap(createInitialState(), makeBootstrap({ cameras:
        [ makeCamera({ id: "c1", isAdopted: true }), makeCamera({ id: "c2", isAdopted: true }) ] }));
      const before = selectAdoptedCameraIds(state);
      // c2 is swapped for c3: the set count stays at two, so the equality check cannot short-circuit on length and must compare element-for-element to see the change.
      const swapped = applyBootstrap(state, makeBootstrap({ cameras: [ makeCamera({ id: "c1", isAdopted: true }), makeCamera({ id: "c3", isAdopted: true }) ] }));
      const after = selectAdoptedCameraIds(swapped);

      assert.ok(!Object.is(before, after), "a same-count membership swap must still yield a new array reference");
      assert.deepEqual(after, [ "c1", "c3" ]);
    });

    test("an adoption flip enters then leaves the set (false->true adds the id, true->false removes it)", () => {

      // The camera exists in state from the start but is not a member while unadopted.
      const unadopted = applyBootstrap(createInitialState(), makeBootstrap({ cameras: [makeCamera({ id: "c1", isAdopted: false })] }));

      assert.deepEqual(selectAdoptedCameraIds(unadopted), []);

      // The controller finishes adopting it; isAdopted flips true via a realtime patch, and the id enters the membership set.
      const adopted = reduce(unadopted, { id: "c1", kind: "devicePatched", modelKey: "camera", patch: { isAdopted: true } });

      assert.deepEqual(selectAdoptedCameraIds(adopted), ["c1"]);

      // It is later unadopted; the id leaves the set again.
      const removed = reduce(adopted, { id: "c1", kind: "devicePatched", modelKey: "camera", patch: { isAdopted: false } });

      assert.deepEqual(selectAdoptedCameraIds(removed), []);
    });

    test("drops a device once it is claimed by another controller, even while isAdopted stays true", () => {

      const adopted = applyBootstrap(createInitialState(), makeBootstrap({ cameras: [makeCamera({ id: "c1", isAdopted: true, isAdoptedByOther: false })] }));

      assert.deepEqual(selectAdoptedCameraIds(adopted), ["c1"]);

      // isAdoptedByOther wins: the device is owned elsewhere now, so it drops out of our membership set even though isAdopted remains true.
      const claimedByOther = reduce(adopted, { id: "c1", kind: "devicePatched", modelKey: "camera", patch: { isAdoptedByOther: true } });

      assert.deepEqual(selectAdoptedCameraIds(claimedByOther), []);
    });

    test("keeps a re-provisioning (isAdopting) but still-owned device in the set", () => {

      // The predicate is ownership, not readiness: a device mid-(re)adoption that is still adopted by us must not churn out of the membership set.
      const state = applyBootstrap(createInitialState(), makeBootstrap({ cameras: [makeCamera({ id: "c1", isAdopted: true, isAdopting: true })] }));

      assert.deepEqual(selectAdoptedCameraIds(state), ["c1"]);
    });

    test("is the empty set for an empty collection and for an all-unadopted collection", () => {

      assert.deepEqual(selectAdoptedCameraIds(createInitialState()), []);

      const allUnadopted = applyBootstrap(createInitialState(), makeBootstrap({ cameras: [ makeCamera({ id: "c1", isAdopted: false }),
        makeCamera({ id: "c2", isAdopted: true, isAdoptedByOther: true }) ] }));

      assert.deepEqual(selectAdoptedCameraIds(allUnadopted), []);
    });

    test("memoizes on the id-set content - repeat reads of an unchanged state return the same array reference", () => {

      const state = applyBootstrap(createInitialState(), makeBootstrap({ cameras: [makeCamera({ id: "c1", isAdopted: true })] }));

      assert.ok(Object.is(selectAdoptedCameraIds(state), selectAdoptedCameraIds(state)), "repeat reads of an unchanged state must return the same array reference");
    });
  });

  describe("selectAdoptedSensorIds (the factory generalizes beyond cameras)", () => {

    test("returns the adopted sensor ids and stays content-stable across sensor config churn", () => {

      const state = applyBootstrap(createInitialState(), makeBootstrap({ sensors: [ makeSensor({ id: "s1", isAdopted: true }),
        makeSensor({ id: "s2", isAdopted: true, isAdoptedByOther: true }) ] }));

      assert.deepEqual(selectAdoptedSensorIds(state), ["s1"]);

      const before = selectAdoptedSensorIds(state);
      // The same content-memoization the camera selector has, proving the per-category factory wired it everywhere - a non-membership sensor patch must not wake an
      // observer.
      const churned = reduce(state, { id: "s1", kind: "devicePatched", modelKey: "sensor", patch: { name: "Renamed Sensor" } });

      assert.ok(Object.is(before, selectAdoptedSensorIds(churned)), "the sensor membership array must be stable across a non-membership sensor patch");
    });
  });

  describe("selectCamera", () => {

    test("returns the camera config for a known id", () => {

      const state = applyBootstrap(createInitialState(), makeBootstrap({ cameras: [makeCamera({ id: "c1", name: "Front" })] }));

      assert.equal(selectCamera("c1")(state)?.name, "Front");
    });

    test("returns undefined for an unknown id", () => {

      const state = applyBootstrap(createInitialState(), makeBootstrap({ cameras: [makeCamera({ id: "c1" })] }));

      assert.equal(selectCamera("missing")(state), undefined);
    });
  });

  describe("per-collection wiring", () => {

    test("each device collection's selectors read their own map", () => {

      const state = applyBootstrap(createInitialState(), makeBootstrap({

        chimes: [makeChime({ id: "ch1" })],
        lights: [makeLight({ id: "l1" })],
        relays: [makeRelay({ id: "r1" })],
        sensors: [makeSensor({ id: "s1" })],
        viewers: [makeViewer({ id: "v1" })]
      }));

      // by-id lookups resolve against the correct collection.
      assert.equal(selectChime("ch1")(state)?.id, "ch1");
      assert.equal(selectLight("l1")(state)?.id, "l1");
      assert.equal(selectRelay("r1")(state)?.id, "r1");
      assert.equal(selectSensor("s1")(state)?.id, "s1");
      assert.equal(selectViewer("v1")(state)?.id, "v1");

      // full-collection selectors return their one device each.
      assert.deepEqual([ selectChimes(state).length, selectLights(state).length, selectRelays(state).length, selectSensors(state).length,
        selectViewers(state).length ], [ 1, 1, 1, 1, 1 ]);

      // the fixtures default to the connected state, so the online subsets match the full collections.
      assert.deepEqual([ selectOnlineChimes(state).length, selectOnlineLights(state).length, selectOnlineRelays(state).length, selectOnlineSensors(state).length,
        selectOnlineViewers(state).length ], [ 1, 1, 1, 1, 1 ]);
    });
  });

  describe("relay selectors (the quartet)", () => {

    test("all / byId / online / adoptedIds read the relays map", () => {

      const state = applyBootstrap(createInitialState(), makeBootstrap({ relays: [
        makeRelay({ id: "r1", isAdopted: true, state: "CONNECTED" }),
        makeRelay({ id: "r2", isAdopted: true, state: "DISCONNECTED" }),
        makeRelay({ id: "r3", isAdopted: false, state: "CONNECTED" }) ] }));

      // all: every relay; byId: the one record (undefined for an unknown id); online: only the connected ones; adoptedIds: the owned-and-adopted ids, sorted.
      assert.deepEqual(selectRelays(state).map((relay) => relay.id).sort(), [ "r1", "r2", "r3" ]);
      assert.equal(selectRelay("r1")(state)?.id, "r1");
      assert.equal(selectRelay("missing")(state), undefined);
      assert.deepEqual(selectOnlineRelays(state).map((relay) => relay.id), [ "r1", "r3" ]);
      assert.deepEqual(selectAdoptedRelayIds(state), [ "r1", "r2" ]);
    });

    test("adoptedIds stays content-stable across a non-membership relay patch", () => {

      const state = applyBootstrap(createInitialState(), makeBootstrap({ relays: [makeRelay({ id: "r1", isAdopted: true })] }));
      const before = selectAdoptedRelayIds(state);
      const churned = reduce(state, { id: "r1", kind: "devicePatched", modelKey: "relay", patch: { name: "Renamed Relay" } });

      assert.ok(Object.is(before, selectAdoptedRelayIds(churned)), "the relay membership array must be stable across a non-membership patch");
    });
  });

  describe("isDeviceOnline", () => {

    test("is true only for the connected state", () => {

      assert.equal(isDeviceOnline({ state: "CONNECTED" }), true);
      assert.equal(isDeviceOnline({ state: "CONNECTING" }), false);
      assert.equal(isDeviceOnline({ state: "DISCONNECTED" }), false);
    });
  });

  describe("isDeviceAdopted", () => {

    test("is true only when adopted here and not by another controller", () => {

      assert.equal(isDeviceAdopted({ isAdopted: true, isAdoptedByOther: false }), true);
      assert.equal(isDeviceAdopted({ isAdopted: true, isAdoptedByOther: true }), false);
      assert.equal(isDeviceAdopted({ isAdopted: false, isAdoptedByOther: false }), false);
      assert.equal(isDeviceAdopted({ isAdopted: false, isAdoptedByOther: true }), false);
    });
  });

  describe("selectAuthUser", () => {

    test("returns the user record matching authUserId", () => {

      const state = applyBootstrap(createInitialState(), makeBootstrap({ authUserId: "u2", users: [ makeUser({ id: "u1" }), makeUser({ id: "u2", name: "Owner" }) ] }));

      assert.equal(selectAuthUser(state)?.name, "Owner");
    });

    test("returns null before the first bootstrap", () => {

      assert.equal(selectAuthUser(createInitialState()), null);
    });

    test("returns null when authUserId matches no user in the roster", () => {

      const state = applyBootstrap(createInitialState(), makeBootstrap({ authUserId: "ghost", users: [makeUser({ id: "u1" })] }));

      assert.equal(selectAuthUser(state), null);
    });

    test("keeps the record reference stable across a drift-free re-bootstrap (the basis for memoization)", () => {

      const first = applyBootstrap(createInitialState(), makeBootstrap({ authUserId: "u1", users: [makeUser({ id: "u1" })] }));
      const second = applyBootstrap(first, makeBootstrap({ authUserId: "u1", users: [makeUser({ id: "u1" })] }));

      assert.ok(Object.is(selectAuthUser(first), selectAuthUser(second)), "an unchanged user must keep its reference so the isAdmin cache holds");
    });
  });

  describe("selectIsAdmin", () => {

    // The permission grammar is `<resource>:<action,action,...>`; admin means a camera entry that grants write. Each row pairs a permission set with its verdict.
    const cases: { name: string; permissions: string[]; expected: boolean }[] = [

      { expected: true, name: "camera write among several actions", permissions: ["camera:read,write,delete"] },
      { expected: true, name: "camera write as the sole action", permissions: ["camera:write"] },
      { expected: true, name: "camera write among several entries", permissions: [ "light:read", "camera:read,write" ] },
      { expected: false, name: "camera read only", permissions: ["camera:read"] },
      { expected: false, name: "write on a different resource", permissions: ["light:write"] },
      { expected: false, name: "a malformed colon-less entry", permissions: ["camera"] },
      { expected: false, name: "no permissions at all", permissions: [] }
    ];

    for(const { name, permissions, expected } of cases) {

      test("is " + String(expected) + " for " + name, () => {

        const state = applyBootstrap(createInitialState(), makeBootstrap({ authUserId: "u1", users: [makeUser({ allPermissions: permissions, id: "u1" })] }));

        assert.equal(selectIsAdmin(state), expected);
      });
    }

    test("is false before the first bootstrap and when the session user is absent", () => {

      assert.equal(selectIsAdmin(createInitialState()), false);

      const orphan = applyBootstrap(createInitialState(), makeBootstrap({ authUserId: "ghost", users: [makeUser({ allPermissions: ["camera:write"], id: "u1" })] }));

      assert.equal(selectIsAdmin(orphan), false);
    });

    test("re-evaluates on a role change across bootstraps (the cache does not stick to the stale verdict)", () => {

      const before = applyBootstrap(createInitialState(), makeBootstrap({ authUserId: "u1", users: [makeUser({ allPermissions: ["camera:read"], id: "u1" })] }));

      assert.equal(selectIsAdmin(before), false);

      // The same user gains camera-write at the controller; the next bootstrap carries a new record reference, so the memoized verdict is recomputed, not reused.
      const after = applyBootstrap(before, makeBootstrap({ authUserId: "u1", users: [makeUser({ allPermissions: ["camera:read,write"], id: "u1" })] }));

      assert.equal(selectIsAdmin(after), true);
    });

    test("returns the memoized verdict on a repeat read of the same user record", () => {

      const state = applyBootstrap(createInitialState(), makeBootstrap({ authUserId: "u1", users: [makeUser({ allPermissions: ["camera:write"], id: "u1" })] }));

      // The first read computes and caches on the user record's identity; the second must return the cached verdict (the user reference is unchanged).
      assert.equal(selectIsAdmin(state), true);
      assert.equal(selectIsAdmin(state), true);
    });

    test("reflects a realtime user patch (a role grant arrives as a devicePatched, not only via bootstrap)", () => {

      const before = applyBootstrap(createInitialState(), makeBootstrap({ authUserId: "u1", users: [makeUser({ allPermissions: ["camera:read"], id: "u1" })] }));

      assert.equal(selectIsAdmin(before), false);

      // The controller grants camera-write and broadcasts a `user` update on the realtime stream; the reducer folds it in, and isAdmin flips without a re-bootstrap.
      const after = reduce(before, { id: "u1", kind: "devicePatched", modelKey: "user", patch: { allPermissions: ["camera:read,write"] } });

      assert.equal(selectIsAdmin(after), true);
    });
  });

  describe("selectControllerName", () => {

    test("returns the NVR display name", () => {

      const state = applyBootstrap(createInitialState(), makeBootstrap({ nvr: makeNvr({ name: "Front Office NVR" }) }));

      assert.equal(selectControllerName(state), "Front Office NVR");
    });

    test("returns null before the first bootstrap", () => {

      assert.equal(selectControllerName(createInitialState()), null);
    });

    test("falls back to the controller model when the NVR carries no name", () => {

      // Single-sourced with Nvr.name: an unnamed controller surfaces its always-present marketName, not null. Null is reserved for the pre-bootstrap case above.
      const state = applyBootstrap(createInitialState(), makeBootstrap({ nvr: makeNvr({ marketName: "UDM Pro", name: undefined }) }));

      assert.equal(selectControllerName(state), "UDM Pro");
    });
  });

  describe("selectControllerUpSince", () => {

    test("returns the NVR boot time", () => {

      const state = applyBootstrap(createInitialState(), makeBootstrap({ nvr: makeNvr({ upSince: 1700000000000 }) }));

      assert.equal(selectControllerUpSince(state), 1700000000000);
    });

    test("returns null before the first bootstrap", () => {

      assert.equal(selectControllerUpSince(createInitialState()), null);
    });

    test("returns null when the NVR carries no boot time", () => {

      const state = applyBootstrap(createInitialState(), makeBootstrap({ nvr: makeNvr({ upSince: undefined }) }));

      assert.equal(selectControllerUpSince(state), null);
    });
  });

  describe("selectNvr", () => {

    test("returns the NVR record, or null before the first bootstrap", () => {

      assert.equal(selectNvr(createInitialState()), null);

      const state = applyBootstrap(createInitialState(), makeBootstrap({ nvr: makeNvr({ host: "10.0.0.5" }) }));

      assert.equal(selectNvr(state)?.host, "10.0.0.5");
    });

    test("returns the structurally-shared record reference, stable across a drift-free re-bootstrap", () => {

      const first = applyBootstrap(createInitialState(), makeBootstrap({ nvr: makeNvr() }));
      const second = applyBootstrap(first, makeBootstrap({ nvr: makeNvr() }));

      assert.ok(Object.is(selectNvr(first), selectNvr(second)), "an unchanged NVR record must keep its reference so observers stay quiet");
    });
  });

  describe("selectLiveviews / selectLiveview", () => {

    test("returns the liveviews, carrying the nested slots[].cameras unflattened", () => {

      const state = applyBootstrap(createInitialState(), makeBootstrap({ liveviews:
        [makeLiveview({ id: "lv1", slots: [{ cameras: [ "c1", "c2" ], cycleInterval: 8, cycleMode: "manual" }] })] }));

      assert.deepEqual(selectLiveviews(state).map((lv) => lv.id), ["lv1"]);
      assert.deepEqual(selectLiveview("lv1")(state)?.slots[0]?.cameras, [ "c1", "c2" ], "the by-id selector returns the record with its slot cameras intact");
    });

    test("memoizes on map identity, and the array survives a drift-free re-bootstrap", () => {

      const state = applyBootstrap(createInitialState(), makeBootstrap({ liveviews: [makeLiveview({ id: "lv1" })] }));

      assert.ok(Object.is(selectLiveviews(state), selectLiveviews(state)), "repeat reads of an unchanged state must return the same array reference");

      const after = applyBootstrap(state, makeBootstrap({ liveviews: [makeLiveview({ id: "lv1" })] }));

      assert.ok(Object.is(selectLiveviews(state), selectLiveviews(after)), "a drift-free re-bootstrap must keep the liveviews array reference stable (observe dedups)");
    });

    test("selectLiveview returns undefined for an absent id", () => {

      assert.equal(selectLiveview("nope")(createInitialState()), undefined);
    });
  });

  describe("selectRingtones / selectRingtone", () => {

    test("returns the ringtones and a by-id lookup", () => {

      const state = applyBootstrap(createInitialState(), makeBootstrap({ ringtones: [ makeRingtone({ id: "rt1", name: "Chime" }), makeRingtone({ id: "rt2" }) ] }));

      assert.deepEqual(selectRingtones(state).map((rt) => rt.id).sort(), [ "rt1", "rt2" ]);
      assert.equal(selectRingtone("rt1")(state)?.name, "Chime");
      assert.equal(selectRingtone("nope")(state), undefined);
    });

    test("memoizes on map identity, and the array survives a drift-free re-bootstrap", () => {

      const state = applyBootstrap(createInitialState(), makeBootstrap({ ringtones: [makeRingtone({ id: "rt1" })] }));

      assert.ok(Object.is(selectRingtones(state), selectRingtones(state)), "repeat reads of an unchanged state must return the same array reference");

      const after = applyBootstrap(state, makeBootstrap({ ringtones: [makeRingtone({ id: "rt1" })] }));

      assert.ok(Object.is(selectRingtones(state), selectRingtones(after)), "a drift-free re-bootstrap must keep the ringtones array reference stable (observe dedups)");
    });
  });
});
