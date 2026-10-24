/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * talkback-session.test.ts: Tests for TalkbackSession - atomic connect, the AsyncIterable send drain (in-order, exhaustion, mid-drain socket failure, a source's own
 * failure, backpressure ceiling, ffmpeg-style Readable, and which exits wait on the source's cleanup), the FSM, teardown, and the diagnostics channels. Driven
 * through an injected fake WebSocket and a fake resolver, so the write-only channel is exercised deterministically without a live controller.
 */
import { ProtectAbortedError, ProtectNetworkError, ProtectRequestError } from "../errors.ts";
import type { TalkbackSessionClosedPayload, TalkbackSessionOpenedPayload } from "../diagnostics.ts";
import { assertNoUnhandledRejections, silentLog } from "../testing.helpers.ts";
import { channels, subscribeToChannel } from "../diagnostics.ts";
import { describe, test } from "node:test";
import { FakeWritableWebSocket } from "./talkback-session.helpers.ts";
import { PROTECT_TALKBACK_MAX_BUFFERED_BYTES } from "../settings.ts";
import { Readable } from "node:stream";
import { TalkbackSession } from "./talkback-session.ts";
import assert from "node:assert/strict";
import { createLoopbackWebSocketPeer } from "./tls-peer.helpers.ts";
import { settle } from "homebridge-plugin-utils/testing";

// A resolver that resolves immediately to a fixed URL; the default for tests that do not scrutinize negotiation.
const fixedUrl = async (): Promise<string> => "wss://controller/talkback";

// Connect a session over a fake socket that auto-opens, returning the live session, the fake socket the test drives, and the URL the session handed its socket
// factory. The factory assigns `url` and `ws` synchronously before returning, so each is set by the time the auto-open microtask fires and `connect()` resolves.
async function openSession(options: { cameraId?: string; resolveUrl?: (params: URLSearchParams, opts: { signal?: AbortSignal }) => Promise<string>;
  signal?: AbortSignal; } = {}): Promise<{ session: TalkbackSession; url: string; ws: FakeWritableWebSocket }> {

  let url!: string;
  let ws!: FakeWritableWebSocket;
  const session = await TalkbackSession.connect({

    cameraId: options.cameraId ?? "cam1",
    log: silentLog(),
    resolveUrl: options.resolveUrl ?? fixedUrl,
    webSocket: (socketUrl: string): FakeWritableWebSocket => {

      url = socketUrl;
      ws = new FakeWritableWebSocket({ autoOpen: true });

      return ws;
    },
    ...((options.signal !== undefined) && { signal: options.signal })
  });

  return { session, url, ws };
}

// An async generator that yields `first`, then parks forever on its second pull - so a drain in progress is left waiting on the source while a test fires a socket
// fault or abort. Its `return()` queues behind the parked pull exactly as a Readable's does and so never settles, which is the behavior the drain must tolerate: a
// drain that waited on it would never reject.
async function *parkedGenerator(first: Uint8Array): AsyncGenerator<Uint8Array> {

  yield first;

  await new Promise<never>(() => undefined);
}

/* A hand-written source that yields `chunks` and then answers done, and whose `return()` finishes its cleanup one turn of the event loop after it is called, which
 * `cleaned()` reports. A generator cannot show whether a drain waited on its cleanup, because its `finally` runs before its final `next()` resolves, so the cleanup a
 * drain must await has to be one that settles after the call that requested it.
 */
function lateCleanupSource(chunks: readonly Uint8Array[]): { cleaned: () => boolean; source: AsyncIterable<Uint8Array> } {

  let cleaned = false;
  let index = 0;

  const iterator: AsyncIterator<Uint8Array> = {

    next: async (): Promise<IteratorResult<Uint8Array>> => {

      const value = chunks[index];

      index++;

      return (value === undefined) ? { done: true, value: undefined } : { done: false, value };
    },
    return: async (): Promise<IteratorResult<Uint8Array>> => {

      await settle();

      cleaned = true;

      return { done: true, value: undefined };
    }
  };

  return { cleaned: (): boolean => cleaned, source: { [Symbol.asyncIterator]: (): AsyncIterator<Uint8Array> => iterator } };
}

// Render the bytes a fake socket received as strings, for order-preserving assertions.
function sentText(ws: FakeWritableWebSocket): string[] {

  return ws.sent.map((chunk) => Buffer.from(chunk).toString());
}

describe("TalkbackSession", () => {

  describe("connect", () => {

    test("resolves a live session once the socket opens", async () => {

      const { session } = await openSession();

      assert.equal(session.state, "live");
    });

    test("negotiates over the camera param and the resolver-provided URL", async () => {

      const captured: URLSearchParams[] = [];
      const resolveUrl = async (params: URLSearchParams): Promise<string> => {

        captured.push(params);

        return "wss://controller/talkback";
      };

      const { url } = await openSession({ cameraId: "front-door", resolveUrl });

      assert.equal(captured[0]?.get("camera"), "front-door");
      assert.equal(url, "wss://controller/talkback", "the socket must be built on the URL the resolver returned");
    });

    test("throws a typed FatalError when negotiation returns a non-2xx (ProtectRequestError)", async () => {

      let built = false;

      await assert.rejects(TalkbackSession.connect({

        cameraId: "cam1",
        log: silentLog(),
        resolveUrl: async () => { throw new ProtectRequestError("forbidden", { statusCode: 403 }); },
        webSocket: () => {

          built = true;

          return new FakeWritableWebSocket({ autoOpen: false });
        }
      }), ProtectRequestError);

      // The negotiation failed before a socket could be built - the connect is atomic, with no half-open session left behind.
      assert.equal(built, false);
    });

    test("a plain negotiation error is wrapped as a ProtectNetworkError and never opens a socket", async () => {

      let built = false;

      await assert.rejects(TalkbackSession.connect({

        cameraId: "cam1",
        log: silentLog(),
        resolveUrl: async () => { throw new Error("connect refused"); },
        webSocket: () => {

          built = true;

          return new FakeWritableWebSocket({ autoOpen: false });
        }
      }), ProtectNetworkError);

      assert.equal(built, false);
    });

    test("a socket failure before open rejects connect with a ProtectNetworkError (atomic, no half-open)", async () => {

      const { promise, resolve } = Promise.withResolvers<FakeWritableWebSocket>();
      const connecting = TalkbackSession.connect({

        cameraId: "cam1",
        log: silentLog(),
        resolveUrl: fixedUrl,
        webSocket: () => {

          const ws = new FakeWritableWebSocket({ autoOpen: false });

          resolve(ws);

          return ws;
        }
      });

      const ws = await promise;

      ws.emitError(new Error("socket boom"));

      await assert.rejects(connecting, ProtectNetworkError);
    });

    test("a socket close before open rejects connect with a ProtectNetworkError saying it closed before connecting", async () => {

      const { promise, resolve } = Promise.withResolvers<FakeWritableWebSocket>();
      const connecting = TalkbackSession.connect({

        cameraId: "cam1",
        log: silentLog(),
        resolveUrl: fixedUrl,
        webSocket: () => {

          const ws = new FakeWritableWebSocket({ autoOpen: false });

          resolve(ws);

          return ws;
        }
      });

      const ws = await promise;

      // The peer drops the socket before it ever opens. A session that was never live did not close unexpectedly; it never finished connecting, and the rejection
      // says so.
      ws.emitClose(1006, "dropped");

      await assert.rejects(connecting, { constructor: ProtectNetworkError, message: /closed before it finished connecting/ });
    });
  });

  describe("send", () => {

    test("drains an async iterable to the socket in order and resolves on exhaustion", async () => {

      const { session, ws } = await openSession();
      const source = async function *(): AsyncGenerator<Uint8Array> {

        yield Buffer.from("a");
        yield Buffer.from("b");
        yield Buffer.from("c");
      };

      await session.send(source());

      assert.deepEqual(sentText(ws), [ "a", "b", "c" ]);
      assert.equal(session.state, "live");
    });

    test("a Node Readable (an AsyncIterable<Buffer>, like ffmpeg.stdout) feeds in directly", async () => {

      const { session, ws } = await openSession();

      await session.send(Readable.from([ Buffer.from("x"), Buffer.from("y") ]));

      assert.deepEqual(sentText(ws), [ "x", "y" ]);
    });

    test("a drain that ends cleanly has finished the source's cleanup by the time it resolves", async () => {

      const { session } = await openSession();
      const { cleaned, source } = lateCleanupSource([]);

      await session.send(source);

      assert.equal(cleaned(), true, "the clean end waits on the source's return()");
    });

    test("a source that rejects mid-drain rejects the send with its own error, unwrapped", async () => {

      const { session, ws } = await openSession();
      const failure = new Error("the audio source failed");
      const source = async function *(): AsyncGenerator<Uint8Array> {

        yield Buffer.from("a");

        throw failure;
      };

      await assert.rejects(session.send(source()), (error: unknown) => error === failure);
      assert.deepEqual(sentText(ws), ["a"]);
    });

    test("rejects with a typed ProtectError when the socket errors mid-drain", { timeout: 2000 }, async () => {

      const { session, ws } = await openSession();
      const sending = session.send(parkedGenerator(Buffer.from("a")));

      // Let the drain send the first chunk and park on the source's second pull, then fault the socket: the send must unpark and reject.
      await settle();
      assert.deepEqual(sentText(ws), ["a"]);

      ws.emitError(new Error("socket boom"));

      await assert.rejects(sending, ProtectNetworkError);
      assert.equal(session.state, "closed");
    });

    test("rejects when the socket closes unexpectedly mid-drain", { timeout: 2000 }, async () => {

      const { session, ws } = await openSession();
      const sending = session.send(parkedGenerator(Buffer.from("a")));

      await settle();
      ws.emitClose(1006, "dropped");

      await assert.rejects(sending, ProtectNetworkError);
      assert.equal(session.state, "closed");
    });

    test("a send after the peer closes a live socket rejects with the unexpected-close failure", async () => {

      const { session, ws } = await openSession();

      ws.emitClose(1006, "dropped");

      const source = async function *(): AsyncGenerator<Uint8Array> {

        yield Buffer.from("a");
      };

      // The peer's close of a live socket stores its failure, so a later send reports why the session ended rather than a bare not-connected error.
      await assert.rejects(session.send(source()), { constructor: ProtectNetworkError, message: /closed unexpectedly/ });
    });

    test("a source whose return() rejects never replaces the typed fault", { timeout: 2000 }, async () => {

      const { session, ws } = await openSession();
      const source: AsyncIterable<Uint8Array> = { [Symbol.asyncIterator]: (): AsyncIterator<Uint8Array> => ({

        next: async (): Promise<IteratorResult<Uint8Array>> => new Promise<never>(() => undefined),
        return: async (): Promise<IteratorResult<Uint8Array>> => {

          throw new Error("the audio source's cleanup failed");
        }
      }) };
      const sending = session.send(source);

      // The drain parks on the first pull, the socket faults, and the cleanup the drain then requests rejects: the typed fault is still what the send rejects with,
      // and the cleanup's own rejection is handled rather than left to surface as an unhandled one.
      await settle();

      await assertNoUnhandledRejections(async () => {

        ws.emitError(new Error("socket boom"));

        await assert.rejects(sending, ProtectNetworkError);
      });
    });

    test("rejects when the socket's send buffer exceeds the safety ceiling, with the source's cleanup finished", async () => {

      const { session, ws } = await openSession();
      const { cleaned, source } = lateCleanupSource([Buffer.from("a")]);

      // A socket that cannot drain reports a buffered amount past the ceiling; the very next send must refuse rather than buffer unboundedly.
      ws.bufferedAmount = PROTECT_TALKBACK_MAX_BUFFERED_BYTES + 1;

      await assert.rejects(session.send(source), ProtectNetworkError);
      assert.equal(cleaned(), true, "the ceiling's rejection waits on the source's return()");
    });

    test("rejects when the caller's signal aborts the drain", { timeout: 2000 }, async () => {

      const { session } = await openSession();
      const controller = new AbortController();
      const sending = session.send(parkedGenerator(Buffer.from("a")), { signal: controller.signal });

      await settle();
      controller.abort();

      await assert.rejects(sending, ProtectAbortedError);

      // Aborting a single send does not tear the session down - it stays live for a subsequent send.
      assert.equal(session.state, "live");
    });

    test("a send whose signal is already aborted rejects immediately with ProtectAbortedError, before any byte is written", async () => {

      const { session, ws } = await openSession();
      const controller = new AbortController();

      // Abort before calling send: the live-state check still passes, then the synchronous pre-drain guard short-circuits. A consumer's already-cancelled request must
      // not push a single frame onto the wire - this is the distinct, no-bytes-sent path, as opposed to the mid-drain abort race covered above.
      controller.abort();

      const source = async function *(): AsyncGenerator<Uint8Array> {

        yield Buffer.from("a");
      };

      await assert.rejects(session.send(source(), { signal: controller.signal }), ProtectAbortedError);

      // Nothing reached the socket, and the session stays live for a later un-aborted send.
      assert.deepEqual(ws.sent, []);
      assert.equal(session.state, "live");
    });

    test("rejects when called on a closed session", async () => {

      const { session } = await openSession();

      await session.close();

      const source = async function *(): AsyncGenerator<Uint8Array> {

        yield Buffer.from("a");
      };

      // A close the session asked for stores no failure, so the send reports the plain not-connected error rather than an unexpected close.
      await assert.rejects(session.send(source()), { constructor: ProtectNetworkError, message: /not connected/ });
    });
  });

  describe("certificate verification", () => {

    test("the upgrade reaches a controller's own certificate when strict verification is not asked for", async () => {

      // A real TLS peer rather than the injected fake: the certificate posture lives on the agent the default factory builds, which an injected socket never reaches.
      await using peer = await createLoopbackWebSocketPeer();

      /* connect() is the whole assertion here, and it is a complete one: the session settles its open handshake on the WebSocket `open` event alone, which the peer
       * grants only once the TLS handshake completes and the upgrade is answered. The channel is write-only, so there is no inbound traffic to wait for beyond it.
       */
      await using session = await TalkbackSession.connect({ cameraId: "cam1", log: silentLog(),
        resolveUrl: async (): Promise<string> => "wss://" + peer.host + "/talkback" });

      assert.equal(session.state, "live");
    });

    test("the upgrade refuses a certificate that does not verify when strict verification is asked for", async () => {

      await using peer = await createLoopbackWebSocketPeer();

      // The same peer and the same upgrade, one option apart. connect() is atomic, so a handshake the client will not complete surfaces as its rejection - there is
      // no half-open session to inspect.
      await assert.rejects(TalkbackSession.connect({ cameraId: "cam1", log: silentLog(),
        resolveUrl: async (): Promise<string> => "wss://" + peer.host + "/talkback", verifyTls: true }), ProtectNetworkError);
    });
  });

  describe("teardown", () => {

    test("close() requests the socket close, sets state closed, and is safe to call more than once", async () => {

      const payloads: TalkbackSessionClosedPayload[] = [];

      using closedSubscription = subscribeToChannel(channels.talkbackSessionClosed, (payload) => void payloads.push(payload));

      const { session, ws } = await openSession({ cameraId: "cam-closed-twice" });

      await session.close();
      await session.close();

      assert.equal(ws.closeRequested, true);
      assert.equal(session.state, "closed");

      // A second close() is a no-op, so the session publishes its closure once. The camera is this row's own, so a closure from any other session reads as a mismatch.
      assert.deepEqual(payloads.map((payload) => payload.cameraId), ["cam-closed-twice"]);
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

      await assert.rejects(TalkbackSession.connect({

        cameraId: "cam1",
        log: silentLog(),
        resolveUrl: fixedUrl,
        signal: controller.signal,
        webSocket: () => {

          built = true;

          return new FakeWritableWebSocket({ autoOpen: false });
        }
      }), ProtectAbortedError);

      assert.equal(built, false);
    });

    test("a caller-signal abort while URL negotiation is in flight rejects connect with ProtectAbortedError", async () => {

      const controller = new AbortController();

      // A resolver that never settles, so the abort lands squarely inside the connecting phase - the negotiation await - rather than before construction. The caller's
      // abort is then the only thing that can end the connect, and this abort-mid-negotiation path must reject with the typed ProtectAbortedError rather than a
      // generic negotiation error.
      const connecting = TalkbackSession.connect({

        cameraId: "cam1",
        log: silentLog(),
        resolveUrl: () => new Promise<string>(() => undefined),
        signal: controller.signal,
        webSocket: () => new FakeWritableWebSocket({ autoOpen: false })
      });

      await settle();
      controller.abort();

      await assert.rejects(connecting, ProtectAbortedError);
    });

    test("an abort while URL negotiation is in flight builds no socket once the negotiation resolves", async () => {

      const controller = new AbortController();
      const negotiation = Promise.withResolvers<string>();
      let built = false;

      // The resolver ignores the signal it is handed and resolves only after the abort has torn the session down, so the connect must see that teardown and bail
      // rather than open a socket nothing would ever close.
      const connecting = TalkbackSession.connect({

        cameraId: "cam1",
        log: silentLog(),
        resolveUrl: async (): Promise<string> => negotiation.promise,
        signal: controller.signal,
        webSocket: () => {

          built = true;

          return new FakeWritableWebSocket({ autoOpen: false });
        }
      });

      await settle();
      controller.abort();

      await assert.rejects(connecting, ProtectAbortedError);

      negotiation.resolve("wss://controller/talkback");
      await settle();

      assert.equal(built, false, "a negotiation that resolves after an abort must not build a socket");
    });

    test("aborting the session signal after it is live tears the session down and rejects an in-flight send", { timeout: 2000 }, async () => {

      const controller = new AbortController();
      const { session, ws } = await openSession({ signal: controller.signal });

      assert.equal(session.state, "live");

      // Start a drain that parks on its second pull, then abort the session-level signal (the one passed to connect, distinct from a per-send signal). The constructor's
      // abort listener records the typed caller abort and runs #shutdown, which closes the socket and rejects the in-flight send with ProtectAbortedError - the
      // documented "once live, if it aborts, the session tears down and an in-flight send rejects" contract, the live-session counterpart to the
      // already-aborted-before-connect teardown above.
      const sending = session.send(parkedGenerator(Buffer.from("a")));

      await settle();
      controller.abort();

      await assert.rejects(sending, ProtectAbortedError);
      assert.equal(session.state, "closed");
      assert.equal(ws.closeRequested, true);
    });

    test("close() swallows a socket close() fault and still tears down cleanly", async () => {

      let ws!: FakeWritableWebSocket;
      const session = await TalkbackSession.connect({

        cameraId: "cam1",
        log: silentLog(),
        resolveUrl: fixedUrl,
        webSocket: () => (ws = new FakeWritableWebSocket({ autoOpen: true, closeFault: true }))
      });

      // The disposal contract is that close() (and [Symbol.asyncDispose]) never throw, even when the underlying socket's own close() faults: #shutdown swallows the fault
      // and #onClose releases everything regardless, so the session still reaches the closed state and the close was attempted.
      await assert.doesNotReject(session.close());
      assert.equal(ws.closeRequested, true);
      assert.equal(session.state, "closed");
    });
  });

  describe("diagnostics", () => {

    test("session:opened fires with the cameraId on connect", async () => {

      const payloads: TalkbackSessionOpenedPayload[] = [];

      using openedSubscription = subscribeToChannel(channels.talkbackSessionOpened, (payload) => void payloads.push(payload));

      const { session } = await openSession({ cameraId: "cam-9" });

      await session.close();

      assert.deepEqual(payloads, [{ cameraId: "cam-9" }]);
    });

    test("session:closed fires with the cameraId and a reason on close", async () => {

      const payloads: TalkbackSessionClosedPayload[] = [];

      using closedSubscription = subscribeToChannel(channels.talkbackSessionClosed, (payload) => void payloads.push(payload));

      const { session } = await openSession({ cameraId: "cam-9" });

      await session.close();

      // The reason is the teardown cause the session's own close records.
      assert.deepEqual(payloads, [{ cameraId: "cam-9", reason: "the talkback session was closed by the client" }]);
    });
  });
});
