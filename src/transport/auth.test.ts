/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * auth.test.ts: Unit tests for the authentication session - the UniFi OS credential handshake, its CSRF token read from the controller root ahead of its one login,
 * the cookie/CSRF capture and stripping, the throw-on-failure contract and the answers that are no verdict on the credentials, the logout / reauthenticate paths,
 * the relogin's single-flight coalescing and the probe's mark it carries through an open breaker, the failures a relogin rethrows, and the stale-session guards.
 * Driven against an undici MockAgent so the handshake exercises the real transport path, and over a loopback peer where a row reads what the owned pool's retry
 * decision hands the handshake, which a MockAgent never reaches.
 */
import { PROTECT_API_ERROR_LIMIT, PROTECT_API_RETRY_INTERVAL } from "../settings.ts";
import { ProtectAuthError, ProtectNetworkError, ProtectRequestError, ProtectThrottledError } from "../errors.ts";
import { channels, subscribeToChannel } from "../diagnostics.ts";
import { describe, test } from "node:test";
import { makeMockTransport, url } from "./mock-controller.helpers.ts";
import type { AuthReloginPayload } from "../diagnostics.ts";
import { AuthSession } from "./auth.ts";
import type { ChannelListener } from "node:diagnostics_channel";
import type { Interceptable } from "undici";
import type { MockTransport } from "./mock-controller.helpers.ts";
import { Transport } from "./http.ts";
import assert from "node:assert/strict";
import { createLoopbackHttpsPeer } from "./tls-peer.helpers.ts";
import diagnosticsChannel from "node:diagnostics_channel";

// The login endpoint path and the controller-root path the handshake uses, relative to the mock controller origin.
const LOGIN_PATH = "/api/auth/login";
const ROOT_PATH = "/";

// Answer the controller root, the first request of every handshake, with a 200 carrying the given CSRF token, or none when the row names none.
function interceptRoot(pool: Interceptable, token?: string): void {

  pool.intercept({ method: "GET", path: ROOT_PATH }).reply(200, "", { headers: (token !== undefined) ? { "x-csrf-token": token } : {} });
}

/* A session wired to its transport as the composition root wires it: the session's headers stamped beneath every request, and a 401 handing the session its
 * relogin with the request's probe mark, so a row drives a relogin through the request that met the 401. The `let` is required because the closures capture
 * `auth` before it is assigned.
 */
function makeWiredSession(): MockTransport & { auth: AuthSession } {

  // eslint-disable-next-line prefer-const
  let auth: AuthSession;
  const mock = makeMockTransport({ getAuthHeaders: (): Record<string, string> => auth.authHeaders(),
    onUnauthorized: (relogin): Promise<boolean> => auth.reauthenticate(relogin) });

  auth = new AuthSession({ transport: mock.transport });

  return { ...mock, auth };
}

// Trip the transport's breaker: a threshold's worth of consecutive 500s, each booked a failure, leave it open and inside its cooldown, which only a probe passes.
async function tripBreaker(mock: MockTransport): Promise<void> {

  mock.pool.intercept({ method: "GET", path: "/fail" }).reply(500, "x").times(PROTECT_API_ERROR_LIMIT);

  for(let index = 0; index < PROTECT_API_ERROR_LIMIT; index++) {

    // eslint-disable-next-line no-await-in-loop
    await mock.transport.send(url(mock.host, "/fail"));
  }

  assert.equal(mock.transport.isThrottled, true, "the consecutive failures must have opened the breaker");
}

describe("AuthSession", () => {

  describe("initial state", () => {

    test("is unauthenticated with empty auth headers before login", () => {

      const { transport } = makeMockTransport();
      const auth = new AuthSession({ transport });

      assert.equal(auth.isAuthenticated, false);
      assert.deepEqual(auth.authHeaders(), {});
    });

    test("reauthenticate fails when no credentials have been supplied", async () => {

      const { transport } = makeMockTransport();
      const auth = new AuthSession({ transport });

      assert.equal(await auth.reauthenticate(), false);
    });
  });

  describe("login", () => {

    test("captures the stripped cookie and CSRF token from an accepted login", async () => {

      const { agent, host, pool, transport } = makeMockTransport();
      const auth = new AuthSession({ transport });

      interceptRoot(pool);
      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(200, "", { headers: { "set-cookie": "TOKEN=abc; Path=/; HttpOnly", "x-csrf-token": "csrf1" } });

      await auth.login({ host, password: "p", username: "u" });

      assert.equal(auth.isAuthenticated, true);
      assert.deepEqual(auth.authHeaders(), { cookie: "TOKEN=abc", "x-csrf-token": "csrf1" }, "the cookie attributes must be stripped to the bare token=value pair");
      agent.assertNoPendingInterceptors();
    });

    test("prefers the rotated X-Updated-CSRF-Token over X-CSRF-Token", async () => {

      const { agent, host, pool, transport } = makeMockTransport();
      const auth = new AuthSession({ transport });

      interceptRoot(pool);
      pool.intercept({ method: "POST", path: LOGIN_PATH })
        .reply(200, "", { headers: { "set-cookie": "TOKEN=abc", "x-csrf-token": "stale", "x-updated-csrf-token": "rotated" } });

      await auth.login({ host, password: "p", username: "u" });

      assert.equal(auth.authHeaders()["x-csrf-token"], "rotated", "the rotated token must win when the controller sends both");
      agent.assertNoPendingInterceptors();
    });

    test("stamps the CSRF token the controller root answers with on the one login it posts", async () => {

      const { agent, host, pool, transport } = makeMockTransport();
      const auth = new AuthSession({ transport });

      // The login intercept answers only a login carrying the root's token, so the token the root handed back must reach the login.
      interceptRoot(pool, "fetched");
      pool.intercept({ headers: { "x-csrf-token": "fetched" }, method: "POST", path: LOGIN_PATH })
        .reply(200, "", { headers: { "set-cookie": "TOKEN=z; Path=/", "x-csrf-token": "final" } });

      await auth.login({ host, password: "p", username: "u" });

      assert.equal(auth.isAuthenticated, true);
      assert.deepEqual(auth.authHeaders(), { cookie: "TOKEN=z", "x-csrf-token": "final" }, "the session keeps the token the login answers with, never the root's");
      agent.assertNoPendingInterceptors();
    });

    test("throws ProtectAuthError and stays unauthenticated when the handshake cannot complete", async () => {

      const { agent, host, pool, transport } = makeMockTransport();
      const auth = new AuthSession({ transport });

      // The controller root answers without a CSRF token, so the one login goes without one, and its rejection is the verdict on the credentials.
      interceptRoot(pool);
      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(401, "bad creds");

      await assert.rejects(auth.login({ host, password: "p", username: "u" }), ProtectAuthError);
      assert.equal(auth.isAuthenticated, false);
      agent.assertNoPendingInterceptors();
    });

    // A status that is no verdict on the credentials - a readiness answer from the transport's retried set, a rate limit, a 3xx, or a 5xx outside the set - surfaces
    // as the classified request error rather than as a rejected sign-in, and the handshake leaves no session behind, not even the token the root handed it.
    for(const status of [ 503, 404, 400, 429, 501, 302 ]) {

      test("a login answered " + String(status) + " throws ProtectRequestError and stays unauthenticated", async () => {

        const { agent, host, pool, transport } = makeMockTransport();
        const auth = new AuthSession({ transport });

        interceptRoot(pool, "fetched");
        pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(status, "not ready");

        await assert.rejects(auth.login({ host, password: "p", username: "u" }), { constructor: ProtectRequestError, statusCode: status });
        assert.equal(auth.isAuthenticated, false);
        assert.deepEqual(auth.authHeaders(), {}, "the root's token is the handshake's own, never the session's");
        agent.assertNoPendingInterceptors();
      });
    }

    test("a login answered 503 with a Retry-After over the owned pool throws ProtectRequestError, the login sent once", async () => {

      /* The root answers 200 and the login a hinted readiness answer. The owned pool's retry decision returns the hinted answer unretried, and the handshake still
       * reads it as no verdict on the credentials, so the peer answers the root and the one login.
       */
      const hinted = { body: "{\"error\":\"starting\"}", headers: { "retry-after": "2" }, status: 503 };

      await using peer = await createLoopbackHttpsPeer({ respond: (request) => ((request === 1) ? { body: "{}", status: 200 } : hinted) });
      await using transport = new Transport({ host: peer.host, origin: "https://" + peer.host });

      const auth = new AuthSession({ transport });

      await assert.rejects(auth.login({ host: peer.host, password: "p", username: "u" }), { constructor: ProtectRequestError, statusCode: 503 });
      assert.equal(peer.requests, 2);
      assert.equal(auth.isAuthenticated, false);
    });

    test("a controller root answered 503 with a Retry-After over the owned pool throws ProtectRequestError after one request, posting no login", async () => {

      // The owned pool's retry decision returns the hinted readiness answer at the root unretried, and the handshake throws it before any password is sent.
      await using peer = await createLoopbackHttpsPeer({ respond: () => ({ body: "{\"error\":\"starting\"}", headers: { "retry-after": "2" }, status: 503 }) });
      await using transport = new Transport({ host: peer.host, origin: "https://" + peer.host });

      const auth = new AuthSession({ transport });

      await assert.rejects(auth.login({ host: peer.host, password: "p", username: "u" }), { constructor: ProtectRequestError, statusCode: 503 });
      assert.equal(peer.requests, 1);
      assert.equal(auth.isAuthenticated, false);
    });

    test("a rejected sign-in over the owned pool posts its login once", async () => {

      // The root answers 200 with no CSRF token and every later request is rejected, so a handshake that read the root again after the rejection, or posted a
      // second login, would reach a third request.
      await using peer = await createLoopbackHttpsPeer({ respond: (request) => ((request === 1) ? { body: "{}", status: 200 } : { body: "{}", status: 401 }) });
      await using transport = new Transport({ host: peer.host, origin: "https://" + peer.host });

      const auth = new AuthSession({ transport });

      await assert.rejects(auth.login({ host: peer.host, password: "p", username: "u" }), ProtectAuthError);
      assert.equal(peer.requests, 2);
      assert.equal(auth.isAuthenticated, false);
    });

    test("a login answered 503 over an authenticated session throws ProtectRequestError and drops the session cookie", async () => {

      const { agent, host, pool, transport } = makeMockTransport();
      const auth = new AuthSession({ transport });

      interceptRoot(pool);
      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(200, "", { headers: { "set-cookie": "TOKEN=abc", "x-csrf-token": "csrf1" } });

      await auth.login({ host, password: "p", username: "u" });

      // A login that ends on any non-2xx did not complete, so the cookie of the session before it is cleared although the answer throws rather than rejects.
      interceptRoot(pool);
      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(503, "rebooting");

      await assert.rejects(auth.login({ host, password: "p", username: "u" }), { constructor: ProtectRequestError, statusCode: 503 });
      assert.equal(auth.isAuthenticated, false);
      assert.equal(auth.authHeaders()["cookie"], undefined);
      agent.assertNoPendingInterceptors();
    });

    test("a controller root answered 503 throws ProtectRequestError before any login is posted", async () => {

      const { agent, host, pool, transport } = makeMockTransport();
      const auth = new AuthSession({ transport });

      // The root's readiness answer means the controller is not ready to judge a sign-in, so its classified error surfaces and no password is sent. No login is
      // answered, so a login posted after the root would fail as a network error instead.
      pool.intercept({ method: "GET", path: ROOT_PATH }).reply(503, "rebooting");

      await assert.rejects(auth.login({ host, password: "p", username: "u" }), { constructor: ProtectRequestError, statusCode: 503 });
      assert.equal(auth.isAuthenticated, false);
      agent.assertNoPendingInterceptors();
    });

    test("a controller root answered 404 throws ProtectRequestError before any login is posted", async () => {

      const { agent, host, pool, transport } = makeMockTransport();
      const auth = new AuthSession({ transport });

      // A 404 is in the retried set, the answer a controller mid-reboot gives, so the root's 404 is a readiness answer like the 503 above and its error surfaces.
      pool.intercept({ method: "GET", path: ROOT_PATH }).reply(404, "rebooting");

      await assert.rejects(auth.login({ host, password: "p", username: "u" }), { constructor: ProtectRequestError, statusCode: 404 });
      assert.equal(auth.isAuthenticated, false);
      agent.assertNoPendingInterceptors();
    });

    test("a controller root answered 429 throws ProtectRequestError before any login is posted", async () => {

      const { agent, host, pool, transport } = makeMockTransport();
      const auth = new AuthSession({ transport });

      // A 429 is outside the retried set, yet a rate-limited root has judged nothing, so the root's rate limit surfaces before any password is sent.
      pool.intercept({ method: "GET", path: ROOT_PATH }).reply(429, "slow down");

      await assert.rejects(auth.login({ host, password: "p", username: "u" }), { constructor: ProtectRequestError, statusCode: 429 });
      assert.equal(auth.isAuthenticated, false);
      agent.assertNoPendingInterceptors();
    });

    test("a controller root answered 501 posts one login without a token, whose 401 throws ProtectAuthError", async () => {

      const { agent, host, pool, transport } = makeMockTransport();
      const auth = new AuthSession({ transport });

      // A root answer that is neither a 2xx, a readiness answer nor a rate limit stamps no token, even one it carries, so the one login goes without one and its 401
      // is read as the rejected sign-in it is. The login intercept answers only a login carrying no token.
      pool.intercept({ method: "GET", path: ROOT_PATH }).reply(501, "not implemented", { headers: { "x-csrf-token": "unread" } });
      pool.intercept({ headers: (headers) => !("x-csrf-token" in headers), method: "POST", path: LOGIN_PATH }).reply(401, "bad creds");

      await assert.rejects(auth.login({ host, password: "p", username: "u" }), ProtectAuthError);
      assert.equal(auth.isAuthenticated, false);
      agent.assertNoPendingInterceptors();
    });

    test("treats a 2xx login that omits the cookie or CSRF token as a failure", async () => {

      const { agent, host, pool, transport } = makeMockTransport();
      const auth = new AuthSession({ transport });

      // The controller answered 200 but without a Set-Cookie - the session is incomplete, so the handshake must fail closed rather than report success.
      interceptRoot(pool);
      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(200, "", { headers: { "x-csrf-token": "csrf1" } });

      await assert.rejects(auth.login({ host, password: "p", username: "u" }), ProtectAuthError);
      assert.equal(auth.isAuthenticated, false);

      // The other half: a 200 that carries the Set-Cookie but no CSRF token is just as incomplete.
      interceptRoot(pool);
      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(200, "", { headers: { "set-cookie": "TOKEN=abc" } });

      await assert.rejects(auth.login({ host, password: "p", username: "u" }), ProtectAuthError);
      assert.equal(auth.isAuthenticated, false);
      agent.assertNoPendingInterceptors();
    });
  });

  describe("logout and reauthenticate", () => {

    test("logout clears the session and forgets credentials", async () => {

      const { agent, host, pool, transport } = makeMockTransport();
      const auth = new AuthSession({ transport });
      const methods: string[] = [];

      interceptRoot(pool);
      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(200, "", { headers: { "set-cookie": "TOKEN=abc", "x-csrf-token": "csrf1" } });

      await auth.login({ host, password: "p", username: "u" });
      auth.logout();

      assert.equal(auth.isAuthenticated, false);
      assert.deepEqual(auth.authHeaders(), {});

      // Only the forgotten credentials keep the relogin from re-establishing the session, so it sends no request at all.
      using startSubscription = subscribeToChannel(channels.httpRequestStart, (payload) => void methods.push(payload.method));

      assert.equal(await auth.reauthenticate(), false, "after an explicit logout there are no credentials to re-authenticate with");
      assert.deepEqual(methods, [], "a relogin with no credentials sends nothing");
      agent.assertNoPendingInterceptors();
    });

    test("reauthenticate re-runs the handshake with the retained credentials and refreshes the session", async () => {

      const { agent, host, pool, transport } = makeMockTransport();
      const auth = new AuthSession({ transport });

      interceptRoot(pool, "root1");
      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(200, "", { headers: { "set-cookie": "TOKEN=old", "x-csrf-token": "csrf1" } });

      await auth.login({ host, password: "p", username: "u" });

      // The relogin reads a fresh token rather than offering the one the session holds: its root answers with a token unlike the session's, and the login intercept
      // answers only a login carrying that fresh token.
      interceptRoot(pool, "root2");
      pool.intercept({ headers: { "x-csrf-token": "root2" }, method: "POST", path: LOGIN_PATH })
        .reply(200, "", { headers: { "set-cookie": "TOKEN=new", "x-csrf-token": "csrf2" } });

      assert.equal(await auth.reauthenticate(), true);
      assert.deepEqual(auth.authHeaders(), { cookie: "TOKEN=new", "x-csrf-token": "csrf2" }, "reauthenticate must replace the session with the freshly issued one");
      agent.assertNoPendingInterceptors();

      // The mock interception above already proved the handshake targeted the login endpoint - had the URL been wrong, that interceptor would not have matched and the
      // login would have thrown. This assertion is instead a sanity check on the `url()` test helper itself, confirming it composes the origin as the rest of the suite
      // assumes.
      assert.equal(url(host, LOGIN_PATH), "https://" + host + LOGIN_PATH);
    });

    test("a relogin whose controller root gives no token posts a login carrying none, though the transport stamps the session's headers", async () => {

      // The transport's header hook is wired back to the session through a late-binding closure, as the composition root wires it, so the session's headers go out
      // beneath each request's own. The `let` is required because the closure captures `auth` before it is assigned.
      // eslint-disable-next-line prefer-const
      let auth: AuthSession;
      const { agent, host, pool, transport } = makeMockTransport({ getAuthHeaders: (): Record<string, string> => auth.authHeaders() });

      auth = new AuthSession({ transport });

      interceptRoot(pool, "root1");
      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(200, "", { headers: { "set-cookie": "TOKEN=old", "x-csrf-token": "csrf1" } });

      await auth.login({ host, password: "p", username: "u" });

      // The relogin's root answers with no token, and the login intercept answers only a login carrying none, so a token the session kept would miss it.
      interceptRoot(pool);
      pool.intercept({ headers: (headers) => !("x-csrf-token" in headers), method: "POST", path: LOGIN_PATH })
        .reply(200, "", { headers: { "set-cookie": "TOKEN=new", "x-csrf-token": "csrf2" } });

      assert.equal(await auth.reauthenticate(), true);
      assert.deepEqual(auth.authHeaders(), { cookie: "TOKEN=new", "x-csrf-token": "csrf2" });
      agent.assertNoPendingInterceptors();
    });

    test("publishes the relogin outcome on the auth:relogin diagnostics channel", async () => {

      const { agent, host, pool, transport } = makeMockTransport();
      const auth = new AuthSession({ transport });
      const outcomes: unknown[] = [];
      const onRelogin: ChannelListener = (message) => void outcomes.push(message);

      interceptRoot(pool);
      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(200, "", { headers: { "set-cookie": "TOKEN=old", "x-csrf-token": "csrf1" } });

      await auth.login({ host, password: "p", username: "u" });

      // The row subscribes by the channel's published name rather than through the typed channel, because the name is public contract a consumer subscribes by, and
      // this row is what holds it; the payloads are compared whole, so nothing is read through a cast.
      diagnosticsChannel.subscribe("unifi-protect:auth:relogin", onRelogin);

      try {

        // A successful relogin publishes success: true.
        interceptRoot(pool);
        pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(200, "", { headers: { "set-cookie": "TOKEN=new", "x-csrf-token": "csrf2" } });
        assert.equal(await auth.reauthenticate(), true);

        // A relogin after logout (no retained credentials) still publishes - as a failure, so a subscriber sees the attempt that could not recover the session.
        auth.logout();
        assert.equal(await auth.reauthenticate(), false);
      } finally {

        diagnosticsChannel.unsubscribe("unifi-protect:auth:relogin", onRelogin);
      }

      assert.deepEqual(outcomes, [ { success: true }, { success: false } ], "the channel must report each relogin outcome in order");
      agent.assertNoPendingInterceptors();
    });

    test("concurrent reauthenticate calls coalesce into a single handshake", async () => {

      const { agent, host, pool, transport } = makeMockTransport();
      const auth = new AuthSession({ transport });

      interceptRoot(pool);
      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(200, "", { headers: { "set-cookie": "TOKEN=old", "x-csrf-token": "csrf1" } });

      await auth.login({ host, password: "p", username: "u" });

      // Exactly one root answer and one login answer back the relogin below: were each call to run its own handshake, the second run would find no interceptor and
      // fail. Both callers sharing the one run - and the one fresh session it establishes - is the coalescing contract.
      interceptRoot(pool);
      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(200, "", { headers: { "set-cookie": "TOKEN=new", "x-csrf-token": "csrf2" } });

      const [ first, second ] = await Promise.all([ auth.reauthenticate(), auth.reauthenticate() ]);

      assert.equal(first, true);
      assert.equal(second, true);
      assert.deepEqual(auth.authHeaders(), { cookie: "TOKEN=new", "x-csrf-token": "csrf2" });
      agent.assertNoPendingInterceptors();
    });

    test("a relogin whose controller is unreachable rejects with the network failure, publishing its outcome first", async () => {

      const { agent, host, pool, transport } = makeMockTransport();
      const auth = new AuthSession({ transport });
      const outcomes: AuthReloginPayload[] = [];

      interceptRoot(pool);
      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(200, "", { headers: { "set-cookie": "TOKEN=old", "x-csrf-token": "csrf1" } });

      await auth.login({ host, password: "p", username: "u" });

      // No interceptor backs the relogin, so the transport throws on the wire - often exactly the weather that produced the 401 in the first place. That failure is
      // no verdict on the credentials, so the relogin publishes its outcome and then rethrows it rather than settling as a refused sign-in.
      using reloginSubscription = subscribeToChannel(channels.authRelogin, (payload) => void outcomes.push(payload));

      await assert.rejects(auth.reauthenticate(), ProtectNetworkError);
      assert.deepEqual(outcomes, [{ success: false }], "a relogin that threw still publishes its one outcome");
      agent.assertNoPendingInterceptors();
    });

    // A controller root answering a readiness status or a rate limit is not ready to judge a sign-in, so the request that met the 401 throws the root's classified
    // answer rather than the 401 a swallowed relogin would hand back. No login is answered, so a login posted after the root would fail as a network error instead.
    for(const status of [ 503, 429 ]) {

      test("a 401 whose relogin meets a controller root answered " + String(status) + " throws that ProtectRequestError rather than the 401", async () => {

        const { agent, auth, host, pool, transport } = makeWiredSession();
        const outcomes: AuthReloginPayload[] = [];

        interceptRoot(pool);
        pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(200, "", { headers: { "set-cookie": "TOKEN=old", "x-csrf-token": "csrf1" } });

        await auth.login({ host, password: "p", username: "u" });

        pool.intercept({ method: "GET", path: "/guarded" }).reply(401, "stale");
        pool.intercept({ method: "GET", path: ROOT_PATH }).reply(status, "not ready");

        using reloginSubscription = subscribeToChannel(channels.authRelogin, (payload) => void outcomes.push(payload));

        await assert.rejects(transport.send(url(host, "/guarded")), { constructor: ProtectRequestError, statusCode: status });
        assert.deepEqual(outcomes, [{ success: false }]);
        agent.assertNoPendingInterceptors();
      });
    }

    test("a relogin whose sign-in the controller refuses resolves false, publishing its outcome", async () => {

      const { agent, host, pool, transport } = makeMockTransport();
      const auth = new AuthSession({ transport });
      const outcomes: AuthReloginPayload[] = [];

      interceptRoot(pool);
      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(200, "", { headers: { "set-cookie": "TOKEN=old", "x-csrf-token": "csrf1" } });

      await auth.login({ host, password: "p", username: "u" });

      // A rejected sign-in is the handshake answer that judges the credentials, so the relogin settles false, and the request that met the 401 is handed its own 401.
      interceptRoot(pool);
      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(401, "bad creds");

      using reloginSubscription = subscribeToChannel(channels.authRelogin, (payload) => void outcomes.push(payload));

      assert.equal(await auth.reauthenticate(), false);
      assert.deepEqual(outcomes, [{ success: false }]);
      assert.equal(auth.isAuthenticated, false);
      agent.assertNoPendingInterceptors();
    });

    test("a probe's relogin passes the open breaker, and the controller's answers close it", async () => {

      const mock = makeMockTransport();
      const { agent, host, pool, transport } = mock;
      const auth = new AuthSession({ transport });

      interceptRoot(pool);
      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(200, "", { headers: { "set-cookie": "TOKEN=old", "x-csrf-token": "csrf1" } });

      await auth.login({ host, password: "p", username: "u" });
      await tripBreaker(mock);

      // The breaker is inside its cooldown, so a relogin carrying no mark would be refused before its root is read. The probe's mark lets the root through, and the
      // root's answer closes the breaker.
      interceptRoot(pool);
      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(200, "", { headers: { "set-cookie": "TOKEN=new", "x-csrf-token": "csrf2" } });

      assert.equal(await auth.reauthenticate({ probe: true }), true);
      assert.equal(transport.isThrottled, false, "a controller that answered the relogin is no longer paused");
      assert.equal(auth.isAuthenticated, true);
      agent.assertNoPendingInterceptors();
    });

    test("a probe's relogin whose controller root answers 501 re-arms the cooldown, and its login passes on the probe's mark of its own", async () => {

      const mock = makeMockTransport();
      const { agent, clock, host, pool, transport } = mock;
      const auth = new AuthSession({ transport });

      interceptRoot(pool);
      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(200, "", { headers: { "set-cookie": "TOKEN=old", "x-csrf-token": "csrf1" } });

      await auth.login({ host, password: "p", username: "u" });
      await tripBreaker(mock);

      /* The cooldown has elapsed, so the root passes with or without a mark, and its 501, neither a readiness answer nor a rate limit, books a failure that re-arms
       * the cooldown while handing the login no error to stop on. The login then passes only on a mark of its own, and its answer closes the breaker. A root answer
       * that is no 2xx stamps no token, so the login intercept answers only a login carrying none.
       */
      clock.advance(PROTECT_API_RETRY_INTERVAL * 1000);
      pool.intercept({ method: "GET", path: ROOT_PATH }).reply(501, "not implemented", { headers: { "x-csrf-token": "unread" } });
      pool.intercept({ headers: (headers) => !("x-csrf-token" in headers), method: "POST", path: LOGIN_PATH })
        .reply(200, "", { headers: { "set-cookie": "TOKEN=new", "x-csrf-token": "csrf2" } });

      assert.equal(await auth.reauthenticate({ probe: true }), true);
      assert.equal(transport.isThrottled, false, "the login's answer closed the breaker the root's answer re-armed");
      agent.assertNoPendingInterceptors();
    });

    test("a probe that joins the relogin of a gated request shares its fate, the open breaker refusing the starter and the joiner alike with nothing sent", async () => {

      const mock = makeMockTransport();
      const { agent, host, pool, transport } = mock;
      const auth = new AuthSession({ transport });
      const methods: string[] = [];
      const outcomes: AuthReloginPayload[] = [];

      interceptRoot(pool);
      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(200, "", { headers: { "set-cookie": "TOKEN=old", "x-csrf-token": "csrf1" } });

      await auth.login({ host, password: "p", username: "u" });
      await tripBreaker(mock);

      // The relogin the gated request starts carries no mark, so the breaker refuses its root while it cools, and the probe that joins it shares that fate rather
      // than starting a relogin of its own: the starter and the joiner each reject with the refusal, nothing reaches the controller, and the one run publishes once.
      using startSubscription = subscribeToChannel(channels.httpRequestStart, (payload) => void methods.push(payload.method));
      using reloginSubscription = subscribeToChannel(channels.authRelogin, (payload) => void outcomes.push(payload));

      await Promise.all([ assert.rejects(auth.reauthenticate(), ProtectThrottledError), assert.rejects(auth.reauthenticate({ probe: true }), ProtectThrottledError) ]);

      assert.deepEqual(methods, [], "a relogin the breaker refuses sends nothing");
      assert.deepEqual(outcomes, [{ success: false }], "callers sharing one run see one outcome");
      assert.equal(transport.isThrottled, true);
      agent.assertNoPendingInterceptors();
    });

    test("a gated request that joins a probe's relogin shares the probe's mark, the one login passing the breaker the root's 501 kept open", async () => {

      const mock = makeMockTransport();
      const { agent, host, pool, transport } = mock;
      const auth = new AuthSession({ transport });

      interceptRoot(pool);
      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(200, "", { headers: { "set-cookie": "TOKEN=old", "x-csrf-token": "csrf1" } });

      await auth.login({ host, password: "p", username: "u" });
      await tripBreaker(mock);

      /* The probe starts the relogin and the gated request joins it. The root's 501 books a failure that keeps the breaker open, so the one login passes only on
       * the starter's mark, which the joiner must not replace. One root answer and one login answer back every caller, so a second run would find no interceptor.
       */
      pool.intercept({ method: "GET", path: ROOT_PATH }).reply(501, "not implemented", { headers: { "x-csrf-token": "unread" } });
      pool.intercept({ headers: (headers) => !("x-csrf-token" in headers), method: "POST", path: LOGIN_PATH })
        .reply(200, "", { headers: { "set-cookie": "TOKEN=new", "x-csrf-token": "csrf2" } });

      const [ probe, gated ] = await Promise.all([ auth.reauthenticate({ probe: true }), auth.reauthenticate() ]);

      assert.equal(probe, true);
      assert.equal(gated, true, "the joiner shares the run the probe started");
      assert.equal(transport.isThrottled, false, "the login's answer closed the breaker");
      agent.assertNoPendingInterceptors();
    });

    test("a relogin whose root read outlasts a fresh login posts nothing and leaves the fresh session intact", async () => {

      const { agent, host, pool, transport } = makeMockTransport();
      const auth = new AuthSession({ transport });
      const methods: string[] = [];

      interceptRoot(pool);
      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(200, "", { headers: { "set-cookie": "TOKEN=old", "x-csrf-token": "csrf1" } });

      await auth.login({ host, password: "p", username: "u" });

      /* The relogin's root answers with a token, held past the fresh login below. The session changed while the relogin read its root, so the relogin posts nothing
       * and fails, and neither the token its root handed it nor its failure may touch the session the fresh login owns. The fresh login reads the second root
       * answer and posts the one login answered.
       */
      pool.intercept({ method: "GET", path: ROOT_PATH }).reply(200, "", { headers: { "x-csrf-token": "stale" } }).delay(20);
      interceptRoot(pool);
      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(200, "", { headers: { "set-cookie": "TOKEN=fresh", "x-csrf-token": "csrf2" } });

      using startSubscription = subscribeToChannel(channels.httpRequestStart, (payload) => void methods.push(payload.method));

      const relogin = auth.reauthenticate();

      await auth.login({ host, password: "p", username: "u" });

      assert.equal(await relogin, false);
      assert.deepEqual(methods, [ "GET", "GET", "POST" ], "the relogin reads its root and posts nothing, and the fresh login reads its own and posts its login");
      assert.equal(auth.isAuthenticated, true);
      assert.deepEqual(auth.authHeaders(), { cookie: "TOKEN=fresh", "x-csrf-token": "csrf2" }, "the failed relogin must not touch the session that replaced it");
      agent.assertNoPendingInterceptors();
    });

    test("a relogin whose login is rejected after a fresh login leaves the fresh session intact", async () => {

      const { agent, host, pool, transport } = makeMockTransport();
      const auth = new AuthSession({ transport });
      const reloginSent = Promise.withResolvers<undefined>();

      interceptRoot(pool);
      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(200, "", { headers: { "set-cookie": "TOKEN=old", "x-csrf-token": "csrf1" } });

      await auth.login({ host, password: "p", username: "u" });

      /* The relogin's login is held open past the fresh login below, then rejected: its failure path must not clear the cookie the new session owns. The fresh login
       * begins only once the relogin's login is sent, because a session replaced while the relogin still reads its root posts nothing.
       */
      interceptRoot(pool);
      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(401, "expired").delay(20);
      interceptRoot(pool);
      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(200, "", { headers: { "set-cookie": "TOKEN=fresh", "x-csrf-token": "csrf2" } });

      using startSubscription = subscribeToChannel(channels.httpRequestStart, (payload) => {

        if(payload.method === "POST") {

          reloginSent.resolve(undefined);
        }
      });

      const relogin = auth.reauthenticate();

      await reloginSent.promise;
      await auth.login({ host, password: "p", username: "u" });

      assert.equal(await relogin, false);
      assert.equal(auth.isAuthenticated, true);
      assert.deepEqual(auth.authHeaders(), { cookie: "TOKEN=fresh", "x-csrf-token": "csrf2" }, "the failed relogin must not wipe the session that replaced it");
      agent.assertNoPendingInterceptors();
    });

    test("a logout while a relogin reads the controller root posts no login and leaves the session ended", async () => {

      const { agent, host, pool, transport } = makeMockTransport();
      const auth = new AuthSession({ transport });
      const methods: string[] = [];

      interceptRoot(pool);
      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(200, "", { headers: { "set-cookie": "TOKEN=old", "x-csrf-token": "csrf1" } });

      await auth.login({ host, password: "p", username: "u" });

      // The relogin's root answers with a token, but the logout below ends the session client-side while the root is read: the relogin must send no password and
      // write nothing, so the session the caller ended stays ended.
      interceptRoot(pool, "stale");

      using startSubscription = subscribeToChannel(channels.httpRequestStart, (payload) => void methods.push(payload.method));

      const relogin = auth.reauthenticate();

      auth.logout();

      assert.equal(await relogin, false);
      assert.deepEqual(methods, ["GET"], "the relogin reads the root and posts no login");
      assert.equal(auth.isAuthenticated, false);
      assert.deepEqual(auth.authHeaders(), {});
      agent.assertNoPendingInterceptors();
    });

    test("a relogin whose login succeeds after a logout does not resurrect the session", async () => {

      const { agent, host, pool, transport } = makeMockTransport();
      const auth = new AuthSession({ transport });

      interceptRoot(pool);
      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(200, "", { headers: { "set-cookie": "TOKEN=old", "x-csrf-token": "csrf1" } });

      await auth.login({ host, password: "p", username: "u" });

      // The controller accepts the relogin, but the logout lands as its login is sent, ending the session client-side while the request is in flight - the
      // handshake's result must be discarded rather than silently re-arming a session the caller explicitly ended.
      interceptRoot(pool, "fetched");
      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(200, "", { headers: { "set-cookie": "TOKEN=zombie", "x-csrf-token": "csrf2" } });

      using startSubscription = subscribeToChannel(channels.httpRequestStart, (payload) => {

        if(payload.method === "POST") {

          auth.logout();
        }
      });

      assert.equal(await auth.reauthenticate(), false);
      assert.equal(auth.isAuthenticated, false);
      assert.deepEqual(auth.authHeaders(), {});
      agent.assertNoPendingInterceptors();
    });
  });
});
