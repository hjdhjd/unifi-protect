/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * http.ts: The HTTP transport for the UniFi Protect library - undici pooling, signal composition, typed-error classification, and the throttle circuit breaker.
 */
import type { HttpRequestEndPayload, HttpRequestStartPayload } from "../diagnostics.ts";
import { PROTECT_API_ERROR_LIMIT, PROTECT_API_RETRY_INTERVAL, PROTECT_API_TIMEOUT } from "../settings.ts";
import { Pool, errors, interceptors, request } from "undici";
import { ProtectAbortedError, ProtectAuthError, ProtectAuthorizationError, ProtectNetworkError, ProtectProtocolError, ProtectRequestError, ProtectThrottledError,
  ProtectTimeoutError } from "../errors.ts";
import type { Clock } from "../clock.ts";
import type { Dispatcher } from "undici";
import { EventBus } from "../event-bus.ts";
import type { FatalError } from "../errors.ts";
import type { IncomingHttpHeaders } from "node:http";
import type { ProtectLogging } from "../logging.ts";
import type { StreamOptions } from "../event-bus.ts";
import { channels } from "../diagnostics.ts";
import { noopLog } from "../logging.ts";
import { randomUUID } from "node:crypto";
import { wallClock } from "../clock.ts";

// The transient-failure status codes the undici retry interceptor retries before `send` ever observes a response. These are intentional and specific to how Protect
// controllers behave under load and during reboots - they must not be trimmed (notably 400 and 404, which a controller transiently returns mid-reboot). This is the
// HTTP-layer retry surface and is distinct from the throttle circuit breaker below, which counts the failures that survive these retries.
const RETRY_STATUS_CODES = [ 400, 404, 429, 500, 502, 503, 504 ] as const;

// The throttle cooldown in milliseconds, derived once from the seconds-valued constant so the breaker math reads in the same unit it compares against.
const COOLDOWN_MS = PROTECT_API_RETRY_INTERVAL * 1000;

/**
 * The events the {@link Transport} publishes on its three-rail surface. Both are parameterless: a consumer that needs the cooldown duration reads it from the
 * {@link ProtectThrottledError} thrown by `send`, and a consumer that needs richer detail subscribes to the `unifi-protect:http:throttle:*` diagnostics channels.
 *
 * @category Transport
 */
export interface TransportEvents {

  throttleEntered: [];
  throttleExited: [];
}

/**
 * The HTTP methods the transport dispatches. One vocabulary for a request's verb, shared by {@link RequestOptions} and the device-command primitive so the set is defined
 * once rather than re-spelled.
 *
 * @category Transport
 */
export type HttpMethod = "DELETE" | "GET" | "HEAD" | "PATCH" | "POST";

/**
 * Per-request options accepted by {@link Transport.request} and {@link Transport.send}. The library composes the caller's `signal` with its own timeout deadline, so
 * a caller can cancel independently of the timeout. `headers` here override the auth headers the transport stamps on automatically.
 *
 * @category Transport
 */
export interface RequestOptions {

  body?: string | Uint8Array;
  headers?: Record<string, string>;
  method?: HttpMethod;
  signal?: AbortSignal;
  timeout?: number;
}

/**
 * The lower-level {@link Transport.send} options. Both flags follow the same pattern: a special caller opting out of one default send behavior.
 *
 * - `authRetry` controls the injected 401-relogin hook: the authenticated request path leaves it at its default of `true`, while the `AuthSession` login handshake
 *   passes `false` so its own 401 cannot recurse back into relogin.
 * - `probe` marks a request as the connection-recovery reachability trial. It skips the open breaker's cooldown gate so the trial can dispatch at the
 *   `ConnectionMonitor`'s cadence rather than waiting out the 300-second cooldown, while still booking its outcome through the normal path - so a successful probe
 *   closes the breaker exactly as the autonomous half-open trial would. Only the monitor's recovery seams (`verify`, recovery `reBootstrap`) pass `true`; the refresh
 *   failsafe and device commands leave it `false` and stay gated, so the breaker still protects against operational hammering.
 *
 * @category Transport
 */
export interface SendOptions extends RequestOptions {

  authRetry?: boolean;
  probe?: boolean;
}

/**
 * Construction options for {@link Transport}. `host` is the controller address; everything else is an injected seam.
 *
 * - `dispatcher` substitutes the undici dispatcher (an `undici.MockAgent` in tests, or a consumer-supplied pool). When injected, the transport never destroys or
 *   rebuilds it - lifecycle stays with the injector, so `reset()` and disposal are no-ops on the dispatcher.
 * - `getAuthHeaders` supplies the cookie + CSRF headers stamped onto every request. `onUnauthorized` is the relogin hook invoked on a 401 before a single retry.
 *   Both point upward at `AuthSession`, so they are passed as plain function seams (dependency inversion) rather than an `AuthSession` import.
 *
 * @category Transport
 */
export interface TransportOptions {

  clock?: Clock;
  dispatcher?: Dispatcher;
  getAuthHeaders?: () => Record<string, string>;
  host: string;
  log?: ProtectLogging;
  onUnauthorized?: () => Promise<boolean>;
}

/**
 * Determine whether an HTTP status code is a 2xx success. `undefined` (no response received) and any non-2xx code are failures.
 *
 * @param statusCode - The status code to test.
 *
 * @returns `true` for 200-299, `false` otherwise.
 */
export function responseOk(statusCode: number | undefined): boolean {

  return (statusCode !== undefined) && (statusCode >= 200) && (statusCode <= 299);
}

/**
 * Flatten undici's `IncomingHttpHeaders` (whose values are `string | string[] | undefined`) to a plain `Record<string, string>` for {@link ProtectRequestError}. A
 * multi-value header is joined with ", " and an absent value is dropped.
 *
 * @param headers - The response headers as undici delivers them.
 *
 * @returns A flat header record with no undefined values.
 */
function flattenHeaders(headers: IncomingHttpHeaders): Record<string, string> {

  const result: Record<string, string> = {};

  for(const [ key, value ] of Object.entries(headers)) {

    if(value === undefined) {

      continue;
    }

    result[key] = Array.isArray(value) ? value.join(", ") : value;
  }

  return result;
}

/**
 * Map a non-2xx status to the single typed `FatalError` it represents. This is the one place in the library that turns an HTTP status into an error class, so the
 * mapping cannot drift between callers: 401 is an authentication failure, 403 an authorization failure, and everything else carries the controller's own status,
 * body, and headers for the caller to inspect.
 *
 * @param statusCode - The non-2xx status code.
 * @param headers    - The response headers, preserved on {@link ProtectRequestError}.
 * @param body       - The response body bytes, surfaced as text on {@link ProtectRequestError}.
 *
 * @returns The classified `FatalError`.
 */
function classifyStatus(statusCode: number, headers: IncomingHttpHeaders, body: Buffer): FatalError {

  switch(statusCode) {

    case 401:

      return new ProtectAuthError("Authentication with the UniFi Protect controller failed.", { statusCode });

    case 403:

      return new ProtectAuthorizationError("The account lacks the privileges this operation requires on the UniFi Protect controller.", { statusCode });

    default:

      return new ProtectRequestError("The UniFi Protect controller returned an error response.",
        { body: body.length ? body.toString("utf8") : undefined, headers: flattenHeaders(headers), statusCode });
  }
}

/**
 * An HTTP response from the Protect controller, returned by {@link Transport.send}. The body is eagerly buffered (so no undrained stream can hold a slot in the
 * connection pool), and decoding is synchronous and lazy on top of that buffer. `send` returns this for *any* status; call {@link ProtectResponse.ensureOk} to turn
 * a non-2xx into its typed `FatalError`.
 *
 * @category Transport
 */
export class ProtectResponse {

  /** The HTTP status code. */
  readonly statusCode: number;

  /** The response headers as undici delivered them. */
  readonly headers: IncomingHttpHeaders;

  /** The fully buffered response body. Consumers needing raw bytes (e.g., a snapshot JPEG) read this directly. */
  readonly body: Buffer;

  constructor(statusCode: number, headers: IncomingHttpHeaders, body: Buffer) {

    this.body = body;
    this.headers = headers;
    this.statusCode = statusCode;
  }

  /**
   * Parse the body as JSON. Synchronous - the bytes are already in hand.
   *
   * @typeParam T - The expected shape of the parsed document.
   *
   * @returns The parsed body.
   *
   * @throws {@link ProtectProtocolError} if the body is not valid JSON.
   */
  // This is the deliberate decode point where the caller asserts the document's shape - the type parameter exists to carry that assertion to the call site, so its
  // appearing only in the return position is the intent, not an oversight (the same idiom the platform's own `Response.json()` uses).
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  json<T>(): T {

    try {

      return JSON.parse(this.body.toString("utf8")) as T;
    } catch(error) {

      throw new ProtectProtocolError("The UniFi Protect controller returned a response that could not be parsed as JSON.", { cause: error });
    }
  }

  /**
   * Decode the body as a UTF-8 string.
   *
   * @returns The body text.
   */
  text(): string {

    return this.body.toString("utf8");
  }

  /**
   * Assert a successful response. Returns `this` unchanged on a 2xx so the call chains (`(await send(...)).ensureOk().json<T>()`); throws the classified
   * `FatalError` on any non-2xx.
   *
   * @returns `this`, for chaining.
   *
   * @throws {@link ProtectAuthError} on 401, {@link ProtectAuthorizationError} on 403, {@link ProtectRequestError} on any other non-2xx.
   */
  ensureOk(): this {

    if(responseOk(this.statusCode)) {

      return this;
    }

    throw classifyStatus(this.statusCode, this.headers, this.body);
  }
}

/**
 * The HTTP transport. Owns the undici connection pool, composes each request's deadline with the caller's cancellation, classifies every failure into the typed
 * `ProtectError` hierarchy, and runs the throttle circuit breaker that protects a degraded controller from being hammered.
 *
 * The breaker is the canonical three-state model - `closed -> open -> half-open -> closed`:
 *
 * - **closed:** normal operation. Each completed request books an outcome; a 2xx resets the consecutive-failure count, a non-2xx or transport exception increments
 *   it. Crossing {@link PROTECT_API_ERROR_LIMIT} consecutive failures trips the breaker open.
 * - **open:** for {@link PROTECT_API_RETRY_INTERVAL} seconds, `send` throws {@link ProtectThrottledError} before dispatching - no traffic reaches the controller.
 * - **half-open:** once the cooldown elapses, requests are allowed through again as recovery probes. The first success closes the breaker (and emits `throttleExited`
 *   only then, so the public signal never flaps); a failure re-arms the cooldown from that moment and stays open silently.
 *
 * Reachability lives here; session validity lives in `AuthSession`. The breaker never calls login to probe recovery - the next real request is
 * the probe, and the orthogonal 401-relogin concern is the injected `onUnauthorized` seam. The clock is injected so every transition is deterministically testable.
 *
 * @category Transport
 */
export class Transport implements AsyncDisposable {

  readonly #bus = new EventBus<TransportEvents>();
  readonly #clock: Clock;
  readonly #getAuthHeaders: (() => Record<string, string>) | undefined;
  readonly #host: string;
  readonly #log: ProtectLogging;
  readonly #onUnauthorized: (() => Promise<boolean>) | undefined;
  readonly #ownsDispatcher: boolean;

  // The breaker's only mutable state: the consecutive-failure count and the timestamp the cooldown last (re-)armed. `null` means the breaker is closed. The
  // dispatcher is reassignable because reset() rebuilds the owned pool.
  #consecutiveFailures = 0;
  #dispatcher: Dispatcher;
  #throttledSince: number | null = null;

  constructor(options: TransportOptions) {

    this.#clock = options.clock ?? wallClock;
    this.#getAuthHeaders = options.getAuthHeaders;
    this.#host = options.host;
    this.#log = options.log ?? noopLog;
    this.#onUnauthorized = options.onUnauthorized;

    // When a dispatcher is injected we adopt it and never touch its lifecycle - the injector owns construction and teardown. Otherwise we build (and own) the pool.
    this.#ownsDispatcher = options.dispatcher === undefined;
    this.#dispatcher = options.dispatcher ?? this.#buildPool();
  }

  /**
   * Whether the throttle breaker is currently open (refusing or probing). Reads the breaker state synchronously - safe to call on a hot path. The
   * `ConnectionMonitor` reads this to fold transport health into the connection FSM.
   */
  get isThrottled(): boolean {

    return this.#throttledSince !== null;
  }

  /**
   * Send a request and return the {@link ProtectResponse} for any HTTP status. Throttle-gates before dispatching, composes the caller's signal with the timeout
   * deadline, classifies transport failures into typed errors, books the breaker outcome, and runs the 401-relogin retry (once) when a hook is wired.
   *
   * This is the transport primitive. Callers that want the ergonomic "throw on non-2xx and parse JSON" path use {@link Transport.request}; callers that need raw
   * status, headers, or bytes (the auth handshake, snapshots) use `send` directly.
   *
   * @param url  - The fully-qualified request URL.
   * @param opts - Per-request options.
   *
   * @returns The response.
   *
   * @throws {@link ProtectThrottledError} while the breaker is open and cooling; {@link ProtectTimeoutError}, {@link ProtectAbortedError}, or
   *   {@link ProtectNetworkError} on transport-level failures.
   */
  async send(url: string, opts: SendOptions = {}): Promise<ProtectResponse> {

    // Gate first: if the breaker is open and still inside its cooldown window, refuse locally without touching the network. Once the cooldown has elapsed we fall
    // through and let this request act as the half-open recovery probe; `book` will close or re-arm the breaker based on its outcome. A `probe` request - the
    // ConnectionMonitor's recovery trial - skips this gate entirely: the monitor's backoff curve is the rate limiter while it is recovering, so its probe dispatches
    // at the monitor's cadence and its booked outcome (success closes the breaker, failure re-arms the cooldown) is what keeps re-probe and breaker on one cadence.
    if((opts.probe !== true) && (this.#throttledSince !== null)) {

      const remaining = COOLDOWN_MS - (this.#clock.now() - this.#throttledSince);

      if(remaining > 0) {

        throw new ProtectThrottledError("Requests to the UniFi Protect controller are throttled after repeated failures.", { cooldownMs: remaining });
      }
    }

    // Relogin retry loop. The body of the loop runs at most twice: the original attempt, and - if it returns 401 and a relogin hook is wired and succeeds - one
    // retry with relogin disabled so a persistent 401 cannot spin. Booking happens exactly once, on the attempt whose outcome we return.
    let allowAuthRetry = opts.authRetry ?? true;

    for(;;) {

      let result: { body: Buffer; headers: IncomingHttpHeaders; statusCode: number };

      try {

        // The loop runs at most twice and each iteration must complete before the next can begin, so sequential awaits are the correct shape here.
        // eslint-disable-next-line no-await-in-loop
        result = await this.#dispatch(url, opts);
      } catch(error) {

        // A transport-level exception is a reachability failure - book it before propagating the already-classified error.
        this.#book(false);

        throw error;
      }

      // eslint-disable-next-line no-await-in-loop
      if((result.statusCode === 401) && allowAuthRetry && (this.#onUnauthorized !== undefined) && (await this.#onUnauthorized())) {

        allowAuthRetry = false;

        continue;
      }

      this.#book(responseOk(result.statusCode));

      return new ProtectResponse(result.statusCode, result.headers, result.body);
    }
  }

  /**
   * Send a request, assert a 2xx, and parse the body as JSON. The ergonomic path over {@link Transport.send} for the common JSON case.
   *
   * @typeParam T - The expected shape of the parsed body.
   *
   * @param url  - The fully-qualified request URL.
   * @param opts - Per-request options.
   *
   * @returns The parsed body.
   *
   * @throws The classified `FatalError` on a non-2xx, or a transport-level `ProtectError` on failure.
   */
  async request<T>(url: string, opts: RequestOptions = {}): Promise<T> {

    return (await this.send(url, opts)).ensureOk().json<T>();
  }

  /**
   * Rebuild the owned connection pool, dropping every keepalive connection to the controller. Called when the breaker trips so the next attempt starts from a clean
   * pool rather than reusing sockets to a degraded controller. A no-op when the dispatcher was injected - that lifecycle belongs to the injector.
   */
  reset(): void {

    if(!this.#ownsDispatcher) {

      return;
    }

    void this.#dispatcher.destroy();
    this.#dispatcher = this.#buildPool();
  }

  /**
   * Subscribe to a transport event. Returns a `Disposable`; prefer `using sub = transport.on(...)` so the listener detaches at scope exit.
   *
   * @param event   - The event to listen for.
   * @param handler - Invoked on each emission.
   *
   * @returns A `Disposable` that removes the listener when disposed.
   */
  on<K extends keyof TransportEvents>(event: K, handler: (...args: TransportEvents[K]) => void): Disposable {

    return this.#bus.on(event, handler);
  }

  /**
   * Wait for the next emission of a transport event.
   *
   * @param event - The event to await.
   * @param opts  - Optional abort signal.
   *
   * @returns A promise resolving to the event's argument tuple.
   */
  async once<K extends keyof TransportEvents>(event: K, opts: { signal?: AbortSignal } = {}): Promise<TransportEvents[K]> {

    return this.#bus.once(event, opts);
  }

  /**
   * Stream every subsequent emission of a transport event until the signal aborts.
   *
   * @param event - The event to stream.
   * @param opts  - Stream options, including the abort signal.
   *
   * @returns An async iterable of the event's argument tuples.
   */
  stream<K extends keyof TransportEvents>(event: K, opts: StreamOptions = {}): AsyncIterable<TransportEvents[K]> {

    return this.#bus.stream(event, opts);
  }

  /**
   * Dispose the transport, destroying the owned pool. A no-op on an injected dispatcher.
   */
  async [Symbol.asyncDispose](): Promise<void> {

    if(this.#ownsDispatcher) {

      await this.#dispatcher.destroy();
    }
  }

  // Perform a single HTTP exchange: compose the deadline with the caller's signal, stamp the auth and per-call headers, publish the request diagnostics, buffer the
  // body, and on failure classify the exception into the typed hierarchy. Returns the bare response parts; the breaker and relogin policy live in `send`.
  async #dispatch(url: string, opts: SendOptions): Promise<{ body: Buffer; headers: IncomingHttpHeaders; statusCode: number }> {

    const method = opts.method ?? "GET";
    const requestId = randomUUID();
    const timeout = opts.timeout ?? PROTECT_API_TIMEOUT;

    // Compose our timeout deadline with the caller's optional cancellation. #classifyTransportError later tells the two apart by testing whether the caller's own
    // signal aborted; if it did not, the abort must be our timeout's, since those are the only two signals composed here.
    const timeoutSignal = AbortSignal.timeout(timeout);
    const signal = (opts.signal !== undefined) ? AbortSignal.any([ opts.signal, timeoutSignal ]) : timeoutSignal;

    // The auth headers (cookie + CSRF) are the base; per-call headers override them. A request with no body carries no content-type - that is the caller's concern.
    const headers: Record<string, string> = { ...this.#getAuthHeaders?.(), ...opts.headers };

    if(channels.httpRequestStart.hasSubscribers) {

      channels.httpRequestStart.publish({ method, requestId, url } satisfies HttpRequestStartPayload);
    }

    const startedAt = this.#clock.now();

    try {

      const response = await request(url, { dispatcher: this.#dispatcher, headers, method, signal, ...((opts.body !== undefined) && { body: opts.body }) });
      const body = Buffer.from(await response.body.arrayBuffer());

      this.#publishEnd({ durationMs: this.#clock.now() - startedAt, method, requestId, statusCode: response.statusCode, url });

      return { body, headers: response.headers, statusCode: response.statusCode };
    } catch(error) {

      const classified = this.#classifyTransportError(error, opts.signal, this.#clock.now() - startedAt);

      this.#publishEnd({ durationMs: this.#clock.now() - startedAt, error: classified.message, method, requestId, url });

      throw classified;
    }
  }

  // Book one breaker outcome. Success closes the breaker (and announces recovery only on the closing edge, so `throttleExited` never flaps); failure either trips the
  // breaker once the threshold is crossed, or re-arms the cooldown if a half-open probe just failed.
  #book(ok: boolean): void {

    if(ok) {

      this.#consecutiveFailures = 0;

      if(this.#throttledSince !== null) {

        this.#throttledSince = null;

        this.#log.info("Resumed communication with the UniFi Protect controller after the throttle cooldown elapsed.");

        this.#bus.emit("throttleExited");

        if(channels.httpThrottleExited.hasSubscribers) {

          channels.httpThrottleExited.publish({});
        }
      }

      return;
    }

    this.#consecutiveFailures++;

    // A failure while the breaker is already open means a half-open probe just failed: re-arm the cooldown from now and stay open silently (we never emitted
    // `throttleExited`, so we do not emit `throttleEntered` again - the consumer's view is that we have been throttled the whole time).
    if(this.#throttledSince !== null) {

      this.#throttledSince = this.#clock.now();

      return;
    }

    if(this.#consecutiveFailures >= PROTECT_API_ERROR_LIMIT) {

      this.#throttledSince = this.#clock.now();

      this.#log.error("Throttling requests to the UniFi Protect controller after repeated failures.",
        { consecutiveFailures: this.#consecutiveFailures, cooldownMs: COOLDOWN_MS, errorLimit: PROTECT_API_ERROR_LIMIT });

      this.#bus.emit("throttleEntered");

      if(channels.httpThrottleEntered.hasSubscribers) {

        channels.httpThrottleEntered.publish({ consecutiveFailures: this.#consecutiveFailures, cooldownMs: COOLDOWN_MS });
      }

      // Drop every keepalive connection to the controller so the next probe starts clean.
      this.reset();
    }
  }

  // Classify an undici exception into the typed hierarchy. The abort branch distinguishes our deadline from the caller's cancellation by asking which signal fired:
  // if the caller's signal is aborted it was an explicit cancel, otherwise our timeout won the race.
  #classifyTransportError(error: unknown, callerSignal: AbortSignal | undefined, elapsedMs: number): ProtectAbortedError | ProtectNetworkError | ProtectTimeoutError {

    const isAbort = ((error instanceof DOMException) && ((error.name === "AbortError") || (error.name === "TimeoutError"))) ||
      (error instanceof errors.RequestAbortedError);

    if(isAbort) {

      if(callerSignal?.aborted) {

        return new ProtectAbortedError("The request was aborted by the caller's signal.", { cause: error });
      }

      return new ProtectTimeoutError("The UniFi Protect controller did not respond before the request deadline elapsed.", { cause: error, elapsedMs });
    }

    // Our own pool reset destroyed an in-flight connection. Recoverable: the caller may retry against the freshly rebuilt pool.
    if(error instanceof errors.ClientDestroyedError) {

      return new ProtectNetworkError("The request was interrupted because the connection pool was reset.", { cause: error });
    }

    // The retry interceptor exhausted its attempts without a usable response.
    if(error instanceof errors.RequestRetryError) {

      return new ProtectNetworkError("The UniFi Protect controller could not be reached after exhausting retries.", { cause: error });
    }

    // A connect-phase timeout (distinct from our request deadline) - surface it as a timeout, carrying the elapsed time.
    if(error instanceof errors.ConnectTimeoutError) {

      return new ProtectTimeoutError("The connection to the UniFi Protect controller timed out.", { cause: error, elapsedMs });
    }

    // Everything else is a connect/DNS/TLS/socket failure; ProtectNetworkError lifts the errno from the cause chain.
    return new ProtectNetworkError("A network error occurred communicating with the UniFi Protect controller.", { cause: error });
  }

  // Publish the request:end diagnostic when anyone is listening. Centralized so the success and failure paths emit the same shape.
  #publishEnd(payload: HttpRequestEndPayload): void {

    if(channels.httpRequestEnd.hasSubscribers) {

      channels.httpRequestEnd.publish(payload);
    }
  }

  // Build the owned connection pool: self-signed certs accepted (controllers ship them), HTTP/2 enabled and preferred in the ALPN offer so a controller that supports
  // it negotiates h2 rather than falling back to HTTP/1.1, five concurrent connections, a 60-second client TTL so each pooled connection is recycled roughly once a
  // minute rather than kept alive indefinitely (bounding how long a keepalive socket to a controller that has since rebooted or silently dropped the link can linger
  // before it is retired), a fixed user-agent, and the exponential-backoff retry interceptor. The retried set is the conventionally idempotent verbs plus POST: the
  // interceptor only fires on the transient controller-readiness codes in RETRY_STATUS_CODES and on the transient connection faults undici treats as retryable -
  // conditions in which the controller was not in a state to accept and act on the request - so re-sending a POST does not risk double-applying one that already took
  // effect. PATCH is held out of the set even so, because the config writes it carries are the one place a double-apply would be consequential and the undocumented API
  // offers no idempotency guarantee.
  #buildPool(): Dispatcher {

    const userAgent: Dispatcher.DispatcherComposeInterceptor = (dispatch) => (dispatchOptions, handler) => {

      dispatchOptions.headers ??= {};

      // This cast is safe only because this composed pool's one caller, Transport.#dispatch, always passes headers as a plain object - never the string[] or
      // iterable-of-tuples forms undici's UndiciHeaders union otherwise permits, on which a bracket assignment would silently fail to add a usable header rather than
      // throw. A future caller of this interceptor, or a refactor of #dispatch, must preserve that plain-object invariant.
      (dispatchOptions.headers as Record<string, string | string[]>)["user-agent"] = "unifi-protect";

      return dispatch(dispatchOptions, handler);
    };

    return new Pool("https://" + this.#host, { allowH2: true, clientTtl: 60000, connect: { preferH2: true, rejectUnauthorized: false }, connections: 5 })
      .compose(userAgent, interceptors.retry({ maxRetries: 5, maxTimeout: 1500, methods: [ "DELETE", "GET", "HEAD", "OPTIONS", "POST", "PUT" ], minTimeout: 100,
        statusCodes: [...RETRY_STATUS_CODES], timeoutFactor: 2 }));
  }
}
