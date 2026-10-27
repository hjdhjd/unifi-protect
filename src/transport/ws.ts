/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * ws.ts: The minimal WebSocket surface every WebSocket-owning transport shares, the message-to-Buffer normalizer every receive-direction transport decodes through,
 * the one rule every socket classifies its failures by, and the reasons a socket's one teardown runs for.
 */
import { ProtectCertificateError, ProtectNetworkError, ProtectTimeoutError, assertNever } from "../errors.ts";
import type { ConnectionFaultLevel } from "./connection-fault.ts";
import type { ProtectError } from "../errors.ts";
import type { TransportFailure } from "./failure.ts";
import { classifyTransportError } from "./failure.ts";
import { connectionFaultLevel } from "./connection-fault.ts";

/**
 * The minimal *receive-direction* WebSocket surface the library's read-only transports (the events stream and each livestream session) consume - deliberately a small
 * subset of the WHATWG/undici `WebSocket` so the dependency is exactly what they need and a test fake is trivial to implement. The default factories adapt undici's
 * `WebSocket` to this shape (it satisfies the surface structurally, so no cast is required). This lives in one module, not on any one transport, so every consumer shares
 * a single definition and a test fake written against it drives any of them.
 *
 * The send-direction transport (the {@link TalkbackSession}) is write-only and reads nothing inbound, so it depends on the separate, equally minimal
 * `ProtectWritableWebSocket` below rather than this one - the surface is split by direction so neither interface carries a method its consumers never call.
 *
 * Registration and removal are a matched pair because every socket detaches its own listeners: it hands back the very function it registered, so an implementation
 * that keys its bookkeeping on listener identity is all the surface needs to be.
 *
 * @category Transport
 */
export interface ProtectWebSocket {

  binaryType: "arraybuffer" | "blob";
  addEventListener(type: "open", listener: () => void, options?: ProtectWebSocketListenerOptions): void;
  addEventListener(type: "message", listener: (event: ProtectWebSocketMessageEvent) => void, options?: ProtectWebSocketListenerOptions): void;
  addEventListener(type: "close", listener: (event: ProtectWebSocketCloseEvent) => void, options?: ProtectWebSocketListenerOptions): void;
  addEventListener(type: "error", listener: (event: ProtectWebSocketErrorEvent) => void, options?: ProtectWebSocketListenerOptions): void;
  close(): void;
  removeEventListener(type: "open", listener: () => void): void;
  removeEventListener(type: "message", listener: (event: ProtectWebSocketMessageEvent) => void): void;
  removeEventListener(type: "close", listener: (event: ProtectWebSocketCloseEvent) => void): void;
  removeEventListener(type: "error", listener: (event: ProtectWebSocketErrorEvent) => void): void;
}

/**
 * The minimal *send-direction* WebSocket surface the {@link TalkbackSession} consumes - the write-direction sibling of {@link ProtectWebSocket}. It writes opaque audio
 * bytes (`send`) and reads `bufferedAmount` as its only backpressure signal, but never reads inbound frames, so it has no `message` listener and no
 * `binaryType` (a write-only socket has no inbound binary to type). It shares the `open` / `close` / `error` listener shape and the close/error payload types with the
 * receive-direction surface, but it is a distinct interface rather than an extension of it: talkback's listener set is not a superset of the receive one (it drops
 * `message`), so the two diverge cleanly instead of one bolting unused surface onto the other. undici's `WebSocket` structurally satisfies this, so the default factory
 * assigns without a cast.
 *
 * @category Transport
 */
export interface ProtectWritableWebSocket {

  /** The number of bytes queued for transmission but not yet flushed to the socket. The send-direction transport's only active backpressure signal. */
  readonly bufferedAmount: number;
  addEventListener(type: "open", listener: () => void, options?: ProtectWebSocketListenerOptions): void;
  addEventListener(type: "close", listener: (event: ProtectWebSocketCloseEvent) => void, options?: ProtectWebSocketListenerOptions): void;
  addEventListener(type: "error", listener: (event: ProtectWebSocketErrorEvent) => void, options?: ProtectWebSocketListenerOptions): void;
  close(): void;
  removeEventListener(type: "open", listener: () => void): void;
  removeEventListener(type: "close", listener: (event: ProtectWebSocketCloseEvent) => void): void;
  removeEventListener(type: "error", listener: (event: ProtectWebSocketErrorEvent) => void): void;

  /** Queue a binary frame for transmission to the camera speaker. */
  send(data: Uint8Array): void;
}

/**
 * The message event delivered to a `message` listener. The realtime and livestream protocols are both binary, so with `binaryType = "arraybuffer"` the controller's
 * frames arrive as an `ArrayBuffer`; we accept any data shape and normalize defensively through {@link toBuffer}.
 *
 * @category Transport
 */
export interface ProtectWebSocketMessageEvent {

  data: unknown;
}

/**
 * The close event delivered to a `close` listener. Mirrors the WebSocket close frame's code and reason.
 *
 * @category Transport
 */
export interface ProtectWebSocketCloseEvent {

  code: number;
  reason: string;
}

/**
 * The error event delivered to an `error` listener. `error` carries the underlying cause when the implementation provides one (undici does).
 *
 * @category Transport
 */
export interface ProtectWebSocketErrorEvent {

  error?: unknown;
  message?: string;
}

/**
 * The listener-registration options the transports use - a subset of the standard `addEventListener` options. `once` is the only one they pass, for the events a
 * socket reports a single time. Detaching is each socket's own act through `removeEventListener` rather than the `signal` registration option: on every Node before
 * the fix for nodejs/node#63954 (all of 22, 24 before 24.22, 25, and 26 before 26.9) the runtime keeps only the last signal-bound removal per target alive, so after a
 * garbage collection an abort would leave the others attached. An implementation of this surface owes nothing beyond honoring `once` and removing by identity.
 *
 * @category Transport
 */
export interface ProtectWebSocketListenerOptions {

  once?: boolean;
}

/**
 * Normalize a WebSocket message payload to a `Buffer` the decoders can read. With `binaryType = "arraybuffer"` the controller's binary frames arrive as an `ArrayBuffer`;
 * we also accept any `ArrayBuffer` view for robustness. A string or Blob is not part of either binary protocol, so it normalizes to `null` and the caller skips it.
 *
 * @param data - The raw `MessageEvent.data` value.
 *
 * @returns The bytes as a `Buffer`, or `null` for a payload that is not part of the binary protocol.
 *
 * @category Transport
 */
export function toBuffer(data: unknown): Buffer | null {

  if(data instanceof ArrayBuffer) {

    return Buffer.from(data);
  }

  if(ArrayBuffer.isView(data)) {

    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }

  return null;
}

/* Build the typed error a socket reports from its classified failure, by the rule the request path reads: a certificate refusal reports as
 * ProtectCertificateError naming the address dialed, a connection attempt that timed out as ProtectTimeoutError, and every other failure as the socket's own
 * ProtectNetworkError. Every socket goes through this one function, so a failure reads as the same class whichever socket met it, and only the sentences differ.
 *
 * The cause the classification carries is what the socket read: its connector's record of the dial when the dial failed, because undici's WebSocket reports a
 * content-free `TypeError` for every failed opening handshake, then its connector's record of the first network or TLS error its established socket raised, because
 * an open WebSocket reports the same content-free `TypeError` for a peer's reset as for a hang-up, and the socket's own error event otherwise. A network error lifts
 * its public `code` from that cause as `ProtectNetworkError` always has.
 */
function classifySocketFailure(failure: TransportFailure, { elapsed, failed, host, timedOut }: { elapsed: number; failed: string; host: string; timedOut: string }):
  ProtectNetworkError | ProtectTimeoutError {

  const { cause } = failure;

  switch(failure.kind) {

    case "certificate":

      return new ProtectCertificateError({ cause, host });

    case "connect-timeout":
    case "timeout":

      return new ProtectTimeoutError(timedOut, { cause, elapsedMs: elapsed });

    case "aborted":
    case "destroyed":
    case "dns":
    case "refused":
    case "reset":
    case "retries-exhausted":
    case "transport":
    case "unreachable":

      return new ProtectNetworkError(failed, { cause });

    default:

      // Exhaustiveness guard. A new kind joining the union without a case above stops `failure` being `never` here, and this fails to compile.
      return assertNever(failure);
  }
}

/**
 * The line a socket logs for a fault, built where the fault was classified: the logger method it logs through, at the level the family's connection-fault table
 * answered, its sentence and its structured context.
 *
 * @category Transport
 */
export interface SocketFaultLine {

  readonly context: Record<string, unknown>;
  readonly level: "error" | "warn";
  readonly message: string;
}

/**
 * Why a socket's one teardown runs, handed to it as an argument rather than kept in a field: every trigger already knows which it is, and nothing reads it once the
 * teardown has returned. The caller's signal names a cancel and an explicit close() names itself; a socket error, a watchdog stall and a failed negotiation each
 * name a fault, carrying the typed error the teardown reports and the line it logs, if any; and the socket's own close listener names the peer, carrying the
 * frame's code. Every arm carries the reason the teardown announces its close with.
 *
 * @category Transport
 */
export type SocketTeardown = { readonly kind: "callerSignal"; readonly reason: string } | { readonly kind: "close"; readonly reason: string } |
  { readonly error: ProtectError; readonly kind: "fault"; readonly line: SocketFaultLine | null; readonly reason: string } |
  { readonly code: number; readonly kind: "peer"; readonly reason: string };

/**
 * The close code a teardown announces, derived from why it ran by the RFC 6455 status codes rather than read from a frame: 1000, normal closure, for a teardown the
 * socket chose (an explicit close or a caller's cancel), and 1006, abnormal closure, for one a fault forced, while a close the peer started keeps its own frame's
 * code. A consumer inspecting the code tells a deliberate teardown from one that signals a connection problem by it.
 *
 * @param teardown - Why the teardown ran.
 *
 * @returns The close code the teardown announces.
 *
 * @category Transport
 */
export function teardownCode(teardown: SocketTeardown): number {

  switch(teardown.kind) {

    case "callerSignal":
    case "close":

      return 1000;

    case "fault":

      return 1006;

    case "peer":

      return teardown.code;

    default:

      // Exhaustiveness guard. A new reason joining the union without a case above stops `teardown` being `never` here, and this fails to compile.
      return assertNever(teardown);
  }
}

/**
 * The close frame in the words an error message carries it in: always the code, and what the peer said when the frame said anything at all. The frame travels in
 * the message rather than on the cause chain because the chain renderer skips a cause that is not an Error, so a reason hung off one is invisible in every rendered
 * failure a consumer logs...and the frame is the whole account a controller that went away leaves behind.
 *
 * @param code   - The frame's close code.
 * @param reason - The frame's reason, empty when the peer gave none.
 *
 * @returns The frame as a peer-close error names it.
 *
 * @category Transport
 */
export function closeFrameText(code: number, reason: string): string {

  const frame = "close code " + code.toString();

  if(reason.length === 0) {

    return frame;
  }

  return frame + ": " + reason;
}

// The line a fault logs at the level the connection-fault table answered, in the logger's own vocabulary: an error logs through `error`, a warning through `warn`,
// and a quiet fault carries no line at all.
function faultLine(level: ConnectionFaultLevel, message: string, context: Record<string, unknown>): SocketFaultLine | null {

  switch(level) {

    case "error":

      return { context, level: "error", message };

    case "quiet":

      return null;

    case "warning":

      return { context, level: "warn", message };

    default:

      // Exhaustiveness guard. A new level joining the union without a case above stops `level` being `never` here, and this fails to compile.
      return assertNever(level);
  }
}

/**
 * Classify a socket's failure once into the fault its teardown runs for: the typed error the socket reports and, for a socket whose `open` event has fired, the line
 * it logs, so the line and the typed error name the same fault and no socket carries a level rule of its own. Nothing logs here: the teardown logs the line once it
 * has released the connection, so a logger that throws meets a connection already let go.
 *
 * The line belongs to a socket whose `open` event has fired, because a failure before then reaches its caller through the socket's handshake answer, and a line as
 * well would log one failure twice. It logs at the level the family's connection-fault table answers for an open connection: a peer's reset or a network that
 * stopped answering is a warning, a certificate verdict is an error, and a hang-up with no close frame or a timeout is how an open connection ordinarily ends, so
 * it carries no line. The cause itself is the line's structured context, and the typed error is never levelled or muted.
 *
 * @param options          - The failure the socket read and what it reports the failure with.
 * @param options.cause    - The raw failure the socket read: its connector's record of the dial, then its connector's record of the established connection, then
 *                           the error event's own error.
 * @param options.elapsed  - Milliseconds since the socket's connection attempt began, read on its clock, which a timeout carries.
 * @param options.failed   - The socket's sentence for a failure that is neither a certificate refusal nor a timeout.
 * @param options.host     - The address the socket dialed, its URL's host and port, which a certificate refusal names.
 * @param options.open     - Whether the socket's `open` event had fired, which is what lets the fault carry a line at all.
 * @param options.reason   - The reason the teardown announces its close with.
 * @param options.reported - The socket's sentence for the line.
 * @param options.timedOut - The socket's sentence for a connection attempt that timed out.
 *
 * @returns The fault the socket's teardown runs for.
 *
 * @category Transport
 */
export function socketFault({ cause, elapsed, failed, host, open, reason, reported, timedOut }: { cause: unknown; elapsed: number; failed: string; host: string;
  open: boolean; reason: string; reported: string; timedOut: string; }): Extract<SocketTeardown, { kind: "fault" }> {

  const failure = classifyTransportError(cause);

  return { error: classifySocketFailure(failure, { elapsed, failed, host, timedOut }), kind: "fault",
    line: open ? faultLine(connectionFaultLevel(failure, { open }), reported, { error: cause }) : null, reason };
}
