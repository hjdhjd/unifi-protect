/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * events-stream.test.ts: Tests for EventStream - the connection handshake (open, pre-open close, and caller-signal abort before open), the single decode site,
 * the three-rail fan-out, schema-drift surfacing, decode-failure resilience, the silence watchdog, and teardown. Driven through an injected fake WebSocket and a
 * `TestClock`, so the realtime stream is exercised deterministically without a live controller.
 */
import type { CapturedLogEntry, CapturingLogger } from "../testing.helpers.ts";
import type { ConnectionOptions, TLSSocket } from "node:tls";
import { DIAL_SETTLE_BOUND_MS, announcedSockets, createLoopbackAlpnPeer, createLoopbackSilentPeer, createLoopbackWebSocketPeer,
  elapsedSince } from "./tls-peer.helpers.ts";
import type { EventsClosedPayload, EventsPacketPayload, SchemaUnknownModelKeyPayload } from "../diagnostics.ts";
import { ProtectAbortedError, ProtectCertificateError, ProtectNetworkError, ProtectProtocolError, ProtectStallError, ProtectTimeoutError } from "../errors.ts";
import { TIME_OF_DAY_STEP_MS, assertNoUnhandledRejections, capturingLog, expectAt, settlement, silentLog } from "../testing.helpers.ts";
import { TestClock, errnoError, freePort, present, settle } from "homebridge-plugin-utils/testing";
import { buildPacket, jsonActionFrame, jsonDataFrame, makeActionHeader } from "../protocol/packet.helpers.ts";
import { channels, subscribeToChannel } from "../diagnostics.ts";
import { describe, test } from "node:test";
import { EventStream } from "./events-stream.ts";
import type { EventStreamEvents } from "./events-stream.ts";
import { FakeWebSocket } from "./events-stream.helpers.ts";
import { PROTECT_EVENTS_WATCHDOG_TIMEOUT } from "../settings.ts";
import type { ProtectLogging } from "../logging.ts";
import type { TypedEvent } from "../protocol/events.ts";
import assert from "node:assert/strict";
import { constants } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { getEventListeners } from "node:events";
import tls from "node:tls";

const HOST = "10.0.0.1";

// The sentence the stream logs a fault of its open socket under, and the lines a log holds carrying it, at whatever level each was logged.
const REPORTED = "The UniFi Protect realtime events API reported an error.";

function reportedLines(log: CapturingLogger): CapturedLogEntry[] {

  return log.entries.filter((entry) => entry.message === REPORTED);
}

// A phrase the stall line carries, which the stream logs an open socket's silence under.
const WENT_SILENT = "went silent beyond the watchdog window";

// Encode a realtime packet from an action header and a JSON data payload - the same byte layout decodePacket reads, so the stream decodes exactly what we synthesize.
function encode(header: Partial<{ action: string; id: string; modelKey: string }>, payload: object): Buffer {

  return buildPacket(jsonActionFrame(makeActionHeader(header)), jsonDataFrame(payload));
}

// Construct an open stream over a fake socket, returning the stream, the socket, and the clock. The socket does not auto-open, so the stream opens only when this helper
// emits the open. `webSocket` makes the fake for a row that needs one built its own way; that fake must not open itself, since this helper opens it.
async function openStream(options: { clock?: TestClock; log?: ProtectLogging;
  webSocket?: () => FakeWebSocket; } = {}): Promise<{ clock: TestClock; stream: EventStream; ws: FakeWebSocket }> {

  const clock = options.clock ?? new TestClock();
  const log = options.log ?? silentLog();
  const ws = options.webSocket?.() ?? new FakeWebSocket({ autoOpen: false });
  const stream = new EventStream({ clock, host: HOST, lastUpdateId: "u0", log, webSocket: (): FakeWebSocket => ws });

  ws.emitOpen();
  await stream.opened;

  return { clock, stream, ws };
}

// Collect every emission of a rail into an array, for synchronous assertions after driving the socket.
function collect<K extends keyof EventStreamEvents>(stream: EventStream, event: K): EventStreamEvents[K][] {

  const received: EventStreamEvents[K][] = [];

  stream.on(event, (...args) => received.push(args));

  return received;
}

// Return the first collected emission, asserting at least one exists. Keeps the index access total under noUncheckedIndexedAccess while reading as an assertion.
function first<T>(items: T[]): T {

  const [head] = items;

  assert.ok(head !== undefined, "expected at least one emission");

  return head;
}

describe("EventStream", () => {

  describe("connection handshake", () => {

    test("connect() resolves once the socket opens", async () => {

      const ws = new FakeWebSocket({ autoOpen: false });
      const pending = EventStream.connect({ clock: new TestClock(), host: HOST, lastUpdateId: "u0", log: silentLog(), webSocket: (): FakeWebSocket => ws });
      const settled = settlement(pending);

      // The socket has not opened, so connect() must still be pending after a macrotask, and it settles once the socket reports open.
      await delay(0);
      assert.equal(settled(), false, "connect() must wait for the socket to open");

      ws.emitOpen();

      await using stream = await pending;

      assert.ok(stream instanceof EventStream);
    });

    test("opened rejects with a ProtectNetworkError when the socket closes before opening", async () => {

      const ws = new FakeWebSocket({ autoOpen: false });
      const stream = new EventStream({ host: HOST, lastUpdateId: "u0", log: silentLog(), webSocket: (): FakeWebSocket => ws });
      const errors = collect(stream, "error");

      ws.emitClose(1006, "handshake failed");

      // A close before the socket opened settles the handshake as the failure and never starts a recovery, so nothing reaches the error rail.
      await assert.rejects(stream.opened, ProtectNetworkError);
      assert.equal(errors.length, 0, "a pre-open close surfaces only through opened");
      await stream.close();
    });

    test("a backward step of the time of day during a connection attempt leaves the elapsed time its timeout reports the time that passed", async () => {

      const clock = new TestClock();
      const ws = new FakeWebSocket({ autoOpen: false });
      const stream = new EventStream({ clock, host: HOST, lastUpdateId: "u0", log: silentLog(), webSocket: (): FakeWebSocket => ws });

      /* The time of day is set back while the attempt is under way, and the attempt runs on for two and a half seconds before it times out. An injected socket's own
       * error is the whole account of its failure, so the undici connect timeout this row hands it classifies exactly as a real one does.
       */
      clock.advance(-TIME_OF_DAY_STEP_MS);
      clock.advance(2500);
      ws.emitError(errnoError("Connect Timeout Error", "UND_ERR_CONNECT_TIMEOUT"));

      await assert.rejects(stream.opened, { constructor: ProtectTimeoutError, elapsedMs: 2500 });
    });

    test("a pre-open close leaves no unhandled rejection for a consumer that never awaits opened", async () => {

      // A consumer that only subscribes to the rails never awaits opened, so the handshake's rejection must already be handled when the socket closes before opening.
      await assertNoUnhandledRejections(async () => {

        const ws = new FakeWebSocket({ autoOpen: false });
        const stream = new EventStream({ clock: new TestClock(), host: HOST, lastUpdateId: "u0", log: silentLog(), webSocket: (): FakeWebSocket => ws });

        ws.emitClose(1006, "handshake failed");
        await stream.close();
      });
    });

    test("an already-aborted caller signal tears the stream down before it opens", async () => {

      const ws = new FakeWebSocket({ autoOpen: false });
      const controller = new AbortController();

      controller.abort();

      const stream = new EventStream({ host: HOST, lastUpdateId: "u0", log: silentLog(), signal: controller.signal, webSocket: (): FakeWebSocket => ws });

      await assert.rejects(stream.opened, ProtectAbortedError);
      assert.equal(ws.closeRequested, true);
    });

    test("aborting the caller signal after construction but before open rejects opened", async () => {

      const ws = new FakeWebSocket({ autoOpen: false });
      const controller = new AbortController();
      const stream = new EventStream({ host: HOST, lastUpdateId: "u0", log: silentLog(), signal: controller.signal, webSocket: (): FakeWebSocket => ws });

      controller.abort();

      await assert.rejects(stream.opened, ProtectAbortedError);
    });

    test("a caller abort after the open leaves the stream open, its frames still decoded, nothing closed, and the signal holding no binding", async () => {

      const ws = new FakeWebSocket({ autoOpen: false });
      const controller = new AbortController();
      const stream = new EventStream({ clock: new TestClock(), host: HOST, lastUpdateId: "u0", log: silentLog(), signal: controller.signal,
        webSocket: (): FakeWebSocket => ws });
      const closed = collect(stream, "closed");
      const errors = collect(stream, "error");
      const packets = collect(stream, "packet");

      ws.emitOpen();
      await stream.opened;

      // The signal cancels the connection attempt alone, so the open let it go and its abort reaches nothing the stream holds.
      controller.abort();
      ws.emitMessage(encode({ action: "add", id: "c1", modelKey: "camera" }, { id: "c1", name: "Front" }));

      assert.equal(getEventListeners(controller.signal, "abort").length, 0, "the open removed the binding to the caller's signal");
      assert.equal(ws.closeRequested, false, "the socket is not asked to close");
      assert.equal(packets.length, 1, "a frame after the abort is still decoded");
      assert.equal(closed.length, 0, "nothing closed");
      assert.equal(errors.length, 0, "and nothing reached the error rail");

      await stream.close();
    });

    test("a logger that throws on the connected line leaves the handshake resolved", async () => {

      const log: ProtectLogging = { ...silentLog(), debug: (message: string): void => {

        if(message === "Connected to the UniFi Protect realtime events API.") {

          throw new Error("the logger refused the connected line");
        }
      } };
      const ws = new FakeWebSocket({ autoOpen: false });
      const stream = new EventStream({ clock: new TestClock(), host: HOST, lastUpdateId: "u0", log, webSocket: (): FakeWebSocket => ws });
      const settled = settlement(stream.opened);

      // The fake hands a listener's throw back to the caller, so the logger's throw from inside the open surfaces here, after the open's work.
      assert.throws(() => ws.emitOpen(), /the logger refused the connected line/);
      await settle();

      assert.ok(settled(), "the handshake settled though the line threw");
      await stream.opened;
      await stream.close();
    });

    test("the upgrade reaches a controller on an IPv6 address through its bracketed authority", async () => {

      // A real TLS peer rather than the injected fake, because only the default factory's socket dials the URL the stream composes.
      await using peer = await createLoopbackWebSocketPeer({ ipv6: true });
      const stream = new EventStream({ clock: new TestClock(), host: peer.host, lastUpdateId: "u0", log: silentLog() });

      await stream.opened;
      await stream.close();
    });
  });

  describe("certificate verification", () => {

    test("the upgrade reaches a controller's own certificate when strict verification is not asked for", async () => {

      // A real TLS peer rather than the injected fake: the certificate posture lives on the agent the default factory builds, which an injected socket never reaches.
      await using peer = await createLoopbackWebSocketPeer();
      const stream = new EventStream({ clock: new TestClock(), host: peer.host, lastUpdateId: "u0", log: silentLog() });

      await stream.opened;
      await stream.close();
    });

    test("the upgrade refuses a certificate that does not verify when strict verification is asked for", async () => {

      await using peer = await createLoopbackWebSocketPeer();
      const stream = new EventStream({ clock: new TestClock(), host: peer.host, lastUpdateId: "u0", log: silentLog(), verifyTls: true });

      const errors = collect(stream, "error");

      /* The same peer and the same upgrade, one option apart. Asking for verification against a certificate that cannot provide it fails the connect, and the
       * pre-open failure reaches the caller on the handshake rejection alone, naming the address dialed and the verifier's own code, which the socket's own error
       * event never carried at all.
       */
      await assert.rejects(stream.opened, (error: unknown) => {

        assert.ok(error instanceof ProtectCertificateError, "a certificate the verifier refused reaches the caller as the refusal it is");
        assert.equal(error.code, "DEPTH_ZERO_SELF_SIGNED_CERT");
        assert.equal(error.host, peer.host, "the address reported is the one the stream dialed");

        return true;
      });

      assert.equal(errors.length, 0, "a failure before the open stays off the error rail");

      await stream.close();
    });
  });

  describe("decode and fan-out", () => {

    test("a device-add packet is decoded, classified, and emitted on the packet rail", async () => {

      const { stream, ws } = await openStream();
      const packets = collect(stream, "packet");

      ws.emitMessage(encode({ action: "add", id: "c1", modelKey: "camera" }, { id: "c1", name: "Front" }));

      assert.equal(packets.length, 1);

      const [event] = first(packets);

      assert.equal(event.kind, "deviceAdded");
      assert.equal((event as { id: string }).id, "c1");

      await stream.close();
    });

    test("an activity packet (motion) is classified to its typed event", async () => {

      const { stream, ws } = await openStream();
      const packets = collect(stream, "packet");

      ws.emitMessage(encode({ action: "add", id: "evt1", modelKey: "event" }, { camera: "c1", start: 1000, type: "motion" }));

      assert.equal(packets.length, 1);
      assert.equal(first(packets)[0].kind, "motionDetected");

      await stream.close();
    });

    test("every decoded frame is emitted on the rawPacket rail, including the unmodeled ones the packet rail drops", async () => {

      const { stream, ws } = await openStream();
      const packets = collect(stream, "packet");
      const raw = collect(stream, "rawPacket");

      // A modeled frame (camera) and an unmodeled one (garage is not a known modelKey, so the classifier drops it to null).
      ws.emitMessage(encode({ action: "add", id: "c1", modelKey: "camera" }, { id: "c1", name: "Front" }));
      ws.emitMessage(encode({ action: "update", id: "g1", modelKey: "garage" }, { id: "g1" }));

      // The typed rail saw only the modeled frame; the raw rail saw both, header and payload intact - including the frame the classifier dropped.
      assert.equal(packets.length, 1);
      assert.equal(raw.length, 2);
      assert.equal(first(raw)[0].header.modelKey, "camera");
      assert.equal(raw[1]?.[0].header.modelKey, "garage");
      assert.deepEqual(raw[1][0].payload, { id: "g1" });

      await stream.close();
    });

    test("a frame that fails to decode reaches the error rail and is not raw-emitted", async () => {

      const { stream, ws } = await openStream();
      const raw = collect(stream, "rawPacket");
      const errors = collect(stream, "error");

      // Bytes too short to be a valid packet: decodePacket throws before any RawPacket exists, so nothing reaches the raw rail.
      ws.emitMessage(Buffer.from([ 1, 2, 3 ]));

      assert.equal(raw.length, 0);
      assert.equal(errors.length, 1);
      assert.ok(first(errors)[0] instanceof ProtectProtocolError);

      await stream.close();
    });

    test("a throwing rawPacket listener is logged and the frame still decodes onto the packet rail, with nothing on the error rail", async () => {

      const log = capturingLog();
      const { stream, ws } = await openStream({ log });
      const errors = collect(stream, "error");
      const packets = collect(stream, "packet");
      const failure = new Error("the consumer's raw handler failed");

      // The raw rail fires inside the decode step, so a throw that escaped it would read as a frame that could not be decoded and start a recovery.
      using thrower = stream.on("rawPacket", () => {

        throw failure;
      });

      ws.emitMessage(encode({ action: "add", id: "c1", modelKey: "camera" }, { id: "c1" }));

      assert.equal(packets.length, 1, "the frame still reached the packet rail");
      assert.equal(errors.length, 0, "the listener's throw is not read as a decode failure");

      const lines = log.entries.filter((entry) => entry.level === "error");

      assert.equal(lines.length, 1, "the throw is logged once, through the stream's own logger");
      assert.deepEqual(lines[0]?.args, [{ error: failure, event: "rawPacket" }]);

      await stream.close();
    });

    test("a binary frame delivered as an ArrayBuffer is decoded", async () => {

      const { stream, ws } = await openStream();
      const packets = collect(stream, "packet");
      const bytes = encode({ action: "add", id: "c1", modelKey: "camera" }, { id: "c1" });

      // undici delivers binary frames as an ArrayBuffer under binaryType "arraybuffer"; exercise that path directly (the fake otherwise hands us a Buffer view).
      ws.emitMessage(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));

      assert.equal(packets.length, 1);
      assert.equal(first(packets)[0].kind, "deviceAdded");

      await stream.close();
    });

    test("the stream() rail delivers packets and rejects on abort", async () => {

      const { stream, ws } = await openStream();
      const controller = new AbortController();
      const collected: TypedEvent[] = [];
      const task = (async (): Promise<void> => {

        for await (const [event] of stream.stream("packet", { signal: controller.signal })) {

          collected.push(event);
        }
      })();

      ws.emitMessage(encode({ action: "add", id: "c1", modelKey: "camera" }, { id: "c1" }));
      await expectAt(() => collected.length === 1);
      assert.equal(first(collected).kind, "deviceAdded");

      controller.abort();

      // The raw stream rail rejects on abort with node:events' AbortError - unlike the packets() sugar, which returns cleanly. Either way nothing more is delivered.
      await assert.rejects(task, { name: "AbortError" });
      assert.equal(collected.length, 1);

      await stream.close();
    });

    test("once() resolves with the next packet's tuple", async () => {

      const { stream, ws } = await openStream();
      const pending = stream.once("packet");

      ws.emitMessage(encode({ action: "add", id: "c1", modelKey: "camera" }, { id: "c1" }));

      const [event] = await pending;

      assert.equal(event.kind, "deviceAdded");

      await stream.close();
    });

    test("packets() yields typed events and terminates on abort", async () => {

      const { stream, ws } = await openStream();
      const controller = new AbortController();
      const collected: TypedEvent[] = [];
      const task = (async (): Promise<void> => {

        for await (const event of stream.packets({ signal: controller.signal })) {

          collected.push(event);
        }
      })();

      ws.emitMessage(encode({ action: "add", id: "c1", modelKey: "camera" }, { id: "c1" }));
      await expectAt(() => collected.length === 1);

      controller.abort();
      await task;

      assert.equal(collected.length, 1);
      assert.equal(collected[0]?.kind, "deviceAdded");

      await stream.close();
    });

    test("the events:packet diagnostic carries id and modelKey for device transitions, kind only for activity signals", async () => {

      const { stream, ws } = await openStream();
      const payloads: EventsPacketPayload[] = [];

      using packetSubscription = subscribeToChannel(channels.eventsPacket, (payload) => void payloads.push(payload));

      ws.emitMessage(encode({ action: "update", id: "c1", modelKey: "camera" }, { name: "Renamed" }));
      ws.emitMessage(encode({ action: "add", id: "evt1", modelKey: "event" }, { camera: "c1", start: 1, type: "ring" }));

      assert.deepEqual(payloads[0], { id: "c1", kind: "devicePatched", modelKey: "camera" });
      assert.deepEqual(payloads[1], { kind: "doorbellRing" });

      await stream.close();
    });
  });

  describe("unclassified frames", () => {

    test("an unmodeled model key publishes schema:unknownModelKey once per (modelKey, action)", async () => {

      const { stream, ws } = await openStream();
      const drift: SchemaUnknownModelKeyPayload[] = [];

      using driftSubscription = subscribeToChannel(channels.schemaUnknownModelKey, (payload) => void drift.push(payload));

      // Two frames with the same unmodeled (modelKey, action) publish the drift signal once; a different action publishes again.
      ws.emitMessage(encode({ action: "add", id: "g1", modelKey: "garage" }, { id: "g1" }));
      ws.emitMessage(encode({ action: "add", id: "g2", modelKey: "garage" }, { id: "g2" }));
      ws.emitMessage(encode({ action: "update", id: "g1", modelKey: "garage" }, { id: "g1" }));

      assert.equal(drift.length, 2);
      assert.deepEqual(drift[0], { action: "add", exampleId: "g1", modelKey: "garage" });
      assert.deepEqual(drift[1], { action: "update", exampleId: "g1", modelKey: "garage" });

      await stream.close();
    });

    test("a modeled-but-unlifted frame emits no packet and no schema-drift signal", async () => {

      const { stream, ws } = await openStream();
      const packets = collect(stream, "packet");
      const drift: SchemaUnknownModelKeyPayload[] = [];

      using driftSubscription = subscribeToChannel(channels.schemaUnknownModelKey, (payload) => void drift.push(payload));

      // An `event` frame that does not self-describe (no recognized type, no camera) classifies to null - but `event` is recognized, so it is not schema drift.
      ws.emitMessage(encode({ action: "update", id: "evt1", modelKey: "event" }, { score: 50 }));

      assert.equal(packets.length, 0);
      assert.equal(drift.length, 0);

      await stream.close();
    });

    test("a recognized-but-unmodeled model key emits no packet and no schema-drift signal", async () => {

      const { stream, ws } = await openStream();
      const packets = collect(stream, "packet");
      const drift: SchemaUnknownModelKeyPayload[] = [];

      using driftSubscription = subscribeToChannel(channels.schemaUnknownModelKey, (payload) => void drift.push(payload));

      // `group`, `bridge`, and `siren` are known wire model keys the library recognizes but deliberately does not reduce into state - they classify to null but are not
      // drift, so they must stay silent on the diagnostic. This is the honest-diagnostic guarantee: schema:unknownModelKey fires only for genuinely novel keys.
      // (`liveview` is itself a reduced StateModelKey, so it produces a packet and is exercised in the reducer/classifier tests rather than here.)
      ws.emitMessage(encode({ action: "update", id: "br1", modelKey: "bridge" }, { name: "Front" }));
      ws.emitMessage(encode({ action: "add", id: "g1", modelKey: "group" }, { id: "g1" }));
      ws.emitMessage(encode({ action: "update", id: "sr1", modelKey: "siren" }, { volume: 100 }));

      assert.equal(packets.length, 0);
      assert.equal(drift.length, 0, "a recognized-but-unmodeled key must not fire the schema-drift diagnostic");

      await stream.close();
    });

    test("an unsupported (non-binary) message frame is skipped without emitting", async () => {

      const { stream, ws } = await openStream();
      const packets = collect(stream, "packet");
      const errors = collect(stream, "error");

      ws.emitMessage("a string frame the binary protocol never sends");

      assert.equal(packets.length, 0);
      assert.equal(errors.length, 0);

      await stream.close();
    });
  });

  describe("decode failure resilience", () => {

    test("a malformed frame surfaces a ProtectProtocolError on the error rail and the stream stays open", async () => {

      const { stream, ws } = await openStream();
      const errors = collect(stream, "error");
      const packets = collect(stream, "packet");

      // Garbage bytes are not a well-formed packet; decodePacket throws and the stream reports it without tearing down.
      ws.emitMessage(Buffer.from([ 1, 2, 3 ]));

      assert.equal(errors.length, 1);
      assert.ok(first(errors)[0] instanceof ProtectProtocolError);

      // A subsequent good frame still flows - one bad frame does not desync the channel.
      ws.emitMessage(encode({ action: "add", id: "c1", modelKey: "camera" }, { id: "c1" }));
      assert.equal(packets.length, 1);

      await stream.close();
    });

    test("a decode failure does not terminate an open packets() iterator", async () => {

      const { stream, ws } = await openStream();
      const controller = new AbortController();
      const collected: TypedEvent[] = [];
      const task = (async (): Promise<void> => {

        for await (const event of stream.packets({ signal: controller.signal })) {

          collected.push(event);
        }
      })();

      // A malformed frame emits on the error rail; because the bus insulates that rail, the open packets() iterator survives and still receives the next good frame.
      ws.emitMessage(Buffer.from([ 1, 2, 3 ]));
      ws.emitMessage(encode({ action: "add", id: "c1", modelKey: "camera" }, { id: "c1" }));
      await expectAt(() => collected.length === 1);

      controller.abort();
      await task;

      assert.equal(collected.length, 1);
      assert.equal(collected[0]?.kind, "deviceAdded");

      await stream.close();
    });

    test("a socket error surfaces a typed error and closes the stream", async () => {

      const { stream, ws } = await openStream();
      const errors = collect(stream, "error");
      const closed = collect(stream, "closed");

      ws.emitError(new Error("socket reset"));

      // A socket error is a close forced from outside, so the stream closes with the abnormal-closure code.
      assert.ok(errors[0]?.[0] instanceof ProtectNetworkError);
      assert.equal(closed.length, 1);
      assert.equal(first(closed)[0].code, 1006);
      assert.equal(ws.closeRequested, true);

      await stream.close();
    });

    test("a socket error before the open reaches the caller on the handshake rejection alone", async () => {

      const log = capturingLog();
      const ws = new FakeWebSocket({ autoOpen: false });
      const stream = new EventStream({ clock: new TestClock(), host: HOST, lastUpdateId: "u0", log, webSocket: (): FakeWebSocket => ws });
      const errors = collect(stream, "error");
      const failure = new Error("socket reset");

      ws.emitError(failure);

      /* A stream that never opened has no recovery acting on it, only a caller waiting out the connect, so the failure is that caller's rejection and nothing else:
       * the classified failure itself, carrying what the socket reported, rather than the generic pre-open close. A rail fault here would start a recovery for a
       * connect its caller is already failing, and an error line would log one failure twice.
       */
      await assert.rejects(stream.opened, (error: unknown) => {

        assert.ok(error instanceof ProtectNetworkError);
        assert.ok(Object.is(error.cause, failure));
        assert.equal(error.message, "The UniFi Protect realtime events API connection failed.");

        return true;
      });

      assert.equal(errors.length, 0, "a fault before the open stays off the error rail");
      assert.equal(log.entries.some((entry) => entry.level === "error"), false, "a fault before the open leaves no error-level line from the stream itself");

      await stream.close();
    });
  });

  describe("silence watchdog", () => {

    test("a channel silent beyond the threshold emits ProtectStallError, logs one warning and tears down", async () => {

      const clock = new TestClock();
      const log = capturingLog();
      const { stream, ws } = await openStream({ clock, log });
      const errors = collect(stream, "error");
      const closed = collect(stream, "closed");

      // No frames arrive; advance to the watchdog's deadline and let it wake.
      clock.advance(PROTECT_EVENTS_WATCHDOG_TIMEOUT);
      await settle();

      // The platform raises a socket error here, after the teardown is over, and it carries a code as a reset does. A listener left attached would log a socket line
      // for it and put it on the rail beside the stall.
      ws.emitError(errnoError("read ECONNRESET", "ECONNRESET"));

      assert.equal(errors.length, 1);

      const [stallError] = first(errors);

      // A stall is a close forced by the channel going silent, so the stream closes with the abnormal-closure code.
      assert.ok(stallError instanceof ProtectStallError);
      assert.equal(stallError.silentForMs, PROTECT_EVENTS_WATCHDOG_TIMEOUT);
      assert.equal(closed.length, 1);
      assert.equal(first(closed)[0].code, 1006);
      assert.equal(ws.closeRequested, true);

      // Recovery heals a stall, so its one line is a warning, and the teardown detached the socket's error listener, so no socket line joins it.
      assert.deepEqual(log.entries.filter((entry) => entry.message.includes(WENT_SILENT)).map(({ level }) => level), ["warn"], "the stall logs one warning");
      assert.deepEqual(reportedLines(log), [], "and no socket line beside it");
    });

    test("a watchdog that fires before the socket opens rejects opened with its stall, logs nothing and leaves the rail empty", async () => {

      const clock = new TestClock();
      const log = capturingLog();
      const ws = new FakeWebSocket({ autoOpen: false });
      const stream = new EventStream({ clock, host: HOST, lastUpdateId: "u0", log, webSocket: (): FakeWebSocket => ws });
      const errors = collect(stream, "error");
      const closed = collect(stream, "closed");

      // The socket never opens, so the watchdog's first wake finds the stream silent since construction.
      clock.advance(PROTECT_EVENTS_WATCHDOG_TIMEOUT);
      await settle();

      /* A stream that never opened has a caller waiting out its connect and no recovery acting on it, so the stall is that caller's rejection and nothing else: the
       * typed stall itself rather than the generic pre-open close, and nothing on the rail, where it would start a recovery for a connect its caller is already
       * failing.
       */
      await assert.rejects(stream.opened, (error: unknown) => {

        assert.ok(error instanceof ProtectStallError);
        assert.equal(error.silentForMs, PROTECT_EVENTS_WATCHDOG_TIMEOUT);

        return true;
      });

      assert.equal(errors.length, 0, "a stall before the open stays off the error rail");
      assert.equal(first(closed)[0].code, 1006, "the stall still forces the close");
      assert.equal(ws.closeRequested, true);

      // The caller reports the stall from the rejection, so a line here as well would log one failure twice.
      assert.deepEqual(log.entries.filter((entry) => entry.message.includes(WENT_SILENT) || (entry.level !== "debug")), [],
        "a stall before the open logs nothing beside its rejection");
    });

    test("the watchdog does not trip while frames keep arriving", async () => {

      const clock = new TestClock();
      const { stream, ws } = await openStream({ clock });
      const errors = collect(stream, "error");

      // A frame arrives partway through the window; lastMessageAt advances, so the wake at the deadline finds the channel live.
      clock.advance(PROTECT_EVENTS_WATCHDOG_TIMEOUT - 1);
      ws.emitMessage(encode({ action: "add", id: "c1", modelKey: "camera" }, { id: "c1" }));
      clock.advance(1);
      await settle();

      assert.equal(errors.length, 0);

      await stream.close();
    });

    test("the watchdog wakes at its period and not before", async () => {

      const clock = new TestClock();
      const { stream, ws } = await openStream({ clock });
      const errors = collect(stream, "error");

      // The watchdog is the stream's only reader of the clock's timers, so the timeline's next deadline is its next wake: one threshold out from construction.
      assert.equal(clock.nextDeadline, PROTECT_EVENTS_WATCHDOG_TIMEOUT, "the first wake comes due one threshold after the watchdog arms");

      // A frame just short of the first wake keeps the channel live through it, and the loop parks for one more threshold from the moment it woke.
      clock.advance(PROTECT_EVENTS_WATCHDOG_TIMEOUT - 1);
      ws.emitMessage(encode({ action: "add", id: "c1", modelKey: "camera" }, { id: "c1" }));
      clock.advance(1);
      await settle();

      assert.equal(errors.length, 0, "the first wake found the channel live");
      assert.equal(clock.nextDeadline, 2 * PROTECT_EVENTS_WATCHDOG_TIMEOUT, "the second wake comes due one threshold after the first");

      // By the end of this advance the silence since the frame has reached the threshold, yet nothing reads it until the next wake, so detection lands inside the
      // [threshold, 2 x threshold) window rather than at the threshold itself.
      clock.advance(PROTECT_EVENTS_WATCHDOG_TIMEOUT - 1);
      await settle();

      assert.equal(errors.length, 0, "no wake comes between the deadlines");

      clock.advance(1);
      await settle();

      const [stallError] = first(errors);

      assert.ok(stallError instanceof ProtectStallError);
      assert.equal(stallError.silentForMs, PROTECT_EVENTS_WATCHDOG_TIMEOUT + 1, "the second wake reads the silence since the frame");
    });

    test("a backward step of the time of day leaves the silence the watchdog reports the time that passed", async () => {

      const clock = new TestClock();
      const { stream } = await openStream({ clock });
      const errors = collect(stream, "error");

      // No frame arrives. The time of day is set back, and the watchdog's wake is armed on the same timeline, so reaching it takes the step as well as the window,
      // all of it silence.
      clock.advance(-TIME_OF_DAY_STEP_MS);
      clock.advance(PROTECT_EVENTS_WATCHDOG_TIMEOUT + TIME_OF_DAY_STEP_MS);
      await settle();

      const [stallError] = first(errors);

      assert.ok(stallError instanceof ProtectStallError);
      assert.equal(stallError.silentForMs, PROTECT_EVENTS_WATCHDOG_TIMEOUT + TIME_OF_DAY_STEP_MS, "the silence is the time that passed, never shrunk by the step");
    });

    test("a backward step of the time of day past the rest of the window trips the watchdog at its next wake", async () => {

      const clock = new TestClock();
      const { stream, ws } = await openStream({ clock });
      const errors = collect(stream, "error");

      /* A frame lands halfway through the window, and the time of day is then set back a whole window. Reaching the wake takes the rest of the window and the step,
       * all of it silence since the frame and together past the threshold, though the time of day at the wake reads only half a window on from the frame.
       */
      clock.advance(PROTECT_EVENTS_WATCHDOG_TIMEOUT / 2);
      ws.emitMessage(encode({ action: "add", id: "c1", modelKey: "camera" }, { id: "c1" }));
      clock.advance(-PROTECT_EVENTS_WATCHDOG_TIMEOUT);
      clock.advance((PROTECT_EVENTS_WATCHDOG_TIMEOUT / 2) + PROTECT_EVENTS_WATCHDOG_TIMEOUT);
      await settle();

      const [stallError] = first(errors);

      assert.ok(stallError instanceof ProtectStallError, "the wake trips on the silence that passed");
      assert.equal(stallError.silentForMs, (PROTECT_EVENTS_WATCHDOG_TIMEOUT / 2) + PROTECT_EVENTS_WATCHDOG_TIMEOUT);
    });
  });

  describe("teardown", () => {

    test("close() emits closed once, detaches listeners, and is safe to call more than once", async () => {

      const { stream, ws } = await openStream();
      const closed = collect(stream, "closed");
      const packets = collect(stream, "packet");

      await stream.close();
      await stream.close();

      assert.equal(closed.length, 1, "closed fires exactly once across repeated close()");

      // After teardown the stream has removed every socket listener it registered, so a late frame delivers nothing.
      ws.emitMessage(encode({ action: "add", id: "c1", modelKey: "camera" }, { id: "c1" }));
      assert.equal(packets.length, 0);
    });

    test("close() swallows a socket close() fault and still tears down cleanly", async () => {

      const { stream, ws } = await openStream({ webSocket: (): FakeWebSocket => new FakeWebSocket({ autoOpen: false, closeFault: true }) });
      const closed = collect(stream, "closed");

      // A faulting socket close() must not escape close(): #shutdown swallows the fault and #onClose releases everything regardless,
      // so the close was requested and closed is announced once.
      await assert.doesNotReject(stream.close());
      assert.equal(ws.closeRequested, true);
      assert.equal(closed.length, 1);
    });

    test("a natural socket close emits closed, publishes the diagnostic, and settles disposal", async () => {

      const { stream, ws } = await openStream();
      const closed = collect(stream, "closed");
      const diagnostics: EventsClosedPayload[] = [];

      using closedSubscription = subscribeToChannel(channels.eventsClosed, (payload) => void diagnostics.push(payload));

      ws.emitClose(1000, "going away");

      assert.deepEqual(closed[0]?.[0], { code: 1000, reason: "going away" });
      assert.deepEqual(diagnostics[0], { code: 1000, reason: "going away" });

      // Disposal after a natural close is a no-op and does not throw.
      await stream[Symbol.asyncDispose]();
    });

    test("an unsolicited close of a live stream surfaces a recoverable error then closed", async () => {

      const { stream, ws } = await openStream();
      const errors = collect(stream, "error");
      const closed = collect(stream, "closed");
      const order: string[] = [];

      stream.on("error", () => void order.push("error"));
      stream.on("closed", () => void order.push("closed"));

      // The peer drops a live socket without our asking - exactly how a controller reboot arrives (a close event, no preceding socket error). This must reach the error
      // rail so the ConnectionMonitor's recovery loop triggers on an unsolicited close, exactly as it does on a socket error, and the error comes before closed.
      ws.emitClose(1006, "");

      assert.ok(first(errors)[0] instanceof ProtectNetworkError, "an unsolicited close must surface on the error rail so recovery triggers");
      assert.equal(closed.length, 1);
      assert.deepEqual(order, [ "error", "closed" ], "the recoverable error precedes the closed emission");

      await stream[Symbol.asyncDispose]();
    });

    test("a deliberate close emits closed without an error", async () => {

      const { stream } = await openStream();
      const errors = collect(stream, "error");
      const closed = collect(stream, "closed");

      // A self-initiated close is a clean lifecycle end, not a fault - it must not trip recovery, and it closes with the normal-closure code.
      await stream.close();

      assert.equal(errors.length, 0, "a self-initiated close is not a fault");
      assert.equal(closed.length, 1);
      assert.equal(first(closed)[0].code, 1000);
    });

    test("a peer close of an open stream names its frame on the error rail, with no string cause", async () => {

      const { stream, ws } = await openStream();
      const errors = collect(stream, "error");

      ws.emitClose(4000, "bye");

      // The chain renderer skips a cause that is not an Error, so the frame travels in the message, the one place every rendered failure shows it.
      const [failure] = first(errors);

      assert.ok(failure instanceof ProtectNetworkError);
      assert.equal(failure.message, "The UniFi Protect realtime events API connection closed unexpectedly (close code 4000: bye).");
      assert.equal(failure.cause, undefined);
    });

    test("a peer close before the open names its frame on the handshake rejection, with no string cause", async () => {

      const ws = new FakeWebSocket({ autoOpen: false });
      const stream = new EventStream({ clock: new TestClock(), host: HOST, lastUpdateId: "u0", log: silentLog(), webSocket: (): FakeWebSocket => ws });

      ws.emitClose(1006, "");

      await assert.rejects(stream.opened, (error: unknown) => {

        assert.ok(error instanceof ProtectNetworkError);
        assert.equal(error.message, "The UniFi Protect realtime events API closed before it finished connecting (close code 1006).");
        assert.equal(error.cause, undefined);

        return true;
      });
    });

    test("a close() before the open rejects the handshake with the stream's own sentence, carrying the client's close as its cause", async () => {

      const ws = new FakeWebSocket({ autoOpen: false });
      const stream = new EventStream({ clock: new TestClock(), host: HOST, lastUpdateId: "u0", log: silentLog(), webSocket: (): FakeWebSocket => ws });

      await stream.close();

      // A close the stream chose keeps its reason as the cause, where a peer's close names its frame in the message and carries none.
      await assert.rejects(stream.opened, { cause: "the events stream was closed by the client", constructor: ProtectNetworkError,
        message: "The UniFi Protect realtime events API closed before it finished connecting." });
    });

    test("a close() a rail listener forces from inside a socket error keeps the fault's code and reason", async () => {

      const { stream, ws } = await openStream();
      const closed = collect(stream, "closed");

      // The listener runs inside the teardown the fault started, so the close it asks for finds that teardown already under way and leaves its reason standing.
      stream.on("error", () => void stream.close());
      ws.emitError(new Error("socket reset"));

      assert.deepEqual(closed, [[{ code: 1006, reason: "the events stream connection errored" }]]);
    });

    test("a close() re-entered from a closed listener runs no second teardown and resolves", async () => {

      const { stream } = await openStream();
      const closed = collect(stream, "closed");
      const reentered: Promise<void>[] = [];

      stream.on("closed", () => void reentered.push(stream.close()));

      await stream.close();
      await Promise.all(reentered);

      assert.equal(reentered.length, 1, "the closed listener ran once and its close() resolved");
      assert.equal(closed.length, 1, "and the teardown it re-entered announced the close once");
    });

    test("a logger that throws on an open socket's fault line throws only after the rail heard the fault", async () => {

      const log: ProtectLogging = { ...silentLog(), warn: (message: string): void => {

        if(message === REPORTED) {

          throw new Error("the logger refused the fault's line");
        }
      } };
      const { stream, ws } = await openStream({ log });
      const errors = collect(stream, "error");

      // The fake hands a listener's throw back to the caller, so the logger's throw from inside the teardown surfaces here, after every report ahead of the line.
      assert.throws(() => ws.emitError(errnoError("read ECONNRESET", "ECONNRESET")), /the logger refused the fault's line/);
      assert.equal(errors.length, 1, "the rail heard the fault ahead of the line");
      assert.equal(ws.closeRequested, true, "and the socket was asked to close");
    });

    test("the connection lifecycle logs (connect and close) are debug, not info", async () => {

      // openStream() already fires the connect line via ws.emitOpen(); the unsolicited close then fires the close line. Both are routine per-connection bookkeeping, so
      // the ConnectionMonitor (not the stream) owns the recovery-success narration and these two lines must sit at debug.
      const log = capturingLog();
      const { stream, ws } = await openStream({ log });

      ws.emitClose(1000, "going away");

      assert.ok(log.entries.some((entry) => (entry.level === "debug") && entry.message.includes("Connected to the UniFi Protect realtime events API.")),
        "the events-stream connect line must log at debug, not info");
      assert.ok(log.entries.some((entry) => (entry.level === "debug") && entry.message.includes("connection closed.")),
        "the events-stream close line must log at debug, not info");

      await stream[Symbol.asyncDispose]();
    });

    test("lastMessageAt reflects the clock at the most recent frame", async () => {

      const clock = new TestClock();
      const { stream, ws } = await openStream({ clock });

      clock.advance(1234);
      ws.emitMessage(encode({ action: "add", id: "c1", modelKey: "camera" }, { id: "c1" }));

      assert.equal(stream.lastMessageAt, 1234);

      await stream.close();
    });

    test("lastMessageAt advances on a frame the stream skips as unsupported", async () => {

      const clock = new TestClock();
      const { stream, ws } = await openStream({ clock });

      // Any frame from the controller proves the channel is alive, decodable or not, so the liveness stamp lands before the frame's type is read.
      clock.advance(1234);
      ws.emitMessage("a string frame the binary protocol never sends");

      assert.equal(stream.lastMessageAt, 1234);

      await stream.close();
    });
  });

  /* Every listener the stream registers, on its socket and on the caller's signal, comes off in its teardown by the identity it was registered under. The fake
   * removes a listener on that request and on no other, so a teardown that forgot one leaves it for the count to read, and a socket that fails from inside close(),
   * as undici fails one still connecting, reaches nothing only when the teardown took its listeners off first.
   */
  describe("listener detach", () => {

    test("a pre-open close() over a socket that fails from inside close() closes 1000 with the stream's own reason, leaving the rail empty", async () => {

      const ws = new FakeWebSocket({ autoOpen: false, failsOnClose: true });
      const stream = new EventStream({ clock: new TestClock(), host: HOST, lastUpdateId: "u0", log: silentLog(), webSocket: (): FakeWebSocket => ws });
      const errors = collect(stream, "error");
      const closed = collect(stream, "closed");

      await stream.close();

      // The socket's error and its close 1006 fire inside close() and reach no listener, so the one teardown that runs is the one the stream asked for.
      assert.deepEqual(closed, [[{ code: 1000, reason: "the events stream was closed by the client" }]]);
      assert.equal(errors.length, 0, "a teardown the stream chose stays off the error rail");
      await assert.rejects(stream.opened, { constructor: ProtectNetworkError, message: "The UniFi Protect realtime events API closed before it finished connecting." });
    });

    // What a row hands the teardown path it runs.
    interface Stage {

      clock: TestClock;
      controller: AbortController;
      stream: EventStream;
      ws: FakeWebSocket;
    }

    /* Each way a teardown starts, run on a stream that opened and on one still connecting. The caller's signal stays live through every path but its own abort, and
     * it binds the stream only until the open, so its abort tears down a stream still connecting alone: on an open stream the row reads the binding the open removed
     * and the socket's listeners still in place.
     */
    const teardowns: { name: string; run: (stage: Stage) => Promise<void> | void; tearsDownOpen: boolean }[] = [

      { name: "close()", run: async ({ stream }): Promise<void> => stream.close(), tearsDownOpen: true },
      { name: "a peer close", run: ({ ws }): void => ws.emitClose(1001, "going away"), tearsDownOpen: true },
      { name: "a socket error", run: ({ ws }): void => ws.emitError(new Error("socket reset")), tearsDownOpen: true },
      { name: "a watchdog stall", run: async ({ clock }): Promise<void> => {

        clock.advance(PROTECT_EVENTS_WATCHDOG_TIMEOUT);
        await settle();
      }, tearsDownOpen: true },
      { name: "a caller abort", run: ({ controller }): void => controller.abort(), tearsDownOpen: false }
    ];

    for(const { name, run, tearsDownOpen } of teardowns) {

      for(const open of [ true, false ]) {

        const tearsDown = !open || tearsDownOpen;

        test("after " + name + (open ? " of an open stream" : " before the open") + (tearsDown ? " the socket holds no listener and the caller's signal no binding" :
          " the caller's signal holds no binding, the open having removed it, and the socket keeps its listeners"), async () => {

          const clock = new TestClock();
          const controller = new AbortController();
          const ws = new FakeWebSocket({ autoOpen: false });
          const stream = new EventStream({ clock, host: HOST, lastUpdateId: "u0", log: silentLog(), signal: controller.signal, webSocket: (): FakeWebSocket => ws });

          if(open) {

            ws.emitOpen();
            await stream.opened;
          }

          // What the stream holds as the run begins, which a run that starts no teardown leaves exactly as it found it.
          const bound = getEventListeners(controller.signal, "abort").length;
          const held = ws.listenerCount();

          await run({ clock, controller, stream, ws });

          if(!tearsDown) {

            assert.equal(bound, 0, "the open removed the binding to the caller's signal");
            assert.equal(ws.listenerCount(), held, "and the live stream keeps every socket listener it holds");
            await stream.close();

            return;
          }

          assert.equal(ws.listenerCount(), 0, "every socket listener the stream registered is removed");
          assert.equal(getEventListeners(controller.signal, "abort").length, 0, "and so is the binding to the caller's signal");
        });
      }
    }
  });

  /* What the stream does with the connection it owns, over the default factory's real socket. A fake has no connection to release and never fires the synchronous
   * `error` and `close` a real socket fires when it is closed mid-connect, so nothing above a fake can tell whether the real connection was let go or whether a
   * teardown the stream asked for reached its error rail. Each row bounds a release on real time, against undici's ten-second connect timer.
   */
  describe("a real connection", () => {

    test("close() of a live stream ends its connection at once, though the peer never answers the close frame", async () => {

      await using peer = await createLoopbackWebSocketPeer();
      const stream = new EventStream({ clock: new TestClock(), host: peer.host, lastUpdateId: "u0", log: silentLog() });

      await stream.opened;

      const connection = await peer.connection(0);
      const startedAt = process.hrtime.bigint();

      // The peer holds its own end open and ignores the close frame, so nothing but the stream's release of the socket the upgrade handed over can end it.
      await stream.close();
      await connection.closed;

      assert.ok(elapsedSince(startedAt) < DIAL_SETTLE_BOUND_MS, "the stream's close releases the connection rather than waiting on the peer");
    });

    test("close() has released the connection it owns by the time a closed listener runs", async () => {

      await using peer = await createLoopbackWebSocketPeer();

      /* The stream holds its socket privately, so the row takes it from undici's own announcement of every connection a client establishes. The peer learns of a
       * severance only on a later turn, which makes its end the wrong observer here: what the row reads is the order inside the stream, the socket already destroyed
       * when `closed` is delivered.
       */
      using announced = announcedSockets();

      const stream = new EventStream({ clock: new TestClock(), host: peer.host, lastUpdateId: "u0", log: silentLog() });

      await stream.opened;

      const destroyedAtClosed: boolean[] = [];

      stream.on("closed", () => void destroyedAtClosed.push(announced.sockets.every((socket) => socket.destroyed)));

      await stream.close();

      assert.equal(announced.sockets.length, 1, "the one socket the stream dialed was announced");
      assert.deepEqual(destroyedAtClosed, [true], "the connection is released before closed is delivered");
    });

    test("an open stream's stall reaches the error rail only once the connection is released", async () => {

      await using peer = await createLoopbackWebSocketPeer();
      using announced = announcedSockets();

      const clock = new TestClock();
      const stream = new EventStream({ clock, host: peer.host, lastUpdateId: "u0", log: silentLog() });
      const releasedAtRail: boolean[] = [];

      // The rail listener is the stall's first report, and it reads the socket from inside the teardown, where the release has already run or has not.
      stream.on("error", () => void releasedAtRail.push(announced.sockets.every((socket) => socket.destroyed)));

      await stream.opened;
      clock.advance(PROTECT_EVENTS_WATCHDOG_TIMEOUT);
      await settle();

      assert.equal(announced.sockets.length, 1, "the one socket the stream dialed was announced");
      assert.deepEqual(releasedAtRail, [true], "the stall reaches the rail with the connection already released");

      await stream.close();
    });

    test("a logger that throws on an open stream's stall warning leaves the connection released, with the stall on the rail", async () => {

      await using peer = await createLoopbackWebSocketPeer();
      using announced = announcedSockets();

      let threw = false;
      const clock = new TestClock();
      const log: ProtectLogging = { ...silentLog(), warn: (message: string): void => {

        if(message.includes(WENT_SILENT)) {

          threw = true;

          throw new Error("the logger refused the stall's line");
        }
      } };
      const stream = new EventStream({ clock, host: peer.host, lastUpdateId: "u0", log });
      const errors = collect(stream, "error");

      await stream.opened;

      // The watchdog's wake reaches the stall's line only inside the teardown, after the release and the rail fault, and the throw ends the loop where it was caught.
      clock.advance(PROTECT_EVENTS_WATCHDOG_TIMEOUT);
      await settle();

      assert.equal(threw, true, "the logger threw on the stall's line");
      assert.deepEqual(announced.sockets.map((socket) => socket.destroyed), [true], "the connection is released though the line threw");
      assert.equal(errors.length, 1, "and the rail heard the stall ahead of the line");
      assert.ok(first(errors)[0] instanceof ProtectStallError);

      await stream.close();
    });

    test("a logger that throws on the close line leaves the connection released", async () => {

      await using peer = await createLoopbackWebSocketPeer();
      let threw = false;
      const log: ProtectLogging = { ...silentLog(), debug: (message: string): void => {

        if(message === "The UniFi Protect realtime events API connection closed.") {

          threw = true;

          throw new Error("the logger refused the close line");
        }
      } };
      const stream = new EventStream({ clock: new TestClock(), host: peer.host, lastUpdateId: "u0", log });

      await stream.opened;

      const severed = settlement((await peer.connection(0)).closed);

      /* The bus contains a listener's throw, but nothing contains the logger's, so the throw leaves the teardown at its close line and close() rejects with it, a
       * rejection this row lets pass. What the row reads is that the logger did throw at the close line, and the release behind it: started ahead of that line, it
       * severs the connection whatever the logger did.
       */
      await stream.close().catch(() => undefined);

      assert.equal(threw, true, "the logger threw on the close line");

      await expectAt(severed, { message: "the connection is severed within the bound", timeoutMs: DIAL_SETTLE_BOUND_MS });
    });

    test("a caller abort during the TLS dial releases the socket at once and keeps the error rail empty", async () => {

      await using peer = await createLoopbackSilentPeer();

      const controller = new AbortController();
      const stream = new EventStream({ clock: new TestClock(), host: peer.host, lastUpdateId: "u0", log: silentLog(), signal: controller.signal });
      const closed = collect(stream, "closed");
      const errors = collect(stream, "error");
      const connection = await peer.connection(0);
      const startedAt = process.hrtime.bigint();

      /* The peer accepts the connection and answers nothing, so the TLS handshake is still in flight when the caller cancels. The listeners come off before the socket
       * is asked to close, which is what keeps a teardown the stream itself ran off the error rail and names the caller's cancel on the close rail.
       */
      controller.abort();

      await assert.rejects(stream.opened, ProtectAbortedError);
      await connection.closed;

      assert.ok(elapsedSince(startedAt) < DIAL_SETTLE_BOUND_MS, "a cancelled connection attempt is released at once rather than lingering to undici's own timer");
      assert.equal(errors.length, 0, "a caller's cancel before open reaches the opened handshake alone");
      assert.deepEqual(closed, [[{ code: 1000, reason: "connection aborted by the caller's signal" }]], "the close rail names the caller's cancel");

      await stream.close();
    });

    test("a caller abort while the upgrade is pending keeps the error rail empty, over a connection that offered HTTP/1.1 alone", async () => {

      await using peer = await createLoopbackAlpnPeer();

      const controller = new AbortController();
      const stream = new EventStream({ clock: new TestClock(), host: peer.host, lastUpdateId: "u0", log: silentLog(), signal: controller.signal });
      const errors = collect(stream, "error");
      const connection = await peer.connection(0);

      // The peer offers h2 ahead of http/1.1, so negotiating http/1.1 is a reading of the stream's own offer, which a WebSocket upgrade keeps to HTTP/1.1.
      assert.equal(await peer.protocol(0), "http/1.1");

      // One stage further along than the row above: TLS has completed and the upgrade is what goes unanswered. The teardown is the stream's own either way.
      controller.abort();

      await assert.rejects(stream.opened, ProtectAbortedError);
      await connection.closed;
      await stream.close();

      assert.equal(errors.length, 0, "a caller's cancel before open reaches the opened handshake alone");
    });

    test("a dial nothing is listening for carries the platform's own errno to the caller", async () => {

      const stream = new EventStream({ clock: new TestClock(), host: "127.0.0.1:" + (await freePort()).toString(), lastUpdateId: "u0", log: silentLog() });
      const errors = collect(stream, "error");

      /* Every dial failure loses its errno on the way to the socket's error event, not a certificate refusal alone, so a refused port arrives as an empty failure
       * unless the connector's record is read first. This is the row that says the record serves the whole class rather than the certificate case.
       */
      await assert.rejects(stream.opened, (error: unknown) => {

        assert.ok(error instanceof ProtectNetworkError, "a refused dial is a reachability failure");
        assert.ok(!(error instanceof ProtectCertificateError), "and nothing about a certificate, since no handshake was reached to present one");
        assert.equal(error.code, "ECONNREFUSED");

        return true;
      });

      assert.equal(errors.length, 0, "a failure before the open stays off the error rail");

      await stream.close();
    });

    test("a connection attempt that times out reaches the caller as ProtectTimeoutError measured on the injected clock", async (t) => {

      await using peer = await createLoopbackSilentPeer();

      const clock = new TestClock();
      const dials: TLSSocket[] = [];
      const dial = tls.connect;
      const elapsedMs = 2500;
      const log = capturingLog();

      /* undici's own connect timer runs on real time, ten seconds of it, so this row reaches a connect timeout by undici's other route to one. The platform's dial is
       * wrapped for this test alone, which hands the row the socket the owned connector vended, and destroying that socket with the aggregate `ETIMEDOUT` the
       * platform raises when every attempted address times out is what undici's connect normalization turns into its `ConnectTimeoutError`. The failure therefore
       * reaches the stream exactly as a real one does, through the connector's record of the dial.
       */
      t.mock.method(tls, "connect", (options: ConnectionOptions): TLSSocket => {

        const socket = dial(options);

        dials.push(socket);

        return socket;
      });

      const stream = new EventStream({ clock, host: peer.host, lastUpdateId: "u0", log });
      const errors = collect(stream, "error");

      await peer.connection(0);
      clock.advance(elapsedMs);

      present(dials[0], "the dial the owned connector vended").destroy(Object.assign(new AggregateError([errnoError("connect ETIMEDOUT " + peer.host, "ETIMEDOUT")],
        "connect ETIMEDOUT"), { code: "ETIMEDOUT" }));

      await assert.rejects(stream.opened, (error: unknown) => {

        assert.ok(error instanceof ProtectTimeoutError, "a connection attempt that timed out reads as a timeout, as it does on the request path");
        assert.equal(error.message, "The UniFi Protect realtime events API connection timed out.");
        assert.equal(error.elapsedMs, elapsedMs, "the elapsed time is the injected clock's own measure from the start of the attempt");
        assert.equal((error.cause as NodeJS.ErrnoException).code, "UND_ERR_CONNECT_TIMEOUT", "the cause is undici's normalization, read from the connector's record");

        return true;
      });

      assert.equal(errors.length, 0, "a failure before the open stays off the error rail");
      assert.equal(log.entries.some((entry) => entry.level === "error"), false, "a failure before the open leaves no error-level line from the stream itself");

      await stream.close();
    });

    /* The ways an open socket's connection ends, each over the owned connector, because undici's WebSocket reports every one of them as the same empty `TypeError`
     * and only the connector's record of the established connection tells them apart. A fake socket has no connector, so none of these is reachable over one.
     */
    test("a peer's reset of an open stream logs one warning naming ECONNRESET and puts that reset on the rail", async () => {

      await using peer = await createLoopbackWebSocketPeer();
      const log = capturingLog();
      const stream = new EventStream({ clock: new TestClock(), host: peer.host, lastUpdateId: "u0", log });
      const errors = collect(stream, "error");

      await stream.opened;

      (await peer.connection(0)).reset();

      await expectAt(() => errors.length === 1, { message: "expected the reset to reach the error rail" });

      const [failure] = first(errors);
      const [line] = reportedLines(log);

      assert.ok(failure instanceof ProtectNetworkError, "a reset is a reachability failure");
      assert.equal(failure.code, "ECONNRESET", "carrying the reset its own socket raised rather than the event's empty error");
      assert.deepEqual(reportedLines(log).map(({ level }) => level), ["warn"], "a reset heals itself, so its one line is a warning");
      assert.ok(Object.is((present(line, "the socket's line").args[0] as { error: unknown }).error, failure.cause), "and the line names the fault the rail carries");

      await stream.close();
    });

    test("a peer's hang-up on an open stream without a close frame logs no line", async () => {

      await using peer = await createLoopbackWebSocketPeer();
      const log = capturingLog();
      const stream = new EventStream({ clock: new TestClock(), host: peer.host, lastUpdateId: "u0", log });
      const errors = collect(stream, "error");

      await stream.opened;

      (await peer.connection(0)).end();

      await expectAt(() => errors.length === 1, { message: "expected the hang-up to reach the error rail" });

      const [failure] = first(errors);

      // A hang-up is how an open connection ordinarily ends: the socket raised nothing of its own, so the event's empty error is the whole account.
      assert.ok(failure instanceof ProtectNetworkError);
      assert.equal(failure.code, undefined, "a hang-up carries no code");
      assert.deepEqual(reportedLines(log), [], "and logs no line, while recovery still hears it on the rail");

      await stream.close();
    });

    test("an ETIMEDOUT the open stream's socket raises logs one warning", async (t) => {

      await using peer = await createLoopbackWebSocketPeer();

      const dials: TLSSocket[] = [];
      const dial = tls.connect;
      const log = capturingLog();

      // The platform's dial is wrapped for this test alone, which hands the row the socket the owned connector vended, so the platform's own timeout can be raised on it.
      t.mock.method(tls, "connect", (options: ConnectionOptions): TLSSocket => {

        const socket = dial(options);

        dials.push(socket);

        return socket;
      });

      const stream = new EventStream({ clock: new TestClock(), host: peer.host, lastUpdateId: "u0", log });
      const errors = collect(stream, "error");

      await stream.opened;

      // The error the platform raises when its own timer gives up on a peer that stopped answering, a numeric errno beside its code.
      present(dials[0], "the socket the owned connector vended").destroy(Object.assign(new Error("read ETIMEDOUT"),
        { code: "ETIMEDOUT", errno: -constants.errno.ETIMEDOUT, syscall: "read" }));

      await expectAt(() => errors.length === 1, { message: "expected the timeout to reach the error rail" });

      const [failure] = first(errors);

      assert.ok(failure instanceof ProtectNetworkError, "a peer that stopped answering is out of reach");
      assert.equal(failure.code, "ETIMEDOUT");
      assert.deepEqual(reportedLines(log).map(({ level }) => level), ["warn"], "an unreachable peer heals itself, so its one line is a warning");

      await stream.close();
    });

    test("a peer that resets the upgrade before the stream opens rejects opened carrying ECONNRESET, with no line and nothing on the rail", async () => {

      await using peer = await createLoopbackWebSocketPeer({ resetUpgrade: true });
      const log = capturingLog();
      const stream = new EventStream({ clock: new TestClock(), host: peer.host, lastUpdateId: "u0", log });
      const errors = collect(stream, "error");

      // The dial succeeded, so the connector holds no dial failure, and the reset of the established connection is the record the one cause reads.
      await assert.rejects(stream.opened, (error: unknown) => {

        assert.ok(error instanceof ProtectNetworkError);
        assert.equal(error.message, "The UniFi Protect realtime events API connection failed.");
        assert.equal(error.code, "ECONNRESET", "the rejection carries the reset the socket raised during the upgrade");

        return true;
      });

      assert.equal(errors.length, 0, "a failure before the open stays off the error rail");
      assert.deepEqual(reportedLines(log), [], "and logs no line, its caller reporting it from the rejection");

      await stream.close();
    });
  });
});
