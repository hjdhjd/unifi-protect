/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * devices.test.ts: Unit tests for the device projections - liveness (a held handle reflects store mutations), the absent-device guard, live observe, and the
 * write-through commands (snapshot, update, reboot) including the contract that a command never folds its response back into the store.
 */
import { FatalError, ProtectAbortedError, ProtectAuthorizationError, ProtectError, ProtectProtocolError, ProtectRequestError,
  ProtectUnsupportedError } from "../errors.ts";
import { describe, test } from "node:test";
import { expectAt, fakeClock, silentLog } from "../testing.helpers.ts";
import { makeBootstrap, makeCamera, makeChime, makeFob, makeLight, makeNvr, makeRelay } from "../fixtures.helpers.ts";
import { Camera } from "./camera.ts";
import { Chime } from "./chime.ts";
import type { DeviceContext } from "./context.ts";
import { DeviceRegistry } from "./registry.ts";
import { Fob } from "./fob.ts";
import { Light } from "./light.ts";
import { LivestreamPool } from "../client/livestream-pool.ts";
import type { MockTransport } from "../transport/mock-controller.helpers.ts";
import { Nvr } from "./nvr.ts";
import type { ProtectNvrBootstrap } from "../types/index.ts";
import { Relay } from "./relay.ts";
import { StateStore } from "../state/store.ts";
import { TalkbackSession } from "../transport/talkback-session.ts";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { makeMockTransport } from "../transport/mock-controller.helpers.ts";
import { talkbackUrlResolver } from "../transport/ws-endpoint.ts";

// Build a device context backed by a real (mocked-transport) store seeded with the given bootstrap. Returns the mock-transport bundle too, so a test can set up
// interceptors and assert request shapes. The refresh failsafe is disabled - device tests drive state through explicit dispatch.
function deviceFixture(bootstrap: ProtectNvrBootstrap): { ctx: DeviceContext; mock: MockTransport; store: StateStore } {

  const mock = makeMockTransport();
  const store = new StateStore({ clock: fakeClock(), refresh: () => Promise.reject(new Error("unused")), refreshIntervalMs: false });

  store.dispatch({ data: bootstrap, kind: "bootstrapLoaded" });

  // The pool is lazy - it negotiates nothing until a camera is subscribed - and these device tests never call `camera.livestream()`, so an inert pool with a rejecting
  // resolver satisfies the context's `livestreamPool` member honestly, without a cast.
  const livestreamPool = new LivestreamPool({ clock: fakeClock(), log: silentLog(), resolveUrl: () => Promise.reject(new Error("unused")) });

  // The real talkback factory, bound to the mock transport's talkback URL resolver - so a test asserting `camera.talkback()`'s capability guard is pre-negotiation can
  // register a talkback interceptor and prove it stays pending (the factory would negotiate through the transport if the guard ever failed to fire first).
  const talkback = (params: { cameraId: string }, opts: { signal?: AbortSignal } = {}): Promise<TalkbackSession> => TalkbackSession.connect({

    cameraId: params.cameraId,
    log: silentLog(),
    resolveUrl: talkbackUrlResolver(mock.transport, mock.host),
    ...((opts.signal !== undefined) && { signal: opts.signal })
  });

  return { ctx: { host: mock.host, livestreamPool, log: silentLog(), store, talkback, transport: mock.transport }, mock, store };
}

describe("device projections", () => {

  describe("liveness and read-through getters", () => {

    test("a held projection reflects later store mutations", () => {

      const { ctx, store } = deviceFixture(makeBootstrap({ cameras: [makeCamera({ id: "c1", name: "Front", state: "CONNECTED" })] }));
      const camera = new Camera(ctx, "c1");

      assert.equal(camera.name, "Front");
      assert.equal(camera.isOnline, true);

      // Mutate the store after the handle was created; the projection must re-read and reflect the new state - it is a view, not a snapshot.
      store.dispatch({ id: "c1", kind: "devicePatched", modelKey: "camera", patch: { name: "Back", state: "DISCONNECTED" } });

      assert.equal(camera.name, "Back");
      assert.equal(camera.isOnline, false);
    });

    test("falls back to displayName when name is unset", () => {

      const { ctx } = deviceFixture(makeBootstrap({ cameras: [makeCamera({ displayName: "Garage", id: "c1", name: undefined })] }));
      const camera = new Camera(ctx, "c1");

      assert.equal(camera.name, "Garage");
    });

    test("getters throw once the device leaves the state", () => {

      const { ctx, store } = deviceFixture(makeBootstrap({ cameras: [makeCamera({ id: "c1", name: "Front" })] }));
      const camera = new Camera(ctx, "c1");

      store.dispatch({ id: "c1", kind: "deviceRemoved", modelKey: "camera" });

      assert.throws(() => camera.name, ReferenceError, "a held handle to a removed device must throw, not return stale data");
    });

    test("peek returns the live config while the device is present, tracking later store mutations", () => {

      const { ctx, store } = deviceFixture(makeBootstrap({ cameras: [makeCamera({ id: "c1", name: "Front" })] }));
      const camera = new Camera(ctx, "c1");

      // peek() is the non-throwing read: a present record yields the config, and it resolves the same record reference the asserting getter exposes - the two share one
      // read recipe (config is peek-or-throw), so they cannot disagree about which record they read.
      assert.equal(camera.peek()?.name, "Front");
      assert.ok(camera.peek() === camera.config, "peek() and config read through the same selector to the same record reference");

      // It is a live read-through, not a value cached at construction: a later store mutation is reflected by a fresh peek().
      store.dispatch({ id: "c1", kind: "devicePatched", modelKey: "camera", patch: { name: "Back" } });
      assert.equal(camera.peek()?.name, "Back");
    });

    test("peek returns undefined once the device leaves the state, while config still throws", () => {

      const { ctx, store } = deviceFixture(makeBootstrap({ cameras: [makeCamera({ id: "c1", name: "Front" })] }));
      const camera = new Camera(ctx, "c1");

      store.dispatch({ id: "c1", kind: "deviceRemoved", modelKey: "camera" });

      // A removed device is an expected runtime condition for peek(): it reports the absence as undefined rather than throwing - the optional half of the read pair.
      assert.equal(camera.peek(), undefined, "peek() returns undefined for an absent record, it does not throw");

      // Regression: the asserting read is unchanged. config (and every getter built on it) still fails loudly with the subject-specific ReferenceError when absent.
      assert.throws(() => camera.config, ReferenceError, "config still throws when the record is absent - the assert/optional contract is preserved");
    });
  });

  describe("observe", () => {

    test("yields this projection on each change", async () => {

      const { ctx, store } = deviceFixture(makeBootstrap({ cameras: [makeCamera({ id: "c1", name: "Front" })] }));
      const camera = new Camera(ctx, "c1");
      const ac = new AbortController();
      const received: Camera[] = [];
      const done = (async (): Promise<void> => {

        for await (const updated of camera.observe({ signal: ac.signal })) {

          received.push(updated);
        }
      })();

      await delay(0);
      store.dispatch({ id: "c1", kind: "devicePatched", modelKey: "camera", patch: { name: "Back" } });

      await expectAt(() => received.length === 1);
      assert.ok(received[0] === camera, "observe yields the same live projection handle");
      assert.equal(received[0]?.name, "Back");

      ac.abort();
      await done;
    });
  });

  describe("commands are write-through", () => {

    test("snapshot fetches the JPEG bytes with the requested dimensions", async () => {

      const { ctx, mock } = deviceFixture(makeBootstrap({ cameras: [makeCamera({ id: "c1" })] }));
      const camera = new Camera(ctx, "c1");

      mock.pool.intercept({ method: "GET", path: "/proxy/protect/api/cameras/c1/snapshot", query: { h: "1080", w: "1920" } })
        .reply(200, Buffer.from("jpeg-bytes"), { headers: { "content-type": "image/jpeg" } });

      const image = await camera.snapshot({ height: 1080, width: 1920 });

      assert.ok(Buffer.isBuffer(image));
      assert.equal(image.toString("utf8"), "jpeg-bytes");
    });

    test("snapshot omits the size query when no dimensions are given", async () => {

      const { ctx, mock } = deviceFixture(makeBootstrap({ cameras: [makeCamera({ id: "c1" })] }));
      const camera = new Camera(ctx, "c1");

      // No query string when neither width nor height is supplied - the controller picks its default resolution.
      mock.pool.intercept({ method: "GET", path: "/proxy/protect/api/cameras/c1/snapshot" }).reply(200, Buffer.from("default-jpeg"));

      const image = await camera.snapshot();

      assert.equal(image.toString("utf8"), "default-jpeg");
    });

    test("a package snapshot targets the package-snapshot endpoint when the camera supports it", async () => {

      // A camera advertising hasPackageCamera takes the package-camera path: same w/h params, but the endpoint segment switches to /package-snapshot.
      const { ctx, mock } = deviceFixture(makeBootstrap({ cameras: [makeCamera({ featureFlags: { hasPackageCamera: true }, id: "c1" })] }));
      const camera = new Camera(ctx, "c1");

      mock.pool.intercept({ method: "GET", path: "/proxy/protect/api/cameras/c1/package-snapshot", query: { h: "720", w: "1280" } })
        .reply(200, Buffer.from("package-jpeg"), { headers: { "content-type": "image/jpeg" } });

      const image = await camera.snapshot({ height: 720, packageCamera: true, width: 1280 });

      assert.equal(image.toString("utf8"), "package-jpeg");
    });

    test("a package snapshot on a camera without a package sensor throws before issuing any request", async () => {

      // The default fixture camera has no hasPackageCamera flag, so the mandatory precondition must reject the call. We register an interceptor for the package-snapshot
      // endpoint precisely so we can prove it is never matched - the guard runs before any URL is built or any request dispatched.
      const { ctx, mock } = deviceFixture(makeBootstrap({ cameras: [makeCamera({ id: "c1", name: "Lobby" })] }));
      const camera = new Camera(ctx, "c1");

      mock.pool.intercept({ method: "GET", path: "/proxy/protect/api/cameras/c1/package-snapshot" }).reply(200, Buffer.from("should-never-be-sent"));

      await assert.rejects(camera.snapshot({ packageCamera: true }), (error: unknown) => {

        // It is the typed precondition error, and it classifies all the way up the hierarchy as fatal (non-retryable) - the device simply lacks the capability.
        assert.ok(error instanceof ProtectUnsupportedError, "throws the typed unsupported-operation error");
        assert.ok(error instanceof FatalError, "ProtectUnsupportedError is a FatalError");
        assert.ok(error instanceof ProtectError, "and a ProtectError");
        assert.equal(error.feature, "hasPackageCamera");

        return true;
      });

      // The interceptor was never consumed, so it remains pending - the transport issued no request at all. This is the pre-request guarantee made observable.
      assert.equal(mock.agent.pendingInterceptors().length, 1, "the capability guard must run before any transport request is issued");
    });

    test("lux reads the illuminance from the lux endpoint when the camera supports it", async () => {

      // A camera advertising hasLuxCheck can be queried for its live ambient-light reading; the method surfaces the JSON body's `illuminance` field as a number.
      const { ctx, mock } = deviceFixture(makeBootstrap({ cameras: [makeCamera({ featureFlags: { hasLuxCheck: true }, id: "c1" })] }));
      const camera = new Camera(ctx, "c1");
      let body: string | undefined;

      mock.pool.intercept({ method: "GET", path: "/proxy/protect/api/cameras/c1/lux" }).reply(200, (opts) => {

        body = opts.body as string | undefined;

        return JSON.stringify({ illuminance: 42.5 });
      }, { headers: { "content-type": "application/json" } });

      assert.equal(await camera.lux(), 42.5);

      // A GET query carries no request body - the shared dispatch primitive attaches one only for body-bearing methods - so the read path never sends a stray payload.
      assert.equal(body, undefined, "a GET query sends no request body");
    });

    test("lux throws a protocol error when a 2xx body carries no numeric illuminance", async () => {

      // The reading is lifted off the response and returned directly as a number, so a 2xx body lacking a numeric `illuminance` (a firmware shape change, an error-shaped
      // body) is a protocol violation surfaced at the boundary - never a fabricated default behind a lying return type. A non-numeric value would take the same path.
      const { ctx, mock } = deviceFixture(makeBootstrap({ cameras: [makeCamera({ featureFlags: { hasLuxCheck: true }, id: "c1" })] }));
      const camera = new Camera(ctx, "c1");

      mock.pool.intercept({ method: "GET", path: "/proxy/protect/api/cameras/c1/lux" })
        .reply(200, JSON.stringify({ notIlluminance: 7 }), { headers: { "content-type": "application/json" } });

      await assert.rejects(camera.lux(), (error: unknown) => {

        assert.ok(error instanceof ProtectProtocolError, "throws the typed protocol error");
        assert.ok(error instanceof FatalError, "ProtectProtocolError is a FatalError");
        assert.ok(error instanceof ProtectError, "and a ProtectError");

        return true;
      });
    });

    test("lux on a camera without an ambient-light sensor throws before issuing any request", async () => {

      // The default fixture camera has no hasLuxCheck flag, so the precondition must reject the call. We register an interceptor precisely to prove it is never matched.
      const { ctx, mock } = deviceFixture(makeBootstrap({ cameras: [makeCamera({ id: "c1", name: "Lobby" })] }));
      const camera = new Camera(ctx, "c1");

      mock.pool.intercept({ method: "GET", path: "/proxy/protect/api/cameras/c1/lux" }).reply(200, JSON.stringify({ illuminance: 0 }));

      await assert.rejects(camera.lux(), (error: unknown) => {

        assert.ok(error instanceof ProtectUnsupportedError, "throws the typed unsupported-operation error");
        assert.ok(error instanceof FatalError, "ProtectUnsupportedError is a FatalError");
        assert.ok(error instanceof ProtectError, "and a ProtectError");
        assert.equal(error.feature, "hasLuxCheck");

        return true;
      });

      // The interceptor was never consumed, so it remains pending - the guard ran before any transport request was issued.
      assert.equal(mock.agent.pendingInterceptors().length, 1, "the capability guard must run before any transport request is issued");
    });

    test("unlock POSTs to the unlock endpoint when the camera has a paired Access lock", async () => {

      // The unlock capability lives in the optional Access metadata block; a camera advertising supportUnlock can release its paired lock.
      const { ctx, mock } = deviceFixture(makeBootstrap({ cameras: [makeCamera({ accessDeviceMetadata: { featureFlags: { supportUnlock: true } }, id: "c1" })] }));
      const camera = new Camera(ctx, "c1");
      let body: string | undefined;
      let method: string | undefined;
      let path: string | undefined;

      mock.pool.intercept({ method: "POST", path: "/proxy/protect/api/cameras/c1/unlock" }).reply(200, (opts) => {

        body = opts.body as string;
        method = opts.method;
        path = opts.path;

        return "";
      });

      await camera.unlock();
      assert.equal(method, "POST");
      assert.equal(path, "/proxy/protect/api/cameras/c1/unlock");

      // A parameterless command carries the uniform empty-JSON body the shared dispatch primitive sends - the same wire shape reboot and play-buzzer use - so the body
      // convention has one definition across every device command rather than a per-command choice.
      assert.equal(body, "{}", "a parameterless command sends an empty JSON body");
    });

    test("unlock on a camera with no paired Access lock throws before issuing any request", async () => {

      // The default fixture camera has no accessDeviceMetadata at all, so the precondition must reject the call. The interceptor proves no request is issued.
      const { ctx, mock } = deviceFixture(makeBootstrap({ cameras: [makeCamera({ id: "c1", name: "Lobby" })] }));
      const camera = new Camera(ctx, "c1");

      mock.pool.intercept({ method: "POST", path: "/proxy/protect/api/cameras/c1/unlock" }).reply(200, "");

      await assert.rejects(camera.unlock(), (error: unknown) => {

        assert.ok(error instanceof ProtectUnsupportedError, "throws the typed unsupported-operation error");
        assert.ok(error instanceof FatalError, "ProtectUnsupportedError is a FatalError");
        assert.ok(error instanceof ProtectError, "and a ProtectError");
        assert.equal(error.feature, "supportUnlock");

        return true;
      });

      assert.equal(mock.agent.pendingInterceptors().length, 1, "the capability guard must run before any transport request is issued");
    });

    test("turnOnFlashlight POSTs to the flashlight endpoint when the camera has a package sensor", async () => {

      // A camera advertising hasPackageCamera carries the package downlight; the momentary activation POSTs to /turnon-flashlight.
      const { ctx, mock } = deviceFixture(makeBootstrap({ cameras: [makeCamera({ featureFlags: { hasPackageCamera: true }, id: "c1" })] }));
      const camera = new Camera(ctx, "c1");
      let body: string | undefined;
      let method: string | undefined;
      let path: string | undefined;

      mock.pool.intercept({ method: "POST", path: "/proxy/protect/api/cameras/c1/turnon-flashlight" }).reply(200, (opts) => {

        body = opts.body as string;
        method = opts.method;
        path = opts.path;

        return "";
      });

      await camera.turnOnFlashlight();
      assert.equal(method, "POST");
      assert.equal(path, "/proxy/protect/api/cameras/c1/turnon-flashlight");
      assert.equal(body, "{}", "the flashlight command sends the uniform empty-JSON body via the shared dispatch primitive");
    });

    test("turnOnFlashlight on a camera without a package sensor throws before issuing any request", async () => {

      // The default fixture camera has no hasPackageCamera flag, so the precondition must reject the call. The interceptor proves no request is issued.
      const { ctx, mock } = deviceFixture(makeBootstrap({ cameras: [makeCamera({ id: "c1", name: "Lobby" })] }));
      const camera = new Camera(ctx, "c1");

      mock.pool.intercept({ method: "POST", path: "/proxy/protect/api/cameras/c1/turnon-flashlight" }).reply(200, "");

      await assert.rejects(camera.turnOnFlashlight(), (error: unknown) => {

        assert.ok(error instanceof ProtectUnsupportedError, "throws the typed unsupported-operation error");
        assert.ok(error instanceof FatalError, "ProtectUnsupportedError is a FatalError");
        assert.ok(error instanceof ProtectError, "and a ProtectError");
        assert.equal(error.feature, "hasPackageCamera");

        return true;
      });

      assert.equal(mock.agent.pendingInterceptors().length, 1, "the capability guard must run before any transport request is issued");
    });

    test("talkback on a camera without a speaker throws before any negotiation request is issued", async () => {

      // The default fixture camera carries no hasSpeaker flag, so the capability guard must reject before the talkback factory negotiates. We register an interceptor on
      // the talkback negotiation endpoint precisely to prove it is never matched - the guard is pre-negotiation, the package-snapshot precedent applied to two-way audio.
      const { ctx, mock } = deviceFixture(makeBootstrap({ cameras: [makeCamera({ id: "c1", name: "Lobby" })] }));
      const camera = new Camera(ctx, "c1");

      mock.pool.intercept({ method: "GET", path: (path) => path.startsWith("/proxy/protect/api/ws/talkback") }).reply(200, { url: "wss://internal/talkback" });

      await assert.rejects(camera.talkback(), (error: unknown) => {

        assert.ok(error instanceof ProtectUnsupportedError, "throws the typed unsupported-operation error");
        assert.ok(error instanceof FatalError, "ProtectUnsupportedError is a FatalError");
        assert.ok(error instanceof ProtectError, "and a ProtectError");
        assert.equal(error.feature, "hasSpeaker");

        return true;
      });

      assert.equal(mock.agent.pendingInterceptors().length, 1, "the capability guard must run before any negotiation request is issued");
    });

    test("talkback on a camera with a speaker delegates to the context factory with the camera id and signal", async () => {

      // With the speaker present the guard passes and the projection delegates to the composition-root-bound talkback factory, passing only its own id and the signal -
      // Layer 3 holds no WebSocket wire knowledge. We use a real store (so the config read-through guard sees hasSpeaker) and a capturing factory (so no socket is
      // opened).
      const store = new StateStore({ clock: fakeClock(), refresh: () => Promise.reject(new Error("unused")), refreshIntervalMs: false });

      store.dispatch({ data: makeBootstrap({ cameras: [makeCamera({ featureFlags: { hasSpeaker: true }, id: "c1", name: "Front" })] }), kind: "bootstrapLoaded" });

      const fakeSession = {} as unknown as TalkbackSession;
      const controller = new AbortController();
      let captured: { opts?: { signal?: AbortSignal }; params: { cameraId: string } } | null = null;
      const ctx = {

        host: "10.0.0.1",
        livestreamPool: {},
        log: silentLog(),
        store,
        talkback: (params: { cameraId: string }, opts?: { signal?: AbortSignal }): Promise<TalkbackSession> => {

          captured = { opts, params };

          return Promise.resolve(fakeSession);
        },
        transport: {}
      } as unknown as DeviceContext;

      const camera = new Camera(ctx, "c1");
      const session = await camera.talkback({ signal: controller.signal });

      assert.equal(session, fakeSession);
      assert.ok(captured !== null);
      assert.deepEqual((captured as { params: { cameraId: string } }).params, { cameraId: "c1" });
      assert.equal((captured as { opts?: { signal?: AbortSignal } }).opts?.signal, controller.signal);
    });

    test("update PATCHes the device endpoint and does not fold the response into the store", async () => {

      const { ctx, mock } = deviceFixture(makeBootstrap({ cameras: [makeCamera({ id: "c1", name: "Front" })] }));
      const camera = new Camera(ctx, "c1");
      let sentBody: string | undefined;

      mock.pool.intercept({ method: "PATCH", path: "/proxy/protect/api/cameras/c1" }).reply(200, (opts) => {

        sentBody = opts.body as string;

        // The controller echoes the renamed device. Per the write-through contract this response must be ignored by the store.
        return JSON.stringify({ id: "c1", modelKey: "camera", name: "Renamed" });
      });

      const result = await camera.update({ name: "Renamed" });

      assert.ok(result === camera, "update returns the same live handle");
      assert.deepEqual(JSON.parse(sentBody ?? ""), { name: "Renamed" });
      // The store was never told about the change, so the projection still reads the pre-command value - state advances only via the stream/refresh.
      assert.equal(camera.name, "Front", "a command response must not mutate the store");
    });

    test("update surfaces an authorization failure as a typed error", async () => {

      const { ctx, mock } = deviceFixture(makeBootstrap({ cameras: [makeCamera({ id: "c1" })] }));
      const camera = new Camera(ctx, "c1");

      mock.pool.intercept({ method: "PATCH", path: "/proxy/protect/api/cameras/c1" }).reply(403, "forbidden");

      await assert.rejects(camera.update({ name: "X" }), ProtectAuthorizationError);
    });

    test("reboot POSTs to the device reboot endpoint", async () => {

      const { ctx, mock } = deviceFixture(makeBootstrap({ cameras: [makeCamera({ id: "c1" })] }));
      const camera = new Camera(ctx, "c1");
      let method: string | undefined;

      mock.pool.intercept({ method: "POST", path: "/proxy/protect/api/cameras/c1/reboot" }).reply(200, (opts) => {

        method = opts.method;

        return "";
      });

      await camera.reboot();
      assert.equal(method, "POST");
    });

    test("reboot is shared base behavior - a non-camera device POSTs to its own reboot endpoint", async () => {

      const { ctx, mock } = deviceFixture(makeBootstrap({ lights: [makeLight({ id: "l1" })] }));
      const light = new Light(ctx, "l1");
      let path: string | undefined;

      mock.pool.intercept({ method: "POST", path: "/proxy/protect/api/lights/l1/reboot" }).reply(200, (opts) => {

        path = opts.path;

        return "";
      });

      await light.reboot();
      assert.equal(path, "/proxy/protect/api/lights/l1/reboot");
    });

    test("a command threads the caller's abort signal, so an in-flight call cancels as a ProtectAbortedError", async () => {

      // Cancellation is a property of the shared dispatch primitive, not of any single command: dispatch threads opts.signal down to transport.send, which composes it
      // with its own deadline. We exercise the threading through reboot (the simplest parameterless command) - if dispatch dropped the signal, the abort below could
      // never reach the in-flight request and the call would not reject. Holding the reply open and then aborting the caller's controller mid-flight must surface the
      // typed caller-cancel error, and ProtectAbortedError *specifically* (not the deadline's ProtectTimeoutError) is the exact proof that the caller's signal reached
      // the transport - the classifier returns ProtectAbortedError only when the caller's signal is the one that fired, so this also pins that dispatch threaded it.
      const { ctx, mock } = deviceFixture(makeBootstrap({ cameras: [makeCamera({ id: "c1" })] }));
      const camera = new Camera(ctx, "c1");
      const controller = new AbortController();

      // Hold the reboot response open so the request is genuinely in flight when the caller aborts; the 2000 ms delay never elapses, since the abort rejects first.
      mock.pool.intercept({ method: "POST", path: "/proxy/protect/api/cameras/c1/reboot" }).reply(200, "").delay(2000);

      const pending = camera.reboot({ signal: controller.signal });

      controller.abort();
      await assert.rejects(pending, ProtectAbortedError);
    });

    test("a non-camera projection PATCHes its own collection endpoint", async () => {

      const { ctx, mock } = deviceFixture(makeBootstrap({ lights: [makeLight({ id: "l1", name: "Drive" })] }));
      const light = new Light(ctx, "l1");
      let path: string | undefined;

      mock.pool.intercept({ method: "PATCH", path: "/proxy/protect/api/lights/l1" }).reply(200, (opts) => {

        path = opts.path;

        return JSON.stringify({ id: "l1", modelKey: "light" });
      });

      await light.update({ name: "Driveway" });
      assert.equal(path, "/proxy/protect/api/lights/l1");
    });
  });

  describe("chime play commands", () => {

    test("playSpeaker posts an empty payload to the play-speaker endpoint by default", async () => {

      // With no options the controller plays the chime's default ringtone, so the payload is an empty object - the method sends only the fields the caller gives.
      const { ctx, mock } = deviceFixture(makeBootstrap({ chimes: [makeChime({ id: "ch1" })] }));
      const chime = new Chime(ctx, "ch1");
      let body: string | undefined;
      let method: string | undefined;

      mock.pool.intercept({ method: "POST", path: "/proxy/protect/api/chimes/ch1/play-speaker" }).reply(200, (opts) => {

        body = opts.body as string;
        method = opts.method;

        return "";
      });

      await chime.playSpeaker();
      assert.equal(method, "POST");
      assert.deepEqual(JSON.parse(body ?? ""), {});
    });

    test("playSpeaker sends only the supplied fields, mapping 1:1 to the endpoint payload", async () => {

      // A specific ringtone selection with playback overrides; the body carries exactly those three fields and nothing else (no ringSettings lookup in the library).
      const { ctx, mock } = deviceFixture(makeBootstrap({ chimes: [makeChime({ id: "ch1" })] }));
      const chime = new Chime(ctx, "ch1");
      let body: string | undefined;

      mock.pool.intercept({ method: "POST", path: "/proxy/protect/api/chimes/ch1/play-speaker" }).reply(200, (opts) => {

        body = opts.body as string;

        return "";
      });

      await chime.playSpeaker({ repeatTimes: 2, ringtoneId: "tone-7", volume: 80 });
      assert.deepEqual(JSON.parse(body ?? ""), { repeatTimes: 2, ringtoneId: "tone-7", volume: 80 });
    });

    test("playSpeaker surfaces a controller rejection of an unknown ringtone as a typed error", async () => {

      // The library does not validate the ringtoneId against the controller's ringtone list - the controller is the single source of truth, and a rejection classifies
      // through the same ensureOk path as any other command.
      const { ctx, mock } = deviceFixture(makeBootstrap({ chimes: [makeChime({ id: "ch1" })] }));
      const chime = new Chime(ctx, "ch1");

      mock.pool.intercept({ method: "POST", path: "/proxy/protect/api/chimes/ch1/play-speaker" }).reply(400, "unknown ringtone");

      await assert.rejects(chime.playSpeaker({ ringtoneId: "does-not-exist" }), ProtectRequestError);
    });

    test("playBuzzer posts to the play-buzzer endpoint", async () => {

      // The buzzer takes no parameters - a distinct endpoint from the speaker, hence a distinct method.
      const { ctx, mock } = deviceFixture(makeBootstrap({ chimes: [makeChime({ id: "ch1" })] }));
      const chime = new Chime(ctx, "ch1");
      let method: string | undefined;
      let path: string | undefined;

      mock.pool.intercept({ method: "POST", path: "/proxy/protect/api/chimes/ch1/play-buzzer" }).reply(200, (opts) => {

        method = opts.method;
        path = opts.path;

        return "";
      });

      await chime.playBuzzer();
      assert.equal(method, "POST");
      assert.equal(path, "/proxy/protect/api/chimes/ch1/play-buzzer");
    });
  });

  describe("relay output commands", () => {

    test("the registry constructs a Relay that reads its identity, name, and liveness", () => {

      const { ctx, store } = deviceFixture(makeBootstrap({ relays: [makeRelay({ id: "r1", name: "Garage", state: "CONNECTED" })] }));
      const relay = new DeviceRegistry(ctx).relay("r1");

      assert.ok(relay !== undefined, "the registry resolves a bootstrapped relay");
      assert.equal(relay.modelKey, "relay");
      assert.equal(relay.name, "Garage");
      assert.equal(relay.isOnline, true);

      // A live view, not a snapshot: a realtime state change is reflected by the held handle.
      store.dispatch({ id: "r1", kind: "devicePatched", modelKey: "relay", patch: { state: "DISCONNECTED" } });
      assert.equal(relay.isOnline, false);
    });

    test("toggleOutput POSTs an empty body to the per-output activate endpoint", async () => {

      const { ctx, mock } = deviceFixture(makeBootstrap({ relays: [makeRelay({ id: "r1" })] }));
      const relay = new Relay(ctx, "r1");
      let body: string | undefined;
      let method: string | undefined;
      let path: string | undefined;

      mock.pool.intercept({ method: "POST", path: "/proxy/protect/api/relays/r1/outputs/0/activate" }).reply(200, (opts) => {

        body = opts.body as string;
        method = opts.method;
        path = opts.path;

        return "";
      });

      await relay.toggleOutput(0);
      assert.equal(method, "POST");
      assert.equal(path, "/proxy/protect/api/relays/r1/outputs/0/activate");
      assert.equal(body, "{}", "a parameterless command sends the uniform empty-JSON body via the shared dispatch primitive");
    });

    test("update PATCHes a nested field and a realtime patch deep-merges it, preserving siblings", async () => {

      const { ctx, mock, store } = deviceFixture(makeBootstrap({ relays: [makeRelay({ id: "r1",
        wirelessConnectionSettings: { loraSpreadingFactor: 7, updateInterval: 300 } })] }));
      const relay = new Relay(ctx, "r1");
      let sentBody: string | undefined;

      mock.pool.intercept({ method: "PATCH", path: "/proxy/protect/api/relays/r1" }).reply(200, (opts) => {

        sentBody = opts.body as string;

        return JSON.stringify({ id: "r1", modelKey: "relay" });
      });

      // The PATCH carries the nested object verbatim - the device-command write path does not flatten it - and is write-through, so the store is unchanged afterward.
      await relay.update({ ledSettings: { isEnabled: false } });
      assert.deepEqual(JSON.parse(sentBody ?? ""), { ledSettings: { isEnabled: false } });

      // A realtime patch of one field inside a nested object deep-merges it: the patched field changes and its unpatched sibling survives the reducer's structural fold.
      store.dispatch({ id: "r1", kind: "devicePatched", modelKey: "relay", patch: { wirelessConnectionSettings: { loraSpreadingFactor: 9 } } });
      assert.equal(relay.config.wirelessConnectionSettings.loraSpreadingFactor, 9);
      assert.equal(relay.config.wirelessConnectionSettings.updateInterval, 300, "the unpatched sibling survives the deep-merge");
    });
  });

  describe("Fob projection", () => {

    test("the registry constructs a Fob that reads its identity, name, and liveness, tracking realtime state changes", () => {

      const { ctx, store } = deviceFixture(makeBootstrap({ fobs: [makeFob({ id: "f1", name: "Keyfob", state: "CONNECTED" })] }));
      const fob = new DeviceRegistry(ctx).fob("f1");

      assert.ok(fob !== undefined, "the registry resolves a bootstrapped fob");
      assert.equal(fob.modelKey, "fob");
      assert.equal(fob.name, "Keyfob");
      assert.equal(fob.isOnline, true);

      // A live view, not a snapshot: a realtime patch of a fob-specific field is reflected by the held handle.
      store.dispatch({ id: "f1", kind: "devicePatched", modelKey: "fob", patch: { awayState: "AWAY" } });
      assert.equal(fob.config.awayState, "AWAY");
    });

    test("reboot POSTs to the fob's own endpoint - the fob DeviceModelKey endpoint wiring", async () => {

      const { ctx, mock } = deviceFixture(makeBootstrap({ fobs: [makeFob({ id: "f1" })] }));
      const fob = new Fob(ctx, "f1");
      let path: string | undefined;

      mock.pool.intercept({ method: "POST", path: "/proxy/protect/api/fobs/f1/reboot" }).reply(200, (opts) => {

        path = opts.path;

        return "";
      });

      await fob.reboot();
      assert.equal(path, "/proxy/protect/api/fobs/f1/reboot");
    });
  });
});

describe("Nvr projection", () => {

  test("read-through getters reflect the current NVR state", () => {

    const { ctx } = deviceFixture(makeBootstrap({ nvr: makeNvr({ host: "10.0.0.9", marketName: "UDM Pro", name: "Front Office", ports: { rtsp: 7447 } }) }));
    const nvr = new Nvr(ctx);

    assert.equal(nvr.host, "10.0.0.9");
    assert.equal(nvr.rtspPort, 7447);
    assert.equal(nvr.name, "Front Office");
    assert.equal(nvr.marketName, "UDM Pro");
    assert.equal(nvr.config.host, "10.0.0.9");
  });

  test("a held handle reflects later NVR mutations (it is a live view, not a snapshot)", () => {

    const { ctx, store } = deviceFixture(makeBootstrap({ nvr: makeNvr({ name: "Old Name" }) }));
    const nvr = new Nvr(ctx);

    store.dispatch({ id: "nvr-1", kind: "devicePatched", modelKey: "nvr", patch: { name: "New Name" } });

    assert.equal(nvr.name, "New Name");
  });

  test("name falls back to marketName when the controller is unnamed; the raw name stays in config", () => {

    const { ctx } = deviceFixture(makeBootstrap({ nvr: makeNvr({ name: undefined }) }));
    const nvr = new Nvr(ctx);

    // `.name` is the cooked display label, like every device projection's `.name` - the user name, else the always-present marketName. The raw, unset user name is still
    // reachable through the config escape hatch, for a consumer that needs the "was it explicitly named?" distinction.
    assert.equal(nvr.name, "UDM Pro");
    assert.equal(nvr.marketName, "UDM Pro");
    assert.equal(nvr.config.name, undefined, "the raw user-assigned name remains unset and reachable via config");
  });

  test("getters throw before the first bootstrap (the NVR is not yet known)", () => {

    // A store with no bootstrap dispatched: state.nvr is still null, so the absent-record guard must fire rather than return an empty object. A connected client never
    // reaches this, since connect() awaits the bootstrap - but the contract is defined and tested.
    const store = new StateStore({ clock: fakeClock(), refresh: () => Promise.reject(new Error("unused")), refreshIntervalMs: false });
    const livestreamPool = new LivestreamPool({ clock: fakeClock(), log: silentLog(), resolveUrl: () => Promise.reject(new Error("unused")) });
    const ctx: DeviceContext = { host: "127.0.0.1", livestreamPool, log: silentLog(), store, talkback: () => Promise.reject(new Error("unused")),
      transport: makeMockTransport().transport };
    const nvr = new Nvr(ctx);

    assert.throws(() => nvr.host, ReferenceError, "a pre-bootstrap NVR read must throw, not return an empty record");
    assert.throws(() => nvr.config, ReferenceError);
  });

  test("peek returns the config when present and undefined before the first bootstrap, where config throws", () => {

    // Present: the singleton's inherited peek() reads through to the live NVR record and resolves the same reference config does - peek() is a Projection-base method, so
    // the read pair holds identically for the NVR singleton and the device projections.
    const present = deviceFixture(makeBootstrap({ nvr: makeNvr({ name: "Front Office" }) }));
    const nvr = new Nvr(present.ctx);

    assert.equal(nvr.peek()?.name, "Front Office");
    assert.ok(nvr.peek() === nvr.config, "peek() and config resolve the same singleton record");

    // Pre-bootstrap: state.nvr is still null - the singleton's own absent-record condition, mapped to undefined by the bound selector. peek() reports it as undefined (no
    // throw) while config throws, exactly as a removed device behaves for a device projection.
    const store = new StateStore({ clock: fakeClock(), refresh: () => Promise.reject(new Error("unused")), refreshIntervalMs: false });
    const livestreamPool = new LivestreamPool({ clock: fakeClock(), log: silentLog(), resolveUrl: () => Promise.reject(new Error("unused")) });
    const ctx: DeviceContext = { host: "127.0.0.1", livestreamPool, log: silentLog(), store, talkback: () => Promise.reject(new Error("unused")),
      transport: makeMockTransport().transport };
    const preBootstrap = new Nvr(ctx);

    assert.equal(preBootstrap.peek(), undefined, "peek() returns undefined before the first bootstrap, it does not throw");
    assert.throws(() => preBootstrap.config, ReferenceError);
  });

  test("observe yields on an NVR change and stays silent on unrelated dispatches", async () => {

    const { ctx, store } = deviceFixture(makeBootstrap({ cameras: [makeCamera({ id: "c1" })], nvr: makeNvr({ name: "A" }) }));
    const nvr = new Nvr(ctx);
    const ac = new AbortController();
    const received: Nvr[] = [];
    const done = (async (): Promise<void> => {

      for await (const updated of nvr.observe({ signal: ac.signal })) {

        received.push(updated);
      }
    })();

    await delay(0);

    // An unrelated device change must not wake an NVR observer - the selector dedups on the nvr record reference, which a camera patch leaves untouched.
    store.dispatch({ id: "c1", kind: "devicePatched", modelKey: "camera", patch: { name: "Renamed" } });
    await delay(0);
    assert.equal(received.length, 0, "a camera change must not yield to an NVR observer");

    // A real NVR change wakes it exactly once, and the yielded handle re-reads the new value.
    store.dispatch({ id: "nvr-1", kind: "devicePatched", modelKey: "nvr", patch: { name: "B" } });
    await expectAt(() => received.length === 1);
    assert.ok(received[0] === nvr, "observe yields the same live projection handle");
    assert.equal(received[0]?.name, "B");

    ac.abort();
    await done;
  });

  test("exposes no commands - it is a read-only projection, not a device projection", () => {

    const { ctx } = deviceFixture(makeBootstrap());
    const nvr = new Nvr(ctx);

    // The base-class split is the architectural guarantee here: Nvr extends the read-only Projection core, so it bears neither update nor reboot. A shape assertion pins
    // that the command surface never leaks onto the singleton (controller reboot is client.reboot(); NVR config writes are out of scope).
    const surface = nvr as unknown as Record<string, unknown>;

    assert.equal(typeof surface["update"], "undefined", "Nvr must not expose update");
    assert.equal(typeof surface["reboot"], "undefined", "Nvr must not expose reboot");
    assert.ok(!("id" in nvr), "the NVR singleton has no id");
  });
});
