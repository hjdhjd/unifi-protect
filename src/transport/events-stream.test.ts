/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * events-stream.test.ts: Tests for EventStream - the single decode site, the three-rail fan-out, schema-drift surfacing, decode-failure resilience, the silence
 * watchdog, and teardown. Driven through an injected fake WebSocket and a fake Clock, so the realtime stream is exercised deterministically without a live controller.
 */
import { ProtectAbortedError, ProtectNetworkError, ProtectProtocolError, ProtectStallError } from "../errors.ts";
import { buildPacket, jsonActionFrame, jsonDataFrame, makeActionHeader } from "../protocol/packet.helpers.ts";
import { capturingLog, expectAt, fakeClock, silentLog } from "../testing.helpers.ts";
import { describe, test } from "node:test";
import { EventStream } from "./events-stream.ts";
import type { EventStreamEvents } from "./events-stream.ts";
import type { FakeClock } from "../testing.helpers.ts";
import { FakeWebSocket } from "./events-stream.helpers.ts";
import { PROTECT_EVENTS_WATCHDOG_TIMEOUT } from "../settings.ts";
import type { ProtectLogging } from "../logging.ts";
import type { SchemaUnknownModelKeyPayload } from "../diagnostics.ts";
import type { TypedEvent } from "../protocol/events.ts";
import assert from "node:assert/strict";
import { channels } from "../diagnostics.ts";

const HOST = "10.0.0.1";

// Encode a realtime packet from an action header and a JSON data payload - the same byte layout decodePacket reads, so the stream decodes exactly what we synthesize.
function encode(header: Partial<{ action: string; id: string; modelKey: string }>, payload: object): Buffer {

  return buildPacket(jsonActionFrame(makeActionHeader(header)), jsonDataFrame(payload));
}

// Construct an open stream over a fake socket, returning the stream, the socket, and the clock. The socket does not auto-open so each test controls the handshake.
async function openStream(options: { clock?: FakeClock; log?: ProtectLogging } = {}): Promise<{ clock: FakeClock; stream: EventStream; ws: FakeWebSocket }> {

  const clock = options.clock ?? fakeClock();
  const log = options.log ?? silentLog();
  const ws = new FakeWebSocket({ autoOpen: false });
  const stream = new EventStream({ clock, host: HOST, lastUpdateId: "u0", log, webSocket: () => ws });

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

      const ws = new FakeWebSocket();

      await using stream = await EventStream.connect({ host: HOST, lastUpdateId: "u0", log: silentLog(), webSocket: () => ws });

      assert.ok(stream instanceof EventStream);
    });

    test("opened rejects with a ProtectNetworkError when the socket closes before opening", async () => {

      const ws = new FakeWebSocket({ autoOpen: false });
      const stream = new EventStream({ host: HOST, lastUpdateId: "u0", log: silentLog(), webSocket: () => ws });

      ws.emitClose(1006, "handshake failed");

      await assert.rejects(stream.opened, ProtectNetworkError);
      await stream.close();
    });

    test("an already-aborted caller signal tears the stream down before it opens", async () => {

      const ws = new FakeWebSocket({ autoOpen: false });
      const controller = new AbortController();

      controller.abort();

      const stream = new EventStream({ host: HOST, lastUpdateId: "u0", log: silentLog(), signal: controller.signal, webSocket: () => ws });

      await assert.rejects(stream.opened, ProtectAbortedError);
      assert.equal(ws.closeRequested, true);
    });

    test("aborting the caller signal after construction but before open rejects opened", async () => {

      const ws = new FakeWebSocket({ autoOpen: false });
      const controller = new AbortController();
      const stream = new EventStream({ host: HOST, lastUpdateId: "u0", log: silentLog(), signal: controller.signal, webSocket: () => ws });

      controller.abort();

      await assert.rejects(stream.opened, ProtectAbortedError);
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
      assert.deepEqual(raw[1]?.[0].payload, { id: "g1" });

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

      controller.abort();

      // The raw stream rail rejects on abort (node:events' contract) - unlike the packets() sugar, which returns cleanly. Either way nothing more is delivered.
      await assert.rejects(task);
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
      const payloads: { id?: string; kind: string; modelKey?: string }[] = [];
      const onMessage = (message: unknown): void => void payloads.push(message as { kind: string });

      channels.eventsPacket.subscribe(onMessage);

      try {

        ws.emitMessage(encode({ action: "update", id: "c1", modelKey: "camera" }, { name: "Renamed" }));
        ws.emitMessage(encode({ action: "add", id: "evt1", modelKey: "event" }, { camera: "c1", start: 1, type: "ring" }));

        assert.deepEqual(payloads[0], { id: "c1", kind: "devicePatched", modelKey: "camera" });
        assert.deepEqual(payloads[1], { kind: "doorbellRing" });
      } finally {

        channels.eventsPacket.unsubscribe(onMessage);
      }

      await stream.close();
    });
  });

  describe("unclassified frames", () => {

    test("an unmodeled model key publishes schema:unknownModelKey once per (modelKey, action)", async () => {

      const { stream, ws } = await openStream();
      const drift: SchemaUnknownModelKeyPayload[] = [];
      const onDrift = (message: unknown): void => void drift.push(message as SchemaUnknownModelKeyPayload);

      channels.schemaUnknownModelKey.subscribe(onDrift);

      try {

        // Two frames with the same unmodeled (modelKey, action) publish the drift signal once; a different action publishes again.
        ws.emitMessage(encode({ action: "add", id: "g1", modelKey: "garage" }, { id: "g1" }));
        ws.emitMessage(encode({ action: "add", id: "g2", modelKey: "garage" }, { id: "g2" }));
        ws.emitMessage(encode({ action: "update", id: "g1", modelKey: "garage" }, { id: "g1" }));

        assert.equal(drift.length, 2);
        assert.deepEqual(drift[0], { action: "add", exampleId: "g1", modelKey: "garage" });
        assert.deepEqual(drift[1], { action: "update", exampleId: "g1", modelKey: "garage" });
      } finally {

        channels.schemaUnknownModelKey.unsubscribe(onDrift);
      }

      await stream.close();
    });

    test("a modeled-but-unlifted frame emits no packet and no schema-drift signal", async () => {

      const { stream, ws } = await openStream();
      const packets = collect(stream, "packet");
      const drift: unknown[] = [];
      const onDrift = (message: unknown): void => void drift.push(message);

      channels.schemaUnknownModelKey.subscribe(onDrift);

      try {

        // An `event` frame that does not self-describe (no recognized type, no camera) classifies to null - but `event` is recognized, so it is not schema drift.
        ws.emitMessage(encode({ action: "update", id: "evt1", modelKey: "event" }, { score: 50 }));

        assert.equal(packets.length, 0);
        assert.equal(drift.length, 0);
      } finally {

        channels.schemaUnknownModelKey.unsubscribe(onDrift);
      }

      await stream.close();
    });

    test("a recognized-but-unmodeled model key emits no packet and no schema-drift signal", async () => {

      const { stream, ws } = await openStream();
      const packets = collect(stream, "packet");
      const drift: unknown[] = [];
      const onDrift = (message: unknown): void => void drift.push(message);

      channels.schemaUnknownModelKey.subscribe(onDrift);

      try {

        // `group` and `bridge` are known wire model keys the library recognizes but deliberately does not reduce into state - they classify to null but are not drift, so
        // they must stay silent on the diagnostic. This is the honest-diagnostic guarantee: schema:unknownModelKey fires only for genuinely novel keys. (`liveview` is
        // itself a reduced StateModelKey, so it produces a packet and is exercised in the reducer/classifier tests rather than here.)
        ws.emitMessage(encode({ action: "update", id: "br1", modelKey: "bridge" }, { name: "Front" }));
        ws.emitMessage(encode({ action: "add", id: "g1", modelKey: "group" }, { id: "g1" }));

        assert.equal(packets.length, 0);
        assert.equal(drift.length, 0, "a recognized-but-unmodeled key must not fire the schema-drift diagnostic");
      } finally {

        channels.schemaUnknownModelKey.unsubscribe(onDrift);
      }

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

      assert.ok(errors[0]?.[0] instanceof ProtectNetworkError);
      assert.equal(closed.length, 1);
      assert.equal(ws.closeRequested, true);

      await stream.close();
    });
  });

  describe("silence watchdog", () => {

    test("a channel silent beyond the threshold emits ProtectStallError and tears down", async () => {

      const clock = fakeClock();
      const { stream, ws } = await openStream({ clock });
      const errors = collect(stream, "error");
      const closed = collect(stream, "closed");

      // No frames arrive; advance past the watchdog window and release one watchdog tick.
      clock.advance(PROTECT_EVENTS_WATCHDOG_TIMEOUT);
      await clock.tick();

      assert.equal(errors.length, 1);

      const [stallError] = first(errors);

      assert.ok(stallError instanceof ProtectStallError);
      assert.equal(stallError.silentForMs, PROTECT_EVENTS_WATCHDOG_TIMEOUT);
      assert.equal(closed.length, 1);
      assert.equal(ws.closeRequested, true);
    });

    test("the watchdog does not trip while frames keep arriving", async () => {

      const clock = fakeClock();
      const { stream, ws } = await openStream({ clock });
      const errors = collect(stream, "error");

      // A frame arrives partway through the window; lastMessageAt advances, so the next tick finds the channel live.
      clock.advance(PROTECT_EVENTS_WATCHDOG_TIMEOUT - 1);
      ws.emitMessage(encode({ action: "add", id: "c1", modelKey: "camera" }, { id: "c1" }));
      clock.advance(1);
      await clock.tick();

      assert.equal(errors.length, 0);

      await stream.close();
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

      // After teardown the single AbortController has detached every socket listener, so a late frame delivers nothing.
      ws.emitMessage(encode({ action: "add", id: "c1", modelKey: "camera" }, { id: "c1" }));
      assert.equal(packets.length, 0);
    });

    test("a natural socket close emits closed, publishes the diagnostic, and settles disposal", async () => {

      const { stream, ws } = await openStream();
      const closed = collect(stream, "closed");
      const diagnostics: { code: number; reason: string }[] = [];
      const onClosed = (message: unknown): void => void diagnostics.push(message as { code: number; reason: string });

      channels.eventsClosed.subscribe(onClosed);

      try {

        ws.emitClose(1000, "going away");

        assert.deepEqual(closed[0]?.[0], { code: 1000, reason: "going away" });
        assert.deepEqual(diagnostics[0], { code: 1000, reason: "going away" });
      } finally {

        channels.eventsClosed.unsubscribe(onClosed);
      }

      // Disposal after a natural close is a no-op and does not throw.
      await stream[Symbol.asyncDispose]();
    });

    test("an unsolicited close of a live stream surfaces a recoverable error then closed", async () => {

      const { stream, ws } = await openStream();
      const errors = collect(stream, "error");
      const closed = collect(stream, "closed");

      // The peer drops a live socket without our asking - exactly how a controller reboot arrives (a close event, no preceding socket error). This must reach the error
      // rail so the ConnectionMonitor's recovery loop triggers on an unsolicited close, exactly as it does on a socket error.
      ws.emitClose(1006, "");

      assert.ok(first(errors)[0] instanceof ProtectNetworkError, "an unsolicited close must surface on the error rail so recovery triggers");
      assert.equal(closed.length, 1);

      await stream[Symbol.asyncDispose]();
    });

    test("a deliberate close emits closed without an error", async () => {

      const { stream } = await openStream();
      const errors = collect(stream, "error");
      const closed = collect(stream, "closed");

      // A self-initiated close is a clean lifecycle end, not a fault - it must not trip recovery.
      await stream.close();

      assert.equal(errors.length, 0, "a self-initiated close is not a fault");
      assert.equal(closed.length, 1);
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

      const clock = fakeClock();
      const { stream, ws } = await openStream({ clock });

      clock.advance(1234);
      ws.emitMessage(encode({ action: "add", id: "c1", modelKey: "camera" }, { id: "c1" }));

      assert.equal(stream.lastMessageAt, 1234);

      await stream.close();
    });
  });
});
