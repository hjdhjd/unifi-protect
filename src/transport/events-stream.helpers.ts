/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * events-stream.helpers.ts: A deterministic fake WebSocket for EventStream tests - the injected I/O seam that lets the realtime stream be exercised without a live
 * controller (undici's MockAgent does not mock WebSockets).
 */
import type { ProtectWebSocket } from "./ws.ts";

// The listener-registration options EventStream uses - a subset of the standard addEventListener options.
interface ListenerOptions {

  once?: boolean;
  signal?: AbortSignal;
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
 */
export interface FakeWebSocketOptions {

  autoOpen?: boolean;
}

/**
 * A deterministic in-memory WebSocket that satisfies the {@link ProtectWebSocket} surface {@link EventStream} consumes. Tests inject it via the `webSocket` factory seam
 * and drive the connection with the `emit*` methods - no network, no real server, no timing nondeterminism. It honors `once` and `signal` on `addEventListener` exactly
 * as the real socket does, so the EventStream's single-AbortController teardown (which detaches every listener at once) is exercised faithfully.
 */
export class FakeWebSocket implements ProtectWebSocket {

  binaryType: "arraybuffer" | "blob" = "blob";

  // Whether close() has been requested on the socket, for tests that assert the EventStream asked the underlying socket to close.
  closeRequested = false;

  readonly #listeners = new Map<string, Set<ListenerEntry>>();

  constructor(options: FakeWebSocketOptions = {}) {

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

    // The signal detaches the listener on abort - the mechanism the EventStream's one AbortController uses to tear every listener down together.
    options.signal?.addEventListener("abort", () => set.delete(entry), { once: true });
  }

  /** Request the socket close. Records the request; teardown in EventStream flows through its own close path rather than waiting on a close event here. */
  close(): void {

    this.closeRequested = true;
  }

  /** Fire the `open` event. */
  emitOpen(): void {

    this.#dispatch("open", undefined);
  }

  /** Fire a `message` event carrying `data` (typically a Buffer of encoded packet bytes). */
  emitMessage(data: unknown): void {

    this.#dispatch("message", { data });
  }

  /** Fire a `close` event with the given frame code and reason. */
  emitClose(code = 1000, reason = ""): void {

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

  #setFor(type: string): Set<ListenerEntry> {

    let set = this.#listeners.get(type);

    if(set === undefined) {

      set = new Set();
      this.#listeners.set(type, set);
    }

    return set;
  }
}
