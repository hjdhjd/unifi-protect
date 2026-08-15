/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * auth.ts: The authentication session for the UniFi Protect library - the UniFi OS credential handshake, CSRF rotation, and the 401-triggered relogin hook.
 */
import type { AuthReloginPayload } from "../diagnostics.ts";
import type { IncomingHttpHeaders } from "node:http";
import { ProtectAuthError } from "../errors.ts";
import type { ProtectLogging } from "../logging.ts";
import type { Transport } from "./http.ts";
import { channels } from "../diagnostics.ts";
import { noopLog } from "../logging.ts";
import { responseOk } from "./http.ts";

/**
 * The credentials for a Protect controller. `host` is the controller address without a scheme (e.g., `"192.168.1.1"`); the session derives the UniFi OS login URL
 * from it.
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
 * Owns the authenticated session against a Protect controller: the UniFi OS credential handshake, the session cookie, the CSRF token and its rotation, and the
 * relogin used when a request comes back 401.
 *
 * The session composes {@link Transport} - it sends its handshake requests through the transport (so login traffic is pooled, timed, throttle-aware, and observable
 * like any other request) using `authRetry: false` so a handshake 401 cannot recurse back into relogin. It exposes two hooks the transport wires in at the
 * composition root: {@link AuthSession.authHeaders} (the cookie + CSRF headers stamped onto every authenticated request) and {@link AuthSession.reauthenticate} (the
 * `onUnauthorized` hook). Because those hooks are plain methods the transport invokes through injected function references, `Transport` never imports `AuthSession`:
 * the dependency flows in one direction only.
 *
 * State is invalid-by-default: {@link AuthSession.isAuthenticated} is true only once both a cookie and a CSRF token are in hand. There is no `Nullable` return on the
 * surface - {@link AuthSession.login} resolves on success and throws {@link ProtectAuthError} on credential failure.
 *
 * @category Transport
 */
export class AuthSession {

  readonly #log: ProtectLogging;
  readonly #transport: Transport;

  // The session is defined entirely by these three: the bare cookie token, the current CSRF token, and the credentials we logged in with (retained so the relogin
  // hook can re-run the handshake without the caller re-supplying them). All three are null until a successful login.
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
   * Whether the session currently holds a complete set of credentials (both a session cookie and a CSRF token). Synchronous - safe on a hot path.
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
   * Authenticate with the controller. Retains the credentials for later relogin, performs the handshake, and on failure throws.
   *
   * @param credentials - The controller address and account credentials.
   * @param opts        - Optional abort signal threaded through the handshake requests.
   *
   * @throws {@link ProtectAuthError} if the handshake does not yield a cookie and CSRF token.
   */
  async login(credentials: ProtectCredentials, opts: { signal?: AbortSignal } = {}): Promise<void> {

    this.#credentials = credentials;

    if(!(await this.#handshake(opts.signal))) {

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
   * then retries the original request once if this resolves `true`.
   *
   * Concurrent calls coalesce into one handshake. Two requests in flight through one transport can both come back 401 and both invoke this hook, and running two
   * handshakes against each other would leave the cookie and CSRF token written by whichever finished last, which need not be the one whose token the controller
   * considers current.
   *
   * @returns `true` if re-authentication succeeded, `false` if there are no retained credentials, the handshake failed, or it could not be attempted.
   */
  async reauthenticate(): Promise<boolean> {

    if(this.#reauthInFlight !== null) {

      return this.#reauthInFlight;
    }

    const attempt = this.#reauthenticateOnce();

    this.#reauthInFlight = attempt;

    try {

      return await attempt;
    } finally {

      this.#reauthInFlight = null;
    }
  }

  // One relogin run, shared by every caller that arrived while it was in flight. It resolves rather than rejects on every path: the transport's hook contract is a
  // boolean, and the request that tripped the 401 belongs to some unrelated caller which must receive its own 401-derived result rather than an error raised by a
  // recovery it never asked for. A handshake can genuinely throw here - the transport surfaces network failure as typed errors, and a failing network is often exactly
  // the weather that produced the 401 - so that throw settles this false and is reported on the channel like any other unsuccessful relogin.
  async #reauthenticateOnce(): Promise<boolean> {

    let success = false;

    // Re-run the handshake only when we still hold credentials - an explicit logout clears them, and there is then nothing to recover. Drop the stale session cookie
    // first so the handshake re-establishes it from scratch; the retained CSRF token is reused as the starting point (the controller rotates it on a successful login).
    if(this.#credentials !== null) {

      this.#cookie = null;

      try {

        success = await this.#handshake();
      } catch(error) {

        this.#log.debug("The attempt to re-authenticate with the UniFi Protect controller could not be completed.", error);
      }
    }

    // Publish the relogin outcome. This is the only signal a consumer gets for mid-session session recovery, which is otherwise silent - the transport calls this hook
    // on a 401 and the consumer never sees a return value. Gated on subscribers so we build no payload when nobody is listening.
    if(channels.authRelogin.hasSubscribers) {

      channels.authRelogin.publish({ success } satisfies AuthReloginPayload);
    }

    return success;
  }

  /* Drop the session cookie after a handshake that did not complete, so a later relogin restarts from a clean slate rather than reusing half-formed state. The
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

  // Run the UniFi OS handshake. Attempt a direct login first; if it fails and we hold no CSRF token, fetch one from the controller root and retry the login once. On
  // success, capture the rotated CSRF token (the controller returns it as X-Updated-CSRF-Token, falling back to X-CSRF-Token) and the bare session cookie. Returns
  // whether a complete session was established. Self-sufficient in its auth headers - it stamps the CSRF token explicitly rather than relying on the transport's
  // getAuthHeaders hook being wired back to this same session.
  async #handshake(signal?: AbortSignal): Promise<boolean> {

    const credentials = this.#credentials;

    if(credentials === null) {

      return false;
    }

    const loginUrl = "https://" + credentials.host + "/api/auth/login";
    const loginBody = JSON.stringify({ password: credentials.password, rememberMe: true, token: "", username: credentials.username });

    let response = await this.#postLogin(loginUrl, loginBody, signal);

    // The controller rejected the login and we have no CSRF token to offer. UniFi OS gates login behind CSRF protection, so fetch a token from the root document and
    // retry the login once with it in hand.
    if(!responseOk(response.statusCode) && (this.#csrfToken === null)) {

      const csrfResponse = await this.#transport.send("https://" + credentials.host, { authRetry: false, method: "GET", ...((signal !== undefined) && { signal }) });

      if(responseOk(csrfResponse.statusCode)) {

        const token = getHeader("x-csrf-token", csrfResponse.headers);

        if(token !== null) {

          this.#csrfToken = token;
          response = await this.#postLogin(loginUrl, loginBody, signal);
        }
      }
    }

    if(!responseOk(response.statusCode)) {

      this.#clearFailedSession(credentials);

      return false;
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

  // Post the login request, stamping content-type and (when held) the CSRF token explicitly. authRetry is false so a login 401 surfaces as the response rather than
  // recursing into relogin.
  async #postLogin(loginUrl: string, loginBody: string, signal?: AbortSignal): ReturnType<Transport["send"]> {

    const headers: Record<string, string> = { "content-type": "application/json", ...((this.#csrfToken !== null) && { "x-csrf-token": this.#csrfToken }) };

    return this.#transport.send(loginUrl, { authRetry: false, body: loginBody, headers, method: "POST", ...((signal !== undefined) && { signal }) });
  }
}
