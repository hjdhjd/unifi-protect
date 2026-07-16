/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * livestream-session.test.ts: Tests for LivestreamSession - URL negotiation, the fMP4 frame decode (init/media/reassembly/timestamps), the FSM, the silence watchdog,
 * and teardown. Driven through an injected fake WebSocket, a fake resolver, and a fake Clock, so the session is exercised deterministically without a live controller.
 */
import { FRAME_END_SEGMENT, FRAME_MOOF, buildInitSegment, buildLiveFrame, buildMediaSegment } from "./livestream-session.helpers.ts";
import { LivestreamSession, livestreamKey, resolveLivestreamSpec } from "./livestream-session.ts";
import { ProtectAbortedError, ProtectNetworkError, ProtectStallError } from "../errors.ts";
import { describe, test } from "node:test";
import { fakeClock, silentLog } from "../testing.helpers.ts";
import type { FakeClock } from "../testing.helpers.ts";
import { FakeWebSocket } from "./events-stream.helpers.ts";
import type { LivestreamSpec } from "./livestream-session.ts";
import { PROTECT_LIVESTREAM_HEARTBEAT_TIMEOUT } from "../settings.ts";
import type { ProtectError } from "../errors.ts";
import type { Segment } from "./livestream-session.ts";
import assert from "node:assert/strict";

// A resolver that resolves immediately to a fixed URL; the default for tests that do not scrutinize negotiation.
const fixedUrl = async (): Promise<string> => "wss://controller/livestream";

// Construct a session over a fake socket, wait for the socket to be built (so its listeners are attached), and open it. The socket is built only after the async URL
// negotiation, so we synchronize on the factory being invoked rather than emitting `open` synchronously the way the events-stream harness can.
async function openSession(options: { clock?: FakeClock; resolveUrl?: (params: URLSearchParams, opts: { signal?: AbortSignal }) => Promise<string>;
  spec?: Partial<LivestreamSpec>; } = {}): Promise<{ clock: FakeClock; session: LivestreamSession; ws: FakeWebSocket }> {

  const clock = options.clock ?? fakeClock();
  const { promise, resolve } = Promise.withResolvers<FakeWebSocket>();
  const session = new LivestreamSession({

    clock,
    log: silentLog(),
    resolveUrl: options.resolveUrl ?? fixedUrl,
    spec: { cameraId: "cam1", ...options.spec },
    webSocket: () => {

      const ws = new FakeWebSocket({ autoOpen: false });

      resolve(ws);

      return ws;
    }
  });

  const ws = await promise;

  ws.emitOpen();

  return { clock, session, ws };
}

// Collect every segment emitted on the session's rail, for synchronous assertions after driving the socket.
function collectSegments(session: LivestreamSession): Segment[] {

  const received: Segment[] = [];

  session.on("segment", (segment) => received.push(segment));

  return received;
}

// Collect every error emitted on the session's rail.
function collectErrors(session: LivestreamSession): ProtectError[] {

  const received: ProtectError[] = [];

  session.on("error", (error) => received.push(error));

  return received;
}

describe("LivestreamSession", () => {

  describe("resolveLivestreamSpec / livestreamKey", () => {

    test("applies defaults and floors the segment length", () => {

      const resolved = resolveLivestreamSpec({ cameraId: "cam1", segmentLength: 50, source: { channel: 1, type: "channel" } });

      assert.equal(resolved.chunkSize, 4096);
      assert.equal(resolved.lens, 0);
      assert.equal(resolved.requestId, "cam1-1");
      assert.equal(resolved.segmentLength, 100);
      assert.equal(resolved.timestamps, false);
    });

    test("honors explicit values above the floor", () => {

      const resolved = resolveLivestreamSpec({

        cameraId: "cam1", chunkSize: 8192, requestId: "tag", segmentLength: 200, source: { lens: 2, type: "lens" }, timestamps: true
      });

      assert.equal(resolved.channel, 0);
      assert.equal(resolved.chunkSize, 8192);
      assert.equal(resolved.lens, 2);
      assert.equal(resolved.requestId, "tag");
      assert.equal(resolved.segmentLength, 200);
      assert.equal(resolved.timestamps, true);
    });

    test("defaults to the primary view (channel 0, lens 0) when source is omitted", () => {

      const resolved = resolveLivestreamSpec({ cameraId: "cam1" });

      assert.equal(resolved.channel, 0);
      assert.equal(resolved.lens, 0);
      assert.equal(resolved.requestId, "cam1-0");
    });

    test("the key includes every stream-affecting field and excludes requestId", () => {

      const base = resolveLivestreamSpec({ cameraId: "cam1", source: { channel: 0, type: "channel" } });
      const sameStreamDifferentLabel = resolveLivestreamSpec({ cameraId: "cam1", requestId: "different", source: { channel: 0, type: "channel" } });

      assert.equal(livestreamKey(base), livestreamKey(sameStreamDifferentLabel));
    });

    test("the key differs when any stream-affecting field differs", () => {

      const base = livestreamKey(resolveLivestreamSpec({ cameraId: "cam1", source: { channel: 0, type: "channel" } }));

      assert.notEqual(base, livestreamKey(resolveLivestreamSpec({ cameraId: "cam1", source: { channel: 1, type: "channel" } })));
      assert.notEqual(base, livestreamKey(resolveLivestreamSpec({ cameraId: "cam1", source: { lens: 1, type: "lens" } })));
      assert.notEqual(base, livestreamKey(resolveLivestreamSpec({ cameraId: "cam1", segmentLength: 200, source: { channel: 0, type: "channel" } })));
      assert.notEqual(base, livestreamKey(resolveLivestreamSpec({ cameraId: "cam1", chunkSize: 8192, source: { channel: 0, type: "channel" } })));
      assert.notEqual(base, livestreamKey(resolveLivestreamSpec({ cameraId: "cam1", source: { channel: 0, type: "channel" }, timestamps: true })));
    });
  });

  describe("connection and frame decode", () => {

    test("opening the socket advances the state to handshaking", async () => {

      const { session } = await openSession();

      assert.equal(session.state, "handshaking");
    });

    test("the first init segment advances to live, caches the init segment, and emits it with its codec", async () => {

      const { session, ws } = await openSession();
      const segments = collectSegments(session);

      ws.emitMessage(buildInitSegment({ codec: "hev1.1.6.L150,mp4a.40.2", data: Buffer.from("INITDATA") }));

      assert.equal(session.state, "live");
      assert.equal(segments.length, 1);

      const [segment] = segments;

      assert.ok(segment?.type === "init");
      assert.equal(segment.codec, "hev1.1.6.L150,mp4a.40.2");
      assert.deepEqual(segment.data, Buffer.from("INITDATA"));
      assert.deepEqual(session.initSegment, { codec: "hev1.1.6.L150,mp4a.40.2", data: Buffer.from("INITDATA") });
    });

    test("a media segment is assembled from moof+mdat, with moof/mdat as zero-copy views and no timestamps when not opted in", async () => {

      const { session, ws } = await openSession();
      const segments = collectSegments(session);
      const moof = Buffer.from("MOOFBYTES");
      const mdat = Buffer.from("MDATPAYLOAD");

      ws.emitMessage(buildMediaSegment({ mdat, moof }));

      assert.equal(segments.length, 1);

      const [segment] = segments;

      assert.ok(segment?.type === "media");
      assert.deepEqual(segment.data, Buffer.concat([ moof, mdat ]));
      assert.deepEqual(segment.moof, moof);
      assert.deepEqual(segment.mdat, mdat);
      assert.equal(segment.timestamps, undefined);

      // The boxes are zero-copy views into `data`: they share its underlying ArrayBuffer rather than being copies.
      assert.equal(segment.moof.buffer, segment.data.buffer);
      assert.equal(segment.mdat.buffer, segment.data.buffer);
    });

    test("decode timestamps are attached to a media segment only when opted in, as a faithful number[]", async () => {

      const capture: URLSearchParams[] = [];
      const resolveUrl = async (params: URLSearchParams): Promise<string> => {

        capture.push(params);

        return "wss://controller/livestream";
      };

      const { session, ws } = await openSession({ resolveUrl, spec: { timestamps: true } });
      const segments = collectSegments(session);

      ws.emitMessage(buildMediaSegment({ mdat: Buffer.from("M"), moof: Buffer.from("F"), timestamps: [ 0, 3000, 6000 ] }));

      const [segment] = segments;

      assert.ok(segment?.type === "media");
      assert.deepEqual(segment.timestamps, [ 0, 3000, 6000 ]);

      // Opting in adds the extendedVideoMetadata negotiation flag.
      assert.ok(capture[0]?.has("extendedVideoMetadata"));
    });

    test("a frame split across two WebSocket messages is reassembled", async () => {

      const { session, ws } = await openSession();
      const segments = collectSegments(session);
      const init = buildInitSegment({ codec: "avc1", data: Buffer.from("SPLITINIT") });

      // Deliver the init frames in two halves; the session carries the partial tail across messages.
      ws.emitMessage(init.subarray(0, 5));
      assert.equal(segments.length, 0);

      ws.emitMessage(init.subarray(5));

      assert.equal(segments.length, 1);

      const [reassembled] = segments;

      assert.ok(reassembled !== undefined);
      assert.deepEqual(reassembled.data, Buffer.from("SPLITINIT"));
    });

    test("an unsupported (non-binary) message frame is skipped without crashing", async () => {

      const { session, ws } = await openSession();
      const segments = collectSegments(session);

      ws.emitMessage("a text frame");

      assert.equal(segments.length, 0);
      assert.equal(session.state, "handshaking");
    });

    test("an invalid frame header discards the remainder of the packet", async () => {

      const { session, ws } = await openSession();
      const segments = collectSegments(session);

      // A frame type byte of 0 is not a valid frame; the decoder abandons the packet rather than emitting anything.
      ws.emitMessage(buildLiveFrame(0, Buffer.from("garbage")));

      assert.equal(segments.length, 0);
    });

    test("video and audio boxes are concatenated into the fragment after moof and mdat", async () => {

      const { session, ws } = await openSession();
      const segments = collectSegments(session);

      ws.emitMessage(buildMediaSegment({ audio: Buffer.from("AU"), mdat: Buffer.from("M"), moof: Buffer.from("F"), video: Buffer.from("VI") }));

      const [segment] = segments;

      assert.ok(segment?.type === "media");
      assert.deepEqual(segment.data, Buffer.concat([ Buffer.from("F"), Buffer.from("M"), Buffer.from("VI"), Buffer.from("AU") ]));
      assert.deepEqual(segment.moof, Buffer.from("F"));
      assert.deepEqual(segment.mdat, Buffer.from("M"));
    });

    test("the stream() rail delivers decoded segments", async () => {

      const controller = new AbortController();
      const { session, ws } = await openSession();
      const iterator = session.stream("segment", { signal: controller.signal })[Symbol.asyncIterator]();

      ws.emitMessage(buildInitSegment({ data: Buffer.from("I") }));

      const result = await iterator.next();

      assert.equal(result.done, false);
      assert.equal(result.value?.[0].type, "init");

      controller.abort();
    });
  });

  describe("negotiation params", () => {

    test("build params serialize a channel source", async () => {

      const capture: URLSearchParams[] = [];
      const resolveUrl = async (params: URLSearchParams): Promise<string> => {

        capture.push(params);

        return "wss://controller/livestream";
      };

      await openSession({ resolveUrl, spec: { chunkSize: 8192, segmentLength: 200, source: { channel: 2, type: "channel" } } });

      const params = capture[0];

      assert.ok(params !== undefined);
      assert.equal(params.get("type"), "fmp4");
      assert.equal(params.get("rebaseTimestampsToZero"), "true");
      assert.equal(params.get("useWallClock"), "false");
      assert.equal(params.get("camera"), "cam1");
      assert.equal(params.get("channel"), "2");
      assert.equal(params.get("lens"), "0");
      assert.equal(params.get("chunkSize"), "8192");
      assert.equal(params.get("fragmentDurationMillis"), "200");
      assert.equal(params.has("extendedVideoMetadata"), false);
    });

    test("build params serialize a lens source", async () => {

      const capture: URLSearchParams[] = [];
      const resolveUrl = async (params: URLSearchParams): Promise<string> => {

        capture.push(params);

        return "wss://controller/livestream";
      };

      await openSession({ resolveUrl, spec: { chunkSize: 8192, segmentLength: 200, source: { lens: 1, type: "lens" } } });

      const params = capture[0];

      assert.ok(params !== undefined);
      assert.equal(params.get("type"), "fmp4");
      assert.equal(params.get("rebaseTimestampsToZero"), "true");
      assert.equal(params.get("useWallClock"), "false");
      assert.equal(params.get("camera"), "cam1");
      assert.equal(params.get("channel"), "0");
      assert.equal(params.get("lens"), "1");
      assert.equal(params.get("chunkSize"), "8192");
      assert.equal(params.get("fragmentDurationMillis"), "200");
      assert.equal(params.has("extendedVideoMetadata"), false);
    });
  });

  describe("watchdog", () => {

    test("a silent channel beyond the heartbeat window emits a ProtectStallError and closes", async () => {

      const clock = fakeClock();
      const { session, ws } = await openSession({ clock });
      const errors = collectErrors(session);
      let closeInfo: { cause?: ProtectError; code: number; reason: string } | undefined;

      session.on("closed", (info) => { closeInfo = info; });

      clock.advance(PROTECT_LIVESTREAM_HEARTBEAT_TIMEOUT);
      await clock.tick();

      assert.equal(errors.length, 1);
      assert.ok(errors[0] instanceof ProtectStallError);
      assert.equal((errors[0]).silentForMs, PROTECT_LIVESTREAM_HEARTBEAT_TIMEOUT);
      assert.equal(session.state, "closed");
      assert.equal(ws.closeRequested, true);

      // The stall the error rail carried is the same object the closure records as its cause.
      assert.ok(Object.is(closeInfo?.cause, errors[0]));
    });

    test("the watchdog does not trip while frames are flowing", async () => {

      const clock = fakeClock();
      const { session, ws } = await openSession({ clock });
      const errors = collectErrors(session);

      // A frame arrives partway through the window, refreshing liveness; the next tick finds the channel live.
      clock.advance(PROTECT_LIVESTREAM_HEARTBEAT_TIMEOUT - 1);
      ws.emitMessage(buildInitSegment({ data: Buffer.from("I") }));
      clock.advance(1);
      await clock.tick();

      assert.equal(errors.length, 0);
      assert.notEqual(session.state, "closed");
    });
  });

  describe("failure paths", () => {

    test("a failed negotiation surfaces a ProtectNetworkError and never opens a socket", async () => {

      let built = false;
      const closed = Promise.withResolvers<{ cause?: ProtectError; code: number; reason: string }>();
      const session = new LivestreamSession({

        log: silentLog(),
        resolveUrl: async () => { throw new Error("connect refused"); },
        spec: { cameraId: "cam1", source: { channel: 0, type: "channel" } },
        webSocket: () => {

          built = true;

          return new FakeWebSocket({ autoOpen: false });
        }
      });

      session.on("closed", (info) => closed.resolve(info));

      const [error] = await session.once("error");

      assert.ok(error instanceof ProtectNetworkError);
      assert.equal(built, false);
      assert.equal(session.state, "closed");

      // The wrapped ProtectNetworkError the error rail carried is the same object the closure records as its cause.
      const info = await closed.promise;

      assert.ok(Object.is(info.cause, error));
    });

    test("a typed negotiation error passes through unwrapped", async () => {

      const thrown = new ProtectStallError("stalled", { silentForMs: 1 });
      const closed = Promise.withResolvers<{ cause?: ProtectError; code: number; reason: string }>();
      const session = new LivestreamSession({

        log: silentLog(),
        resolveUrl: async () => { throw thrown; },
        spec: { cameraId: "cam1", source: { channel: 0, type: "channel" } },
        webSocket: () => new FakeWebSocket({ autoOpen: false })
      });

      session.on("closed", (info) => closed.resolve(info));

      const [error] = await session.once("error");

      assert.ok(error instanceof ProtectStallError);

      // The passthrough contract end to end: the exact instance the resolver threw rides the error rail and is recorded as the closure's cause.
      const info = await closed.promise;

      assert.ok(Object.is(error, thrown));
      assert.ok(Object.is(info.cause, thrown));
    });

    test("a socket error surfaces a ProtectNetworkError and closes", async () => {

      const { session, ws } = await openSession();
      const errors = collectErrors(session);
      let closeInfo: { cause?: ProtectError; code: number; reason: string } | undefined;

      session.on("closed", (info) => { closeInfo = info; });

      ws.emitError(new Error("socket boom"));

      assert.equal(errors.length, 1);
      assert.ok(errors[0] instanceof ProtectNetworkError);
      assert.equal(session.state, "closed");

      // The ProtectNetworkError the error rail carried is the same object the closure records as its cause.
      assert.ok(Object.is(closeInfo?.cause, errors[0]));
    });
  });

  describe("teardown", () => {

    test("close() requests the socket close and is idempotent", async () => {

      const { session, ws } = await openSession();

      await session.close();
      await session.close();

      assert.equal(ws.closeRequested, true);
      assert.equal(session.state, "closed");
    });

    test("dispose delegates to close", async () => {

      const { session, ws } = await openSession();

      await session[Symbol.asyncDispose]();

      assert.equal(ws.closeRequested, true);
      assert.equal(session.state, "closed");
    });

    test("an already-aborted caller signal tears down before a socket is built", async () => {

      const controller = new AbortController();

      controller.abort();

      let built = false;
      const session = new LivestreamSession({

        log: silentLog(),
        resolveUrl: fixedUrl,
        signal: controller.signal,
        spec: { cameraId: "cam1", source: { channel: 0, type: "channel" } },
        webSocket: () => {

          built = true;

          return new FakeWebSocket({ autoOpen: false });
        }
      });

      // Let the async connect run; it must observe the abort and bail before building a socket.
      await new Promise((resolve) => setImmediate(resolve));

      assert.equal(built, false);
      assert.equal(session.state, "closed");
    });

    test("an already-aborted caller signal records the ProtectAbortedError as the close cause", () => {

      const controller = new AbortController();

      controller.abort();

      // The constructor closes the session synchronously before any listener can attach, so the getter is the only surface that can observe this cause.
      const session = new LivestreamSession({

        log: silentLog(),
        resolveUrl: fixedUrl,
        signal: controller.signal,
        spec: { cameraId: "cam1", source: { channel: 0, type: "channel" } },
        webSocket: () => new FakeWebSocket({ autoOpen: false })
      });

      assert.ok(session.closeCause instanceof ProtectAbortedError);
      assert.equal(session.state, "closed");
    });

    test("a mid-flight caller abort records the ProtectAbortedError on both the payload and closeCause", async () => {

      const controller = new AbortController();
      const built = Promise.withResolvers<FakeWebSocket>();
      const session = new LivestreamSession({

        log: silentLog(),
        resolveUrl: fixedUrl,
        signal: controller.signal,
        spec: { cameraId: "cam1", source: { channel: 0, type: "channel" } },
        webSocket: () => {

          const ws = new FakeWebSocket({ autoOpen: false });

          built.resolve(ws);

          return ws;
        }
      });

      const ws = await built.promise;

      ws.emitOpen();

      const closed = Promise.withResolvers<{ cause?: ProtectError; code: number; reason: string }>();

      session.on("closed", (info) => closed.resolve(info));

      controller.abort();

      const info = await closed.promise;

      // Both surfaces report the one fact: the abort's cause rides the closed payload and is the same object the getter returns.
      assert.ok(info.cause instanceof ProtectAbortedError);
      assert.ok(Object.is(info.cause, session.closeCause));
    });

    test("a plain close() carries no cause: closeCause stays null and the payload omits the key", async () => {

      const { session } = await openSession();
      const closed = Promise.withResolvers<{ cause?: ProtectError; code: number; reason: string }>();

      session.on("closed", (info) => closed.resolve(info));

      await session.close();

      const info = await closed.promise;

      assert.equal(session.closeCause, null);
      assert.equal("cause" in info, false);
    });

    test("first cause wins: a later plain close() does not overwrite the recorded abort cause", async () => {

      const controller = new AbortController();
      const built = Promise.withResolvers<FakeWebSocket>();
      const session = new LivestreamSession({

        log: silentLog(),
        resolveUrl: fixedUrl,
        signal: controller.signal,
        spec: { cameraId: "cam1", source: { channel: 0, type: "channel" } },
        webSocket: () => {

          const ws = new FakeWebSocket({ autoOpen: false });

          built.resolve(ws);

          return ws;
        }
      });

      const ws = await built.promise;

      ws.emitOpen();

      // The mid-flight abort is the first initiated teardown; it records the ProtectAbortedError.
      controller.abort();

      // A subsequent explicit close() is a second initiated teardown whose null cause must not overwrite the first.
      await session.close();

      assert.ok(session.closeCause instanceof ProtectAbortedError);
    });

    test("emitting two media segments in one message decodes both", async () => {

      const { session, ws } = await openSession();
      const segments = collectSegments(session);
      const first = buildMediaSegment({ mdat: Buffer.from("A"), moof: Buffer.from("a") });
      const second = buildMediaSegment({ mdat: Buffer.from("B"), moof: Buffer.from("b") });

      ws.emitMessage(Buffer.concat([ first, second ]));

      assert.equal(segments.length, 2);
    });
  });
});

// Reference the otherwise-unused frame constants so the helper's named exports are covered by an explicit assertion of their wire values.
test("livestream frame constants match the wire protocol", () => {

  assert.equal(FRAME_MOOF, 251);
  assert.equal(FRAME_END_SEGMENT, 255);
});
