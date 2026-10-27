/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * auth.ts: The authentication session for the UniFi Protect library - the UniFi OS credential handshake, CSRF rotation, and the 401-triggered relogin hook.
 */
import { isTransientStatus, responseOk } from "./http.ts";
import type { AuthReloginPayload } from "../diagnostics.ts";
import type { IncomingHttpHeaders } from "node:http";
import { ProtectAuthError } from "../errors.ts";
import type { ProtectLogging } from "../logging.ts";
import type { Transport } from "./http.ts";
import { channels } from "../diagnostics.ts";
import { noopLog } from "../logging.ts";

/**
 * The credentials for a Protect controller. `host` is the controller's URL authority, the address without a scheme as a URL carries it: an IPv6 literal bracketed and
 * any port kept (e.g., `"192.168.1.1"` or `"[fe80::1]"`). The session derives the UniFi OS login URL from it and names the controller by it in the sign-in log.
 *
 * @category Transport
 */
export interface ProtectCredentials {

  host: string;
  password: string;
  username: string;
}

/**
 * Construction options for {@link AuthSession}. The session performs its handshake through the supplied {@link Transport}, which is the only dependency it holds -
 * the import points downward (`AuthSession` -> `Transport`), never the reverse.
 *
 * @category Transport
 */
export interface AuthSessionOptions {

  log?: ProtectLogging;
  transport: Transport;
}

/**
 * Read a single header value, normalizing undici's `string | string[] | undefined` shape to a string or `null`. Multi-value headers (the `Set-Cookie` shape) collapse
 * to their first entry, which is all the handshake needs - the session cookie is a single token.
 *
 * @param name    - The header name (matched case-insensitively).
 * @param headers - The response headers.
 *
 * @returns The header's first value, or `null` when absent or empty.
 */
function getHeader(name: string, headers: IncomingHttpHeaders): string | null {

  const raw = headers[name.toLowerCase()];

  if(!raw) {

    return null;
  }

  return Array.isArray(raw) ? (raw[0] ?? null) : raw;
}

/**
 * Read a login answer as a verdict on the credentials. A 4xx is the controller judging the request it was sent, except a status the transport reads as transient:
 * one in its retried set, which a controller rebooting or shedding load answers with (a 400 or a 404 mid-reboot among them), or a 429, its rate limit, and neither
 * says anything about the credentials. A 3xx or a 5xx says nothing about them at all.
 *
 * @param statusCode - The status the controller answered with.
 *
 * @returns `true` when the answer rejects the sign-in, `false` otherwise.
 */
function rejectedSignIn(statusCode: number): boolean {

  return (statusCode >= 400) && (statusCode <= 499) && !isTransientStatus(statusCode);
}

/**
 * Owns the authenticated session against a Protect controller: the UniFi OS credential handshake, the session cookie, the CSRF token and its rotation, and the
 * relogin used when a request comes back 401.
 *
 * The session composes {@link Transport} - it sends its handshake requests through the transport (so login traffic is pooled, timed, throttle-aware, and observable
 * like any other request) using `authRetry: false` so a handshake 401 cannot recurse back into relogin. It exposes the hooks the transport wires in at the
 * composition root: {@link AuthSession.authHeaders} (the cookie + CSRF headers stamped onto every authenticated request) and {@link AuthSession.reauthenticate} (the
 * `onUnauthorized` hook, told whether the request that met the 401 was the recovery probe). Because those hooks are plain methods the transport invokes through
 * injected function references, `Transport` never imports `AuthSession`: the dependency flows in one direction only.
 *
 * State is invalid-by-default: {@link AuthSession.isAuthenticated} is true only once every session-defining credential the controller requires is in hand.
 * There is no `Nullable` return on the surface - {@link AuthSession.login} resolves on success and throws {@link ProtectAuthError} on credential failure.
 *
 * @category Transport
 */
export class AuthSession {

  readonly #log: ProtectLogging;
  readonly #transport: Transport;

  // The session's cookie token, CSRF token, and the credentials retained from login (kept so the relogin hook can re-run the handshake without the caller
  // re-supplying them) are each null until a successful login.
  #cookie: string | null = null;
  #credentials: ProtectCredentials | null = null;
  #csrfToken: string | null = null;
  // The in-flight coalescing gate for relogin: the promise of the single handshake every overlapping caller shares, cleared when that run settles so no state
  // crosses from one run to the next.
  #reauthInFlight: Promise<boolean> | null = null;

  constructor(options: AuthSessionOptions) {

    this.#log = options.log ?? noopLog;
    this.#transport = options.transport;
  }

  /**
   * Whether the session currently holds a complete set of credentials (a session cookie and a CSRF token). Synchronous - safe on a hot path.
   */
  get isAuthenticated(): boolean {

    return (this.#cookie !== null) && (this.#csrfToken !== null);
  }

  /**
   * The headers to stamp on every authenticated request: the session cookie and the CSRF token, each included only when held. Wired into the transport as its
   * `getAuthHeaders` hook.
   *
   * @returns The auth headers, possibly empty before login completes.
   */
  authHeaders(): Record<string, string> {

    const headers: Record<string, string> = {};

    if(this.#cookie !== null) {

      headers["cookie"] = this.#cookie;
    }

    if(this.#csrfToken !== null) {

      headers["x-csrf-token"] = this.#csrfToken;
    }

    return headers;
  }

  /**
   * Authenticate with the controller. Retains the credentials for later relogin, performs the handshake - a fresh CSRF token read from the controller root, then one
   * login - and on failure throws.
   *
   * @param credentials - The controller address and account credentials.
   * @param opts        - Optional abort signal threaded through the handshake requests.
   *
   * @throws {@link ProtectAuthError} if the handshake does not yield a cookie and CSRF token.
   * @throws {@link ProtectRequestError} if the controller root answers with a readiness status or a rate limit, before any login is sent, or the login is answered
   *   with a status that is no verdict on the credentials, such as a readiness answer the transport already retried, or returned at once because it carried a
   *   Retry-After hint, which a reconnecting caller retries again later.
   */
  async login(credentials: ProtectCredentials, opts: { signal?: AbortSignal } = {}): Promise<void> {

    /* We snapshot the credentials rather than holding the caller's object. The handshake and the relogin's stale-session guard read this field long after login()
     * returns and compare it by reference to decide whether an in-flight handshake still belongs to the current session, so the session's identity needs to be its
     * own - independent of anything the caller later does with the object it passed us.
     */
    this.#credentials = { ...credentials };

    if(!(await this.#handshake({ probe: false, ...((opts.signal !== undefined) && { signal: opts.signal }) }))) {

      throw new ProtectAuthError("Unable to authenticate with the UniFi Protect controller. Please check the configured address, username, and password.");
    }

    this.#log.info("Authenticated with the UniFi Protect controller.", { host: credentials.host, username: credentials.username });
  }

  /**
   * End the session and forget the credentials. After logout a fresh {@link AuthSession.login} is required; the relogin hook will not re-authenticate (there are no
   * credentials to use), which is the correct response to an explicit logout.
   */
  logout(): void {

    this.#cookie = null;
    this.#credentials = null;
    this.#csrfToken = null;
  }

  /**
   * Re-run the handshake with the retained credentials. Wired into the transport as its `onUnauthorized` hook: the transport invokes it when a request returns 401,
   * then retries the original request once if this resolves `true`, hands the 401 back if it resolves `false`, and throws whatever this rejects with.
   *
   * Concurrent calls coalesce into one handshake. Two requests in flight through one transport can both come back 401 and both invoke this hook, and running two
   * handshakes against each other would leave the cookie and CSRF token written by whichever finished last, which need not be the one whose token the controller
   * considers current. A call that joins a handshake already in flight shares its fate and its mark.
   *
   * @param opts - Whether the request that met the 401 was the connection-recovery probe. A probe's relogin sends every request of its handshake with the probe's
   *   mark, so the relogin reaches the controller through an open breaker as the probe itself did, and books what the controller answered.
   *
   * @returns `true` if re-authentication established a session, `false` if the controller refused the sign-in or accepted it without a complete session, there are
   *   no retained credentials, or the session was ended or replaced while the relogin ran.
   *
   * @throws The handshake's own failure, once the relogin's outcome is published: {@link ProtectRequestError} for an answer that is no verdict on the credentials,
   *   a transport-level failure such as {@link ProtectNetworkError}, or {@link ProtectThrottledError} for a relogin the open breaker refused.
   */
  async reauthenticate(opts: { probe?: boolean } = {}): Promise<boolean> {

    if(this.#reauthInFlight !== null) {

      return this.#reauthInFlight;
    }

    const attempt = this.#reauthenticateOnce({ probe: opts.probe === true });

    this.#reauthInFlight = attempt;

    try {

      return await attempt;
    } finally {

      this.#reauthInFlight = null;
    }
  }

  /* One relogin run, shared by every caller that arrived while it was in flight, on the terms of the caller that started it: a request that joins a relogin already
   * in flight shares its fate and its mark. A recovery probe that joins the relogin of a gated request is therefore refused with it while the breaker cools, a trade
   * the monitor's next probe corrects with a relogin of its own.
   *
   * It resolves true when the handshake established a session, and the request that met the 401 is retried, and false when the controller refused the sign-in or
   * accepted it without a complete session, no credentials are held, or the session was ended or replaced while it ran, and that request is handed its own 401 back.
   * A handshake that throws met something other than a verdict on the credentials - the breaker may be open, a network failure surfaces as the recoverable
   * ProtectNetworkError and a readiness answer or a rate limit as ProtectRequestError, and a failing or rebooting controller is often exactly the weather that
   * produced the 401 - so that throw is published on the channel like any other unsuccessful relogin and then rethrown, and the request that met the 401 throws the
   * failure that ended its relogin rather than a refused sign-in it never met.
   */
  async #reauthenticateOnce(opts: { probe: boolean }): Promise<boolean> {

    let failure: { readonly error: unknown } | null = null;
    let success = false;

    // Re-run the handshake only when we still hold credentials - an explicit logout clears them, and there is then nothing to recover. Drop the session cookie and
    // the CSRF token first, so the relogin starts from no session: the transport stamps the session's headers beneath every request's own, so a retained token would
    // otherwise go out on a login the root gave none for.
    if(this.#credentials !== null) {

      this.#cookie = null;
      this.#csrfToken = null;

      try {

        success = await this.#handshake(opts);
      } catch(error) {

        failure = { error };
        this.#log.debug("The attempt to re-authenticate with the UniFi Protect controller could not be completed.", error);
      }
    }

    // Publish the relogin outcome before any failure is rethrown, so every run publishes exactly once, whatever ended it. It is the one record of the relogin itself:
    // the request that met the 401 shows it only through the answer it then returns or the failure it throws. Gated on subscribers so we build no payload when
    // nobody is listening.
    if(channels.authRelogin.hasSubscribers) {

      channels.authRelogin.publish({ success } satisfies AuthReloginPayload);
    }

    // The failure is held in a record rather than in a bare binding, so a handshake that threw a falsy value is still told apart from one that threw nothing.
    if(failure !== null) {

      throw failure.error;
    }

    return success;
  }

  /* Drop the session cookie after a handshake that did not complete, so the session holds no half-formed state between that handshake and the next. The
   * credentials are deliberately kept, because a failed handshake is not a reason to forget who we are.
   *
   * The write is conditioned on the session still being the one the handshake started from, for the same reason the success write is: a handshake can settle long
   * after the session it belongs to has been replaced. A fresh login does not wait behind an in-flight relogin, so a relogin that fails afterward would otherwise
   * clear a cookie that belongs to the login that replaced it - wiping a live session on the strength of a failure that was never about it.
   */
  #clearFailedSession(credentials: ProtectCredentials): void {

    if(this.#credentials !== credentials) {

      return;
    }

    this.#cookie = null;
  }

  /* Run the UniFi OS handshake: read a fresh CSRF token from the controller root, then post the login exactly once, carrying the root's token when it answered with
   * one and none otherwise, because the controller accepts a correct login sent without one. A wrong password therefore costs one attempt against a sign-in threshold
   * UniFi OS does not publish. On success, capture the rotated CSRF token (the controller returns it as X-Updated-CSRF-Token, falling back to X-CSRF-Token) and the
   * bare session cookie. Returns whether a complete session was established. Self-sufficient in its auth headers - it stamps the fetched token explicitly rather than
   * relying on the transport's getAuthHeaders hook being wired back to this same session. The fetched token is the handshake's own until the login succeeds: the
   * session writes only the token the login's answer carries.
   *
   * A false return is a rejected sign-in, which login() reports as bad credentials and which a reconnecting consumer counts against its budget, so only an answer that
   * judges the credentials earns it: a 4xx that is neither a readiness answer nor a rate limit. A readiness answer, which the transport already retried unless it
   * carried a Retry-After hint, a rate limit, a 3xx, or any other 5xx says nothing about the credentials, so each throws the error the transport classifies it as,
   * and a controller answering mid-reboot or shedding sign-ins is never reported as a wrong password. The controller root's answer is read by the same rule ahead of
   * the login: a readiness answer or a rate limit there throws before any password is sent, because a controller not ready to serve its root is not ready to judge a
   * sign-in.
   *
   * Every request the handshake sends carries the marks the caller hands it: its signal, and the probe's mark for a relogin a recovery probe triggered, which lets
   * that relogin through an open breaker as the probe was let through. The login carries the mark of its own because the root's answer need not close the breaker:
   * a root that answers a status of 500 or above outside the readiness set books a failure and re-arms the cooldown, yet hands the login no error to stop on.
   */
  async #handshake(opts: { probe: boolean; signal?: AbortSignal }): Promise<boolean> {

    const credentials = this.#credentials;

    if(credentials === null) {

      return false;
    }

    const marks = { probe: opts.probe, ...((opts.signal !== undefined) && { signal: opts.signal }) };
    const root = await this.#transport.send("https://" + credentials.host, { authRetry: false, method: "GET", ...marks });

    // A root answering with a readiness status or a rate limit means the controller is not ready to judge a sign-in, so its classified error surfaces before any
    // password is sent. Any other root answer that is not a 2xx yields no token, and the login goes without one.
    if(isTransientStatus(root.statusCode)) {

      root.ensureOk();
    }

    const fetchedToken = responseOk(root.statusCode) ? getHeader("x-csrf-token", root.headers) : null;

    // A logout, or a fresh login that does not wait behind a handshake in flight, may have ended or replaced the session while the root was read. The password then
    // belongs to a session that is over, so the handshake posts nothing, as the success write below discards a login that settles after the session changed.
    if(this.#credentials !== credentials) {

      return false;
    }

    // authRetry is false so a login 401 surfaces as the response rather than recursing into relogin.
    const response = await this.#transport.send("https://" + credentials.host + "/api/auth/login", {

      authRetry: false,
      body: JSON.stringify({ password: credentials.password, rememberMe: true, token: "", username: credentials.username }),
      headers: { "content-type": "application/json", ...((fetchedToken !== null) && { "x-csrf-token": fetchedToken }) },
      method: "POST",
      ...marks
    });

    // A login answered with anything but a 2xx ends the handshake, so the session is cleared first and a session that held a cookie never keeps it past a login the
    // controller did not accept. A rejected sign-in then returns false; every other answer throws its classified error from ensureOk, which throws for every non-2xx.
    if(!responseOk(response.statusCode)) {

      this.#clearFailedSession(credentials);

      if(rejectedSignIn(response.statusCode)) {

        return false;
      }

      response.ensureOk();
    }

    const csrfToken = getHeader("x-updated-csrf-token", response.headers) ?? getHeader("x-csrf-token", response.headers);
    const cookie = getHeader("set-cookie", response.headers);

    if((csrfToken !== null) && (cookie !== null)) {

      /* The controller accepted this login, but the session it belongs to may already be gone: a logout while the request was in flight ends the session
       * client-side without the controller ever hearing about it, and the login then succeeds regardless. Writing this session would silently re-arm a session the
       * caller explicitly ended, so a handshake whose credentials are no longer the current ones discards its result instead.
       */
      if(this.#credentials !== credentials) {

        return false;
      }

      // Keep only the token=value pair, stripping the cookie's attributes (Path, Expires, HttpOnly, ...) so subsequent requests send the bare value. indexOf +
      // substring keeps the result unambiguously a string, where split(";")[0] would type as string | undefined under noUncheckedIndexedAccess.
      const semicolonIndex = cookie.indexOf(";");

      this.#cookie = (semicolonIndex === -1) ? cookie : cookie.substring(0, semicolonIndex);
      this.#csrfToken = csrfToken;

      return true;
    }

    // The controller answered but without both halves of a session, which is a failed handshake however successful the status was.
    this.#clearFailedSession(credentials);

    return false;
  }
}
