/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * client.test.ts: Integration tests for ProtectClient.connect() - the atomic login+bootstrap factory, the projection surface over a real bootstrap, the typed-error
 * mapping for each failure stage, the Disposable event subscription, and clean teardown. Driven against an undici MockAgent.
 */
import { ProtectAuthError, ProtectBootstrapError, ProtectNetworkError, ProtectProtocolError } from "../errors.ts";
import { buildPacket, jsonActionFrame, jsonDataFrame, makeActionHeader } from "../protocol/packet.helpers.ts";
import { describe, test } from "node:test";
import { expectAt, fakeClock, silentLog } from "../testing.helpers.ts";
import { makeBootstrap, makeCamera, makeChime, makeLight, makeLiveview, makeNvr, makeRelay, makeRingtone, makeSensor, makeUser,
  makeViewer } from "../fixtures.helpers.ts";
import { FakeWebSocket } from "../transport/events-stream.helpers.ts";
import type { Interceptable } from "undici";
import { MockAgent } from "undici";
import { PROTECT_RECOVERY_BACKOFF_KNOWN_MS } from "../settings.ts";
import { ProtectClient } from "./client.ts";
import type { RawPacket } from "../protocol/packet.ts";
import type { TypedEvent } from "../protocol/events.ts";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

const HOST = "10.0.0.1";
const LOGIN_PATH = "/api/auth/login";
const BOOTSTRAP_PATH = "/proxy/protect/api/bootstrap";

// A MockAgent bound to the controller origin, with net connections disabled so any unmocked request fails loudly.
function mockController(): { agent: MockAgent; pool: Interceptable } {

  const agent = new MockAgent();

  agent.disableNetConnect();

  return { agent, pool: agent.get("https://" + HOST) };
}

// Stub a successful UniFi OS login on the pool.
function interceptLogin(pool: Interceptable): void {

  pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(200, "", { headers: { "set-cookie": "TOKEN=abc", "x-csrf-token": "csrf1" } });
}

// Connect with the test defaults: the injected mock dispatcher, an injected fake events WebSocket (which auto-opens so the atomic connect completes without a live
// controller), the failsafe disabled (tests drive state explicitly), and a silent logger.
function connect(agent: MockAgent): Promise<ProtectClient> {

  return ProtectClient.connect({ dispatcher: agent, host: HOST, log: silentLog(), password: "p", refreshIntervalMs: false, username: "u",
    webSocket: () => new FakeWebSocket() });
}

// Connect while capturing the fake events WebSocket the factory builds, so a test can drive realtime frames into the live client.
async function connectCapturing(agent: MockAgent): Promise<{ client: ProtectClient; ws: FakeWebSocket }> {

  let ws: FakeWebSocket | undefined;
  const client = await ProtectClient.connect({ dispatcher: agent, host: HOST, log: silentLog(), password: "p", refreshIntervalMs: false, username: "u",
    webSocket: () => (ws = new FakeWebSocket()) });

  assert.ok(ws !== undefined, "the events WebSocket factory must have been invoked during connect");

  return { client, ws };
}

// Encode a realtime packet the way the controller's WebSocket frames one - an action header plus a JSON data payload.
function encode(header: Partial<{ action: string; id: string; modelKey: string }>, payload: object): Buffer {

  return buildPacket(jsonActionFrame(makeActionHeader(header)), jsonDataFrame(payload));
}

describe("ProtectClient.connect", () => {

  describe("success", () => {

    test("returns a ready client whose projections reflect the bootstrap", async () => {

      const { agent, pool } = mockController();

      interceptLogin(pool);
      pool.intercept({ method: "GET", path: BOOTSTRAP_PATH })
        .reply(200, makeBootstrap({ cameras: [ makeCamera({ id: "c1", name: "Front" }), makeCamera({ id: "c2", name: "Back" }) ] }));

      await using client = await connect(agent);

      assert.equal(client.state.snapshot().bootstrapId, 1);
      assert.deepEqual(client.cameras.map((camera) => camera.id).sort(), [ "c1", "c2" ]);
      assert.equal(client.camera("c1")?.name, "Front");
      assert.equal(client.camera("missing"), undefined, "a lookup for an absent id returns undefined");
    });

    test("exposes every device collection and typed lookup", async () => {

      const { agent, pool } = mockController();

      interceptLogin(pool);
      pool.intercept({ method: "GET", path: BOOTSTRAP_PATH }).reply(200, makeBootstrap({

        cameras: [makeCamera({ id: "c1" })],
        chimes: [makeChime({ id: "ch1" })],
        lights: [makeLight({ id: "l1" })],
        relays: [makeRelay({ id: "r1" })],
        sensors: [makeSensor({ id: "s1" })],
        viewers: [makeViewer({ id: "v1" })]
      }));

      await using client = await connect(agent);

      // Every collection getter returns its projections, and every typed lookup resolves its own device - exercising the registry and every projection constructor.
      assert.deepEqual([ client.cameras.length, client.chimes.length, client.lights.length, client.relays.length, client.sensors.length, client.viewers.length ],
        [ 1, 1, 1, 1, 1, 1 ]);
      assert.equal(client.camera("c1")?.modelKey, "camera");
      assert.equal(client.chime("ch1")?.modelKey, "chime");
      assert.equal(client.light("l1")?.modelKey, "light");
      assert.equal(client.relay("r1")?.modelKey, "relay");
      assert.equal(client.sensor("s1")?.modelKey, "sensor");
      assert.equal(client.viewer("v1")?.modelKey, "viewer");
      assert.equal(client.light("missing"), undefined);
    });

    test("exposes the data layer and the transport escape hatch", async () => {

      const { agent, pool } = mockController();

      interceptLogin(pool);
      pool.intercept({ method: "GET", path: BOOTSTRAP_PATH }).reply(200, makeBootstrap());

      await using client = await connect(agent);

      // `state` is the data layer and `transport` is the documented raw-call escape hatch; both must be reachable on the public surface.
      assert.equal(client.state.snapshot().bootstrapId, 1);
      assert.ok(client.transport, "the transport escape hatch must be exposed");
    });

    test("the refresh failsafe re-fetches the bootstrap on schedule", async () => {

      const { agent, pool } = mockController();
      const clock = fakeClock();

      interceptLogin(pool);
      // The initial bootstrap has one camera; the next scheduled refresh returns two, exercising the client's transport-backed refresh seam end to end.
      pool.intercept({ method: "GET", path: BOOTSTRAP_PATH }).reply(200, makeBootstrap({ cameras: [makeCamera({ id: "c1" })] }));
      pool.intercept({ method: "GET", path: BOOTSTRAP_PATH }).reply(200, makeBootstrap({ cameras: [ makeCamera({ id: "c1" }), makeCamera({ id: "c2" }) ] }));

      await using client = await ProtectClient.connect({ clock, dispatcher: agent, host: HOST, log: silentLog(), password: "p", refreshIntervalMs: 1000, username: "u",
        webSocket: () => new FakeWebSocket() });

      assert.equal(client.cameras.length, 1);

      await clock.tick();
      await expectAt(() => client.cameras.length === 2);
    });
  });

  describe("atomicity - failures are typed and leave no client", () => {

    test("bad credentials reject with ProtectAuthError", async () => {

      const { agent, pool } = mockController();

      // The login is rejected and the CSRF-fetch fallback also fails, so the handshake cannot complete.
      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(401, "bad");
      pool.intercept({ method: "GET", path: "/" }).reply(500, "unavailable");

      await assert.rejects(connect(agent), ProtectAuthError);
    });

    test("a non-2xx bootstrap rejects with ProtectBootstrapError at the fetch stage", async () => {

      const { agent, pool } = mockController();

      interceptLogin(pool);
      pool.intercept({ method: "GET", path: BOOTSTRAP_PATH }).reply(500, "boom");

      await assert.rejects(connect(agent), (error: unknown) => {

        assert.ok(error instanceof ProtectBootstrapError);
        assert.equal(error.stage, "fetch");

        return true;
      });
    });

    test("a malformed bootstrap body rejects with ProtectBootstrapError at the parse stage", async () => {

      const { agent, pool } = mockController();

      interceptLogin(pool);
      pool.intercept({ method: "GET", path: BOOTSTRAP_PATH }).reply(200, "not-json{", { headers: { "content-type": "application/json" } });

      await assert.rejects(connect(agent), (error: unknown) => {

        assert.ok(error instanceof ProtectBootstrapError);
        assert.equal(error.stage, "parse");

        return true;
      });
    });
  });

  describe("event subscription and teardown", () => {

    test("on() returns an idempotent Disposable", async () => {

      const { agent, pool } = mockController();

      interceptLogin(pool);
      pool.intercept({ method: "GET", path: BOOTSTRAP_PATH }).reply(200, makeBootstrap());

      await using client = await connect(agent);
      const sub = client.on("packet", () => { /* no-op listener; nothing emits in this phase. */ });

      assert.equal(typeof sub[Symbol.dispose], "function");

      // Disposal must be safe and idempotent - the second dispose is a no-op.
      sub[Symbol.dispose]();
      sub[Symbol.dispose]();
    });

    test("once rejects when its signal aborts and stream terminates on abort", async () => {

      const { agent, pool } = mockController();

      interceptLogin(pool);
      pool.intercept({ method: "GET", path: BOOTSTRAP_PATH }).reply(200, makeBootstrap());

      await using client = await connect(agent);

      // once() is the one-shot rail: an aborted wait rejects rather than hanging.
      const onceAc = new AbortController();
      const pending = client.once("packet", { signal: onceAc.signal });

      onceAc.abort();
      await assert.rejects(pending);

      // stream() is the async-iterable rail: aborting its signal rejects the pending iteration with the abort reason - the raw rail's contract, unlike the smoothed
      // events()/rawPackets() sugar - delivering no emissions.
      const streamAc = new AbortController();
      const received: unknown[] = [];

      streamAc.abort();

      try {

        for await (const value of client.stream("packet", { signal: streamAc.signal })) {

          received.push(value);
        }
      } catch {

        // node:events surfaces the pre-abort as a thrown abort error on first iteration; either way nothing is delivered.
      }

      assert.equal(received.length, 0);
    });

    test("disposal tears the client down cleanly", async () => {

      const { agent, pool } = mockController();

      interceptLogin(pool);
      pool.intercept({ method: "GET", path: BOOTSTRAP_PATH }).reply(200, makeBootstrap({ cameras: [makeCamera({ id: "c1" })] }));

      const client = await connect(agent);

      // Disposing twice must not throw - the events stream, store, session, and transport teardown are each idempotent.
      await client[Symbol.asyncDispose]();
      await client[Symbol.asyncDispose]();
    });
  });

  describe("realtime events bridge", () => {

    test("a realtime packet advances the store and reaches the firehose from one decode", async () => {

      const { agent, pool } = mockController();

      interceptLogin(pool);
      pool.intercept({ method: "GET", path: BOOTSTRAP_PATH }).reply(200, makeBootstrap({ cameras: [makeCamera({ id: "c1", name: "Front" })] }));

      const { client, ws } = await connectCapturing(agent);
      const firehose: TypedEvent[] = [];

      client.on("packet", (event) => void firehose.push(event));

      // One frame in: the store advances (the projection reads the new name) and the same event reaches the firehose - both from the single decode site.
      ws.emitMessage(encode({ action: "update", id: "c1", modelKey: "camera" }, { name: "Renamed" }));

      assert.equal(client.camera("c1")?.name, "Renamed", "the store advanced from the realtime packet");
      assert.equal(firehose.length, 1);
      assert.equal(firehose[0]?.kind, "devicePatched");

      await client[Symbol.asyncDispose]();
    });

    test("client.events() yields the firehose and ends cleanly on abort", async () => {

      const { agent, pool } = mockController();

      interceptLogin(pool);
      pool.intercept({ method: "GET", path: BOOTSTRAP_PATH }).reply(200, makeBootstrap({ cameras: [makeCamera({ id: "c1" })] }));

      const { client, ws } = await connectCapturing(agent);
      const controller = new AbortController();
      const collected: TypedEvent[] = [];
      const task = (async (): Promise<void> => {

        for await (const event of client.events({ signal: controller.signal })) {

          collected.push(event);
        }
      })();

      ws.emitMessage(encode({ action: "add", id: "c2", modelKey: "camera" }, { id: "c2" }));
      await expectAt(() => collected.length === 1);

      // Aborting the firehose ends the iteration cleanly - no thrown abort the consumer must catch.
      controller.abort();
      await task;

      assert.equal(collected.length, 1);
      assert.equal(collected[0]?.kind, "deviceAdded");

      await client[Symbol.asyncDispose]();
    });

    test("client.rawPackets() yields every decoded frame (unmodeled included) and ends cleanly on abort", async () => {

      const { agent, pool } = mockController();

      interceptLogin(pool);
      pool.intercept({ method: "GET", path: BOOTSTRAP_PATH }).reply(200, makeBootstrap({ cameras: [makeCamera({ id: "c1" })] }));

      const { client, ws } = await connectCapturing(agent);
      const controller = new AbortController();
      const raw: RawPacket[] = [];
      const task = (async (): Promise<void> => {

        for await (const packet of client.rawPackets({ signal: controller.signal })) {

          raw.push(packet);
        }
      })();

      // A modeled frame and an unmodeled one (garage is not a known modelKey): the typed firehose would drop the latter, the raw firehose carries both.
      ws.emitMessage(encode({ action: "update", id: "c1", modelKey: "camera" }, { name: "Renamed" }));
      ws.emitMessage(encode({ action: "add", id: "g1", modelKey: "garage" }, { id: "g1" }));
      await expectAt(() => raw.length === 2);

      // Aborting ends the iteration cleanly, exactly like client.events().
      controller.abort();
      await task;

      assert.equal(raw.length, 2);
      assert.equal(raw[0]?.header.modelKey, "camera");
      assert.equal(raw[1]?.header.modelKey, "garage");
      assert.deepEqual(raw[1]?.payload, { id: "g1" });

      await client[Symbol.asyncDispose]();
    });

    test("client.fetchBootstrap() returns the raw controller JSON without dispatching it into state", async () => {

      const { agent, pool } = mockController();

      interceptLogin(pool);

      // The connect-time bootstrap seeds the store with one camera.
      pool.intercept({ method: "GET", path: BOOTSTRAP_PATH }).reply(200, makeBootstrap({ cameras: [makeCamera({ id: "c1" })] }));

      await using client = await connect(agent);

      // A distinct, larger payload for the explicit fetch. fetchBootstrap must return it verbatim but must NOT dispatch it - the store stays at its connect-time shape.
      pool.intercept({ method: "GET", path: BOOTSTRAP_PATH }).reply(200, makeBootstrap({ cameras: [ makeCamera({ id: "c1" }), makeCamera({ id: "c2" }) ] }));

      const bootstrap = await client.fetchBootstrap() as { cameras: unknown[] };

      // The returned JSON reflects the fresh fetch (two cameras)...
      assert.equal(bootstrap.cameras.length, 2);

      // ...but the reduced state is untouched: still only c1, because fetchBootstrap does not dispatch.
      assert.equal(client.cameras.length, 1);
      assert.equal(client.camera("c2"), undefined);
    });

    test("the static codec decodes to a raw packet, classifies it, returns null for unmodeled, and throws on malformed - all without a connection", () => {

      // The codec is static and connection-free (the offline twin of the rawPackets()/events() rails), so this constructs no client. decodePacket yields the raw frame;
      // classifyPacket lifts it to a TypedEvent, or null for a valid-but-unmodeled modelKey - in which case the raw frame is still fully decoded, the point of the split.
      const raw = ProtectClient.decodePacket(encode({ action: "add", id: "c1", modelKey: "camera" }, { id: "c1" }));

      assert.equal(raw.header.modelKey, "camera");
      assert.equal(ProtectClient.classifyPacket(raw)?.kind, "deviceAdded");

      // Attribution rides the same static, connection-free surface: the classified event resolves to the record id it concerns.
      const event = ProtectClient.classifyPacket(raw);

      assert.deepEqual(event ? ProtectClient.eventSubjects(event) : null, ["c1"]);

      const unmodeled = ProtectClient.decodePacket(encode({ action: "add", id: "g1", modelKey: "garage" }, { id: "g1" }));

      assert.equal(unmodeled.header.modelKey, "garage");
      assert.equal(ProtectClient.classifyPacket(unmodeled), null);

      assert.throws(() => ProtectClient.decodePacket(Buffer.from([ 1, 2, 3 ])), ProtectProtocolError);
    });

    test("connect rejects with no client left behind when the events WebSocket fails to open", async () => {

      const { agent, pool } = mockController();

      interceptLogin(pool);
      pool.intercept({ method: "GET", path: BOOTSTRAP_PATH }).reply(200, makeBootstrap());

      // The socket closes before opening, so the atomic connect must reject and tear down everything it built.
      await assert.rejects(ProtectClient.connect({ dispatcher: agent, host: HOST, log: silentLog(), password: "p", refreshIntervalMs: false, username: "u",
        webSocket: () => {

          const ws = new FakeWebSocket({ autoOpen: false });

          queueMicrotask(() => ws.emitClose(1006, "connection refused"));

          return ws;
        } }), ProtectNetworkError);
    });
  });

  describe("derived-state getters", () => {

    test("isAdmin reflects the authenticated user's camera-write permission", async () => {

      const { agent, pool } = mockController();

      interceptLogin(pool);
      pool.intercept({ method: "GET", path: BOOTSTRAP_PATH })
        .reply(200, makeBootstrap({ authUserId: "u1", users: [makeUser({ allPermissions: ["camera:read,write"], id: "u1" })] }));

      await using client = await connect(agent);

      // The getter is sugar over selectIsAdmin(snapshot); the selector's edge cases live in selectors.test.ts, here we assert the delegation lands.
      assert.equal(client.isAdmin, true);
    });

    test("isAdmin is false for a non-admin session", async () => {

      const { agent, pool } = mockController();

      interceptLogin(pool);
      pool.intercept({ method: "GET", path: BOOTSTRAP_PATH })
        .reply(200, makeBootstrap({ authUserId: "u1", users: [makeUser({ allPermissions: ["camera:read"], id: "u1" })] }));

      await using client = await connect(agent);

      assert.equal(client.isAdmin, false);
    });

    test("controllerName returns the NVR display name", async () => {

      const { agent, pool } = mockController();

      interceptLogin(pool);
      pool.intercept({ method: "GET", path: BOOTSTRAP_PATH }).reply(200, makeBootstrap({ nvr: makeNvr({ name: "Front Office NVR" }) }));

      await using client = await connect(agent);

      assert.equal(client.controllerName, "Front Office NVR");
    });

    test("controllerName falls back to the controller model when unnamed", async () => {

      const { agent, pool } = mockController();

      interceptLogin(pool);
      pool.intercept({ method: "GET", path: BOOTSTRAP_PATH }).reply(200, makeBootstrap({ nvr: makeNvr({ marketName: "UDM Pro", name: undefined }) }));

      await using client = await connect(agent);

      // controllerName is single-sourced with nvr.name: an unnamed controller surfaces its model, not null. Null is reserved for pre-bootstrap, unreachable on a
      // connected client.
      assert.equal(client.controllerName, "UDM Pro");
    });

    test("nvr exposes the controller config as a read-only projection", async () => {

      const { agent, pool } = mockController();

      interceptLogin(pool);
      pool.intercept({ method: "GET", path: BOOTSTRAP_PATH })
        .reply(200, makeBootstrap({ nvr: makeNvr({ host: "10.0.0.1", name: "Front Office NVR", ports: { rtsp: 7447 } }) }));

      await using client = await connect(agent);

      assert.equal(client.nvr.host, "10.0.0.1");
      assert.equal(client.nvr.rtspPort, 7447);
      assert.equal(client.nvr.name, "Front Office NVR");
    });

    test("liveviews and ringtones surface the controller's read-only collections", async () => {

      const { agent, pool } = mockController();

      interceptLogin(pool);
      pool.intercept({ method: "GET", path: BOOTSTRAP_PATH }).reply(200, makeBootstrap({

        liveviews: [makeLiveview({ id: "lv1", name: "All Cameras", slots: [{ cameras: [ "c1", "c2" ], cycleInterval: 10, cycleMode: "manual" }] })],
        ringtones: [ makeRingtone({ id: "rt1", name: "Chime" }), makeRingtone({ id: "rt2", name: "Bell" }) ]
      }));

      await using client = await connect(agent);

      // The getters are sugar over selectLiveviews / selectRingtones (edge cases in selectors.test.ts); here we assert the delegation lands and the records arrive whole.
      assert.deepEqual(client.liveviews.map((lv) => lv.id), ["lv1"]);
      assert.deepEqual(client.liveviews[0]?.slots[0]?.cameras, [ "c1", "c2" ]);
      assert.deepEqual(client.ringtones.map((rt) => rt.name).sort(), [ "Bell", "Chime" ]);
    });
  });

  describe("controller reboot", () => {

    test("reboot() arms the known-reboot backoff track for the ensuing events fault", async () => {

      const { agent, pool } = mockController();

      interceptLogin(pool);
      pool.intercept({ method: "GET", path: BOOTSTRAP_PATH }).reply(200, makeBootstrap({ nvr: makeNvr() }));
      pool.intercept({ method: "POST", path: "/api/system/reboot" }).reply(200, "{}");

      const clock = fakeClock();

      let ws: FakeWebSocket | undefined;

      await using client = await ProtectClient.connect({ clock, dispatcher: agent, host: HOST, log: silentLog(), password: "p", refreshIntervalMs: false,
        username: "u", webSocket: () => (ws = new FakeWebSocket()) });

      // Reboot the controller. The 2xx arms the monitor's known-reboot anticipation; we have not advanced the clock, so the imminent fault is well inside the window.
      await client.reboot();

      // The controller drops the realtime channel as it goes down. Recovery enters the long, return-time-anticipating track rather than probing at once.
      ws?.emitError(new Error("socket dropped"));
      await delay(10);

      assert.deepEqual(clock.pendingWaits(), [PROTECT_RECOVERY_BACKOFF_KNOWN_MS[0]],
        "a self-initiated reboot must steer the ensuing fault onto the known-reboot backoff track");
    });

    test("a non-2xx reboot response throws and does not arm the known-reboot track", async () => {

      const { agent, pool } = mockController();

      interceptLogin(pool);
      pool.intercept({ method: "GET", path: BOOTSTRAP_PATH }).reply(200, makeBootstrap({ nvr: makeNvr() }));
      pool.intercept({ method: "POST", path: "/api/system/reboot" }).reply(403, "forbidden");

      const clock = fakeClock();

      let ws: FakeWebSocket | undefined;

      await using client = await ProtectClient.connect({ clock, dispatcher: agent, host: HOST, log: silentLog(), password: "p", refreshIntervalMs: false,
        username: "u", webSocket: () => (ws = new FakeWebSocket()) });

      // A rejected reboot must not arm anticipation - we arm only after the controller confirms it accepted the reboot.
      await assert.rejects(client.reboot());

      // An unsolicited fault now takes the prompt unknown track (leading zero), proving the failed reboot left no lingering anticipation.
      ws?.emitError(new Error("socket dropped"));
      await delay(10);

      assert.deepEqual(clock.pendingWaits(), [0], "a failed reboot must leave the next fault on the prompt unknown track");
    });
  });
});
