/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * livestream-session.test.ts: Tests for LivestreamSession - URL negotiation, the route a session dials and what its upgrade carries, the fMP4 frame decode that
 * lives behind its intake (init/media/reassembly/timestamps), the FSM, the silence watchdog, and teardown. Driven through an injected fake WebSocket, a fake
 * resolver, and a `TestClock`, so the session is exercised deterministically without a live controller.
 */
import { AMCREST_INIT, DOORBELL_INIT } from "../protocol/media/init-segment.fixtures.ts";
import type { CapturedLogEntry, CapturingLogger } from "../testing.helpers.ts";
import type { ConnectionOptions, TLSSocket } from "node:tls";
import { DIAL_SETTLE_BOUND_MS, announcedSockets, createLoopbackSilentPeer, createLoopbackWebSocketPeer, elapsedSince } from "./tls-peer.helpers.ts";
import { FRAME_END_SEGMENT, buildInitSegment, buildLiveFrame, buildMediaSegment, ubvOpening, ubvVideo } from "./livestream-session.helpers.ts";
import { FakeWebSocket, receivingSurface } from "./events-stream.helpers.ts";
import type { LivestreamAddresses, LivestreamSessionOptions, LivestreamState, Segment } from "./livestream-session.ts";
import { LivestreamSession, livestreamKey, resolveLivestreamSpec } from "./livestream-session.ts";
import { ProtectAbortedError, ProtectCertificateError, ProtectConfigurationError, ProtectLivestreamRouteError, ProtectNetworkError, ProtectProtocolError,
  ProtectStallError, ProtectTimeoutError } from "../errors.ts";
import { TIME_OF_DAY_STEP_MS, assertNoUnhandledRejections, capturingLog, expectAt, settlement, silentLog } from "../testing.helpers.ts";
import { TestClock, errnoError, freePort, present, settle } from "homebridge-plugin-utils/testing";
import { UBV_H264, ubvRecord } from "../protocol/media/ubv.helpers.ts";
import { describe, test } from "node:test";
import type { MediaFrame } from "../protocol/media/frames.ts";
import { PROTECT_LIVESTREAM_HEARTBEAT_TIMEOUT } from "../settings.ts";
import type { ProtectError } from "../errors.ts";
import type { ProtectLogging } from "../logging.ts";
import assert from "node:assert/strict";
import { constants } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { getEventListeners } from "node:events";
import { inspect } from "node:util";
import tls from "node:tls";

// The sentence the session logs a fault of its open socket under, and the lines a log holds carrying it, at whatever level each was logged.
const REPORTED = "The UniFi Protect livestream API reported an error.";

function reportedLines(log: CapturingLogger): CapturedLogEntry[] {

  return log.entries.filter((entry) => entry.message === REPORTED);
}

// A resolver that resolves immediately to fixed addresses: the proxied one given, and a direct one beside it when a row dials or offers the direct route.
function fixedAddresses(proxied: string, direct: string | null = null): LivestreamSessionOptions["resolveUrl"] {

  return async (): Promise<LivestreamAddresses> => ({ direct, proxied });
}

// The fixed resolver for tests that do not scrutinize negotiation.
const fixedUrl = fixedAddresses("wss://controller/livestream");

// The invented addresses the route rows offer, the minted alias a direct address carries in its path, and the invented session headers an auth hook returns.
const PROXIED_URL = "wss://controller/proxy/protect/ws/livestream?token=proxied-token";
const DIRECT_URL = "wss://controller:7446/direct-alias?camera=cam1";
const ALIAS = "ZqXwVu";
const AUTH_HEADERS = { cookie: "TOKEN=invented-session", "x-csrf-token": "invented-csrf" };

// A direct address carrying the minted alias in its path, which a proxied session asking for Opus names its stream by.
const ALIAS_URL = "wss://controller:7446/" + ALIAS + "?camera=cam1";

// The sentence a session logs and wraps media its intake could not read under.
const UNREADABLE = "The UniFi Protect livestream sent media the library could not read.";

// The play command a proxied session asking for Opus sends, restated from its wire form apart from the session: a 32-bit big-endian length, then the JSON command
// naming the alias.
function playCommand(alias: string): Buffer {

  const command = Buffer.from("{\"cmd\":\"play\",\"params\":{\"audiocodec\":\"opus\",\"name\":\"" + alias + "\"}}");
  const length = Buffer.alloc(4);

  length.writeUInt32BE(command.length, 0);

  return Buffer.concat([ length, command ]);
}

// A UBV record whose first byte is not the record marker, which the reader refuses.
const UNREADABLE_RECORD = ubvRecord({ marker: 0xa1, payload: Buffer.alloc(4), track: UBV_H264 });

// An auth hook that returns the invented headers and counts how often it was read, so a row reads whether a socket asked for the session at all.
function countingAuthHeaders(): { calls: () => number; getAuthHeaders: () => Record<string, string> } {

  let calls = 0;

  return {

    calls: (): number => calls,
    getAuthHeaders: (): Record<string, string> => {

      calls++;

      return { ...AUTH_HEADERS };
    }
  };
}

// Construct a session over a fake socket, wait for the socket to be built (so its listeners are attached), and open it. The socket is built only after the async URL
// negotiation, so we synchronize on the factory being invoked rather than emitting `open` synchronously the way the events-stream harness can. `webSocket` makes the
// fake for a row that needs one built its own way; that fake must not open itself, since this helper opens it. The URL the session handed its socket factory is
// returned beside the socket.
async function openSession(options: { clock?: TestClock; log?: ProtectLogging; resolveUrl?: LivestreamSessionOptions["resolveUrl"];
  spec?: Partial<LivestreamSessionOptions["spec"]>; webSocket?: () => FakeWebSocket; } = {}): Promise<{ clock: TestClock; session: LivestreamSession; url: string;
  ws: FakeWebSocket; }> {

  const clock = options.clock ?? new TestClock();
  const { promise, resolve } = Promise.withResolvers<{ url: string; ws: FakeWebSocket }>();
  const session = new LivestreamSession({

    clock,
    log: options.log ?? silentLog(),
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

      // An omitted route is the proxied one, so the default keys exactly as the route named.
      assert.equal(livestreamKey(base), livestreamKey(resolveLivestreamSpec({ cameraId: "cam1", route: "proxied", source: { channel: 0, type: "channel" } })));
    });

    test("the key differs when any stream-affecting field differs", () => {

      const base = livestreamKey(resolveLivestreamSpec({ cameraId: "cam1", source: { channel: 0, type: "channel" } }));

      assert.notEqual(base, livestreamKey(resolveLivestreamSpec({ cameraId: "cam1", source: { channel: 1, type: "channel" } })));
      assert.notEqual(base, livestreamKey(resolveLivestreamSpec({ cameraId: "cam1", source: { lens: 1, type: "lens" } })));
      assert.notEqual(base, livestreamKey(resolveLivestreamSpec({ cameraId: "cam1", segmentLength: 200, source: { channel: 0, type: "channel" } })));
      assert.notEqual(base, livestreamKey(resolveLivestreamSpec({ cameraId: "cam1", chunkSize: 8192, source: { channel: 0, type: "channel" } })));
      assert.notEqual(base, livestreamKey(resolveLivestreamSpec({ cameraId: "cam1", source: { channel: 0, type: "channel" }, timestamps: true })));
      assert.notEqual(base, livestreamKey(resolveLivestreamSpec({ cameraId: "cam1", route: "direct", source: { channel: 0, type: "channel" } })));
    });

    test("the resolved spec expects audio when the spec leaves it out, and the key ignores whether audio is expected", () => {

      assert.equal(resolveLivestreamSpec({ cameraId: "cam1" }).audioExpected, true);
      assert.equal(resolveLivestreamSpec({ audioExpected: false, cameraId: "cam1" }).audioExpected, false);
      assert.equal(livestreamKey(resolveLivestreamSpec({ audioExpected: false, cameraId: "cam1", upstream: "ubv" })),
        livestreamKey(resolveLivestreamSpec({ cameraId: "cam1", upstream: "ubv" })));
    });

    test("a UBV spec whose segment length is not finite is refused, and a spec of Protect's own fMP4 resolves it as before", () => {

      const refusal = { constructor: ProtectProtocolError, message: "The UniFi Protect livestream's segment length is not a finite number of milliseconds." };

      // A spec naming UBV and one asking for Opus, which reads UBV, each refused; and the same length on Protect's own fMP4, floored and passed on as it is.
      assert.throws(() => resolveLivestreamSpec({ cameraId: "cam1", segmentLength: Infinity, upstream: "ubv" }), refusal);
      assert.throws(() => resolveLivestreamSpec({ audio: "opus", cameraId: "cam1", segmentLength: NaN }), refusal);
      assert.equal(resolveLivestreamSpec({ cameraId: "cam1", segmentLength: Infinity }).segmentLength, Infinity);
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
      const resolveUrl = async (params: URLSearchParams): Promise<LivestreamAddresses> => {

        capture.push(params);

        return { direct: null, proxied: "wss://controller/livestream" };
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

    test("a decode timestamp frame attaches to the one media segment after it", async () => {

      // Two media segments under a session that opted in: the first carries the timestamp frame sent ahead of it, and the second, which none precedes, carries none.
      const { session, ws } = await openSession({ spec: { timestamps: true } });
      const segments = collectSegments(session);

      ws.emitMessage(buildMediaSegment({ mdat: Buffer.from("M"), moof: Buffer.from("F"), timestamps: [ 0, 3000 ] }));
      ws.emitMessage(buildMediaSegment({ mdat: Buffer.from("N"), moof: Buffer.from("G") }));

      assert.deepEqual(segments.map((segment) => (segment.type === "media") ? segment.timestamps : null), [ [ 0, 3000 ], undefined ]);
    });

    test("a timestamp list held from a segment that never ended does not attach to the segment after it", async () => {

      // A segment that begins and carries its timestamp frame and boxes, but whose end never arrives, then a whole segment that carries no timestamp frame.
      const { session, ws } = await openSession({ spec: { timestamps: true } });
      const segments = collectSegments(session);
      const unended = buildMediaSegment({ mdat: Buffer.from("M"), moof: Buffer.from("F"), timestamps: [ 0, 3000 ] });

      ws.emitMessage(unended.subarray(0, unended.length - buildLiveFrame(FRAME_END_SEGMENT).length));
      ws.emitMessage(buildMediaSegment({ mdat: Buffer.from("N"), moof: Buffer.from("G") }));

      assert.deepEqual(segments.map((segment) => (segment.type === "media") ? [ segment.data.toString(), segment.timestamps ] : null), [[ "GN", undefined ]]);
    });

    test("a cached init is a copy, never a view of the socket message", async () => {

      // The init arrives in a message over a buffer of its own, which is zeroed once delivered: the cached init and the emitted segment keep the bytes sent.
      const { session, ws } = await openSession();
      const segments = collectSegments(session);
      const message = new Uint8Array(buildInitSegment({ data: AMCREST_INIT }));

      ws.emitMessage(message.buffer);
      message.fill(0);

      const [segment] = segments;

      assert.ok(segment?.type === "init");
      assert.deepEqual(segment.data, AMCREST_INIT);
      assert.deepEqual(session.initSegment?.data, AMCREST_INIT);
      assert.notEqual(session.initSegment.data.buffer, message.buffer);
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
      const resolveUrl = async (params: URLSearchParams): Promise<LivestreamAddresses> => {

        capture.push(params);

        return { direct: null, proxied: "wss://controller/livestream" };
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
      const resolveUrl = async (params: URLSearchParams): Promise<LivestreamAddresses> => {

        capture.push(params);

        return { direct: null, proxied: "wss://controller/livestream" };
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

    test("build params serialize a UBV stream's parameters alone, with Opus asked for on every route", async () => {

      const capture: URLSearchParams[] = [];
      const resolveUrl = async (params: URLSearchParams): Promise<LivestreamAddresses> => {

        capture.push(params);

        return { direct: ALIAS_URL, proxied: PROXIED_URL };
      };

      // A UBV stream asking for timestamps and a segment length sends neither: the library writes its segments and a UBV stream carries no decode timestamps.
      await openSession({ resolveUrl, spec: { chunkSize: 8192, segmentLength: 200, source: { channel: 1, type: "channel" }, timestamps: true, upstream: "ubv" } });
      await openSession({ resolveUrl, spec: { audio: "opus" } });
      await openSession({ resolveUrl, spec: { audio: "opus", route: "direct" } });

      const opus = [ [ "audiocodec", "opus" ], [ "camera", "cam1" ], [ "channel", "0" ], [ "chunkSize", "4096" ], [ "lens", "0" ], [ "requestId", "cam1-0" ],
        [ "type", "ubnt" ] ];

      assert.deepEqual(capture.map((params) => [...params]), [ [ [ "camera", "cam1" ], [ "channel", "1" ], [ "chunkSize", "8192" ], [ "lens", "0" ],
        [ "requestId", "cam1-1" ], [ "type", "ubnt" ] ], opus, opus ]);
    });

    test("the socket factory is handed the URL the resolver negotiated", async () => {

      const { url } = await openSession({ resolveUrl: fixedAddresses("wss://controller/livestream?token=negotiated") });

      assert.equal(url, "wss://controller/livestream?token=negotiated", "the socket must be built on the URL the resolver returned");
    });
  });

  describe("routes", () => {

    test("a session given no route builds its socket on the proxied address", async () => {

      const { url } = await openSession({ resolveUrl: fixedAddresses(PROXIED_URL, DIRECT_URL) });

      assert.equal(url, PROXIED_URL);
    });

    test("a direct session builds its socket on the direct address", async () => {

      const { url } = await openSession({ resolveUrl: fixedAddresses(PROXIED_URL, DIRECT_URL), spec: { route: "direct" } });

      assert.equal(url, DIRECT_URL);
    });

    test("a direct session handed no direct address puts ProtectLivestreamRouteError on its rail and closes 1006, building no socket", async () => {

      let built = false;
      const closed: { cause?: ProtectError; code: number; reason: string }[] = [];
      const session = new LivestreamSession({

        log: silentLog(),
        resolveUrl: fixedAddresses(PROXIED_URL),
        spec: { cameraId: "cam1", route: "direct" },
        webSocket: (): FakeWebSocket => {

          built = true;

          return new FakeWebSocket({ autoOpen: false });
        }
      });
      const errors = collectErrors(session);

      // The negotiation answers at once, so the teardown has run by the next turn; reading then rather than awaiting keeps a session that dialed from hanging the row.
      session.on("closed", (info) => void closed.push(info));
      await settle();

      const [error] = errors;
      const info = present(closed[0], "the closed announcement");

      assert.ok(error instanceof ProtectLivestreamRouteError);
      assert.equal(error.message, "The UniFi Protect controller offered no direct livestream address.");
      assert.ok(Object.is(session.closeCause, error), "the rail's error is the closure's cause");
      assert.ok(Object.is(info.cause, error));
      assert.equal(info.code, 1006);
      assert.equal(info.reason, "the controller offered no direct livestream address");
      assert.equal(built, false, "a session with nothing it may dial builds no socket");
    });

    /* The upgrade's headers, read at a real peer: the direct route reads no auth hook and stamps nothing, and it never verifies the media server's certificate, so a
     * strict session still completes the handshake the self-signed peer offers.
     */
    test("a direct session under strict verification reaches handshaking, never reading the auth hook or stamping its headers on the upgrade", async () => {

      await using peer = await createLoopbackWebSocketPeer();
      const hook = countingAuthHeaders();
      const session = new LivestreamSession({ getAuthHeaders: hook.getAuthHeaders, log: silentLog(),
        resolveUrl: fixedAddresses("wss://" + peer.host + "/proxied", "wss://" + peer.host + "/AbCdEf"), spec: { cameraId: "cam1", route: "direct" }, verifyTls: true });

      assert.equal(await whenState(session, "handshaking"), "handshaking", "a direct dial never verifies the certificate");

      const headers = await peer.upgrade(0);

      assert.equal(Object.hasOwn(headers, "cookie"), false);
      assert.equal(Object.hasOwn(headers, "x-csrf-token"), false);
      assert.equal(hook.calls(), 0, "the direct route never reads the auth hook");

      await session.close();
    });

    test("a session given no route carries both of the auth hook's headers on its upgrade", async () => {

      await using peer = await createLoopbackWebSocketPeer();
      const hook = countingAuthHeaders();
      const session = new LivestreamSession({ getAuthHeaders: hook.getAuthHeaders, log: silentLog(), resolveUrl: fixedAddresses("wss://" + peer.host + "/live"),
        spec: { cameraId: "cam1" } });

      assert.equal(await whenState(session, "handshaking"), "handshaking");

      const headers = await peer.upgrade(0);

      assert.equal(headers["cookie"], AUTH_HEADERS.cookie);
      assert.equal(headers["x-csrf-token"], AUTH_HEADERS["x-csrf-token"]);
      assert.equal(hook.calls(), 1);

      await session.close();
    });

    test("a direct session on a minted alias that the peer resets keeps the alias out of its rail error and every line it logs", async () => {

      await using peer = await createLoopbackWebSocketPeer();
      const log = capturingLog();
      const session = new LivestreamSession({ log,
        resolveUrl: fixedAddresses("wss://" + peer.host + "/proxy/protect/" + ALIAS + "?token=" + ALIAS, "wss://" + peer.host + "/" + ALIAS + "?camera=cam1"),
        spec: { cameraId: "cam1", route: "direct" } });

      assert.equal(await whenState(session, "handshaking"), "handshaking");

      const failing = session.once("error");

      (await peer.connection(0)).reset();

      const [failure] = await failing;

      // The connected line and the fault's line are among what the session logged, so the reading covers each line a direct socket can raise.
      assert.ok(failure instanceof ProtectNetworkError);
      assert.ok(log.entries.some((entry) => entry.message === "Connected to the UniFi Protect livestream API."));
      assert.equal(reportedLines(log).length, 1);

      for(const rendered of [ inspect(failure, { depth: Infinity }), ...log.entries.map((entry) => inspect(entry, { depth: Infinity })) ]) {

        assert.ok(!rendered.includes(ALIAS), "no error or line may carry the minted alias: " + rendered);
      }
    });

    test("opened is false until the socket opens and true from then on, and dialedPort is null until the dial and the dialed port after it", async () => {

      const { promise, resolve } = Promise.withResolvers<LivestreamAddresses>();
      const sockets: FakeWebSocket[] = [];
      const session = new LivestreamSession({ log: silentLog(), resolveUrl: async (): Promise<LivestreamAddresses> => promise,
        spec: { cameraId: "cam1", route: "direct" }, webSocket: (): FakeWebSocket => {

          const ws = new FakeWebSocket({ autoOpen: false });

          sockets.push(ws);

          return ws;
        } });

      // Each reading is the session's dial, its port and whether its socket opened, taken while the negotiation is pending, once the socket is built on the direct
      // address, once it opens, and once the session has closed.
      const reading = (): [boolean, number | null, boolean] => [ session.dialed, session.dialedPort, session.opened ];

      assert.deepEqual(reading(), [ false, null, false ]);

      resolve({ direct: DIRECT_URL, proxied: PROXIED_URL });
      await settle();

      assert.deepEqual(reading(), [ true, 7446, false ]);

      present(sockets[0], "the direct socket").emitOpen();

      assert.deepEqual(reading(), [ true, 7446, true ]);

      await session.close();

      assert.deepEqual(reading(), [ true, 7446, true ]);

      // A proxied address names no port, so the session dials its scheme's default.
      const proxied = await openSession({ resolveUrl: fixedAddresses(PROXIED_URL, DIRECT_URL) });

      assert.equal(proxied.session.dialedPort, 443);

      await proxied.session.close();
    });
  });

  describe("the UBV upstream", () => {

    test("a UBV stream yields the writer's init with its label and description, its media as one allocation with no timestamps whatever the option says, and its " +
      "frames on the frame rail as views of the message", async () => {

      const { session, ws } = await openSession({ spec: { timestamps: true, upstream: "ubv" } });
      const segments = collectSegments(session);
      const frames: MediaFrame[] = [];

      session.on("frame", (frame) => void frames.push(frame));

      // The message is its own allocation, so a frame that is a view of it shares its buffer and a copy cannot.
      const message = new Uint8Array(ubvOpening("aac"));

      ws.emitMessage(message);

      const [ init, media ] = segments;

      assert.ok(init?.type === "init");
      assert.equal(init.codec, "avc1.4d001e,mp4a.40.2");
      assert.deepEqual(init.description, { tracks: [ { codec: "h264", height: 240, id: 1, kind: "video", level: 30, profile: 77, width: 320 },
        { channels: 1, codec: "aac", id: 2, kind: "audio", sampleRate: 48000 } ] });
      assert.equal(session.state, "live");
      assert.ok(media?.type === "media");
      assert.equal(Object.hasOwn(media, "timestamps"), false);
      assert.equal(media.data.byteOffset, 0);
      assert.equal(media.data.buffer.byteLength, media.data.length);
      assert.equal(media.moof.buffer, media.data.buffer);
      assert.equal(media.mdat.buffer, media.data.buffer);
      assert.deepEqual(frames.map(({ kind }) => kind), [ "video", "audio", "video", "video", "video" ]);

      for(const frame of frames) {

        assert.equal(frame.data.buffer, message.buffer);
      }
    });

    test("a proxied Opus session sends one play command when its first message arrives, never at open", async () => {

      const { ws } = await openSession({ resolveUrl: fixedAddresses(PROXIED_URL, ALIAS_URL), spec: { audio: "opus" } });

      assert.deepEqual(ws.sent, [], "nothing is sent at open");

      ws.emitMessage("a message the binary protocol does not carry");

      assert.deepEqual(ws.sent, [], "a message the session skips sends nothing");

      ws.emitMessage(ubvOpening("opus"));
      ws.emitMessage(ubvVideo(14400));

      assert.deepEqual(ws.sent.map((data) => Buffer.from(data)), [playCommand(ALIAS)]);
    });

    test("a direct Opus session and a proxied AAC session on UBV send nothing", async () => {

      for(const spec of [ { audio: "opus", route: "direct" }, { upstream: "ubv" } ] as const) {

        // Sequential by intent: each session is opened and read on its own.
        // eslint-disable-next-line no-await-in-loop
        const { ws } = await openSession({ resolveUrl: fixedAddresses(PROXIED_URL, ALIAS_URL), spec });

        ws.emitMessage(ubvOpening("opus"));

        assert.deepEqual(ws.sent, [], JSON.stringify(spec));
      }
    });

    test("a proxied Opus session offered no direct address puts ProtectLivestreamRouteError on its rail and closes 1006, building no socket", async () => {

      let built = false;
      const closed: { cause?: ProtectError; code: number; reason: string }[] = [];
      const session = new LivestreamSession({ log: silentLog(), resolveUrl: fixedAddresses(PROXIED_URL), spec: { audio: "opus", cameraId: "cam1" },
        webSocket: (): FakeWebSocket => {

          built = true;

          return new FakeWebSocket({ autoOpen: false });
        } });
      const errors = collectErrors(session);

      session.on("closed", (info) => void closed.push(info));
      await settle();

      const [error] = errors;

      assert.ok(error instanceof ProtectLivestreamRouteError);
      assert.equal(error.message, "The UniFi Protect controller offered no direct livestream address.");
      assert.equal(present(closed[0], "the closed announcement").reason, "the controller offered no direct livestream address");
      assert.equal(built, false, "a session with no stream to name builds no socket");
    });

    test("a proxied Opus session whose socket cannot send ends on ProtectConfigurationError with no line, before the message is decoded", async () => {

      const log = capturingLog();
      const fake = new FakeWebSocket({ autoOpen: false });
      const { promise, resolve } = Promise.withResolvers<undefined>();
      const session = new LivestreamSession({ log, resolveUrl: fixedAddresses(PROXIED_URL, ALIAS_URL), spec: { audio: "opus", cameraId: "cam1" },
        webSocket: (): ReturnType<typeof receivingSurface> => {

          resolve(undefined);

          return receivingSurface(fake);
        } });
      const closed: { cause?: ProtectError; code: number; reason: string }[] = [];
      const errors = collectErrors(session);
      const segments = collectSegments(session);

      session.on("closed", (info) => void closed.push(info));
      await promise;
      fake.emitOpen();
      fake.emitMessage(ubvOpening("opus"));

      const [error] = errors;
      const info = present(closed[0], "the closed announcement");

      assert.ok(error instanceof ProtectConfigurationError);
      assert.match(error.message, /no send method/);
      assert.deepEqual([ info.code, info.reason ], [ 1006, "the livestream socket cannot send" ]);
      assert.deepEqual(segments, [], "the message is never decoded");
      assert.deepEqual(log.entries.filter(({ level }) => (level === "warn") || (level === "error")), []);
    });

    test("a play command the socket fails to send ends the session as a failure of the socket, before the message is decoded", async () => {

      const failing = new FakeWebSocket({ autoOpen: false });

      failing.send = (): void => {

        throw errnoError("write EPIPE", "EPIPE");
      };

      const { session, ws } = await openSession({ resolveUrl: fixedAddresses(PROXIED_URL, ALIAS_URL), spec: { audio: "opus" }, webSocket: () => failing });
      const closed: { cause?: ProtectError; code: number; reason: string }[] = [];
      const errors = collectErrors(session);
      const segments = collectSegments(session);

      session.on("closed", (info) => void closed.push(info));
      ws.emitMessage(ubvOpening("opus"));

      assert.ok(errors[0] instanceof ProtectNetworkError);
      assert.equal(present(closed[0], "the closed announcement").reason, "the livestream play command could not be sent");
      assert.deepEqual(segments, []);
    });

    test("a proxied Opus session over the loopback peer sends its play and reaches live with no fault", async () => {

      await using peer = await createLoopbackWebSocketPeer({ messages: [ubvOpening("opus")] });
      const session = new LivestreamSession({ log: silentLog(),
        resolveUrl: fixedAddresses("wss://" + peer.host + "/live", "wss://" + peer.host + "/" + ALIAS + "?camera=cam1"), spec: { audio: "opus", cameraId: "cam1" } });
      const errors = collectErrors(session);

      assert.equal(await whenState(session, "live"), "live");
      assert.deepEqual(await peer.message(0), playCommand(ALIAS));
      assert.deepEqual(errors, []);

      await session.close();
    });

    test("no rail error, payload or log line of a proxied Opus session carries the alias it sends", async () => {

      const log = capturingLog();
      const { session, ws } = await openSession({ log, resolveUrl: fixedAddresses(PROXIED_URL, ALIAS_URL), spec: { audio: "opus" } });
      const closed: { cause?: ProtectError; code: number; reason: string }[] = [];
      const errors = collectErrors(session);

      session.on("closed", (info) => void closed.push(info));
      ws.emitMessage(Buffer.concat([ ubvOpening("opus"), UNREADABLE_RECORD ]));

      // The play went out and the refusal after it logged its line, so the reading covers the lines and payloads a play and a fault can raise.
      assert.equal(ws.sent.length, 1);
      assert.ok(log.entries.some(({ message }) => message === UNREADABLE));

      for(const rendered of [ ...errors, ...closed, ...log.entries ].map((item) => inspect(item, { depth: Infinity }))) {

        assert.ok(!rendered.includes(ALIAS), "no error, payload or line may carry the alias: " + rendered);
      }
    });

    test("a refusal of what the stream sent ends the session as a fault with one warning", async () => {

      const log = capturingLog();
      const { session, ws } = await openSession({ log, spec: { upstream: "ubv" } });
      const closed: { cause?: ProtectError; code: number; reason: string }[] = [];
      const errors = collectErrors(session);

      session.on("closed", (info) => void closed.push(info));
      ws.emitMessage(UNREADABLE_RECORD);

      const [error] = errors;
      const info = present(closed[0], "the closed announcement");

      assert.ok(error instanceof ProtectProtocolError);
      assert.ok(Object.is(session.closeCause, error), "the refusal is the closure's cause");
      assert.deepEqual([ info.code, info.reason ], [ 1006, "the livestream sent media the library could not read" ]);
      assert.deepEqual(log.entries.filter(({ level }) => level === "warn").map(({ args, message }) => ({ args, message })), [{ args: [{ error }],
        message: UNREADABLE }]);
    });
  });

  describe("watchdog", () => {

    test("a silent channel beyond the heartbeat window emits a ProtectStallError, logs one warning and closes", async () => {

      const clock = new TestClock();
      const log = capturingLog();
      const { session, ws } = await openSession({ clock, log });
      const errors = collectErrors(session);
      let closeInfo: { cause?: ProtectError; code: number; reason: string } | undefined;

      session.on("closed", (info) => { closeInfo = info; });

      clock.advance(PROTECT_LIVESTREAM_HEARTBEAT_TIMEOUT);
      await settle();

      // The platform raises a socket error here, after the teardown is over. A listener left attached would put it on the rail beside the stall.
      ws.emitError(errnoError("read ECONNRESET", "ECONNRESET"));

      assert.equal(errors.length, 1);
      assert.ok(errors[0] instanceof ProtectStallError);
      assert.equal((errors[0]).silentForMs, PROTECT_LIVESTREAM_HEARTBEAT_TIMEOUT);
      assert.equal(session.state, "closed");
      assert.equal(ws.closeRequested, true);

      // The stall the error rail carried is the same object the closure records as its cause.
      assert.ok(Object.is(closeInfo?.cause, errors[0]));

      // The pool's recovery heals a stall, so its one line is a warning, and the teardown detached the socket's error listener, so no socket line joins it.
      assert.deepEqual(log.entries.filter((entry) => entry.message.includes("went silent beyond the heartbeat window")).map(({ level }) => level), ["warn"],
        "the stall logs one warning");
      assert.deepEqual(reportedLines(log), [], "and no socket line beside it");
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

    test("a backward step of the time of day leaves the silence the watchdog reports the time that passed", async () => {

      const clock = new TestClock();
      const { session } = await openSession({ clock });
      const errors = collectErrors(session);

      // No frame arrives. The time of day is set back, and the watchdog's wake is armed on the same timeline, so reaching it takes the step as well as the window,
      // all of it silence.
      clock.advance(-TIME_OF_DAY_STEP_MS);
      clock.advance(PROTECT_LIVESTREAM_HEARTBEAT_TIMEOUT + TIME_OF_DAY_STEP_MS);
      await settle();

      assert.equal(errors.length, 1);
      assert.ok(errors[0] instanceof ProtectStallError);
      assert.equal(errors[0].silentForMs, PROTECT_LIVESTREAM_HEARTBEAT_TIMEOUT + TIME_OF_DAY_STEP_MS, "the silence is the time that passed, never shrunk by the step");
    });

    test("a backward step of the time of day past the rest of the window trips the watchdog at its next wake", async () => {

      const clock = new TestClock();
      const { session, ws } = await openSession({ clock });
      const errors = collectErrors(session);

      /* A frame lands halfway through the window, and the time of day is then set back a whole window. Reaching the wake takes the rest of the window and the step,
       * all of it silence since the frame and together past the threshold, though the time of day at the wake reads only half a window on from the frame.
       */
      clock.advance(PROTECT_LIVESTREAM_HEARTBEAT_TIMEOUT / 2);
      ws.emitMessage(buildInitSegment({ data: Buffer.from("I") }));
      clock.advance(-PROTECT_LIVESTREAM_HEARTBEAT_TIMEOUT);
      clock.advance((PROTECT_LIVESTREAM_HEARTBEAT_TIMEOUT / 2) + PROTECT_LIVESTREAM_HEARTBEAT_TIMEOUT);
      await settle();

      assert.equal(errors.length, 1, "the wake trips on the silence that passed");
      assert.ok(errors[0] instanceof ProtectStallError);
      assert.equal(errors[0].silentForMs, (PROTECT_LIVESTREAM_HEARTBEAT_TIMEOUT / 2) + PROTECT_LIVESTREAM_HEARTBEAT_TIMEOUT);
    });

    test("a logger that throws on the connected line leaves the watchdog running", async () => {

      const clock = new TestClock();
      const log: ProtectLogging = { ...silentLog(), debug: (message: string): void => {

        if(message === "Connected to the UniFi Protect livestream API.") {

          throw new Error("the logger refused the connected line");
        }
      } };
      const { promise, resolve } = Promise.withResolvers<FakeWebSocket>();
      const session = new LivestreamSession({ clock, log, resolveUrl: fixedUrl, spec: { cameraId: "cam1" }, webSocket: (): FakeWebSocket => {

        const ws = new FakeWebSocket({ autoOpen: false });

        resolve(ws);

        return ws;
      } });
      const errors = collectErrors(session);
      const ws = await promise;

      // The fake hands a listener's throw back to the caller, so the logger's throw from inside the open surfaces here, after the open's work.
      assert.throws(() => ws.emitOpen(), /the logger refused the connected line/);

      // No frame arrives, so the watchdog the open started finds the channel silent at its first wake.
      clock.advance(PROTECT_LIVESTREAM_HEARTBEAT_TIMEOUT);
      await settle();

      assert.equal(errors.length, 1, "the watchdog detected the stall");
      assert.ok(errors[0] instanceof ProtectStallError);
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

    test("a failed negotiation closes 1006 with the negotiation's reason", async () => {

      const session = new LivestreamSession({ clock: new TestClock(), log: silentLog(), resolveUrl: async (): Promise<never> => { throw new Error("connect refused"); },
        spec: { cameraId: "cam1" }, webSocket: (): FakeWebSocket => new FakeWebSocket({ autoOpen: false }) });
      const [info] = await session.once("closed");

      // A failure forced the close, so it carries the abnormal-closure code, which the teardown derives from the fault it ran for.
      assert.equal(info.code, 1006);
      assert.equal(info.reason, "the livestream endpoint negotiation failed");
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

    test("an error-rail listener reads the session closed, with the fault it hears already recorded as the close cause", async () => {

      const { session, ws } = await openSession();
      const heard: { closeCause: ProtectError | null; error: ProtectError; state: LivestreamState }[] = [];

      // The teardown writes the state and the close cause before it reports, so a listener reading the session from inside the emit finds it closed.
      session.on("error", (error) => void heard.push({ closeCause: session.closeCause, error, state: session.state }));
      ws.emitError(new Error("socket boom"));

      const reading = present(heard[0], "the rail's one emission");

      assert.equal(heard.length, 1);
      assert.equal(reading.state, "closed");
      assert.ok(Object.is(reading.closeCause, reading.error), "the fault on the rail is already the close cause");
    });

    test("a backward step of the time of day during a connection attempt leaves the elapsed time its timeout reports the time that passed", async () => {

      const clock = new TestClock();
      const built = Promise.withResolvers<FakeWebSocket>();
      const session = new LivestreamSession({ clock, log: silentLog(), resolveUrl: fixedUrl, spec: { cameraId: "cam1" }, webSocket: (): FakeWebSocket => {

        const ws = new FakeWebSocket({ autoOpen: false });

        built.resolve(ws);

        return ws;
      } });
      const ws = await built.promise;
      const failing = session.once("error");

      /* The attempt begins as the socket is built. The time of day is set back while it is under way, and it runs on for two and a half seconds before it times out.
       * An injected socket's own error is the whole account of its failure, so the undici connect timeout this row hands it classifies exactly as a real one does.
       */
      clock.advance(-TIME_OF_DAY_STEP_MS);
      clock.advance(2500);
      ws.emitError(errnoError("Connect Timeout Error", "UND_ERR_CONNECT_TIMEOUT"));

      const [error] = await failing;

      assert.ok(error instanceof ProtectTimeoutError);
      assert.equal(error.elapsedMs, 2500, "the elapsed time is the time that passed since the attempt began, untouched by the step");
    });
  });

  describe("certificate verification", () => {

    test("the upgrade reaches a controller's own certificate when strict verification is not asked for", async () => {

      // A real TLS peer rather than the injected fake: the certificate posture lives on the agent the default factory builds, which an injected socket never reaches.
      await using peer = await createLoopbackWebSocketPeer();
      const session = new LivestreamSession({ log: silentLog(), resolveUrl: fixedAddresses("wss://" + peer.host + "/live"),
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
      const session = new LivestreamSession({ log: silentLog(), resolveUrl: fixedAddresses("wss://" + peer.host + "/live"),
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

      const [refusal] = errors;

      // The refusal reads as one here as on the request path, naming the address the session dialed, and is the closure's cause the pool reads at a give-up.
      assert.ok(refusal instanceof ProtectCertificateError);
      assert.equal(refusal.code, "DEPTH_ZERO_SELF_SIGNED_CERT");
      assert.equal(refusal.host, peer.host);
      assert.ok(Object.is(session.closeCause, refusal));

      await session.close();
    });
  });

  /* What the session does with the connection it owns, over the default factory's real socket. A fake has no connection to release and never fires the synchronous
   * `error` and `close` a real socket fires when it is closed mid-connect, so nothing above a fake can tell whether the real connection was let go or whether a
   * teardown the session asked for reached its error rail. Each row bounds a release on real time, against undici's ten-second connect timer.
   */
  describe("a real connection", () => {

    test("close() of an open session ends its connection at once, though the peer never answers the close frame", async () => {

      await using peer = await createLoopbackWebSocketPeer();
      const session = new LivestreamSession({ log: silentLog(), resolveUrl: fixedAddresses("wss://" + peer.host + "/live"), spec: { cameraId: "cam1" } });

      assert.equal(await whenState(session, "handshaking"), "handshaking");

      const connection = await peer.connection(0);
      const startedAt = process.hrtime.bigint();

      await session.close();
      await connection.closed;

      assert.ok(elapsedSince(startedAt) < DIAL_SETTLE_BOUND_MS, "the session's close releases the connection rather than waiting on the peer");
    });

    test("close() has released the connection it owns by the time a closed listener runs", async () => {

      await using peer = await createLoopbackWebSocketPeer();

      // The session holds its socket privately, so the row takes it from undici's own announcement, as the events stream's row does, and reads it from inside
      // `closed` rather than at the peer, which learns of a severance only on a later turn.
      using announced = announcedSockets();

      const session = new LivestreamSession({ log: silentLog(), resolveUrl: fixedAddresses("wss://" + peer.host + "/live"), spec: { cameraId: "cam1" } });

      assert.equal(await whenState(session, "handshaking"), "handshaking");

      const destroyedAtClosed: boolean[] = [];

      session.on("closed", () => void destroyedAtClosed.push(announced.sockets.every((socket) => socket.destroyed)));

      await session.close();

      assert.equal(announced.sockets.length, 1, "the one socket the session dialed was announced");
      assert.deepEqual(destroyedAtClosed, [true], "the connection is released before closed is delivered");
    });

    test("a stall reaches the error rail only once the connection is released", async () => {

      await using peer = await createLoopbackWebSocketPeer();
      using announced = announcedSockets();

      const clock = new TestClock();
      const session = new LivestreamSession({ clock, log: silentLog(), resolveUrl: fixedAddresses("wss://" + peer.host + "/live"),
        spec: { cameraId: "cam1" } });
      const releasedAtRail: boolean[] = [];

      // The rail listener is the stall's first report, and it reads the socket from inside the teardown, where the release has already run or has not.
      session.on("error", () => void releasedAtRail.push(announced.sockets.every((socket) => socket.destroyed)));

      assert.equal(await whenState(session, "handshaking"), "handshaking");

      clock.advance(PROTECT_LIVESTREAM_HEARTBEAT_TIMEOUT);
      await settle();

      assert.equal(announced.sockets.length, 1, "the one socket the session dialed was announced");
      assert.deepEqual(releasedAtRail, [true], "the stall reaches the rail with the connection already released");
    });

    test("a logger that throws on a stall's warning leaves the connection released, with the stall on the rail and as the close cause", async () => {

      await using peer = await createLoopbackWebSocketPeer();
      using announced = announcedSockets();

      let threw = false;
      const clock = new TestClock();
      const log: ProtectLogging = { ...silentLog(), warn: (message: string): void => {

        if(message.includes("went silent beyond the heartbeat window")) {

          threw = true;

          throw new Error("the logger refused the stall's line");
        }
      } };
      const session = new LivestreamSession({ clock, log, resolveUrl: fixedAddresses("wss://" + peer.host + "/live"), spec: { cameraId: "cam1" } });
      const errors = collectErrors(session);

      assert.equal(await whenState(session, "handshaking"), "handshaking");

      // The watchdog's wake reaches the stall's line only inside the teardown, after the release, the close cause and the rail fault.
      clock.advance(PROTECT_LIVESTREAM_HEARTBEAT_TIMEOUT);
      await settle();

      assert.equal(threw, true, "the logger threw on the stall's line");
      assert.deepEqual(announced.sockets.map((socket) => socket.destroyed), [true], "the connection is released though the line threw");
      assert.equal(errors.length, 1, "and the rail heard the stall ahead of the line");
      assert.ok(errors[0] instanceof ProtectStallError);
      assert.ok(Object.is(session.closeCause, errors[0]), "as did the close cause");
    });

    test("a caller abort during the TLS dial releases the socket at once and keeps the error rail empty", async () => {

      await using peer = await createLoopbackSilentPeer();

      const controller = new AbortController();
      const session = new LivestreamSession({ log: silentLog(), resolveUrl: fixedAddresses("wss://" + peer.host + "/live"), signal: controller.signal,
        spec: { cameraId: "cam1" } });
      const errors = collectErrors(session);
      const closed = Promise.withResolvers<{ cause?: ProtectError; code: number; reason: string }>();

      session.on("closed", (info) => closed.resolve(info));

      const connection = await peer.connection(0);
      const startedAt = process.hrtime.bigint();

      // The listeners come off before the socket is asked to close, so the teardown the caller asked for carries its own cause rather than a socket failure.
      controller.abort();

      const info = await closed.promise;

      await connection.closed;

      assert.ok(elapsedSince(startedAt) < DIAL_SETTLE_BOUND_MS, "a cancelled connection attempt is released at once rather than lingering to undici's own timer");
      assert.deepEqual(errors, [], "a caller's cancel is no socket failure");
      assert.equal(info.code, 1000);
      assert.ok(info.cause instanceof ProtectAbortedError);
    });

    test("a dial nothing is listening for carries the platform's own errno onto the rail", async () => {

      const session = new LivestreamSession({ log: silentLog(),
        resolveUrl: async (): Promise<LivestreamAddresses> => ({ direct: null, proxied: "wss://127.0.0.1:" + (await freePort()).toString() + "/live" }),
        spec: { cameraId: "cam1" } });
      const [error] = await session.once("error");

      assert.ok(error instanceof ProtectNetworkError);
      assert.ok(!(error instanceof ProtectCertificateError));
      assert.equal(error.code, "ECONNREFUSED", "the connector's record of the dial is what carries the errno");
      assert.ok(Object.is(session.closeCause, error));
    });

    test("a connection attempt that times out reaches the rail as ProtectTimeoutError measured on the injected clock", async (t) => {

      await using peer = await createLoopbackSilentPeer();

      const clock = new TestClock();
      const dials: TLSSocket[] = [];
      const dial = tls.connect;
      const elapsedMs = 2500;

      // The platform's dial is wrapped for this test alone, as the events stream's own row wraps it, so a timeout reaches the session the way a real one does.
      t.mock.method(tls, "connect", (options: ConnectionOptions): TLSSocket => {

        const socket = dial(options);

        dials.push(socket);

        return socket;
      });

      const session = new LivestreamSession({ clock, log: silentLog(), resolveUrl: fixedAddresses("wss://" + peer.host + "/live"),
        spec: { cameraId: "cam1" } });
      const failing = session.once("error");

      await peer.connection(0);
      clock.advance(elapsedMs);

      present(dials[0], "the dial the owned connector vended").destroy(Object.assign(new AggregateError([errnoError("connect ETIMEDOUT " + peer.host, "ETIMEDOUT")],
        "connect ETIMEDOUT"), { code: "ETIMEDOUT" }));

      const [error] = await failing;

      assert.ok(error instanceof ProtectTimeoutError);
      assert.equal(error.message, "The UniFi Protect livestream API connection timed out.");
      assert.equal(error.elapsedMs, elapsedMs, "the elapsed time is the injected clock's own measure from the start of the attempt");
    });

    /* The ways an open socket's connection ends, each over the owned connector, because undici's WebSocket reports every one of them as the same empty `TypeError`
     * and only the connector's record of the established connection tells them apart. The session opens into `handshaking` here, since the peer sends no init.
     */
    test("a peer's reset of an open session logs one warning naming ECONNRESET and puts that reset on the rail", async () => {

      await using peer = await createLoopbackWebSocketPeer();
      const log = capturingLog();
      const session = new LivestreamSession({ log, resolveUrl: fixedAddresses("wss://" + peer.host + "/live"), spec: { cameraId: "cam1" } });

      assert.equal(await whenState(session, "handshaking"), "handshaking");

      const failing = session.once("error");

      (await peer.connection(0)).reset();

      const [failure] = await failing;
      const [line] = reportedLines(log);

      assert.ok(failure instanceof ProtectNetworkError, "a reset is a reachability failure");
      assert.equal(failure.code, "ECONNRESET", "carrying the reset its own socket raised rather than the event's empty error");
      assert.deepEqual(reportedLines(log).map(({ level }) => level), ["warn"], "a reset heals itself, so its one line is a warning");
      assert.ok(Object.is((present(line, "the socket's line").args[0] as { error: unknown }).error, failure.cause), "and the line names the fault the rail carries");
    });

    test("a peer's hang-up on an open session without a close frame logs no line", async () => {

      await using peer = await createLoopbackWebSocketPeer();
      const log = capturingLog();
      const session = new LivestreamSession({ log, resolveUrl: fixedAddresses("wss://" + peer.host + "/live"), spec: { cameraId: "cam1" } });

      assert.equal(await whenState(session, "handshaking"), "handshaking");

      const failing = session.once("error");

      (await peer.connection(0)).end();

      const [failure] = await failing;

      // A hang-up is how an open connection ordinarily ends: the socket raised nothing of its own, so the event's empty error is the whole account.
      assert.ok(failure instanceof ProtectNetworkError);
      assert.equal(failure.code, undefined, "a hang-up carries no code");
      assert.deepEqual(reportedLines(log), [], "and logs no line, while the pool still hears it on the rail");
    });

    test("an ETIMEDOUT the open session's socket raises logs one warning", async (t) => {

      await using peer = await createLoopbackWebSocketPeer();

      const dials: TLSSocket[] = [];
      const dial = tls.connect;
      const log = capturingLog();

      // The platform's dial is wrapped for this test alone, as the events stream's own row wraps it, so the platform's own timeout can be raised on the vended socket.
      t.mock.method(tls, "connect", (options: ConnectionOptions): TLSSocket => {

        const socket = dial(options);

        dials.push(socket);

        return socket;
      });

      const session = new LivestreamSession({ log, resolveUrl: fixedAddresses("wss://" + peer.host + "/live"), spec: { cameraId: "cam1" } });

      assert.equal(await whenState(session, "handshaking"), "handshaking");

      const failing = session.once("error");

      present(dials[0], "the socket the owned connector vended").destroy(Object.assign(new Error("read ETIMEDOUT"),
        { code: "ETIMEDOUT", errno: -constants.errno.ETIMEDOUT, syscall: "read" }));

      const [failure] = await failing;

      assert.ok(failure instanceof ProtectNetworkError, "a peer that stopped answering is out of reach");
      assert.equal(failure.code, "ETIMEDOUT");
      assert.deepEqual(reportedLines(log).map(({ level }) => level), ["warn"], "an unreachable peer heals itself, so its one line is a warning");
    });

    test("a peer that resets the upgrade before the session opens puts ECONNRESET on the rail with no line", async () => {

      await using peer = await createLoopbackWebSocketPeer({ resetUpgrade: true });
      const log = capturingLog();
      const session = new LivestreamSession({ log, resolveUrl: fixedAddresses("wss://" + peer.host + "/live"), spec: { cameraId: "cam1" } });
      const [failure] = await session.once("error");

      // The dial succeeded, so the connector holds no dial failure, and the reset of the established connection is the record the one cause reads.
      assert.ok(failure instanceof ProtectNetworkError);
      assert.equal(failure.message, "The UniFi Protect livestream API connection failed.");
      assert.equal(failure.code, "ECONNRESET", "the rail failure carries the reset the socket raised during the upgrade");
      assert.ok(Object.is(session.closeCause, failure), "and so does the closure's cause");
      assert.deepEqual(reportedLines(log), [], "a socket that never opened logs no line");
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
      const resolveUrl = async (_params: URLSearchParams, opts: { signal?: AbortSignal }): Promise<LivestreamAddresses> => {

        handed.push(opts.signal);

        const { promise, reject } = Promise.withResolvers<LivestreamAddresses>();

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

      const negotiation = Promise.withResolvers<LivestreamAddresses>();
      let built = false;

      // No caller signal is passed, so the resolver is never cancelled: it resolves only after close() has torn the session down, and the connect must see that
      // teardown and bail rather than open a socket nothing would ever close.
      const session = new LivestreamSession({

        log: silentLog(),
        resolveUrl: async (): Promise<LivestreamAddresses> => negotiation.promise,
        spec: { cameraId: "cam1", source: { channel: 0, type: "channel" } },
        webSocket: (): FakeWebSocket => {

          built = true;

          return new FakeWebSocket({ autoOpen: false });
        }
      });

      await settle();
      await session.close();
      negotiation.resolve({ direct: null, proxied: "wss://controller/livestream" });
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

    test("a close() a rail listener forces from inside a socket error keeps the fault's code, reason and cause", async () => {

      const { session, ws } = await openSession();
      const errors = collectErrors(session);
      const closed: { cause?: ProtectError; code: number; reason: string }[] = [];

      // The listener runs inside the teardown the fault started, so the close it asks for finds that teardown already under way and leaves its reason standing.
      session.on("error", () => void session.close());
      session.on("closed", (info) => void closed.push(info));
      ws.emitError(new Error("socket boom"));

      assert.equal(closed.length, 1, "the closure is announced once");

      const info = present(closed[0], "the announced closure");

      assert.equal(info.code, 1006);
      assert.equal(info.reason, "the livestream connection errored");
      assert.ok(Object.is(info.cause, errors[0]), "the fault the rail carried is the closure's cause");
    });

    test("a close() re-entered from a closed listener runs no second teardown and resolves", async () => {

      const { session } = await openSession();
      const reentered: Promise<void>[] = [];
      let closedEvents = 0;

      session.on("closed", () => {

        closedEvents++;
        reentered.push(session.close());
      });

      await session.close();
      await Promise.all(reentered);

      assert.equal(reentered.length, 1, "the closed listener ran once and its close() resolved");
      assert.equal(closedEvents, 1, "and the teardown it re-entered announced the close once");
    });

    test("a logger that throws on an open socket's fault line throws only after the rail and the close cause heard the fault", async () => {

      const log: ProtectLogging = { ...silentLog(), warn: (message: string): void => {

        if(message === REPORTED) {

          throw new Error("the logger refused the fault's line");
        }
      } };
      const { session, ws } = await openSession({ log });
      const errors = collectErrors(session);

      // The fake hands a listener's throw back to the caller, so the logger's throw from inside the teardown surfaces here, after every report ahead of the line.
      assert.throws(() => ws.emitError(errnoError("read ECONNRESET", "ECONNRESET")), /the logger refused the fault's line/);
      assert.equal(errors.length, 1, "the rail heard the fault ahead of the line");
      assert.ok(Object.is(session.closeCause, errors[0]), "as did the close cause");
      assert.equal(session.state, "closed");
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

    /* Each way an open session tears down ends what its events handed out, whatever started the teardown: a stream opened without a signal ends once it has
     * delivered the `closed` emission the teardown made, and a pending wait rejects with the session's close, whose cause is the closure's cause - the fault the
     * teardown put on the error rail, or nothing for a close the client asked for or one the peer started.
     */
    const endings: { cause: (errors: ProtectError[]) => unknown; faults: number; name: string; run: (stage: { session: LivestreamSession; ws: FakeWebSocket }) =>
      Promise<void> | void; }[] = [

      { cause: (): undefined => undefined, faults: 0, name: "close()", run: async ({ session }): Promise<void> => session.close() },
      { cause: (): undefined => undefined, faults: 0, name: "a peer close", run: ({ ws }): void => ws.emitClose(1001, "going away") },
      { cause: ([fault]): unknown => fault, faults: 1, name: "a socket error", run: ({ ws }): void => ws.emitError(new Error("socket reset")) }
    ];

    for(const { cause, faults, name, run } of endings) {

      test("after " + name + " of an open session, a stream opened without a signal ends and a pending wait rejects with the session's close", async () => {

        const { session, ws } = await openSession();
        const errors = collectErrors(session);
        const closed: unknown[] = [];
        const streamed = (async (): Promise<void> => {

          for await(const info of session.stream("closed")) {

            closed.push(info);
          }
        })();
        const wait = session.once("segment");
        const ended = settlement(streamed);
        const settled = settlement(wait);

        await run({ session, ws });

        await expectAt(ended, { message: "the stream opened without a signal ended at the teardown" });
        await expectAt(settled, { message: "the pending wait settled at the teardown" });
        await streamed;
        assert.equal(closed.length, 1, "the stream delivered the closed emission the teardown made before it ended");
        assert.equal(errors.length, faults, "only a fault reaches the error rail");
        await assert.rejects(wait, (error: unknown) => {

          assert.ok(error instanceof ProtectAbortedError);
          assert.equal(error.message, "The UniFi Protect livestream session closed.");
          assert.equal(error.cause, cause(errors), "the close carries the closure's cause, if any, as its cause");

          return true;
        });
      });
    }
  });

  /* Every listener the session registers, on its socket and on the caller's signal, comes off in its teardown by the identity it was registered under, as the
   * events stream's do. The fake removes a listener on that request and on no other, so a teardown that forgot one leaves it for the count to read.
   */
  describe("listener detach", () => {

    // How a row has its session built: on which clock, whether its socket opens, and on which caller signal.
    interface BuiltSessionOptions {

      clock?: TestClock;
      open?: boolean;
      signal?: AbortSignal;
    }

    // Build a session over the given fake and wait for the socket to be built, so its listeners are attached, opening it when asked.
    async function builtSession(ws: FakeWebSocket, { clock = new TestClock(), open = false, signal }: BuiltSessionOptions = {}): Promise<LivestreamSession> {

      const built = Promise.withResolvers<undefined>();
      const session = new LivestreamSession({ clock, log: silentLog(), resolveUrl: fixedUrl, ...((signal !== undefined) && { signal }), spec: { cameraId: "cam1" },
        webSocket: (): FakeWebSocket => {

          built.resolve(undefined);

          return ws;
        } });

      await built.promise;

      if(open) {

        ws.emitOpen();
      }

      return session;
    }

    test("a pre-open close() over a socket that fails from inside close() closes 1000 with the session's own reason, leaving the rail empty", async () => {

      const ws = new FakeWebSocket({ autoOpen: false, failsOnClose: true });
      const session = await builtSession(ws);
      const errors = collectErrors(session);
      const closed: { cause?: ProtectError; code: number; reason: string }[] = [];

      session.on("closed", (info) => void closed.push(info));

      await session.close();

      // The socket's error and its close 1006 fire inside close() and reach no listener, so the one teardown that runs is the one the session asked for.
      assert.deepEqual(closed, [{ code: 1000, reason: "the livestream was closed by the client" }]);
      assert.deepEqual(errors, [], "a teardown the session chose puts nothing on the rail");
    });

    test("sessions sharing one caller signal each remove only their own binding, so an abort after the first closes reaches the other alone", async () => {

      const controller = new AbortController();
      const first = await builtSession(new FakeWebSocket({ autoOpen: false }), { signal: controller.signal });
      const second = await builtSession(new FakeWebSocket({ autoOpen: false }), { signal: controller.signal });

      await first.close();

      assert.equal(getEventListeners(controller.signal, "abort").length, 1, "the second session's binding is the one left");

      controller.abort();

      assert.ok(second.closeCause instanceof ProtectAbortedError, "the abort tears the second session down");
      assert.equal(first.closeCause, null, "and reaches nothing of the session already closed");
    });

    // What a row hands the teardown path it runs.
    interface Stage {

      clock: TestClock;
      controller: AbortController;
      session: LivestreamSession;
      ws: FakeWebSocket;
    }

    // Each way a teardown starts, run on a session whose socket opened and on one still connecting. The watchdog arms at the open, so a stall ends an open socket
    // alone. The caller's signal stays live through every path but its own abort.
    const teardowns: { name: string; opens: readonly boolean[]; run: (stage: Stage) => Promise<void> | void }[] = [

      { name: "close()", opens: [ true, false ], run: async ({ session }): Promise<void> => session.close() },
      { name: "a peer close", opens: [ true, false ], run: ({ ws }): void => ws.emitClose(1001, "going away") },
      { name: "a socket error", opens: [ true, false ], run: ({ ws }): void => ws.emitError(new Error("socket boom")) },
      { name: "a watchdog stall", opens: [true], run: async ({ clock }): Promise<void> => {

        clock.advance(PROTECT_LIVESTREAM_HEARTBEAT_TIMEOUT);
        await settle();
      } },
      { name: "a caller abort", opens: [ true, false ], run: ({ controller }): void => controller.abort() }
    ];

    for(const { name, opens, run } of teardowns) {

      for(const open of opens) {

        test("after " + name + (open ? " of an open session" : " before the open") + " the socket holds no listener and the caller's signal no binding", async () => {

          const clock = new TestClock();
          const controller = new AbortController();
          const ws = new FakeWebSocket({ autoOpen: false });
          const session = await builtSession(ws, { clock, open, signal: controller.signal });

          await run({ clock, controller, session, ws });

          assert.equal(session.state, "closed");
          assert.equal(ws.listenerCount(), 0, "every socket listener the session registered is removed");
          assert.equal(getEventListeners(controller.signal, "abort").length, 0, "and so is the binding to the caller's signal");
        });
      }
    }
  });
});
