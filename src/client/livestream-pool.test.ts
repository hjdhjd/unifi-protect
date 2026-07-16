/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * livestream-pool.test.ts: Tests for the resilient-by-default LivestreamPool - multi-subscriber session sharing, late-joiner init replay, exact ref-counted teardown,
 * slow-vs-fast subscriber isolation, the stream-affecting pool key, the transport-backed URL resolver, diagnostics, Camera.livestream delegation, and the recovery layer:
 * invisible reconnect (same-codec init suppression), the codec-change terminal, policy give-up, urgency aggregation by minimum, the two regimes, reassess, and
 * whenEstablished.
 */
import { LivestreamPool, defaultLivestreamRecoveryPolicy } from "./livestream-pool.ts";
import { PROTECT_LIVESTREAM_AWAIT_MAX_MS, PROTECT_LIVESTREAM_AWAIT_MIN_MS, PROTECT_LIVESTREAM_ESTABLISH_DEADLINE_MS, PROTECT_LIVESTREAM_STALL_DEFAULT_MS,
  PROTECT_LIVESTREAM_STALL_FLOOR_MS, PROTECT_LIVESTREAM_STALL_POLL_MS } from "../settings.ts";
import { ProtectCodecChangeError, ProtectLivestreamUnavailableError } from "../errors.ts";
import type { RecoveryContext, RecoveryPolicy } from "./livestream-pool.ts";
import { buildInitSegment, buildMediaSegment } from "../transport/livestream-session.helpers.ts";
import { describe, test } from "node:test";
import { fakeClock, silentLog } from "../testing.helpers.ts";
import { Camera } from "../devices/camera.ts";
import type { DeviceContext } from "../devices/context.ts";
import type { FakeClock } from "../testing.helpers.ts";
import { FakeWebSocket } from "../transport/events-stream.helpers.ts";
import type { LivestreamSpec } from "../transport/livestream-session.ts";
import type { Segment } from "../transport/livestream-session.ts";
import assert from "node:assert/strict";
import { channels } from "../diagnostics.ts";

const SPEC: LivestreamSpec = { cameraId: "cam1", source: { channel: 0, type: "channel" } };

// Yield the event loop so the pool's async session connect (negotiate then build the socket) reaches the point where the fake socket exists and its listeners attached.
function flush(): Promise<void> {

  return new Promise((resolve) => setImmediate(resolve));
}

// Total index access under noUncheckedIndexedAccess, read as an assertion.
function at<T>(items: T[], index: number): T {

  const value = items[index];

  assert.ok(value !== undefined, "expected an element at index " + index.toString());

  return value;
}

// A pool over fake sockets and a fixed resolver. Every socket the pool's sessions build is captured so tests can drive `open` / `message` / `error` deterministically. A
// recovery policy may be injected; omitting it exercises the library default.
function makePool(options: { clock?: FakeClock; recoveryPolicy?: RecoveryPolicy } = {}):
{ clock: FakeClock; pool: LivestreamPool; sockets: FakeWebSocket[] } {

  const sockets: FakeWebSocket[] = [];
  const clock = options.clock ?? fakeClock();
  const pool = new LivestreamPool({

    clock,
    log: silentLog(),
    ...((options.recoveryPolicy !== undefined) && { recoveryPolicy: options.recoveryPolicy }),
    resolveUrl: async () => "wss://controller/live",
    webSocket: () => {

      const ws = new FakeWebSocket({ autoOpen: false });

      sockets.push(ws);

      return ws;
    }
  });

  return { clock, pool, sockets };
}

// Pull a single segment from a subscription, asserting the iterator yielded one.
async function nextSegment(iterator: AsyncIterator<Segment>): Promise<Segment> {

  const result = await iterator.next();

  assert.equal(result.done, false);
  assert.ok(result.value !== undefined);

  return result.value;
}

// Drive a fresh socket through the open + init-segment handshake ONLY (no media), then yield the event loop. Liveness is media-keyed, so this drives a stream to the
// codec-gate / init point but NOT to "established" / "recovered" - the codec gate fires on the init, the cached init is delivered or suppressed, but `whenEstablished()`
// stays pending and the recovery episode stays in flight until media flows. Used by tests that legitimately need init-without-media: the codec-gate terminal (a codec
// change is detected on the init, before any media) and the late-joiner replay (a joiner attaching in the init->media gap gets the cached init).
async function establishInit(ws: FakeWebSocket, opts: { codec: string; data?: Buffer } = { codec: "avc1.640028" }): Promise<void> {

  ws.emitOpen();
  ws.emitMessage(buildInitSegment({ codec: opts.codec, data: opts.data ?? Buffer.from("INIT") }));

  await flush();
}

// Fully establish (or recover) a stream: drive the open + init handshake AND the first media segment, then yield the event loop so both reach the subscribers. Liveness
// is media-keyed, so it is this first media - not the init - that settles the episode `recovered`, resolves `whenEstablished()` true, and returns the stream to `live`.
// The codec lets a caller drive a same-codec (seamless) or codec-changed (terminal) reconnect; a codec change is detected on the init and tears the stream down before
// the media, so callers driving a codec change use `establishInit` instead.
async function establish(ws: FakeWebSocket, opts: { codec: string; data?: Buffer } = { codec: "avc1.640028" }): Promise<void> {

  await establishInit(ws, opts);
  pushMedia(ws);

  await flush();
}

// Push one media segment over a socket.
function pushMedia(ws: FakeWebSocket): void {

  ws.emitMessage(buildMediaSegment({ mdat: Buffer.from("m"), moof: Buffer.from("f") }));
}

// Pulse every active interval-poll loop `count` times. Two interval watchdogs are live once a stream is established: the session's any-byte heartbeat (registered first,
// at socket open) and the pool's media-stall watchdog (registered later, at the first media). The fake clock's `tick()` releases ONE pending iteration per call (FIFO),
// so a single tick wakes whichever loop registered earliest; pulsing a few times in a row wakes both and lets each loop re-register and re-evaluate. Tests that need the
// MEDIA watchdog (not the heartbeat) to evaluate `now() - lastMediaAt` against its threshold pulse twice so the pool loop's body runs after the session loop's.
async function pulse(clock: FakeClock, count = 2): Promise<void> {

  for(let index = 0; index < count; index++) {

    // eslint-disable-next-line no-await-in-loop
    await clock.tick();
  }
}

describe("LivestreamPool", () => {

  describe("multi-subscriber session sharing", () => {

    test("two subscriptions to the same stream share exactly one underlying session", async () => {

      const { pool, sockets } = makePool();

      await using _sub1 = pool.subscribe(SPEC);
      await using _sub2 = pool.subscribe(SPEC);

      await flush();

      assert.equal(sockets.length, 1);
    });

    test("disposing one subscriber keeps the session alive for the other; disposing the last closes it", async () => {

      const { pool, sockets } = makePool();
      const sub1 = pool.subscribe(SPEC);
      const sub2 = pool.subscribe(SPEC);

      await flush();

      const ws = at(sockets, 0);

      ws.emitOpen();

      // The first subscriber leaves; the session must keep running for the second.
      await sub1[Symbol.asyncDispose]();
      pushMedia(ws);

      const segment = await nextSegment(sub2[Symbol.asyncIterator]());

      assert.equal(segment.type, "media");
      assert.equal(ws.closeRequested, false);

      // The last subscriber leaves; the underlying session is torn down.
      await sub2[Symbol.asyncDispose]();

      assert.equal(ws.closeRequested, true);
    });

    test("different stream-affecting specs do not share a session", async () => {

      const { pool, sockets } = makePool();

      await using _sub1 = pool.subscribe({ cameraId: "cam1", source: { channel: 0, type: "channel" } });
      await using _sub2 = pool.subscribe({ cameraId: "cam1", source: { channel: 1, type: "channel" } });

      await flush();

      assert.equal(sockets.length, 2);
    });
  });

  describe("late-joiner init replay", () => {

    test("a subscriber that joins after the init segment receives the cached init first", async () => {

      const { pool, sockets } = makePool();
      const sub1 = pool.subscribe(SPEC);

      await flush();

      // Drive the init only (no media yet): the joiner attaches in the init->media gap, exactly the case where the cached init must be replayed before any media flows.
      await establishInit(at(sockets, 0), { codec: "avc1.640028", data: Buffer.from("INIT") });

      // A late joiner: the init has already been cached, so it is replayed as this subscriber's first segment.
      const sub2 = pool.subscribe(SPEC);
      const segment = await nextSegment(sub2[Symbol.asyncIterator]());

      assert.equal(segment.type, "init");
      assert.deepEqual((segment as { data: Buffer }).data, Buffer.from("INIT"));
      assert.equal(sub2.codec, "avc1.640028");
      assert.deepEqual(sub2.initSegment, { codec: "avc1.640028", data: Buffer.from("INIT") });

      await sub1[Symbol.asyncDispose]();
      await sub2[Symbol.asyncDispose]();
    });
  });

  describe("slow-vs-fast subscriber isolation", () => {

    test("a slow subscriber's backlog does not affect a fast subscriber's delivery", async () => {

      const { pool, sockets } = makePool();
      const fast = pool.subscribe(SPEC);
      const slow = pool.subscribe(SPEC);

      await flush();

      const ws = at(sockets, 0);

      ws.emitOpen();

      // Push a large run of segments. The slow subscriber never reads, so its queue grows; the fast subscriber drains in full.
      const total = 10000;

      for(let index = 0; index < total; index++) {

        pushMedia(ws);
      }

      let delivered = 0;

      for await (const _segment of fast) {

        if(++delivered === total) {

          break;
        }
      }

      // The fast subscriber received every segment independently of the slow one, whose queue holds the full backlog.
      assert.equal(delivered, total);
      assert.equal(slow.stats.queueDepth, total);
      assert.equal(slow.stats.peakQueueDepth, total);
      assert.equal(slow.stats.delivered, 0);

      await slow[Symbol.asyncDispose]();
    });
  });

  describe("subscription abort signal", () => {

    test("aborting a subscription's signal disposes only that subscription", async () => {

      const { pool, sockets } = makePool();
      const controller = new AbortController();
      const sub1 = pool.subscribe(SPEC);

      // The pool retains this subscription internally, so we discard the handle; its abort signal is what disposes it.
      pool.subscribe(SPEC, { signal: controller.signal });

      await flush();

      const ws = at(sockets, 0);

      ws.emitOpen();

      // Aborting sub2's signal disposes it; the shared session lives on for sub1.
      controller.abort();
      await flush();

      assert.equal(ws.closeRequested, false);

      // Disposing the remaining subscriber tears the session down, proving sub2 had already detached (refcount 2 -> 1 -> 0).
      await sub1[Symbol.asyncDispose]();

      assert.equal(ws.closeRequested, true);
    });

    test("an already-aborted signal disposes the subscription so its iterator ends immediately", async () => {

      const { pool } = makePool();
      const controller = new AbortController();

      controller.abort();

      const sub = pool.subscribe(SPEC, { signal: controller.signal });

      await flush();

      const result = await sub[Symbol.asyncIterator]().next();

      assert.equal(result.done, true);
    });
  });

  describe("iterator wake and clean delivery", () => {

    test("a parked iterator wakes when a segment arrives", async () => {

      const { pool, sockets } = makePool();
      const sub = pool.subscribe(SPEC);

      await flush();

      const ws = at(sockets, 0);

      ws.emitOpen();

      const iterator = sub[Symbol.asyncIterator]();
      // Pull before any segment is queued, so the iterator parks on the wake promise; the incoming segment must resolve it.
      const pending = iterator.next();

      pushMedia(ws);

      const result = await pending;

      assert.equal(result.done, false);
      assert.equal(result.value?.type, "media");

      await sub[Symbol.asyncDispose]();
    });
  });

  describe("ref-counting under concurrent dispose/subscribe", () => {

    test("subscribing again after the last subscriber left creates a fresh session", async () => {

      const { pool, sockets } = makePool();
      const sub1 = pool.subscribe(SPEC);

      await flush();
      await sub1[Symbol.asyncDispose]();

      // The key was removed at refcount 0, so a new subscription negotiates a fresh session rather than attaching to the closed one.
      await using _sub2 = pool.subscribe(SPEC);

      await flush();

      assert.equal(sockets.length, 2);
    });
  });

  describe("discardOnDispose", () => {

    test("dropping the undelivered queue on dispose delivers no stale segments and reports the exact discarded count", async () => {

      const { pool, sockets } = makePool();
      const sub = pool.subscribe(SPEC, { discardOnDispose: true });

      await flush();

      // Queue an init and two media without pulling, so three undelivered segments sit in this subscriber's queue.
      await establishInit(at(sockets, 0), { codec: "avc1.640028" });
      pushMedia(at(sockets, 0));
      pushMedia(at(sockets, 0));
      await flush();

      assert.equal(sub.stats.queueDepth, 3);

      await sub[Symbol.asyncDispose]();

      // The discard cleared exactly the three queued segments, and the terminal - not a stale segment - surfaces on the next pull.
      assert.equal(sub.stats.discarded, 3);
      assert.equal(sub.stats.queueDepth, 0);
      assert.equal((await sub[Symbol.asyncIterator]().next()).done, true);
    });

    test("a pool-forced give-up still drains the queued init before the terminal, even with discardOnDispose set", async () => {

      const clock = fakeClock();
      const { pool, sockets } = makePool({ clock });
      const sub = pool.subscribe(SPEC, { discardOnDispose: true });

      await flush();

      // Walk the default establishing curve to the deadline (as the compatibility-pinning drain-then-throw test does), emitting an init on each fresh socket. The first
      // attempt's init is queued; later same-codec re-inits are suppressed.
      const windows = [ 5000, 8000, 10000, 10000 ];

      for(const window of windows) {

        // eslint-disable-next-line no-await-in-loop
        await establishInit(at(sockets, sockets.length - 1), { codec: "avc1.640028" });
        clock.advance(window);
        // eslint-disable-next-line no-await-in-loop
        await flush();
      }

      // discardOnDispose is scoped to the consumer's own disposal, NOT the pool-forced fail() teardown: the queued init still drains to the consumer before the give-up
      // terminal, exactly as it does without the option. This is the drain-then-throw contract holding for the pool-forced path regardless of the flag.
      const iterator = sub[Symbol.asyncIterator]();

      assert.equal((await nextSegment(iterator)).type, "init");
      await assert.rejects(iterator.next(), ProtectLivestreamUnavailableError);
    });

    test("without discardOnDispose a disposed subscription still drains its queued segments before ending", async () => {

      const { pool, sockets } = makePool();
      const sub = pool.subscribe(SPEC);

      await flush();
      await establishInit(at(sockets, 0), { codec: "avc1.640028" });
      pushMedia(at(sockets, 0));
      await flush();

      assert.equal(sub.stats.queueDepth, 2);

      const iterator = sub[Symbol.asyncIterator]();

      await sub[Symbol.asyncDispose]();

      // The default is unchanged: the queued init and media still drain to the consumer before the clean terminal, and nothing was discarded.
      assert.equal(sub.stats.discarded, 0);
      assert.equal((await nextSegment(iterator)).type, "init");
      assert.equal((await nextSegment(iterator)).type, "media");
      assert.equal((await iterator.next()).done, true);
    });
  });

  describe("pool disposal", () => {

    test("disposing the pool closes every managed session", async () => {

      const { pool, sockets } = makePool();

      await using _subA = pool.subscribe({ cameraId: "cam1", source: { channel: 0, type: "channel" } });
      await using _subB = pool.subscribe({ cameraId: "cam2", source: { channel: 0, type: "channel" } });

      await flush();
      at(sockets, 0).emitOpen();
      at(sockets, 1).emitOpen();

      await pool[Symbol.asyncDispose]();

      assert.equal(sockets.length, 2);
      assert.equal(at(sockets, 0).closeRequested, true);
      assert.equal(at(sockets, 1).closeRequested, true);
    });
  });

  describe("resilient recovery", () => {

    test("a controller close drives an invisible reconnect: the iterator survives and segments resume", async () => {

      const { pool, sockets } = makePool();
      const sub = pool.subscribe(SPEC);

      await flush();

      // Establish keys on media: the init and the first media flow on the original socket, and it is the media that settles the stream `live`.
      await establish(at(sockets, 0), { codec: "avc1.640028" });

      const iterator = sub[Symbol.asyncIterator]();

      assert.equal((await nextSegment(iterator)).type, "init");
      assert.equal((await nextSegment(iterator)).type, "media");
      assert.equal(sub.state, "live");

      // The controller closes the stream. The pool recovers rather than failing the subscriber: a fresh session is created synchronously.
      at(sockets, 0).emitClose(1000, "the controller closed the stream");
      await flush();

      assert.equal(sockets.length, 2);

      // The reconnected socket negotiates the same codec, so its redundant init is suppressed and media resumes seamlessly - no second init reaches the iterator. The
      // reconnect settles `recovered` only when its first media flows, not on the suppressed init.
      await establish(at(sockets, 1), { codec: "avc1.640028" });

      const resumed = await nextSegment(iterator);

      assert.equal(resumed.type, "media");
      assert.equal(sub.state, "live");

      await sub[Symbol.asyncDispose]();
    });

    test("the first media segment after a reconnect carries a discontinuity marker; establishment and steady-state segments do not", async () => {

      const { pool, sockets } = makePool();
      const sub = pool.subscribe(SPEC);

      await flush();
      await establish(at(sockets, 0), { codec: "avc1.640028" });

      const iterator = sub[Symbol.asyncIterator]();

      // Establishment is not a discontinuity: the timeline is beginning, not resuming, so neither the init nor the first media segment is marked. The first media is the
      // one establish pushed - the segment that settles the stream `recovered` AND, were it a reconnect, would carry the marker; here it must not, because there is no
      // prior timeline.
      assert.equal((await nextSegment(iterator)).type, "init");

      const established = await nextSegment(iterator);

      assert.ok((established.type === "media") && (established.discontinuity === undefined), "establishment media must not be marked");

      // The controller closes the stream; the pool reconnects on a fresh same-codec socket (its redundant init is suppressed and media resumes seamlessly).
      at(sockets, 0).emitClose(1000, "the controller closed the stream");
      await flush();

      // The first media segment from the reconnected session is marked: its timeline restarted near zero, a backward jump the consumer must resynchronize on. The marker
      // now lands on the very segment that settles `recovered` (establish drives that first media), so recovered and the discontinuity coincide on one segment.
      await establish(at(sockets, 1), { codec: "avc1.640028" });

      const resumed = await nextSegment(iterator);

      assert.ok((resumed.type === "media") && (resumed.discontinuity === true), "the first media after a reconnect must be marked");

      // The latch clears after one marked segment: steady-state media that follows is unmarked.
      pushMedia(at(sockets, 1));

      const steady = await nextSegment(iterator);

      assert.ok((steady.type === "media") && (steady.discontinuity === undefined), "steady-state media after the marked segment must not be marked");

      // A second reconnect re-arms the marker, again on its first (recovered-settling) media.
      at(sockets, 1).emitClose(1000, "the controller closed the stream again");
      await flush();
      await establish(at(sockets, 2), { codec: "avc1.640028" });

      const resumedAgain = await nextSegment(iterator);

      assert.ok((resumedAgain.type === "media") && (resumedAgain.discontinuity === true), "the first media after a second reconnect must be marked again");

      await sub[Symbol.asyncDispose]();
    });

    test("a multi-attempt initial establishment does not mark its first-ever media as a discontinuity", async () => {

      const clock = fakeClock();

      // A policy that always reconnects lets us drive a failed first establishment attempt deterministically by elapsing its window.
      const { pool, sockets } = makePool({ clock, recoveryPolicy: () => ({ awaitMs: 1000, kind: "reconnect" }) });
      const sub = pool.subscribe(SPEC);

      await flush();

      // Attempt 0's window elapses without a segment. No media has ever flowed, so the episode is still ESTABLISHING (a cold start), not recovering, and the pool retries
      // on a fresh socket. This is exactly the case that arming on a non-null prior session object would have misread as a reconnect.
      clock.advance(1000);
      await flush();

      assert.equal(sockets.length, 2);

      // Attempt 1 succeeds and delivers the first-ever media - the segment that settles this still-establishing episode `recovered`. There is no prior timeline, so it
      // must NOT be marked, even though this install replaced a prior failed session object (the case arming on a non-null prior would have misread).
      await establish(at(sockets, 1), { codec: "avc1.640028" });

      const iterator = sub[Symbol.asyncIterator]();

      assert.equal((await nextSegment(iterator)).type, "init");

      const firstMedia = await nextSegment(iterator);

      assert.ok((firstMedia.type === "media") && (firstMedia.discontinuity === undefined), "the first-ever media of a multi-attempt cold start must not be marked");
      assert.equal(sub.state, "live");

      await sub[Symbol.asyncDispose]();
    });

    test("a heartbeat stall recovers rather than failing the subscriber", async () => {

      const clock = fakeClock();
      const { pool, sockets } = makePool({ clock });
      const sub = pool.subscribe(SPEC);

      await flush();

      // Fully establish on media (init + first media), so the stream is genuinely `live` before we stall it - liveness is media-keyed.
      await establish(at(sockets, 0), { codec: "avc1.640028" });

      const iterator = sub[Symbol.asyncIterator]();

      assert.equal((await nextSegment(iterator)).type, "init");
      assert.equal((await nextSegment(iterator)).type, "media");
      assert.equal(sub.state, "live");

      // The first session goes silent past its heartbeat window; its watchdog tears it down, and the pool begins recovery.
      clock.advance(10000);
      await clock.tick();
      await flush();

      assert.equal(sockets.length, 2);
      assert.equal(sub.state, "recovering");

      // The reconnected session restores the stream on its first media; the iterator never saw the stall error.
      await establish(at(sockets, 1), { codec: "avc1.640028" });

      assert.equal((await nextSegment(iterator)).type, "media");
      assert.equal(sub.state, "live");

      await sub[Symbol.asyncDispose]();
    });

    test("a codec change across a reconnect terminates the iterator with ProtectCodecChangeError", async () => {

      const { pool, sockets } = makePool();
      const sub = pool.subscribe(SPEC);

      await flush();

      // Fully establish on media so the close that follows begins a recovering episode (a close while live is a fault; a close while still establishing is absorbed).
      await establish(at(sockets, 0), { codec: "avc1.640028" });

      const iterator = sub[Symbol.asyncIterator]();

      // Drain the established init and media so the next pull surfaces the terminal rather than a queued segment.
      assert.equal((await nextSegment(iterator)).type, "init");
      assert.equal((await nextSegment(iterator)).type, "media");

      at(sockets, 0).emitClose(1000, "the controller closed the stream");
      await flush();

      // The reconnected session negotiates a different codec; the codec gate fires on the reconnect's INIT (before any media), so no fixed-codec consumer can adapt
      // mid-stream and the iterator throws the terminal. Init-only: the change is terminal before media would ever flow.
      await establishInit(at(sockets, 1), { codec: "hev1.1.6.L150.90" });

      await assert.rejects(iterator.next(), (error: unknown) => {

        assert.ok(error instanceof ProtectCodecChangeError);
        assert.equal(error.from, "avc1.640028");
        assert.equal(error.to, "hev1.1.6.L150.90");

        return true;
      });

      assert.equal(sub.state, "closed");
    });

    test("the recovery policy giving up terminates the iterator with ProtectLivestreamUnavailableError", async () => {

      const { pool, sockets } = makePool({ recoveryPolicy: () => ({ kind: "giveUp" }) });
      const sub = pool.subscribe(SPEC);

      await flush();

      // A giveUp-first policy never even opens a socket: establishment is abandoned immediately.
      assert.equal(sockets.length, 0);

      await assert.rejects(sub[Symbol.asyncIterator]().next(), (error: unknown) => {

        assert.ok(error instanceof ProtectLivestreamUnavailableError);
        assert.equal(error.phase, "establishing");
        assert.equal(error.attempts, 0);

        return true;
      });

      assert.equal(await sub.whenEstablished(), false);
    });

    test("a recovery policy that throws is treated as a give-up, terminating the iterator without leaking an unhandled rejection", async () => {

      // A consumer-supplied policy is arbitrary code; if it throws, the pool must neither wedge the stream nor surface an unhandled rejection on the detached recovery
      // task. The throw is caught and treated exactly as an explicit giveUp - the stream tears down and the terminal reaches every subscriber - so a throwing policy
      // fails closed, identically to the giveUp-first decision above: abandoned at establishment, before a socket is even opened.
      const { pool, sockets } = makePool({ recoveryPolicy: () => { throw new Error("the recovery policy threw"); } });
      const sub = pool.subscribe(SPEC);

      await flush();

      assert.equal(sockets.length, 0, "a policy that throws at the first consultation abandons establishment before opening a socket");

      await assert.rejects(sub[Symbol.asyncIterator]().next(), (error: unknown) => {

        assert.ok(error instanceof ProtectLivestreamUnavailableError);
        assert.equal(error.phase, "establishing");
        assert.equal(error.attempts, 0);

        return true;
      });

      assert.equal(await sub.whenEstablished(), false);
    });

    test("bounded establishment: the policy gives up after its attempt budget, throwing the establishing terminal", async () => {

      const clock = fakeClock();
      const policy: RecoveryPolicy = (context) => (context.attempts >= 2) ? { kind: "giveUp" } : { awaitMs: 1000, kind: "reconnect" };
      const { pool, sockets } = makePool({ clock, recoveryPolicy: policy });
      const sub = pool.subscribe(SPEC);

      await flush();

      // Attempt 0 opened a socket and is waiting its window; elapse it twice to exhaust the budget. No socket ever delivers a segment.
      clock.advance(1000);
      await flush();
      clock.advance(1000);
      await flush();

      assert.equal(sockets.length, 2);

      await assert.rejects(sub[Symbol.asyncIterator]().next(), (error: unknown) => {

        assert.ok(error instanceof ProtectLivestreamUnavailableError);
        assert.equal(error.phase, "establishing");
        assert.equal(error.attempts, 2);

        return true;
      });
    });

    test("an init-then-no-media session is a failed attempt that gives up establishing at the deadline", async () => {

      const clock = fakeClock();

      // The library default policy: patient establishing curve (5s, 8s, 10s, holding) bounded by the 30s deadline.
      const { pool, sockets } = makePool({ clock });
      const sub = pool.subscribe(SPEC);

      await flush();

      // Each attempt: the controller acks with an init but then produces NO media, then we elapse the attempt's window. Because liveness is media-keyed, an init alone
      // never settles the episode, so each such session is a failed media-establishment attempt - exactly the init-then-hang the change exists to bound. We walk the full
      // default curve (5s + 8s + 10s + 10s = 33s) until the deadline is crossed, emitting the init on each fresh socket and elapsing its window.
      const windows = [ 5000, 8000, 10000, 10000 ];

      for(const window of windows) {

        const socket = at(sockets, sockets.length - 1);

        // eslint-disable-next-line no-await-in-loop
        await establishInit(socket, { codec: "avc1.640028" });
        clock.advance(window);
        // eslint-disable-next-line no-await-in-loop
        await flush();
      }

      // The deadline (30s) is crossed, so the next consult gives up. Four patient attempts opened four sockets; the stream never established despite every init.
      assert.equal(sockets.length, 4);

      // The very first attempt's init was delivered (no prior cache) and is queued; subsequent same-codec re-inits were suppressed. Drain that one init so the next pull
      // surfaces the establishing terminal rather than the queued init - proving the init was delivered yet the stream still never established (no media ever flowed).
      const iterator = sub[Symbol.asyncIterator]();

      assert.equal((await nextSegment(iterator)).type, "init");

      await assert.rejects(iterator.next(), (error: unknown) => {

        assert.ok(error instanceof ProtectLivestreamUnavailableError);
        assert.equal(error.phase, "establishing");

        return true;
      });

      assert.equal(await sub.whenEstablished(), false);
    });

    test("a braindead connection that never produces media gives up at the establishing deadline", async () => {

      const clock = fakeClock();

      // A socket that opens but never sends an init OR media must still be bounded by the time-based establishing deadline, never waiting forever.
      const { pool, sockets } = makePool({ clock });
      const sub = pool.subscribe(SPEC);

      await flush();

      // Open each fresh socket but emit nothing, then elapse its window. The deadline is time-based from the episode start, so a perennially-silent connection gives up.
      const windows = [ 5000, 8000, 10000, 10000 ];

      for(const window of windows) {

        at(sockets, sockets.length - 1).emitOpen();
        clock.advance(window);
        // eslint-disable-next-line no-await-in-loop
        await flush();
      }

      assert.equal(sockets.length, 4);

      await assert.rejects(sub[Symbol.asyncIterator]().next(), (error: unknown) => {

        assert.ok(error instanceof ProtectLivestreamUnavailableError);
        assert.equal(error.phase, "establishing");

        return true;
      });

      assert.equal(await sub.whenEstablished(), false);
    });

    test("a recovering-phase init-then-no-media session reconnects on its first media", async () => {

      const clock = fakeClock();

      // Establish patiently, then on the recovering episode reconnect with a bounded window so an init-then-no-media recovery attempt elapses and retries until media
      // flows.
      const policy: RecoveryPolicy = (context) => (context.phase === "establishing") ? { awaitMs: 100000, kind: "reconnect" } : { awaitMs: 1000, kind: "reconnect" };
      const { pool, sockets } = makePool({ clock, recoveryPolicy: policy });
      const sub = pool.subscribe(SPEC);

      await flush();
      await establish(at(sockets, 0), { codec: "avc1.640028" });

      const iterator = sub[Symbol.asyncIterator]();

      assert.equal((await nextSegment(iterator)).type, "init");
      assert.equal((await nextSegment(iterator)).type, "media");

      // The controller drops the stream, starting a recovering episode.
      at(sockets, 0).emitClose(1000, "dropped");
      await flush();

      // The first recovery attempt acks with an init but produces no media; its window elapses, so it is a failed attempt and the pool reconnects again.
      await establishInit(at(sockets, 1), { codec: "avc1.640028" });
      clock.advance(1000);
      await flush();

      assert.equal(sockets.length, 3);
      assert.equal(sub.state, "recovering");

      // The next recovery attempt produces media: only now does the episode settle `recovered` and the stream return to live.
      await establish(at(sockets, 2), { codec: "avc1.640028" });

      const resumed = await nextSegment(iterator);

      assert.ok((resumed.type === "media") && (resumed.discontinuity === true), "the recovering first media settles recovered and is marked");
      assert.equal(sub.state, "live");

      await sub[Symbol.asyncDispose]();
    });

    test("a second consecutive reconnect settles recovered on its first media, with no wedge in recovering", async () => {

      const { pool, sockets } = makePool();
      const sub = pool.subscribe(SPEC);

      await flush();
      await establish(at(sockets, 0), { codec: "avc1.640028" });

      const iterator = sub[Symbol.asyncIterator]();

      assert.equal((await nextSegment(iterator)).type, "init");
      assert.equal((await nextSegment(iterator)).type, "media");

      // First reconnect: settles recovered on its first media.
      at(sockets, 0).emitClose(1000, "dropped");
      await flush();
      await establish(at(sockets, 1), { codec: "avc1.640028" });

      assert.equal((await nextSegment(iterator)).type, "media");
      assert.equal(sub.state, "live");

      // Second consecutive reconnect: it too must settle recovered on its own first media - the media latch re-arms per install, so the second recovery does not wedge in
      // "recovering" waiting on a settle that the init alone would never deliver.
      at(sockets, 1).emitClose(1000, "dropped again");
      await flush();

      assert.equal(sub.state, "recovering");

      await establish(at(sockets, 2), { codec: "avc1.640028" });

      assert.equal((await nextSegment(iterator)).type, "media");
      assert.equal(sub.state, "live");

      await sub[Symbol.asyncDispose]();
    });

    test("cancellation during the init-to-media gap tears down cleanly with no spurious attempt", async () => {

      const clock = fakeClock();
      const attempts: number[] = [];

      // Record each decision's attempt count so we can prove the cancellation booked no extra establishment attempt.
      const policy: RecoveryPolicy = (context) => {

        attempts.push(context.attempts);

        return { awaitMs: 100000, kind: "reconnect" };
      };

      const controller = new AbortController();
      const { pool, sockets } = makePool({ clock, recoveryPolicy: policy });
      const sub = pool.subscribe(SPEC, { signal: controller.signal });

      await flush();

      // The stream inits but has NOT yet produced media: the episode is in flight in the init->media gap, exactly the new window cancellation must survive.
      await establishInit(at(sockets, 0), { codec: "avc1.640028" });

      assert.equal(sub.state, "connecting");

      // Cancel mid-gap. The subscription disposes, the last subscriber leaves, and teardown aborts the controller, which settles the in-flight window `aborted` - no
      // elapse, no failed attempt booked.
      controller.abort();
      await flush();

      assert.equal(sub.state, "closed");
      assert.equal(at(sockets, 0).closeRequested, true);
      assert.equal(await sub.whenEstablished(), false);

      // Exactly one decision was consulted (the initial establish). The cancellation did not re-enter the loop to book a spurious second attempt.
      assert.deepEqual(attempts, [0]);
      assert.equal(sockets.length, 1);
    });

    test("reassess during the init-to-media gap does not reconnect while establishing", async () => {

      const clock = fakeClock();
      let consults = 0;

      // The default-shaped establishing policy: a patient reconnect window. Count consults to prove the reassess did not re-consult and reinstall mid-establishment.
      const policy: RecoveryPolicy = (context) => {

        consults++;

        return (context.phase === "establishing") ? { awaitMs: 100000, kind: "reconnect" } : { kind: "giveUp" };
      };

      const { pool, sockets } = makePool({ clock, recoveryPolicy: policy });
      const sub = pool.subscribe(SPEC);

      await flush();

      // The stream inits but has not produced media: the establishing episode is in flight in the init->media gap.
      await establishInit(at(sockets, 0), { codec: "avc1.640028" });

      assert.equal(sub.state, "connecting");
      assert.equal(consults, 1);

      // A reassess in the gap must be inert: establishment is urgency-independent, so re-asking cannot change the window, and reinstalling would tear down a healthy
      // connecting session about to produce media. No new socket, no second consult.
      sub.reassess();
      await flush();

      assert.equal(sockets.length, 1);
      assert.equal(consults, 1);
      assert.equal(sub.state, "connecting");

      // The in-flight session's first media still settles establishment normally - the reassess left it untouched.
      pushMedia(at(sockets, 0));
      await flush();

      assert.equal(sub.state, "live");
      assert.equal(await sub.whenEstablished(), true);

      await sub[Symbol.asyncDispose]();
    });

    test("urgency is aggregated across subscribers by the minimum", async () => {

      const clock = fakeClock();
      const contexts: RecoveryContext[] = [];
      const policy: RecoveryPolicy = (context) => {

        contexts.push({ ...context });

        // Establish patiently (a window long enough that the test never elapses it), then give up on the first recovery so the episode ends deterministically.
        return (context.phase === "establishing") ? { awaitMs: 100000, kind: "reconnect" } : { kind: "giveUp" };
      };

      const { pool, sockets } = makePool({ clock, recoveryPolicy: policy });
      const sub1 = pool.subscribe(SPEC, { urgency: () => 5000 });

      await flush();

      // Fully establish on media so the stream is live (liveness is media-keyed) before the drop begins a recovering episode the policy then gives up on.
      await establish(at(sockets, 0), { codec: "avc1.640028" });

      // A second, more-urgent subscriber joins the live stream, then the controller drops it - so the recovery decision sees both subscribers.
      const sub2 = pool.subscribe(SPEC, { urgency: () => 200 });

      at(sockets, 0).emitClose(1000, "dropped");
      await flush();

      const recovering = contexts.find((context) => context.phase === "recovering");

      assert.ok(recovering !== undefined);
      assert.equal(recovering.toleranceMs, 200);

      // The give-up tore the stream down; both subscribers reach the terminal once their queued init and media drain.
      assert.equal(sub1.state, "closed");
      assert.equal(sub2.state, "closed");

      await sub1[Symbol.asyncDispose]();
      await sub2[Symbol.asyncDispose]();
    });

    test("reassess is a no-op on a healthy stream", async () => {

      const { pool, sockets } = makePool();
      const sub = pool.subscribe(SPEC);

      await flush();
      await establish(at(sockets, 0), { codec: "avc1.640028" });

      const iterator = sub[Symbol.asyncIterator]();

      assert.equal((await nextSegment(iterator)).type, "init");
      assert.equal((await nextSegment(iterator)).type, "media");
      assert.equal(sub.state, "live");

      // The stream is live: no recovery episode is in flight, so reassess must not reconnect a working stream.
      sub.reassess();
      await flush();

      pushMedia(at(sockets, 0));

      assert.equal((await nextSegment(iterator)).type, "media");
      assert.equal(sockets.length, 1);

      await sub[Symbol.asyncDispose]();
    });

    test("reassess re-decides an in-flight recovery episode", async () => {

      const clock = fakeClock();
      let recoveringCalls = 0;
      const policy: RecoveryPolicy = (context) => {

        if(context.phase === "establishing") {

          return { awaitMs: 100000, kind: "reconnect" };
        }

        recoveringCalls++;

        // The first recovery decision parks on a long wait; the reassess must force a re-decision that this time reconnects.
        return (recoveringCalls === 1) ? { forMs: 1000000000, kind: "wait" } : { awaitMs: 100000, kind: "reconnect" };
      };

      const { pool, sockets } = makePool({ clock, recoveryPolicy: policy });
      const sub = pool.subscribe(SPEC);

      await flush();
      await establish(at(sockets, 0), { codec: "avc1.640028" });

      at(sockets, 0).emitClose(1000, "dropped");
      await flush();

      // The recovery episode is parked on a `wait` - no new socket yet.
      assert.equal(sockets.length, 1);

      sub.reassess();
      await flush();

      // The reassess re-consulted the policy, which now reconnected.
      assert.equal(sockets.length, 2);
      assert.equal(recoveringCalls, 2);

      await sub[Symbol.asyncDispose]();
    });

    test("a disposed subscriber's reassess cannot re-decide a shared in-flight recovery episode", async () => {

      const clock = fakeClock();
      let recoveringCalls = 0;
      const policy: RecoveryPolicy = (context) => {

        if(context.phase === "establishing") {

          return { awaitMs: 100000, kind: "reconnect" };
        }

        recoveringCalls++;

        // The first recovery decision parks on a long wait; only a valid reassess should force the re-decision that reconnects.
        return (recoveringCalls === 1) ? { forMs: 1000000000, kind: "wait" } : { awaitMs: 100000, kind: "reconnect" };
      };

      const { pool, sockets } = makePool({ clock, recoveryPolicy: policy });

      // Both subscribers attach while the stream is live, before the drop, so neither attach trips the joiner re-decision that only fires during a recovering episode.
      const sub1 = pool.subscribe(SPEC);

      await flush();
      await establish(at(sockets, 0), { codec: "avc1.640028" });

      const sub2 = pool.subscribe(SPEC);

      // The controller drops the live stream, beginning a recovering episode the policy parks on a wait - no new socket yet.
      at(sockets, 0).emitClose(1000, "dropped");
      await flush();

      assert.equal(sockets.length, 1);

      // Dispose one subscriber; the sibling still owns the in-flight episode, and detach does not re-decide while a subscriber remains.
      await sub1[Symbol.asyncDispose]();
      await flush();

      // The disposed subscriber's reassess must leave the parked episode untouched. Without the guard this call settles the episode early, reconnecting and incrementing
      // recoveringCalls - so the two assertions below fail against the unguarded implementation.
      sub1.reassess();
      await flush();

      assert.equal(sockets.length, 1);
      assert.equal(recoveringCalls, 1);

      // Positive control: the still-live sibling's reassess DOES settle the episode, proving the guard is scoped to the disposed subscription rather than disabling
      // reassessment outright.
      sub2.reassess();
      await flush();

      assert.equal(sockets.length, 2);
      assert.equal(recoveringCalls, 2);

      await sub2[Symbol.asyncDispose]();
    });
  });

  describe("recovery diagnostics", () => {

    test("recovery:started and recovery:recovered fire across an invisible reconnect", async () => {

      const started: unknown[] = [];
      const recovered: unknown[] = [];
      const onStarted = (message: unknown): void => void started.push(message);
      const onRecovered = (message: unknown): void => void recovered.push(message);

      channels.livestreamRecoveryStarted.subscribe(onStarted);
      channels.livestreamRecoveryRecovered.subscribe(onRecovered);

      try {

        const { pool, sockets } = makePool();
        const sub = pool.subscribe(SPEC);

        await flush();
        await establish(at(sockets, 0), { codec: "avc1.640028" });

        at(sockets, 0).emitClose(1000, "dropped");
        await flush();
        await establish(at(sockets, 1), { codec: "avc1.640028" });

        assert.equal(started.length, 1);
        assert.equal(recovered.length, 1);
        assert.equal((started[0] as { key: string }).key.startsWith("cam1:0:"), true);
        assert.equal((started[0] as { cameraId: string }).cameraId, "cam1");
        assert.ok(typeof (recovered[0] as { downtimeMs: number }).downtimeMs === "number");
        assert.equal((recovered[0] as { cameraId: string }).cameraId, "cam1");

        await sub[Symbol.asyncDispose]();
      } finally {

        channels.livestreamRecoveryStarted.unsubscribe(onStarted);
        channels.livestreamRecoveryRecovered.unsubscribe(onRecovered);
      }
    });

    test("recovery:exhausted fires and carries the attempt count when the policy gives up", async () => {

      const exhausted: unknown[] = [];
      const onExhausted = (message: unknown): void => void exhausted.push(message);

      channels.livestreamRecoveryExhausted.subscribe(onExhausted);

      try {

        const { pool } = makePool({ recoveryPolicy: () => ({ kind: "giveUp" }) });
        const sub = pool.subscribe(SPEC);

        await flush();

        await assert.rejects(sub[Symbol.asyncIterator]().next(), ProtectLivestreamUnavailableError);

        assert.equal(exhausted.length, 1);
        assert.equal((exhausted[0] as { attempts: number }).attempts, 0);
        assert.equal((exhausted[0] as { cameraId: string }).cameraId, "cam1");
      } finally {

        channels.livestreamRecoveryExhausted.unsubscribe(onExhausted);
      }
    });

    test("codec:changed fires with the from/to descriptors on a codec change", async () => {

      const changed: unknown[] = [];
      const onChanged = (message: unknown): void => void changed.push(message);

      channels.livestreamCodecChanged.subscribe(onChanged);

      try {

        const { pool, sockets } = makePool();
        const sub = pool.subscribe(SPEC);

        await flush();

        // Fully establish on media so the close begins a recovering episode the codec change then terminates.
        await establish(at(sockets, 0), { codec: "avc1.640028" });

        // Drain the established init and media so the next pull surfaces the terminal rather than a queued segment.
        const iterator = sub[Symbol.asyncIterator]();

        assert.equal((await nextSegment(iterator)).type, "init");
        assert.equal((await nextSegment(iterator)).type, "media");

        at(sockets, 0).emitClose(1000, "dropped");
        await flush();

        // The codec gate fires on the reconnect's init, before any media - init-only.
        await establishInit(at(sockets, 1), { codec: "hev1.1.6.L150.90" });

        assert.equal(changed.length, 1);
        assert.equal((changed[0] as { from: string }).from, "avc1.640028");
        assert.equal((changed[0] as { to: string }).to, "hev1.1.6.L150.90");
        assert.equal((changed[0] as { cameraId: string }).cameraId, "cam1");

        await assert.rejects(iterator.next(), ProtectCodecChangeError);
      } finally {

        channels.livestreamCodecChanged.unsubscribe(onChanged);
      }
    });

    test("session and subscription lifecycle channels fire with the expected payloads", async () => {

      const opened: unknown[] = [];
      const created: unknown[] = [];
      const disposed: unknown[] = [];
      const onOpened = (message: unknown): void => void opened.push(message);
      const onCreated = (message: unknown): void => void created.push(message);
      const onDisposed = (message: unknown): void => void disposed.push(message);

      channels.livestreamSessionOpened.subscribe(onOpened);
      channels.livestreamSubscriptionCreated.subscribe(onCreated);
      channels.livestreamSubscriptionDisposed.subscribe(onDisposed);

      try {

        const { pool } = makePool();
        const sub1 = pool.subscribe(SPEC);
        const sub2 = pool.subscribe(SPEC);

        await flush();
        await sub1[Symbol.asyncDispose]();
        await sub2[Symbol.asyncDispose]();

        // One session opened for the shared stream, one created event per subscriber, one disposed event per subscriber.
        assert.equal(opened.length, 1);
        assert.equal(created.length, 2);
        assert.equal(disposed.length, 2);
        assert.equal((opened[0] as { cameraId: string }).cameraId, "cam1");
        assert.ok(typeof (created[0] as { subscriptionId: string }).subscriptionId === "string");
      } finally {

        channels.livestreamSessionOpened.unsubscribe(onOpened);
        channels.livestreamSubscriptionCreated.unsubscribe(onCreated);
        channels.livestreamSubscriptionDisposed.unsubscribe(onDisposed);
      }
    });
  });

  describe("whenEstablished", () => {

    test("resolves true once the first MEDIA segment arrives, not on the init", async () => {

      const { pool, sockets } = makePool();
      const sub = pool.subscribe(SPEC);

      await flush();

      // Drive the init ONLY. Liveness is media-keyed, so the init alone does not establish: whenEstablished() stays pending and the stream is still "connecting".
      await establishInit(at(sockets, 0), { codec: "avc1.640028" });

      assert.equal(sub.state, "connecting");

      // Race whenEstablished() against a short settle: it must NOT have resolved on the init alone.
      const pendingProbe = await Promise.race([ sub.whenEstablished().then(() => "resolved"), flush().then(() => "pending") ]);

      assert.equal(pendingProbe, "pending", "whenEstablished() must not resolve on the init alone");

      // The first media settles establishment: the stream goes live and whenEstablished() resolves true.
      pushMedia(at(sockets, 0));
      await flush();

      assert.equal(sub.state, "live");
      assert.equal(await sub.whenEstablished(), true);

      await sub[Symbol.asyncDispose]();
    });

    test("resolves false when establishment is abandoned", async () => {

      const { pool } = makePool({ recoveryPolicy: () => ({ kind: "giveUp" }) });
      const sub = pool.subscribe(SPEC);

      await flush();

      assert.equal(await sub.whenEstablished(), false);
    });

    test("a disposed subscriber's establishment wait resolves false while a sibling's stays pending until media", async () => {

      const { pool, sockets } = makePool();
      const controller = new AbortController();
      const sub1 = pool.subscribe(SPEC);
      const sub2 = pool.subscribe(SPEC, { signal: controller.signal });

      await flush();

      // Drive the shared session to the init-only point: both subscribers are mid-establishment (whenEstablished() pending, no media yet).
      await establishInit(at(sockets, 0), { codec: "avc1.640028" });

      // Start sub2's wait, then abort its own signal. The wait must resolve false promptly - it routes through this subscription's own disposal - while sub1's wait stays
      // pending because the shared session lives on (sub1 is still attached). Pre-fix, sub2's wait forwarded straight to the shared latch and hung until sub1 settled it.
      const sub2Wait = sub2.whenEstablished();

      controller.abort();
      await flush();

      assert.equal(await sub2Wait, false);

      const siblingProbe = await Promise.race([ sub1.whenEstablished().then(() => "resolved"), flush().then(() => "pending") ]);

      assert.equal(siblingProbe, "pending", "the sibling's wait must stay pending while its own session is still establishing");

      // The first media settles the sibling's wait true, exactly as it would have without the disposal.
      pushMedia(at(sockets, 0));
      await flush();

      assert.equal(await sub1.whenEstablished(), true);

      await sub1[Symbol.asyncDispose]();
    });

    test("an explicit dispose mid-wait resolves the wait false with no signal involved", async () => {

      const { pool, sockets } = makePool();
      const sub1 = pool.subscribe(SPEC);
      const sub2 = pool.subscribe(SPEC);

      await flush();
      await establishInit(at(sockets, 0), { codec: "avc1.640028" });

      // No signal here: start sub2's wait, then dispose it explicitly. The disposal deferred - not an abort listener - settles the wait false, and the shared session
      // stays up because sub1 is still attached, so this false cannot be the give-up path. This tells the disposal-deferred design apart from a signal-only race.
      const sub2Wait = sub2.whenEstablished();

      await sub2[Symbol.asyncDispose]();

      assert.equal(await sub2Wait, false);

      pushMedia(at(sockets, 0));
      await flush();

      assert.equal(await sub1.whenEstablished(), true);

      await sub1[Symbol.asyncDispose]();
    });

    test("whenEstablished() called after disposal resolves false without forwarding to the still-pending shared latch", async () => {

      const { pool, sockets } = makePool();
      const sub1 = pool.subscribe(SPEC);
      const sub2 = pool.subscribe(SPEC);

      await flush();
      await establishInit(at(sockets, 0), { codec: "avc1.640028" });

      // Dispose sub2 first (sub1 keeps the shared session and its latch alive), THEN call whenEstablished(): the #disposed guard answers false directly. This proves the
      // deferred exists from construction - a dispose that precedes the first call still answers false - and that the post-dispose call never touches the shared latch.
      await sub2[Symbol.asyncDispose]();

      assert.equal(await sub2.whenEstablished(), false);

      // The shared latch is still pending (sub1 remains, no media yet); a forward would hang here rather than resolve false, which is what "did not forward" means.
      const hostStillPending = await Promise.race([ sub1.whenEstablished().then(() => "resolved"), flush().then(() => "pending") ]);

      assert.equal(hostStillPending, "pending");

      await sub1[Symbol.asyncDispose]();
    });

    test("repeated whenEstablished() calls share one disposal deferred and leak no per-call state", async () => {

      const { pool, sockets } = makePool();
      const sub1 = pool.subscribe(SPEC);
      const sub2 = pool.subscribe(SPEC);

      await flush();
      await establishInit(at(sockets, 0), { codec: "avc1.640028" });

      // Two overlapping waits on the same subscription, both racing the one shared disposal deferred rather than per-call listeners. Disposing once must settle BOTH
      // false, proving the deferred is shared so repeated calls register nothing per call and leak nothing.
      const firstWait = sub2.whenEstablished();
      const secondWait = sub2.whenEstablished();

      await sub2[Symbol.asyncDispose]();

      assert.equal(await firstWait, false);
      assert.equal(await secondWait, false);

      // A further call after disposal takes the guarded path and still answers false, identically.
      assert.equal(await sub2.whenEstablished(), false);

      await sub1[Symbol.asyncDispose]();
    });
  });

  describe("media-stall watchdog", () => {

    test("steady media under the threshold never trips; a media gap at the default 10s threshold fires one recovery", async () => {

      const clock = fakeClock();
      const { pool, sockets } = makePool({ clock });
      const sub = pool.subscribe(SPEC);

      await flush();

      // No urgency declared: the media-stall watchdog runs at the 10s default, the fail-safe analog of the byte heartbeat.
      await establish(at(sockets, 0), { codec: "avc1.640028" });

      const iterator = sub[Symbol.asyncIterator]();

      assert.equal((await nextSegment(iterator)).type, "init");
      assert.equal((await nextSegment(iterator)).type, "media");
      assert.equal(sub.state, "live");

      // Steady media keeps refreshing `#lastMediaAt`, so the watchdog never trips: advance a little under the threshold, push media to refresh, pulse, and stay live.
      clock.advance(PROTECT_LIVESTREAM_STALL_DEFAULT_MS - PROTECT_LIVESTREAM_STALL_POLL_MS);
      pushMedia(at(sockets, 0));
      await flush();
      await pulse(clock);

      assert.equal(sub.state, "live");
      assert.equal(sockets.length, 1);

      // Now go media-silent past the default threshold while keeping the byte heartbeat alive with a non-media frame, so the recovery can ONLY be the media watchdog (the
      // byte watchdog cannot trip - it just saw a frame). The media watchdog reads `now() - #lastMediaAt >= 10000` and recovers into a fresh session.
      clock.advance(PROTECT_LIVESTREAM_STALL_DEFAULT_MS);
      at(sockets, 0).emitMessage(buildInitSegment({ codec: "avc1.640028", data: Buffer.from("INIT") }));
      await flush();
      await pulse(clock);

      assert.equal(sub.state, "recovering");
      assert.equal(sockets.length, 2);

      await sub[Symbol.asyncDispose]();
    });

    test("a tighter declared urgency detects the stall at that value, well before the 10s heartbeat", async () => {

      const clock = fakeClock();
      const { pool, sockets } = makePool({ clock });

      // A 2s urgency is the consumer-declared detection deadline; it is below the 10s session heartbeat, so the media watchdog must catch the stall first.
      const sub = pool.subscribe(SPEC, { urgency: () => 2000 });

      await flush();
      await establish(at(sockets, 0), { codec: "avc1.640028" });

      const iterator = sub[Symbol.asyncIterator]();

      assert.equal((await nextSegment(iterator)).type, "init");
      assert.equal((await nextSegment(iterator)).type, "media");
      assert.equal(sub.state, "live");

      // Go silent for exactly the declared 2s. The heartbeat (10s, keyed on any byte) is nowhere near tripping, so only the media watchdog can fire here.
      clock.advance(2000);
      await pulse(clock);

      assert.equal(sub.state, "recovering");
      assert.equal(sockets.length, 2);

      await sub[Symbol.asyncDispose]();
    });

    test("a pathologically tiny declared urgency is clamped up to the floor", async () => {

      const clock = fakeClock();
      const { pool, sockets } = makePool({ clock });

      // A near-zero urgency would, unclamped, trip on ordinary inter-segment jitter. The floor clamp keeps the effective threshold at PROTECT_LIVESTREAM_STALL_FLOOR_MS.
      const sub = pool.subscribe(SPEC, { urgency: () => 1 });

      await flush();
      await establish(at(sockets, 0), { codec: "avc1.640028" });

      const iterator = sub[Symbol.asyncIterator]();

      assert.equal((await nextSegment(iterator)).type, "init");
      assert.equal((await nextSegment(iterator)).type, "media");

      // Just under the floor: the watchdog must NOT fire even though the declared urgency (1 ms) was crossed long ago - the clamp governs.
      clock.advance(PROTECT_LIVESTREAM_STALL_FLOOR_MS - 1);
      await pulse(clock);

      assert.equal(sub.state, "live");
      assert.equal(sockets.length, 1);

      // Cross the floor: now it fires.
      clock.advance(1);
      await pulse(clock);

      assert.equal(sub.state, "recovering");
      assert.equal(sockets.length, 2);

      await sub[Symbol.asyncDispose]();
    });

    test("a subscriber declaring Infinity opts out; a stream where every subscriber opts out is never media-watched", async () => {

      const clock = fakeClock();
      const { pool, sockets } = makePool({ clock });

      // Every subscriber opts out of media-stall detection: the MIN is Infinity, so the per-tick `>= Infinity` comparison never fires and only the byte backstop watches.
      const sub = pool.subscribe(SPEC, { urgency: () => Infinity });

      await flush();
      await establish(at(sockets, 0), { codec: "avc1.640028" });

      const iterator = sub[Symbol.asyncIterator]();

      assert.equal((await nextSegment(iterator)).type, "init");
      assert.equal((await nextSegment(iterator)).type, "media");
      assert.equal(sub.state, "live");

      // Go media-silent FAR past the 10s default (12s) while keeping the byte heartbeat alive with non-media frames (a suppressed same-codec re-init refreshes
      // `#lastSegmentAt` but not `#lastMediaAt`). If the opt-out aggregated to the 10s default instead of Infinity (the seed bug), the media watchdog would fire here; an
      // opted-out stream must stay live, proving the threshold is genuinely Infinity, not capped at the default.
      for(let step = 0; step < 12; step++) {

        clock.advance(1000);
        at(sockets, 0).emitMessage(buildInitSegment({ codec: "avc1.640028", data: Buffer.from("INIT") }));
        // eslint-disable-next-line no-await-in-loop
        await flush();
        // eslint-disable-next-line no-await-in-loop
        await pulse(clock);
      }

      assert.equal(sub.state, "live");
      assert.equal(sockets.length, 1);

      await sub[Symbol.asyncDispose]();
    });

    test("the MIN across subscribers governs: a live-view opt-out and a 2s HKSV share a session detected at 2s", async () => {

      const clock = fakeClock();
      const { pool, sockets } = makePool({ clock });

      // A live-view subscriber opts out (Infinity); an HKSV subscriber declares 2s on the same shared session. The MIN (2s) governs the shared media watchdog.
      const optOut = pool.subscribe(SPEC, { urgency: () => Infinity });
      const hksv = pool.subscribe(SPEC, { urgency: () => 2000 });

      await flush();
      await establish(at(sockets, 0), { codec: "avc1.640028" });

      assert.equal(optOut.state, "live");
      assert.equal(hksv.state, "live");

      // The shared stream goes silent for the HKSV deadline; the MIN pulls detection to 2s even though one subscriber opted out.
      clock.advance(2000);
      await pulse(clock);

      assert.equal(optOut.state, "recovering");
      assert.equal(hksv.state, "recovering");
      assert.equal(sockets.length, 2);

      await optOut[Symbol.asyncDispose]();
      await hksv[Symbol.asyncDispose]();
    });

    test("the threshold is re-read live each tick: a tighten mid-live is honored on the next tick", async () => {

      const clock = fakeClock();
      let toleranceMs = PROTECT_LIVESTREAM_STALL_DEFAULT_MS;
      const { pool, sockets } = makePool({ clock });

      // The urgency closure is pulled fresh each tick, so mutating it mid-live re-tightens detection with no explicit re-arm.
      const sub = pool.subscribe(SPEC, { urgency: () => toleranceMs });

      await flush();
      await establish(at(sockets, 0), { codec: "avc1.640028" });

      const iterator = sub[Symbol.asyncIterator]();

      assert.equal((await nextSegment(iterator)).type, "init");
      assert.equal((await nextSegment(iterator)).type, "media");

      // Under the original 10s, a 3s silence does not trip. Refresh media (so the clock is fresh) then tighten the policy to 2s.
      clock.advance(3000);
      pushMedia(at(sockets, 0));
      await flush();
      await pulse(clock);

      assert.equal(sub.state, "live");

      toleranceMs = 2000;

      // A 2s silence now trips because the tick re-reads the tightened threshold - no re-subscribe, no re-arm.
      clock.advance(2000);
      await pulse(clock);

      assert.equal(sub.state, "recovering");
      assert.equal(sockets.length, 2);

      await sub[Symbol.asyncDispose]();
    });

    test("a tighten that lands DURING a media-silent gap is still caught (the one-shot's blind spot)", async () => {

      const clock = fakeClock();
      let toleranceMs = PROTECT_LIVESTREAM_STALL_DEFAULT_MS;
      const { pool, sockets } = makePool({ clock });
      const sub = pool.subscribe(SPEC, { urgency: () => toleranceMs });

      await flush();
      await establish(at(sockets, 0), { codec: "avc1.640028" });

      const iterator = sub[Symbol.asyncIterator]();

      assert.equal((await nextSegment(iterator)).type, "init");
      assert.equal((await nextSegment(iterator)).type, "media");

      // The stream falls silent. Advance to 5s - under the 10s threshold, so no fire yet - WITHOUT any media arriving. A per-segment-rearmed one-shot would be blind here
      // because no segment arrives to re-arm it at the new threshold; the interval-poll is not.
      clock.advance(5000);
      await pulse(clock);

      assert.equal(sub.state, "live");

      // Tighten to 2s DURING the silence (no media flowing). The very next tick re-reads the threshold and sees 5000 >= 2000, so it fires - the interval-poll catches the
      // mid-stall tighten the one-shot would have missed.
      toleranceMs = 2000;
      await pulse(clock);

      assert.equal(sub.state, "recovering");
      assert.equal(sockets.length, 2);

      await sub[Symbol.asyncDispose]();
    });

    test("the watchdog is keyed on media, not any segment: non-media frames do not refresh its clock", async () => {

      const clock = fakeClock();
      const { pool, sockets } = makePool({ clock });
      const sub = pool.subscribe(SPEC, { urgency: () => 2000 });

      await flush();
      await establish(at(sockets, 0), { codec: "avc1.640028" });

      const iterator = sub[Symbol.asyncIterator]();

      assert.equal((await nextSegment(iterator)).type, "init");
      assert.equal((await nextSegment(iterator)).type, "media");

      // Drive a non-media frame mid-silence. A same-codec re-init reaches `#onSegment` and refreshes `#lastSegmentAt` (the any-byte clock) but is suppressed and never
      // fanned as media, so it must NOT refresh `#lastMediaAt`. The media watchdog therefore still sees the original media as the last picture.
      clock.advance(1500);
      at(sockets, 0).emitMessage(buildInitSegment({ codec: "avc1.640028", data: Buffer.from("INIT") }));
      await flush();

      // Cross the 2s media threshold relative to the LAST MEDIA (not the re-init). The watchdog fires because the non-media frame did not reset its media clock.
      clock.advance(500);
      await pulse(clock);

      assert.equal(sub.state, "recovering");
      assert.equal(sockets.length, 2);

      await sub[Symbol.asyncDispose]();
    });

    test("the watchdog is armed only at first media, never during establishing or recovering", async () => {

      const clock = fakeClock();

      // A long reconnect window keeps the recovery loop's own timer from elapsing while we test that NO media watchdog is armed during establishing - so any reconnect
      // here could only come from a (non-existent) media watchdog, not the establishing window's natural elapse.
      const policy: RecoveryPolicy = () => ({ awaitMs: 100000, kind: "reconnect" });
      const { pool, sockets } = makePool({ clock, recoveryPolicy: policy });
      const sub = pool.subscribe(SPEC, { urgency: () => 2000 });

      await flush();

      // Drive the init ONLY (no media). The episode is still establishing, no media has flowed, so the watchdog is NOT armed. Advancing well past the 2s media threshold
      // (but under the 100000 establishing window) and pulsing must not fire a media watchdog - there is none to arm during establishing.
      await establishInit(at(sockets, 0), { codec: "avc1.640028" });

      assert.equal(sub.state, "connecting");

      clock.advance(5000);
      await pulse(clock, 4);

      // Still connecting on the same single socket: no media watchdog fired (it never armed), and the heartbeat is keyed on the init we just sent so it did not trip.
      assert.equal(sub.state, "connecting");
      assert.equal(sockets.length, 1);

      // The first media now arms the watchdog and goes live.
      pushMedia(at(sockets, 0));
      await flush();

      assert.equal(sub.state, "live");

      // From here the armed watchdog detects a stall at 2s.
      clock.advance(2000);
      await pulse(clock);

      assert.equal(sub.state, "recovering");

      await sub[Symbol.asyncDispose]();
    });

    test("the watchdog disarms on reconnect and re-arms on the reconnect's first media", async () => {

      const clock = fakeClock();
      const { pool, sockets } = makePool({ clock });
      const sub = pool.subscribe(SPEC, { urgency: () => 2000 });

      await flush();
      await establish(at(sockets, 0), { codec: "avc1.640028" });

      const iterator = sub[Symbol.asyncIterator]();

      assert.equal((await nextSegment(iterator)).type, "init");
      assert.equal((await nextSegment(iterator)).type, "media");

      // The controller drops the stream: `#installSession` disarms the watchdog before the recovering episode's fresh session. While recovering the watchdog is unarmed.
      at(sockets, 0).emitClose(1000, "dropped");
      await flush();

      assert.equal(sub.state, "recovering");

      // The reconnect's first media re-arms the watchdog. A subsequent stall on the new session detects again at 2s, proving the re-arm.
      await establish(at(sockets, 1), { codec: "avc1.640028" });

      assert.equal(sub.state, "live");

      clock.advance(2000);
      await pulse(clock);

      assert.equal(sub.state, "recovering");
      assert.equal(sockets.length, 3);

      await sub[Symbol.asyncDispose]();
    });

    test("a multi-attempt establishment disarms before any arm as a safe no-op", async () => {

      const clock = fakeClock();

      // A policy that always reconnects lets a failed first establishment attempt reinstall - exercising `#installSession`'s disarm before any media ever armed it.
      const { pool, sockets } = makePool({ clock, recoveryPolicy: () => ({ awaitMs: 1000, kind: "reconnect" }) });
      const sub = pool.subscribe(SPEC, { urgency: () => 2000 });

      await flush();

      // Attempt 0's window elapses with no segment; the still-establishing episode reinstalls. The disarm in that reinstall is a safe no-op (no watchdog was ever armed).
      clock.advance(1000);
      await flush();

      assert.equal(sockets.length, 2);

      // Attempt 1 delivers media and arms the watchdog cleanly; a later stall detects at 2s.
      await establish(at(sockets, 1), { codec: "avc1.640028" });

      assert.equal(sub.state, "live");

      clock.advance(2000);
      await pulse(clock);

      assert.equal(sub.state, "recovering");

      await sub[Symbol.asyncDispose]();
    });

    test("an interval tick already scheduled after teardown does not fire on the dead session", async () => {

      const clock = fakeClock();
      const { pool, sockets } = makePool({ clock });
      const sub = pool.subscribe(SPEC, { urgency: () => 2000 });

      await flush();
      await establish(at(sockets, 0), { codec: "avc1.640028" });

      assert.equal(sub.state, "live");

      // Advance past the threshold so a tick WOULD fire, then dispose the subscription (the last one), which tears the stream down and aborts the watchdog controller.
      clock.advance(5000);
      await sub[Symbol.asyncDispose]();

      assert.equal(sub.state, "closed");

      // The torn-down session must not recover: pulsing now (the abort already ended the loop, and the `#torndown` guard would no-op a straggler) opens no new socket.
      await pulse(clock, 4);

      assert.equal(sockets.length, 1);
    });

    test("recovery-await is unchanged: an undeclared-urgency stream still reports Infinity tolerance, the 10s detection default does not leak", async () => {

      const clock = fakeClock();
      const contexts: RecoveryContext[] = [];
      const policy: RecoveryPolicy = (context) => {

        contexts.push({ ...context });

        // Establish patiently, then give up on the first recovery so the episode ends deterministically and we can inspect the recovering context's toleranceMs.
        return (context.phase === "establishing") ? { awaitMs: 100000, kind: "reconnect" } : { kind: "giveUp" };
      };

      const { pool, sockets } = makePool({ clock, recoveryPolicy: policy });

      // No urgency declared. The DETECTION default is 10s, but the recovery-await aggregate must still be Infinity - the two defaults are separate and must not leak.
      const sub = pool.subscribe(SPEC);

      await flush();
      await establish(at(sockets, 0), { codec: "avc1.640028" });

      at(sockets, 0).emitClose(1000, "dropped");
      await flush();

      const recovering = contexts.find((context) => context.phase === "recovering");

      assert.ok(recovering !== undefined);
      assert.equal(recovering.toleranceMs, Infinity, "the recovery-await tolerance must stay Infinity for an undeclared subscriber");

      await sub[Symbol.asyncDispose]();
    });

    test("a tighter joiner re-decides a parked recovery window; a joiner while live needs no poke", async () => {

      const clock = fakeClock();
      let recoveringCalls = 0;
      const policy: RecoveryPolicy = (context) => {

        if(context.phase === "establishing") {

          return { awaitMs: 100000, kind: "reconnect" };
        }

        recoveringCalls++;

        // The first recovery decision parks on a long wait; the attach-retighten must force a re-decision that this time reconnects.
        return (recoveringCalls === 1) ? { forMs: 1000000000, kind: "wait" } : { awaitMs: 100000, kind: "reconnect" };
      };

      const { pool, sockets } = makePool({ clock, recoveryPolicy: policy });
      const sub1 = pool.subscribe(SPEC);

      await flush();
      await establish(at(sockets, 0), { codec: "avc1.640028" });

      at(sockets, 0).emitClose(1000, "dropped");
      await flush();

      // The recovery episode is parked on a long `wait` - no new socket yet.
      assert.equal(sockets.length, 1);

      // A second, more-urgent subscriber joins the parked (recovering) window: the recovering-gated attach hook re-decides it, which now reconnects.
      const sub2 = pool.subscribe(SPEC, { urgency: () => 200 });

      await flush();

      assert.equal(sockets.length, 2);
      assert.equal(recoveringCalls, 2);

      await sub1[Symbol.asyncDispose]();
      await sub2[Symbol.asyncDispose]();
    });

    test("a join or reassess during the establishing init-to-media gap does not tear down the connecting session", async () => {

      const clock = fakeClock();
      let consults = 0;
      const policy: RecoveryPolicy = (context) => {

        consults++;

        return (context.phase === "establishing") ? { awaitMs: 100000, kind: "reconnect" } : { kind: "giveUp" };
      };

      const { pool, sockets } = makePool({ clock, recoveryPolicy: policy });
      const sub1 = pool.subscribe(SPEC);

      await flush();

      // The stream inits but has not produced media: the establishing episode is in flight in the init->media gap.
      await establishInit(at(sockets, 0), { codec: "avc1.640028" });

      assert.equal(sub1.state, "connecting");
      assert.equal(consults, 1);

      // A tighter joiner in the gap must NOT settle the urgency-independent establishing window (the attach hook's recovering gate spares it); neither does a reassess.
      const sub2 = pool.subscribe(SPEC, { urgency: () => 200 });

      sub2.reassess();
      await flush();

      assert.equal(sockets.length, 1);
      assert.equal(consults, 1);
      assert.equal(sub1.state, "connecting");

      // The in-flight session's first media still settles establishment normally - the join and reassess left it untouched.
      pushMedia(at(sockets, 0));
      await flush();

      assert.equal(sub1.state, "live");

      await sub1[Symbol.asyncDispose]();
      await sub2[Symbol.asyncDispose]();
    });
  });

  describe("defaultLivestreamRecoveryPolicy", () => {

    // Read the reconnect window out of a decision, asserting it was a reconnect.
    const awaitOf = (context: RecoveryContext): number => {

      const decision = defaultLivestreamRecoveryPolicy(context);

      assert.equal(decision.kind, "reconnect");

      return (decision as { awaitMs: number }).awaitMs;
    };

    test("establishment is urgency-independent, follows the patient curve, and gives up past the deadline", () => {

      // The establishment window is the fixed patient curve (5s, 8s, 10s, holding at 10s) regardless of how urgent any subscriber is - the camera mints at its own pace.
      assert.equal(awaitOf({ attempts: 0, cameraId: "cam1", elapsedMs: 0, phase: "establishing", toleranceMs: Infinity }), 5000);
      assert.equal(awaitOf({ attempts: 0, cameraId: "cam1", elapsedMs: 0, phase: "establishing", toleranceMs: 0 }), 5000);
      assert.equal(awaitOf({ attempts: 1, cameraId: "cam1", elapsedMs: 0, phase: "establishing", toleranceMs: 0 }), 8000);
      assert.equal(awaitOf({ attempts: 2, cameraId: "cam1", elapsedMs: 0, phase: "establishing", toleranceMs: 0 }), 10000);
      assert.equal(awaitOf({ attempts: 9, cameraId: "cam1", elapsedMs: 0, phase: "establishing", toleranceMs: Infinity }), 10000);

      // Once the establishment deadline has elapsed it gives up (the 5+8+10+10 cadence reaches it at ~33s).
      const pastDeadline = defaultLivestreamRecoveryPolicy({ attempts: 4, cameraId: "cam1", elapsedMs: PROTECT_LIVESTREAM_ESTABLISH_DEADLINE_MS, phase: "establishing",
        toleranceMs: Infinity });

      assert.deepEqual(pastDeadline, { kind: "giveUp" });
    });

    test("live recovery is unbounded and headroom-clamped", () => {

      // Unbounded: even at an enormous elapsed time and attempt count it keeps reconnecting, never giving up.
      assert.equal(defaultLivestreamRecoveryPolicy({ attempts: 50, cameraId: "cam1", elapsedMs: 1000000000, phase: "recovering", toleranceMs: Infinity }).kind,
        "reconnect");

      // A maximally-urgent subscriber (tolerance 0) recovers at the flat floor regardless of attempt - the floor protects a fresh stream's first-segment mint.
      assert.equal(awaitOf({ attempts: 0, cameraId: "cam1", elapsedMs: 0, phase: "recovering", toleranceMs: 0 }), PROTECT_LIVESTREAM_AWAIT_MIN_MS);
      assert.equal(awaitOf({ attempts: 3, cameraId: "cam1", elapsedMs: 0, phase: "recovering", toleranceMs: 0 }), PROTECT_LIVESTREAM_AWAIT_MIN_MS);
      assert.equal(PROTECT_LIVESTREAM_AWAIT_MIN_MS, 3000);

      // A patient stream (no reported urgency) walks the recovery curve 3s -> 5s -> 10s and holds at the ceiling.
      assert.equal(awaitOf({ attempts: 0, cameraId: "cam1", elapsedMs: 0, phase: "recovering", toleranceMs: Infinity }), 3000);
      assert.equal(awaitOf({ attempts: 1, cameraId: "cam1", elapsedMs: 0, phase: "recovering", toleranceMs: Infinity }), 5000);
      assert.equal(awaitOf({ attempts: 2, cameraId: "cam1", elapsedMs: 0, phase: "recovering", toleranceMs: Infinity }), 10000);
      assert.equal(awaitOf({ attempts: 50, cameraId: "cam1", elapsedMs: 0, phase: "recovering", toleranceMs: Infinity }), PROTECT_LIVESTREAM_AWAIT_MAX_MS);
    });
  });

  describe("Camera.livestream", () => {

    test("delegates to the pool with the camera's id, the supplied options, and the urgency closure", () => {

      let captured: { opts: { signal?: AbortSignal; urgency?: () => number }; spec: LivestreamSpec } | null = null;
      const controller = new AbortController();
      const urgency = (): number => 0;
      const context = {

        host: "10.0.0.1",
        livestreamPool: { subscribe: (spec: LivestreamSpec, opts: { signal?: AbortSignal; urgency?: () => number }) => {

          captured = { opts, spec };

          return {} as unknown;
        } },
        log: silentLog(),
        store: {},
        transport: {}
      } as unknown as DeviceContext;

      const camera = new Camera(context, "cam-xyz");

      camera.livestream({ signal: controller.signal, source: { channel: 2, type: "channel" }, timestamps: true, urgency });

      assert.ok(captured !== null);
      assert.deepEqual((captured as { spec: LivestreamSpec }).spec, { cameraId: "cam-xyz", source: { channel: 2, type: "channel" }, timestamps: true });
      assert.equal((captured as { opts: { signal?: AbortSignal } }).opts.signal, controller.signal);
      assert.equal((captured as { opts: { urgency?: () => number } }).opts.urgency, urgency);
    });
  });
});
