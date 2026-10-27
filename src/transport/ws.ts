/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * ws.ts: The minimal WebSocket surface every WebSocket-owning transport shares, the message-to-Buffer normalizer every receive-direction transport decodes through,
 * and the one rule every socket classifies its failures by.
 */
import { ProtectCertificateError, ProtectNetworkError, ProtectTimeoutError, assertNever } from "../errors.ts";
import { classifyTransportError } from "./failure.ts";

/**
 * The minimal *receive-direction* WebSocket surface the library's read-only transports (the events stream and each livestream session) consume - deliberately a small
 * subset of the WHATWG/undici `WebSocket` so the dependency is exactly what they need and a test fake is trivial to implement. The default factories adapt undici's
 * `WebSocket` to this shape (it satisfies the surface structurally, so no cast is required). This lives in one module, not on any one transport, so every consumer shares
 * a single definition and a test fake written against it drives any of them.
 *
 * The send-direction transport (the {@link TalkbackSession}) is write-only and reads nothing inbound, so it depends on the separate, equally minimal
 * `ProtectWritableWebSocket` below rather than this one - the surface is split by direction so neither interface carries a method its consumers never call.
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
 * The listener-registration options the transports use - a subset of the standard `addEventListener` options. `signal` is how a single `AbortController` detaches every
 * listener at once, the shared teardown primitive every WebSocket-owning transport relies on.
 *
 * @category Transport
 */
export interface ProtectWebSocketListenerOptions {

  once?: boolean;
  signal?: AbortSignal;
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

/**
 * Classify a socket's failure into the typed error the socket reports, by the rule the request path reads: the transport failure classifier answers the kind, a
 * certificate refusal reports as {@link ProtectCertificateError} naming the address dialed, a connection attempt that timed out as {@link ProtectTimeoutError},
 * and every other failure as the socket's own {@link ProtectNetworkError}. Every socket goes through this one function, so a failure reads as the same class
 * whichever socket met it, and only the sentences differ.
 *
 * The cause is what the socket read: its connector's record of the dial when the dial failed, because undici's WebSocket reports a content-free `TypeError` for
 * every failed opening handshake, and the socket's own error event otherwise. A network error lifts its public `code` from that cause as `ProtectNetworkError`
 * always has.
 *
 * @param cause            - The raw failure the socket read.
 * @param options          - What the socket reports the failure with.
 * @param options.elapsed  - Milliseconds since the socket's connection attempt began, read on its clock, which a timeout carries.
 * @param options.failed   - The socket's sentence for a failure that is neither a certificate refusal nor a timeout.
 * @param options.host     - The address the socket dialed, its URL's host and port, which a certificate refusal names.
 * @param options.timedOut - The socket's sentence for a connection attempt that timed out.
 *
 * @returns The typed error the socket reports.
 *
 * @category Transport
 */
export function classifySocketFailure(cause: unknown, { elapsed, failed, host, timedOut }: { elapsed: number; failed: string; host: string; timedOut: string }):
  ProtectNetworkError | ProtectTimeoutError {

  const failure = classifyTransportError(cause);

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

      return new ProtectNetworkError(failed, { cause });

    default:

      // Exhaustiveness guard. A new kind joining the union without a case above stops `failure` being `never` here, and this fails to compile.
      return assertNever(failure);
  }
}
