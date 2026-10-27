/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * client.test.ts: Integration tests for ProtectClient.connect() - the atomic login+bootstrap factory, the projection surface over a real bootstrap, the typed-error
 * mapping for each failure stage, the Disposable event subscription, clean teardown, and the controller's URL authority at every URL the client composes. Driven
 * against an undici MockAgent.
 */
import type { ConnectionTransitionPayload, HttpRequestStartPayload } from "../diagnostics.ts";
import { ProtectAbortedError, ProtectAuthError, ProtectAuthorizationError, ProtectBootstrapError, ProtectConfigurationError, ProtectNetworkError,
  ProtectProtocolError } from "../errors.ts";
import { TestClock, errnoError, present, settle } from "homebridge-plugin-utils/testing";
import { buildPacket, jsonActionFrame, jsonDataFrame, makeActionHeader } from "../protocol/packet.helpers.ts";
import { channels, subscribeToChannel } from "../diagnostics.ts";
import { describe, test } from "node:test";
import { expectAt, silentLog } from "../testing.helpers.ts";
import { makeBootstrap, makeCamera, makeChime, makeFob, makeLight, makeLiveview, makeNvr, makeRelay, makeRingtone, makeSensor, makeUser,
  makeViewer } from "../fixtures.helpers.ts";
import { DOORBELL_INIT } from "../protocol/init-segment.fixtures.ts";
import { FakeWebSocket } from "../transport/events-stream.helpers.ts";
import type { Interceptable } from "undici";
import { MockAgent } from "undici";
import { PROTECT_RECOVERY_BACKOFF_KNOWN_MS } from "../settings.ts";
import { ProtectClient } from "./client.ts";
import type { RawPacket } from "../protocol/packet.ts";
import { Transport } from "../transport/http.ts";
import type { TypedEvent } from "../protocol/events.ts";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { describeInitSegment } from "../protocol/init-segment.ts";

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

// Connect while capturing the fake events WebSocket the factory builds, so a test can drive realtime frames into the live client. A row that reads what the connect
// signal governs hands its signal in.
async function connectCapturing(agent: MockAgent, options: { signal?: AbortSignal } = {}): Promise<{ client: ProtectClient; ws: FakeWebSocket }> {

  let ws: FakeWebSocket | undefined;
  const client = await ProtectClient.connect({ dispatcher: agent, host: HOST, log: silentLog(), password: "p", refreshIntervalMs: false, username: "u",
    webSocket: () => (ws = new FakeWebSocket()), ...((options.signal !== undefined) && { signal: options.signal }) });

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
        fobs: [makeFob({ id: "f1" })],
        lights: [makeLight({ id: "l1" })],
        relays: [makeRelay({ id: "r1" })],
        sensors: [makeSensor({ id: "s1" })],
        viewers: [makeViewer({ id: "v1" })]
      }));

      await using client = await connect(agent);

      // Every collection getter returns its own projections, and every typed lookup resolves its own device - exercising the registry and every projection constructor.
      // Each collection carries an id no other does, so a getter or lookup wired to another collection reads the wrong id or none.
      const collections = [ client.cameras, client.chimes, client.fobs, client.lights, client.relays, client.sensors, client.viewers ];

      assert.deepEqual(collections.map((devices) => devices.map((device) => device.id)), [ ["c1"], ["ch1"], ["f1"], ["l1"], ["r1"], ["s1"], ["v1"] ]);
      assert.equal(client.camera("c1")?.modelKey, "camera");
      assert.equal(client.chime("ch1")?.modelKey, "chime");
      assert.equal(client.fob("f1")?.modelKey, "fob");
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
      assert.ok(client.transport instanceof Transport, "the transport escape hatch must be exposed");
    });

    test("the refresh failsafe re-fetches the bootstrap on schedule", async () => {

      const { agent, pool } = mockController();
      const clock = new TestClock();

      interceptLogin(pool);
      // The initial bootstrap has one camera; the next scheduled refresh returns two, exercising the client's transport-backed refresh hook end to end.
      pool.intercept({ method: "GET", path: BOOTSTRAP_PATH }).reply(200, makeBootstrap({ cameras: [makeCamera({ id: "c1" })] }));
      pool.intercept({ method: "GET", path: BOOTSTRAP_PATH }).reply(200, makeBootstrap({ cameras: [ makeCamera({ id: "c1" }), makeCamera({ id: "c2" }) ] }));

      await using client = await ProtectClient.connect({ clock, dispatcher: agent, host: HOST, log: silentLog(), password: "p", refreshIntervalMs: 1000, username: "u",
        webSocket: () => new FakeWebSocket() });

      assert.equal(client.cameras.length, 1);

      clock.advance(1000);
      await settle();
      await expectAt(() => client.cameras.length === 2);
    });
  });

  describe("atomicity - failures are typed and leave no client", () => {

    test("a missing controller host rejects with ProtectConfigurationError before any request is sent", async () => {

      const { agent } = mockController();
      const starts: HttpRequestStartPayload[] = [];

      using startSubscription = subscribeToChannel(channels.httpRequestStart, (payload) => void starts.push(payload));

      // A JavaScript consumer's configuration can omit the address, which the cast hands in past the type.
      await assert.rejects(ProtectClient.connect({ dispatcher: agent, host: undefined as unknown as string, log: silentLog(), password: "p", refreshIntervalMs: false,
        username: "u", webSocket: () => new FakeWebSocket() }), ProtectConfigurationError);

      assert.equal(starts.length, 0, "the refusal comes before any request");
    });

    test("bad credentials reject with ProtectAuthError", async () => {

      const { agent, pool } = mockController();

      // The login is rejected and the CSRF fetch yields no token, so the handshake cannot complete.
      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(401, "bad");
      pool.intercept({ method: "GET", path: "/" }).reply(200, "");

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

    test("connect rejects with no client left behind when the events WebSocket fails to open", async () => {

      const { agent, pool } = mockController();

      interceptLogin(pool);
      pool.intercept({ method: "GET", path: BOOTSTRAP_PATH }).reply(200, makeBootstrap());

      // The socket closes before opening, so the atomic connect must reject and tear down everything it built. A close the socket reports itself never asks it to
      // close; only the events stream's shutdown does, so a socket asked to close is the failed connect's teardown having run.
      let captured: FakeWebSocket | undefined;

      await assert.rejects(ProtectClient.connect({ dispatcher: agent, host: HOST, log: silentLog(), password: "p", refreshIntervalMs: false, username: "u",
        webSocket: (): FakeWebSocket => {

          const ws = new FakeWebSocket({ autoOpen: false });

          captured = ws;
          queueMicrotask(() => ws.emitClose(1006, "connection refused"));

          return ws;
        } }), ProtectNetworkError);

      assert.ok(captured !== undefined, "the events WebSocket factory must have been invoked during connect");
      assert.equal(captured.closeRequested, true, "the failed connect's teardown closed the socket it built");
    });

    test("connect rejects with the classified socket failure when the events WebSocket errors before it opens, and starts no recovery", async () => {

      const { agent, pool } = mockController();
      const transitions: ConnectionTransitionPayload[] = [];
      const refused = errnoError("connect ECONNREFUSED", "ECONNREFUSED");
      let bootstrapFetches = 0;

      interceptLogin(pool);
      pool.intercept({ method: "GET", path: BOOTSTRAP_PATH }).reply(() => {

        bootstrapFetches++;

        return { data: makeBootstrap(), statusCode: 200 };
      }).persist();

      using transitionSubscription = subscribeToChannel(channels.connectionTransition, (payload) => void transitions.push(payload));

      /* The socket errors before it opens. The connect its caller is awaiting is already failing, so the failure is that caller's rejection - the classified socket
       * failure itself, carrying the dial's errno - and nothing reaches the error rail the connection monitor recovers from: no transition, and no verify probe
       * fetching the bootstrap a second time.
       */
      await assert.rejects(ProtectClient.connect({ dispatcher: agent, host: HOST, log: silentLog(), password: "p", refreshIntervalMs: false, username: "u",
        webSocket: (): FakeWebSocket => {

          const ws = new FakeWebSocket({ autoOpen: false });

          queueMicrotask(() => ws.emitError(refused));

          return ws;
        } }), (error: unknown) => {

        assert.ok(error instanceof ProtectNetworkError);
        assert.ok(Object.is(error.cause, refused), "the rejection carries the dial's own failure");
        assert.equal(error.code, "ECONNREFUSED");

        return true;
      });

      await delay(20);

      assert.deepEqual(transitions, [], "a connect that failed before the open starts no recovery");
      assert.equal(bootstrapFetches, 1, "the verify probe never runs");
    });
  });

  describe("event subscription and teardown", () => {

    test("once rejects when its signal aborts and stream terminates on abort", async () => {

      const { agent, pool } = mockController();

      interceptLogin(pool);
      pool.intercept({ method: "GET", path: BOOTSTRAP_PATH }).reply(200, makeBootstrap());

      await using client = await connect(agent);

      // once() is the one-shot rail: an aborted wait rejects with the abort error rather than hanging.
      const onceAc = new AbortController();
      const pending = client.once("packet", { signal: onceAc.signal });

      onceAc.abort();
      await assert.rejects(pending, { name: "AbortError" });

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

      const { client, ws } = await connectCapturing(agent);

      // Disposing twice must not throw - the events stream, store, session, and transport teardown are each safe to call more than once - and the teardown reaches the
      // events stream's shutdown, the one path that closes its socket.
      await client[Symbol.asyncDispose]();
      await client[Symbol.asyncDispose]();
      assert.equal(ws.closeRequested, true, "disposal closed the events WebSocket");
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

    test("a connect signal aborted after the connect resolves leaves the events socket open, its frames reaching the state, and the connection healthy", async () => {

      const { agent, pool } = mockController();
      const controller = new AbortController();

      interceptLogin(pool);
      pool.intercept({ method: "GET", path: BOOTSTRAP_PATH }).reply(200, makeBootstrap({ cameras: [makeCamera({ id: "c1", name: "Front" })] }));

      const captured = await connectCapturing(agent, { signal: controller.signal });

      await using client = captured.client;
      const { ws } = captured;

      /* The signal cancels the connect and nothing after it. The monitor hears only the stream's error rail, which a caller's cancel never reaches, so a stream that
       * obeyed the signal past its open would end the realtime channel with no recovery to bring it back, while the connection still read healthy.
       */
      controller.abort();
      await settle();

      ws.emitMessage(encode({ action: "update", id: "c1", modelKey: "camera" }, { name: "Renamed" }));

      assert.equal(ws.closeRequested, false, "the events socket is not asked to close");
      assert.equal(client.camera("c1")?.name, "Renamed", "the realtime channel still carries frames into the state");
      assert.equal(client.connection.state, "healthy");
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
      assert.deepEqual(raw[1].payload, { id: "g1" });

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

    test("the static init reader describes init bytes exactly as the free reader does, without a connection", () => {

      // The static is the one public door to the init reader, for init bytes a consumer holds of its own, so it must answer what the livestream session reads.
      assert.deepEqual(ProtectClient.describeInitSegment(DOORBELL_INIT), describeInitSegment(DOORBELL_INIT));
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

      const clock = new TestClock();

      let ws: FakeWebSocket | undefined;

      await using client = await ProtectClient.connect({ clock, dispatcher: agent, host: HOST, log: silentLog(), password: "p", refreshIntervalMs: false,
        username: "u", webSocket: () => (ws = new FakeWebSocket()) });

      // Reboot the controller. The 2xx arms the monitor's known-reboot anticipation; we have not advanced the clock, so the imminent fault is well inside the window.
      await client.reboot();

      // The controller drops the realtime channel as it goes down. Recovery enters the long, return-time-anticipating track rather than probing at once.
      ws?.emitError(new Error("socket dropped"));
      await delay(10);

      assert.equal(clock.nextDeadline, clock.now() + present(PROTECT_RECOVERY_BACKOFF_KNOWN_MS[0], "the known track's first delay"),
        "a self-initiated reboot must steer the ensuing fault onto the known-reboot backoff track");
      assert.equal(clock.pending, 1, "and recovery parks on that one wait alone");
    });

    test("a non-2xx reboot response throws and does not arm the known-reboot track", async () => {

      const { agent, pool } = mockController();

      interceptLogin(pool);
      pool.intercept({ method: "GET", path: BOOTSTRAP_PATH }).reply(200, makeBootstrap({ nvr: makeNvr() }));
      pool.intercept({ method: "POST", path: "/api/system/reboot" }).reply(403, "forbidden");

      const clock = new TestClock();

      let ws: FakeWebSocket | undefined;

      await using client = await ProtectClient.connect({ clock, dispatcher: agent, host: HOST, log: silentLog(), password: "p", refreshIntervalMs: false,
        username: "u", webSocket: () => (ws = new FakeWebSocket()) });

      // A rejected reboot must not arm anticipation - we arm only after the controller confirms it accepted the reboot.
      await assert.rejects(client.reboot());

      // An unsolicited fault now takes the prompt unknown track (leading zero), proving the failed reboot left no lingering anticipation.
      ws?.emitError(new Error("socket dropped"));
      await delay(10);

      assert.equal(clock.nextDeadline, clock.now(), "a failed reboot must leave the next fault on the prompt unknown track");
      assert.equal(clock.pending, 1, "and recovery parks on that one wait alone");
    });
  });

  describe("an IPv6 controller address", () => {

    /* The address as configured and the authority every URL the client composes carries it in. The mock answers only on the bracketed origin, and a URL composed
     * from the bare literal is one the parser refuses before a request leaves, so each intercept below that answers is a builder the composition root handed the
     * authority. A builder handed the bare literal fails its row as a network error instead.
     */
    const ADDRESS = "fe80::1";
    const AUTHORITY = "[fe80::1]";

    // A MockAgent bound to the bracketed origin, with net connections disabled so any unmocked request fails loudly.
    function mockBracketedController(): { agent: MockAgent; pool: Interceptable } {

      const agent = new MockAgent();

      agent.disableNetConnect();

      return { agent, pool: agent.get("https://" + AUTHORITY) };
    }

    // One WebSocket the client dialed: the URL it was handed and the socket built for it.
    interface Dialed {

      socket: FakeWebSocket;
      url: string;
    }

    // Connect to the bare address, recording each WebSocket the client dials in `dialed`, in order.
    async function connectBare(agent: MockAgent, options: { clock?: TestClock; dialed?: Dialed[]; refreshIntervalMs?: number | false } = {}): Promise<ProtectClient> {

      return ProtectClient.connect({ clock: options.clock ?? new TestClock(), dispatcher: agent, host: ADDRESS, log: silentLog(), password: "p",
        refreshIntervalMs: options.refreshIntervalMs ?? false, username: "u", webSocket: (url: string): FakeWebSocket => {

          const socket = new FakeWebSocket();

          options.dialed?.push({ socket, url });

          return socket;
        } });
    }

    test("signs in through the CSRF retry, bootstraps and opens the events stream on the bracketed authority, reporting the address as configured", async () => {

      const { agent, pool } = mockBracketedController();
      const dialed: Dialed[] = [];
      const hosts: string[] = [];

      using startSubscription = subscribeToChannel(channels.httpRequestStart, (payload) => void hosts.push(payload.host));

      // The first sign-in is rejected, so the session fetches a CSRF token from the controller root and signs in again, reaching the login URL and the root alike.
      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(401, "");
      pool.intercept({ method: "GET", path: "/" }).reply(200, "", { headers: { "x-csrf-token": "csrf0" } });
      interceptLogin(pool);
      pool.intercept({ method: "GET", path: BOOTSTRAP_PATH }).reply(200, makeBootstrap());

      await using client = await connectBare(agent, { dialed });

      agent.assertNoPendingInterceptors();
      assert.equal(dialed.length, 1);
      assert.ok(dialed[0]?.url.startsWith("wss://" + AUTHORITY + "/proxy/protect/ws/updates?"), "the events stream dials the bracketed authority");
      assert.deepEqual([...new Set(hosts)], [ADDRESS], "every request's diagnostics payload carries the address as configured");
    });

    test("negotiates the livestream and talkback endpoints on the bracketed authority", async () => {

      const { agent, pool } = mockBracketedController();
      const dialed: Dialed[] = [];

      interceptLogin(pool);
      pool.intercept({ method: "GET", path: BOOTSTRAP_PATH }).reply(200, makeBootstrap({ cameras: [makeCamera({ featureFlags: { hasSpeaker: true }, id: "c1" })] }));
      pool.intercept({ method: "GET", path: (path) => path.startsWith("/proxy/protect/api/ws/livestream?") })
        .reply(200, { url: "wss://internal-host:7442/ws/livestream?token=t" });

      // The talkback negotiation is refused, so the row ends there: connect injects no talkback socket, and a minted URL the session could dial would reach the network.
      pool.intercept({ method: "GET", path: "/proxy/protect/api/ws/talkback?camera=c1" }).reply(403, {});

      await using client = await connectBare(agent, { dialed });

      const camera = client.camera("c1");

      assert.ok(camera !== undefined);

      await using subscription = camera.livestream({ source: { channel: 0, type: "channel" } });

      await expectAt(() => dialed.length === 2);
      assert.equal(dialed[1]?.url, "wss://" + AUTHORITY + ":7442/ws/livestream?token=t", "the livestream negotiates on the authority and dials its hostname");

      // A forbidden answer classified as the authorization error is the negotiation having reached the bracketed origin, where a bare literal fails before any status
      // exists.
      await assert.rejects(camera.talkback(), { constructor: ProtectAuthorizationError, statusCode: 403 });
    });

    test("sends a device command, the raw bootstrap fetch and the controller reboot on the bracketed authority", async () => {

      const { agent, pool } = mockBracketedController();

      interceptLogin(pool);
      pool.intercept({ method: "GET", path: BOOTSTRAP_PATH }).reply(200, makeBootstrap({ cameras: [makeCamera({ id: "c1" })] }));
      pool.intercept({ method: "POST", path: "/proxy/protect/api/cameras/c1/reboot" }).reply(200, {});
      pool.intercept({ method: "GET", path: BOOTSTRAP_PATH }).reply(200, makeBootstrap());
      pool.intercept({ method: "POST", path: "/api/system/reboot" }).reply(200, "{}");

      await using client = await connectBare(agent);

      await client.camera("c1")?.reboot();
      await client.fetchBootstrap();
      await client.reboot();

      agent.assertNoPendingInterceptors();
    });

    test("re-fetches the bootstrap on the bracketed authority for the refresh, the liveness probe and recovery, which relaunches the events stream there", async () => {

      const { agent, pool } = mockBracketedController();
      const clock = new TestClock();
      const dialed: Dialed[] = [];

      interceptLogin(pool);
      pool.intercept({ method: "GET", path: BOOTSTRAP_PATH }).reply(200, makeBootstrap());

      await using client = await connectBare(agent, { clock, dialed, refreshIntervalMs: 1000 });

      // The refresh failsafe's fetch.
      pool.intercept({ method: "GET", path: BOOTSTRAP_PATH }).reply(200, makeBootstrap());
      clock.advance(1000);
      await settle();
      await expectAt(() => agent.pendingInterceptors().length === 0);

      // The liveness probe's fetch.
      pool.intercept({ method: "GET", path: BOOTSTRAP_PATH }).reply(200, makeBootstrap());
      await client.connection.verify();

      // The events socket drops, so recovery waits out its prompt first delay, then verifies with one fetch, re-bootstraps with another, and relaunches the events
      // stream. The prompt delay is due the moment it parks, so the timeline's next deadline reaching the present is the sign it has parked.
      pool.intercept({ method: "GET", path: BOOTSTRAP_PATH }).reply(200, makeBootstrap()).times(2);
      dialed[0]?.socket.emitError(new Error("socket dropped"));
      await expectAt(() => clock.nextDeadline === clock.now());
      clock.advance(0);
      await expectAt(() => dialed.length === 2);

      agent.assertNoPendingInterceptors();
      assert.ok(dialed[1]?.url.startsWith("wss://" + AUTHORITY + "/proxy/protect/ws/updates?"), "the relaunched events stream dials the bracketed authority");
    });

    test("builds its own pool on the bracketed origin", async () => {

      /* No dispatcher is injected, so connect builds the pool itself, and a pool built on an origin composed from the bare literal throws the URL parser's error as it
       * is constructed. The caller's signal has already aborted, so the pool that is built ends the sign-in before any request leaves, and connect reports that abort.
       */
      await assert.rejects(ProtectClient.connect({ host: ADDRESS, log: silentLog(), password: "p", refreshIntervalMs: false, signal: AbortSignal.abort(), username: "u",
        webSocket: () => new FakeWebSocket() }), ProtectAbortedError);
    });

    test("refuses a zoned literal before any request is sent, naming the address", async () => {

      const { agent } = mockBracketedController();
      const starts: HttpRequestStartPayload[] = [];

      using startSubscription = subscribeToChannel(channels.httpRequestStart, (payload) => void starts.push(payload));

      await assert.rejects(ProtectClient.connect({ dispatcher: agent, host: "fe80::1%en0", log: silentLog(), password: "p", refreshIntervalMs: false, username: "u",
        webSocket: () => new FakeWebSocket() }), (error: unknown) => {

        assert.ok(error instanceof ProtectConfigurationError);
        assert.ok(error.message.includes("\"fe80::1%en0\""), "the refusal names the address as configured");

        return true;
      });

      assert.equal(starts.length, 0, "the refusal comes before any request");
    });
  });
});
