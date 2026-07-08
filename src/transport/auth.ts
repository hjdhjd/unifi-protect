/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * auth.ts: The authentication session for the UniFi Protect library - the UniFi OS credential handshake, CSRF rotation, and the 401-triggered relogin seam.
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
 * like any other request) using `authRetry: false` so a handshake 401 cannot recurse back into relogin. It exposes two seams the transport wires in at the
 * composition root: {@link AuthSession.authHeaders} (the cookie + CSRF headers stamped onto every authenticated request) and {@link AuthSession.reauthenticate} (the
 * `onUnauthorized` hook). Because those seams are plain methods the transport invokes through injected function references, `Transport` never imports `AuthSession`:
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
   * `getAuthHeaders` seam.
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
   * Re-run the handshake with the retained credentials. Wired into the transport as its `onUnauthorized` seam: the transport invokes it when a request returns 401,
   * then retries the original request once if this resolves `true`.
   *
   * @returns `true` if re-authentication succeeded, `false` if there are no retained credentials or the handshake failed.
   */
  async reauthenticate(): Promise<boolean> {

    let success = false;

    // Re-run the handshake only when we still hold credentials - an explicit logout clears them, and there is then nothing to recover. Drop the stale session cookie
    // first so the handshake re-establishes it from scratch; the retained CSRF token is reused as the starting point (the controller rotates it on a successful login).
    if(this.#credentials !== null) {

      this.#cookie = null;
      success = await this.#handshake();
    }

    // Publish the relogin outcome. This is the only signal a consumer gets for mid-session session recovery, which is otherwise silent - the transport calls this hook
    // on a 401 and the consumer never sees a return value. Gated on subscribers so we build no payload when nobody is listening.
    if(channels.authRelogin.hasSubscribers) {

      channels.authRelogin.publish({ success } satisfies AuthReloginPayload);
    }

    return success;
  }

  // Run the UniFi OS handshake. Attempt a direct login first; if it fails and we hold no CSRF token, fetch one from the controller root and retry the login once. On
  // success, capture the rotated CSRF token (the controller returns it as X-Updated-CSRF-Token, falling back to X-CSRF-Token) and the bare session cookie. Returns
  // whether a complete session was established. Self-sufficient in its auth headers - it stamps the CSRF token explicitly rather than relying on the transport's
  // getAuthHeaders seam being wired back to this same session.
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

      // Drop the session (but keep the credentials) so a later relogin restarts the handshake from a clean slate rather than reusing half-formed state.
      this.#cookie = null;

      return false;
    }

    const csrfToken = getHeader("x-updated-csrf-token", response.headers) ?? getHeader("x-csrf-token", response.headers);
    const cookie = getHeader("set-cookie", response.headers);

    if((csrfToken !== null) && (cookie !== null)) {

      // Keep only the token=value pair, stripping the cookie's attributes (Path, Expires, HttpOnly, ...) so subsequent requests send the bare value. indexOf +
      // substring keeps the result unambiguously a string, where split(";")[0] would type as string | undefined under noUncheckedIndexedAccess.
      const semicolonIndex = cookie.indexOf(";");

      this.#cookie = (semicolonIndex === -1) ? cookie : cookie.substring(0, semicolonIndex);
      this.#csrfToken = csrfToken;

      return true;
    }

    this.#cookie = null;

    return false;
  }

  // Post the login request, stamping content-type and (when held) the CSRF token explicitly. authRetry is false so a login 401 surfaces as the response rather than
  // recursing into relogin.
  async #postLogin(loginUrl: string, loginBody: string, signal?: AbortSignal): ReturnType<Transport["send"]> {

    const headers: Record<string, string> = { "content-type": "application/json", ...((this.#csrfToken !== null) && { "x-csrf-token": this.#csrfToken }) };

    return this.#transport.send(loginUrl, { authRetry: false, body: loginBody, headers, method: "POST", ...((signal !== undefined) && { signal }) });
  }
}
