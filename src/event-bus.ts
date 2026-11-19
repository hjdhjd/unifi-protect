/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * event-bus.ts: A typed, three-rail event facade composing node:events.EventEmitter.
 */
import { EventEmitter, on as subscribeIterator } from "node:events";
import type { ProtectLogging } from "./logging.ts";

/**
 * Options accepted by the event-bus `stream` rail: the abort signal that terminates the iteration. The queue is unbounded, matching the livestream-subscription rule (a
 * subscriber receives every emission until it aborts, stops iterating, or the owner of the events closes).
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

// The event a close emits to end every open stream. It lies outside the EVENT_NAME_PREFIX namespace, so no rail's name can ever collide with it.
const CLOSE_EVENT = "ufp:close";

// The options every stream registers with: the close event that ends its iteration. A stream with no signal passes this one object, so it allocates nothing beyond
// node's own iterator, and a stream with a signal passes a copy that adds it.
const CLOSE_OPTIONS = { close: [CLOSE_EVENT] } as const;

// The stream a closed bus hands out. It has nothing to yield, so a `for await` over it ends on its first step, and it registers nothing on the emitter.
async function *endedStream(): AsyncGenerator<never> {

  // A closed bus has nothing more to deliver.
}

/**
 * A typed facade over `node:events.EventEmitter` that exposes a fixed set of subscription shapes - the canonical contract every event-producing subsystem in this
 * library presents (`Transport`, `EventStream`, `ConnectionMonitor`, `LivestreamSession`, `ProtectClient`).
 *
 * We *compose* `EventEmitter` rather than *extend* it, for several concrete reasons:
 *
 * 1. {@link on} returns a `Disposable`, not `this`. `using sub = bus.on(...)` auto-cleans at scope exit, so listener leaks are prevented structurally rather than by
 *    discipline - and inline arrow handlers are fine because the handle, not the function identity, is what unsubscribes.
 * 2. None of `EventEmitter`'s many inherited methods (`prependOnceListener`, `eventNames`, `rawListeners`, `getMaxListeners`, ...) leak onto the public type of the
 *    host class. Consumers see only the three rails.
 * 3. It aligns subscriptions with the library's `await using` resource-lifetime discipline: a subscription is a resource, and a `Disposable` subscription completes
 *    that alignment.
 * 4. It preserves Node's battle-tested emit machinery - listener-during-emit reentrancy, listener self-removal - which has years of production bug-fixing behind it,
 *    without inheriting the surface bloat.
 *
 * The same internal emitter drives all three rails, so a single {@link emit} notifies every active {@link on} callback, resolves every pending {@link once} promise,
 * and pushes to every open {@link stream} iterator. That is the single-source-of-truth guarantee: there is exactly one fan-out path per event.
 *
 * A listener's throw never leaves {@link emit}. Every host emits from inside its own control flow - a frame being decoded, a recovery loop deciding its next step - so
 * a consumer's handler that threw out of `emit` would end that work at whatever point the emit sat. The wrapper {@link on} registers runs the handler inside a `try`
 * and logs a throw at error level through the logger the bus was built with, the host's own, and the listeners after it still run. The {@link once} and
 * {@link stream} rails need no such guard, because their consumers run on a later microtask, outside the emit.
 *
 * Closing the bus is terminal, and each host closes its own once it has made its last emission. Every open stream ends cleanly after delivering what was emitted
 * before the close, every pending wait rejects with the reason the host closed with, and every callback is released; from then on a new stream ends at once, a new
 * wait rejects at once with that same reason, and a callback registers nothing.
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
  readonly #log: ProtectLogging;

  // The reason the bus closed with, null while it is open, which is the bus's whole closed state. It is typed as the value a throw carries, because once throws it as
  // it stands, while close admits nothing but an Error.
  #closeReason: unknown = null;

  /**
   * @param log - The host subsystem's logger, which records a listener's throw. Required rather than defaulted, so a throw is recorded wherever the host records
   *              everything else.
   */
  constructor(log: ProtectLogging) {

    this.#log = log;

    // EventEmitter warns once a single event accumulates more than ten listeners, a heuristic meant to catch leaks. Our facade legitimately fans one event out to
    // many subscribers (every observer, every pending once, every open stream registers an underlying listener), and leak prevention is handled structurally by the
    // Disposable handles - so we lift the cap to avoid a spurious MaxListenersExceededWarning rather than tracking a count we already manage by construction.
    this.#emitter.setMaxListeners(0);
  }

  /**
   * Long-lived notification subscription. Registers `handler` for `event` and returns a `Disposable` whose disposal detaches it.
   *
   * Prefer `using sub = bus.on("event", handler);` so the listener is removed automatically when the binding leaves scope. Where a `using` declaration does not fit,
   * call `sub[Symbol.dispose]()` explicitly. Disposing twice is safe - the second `off` is a no-op. A close releases every listener, and on a closed bus nothing is
   * registered, since nothing will ever be emitted to it.
   *
   * @param event   - The event name to listen for.
   * @param handler - Invoked with the event's argument tuple on every emission until the returned handle is disposed or the bus closes. A throw from it is logged at
   *                  error level and reaches neither the emitter nor the listeners after it.
   *
   * @returns A `Disposable` that removes this listener when disposed.
   */
  on<K extends keyof EventMap & string>(event: K, handler: (...args: EventMap[K]) => void): Disposable {

    // A closed bus registers nothing: a handler left on the emitter would run for an emit the closed bus must answer as having no listener, so the handle returned
    // here has nothing to detach.
    if(this.#closeReason !== null) {

      return { [Symbol.dispose]: (): void => undefined };
    }

    /* We register a forwarding wrapper rather than the handler itself so the `args` boundary cast lives in one place and `off` has a stable reference to remove. The
     * emitter is untyped, so the cast from `unknown[]` to the event's argument tuple is the single unavoidable boundary cast - everything above it is fully typed.
     *
     * The wrapper is also the one place a callback listener runs, so it is where a throw is contained: logged once per throw, after which the wrapper returns
     * normally and Node moves on to the next listener. A logger that itself throws is the one thing that still escapes, which is why a logger is expected to return.
     */
    const listener = (...args: unknown[]): void => {

      try {

        handler(...(args as unknown as EventMap[K]));
      } catch(error) {

        this.#log.error("An event listener threw; the remaining listeners still run.", { error, event });
      }
    };

    const name = EVENT_NAME_PREFIX + event;

    this.#emitter.on(name, listener);

    return { [Symbol.dispose]: (): void => void this.#emitter.off(name, listener) };
  }

  /**
   * One-shot wait for the next emission of `event`. Resolves with the event's argument tuple. Cancellable: if `opts.signal` aborts before the event fires, the
   * promise rejects with an `AbortError` whose `cause` is the signal's reason. If the bus closes first, the promise rejects with the reason it closed with, as does a
   * wait begun on a closed bus, so a wait that is never awaited needs a rejection handler.
   *
   * @param event - The event name to await.
   * @param opts  - Optional abort signal that cancels the wait.
   *
   * @returns A promise resolving to the argument tuple of the next emission.
   */
  async once<K extends keyof EventMap & string>(event: K, opts: { signal?: AbortSignal } = {}): Promise<EventMap[K]> {

    // The wait is the first item of a stream, so it registers, aborts and ends exactly as a stream does, and leaving the loop releases the stream's listeners. A stream
    // ends without an item only when the bus closes, so falling out of the loop is the close, and the wait rejects with the reason the bus closed with.
    for await(const args of this.stream(event, opts)) {

      return args;
    }

    throw this.#closeReason;
  }

  /**
   * Async iterable of every subsequent emission of `event`, until `opts.signal` aborts, the consumer stops iterating, or the bus closes. Each yielded value is the
   * event's argument tuple. The queue is unbounded - a slow consumer accumulates pending emissions rather than dropping them. A close ends the iteration cleanly once
   * every emission made before it has been delivered, and a stream begun on a closed bus ends at once; an abort rejects the iteration with an `AbortError` whose
   * `cause` is the signal's reason.
   *
   * @param event - The event name to stream.
   * @param opts  - Optional abort signal that terminates the iteration.
   *
   * @returns An async iterable yielding the argument tuple of each emission.
   */
  stream<K extends keyof EventMap & string>(event: K, opts: StreamOptions = {}): AsyncIterable<EventMap[K]> {

    /* The caller's signal is read before the closed state, so a signal that has already aborted keeps its meaning on a closed bus: node's `on` throws its
     * `AbortError` before registering anything, as it does on an open bus. A closed bus otherwise hands out a stream that has already ended.
     *
     * node:events' `on` returns an async iterator that registers here, before anything is awaited, so an emission made before the first step is buffered rather than
     * lost. It rejects with an `AbortError` when the signal fires, which the firehose sugar smooths into a clean return, and the close event ends it cleanly: its
     * listeners and its hold on the signal come off at the close, and it yields what it had buffered before it reports done. The yielded values are the argument
     * arrays, which are our tuple type at the boundary.
     */
    if((opts.signal?.aborted !== true) && (this.#closeReason !== null)) {

      return endedStream();
    }

    return subscribeIterator(this.#emitter, EVENT_NAME_PREFIX + event, opts.signal ? { ...CLOSE_OPTIONS, signal: opts.signal } : CLOSE_OPTIONS) as
      AsyncIterable<EventMap[K]>;
  }

  /**
   * Close the bus for good. Every open stream ends once it has delivered what was emitted before the close, every pending wait rejects with `reason`, and every
   * callback is released; from then on a new stream ends at once, a new wait rejects with the same `reason`, a callback registers nothing, and an emit reaches no
   * listener. A no-op on repeat, so the first reason stands.
   *
   * This method is package-internal: the host closes its own bus once it has made its last emission.
   *
   * @param reason - What ended the host, the error every pending and later wait rejects with.
   *
   * @internal
   */
  close(reason: Error): void {

    if(this.#closeReason !== null) {

      return;
    }

    // The close event ends every open stream, and the removal that follows releases every callback and anything else the emitter still holds.
    this.#closeReason = reason;
    this.#emitter.emit(CLOSE_EVENT);
    this.#emitter.removeAllListeners();
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
