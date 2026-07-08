/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * http.test.ts: Unit tests for the HTTP transport - the send/request surface, ProtectResponse decoding and ensureOk classification, transport-error classification
 * (timeout vs caller-abort vs network), the auth-header seam and 401-relogin retry, and the full throttle circuit-breaker FSM (closed -> open -> half-open -> closed).
 *
 * Every path is driven deterministically: an undici MockAgent injects responses and failures without a live controller, and a fake Clock advances breaker time
 * without real-time waits. The injected dispatcher and clock let these tests pin the controller's throttle and retry behavior - the established behavioral contract -
 * exactly and without flakiness.
 */
import { PROTECT_API_ERROR_LIMIT, PROTECT_API_RETRY_INTERVAL } from "../settings.ts";
import { ProtectAbortedError, ProtectAuthError, ProtectAuthorizationError, ProtectNetworkError, ProtectProtocolError, ProtectRequestError, ProtectThrottledError,
  ProtectTimeoutError } from "../errors.ts";
import { describe, test } from "node:test";
import { makeMockTransport, url } from "./mock-controller.helpers.ts";
import { Transport } from "./http.ts";
import assert from "node:assert/strict";
import { capturingLog } from "../testing.helpers.ts";
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

      assert.throws(() => response.ensureOk(), (error: unknown) => (error instanceof ProtectAuthError) && (error.statusCode === 401));
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
      assert.equal(thrown.body, "boom");
      assert.equal(thrown.headers?.["x-trace"], "abc");
    });

    test("ensureOk returns the response unchanged on 2xx", async () => {

      const { host, pool, transport } = makeMockTransport();

      pool.intercept({ method: "GET", path: "/ok" }).reply(200, {});

      const response = await transport.send(url(host, "/ok"));

      assert.equal(response.ensureOk(), response, "ensureOk must return the same instance so calls can chain");
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

  describe("auth-header seam and 401 relogin", () => {

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

      await assert.rejects(transport.send(url(host, "/x")), (error: unknown) => (error instanceof ProtectNetworkError) && (error.code === "ECONNREFUSED"));
    });
  });

  describe("throttle circuit breaker", () => {

    test("trips after the consecutive-failure threshold, then refuses without dispatching", async () => {

      let entered = 0;
      const { host, pool, transport } = makeMockTransport();

      using _enteredSub = transport.on("throttleEntered", () => entered++);

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

      await assert.rejects(transport.send(url(host, "/f")), (error: unknown) => (error instanceof ProtectThrottledError) && (error.cooldownMs === COOLDOWN_MS - 1000));
    });

    test("a successful half-open probe after cooldown closes the breaker and emits throttleExited", async () => {

      let exited = 0;
      const { clock, host, pool, transport } = makeMockTransport();

      using _exitedSub = transport.on("throttleExited", () => exited++);

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

      using _enteredSub = transport.on("throttleEntered", () => entered++);
      using _exitedSub = transport.on("throttleExited", () => exited++);

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

      using _exitedSub = transport.on("throttleExited", () => exited++);

      pool.intercept({ method: "GET", path: "/f" }).reply(500, "x").times(PROTECT_API_ERROR_LIMIT);
      pool.intercept({ method: "GET", path: "/f" }).reply(200, { recovered: true });

      await sendFailures(transport, url(host, "/f"), PROTECT_API_ERROR_LIMIT);
      assert.equal(transport.isThrottled, true);

      // Still deep inside the cooldown: a normal send is refused locally, but a probe - the ConnectionMonitor's recovery trial - dispatches anyway, so the monitor's
      // backoff curve (not the breaker's 300s cooldown) paces re-probing. This is the unification: the same booking that the autonomous half-open trial would take,
      // reached early by the monitor.
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

      using _enteredSub = transport.on("throttleEntered", () => entered++);
      using _exitedSub = transport.on("throttleExited", () => exited++);

      pool.intercept({ method: "GET", path: "/f" }).reply(500, "x").times(PROTECT_API_ERROR_LIMIT + 1);

      await sendFailures(transport, url(host, "/f"), PROTECT_API_ERROR_LIMIT);
      clock.advance(1000);

      // A failed probe takes exactly the failed-half-open booking: the breaker stays open, re-armed from now, with no rail churn - so the consumer's "throttled
      // throughout" view holds. This is why the probe needs no new rail logic.
      const probe = await transport.send(url(host, "/f"), { probe: true });

      assert.equal(probe.statusCode, 500);
      assert.equal(transport.isThrottled, true, "a failed probe leaves the breaker open");
      assert.equal(entered, 1, "throttleEntered does not fire again on a failed probe");
      assert.equal(exited, 0, "throttleExited does not fire on a failed probe");
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
  });

  describe("diagnostics channels", () => {

    test("publishes request start and end with a correlating requestId", async () => {

      const starts: { method: string; requestId: string; url: string }[] = [];
      const ends: { requestId: string; statusCode?: number }[] = [];
      const onStart = (message: unknown): void => void starts.push(message as { method: string; requestId: string; url: string });
      const onEnd = (message: unknown): void => void ends.push(message as { requestId: string; statusCode?: number });

      diagnosticsChannel.subscribe("unifi-protect:http:request:start", onStart);
      diagnosticsChannel.subscribe("unifi-protect:http:request:end", onEnd);

      try {

        const { host, pool, transport } = makeMockTransport();

        pool.intercept({ method: "GET", path: "/d" }).reply(200, {});

        await transport.send(url(host, "/d"));
      } finally {

        diagnosticsChannel.unsubscribe("unifi-protect:http:request:start", onStart);
        diagnosticsChannel.unsubscribe("unifi-protect:http:request:end", onEnd);
      }

      assert.equal(starts.length, 1);
      assert.equal(starts[0]?.method, "GET");
      assert.equal(ends.length, 1);
      assert.equal(ends[0]?.statusCode, 200);
      assert.equal(starts[0]?.requestId, ends[0]?.requestId, "start and end must share the requestId");
    });

    test("publishes throttle entered and exited around the breaker lifecycle", async () => {

      const entered: { consecutiveFailures: number; cooldownMs: number }[] = [];
      let exitedCount = 0;
      const onEntered = (message: unknown): void => void entered.push(message as { consecutiveFailures: number; cooldownMs: number });
      const onExited = (): void => void exitedCount++;

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

      const { transport } = makeMockTransport();

      await assert.doesNotReject(transport[Symbol.asyncDispose]());
    });

    test("owns and rebuilds its pool when no dispatcher is injected", async () => {

      // No dispatcher injected, so the transport builds (and owns) a real undici pool - exercising the retry-interceptor construction. The pool is lazy, so no
      // connection opens without a request; reset() rebuilds it and asyncDispose tears it down.
      const transport = new Transport({ host: "127.0.0.1" });

      assert.equal(transport.isThrottled, false);
      assert.doesNotThrow(() => transport.reset(), "reset must rebuild the owned pool without throwing");

      await assert.doesNotReject(transport[Symbol.asyncDispose]());
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
