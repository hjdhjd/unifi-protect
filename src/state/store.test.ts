/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * store.test.ts: Unit tests for the observable StateStore - snapshot, the observe/dedup contract, the single dispatch chokepoint, the refresh failsafe (including its
 * invisible-on-no-drift property), the bootstrap-schema tripwire (the schema:unmodeledCollection diagnostics publish and its per-session dedup), the adoption
 * self-contradiction diagnostics (the ENTER/CLEAR episode tracking and the adoptionContradiction channel publish), and disposal. Driven through a fake refresh hook
 * with no network: the store's refresh loop runs on a `TestClock`, and the suite yields with short real delays only to let observers register and settle.
 */
import type { AdoptionContradictionPayload, SchemaUnmodeledCollectionPayload } from "../diagnostics.ts";
import { StateStore, createStateStore } from "./store.ts";
import { TestClock, settle } from "homebridge-plugin-utils/testing";
import { capturingLog, expectAt, settlement } from "../testing.helpers.ts";
import { channels, subscribeToChannel } from "../diagnostics.ts";
import { describe, test } from "node:test";
import { makeBootstrap, makeCamera, makeNvr, makeSensor } from "../fixtures.helpers.ts";
import type { ProtectNvrBootstrap } from "../types/index.ts";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { plainStore } from "./store.helpers.ts";

// Drive an observer in the background, collecting every yielded value into an array. Returns the array plus the iteration's completion promise so a test can abort the
// signal and await a clean teardown. The caller awaits a scheduler tick after calling this so the async-generator body registers the observer before any dispatch.
function collect<T>(iterable: AsyncIterable<T>): { done: Promise<void>; values: T[] } {

  const values: T[] = [];
  const done = (async (): Promise<void> => {

    for await (const value of iterable) {

      values.push(value);
    }
  })();

  return { done, values };
}

// A store whose refresh hook counts its calls and resolves an empty bootstrap, on a `TestClock` the caller advances, for the rows that read whether the failsafe ran.
function countingStore(refreshIntervalMs: number | false): { clock: TestClock; refreshes: () => number; store: StateStore } {

  const clock = new TestClock();
  let refreshes = 0;
  const store = new StateStore({ clock, refresh: (): Promise<ProtectNvrBootstrap> => {

    refreshes += 1;

    return Promise.resolve(makeBootstrap());
  }, refreshIntervalMs });

  return { clock, refreshes: (): number => refreshes, store };
}

describe("StateStore", () => {

  describe("snapshot and dispatch", () => {

    test("starts from the empty initial state", () => {

      const store = plainStore();
      const snapshot = store.snapshot();

      assert.equal(snapshot.bootstrapId, 0);
      assert.equal(snapshot.cameras.size, 0);
      assert.equal(snapshot.nvr, null);
    });

    test("dispatching a bootstrap advances the state and exposes the devices", () => {

      const store = plainStore();
      const bootstrap = makeBootstrap({ cameras: [makeCamera({ id: "c1", name: "Front" })] });

      store.dispatch({ data: bootstrap, kind: "bootstrapLoaded" });

      assert.equal(store.snapshot().bootstrapId, 1);
      assert.equal(store.snapshot().cameras.size, 1);
      assert.equal(store.selectors.camera.byId("c1")(store.snapshot())?.name, "Front");
    });

    test("a store's selectors are its own and stable across dispatches", () => {

      // The catalog is built once, with the store, so an observer holding one of its selectors keeps a live memo for the store's lifetime; a second store builds its
      // own, so the two never share a memo slot.
      const store = plainStore();
      const other = plainStore();
      const selectors = store.selectors;

      store.dispatch({ data: makeBootstrap({ cameras: [makeCamera({ id: "c1", isAdopted: true })] }), kind: "bootstrapLoaded" });
      store.dispatch({ id: "c1", kind: "devicePatched", modelKey: "camera", patch: { name: "Renamed" } });

      assert.ok(Object.is(store.selectors, selectors), "the catalog survives every dispatch");
      assert.notEqual(store.selectors, other.selectors, "two stores never share a catalog");
      assert.notEqual(store.selectors.camera.adoptedIds, other.selectors.camera.adoptedIds, "nor any selector inside one");
    });

    test("a no-op event leaves the state reference unchanged", () => {

      const store = plainStore();
      const before = store.snapshot();

      // A patch for an id that does not exist is a reducer no-op: it must return the same state reference, which the dispatch chokepoint detects and suppresses.
      store.dispatch({ id: "missing", kind: "devicePatched", modelKey: "camera", patch: { name: "X" } });

      assert.ok(Object.is(before, store.snapshot()), "a no-op dispatch must not replace the state reference");
    });
  });

  describe("observe", () => {

    test("yields on a change but not on the initial value", async () => {

      const store = plainStore();

      store.dispatch({ data: makeBootstrap({ cameras: [makeCamera({ id: "c1", name: "Front" })] }), kind: "bootstrapLoaded" });

      const ac = new AbortController();
      const { done, values } = collect(store.observe(store.selectors.camera.byId("c1"), { signal: ac.signal }));

      // Let the async-generator body register the observer (it reads the baseline from the current snapshot at this point).
      await delay(0);
      assert.equal(values.length, 0, "observe yields on change, not the current value");

      store.dispatch({ id: "c1", kind: "devicePatched", modelKey: "camera", patch: { name: "Back" } });
      await expectAt(() => values.length === 1);
      assert.equal(values[0]?.name, "Back");

      ac.abort();
      await done;
    });

    test("dedups: a change that does not touch the selected value yields nothing", async () => {

      const store = plainStore();

      store.dispatch({ data: makeBootstrap({ cameras: [ makeCamera({ id: "c1" }), makeCamera({ id: "c2" }) ] }), kind: "bootstrapLoaded" });

      const ac = new AbortController();
      const { done, values } = collect(store.observe(store.selectors.camera.byId("c1"), { signal: ac.signal }));

      await delay(0);

      // Changing c2 must not wake an observer selecting c1 - the selected reference is unchanged, so Object.is suppresses it.
      store.dispatch({ id: "c2", kind: "devicePatched", modelKey: "camera", patch: { name: "Other" } });
      await delay(5);
      assert.equal(values.length, 0, "an unrelated change must not notify this observer");

      ac.abort();
      await done;
    });

    test("an already-aborted signal yields nothing and completes", async () => {

      const store = plainStore();
      const ac = new AbortController();

      ac.abort();

      const { done, values } = collect(store.observe(store.selectors.camera.all, { signal: ac.signal }));

      // A change after the aborted observe would wake a registered observer, and an abort that has already fired can never end one, so the bounded wait reads the
      // iteration completing on its own.
      store.dispatch({ data: makeBootstrap({ cameras: [makeCamera({ id: "c1" })] }), kind: "bootstrapLoaded" });
      await expectAt(settlement(done), { message: "an observation begun with an aborted signal must complete on its own" });
      await done;
      assert.equal(values.length, 0);
    });

    test("aborting the signal terminates an active iteration", async () => {

      const store = plainStore();
      const ac = new AbortController();
      const { done, values } = collect(store.observe(store.selectors.camera.all, { signal: ac.signal }));

      await delay(0);
      store.dispatch({ data: makeBootstrap({ cameras: [makeCamera({ id: "c1" })] }), kind: "bootstrapLoaded" });
      await expectAt(() => values.length === 1);

      ac.abort();

      // The iteration must complete (the promise resolves) once aborted - no hang, no leak.
      await done;
    });
  });

  describe("refresh failsafe", () => {

    test("is invisible to observers when the bootstrap has not drifted", async () => {

      const clock = new TestClock();
      const camera = makeCamera({ id: "c1", name: "Front" });
      const bootstrap = makeBootstrap({ cameras: [camera] });
      // The refresh returns the very same bootstrap on each pass, so applyBootstrap reconciles to the existing references.
      const store = new StateStore({ clock, refresh: (): Promise<ProtectNvrBootstrap> => Promise.resolve(bootstrap), refreshIntervalMs: 1000 });

      store.dispatch({ data: bootstrap, kind: "bootstrapLoaded" });

      const ac = new AbortController();
      const { done, values } = collect(store.observe(store.selectors.camera.all, { signal: ac.signal }));

      await delay(0);

      const bootstrapIdBefore = store.snapshot().bootstrapId;

      clock.advance(1000);
      await settle();

      // The refresh ran (bootstrapId advanced) but the selected array reference did not change, so no observer was notified - the failsafe is silent on zero drift.
      await expectAt(() => store.snapshot().bootstrapId === (bootstrapIdBefore + 1));
      await delay(5);
      assert.equal(values.length, 0, "a drift-free refresh must notify no observer");

      ac.abort();
      await done;
    });

    test("surfaces precisely the delta to observers when the bootstrap has drifted", async () => {

      const clock = new TestClock();
      let name = "Front";
      const bootstrapFor = (): ReturnType<typeof makeBootstrap> => makeBootstrap({ cameras: [makeCamera({ id: "c1", name })] });
      const store = new StateStore({ clock, refresh: (): Promise<ProtectNvrBootstrap> => Promise.resolve(bootstrapFor()), refreshIntervalMs: 1000 });

      store.dispatch({ data: bootstrapFor(), kind: "bootstrapLoaded" });

      const ac = new AbortController();
      const { done, values } = collect(store.observe(store.selectors.camera.byId("c1"), { signal: ac.signal }));

      await delay(0);

      // Drift the camera's name, then wake the failsafe: the reconciliation must replace exactly the c1 reference and wake the observer once.
      name = "Back";
      clock.advance(1000);
      await settle();
      await expectAt(() => values.length === 1);

      // A second refresh finds no further drift, and the observer's baseline is the drifted record it last yielded, so it stays silent: the delta arrives once.
      const bootstrapIdBefore = store.snapshot().bootstrapId;

      clock.advance(1000);
      await settle();
      await expectAt(() => store.snapshot().bootstrapId === (bootstrapIdBefore + 1));
      await delay(5);
      assert.deepEqual(values.map((value) => value?.name), ["Back"]);

      ac.abort();
      await done;
    });

    test("keeps a sub-record observer silent across a refresh that drifted an unrelated field, and wakes it when its own slice drifts", async () => {

      const clock = new TestClock();
      let overrides: Record<string, unknown> = { id: "c1", lastMotion: 0 };
      const bootstrapFor = (): ReturnType<typeof makeBootstrap> => makeBootstrap({ cameras: [makeCamera(overrides)] });
      const store = new StateStore({ clock, refresh: (): Promise<ProtectNvrBootstrap> => Promise.resolve(bootstrapFor()), refreshIntervalMs: 1000 });

      store.dispatch({ data: bootstrapFor(), kind: "bootstrapLoaded" });

      const ac = new AbortController();
      const { done, values } = collect(store.observe((state) => state.cameras.get("c1")?.featureFlags, { signal: ac.signal }));

      await delay(0);

      // Drift lastMotion alone: the camera record takes a new reference, but its featureFlags object keeps its own, so the observer stays silent.
      overrides = { id: "c1", lastMotion: 999 };

      const bootstrapIdBefore = store.snapshot().bootstrapId;

      clock.advance(1000);
      await settle();
      await expectAt(() => store.snapshot().bootstrapId === (bootstrapIdBefore + 1));
      await delay(5);
      assert.equal(store.snapshot().cameras.get("c1")?.lastMotion, 999, "the refresh applied the drifted scalar");
      assert.equal(values.length, 0, "a refresh that drifted an unrelated field must not wake a featureFlags observer");

      // Drift featureFlags itself: the observer wakes exactly once with the new slice.
      overrides = { featureFlags: { hasMotionZones: false, smartDetectTypes: ["person"] }, id: "c1", lastMotion: 999 };
      clock.advance(1000);
      await settle();
      await expectAt(() => values.length === 1);
      await delay(5);
      assert.equal(values.length, 1, "a featureFlags drift wakes the observer once");
      assert.equal(values[0]?.hasMotionZones, false);

      ac.abort();
      await done;
    });

    test("survives a refresh failure and recovers on the next wake", async () => {

      const clock = new TestClock();
      const log = capturingLog();
      let attempt = 0;
      const refresh = (): Promise<ReturnType<typeof makeBootstrap>> => {

        attempt += 1;

        if(attempt === 1) {

          return Promise.reject(new Error("transient"));
        }

        return Promise.resolve(makeBootstrap({ cameras: [makeCamera({ id: "c1" })] }));
      };
      const store = new StateStore({ clock, log, refresh, refreshIntervalMs: 1000 });

      // The first wake fails: the loop logs at debug and stays alive.
      clock.advance(1000);
      await settle();
      await expectAt(() => log.entries.some((entry) => (entry.level === "debug") && entry.message.includes("Bootstrap refresh failed")));
      assert.equal(store.snapshot().cameras.size, 0);

      // The second wake succeeds: the failsafe applies the bootstrap as if nothing had gone wrong.
      clock.advance(1000);
      await settle();
      await expectAt(() => store.snapshot().cameras.size === 1);
    });

    test("does not run when the interval is false", async () => {

      const { clock, refreshes, store } = countingStore(false);

      // With the loop disabled nothing is parked on the clock, so an advance releases nothing and the refresh hook is never invoked.
      clock.advance(1000);
      await settle();
      await delay(5);
      assert.equal(refreshes(), 0);

      await store[Symbol.asyncDispose]();
    });

    test("does not run when the interval is non-positive", async () => {

      // The refresh hook's calls across one advance for a store built with the given interval, read after the store is disposed.
      const refreshesAt = async (refreshIntervalMs: number): Promise<number> => {

        const { clock, refreshes, store } = countingStore(refreshIntervalMs);

        clock.advance(1000);
        await settle();
        await delay(5);
        await store[Symbol.asyncDispose]();

        return refreshes();
      };

      // A non-positive interval disables the failsafe as false does. A loop started at a non-positive value would park a delay that is already due, which the advance
      // would release, so the refresh hook would run.
      assert.equal(await refreshesAt(0), 0, "a zero interval must not start the failsafe");
      assert.equal(await refreshesAt(-1), 0, "a negative interval must not start the failsafe");
    });

    test("wakes at its period and not before, timing each interval from the end of the refresh before it", async () => {

      const clock = new TestClock();
      const refreshes: PromiseWithResolvers<ProtectNvrBootstrap>[] = [];
      const store = new StateStore({ clock, refresh: (): Promise<ProtectNvrBootstrap> => {

        const pending = Promise.withResolvers<ProtectNvrBootstrap>();

        refreshes.push(pending);

        return pending.promise;
      }, refreshIntervalMs: 1000 });

      // The loop parks one interval at construction, so nothing runs a millisecond short of it and the first refresh starts at it.
      clock.advance(999);
      await settle();
      assert.equal(refreshes.length, 0, "no refresh runs before the first interval elapses");

      clock.advance(1);
      await settle();
      assert.equal(refreshes.length, 1, "the first refresh starts one interval after construction");

      // The refresh takes half an interval to answer. The next interval is timed from its answer, so a slow refresh never brings the next one forward.
      clock.advance(500);
      refreshes.at(-1)?.resolve(makeBootstrap());
      await settle();
      assert.equal(clock.nextDeadline, 2500, "the next wake comes due one interval after the refresh answered");

      clock.advance(999);
      await settle();
      assert.equal(refreshes.length, 1, "no refresh runs before that interval elapses");

      clock.advance(1);
      await settle();
      assert.equal(refreshes.length, 2, "the second refresh starts one interval after the first answered");

      refreshes.at(-1)?.resolve(makeBootstrap());
      await store[Symbol.asyncDispose]();
    });
  });

  describe("disposal", () => {

    test("stops the refresh failsafe and terminates observers", async () => {

      const { clock, refreshes, store } = countingStore(1000);
      const { done, values } = collect(store.observe(store.selectors.camera.all));

      await delay(0);
      await store[Symbol.asyncDispose]();

      // Disposal closes the observer, so its iteration completes without further values.
      await done;
      assert.equal(values.length, 0);

      // The refresh loop parks its delay at construction and disposal's abort withdraws it, so an advance after disposal finds nothing to release.
      clock.advance(1000);
      await settle();
      assert.equal(refreshes(), 0, "an advance after disposal must not run the refresh hook");
    });

    test("a refresh still in flight at disposal logs no retry when it fails afterwards", async () => {

      const clock = new TestClock();
      const log = capturingLog();
      const pending = Promise.withResolvers<ProtectNvrBootstrap>();
      let started = false;
      const store = new StateStore({ clock, log, refresh: (): Promise<ProtectNvrBootstrap> => {

        started = true;

        return pending.promise;
      }, refreshIntervalMs: 1000 });

      clock.advance(1000);
      await settle();
      assert.equal(started, true, "the wake started a refresh that is still in flight");

      // The refresh fails only once the store is gone, the way a fetch fails when the client is closed under it. A retry promised now would name an interval the
      // disposal has already ended.
      await store[Symbol.asyncDispose]();
      pending.reject(new Error("The transport was disposed under the refresh."));
      await settle();

      assert.equal(log.entries.some((entry) => entry.message.includes("Bootstrap refresh failed")), false, "a refresh that fails after disposal logs no retry");
    });

    test("an observation begun after disposal completes immediately", async () => {

      const store = plainStore();

      await store[Symbol.asyncDispose]();

      // No dispatch, no abort, and no further disposal will ever arrive to unpark this iteration, so it must complete on its own rather than registering, which the
      // bounded wait reads.
      const { done, values } = collect(store.observe(store.selectors.camera.all));

      await expectAt(settlement(done), { message: "an observation begun after disposal must complete on its own" });
      await done;
      assert.equal(values.length, 0);
    });

    test("a dispatch after disposal is a no-op: the state reference holds", async () => {

      const store = plainStore();

      store.dispatch({ data: makeBootstrap({ cameras: [makeCamera({ id: "c1" })] }), kind: "bootstrapLoaded" });

      const before = store.snapshot();

      await store[Symbol.asyncDispose]();

      // The dispatch chokepoint covers every caller, including a refresh that was already in flight when disposal ran and settles afterward - nothing may advance a
      // disposed store's state.
      store.dispatch({ data: makeBootstrap({ cameras: [makeCamera({ id: "c1", name: "Late" })] }), kind: "bootstrapLoaded" });

      assert.ok(Object.is(before, store.snapshot()), "a dispatch after disposal must not advance the state");
    });
  });

  describe("bootstrap-schema tripwire", () => {

    // A bootstrap carrying an unmodeled, device-shaped collection (aiports). makeBootstrap's overrides type is closed to the modeled collections, so the unmodeled key is
    // set by spreading makeBootstrap() and adding aiports; makeCamera supplies the device shape (`mac`+`modelKey`+`id`) under a non-device `modelKey`.
    const unmodeledBootstrap = (): ProtectNvrBootstrap => ({

      ...makeBootstrap({ cameras: [makeCamera({ id: "c1" })] }),
      aiports: [makeCamera({ id: "ap1", mac: "AA:BB:CC:00:00:10", modelKey: "aiport" })]
    });

    test("publishes schema:unmodeledCollection once per modelKey per session and debug-logs each", () => {

      const log = capturingLog();
      const store = plainStore({ log });
      const drift: SchemaUnmodeledCollectionPayload[] = [];

      using driftSubscription = subscribeToChannel(channels.schemaUnmodeledCollection, (payload) => void drift.push(payload));

      // First bootstrap: the unmodeled aiports collection publishes once and debug-logs.
      store.dispatch({ data: unmodeledBootstrap(), kind: "bootstrapLoaded" });

      assert.equal(drift.length, 1);
      assert.deepEqual(drift[0], { collection: "aiports", count: 1, exampleId: "ap1", known: true, modelKey: "aiport" });
      assert.ok(log.entries.some((entry) => (entry.level === "debug") && entry.message.includes("device collection the library does not model")));

      // A second identical bootstrap re-mints a fresh state (applyBootstrap always bumps bootstrapId, so the dispatch Object.is gate never fires for a bootstrap); the
      // per-session #seenUnmodeled dedup set, not the gate, is what suppresses the re-publish.
      store.dispatch({ data: unmodeledBootstrap(), kind: "bootstrapLoaded" });

      assert.equal(drift.length, 1, "a recurring unmodeled class re-publishes nothing within a session (the dedup set is the sole suppressor)");

      // A DISTINCT unmodeled device class publishes independently - #seenUnmodeled is keyed per modelKey, not once per session. A `garages` collection (modelKey
      // "garage" + a mac) is genuine drift, so it adds a second publish. `garages` is not a declared bootstrap field, so we spread makeBootstrap()'s result (its
      // overrides parameter is closed to the modeled collections) and add `garages` as an out-of-schema key, which the bootstrap's index signature accepts.
      const withGarages: ProtectNvrBootstrap = {

        ...makeBootstrap({ cameras: [makeCamera({ id: "c1" })] }),
        garages: [makeCamera({ id: "g1", mac: "AA:BB:CC:00:00:20", modelKey: "garage" })]
      };

      store.dispatch({ data: withGarages, kind: "bootstrapLoaded" });

      assert.equal(drift.length, 2, "a distinct unmodeled modelKey publishes independently (per-modelKey dedup granularity)");
      assert.deepEqual(drift[1], { collection: "garages", count: 1, exampleId: "g1", known: false, modelKey: "garage" });
    });
  });

  describe("adoption self-contradiction diagnostics", () => {

    // The controller's own MAC and a flagged sensor that reports isAdoptedByOther true while its nvrMac still names this controller, plus its coherent counterpart.
    const ownMac = "AABBCC000002";
    const controller = (): ReturnType<typeof makeNvr> => makeNvr({ mac: ownMac });
    const flaggedSensor = (): ReturnType<typeof makeSensor> => makeSensor({ id: "s1", isAdopted: true, isAdoptedByOther: true, mac: "AABBCC000001", nvrMac: ownMac });
    const cleanSensor = (): ReturnType<typeof makeSensor> => makeSensor({ id: "s1", isAdopted: true, isAdoptedByOther: false, mac: "AABBCC000001", nvrMac: ownMac });
    const flaggedBootstrap = (): ReturnType<typeof makeBootstrap> => makeBootstrap({ nvr: controller(), sensors: [flaggedSensor()] });

    // Run a body against a plain store with a live subscription to the adoption channel, collecting every published payload and always detaching the handler after.
    function withCapture(run: (store: StateStore, published: AdoptionContradictionPayload[]) => void): void {

      const store = plainStore();
      const published: AdoptionContradictionPayload[] = [];

      using subscription = subscribeToChannel(channels.adoptionContradiction, (payload) => void published.push(payload));

      run(store, published);
    }

    test("publishes once on the ENTER edge with the device payload and warns, and a second flagged bootstrap re-publishes nothing", () => {

      const log = capturingLog();
      const store = plainStore({ log });
      const published: AdoptionContradictionPayload[] = [];

      using subscription = subscribeToChannel(channels.adoptionContradiction, (payload) => void published.push(payload));

      store.dispatch({ data: flaggedBootstrap(), kind: "bootstrapLoaded" });

      assert.equal(published.length, 1);
      assert.deepEqual(published[0], { id: "s1", mac: "AABBCC000001", modelKey: "sensor", nvrMac: ownMac });
      assert.ok(log.entries.some((entry) => (entry.level === "warn") && entry.message.includes("adopted by another controller")), "a warn narrates the episode");

      store.dispatch({ data: flaggedBootstrap(), kind: "bootstrapLoaded" });

      assert.equal(published.length, 1, "the same engaged device re-asserting on the next bootstrap publishes nothing");
    });

    test("a repeat flagged patch and a flagged deviceAdded re-send publish nothing once the device is engaged", () => {

      withCapture((store, published) => {

        store.dispatch({ data: makeBootstrap({ nvr: controller(), sensors: [cleanSensor()] }), kind: "bootstrapLoaded" });
        store.dispatch({ id: "s1", kind: "devicePatched", modelKey: "sensor", patch: { isAdoptedByOther: true } });
        assert.equal(published.length, 1, "the flip patch is the ENTER edge");

        // The flip patch carries no mac of its own, so the payload's device mac comes from the stored record.
        assert.deepEqual(published[0], { id: "s1", mac: "AABBCC000001", modelKey: "sensor", nvrMac: ownMac });

        store.dispatch({ id: "s1", kind: "devicePatched", modelKey: "sensor", patch: { isAdoptedByOther: true } });
        assert.equal(published.length, 1, "a repeat flagged patch publishes nothing");

        store.dispatch({ data: flaggedSensor(), id: "s1", kind: "deviceAdded", modelKey: "sensor" });
        assert.equal(published.length, 1, "a flagged deviceAdded re-send publishes nothing");
      });
    });

    test("a patch silent on adoption holds: it publishes nothing and does not clear the engaged episode", () => {

      withCapture((store, published) => {

        store.dispatch({ data: flaggedBootstrap(), kind: "bootstrapLoaded" });
        assert.equal(published.length, 1);

        store.dispatch({ id: "s1", kind: "devicePatched", modelKey: "sensor", patch: { lastSeen: 123 } });
        assert.equal(published.length, 1, "a lastSeen-only patch publishes nothing");

        // The device is still engaged after the HOLD, so re-asserting the flag on the next bootstrap publishes nothing (had the HOLD cleared, this would re-publish).
        store.dispatch({ data: flaggedBootstrap(), kind: "bootstrapLoaded" });
        assert.equal(published.length, 1, "the device remained engaged through the HOLD");
      });
    });

    test("a clean-recovery patch that nets to a reducer no-op still clears the episode, re-arming a future publish", () => {

      withCapture((store, published) => {

        store.dispatch({ data: flaggedBootstrap(), kind: "bootstrapLoaded" });
        assert.equal(published.length, 1);

        // The stored record is already normalized, so a clean patch asserting isAdoptedByOther false nets to a reducer no-op - but it explicitly asserts a coherent
        // adoption, so it must clear the engaged set anyway.
        const before = store.snapshot();

        store.dispatch({ id: "s1", kind: "devicePatched", modelKey: "sensor", patch: { isAdoptedByOther: false } });
        assert.ok(Object.is(before, store.snapshot()), "the clean patch nets to a reducer no-op against the normalized record");
        assert.equal(published.length, 1, "the clean recovery itself publishes nothing");

        store.dispatch({ id: "s1", kind: "devicePatched", modelKey: "sensor", patch: { isAdoptedByOther: true } });
        assert.equal(published.length, 2, "after the clear, a new flagged assertion publishes again");
      });
    });

    test("clean and genuinely-foreign bootstrap records publish nothing", () => {

      withCapture((store, published) => {

        store.dispatch({ data: makeBootstrap({ nvr: controller(), sensors: [cleanSensor()] }), kind: "bootstrapLoaded" });
        store.dispatch({ data: makeBootstrap({ nvr: controller(),
          sensors: [makeSensor({ id: "s2", isAdopted: true, isAdoptedByOther: true, mac: "AABBCC000003", nvrMac: "FFEEDDCCBBAA" })] }), kind: "bootstrapLoaded" });

        assert.equal(published.length, 0, "neither a clean nor a genuinely-foreign record is a contradiction");
      });
    });

    test("a contradicting patch for a device the store does not hold publishes nothing", () => {

      withCapture((store, published) => {

        store.dispatch({ data: makeBootstrap({ nvr: controller() }), kind: "bootstrapLoaded" });

        // The patch carries the whole contradiction on its own, so with no stored record to merge it reads as one; the reducer ignores a patch for an id it does not
        // hold, and the tracker mirrors that rather than publishing for a device that is not there.
        store.dispatch({ id: "s9", kind: "devicePatched", modelKey: "sensor", patch: { isAdopted: true, isAdoptedByOther: true, nvrMac: ownMac } });
        assert.equal(published.length, 0, "a patch against an unknown id publishes nothing");
      });
    });

    test("an nvr patch asserting isAdoptedByOther is not tracked as a device adoption and publishes nothing", () => {

      withCapture((store, published) => {

        store.dispatch({ data: makeBootstrap({ nvr: controller() }), kind: "bootstrapLoaded" });

        // The controller's own record is patched over the realtime stream like any device's, but adoption is a device concept and the nvr singleton has no device map,
        // so the tracker skips the patch before resolving a collection field for it.
        assert.doesNotThrow(() => store.dispatch({ id: "nvr-1", kind: "devicePatched", modelKey: "nvr", patch: { isAdoptedByOther: true } }));
        assert.equal(published.length, 0, "an nvr patch publishes nothing");
      });
    });

    test("a device absent from a fresh bootstrap, a clean bootstrap record, a clean deviceAdded, and a removal each clear the episode", () => {

      // Absent from a fresh bootstrap clears the episode; the device returning flagged then re-publishes.
      withCapture((store, published) => {

        store.dispatch({ data: flaggedBootstrap(), kind: "bootstrapLoaded" });
        store.dispatch({ data: makeBootstrap({ nvr: controller() }), kind: "bootstrapLoaded" });
        store.dispatch({ data: flaggedBootstrap(), kind: "bootstrapLoaded" });
        assert.equal(published.length, 2, "the device vanished then returned flagged, so the episode re-published");
      });

      // A clean bootstrap record for the same device clears the episode.
      withCapture((store, published) => {

        store.dispatch({ data: flaggedBootstrap(), kind: "bootstrapLoaded" });
        store.dispatch({ data: makeBootstrap({ nvr: controller(), sensors: [cleanSensor()] }), kind: "bootstrapLoaded" });
        store.dispatch({ data: flaggedBootstrap(), kind: "bootstrapLoaded" });
        assert.equal(published.length, 2, "a clean bootstrap record cleared the episode, so re-flagging publishes again");
      });

      // A clean deviceAdded clears the episode.
      withCapture((store, published) => {

        store.dispatch({ data: flaggedBootstrap(), kind: "bootstrapLoaded" });
        store.dispatch({ data: cleanSensor(), id: "s1", kind: "deviceAdded", modelKey: "sensor" });
        store.dispatch({ data: flaggedSensor(), id: "s1", kind: "deviceAdded", modelKey: "sensor" });
        assert.equal(published.length, 2, "a clean deviceAdded cleared the episode, so re-flagging publishes again");
      });

      // A removal clears the episode.
      withCapture((store, published) => {

        store.dispatch({ data: flaggedBootstrap(), kind: "bootstrapLoaded" });
        store.dispatch({ id: "s1", kind: "deviceRemoved", modelKey: "sensor" });
        store.dispatch({ data: flaggedSensor(), id: "s1", kind: "deviceAdded", modelKey: "sensor" });
        assert.equal(published.length, 2, "removal cleared the episode, so re-adding flagged publishes again");
      });
    });
  });
});

describe("createStateStore", () => {

  test("passes its options through: a supplied initial state is the new store's starting snapshot", () => {

    // Build a populated snapshot via a throwaway store, then prove createStateStore starts a fresh store from exactly that state - the initialState option reached it.
    const seed = plainStore();

    seed.dispatch({ data: makeBootstrap({ cameras: [makeCamera({ id: "seed", name: "Seeded" })] }), kind: "bootstrapLoaded" });

    const store = createStateStore({ initialState: seed.snapshot(),
      refresh: () => Promise.reject(new Error("the refresh hook must not be called")), refreshIntervalMs: false });

    assert.equal(store.snapshot().cameras.size, 1, "the supplied initial state reached the new store");
    assert.equal(store.selectors.camera.byId("seed")(store.snapshot())?.name, "Seeded");
  });
});
