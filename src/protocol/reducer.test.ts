/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * reducer.test.ts: Unit tests for the pure state reducer. These tests hold the three guarantees the observation layer depends on - immutability, structural sharing, and
 * no-op fidelity (same value in, same reference out) - because a regression in any of them would silently either churn observers or suppress real notifications.
 * The reconciliation surface is covered rule by rule: each merge rule and each reconciliation outcome (zero drift, partial drift, full replacement, the nested sharing
 * of a drifted record) has a row that reddens when it regresses, and every event-kind category is representatively exercised.
 */
import { applyBootstrap, applyDevicePatch, createInitialState, reduce } from "./reducer.ts";
import { describe, test } from "node:test";
import { makeBootstrap, makeCamera, makeChime, makeFob, makeLight, makeLiveview, makeNvr, makeRelay, makeRingtone, makeSensor, makeUser,
  makeViewer } from "../fixtures.helpers.ts";
import { ProtectProtocolError } from "../errors.ts";
import type { ProtectState } from "./reducer.ts";
import type { TypedEvent } from "./events.ts";
import assert from "node:assert/strict";
import { deviceSelectors } from "../state/selectors.ts";

// Build state seeded with a single camera, so most tests start from a populated, realistic snapshot.
function stateWithCamera(camera = makeCamera()): ProtectState {

  return reduce(createInitialState(), { data: camera, id: camera.id, kind: "deviceAdded", modelKey: "camera" });
}

describe("createInitialState", () => {

  test("returns an empty, zeroed snapshot", () => {

    const state = createInitialState();

    assert.equal(state.bootstrapId, 0);
    assert.equal(state.nvr, null);
    assert.equal(state.authUserId, null);
    assert.equal(state.cameras.size, 0);
    assert.equal(state.chimes.size, 0);
    assert.equal(state.fobs.size, 0);
    assert.equal(state.lights.size, 0);
    assert.equal(state.liveviews.size, 0);
    assert.equal(state.relays.size, 0);
    assert.equal(state.ringtones.size, 0);
    assert.equal(state.sensors.size, 0);
    assert.equal(state.users.size, 0);
    assert.equal(state.viewers.size, 0);
  });

  test("returns fresh map instances on each call (no shared mutable state)", () => {

    assert.ok(!Object.is(createInitialState().cameras, createInitialState().cameras), "each call must produce its own maps");
  });
});

describe("applyDevicePatch", () => {

  // The no-op cases the observers depend on: a patch that changes nothing must return the input by reference so observers do not fire.
  test("an empty patch returns the same reference", () => {

    const device = { count: 1, name: "x" };

    assert.ok(Object.is(applyDevicePatch(device, {}), device), "empty patch is a no-op");
  });

  test("a value-identical patch returns the same reference", () => {

    const device = { count: 1, name: "x", nested: { y: 2 } };

    assert.ok(Object.is(applyDevicePatch(device, { count: 1, name: "x" }), device), "patching identical scalar values is a no-op");
  });

  test("a deeply value-identical nested patch returns the same reference", () => {

    const device = { nested: { deep: { z: 9 } } };

    assert.ok(Object.is(applyDevicePatch(device, { nested: { deep: { z: 9 } } }), device), "patching identical nested values is a no-op");
  });

  // Structural sharing: a change rebuilds only the path to the change; untouched siblings keep their references.
  test("a primitive change rebuilds the root but preserves untouched nested references", () => {

    const device = { count: 1, sibling: { untouched: true }, target: { value: 1 } };
    const next = applyDevicePatch(device, { count: 2 });

    assert.ok(!Object.is(next, device), "a real change yields a new root reference");
    assert.equal(next.count, 2);
    assert.ok(Object.is(next.sibling, device.sibling), "the untouched sibling object keeps its reference");
    assert.ok(Object.is(next.target, device.target), "an untouched nested object keeps its reference");
  });

  test("a change three levels deep rebuilds only its path and preserves the depth-2 sibling subtree", () => {

    const device = { a: { b: { c: 1, d: 2 }, sibling: { kept: true } }, top: "unchanged" };
    const next = applyDevicePatch(device, { a: { b: { c: 99 } } });

    assert.ok(!Object.is(next, device), "root rebuilt");
    assert.ok(!Object.is(next.a, device.a), "depth-1 on the path rebuilt");
    assert.ok(!Object.is(next.a.b, device.a.b), "depth-2 on the path rebuilt");
    assert.equal(next.a.b.c, 99);
    assert.equal(next.a.b.d, 2, "the untouched leaf sibling is carried forward");
    assert.ok(Object.is(next.a.sibling, device.a.sibling), "the depth-2 sibling subtree off the path keeps its reference");
    assert.equal(next.top, "unchanged");
  });

  test("a patch that introduces a key whose value is undefined is a change that adds the key", () => {

    const device: { a: number; b?: undefined } = { a: 1 };
    const next = applyDevicePatch(device, { b: undefined });
    const withKey = { a: 1, b: undefined };

    assert.ok(!Object.is(next, device), "a key the device lacks is a change even when the patch sets it to undefined");
    assert.equal(Object.hasOwn(next, "b"), true, "the added key is an own key of the result despite its undefined value");
    assert.equal(next.a, 1, "the untouched key is carried forward");
    assert.ok(Object.is(applyDevicePatch(withKey, { b: undefined }), withKey), "the same patch onto a device that already carries the key is a no-op");
  });

  test("an explicit null clears a field", () => {

    const device = { value: "present" as string | null };
    const next = applyDevicePatch(device, { value: null });

    assert.ok(!Object.is(next, device));
    assert.equal(next.value, null);
  });

  test("clearing an already-null field is a no-op", () => {

    const device = { value: null as string | null };

    assert.ok(Object.is(applyDevicePatch(device, { value: null }), device), "null onto null changes nothing");
  });

  test("arrays replace wholesale rather than merging element-wise", () => {

    const device = { tags: [ "a", "b", "c" ] };
    const next = applyDevicePatch(device, { tags: ["x"] });

    assert.deepEqual(next.tags, ["x"], "the patch array replaces the existing one entirely");
  });

  test("a value-equal array is a no-op", () => {

    const device = { tags: [ "a", "b" ] };

    assert.ok(Object.is(applyDevicePatch(device, { tags: [ "a", "b" ] }), device), "an array equal by value does not churn");
  });

  test("a reordered array is a change (order is significant)", () => {

    const device = { tags: [ "a", "b" ] };
    const next = applyDevicePatch(device, { tags: [ "b", "a" ] });

    assert.ok(!Object.is(next, device), "reordering content is a real change");
    assert.deepEqual(next.tags, [ "b", "a" ]);
  });

  test("a previously absent key is added", () => {

    const device: { existing: number; added?: string } = { existing: 1 };
    const next = applyDevicePatch(device, { added: "new" });

    assert.ok(!Object.is(next, device));
    assert.equal(next.added, "new");
    assert.equal(next.existing, 1);
  });

  test("an object patch onto a non-object field replaces wholesale (no merge onto a non-object)", () => {

    const device = { field: 5 as number | { nested: boolean } };
    const next = applyDevicePatch(device, { field: { nested: true } });

    assert.deepEqual(next.field, { nested: true });
  });

  // The non-object guard: a direct call may pass a device or patch that is not a plain object, which the public generic signature permits, and with no keys to
  // merge the patch replaces the device unless the two are equal by value.
  test("a non-object device replaces with the patch when they differ", () => {

    assert.equal(applyDevicePatch<unknown>(5, 6), 6);
  });

  test("a non-object device equal by value returns the original reference", () => {

    // An equal primitive cannot tell the original from the patch, so the device is an array: no plain object, but a value with a reference of its own.
    const device = [1];

    assert.ok(Object.is(applyDevicePatch<unknown>(device, [1]), device), "an equal patch returns the device's own reference rather than the patch");
  });
});

describe("reduce - device transitions", () => {

  test("deviceAdded inserts a new device", () => {

    const camera = makeCamera();
    const next = reduce(createInitialState(), { data: camera, id: camera.id, kind: "deviceAdded", modelKey: "camera" });

    assert.equal(next.cameras.size, 1);
    assert.ok(Object.is(next.cameras.get(camera.id), camera), "the stored record is the event's data reference");
  });

  test("deviceAdded for an existing id takes the new record's values (upsert)", () => {

    const initial = stateWithCamera(makeCamera({ name: "Old" }));
    const replacement = makeCamera({ name: "New" });
    const next = reduce(initial, { data: replacement, id: "camera-1", kind: "deviceAdded", modelKey: "camera" });

    assert.equal(next.cameras.size, 1);
    assert.equal(next.cameras.get("camera-1")?.name, "New");
  });

  test("deviceAdded for an existing id drops a key the re-sent record omits", () => {

    // The re-sent record differs from the stored one only by the key it omits, so a merge would keep that key and only a by-value replace drops it.
    const initial = stateWithCamera(makeCamera({ marketName: "G4 Pro" }));
    const next = reduce(initial, { data: makeCamera(), id: "camera-1", kind: "deviceAdded", modelKey: "camera" });
    const before = initial.cameras.get("camera-1");
    const after = next.cameras.get("camera-1");

    assert.ok(!Object.is(after, before), "the stored record takes a new reference");
    assert.equal(Object.hasOwn(after ?? {}, "marketName"), false, "the key the re-sent record omits is absent");
    assert.ok(Object.is(after?.featureFlags, before?.featureFlags), "the unchanged featureFlags object keeps its reference");
  });

  test("deviceAdded re-sending an identical record is a no-op", () => {

    const camera = makeCamera();
    const initial = stateWithCamera(camera);
    const next = reduce(initial, { data: makeCamera(), id: "camera-1", kind: "deviceAdded", modelKey: "camera" });

    assert.ok(Object.is(next, initial), "an identical add must not churn state");
  });

  test("deviceAdded of a record drifted in one scalar keeps the unchanged nested object's reference", () => {

    const initial = stateWithCamera();
    const next = reduce(initial, { data: makeCamera({ lastMotion: 999 }), id: "camera-1", kind: "deviceAdded", modelKey: "camera" });
    const before = initial.cameras.get("camera-1");
    const after = next.cameras.get("camera-1");

    assert.ok(!Object.is(after, before), "the drifted camera takes a new top-level reference");
    assert.equal(after?.lastMotion, 999, "the drifted scalar reads the upserted value");
    assert.ok(Object.is(after.featureFlags, before?.featureFlags), "the unchanged featureFlags object keeps its reference");
  });

  test("devicePatched deep-merges a partial onto an existing device", () => {

    const initial = stateWithCamera();
    const next = reduce(initial, { id: "camera-1", kind: "devicePatched", modelKey: "camera", patch: { lastMotion: 1714233600000 } });

    assert.equal(next.cameras.get("camera-1")?.lastMotion, 1714233600000);
    assert.ok(!Object.is(next, initial));
  });

  test("devicePatched for an unknown id is a no-op (no base to merge onto)", () => {

    const initial = stateWithCamera();
    const next = reduce(initial, { id: "camera-absent", kind: "devicePatched", modelKey: "camera", patch: { lastMotion: 1 } });

    assert.ok(Object.is(next, initial), "patching an unknown id changes nothing");
  });

  test("devicePatched that changes nothing is a no-op", () => {

    const initial = stateWithCamera();
    const next = reduce(initial, { id: "camera-1", kind: "devicePatched", modelKey: "camera", patch: { name: "Front Door" } });

    assert.ok(Object.is(next, initial), "a value-identical patch must not churn state");
  });

  test("deviceRemoved deletes an existing device", () => {

    const initial = stateWithCamera();
    const next = reduce(initial, { id: "camera-1", kind: "deviceRemoved", modelKey: "camera" });

    assert.equal(next.cameras.size, 0);
    assert.ok(!Object.is(next, initial));
  });

  test("deviceRemoved for an absent id is a no-op", () => {

    const initial = stateWithCamera();
    const next = reduce(initial, { id: "camera-absent", kind: "deviceRemoved", modelKey: "camera" });

    assert.ok(Object.is(next, initial), "removing an absent id changes nothing");
  });

  test("patching one device leaves the other device maps reference-identical (structural sharing across maps)", () => {

    const initial = reduce(stateWithCamera(), { data: makeLight(), id: "light-1", kind: "deviceAdded", modelKey: "light" });
    const next = reduce(initial, { id: "camera-1", kind: "devicePatched", modelKey: "camera", patch: { lastMotion: 5 } });

    assert.ok(!Object.is(next.cameras, initial.cameras), "the cameras map is rebuilt");
    assert.ok(Object.is(next.lights, initial.lights), "the untouched lights map keeps its reference");
  });

  // There is no "unmodeled device key is a no-op at the reducer" test here because it cannot exist: deviceAdded / devicePatched / deviceRemoved carry
  // `modelKey: StateModelKey` (the reduced subset), so constructing such an event with an unreduced key is a TypeScript compile error. The type system enforces what
  // a runtime test would assert; the path is structurally unreachable rather than defensively guarded. Recognized-but-unreduced and genuinely-unknown wire model keys
  // are filtered at the classifier (see events.test.ts) and the latter surfaced via the schema-drift diagnostics channel.

  test("deviceAdded routes chime, sensor, and viewer to their respective maps", () => {

    const chime = makeChime();
    const sensor = makeSensor();
    const viewer = makeViewer();
    let state = createInitialState();

    state = reduce(state, { data: chime, id: "chime-1", kind: "deviceAdded", modelKey: "chime" });
    state = reduce(state, { data: sensor, id: "sensor-1", kind: "deviceAdded", modelKey: "sensor" });
    state = reduce(state, { data: viewer, id: "viewer-1", kind: "deviceAdded", modelKey: "viewer" });

    assert.equal(state.chimes.size, 1);
    assert.equal(state.sensors.size, 1);
    assert.equal(state.viewers.size, 1);
    assert.ok(Object.is(state.chimes.get("chime-1"), chime), "the chime is stored in the chimes map");
    assert.ok(Object.is(state.sensors.get("sensor-1"), sensor), "the sensor is stored in the sensors map");
    assert.ok(Object.is(state.viewers.get("viewer-1"), viewer), "the viewer is stored in the viewers map");
  });

  test("relay routes through deviceAdded, devicePatched, and deviceRemoved to the relays map (the mapFieldFor wiring)", () => {

    const added = reduce(createInitialState(), { data: makeRelay({ id: "r1", name: "Garage" }), id: "r1", kind: "deviceAdded", modelKey: "relay" });

    assert.equal(added.relays.size, 1);
    assert.equal(added.relays.get("r1")?.name, "Garage");

    const patched = reduce(added, { id: "r1", kind: "devicePatched", modelKey: "relay", patch: { name: "Driveway" } });

    assert.equal(patched.relays.get("r1")?.name, "Driveway");

    const removed = reduce(patched, { id: "r1", kind: "deviceRemoved", modelKey: "relay" });

    assert.equal(removed.relays.size, 0);
  });

  test("fob routes through deviceAdded, devicePatched, and deviceRemoved to the fobs map (the mapFieldFor wiring)", () => {

    const added = reduce(createInitialState(), { data: makeFob({ id: "f1", name: "Keyfob" }), id: "f1", kind: "deviceAdded", modelKey: "fob" });

    assert.equal(added.fobs.size, 1);
    assert.equal(added.fobs.get("f1")?.name, "Keyfob");

    const patched = reduce(added, { id: "f1", kind: "devicePatched", modelKey: "fob", patch: { awayState: "AWAY" } });

    assert.equal(patched.fobs.get("f1")?.awayState, "AWAY");

    const removed = reduce(patched, { id: "f1", kind: "deviceRemoved", modelKey: "fob" });

    assert.equal(removed.fobs.size, 0);
  });
});

describe("reduce - user transitions (realtime roster)", () => {

  test("a user devicePatched deep-merges into the users map without re-bootstrapping", () => {

    const seeded = applyBootstrap(createInitialState(), makeBootstrap({ authUserId: "u1", users: [makeUser({ allPermissions: ["camera:read"], id: "u1" })] }));
    const next = reduce(seeded, { id: "u1", kind: "devicePatched", modelKey: "user", patch: { allPermissions: ["camera:read,write"] } });

    assert.deepEqual(next.users.get("u1")?.allPermissions, ["camera:read,write"], "the realtime patch updates the roster record in place");
    assert.ok(!Object.is(next.users, seeded.users), "the changed roster takes a new map reference");
  });

  test("a user deviceAdded upserts into the roster and deviceRemoved deletes from it", () => {

    let state = applyBootstrap(createInitialState(), makeBootstrap({ authUserId: "u1", users: [makeUser({ id: "u1" })] }));

    state = reduce(state, { data: makeUser({ id: "u2", name: "Guest" }), id: "u2", kind: "deviceAdded", modelKey: "user" });
    assert.deepEqual([...state.users.keys()].sort(), [ "u1", "u2" ]);

    state = reduce(state, { id: "u2", kind: "deviceRemoved", modelKey: "user" });
    assert.deepEqual([...state.users.keys()], ["u1"]);
  });

  test("a no-op user patch keeps the roster map reference (observers stay quiet)", () => {

    const seeded = applyBootstrap(createInitialState(), makeBootstrap({ authUserId: "u1", users: [makeUser({ allPermissions: ["camera:write"], id: "u1" })] }));
    const next = reduce(seeded, { id: "u1", kind: "devicePatched", modelKey: "user", patch: { allPermissions: ["camera:write"] } });

    assert.ok(Object.is(next, seeded), "a value-identical user patch is a whole-state no-op");
  });
});

describe("reduce - liveview transitions (realtime collection)", () => {

  // Liveview is a StateModelKey, so add/update/remove ride the same generic reducer path as a device - this block pins that wiring end to end.
  test("a liveview deviceAdded upserts into the collection", () => {

    const next = reduce(createInitialState(), { data: makeLiveview({ id: "lv1" }), id: "lv1", kind: "deviceAdded", modelKey: "liveview" });

    assert.equal(next.liveviews.get("lv1")?.name, "All Cameras");
  });

  test("a liveview devicePatched deep-merges and replaces the slots array wholesale, even with a slot that leaves out fields", () => {

    const seeded = applyBootstrap(createInitialState(), makeBootstrap({ liveviews: [makeLiveview({ id: "lv1", name: "Downstairs" })] }));
    const next = reduce(seeded, { id: "lv1", kind: "devicePatched", modelKey: "liveview", patch: { slots: [{ cameras: [] }] } });

    assert.equal(next.liveviews.get("lv1")?.name, "Downstairs", "the untouched scalar survives the patch");

    // The patch's slot leaves out the cycle fields the seeded slot carries, so a merge into the array's elements would carry them over, and only a wholesale
    // replacement leaves the slots exactly as the patch wrote them.
    assert.deepEqual(next.liveviews.get("lv1")?.slots, [{ cameras: [] }], "the slots array replaces wholesale rather than merging into the seeded slot");
    assert.ok(!Object.is(next.liveviews, seeded.liveviews), "the changed collection takes a new map reference");
  });

  test("a liveview deviceRemoved deletes it from the collection", () => {

    const seeded = applyBootstrap(createInitialState(), makeBootstrap({ liveviews: [ makeLiveview({ id: "lv1" }), makeLiveview({ id: "lv2" }) ] }));
    const next = reduce(seeded, { id: "lv1", kind: "deviceRemoved", modelKey: "liveview" });

    assert.deepEqual([...next.liveviews.keys()], ["lv2"]);
  });
});

describe("reduce - NVR transitions", () => {

  test("deviceAdded with modelKey nvr sets the singleton", () => {

    const nvr = makeNvr();
    const next = reduce(createInitialState(), { data: nvr, id: nvr.id, kind: "deviceAdded", modelKey: "nvr" });

    assert.ok(Object.is(next.nvr, nvr));
  });

  test("deviceAdded with an identical nvr is a no-op", () => {

    const initial = reduce(createInitialState(), { data: makeNvr(), id: "nvr-1", kind: "deviceAdded", modelKey: "nvr" });
    const next = reduce(initial, { data: makeNvr(), id: "nvr-1", kind: "deviceAdded", modelKey: "nvr" });

    assert.ok(Object.is(next, initial));
  });

  test("deviceAdded with an nvr drifted in lastSeen keeps the unchanged ports reference", () => {

    const initial = reduce(createInitialState(), { data: makeNvr({ lastSeen: 1 }), id: "nvr-1", kind: "deviceAdded", modelKey: "nvr" });
    const next = reduce(initial, { data: makeNvr({ lastSeen: 2 }), id: "nvr-1", kind: "deviceAdded", modelKey: "nvr" });

    assert.ok(!Object.is(next.nvr, initial.nvr), "the drifted NVR takes a new top-level reference");
    assert.equal(next.nvr?.lastSeen, 2, "the drifted lastSeen reads the upserted value");
    assert.ok(Object.is(next.nvr.ports, initial.nvr?.ports), "the unchanged ports object keeps its reference");
  });

  test("deviceAdded with an nvr that omits a key drops it from the singleton", () => {

    const initial = reduce(createInitialState(), { data: makeNvr({ nickname: "Garage" }), id: "nvr-1", kind: "deviceAdded", modelKey: "nvr" });
    const next = reduce(initial, { data: makeNvr(), id: "nvr-1", kind: "deviceAdded", modelKey: "nvr" });

    assert.ok(!Object.is(next.nvr, initial.nvr), "the NVR that lost a key takes a new top-level reference");
    assert.equal(Object.hasOwn(next.nvr ?? {}, "nickname"), false, "the key the re-sent record omits is absent");
    assert.ok(Object.is(next.nvr?.ports, initial.nvr?.ports), "the unchanged ports object keeps its reference");
  });

  test("devicePatched with modelKey nvr merges onto the singleton", () => {

    const initial = reduce(createInitialState(), { data: makeNvr({ name: "Old" }), id: "nvr-1", kind: "deviceAdded", modelKey: "nvr" });
    const next = reduce(initial, { id: "nvr-1", kind: "devicePatched", modelKey: "nvr", patch: { name: "New" } });

    assert.equal(next.nvr?.name, "New");
  });

  test("devicePatched with modelKey nvr is a no-op when there is no NVR yet", () => {

    const initial = createInitialState();
    const next = reduce(initial, { id: "nvr-1", kind: "devicePatched", modelKey: "nvr", patch: { name: "New" } });

    assert.ok(Object.is(next, initial), "no base NVR means nothing to patch");
  });

  test("devicePatched with modelKey nvr that changes nothing is a no-op", () => {

    const initial = reduce(createInitialState(), { data: makeNvr(), id: "nvr-1", kind: "deviceAdded", modelKey: "nvr" });
    const next = reduce(initial, { id: "nvr-1", kind: "devicePatched", modelKey: "nvr", patch: { name: "Dream Machine Pro" } });

    assert.ok(Object.is(next, initial));
  });

  test("deviceRemoved with modelKey nvr is a no-op (the singleton has no remove semantics)", () => {

    const initial = reduce(createInitialState(), { data: makeNvr(), id: "nvr-1", kind: "deviceAdded", modelKey: "nvr" });
    const next = reduce(initial, { id: "nvr-1", kind: "deviceRemoved", modelKey: "nvr" });

    assert.ok(Object.is(next, initial), "the NVR singleton stays put; the wire never removes it");
    assert.ok(next.nvr !== null);
  });
});

describe("reduce - activity signals are state no-ops", () => {

  const initial = stateWithCamera();
  const signals: TypedEvent[] = [

    { at: 1, cameraId: "camera-1", eventId: "e1", kind: "motionDetected" },
    { at: 1, cameraId: "camera-1", eventId: "e1", kind: "smartDetect", objectTypes: ["person"] },
    { at: 1, cameraId: "camera-1", eventId: "e1", kind: "doorbellRing" },
    { action: "entry", at: 1, deviceId: "d1", eventId: "e1", kind: "accessEvent" }
  ];

  for(const signal of signals) {

    test(signal.kind + " returns the same state reference", () => {

      assert.ok(Object.is(reduce(initial, signal), initial), "activity signals are occurrences, not state");
    });
  }
});

describe("reduce - exhaustiveness guard", () => {

  test("an unrecognized event kind throws ProtectProtocolError", () => {

    assert.throws(() => reduce(createInitialState(), { kind: "notARealKind" } as unknown as TypedEvent), ProtectProtocolError);
  });
});

describe("reduce - bootstrapLoaded delegates to applyBootstrap", () => {

  test("an initial bootstrap populates state and increments bootstrapId", () => {

    const next = reduce(createInitialState(), { data: makeBootstrap({ cameras: [makeCamera()] }), kind: "bootstrapLoaded" });

    assert.equal(next.bootstrapId, 1);
    assert.equal(next.cameras.size, 1);
    assert.ok(next.nvr !== null);
  });
});

describe("applyBootstrap", () => {

  test("a zero-drift refresh reuses every reference and notifies no observer, but still increments bootstrapId", () => {

    const camera = makeCamera();
    const nvr = makeNvr();
    const initial = applyBootstrap(createInitialState(), makeBootstrap({ cameras: [camera], nvr }));

    // A second bootstrap with value-identical (but distinct-reference) records must reconcile to the existing references.
    const next = applyBootstrap(initial, makeBootstrap({ cameras: [makeCamera()], nvr: makeNvr() }));

    assert.ok(Object.is(next.cameras, initial.cameras), "an unchanged cameras map keeps its reference");
    assert.ok(Object.is(next.cameras.get("camera-1"), initial.cameras.get("camera-1")), "an unchanged device keeps its reference");
    assert.ok(Object.is(next.nvr, initial.nvr), "an unchanged NVR keeps its reference");
    assert.ok(Object.is(next.lights, initial.lights), "an unchanged (empty) lights map keeps its reference");
    assert.equal(next.bootstrapId, 2, "bootstrapId increments on every applied bootstrap regardless of drift");
  });

  test("a partial drift rebuilds only the changed device and map", () => {

    const initial = applyBootstrap(createInitialState(), makeBootstrap({ cameras: [ makeCamera({ id: "camera-1" }), makeCamera({ id: "camera-2" }) ] }));
    const next = applyBootstrap(initial, makeBootstrap({ cameras: [ makeCamera({ id: "camera-1", lastMotion: 999 }), makeCamera({ id: "camera-2" }) ] }));

    assert.ok(!Object.is(next.cameras, initial.cameras), "the cameras map is rebuilt when one camera drifts");
    assert.ok(!Object.is(next.cameras.get("camera-1"), initial.cameras.get("camera-1")), "the drifted camera takes a new reference");
    assert.ok(Object.is(next.cameras.get("camera-2"), initial.cameras.get("camera-2")), "the unchanged camera keeps its reference");
  });

  test("a device absent from the new bootstrap is removed", () => {

    const initial = applyBootstrap(createInitialState(), makeBootstrap({ cameras: [ makeCamera({ id: "camera-1" }), makeCamera({ id: "camera-2" }) ] }));
    const next = applyBootstrap(initial, makeBootstrap({ cameras: [makeCamera({ id: "camera-1" })] }));

    assert.equal(next.cameras.size, 1);
    assert.equal(next.cameras.has("camera-2"), false, "the dropped device is reaped");
  });

  test("a same-size bootstrap with different membership is detected as a change", () => {

    const initial = applyBootstrap(createInitialState(), makeBootstrap({ cameras: [makeCamera({ id: "camera-1" })] }));
    const next = applyBootstrap(initial, makeBootstrap({ cameras: [makeCamera({ id: "camera-2" })] }));

    assert.ok(!Object.is(next.cameras, initial.cameras), "swapping one id for another is a change despite equal size");
    assert.equal(next.cameras.has("camera-1"), false);
    assert.equal(next.cameras.has("camera-2"), true);
  });

  test("a device whose array field reorders is a change AND its map is rebuilt", () => {

    const initial = applyBootstrap(createInitialState(), makeBootstrap({ cameras: [makeCamera({ channels: [ { id: 0 }, { id: 1 } ] })] }));
    const next = applyBootstrap(initial, makeBootstrap({ cameras: [makeCamera({ channels: [ { id: 1 }, { id: 0 } ] })] }));

    assert.ok(!Object.is(next.cameras, initial.cameras), "an array reorder inside a device is a real change");
    assert.ok(!Object.is(next.cameras.get("camera-1"), initial.cameras.get("camera-1")));
  });

  test("a changed NVR takes a new reference", () => {

    const initial = applyBootstrap(createInitialState(), makeBootstrap({ nvr: makeNvr({ upSince: 1 }) }));
    const next = applyBootstrap(initial, makeBootstrap({ nvr: makeNvr({ upSince: 2 }) }));

    assert.equal(next.nvr?.upSince, 2);
    assert.ok(!Object.is(next.nvr, initial.nvr));
  });

  test("a drifted record keeps the references of its unchanged nested object and array and reads the new scalar", () => {

    const initial = applyBootstrap(createInitialState(), makeBootstrap({ cameras: [makeCamera()] }));
    const next = applyBootstrap(initial, makeBootstrap({ cameras: [makeCamera({ lastMotion: 999 })] }));
    const before = initial.cameras.get("camera-1");
    const after = next.cameras.get("camera-1");

    assert.ok(!Object.is(after, before), "the drifted camera takes a new top-level reference");
    assert.equal(after?.lastMotion, 999, "the drifted scalar reads the bootstrap's value");
    assert.ok(Object.is(after.featureFlags, before?.featureFlags), "the unchanged featureFlags object keeps its reference");
    assert.ok(Object.is(after.channels, before?.channels), "the unchanged channels array keeps its reference");
  });

  test("an array that changed one element is taken whole from the bootstrap while the unchanged nested object keeps its reference", () => {

    const channels = [ { id: 0, name: "High" }, { id: 1, name: "Low" } ];
    const initial = applyBootstrap(createInitialState(), makeBootstrap({ cameras: [makeCamera()] }));
    const next = applyBootstrap(initial, makeBootstrap({ cameras: [makeCamera({ channels })] }));
    const before = initial.cameras.get("camera-1");
    const after = next.cameras.get("camera-1");

    assert.ok(!Object.is(after?.channels, before?.channels), "the changed channels array takes a new reference");
    assert.ok(Object.is(after?.channels, channels), "an array is a leaf, so the bootstrap's own array is stored whole");
    assert.ok(Object.is(after?.featureFlags, before?.featureFlags), "the unchanged featureFlags object keeps its reference");
  });

  test("a key absent from the bootstrap's record is dropped, at the top level and in a nested object", () => {

    // The stored featureFlags and the bootstrap's hold the same number of keys but differ in one, so only the key sets, never a size difference, tell them apart.
    const featureFlags = { hasLuxCheck: true, smartDetectTypes: ["person"] };
    const initial = applyBootstrap(createInitialState(), makeBootstrap({ cameras: [makeCamera({ featureFlags, marketName: "G4 Pro" })] }));
    const next = applyBootstrap(initial, makeBootstrap({ cameras: [makeCamera()] }));
    const after = next.cameras.get("camera-1");

    assert.equal(Object.hasOwn(after ?? {}, "marketName"), false, "the top-level key the bootstrap dropped is absent");
    assert.equal(Object.hasOwn(after?.featureFlags ?? {}, "hasLuxCheck"), false, "the nested key the bootstrap dropped is absent");
    assert.deepEqual(after, makeCamera(), "the stored record reads exactly the bootstrap's record");
  });

  test("an NVR drifted in lastSeen alone keeps its unchanged ports reference", () => {

    const initial = applyBootstrap(createInitialState(), makeBootstrap({ nvr: makeNvr({ lastSeen: 1 }) }));
    const next = applyBootstrap(initial, makeBootstrap({ nvr: makeNvr({ lastSeen: 2 }) }));

    assert.ok(!Object.is(next.nvr, initial.nvr), "the drifted NVR takes a new top-level reference");
    assert.equal(next.nvr?.lastSeen, 2, "the drifted lastSeen reads the bootstrap's value");
    assert.ok(Object.is(next.nvr.ports, initial.nvr?.ports), "the unchanged ports object keeps its reference");
  });

  test("an NVR that lost a key in the bootstrap drops it and keeps its unchanged ports reference", () => {

    const initial = applyBootstrap(createInitialState(), makeBootstrap({ nvr: makeNvr({ nickname: "Garage" }) }));
    const next = applyBootstrap(initial, makeBootstrap({ nvr: makeNvr() }));

    assert.ok(!Object.is(next.nvr, initial.nvr), "the NVR that lost a key takes a new top-level reference");
    assert.equal(Object.hasOwn(next.nvr ?? {}, "nickname"), false, "the key the bootstrap dropped is absent");
    assert.ok(Object.is(next.nvr?.ports, initial.nvr?.ports), "the unchanged ports object keeps its reference");
  });

  test("a record whose only change is a dropped key takes a new reference without it, at the top level and in a nested object", () => {

    // The dropped key is each form's only change, so only the difference between the key sets marks the object that lost it as changed.
    const initial = applyBootstrap(createInitialState(), makeBootstrap({ cameras: [makeCamera({ marketName: "G4 Pro" })] }));
    const next = applyBootstrap(initial, makeBootstrap({ cameras: [makeCamera()] }));
    const before = initial.cameras.get("camera-1");
    const after = next.cameras.get("camera-1");

    assert.ok(!Object.is(after, before), "a record that only lost a key takes a new reference");
    assert.equal(Object.hasOwn(after ?? {}, "marketName"), false, "the dropped top-level key is absent");
    assert.ok(Object.is(after?.featureFlags, before?.featureFlags), "the unchanged featureFlags object keeps its reference");
    assert.ok(Object.is(after?.channels, before?.channels), "the unchanged channels array keeps its reference");

    // The nested form: the stored featureFlags carries one key beyond the default, and every other field of the record holds.
    const featureFlags = { hasLuxCheck: true, hasMotionZones: true, smartDetectTypes: ["person"] };
    const nestedInitial = applyBootstrap(createInitialState(), makeBootstrap({ cameras: [makeCamera({ featureFlags })] }));
    const nestedNext = applyBootstrap(nestedInitial, makeBootstrap({ cameras: [makeCamera()] }));
    const nestedBefore = nestedInitial.cameras.get("camera-1");
    const nestedAfter = nestedNext.cameras.get("camera-1");

    assert.ok(!Object.is(nestedAfter?.featureFlags, nestedBefore?.featureFlags), "a nested object that only lost a key takes a new reference");
    assert.equal(Object.hasOwn(nestedAfter?.featureFlags ?? {}, "hasLuxCheck"), false, "the dropped nested key is absent");
    assert.ok(Object.is(nestedAfter?.channels, nestedBefore?.channels), "the unchanged channels array keeps its reference");
  });

  test("a change two levels down rebuilds only its path and keeps its unchanged nested members", () => {

    // The camera type declares no settings object, so the row reads each stored record back through this one narrowing.
    interface SettingsCamera {

      featureFlags: object;
      settings: { audio: object; video: { contrast: number } };
    }

    const stored = (state: ProtectState): SettingsCamera => state.cameras.get("camera-1") as unknown as SettingsCamera;
    const camera = (brightness: number): ReturnType<typeof makeCamera> => makeCamera({ settings: { audio: { volume: 10 }, video: { brightness, contrast: 50 } } });
    const initial = applyBootstrap(createInitialState(), makeBootstrap({ cameras: [camera(50)] }));
    const next = applyBootstrap(initial, makeBootstrap({ cameras: [camera(60)] }));
    const before = stored(initial);
    const after = stored(next);

    assert.ok(!Object.is(after, before), "the drifted camera takes a new top-level reference");
    assert.ok(!Object.is(after.settings, before.settings), "settings, on the path to the change, takes a new reference");
    assert.ok(!Object.is(after.settings.video, before.settings.video), "settings.video, which holds the change, takes a new reference");
    assert.ok(Object.is(after.settings.audio, before.settings.audio), "the unchanged settings.audio object keeps its reference");
    assert.ok(Object.is(after.featureFlags, before.featureFlags), "the unchanged featureFlags object keeps its reference");
    assert.equal(after.settings.video.contrast, 50, "the unchanged contrast leaf is carried forward");
  });

  test("a field that flips between null and an object takes the bootstrap's value whole in each direction", () => {

    const lcdMessage = { text: "Hello", type: "CUSTOM_MESSAGE" };
    const initial = applyBootstrap(createInitialState(), makeBootstrap({ cameras: [makeCamera({ lcdMessage: null })] }));
    const toObject = applyBootstrap(initial, makeBootstrap({ cameras: [makeCamera({ lcdMessage })] }));
    const toNull = applyBootstrap(toObject, makeBootstrap({ cameras: [makeCamera({ lcdMessage: null })] }));
    const featureFlags = initial.cameras.get("camera-1")?.featureFlags;

    assert.ok(Object.is(toObject.cameras.get("camera-1")?.lcdMessage, lcdMessage), "null to an object stores the bootstrap's own object");
    assert.ok(Object.is(toObject.cameras.get("camera-1")?.featureFlags, featureFlags), "the unchanged featureFlags object keeps its reference");
    assert.equal(toNull.cameras.get("camera-1")?.lcdMessage, null, "an object to null stores null");
    assert.ok(Object.is(toNull.cameras.get("camera-1")?.featureFlags, featureFlags), "the unchanged featureFlags object keeps its reference");
  });

  test("a nested object whose keys reorder without a value change keeps its reference", () => {

    // Key order alone would pass the whole-record compare, which ignores it, so lastMotion drifts to send the record through the reconcile, which then walks
    // featureFlags with its keys reversed.
    // eslint-disable-next-line sort-keys -- the row's subject is key order, so this object holds the default's keys in the opposite order.
    const featureFlags = { smartDetectTypes: ["person"], hasMotionZones: true };
    const initial = applyBootstrap(createInitialState(), makeBootstrap({ cameras: [makeCamera({ featureFlags })] }));
    const next = applyBootstrap(initial, makeBootstrap({ cameras: [makeCamera({ lastMotion: 999 })] }));
    const before = initial.cameras.get("camera-1");
    const after = next.cameras.get("camera-1");

    assert.ok(!Object.is(after, before), "the drifted camera takes a new top-level reference");
    assert.ok(Object.is(after?.featureFlags, before?.featureFlags), "featureFlags, equal in value with its keys reordered, keeps its reference");
  });

  test("a new key whose value is undefined counts as a change, so a same-size key set that swapped one key for it drops the old key", () => {

    // The key sets match in size, as each record carries one key beyond the default, and nickname's undefined value compares equal to its absence from the stored
    // record, so only nickname being a new key marks the record as changed. An undefined-valued fixture override is still an own key of the record it spreads into.
    const initial = applyBootstrap(createInitialState(), makeBootstrap({ cameras: [makeCamera({ marketName: "G4 Pro" })] }));
    const next = applyBootstrap(initial, makeBootstrap({ cameras: [makeCamera({ nickname: undefined })] }));
    const before = initial.cameras.get("camera-1");
    const after = next.cameras.get("camera-1");

    assert.ok(!Object.is(after, before), "a record that swapped a key for an undefined-valued one takes a new reference");
    assert.equal(Object.hasOwn(after ?? {}, "marketName"), false, "the swapped-out key is absent");
    assert.equal(Object.hasOwn(after ?? {}, "nickname"), true, "the new key is an own key of the stored record despite its undefined value");
    assert.ok(Object.is(after?.featureFlags, before?.featureFlags), "the unchanged featureFlags object keeps its reference");
  });
});

describe("applyBootstrap - session identity", () => {

  test("captures the authUserId and the user roster from the bootstrap", () => {

    const state = applyBootstrap(createInitialState(), makeBootstrap({ authUserId: "u1", users: [ makeUser({ id: "u1" }), makeUser({ id: "u2" }) ] }));

    assert.equal(state.authUserId, "u1");
    assert.deepEqual([...state.users.keys()].sort(), [ "u1", "u2" ]);
  });

  test("a drift-free re-bootstrap keeps the users map reference (so roster observers stay quiet)", () => {

    const initial = applyBootstrap(createInitialState(), makeBootstrap({ authUserId: "u1", users: [makeUser({ id: "u1" })] }));
    const next = applyBootstrap(initial, makeBootstrap({ authUserId: "u1", users: [makeUser({ id: "u1" })] }));

    assert.ok(Object.is(next.users, initial.users), "an unchanged roster must keep its map reference");
  });

  test("a changed user record takes a new reference and so does the users map", () => {

    const initial = applyBootstrap(createInitialState(), makeBootstrap({ authUserId: "u1", users: [makeUser({ allPermissions: [], id: "u1" })] }));
    const next = applyBootstrap(initial, makeBootstrap({ authUserId: "u1", users: [makeUser({ allPermissions: ["camera:read,write"], id: "u1" })] }));

    assert.ok(!Object.is(next.users, initial.users), "a roster whose member changed must yield a new map");
    assert.ok(!Object.is(next.users.get("u1"), initial.users.get("u1")), "the changed user record must take a new reference");
  });
});

describe("applyBootstrap - liveviews and ringtones", () => {

  test("reconciles both collections from the bootstrap", () => {

    const state = applyBootstrap(createInitialState(), makeBootstrap({ liveviews: [makeLiveview({ id: "lv1" })], ringtones: [makeRingtone({ id: "rt1" })] }));

    assert.deepEqual([...state.liveviews.keys()], ["lv1"]);
    assert.deepEqual([...state.ringtones.keys()], ["rt1"]);
  });

  test("a drift-free re-bootstrap keeps both map references (so observers stay quiet)", () => {

    const initial = applyBootstrap(createInitialState(), makeBootstrap({ liveviews: [makeLiveview({ id: "lv1" })], ringtones: [makeRingtone({ id: "rt1" })] }));
    const next = applyBootstrap(initial, makeBootstrap({ liveviews: [makeLiveview({ id: "lv1" })], ringtones: [makeRingtone({ id: "rt1" })] }));

    assert.ok(Object.is(next.liveviews, initial.liveviews), "an unchanged liveview roster must keep its map reference");
    assert.ok(Object.is(next.ringtones, initial.ringtones), "an unchanged ringtone library must keep its map reference");
  });

  test("a real ringtone delta surfaces only on the next bootstrap (ringtones are bootstrap-only, never realtime)", () => {

    const initial = applyBootstrap(createInitialState(), makeBootstrap({ ringtones: [makeRingtone({ id: "rt1", name: "Chime" })] }));
    const next = applyBootstrap(initial, makeBootstrap({ ringtones: [ makeRingtone({ id: "rt1", name: "Chime" }), makeRingtone({ id: "rt2", name: "Bell" }) ] }));

    assert.ok(!Object.is(next.ringtones, initial.ringtones), "an added ringtone must yield a new map");
    assert.deepEqual([...next.ringtones.keys()].sort(), [ "rt1", "rt2" ]);
    assert.ok(Object.is(next.ringtones.get("rt1"), initial.ringtones.get("rt1")), "the unchanged ringtone keeps its record reference (structural sharing)");
  });
});

describe("applyBootstrap - relays", () => {

  test("a bootstrap-resident relay lands in state.relays", () => {

    const state = applyBootstrap(createInitialState(), makeBootstrap({ relays: [makeRelay({ id: "r1", name: "Garage" })] }));

    assert.deepEqual([...state.relays.keys()], ["r1"]);
    assert.equal(state.relays.get("r1")?.name, "Garage");
  });

  test("a drift-free re-bootstrap keeps the relays map reference (no-op fidelity)", () => {

    const initial = applyBootstrap(createInitialState(), makeBootstrap({ relays: [makeRelay({ id: "r1" })] }));
    const next = applyBootstrap(initial, makeBootstrap({ relays: [makeRelay({ id: "r1" })] }));

    assert.ok(Object.is(next.relays, initial.relays), "an unchanged relay map must keep its reference");
  });

  test("a partial drift rebuilds only the changed relay and keeps the unchanged one's reference (structural sharing)", () => {

    const initial = applyBootstrap(createInitialState(), makeBootstrap({ relays: [ makeRelay({ id: "r1" }), makeRelay({ id: "r2" }) ] }));
    const next = applyBootstrap(initial, makeBootstrap({ relays: [ makeRelay({ id: "r1", name: "Renamed" }), makeRelay({ id: "r2" }) ] }));

    assert.ok(!Object.is(next.relays, initial.relays), "the relays map is rebuilt when one relay drifts");
    assert.ok(!Object.is(next.relays.get("r1"), initial.relays.get("r1")), "the drifted relay takes a new reference");
    assert.ok(Object.is(next.relays.get("r2"), initial.relays.get("r2")), "the unchanged relay keeps its reference (structural sharing)");
  });
});

describe("reduce - adoption self-contradiction normalization", () => {

  // The controller's own MAC and two flagged devices, a relay and a sensor that report isAdoptedByOther true while their nvrMac still names this very controller.
  // The relay/sensor ids and MACs and the controller MAC use the controller's raw format (no colons); synthetic cases below use the colon-delimited fixture MAC
  // convention, except the foreign-adoption case in (c), which reuses the flagged sensor's MAC to underline that it is the same physical device now claimed by a
  // different controller, and the re-spelled pair in (e), which spells one controller address two ways on purpose.
  const ownMac = "AABBCC000002";
  const flaggedRelay = (): ReturnType<typeof makeRelay> => makeRelay({ id: "de6da9cf942499c89288cc27", isAdopted: true, isAdoptedByOther: true, mac: "AABBCC000000",
    nvrMac: ownMac });
  const flaggedSensor = (): ReturnType<typeof makeSensor> => makeSensor({ id: "4d51328be035a860a3b40126", isAdopted: true, isAdoptedByOther: true, mac: "AABBCC000001",
    nvrMac: ownMac });
  const controller = (): ReturnType<typeof makeNvr> => makeNvr({ mac: ownMac });

  // Seed a state whose NVR MAC is known, so the detector is live for a subsequent realtime deviceAdded/devicePatched.
  const seeded = (): ProtectState => applyBootstrap(createInitialState(), makeBootstrap({ nvr: controller() }));

  test("(a) a bootstrap normalizes flagged own-MAC records across collections, admits them to membership, and leaves the caller's bootstrap untouched", () => {

    const bootstrap = makeBootstrap({ nvr: controller(), relays: [flaggedRelay()], sensors: [flaggedSensor()] });
    const state = applyBootstrap(createInitialState(), bootstrap);

    assert.equal(state.relays.get("de6da9cf942499c89288cc27")?.isAdoptedByOther, false, "the flagged relay enters state normalized");
    assert.equal(state.sensors.get("4d51328be035a860a3b40126")?.isAdoptedByOther, false, "the flagged sensor enters state normalized");
    assert.deepEqual(deviceSelectors.relay.adoptedIds(state), ["de6da9cf942499c89288cc27"], "the normalized relay counts as adopted here");
    assert.deepEqual(deviceSelectors.sensor.adoptedIds(state), ["4d51328be035a860a3b40126"], "the normalized sensor counts as adopted here");

    // Telling the mutation apart on the bootstrap path: the caller's own bootstrap object still carries the raw flag for the wire-faithful surfaces.
    assert.equal(bootstrap.relays[0]?.isAdoptedByOther, true, "the caller's bootstrap relay still carries the raw flag");
    assert.equal(bootstrap.sensors[0]?.isAdoptedByOther, true, "the caller's bootstrap sensor still carries the raw flag");
  });

  test("(a2) a second bootstrap still carrying the flagged record re-mints nothing: map, record, and membership references hold while bootstrapId advances", () => {

    const first = applyBootstrap(createInitialState(), makeBootstrap({ nvr: controller(), relays: [flaggedRelay()], sensors: [flaggedSensor()] }));
    const membershipBefore = deviceSelectors.relay.adoptedIds(first);
    const second = applyBootstrap(first, makeBootstrap({ nvr: controller(), relays: [flaggedRelay()], sensors: [flaggedSensor()] }));

    assert.ok(Object.is(second.relays, first.relays), "the relays map keeps its reference across a zero-drift flagged refresh");
    assert.ok(Object.is(second.sensors, first.sensors), "the sensors map keeps its reference");
    assert.ok(Object.is(second.relays.get("de6da9cf942499c89288cc27"), first.relays.get("de6da9cf942499c89288cc27")), "the normalized relay record keeps its reference");
    assert.equal(second.bootstrapId, first.bootstrapId + 1, "bootstrapId still advances on the applied refresh");
    assert.ok(Object.is(deviceSelectors.relay.adoptedIds(second), membershipBefore), "the membership id-list reference is unchanged");
  });

  test("(b) a devicePatched flip on a clean own-MAC device is a whole-state no-op that never mutates the incoming event", () => {

    const clean = makeRelay({ id: "r1", isAdopted: true, isAdoptedByOther: false, mac: "AA:BB:CC:00:00:11", nvrMac: ownMac });
    const sibling = makeRelay({ id: "r2", isAdopted: true, isAdoptedByOther: false, mac: "AA:BB:CC:00:00:12", nvrMac: ownMac });
    const initial = applyBootstrap(createInitialState(), makeBootstrap({ nvr: controller(), relays: [ clean, sibling ] }));
    const patch = { isAdoptedByOther: true };
    const next = reduce(initial, { id: "r1", kind: "devicePatched", modelKey: "relay", patch });

    assert.ok(Object.is(next, initial), "the flip nets to no value change, so the state reference is unchanged");
    assert.deepEqual(deviceSelectors.relay.adoptedIds(next), [ "r1", "r2" ], "membership is unchanged");
    assert.ok(Object.is(next.relays.get("r2"), initial.relays.get("r2")), "the untouched sibling keeps its exact reference");
    assert.equal(patch.isAdoptedByOther, true, "the incoming patch object still carries the raw flag for the events() firehose");
  });

  test("(c) a genuine foreign adoption still evicts, and a migration from own-MAC-flagged to foreign evicts", () => {

    // A device adopted by a genuinely different controller (a foreign nvrMac) is not the contradiction, so it is unaffected by the normalization and still evicts.
    const foreign = makeSensor({ id: "s1", isAdopted: true, isAdoptedByOther: true, mac: "AABBCC000001", nvrMac: "FFEEDDCCBBAA" });
    const foreignState = applyBootstrap(createInitialState(), makeBootstrap({ nvr: controller(), sensors: [foreign] }));

    assert.deepEqual(deviceSelectors.sensor.adoptedIds(foreignState), [], "a genuinely foreign-adopted device is excluded from membership");
    assert.equal(foreignState.sensors.get("s1")?.isAdoptedByOther, true, "a genuine foreign adoption is left untouched");

    // Migration: own-MAC-flagged (normalized, retained), then a patch asserting BOTH the flag AND a foreign nvrMac - a real migration - is honored and evicts.
    const flagged = applyBootstrap(createInitialState(), makeBootstrap({ nvr: controller(), sensors: [flaggedSensor()] }));

    assert.deepEqual(deviceSelectors.sensor.adoptedIds(flagged), ["4d51328be035a860a3b40126"], "the own-MAC-flagged sensor is retained via normalization");

    const migrated = reduce(flagged, { id: "4d51328be035a860a3b40126", kind: "devicePatched", modelKey: "sensor",
      patch: { isAdoptedByOther: true, nvrMac: "FFEEDDCCBBAA" } });

    assert.equal(migrated.sensors.get("4d51328be035a860a3b40126")?.isAdoptedByOther, true, "a real migration to a foreign controller is honored, not normalized");
    assert.deepEqual(deviceSelectors.sensor.adoptedIds(migrated), [], "the migrated device drops out of membership");
  });

  test("(d1) a clean adopted own-MAC record passes through unchanged by reference even when the controller MAC is known", () => {

    const clean = makeRelay({ id: "r1", isAdopted: true, isAdoptedByOther: false, mac: "AA:BB:CC:00:00:11", nvrMac: ownMac });
    const next = reduce(seeded(), { data: clean, id: "r1", kind: "deviceAdded", modelKey: "relay" });

    assert.ok(Object.is(next.relays.get("r1"), clean), "a coherent record is stored by its exact reference, not a copy");
  });

  test("(d2) an unadopted record flagged adopted-by-other with own MAC is not normalized (the isAdopted gate)", () => {

    const unadopted = makeRelay({ id: "r1", isAdopted: false, isAdoptedByOther: true, mac: "AA:BB:CC:00:00:11", nvrMac: ownMac });
    const next = reduce(seeded(), { data: unadopted, id: "r1", kind: "deviceAdded", modelKey: "relay" });

    assert.ok(Object.is(next.relays.get("r1"), unadopted), "an unadopted record is not the contradiction, so it is stored unchanged");
    assert.equal(next.relays.get("r1")?.isAdoptedByOther, true, "isAdoptedByOther is left as the wire reported it");
  });

  test("(d3) no normalization when the device omits nvrMac, when the controller MAC is unknown, or before the first bootstrap", () => {

    // No nvrMac on the device: the detector has no MAC to compare, so a flagged record is left as-is.
    const noNvrMac = makeRelay({ id: "r1", isAdopted: true, isAdoptedByOther: true, mac: "AA:BB:CC:00:00:11" });
    const afterNoNvrMac = reduce(seeded(), { data: noNvrMac, id: "r1", kind: "deviceAdded", modelKey: "relay" });

    assert.ok(Object.is(afterNoNvrMac.relays.get("r1"), noNvrMac), "a flagged record without an nvrMac is not normalized");

    // Controller MAC unknown: an NVR fixture with no MAC leaves the own-MAC undefined, so the detector is inert.
    const seededNoMac = applyBootstrap(createInitialState(), makeBootstrap({ nvr: makeNvr({ mac: undefined }) }));
    const flagged = makeRelay({ id: "r2", isAdopted: true, isAdoptedByOther: true, mac: "AA:BB:CC:00:00:12", nvrMac: ownMac });
    const afterNoOwnMac = reduce(seededNoMac, { data: flagged, id: "r2", kind: "deviceAdded", modelKey: "relay" });

    assert.equal(afterNoOwnMac.relays.get("r2")?.isAdoptedByOther, true, "an unknown controller MAC leaves the detector inert");

    // Before the first bootstrap: state.nvr is null, so a flagged deviceAdded is not normalized.
    const beforeBootstrap = reduce(createInitialState(), { data: makeRelay({ id: "r3", isAdopted: true, isAdoptedByOther: true, mac: "AA:BB:CC:00:00:13",
      nvrMac: ownMac }), id: "r3", kind: "deviceAdded", modelKey: "relay" });

    assert.equal(beforeBootstrap.relays.get("r3")?.isAdoptedByOther, true, "with no NVR yet, the detector is inert");
  });

  test("(e) the detector reads two spellings of one controller address as the same controller on either side, and a foreign address in any spelling as foreign", () => {

    // The device re-spells this controller's MAC colon-joined and lowercase, so a raw comparison would read the pair as two different controllers.
    const respelled = (): ReturnType<typeof makeRelay> => ({ ...flaggedRelay(), nvrMac: "aa:bb:cc:00:00:02" });
    const relayId = respelled().id;
    const bootstrapped = applyBootstrap(createInitialState(), makeBootstrap({ nvr: controller(), relays: [respelled()] }));

    assert.equal(bootstrapped.relays.get(relayId)?.isAdoptedByOther, false, "a re-spelled device MAC still names this controller on the bootstrap path");
    assert.equal(bootstrapped.relays.get(relayId)?.nvrMac, "aa:bb:cc:00:00:02", "the stored record keeps the wire's own spelling, so only the comparison folds");

    const added = reduce(seeded(), { data: respelled(), id: relayId, kind: "deviceAdded", modelKey: "relay" });

    assert.equal(added.relays.get(relayId)?.isAdoptedByOther, false, "a re-spelled device MAC still names this controller on the realtime path");

    // The controller re-spells its own MAC hyphen-joined and lowercase while the device keeps the raw spelling, so folding one operand only would still read foreign.
    const ownRespelled = applyBootstrap(createInitialState(), makeBootstrap({ nvr: makeNvr({ mac: "aa-bb-cc-00-00-02" }), relays: [flaggedRelay()] }));

    assert.equal(ownRespelled.relays.get(relayId)?.isAdoptedByOther, false, "a re-spelled controller MAC is still this controller, not a foreign one");

    // A genuinely different MAC is a real foreign adoption in any spelling, on either path.
    const foreign = (): ReturnType<typeof makeRelay> => ({ ...flaggedRelay(), nvrMac: "ff:ee:dd:cc:bb:aa" });
    const foreignBootstrap = applyBootstrap(createInitialState(), makeBootstrap({ nvr: controller(), relays: [foreign()] }));
    const foreignAdded = reduce(seeded(), { data: foreign(), id: relayId, kind: "deviceAdded", modelKey: "relay" });

    assert.equal(foreignBootstrap.relays.get(relayId)?.isAdoptedByOther, true, "a foreign MAC in another spelling is a real foreign adoption");
    assert.equal(foreignAdded.relays.get(relayId)?.isAdoptedByOther, true, "a foreign MAC stays foreign on the realtime path too");
  });

  test("(f) a flagged deviceAdded normalizes and admits membership, repeats are same-reference no-ops, and the event record keeps the raw flag", () => {

    const record = flaggedRelay();
    const added = reduce(seeded(), { data: record, id: record.id, kind: "deviceAdded", modelKey: "relay" });

    assert.equal(added.relays.get(record.id)?.isAdoptedByOther, false, "the flagged deviceAdded record enters state normalized");
    assert.deepEqual(deviceSelectors.relay.adoptedIds(added), [record.id], "the normalized device counts as adopted here");
    assert.equal(record.isAdoptedByOther, true, "the event's record object still carries the raw flag for the events() firehose");

    // A re-send of an equal flagged record nets to no change: the stored normalized record compares equal to the re-normalized re-send.
    const resent = reduce(added, { data: flaggedRelay(), id: record.id, kind: "deviceAdded", modelKey: "relay" });

    assert.ok(Object.is(resent, added), "an identical flagged re-send is a whole-state no-op");
  });

  test("(f2) a drifted flagged re-send is normalized before it is reconciled, so the stored record stays clean and keeps its unchanged nested references", () => {

    const record = flaggedRelay();
    const added = reduce(seeded(), { data: record, id: record.id, kind: "deviceAdded", modelKey: "relay" });
    const drifted = reduce(added, { data: { ...flaggedRelay(), name: "Drifted" }, id: record.id, kind: "deviceAdded", modelKey: "relay" });
    const before = added.relays.get(record.id);
    const after = drifted.relays.get(record.id);

    assert.equal(after?.isAdoptedByOther, false, "the drifted re-send, still flagged on the wire, enters state normalized");
    assert.equal(after.name, "Drifted", "the drifted name reads the re-sent value");
    assert.ok(!Object.is(after, before), "the drifted record takes a new reference");
    assert.ok(Object.is(after.ledSettings, before?.ledSettings), "the unchanged ledSettings object keeps the first record's reference");
  });
});
