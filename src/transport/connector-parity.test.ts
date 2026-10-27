/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * connector-parity.test.ts: Differential tests holding this library's owned connector to homebridge-plugin-utils' createOwnedConnector. The library takes no runtime
 * dependency on homebridge-plugin-utils, so the connector is implemented in both places; this suite runs each scenario against both and asserts the same outcome, so
 * a change to either connector's behavior reddens it here.
 *
 * Every assertion reads an error's name and code and never its class, because homebridge-plugin-utils' connector raises the classes of its own undici copy, which an
 * `instanceof` against this library's copy is not guaranteed to recognize. Each scenario drives a real socket against this library's loopback peers through an undici
 * `Agent`, because what a connector is for - a dial still in its handshake, a keepalive connection, a certificate nothing trusts - is reachable no other way.
 */
import { Agent, request } from "undici";
import { DIAL_SETTLE_BOUND_MS, createLoopbackAlpnPeer, createLoopbackHttpsPeer, createLoopbackSilentPeer, elapsedSince } from "./tls-peer.helpers.ts";
import { describe, test } from "node:test";
import { freePort, present } from "homebridge-plugin-utils/testing";
import type { OwnedConnector } from "./connector.ts";
import assert from "node:assert/strict";
import { classifyTransportError } from "./failure.ts";
import { createOwnedConnector } from "./connector.ts";
import { createOwnedConnector as createPluginUtilsConnector } from "homebridge-plugin-utils";

// What both connectors share, and the whole of what these scenarios drive: the connector to hand an agent, the record of the latest dial, and the release.
type SharedConnector = Pick<OwnedConnector, "connect" | "lastDialFailure" | "release">;

// One connector under test: its name in the suite, and how it is built from the options every scenario states, spelled in that connector's own vocabulary.
interface ConnectorCase {

  build: (options: { allowH2: boolean; verifyTls: boolean }) => SharedConnector;
  name: string;
}

const CONNECTORS: ConnectorCase[] = [

  { build: ({ allowH2, verifyTls }) => createOwnedConnector({ allowH2, verifyTls }), name: "the library's own connector" },

  // homebridge-plugin-utils names the verification flag for the transport option it sets. It is always passed explicitly here, because omitting it leaves the
  // answer to the platform's environment rather than to the scenario.
  { build: ({ allowH2, verifyTls }) => createPluginUtilsConnector({ allowH2, rejectUnauthorized: verifyTls }), name: "homebridge-plugin-utils' connector" }
];

// The code an error carries, read without trusting its class, so a failure raised from either undici copy reads the same way.
function codeOf(error: unknown): unknown {

  return ((typeof error === "object") && (error !== null) && ("code" in error)) ? error.code : undefined;
}

describe("createOwnedConnector parity with homebridge-plugin-utils", () => {

  for(const { build, name } of CONNECTORS) {

    describe(name, () => {

      test("release cuts a dial still in flight as the pool-reset interruption", async () => {

        await using peer = await createLoopbackSilentPeer();

        const connector = build({ allowH2: false, verifyTls: false });
        const agent = new Agent({ connect: connector.connect });
        const arriving = peer.connection(0);
        const pending = request("https://" + peer.host + "/x", { dispatcher: agent });
        const connection = await arriving;
        const startedAt = process.hrtime.bigint();

        connector.release();

        await assert.rejects(pending, { code: "UND_ERR_DESTROYED", name: "ClientDestroyedError" });
        await connection.closed;

        assert.ok(elapsedSince(startedAt) < DIAL_SETTLE_BOUND_MS, "a released dial settles at once rather than running on to undici's own connect timer");

        await agent.destroy();
      });

      test("release destroys an established connection", async () => {

        await using peer = await createLoopbackHttpsPeer();

        const connector = build({ allowH2: false, verifyTls: false });
        const agent = new Agent({ connect: connector.connect });
        const arriving = peer.connection(0);
        const response = await request("https://" + peer.host + "/one", { dispatcher: agent });

        await response.body.text();

        const connection = await arriving;

        // The keepalive socket the completed request left behind is what the release has to reach, and the peer seeing its end close is the proof it did.
        connector.release();

        await connection.closed;

        await agent.destroy();
      });

      test("lastDialFailure describes the most recent dial and nothing older", async () => {

        const connector = build({ allowH2: false, verifyTls: false });
        const refusingAgent = new Agent({ connect: connector.connect });

        // Read into a binding of its own, so the assertion narrows that binding rather than the getter every later read of the record goes through.
        const beforeAnyDial = connector.lastDialFailure;

        assert.equal(beforeAnyDial, undefined, "a connector that has dialed nothing has nothing to report");

        // The request rejects with the dial's own platform error, a plain `Error` and the very object the connector records, so the record read below is the
        // assertion and the rejection is only awaited.
        await assert.rejects(request("https://127.0.0.1:" + (await freePort()).toString() + "/x", { dispatcher: refusingAgent }));

        const refusal = present(connector.lastDialFailure, "the refused dial's own error");

        assert.equal(refusal.name, "Error", "the record is the platform's own error");
        assert.equal(codeOf(refusal), "ECONNREFUSED", "and it carries the platform's errno");

        await refusingAgent.destroy();

        await using peer = await createLoopbackHttpsPeer();

        const succeedingAgent = new Agent({ connect: connector.connect });
        const response = await request("https://" + peer.host + "/one", { dispatcher: succeedingAgent });

        await response.body.text();

        assert.equal(connector.lastDialFailure, undefined, "a dial that succeeded clears what the failed one left");

        connector.release();

        await succeedingAgent.destroy();
      });

      test("the ALPN offer follows allowH2 in both directions", async () => {

        await using peer = await createLoopbackAlpnPeer();

        // The peer offers `h2` ahead of `http/1.1`, so what it negotiates is a reading of the connector's own offer. Each request is ended by its agent's teardown,
        // and its rejection is claimed before that teardown, because a rejection nobody is waiting on yet is one the runner reports as unhandled.
        const offered = build({ allowH2: true, verifyTls: false });
        const offeringAgent = new Agent({ allowH2: true, connect: offered.connect });
        const endedOffered = assert.rejects(request("https://" + peer.host + "/x", { dispatcher: offeringAgent }));

        assert.equal(await peer.protocol(0), "h2", "a connector that allows HTTP/2 offers it");

        await offeringAgent.destroy();
        await endedOffered;

        const withheld = build({ allowH2: false, verifyTls: false });
        const withholdingAgent = new Agent({ allowH2: false, connect: withheld.connect });
        const endedWithheld = assert.rejects(request("https://" + peer.host + "/x", { dispatcher: withholdingAgent }));

        assert.equal(await peer.protocol(1), "http/1.1", "a connector that withholds HTTP/2 negotiates HTTP/1.1");

        await withholdingAgent.destroy();
        await endedWithheld;
      });

      test("a certificate refusal from a self-signed peer leaves a dial failure the local classifier reads as certificate", async () => {

        await using peer = await createLoopbackHttpsPeer();

        const connector = build({ allowH2: false, verifyTls: true });
        const agent = new Agent({ connect: connector.connect });

        // The request rejects with the dial's own platform error, a plain `Error` and the very object the connector records, so the record read below is the
        // assertion and the rejection is only awaited.
        await assert.rejects(request("https://" + peer.host + "/one", { dispatcher: agent }));

        const failure = present(connector.lastDialFailure, "the refused peer's own verdict");
        const reading = classifyTransportError(failure);

        assert.equal(codeOf(failure), "DEPTH_ZERO_SELF_SIGNED_CERT", "the dial carries the platform's own certificate verdict");
        assert.deepEqual({ code: reading.code, kind: reading.kind }, { code: "DEPTH_ZERO_SELF_SIGNED_CERT", kind: "certificate" },
          "the verdict reads as a certificate failure, which is what the request path and every socket report through ProtectCertificateError");

        connector.release();

        await agent.destroy();
      });
    });
  }
});
