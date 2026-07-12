/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * talkback-session.test.ts: Tests for TalkbackSession - atomic connect, the AsyncIterable send drain (in-order, exhaustion, mid-drain socket failure, backpressure
 * ceiling, ffmpeg-style Readable), the FSM, teardown, and the diagnostics channels. Driven through an injected fake WebSocket and a fake resolver, so the write-only
 * channel is exercised deterministically without a live controller.
 */
import { ProtectAbortedError, ProtectError, ProtectNetworkError, ProtectRequestError } from "../errors.ts";
import { describe, test } from "node:test";
import { FakeWritableWebSocket } from "./talkback-session.helpers.ts";
import { PROTECT_TALKBACK_MAX_BUFFERED_BYTES } from "../settings.ts";
import { Readable } from "node:stream";
import { TalkbackSession } from "./talkback-session.ts";
import assert from "node:assert/strict";
import { channels } from "../diagnostics.ts";
import { silentLog } from "../testing.helpers.ts";

// A resolver that resolves immediately to a fixed URL; the default for tests that do not scrutinize negotiation.
const fixedUrl = async (): Promise<string> => "wss://controller/talkback";

// Yield the event loop so the session's async connect (negotiate then build the socket, attach listeners, then the fake's queued open) settles and the session reaches
// live.
function tick(): Promise<void> {

  return new Promise<void>((resolve) => setImmediate(resolve));
}

// Connect a session over a fake socket that auto-opens, returning the live session and the fake socket the test drives. The factory assigns `ws` synchronously before
// returning, so it is set by the time the auto-open microtask fires and `connect()` resolves.
async function openSession(options: { cameraId?: string; resolveUrl?: (params: URLSearchParams, opts: { signal?: AbortSignal }) => Promise<string>;
  signal?: AbortSignal; } = {}): Promise<{ session: TalkbackSession; ws: FakeWritableWebSocket }> {

  let ws!: FakeWritableWebSocket;
  const session = await TalkbackSession.connect({

    cameraId: options.cameraId ?? "cam1",
    log: silentLog(),
    resolveUrl: options.resolveUrl ?? fixedUrl,
    webSocket: () => (ws = new FakeWritableWebSocket({ autoOpen: true })),
    ...((options.signal !== undefined) && { signal: options.signal })
  });

  return { session, ws };
}

// An async iterable that yields `first`, then parks forever on its second pull - so a drain in progress is left waiting on the source while a test fires a socket fault
// or abort. Its `return()` resolves immediately, so the drain's cleanup does not hang once the fault/abort race ends it.
function parkingSource(first: Uint8Array): AsyncIterable<Uint8Array> {

  return {

    [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {

      let delivered = false;

      return {

        next(): Promise<IteratorResult<Uint8Array>> {

          if(!delivered) {

            delivered = true;

            return Promise.resolve({ done: false, value: first });
          }

          return new Promise<IteratorResult<Uint8Array>>(() => undefined);
        },
        return(): Promise<IteratorResult<Uint8Array>> {

          return Promise.resolve({ done: true, value: undefined });
        }
      };
    }
  };
}

// Render the bytes a fake socket received as strings, for order-preserving assertions.
function sentText(ws: FakeWritableWebSocket): string[] {

  return ws.sent.map((chunk) => Buffer.from(chunk).toString());
}

// A fake whose close() faults, to prove the session's teardown swallows a socket close() error: the disposal contract is that close() / [Symbol.asyncDispose] never
// throw, even when the underlying socket's own close() does. It still records the close request before faulting, so the test can assert the close was attempted.
class ThrowingCloseWebSocket extends FakeWritableWebSocket {

  override close(): void {

    this.closeRequested = true;

    throw new Error("the underlying socket close() faulted");
  }
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

      await openSession({ cameraId: "front-door", resolveUrl });

      assert.equal(captured[0]?.get("camera"), "front-door");
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

    test("rejects with a typed ProtectError when the socket errors mid-drain", async () => {

      const { session, ws } = await openSession();
      const sending = session.send(parkingSource(Buffer.from("a")));

      // Let the drain send the first chunk and park on the source's second pull, then fault the socket: the send must unpark and reject.
      await tick();
      assert.deepEqual(sentText(ws), ["a"]);

      ws.emitError(new Error("socket boom"));

      await assert.rejects(sending, ProtectNetworkError);
      assert.equal(session.state, "closed");
    });

    test("rejects when the socket closes unexpectedly mid-drain", async () => {

      const { session, ws } = await openSession();
      const sending = session.send(parkingSource(Buffer.from("a")));

      await tick();
      ws.emitClose(1006, "dropped");

      await assert.rejects(sending, ProtectNetworkError);
      assert.equal(session.state, "closed");
    });

    test("rejects when the socket's send buffer exceeds the safety ceiling", async () => {

      const { session, ws } = await openSession();

      // A socket that cannot drain reports a buffered amount past the ceiling; the very next send must refuse rather than buffer unboundedly.
      ws.bufferedAmount = PROTECT_TALKBACK_MAX_BUFFERED_BYTES + 1;

      const source = async function *(): AsyncGenerator<Uint8Array> {

        yield Buffer.from("a");
      };

      await assert.rejects(session.send(source()), ProtectNetworkError);
    });

    test("rejects when the caller's signal aborts the drain", async () => {

      const { session } = await openSession();
      const controller = new AbortController();
      const sending = session.send(parkingSource(Buffer.from("a")), { signal: controller.signal });

      await tick();
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

      await assert.rejects(session.send(source()), ProtectError);
    });
  });

  describe("teardown", () => {

    test("close() requests the socket close, sets state closed, and is idempotent", async () => {

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

      // A resolver that never settles, so the abort lands squarely inside the connecting phase - the negotiation await - rather than before construction. This is the
      // distinct abort-mid-negotiation path: the session's own teardown wins the race and settles the handshake before the parked resolver could ever reject, so
      // the typed abort, not a generic negotiation error, is what connect() throws.
      const connecting = TalkbackSession.connect({

        cameraId: "cam1",
        log: silentLog(),
        resolveUrl: () => new Promise<string>(() => undefined),
        signal: controller.signal,
        webSocket: () => new FakeWritableWebSocket({ autoOpen: false })
      });

      await tick();
      controller.abort();

      await assert.rejects(connecting, ProtectAbortedError);
    });

    test("aborting the session signal after it is live tears the session down and rejects an in-flight send", async () => {

      const controller = new AbortController();
      const { session, ws } = await openSession({ signal: controller.signal });

      assert.equal(session.state, "live");

      // Start a drain that parks on its second pull, then abort the session-level signal (the one passed to connect, distinct from a per-send signal). The constructor's
      // abort listener records the typed caller abort and runs #shutdown, which closes the socket and rejects the in-flight send with ProtectAbortedError - the
      // documented "once live, if it aborts, the session tears down and an in-flight send rejects" contract, the live-session counterpart to the
      // already-aborted-before-connect teardown above.
      const sending = session.send(parkingSource(Buffer.from("a")));

      await tick();
      controller.abort();

      await assert.rejects(sending, ProtectAbortedError);
      assert.equal(session.state, "closed");
      assert.equal(ws.closeRequested, true);
    });

    test("close() swallows a socket close() fault and still tears down cleanly", async () => {

      let ws!: ThrowingCloseWebSocket;
      const session = await TalkbackSession.connect({

        cameraId: "cam1",
        log: silentLog(),
        resolveUrl: fixedUrl,
        webSocket: () => (ws = new ThrowingCloseWebSocket({ autoOpen: true }))
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

      const payloads: { cameraId: string }[] = [];
      const onMessage = (message: unknown): void => void payloads.push(message as { cameraId: string });

      channels.talkbackSessionOpened.subscribe(onMessage);

      try {

        const { session } = await openSession({ cameraId: "cam-9" });

        await session.close();

        assert.deepEqual(payloads, [{ cameraId: "cam-9" }]);
      } finally {

        channels.talkbackSessionOpened.unsubscribe(onMessage);
      }
    });

    test("session:closed fires with the cameraId and a reason on close", async () => {

      const payloads: { cameraId: string; reason: string }[] = [];
      const onMessage = (message: unknown): void => void payloads.push(message as { cameraId: string; reason: string });

      channels.talkbackSessionClosed.subscribe(onMessage);

      try {

        const { session } = await openSession({ cameraId: "cam-9" });

        await session.close();

        assert.equal(payloads.length, 1);
        assert.equal(payloads[0]?.cameraId, "cam-9");
        assert.equal(typeof payloads[0]?.reason, "string");
      } finally {

        channels.talkbackSessionClosed.unsubscribe(onMessage);
      }
    });
  });
});
