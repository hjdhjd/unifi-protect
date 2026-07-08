/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * store.test.ts: Unit tests for the observable StateStore - snapshot, the observe/dedup contract, the single dispatch chokepoint, the refresh failsafe (including its
 * load-bearing invisible-on-no-drift property), the bootstrap-schema tripwire (the schema:unmodeledCollection diagnostics publish and its per-session dedup), and
 * disposal. Driven entirely through a fake clock and a fake refresh seam; no network and no real timers.
 */
import { capturingLog, expectAt, fakeClock } from "../testing.helpers.ts";
import { describe, test } from "node:test";
import { makeBootstrap, makeCamera } from "../fixtures.helpers.ts";
import { selectCamera, selectCameras } from "./selectors.ts";
import type { ProtectNvrBootstrap } from "../types/index.ts";
import type { SchemaUnmodeledCollectionPayload } from "../diagnostics.ts";
import { StateStore } from "./store.ts";
import assert from "node:assert/strict";
import { channels } from "../diagnostics.ts";
import { setTimeout as delay } from "node:timers/promises";

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

// A store with the refresh failsafe disabled - the common shape for tests that exercise dispatch and observe in isolation. The refresh seam is never invoked, so it
// rejects to make an accidental call loud.
function plainStore(): StateStore {

  return new StateStore({ clock: fakeClock(), refresh: () => Promise.reject(new Error("the refresh seam must not be called when the failsafe is disabled")),
    refreshIntervalMs: false });
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
      assert.equal(selectCamera("c1")(store.snapshot())?.name, "Front");
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
      const { done, values } = collect(store.observe(selectCamera("c1"), { signal: ac.signal }));

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
      const { done, values } = collect(store.observe(selectCamera("c1"), { signal: ac.signal }));

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

      const { done, values } = collect(store.observe(selectCameras, { signal: ac.signal }));

      await done;
      assert.equal(values.length, 0);
    });

    test("aborting the signal terminates an active iteration", async () => {

      const store = plainStore();
      const ac = new AbortController();
      const { done, values } = collect(store.observe(selectCameras, { signal: ac.signal }));

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

      const clock = fakeClock();
      const camera = makeCamera({ id: "c1", name: "Front" });
      const bootstrap = makeBootstrap({ cameras: [camera] });
      // The refresh returns the very same bootstrap each tick, so applyBootstrap reconciles to the existing references.
      const store = new StateStore({ clock, refresh: () => Promise.resolve(bootstrap), refreshIntervalMs: 1000 });

      store.dispatch({ data: bootstrap, kind: "bootstrapLoaded" });

      const ac = new AbortController();
      const { done, values } = collect(store.observe(selectCameras, { signal: ac.signal }));

      await delay(0);

      const bootstrapIdBefore = store.snapshot().bootstrapId;

      await clock.tick();

      // The refresh ran (bootstrapId advanced) but the selected array reference did not change, so no observer was notified - the failsafe is silent on zero drift.
      await expectAt(() => store.snapshot().bootstrapId === (bootstrapIdBefore + 1));
      await delay(5);
      assert.equal(values.length, 0, "a drift-free refresh must notify no observer");

      ac.abort();
      await done;
    });

    test("surfaces precisely the delta to observers when the bootstrap has drifted", async () => {

      const clock = fakeClock();
      let name = "Front";
      const bootstrapFor = (): ReturnType<typeof makeBootstrap> => makeBootstrap({ cameras: [makeCamera({ id: "c1", name })] });
      const store = new StateStore({ clock, refresh: () => Promise.resolve(bootstrapFor()), refreshIntervalMs: 1000 });

      store.dispatch({ data: bootstrapFor(), kind: "bootstrapLoaded" });

      const ac = new AbortController();
      const { done, values } = collect(store.observe(selectCamera("c1"), { signal: ac.signal }));

      await delay(0);

      // Drift the camera's name, then tick the failsafe: the reconciliation must replace exactly the c1 reference and wake the observer once.
      name = "Back";
      await clock.tick();
      await expectAt(() => values.length === 1);
      assert.equal(values[0]?.name, "Back");

      ac.abort();
      await done;
    });

    test("survives a refresh failure and recovers on the next tick", async () => {

      const clock = fakeClock();
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

      // First tick fails: the loop logs at debug and stays alive.
      await clock.tick();
      await expectAt(() => log.entries.some((entry) => (entry.level === "debug") && entry.message.includes("Bootstrap refresh failed")));
      assert.equal(store.snapshot().cameras.size, 0);

      // Second tick succeeds: the failsafe applies the bootstrap as if nothing had gone wrong.
      await clock.tick();
      await expectAt(() => store.snapshot().cameras.size === 1);
    });

    test("does not run when the interval is false", async () => {

      const clock = fakeClock();
      let refreshes = 0;
      const store = new StateStore({ clock, refresh: () => {

        refreshes += 1;

        return Promise.resolve(makeBootstrap());
      }, refreshIntervalMs: false });

      // With the loop disabled there is no interval consumer, so a tick releases nothing and the refresh seam is never invoked.
      await clock.tick();
      await delay(5);
      assert.equal(refreshes, 0);

      void store;
    });
  });

  describe("disposal", () => {

    test("stops the refresh failsafe and terminates observers", async () => {

      const clock = fakeClock();
      const store = new StateStore({ clock, refresh: () => Promise.resolve(makeBootstrap()), refreshIntervalMs: 1000 });
      const { done, values } = collect(store.observe(selectCameras));

      await delay(0);
      await store[Symbol.asyncDispose]();

      // Disposal closes the observer, so its iteration completes without further values.
      await done;
      assert.equal(values.length, 0);
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
      const store = new StateStore({ clock: fakeClock(), log, refresh: () => Promise.reject(new Error("unused")), refreshIntervalMs: false });
      const drift: SchemaUnmodeledCollectionPayload[] = [];
      const onDrift = (message: unknown): void => void drift.push(message as SchemaUnmodeledCollectionPayload);

      channels.schemaUnmodeledCollection.subscribe(onDrift);

      try {

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
      } finally {

        channels.schemaUnmodeledCollection.unsubscribe(onDrift);
      }
    });
  });
});
