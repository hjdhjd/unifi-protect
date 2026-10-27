/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * auth.test.ts: Unit tests for the authentication session - the UniFi OS credential handshake, the CSRF pre-fetch retry, the cookie/CSRF capture and stripping,
 * the throw-on-failure contract and the answers that are no verdict on the credentials, the logout / reauthenticate paths, the relogin's single-flight coalescing,
 * and the stale-session write guards. Driven against an undici MockAgent so the handshake exercises the real transport path, and over a loopback peer where a row
 * reads what the owned pool's retry decision hands the handshake, which a MockAgent never reaches.
 */
import { ProtectAuthError, ProtectRequestError } from "../errors.ts";
import { describe, test } from "node:test";
import { makeMockTransport, url } from "./mock-controller.helpers.ts";
import { AuthSession } from "./auth.ts";
import type { ChannelListener } from "node:diagnostics_channel";
import { Transport } from "./http.ts";
import assert from "node:assert/strict";
import { createLoopbackHttpsPeer } from "./tls-peer.helpers.ts";
import diagnosticsChannel from "node:diagnostics_channel";

// The login endpoint path and the controller-root path the handshake uses, relative to the mock controller origin.
const LOGIN_PATH = "/api/auth/login";
const ROOT_PATH = "/";

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

    test("captures the stripped cookie and CSRF token on a direct success", async () => {

      const { host, pool, transport } = makeMockTransport();
      const auth = new AuthSession({ transport });

      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(200, "", { headers: { "set-cookie": "TOKEN=abc; Path=/; HttpOnly", "x-csrf-token": "csrf1" } });

      await auth.login({ host, password: "p", username: "u" });

      assert.equal(auth.isAuthenticated, true);
      assert.deepEqual(auth.authHeaders(), { cookie: "TOKEN=abc", "x-csrf-token": "csrf1" }, "the cookie attributes must be stripped to the bare token=value pair");
    });

    test("prefers the rotated X-Updated-CSRF-Token over X-CSRF-Token", async () => {

      const { host, pool, transport } = makeMockTransport();
      const auth = new AuthSession({ transport });

      pool.intercept({ method: "POST", path: LOGIN_PATH })
        .reply(200, "", { headers: { "set-cookie": "TOKEN=abc", "x-csrf-token": "stale", "x-updated-csrf-token": "rotated" } });

      await auth.login({ host, password: "p", username: "u" });

      assert.equal(auth.authHeaders()["x-csrf-token"], "rotated", "the rotated token must win when the controller sends both");
    });

    test("fetches a CSRF token from the controller root and retries the login when the first attempt is rejected", async () => {

      const { host, pool, transport } = makeMockTransport();
      const auth = new AuthSession({ transport });

      // The retry intercept answers only a login carrying the fetched token, so the token the root handed back must reach the retried login.
      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(403, "need csrf");
      pool.intercept({ method: "GET", path: ROOT_PATH }).reply(200, "", { headers: { "x-csrf-token": "fetched" } });
      pool.intercept({ headers: { "x-csrf-token": "fetched" }, method: "POST", path: LOGIN_PATH })
        .reply(200, "", { headers: { "set-cookie": "TOKEN=z; Path=/", "x-csrf-token": "final" } });

      await auth.login({ host, password: "p", username: "u" });

      assert.equal(auth.isAuthenticated, true);
      assert.deepEqual(auth.authHeaders(), { cookie: "TOKEN=z", "x-csrf-token": "final" });
    });

    test("throws ProtectAuthError and stays unauthenticated when the handshake cannot complete", async () => {

      const { host, pool, transport } = makeMockTransport();
      const auth = new AuthSession({ transport });

      // The login is rejected and the controller root answers without a CSRF token, so the retry has nothing to offer and the rejection stands.
      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(401, "bad creds");
      pool.intercept({ method: "GET", path: ROOT_PATH }).reply(200, "");

      await assert.rejects(auth.login({ host, password: "p", username: "u" }), ProtectAuthError);
      assert.equal(auth.isAuthenticated, false);
    });

    // A status that is no verdict on the credentials - a readiness answer from the transport's retried set, a rate limit, a 3xx, or a 5xx outside the set - surfaces
    // as the classified request error rather than as a rejected sign-in, and the handshake leaves no session behind.
    for(const status of [ 503, 404, 400, 429, 501, 302 ]) {

      test("a login answered " + String(status) + " throws ProtectRequestError and stays unauthenticated", async () => {

        const { host, pool, transport } = makeMockTransport();
        const auth = new AuthSession({ transport });

        pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(status, "not ready");

        await assert.rejects(auth.login({ host, password: "p", username: "u" }), { constructor: ProtectRequestError, statusCode: status });
        assert.equal(auth.isAuthenticated, false);
      });
    }

    test("a login answered 503 with a Retry-After over the owned pool throws ProtectRequestError after one request", async () => {

      // The owned pool's retry decision returns a hinted readiness answer unretried, and the handshake still reads it as no verdict on the credentials.
      await using peer = await createLoopbackHttpsPeer({ respond: () => ({ body: "{\"error\":\"starting\"}", headers: { "retry-after": "2" }, status: 503 }) });
      await using transport = new Transport({ host: peer.host, origin: "https://" + peer.host });

      const auth = new AuthSession({ transport });

      await assert.rejects(auth.login({ host: peer.host, password: "p", username: "u" }), { constructor: ProtectRequestError, statusCode: 503 });
      assert.equal(peer.requests, 1);
      assert.equal(auth.isAuthenticated, false);
    });

    test("a login answered 503 over an authenticated session throws ProtectRequestError and drops the session cookie", async () => {

      const { host, pool, transport } = makeMockTransport();
      const auth = new AuthSession({ transport });

      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(200, "", { headers: { "set-cookie": "TOKEN=abc", "x-csrf-token": "csrf1" } });

      await auth.login({ host, password: "p", username: "u" });

      // A handshake that ends on any non-2xx did not complete, so the cookie of the session before it is cleared although the answer throws rather than rejects.
      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(503, "rebooting");

      await assert.rejects(auth.login({ host, password: "p", username: "u" }), { constructor: ProtectRequestError, statusCode: 503 });
      assert.equal(auth.isAuthenticated, false);
      assert.equal(auth.authHeaders()["cookie"], undefined);
    });

    test("a login answered 401 whose controller root answers 503 throws ProtectRequestError rather than a rejected sign-in", async () => {

      const { host, pool, transport } = makeMockTransport();
      const auth = new AuthSession({ transport });

      // The root's readiness answer means the controller could not yet judge a sign-in, so the login's 401 is no verdict and the root's classified error surfaces.
      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(401, "bad creds");
      pool.intercept({ method: "GET", path: ROOT_PATH }).reply(503, "rebooting");

      await assert.rejects(auth.login({ host, password: "p", username: "u" }), { constructor: ProtectRequestError, statusCode: 503 });
      assert.equal(auth.isAuthenticated, false);
    });

    test("a login answered 401 whose controller root answers 404 throws ProtectRequestError rather than a rejected sign-in", async () => {

      const { host, pool, transport } = makeMockTransport();
      const auth = new AuthSession({ transport });

      // A 404 is in the retried set, the answer a controller mid-reboot gives, so the root's 404 is a readiness answer like the 503 above and its error surfaces.
      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(401, "bad creds");
      pool.intercept({ method: "GET", path: ROOT_PATH }).reply(404, "rebooting");

      await assert.rejects(auth.login({ host, password: "p", username: "u" }), { constructor: ProtectRequestError, statusCode: 404 });
      assert.equal(auth.isAuthenticated, false);
    });

    test("a login answered 401 whose controller root answers 429 throws ProtectRequestError rather than a rejected sign-in", async () => {

      const { host, pool, transport } = makeMockTransport();
      const auth = new AuthSession({ transport });

      // A 429 is outside the retried set, yet a rate-limited root has judged nothing, so the login's 401 is no verdict and the root's rate limit surfaces.
      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(401, "bad creds");
      pool.intercept({ method: "GET", path: ROOT_PATH }).reply(429, "slow down");

      await assert.rejects(auth.login({ host, password: "p", username: "u" }), { constructor: ProtectRequestError, statusCode: 429 });
      assert.equal(auth.isAuthenticated, false);
    });

    test("a login answered 401 whose controller root answers 501 throws ProtectAuthError as a rejected sign-in", async () => {

      const { host, pool, transport } = makeMockTransport();
      const auth = new AuthSession({ transport });

      // A root answer that is neither a readiness answer nor a rate limit yields no token and leaves the login's own answer standing, so the 401 is read as the
      // rejected sign-in it is.
      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(401, "bad creds");
      pool.intercept({ method: "GET", path: ROOT_PATH }).reply(501, "not implemented");

      await assert.rejects(auth.login({ host, password: "p", username: "u" }), ProtectAuthError);
      assert.equal(auth.isAuthenticated, false);
    });

    test("treats a 2xx login that omits the cookie or CSRF token as a failure", async () => {

      const { host, pool, transport } = makeMockTransport();
      const auth = new AuthSession({ transport });

      // The controller answered 200 but without a Set-Cookie - the session is incomplete, so the handshake must fail closed rather than report success.
      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(200, "", { headers: { "x-csrf-token": "csrf1" } });

      await assert.rejects(auth.login({ host, password: "p", username: "u" }), ProtectAuthError);
      assert.equal(auth.isAuthenticated, false);

      // The other half: a 200 that carries the Set-Cookie but no CSRF token is just as incomplete.
      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(200, "", { headers: { "set-cookie": "TOKEN=abc" } });

      await assert.rejects(auth.login({ host, password: "p", username: "u" }), ProtectAuthError);
      assert.equal(auth.isAuthenticated, false);
    });
  });

  describe("logout and reauthenticate", () => {

    test("logout clears the session and forgets credentials", async () => {

      const { host, pool, transport } = makeMockTransport();
      const auth = new AuthSession({ transport });

      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(200, "", { headers: { "set-cookie": "TOKEN=abc", "x-csrf-token": "csrf1" } });

      await auth.login({ host, password: "p", username: "u" });
      auth.logout();

      assert.equal(auth.isAuthenticated, false);
      assert.deepEqual(auth.authHeaders(), {});

      // The controller would accept a fresh login, so only the forgotten credentials keep the relogin from re-establishing the session.
      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(200, "", { headers: { "set-cookie": "TOKEN=def", "x-csrf-token": "csrf2" } });

      assert.equal(await auth.reauthenticate(), false, "after an explicit logout there are no credentials to re-authenticate with");
    });

    test("reauthenticate re-runs the handshake with the retained credentials and refreshes the session", async () => {

      const { host, pool, transport } = makeMockTransport();
      const auth = new AuthSession({ transport });

      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(200, "", { headers: { "set-cookie": "TOKEN=old", "x-csrf-token": "csrf1" } });

      await auth.login({ host, password: "p", username: "u" });

      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(200, "", { headers: { "set-cookie": "TOKEN=new", "x-csrf-token": "csrf2" } });

      assert.equal(await auth.reauthenticate(), true);
      assert.deepEqual(auth.authHeaders(), { cookie: "TOKEN=new", "x-csrf-token": "csrf2" }, "reauthenticate must replace the session with the freshly issued one");

      // The mock interception above already proved the handshake targeted the login endpoint - had the URL been wrong, that interceptor would not have matched and the
      // login would have thrown. This assertion is instead a sanity check on the `url()` test helper itself, confirming it composes the origin as the rest of the suite
      // assumes.
      assert.equal(url(host, LOGIN_PATH), "https://" + host + LOGIN_PATH);
    });

    test("publishes the relogin outcome on the auth:relogin diagnostics channel", async () => {

      const { host, pool, transport } = makeMockTransport();
      const auth = new AuthSession({ transport });
      const outcomes: unknown[] = [];
      const onRelogin: ChannelListener = (message) => void outcomes.push(message);

      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(200, "", { headers: { "set-cookie": "TOKEN=old", "x-csrf-token": "csrf1" } });

      await auth.login({ host, password: "p", username: "u" });

      // The row subscribes by the channel's published name rather than through the typed channel, because the name is public contract a consumer subscribes by, and
      // this row is what holds it; the payloads are compared whole, so nothing is read through a cast.
      diagnosticsChannel.subscribe("unifi-protect:auth:relogin", onRelogin);

      try {

        // A successful relogin publishes success: true.
        pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(200, "", { headers: { "set-cookie": "TOKEN=new", "x-csrf-token": "csrf2" } });
        assert.equal(await auth.reauthenticate(), true);

        // A relogin after logout (no retained credentials) still publishes - as a failure, so a subscriber sees the attempt that could not recover the session.
        auth.logout();
        assert.equal(await auth.reauthenticate(), false);
      } finally {

        diagnosticsChannel.unsubscribe("unifi-protect:auth:relogin", onRelogin);
      }

      assert.deepEqual(outcomes, [ { success: true }, { success: false } ], "the channel must report each relogin outcome in order");
    });

    test("concurrent reauthenticate calls coalesce into a single handshake", async () => {

      const { host, pool, transport } = makeMockTransport();
      const auth = new AuthSession({ transport });

      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(200, "", { headers: { "set-cookie": "TOKEN=old", "x-csrf-token": "csrf1" } });

      await auth.login({ host, password: "p", username: "u" });

      // Exactly one login interception backs the relogin below: were each call to run its own handshake, the second POST would find no interceptor and fail. Both
      // callers sharing the one run - and the one fresh session it establishes - is the coalescing contract.
      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(200, "", { headers: { "set-cookie": "TOKEN=new", "x-csrf-token": "csrf2" } });

      const [ first, second ] = await Promise.all([ auth.reauthenticate(), auth.reauthenticate() ]);

      assert.equal(first, true);
      assert.equal(second, true);
      assert.deepEqual(auth.authHeaders(), { cookie: "TOKEN=new", "x-csrf-token": "csrf2" });
    });

    test("a handshake that throws settles the relogin false rather than rejecting", async () => {

      const { host, pool, transport } = makeMockTransport();
      const auth = new AuthSession({ transport });

      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(200, "", { headers: { "set-cookie": "TOKEN=old", "x-csrf-token": "csrf1" } });

      await auth.login({ host, password: "p", username: "u" });

      // No interceptor backs the relogin, so the transport throws on the wire - often exactly the weather that produced the 401 in the first place. The hook's
      // contract is a boolean, so the throw must settle false rather than propagate into the unrelated request that tripped the relogin.
      assert.equal(await auth.reauthenticate(), false);
    });

    test("a relogin that fails after a fresh login leaves the fresh session intact", async () => {

      const { host, pool, transport } = makeMockTransport();
      const auth = new AuthSession({ transport });

      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(200, "", { headers: { "set-cookie": "TOKEN=old", "x-csrf-token": "csrf1" } });

      await auth.login({ host, password: "p", username: "u" });

      // The relogin's handshake is held open past the fresh login below, then fails: its failure path must not clear the cookie the new session owns.
      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(401, "expired").delay(20);
      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(200, "", { headers: { "set-cookie": "TOKEN=fresh", "x-csrf-token": "csrf2" } });

      const relogin = auth.reauthenticate();

      await auth.login({ host, password: "p", username: "u" });

      assert.equal(await relogin, false);
      assert.equal(auth.isAuthenticated, true);
      assert.deepEqual(auth.authHeaders(), { cookie: "TOKEN=fresh", "x-csrf-token": "csrf2" }, "the failed relogin must not wipe the session that replaced it");
    });

    test("a relogin that succeeds after a logout does not resurrect the session", async () => {

      const { host, pool, transport } = makeMockTransport();
      const auth = new AuthSession({ transport });

      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(200, "", { headers: { "set-cookie": "TOKEN=old", "x-csrf-token": "csrf1" } });

      await auth.login({ host, password: "p", username: "u" });

      // The controller accepts the relogin, but the logout below ends the session client-side while the request is in flight - the handshake's result must be
      // discarded rather than silently re-arming a session the caller explicitly ended.
      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(200, "", { headers: { "set-cookie": "TOKEN=zombie", "x-csrf-token": "csrf2" } });

      const relogin = auth.reauthenticate();

      auth.logout();

      assert.equal(await relogin, false);
      assert.equal(auth.isAuthenticated, false);
      assert.deepEqual(auth.authHeaders(), {});
    });
  });
});
