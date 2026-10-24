/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * http.test.ts: Unit tests for the HTTP transport - the send/request surface, ProtectResponse decoding, ensureOk classification and the responseOk 2xx test,
 * transport-error classification (timeout vs caller-abort vs network), the auth-header hook and 401-relogin retry, the full throttle circuit-breaker FSM
 * (closed -> open -> half-open -> closed), the diagnostics-channel publishes for request start/end and throttle entered/exited, dispatcher-ownership semantics for
 * an injected versus an owned pool, the owned pool's handling of the statuses it retries, and the on/once/stream event-rail surface.
 *
 * Every path is driven deterministically: an undici MockAgent injects responses and failures without a live controller, a fake Clock advances breaker time
 * without real-time waits, and the rows that need a real connection open a loopback server of their own. The injected dispatcher and clock let these tests
 * assert the transport's throttle breaker and its 401-relogin retry exactly and without flakiness. The injected rows bypass the status-code retry interceptor,
 * which is composed only onto a pool the transport builds itself; the owned-pool describe covers it against a loopback peer.
 */
import type { HttpRequestEndPayload, HttpRequestStartPayload } from "../diagnostics.ts";
import { PROTECT_API_ERROR_LIMIT, PROTECT_API_RETRY_INTERVAL } from "../settings.ts";
import { Pool, errors } from "undici";
import { ProtectAbortedError, ProtectAuthError, ProtectAuthorizationError, ProtectNetworkError, ProtectProtocolError, ProtectRequestError, ProtectThrottledError,
  ProtectTimeoutError } from "../errors.ts";
import { Transport, responseOk } from "./http.ts";
import { capturingLog, expectAt, settlement } from "../testing.helpers.ts";
import { channels, subscribeToChannel } from "../diagnostics.ts";
import { describe, test } from "node:test";
import { makeMockTransport, url } from "./mock-controller.helpers.ts";
import type { AddressInfo } from "node:net";
import type { ChannelListener } from "node:diagnostics_channel";
import type { MockTransport } from "./mock-controller.helpers.ts";
import type { SendOptions } from "./http.ts";
import assert from "node:assert/strict";
import { createLoopbackHttpsPeer } from "./tls-peer.helpers.ts";
import { createServer } from "node:http";
import diagnosticsChannel from "node:diagnostics_channel";

// The breaker cooldown in milliseconds, mirroring the transport's own derivation, so the fake-clock advances line up with the gate math.
const COOLDOWN_MS = PROTECT_API_RETRY_INTERVAL * 1000;

// Drive `count` sequential failing requests through the transport against a path the caller has set up to fail. Sequential awaits are intentional - the breaker
// counts consecutive failures in order.
async function sendFailures(transport: Transport, target: string, count: number): Promise<void> {

  for(let index = 0; index < count; index++) {

    // eslint-disable-next-line no-await-in-loop
    await transport.send(target);
  }
}

// Drive `count` sequential requests that each reject, asserting every rejection against `expected`. Each request takes its options from `sendOptions`, called once
// per request, so a per-request signal is minted fresh: a deadline that lapsed on one request would answer the next before it was sent.
async function sendRejections(transport: Transport, target: string, count: number, check: { expected: object; sendOptions?: () => SendOptions }): Promise<void> {

  for(let index = 0; index < count; index++) {

    // eslint-disable-next-line no-await-in-loop
    await assert.rejects(transport.send(target, check.sendOptions?.() ?? {}), check.expected);
  }
}

// Send one request its caller cancels in flight: the reply is held open, the caller's signal aborts on the next line with the given reason (the platform's own
// when none is given), and the rejection is returned for the row to read. A probe skips the open breaker's cooldown gate, as `send` lets one.
async function sendCancelled(mock: MockTransport, options: { probe?: boolean; reason?: unknown } = {}): Promise<unknown> {

  const controller = new AbortController();

  mock.pool.intercept({ method: "GET", path: "/cancel" }).reply(200, {}).delay(2000);

  const pending = mock.transport.send(url(mock.host, "/cancel"), { signal: controller.signal, ...((options.probe !== undefined) && { probe: options.probe }) });

  controller.abort(options.reason);

  return pending.then(() => assert.fail("The cancelled request resolved."), (error: unknown) => error);
}

describe("Transport", () => {

  describe("send and ProtectResponse", () => {

    test("returns a ProtectResponse on 2xx with the parsed JSON body available", async () => {

      const { host, pool, transport } = makeMockTransport();

      pool.intercept({ method: "GET", path: "/ok" }).reply(200, { hello: "world" });

      const response = await transport.send(url(host, "/ok"));

      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.json<{ hello: string }>(), { hello: "world" });
    });

    test("exposes the raw body bytes for binary payloads", async () => {

      const { host, pool, transport } = makeMockTransport();
      const bytes = Buffer.from([ 0, 1, 2, 255 ]);

      pool.intercept({ method: "GET", path: "/bin" }).reply(200, bytes, { headers: { "content-type": "application/octet-stream" } });

      const response = await transport.send(url(host, "/bin"));

      assert.deepEqual([...response.body], [ 0, 1, 2, 255 ], "the body must be the raw bytes, untouched by JSON decoding");
    });

    test("does not throw on a non-2xx status - the status is surfaced on the response", async () => {

      const { host, pool, transport } = makeMockTransport();

      pool.intercept({ method: "GET", path: "/missing" }).reply(404, "nope");

      const response = await transport.send(url(host, "/missing"));

      assert.equal(response.statusCode, 404, "send returns the response for any status rather than throwing");
    });

    test("json throws ProtectProtocolError on a malformed body", async () => {

      const { host, pool, transport } = makeMockTransport();

      pool.intercept({ method: "GET", path: "/bad" }).reply(200, "not-json{", { headers: { "content-type": "application/json" } });

      const response = await transport.send(url(host, "/bad"));

      assert.throws(() => response.json(), ProtectProtocolError);
    });
  });

  describe("ensureOk status classification", () => {

    test("401 classifies as ProtectAuthError carrying the status", async () => {

      const { host, pool, transport } = makeMockTransport();

      pool.intercept({ method: "GET", path: "/a" }).reply(401, "denied");

      const response = await transport.send(url(host, "/a"));

      assert.throws(() => response.ensureOk(), { constructor: ProtectAuthError, statusCode: 401 });
    });

    test("403 classifies as ProtectAuthorizationError", async () => {

      const { host, pool, transport } = makeMockTransport();

      pool.intercept({ method: "GET", path: "/b" }).reply(403, "forbidden");

      const response = await transport.send(url(host, "/b"));

      assert.throws(() => response.ensureOk(), ProtectAuthorizationError);
    });

    test("other non-2xx classify as ProtectRequestError carrying status, body, and headers", async () => {

      const { host, pool, transport } = makeMockTransport();

      pool.intercept({ method: "GET", path: "/c" }).reply(500, "boom", { headers: { "x-trace": "abc" } });

      const response = await transport.send(url(host, "/c"));

      let thrown: unknown;

      try {

        response.ensureOk();
      } catch(error) {

        thrown = error;
      }

      assert.ok(thrown instanceof ProtectRequestError);
      assert.equal(thrown.statusCode, 500);
      assert.equal(thrown.message, "The UniFi Protect controller answered the request with HTTP status 500.");
      assert.equal(thrown.body, "boom");
      assert.equal(thrown.headers?.["x-trace"], "abc");
    });

    test("a non-2xx with an empty body classifies as ProtectRequestError carrying no body", async () => {

      const { host, pool, transport } = makeMockTransport();

      pool.intercept({ method: "GET", path: "/e" }).reply(500, "");

      const response = await transport.send(url(host, "/e"));

      let thrown: unknown;

      try {

        response.ensureOk();
      } catch(error) {

        thrown = error;
      }

      // An empty answer carries nothing a consumer could read, so the error reports no body rather than an empty string.
      assert.ok(thrown instanceof ProtectRequestError);
      assert.equal(thrown.statusCode, 500);
      assert.equal(thrown.body, undefined);
    });

    test("ensureOk returns the response unchanged on 2xx", async () => {

      const { host, pool, transport } = makeMockTransport();

      pool.intercept({ method: "GET", path: "/ok" }).reply(200, {});

      const response = await transport.send(url(host, "/ok"));

      assert.equal(response.ensureOk(), response, "ensureOk must return the same instance so calls can chain");
    });
  });

  describe("responseOk", () => {

    test("reads exactly the 2xx range as success, its boundaries included", () => {

      assert.deepEqual([ 199, 200, 299, 300 ].map((statusCode) => responseOk(statusCode)), [ false, true, true, false ]);
    });
  });

  describe("request - the JSON sugar over send", () => {

    test("parses the JSON body on 2xx", async () => {

      const { host, pool, transport } = makeMockTransport();

      pool.intercept({ method: "GET", path: "/j" }).reply(200, { value: 5 });

      assert.deepEqual(await transport.request<{ value: number }>(url(host, "/j")), { value: 5 });
    });

    test("throws the classified error on a non-2xx", async () => {

      const { host, pool, transport } = makeMockTransport();

      pool.intercept({ method: "GET", path: "/j" }).reply(404, "missing");

      await assert.rejects(transport.request(url(host, "/j")), ProtectRequestError);
    });
  });

  describe("auth-header hook and 401 relogin", () => {

    test("stamps the auth headers from getAuthHeaders onto every request", async () => {

      const { host, pool, transport } = makeMockTransport({ getAuthHeaders: () => ({ cookie: "session=x", "x-csrf-token": "tok" }) });

      // The interceptor only matches when both auth headers are present, so a successful parse proves they were stamped.
      pool.intercept({ headers: { cookie: "session=x", "x-csrf-token": "tok" }, method: "GET", path: "/secure" }).reply(200, { ok: 1 });

      assert.deepEqual(await transport.request<{ ok: number }>(url(host, "/secure")), { ok: 1 });
    });

    test("a 401 invokes onUnauthorized and retries once when relogin succeeds", async () => {

      let calls = 0;
      const { host, pool, transport } = makeMockTransport({ onUnauthorized: async () => {

        calls++;

        return true;
      } });

      pool.intercept({ method: "GET", path: "/x" }).reply(401, "stale");
      pool.intercept({ method: "GET", path: "/x" }).reply(200, { ok: 1 });

      assert.deepEqual(await transport.request<{ ok: number }>(url(host, "/x")), { ok: 1 });
      assert.equal(calls, 1, "relogin should be attempted exactly once");
    });

    test("a 401 with failed relogin surfaces the 401 response", async () => {

      let calls = 0;
      const { host, pool, transport } = makeMockTransport({ onUnauthorized: async () => {

        calls++;

        return false;
      } });

      pool.intercept({ method: "GET", path: "/x" }).reply(401, "stale");

      const response = await transport.send(url(host, "/x"));

      assert.equal(response.statusCode, 401);
      assert.equal(calls, 1);
      assert.throws(() => response.ensureOk(), ProtectAuthError);
    });

    test("a 401 that persists after a successful relogin surfaces the retried 401 without another relogin", async () => {

      let calls = 0;
      const { host, pool, transport } = makeMockTransport({ onUnauthorized: async (): Promise<boolean> => {

        calls++;

        return true;
      } });

      // The relogin succeeds yet the retry is answered 401 again, so the one retry is spent and that 401 is the answer; a further attempt would find no intercept.
      pool.intercept({ method: "GET", path: "/x" }).reply(401, "stale");
      pool.intercept({ method: "GET", path: "/x" }).reply(401, "still stale");

      const response = await transport.send(url(host, "/x"));

      assert.equal(response.statusCode, 401);
      assert.equal(calls, 1, "a request is retried after a relogin at most once");
    });

    test("authRetry false bypasses relogin entirely", async () => {

      let calls = 0;
      const { host, pool, transport } = makeMockTransport({ onUnauthorized: async () => {

        calls++;

        return true;
      } });

      pool.intercept({ method: "GET", path: "/x" }).reply(401, "stale");

      const response = await transport.send(url(host, "/x"), { authRetry: false });

      assert.equal(response.statusCode, 401);
      assert.equal(calls, 0, "the handshake escape hatch must not recurse into relogin");
    });
  });

  describe("transport-error classification", () => {

    test("a caller abort surfaces as ProtectAbortedError", async () => {

      const { host, pool, transport } = makeMockTransport();
      const controller = new AbortController();

      // Hold the response open, then abort the in-flight request via the caller's signal - the abort must classify as a caller cancel, not our timeout.
      pool.intercept({ method: "GET", path: "/x" }).reply(200, {}).delay(2000);

      const pending = transport.send(url(host, "/x"), { signal: controller.signal });

      controller.abort();

      await assert.rejects(pending, ProtectAbortedError);
    });

    test("our timeout deadline surfaces as ProtectTimeoutError", async () => {

      const { host, pool, transport } = makeMockTransport();

      pool.intercept({ method: "GET", path: "/slow" }).reply(200, {}).delay(2000);

      await assert.rejects(transport.send(url(host, "/slow"), { timeout: 20 }), ProtectTimeoutError);
    });

    test("a socket-level failure surfaces as ProtectNetworkError with the errno code", async () => {

      const { host, pool, transport } = makeMockTransport();
      const errno = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });

      pool.intercept({ method: "GET", path: "/x" }).replyWithError(errno);

      await assert.rejects(transport.send(url(host, "/x")), { code: "ECONNREFUSED", constructor: ProtectNetworkError });
    });

    test("a response that does not match the range or length the request expected surfaces as ProtectNetworkError", async () => {

      const { host, pool, transport } = makeMockTransport();
      const retryError = new errors.RequestRetryError("range mismatch", 416, {});

      // The injected dispatcher carries no retry interceptor, so the row hands the transport the error that interceptor raises for a response whose bytes it cannot
      // reconcile with the request.
      pool.intercept({ method: "GET", path: "/x" }).replyWithError(retryError);

      await assert.rejects(transport.send(url(host, "/x")), (error: unknown) => {

        assert.ok(error instanceof ProtectNetworkError);
        assert.equal(error.message, "The response from the UniFi Protect controller did not match the range or length the request expected.");
        assert.ok(Object.is(error.cause, retryError));

        return true;
      });
    });

    test("a caller abort that carries a reason surfaces as ProtectAbortedError", async () => {

      const reason = new Error("The talkback session was stopped.");
      const error = await sendCancelled(makeMockTransport(), { reason });

      // Undici rethrows a truthy reason as it is, so the reason itself is what the classifier recognizes and what the cause carries.
      assert.ok(error instanceof ProtectAbortedError);
      assert.ok(Object.is(error.cause, reason));
    });

    test("a deadline the caller supplies as its signal surfaces as ProtectAbortedError", async () => {

      const { host, pool, transport } = makeMockTransport();

      pool.intercept({ method: "GET", path: "/slow" }).reply(200, {}).delay(2000);

      await assert.rejects(transport.send(url(host, "/slow"), { signal: AbortSignal.timeout(20) }), ProtectAbortedError);
    });

    test("a failure that is no abort stays a failure though the caller aborts before it lands", async () => {

      const { host, pool, transport } = makeMockTransport();
      const controller = new AbortController();
      const errno = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });

      // The run of failures stops one short of the breaker's threshold, so the trip asserted at the end shows the late-aborted failure was booked as a failure.
      pool.intercept({ method: "GET", path: "/f" }).reply(500, "x").times(PROTECT_API_ERROR_LIMIT - 1);
      pool.intercept({ method: "GET", path: "/x" }).replyWithError(errno);

      await sendFailures(transport, url(host, "/f"), PROTECT_API_ERROR_LIMIT - 1);

      // The mock dispatcher delivers the error inside the send call and queues the rejection, so the abort on the next line lands first and causes no rejection of
      // its own: the caller's signal reads aborted by the time the failure is classified.
      const pending = transport.send(url(host, "/x"), { signal: controller.signal });

      controller.abort();

      await assert.rejects(pending, { code: "ECONNREFUSED", constructor: ProtectNetworkError });
      assert.equal(transport.isThrottled, true);
    });

    test("a deadline that fired first is ours though the caller has aborted since", async () => {

      const { host, pool, transport } = makeMockTransport();
      const controller = new AbortController();

      pool.intercept({ method: "GET", path: "/f" }).reply(500, "x").times(PROTECT_API_ERROR_LIMIT - 1);
      pool.intercept({ method: "GET", path: "/x" }).replyWithError(new DOMException("The deadline lapsed.", "TimeoutError"));

      await sendFailures(transport, url(host, "/f"), PROTECT_API_ERROR_LIMIT - 1);

      // The row above's shape with the value our own deadline throws: the caller's abort lands after it, and is not what ended the request.
      const pending = transport.send(url(host, "/x"), { signal: controller.signal });

      controller.abort();

      await assert.rejects(pending, ProtectTimeoutError);
      assert.equal(transport.isThrottled, true);
    });

    test("an in-flight cancel with a falsy reason surfaces as ProtectAbortedError on a real connection, marked cancelled", async () => {

      // A real connection pool, because the mock dispatcher reports a falsy reason as a TypeError where undici's own client substitutes its RequestAbortedError. The
      // server accepts the request and never answers, so the request stays in flight until its caller aborts it.
      const seen = Promise.withResolvers<undefined>();
      const server = createServer(() => seen.resolve(undefined));

      await new Promise<undefined>((resolve) => server.listen(0, "127.0.0.1", () => resolve(undefined)));

      const origin = "http://127.0.0.1:" + String((server.address() as AddressInfo).port);
      const dispatcher = new Pool(origin);
      const transport = new Transport({ dispatcher, host: new URL(origin).host });
      const ends: HttpRequestEndPayload[] = [];

      using endSubscription = subscribeToChannel(channels.httpRequestEnd, (payload) => void ends.push(payload));

      try {

        const controller = new AbortController();
        const pending = transport.send(origin + "/x", { signal: controller.signal });

        await seen.promise;
        controller.abort("");

        await assert.rejects(pending, (error: unknown) => {

          assert.ok(error instanceof ProtectAbortedError);
          assert.ok(error.cause instanceof errors.RequestAbortedError);

          return true;
        });

        // The same reading drives the booking and the marker, so the marker shows the falsy reason was read as the caller's cancel and not booked.
        assert.equal(ends.at(-1)?.cancelled, true);
      } finally {

        await dispatcher.close();
        server.closeAllConnections();
        await new Promise<undefined>((resolve) => server.close(() => resolve(undefined)));
      }
    });
  });

  describe("throttle circuit breaker", () => {

    test("trips after the consecutive-failure threshold, then refuses without dispatching", async () => {

      let entered = 0;
      const { host, pool, transport } = makeMockTransport();

      using enteredSubscription = transport.on("throttleEntered", () => entered++);

      pool.intercept({ method: "GET", path: "/f" }).reply(500, "x").times(PROTECT_API_ERROR_LIMIT);

      await sendFailures(transport, url(host, "/f"), PROTECT_API_ERROR_LIMIT);

      assert.equal(transport.isThrottled, true, "the breaker should be open after the threshold is crossed");
      assert.equal(entered, 1, "throttleEntered should fire exactly once on the trip");

      // The next request is refused locally - no interceptor is consumed because no request reaches the network.
      await assert.rejects(transport.send(url(host, "/f")), ProtectThrottledError);
    });

    test("the thrown ProtectThrottledError carries the remaining cooldown", async () => {

      const { clock, host, pool, transport } = makeMockTransport();

      pool.intercept({ method: "GET", path: "/f" }).reply(500, "x").times(PROTECT_API_ERROR_LIMIT);

      await sendFailures(transport, url(host, "/f"), PROTECT_API_ERROR_LIMIT);
      clock.advance(1000);

      await assert.rejects(transport.send(url(host, "/f")), { constructor: ProtectThrottledError, cooldownMs: COOLDOWN_MS - 1000 });
    });

    test("a successful half-open probe after cooldown closes the breaker and emits throttleExited", async () => {

      let exited = 0;
      const { clock, host, pool, transport } = makeMockTransport();

      using exitedSubscription = transport.on("throttleExited", () => exited++);

      pool.intercept({ method: "GET", path: "/f" }).reply(500, "x").times(PROTECT_API_ERROR_LIMIT);
      pool.intercept({ method: "GET", path: "/f" }).reply(200, { recovered: true });

      await sendFailures(transport, url(host, "/f"), PROTECT_API_ERROR_LIMIT);
      clock.advance(COOLDOWN_MS);

      const response = await transport.send(url(host, "/f"));

      assert.equal(response.statusCode, 200);
      assert.equal(transport.isThrottled, false, "a successful probe must close the breaker");
      assert.equal(exited, 1, "throttleExited fires once, on the closing edge");
    });

    test("a failed half-open probe re-arms the cooldown without re-emitting throttleEntered", async () => {

      let entered = 0;
      let exited = 0;
      const { clock, host, pool, transport } = makeMockTransport();

      using enteredSubscription = transport.on("throttleEntered", () => entered++);
      using exitedSubscription = transport.on("throttleExited", () => exited++);

      pool.intercept({ method: "GET", path: "/f" }).reply(500, "x").times(PROTECT_API_ERROR_LIMIT + 1);

      await sendFailures(transport, url(host, "/f"), PROTECT_API_ERROR_LIMIT);
      clock.advance(COOLDOWN_MS);

      // The probe fails - the breaker stays open, re-armed from now.
      const probe = await transport.send(url(host, "/f"));

      assert.equal(probe.statusCode, 500);
      assert.equal(transport.isThrottled, true, "a failed probe leaves the breaker open");
      assert.equal(entered, 1, "throttleEntered must not fire again - the consumer's view is that we were throttled throughout");
      assert.equal(exited, 0, "throttleExited must not fire on a failed probe");

      // The cooldown re-armed from the probe, so the very next request is refused again.
      await assert.rejects(transport.send(url(host, "/f")), ProtectThrottledError);
    });

    test("a probe send bypasses the open cooldown gate, and a successful probe closes the breaker", async () => {

      let exited = 0;
      const { clock, host, pool, transport } = makeMockTransport();

      using exitedSubscription = transport.on("throttleExited", () => exited++);

      pool.intercept({ method: "GET", path: "/f" }).reply(500, "x").times(PROTECT_API_ERROR_LIMIT);
      pool.intercept({ method: "GET", path: "/f" }).reply(200, { recovered: true });

      await sendFailures(transport, url(host, "/f"), PROTECT_API_ERROR_LIMIT);
      assert.equal(transport.isThrottled, true);

      // Still deep inside the cooldown: a normal send is refused locally, but a probe - the ConnectionMonitor's recovery trial - dispatches anyway, so the monitor's
      // backoff curve (not the breaker's cooldown) paces re-probing. The probe takes the same booking the autonomous half-open trial would, only earlier.
      clock.advance(1000);

      await assert.rejects(transport.send(url(host, "/f")), ProtectThrottledError);

      const probe = await transport.send(url(host, "/f"), { probe: true });

      assert.equal(probe.statusCode, 200);
      assert.equal(transport.isThrottled, false, "a successful probe closes the breaker even mid-cooldown");
      assert.equal(exited, 1, "throttleExited fires once, on the probe's closing edge");
    });

    test("a failed probe mid-cooldown re-arms the breaker without flapping the rails", async () => {

      let entered = 0;
      let exited = 0;
      const { clock, host, pool, transport } = makeMockTransport();

      using enteredSubscription = transport.on("throttleEntered", () => entered++);
      using exitedSubscription = transport.on("throttleExited", () => exited++);

      pool.intercept({ method: "GET", path: "/f" }).reply(500, "x").times(PROTECT_API_ERROR_LIMIT + 1);

      await sendFailures(transport, url(host, "/f"), PROTECT_API_ERROR_LIMIT);
      clock.advance(1000);

      // A failed probe takes exactly the failed-half-open booking: the breaker stays open, re-armed from now, with no rail churn - so the consumer's "throttled
      // throughout" view holds, so the probe shares the breaker's existing rail logic.
      const probe = await transport.send(url(host, "/f"), { probe: true });

      assert.equal(probe.statusCode, 500);
      assert.equal(transport.isThrottled, true, "a failed probe leaves the breaker open");
      assert.equal(entered, 1, "throttleEntered does not fire again on a failed probe");
      assert.equal(exited, 0, "throttleExited does not fire on a failed probe");

      // At the trip's own deadline the re-armed cooldown still has the probe's offset to run, so the next send is turned away rather than dispatched.
      clock.advance(COOLDOWN_MS - 1000);
      await assert.rejects(transport.send(url(host, "/f")), { constructor: ProtectThrottledError, cooldownMs: 1000 });
    });

    test("logs the trip at error level and the recovery at info level", async () => {

      const log = capturingLog();
      const { clock, host, pool, transport } = makeMockTransport({ log });

      pool.intercept({ method: "GET", path: "/f" }).reply(500, "x").times(PROTECT_API_ERROR_LIMIT);
      pool.intercept({ method: "GET", path: "/f" }).reply(200, {});

      await sendFailures(transport, url(host, "/f"), PROTECT_API_ERROR_LIMIT);

      assert.ok(log.entries.some((entry) => (entry.level === "error") && entry.message.includes("Throttling")), "the trip should log at error level");

      clock.advance(COOLDOWN_MS);
      await transport.send(url(host, "/f"));

      assert.ok(log.entries.some((entry) => (entry.level === "info") && entry.message.includes("Resumed")), "the recovery should log at info level");
    });

    test("a request its caller cancels neither counts toward the breaker nor resets it", async () => {

      const mock = makeMockTransport();
      const { host, pool, transport } = mock;

      pool.intercept({ method: "GET", path: "/f" }).reply(500, "x").times(PROTECT_API_ERROR_LIMIT);

      await sendFailures(transport, url(host, "/f"), PROTECT_API_ERROR_LIMIT - 1);
      await sendCancelled(mock);

      // A cancel that booked a failure would have tripped the breaker here, and one that booked a success would leave the next failure short of the threshold.
      assert.equal(transport.isThrottled, false);

      await transport.send(url(host, "/f"));

      assert.equal(transport.isThrottled, true);
    });

    test("a cancel that carries a reason books no outcome", async () => {

      const mock = makeMockTransport();
      const { host, pool, transport } = mock;

      pool.intercept({ method: "GET", path: "/f" }).reply(500, "x").times(PROTECT_API_ERROR_LIMIT);

      await sendFailures(transport, url(host, "/f"), PROTECT_API_ERROR_LIMIT - 1);
      await sendCancelled(mock, { reason: new Error("The talkback session was stopped.") });

      assert.equal(transport.isThrottled, false);

      await transport.send(url(host, "/f"));

      assert.equal(transport.isThrottled, true);
    });

    test("a transport failure that is no cancellation books: a run of network errors trips the breaker", async () => {

      const { host, pool, transport } = makeMockTransport();
      const errno = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });

      pool.intercept({ method: "GET", path: "/x" }).replyWithError(errno).times(PROTECT_API_ERROR_LIMIT);

      await sendRejections(transport, url(host, "/x"), PROTECT_API_ERROR_LIMIT, { expected: { code: "ECONNREFUSED", constructor: ProtectNetworkError } });

      assert.equal(transport.isThrottled, true);
    });

    test("a cancelled half-open trial leaves the breaker as it found it", async () => {

      let exited = 0;
      const mock = makeMockTransport();
      const { clock, host, pool, transport } = mock;

      using exitedSubscription = transport.on("throttleExited", () => exited++);

      pool.intercept({ method: "GET", path: "/f" }).reply(500, "x").times(PROTECT_API_ERROR_LIMIT);
      pool.intercept({ method: "GET", path: "/f" }).reply(200, { recovered: true });

      await sendFailures(transport, url(host, "/f"), PROTECT_API_ERROR_LIMIT);
      clock.advance(COOLDOWN_MS);
      await sendCancelled(mock);

      assert.equal(transport.isThrottled, true);

      // A cancelled trial that booked a failure would have re-armed the cooldown and refused this request. The breaker is still half-open, so this is the trial.
      const response = await transport.send(url(host, "/f"));

      assert.equal(response.statusCode, 200);
      assert.equal(transport.isThrottled, false);
      assert.equal(exited, 1);
    });

    test("a cancelled probe mid-cooldown does not re-arm the breaker", async () => {

      const mock = makeMockTransport();
      const { clock, host, pool, transport } = mock;

      pool.intercept({ method: "GET", path: "/f" }).reply(500, "x").times(PROTECT_API_ERROR_LIMIT);
      pool.intercept({ method: "GET", path: "/f" }).reply(200, { recovered: true });

      await sendFailures(transport, url(host, "/f"), PROTECT_API_ERROR_LIMIT);
      clock.advance(COOLDOWN_MS / 2);
      await sendCancelled(mock, { probe: true });

      assert.equal(transport.isThrottled, true);

      // The cooldown still runs from the trip, so it has elapsed once the other half passes. A cancelled probe that booked a failure would have re-armed it midway.
      clock.advance(COOLDOWN_MS / 2);

      const response = await transport.send(url(host, "/f"));

      assert.equal(response.statusCode, 200);
    });

    test("our own deadline books though the caller's signal is live", async () => {

      const { host, pool, transport } = makeMockTransport();
      const controller = new AbortController();

      pool.intercept({ method: "GET", path: "/slow" }).reply(200, {}).delay(2000).times(PROTECT_API_ERROR_LIMIT);

      await sendRejections(transport, url(host, "/slow"), PROTECT_API_ERROR_LIMIT,
        { expected: ProtectTimeoutError, sendOptions: () => ({ signal: controller.signal, timeout: 20 }) });

      assert.equal(transport.isThrottled, true);
    });

    test("a deadline the caller supplies books when it lapses in flight", async () => {

      const { host, pool, transport } = makeMockTransport();

      pool.intercept({ method: "GET", path: "/slow" }).reply(200, {}).delay(2000).times(PROTECT_API_ERROR_LIMIT);

      // Each request takes a deadline of its own that lapses while the request is held open, the shape of a consumer's deadline over a slow controller.
      await sendRejections(transport, url(host, "/slow"), PROTECT_API_ERROR_LIMIT,
        { expected: ProtectAbortedError, sendOptions: () => ({ signal: AbortSignal.timeout(20) }) });

      assert.equal(transport.isThrottled, true);
    });

    test("a request whose caller had already aborted is never issued and books nothing", async () => {

      const starts: HttpRequestStartPayload[] = [];
      const ends: HttpRequestEndPayload[] = [];
      const causedBy = (reason: unknown): ((error: unknown) => boolean) => (error: unknown): boolean => (error instanceof ProtectAbortedError) &&
        Object.is(error.cause, reason);
      const { host, pool, transport } = makeMockTransport();

      pool.intercept({ method: "GET", path: "/f" }).reply(500, "x").times(PROTECT_API_ERROR_LIMIT);

      await sendFailures(transport, url(host, "/f"), PROTECT_API_ERROR_LIMIT - 1);

      using startSubscription = subscribeToChannel(channels.httpRequestStart, (payload) => void starts.push(payload));
      using endSubscription = subscribeToChannel(channels.httpRequestEnd, (payload) => void ends.push(payload));

      // No reply is intercepted for this path, so a request that reached the dispatcher would fail there, publish its start and end diagnostics, and book.
      const aborted = AbortSignal.abort();
      const lapsed = AbortSignal.abort(new DOMException("The deadline lapsed.", "TimeoutError"));

      await assert.rejects(transport.send(url(host, "/never"), { signal: aborted }), causedBy(aborted.reason));
      await assert.rejects(transport.send(url(host, "/never"), { signal: lapsed }), causedBy(lapsed.reason));

      assert.equal(starts.length, 0);
      assert.equal(ends.length, 0);
      assert.equal(transport.isThrottled, false);

      await transport.send(url(host, "/f"));

      assert.equal(transport.isThrottled, true);
    });
  });

  describe("diagnostics channels", () => {

    test("publishes request start and end with a correlating requestId", async () => {

      const starts: unknown[] = [];
      const ends: unknown[] = [];
      const onStart: ChannelListener = (message) => void starts.push(message);
      const onEnd: ChannelListener = (message) => void ends.push(message);

      // The row subscribes by the channels' published names rather than through the typed channels, because the names are public contract a consumer subscribes by,
      // and this row is what holds them.
      diagnosticsChannel.subscribe("unifi-protect:http:request:start", onStart);
      diagnosticsChannel.subscribe("unifi-protect:http:request:end", onEnd);

      let configuredHost = "";

      try {

        const { host, pool, transport } = makeMockTransport();

        configuredHost = host;
        pool.intercept({ method: "GET", path: "/d" }).reply(200, {});

        await transport.send(url(host, "/d"));
      } finally {

        diagnosticsChannel.unsubscribe("unifi-protect:http:request:start", onStart);
        diagnosticsChannel.unsubscribe("unifi-protect:http:request:end", onEnd);
      }

      const [start] = starts;
      const [end] = ends;

      // Each payload is narrowed by the fields the row reads before it reads them, so a payload missing one fails here rather than comparing undefined.
      assert.equal(starts.length, 1);
      assert.ok((typeof start === "object") && (start !== null) && ("host" in start) && ("method" in start) && ("requestId" in start));
      assert.equal(start.method, "GET");
      assert.equal(start.host, configuredHost, "the start payload carries the configured controller host verbatim");
      assert.equal(ends.length, 1);
      assert.ok((typeof end === "object") && (end !== null) && ("host" in end) && ("requestId" in end) && ("statusCode" in end));
      assert.equal(end.statusCode, 200);
      assert.equal(end.host, configuredHost, "the end payload carries the configured controller host verbatim");
      assert.equal(start.requestId, end.requestId, "start and end must share the requestId");
    });

    test("stamps the controller host on the end payload even when the request fails at the transport level", async () => {

      const ends: HttpRequestEndPayload[] = [];

      using endSubscription = subscribeToChannel(channels.httpRequestEnd, (payload) => void ends.push(payload));

      const { host, pool, transport } = makeMockTransport();
      const errno = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });

      pool.intercept({ method: "GET", path: "/x" }).replyWithError(errno);

      await assert.rejects(transport.send(url(host, "/x")), ProtectNetworkError);

      assert.equal(ends.length, 1);
      assert.equal(ends[0]?.host, host, "the failure-path end payload still carries the configured controller host");
      assert.equal(ends[0].statusCode, undefined, "a transport-level failure carries no status code");
      assert.ok((ends[0].error ?? "").length > 0, "a transport-level failure carries an error message");
    });

    test("marks a cancelled request on the end payload and no other", async () => {

      const ends: HttpRequestEndPayload[] = [];

      using endSubscription = subscribeToChannel(channels.httpRequestEnd, (payload) => void ends.push(payload));

      const mock = makeMockTransport();
      const { host, pool, transport } = mock;
      const controller = new AbortController();

      await sendCancelled(mock);

      // A deadline of ours that fired before the caller aborted is our timeout, not the caller's cancel.
      pool.intercept({ method: "GET", path: "/x" }).replyWithError(new DOMException("The deadline lapsed.", "TimeoutError"));

      const pending = transport.send(url(host, "/x"), { signal: controller.signal });

      controller.abort();

      await assert.rejects(pending, ProtectTimeoutError);

      // A deadline the caller supplied that lapses in flight is a controller that did not answer in time, not a cancel.
      pool.intercept({ method: "GET", path: "/slow" }).reply(200, {}).delay(2000);

      await assert.rejects(transport.send(url(host, "/slow"), { signal: AbortSignal.timeout(20) }), ProtectAbortedError);

      const [ cancelled, ours, lapsed ] = ends;

      assert.equal(ends.length, 3);
      assert.equal(cancelled?.cancelled, true);
      assert.equal(Object.hasOwn(ours ?? {}, "cancelled"), false);
      assert.equal(Object.hasOwn(lapsed ?? {}, "cancelled"), false);
    });

    test("publishes throttle entered and exited around the breaker lifecycle", async () => {

      const entered: unknown[] = [];
      let exitedCount = 0;
      const onEntered: ChannelListener = (message) => void entered.push(message);
      const onExited = (): void => {

        exitedCount++;
      };

      // The row subscribes by the channels' published names rather than through the typed channels, because the names are public contract a consumer subscribes by,
      // and this row is what holds them; the entered payload is compared whole, so nothing is read through a cast.
      diagnosticsChannel.subscribe("unifi-protect:http:throttle:entered", onEntered);
      diagnosticsChannel.subscribe("unifi-protect:http:throttle:exited", onExited);

      try {

        const { clock, host, pool, transport } = makeMockTransport();

        pool.intercept({ method: "GET", path: "/f" }).reply(500, "x").times(PROTECT_API_ERROR_LIMIT);
        pool.intercept({ method: "GET", path: "/f" }).reply(200, {});

        await sendFailures(transport, url(host, "/f"), PROTECT_API_ERROR_LIMIT);
        clock.advance(COOLDOWN_MS);
        await transport.send(url(host, "/f"));
      } finally {

        diagnosticsChannel.unsubscribe("unifi-protect:http:throttle:entered", onEntered);
        diagnosticsChannel.unsubscribe("unifi-protect:http:throttle:exited", onExited);
      }

      assert.deepEqual(entered, [{ consecutiveFailures: PROTECT_API_ERROR_LIMIT, cooldownMs: COOLDOWN_MS }]);
      assert.equal(exitedCount, 1);
    });
  });

  describe("dispatcher ownership", () => {

    test("reset is a no-op on an injected dispatcher - the dispatcher keeps working", async () => {

      const { host, pool, transport } = makeMockTransport();

      transport.reset();

      pool.intercept({ method: "GET", path: "/x" }).reply(200, { ok: 1 });

      assert.deepEqual(await transport.request<{ ok: number }>(url(host, "/x")), { ok: 1 }, "an injected dispatcher must survive reset()");
    });

    test("asyncDispose resolves without destroying an injected dispatcher", async () => {

      const { host, pool, transport } = makeMockTransport();

      await assert.doesNotReject(transport[Symbol.asyncDispose]());

      // The injected dispatcher's lifecycle belongs to the injector, so it still serves a request after the transport is disposed.
      pool.intercept({ method: "GET", path: "/x" }).reply(200, { ok: 1 });

      assert.deepEqual(await transport.request<{ ok: number }>(url(host, "/x")), { ok: 1 }, "an injected dispatcher must survive asyncDispose");
    });

    test("owns and rebuilds its pool when no dispatcher is injected", async () => {

      // No dispatcher injected, so the transport builds (and owns) a real undici pool - exercising the retry-interceptor construction. A first request opens a
      // keepalive connection to a loopback peer; reset() destroys that pool, closing the connection, and builds the fresh one the next request goes through, and
      // asyncDispose tears it down. The peer is disposed after the transport, so the pool has released its connection by the time the server stops listening.
      await using peer = await createLoopbackHttpsPeer();
      const transport = new Transport({ host: peer.host });

      assert.equal(transport.isThrottled, false);
      assert.equal((await transport.send(url(peer.host, "/ok"))).statusCode, 200);

      const connection = await peer.connection(0);

      assert.doesNotThrow(() => transport.reset(), "reset must rebuild the owned pool without throwing");

      // The discarded pool's idle keepalive connection would outlast this bounded wait unless reset() destroyed the pool holding it.
      await expectAt(settlement(connection.closed), { message: "reset must destroy the pool it replaces, closing its connection" });
      assert.equal((await transport.send(url(peer.host, "/ok"))).statusCode, 200, "the rebuilt pool serves the next request");

      await assert.doesNotReject(transport[Symbol.asyncDispose]());
    });
  });

  describe("certificate verification", () => {

    test("accepts the certificate a controller presents when strict verification is not asked for", async () => {

      // The peer is disposed after the transport, so the pool has released its keepalive connection by the time the server stops listening.
      await using peer = await createLoopbackHttpsPeer();
      await using transport = new Transport({ host: peer.host });

      const response = await transport.send(url(peer.host, "/ok"));

      assert.equal(response.statusCode, 200, "the default must reach a controller presenting its own self-signed certificate");
    });

    test("refuses a certificate that does not verify when strict verification is asked for", async () => {

      await using peer = await createLoopbackHttpsPeer();
      await using transport = new Transport({ host: peer.host, verifyTls: true });

      /* The same peer and the same request as above, one option apart. A handshake the client will not complete is a connect-phase failure, which the transport
       * classifies as the reachability fault it is, and the errno lifted from the cause chain is what says the refusal was about the certificate rather than about
       * reaching the host at all.
       */
      await assert.rejects(async () => transport.send(url(peer.host, "/ok")), (error: unknown) => {

        assert.ok(error instanceof ProtectNetworkError);
        assert.equal(error.code, "DEPTH_ZERO_SELF_SIGNED_CERT");

        return true;
      });
    });

    test("a rebuilt pool keeps the posture the transport was constructed with", async () => {

      // reset() discards the owned pool and builds a fresh one, which is the one lifecycle boundary that could silently drop the certificate posture and leave a
      // strict transport trusting anything from its next request onward.
      await using peer = await createLoopbackHttpsPeer();
      await using transport = new Transport({ host: peer.host, verifyTls: true });

      transport.reset();

      await assert.rejects(async () => transport.send(url(peer.host, "/ok")), (error: unknown) => {

        assert.ok(error instanceof ProtectNetworkError);
        assert.equal(error.code, "DEPTH_ZERO_SELF_SIGNED_CERT");

        return true;
      });
    });
  });

  describe("owned pool and the retried statuses", () => {

    test("a PATCH answered 404 returns the 404 response with its body after one request", async () => {

      // PATCH is held out of the retried verbs, so the interceptor hands the first answer straight back and send returns it for ensureOk to classify.
      await using peer = await createLoopbackHttpsPeer({ respond: () => ({ body: "{\"error\":\"missing\"}", status: 404 }) });
      await using transport = new Transport({ host: peer.host });

      const response = await transport.send(url(peer.host, "/missing"), { method: "PATCH" });

      assert.equal(response.statusCode, 404);
      assert.equal(response.text(), "{\"error\":\"missing\"}");
      assert.equal(peer.requests, 1);
    });

    test("a GET answered 503 on every attempt returns the last 503 response with its body after six requests", async () => {

      /* The interceptor retries five times after the first attempt and then hands the controller's last answer back. Its backoff waits run in real time and come to
       * most of the default request deadline, which leaves little margin on a loaded machine, so this row gives the request a deadline of its own.
       */
      await using peer = await createLoopbackHttpsPeer({ respond: () => ({ body: "{\"error\":\"starting\"}", status: 503 }) });
      await using transport = new Transport({ host: peer.host });

      const response = await transport.send(url(peer.host, "/busy"), { timeout: 10000 });

      assert.equal(response.statusCode, 503);
      assert.equal(response.text(), "{\"error\":\"starting\"}");
      assert.equal(peer.requests, 6);
      assert.throws(() => response.ensureOk(), { constructor: ProtectRequestError, statusCode: 503 });
    });

    test("a GET answered 503 twice and then 200 returns the 200 after three requests", async () => {

      await using peer = await createLoopbackHttpsPeer({ respond: (request) => ((request <= 2) ? { body: "{}", status: 503 } : { body: "{\"ok\":true}", status: 200 }) });
      await using transport = new Transport({ host: peer.host });

      const response = await transport.send(url(peer.host, "/recovering"));

      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.json<{ ok: boolean }>(), { ok: true });
      assert.equal(peer.requests, 3);
    });
  });

  describe("event rails", () => {

    test("text decodes the body as a UTF-8 string", async () => {

      const { host, pool, transport } = makeMockTransport();

      pool.intercept({ method: "GET", path: "/t" }).reply(200, "plain text");

      const response = await transport.send(url(host, "/t"));

      assert.equal(response.text(), "plain text");
    });

    test("once resolves when the matching event is emitted", async () => {

      const { host, pool, transport } = makeMockTransport();
      const pending = transport.once("throttleEntered");

      pool.intercept({ method: "GET", path: "/f" }).reply(500, "x").times(PROTECT_API_ERROR_LIMIT);

      await sendFailures(transport, url(host, "/f"), PROTECT_API_ERROR_LIMIT);

      await assert.doesNotReject(pending, "the throttle trip should resolve the pending once()");
    });

    test("stream yields the emitted events until aborted", async () => {

      const { host, pool, transport } = makeMockTransport();
      const controller = new AbortController();
      let received = 0;

      const collector = (async (): Promise<void> => {

        try {

          for await (const _entered of transport.stream("throttleEntered", { signal: controller.signal })) {

            received++;
            controller.abort();
          }
        } catch(error) {

          if((error as Error).name !== "AbortError") {

            throw error;
          }
        }
      })();

      pool.intercept({ method: "GET", path: "/f" }).reply(500, "x").times(PROTECT_API_ERROR_LIMIT);

      await sendFailures(transport, url(host, "/f"), PROTECT_API_ERROR_LIMIT);
      await collector;

      assert.equal(received, 1, "the stream should surface the throttle trip");
    });
  });
});
