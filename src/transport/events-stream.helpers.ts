/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * events-stream.helpers.ts: A deterministic fake WebSocket for EventStream tests - the injected I/O dependency that lets the realtime stream be exercised without a live
 * controller (undici's MockAgent does not mock WebSockets).
 */
import type { ProtectWebSocket } from "./ws.ts";

// The listener-registration options EventStream uses - a subset of the standard addEventListener options.
interface ListenerOptions {

  once?: boolean;
}

// A registered listener and whether it should fire only once. Stored type-erased; the public addEventListener overloads keep the call sites fully typed.
interface ListenerEntry {

  listener: (event: unknown) => void;
  once: boolean;
}

/**
 * Construction options for {@link FakeWebSocket}.
 *
 * - `autoOpen` (default `true`) schedules an `open` event on the next microtask, so a consumer that simply `await`s the stream's open handshake connects without the
 *   test having to drive `emitOpen()` by hand. Tests that scrutinize the handshake itself pass `false` and open explicitly.
 * - `closeFault` (default `false`) makes `close()` throw after it records the request, so a test can prove a consumer's teardown survives a faulting socket close.
 * - `failsOnClose` (default `false`) makes `close()` on a socket that has not opened fire `error` and then `close` with code 1006 from inside the call, which is what
 *   undici does to a socket still connecting: a close request fails the connection from underneath rather than sending a close frame, and reports the failure
 *   synchronously. A test asks for it to drive a close that lands while the caller is still inside the teardown that requested it.
 */
export interface FakeWebSocketOptions {

  autoOpen?: boolean;
  closeFault?: boolean;
  failsOnClose?: boolean;
}

/**
 * A deterministic in-memory WebSocket that satisfies the {@link ProtectWebSocket} surface {@link EventStream} consumes. Tests inject it via the `webSocket` factory
 * and drive the connection with the `emit*` methods - no network, no real server, no timing nondeterminism. It honors `once` on `addEventListener` and detaches on
 * `removeEventListener` by identity, exactly as the real socket does, and nothing else removes a listener, so a teardown that forgets a removal leaves a listener
 * {@link FakeWebSocket.listenerCount} reads.
 */
export class FakeWebSocket implements ProtectWebSocket {

  binaryType: "arraybuffer" | "blob" = "blob";

  // Whether close() has been requested on the socket, for tests that assert the EventStream asked the underlying socket to close.
  closeRequested = false;

  readonly #closeFault: boolean;
  readonly #failsOnClose: boolean;
  readonly #listeners = new Map<string, Set<ListenerEntry>>();

  // Where the socket is in its lifecycle as the `emit*` methods have driven it, which is what tells `failsOnClose` whether a close lands on a socket still connecting.
  #readyState: "closed" | "connecting" | "open" = "connecting";

  constructor(options: FakeWebSocketOptions = {}) {

    this.#closeFault = options.closeFault ?? false;
    this.#failsOnClose = options.failsOnClose ?? false;

    // Open on the next microtask by default, after the EventStream constructor has synchronously attached its listeners.
    if(options.autoOpen ?? true) {

      queueMicrotask(() => this.emitOpen());
    }
  }

  addEventListener(type: "open", listener: () => void, options?: ListenerOptions): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void, options?: ListenerOptions): void;
  addEventListener(type: "close", listener: (event: { code: number; reason: string }) => void, options?: ListenerOptions): void;
  addEventListener(type: "error", listener: (event: { error?: unknown; message?: string }) => void, options?: ListenerOptions): void;
  addEventListener(type: string, listener: (event: never) => void, options: ListenerOptions = {}): void {

    const set = this.#setFor(type);
    const entry: ListenerEntry = { listener: listener as (event: unknown) => void, once: options.once ?? false };

    set.add(entry);
  }

  /**
   * Request the socket close. Records the request; teardown in EventStream flows through its own close path rather than waiting on a close event here. When constructed
   * with `failsOnClose`, a socket that has not opened fires `error` and then `close` 1006 from inside this call, undici's empty error and reason on each. When
   * constructed with `closeFault`, it throws after recording the request.
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

      throw new Error("the underlying socket close() faulted");
    }
  }

  /** The number of listeners still registered, across every event type, for a test that reads whether a teardown removed everything it added. */
  listenerCount(): number {

    let count = 0;

    for(const set of this.#listeners.values()) {

      count += set.size;
    }

    return count;
  }

  removeEventListener(type: "open", listener: () => void): void;
  removeEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  removeEventListener(type: "close", listener: (event: { code: number; reason: string }) => void): void;
  removeEventListener(type: "error", listener: (event: { error?: unknown; message?: string }) => void): void;
  /** Detach a listener by the identity of the function that was registered, which is the only handle the caller is given and the only one it hands back. */
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

  /** Fire the `open` event. */
  emitOpen(): void {

    if(this.#readyState === "connecting") {

      this.#readyState = "open";
    }

    this.#dispatch("open", undefined);
  }

  /** Fire a `message` event carrying `data` (typically a Buffer of encoded packet bytes). */
  emitMessage(data: unknown): void {

    this.#dispatch("message", { data });
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

  // Get or create the listener set for a type.
  #setFor(type: string): Set<ListenerEntry> {

    let set = this.#listeners.get(type);

    if(set === undefined) {

      set = new Set();
      this.#listeners.set(type, set);
    }

    return set;
  }
}
