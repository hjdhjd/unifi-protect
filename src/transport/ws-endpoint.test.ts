/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * ws-endpoint.test.ts: Tests for the shared WebSocket-endpoint negotiator - the core that parses the minted `{ url }` and composes the dialed URL on the controller
 * authority under the proxy prefix, exercised through the livestream and talkback specializations (each over GET), the composition on an authority carrying a port,
 * the shared no-URL / non-2xx failure paths, and forwarding the caller's abort signal to the transport, driven through an undici MockAgent so no live controller is
 * needed.
 */
import { ProtectAbortedError, ProtectAuthorizationError, ProtectProtocolError } from "../errors.ts";
import { describe, test } from "node:test";
import { livestreamUrlResolver, talkbackUrlResolver, wsEndpointResolver } from "./ws-endpoint.ts";
import assert from "node:assert/strict";
import { makeMockTransport } from "./mock-controller.helpers.ts";

describe("wsEndpointResolver", () => {

  describe("livestream specialization", () => {

    test("negotiates the livestream endpoint and composes the URL on the authority under the proxy prefix, keeping the minted path and token", async () => {

      const { agent, host, pool, transport } = makeMockTransport();

      pool.intercept({ method: "GET", path: (path) => path.startsWith("/proxy/protect/api/ws/livestream") })
        .reply(200, { url: "wss://internal-host:7443/ws/livestream?token=abc123" });

      const resolve = livestreamUrlResolver(transport, host);
      const resolved = await resolve(new URLSearchParams({ camera: "cam1" }), {});

      assert.equal(resolved, "wss://" + host + "/proxy/protect/ws/livestream?token=abc123");

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

      assert.equal(resolved, "wss://nvr.local:8443/proxy/protect/ws/livestream?token=abc123", "the configured port is kept and the minted one dropped");

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

  describe("shared behavior", () => {

    test("throws a ProtectProtocolError when the response carries no URL", async () => {

      const { agent, host, pool, transport } = makeMockTransport();

      pool.intercept({ method: "GET", path: (path) => path.startsWith("/proxy/protect/api/ws/talkback") }).reply(200, { notUrl: true });

      const resolve = wsEndpointResolver(transport, host, "/proxy/protect/api/ws/talkback");

      await assert.rejects(resolve(new URLSearchParams(), {}), ProtectProtocolError);

      await agent.close();
    });

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
