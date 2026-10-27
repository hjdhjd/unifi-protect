/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * livestream-session.test.ts: Tests for LivestreamSession - URL negotiation, the fMP4 frame decode (init/media/reassembly/timestamps), the FSM, the silence watchdog,
 * and teardown. Driven through an injected fake WebSocket, a fake resolver, and a `TestClock`, so the session is exercised deterministically without a live controller.
 */
import { AMCREST_INIT, DOORBELL_INIT } from "../protocol/init-segment.fixtures.ts";
import { LivestreamSession, livestreamKey, resolveLivestreamSpec } from "./livestream-session.ts";
import type { LivestreamSpec, LivestreamState, Segment } from "./livestream-session.ts";
import { ProtectAbortedError, ProtectNetworkError, ProtectStallError } from "../errors.ts";
import { TestClock, settle } from "homebridge-plugin-utils/testing";
import { assertNoUnhandledRejections, silentLog } from "../testing.helpers.ts";
import { buildInitSegment, buildLiveFrame, buildMediaSegment } from "./livestream-session.helpers.ts";
import { describe, test } from "node:test";
import { FakeWebSocket } from "./events-stream.helpers.ts";
import { PROTECT_LIVESTREAM_HEARTBEAT_TIMEOUT } from "../settings.ts";
import type { ProtectError } from "../errors.ts";
import assert from "node:assert/strict";
import { createLoopbackWebSocketPeer } from "./tls-peer.helpers.ts";
import { setTimeout as delay } from "node:timers/promises";

// A resolver that resolves immediately to a fixed URL; the default for tests that do not scrutinize negotiation.
const fixedUrl = async (): Promise<string> => "wss://controller/livestream";

// Construct a session over a fake socket, wait for the socket to be built (so its listeners are attached), and open it. The socket is built only after the async URL
// negotiation, so we synchronize on the factory being invoked rather than emitting `open` synchronously the way the events-stream harness can. `webSocket` makes the
// fake for a row that needs one built its own way; that fake must not open itself, since this helper opens it. The URL the session handed its socket factory is
// returned beside the socket.
async function openSession(options: { clock?: TestClock; resolveUrl?: (params: URLSearchParams, opts: { signal?: AbortSignal }) => Promise<string>;
  spec?: Partial<LivestreamSpec>; webSocket?: () => FakeWebSocket; } = {}): Promise<{ clock: TestClock; session: LivestreamSession; url: string; ws: FakeWebSocket }> {

  const clock = options.clock ?? new TestClock();
  const { promise, resolve } = Promise.withResolvers<{ url: string; ws: FakeWebSocket }>();
  const session = new LivestreamSession({

    clock,
    log: silentLog(),
    resolveUrl: options.resolveUrl ?? fixedUrl,
    spec: { cameraId: "cam1", ...options.spec },
    webSocket: (url: string): FakeWebSocket => {

      const ws = options.webSocket?.() ?? new FakeWebSocket({ autoOpen: false });

      resolve({ url, ws });

      return ws;
    }
  });

  const { url, ws } = await promise;

  ws.emitOpen();

  return { clock, session, url, ws };
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

// Wait for a session driven by a real socket to reach a state, and report the state it actually reached. The session announces `segment`, `error`, and `closed`, but
// the open handshake has no rail of its own, so the state getter is where it becomes observable - hence a poll rather than an awaited event. Returning the state at
// the deadline rather than throwing keeps the caller's assertion the thing that reports a mismatch.
async function whenState(session: LivestreamSession, target: LivestreamState, timeoutMs = 5000): Promise<LivestreamState> {

  const deadline = Date.now() + timeoutMs;

  while((session.state !== target) && (Date.now() < deadline)) {

    // Sequential by intent: this polls one state reading at a time until the session settles or the deadline passes.
    // eslint-disable-next-line no-await-in-loop
    await delay(5);
  }

  return session.state;
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

    test("the first init segment advances to live, caches the init segment, and emits it with its codec and description", async () => {

      const { session, ws } = await openSession();
      const segments = collectSegments(session);

      ws.emitMessage(buildInitSegment({ codec: "hev1.1.6.L180.90,mp4a.40.2", data: DOORBELL_INIT }));

      assert.equal(session.state, "live");
      assert.equal(segments.length, 1);

      const [segment] = segments;
      const description = {

        tracks: [

          { codec: "h265", height: 4096, id: 1, kind: "video", level: 180, profile: 1, width: 3024 },
          { channels: 1, codec: "aac", id: 2, kind: "audio", sampleRate: 16000 }
        ]
      };

      assert.ok(segment?.type === "init");
      assert.equal(segment.codec, "hev1.1.6.L180.90,mp4a.40.2");
      assert.deepEqual(segment.data, DOORBELL_INIT);
      assert.deepEqual(segment.description, description);
      assert.deepEqual(session.initSegment, { codec: "hev1.1.6.L180.90,mp4a.40.2", data: DOORBELL_INIT, description });

      // The description is read once per init frame: the emitted segment and the cache carry the same object.
      assert.equal(segment.description, session.initSegment.description);
    });

    test("an init with no codec-information frame before it carries an empty codec label and its description", async () => {

      const { session, ws } = await openSession();
      const segments = collectSegments(session);

      ws.emitMessage(buildInitSegment({ data: AMCREST_INIT }));

      const [segment] = segments;

      assert.ok(segment?.type === "init");
      assert.equal(segment.codec, "");
      assert.deepEqual(segment.description.tracks, [

        { codec: "h264", height: 1944, id: 1, kind: "video", level: 51, profile: 77, width: 2592 },
        { channels: 1, codec: "aac", id: 2, kind: "audio", sampleRate: 8000 }
      ]);
      assert.equal(session.initSegment?.codec, "");
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

      // A session that did not opt in ignores a timestamp frame on the wire, so the media segment after it carries no timestamps.
      const defaults = await openSession();
      const defaultSegments = collectSegments(defaults.session);

      defaults.ws.emitMessage(buildMediaSegment({ mdat: Buffer.from("M"), moof: Buffer.from("F"), timestamps: [ 0, 3000, 6000 ] }));

      const [defaultSegment] = defaultSegments;

      assert.ok(defaultSegment?.type === "media");
      assert.equal(defaultSegment.timestamps, undefined, "a session that did not opt in must not attach the timestamps a stray frame carries");
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

    test("a frame header split across WebSocket messages is reassembled", async () => {

      const { session, ws } = await openSession();
      const segments = collectSegments(session);
      const init = buildInitSegment({ codec: "avc1", data: Buffer.from("SPLITINIT") });

      // Split inside the codec frame's 4-byte header: the first message leaves a tail too short to read a frame length from, which the session must carry into the next.
      ws.emitMessage(init.subarray(0, 2));
      assert.equal(segments.length, 0);

      ws.emitMessage(init.subarray(2));

      assert.equal(segments.length, 1);

      const [reassembled] = segments;

      assert.ok(reassembled?.type === "init");
      assert.equal(reassembled.codec, "avc1", "the frame whose header was split must decode as the codec it carries");
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

      // A frame type byte of 0 is not a valid frame, so the decoder abandons the rest of the packet, the valid init frame behind it included.
      ws.emitMessage(Buffer.concat([ buildLiveFrame(0, Buffer.from("garbage")), buildInitSegment({ data: Buffer.from("I") }) ]));

      assert.equal(segments.length, 0, "nothing after an invalid frame header in the same packet may decode");

      // Nothing of the abandoned packet is carried over, so the next message decodes afresh.
      ws.emitMessage(buildInitSegment({ data: Buffer.from("I") }));

      assert.equal(segments.length, 1, "the message after an abandoned packet must decode");
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
      assert.equal(result.value[0].type, "init");

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

      // The controller reads allowPartialGOP and progressive by presence alone, so each is sent with an empty value. The request label is the spec's default, built
      // from the camera and the channel.
      assert.equal(params.get("allowPartialGOP"), "");
      assert.equal(params.get("progressive"), "");
      assert.equal(params.get("requestId"), "cam1-2");
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

    test("the socket factory is handed the URL the resolver negotiated", async () => {

      const { url } = await openSession({ resolveUrl: async (): Promise<string> => "wss://controller/livestream?token=negotiated" });

      assert.equal(url, "wss://controller/livestream?token=negotiated", "the socket must be built on the URL the resolver returned");
    });
  });

  describe("watchdog", () => {

    test("a silent channel beyond the heartbeat window emits a ProtectStallError and closes", async () => {

      const clock = new TestClock();
      const { session, ws } = await openSession({ clock });
      const errors = collectErrors(session);
      let closeInfo: { cause?: ProtectError; code: number; reason: string } | undefined;

      session.on("closed", (info) => { closeInfo = info; });

      clock.advance(PROTECT_LIVESTREAM_HEARTBEAT_TIMEOUT);
      await settle();

      assert.equal(errors.length, 1);
      assert.ok(errors[0] instanceof ProtectStallError);
      assert.equal((errors[0]).silentForMs, PROTECT_LIVESTREAM_HEARTBEAT_TIMEOUT);
      assert.equal(session.state, "closed");
      assert.equal(ws.closeRequested, true);

      // The stall the error rail carried is the same object the closure records as its cause.
      assert.ok(Object.is(closeInfo?.cause, errors[0]));
    });

    test("the watchdog does not trip while frames are flowing", async () => {

      const clock = new TestClock();
      const { session, ws } = await openSession({ clock });
      const errors = collectErrors(session);

      // A frame arrives partway through the window, refreshing liveness; the wake at the deadline finds the channel live.
      clock.advance(PROTECT_LIVESTREAM_HEARTBEAT_TIMEOUT - 1);
      ws.emitMessage(buildInitSegment({ data: Buffer.from("I") }));
      clock.advance(1);
      await settle();

      assert.equal(errors.length, 0);
      assert.notEqual(session.state, "closed");
    });

    test("the watchdog wakes at its period and not before", async () => {

      const clock = new TestClock();
      const { session, ws } = await openSession({ clock });
      const errors = collectErrors(session);

      // The watchdog is the session's only reader of the clock's timers, so the timeline's next deadline is its next wake: one heartbeat window out from the open.
      assert.equal(clock.nextDeadline, PROTECT_LIVESTREAM_HEARTBEAT_TIMEOUT, "the first wake comes due one heartbeat window after the socket opens");

      // A frame just short of the first wake keeps the channel live through it, and the loop parks for one more window from the moment it woke.
      clock.advance(PROTECT_LIVESTREAM_HEARTBEAT_TIMEOUT - 1);
      ws.emitMessage(buildInitSegment({ data: Buffer.from("I") }));
      clock.advance(1);
      await settle();

      assert.equal(errors.length, 0, "the first wake found the channel live");
      assert.equal(clock.nextDeadline, 2 * PROTECT_LIVESTREAM_HEARTBEAT_TIMEOUT, "the second wake comes due one window after the first");

      // By the end of this advance the silence since the frame has reached the window, yet nothing reads it until the next wake, so detection lands inside the
      // [threshold, 2 x threshold) window rather than at the threshold itself.
      clock.advance(PROTECT_LIVESTREAM_HEARTBEAT_TIMEOUT - 1);
      await settle();

      assert.equal(errors.length, 0, "no wake comes between the deadlines");

      clock.advance(1);
      await settle();

      assert.equal(errors.length, 1);
      assert.ok(errors[0] instanceof ProtectStallError);
      assert.equal(errors[0].silentForMs, PROTECT_LIVESTREAM_HEARTBEAT_TIMEOUT + 1, "the second wake reads the silence since the frame");
      assert.equal(session.state, "closed");
    });
  });

  describe("failure paths", () => {

    test("a failed negotiation surfaces a ProtectNetworkError and never opens a socket", async () => {

      let built = false;
      const closed = Promise.withResolvers<{ cause?: ProtectError; code: number; reason: string }>();
      const session = new LivestreamSession({

        log: silentLog(),
        resolveUrl: async (): Promise<never> => { throw new Error("connect refused"); },
        spec: { cameraId: "cam1", source: { channel: 0, type: "channel" } },
        webSocket: (): FakeWebSocket => {

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
        resolveUrl: async (): Promise<never> => { throw thrown; },
        spec: { cameraId: "cam1", source: { channel: 0, type: "channel" } },
        webSocket: (): FakeWebSocket => new FakeWebSocket({ autoOpen: false })
      });

      session.on("closed", (info) => closed.resolve(info));

      const [error] = await session.once("error");

      assert.ok(error instanceof ProtectStallError);

      // The passthrough contract end to end: the exact instance the resolver threw goes out on the error rail and is recorded as the closure's cause.
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

  describe("certificate verification", () => {

    test("the upgrade reaches a controller's own certificate when strict verification is not asked for", async () => {

      // A real TLS peer rather than the injected fake: the certificate posture lives on the agent the default factory builds, which an injected socket never reaches.
      await using peer = await createLoopbackWebSocketPeer();
      const session = new LivestreamSession({ log: silentLog(), resolveUrl: async (): Promise<string> => "wss://" + peer.host + "/live",
        spec: { cameraId: "cam1" } });
      const errors = collectErrors(session);

      /* Reaching `handshaking` is the whole TLS-layer proof: the session advances to it on the WebSocket `open` event alone, which the peer grants only after the
       * handshake completes and the upgrade is answered. Chasing `live` would take synthesized init-segment frames, which is livestream-protocol correctness the
       * fake-socket suite above already owns, not a certificate question.
       */
      assert.equal(await whenState(session, "handshaking"), "handshaking");
      assert.deepEqual(errors, [], "a connection the client accepts must put nothing on the error rail");

      await session.close();
    });

    test("the upgrade refuses a certificate that does not verify when strict verification is asked for", async () => {

      await using peer = await createLoopbackWebSocketPeer();
      const session = new LivestreamSession({ log: silentLog(), resolveUrl: async (): Promise<string> => "wss://" + peer.host + "/live",
        spec: { cameraId: "cam1" }, verifyTls: true });
      const errors = collectErrors(session);

      /* The same peer and the same upgrade, one option apart. A handshake the client will not complete is a socket failure, and this session routes every one of those
       * onto the error rail as the typed reachability fault.
       *
       * The rail is raced against the peer's own view rather than awaited alone: a session that ignored the option would complete the handshake and then sit
       * connected, so waiting only on the rail would report that as a timeout instead of as the refusal that did not happen.
       */
      await Promise.race([ session.once("error"), peer.whenHandshakes(1) ]);

      assert.equal(peer.handshakes, 0, "a strict session must refuse the certificate before the handshake completes");
      assert.ok(errors[0] instanceof ProtectNetworkError);

      await session.close();
    });
  });

  describe("teardown", () => {

    test("close() requests the socket close and is safe to call more than once", async () => {

      // The watchdog armed at open is parked on its delay when the close aborts it, so the row also reads that the loop's end leaves no rejection behind.
      await assertNoUnhandledRejections(async () => {

        const { session, ws } = await openSession();
        let closedEvents = 0;

        session.on("closed", () => { closedEvents++; });

        await session.close();
        await session.close();

        assert.equal(ws.closeRequested, true);
        assert.equal(session.state, "closed");
        assert.equal(closedEvents, 1, "a second close() must not announce the closure again");
      });
    });

    test("dispose delegates to close", async () => {

      const { session, ws } = await openSession();

      await session[Symbol.asyncDispose]();

      assert.equal(ws.closeRequested, true);
      assert.equal(session.state, "closed");
    });

    test("close() swallows a socket close() fault and still tears down cleanly", async () => {

      const { session, ws } = await openSession({ webSocket: (): FakeWebSocket => new FakeWebSocket({ autoOpen: false, closeFault: true }) });

      // The disposal contract is that close() (and [Symbol.asyncDispose]) never throw, even when the underlying socket's own close() faults: #shutdown swallows the fault
      // and #onClose releases everything regardless, so the session still reaches the closed state and the close was attempted.
      await assert.doesNotReject(session.close());
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
        webSocket: (): FakeWebSocket => {

          built = true;

          return new FakeWebSocket({ autoOpen: false });
        }
      });

      // Let the async connect run; it must observe the abort and bail before building a socket.
      await settle();

      assert.equal(built, false);
      assert.equal(session.state, "closed");
    });

    test("a caller-signal abort during URL negotiation aborts the signal the resolver was handed and emits no error", async () => {

      const controller = new AbortController();
      const handed: (AbortSignal | undefined)[] = [];

      // The resolver never settles on its own: once the signal it was handed aborts, it rejects with ProtectAbortedError, the way the transport answers a cancel.
      const resolveUrl = async (_params: URLSearchParams, opts: { signal?: AbortSignal }): Promise<string> => {

        handed.push(opts.signal);

        const { promise, reject } = Promise.withResolvers<string>();

        opts.signal?.addEventListener("abort", () => reject(new ProtectAbortedError("The negotiation was aborted by the caller's signal.")), { once: true });

        return promise;
      };

      const session = new LivestreamSession({

        log: silentLog(),
        resolveUrl,
        signal: controller.signal,
        spec: { cameraId: "cam1", source: { channel: 0, type: "channel" } },
        webSocket: (): FakeWebSocket => new FakeWebSocket({ autoOpen: false })
      });

      const errors = collectErrors(session);

      await settle();
      controller.abort();
      await settle();

      const [signal] = handed;

      // The abort tore the session down first, so the negotiation's rejection that follows is the cancel it asked for, never a failure on the error rail.
      assert.equal(handed.length, 1);
      assert.ok(signal instanceof AbortSignal);
      assert.equal(signal.aborted, true);
      assert.equal(errors.length, 0);
      assert.equal(session.state, "closed");
    });

    test("a close() while URL negotiation is in flight builds no socket once the negotiation resolves", async () => {

      const negotiation = Promise.withResolvers<string>();
      let built = false;

      // No caller signal is passed, so the resolver is never cancelled: it resolves only after close() has torn the session down, and the connect must see that
      // teardown and bail rather than open a socket nothing would ever close.
      const session = new LivestreamSession({

        log: silentLog(),
        resolveUrl: async (): Promise<string> => negotiation.promise,
        spec: { cameraId: "cam1", source: { channel: 0, type: "channel" } },
        webSocket: (): FakeWebSocket => {

          built = true;

          return new FakeWebSocket({ autoOpen: false });
        }
      });

      await settle();
      await session.close();
      negotiation.resolve("wss://controller/livestream");
      await settle();

      assert.equal(built, false, "a negotiation that resolves after a close must not build a socket");
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
        webSocket: (): FakeWebSocket => new FakeWebSocket({ autoOpen: false })
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
        webSocket: (): FakeWebSocket => {

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

      // Both surfaces report the one fact: the abort's cause is carried by the closed payload and is the same object the getter returns.
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

    test("a peer close reaches closed and carries the peer's code and reason", async () => {

      const { session, ws } = await openSession();
      const closed = Promise.withResolvers<{ cause?: ProtectError; code: number; reason: string }>();

      session.on("closed", (info) => closed.resolve(info));

      ws.emitClose(4000, "bye");

      const info = await closed.promise;

      // A close the peer starts reaches #onClose directly, so the payload carries the frame's own code and reason, and no cause.
      assert.deepEqual(info, { code: 4000, reason: "bye" });
      assert.equal(session.state, "closed");
    });

    test("first cause wins: a later plain close() does not overwrite the recorded abort cause", async () => {

      const controller = new AbortController();
      const built = Promise.withResolvers<FakeWebSocket>();
      const session = new LivestreamSession({

        log: silentLog(),
        resolveUrl: fixedUrl,
        signal: controller.signal,
        spec: { cameraId: "cam1", source: { channel: 0, type: "channel" } },
        webSocket: (): FakeWebSocket => {

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

      // Each begin-segment frame starts a fresh accumulator, so each segment carries its own boxes and none of the one before it.
      assert.deepEqual(segments.map((segment) => segment.data.toString()), [ "aA", "bB" ]);
    });
  });
});
