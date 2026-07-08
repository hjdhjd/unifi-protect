/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * event-bus.ts: A typed, three-rail event facade composing node:events.EventEmitter.
 */
import { EventEmitter, once as nextEmission, on as subscribeIterator } from "node:events";

/**
 * Options accepted by the event-bus `stream` rail. Carries the abort signal that terminates the iteration; further keys are reserved for a future backpressure policy.
 * The default behavior is unbounded, matching the livestream-subscription rule (a subscriber receives every emission until it aborts or stops iterating).
 *
 * @category Events
 */
export interface StreamOptions {

  signal?: AbortSignal;
}

// Every public event name is namespaced with this prefix before it reaches the composed EventEmitter. node:events special-cases three event names - `error` (emitting
// it with no listener throws synchronously, and it rejects any open `events.on()` async iterator of *other* events), `newListener`, and `removeListener` - and that
// special-casing would otherwise leak straight through this facade, which exists precisely to insulate consumers from EventEmitter's semantics. By translating, say,
// `error` to `ufp:event:error` at the single boundary below, the underlying emitter never sees a literal `error`, so a typed `error` rail behaves like any other rail:
// it never throws on a missing listener and never cross-rejects a sibling stream. The prefix is internal and never observable; consumers always use the bare name.
const EVENT_NAME_PREFIX = "ufp:event:";

/**
 * A typed facade over `node:events.EventEmitter` that exposes exactly three subscription shapes - the canonical contract every event-producing subsystem in this
 * library presents (`Transport`, `EventStream`, `ConnectionMonitor`, `LivestreamSession`, `ProtectClient`).
 *
 * We *compose* `EventEmitter` rather than *extend* it, for several load-bearing reasons:
 *
 * 1. {@link on} returns a `Disposable`, not `this`. `using sub = bus.on(...)` auto-cleans at scope exit, so listener leaks are prevented structurally rather than by
 *    discipline - and inline arrow handlers are fine because the handle, not the function identity, is what unsubscribes.
 * 2. None of `EventEmitter`'s many inherited methods (`prependOnceListener`, `eventNames`, `rawListeners`, `getMaxListeners`, ...) leak onto the public type of the
 *    host class. Consumers see only the three rails.
 * 3. It aligns subscriptions with the library's `await using` resource-lifetime discipline: a subscription is a resource, and a `Disposable` subscription completes
 *    that alignment.
 * 4. It preserves Node's battle-tested emit machinery - listener-during-emit reentrancy, sync-throw handling, listener self-removal - which has fifteen years of
 *    bug-fixing behind it, without inheriting the surface bloat.
 *
 * The same internal emitter drives all three rails, so a single {@link emit} notifies every active {@link on} callback, resolves every pending {@link once} promise,
 * and pushes to every open {@link stream} iterator. That is the single-source-of-truth guarantee: there is exactly one fan-out path per event.
 *
 * `EventMap` keys are the event names; each value is the tuple of arguments that event carries (e.g., `{ throttleEntered: []; packet: [event: TypedEvent] }`).
 *
 * @typeParam EventMap - A record mapping each event name to the readonly tuple of arguments emitted with it.
 *
 * @category Events
 */
// The constraint is self-referential (`Record<keyof EventMap, ...>`) rather than `Record<string, ...>` so a plain `interface` satisfies it. An interface has no
// implicit index signature and therefore is not assignable to `Record<string, ...>`, but it is trivially assignable to a record over its own keys - which lets every
// subsystem declare its event map as an `interface` (the house default) while still guaranteeing each value is a readonly argument tuple.
export class EventBus<EventMap extends Record<keyof EventMap, readonly unknown[]>> {

  // The composed emitter. Private so the inherited EventEmitter surface never escapes; the only way in or out is through the facade's subscription rails plus emit.
  readonly #emitter = new EventEmitter();

  constructor() {

    // EventEmitter warns once a single event accumulates more than ten listeners, a heuristic meant to catch leaks. Our facade legitimately fans one event out to
    // many subscribers (every observer, every pending once, every open stream registers an underlying listener), and leak prevention is handled structurally by the
    // Disposable handles - so we lift the cap to avoid a spurious MaxListenersExceededWarning rather than tracking a count we already manage by construction.
    this.#emitter.setMaxListeners(0);
  }

  /**
   * Long-lived notification subscription. Registers `handler` for `event` and returns a `Disposable` whose disposal detaches it.
   *
   * Prefer `using sub = bus.on("event", handler);` so the listener is removed automatically when the binding leaves scope. Where a `using` declaration does not fit,
   * call `sub[Symbol.dispose]()` explicitly. Disposing twice is safe - the second `off` is a no-op.
   *
   * @param event   - The event name to listen for.
   * @param handler - Invoked with the event's argument tuple on every emission until the returned handle is disposed.
   *
   * @returns A `Disposable` that removes this listener when disposed.
   */
  on<K extends keyof EventMap & string>(event: K, handler: (...args: EventMap[K]) => void): Disposable {

    // We register a forwarding wrapper rather than the handler itself so the `args` boundary cast lives in one place and `off` has a stable reference to remove. The
    // emitter is untyped, so the cast from `unknown[]` to the event's argument tuple is the single unavoidable boundary cast - everything above it is fully typed.
    const listener = (...args: unknown[]): void => handler(...(args as unknown as EventMap[K]));
    const name = EVENT_NAME_PREFIX + event;

    this.#emitter.on(name, listener);

    return { [Symbol.dispose]: (): void => void this.#emitter.off(name, listener) };
  }

  /**
   * One-shot wait for the next emission of `event`. Resolves with the event's argument tuple. Cancellable: if `opts.signal` aborts before the event fires, the
   * promise rejects with the signal's abort reason (an `AbortError` by default).
   *
   * @param event - The event name to await.
   * @param opts  - Optional abort signal that cancels the wait.
   *
   * @returns A promise resolving to the argument tuple of the next emission.
   */
  async once<K extends keyof EventMap & string>(event: K, opts: { signal?: AbortSignal } = {}): Promise<EventMap[K]> {

    // node:events' `once` already implements the signal-cancellable, single-shot semantics we want; resolving to the argument array is exactly our tuple shape. We
    // forward the options object only when a signal is present so we never hand the runtime a literal `{ signal: undefined }` under exactOptionalPropertyTypes.
    const args = await nextEmission(this.#emitter, EVENT_NAME_PREFIX + event, opts.signal ? { signal: opts.signal } : undefined);

    return args as unknown as EventMap[K];
  }

  /**
   * Backpressure-aware async iterable of every subsequent emission of `event`, until `opts.signal` aborts or the consumer stops iterating. Each yielded value is the
   * event's argument tuple. The queue is unbounded by default - a slow consumer accumulates pending emissions rather than dropping them.
   *
   * @param event - The event name to stream.
   * @param opts  - Optional abort signal that terminates the iteration.
   *
   * @returns An async iterable yielding the argument tuple of each emission.
   */
  stream<K extends keyof EventMap & string>(event: K, opts: StreamOptions = {}): AsyncIterable<EventMap[K]> {

    // node:events' `on` returns an async iterator that buffers emissions and terminates cleanly when the signal aborts - precisely our stream contract. The yielded
    // values are the argument arrays, which are our tuple type at the boundary.
    return subscribeIterator(this.#emitter, EVENT_NAME_PREFIX + event, opts.signal ? { signal: opts.signal } : undefined) as AsyncIterable<EventMap[K]>;
  }

  /**
   * Emit `event` with its argument tuple, synchronously invoking every active listener (callbacks, pending `once` waiters, open `stream` iterators).
   *
   * This method is package-internal: the host subsystem emits; the host's public type re-exposes only `on` / `once` / `stream`. It is not part of any consumer-facing
   * surface.
   *
   * @param event - The event name to emit.
   * @param args  - The argument tuple for this event.
   *
   * @returns `true` if the event had listeners, `false` otherwise (the `EventEmitter.emit` contract).
   *
   * @internal
   */
  emit<K extends keyof EventMap & string>(event: K, ...args: EventMap[K]): boolean {

    return this.#emitter.emit(EVENT_NAME_PREFIX + event, ...args);
  }
}
