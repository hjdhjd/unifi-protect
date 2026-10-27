/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * connector.test.ts: Tests for the owned connector - releasing what is held, a connection attempt still in flight and an established connection alike, the ALPN
 * offer a function connector has to restate for itself, the record of the first error an established connection raised, and the order an owned teardown lets a
 * dispatcher and its connector go in.
 *
 * The connector's rows drive it directly through an undici `Agent`, because the whole subject is what undici does with a socket the helper destroyed under it: the
 * rejection a pending request gets, and whether the peer sees the connection end. A silent loopback peer is what holds a connection attempt open for as long as a
 * test needs it, and the HTTPS responder is what supplies an established one. The connection record's rows drive the ways a peer drops an established connection
 * - a reset, a bare FIN, a response asking for the close, and a TLS record no session can decrypt - against the scripted peer and the TLS peer behind a proxy. The
 * teardown order is read off structural fakes instead, because what it asserts is an order inside one synchronous stack, which a real dispatcher gives a test no
 * way to observe.
 */
import { Agent, errors, request } from "undici";
import { CLOSING_RESPONSE, CORRUPT_TLS_RECORD, DIAL_SETTLE_BOUND_MS, KEEP_ALIVE_RESPONSE, createLoopbackAlpnPeer, createLoopbackHttpsPeer, createLoopbackScriptedPeer,
  createLoopbackSilentPeer, createLoopbackTlsProxyPeer, elapsedSince, fetchStatus, keepingVended } from "./tls-peer.helpers.ts";
import { createOwnedConnector, releaseOwned } from "./connector.ts";
import { describe, test } from "node:test";
import { freePort, present, settle, waitUntil } from "homebridge-plugin-utils/testing";
import type { Dispatcher } from "undici";
import type { OwnedConnector } from "./connector.ts";
import type { Socket } from "node:net";
import assert from "node:assert/strict";
import { classifyTransportError } from "./failure.ts";
import { resolveErrnoCause } from "../errors.ts";

describe("createOwnedConnector", () => {

  test("release cuts a connection attempt still in flight as the pool-reset interruption", async () => {

    await using peer = await createLoopbackSilentPeer();

    const connector = createOwnedConnector({ allowH2: false, verifyTls: false });
    const agent = new Agent({ connect: connector.connect });
    const arriving = peer.connection(0);
    const pending = request("https://" + peer.host + "/x", { dispatcher: agent });
    const connection = await arriving;
    const startedAt = process.hrtime.bigint();

    connector.release();

    await assert.rejects(pending, errors.ClientDestroyedError);
    await connection.closed;

    assert.ok(elapsedSince(startedAt) < DIAL_SETTLE_BOUND_MS, "a released connection attempt settles at once rather than running on to undici's own connect timer");

    await agent.destroy();
  });

  test("release destroys an established connection", async () => {

    await using peer = await createLoopbackHttpsPeer();

    const connector = createOwnedConnector({ allowH2: false, verifyTls: false });
    const agent = new Agent({ connect: connector.connect });
    const arriving = peer.connection(0);
    const response = await request("https://" + peer.host + "/one", { dispatcher: agent });

    await response.body.text();

    const connection = await arriving;

    // The keepalive socket the completed request left behind is what release has to reach. It is destroyed bare, because nothing is pending on the connector's side
    // of an established connection.
    connector.release();

    await connection.closed;

    await agent.destroy();
  });

  test("lastDialFailure describes the most recent dial and nothing older", async () => {

    // A port that was listening and is not any more, so a dial against it is refused at once rather than left hanging. The connector's record is the only place that
    // error survives for a WebSocket caller, which is what this row is about.
    const vacantPort = await freePort();

    const connector = createOwnedConnector({ allowH2: false, verifyTls: false });
    const refusingAgent = new Agent({ connect: connector.connect });

    // Read into a binding of its own, so the assertion narrows that binding rather than the getter every later read of the record goes through.
    const beforeAnyDial = connector.lastDialFailure;

    assert.equal(beforeAnyDial, undefined, "a connector that has dialed nothing has nothing to report");

    // The request rejects with the dial's own platform error, a plain `Error` and the very object the connector records, so the record read below is the assertion and
    // the rejection is only awaited.
    await assert.rejects(request("https://127.0.0.1:" + vacantPort.toString() + "/x", { dispatcher: refusingAgent }));

    const refusal = connector.lastDialFailure;

    assert.ok(refusal !== undefined, "a refused dial leaves the platform's own error behind");
    assert.equal(resolveErrnoCause(refusal)?.code, "ECONNREFUSED", "and what it left is the platform's error, errno and all");

    await refusingAgent.destroy();

    await using peer = await createLoopbackHttpsPeer();

    const succeedingAgent = new Agent({ connect: connector.connect });
    const response = await request("https://" + peer.host + "/one", { dispatcher: succeedingAgent });

    await response.body.text();

    // The record describes the dial that just happened, so a connector whose latest dial connected reports no failure at all - which is what keeps a later socket
    // error from being read against a dial that is long over.
    assert.equal(connector.lastDialFailure, undefined, "a dial that succeeded clears what the failed one left");

    await succeedingAgent.destroy();
  });

  test("the ALPN offer follows allowH2 in both directions", async () => {

    await using peer = await createLoopbackAlpnPeer();

    /* The peer offers `h2` ahead of `http/1.1`, so what it negotiates is a reading of the client's own offer. That offer comes from the connector rather than from the
     * dispatcher, which is the whole reason a function connector has to restate `allowH2` for itself: a connector that stayed silent would take the builder's own
     * default and quietly widen the offer past what its dispatcher asked for.
     */
    const offered = createOwnedConnector({ allowH2: true, verifyTls: false });
    const offeringAgent = new Agent({ allowH2: true, connect: offered.connect });

    // The peer answers nothing, so the request is ended by the agent's teardown below. Its rejection is claimed here, before the teardown that causes it, because a
    // rejection nobody is waiting on yet is one the runner reports as unhandled.
    const endedOffered = assert.rejects(request("https://" + peer.host + "/x", { dispatcher: offeringAgent }));

    assert.equal(await peer.protocol(0), "h2", "a connector that allows HTTP/2 offers it");

    await offeringAgent.destroy();
    await endedOffered;

    const withheld = createOwnedConnector({ allowH2: false, verifyTls: false });
    const withholdingAgent = new Agent({ allowH2: false, connect: withheld.connect });
    const endedWithheld = assert.rejects(request("https://" + peer.host + "/x", { dispatcher: withholdingAgent }));

    assert.equal(await peer.protocol(1), "http/1.1", "a connector that withholds HTTP/2 negotiates HTTP/1.1");

    await withholdingAgent.destroy();
    await endedWithheld;
  });
});

describe("createOwnedConnector's connection record", () => {

  test("a peer's reset of a request in flight on a keep-alive connection is recorded with ECONNRESET, the very error the request rejects with", async (t) => {

    const peer = await createLoopbackScriptedPeer((socket) => socket.resetAndDestroy());
    const connector = createOwnedConnector({ allowH2: false, verifyTls: false });
    const agent = new Agent({ connect: connector.connect });

    t.after(async (): Promise<void> => {

      connector.release();

      await agent.destroy();
      await peer.close();
    });

    await assert.rejects(fetchStatus(agent, "http://" + peer.host), (error: unknown) => {

      // The transport rejects a request in flight with the error its socket raised, so the record is readable here and is that same object.
      assert.equal(resolveErrnoCause(connector.lastConnectionFailure)?.code, "ECONNRESET", "the reset must be recorded with the errno the platform raised");
      assert.equal(error, connector.lastConnectionFailure, "the record must hold the very error the socket raised, its errno and cause chain intact");

      return true;
    });
  });

  test("a bare FIN the peer sends on an idle keep-alive connection records nothing", async (t) => {

    const peer = await createLoopbackScriptedPeer((socket) => socket.write(KEEP_ALIVE_RESPONSE));
    const connector = createOwnedConnector({ allowH2: false, verifyTls: false });
    const agent = new Agent({ connect: connector.connect });

    t.after(async (): Promise<void> => {

      connector.release();

      await agent.destroy();
      await peer.close();
    });

    assert.equal(await fetchStatus(agent, "http://" + peer.host), 200);

    const connection = await peer.connection(0);

    connection.end();

    // The client closes its side once the transport has destroyed the socket over the FIN, so the peer seeing its connection close marks the record as final.
    await connection.closed;

    assert.equal(connector.lastConnectionFailure, undefined, "the transport destroys the socket with an error of its own over a bare FIN, which is no record");
  });

  test("a response that asks for Connection: close records nothing", async (t) => {

    const peer = await createLoopbackScriptedPeer((socket) => socket.write(CLOSING_RESPONSE));
    const connector = createOwnedConnector({ allowH2: false, verifyTls: false });
    const agent = new Agent({ connect: connector.connect });

    t.after(async (): Promise<void> => {

      connector.release();

      await agent.destroy();
      await peer.close();
    });

    assert.equal(await fetchStatus(agent, "http://" + peer.host), 200);

    // The transport closes the connection the response asked it to close, so the peer seeing its connection close marks the record as final.
    await (await peer.connection(0)).closed;

    assert.equal(connector.lastConnectionFailure, undefined, "the transport destroys the socket with an error of its own over a clean close, which is no record");
  });

  test("release records nothing", async (t) => {

    const peer = await createLoopbackHttpsPeer();
    const connector = createOwnedConnector({ allowH2: false, verifyTls: false });
    const agent = new Agent({ connect: connector.connect });

    t.after(async (): Promise<void> => {

      await agent.destroy();
      await peer.close();
    });

    assert.equal(await fetchStatus(agent, "https://" + peer.host), 200);

    connector.release();

    await (await peer.connection(0)).closed;

    assert.equal(connector.lastConnectionFailure, undefined, "a release destroys its sockets bare, which raises no error to record");
  });

  test("a caller's destroy with an error carrying neither an errno nor a TLS code records nothing", async (t) => {

    const peer = await createLoopbackScriptedPeer((socket) => socket.write(KEEP_ALIVE_RESPONSE));
    const connector = createOwnedConnector({ allowH2: false, verifyTls: false });
    const vended: Socket[] = [];
    const agent = new Agent({ connect: keepingVended(connector, vended) });

    t.after(async (): Promise<void> => {

      connector.release();

      await agent.destroy();
      await peer.close();
    });

    assert.equal(await fetchStatus(agent, "http://" + peer.host), 200);

    const ended = new Error("the caller ended the connection");
    const raised: unknown[] = [];
    const socket = present(vended[0], "the socket the dial vended");

    // The row's own listener sees what the connector's listener is handed: the caller's error, raised by the socket itself, so the record below is a verdict on it.
    socket.on("error", (error: unknown) => raised.push(error));
    socket.destroy(ended);

    // The client closes the connection it destroyed, so the peer seeing its connection close marks the record as final.
    await (await peer.connection(0)).closed;

    assert.equal(raised.length, 1, "the socket raises one error");
    assert.equal(raised[0], ended, "and that error is the caller's own");
    assert.equal(connector.lastConnectionFailure, undefined, "a caller's error carrying neither an errno nor a TLS code is no record");
  });

  test("a TLS error after the handshake is recorded while the socket stays open", async (t) => {

    const peer = await createLoopbackTlsProxyPeer();
    const connector = createOwnedConnector({ allowH2: false, verifyTls: false });
    const vended: Socket[] = [];
    const agent = new Agent({ connect: keepingVended(connector, vended) });

    t.after(async (): Promise<void> => {

      connector.release();

      await agent.destroy();
      await peer.close();
    });

    assert.equal(await fetchStatus(agent, "https://" + peer.host), 200);

    peer.write(CORRUPT_TLS_RECORD);

    await waitUntil(() => connector.lastConnectionFailure !== undefined, { description: "the client's TLS layer to raise its error over the corrupt record" });

    assert.match(classifyTransportError(connector.lastConnectionFailure).code ?? "", /^ERR_SSL_/u, "the record must be the TLS layer's own error");

    // Nothing destroys an idle socket over a TLS error, so no close follows it, and a record read at the socket's close would hold nothing.
    await settle(5);

    assert.equal(present(vended[0], "the socket the dial vended").destroyed, false, "the socket must stay open after the TLS error it raised");
  });

  test("a later error the socket raises does not replace the first", async (t) => {

    const peer = await createLoopbackTlsProxyPeer();
    const connector = createOwnedConnector({ allowH2: false, verifyTls: false });
    const raised: unknown[] = [];
    const vended: Socket[] = [];
    const agent = new Agent({ connect: keepingVended(connector, vended) });

    t.after(async (): Promise<void> => {

      connector.release();

      await agent.destroy();
      await peer.close();
    });

    assert.equal(await fetchStatus(agent, "https://" + peer.host), 200);

    present(vended[0], "the socket the dial vended").on("error", (error: unknown) => raised.push(error));
    peer.write(CORRUPT_TLS_RECORD);

    await waitUntil(() => connector.lastConnectionFailure !== undefined, { description: "the client's TLS layer to raise its error over the corrupt record" });

    const first = connector.lastConnectionFailure;

    (await peer.connection(0)).reset();

    await waitUntil(() => raised.some((error) => resolveErrnoCause(error)?.code === "ECONNRESET"), { description: "the socket to raise the reset that followed" });

    assert.equal(connector.lastConnectionFailure, first, "the first error the socket raised must stand, the reset after it being its consequence");
  });

  test("a successful connect clears what an earlier connection recorded", async (t) => {

    const peer = await createLoopbackScriptedPeer((socket) => socket.write(KEEP_ALIVE_RESPONSE));
    const connector = createOwnedConnector({ allowH2: false, verifyTls: false });
    const agent = new Agent({ connect: connector.connect });

    t.after(async (): Promise<void> => {

      connector.release();

      await agent.destroy();
      await peer.close();
    });

    assert.equal(await fetchStatus(agent, "http://" + peer.host), 200);

    (await peer.connection(0)).reset();

    await waitUntil(() => connector.lastConnectionFailure !== undefined, { description: "the reset of the idle connection to be recorded" });

    assert.equal(resolveErrnoCause(connector.lastConnectionFailure)?.code, "ECONNRESET", "the idle connection's reset must be recorded first");

    // The reset connection is gone, so the next request dials again, and that dial's success clears what the reset left.
    assert.equal(await fetchStatus(agent, "http://" + peer.host), 200);
    assert.equal(connector.lastConnectionFailure, undefined, "a successful connect must clear the record an earlier connection left");
  });
});

describe("releaseOwned", () => {

  test("releaseOwned destroys the dispatcher and then releases the connector, with nothing awaited between them", async () => {

    const calls: string[] = [];
    const destroy = Promise.withResolvers<undefined>();

    // The destroy's settlement is held unresolved, so a release that waited on it would be missing from the log read below.
    const dispatcher = {

      destroy: async (): Promise<void> => {

        calls.push("destroy");

        return destroy.promise;
      }
    } as unknown as Dispatcher;

    const connector = {

      release: (): void => {

        calls.push("release");
      }
    } as unknown as OwnedConnector;

    const released = releaseOwned({ connector, dispatcher });

    // Read before anything is awaited: an await ahead of the destroy, or between the destroy and the release, leaves the log short at this point.
    assert.deepEqual(calls, [ "destroy", "release" ], "the destroy and then the release, each inside the call itself");

    destroy.resolve(undefined);

    await released;
  });
});
