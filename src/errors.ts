/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * errors.ts: The typed error hierarchy for the UniFi Protect library.
 */
import type { InspectOptions } from "node:util";

/**
 * The error model in one sentence: every failure the library raises is a subclass of {@link ProtectError}, and the *first* level of the hierarchy answers the only
 * question a caller universally needs answered - should I retry, or should I propagate?
 *
 * - {@link RecoverableError} means the operation could plausibly succeed if retried or deferred (a throttle window, a timeout, a transient network blip, a caller
 *   abort, a livestream stall). The caller decides the retry policy; the library does not retry user operations on the caller's behalf.
 * - {@link FatalError} means retrying the same call will fail the same way (bad credentials, insufficient privileges, a 4xx/5xx the controller will keep returning,
 *   a protocol violation, a structural bootstrap failure). The caller should surface or propagate it.
 *
 * Consumers branch on the abstract base for policy (`if(err instanceof RecoverableError) { defer(); }`) and on the concrete class for specific handling
 * (`if(err instanceof ProtectThrottledError) { waitFor(err.cooldownMs); }`). This is the Node idiom - a class hierarchy with `instanceof` - chosen deliberately over
 * a Result/Either return type, because it composes naturally with `try`/`catch`, `await`, and the platform's own error-cause chaining.
 *
 * Every error chains its underlying `cause` so `resolveErrnoCause` keeps working one hop down the chain (the shape undici raises for connection failures).
 *
 * @category Errors
 */
export abstract class ProtectError extends Error {

  // The constructor is protected: ProtectError, RecoverableError, and FatalError are abstract classification layers that are never instantiated directly. Only the
  // concrete leaf classes below are constructed. We derive `name` from `new.target` so each thrown error reports its precise class name in stack traces and logs
  // without every subclass having to restate it.
  protected constructor(message: string, options?: { cause?: unknown }) {

    super(message, { cause: options?.cause });

    this.name = new.target.name;
  }
}

/**
 * Abstract base for failures the caller may retry or defer. The library never retries the caller's operation itself - it classifies the failure as recoverable and
 * returns control so the caller can apply its own backoff, escalation, or alternative-path policy.
 *
 * @category Errors
 */
export abstract class RecoverableError extends ProtectError {}

/**
 * Abstract base for failures the caller should propagate. Retrying the identical call will reproduce the identical failure, so the correct response is to surface it.
 *
 * @category Errors
 */
export abstract class FatalError extends ProtectError {}

/**
 * We are inside the throttle cooldown window. The library has seen enough consecutive failures to back off from the controller, and this request was rejected
 * locally rather than sent. Retry once the cooldown elapses.
 *
 * @category Errors
 */
export class ProtectThrottledError extends RecoverableError {

  /** Milliseconds remaining (at throw time) before the cooldown window is expected to clear. */
  readonly cooldownMs: number;

  constructor(message: string, options: { cause?: unknown; cooldownMs: number }) {

    super(message, { cause: options.cause });

    this.cooldownMs = options.cooldownMs;
  }
}

/**
 * Our own request deadline elapsed before the controller responded. Distinct from {@link ProtectAbortedError}: this fires when the library's internal
 * `AbortSignal.timeout()` wins the race, whereas an aborted error fires when the caller's signal wins. The transport tells the two apart by checking whether the
 * caller's own `AbortSignal` is already aborted: if it is, the cancellation came from the caller; if not, the library's timeout won.
 *
 * @category Errors
 */
export class ProtectTimeoutError extends RecoverableError {

  /** Milliseconds elapsed between dispatch and the deadline firing. */
  readonly elapsedMs: number;

  constructor(message: string, options: { cause?: unknown; elapsedMs: number }) {

    super(message, { cause: options.cause });

    this.elapsedMs = options.elapsedMs;
  }
}

/**
 * A connect, DNS, TLS, or socket-level failure reaching the controller. The originating Node `ErrnoException` is preserved on the `cause` chain (the shape undici
 * raises as `TypeError("fetch failed", { cause: errnoError })`); `code` lifts the errno string out for convenient branching.
 *
 * @category Errors
 */
export class ProtectNetworkError extends RecoverableError {

  /** The Node errno string (e.g., `"ECONNREFUSED"`, `"ETIMEDOUT"`), when one could be resolved from the cause chain. */
  readonly code: string | undefined;

  constructor(message: string, options?: { cause?: unknown; code?: string }) {

    super(message, { cause: options?.cause });

    this.code = options?.code ?? resolveErrnoCause(options?.cause)?.code;
  }
}

/**
 * The caller's `AbortSignal` fired. The operation was cancelled by the consumer, not by the library's own deadline. Recoverable in the sense that the caller chose
 * to stop - re-issuing the operation with a fresh signal is valid.
 *
 * @category Errors
 */
export class ProtectAbortedError extends RecoverableError {

  constructor(message: string, options?: { cause?: unknown }) {

    super(message, { cause: options?.cause });
  }
}

/**
 * A realtime channel produced no data for longer than its heartbeat watchdog window - either the events WebSocket (silent beyond `PROTECT_EVENTS_WATCHDOG_TIMEOUT`)
 * or a livestream session (silent beyond `PROTECT_LIVESTREAM_HEARTBEAT_TIMEOUT`). The underlying channel is presumed dead. As a `RecoverableError`, the error type
 * itself is the signal to recover: the events stream's subscriber (the `ConnectionMonitor`) re-bootstraps and relaunches, and a stalled livestream session's owner (the
 * pool's `ManagedSession`) drives a recovery loop that reconnects under the injected policy - the bare `LivestreamSession` escape hatch is the only livestream surface
 * that surfaces this verbatim to a direct consumer without recovering on its behalf.
 *
 * @category Errors
 */
export class ProtectStallError extends RecoverableError {

  /** Milliseconds of silence observed before the watchdog tripped. */
  readonly silentForMs: number;

  constructor(message: string, options: { cause?: unknown; silentForMs: number }) {

    super(message, { cause: options.cause });

    this.silentForMs = options.silentForMs;
  }
}

/**
 * Authentication failed: invalid credentials, an expired session that could not be renewed, or a CSRF-token rotation that did not complete. Fatal because retrying
 * with the same credentials reproduces the failure.
 *
 * @category Errors
 */
export class ProtectAuthError extends FatalError {

  /** The HTTP status that triggered the classification, when the failure originated from a response (typically `401`). */
  readonly statusCode: number | undefined;

  constructor(message: string, options?: { cause?: unknown; statusCode?: number }) {

    super(message, { cause: options?.cause });

    this.statusCode = options?.statusCode;
  }
}

/**
 * The credentials authenticated but lack the privilege the operation requires (typically a `403`; Protect reserves many operations for administrator accounts).
 * Fatal because the same account will keep being refused.
 *
 * @category Errors
 */
export class ProtectAuthorizationError extends FatalError {

  /** The HTTP status that triggered the classification, when the failure originated from a response (typically `403`). */
  readonly statusCode: number | undefined;

  constructor(message: string, options?: { cause?: unknown; statusCode?: number }) {

    super(message, { cause: options?.cause });

    this.statusCode = options?.statusCode;
  }
}

/**
 * The controller returned an error status the library does not classify more specifically (a 4xx other than 401/403, or any 5xx). The status, body, and headers are
 * preserved so the caller can inspect the controller's own explanation.
 *
 * @category Errors
 */
export class ProtectRequestError extends FatalError {

  /** The response body, when one was read. Left as `unknown` because it may be parsed JSON, raw text, or absent. */
  readonly body: unknown;

  /** The response headers, when captured. */
  readonly headers: Readonly<Record<string, string>> | undefined;

  /** The HTTP status code the controller returned. */
  readonly statusCode: number;

  constructor(message: string, options: { body?: unknown; cause?: unknown; headers?: Record<string, string>; statusCode: number }) {

    super(message, { cause: options.cause });

    this.body = options.body;
    this.headers = options.headers;
    this.statusCode = options.statusCode;
  }
}

/**
 * A wire- or response-level violation the library cannot make sense of: an event packet that does not match the documented frame structure, a WebSocket message that
 * breaks the spec the library decodes against, an HTTP response body that fails to parse, or a response missing data the operation requires. Fatal because the same
 * bytes will not decode or validate differently on retry - the defect is in the payload, not in reaching it.
 *
 * @category Errors
 */
export class ProtectProtocolError extends FatalError {

  constructor(message: string, options?: { cause?: unknown }) {

    super(message, { cause: options?.cause });
  }
}

/**
 * Compile-time exhaustiveness assertion for a closed discriminated union. Pass the value from a `default` branch (any point the type system has narrowed to `never`) and
 * adding an unhandled variant to the union becomes a *compile* error at this call site. At runtime - reachable only when untyped code smuggles in an unmodeled variant -
 * it throws a {@link ProtectProtocolError} rather than silently absorbing the value, surfacing the defect loudly. This is the single guard every exhaustive switch in the
 * library shares, so there is exactly one exhaustiveness primitive rather than one re-implemented per module.
 *
 * Correctness-critical switches use this - a missed variant there is a silent data defect. Presentation-only switches that must never crash use the inline
 * `value satisfies never` form with a safe fallback instead, getting the same compile-time enforcement without the runtime throw.
 *
 * @param value - The value the compiler has narrowed to `never`.
 *
 * @returns Never returns - always throws.
 *
 * @throws {@link ProtectProtocolError} always, naming the unhandled variant's discriminant.
 *
 * @category Errors
 */
export function assertNever(value: never): never {

  // `value` is statically `never`, so we read its runtime shape defensively: an object variant surfaces its `kind` discriminant, anything else (a bare string such as a
  // modelKey) surfaces its string form.
  const variant = value as unknown;
  const detail = ((typeof variant === "object") && (variant !== null) && ("kind" in variant)) ? String(variant.kind) : String(variant);

  throw new ProtectProtocolError("Encountered an unhandled variant in an exhaustive switch: " + detail + ".");
}

/**
 * The bootstrap sequence failed while fetching or parsing the controller bootstrap document. `stage` discriminates which - `"fetch"` when the bootstrap endpoint returns
 * a non-2xx status or the transport fails reaching it, `"parse"` when the body cannot be decoded - so the caller and the diagnostics surface can report the precise point
 * of failure rather than a generic "connect failed." A login or reachability failure is not wrapped here; it propagates as its own typed fatal.
 *
 * @category Errors
 */
export class ProtectBootstrapError extends FatalError {

  /** The stage of the connect sequence at which the failure occurred. */
  readonly stage: ProtectBootstrapStage;

  constructor(message: string, options: { cause?: unknown; stage: ProtectBootstrapStage }) {

    super(message, { cause: options.cause });

    this.stage = options.stage;
  }
}

/**
 * The stages of the `connect()` sequence, used to discriminate a {@link ProtectBootstrapError}. The sequence authenticates, fetches the bootstrap document, parses it,
 * then subscribes to the realtime stream; only the fetch and parse stages are wrapped as a bootstrap error, because a login or reachability failure already propagates as
 * its own typed fatal (`ProtectAuthError` / `ProtectNetworkError`).
 *
 * @category Errors
 */
export type ProtectBootstrapStage = "fetch" | "login" | "parse" | "subscribe";

/**
 * A pooled livestream reconnected and the controller negotiated a different codec than the one in flight (H.264 to HEVC, or a channel reconfigured mid-stream). Fatal
 * because no fixed-codec consumer can adapt in place: an FFmpeg pipe cannot re-initialize, and HKSV tolerates no second init segment. The pool surfaces this as the one
 * terminal a recovering stream can raise, after which the consumer re-subscribes for a fresh stream against the new codec. The `from` / `to` descriptors are the RFC 6381
 * codec strings the two init segments carried, so a consumer can log precisely what changed.
 *
 * @category Errors
 */
export class ProtectCodecChangeError extends FatalError {

  /** The RFC 6381 codec descriptor the stream began with, before the reconnect. */
  readonly from: string;

  /** The RFC 6381 codec descriptor the reconnected stream negotiated. */
  readonly to: string;

  constructor(message: string, options: { cause?: unknown; from: string; to: string }) {

    super(message, { cause: options.cause });

    this.from = options.from;
    this.to = options.to;
  }
}

/**
 * A pooled livestream's recovery policy gave up. The `phase` discriminates the two regimes the pool runs: `establishing` means the first segment never arrived within
 * the bounded establishment deadline (the stream that never produced media), and `recovering` means a previously-live stream could not be re-established and the policy
 * elected to stop. Fatal because the policy - the single authority over whether to keep trying - has declared the stream unrecoverable; the consumer re-subscribes if it
 * still wants the stream. `attempts` carries how many consecutive reconnect attempts the episode made before the policy returned `giveUp`.
 *
 * @category Errors
 */
export class ProtectLivestreamUnavailableError extends FatalError {

  /** The number of consecutive failed reconnect attempts the recovery episode made before the policy gave up. */
  readonly attempts: number;

  /** Which regime the give-up occurred in: bounded establishment, or unbounded live recovery. */
  readonly phase: "establishing" | "recovering";

  constructor(message: string, options: { attempts: number; cause?: unknown; phase: "establishing" | "recovering" }) {

    super(message, { cause: options.cause });

    this.attempts = options.attempts;
    this.phase = options.phase;
  }
}

/**
 * The requested operation is not available on this device. This is a *client-side precondition* failure - distinct from {@link ProtectRequestError}, which classifies a
 * status the controller actually returned - raised before any request is issued because the device lacks the capability the operation requires (for example, a package
 * snapshot on a camera that has no secondary package sensor). Fatal because a device's capabilities do not change on retry; the caller should pick a different operation
 * or device. The optional `feature` names the missing capability flag, for precise logging and programmatic branching.
 *
 * @category Errors
 */
export class ProtectUnsupportedError extends FatalError {

  /** The device capability flag whose absence triggered the rejection (e.g., `"hasPackageCamera"`), when the call site identified one. */
  readonly feature: string | undefined;

  constructor(message: string, options?: { cause?: unknown; feature?: string }) {

    super(message, { cause: options?.cause });

    this.feature = options?.feature;
  }
}

/**
 * Project-wide options bag for `util.inspect` calls used in logs, debug dumps, and CLI output. Centralizing the shape here means a future change to the
 * diagnostic formatting (disabling colors when stdout isn't a TTY, bounding `depth`, adding `breakLength` for tight log lines) lands in one place rather than
 * across every call site.
 *
 * @category Utilities
 */
export const INSPECT_OPTIONS: InspectOptions = { colors: true, depth: null, sorted: true };

/**
 * Predicate for the WebSocket-error-handler suppression rule shared by the realtime events WS and the livestream WS.
 *
 * Both subsystems classify two error shapes as expected disconnects rather than user-actionable errors:
 *
 * 1. A `TypeError` from undici's internal WebSocket teardown - the error class undici raises when the socket closes mid-frame during a disconnect.
 * 2. An `ETIMEDOUT` errno on the cause chain - the slow-controller path. Both subsystems run their own silence watchdog (the events WS against
 *    `PROTECT_EVENTS_WATCHDOG_TIMEOUT`, a livestream session against its heartbeat timeout) that reports prolonged silence separately; this predicate instead classifies
 *    the socket-level errno, so the two are complementary and logging this disconnect-during-reboot symptom at the error level would be duplicate noise.
 *
 * Centralizing the predicate means a future addition (`EPIPE`, `ECONNRESET`, etc.) lands in one place and both WebSocket subsystems pick it up identically.
 *
 * @param error - The error value to classify. Typed `unknown` because WebSocket `ErrorEvent.error` is untyped at the contract level.
 *
 * @returns `true` if the error matches an expected-disconnect shape and the call site should suppress its log; `false` to log normally.
 *
 * @category Utilities
 */
export function isExpectedWsDisconnect(error: unknown): boolean {

  return (error instanceof TypeError) || (resolveErrnoCause(error)?.code === "ETIMEDOUT");
}

/**
 * Safely resolve an unknown error to a Node `ErrnoException` shape.
 *
 * Two error shapes are recognized:
 *
 * 1. An `Error` whose `cause` chain wraps a Node `ErrnoException`. Undici raises this shape from upstream connection errors (DNS, TCP, TLS), where the surface
 *    error is the generic `TypeError("fetch failed")` and the actual errno data lives one hop down the cause chain.
 * 2. A bare `ErrnoException`. Filesystem reads, stream errors, and direct socket events surface this way - the error object itself carries `.code` and `.message`.
 *
 * Both shapes are validated to require `code` as a string before returning, guarding against the (rare but legal) case where an Error has a `code` property of a
 * non-string type. A non-string `code` would otherwise satisfy a downstream `code === "ECONNREFUSED"` comparison only by accident of `===` semantics.
 *
 * Anything outside these two shapes (locally thrown TypeErrors with no cause, custom errors without `code`, non-Error throws) returns `undefined`. Callers handle
 * that case by logging the unknown error directly via `util.inspect`.
 *
 * @param error - The error value to inspect. Typed `unknown` because catch bindings and event handlers receive untyped values.
 *
 * @returns The narrowed `NodeJS.ErrnoException` if the error matches either recognized shape, or `undefined` for unknown shapes.
 *
 * @category Utilities
 */
export function resolveErrnoCause(error: unknown): NodeJS.ErrnoException | undefined {

  // Shape 1: an Error wrapping a Node ErrnoException through the standard `cause` chain. Matches Undici's TypeError("fetch failed", { cause: errnoError }) idiom.
  if((error instanceof Error) && (error.cause instanceof Error) && ("code" in error.cause) && (typeof (error.cause as NodeJS.ErrnoException).code === "string")) {

    return error.cause as NodeJS.ErrnoException;
  }

  // Shape 2: a bare ErrnoException, as Node delivers from filesystem, stream, and socket APIs.
  if((error instanceof Error) && ("code" in error) && (typeof (error as NodeJS.ErrnoException).code === "string")) {

    return error as NodeJS.ErrnoException;
  }

  return undefined;
}
