/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * talkback-session.helpers.ts: A deterministic fake write-direction WebSocket for TalkbackSession tests - the injected I/O seam that lets the send-only channel be
 * exercised without a live controller, mirroring the receive-direction FakeWebSocket but carrying only the write surface.
 */
import type { ProtectWritableWebSocket } from "./ws.ts";

// The listener-registration options TalkbackSession uses - a subset of the standard addEventListener options.
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
 * Construction options for {@link FakeWritableWebSocket}.
 *
 * - `autoOpen` (default `true`) schedules an `open` event on the next microtask, so a consumer that simply `await`s the session's open handshake connects without the
 *   test having to drive `emitOpen()` by hand. Tests that scrutinize the handshake itself pass `false` and open explicitly.
 */
export interface FakeWritableWebSocketOptions {

  autoOpen?: boolean;
}

/**
 * A deterministic in-memory WebSocket that satisfies the {@link ProtectWritableWebSocket} surface {@link TalkbackSession} consumes. It carries only the write-direction
 * surface - `send`, `bufferedAmount`, and the `open` / `close` / `error` listeners - with no `message` listener and no `binaryType`, exactly as the write seam declares.
 * Tests inject it via the `webSocket` factory seam and drive the connection with the `emit*` methods; `sent` records every frame written and `bufferedAmount` is mutable
 * so a test can drive the backpressure safety bound.
 */
export class FakeWritableWebSocket implements ProtectWritableWebSocket {

  // The bytes queued for transmission but not yet flushed. A test mutates this to drive the session's backpressure safety bound; it stays at zero otherwise.
  bufferedAmount = 0;

  // Whether close() has been requested on the socket, for tests that assert the session asked the underlying socket to close.
  closeRequested = false;

  // Every frame the session sent, in order, for order-preserving assertions.
  readonly sent: Uint8Array[] = [];

  readonly #listeners = new Map<string, Set<ListenerEntry>>();

  constructor(options: FakeWritableWebSocketOptions = {}) {

    // Open on the next microtask by default, after the TalkbackSession's connect has synchronously attached its listeners.
    if(options.autoOpen ?? true) {

      queueMicrotask(() => this.emitOpen());
    }
  }

  addEventListener(type: "open", listener: () => void, options?: ListenerOptions): void;
  addEventListener(type: "close", listener: (event: { code: number; reason: string }) => void, options?: ListenerOptions): void;
  addEventListener(type: "error", listener: (event: { error?: unknown; message?: string }) => void, options?: ListenerOptions): void;
  addEventListener(type: string, listener: (event: never) => void, options: ListenerOptions = {}): void {

    const set = this.#setFor(type);
    const entry: ListenerEntry = { listener: listener as (event: unknown) => void, once: options.once ?? false };

    set.add(entry);

    // The signal detaches the listener on abort - the mechanism the TalkbackSession's one AbortController uses to tear every listener down together.
    options.signal?.addEventListener("abort", () => set.delete(entry), { once: true });
  }

  /** Request the socket close. Records the request; teardown in TalkbackSession flows through its own close path rather than waiting on a close event here. */
  close(): void {

    this.closeRequested = true;
  }

  /** Queue a binary frame for transmission. Records it in {@link FakeWritableWebSocket.sent} so a send-direction test can assert the bytes and their order. */
  send(data: Uint8Array): void {

    this.sent.push(data);
  }

  /** Fire the `open` event. */
  emitOpen(): void {

    this.#dispatch("open", undefined);
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
