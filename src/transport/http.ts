/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * http.ts: The HTTP transport for the UniFi Protect library - undici pooling, signal composition, typed-error classification, and the throttle circuit breaker.
 */
import type { Dispatcher, RetryHandler } from "undici";
import type { HttpRequestEndPayload, HttpRequestStartPayload } from "../diagnostics.ts";
import { PROTECT_API_ERROR_LIMIT, PROTECT_API_RETRY_INTERVAL, PROTECT_API_TIMEOUT } from "../settings.ts";
import { Pool, errors, interceptors, request } from "undici";
import { ProtectAbortedError, ProtectAuthError, ProtectAuthorizationError, ProtectCertificateError, ProtectNetworkError, ProtectProtocolError, ProtectRequestError,
  ProtectThrottledError, ProtectTimeoutError, assertNever } from "../errors.ts";
import { armDeadline, millisecondsSince, wallClock } from "../clock.ts";
import { createOwnedConnector, releaseOwned } from "./connector.ts";
import type { Clock } from "../clock.ts";
import { EventBus } from "../event-bus.ts";
import type { FatalError } from "../errors.ts";
import type { IncomingHttpHeaders } from "node:http";
import type { OwnedDispatcher } from "./connector.ts";
import type { ProtectLogging } from "../logging.ts";
import type { StreamOptions } from "../event-bus.ts";
import { channels } from "../diagnostics.ts";
import { classifyTransportError } from "./failure.ts";
import { noopLog } from "../logging.ts";
import { randomUUID } from "node:crypto";

// The transient-failure status codes the undici retry interceptor retries before `send` observes the controller's last answer, except an answer carrying a
// Retry-After hint, which retryUnlessHinted returns at once whatever its status. These are intentional and specific to how Protect controllers behave under load
// and during reboots - they must not be trimmed (notably 400 and 404, which a controller transiently returns mid-reboot). A 429 is not among them: retrying a rate
// limit multiplies the load the controller asked to shed, so the first 429 returns to its caller, with the controller's Retry-After when it sent one. This is the
// HTTP-layer retry surface and is distinct from the throttle circuit breaker below, which counts the failures that survive these retries. The login handshake reads
// the set through isTransientStatus, with 429 beside it: a status in the set is the controller's readiness answer and a 429 its rate limit, and neither is a
// verdict on the credentials.
const RETRY_STATUS_CODES = [ 400, 404, 500, 502, 503, 504 ] as const;

/* The shape of the owned pool's retry policy: how many retries follow the first attempt, the backoff curve's first delay and ceiling in milliseconds and the factor
 * it grows by on each retry, and the verbs and the statuses the pool retries.
 */
interface RetryPolicy {

  readonly maxRetries: number;
  readonly maxTimeout: number;
  readonly methods: readonly Dispatcher.HttpMethod[];
  readonly minTimeout: number;
  readonly statusCodes: readonly number[];
  readonly timeoutFactor: number;
}

/* The owned pool's retry policy, the one record its retry interceptor is built from and retryUnlessHinted reads, so the two never disagree about a number.
 *
 * `maxRetries`, `minTimeout`, `timeoutFactor` and `maxTimeout` are the backoff curve, sized to outlast the same transient readiness gaps RETRY_STATUS_CODES
 * targets: a reboot or a momentary load spike on a Protect controller typically clears within a few seconds, so the curve gives it that room to recover while
 * keeping a caller from stalling through a much longer wait. The attempts and their backoff all run inside the one request deadline `#dispatch` arms, so a
 * controller too slow to answer every attempt inside it ends the request as a timeout rather than as a response.
 *
 * `methods` is the conventionally retry-safe verbs plus POST. The interceptor fires only on the transient controller-readiness statuses and on the transient
 * connection faults undici treats as retryable, and never on an answer carrying a Retry-After hint, which retryUnlessHinted returns at once. A refused connection
 * or a controller still starting up means the controller was not in a state to accept the request, so re-sending a POST there cannot double-apply it; a 500, a
 * gateway error, or a connection reset can arrive after the controller already acted, so a POST retried on one of those may apply twice. PATCH is held out of the
 * set for that reason, because the config writes it carries are the one place a double-apply would be consequential and the undocumented API promises nothing
 * about what a repeated write does.
 *
 * `statusCodes` is RETRY_STATUS_CODES, whose comment says why the pool retries each status in it and why a 429 is not among them.
 */
export const RETRY_POLICY: RetryPolicy = { maxRetries: 5, maxTimeout: 1500, methods: [ "DELETE", "GET", "HEAD", "OPTIONS", "POST", "PUT" ], minTimeout: 100,
  statusCodes: RETRY_STATUS_CODES, timeoutFactor: 2 };

// The throttle cooldown in milliseconds, derived once from the seconds-valued constant so the breaker math reads in the same unit it compares against.
const COOLDOWN_MS = PROTECT_API_RETRY_INTERVAL * 1000;

/**
 * The events the {@link Transport} publishes on its three-rail surface. Every event here is parameterless: a consumer that needs the cooldown duration reads it
 * from the {@link ProtectThrottledError} thrown by `send`, and a consumer that needs richer detail subscribes to the `unifi-protect:http:throttle:*` diagnostics
 * channels.
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
 * a caller can cancel independently of the timeout, and a `signal` that has already aborted is answered with {@link ProtectAbortedError} without a request being sent.
 * `headers` here override the auth headers the transport stamps on automatically.
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
 * The lower-level {@link Transport.send} options. Each flag is a special caller opting out of one default send behavior.
 *
 * - `authRetry` controls the injected 401-relogin hook: the authenticated request path leaves it at its default of `true`, while the `AuthSession` login handshake
 *   passes `false` so its own 401 cannot recurse back into relogin.
 * - `probe` marks a request as the connection-recovery reachability trial. It skips the open breaker's cooldown gate so the trial can dispatch at the
 *   `ConnectionMonitor`'s cadence rather than waiting out the breaker's cooldown ({@link PROTECT_API_RETRY_INTERVAL}), while its outcome still books through the normal
 *   path - so a probe drawing the first answer `controllerServing` accepts closes the breaker exactly as the autonomous half-open trial would, and a probe its
 *   caller cancels books nothing, like any cancelled request. Only the monitor's recovery hooks (`verify`, recovery `reBootstrap`) pass `true`; the refresh failsafe
 *   and device commands leave it `false` and stay gated, so the breaker still protects against operational hammering.
 *
 * @category Transport
 */
export interface SendOptions extends RequestOptions {

  authRetry?: boolean;
  probe?: boolean;
}

/**
 * Construction options for {@link Transport}. `host` is the controller address exactly as configured, which every request diagnostics payload carries verbatim, and
 * `origin` is the URL origin the owned pool connects to: the scheme and the controller's URL authority, an IPv6 literal bracketed (`https://[fe80::1]`). Everything
 * else is an injected dependency.
 *
 * - `dispatcher` substitutes the undici dispatcher (an `undici.MockAgent` in tests, or a consumer-supplied pool). When injected, the transport never destroys or
 *   rebuilds it - lifecycle stays with the injector, so `reset()` and disposal are no-ops on the dispatcher. It also brings its own connector and its own retry
 *   policy, so a connection attempt a settled request leaves behind runs on that dispatcher's terms rather than the owned pool's; the request itself settles at
 *   once either way.
 * - `getAuthHeaders` supplies the cookie + CSRF headers stamped onto every request. `onUnauthorized` is the relogin hook invoked on a 401 before a single retry.
 *   Both point upward at `AuthSession`, so they are passed as plain function references (dependency inversion) rather than an `AuthSession` import.
 * - `verifyTls` opts the owned pool into strict TLS certificate verification. It defaults to `false`, because a controller presents a self-signed certificate that no
 *   verification chain accepts; a deployment that has installed a trusted certificate on its controller turns it on. An injected dispatcher brings its own TLS
 *   settings, so the option reaches only the pool this transport builds for itself.
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
  origin: string;
  verifyTls?: boolean;
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
 * Determine whether a request's outcome shows the controller serving, which is the one question the throttle breaker asks of every booking. No answer, a 5xx and
 * a 429 are failures: the controller could not be reached, could not serve the request, or asked to be asked less often. Any other answer, a 401, a 403 or a 404
 * among them, came from a controller that was there and served it, whatever it said. That is what keeps session validity and a missing resource out of the
 * breaker: a run of refusals aimed at one bad credential or one wrong path says nothing about whether the controller is up.
 *
 * @param statusCode - The status code to test, or `undefined` when no response was received.
 *
 * @returns `true` for any defined status below 500 other than 429, `false` for `undefined`, for 429 and for every status of 500 or above.
 */
export function controllerServing(statusCode: number | undefined): boolean {

  return (statusCode !== undefined) && (statusCode < 500) && (statusCode !== 429);
}

/**
 * Determine whether an HTTP status code says nothing about the request it answers: the controller's transient readiness answer, the status a controller that is
 * rebooting, starting up, or shedding load answers with, which the owned pool's retry interceptor retries unless the answer carries a Retry-After, or a 429, the
 * controller's rate limit, which the interceptor returns at once. The set is wider than the retried one because its reader is the login handshake, where a status
 * in it is never a verdict on the credentials, retried or not: a rate-limited sign-in judged nothing, so reading it as a refused sign-in would report a wrong
 * password for a controller that only asked to be asked less.
 *
 * @param statusCode - The status code to test.
 *
 * @returns `true` for a status in the retried set or a 429, `false` otherwise.
 */
export function isTransientStatus(statusCode: number): boolean {

  // The set is a tuple of literals, whose `includes` accepts only those literals, so a status of any value is tested by comparison instead.
  return (statusCode === 429) || RETRY_STATUS_CODES.some((code) => code === statusCode);
}

/**
 * Decide whether the owned pool's retry interceptor sends a failed attempt again: undici's own default decision with one rule ahead of it, that an answer carrying
 * a Retry-After header returns to its caller at once. A controller that asks for time gets it from the caller's own schedule rather than inside the call: undici
 * would wait out a hint only up to the curve's ceiling, re-sending sooner than a longer hint asks, so every hinted answer returns at once, whatever its value. The
 * hint is the header's presence, so the decision reads none of its value and reads no time of day.
 *
 * Every other failure takes undici's default decision, restated here because undici offers no supported way to call its own: a fault whose code is outside the
 * connection faults undici retries, a method or a status outside the retried set, or a retry past the last returns the failure, and anything else is retried after
 * the backoff curve's delay for that retry. The curve is the default's own without its Retry-After arm, and that arm is the one input the restatement does not
 * mirror: undici reads the header off any error that carries one, where the hint rule reads it off undici's retry error alone, the one error that carries an
 * answer's headers to the decision, so a failure of another kind carrying the header is retried on the curve here where undici would wait out its hint. The delay
 * runs on the platform's timer, as undici's own does, because the retry backoff is the dependency's timing rather than the library clock's, and the timer goes back
 * to the interceptor, which clears it when the request is aborted during the wait.
 *
 * @param error         - The failed attempt: undici's retry error for an answered status, carrying the answer's headers, or the connection fault itself.
 * @param context       - What the interceptor hands every decision.
 * @param context.opts  - The request's dispatch options, carrying the retry options undici resolved, whose list of retried connection faults the decision reads.
 * @param context.state - The retry state, whose counter numbers the retry being decided.
 * @param callback      - Called with the error to return it, or with `null` to send the request again.
 *
 * @returns The backoff timer when the attempt is retried, and nothing when the failure is returned at once.
 */
export function retryUnlessHinted(error: Error, { opts, state }: RetryHandler.RetryContext, callback: RetryHandler.OnRetryCallback): NodeJS.Timeout | undefined {

  if((error instanceof errors.RequestRetryError) && (error.headers["retry-after"] !== undefined)) {

    callback(error);

    return undefined;
  }

  // The code and the status are read as undici's default reads them, off whatever error it is handed: a truthy code other than undici's own retry code and the
  // connection faults it retries returns the failure, as does any status but null or undefined that is outside the retried set. Each read can be any value, which
  // a typed list's `includes` refuses, so each list is tested by comparison instead. undici resolves every retry option before the decision runs, so the fallback
  // for the list of retried faults answers a context no interceptor builds.
  const code = ("code" in error) ? error.code : undefined;
  const statusCode = ("statusCode" in error) ? error.statusCode : undefined;
  const errorCodes = opts.retryOptions?.errorCodes ?? [];

  if((code && (code !== "UND_ERR_REQ_RETRY") && !errorCodes.some((retried) => retried === code)) || !RETRY_POLICY.methods.includes(opts.method) ||
    ((statusCode !== null) && (statusCode !== undefined) && !RETRY_POLICY.statusCodes.some((retried) => retried === statusCode)) ||
    (state.counter > RETRY_POLICY.maxRetries)) {

    callback(error);

    return undefined;
  }

  return setTimeout(() => callback(null), Math.min(RETRY_POLICY.minTimeout * (RETRY_POLICY.timeoutFactor ** (state.counter - 1)), RETRY_POLICY.maxTimeout));
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

      return new ProtectRequestError("The UniFi Protect controller answered the request with HTTP status " + String(statusCode) + ".",
        { body: body.length ? body.toString("utf8") : undefined, headers: flattenHeaders(headers), statusCode });
  }
}

// Whether a failed request was a cancellation its caller chose, the one failure that says nothing about the controller. The caller's own abort is the
// ProtectAbortedError class; a deadline the caller supplied as its signal carries that class too, and is told apart by the platform's own deadline reason, the
// TimeoutError that AbortSignal.timeout() fires with - a controller that lets a deadline lapse did not answer in time, whoever set the deadline.
function callerCancelled(error: unknown, signal: AbortSignal | undefined): boolean {

  return (error instanceof ProtectAbortedError) && !((signal?.reason instanceof Error) && (signal.reason.name === "TimeoutError"));
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
  // appearing only in the return position is the intent, not an oversight.
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
 * `ProtectError` hierarchy, and runs the throttle circuit breaker that protects a degraded controller from being hammered. A cancellation or the deadline settles
 * its own request the instant it fires, whatever stage that request has reached, and touches no other; the owned pool's connector holds every socket from the
 * moment it is vended, so a reset or a disposal releases a connection attempt still in flight rather than leaving it to run out undici's own connect timer.
 *
 * The breaker is the canonical three-state model - `closed -> open -> half-open -> closed`:
 *
 * - **closed:** normal operation. Each request that is dispatched books an outcome, and `controllerServing` is the whole test: an answer from a controller
 *   that served it, a 4xx other than a 429 among them, resets the consecutive-failure count, while no answer, a 5xx or a 429 increments it. A request its caller
 *   cancels, or one never sent because its caller had already aborted, books nothing, since neither says anything about the controller. Crossing
 *   {@link PROTECT_API_ERROR_LIMIT} consecutive failures trips the breaker open.
 * - **open:** for {@link PROTECT_API_RETRY_INTERVAL} seconds, `send` throws {@link ProtectThrottledError} before dispatching, except a `probe: true` request (the
 *   `ConnectionMonitor`'s recovery trial), which bypasses the cooldown gate and books exactly as a natural half-open attempt would, a cancelled one booking nothing.
 * - **half-open:** once the cooldown elapses, requests are allowed through again as recovery probes. The first answer `controllerServing` accepts closes the
 *   breaker (and emits `throttleExited` only then, so the public signal never flaps); a failure re-arms the cooldown from that moment and stays open silently.
 *
 * Whether the controller is serving lives here; session validity lives in `AuthSession` and a missing resource with its caller. The breaker never calls login to
 * probe recovery - the next real request is the probe, and the independent 401-relogin concern is the injected `onUnauthorized` hook. The clock is injected so every
 * transition is deterministically testable.
 *
 * @category Transport
 */
export class Transport implements AsyncDisposable {

  readonly #bus: EventBus<TransportEvents>;
  readonly #clock: Clock;
  readonly #getAuthHeaders: (() => Record<string, string>) | undefined;
  readonly #host: string;
  readonly #log: ProtectLogging;
  readonly #onUnauthorized: (() => Promise<boolean>) | undefined;
  readonly #origin: string;
  readonly #verifyTls: boolean;

  /* The breaker's only mutable state: the consecutive-failure count and the clock's monotonic reading when the cooldown last (re-)armed, so the cooldown measures
   * the time that passed however the time of day was set meanwhile. `null` means the breaker is closed.
   *
   * The pool is the dispatcher every request goes to and the connector built beside it, travelling as one value so the two can never disagree about which pool a
   * dial belongs to, and reassigned whole because reset() rebuilds both together. An injected dispatcher is carried with a connector of `null`: its lifecycle
   * belongs to the injector, so a reset or a disposal here has nothing of its own to release.
   */
  #consecutiveFailures = 0;
  #pool: OwnedDispatcher | { readonly connector: null; readonly dispatcher: Dispatcher };
  #throttledSince: number | null = null;

  constructor(options: TransportOptions) {

    this.#clock = options.clock ?? wallClock;
    this.#getAuthHeaders = options.getAuthHeaders;
    this.#host = options.host;
    this.#log = options.log ?? noopLog;
    this.#bus = new EventBus<TransportEvents>(this.#log);
    this.#onUnauthorized = options.onUnauthorized;

    // The origin and the certificate posture are settled before the pool is built, because #buildPool reads them. reset() rebuilds the pool from these same fields,
    // so a rebuilt pool reaches the controller the transport was constructed for, with the posture it was constructed with.
    this.#origin = options.origin;
    this.#verifyTls = options.verifyTls ?? false;

    // When a dispatcher is injected we adopt it and never touch its lifecycle - the injector owns construction and teardown, and it brings a connector of its own
    // that we have no handle on. Otherwise we build (and own) the pool and the connector beside it.
    this.#pool = (options.dispatcher === undefined) ? this.#buildPool() : { connector: null, dispatcher: options.dispatcher };
  }

  /**
   * Whether the throttle breaker is currently open (refusing or probing). Reads the breaker state synchronously - safe to call on a hot path. The
   * `ConnectionMonitor` reads this to fold transport health into the connection FSM.
   */
  get isThrottled(): boolean {

    return this.#throttledSince !== null;
  }

  /**
   * Send a request and return the {@link ProtectResponse} for any HTTP status. Throttle-gates before dispatching, answers a caller that has already aborted without
   * sending a request, composes the caller's signal with the timeout deadline, classifies transport failures into typed errors, books the breaker outcome unless the
   * caller cancelled the request, and runs the 401-relogin retry (once) when a hook is wired.
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
    // through and let this request act as the half-open recovery probe; `book` will close or re-arm the breaker based on its outcome, and a probe its caller cancels
    // books nothing and leaves the breaker half-open. A `probe` request - the ConnectionMonitor's recovery trial - skips this gate entirely: the monitor's backoff
    // curve is the rate limiter while it is recovering, so its probe dispatches at the monitor's cadence and the outcome it books (the first answer `controllerServing`
    // accepts closes the breaker, a failure re-arms the cooldown, a cancel books nothing) is what keeps re-probe and breaker on one cadence.
    if((opts.probe !== true) && (this.#throttledSince !== null)) {

      const remaining = COOLDOWN_MS - millisecondsSince(this.#throttledSince, { clock: this.#clock });

      if(remaining > 0) {

        throw new ProtectThrottledError("Requests to the UniFi Protect controller are throttled after repeated failures.", { cooldownMs: remaining });
      }
    }

    // Relogin retry loop. The body of the loop runs at most twice: the original attempt, and - if it returns 401 and a relogin hook is wired and succeeds - one
    // retry with relogin disabled so a persistent 401 cannot spin. Only the attempt whose outcome we return can book, and it books nothing when its caller cancelled
    // it or had already aborted before it was sent.
    let allowAuthRetry = opts.authRetry ?? true;

    for(;;) {

      // A caller that has already aborted is answered before anything is dispatched. No request is issued, so none is published and none is booked: the
      // controller was never asked, and an abort or a deadline that fired before the request began says nothing about it.
      if(opts.signal?.aborted === true) {

        throw new ProtectAbortedError("The request was aborted by the caller's signal.", { cause: opts.signal.reason });
      }

      let result: { body: Buffer; headers: IncomingHttpHeaders; statusCode: number };

      try {

        // The loop runs at most twice and each iteration must complete before the next can begin, so sequential awaits are the correct shape here.
        // eslint-disable-next-line no-await-in-loop
        result = await this.#dispatch(url, opts);
      } catch(error) {

        // A transport-level exception is evidence the controller could not be reached or did not answer in time, so it books a failure before the
        // already-classified error propagates. A cancellation the caller chose is the exception: it says nothing about the controller, so it books no outcome
        // and leaves the breaker exactly as it found it. A ClientDestroyedError from a pool reset books a failure too, though it says nothing new about the
        // controller: the library resets the pool only as the breaker trips, so such a failure lands on an already-open breaker and re-arms the cooldown within
        // moments of the trip, which moves it negligibly, and a consumer that resets through the transport chose to end the requests in flight.
        if(!callerCancelled(error, opts.signal)) {

          this.#book(false);
        }

        throw error;
      }

      // eslint-disable-next-line no-await-in-loop
      if((result.statusCode === 401) && allowAuthRetry && (this.#onUnauthorized !== undefined) && (await this.#onUnauthorized())) {

        allowAuthRetry = false;

        continue;
      }

      this.#book(controllerServing(result.statusCode));

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
   * pool rather than reusing sockets to a degraded controller. A request in flight, over HTTP/2 or HTTP/1.1, fails as the pool-reset interruption, and a connection
   * attempt still in flight is released along with the keepalive connections, so a request waiting on one fails at once the same way rather than running on to
   * undici's own connect timer. A no-op when the dispatcher was injected - that lifecycle belongs to the injector.
   */
  reset(): void {

    const pool = this.#pool;

    if(pool.connector === null) {

      return;
    }

    // The old pool's teardown is deliberately not awaited: the breaker calls this synchronously as it trips, and the next request needs only the rebuilt pool. The
    // destroy rejects any request still in flight on it with ClientDestroyedError, which books a failure on the breaker, already open when the breaker itself is the
    // caller. releaseOwned holds the order the pool and its connector are let go in.
    void releaseOwned(pool);
    this.#pool = this.#buildPool();
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
   * Dispose the transport, destroying the owned pool. A connection attempt still in flight is severed before the pool's own teardown is awaited. A no-op on an
   * injected dispatcher.
   */
  async [Symbol.asyncDispose](): Promise<void> {

    const pool = this.#pool;

    if(pool.connector !== null) {

      await releaseOwned(pool);
    }
  }

  // Perform a single HTTP exchange: compose the deadline with the caller's signal, stamp the auth and per-call headers, publish the request diagnostics, buffer the
  // body, and on failure classify the exception into the typed hierarchy. Returns the bare response parts; the breaker and relogin policy live in `send`.
  async #dispatch(url: string, opts: SendOptions): Promise<{ body: Buffer; headers: IncomingHttpHeaders; statusCode: number }> {

    const method = opts.method ?? "GET";
    const timeout = opts.timeout ?? PROTECT_API_TIMEOUT;

    /* Compose our own deadline with the caller's optional cancellation. The deadline is armed on the injected clock rather than on the platform, so a suite fires it
     * on virtual time instead of waiting it out. It is held for exactly this exchange: `using` releases it when the method returns, on every path, so a settled request
     * leaves no timer behind. #classifyTransportError later tells the caller's cancellation from our deadline by identity, comparing the failure against each signal's
     * own reason, because a cancelled or expired request rejects with the reason of the signal that fired.
     */
    using deadline = armDeadline(timeout, { clock: this.#clock });
    const signal = (opts.signal !== undefined) ? AbortSignal.any([ opts.signal, deadline.signal ]) : deadline.signal;

    // The auth headers (cookie + CSRF) are the base; per-call headers override them. A request with no body carries no content-type - that is the caller's concern.
    const headers: Record<string, string> = { ...this.#getAuthHeaders?.(), ...opts.headers };

    /* The request diagnostics cost nothing for a request no one listens to: the request id and each payload exist only when a subscriber does, and the id is minted
     * by the first publish that needs one, so the start and the end of one request carry the same id. Each channel is read at its own publish rather than once up
     * front, so a subscriber that attaches mid-request still sees that request's end.
     */
    let requestId: string | undefined;

    if(channels.httpRequestStart.hasSubscribers) {

      requestId ??= randomUUID();
      channels.httpRequestStart.publish({ host: this.#host, method, requestId, url } satisfies HttpRequestStartPayload);
    }

    // The exchange's elapsed time is measured from the clock's monotonic reading, so the duration it publishes and the elapsed time a failure reports are the time
    // that passed however the time of day was set meanwhile.
    const startedAt = this.#clock.monotonic();

    try {

      /* A signal that has already fired when the request reaches here never runs a listener attached to it, so the settlement below would never settle, and undici
       * applies a signal only at request start, after the connect has completed. The check ahead of the dispatch is what keeps such a request from opening a
       * connection at all, on any dispatcher, and throwing the reason inside the try sends it through the same catch as every other failure, so it classifies by
       * identity and publishes the same end diagnostic. `send` answers a caller that had aborted before the request began, so what reaches this check is an abort
       * landing in between, such as a start-channel subscriber aborting the caller's signal while the request start is published.
       */
      if(signal.aborted) {

        throw signal.reason;
      }

      /* undici applies a signal's abort at request start and on a live socket, never to a connection attempt still in flight, so the transport settles the caller
       * itself the moment the signal fires: the exchange races a settlement that rejects with the signal's own reason, which is also what lets the classification
       * below name the cause by identity. A connection attempt the settled request leaves behind runs to the pool's own connect timer, or completes and meets
       * undici's request start, where the deferred abort destroys it before a byte is written.
       *
       * The listener is registered after the check above, so a signal that has already fired constructs nothing it would then discard, and it lives for exactly
       * this request, because a caller's signal may outlive it: `once` takes it off when it fires, and the race's `finally` takes it off when the exchange ends
       * first. The race observes the losing exchange's own later rejection as well, so a settled request leaves nothing unhandled behind it.
       */
      const settlement = Promise.withResolvers<never>();
      const settle = (): void => settlement.reject(signal.reason);

      signal.addEventListener("abort", settle, { once: true });

      // The exchange is an async function so that a synchronous throw from undici's own argument checks still arrives as a rejection the race observes, which is
      // what takes the listener off on every path rather than leaving it to fire into a settlement nobody is waiting on. The body is buffered inside it, so the race
      // bounds the whole exchange and the pool slot frees as soon as the bytes are in hand.
      const exchange = async (): Promise<{ body: Buffer; headers: IncomingHttpHeaders; statusCode: number }> => {

        const response = await request(url, { dispatcher: this.#pool.dispatcher, headers, method, signal, ...((opts.body !== undefined) && { body: opts.body }) });

        return { body: Buffer.from(await response.body.arrayBuffer()), headers: response.headers, statusCode: response.statusCode };
      };

      const result = await Promise.race([ exchange(), settlement.promise ]).finally(() => signal.removeEventListener("abort", settle));

      if(channels.httpRequestEnd.hasSubscribers) {

        requestId ??= randomUUID();
        this.#publishEnd({ durationMs: millisecondsSince(startedAt, { clock: this.#clock }), method, requestId, statusCode: result.statusCode, url });
      }

      return result;
    } catch(error) {

      // The elapsed time is read once, so the error a failure carries and the duration its end diagnostic publishes are the same figure.
      const elapsedMs = millisecondsSince(startedAt, { clock: this.#clock });
      const classified = this.#classifyTransportError(error, { callerSignal: opts.signal, deadline: deadline.signal, elapsedMs });

      if(channels.httpRequestEnd.hasSubscribers) {

        requestId ??= randomUUID();
        this.#publishEnd({ ...(callerCancelled(classified, opts.signal) && { cancelled: true }), durationMs: elapsedMs, error: classified.message, method,
          requestId, url });
      }

      throw classified;
    }
  }

  // Book one breaker outcome. The first answer `controllerServing` accepts closes the breaker (and announces recovery only on the closing edge, so `throttleExited`
  // never flaps); a failure either trips the breaker once the threshold is crossed, or re-arms the cooldown if a half-open probe just failed.
  #book(ok: boolean): void {

    if(ok) {

      this.#consecutiveFailures = 0;

      if(this.#throttledSince !== null) {

        this.#throttledSince = null;

        this.#log.info("Resumed communication with the UniFi Protect controller after the throttle cooldown elapsed.");

        this.#bus.emit("throttleExited");

        if(channels.httpThrottleExited.hasSubscribers) {

          channels.httpThrottleExited.publish();
        }
      }

      return;
    }

    this.#consecutiveFailures++;

    // A failure while the breaker is already open means a half-open probe just failed: re-arm the cooldown from now and stay open silently (we never emitted
    // `throttleExited`, so we do not emit `throttleEntered` again - the consumer's view is that we have been throttled the whole time).
    if(this.#throttledSince !== null) {

      this.#throttledSince = this.#clock.monotonic();

      return;
    }

    // The trip logs at warning, because the breaker heals itself: its cooldown elapses and the next probe closes it once the controller answers.
    if(this.#consecutiveFailures >= PROTECT_API_ERROR_LIMIT) {

      this.#throttledSince = this.#clock.monotonic();

      this.#log.warn("Throttling requests to the UniFi Protect controller after repeated failures.",
        { consecutiveFailures: this.#consecutiveFailures, cooldownMs: COOLDOWN_MS, errorLimit: PROTECT_API_ERROR_LIMIT });

      this.#bus.emit("throttleEntered");

      if(channels.httpThrottleEntered.hasSubscribers) {

        channels.httpThrottleEntered.publish({ consecutiveFailures: this.#consecutiveFailures, cooldownMs: COOLDOWN_MS });
      }

      // Drop every keepalive connection to the controller so the next probe starts clean.
      this.reset();
    }
  }

  /* Translate a failed exchange into the typed hierarchy. A cancellation is read by identity first: the error a cancelled or expired request rejects with IS the
   * reason of the signal that fired, from the settlement or from the check ahead of the dispatch, so comparing against each signal's own reason names which of them
   * caused the failure exactly - whatever that reason is, an `Error`, an empty string, or anything else - where asking whether the caller's signal is aborted at
   * classification time would misname a deadline that fired first on a request its caller went on to cancel a moment later.
   *
   * Every other failure is sorted by the transport failure classifier, the local mirror of homebridge-plugin-utils' taxonomy that every socket sorts its failures by
   * as well, and each kind maps to the typed error it reports as. The classifier is handed no signal, because the signals this transport composed are exactly what
   * the identity reads have already answered. A network error lifts its public `code` from the cause chain as `ProtectNetworkError` always has, so no arm hands the
   * classifier's own reading of the code to the error.
   */
  #classifyTransportError(error: unknown, { callerSignal, deadline, elapsedMs }: { callerSignal: AbortSignal | undefined; deadline: AbortSignal; elapsedMs: number }):
    ProtectAbortedError | ProtectNetworkError | ProtectTimeoutError {

    // Our own deadline caused this failure, and settled the request at whatever stage it had reached. Each identity read asks first whether its signal fired,
    // because an unfired signal's reason is `undefined`, which a thrown `undefined` would otherwise match.
    if(deadline.aborted && (error === deadline.reason)) {

      return new ProtectTimeoutError("The UniFi Protect controller did not respond before the request deadline elapsed.", { cause: error, elapsedMs });
    }

    // The caller's own signal caused it, and stays the cause even when our deadline fires a moment later.
    if((callerSignal?.aborted === true) && (error === callerSignal.reason)) {

      return new ProtectAbortedError("The request was aborted by the caller's signal.", { cause: error });
    }

    const failure = classifyTransportError(error);

    switch(failure.kind) {

      /* A connect-phase timeout, distinct from our request deadline. The arm is reached when a caller's `timeout` option exceeds undici's own ten-second connect
       * timer, which then bounds the connect phase and wins. It is also reached by a request queued behind a connection attempt a settled request left running, when
       * that attempt's ten-second timer fires before the queued request's own deadline: a failed connect fails every request queued on that client, and undici's
       * retry interceptor does not retry UND_ERR_CONNECT_TIMEOUT, so the connect timer's error reaches the queued request.
       */
      case "connect-timeout":

        return new ProtectTimeoutError("The connection to the UniFi Protect controller timed out.", { cause: error, elapsedMs });

      /* The controller accepted the request and then stopped answering before its reply was complete, which undici's own response timers report. They are reached
       * when a request's deadline exceeds those timers, or through an injected dispatcher that brings timers of its own. A timeout or a cancellation that is not one
       * of this transport's own signals classifies as a timeout too, the reading homebridge-plugin-utils gives it, and reports the same way.
       */
      case "timeout":

        return new ProtectTimeoutError("The UniFi Protect controller stopped responding before its reply was complete.", { cause: error, elapsedMs });

      // Our own pool was torn down, by reset() or by disposal, under a request in flight or a connection attempt. Recoverable: a retry helps only after a reset,
      // which rebuilds the pool; after disposal nothing is rebuilt.
      case "destroyed":

        return new ProtectNetworkError("The request was interrupted because the connection pool was reset.", { cause: error });

      /* The retry interceptor raises its retry error for a response whose bytes it cannot reconcile with the request: a resumed retry the controller answered
       * without the matching range, or a body whose length disagrees with the length its headers declared, because the interceptor runs with `throwOnError` off and
       * hands every other last answer back as a response. The controller was reached, but what arrived is not one whole response, so it is classified with the
       * connection faults a later attempt can clear.
       */
      case "retries-exhausted":

        return new ProtectNetworkError("The response from the UniFi Protect controller did not match the range or length the request expected.", { cause: error });

      // The controller's certificate failed the platform's verification, so the failure names the address dialed rather than reporting an unreachable host.
      case "certificate":

        return new ProtectCertificateError({ cause: error, host: new URL(this.#origin).host });

      // Everything else is a connect, DNS, or socket failure. The aborted kind answers only a signal handed to the classifier, and this translation hands it none, so
      // it is listed here for the union to stay exhaustive rather than because a request can reach it.
      case "aborted":
      case "dns":
      case "refused":
      case "reset":
      case "transport":
      case "unreachable":

        return new ProtectNetworkError("A network error occurred communicating with the UniFi Protect controller.", { cause: error });

      default:

        // Exhaustiveness guard. A new kind joining the union without a case above stops `failure` being `never` here, and this fails to compile.
        return assertNever(failure);
    }
  }

  // Publish the request:end diagnostic. Centralized so the success and failure paths emit the same shape, and the controller host is stamped once here for both paths
  // from this client's own address rather than repeated at each call site. It is called only under the end channel's subscriber gate, so its payload is built only when
  // someone listens.
  #publishEnd(payload: Omit<HttpRequestEndPayload, "host">): void {

    channels.httpRequestEnd.publish({ ...payload, host: this.#host } satisfies HttpRequestEndPayload);
  }

  // Build the owned connection pool and the connector beside it: the pool dials through the owned connector, so a reset or a disposal can release a connection
  // attempt still in flight, and certificate verification follows the `verifyTls` option (permissive by default, since controllers ship self-signed certs). HTTP/2
  // is enabled and offered beside HTTP/1.1, and a controller that supports it negotiates h2 by its own preference. The pool holds five concurrent connections, a
  // 60-second client TTL so each pooled connection is recycled roughly once a minute rather than kept alive indefinitely (bounding how long a keepalive socket to a
  // controller that has since rebooted or silently dropped the link can linger before it is retired), a fixed user-agent, the signal gate, and the retry
  // interceptor, built from `RETRY_POLICY`, the record its decision, retryUnlessHinted, reads as well. With `throwOnError` off, the interceptor never discards an
  // answer: once the retries run out, or at once for an answer its decision returns, the controller's last response returns to `send` with its body, and `ensureOk`
  // is where it becomes the classified error.
  #buildPool(): OwnedDispatcher {

    const userAgent: Dispatcher.DispatcherComposeInterceptor = (dispatch) => (dispatchOptions, handler) => {

      dispatchOptions.headers ??= {};

      // This cast is safe only because this composed pool's one caller, Transport.#dispatch, always passes headers as a plain object - never the string[] or
      // iterable-of-tuples forms undici's UndiciHeaders union otherwise permits, on which a bracket assignment would silently fail to add a usable header rather than
      // throw. A future caller of this interceptor, or a refactor of #dispatch, must keep passing headers as a plain object.
      (dispatchOptions.headers as Record<string, string | string[]>)["user-agent"] = "unifi-protect";

      return dispatch(dispatchOptions, handler);
    };

    /* The retry interceptor's handler learns of a request's signal only once that request has started on a connection, so without this gate a connection attempt
     * that fails with a retryable fault is dispatched again for a request the transport has already settled, and so is a request cancelled while it waits out a
     * retry backoff. Listed ahead of the retry interceptor, which undici's composition wraps around it, the gate sees every attempt and refuses one whose signal has
     * already fired with undici's own class for an aborted request. A refusal thrown from a retry's dispatch goes straight to the request's own handler, so the
     * request ends there without another connection attempt. The signal travels on the dispatch options without appearing in their type, so the gate narrows to it
     * rather than casting, and it reads that signal and nothing else - it holds no state, and its only lifecycle is the pool's own.
     */
    const signalGate: Dispatcher.DispatcherComposeInterceptor = (dispatch) => (dispatchOptions, handler) => {

      if(("signal" in dispatchOptions) && (dispatchOptions.signal instanceof AbortSignal) && dispatchOptions.signal.aborted) {

        throw new errors.RequestAbortedError();
      }

      return dispatch(dispatchOptions, handler);
    };

    // `allowH2` reaches the connector and the pool alike, because the two read it for different things: the connector's copy decides the ALPN offer, and the
    // pool's decides how it handles the connection once the connect has completed. One binding is what keeps the two from disagreeing.
    const allowH2 = true;
    const connector = createOwnedConnector({ allowH2, verifyTls: this.#verifyTls });
    const dispatcher = new Pool(this.#origin, { allowH2, clientTtl: 60000, connect: connector.connect, connections: 5 })
      .compose(userAgent, signalGate, interceptors.retry({ ...RETRY_POLICY, methods: [...RETRY_POLICY.methods], retry: retryUnlessHinted,
        statusCodes: [...RETRY_POLICY.statusCodes], throwOnError: false }));

    return { connector, dispatcher };
  }
}
