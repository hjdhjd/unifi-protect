/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * store.ts: The observable state store - snapshot, observe, the single dispatch chokepoint, and the periodic bootstrap-refresh failsafe.
 */

/**
 * The observable heart of the library. {@link StateStore} holds exactly one {@link ProtectState} reference and advances it through a single chokepoint
 * ({@link StateStore.dispatch}), which folds a {@link TypedEvent} through the pure reducer. It is a *generic* state engine over `ProtectState` - it deals only in
 * config records and never imports a Layer-3 device type, so it is unit-testable without a single mock.
 *
 * Two read shapes sit over the one source of truth, fulfilling the architecture's "synchronous snapshot and asynchronous observer" commitment:
 *
 * - {@link StateStore.snapshot} returns the current state synchronously - the hot-path read.
 * - {@link StateStore.observe} returns an `AsyncIterable` of a selector's output that yields only when the selected value *changes* by reference. Because the reducer
 *   preserves references through structural sharing and the selectors memoize on map identity, an `Object.is` comparison is a correct and nearly free change test.
 *
 * The store also owns the **bootstrap refresh failsafe**: on a fixed cadence (default {@link PROTECT_BOOTSTRAP_REFRESH_INTERVAL}) it fetches a fresh bootstrap through
 * the injected `refresh` seam and dispatches it. The reducer's `applyBootstrap` reconciliation makes a refresh that finds no drift produce no observer notifications at
 * all - the failsafe is invisible until something has actually changed. The seam (rather than a `Transport` reference) keeps the store at the data layer and testable
 * with a fake refresh and a fake `Clock`.
 *
 * Finally, the store publishes the **bootstrap-schema tripwire**: at its dispatch chokepoint every applied bootstrap is scanned by the pure
 * {@link findUnmodeledDeviceCollections} (Layer 1) for device-shaped collections the reducer does not model, and each newly seen one is published on
 * `schema:unmodeledCollection` (Layer 0) - the exact mirror of EventStream's realtime `schema:unknownModelKey`, on the dimension the realtime tripwire is blind to (a
 * quiescent device that lives in the bootstrap but emits no packet). This adds no layering edge (both are downward, like the reducer) and keeps the store mockless: the
 * detector is pure and `diagnostics_channel` is process-global, so neither needs a mock, and the store still imports no Layer-3 device type.
 *
 * @module StateStore
 */
import type { AdoptionContradictionPayload, SchemaUnmodeledCollectionPayload } from "../diagnostics.ts";
import type { DeepPartial, ProtectNvrBootstrap, ProtectNvrConfig, ProtectStateRecord } from "../types/index.ts";
import { MAP_BACKED_STATE_MODEL_KEYS, adoptedByOtherAssertion, adoptionView, createInitialState, isAdoptionContradiction, mapFieldFor,
  reduce } from "../protocol/reducer.ts";
import type { MapBackedStateModelKey, ProtectState } from "../protocol/reducer.ts";
import type { StateModelKey, TypedEvent } from "../protocol/events.ts";
import type { Clock } from "../clock.ts";
import { PROTECT_BOOTSTRAP_REFRESH_INTERVAL } from "../settings.ts";
import type { ProtectLogging } from "../logging.ts";
import { channels } from "../diagnostics.ts";
import { findUnmodeledDeviceCollections } from "../protocol/events.ts";
import { noopLog } from "../logging.ts";
import { wallClock } from "../clock.ts";

/**
 * Construction options for {@link StateStore}.
 *
 * - `refresh` is the only required option: the seam the failsafe calls to fetch a fresh bootstrap. The composition root wires it to a transport request; tests wire a
 *   fake. Injecting a function rather than a `Transport` is what keeps the store at the data layer (it never imports the transport) and deterministically testable.
 * - `refreshIntervalMs` defaults to {@link PROTECT_BOOTSTRAP_REFRESH_INTERVAL}; pass `false` or a non-positive interval to disable the failsafe entirely (the consumer
 *   then relies solely on the realtime event stream).
 *
 * @category State
 */
export interface StateStoreOptions {

  clock?: Clock;
  initialState?: ProtectState;
  log?: ProtectLogging;
  refresh: () => Promise<ProtectNvrBootstrap>;
  refreshIntervalMs?: number | false;
}

/**
 * One consumer's live view of a selector over the store. Created lazily when iteration begins (so an `observe()` that is never iterated registers nothing and leaks
 * nothing) and torn down when iteration ends. The store calls {@link StateObserver.evaluate} on every state change; the observer re-runs its selector and enqueues a
 * value only when the result differs by reference from the last one it yielded - that `Object.is` gate is the whole reason a drift-free refresh is silent.
 *
 * The queue is unbounded by default, matching the library-wide subscription rule: a slow consumer accumulates pending values rather than dropping them. State changes
 * do not burst the way livestream segments can, so the queue stays small in practice.
 */
class StateObserver<T> {

  // The pending values waiting to be yielded, and the resolver of the promise the iterator is currently parked on (null when the iterator is actively draining rather
  // than waiting). `#closed` ends the iteration once the queue has drained.
  #closed = false;
  #lastYielded: T;
  #queue: T[] = [];
  readonly #selector: (state: ProtectState) => T;
  #wake: (() => void) | null = null;

  constructor(selector: (state: ProtectState) => T, initialState: ProtectState) {

    this.#selector = selector;

    // Seed the baseline from the state at iteration time, so the observer yields on the first *subsequent* change rather than re-emitting the current value (which the
    // consumer already has via snapshot()). This is the "yields when X changes" contract.
    this.#lastYielded = selector(initialState);
  }

  // Called by the store on every committed state change. Re-run the selector against the new state; enqueue (and wake any parked iterator) only when the derived value
  // is a different reference than the one last yielded.
  evaluate(state: ProtectState): void {

    const next = this.#selector(state);

    if(Object.is(next, this.#lastYielded)) {

      return;
    }

    this.#lastYielded = next;
    this.#queue.push(next);
    this.#signal();
  }

  // Terminate the iteration. The iterator drains whatever is already queued, then returns.
  close(): void {

    this.#closed = true;
    this.#signal();
  }

  // The async iteration itself. Drains the queue in batches (swapping in a fresh array so values arriving mid-yield are picked up on the next pass), then parks on a
  // `Promise.withResolvers()` until the next `evaluate`/`close` wakes it. No timers, no EventEmitter, no listener bookkeeping.
  async *iterate(): AsyncGenerator<T> {

    for(;;) {

      if(this.#queue.length > 0) {

        const batch = this.#queue;

        this.#queue = [];

        for(const value of batch) {

          yield value;
        }

        continue;
      }

      if(this.#closed) {

        return;
      }

      const { promise, resolve } = Promise.withResolvers<undefined>();

      // The wake is a zero-argument signal; we close over the resolver so the queue-side `#signal` never needs to know the gate carries an (ignored) value.
      this.#wake = (): void => resolve(undefined);

      // Parking on the next signal is the whole point of this loop - the await is intentional and sequential, not an accidental serialization of independent work.
      // eslint-disable-next-line no-await-in-loop
      await promise;
    }
  }

  // Wake a parked iterator exactly once. A no-op when the iterator is mid-drain (no resolver registered), because it will re-check the queue on its next pass anyway.
  #signal(): void {

    const wake = this.#wake;

    this.#wake = null;
    wake?.();
  }
}

/**
 * The canonical state holder. See the module doc for the model. Constructed by `ProtectClient.connect()`; consumers read it as `client.state`. The one documented
 * exception is {@link createStateStore}, the test-construction factory a harness uses to drive the real engine standalone.
 *
 * @category State
 */
export class StateStore implements AsyncDisposable {

  readonly #clock: Clock;
  readonly #log: ProtectLogging;
  // One AbortController for the refresh-loop lifetime, aborted on disposal - the library's "one AbortController per resource lifetime" rule.
  readonly #refreshController = new AbortController();
  readonly #observers = new Set<StateObserver<unknown>>();
  readonly #refresh: () => Promise<ProtectNvrBootstrap>;
  // The per-session dedup for the bootstrap-schema tripwire: the modelKeys already reported on schema:unmodeledCollection, so a no-drift refresh re-publishes nothing. It
  // is the sole re-publish suppressor here - the dispatch Object.is gate never fires for a bootstrap (applyBootstrap always mints a new state), so it cannot dedup these.
  // Mirrors EventStream.#seenUnknown, the realtime twin.
  readonly #seenUnmodeled = new Set<string>();
  // The per-session set of devices currently inside an adoption self-contradiction episode, keyed by "modelKey:id". A device joins when the wire asserts the
  // contradiction and leaves when the wire retracts it (a clean or genuine-foreign assertion) or the device is removed. This set is the sole re-publish suppressor:
  // publishing is gated on the ENTER edge (a key not already present), so a device re-asserting the defect on every 120-second refresh publishes exactly once, mirroring
  // how #seenUnmodeled dedups the schema tripwire. It starts empty each session, so a process restart mid-episode re-publishes once on its first post-restart bootstrap -
  // accepted by design, since a fresh process legitimately reports the anomaly it finds.
  readonly #engagedAdoption = new Set<string>();
  #state: ProtectState;

  constructor(options: StateStoreOptions) {

    this.#clock = options.clock ?? wallClock;
    this.#log = options.log ?? noopLog;
    this.#refresh = options.refresh;
    this.#state = options.initialState ?? createInitialState();

    // Start the failsafe unless it was explicitly disabled or given a non-positive interval. The loop runs detached for the store's lifetime; disposal aborts it.
    const intervalMs = options.refreshIntervalMs ?? PROTECT_BOOTSTRAP_REFRESH_INTERVAL;

    if((intervalMs !== false) && (intervalMs > 0)) {

      void this.#runRefreshLoop(intervalMs);
    }
  }

  /**
   * The current state. Synchronous and reference-stable between dispatches - safe to read on a hot path and to compare with `Object.is`.
   *
   * @returns The current {@link ProtectState}.
   */
  snapshot(): ProtectState {

    return this.#state;
  }

  /**
   * Observe a selector over the state. The returned async iterable yields the selector's output once at every point the value *changes* by reference, and never on a
   * dispatch that left the value unchanged. Pair it with {@link StateStore.snapshot} for the current value: snapshot for "what is it now", observe for "tell me when
   * it changes".
   *
   * Termination: pass `opts.signal` to end the iteration (the iterator returns cleanly on abort), or simply `break` out of the `for await` - either path unregisters
   * the observer. An already-aborted signal yields nothing.
   *
   * @typeParam T - The selector's output type.
   *
   * @param selector - A pure function from state to the value of interest. Use the memoized selectors in `state/selectors.ts` so unchanged collections compare equal.
   * @param opts     - Optional abort signal that terminates the iteration.
   *
   * @returns An async iterable of the selector's value at each change.
   */
  async *observe<T>(selector: (state: ProtectState) => T, opts: { signal?: AbortSignal } = {}): AsyncGenerator<T> {

    const signal = opts.signal;

    // Nothing to observe if the caller handed us an already-aborted signal.
    if(signal?.aborted) {

      return;
    }

    // An async-generator method's body runs only when iteration begins, so registration is lazy - an un-iterated observe registers nothing and leaks nothing - and it
    // reads the current state for the baseline at that moment. It is race-free because dispatch only ever enqueues to observers already in the set.
    const observer = new StateObserver<T>(selector, this.#state);
    const onAbort = (): void => observer.close();

    this.#observers.add(observer);
    signal?.addEventListener("abort", onAbort, { once: true });

    try {

      yield* observer.iterate();
    } finally {

      this.#observers.delete(observer);
      signal?.removeEventListener("abort", onAbort);
    }
  }

  /**
   * Advance the state by one event. The single mutation chokepoint: it folds the event through the pure reducer and, only when the resulting state is a *different*
   * reference, commits it and notifies every active observer. A no-op event (one the reducer returns unchanged) notifies nobody.
   *
   * Package-internal: the realtime event stream, the refresh failsafe, and the `connect()` factory's initial bootstrap call it. It is not a consumer-facing surface.
   *
   * @param event - The typed event to apply.
   *
   * @internal
   */
  dispatch(event: TypedEvent): void {

    // A bootstrapLoaded event is the one place device classes enumerate, so it is where the bootstrap-schema tripwire runs - the standing twin of EventStream's realtime
    // schema:unknownModelKey. It depends only on event.data, so it sits at the top of the path, independent of the reduce and the commit gate below.
    if(event.kind === "bootstrapLoaded") {

      this.#detectUnmodeledCollections(event.data);
    }

    // Advance the adoption self-contradiction episode set here, before the fold, from the wire-side event and the pre-fold stored records. It reads what the wire
    // explicitly asserts rather than the reducer's merged output - a clean-recovery patch that nets to a reducer no-op must still clear the set - so it sits ahead of
    // both the reduce call and the same-reference gate below.
    this.#trackAdoptionContradiction(event);

    const next = reduce(this.#state, event);

    // The reducer returns the same reference for an event that changed nothing - a no-op realtime patch or any activity signal - and this gate skips waking observers
    // for those. A bootstrap always mints a fresh state (applyBootstrap bumps bootstrapId), so this gate never fires for the refresh failsafe; that refresh's zero-drift
    // invisibility is the observer-level Object.is over the reconciled selectors (StateObserver.evaluate), not this gate.
    if(Object.is(next, this.#state)) {

      return;
    }

    this.#state = next;

    for(const observer of this.#observers) {

      observer.evaluate(next);
    }
  }

  // Publish the bootstrap-schema tripwire for an applied bootstrap - the exact structural mirror of EventStream.#noteUnclassified on the bootstrap dimension. The pure
  // findUnmodeledDeviceCollections (Layer 1) reports every populated, device-shaped collection the reducer does not model; each newly seen modelKey is debug-logged (for
  // field diagnosis) and published when the channel has subscribers. The #seenUnmodeled set is the only re-publish suppressor: a no-drift refresh still
  // mints a fresh state (applyBootstrap bumps bootstrapId), so the dispatch Object.is gate never short-circuits a bootstrap, and the per-session set is what keeps a
  // sustained unmodeled class from re-firing on every refresh.
  #detectUnmodeledCollections(bootstrap: ProtectNvrBootstrap): void {

    for(const collection of findUnmodeledDeviceCollections(bootstrap)) {

      if(this.#seenUnmodeled.has(collection.modelKey)) {

        continue;
      }

      this.#seenUnmodeled.add(collection.modelKey);
      this.#log.debug("Bootstrap carries a device collection the library does not model.", collection);

      if(channels.schemaUnmodeledCollection.hasSubscribers) {

        channels.schemaUnmodeledCollection.publish(collection satisfies SchemaUnmodeledCollectionPayload);
      }
    }
  }

  // Advance the adoption self-contradiction episode set from one event, before the fold. A bootstrap reconciles the whole set against the fresh device inventory; a
  // device add or patch drives that one device; a removal clears it; activity signals carry no adoption data and are ignored.
  #trackAdoptionContradiction(event: TypedEvent): void {

    switch(event.kind) {

      case "bootstrapLoaded":

        this.#reconcileAdoptionFromBootstrap(event.data);

        break;

      case "deviceAdded":

        this.#trackAdoptionForDevice(event.modelKey, event.id, event.data, false);

        break;

      case "devicePatched":

        this.#trackAdoptionForDevice(event.modelKey, event.id, event.patch, true);

        break;

      case "deviceRemoved":

        this.#engagedAdoption.delete(adoptionKey(event.modelKey, event.id));

        break;

      default:

        break;
    }
  }

  // A bootstrap is authoritative for the whole engaged set. Snapshot the engaged keys, drive an ENTER/CLEAR decision from every device record the bootstrap carries (each
  // is a full record that explicitly asserts its adoption), then clear any engaged device the fresh bootstrap no longer lists - the reverse diff runs over the engaged
  // snapshot, a handful of keys, not over the collections. Reads the controller's own MAC from the incoming bootstrap's own NVR record, and the pre-fold stored record
  // for each id so the detector sees the merged view.
  #reconcileAdoptionFromBootstrap(bootstrap: ProtectNvrBootstrap): void {

    const ownMac = macOf(bootstrap.nvr);
    const stale = new Set(this.#engagedAdoption);
    const source = bootstrap as unknown as Record<string, unknown>;

    for(const modelKey of MAP_BACKED_STATE_MODEL_KEYS) {

      const field = mapFieldFor(modelKey);
      const collection = source[field] as readonly ProtectStateRecord[] | undefined;

      if(collection === undefined) {

        continue;
      }

      const priorMap = this.#state[field] as ReadonlyMap<string, ProtectStateRecord>;

      for(const record of collection) {

        stale.delete(adoptionKey(modelKey, record.id));
        this.#applyAdoptionTransition(modelKey, record.id, record, priorMap.get(record.id), ownMac);
      }
    }

    for(const key of stale) {

      this.#engagedAdoption.delete(key);
    }
  }

  // Drive the engaged set from a single device add or patch. Adoption is a device concept, so the nvr singleton (not map-backed) is ignored. Only an explicit wire
  // assertion of isAdoptedByOther moves the set: a patch that says nothing about adoption holds the set steady, because the stored record is already normalized and
  // falling back to its value would misread "clean" and churn the episode. A patch against an id absent from pre-fold state changes nothing, mirroring the reducer's
  // no-op-for-unknown-id contract.
  #trackAdoptionForDevice(modelKey: StateModelKey, id: string, incoming: ProtectStateRecord | DeepPartial<ProtectStateRecord>, requireStored: boolean): void {

    if(modelKey === "nvr") {

      return;
    }

    if(adoptedByOtherAssertion(incoming) === undefined) {

      return;
    }

    const field = mapFieldFor(modelKey);
    const stored = (this.#state[field] as ReadonlyMap<string, ProtectStateRecord>).get(id);

    if(requireStored && (stored === undefined)) {

      return;
    }

    this.#applyAdoptionTransition(modelKey, id, incoming, stored, macOf(this.#state.nvr));
  }

  // The ENTER/CLEAR decision for one device from the pre-fold merged view and this controller's own MAC. On the contradiction, publish only when the device was not
  // already engaged (the edge), then engage it. Otherwise the wire asserts something coherent - a clean record or a genuine foreign adoption - so clear any engagement to
  // re-arm a future episode. Only ENTER publishes; CLEAR is silent.
  #applyAdoptionTransition(modelKey: MapBackedStateModelKey, id: string, incoming: ProtectStateRecord | DeepPartial<ProtectStateRecord>,
    stored: ProtectStateRecord | undefined, ownMac: string | undefined): void {

    const key = adoptionKey(modelKey, id);
    const view = adoptionView(stored, incoming);

    if(!isAdoptionContradiction(view, ownMac)) {

      this.#engagedAdoption.delete(key);

      return;
    }

    if(this.#engagedAdoption.has(key)) {

      return;
    }

    this.#engagedAdoption.add(key);
    this.#publishAdoptionContradiction({ id, mac: deviceMac(incoming) ?? deviceMac(stored) ?? "", modelKey, nvrMac: view.nvrMac ?? "" });
  }

  // Warn once at the episode edge and publish the typed diagnostic when the channel has subscribers - the same subscriber gate the schema tripwire uses. The warn gives
  // operators a plain-language heads-up that a controller-side defect is being corrected; the payload carries the structured detail.
  #publishAdoptionContradiction(payload: AdoptionContradictionPayload): void {

    this.#log.warn("A device reports being adopted by another controller while naming this controller as its owner, which cannot both be true; this controller is " +
      "keeping the device adopted here.", payload);

    if(channels.adoptionContradiction.hasSubscribers) {

      channels.adoptionContradiction.publish(payload satisfies AdoptionContradictionPayload);
    }
  }

  /**
   * Stop the refresh failsafe and terminate every open observer. Idempotent.
   */
  async [Symbol.asyncDispose](): Promise<void> {

    this.#refreshController.abort();

    for(const observer of this.#observers) {

      observer.close();
    }

    this.#observers.clear();
  }

  // The refresh failsafe. Ticks on the injected clock; each tick fetches a fresh bootstrap and dispatches it. A fetch failure is non-fatal - the failsafe simply
  // retries on the next tick (health escalation is the ConnectionMonitor's job, not the store's), so a transient controller hiccup never tears the loop down. The
  // loop ends only when disposal aborts the controller, which surfaces as the interval iterator throwing its abort error - the normal shutdown path, swallowed here.
  async #runRefreshLoop(intervalMs: number): Promise<void> {

    try {

      for await (const _tick of this.#clock.setInterval(intervalMs, { signal: this.#refreshController.signal })) {

        try {

          // Sequential by design: one refresh per interval, each completing before the next tick is honored.

          const bootstrap = await this.#refresh();

          this.dispatch({ data: bootstrap, kind: "bootstrapLoaded" });
        } catch(error) {

          this.#log.debug("Bootstrap refresh failed; retrying on the next interval.", error);
        }
      }
    } catch {

      // The interval iterator throws on abort when the store is disposed. That is the expected end of the loop, not an error.
    }
  }
}

/**
 * Construct a {@link StateStore} directly - the single, documented exception to the package's export law, which otherwise keeps `StateStore` type-only so a client has
 * exactly one composition path (`ProtectClient.connect()`). This factory exists for the test harnesses that need the real reducer and observer engine standalone: a
 * consumer driving the genuine store never has to hand-mirror its dispatch, dedup, and refresh semantics in a double. Constructing a client remains exactly one path;
 * this widens only the store's own construction, for tests.
 *
 * @param options - The store options: the required refresh seam, and the optional clock, initial state, logger, and refresh interval.
 *
 * @returns A new state store.
 *
 * @category State
 */
export function createStateStore(options: StateStoreOptions): StateStore {

  return new StateStore(options);
}

// The engaged-set key for a device: its model key and id joined, the same "modelKey:id" identity the payload carries split back out. One definition so ENTER, CLEAR, and
// removal all agree on the key shape.
function adoptionKey(modelKey: string, id: string): string {

  return modelKey + ":" + id;
}

// This controller's own MAC read off an NVR record (the stored singleton, or an incoming bootstrap's own NVR), or undefined when there is none or it carries no string
// MAC. The detector treats an undefined or empty MAC as inert, so the scan stays quiet until the controller identity is known.
function macOf(nvr: ProtectNvrConfig | null | undefined): string | undefined {

  return (typeof nvr?.mac === "string") ? nvr.mac : undefined;
}

// A device record's own hardware MAC for the diagnostic payload, read defensively off the incoming record-or-patch or the stored record; a flip patch carries no mac, so
// the stored record supplies it.
function deviceMac(record: ProtectStateRecord | DeepPartial<ProtectStateRecord> | undefined): string | undefined {

  const mac = (record as Record<string, unknown> | undefined)?.["mac"];

  return (typeof mac === "string") ? mac : undefined;
}
