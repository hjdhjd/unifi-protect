/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * ws-endpoint.test.ts: Tests for the shared WebSocket-endpoint negotiator - the parse-{url}-and-host-rewrite core, exercised through both the livestream and talkback
 * specializations (both GET) and the shared no-URL / non-2xx failure paths, driven through an undici MockAgent so no live controller is needed.
 */
import { ProtectError, ProtectProtocolError } from "../errors.ts";
import { describe, test } from "node:test";
import { livestreamUrlResolver, talkbackUrlResolver, wsEndpointResolver } from "./ws-endpoint.ts";
import assert from "node:assert/strict";
import { makeMockTransport } from "./mock-controller.helpers.ts";

describe("wsEndpointResolver", () => {

  describe("livestream specialization", () => {

    test("negotiates the livestream endpoint and rewrites the host while keeping the controller's port and token", async () => {

      const { agent, host, pool, transport } = makeMockTransport();

      pool.intercept({ method: "GET", path: (path) => path.startsWith("/proxy/protect/api/ws/livestream") })
        .reply(200, { url: "wss://internal-host:7443/ws/livestream?token=abc123" });

      const resolve = livestreamUrlResolver(transport, host);
      const resolved = await resolve(new URLSearchParams({ camera: "cam1" }), {});

      assert.equal(resolved, "wss://" + host + ":7443/ws/livestream?token=abc123");

      await agent.close();
    });
  });

  describe("talkback specialization", () => {

    test("negotiates the talkback endpoint over GET with the camera param and rewrites the host", async () => {

      const { agent, host, pool, transport } = makeMockTransport();

      pool.intercept({ method: "GET", path: (path) => path.startsWith("/proxy/protect/api/ws/talkback") })
        .reply(200, { url: "wss://internal-host:7443/ws/talkback?token=xyz789" });

      const resolve = talkbackUrlResolver(transport, host);
      const resolved = await resolve(new URLSearchParams({ camera: "cam1" }), {});

      assert.equal(resolved, "wss://" + host + ":7443/ws/talkback?token=xyz789");

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

      await assert.rejects(resolve(new URLSearchParams(), {}), ProtectError);

      await agent.close();
    });
  });
});
