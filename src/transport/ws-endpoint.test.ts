/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * ws-endpoint.test.ts: Tests for the WebSocket-endpoint negotiation - the core that parses the minted answer and composes the addresses a session dials, the proxied
 * one on the controller authority under the proxy prefix and a livestream's direct one on the authority's hostname at the minted port, exercised through the
 * livestream and talkback specializations (each over GET), the composition on an authority carrying a port, the shared no-URL / unparseable-URL / non-2xx failure
 * paths, and forwarding the caller's abort signal to the transport, driven through an undici MockAgent so no live controller is needed.
 */
import { ProtectAbortedError, ProtectAuthorizationError, ProtectProtocolError } from "../shared/errors.ts";
import { describe, test } from "node:test";
import { livestreamUrlResolver, talkbackUrlResolver } from "./ws-endpoint.ts";
import assert from "node:assert/strict";
import { inspect } from "node:util";
import { makeMockTransport } from "./mock-controller.helpers.ts";

// The invented minted path and query every direct composition row reads, and a minted URL the parser refuses, whose every part a refusal must keep out of its error.
const MINTED_PATH = "/AbCdEf?camera=cam1";
const UNPARSEABLE_URL = "wss://internal host:7443/ws/QwErTy?token=ZxCvBn";

describe("WebSocket endpoint negotiation", () => {

  describe("livestream specialization", () => {

    test("negotiates the livestream endpoint and composes the URL on the authority under the proxy prefix, keeping the minted path and token", async () => {

      const { agent, host, pool, transport } = makeMockTransport();

      pool.intercept({ method: "GET", path: (path) => path.startsWith("/proxy/protect/api/ws/livestream") })
        .reply(200, { url: "wss://internal-host:7443/ws/livestream?token=abc123" });

      const resolve = livestreamUrlResolver(transport, host);
      const resolved = await resolve(new URLSearchParams({ camera: "cam1" }), {});

      assert.equal(resolved.proxied, "wss://" + host + "/proxy/protect/ws/livestream?token=abc123");

      await agent.close();
    });
  });

  describe("talkback specialization", () => {

    test("negotiates the talkback endpoint over GET with the camera param and composes the URL on the authority under the proxy prefix", async () => {

      const { agent, host, pool, transport } = makeMockTransport();

      // The intercept answers only the exact path, so the camera parameter must reach the request's query.
      pool.intercept({ method: "GET", path: (path) => path === "/proxy/protect/api/ws/talkback?camera=cam1" })
        .reply(200, { url: "wss://internal-host:7443/ws/talkback?token=xyz789" });

      const resolve = talkbackUrlResolver(transport, host);
      const resolved = await resolve(new URLSearchParams({ camera: "cam1" }), {});

      assert.equal(resolved, "wss://" + host + "/proxy/protect/ws/talkback?token=xyz789");

      await agent.close();
    });
  });

  describe("authority composition", () => {

    test("a configured address carrying a port composes the URL on that port, dropping the minted one", async () => {

      const { agent, host, pool, transport } = makeMockTransport({ host: "nvr.local:8443" });

      pool.intercept({ method: "GET", path: (path) => path.startsWith("/proxy/protect/api/ws/livestream") })
        .reply(200, { url: "wss://internal-host:7443/ws/livestream?token=abc123" });

      const resolved = await livestreamUrlResolver(transport, host)(new URLSearchParams({ camera: "cam1" }), {});

      assert.equal(resolved.proxied, "wss://nvr.local:8443/proxy/protect/ws/livestream?token=abc123", "the configured port is kept and the minted one dropped");

      await agent.close();
    });

    test("a bracketed IPv6 authority carrying a port composes the URL on the bracketed literal and its port", async () => {

      const { agent, host, pool, transport } = makeMockTransport({ host: "[::1]:8443" });

      pool.intercept({ method: "GET", path: (path) => path === "/proxy/protect/api/ws/talkback?camera=cam1" })
        .reply(200, { url: "wss://internal-host:7443/ws/talkback?token=xyz789" });

      const resolved = await talkbackUrlResolver(transport, host)(new URLSearchParams({ camera: "cam1" }), {});

      assert.equal(resolved, "wss://[::1]:8443/proxy/protect/ws/talkback?token=xyz789", "the literal keeps its brackets");

      await agent.close();
    });
  });

  describe("direct composition", () => {

    // Each row is an authority and a minted direct address, read through Node's own parser when the table was written: the authority's hostname, brackets and all,
    // replaces the minted host, and the minted port, path and query are kept, the configured port never among them.
    for(const [ authority, directUrl, expected ] of [

      [ "nvr.local", "wss://internal-host:7446" + MINTED_PATH, "wss://nvr.local:7446" + MINTED_PATH ],
      [ "nvr.local:8443", "wss://internal-host:7446" + MINTED_PATH, "wss://nvr.local:7446" + MINTED_PATH ],
      [ "[::1]:8443", "wss://internal-host:7446" + MINTED_PATH, "wss://[::1]:7446" + MINTED_PATH ],
      [ "[fe80::1]", "wss://[fe80::2]:7446" + MINTED_PATH, "wss://[fe80::1]:7446" + MINTED_PATH ],
      [ "10.0.0.1", "wss://internal-host" + MINTED_PATH, "wss://10.0.0.1" + MINTED_PATH ]
    ] as const) {

      test("the authority " + authority + " with the minted " + directUrl + " composes the direct address " + expected, async () => {

        const { agent, host, pool, transport } = makeMockTransport({ host: authority });

        pool.intercept({ method: "GET", path: (path) => path.startsWith("/proxy/protect/api/ws/livestream") })
          .reply(200, { directUrl, url: "wss://internal-host:7443/ws/livestream?token=abc123" });

        const resolved = await livestreamUrlResolver(transport, host)(new URLSearchParams({ camera: "cam1" }), {});

        assert.equal(resolved.direct, expected);
        assert.equal(resolved.proxied, "wss://" + authority + "/proxy/protect/ws/livestream?token=abc123", "the proxied address is composed beside it as ever");

        await agent.close();
      });
    }

    // A direct address the library cannot dial is no direct address at all: absent, not a string, not parseable, or minted for any scheme but wss.
    for(const [ label, body ] of [

      [ "absent", {} ],
      [ "a number", { directUrl: 7446 } ],
      [ "not a url", { directUrl: "not a url" } ],
      [ "an unparseable host", { directUrl: "wss://internal host:7446/AbCdEf" } ],
      [ "a ws: scheme", { directUrl: "ws://internal-host:7445/AbCdEf" } ],
      [ "an https: scheme", { directUrl: "https://internal-host:7446/AbCdEf" } ]
    ] as const) {

      test("a directUrl that is " + label + " answers no direct address and leaves the proxied one unchanged", async () => {

        const { agent, host, pool, transport } = makeMockTransport();

        pool.intercept({ method: "GET", path: (path) => path.startsWith("/proxy/protect/api/ws/livestream") })
          .reply(200, { ...body, url: "wss://internal-host:7443/ws/livestream?token=abc123" });

        const resolved = await livestreamUrlResolver(transport, host)(new URLSearchParams({ camera: "cam1" }), {});

        assert.deepEqual(resolved, { direct: null, proxied: "wss://" + host + "/proxy/protect/ws/livestream?token=abc123" });

        await agent.close();
      });
    }
  });

  describe("shared behavior", () => {

    test("throws a ProtectProtocolError when the response carries no URL", async () => {

      const { agent, host, pool, transport } = makeMockTransport();

      pool.intercept({ method: "GET", path: (path) => path.startsWith("/proxy/protect/api/ws/talkback") }).reply(200, { notUrl: true });

      const resolve = talkbackUrlResolver(transport, host);

      await assert.rejects(resolve(new URLSearchParams(), {}), ProtectProtocolError);

      await agent.close();
    });

    // A minted URL the parser refuses is refused as the negotiation's own protocol error on each channel, and nothing of the minted text - its host, its path, its
    // token - reaches the error at any depth, its cause included.
    for(const [ channel, resolver, endpoint ] of [

      [ "livestream", livestreamUrlResolver, "/proxy/protect/api/ws/livestream" ],
      [ "talkback", talkbackUrlResolver, "/proxy/protect/api/ws/talkback" ]
    ] as const) {

      test("a " + channel + " url that does not parse rejects with a ProtectProtocolError that holds none of the minted text", async () => {

        const { agent, host, pool, transport } = makeMockTransport();

        pool.intercept({ method: "GET", path: (path) => path.startsWith(endpoint) }).reply(200, { url: UNPARSEABLE_URL });

        await assert.rejects(resolver(transport, host)(new URLSearchParams({ camera: "cam1" }), {}), (error: unknown) => {

          assert.ok(error instanceof ProtectProtocolError);
          assert.equal(error.message, "The UniFi Protect WebSocket endpoint response did not contain a WebSocket URL.");
          assert.equal(error.cause, undefined);

          const rendered = inspect(error, { depth: Infinity });

          for(const part of [ "internal host", "QwErTy", "ZxCvBn" ]) {

            assert.ok(!rendered.includes(part), "the error must not carry the minted " + part);
          }

          return true;
        });

        await agent.close();
      });
    }

    test("propagates a non-2xx as a classified FatalError", async () => {

      const { agent, host, pool, transport } = makeMockTransport();

      pool.intercept({ method: "GET", path: (path) => path.startsWith("/proxy/protect/api/ws/livestream") }).reply(403, { error: "forbidden" });

      const resolve = livestreamUrlResolver(transport, host);

      // The 403 body carries no URL, so only the status classification makes it the authorization error rather than a protocol error.
      await assert.rejects(resolve(new URLSearchParams(), {}), { constructor: ProtectAuthorizationError, statusCode: 403 });

      await agent.close();
    });

    test("forwards the caller's signal to the transport", async () => {

      const { agent, host, pool, transport } = makeMockTransport();
      const controller = new AbortController();

      // The reply is held open, so the request can end early only through the caller's signal, and only if the resolver handed that signal to the transport.
      pool.intercept({ method: "GET", path: (path) => path.startsWith("/proxy/protect/api/ws/livestream") })
        .reply(200, { url: "wss://internal-host:7443/ws/livestream?token=abc123" }).delay(2000);

      const pending = livestreamUrlResolver(transport, host)(new URLSearchParams({ camera: "cam1" }), { signal: controller.signal });

      controller.abort();

      await assert.rejects(pending, ProtectAbortedError);

      await agent.close();
    });
  });
});
