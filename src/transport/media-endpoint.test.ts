/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * media-endpoint.test.ts: Tests for the media-endpoint negotiation - the core that parses the minted answer and composes the addresses a session dials, the proxied
 * one on the controller authority under the proxy prefix, a livestream's direct one on the authority's hostname at the minted port, and talkback's RTP listener on
 * the camera as minted, exercised through the livestream, talkback and talkback RTP specializations (each over GET), the composition on an authority carrying a
 * port, the camera-record read of the talkback rate, the talkback endpoint composed from each codec's negotiation and then that read, the shared non-object /
 * no-URL / unparseable-URL / non-2xx failure paths, and forwarding the caller's abort signal to the transport, driven through an undici MockAgent so no live
 * controller is needed.
 */
import { ProtectAbortedError, ProtectAuthorizationError, ProtectProtocolError } from "../shared/errors.ts";
import { describe, test } from "node:test";
import { livestreamUrlResolver, talkbackEndpointResolver, talkbackRateReader, talkbackRtpResolver, talkbackUrlResolver } from "./media-endpoint.ts";
import type { TalkbackEndpoint } from "../talkback/session.ts";
import type { Transport } from "./http.ts";
import assert from "node:assert/strict";
import { expectAt } from "../shared/testing.helpers.ts";
import { inspect } from "node:util";
import { makeMockTransport } from "./mock-controller.helpers.ts";
import { settle } from "homebridge-plugin-utils/testing";

// The invented minted path and query every direct composition row reads, and a minted URL the parser refuses, whose every part a refusal must keep out of its error.
const MINTED_PATH = "/AbCdEf?camera=cam1";
const UNPARSEABLE_URL = "wss://internal host:7443/ws/QwErTy?token=ZxCvBn";

// The path `recordUrlOn` gives camera cam1's record, the one path each rate-read row's interceptor answers.
const RECORD_PATH = "/record/cam1";

// The URL of a camera's record on a row's authority, on a synthetic path rather than the device endpoint builder's. The resolvers take the record URL as a
// dependency, so a row whose interceptor answers only the path this composes shows the reader requests exactly the URL it is handed.
function recordUrlOn(host: string): (cameraId: string) => string {

  return (cameraId: string): string => "https://" + host + "/record/" + cameraId;
}

describe("media endpoint negotiation", () => {

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

  describe("talkback RTP specialization", () => {

    // The intercept answers only the exact path, so the camera parameter and the WebRTC route's source must each reach the request's query.
    const RTP_PATH = "/proxy/protect/api/tcp/talkback?camera=cam1&source=ucore";

    test("negotiates the WebRTC talkback route over GET with the camera and source params and answers the camera's RTP listener as minted", async () => {

      const { agent, host, pool, transport } = makeMockTransport();

      pool.intercept({ method: "GET", path: RTP_PATH }).reply(200, { audioRemoteTrackUrl: "rtp://192.0.2.10:5004", trackType: 1 });

      assert.deepEqual(await talkbackRtpResolver(transport, host)("cam1", {}), { host: "192.0.2.10", port: 5004 });

      await agent.close();
    });

    test("an IPv6 listener answers its literal without the brackets the URL carries it in", async () => {

      const { agent, host, pool, transport } = makeMockTransport();

      pool.intercept({ method: "GET", path: RTP_PATH }).reply(200, { audioRemoteTrackUrl: "rtp://[2001:db8::10]:5004" });

      assert.deepEqual(await talkbackRtpResolver(transport, host)("cam1", {}), { host: "2001:db8::10", port: 5004 });

      await agent.close();
    });

    test("a port at either end of the range is a listener", async () => {

      const { agent, host, pool, transport } = makeMockTransport();

      pool.intercept({ method: "GET", path: RTP_PATH }).reply(200, { audioRemoteTrackUrl: "rtp://192.0.2.10:1" });
      pool.intercept({ method: "GET", path: RTP_PATH }).reply(200, { audioRemoteTrackUrl: "rtp://192.0.2.10:65535" });

      const resolve = talkbackRtpResolver(transport, host);

      assert.deepEqual(await resolve("cam1", {}), { host: "192.0.2.10", port: 1 });
      assert.deepEqual(await resolve("cam1", {}), { host: "192.0.2.10", port: 65535 });

      await agent.close();
    });

    test("a 403 for an account without the live-view permission rejects as ProtectAuthorizationError", async () => {

      const { agent, host, pool, transport } = makeMockTransport();

      pool.intercept({ method: "GET", path: RTP_PATH }).reply(403, { error: "forbidden" });

      await assert.rejects(talkbackRtpResolver(transport, host)("cam1", {}), { constructor: ProtectAuthorizationError, statusCode: 403 });

      await agent.close();
    });

    // An answer that names no listener the library can send to is no address at all, and nothing of the minted text - its host, its path, its query - reaches the
    // refusal at any depth, its cause included.
    for(const [ label, body ] of [

      [ "absent", { trackType: 1 } ],
      [ "a number", { audioRemoteTrackUrl: 5004 } ],
      [ "not a url", { audioRemoteTrackUrl: "QwErTy" } ],
      [ "an unparseable host", { audioRemoteTrackUrl: "rtp://internal host:5004/QwErTy?ZxCvBn" } ],
      [ "another scheme", { audioRemoteTrackUrl: "udp://internal-host:5004/QwErTy?ZxCvBn" } ],
      [ "without a host", { audioRemoteTrackUrl: "rtp:///QwErTy?ZxCvBn" } ],
      [ "without a port", { audioRemoteTrackUrl: "rtp://internal-host/QwErTy?ZxCvBn" } ],
      [ "at port 0", { audioRemoteTrackUrl: "rtp://internal-host:0/QwErTy?ZxCvBn" } ],
      [ "past port 65535", { audioRemoteTrackUrl: "rtp://internal-host:65536/QwErTy?ZxCvBn" } ]
    ] as const) {

      test("an audioRemoteTrackUrl that is " + label + " rejects with a ProtectProtocolError that holds none of the minted text", async () => {

        const { agent, host, pool, transport } = makeMockTransport();

        pool.intercept({ method: "GET", path: RTP_PATH }).reply(200, body);

        await assert.rejects(talkbackRtpResolver(transport, host)("cam1", {}), (error: unknown) => {

          assert.ok(error instanceof ProtectProtocolError);
          assert.equal(error.message, "The UniFi Protect talkback endpoint response did not contain an RTP address.");
          assert.equal(error.cause, undefined);

          const rendered = inspect(error, { depth: Infinity });

          for(const part of [ "internal host", "internal-host", "QwErTy", "ZxCvBn" ]) {

            assert.ok(!rendered.includes(part), "the error must not carry the minted " + part);
          }

          return true;
        });

        await agent.close();
      });
    }
  });

  describe("talkback rate reader", () => {

    test("reads the camera's record over GET and answers the sampling rate its talkback settings name", async () => {

      const { agent, host, pool, transport } = makeMockTransport();

      pool.intercept({ method: "GET", path: RECORD_PATH }).reply(200, { id: "cam1", talkbackSettings: { samplingRate: 24000, typeFmt: "opus" } });

      assert.equal(await talkbackRateReader(transport, recordUrlOn(host))("cam1", {}), 24000);

      await agent.close();
    });

    for(const [ label, body ] of [

      [ "without talkback settings", { id: "cam1" } ],
      [ "whose talkback settings are not an object", { id: "cam1", talkbackSettings: "aac" } ],
      [ "without a rate", { id: "cam1", talkbackSettings: { typeFmt: "aac" } } ],
      [ "whose rate is a string", { id: "cam1", talkbackSettings: { samplingRate: "22050" } } ],
      [ "whose rate is 0", { id: "cam1", talkbackSettings: { samplingRate: 0 } } ],
      [ "whose rate is negative", { id: "cam1", talkbackSettings: { samplingRate: -16000 } } ],
      [ "whose rate is fractional", { id: "cam1", talkbackSettings: { samplingRate: 22050.5 } } ]
    ] as const) {

      test("a camera record " + label + " rejects with a ProtectProtocolError", async () => {

        const { agent, host, pool, transport } = makeMockTransport();

        pool.intercept({ method: "GET", path: RECORD_PATH }).reply(200, body);

        await assert.rejects(talkbackRateReader(transport, recordUrlOn(host))("cam1", {}),
          { constructor: ProtectProtocolError, message: "The UniFi Protect camera record did not contain a talkback sampling rate." });

        await agent.close();
      });
    }

    test("propagates a non-2xx as a classified FatalError", async () => {

      const { agent, host, pool, transport } = makeMockTransport();

      pool.intercept({ method: "GET", path: RECORD_PATH }).reply(403, { error: "forbidden" });

      await assert.rejects(talkbackRateReader(transport, recordUrlOn(host))("cam1", {}), { constructor: ProtectAuthorizationError, statusCode: 403 });

      await agent.close();
    });
  });

  describe("talkback endpoint resolver", () => {

    // Each codec's negotiation path, the answer the controller gives it, and the endpoint the resolver composes from that answer and the camera record's rate.
    const CODECS = [

      { answer: { url: "wss://internal-host:7443/ws/talkback?token=xyz789" }, audio: "aac", endpoint: (host: string): TalkbackEndpoint => ({ kind: "webSocket",
        samplingRate: 24000, url: "wss://" + host + "/proxy/protect/ws/talkback?token=xyz789" }), label: "AAC", path: "/proxy/protect/api/ws/talkback?camera=cam1" },
      { answer: { audioRemoteTrackUrl: "rtp://192.0.2.10:5004" }, audio: "opus", endpoint: (): TalkbackEndpoint => ({ host: "192.0.2.10", kind: "rtp", port: 5004,
        samplingRate: 24000 }), label: "Opus", path: "/proxy/protect/api/tcp/talkback?camera=cam1&source=ucore" }
    ] as const;

    for(const { answer, audio, endpoint, label, path } of CODECS) {

      test("an " + label + " endpoint reads the camera's rate only once its negotiation has answered, and states that rate", async () => {

        const { agent, host, pool, transport } = makeMockTransport();
        const negotiation = Promise.withResolvers<object>();
        const requests: string[] = [];

        // The negotiation's answer is held until the row releases it, so a rate read issued beside the negotiation rather than after it is seen while it waits.
        pool.intercept({ method: "GET", path }).reply(200, async (): Promise<object> => {

          requests.push("negotiation");

          return negotiation.promise;
        });
        pool.intercept({ method: "GET", path: RECORD_PATH }).reply(200, (): object => {

          requests.push("rate");

          return { id: "cam1", talkbackSettings: { samplingRate: 24000 } };
        });

        const resolving = talkbackEndpointResolver({ host, recordUrl: recordUrlOn(host), transport })({ audio, cameraId: "cam1" }, {});

        await expectAt(() => requests.length > 0, { message: "expected the negotiation to be issued" });
        await settle(10);

        assert.deepEqual(requests, ["negotiation"], "the rate is not read while the negotiation is unanswered");

        negotiation.resolve(answer);

        assert.deepEqual(await resolving, endpoint(host));
        assert.deepEqual(requests, [ "negotiation", "rate" ]);

        await agent.close();
      });

      test("aborting the caller's signal while an " + label + " endpoint's rate read is held rejects with ProtectAbortedError", { timeout: 2000 }, async () => {

        const { agent, host, pool, transport } = makeMockTransport();
        const controller = new AbortController();
        const record = Promise.withResolvers<object>();
        const requests: string[] = [];

        pool.intercept({ method: "GET", path }).reply(200, (): object => {

          requests.push("negotiation");

          return answer;
        });

        // The record's answer is held, so the read can end only through the caller's signal, and only if the resolver handed that signal to the read as well.
        pool.intercept({ method: "GET", path: RECORD_PATH }).reply(200, async (): Promise<object> => {

          requests.push("rate");

          return record.promise;
        });

        const resolving = talkbackEndpointResolver({ host, recordUrl: recordUrlOn(host), transport })({ audio, cameraId: "cam1" }, { signal: controller.signal });

        await expectAt(() => requests.includes("rate"), { message: "expected the rate read to be issued" });

        controller.abort();

        await assert.rejects(resolving, ProtectAbortedError);
        assert.deepEqual(requests, [ "negotiation", "rate" ]);

        record.resolve({ id: "cam1", talkbackSettings: { samplingRate: 24000 } });

        await agent.close();
      });
    }
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

    // A 2xx whose body parses to something other than an object holds no field to read, so every channel and the rate read refuse it as the one request's protocol
    // error before any composition reads it.
    for(const [ channel, read, endpoint ] of [

      [ "livestream", async (transport: Transport, host: string): Promise<unknown> => livestreamUrlResolver(transport, host)(new URLSearchParams(), {}),
        "/proxy/protect/api/ws/livestream" ],
      [ "talkback", async (transport: Transport, host: string): Promise<unknown> => talkbackUrlResolver(transport, host)(new URLSearchParams(), {}),
        "/proxy/protect/api/ws/talkback" ],
      [ "talkback RTP", async (transport: Transport, host: string): Promise<unknown> => talkbackRtpResolver(transport, host)("cam1", {}),
        "/proxy/protect/api/tcp/talkback" ],
      [ "talkback rate", async (transport: Transport, host: string): Promise<unknown> => talkbackRateReader(transport, recordUrlOn(host))("cam1", {}),
        RECORD_PATH ]
    ] as const) {

      for(const body of [ "null", "[]", "5004", "\"rtp://192.0.2.10:5004\"" ]) {

        test("a " + channel + " answer whose body parses to " + body + " rejects with a ProtectProtocolError", async () => {

          const { agent, host, pool, transport } = makeMockTransport();

          pool.intercept({ method: "GET", path: (path) => path.startsWith(endpoint) }).reply(200, body);

          await assert.rejects(read(transport, host),
            { constructor: ProtectProtocolError, message: "The UniFi Protect controller answered with a JSON document that is not an object." });

          await agent.close();
        });
      }
    }

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
