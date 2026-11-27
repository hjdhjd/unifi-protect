/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * rtp-socket.ts: The talkback session's RTP socket - one Opus packet a datagram, straight to the camera's talkback listener.
 */

/**
 * `RtpTalkbackSocket` is the write socket an Opus talkback session drains into: a connected UDP socket to the address the controller's WebRTC talkback route answers,
 * which names the camera's own listener, so the controller is not on the audio path. Each chunk the session hands it is one Opus packet, and leaves as one RTP
 * datagram carrying payload type 111 on the 48 kHz clock RFC 7587 gives Opus, the sequence number and timestamp seeded at random and the stream's one SSRC chosen at
 * random, all through `node:crypto`.
 *
 * - **Open.** The socket binds itself to a free local port and connects to the camera's address, the family chosen by whether the host is an IPv6 literal, and
 *   reports `open` once the connect completes. Connecting a UDP socket sends nothing: it fixes the one peer every datagram goes to.
 * - **Errors.** A failure reaches the session through the socket's `error` event, which is where macOS delivers the ICMP refusal of a camera not listening, on
 *   the connected socket's receive path, and through one send-completion callback held in a field and handed to every send, which is the only path a datagram
 *   too large to send reports through. Each kind of failure arrives through only one of them, so the socket listens on each, and each reports `error` with the
 *   failure as its cause.
 * - **Sending.** `send` reads the packet's duration from its TOC byte before anything else, so a chunk that is not one Opus packet throws
 *   `ProtectProtocolError` and writes nothing, then writes the packet and advances the sequence number and the timestamp only once the write is handed to the
 *   socket, so a write that throws leaves the stream where it was.
 * - **Backpressure.** `bufferedAmount` reads the socket's send queue while it is open, which a UDP socket drains straight to the network and so holds near zero.
 * - **Close.** `close()` runs once: it stops reporting to the session at once and closes the socket, and it keeps one discarding `error` handler on the socket
 *   until the socket emits its own `close`, removing it then by identity, because a close queued behind the socket's automatic bind still lets a bind that fails
 *   emit `error`, which a socket with no `error` listener throws.
 * - **No peer close.** A UDP socket has no peer that can close it, so it never reports `close`.
 *
 * @module RtpTalkbackSocket
 */
import { OPUS_RTP_PAYLOAD_TYPE, nextRtpSequence, nextRtpTimestamp, writeRtpPacket } from "../protocol/media/rtp.ts";
import type { ProtectWebSocketCloseEvent, ProtectWebSocketErrorEvent, ProtectWebSocketListenerOptions, ProtectWritableSocket } from "./ws.ts";
import { EventEmitter } from "node:events";
import type { Socket } from "node:dgram";
import { createSocket } from "node:dgram";
import { isIP } from "node:net";
import { opusPacketDuration } from "../protocol/media/codecs/opus.ts";
import { randomBytes } from "node:crypto";

// The random bytes a stream is seeded from: two for its first sequence number, then four for its synchronization source and four for its first timestamp.
const SEED_SIZE = 10;

/**
 * The write socket an Opus talkback session drains into, one RTP datagram per Opus packet to the camera's talkback listener. The session builds one per Opus
 * endpoint it negotiates; nothing else constructs it.
 *
 * @category Transport
 */
export class RtpTalkbackSocket implements ProtectWritableSocket {

  // The session's listeners, held by an emitter so honoring `once` and removing by identity are the platform's own.
  readonly #events = new EventEmitter();
  readonly #socket: Socket;

  // The stream's header fields, held as one record that each send advances in place, so a send allocates its packet and nothing else.
  readonly #header: { payloadType: number; sequence: number; ssrc: number; timestamp: number };

  #state: "closed" | "connecting" | "open" = "connecting";

  // The socket's handlers, built once and held so each comes off by the identity it was registered under. The send-completion callback is handed to every send, so a
  // send allocates no closure.
  readonly #onSent = (error: Error | null): void => {

    if(error !== null) {

      this.#report(error);
    }
  };

  readonly #onSocketClose = (): void => {

    this.#socket.removeListener("error", this.#onSocketError);
  };

  readonly #onSocketConnect = (): void => {

    this.#state = "open";
    this.#events.emit("open");
  };

  readonly #onSocketError = (error: Error): void => this.#report(error);

  /**
   * Bind a UDP socket and connect it to the camera's talkback listener. The socket reports `open` once the connect completes.
   *
   * @param endpoint      - The camera's talkback listener.
   * @param endpoint.host - Its host: an IPv4 or an IPv6 literal, the latter without brackets, or a name.
   * @param endpoint.port - Its UDP port.
   */
  constructor({ host, port }: { host: string; port: number }) {

    const seed = randomBytes(SEED_SIZE);

    this.#header = { payloadType: OPUS_RTP_PAYLOAD_TYPE, sequence: seed.readUInt16BE(0), ssrc: seed.readUInt32BE(2), timestamp: seed.readUInt32BE(6) };
    this.#socket = createSocket((isIP(host) === 6) ? "udp6" : "udp4");

    this.#socket.once("close", this.#onSocketClose);
    this.#socket.once("connect", this.#onSocketConnect);
    this.#socket.on("error", this.#onSocketError);
    this.#socket.connect(port, host);
  }

  /** The bytes the socket has queued but not yet sent, read from its send queue while it is open, and 0 before it opens or once it has closed. */
  get bufferedAmount(): number {

    return (this.#state === "open") ? this.#socket.getSendQueueSize() : 0;
  }

  /** Register a listener for the `open` or `error` event, honoring the `once` option. The `close` event is accepted and never fired. */
  addEventListener(type: "open", listener: () => void, options?: ProtectWebSocketListenerOptions): void;
  addEventListener(type: "close", listener: (event: ProtectWebSocketCloseEvent) => void, options?: ProtectWebSocketListenerOptions): void;
  addEventListener(type: "error", listener: (event: ProtectWebSocketErrorEvent) => void, options?: ProtectWebSocketListenerOptions): void;
  addEventListener(type: string, listener: (event: never) => void, options: ProtectWebSocketListenerOptions = {}): void {

    // The listener is handed to the emitter type-erased, and the public overloads above keep every call site fully typed.
    const registered = listener as (event: unknown) => void;

    if(options.once === true) {

      this.#events.once(type, registered);

      return;
    }

    this.#events.on(type, registered);
  }

  /** Close the socket. Safe to call more than once: only the first call closes it, and every report stops with that call. */
  close(): void {

    if(this.#state === "closed") {

      return;
    }

    this.#state = "closed";
    this.#socket.removeListener("connect", this.#onSocketConnect);
    this.#socket.close();
  }

  /** Detach a listener by the identity of the function that was registered. */
  removeEventListener(type: "open", listener: () => void): void;
  removeEventListener(type: "close", listener: (event: ProtectWebSocketCloseEvent) => void): void;
  removeEventListener(type: "error", listener: (event: ProtectWebSocketErrorEvent) => void): void;
  removeEventListener(type: string, listener: (event: never) => void): void {

    this.#events.off(type, listener as (event: unknown) => void);
  }

  /**
   * Send one Opus packet to the camera as one RTP datagram. A packet handed over before the socket opens, which the session never does, or once it has closed is
   * discarded.
   *
   * @param data - One Opus packet.
   *
   * @throws {@link ProtectProtocolError} if the chunk is not one Opus packet, before anything is written.
   */
  send(data: Uint8Array): void {

    if(this.#state !== "open") {

      return;
    }

    const samples = opusPacketDuration(data);

    this.#socket.send(writeRtpPacket(this.#header, data), this.#onSent);

    this.#header.sequence = nextRtpSequence(this.#header.sequence);
    this.#header.timestamp = nextRtpTimestamp(this.#header.timestamp, samples);
  }

  // Report a failure to the session, or discard it once the socket has closed. The emitter throws an `error` no listener takes, and a socket nobody listens to has
  // nobody to report to, so a failure with no listener is dropped rather than thrown on the socket's own event path.
  #report(error: unknown): void {

    if((this.#state === "closed") || (this.#events.listenerCount("error") === 0)) {

      return;
    }

    this.#events.emit("error", { error } satisfies ProtectWebSocketErrorEvent);
  }
}
