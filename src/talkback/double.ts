/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * double.ts: The shipped talkback test doubles - a deterministic write socket a suite drives by hand, and a factory that connects a real TalkbackSession over one in
 * any codec, so a consumer's suite exercises the send-only channel without a live controller. The unifi-protect/testing entry publishes each of them.
 */
import type { TalkbackAudioCodec, TalkbackEndpoint } from "./session.ts";
import type { ProtectWritableSocket } from "../transport/ws.ts";
import { TalkbackSession } from "./session.ts";
import { opusPacketDuration } from "../protocol/media/codecs/opus.ts";

// The synthetic camera every session a factory connects negotiates for, and the synthetic endpoint its resolver answers for each codec, at a rate a camera may be
// set to: the `.invalid` top-level domain never resolves, and no session built here dials any of them, because the socket it dials is the double below.
const TEST_TALKBACK_CAMERA_ID = "talkback-double-camera";
const TEST_TALKBACK_ENDPOINTS = {

  aac: { kind: "webSocket", samplingRate: 22050, url: "wss://controller.invalid/talkback" },
  opus: { host: "camera.invalid", kind: "rtp", port: 5004, samplingRate: 24000 }
} as const satisfies Record<TalkbackAudioCodec, TalkbackEndpoint>;

// The listener-registration options TalkbackSession passes, which are a subset of the standard addEventListener options.
interface ListenerOptions {

  once?: boolean;
}

// A registered listener and whether it fires only once. The listener is stored type-erased, and the public addEventListener overloads keep the call sites fully
// typed.
interface ListenerEntry {

  listener: (event: unknown) => void;
  once: boolean;
}

/**
 * Construction options for {@link TestTalkbackSocket}, and for every socket a {@link TestTalkbackFactory} built with them dials.
 *
 * - `autoOpen` (default `true`) opens the socket on the next microtask, so a session's connect resolves with no driving by hand. A suite that scrutinizes the open
 *   handshake itself passes `false` and opens the socket with `emitOpen()`.
 * - `closeFault` (default `false`) makes `close()` throw after it records the request, so a suite can show that a teardown survives a socket whose close faults.
 * - `failsOnClose` (default `false`) makes `close()` on a socket that has not opened fire `error` and then `close` with code 1006 from inside the call, because undici
 *   fails a socket still connecting from underneath a close request and reports it synchronously.
 */
export interface TestTalkbackSocketOptions {

  autoOpen?: boolean;
  closeFault?: boolean;
  failsOnClose?: boolean;
}

/**
 * A deterministic in-memory socket with the write-direction surface a {@link TalkbackSession} dials, standing in for any of its sockets: `send`,
 * `bufferedAmount`, and the `open`, `close` and `error` listeners, with no `message` listener and no `binaryType`, because the talkback channel carries nothing
 * inbound. A suite drives the connection with the `emit*` methods and reads what the session did: `sent` records every chunk written as it was handed over, in
 * order, `closeRequested` whether the session asked the socket to close, and {@link TestTalkbackSocket.listenerCount} the listeners still registered. The socket
 * honors `once` and detaches on `removeEventListener` by identity, and nothing else removes a listener, so a teardown that forgets a removal leaves one behind.
 * `bufferedAmount` is writable, so a suite can drive the session's send-buffer safety ceiling. Once the session has asked it to close, the socket keeps the contract
 * every talkback socket keeps after `close()` and discards what it is handed, so `sent` holds only what a real socket would have taken.
 *
 * A consumer's suite receives one from each {@link TestTalkbackFactory.connect} call, through {@link TestTalkbackConnectCall.socket}. The socket an Opus call's
 * session dials checks each chunk it takes as the camera's RTP socket does, refusing one that is not one Opus packet with `ProtectProtocolError` before it records
 * it, and checks nothing once it is asked to close, as the camera's RTP socket reads nothing it discards.
 */
export class TestTalkbackSocket implements ProtectWritableSocket {

  /** The bytes queued for transmission but not yet flushed. It stays at zero unless a suite sets it to drive the session's send-buffer safety ceiling. */
  bufferedAmount = 0;

  /** Whether the session has asked the socket to close. */
  closeRequested = false;

  /** Every chunk the session sent before it asked the socket to close, in order, as it was handed over. */
  readonly sent: Uint8Array[] = [];

  readonly #closeFault: boolean;
  readonly #failsOnClose: boolean;
  readonly #listeners = new Map<string, Set<ListenerEntry>>();

  // Where the socket is in its lifecycle as the `emit*` methods have driven it, which is what tells `failsOnClose` whether a close lands on a socket still connecting.
  #readyState: "closed" | "connecting" | "open" = "connecting";

  /**
   * Build a socket double, still connecting.
   *
   * @param options - The {@link TestTalkbackSocketOptions} that shape how the socket opens and closes.
   */
  constructor(options: TestTalkbackSocketOptions = {}) {

    this.#closeFault = options.closeFault ?? false;
    this.#failsOnClose = options.failsOnClose ?? false;

    // Open on the next microtask by default, after the TalkbackSession's connect has synchronously attached its listeners.
    if(options.autoOpen ?? true) {

      queueMicrotask(() => this.emitOpen());
    }
  }

  /** Register a listener for the `open`, `close` or `error` event, honoring the `once` option as a WebSocket does. */
  addEventListener(type: "open", listener: () => void, options?: ListenerOptions): void;
  addEventListener(type: "close", listener: (event: { code: number; reason: string }) => void, options?: ListenerOptions): void;
  addEventListener(type: "error", listener: (event: { error?: unknown; message?: string }) => void, options?: ListenerOptions): void;
  addEventListener(type: string, listener: (event: never) => void, options: ListenerOptions = {}): void {

    const set = this.#setFor(type);
    const entry: ListenerEntry = { listener: listener as (event: unknown) => void, once: options.once ?? false };

    set.add(entry);
  }

  /**
   * Request the socket close. Records the request; teardown in TalkbackSession flows through its own close path rather than waiting on a close event here. When
   * constructed with `failsOnClose`, a socket that has not opened fires `error` and then `close` 1006 from inside this call, undici's empty error and reason on each.
   * When constructed with `closeFault`, it throws after recording the request.
   */
  close(): void {

    this.closeRequested = true;

    // The socket is closed before it reports, as undici closes it, so a close() re-entered from a listener here asks nothing of it a second time.
    if(this.#failsOnClose && (this.#readyState === "connecting")) {

      this.#readyState = "closed";
      this.emitError(new TypeError(""));
      this.emitClose(1006, "");
    }

    if(this.#closeFault) {

      throw new Error("The talkback socket double's close() faulted, as its closeFault option asks.");
    }
  }

  /** The number of listeners still registered, across every event type, for a suite that reads whether a teardown removed everything it added. */
  listenerCount(): number {

    let count = 0;

    for(const set of this.#listeners.values()) {

      count += set.size;
    }

    return count;
  }

  /** Detach a listener by the identity of the function that was registered, which is the only handle the caller is given and the only one it hands back. */
  removeEventListener(type: "open", listener: () => void): void;
  removeEventListener(type: "close", listener: (event: { code: number; reason: string }) => void): void;
  removeEventListener(type: "error", listener: (event: { error?: unknown; message?: string }) => void): void;
  removeEventListener(type: string, listener: (event: never) => void): void {

    const set = this.#listeners.get(type);

    if(set === undefined) {

      return;
    }

    const registered = listener as (event: unknown) => void;

    for(const entry of set) {

      if(entry.listener === registered) {

        set.delete(entry);

        return;
      }
    }
  }

  /**
   * Queue a binary frame for transmission. Records it in {@link TestTalkbackSocket.sent} so a suite can assert the bytes and their order, and discards it once the
   * session has asked the socket to close, as every talkback socket does.
   */
  send(data: Uint8Array): void {

    if(this.closeRequested) {

      return;
    }

    this.sent.push(data);
  }

  /** Fire the `open` event, as the controller accepting the upgrade does. */
  emitOpen(): void {

    if(this.#readyState === "connecting") {

      this.#readyState = "open";
    }

    this.#dispatch("open", undefined);
  }

  /** Fire a `close` event with the given frame code and reason. */
  emitClose(code = 1000, reason = ""): void {

    this.#readyState = "closed";
    this.#dispatch("close", { code, reason });
  }

  /** Fire an `error` event carrying an optional underlying cause. */
  emitError(error?: unknown): void {

    this.#dispatch("error", { error });
  }

  // Dispatch an event to every listener registered for the type, removing any that asked to fire only once. We snapshot the set first so a listener that detaches
  // mid-dispatch does not perturb the iteration.
  #dispatch(type: string, event: unknown): void {

    const set = this.#listeners.get(type);

    if(set === undefined) {

      return;
    }

    for(const entry of [...set]) {

      if(entry.once) {

        set.delete(entry);
      }

      entry.listener(event);
    }
  }

  // Return the listener set for the given event type, creating and caching an empty one on first use.
  #setFor(type: string): Set<ListenerEntry> {

    let set = this.#listeners.get(type);

    if(set === undefined) {

      set = new Set();
      this.#listeners.set(type, set);
    }

    return set;
  }
}

// The socket an Opus call's session dials: the socket double that reads each chunk's duration from its TOC byte before it records it, as the camera's RTP socket
// does before it writes, so a suite meets the same ProtectProtocolError a chunk that is not one Opus packet meets on the wire. A chunk handed over once the session
// has asked the socket to close is discarded unread, as the camera's RTP socket discards it.
class TestOpusTalkbackSocket extends TestTalkbackSocket {

  override send(data: Uint8Array): void {

    if(this.closeRequested) {

      return;
    }

    opusPacketDuration(data);
    super.send(data);
  }
}

/**
 * One {@link TestTalkbackFactory.connect} call, as the factory recorded it.
 *
 * - `audio` is the codec the caller asked for, `"aac"` when it named none.
 * - `signal` is the abort signal the caller passed, or `undefined` when it passed none.
 * - `socket` resolves with the socket the call's session dials, once it dials. The session negotiates its endpoint before it dials, so the socket does not exist yet
 *   when `connect` returns its promise, and an event fired before the dial would reach no listener, as on a real socket. When the connect fails before the dial,
 *   `socket` rejects with the connect's own error, and a suite that never reads it meets no unhandled rejection.
 */
export interface TestTalkbackConnectCall {

  readonly audio: TalkbackAudioCodec;
  readonly signal: AbortSignal | undefined;
  readonly socket: Promise<TestTalkbackSocket>;
}

/**
 * A stand-in for `Camera.talkback` that connects a real {@link TalkbackSession} over a {@link TestTalkbackSocket}, so a consumer's suite drives the session itself - its
 * atomic connect, its send drain and safety ceiling, its teardown and its typed failures - and fakes only the wire beneath it. {@link TestTalkbackFactory.connect} takes
 * `Camera.talkback`'s signature, so a host standing in for a camera answers `talkback(opts)` with `factory.connect(opts)` and passes the call straight through.
 *
 * Each call is recorded in {@link TestTalkbackFactory.connectCalls} with the codec it asked for, the caller's signal and the socket its session dials, which the suite
 * drives to open, close or fail the connection. The session takes the caller's signal as a camera's does, so aborting it cancels the connect and tears down a live
 * session.
 *
 * Every session the factory connects negotiates for, and publishes on the talkback diagnostics channels under, one synthetic camera id, `talkback-double-camera`,
 * whichever camera the host stands in for, and answers a synthetic endpoint for its codec: an AAC session a WebSocket endpoint at 22050 Hz, and an Opus session an
 * RTP endpoint at 24000 Hz, each session's `samplingRate` reading that rate.
 */
export class TestTalkbackFactory {

  /** Every connect call, in order, with its codec, the caller's signal and the socket its session dials, so a suite can assert the call was made and drive its socket. */
  readonly connectCalls: TestTalkbackConnectCall[] = [];

  readonly #socketOptions: TestTalkbackSocketOptions;

  /**
   * Build a factory whose sessions each dial a fresh socket double.
   *
   * @param options - The {@link TestTalkbackSocketOptions} every socket the factory builds is constructed with.
   */
  constructor(options: TestTalkbackSocketOptions = {}) {

    this.#socketOptions = options;
  }

  /**
   * Connect a real talkback session over a fresh socket double, as `Camera.talkback` connects one over the wire. The call is recorded before anything is awaited,
   * so `connectCalls` holds it as soon as `connect` returns its promise.
   *
   * @param opts        - The talkback options `Camera.talkback` takes.
   * @param opts.audio  - The codec the session sends, `"aac"` when omitted.
   * @param opts.signal - An optional abort signal that cancels the connect and, once live, tears the session down.
   *
   * @returns A connected talkback session.
   *
   * @throws `ProtectAbortedError` when the caller's signal aborts the connect, and the session's typed failure when its socket errors or closes before it opens.
   */
  async connect(opts: { audio?: TalkbackAudioCodec; signal?: AbortSignal } = {}): Promise<TalkbackSession> {

    const { audio = "aac", signal } = opts;
    const socket = Promise.withResolvers<TestTalkbackSocket>();

    // A connect that fails before its session dials rejects the call's socket, which a suite need not read, so the rejection carries a handler of its own and never
    // surfaces as an unhandled one.
    void socket.promise.catch(() => undefined);

    this.connectCalls.push({ audio, signal, socket: socket.promise });

    try {

      return await TalkbackSession.connect({

        cameraId: TEST_TALKBACK_CAMERA_ID,
        resolveEndpoint: async (): Promise<TalkbackEndpoint> => TEST_TALKBACK_ENDPOINTS[audio],
        ...((signal !== undefined) && { signal }),
        socket: (endpoint: TalkbackEndpoint): TestTalkbackSocket => {

          const dialed = (endpoint.kind === "rtp") ? new TestOpusTalkbackSocket(this.#socketOptions) : new TestTalkbackSocket(this.#socketOptions);

          socket.resolve(dialed);

          return dialed;
        }
      });
    } catch(error) {

      // The call's socket rejects with the connect's own error, so a suite awaiting it learns the session never dialed. A session that dialed has already resolved
      // the socket, and this changes nothing.
      socket.reject(error);

      throw error;
    }
  }
}
