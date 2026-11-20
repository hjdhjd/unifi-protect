/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * talkback-session-double.test.ts: Tests for the shipped talkback doubles - the factory connects a real TalkbackSession over the socket its call records, records the
 * call before it awaits, hands the caller's signal and its socket options to every session it connects, and rejects a call's socket with the connect's own error.
 * Every promise a broken factory would leave pending is read through a settlement probe, so a regression fails within the poll's deadline.
 */
import { assertNoUnhandledRejections, expectAt, settlement } from "../testing.helpers.ts";
import { describe, test } from "node:test";
import { present, settle } from "homebridge-plugin-utils/testing";
import type { Camera } from "../devices/camera.ts";
import { ProtectAbortedError } from "../errors.ts";
import { TalkbackSession } from "./talkback-session.ts";
import { TestTalkbackFactory } from "./talkback-session-double.ts";
import assert from "node:assert/strict";

// An audio source that yields the given chunks in turn and then ends, as a drained producer does.
async function *audioSource(...chunks: Uint8Array[]): AsyncGenerator<Uint8Array> {

  yield* chunks;
}

describe("TestTalkbackFactory", () => {

  test("connect resolves a live session over the socket its call records, which receives every chunk the session sends, in order", async () => {

    const controller = new AbortController();
    const factory = new TestTalkbackFactory();

    // A host standing in for a camera passes each talkback call straight through, and the compiler holds the factory's connect to Camera.talkback's own signature.
    const talkback: Camera["talkback"] = async (opts) => factory.connect(opts);
    const connecting = talkback({ signal: controller.signal });
    const connected = settlement(connecting);
    const call = present(factory.connectCalls[0], "the recorded connect call");
    const dialed = settlement(call.socket);

    await expectAt(() => connected() && dialed(), { message: "expected the connect and the call's socket to settle" });

    await using session = await connecting;
    const socket = await call.socket;
    const first = Uint8Array.of(1, 2, 3);
    const second = Uint8Array.of(4, 5);

    assert.ok(session instanceof TalkbackSession);
    assert.equal(session.state, "live");
    assert.equal(factory.connectCalls.length, 1, "the factory records one call");
    assert.equal(call.signal, controller.signal, "the call carries the caller's signal");

    await session.send(audioSource(first, second));

    assert.deepEqual(socket.sent, [ first, second ], "the call's socket is the one the session dialed");
  });

  test("records its call before it awaits, and connect stays pending until the call's socket opens", async () => {

    const factory = new TestTalkbackFactory({ autoOpen: false });
    const connecting = factory.connect();
    const connected = settlement(connecting);

    assert.equal(factory.connectCalls.length, 1, "the call is recorded by the time connect returns its promise");

    const call = present(factory.connectCalls[0], "the recorded connect call");
    const dialed = settlement(call.socket);

    await expectAt(dialed, { message: "expected the session to dial the call's socket" });

    const socket = await call.socket;

    await settle();

    assert.equal(connected(), false, "the connect waits on the socket's open");

    socket.emitOpen();

    await expectAt(connected, { message: "expected the socket's open to settle the connect" });

    await using session = await connecting;

    assert.equal(session.state, "live");
  });

  test("aborting the caller's signal after the dial rejects connect with ProtectAbortedError", async () => {

    const controller = new AbortController();
    const factory = new TestTalkbackFactory({ autoOpen: false });
    const connecting = factory.connect({ signal: controller.signal });
    const connected = settlement(connecting);
    const call = present(factory.connectCalls[0], "the recorded connect call");
    const dialed = settlement(call.socket);

    await expectAt(dialed, { message: "expected the session to dial the call's socket" });

    controller.abort();

    await expectAt(connected, { message: "expected the caller's abort to settle the connect" });
    await assert.rejects(connecting, ProtectAbortedError);
  });

  test("an already-aborted signal rejects connect with ProtectAbortedError and the call's socket with that same error", async () => {

    await assertNoUnhandledRejections(async () => {

      const factory = new TestTalkbackFactory();
      const connecting = factory.connect({ signal: AbortSignal.abort() });
      const connected = settlement(connecting);
      const call = present(factory.connectCalls[0], "the recorded connect call");
      const dialed = settlement(call.socket);

      await expectAt(() => connected() && dialed(), { message: "expected the connect and the call's socket to settle" });

      const failure: unknown = await connecting.catch((error: unknown) => error);

      assert.ok(failure instanceof ProtectAbortedError, "the connect rejects with the typed abort");
      await assert.rejects(call.socket, (error: unknown) => error === failure);
    });
  });

  test("a call's socket that rejects and is never read raises no unhandled rejection", async () => {

    await assertNoUnhandledRejections(async () => {

      const factory = new TestTalkbackFactory();

      await assert.rejects(factory.connect({ signal: AbortSignal.abort() }), ProtectAbortedError);
      await settle();
    });
  });

  test("builds every socket with its options, each opening on its own emitOpen() and faulting on its own close()", async () => {

    const factory = new TestTalkbackFactory({ autoOpen: false, closeFault: true });
    const first = factory.connect();
    const second = factory.connect();
    const firstConnected = settlement(first);
    const secondConnected = settlement(second);
    const firstCall = present(factory.connectCalls[0], "the first connect call");
    const secondCall = present(factory.connectCalls[1], "the second connect call");
    const firstDialed = settlement(firstCall.socket);
    const secondDialed = settlement(secondCall.socket);

    await expectAt(() => firstDialed() && secondDialed(), { message: "expected each session to dial its socket" });

    const firstSocket = await firstCall.socket;
    const secondSocket = await secondCall.socket;

    await settle();

    assert.equal(firstConnected(), false, "the first socket waits to be opened");
    assert.equal(secondConnected(), false, "the second socket waits to be opened");

    firstSocket.emitOpen();

    await expectAt(firstConnected, { message: "expected the first socket's open to settle the first connect" });

    assert.equal(secondConnected(), false, "the first socket's open leaves the second connect pending");

    secondSocket.emitOpen();

    await expectAt(secondConnected, { message: "expected the second socket's open to settle the second connect" });

    await using firstSession = await first;
    await using secondSession = await second;

    assert.equal(firstSession.state, "live");
    assert.equal(secondSession.state, "live");
    assert.throws(() => firstSocket.close(), /faulted/, "the first socket's close faults");
    assert.throws(() => secondSocket.close(), /faulted/, "the second socket's close faults");
  });
});
