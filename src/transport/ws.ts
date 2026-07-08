/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * ws.ts: The minimal WebSocket seam shared by every WebSocket-owning transport, plus the message-to-Buffer normalizer every receive-direction transport decodes through.
 */

/**
 * The minimal *receive-direction* WebSocket surface the library's read-only transports (the events stream and each livestream session) consume - deliberately a small
 * subset of the WHATWG/undici `WebSocket` so the dependency is exactly what they need and a test fake is trivial to implement. The default factories adapt undici's
 * `WebSocket` to this shape (it satisfies the surface structurally, so no cast is required). This lives in one module, not on any one transport, so every consumer shares
 * a single definition and a test fake written against it drives any of them.
 *
 * The send-direction transport (the {@link TalkbackSession}) is write-only and reads nothing inbound, so it depends on the separate, equally minimal
 * `ProtectWritableWebSocket` below rather than this one - the seam is split by direction so neither interface carries a method its consumers never call.
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
 * bytes (`send`) and reads `bufferedAmount` as its structural-backpressure safety bound, but never reads inbound frames, so it has no `message` listener and no
 * `binaryType` (a write-only socket has no inbound binary to type). It shares the `open` / `close` / `error` listener shape and the close/error payload types with the
 * receive seam, but it is a distinct interface rather than an extension of it: talkback's listener set is not a superset of the receive one (it drops `message`), so the
 * two diverge cleanly instead of one bolting unused surface onto the other. undici's `WebSocket` structurally satisfies this, so the default factory assigns without a
 * cast.
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
 * listener at once, the shared teardown primitive both the events stream and the livestream session rely on.
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
