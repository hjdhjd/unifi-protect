/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * auth.test.ts: Unit tests for the authentication session - the UniFi OS credential handshake, the CSRF pre-fetch retry, the cookie/CSRF capture and stripping,
 * the throw-on-failure contract, and the logout / reauthenticate seams. Driven against an undici MockAgent so the handshake exercises the real transport path.
 */
import { describe, test } from "node:test";
import { makeMockTransport, url } from "./mock-controller.helpers.ts";
import { AuthSession } from "./auth.ts";
import { ProtectAuthError } from "../errors.ts";
import assert from "node:assert/strict";
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

      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(403, "need csrf");
      pool.intercept({ method: "GET", path: ROOT_PATH }).reply(200, "", { headers: { "x-csrf-token": "fetched" } });
      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(200, "", { headers: { "set-cookie": "TOKEN=z; Path=/", "x-csrf-token": "final" } });

      await auth.login({ host, password: "p", username: "u" });

      assert.equal(auth.isAuthenticated, true);
      assert.deepEqual(auth.authHeaders(), { cookie: "TOKEN=z", "x-csrf-token": "final" });
    });

    test("throws ProtectAuthError and stays unauthenticated when the handshake cannot complete", async () => {

      const { host, pool, transport } = makeMockTransport();
      const auth = new AuthSession({ transport });

      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(401, "bad creds");
      pool.intercept({ method: "GET", path: ROOT_PATH }).reply(500, "unavailable");

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
      const outcomes: boolean[] = [];
      const onRelogin = (message: unknown): void => void outcomes.push((message as { success: boolean }).success);

      pool.intercept({ method: "POST", path: LOGIN_PATH }).reply(200, "", { headers: { "set-cookie": "TOKEN=old", "x-csrf-token": "csrf1" } });

      await auth.login({ host, password: "p", username: "u" });
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

      assert.deepEqual(outcomes, [ true, false ], "the channel must report each relogin outcome in order");
    });
  });
});
