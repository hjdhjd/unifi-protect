/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * device.ts: The projection bases - a read-only core every projection shares, and the command-bearing device layer that adds update/reboot on top.
 */
import type { DeviceCollectionKey, DeviceModelKey } from "../protocol/events.ts";
import type { HttpMethod, ProtectResponse } from "../transport/http.ts";
import type { DeepPartial } from "../types/index.ts";
import type { DeviceContext } from "./context.ts";
import type { ProtectDeviceConfigMap } from "../state/selectors.ts";
import type { ProtectState } from "../protocol/reducer.ts";
import { deviceEndpoint } from "./endpoints.ts";
import { isDeviceOnline } from "../state/selectors.ts";

/**
 * The config-record union a device projection can wrap - every modeled device except the NVR singleton.
 *
 * @category Devices
 */
export type ProtectDeviceConfig = ProtectDeviceConfigMap[DeviceCollectionKey];

/**
 * The read-only core every projection shares - whether it is a command-bearing device ({@link DeviceProjection}) or the read-only NVR singleton (`Nvr`). A projection is
 * **a live view, not a cached entity**: it holds only its context and a stable selector, and every property access reads through to the current store snapshot. Holding a
 * projection across hours of state change is safe - its getters always reflect the latest reduced state.
 *
 * This base supplies exactly what *every* projection has in common - the read-through `config` getter, its non-throwing `peek()` companion, the absent-record guard, and
 * live `observe()` - and nothing more. It is unbounded in `TConfig` and carries no `id`, because reading-through-and-observing is meaningful for any reduced record,
 * including a singleton like the NVR that has no id. The command surface (`update`, `reboot`) and device identity (`id`, `modelKey`, `name`, `isOnline`) live one level
 * down, on {@link DeviceProjection}. A read-only subject thus inherits the view machinery without the operations it does not support.
 *
 * If the underlying record has been removed from state (or has not arrived yet, as before the first bootstrap), the asserting getters (`config` and everything built on
 * it) throw - for a caller whose contract requires the record, a held handle to an absent one is a programming error. A caller that treats absence as an expected runtime
 * condition asks non-throwingly instead: `peek()` returns the config or `undefined` on the held handle itself, and a fresh lookup (`client.camera(id)`) likewise returns
 * `undefined` when the record is gone.
 *
 * @typeParam TConfig - The concrete config-record type this projection wraps.
 *
 * @category Devices
 */
export abstract class Projection<TConfig> {

  protected readonly ctx: DeviceContext;

  // The record's config selector, pre-bound for this projection so the `observe` path holds a stable selector reference (its dedup depends on a stable identity). The
  // device layer binds it to an id; the NVR singleton binds the id-free `selectNvr`.
  readonly #select: (state: ProtectState) => TConfig | undefined;

  protected constructor(ctx: DeviceContext, select: (state: ProtectState) => TConfig | undefined) {

    this.ctx = ctx;
    this.#select = select;
  }

  /**
   * The record's current config, read through to the live store snapshot.
   *
   * @returns The current config.
   *
   * @throws {ReferenceError} If the record is not present in the controller state.
   */
  get config(): Readonly<TConfig> {

    return this.#requireConfig();
  }

  /**
   * The record's current config if it is present, or `undefined` if it is not - the non-throwing companion to {@link config}. Reach for `peek()` to ask "is it present,
   * and if so what is it?": a record leaving the controller state (a device unadopted or removed, or the NVR before the first bootstrap) is an expected runtime
   * condition, so `peek()` reports its absence as `undefined` rather than treating it as an error. Reach for {@link config} instead where the record's presence is a
   * precondition and an absence is a defect that should fail loudly. `peek() !== undefined` is the idiom for "is it still here?" on a held handle.
   *
   * Like every projection read this is a live read-through to the current store snapshot, not a value cached at construction, so it always reflects the latest reduced
   * state. It is the single home of the raw snapshot read; {@link config} is this read plus the absent-record guard.
   *
   * @returns The current config, or `undefined` if the record is not present in the controller state.
   */
  peek(): Readonly<TConfig> | undefined {

    return this.#select(this.ctx.store.snapshot());
  }

  /**
   * Observe this projection. The returned async iterable yields `this` each time the record's config changes by reference, and stays silent on dispatches that did not
   * touch it. Pair it with the sync getters: getters for "what is it now", observe for "tell me when it changes".
   *
   * @param opts - Optional abort signal that terminates the iteration.
   *
   * @returns An async iterable of this projection, yielding once per change.
   */
  async *observe(opts: { signal?: AbortSignal } = {}): AsyncGenerator<this> {

    // The store dedups on the config reference (this record's selector output); we map every distinct config to this same live projection handle, which the consumer
    // re-reads through its getters. As an async-generator method, `this` is bound to the instance for the life of the iteration.
    for await (const _config of this.ctx.store.observe(this.#select, opts)) {

      yield this;
    }
  }

  /**
   * The message thrown by the absent-record guard, supplied by each concrete projection so the error names its specific subject (a device by id and modelKey, the NVR as
   * a singleton). Kept abstract rather than templated because the device and singleton phrasings genuinely differ.
   *
   * @returns The `ReferenceError` message for an absent record.
   */
  protected abstract absenceMessage(): string;

  // The asserting read: peek the live config and throw a subject-specific ReferenceError when it is absent. The raw snapshot read lives in peek(); this adds only the
  // guard, so config and peek() share one read recipe and config is exactly peek()'s throwing form. Centralizing the guard here gives every getter built on config one
  // precise, subject-specific message, and a held handle to a removed (or not-yet-bootstrapped) record fails loudly rather than silently returning a stale or empty
  // object.
  #requireConfig(): Readonly<TConfig> {

    const config = this.peek();

    if(config === undefined) {

      throw new ReferenceError(this.absenceMessage());
    }

    return config;
  }
}

/**
 * The shared base of every *device* projection (`Camera`, `Chime`, `Fob`, `Light`, `Relay`, `Sensor`, `Viewer`). It extends the read-only {@link Projection} core with
 * what every device category adds: a stable `id`, the `modelKey` discriminant, the `name` / `isOnline` getters, and the write-through `update` and `reboot` commands
 * (every Protect device type exposes a reboot endpoint).
 *
 * Commands are **write-through**: `update` PATCHes the controller and returns the same live handle, but does *not* fold the response into the store. State advances
 * solely through the reducer's two universal inputs - the realtime event stream and the bootstrap refresh failsafe - so the issuer learns of its own change the way every
 * other subscriber does (the controller broadcasts the resulting `devicePatched` to all WebSocket subscribers). The consequence is that a projection reflects a command's
 * effect once the stream (or the next refresh) delivers it, not synchronously after the `await`; consumers `observe()` rather than read-after-write.
 *
 * @typeParam TConfig - The concrete device-config-record type this projection wraps.
 *
 * @category Devices
 */
export abstract class DeviceProjection<TConfig extends ProtectDeviceConfig> extends Projection<TConfig> {

  /** The device's stable id. */
  readonly id: string;

  /** The device category discriminant, fixed by the concrete subclass. */
  abstract readonly modelKey: DeviceModelKey;

  protected constructor(ctx: DeviceContext, id: string, select: (id: string) => (state: ProtectState) => TConfig | undefined) {

    super(ctx, select(id));
    this.id = id;
  }

  /**
   * The device's display name - its user-assigned `name` when set, otherwise the controller's `displayName`.
   *
   * @throws {ReferenceError} If the device is no longer present in the controller state.
   */
  get name(): string {

    const config = this.config;

    return config.name ?? config.displayName;
  }

  /**
   * Whether the device is currently connected to the controller. Uses the same definition as the `online` selectors, so the projection and the collection views never
   * disagree about what "online" means.
   *
   * @throws {ReferenceError} If the device is no longer present in the controller state.
   */
  get isOnline(): boolean {

    return isDeviceOnline(this.config);
  }

  /**
   * Issue an authenticated REST call to this device's endpoint and return the 2xx-classified response. This is the single home for the device-command mechanic - URL
   * construction, the JSON-body convention, content-type, the GET/HEAD no-body rule, signal threading, and `ensureOk` classification - so every command and query shares
   * one definition rather than re-spelling the request shape. A body-bearing method (any method other than GET/HEAD) always carries a JSON body -
   * the supplied `payload`, or `{}` for a parameterless command - so a command's wire shape never depends on whether it happens to take parameters;
   * `GET`/`HEAD` carry none. The caller keeps what is
   * genuinely its own - any capability guard (thrown before this is reached) and any extraction from the response (`.body` bytes, a parsed `json<T>()` field) - and the
   * write-through contract holds: this returns the classified response but never folds it into the store.
   *
   * @param path - The suffix appended to this device's endpoint (e.g. `/reboot`, `/snapshot?w=640`); `""` targets the device record itself, as the `update` PATCH does.
   * @param opts - The HTTP `method` (default `POST`), an optional JSON `payload`, and an optional abort `signal`.
   *
   * @returns The 2xx-classified {@link ProtectResponse}; callers extract from it or ignore it.
   *
   * @throws The classified `FatalError` on a non-2xx, or a transport-level `ProtectError` on failure.
   */
  protected async dispatch(path: string, opts: { method?: HttpMethod; payload?: object; signal?: AbortSignal } = {}): Promise<ProtectResponse> {

    const method = opts.method ?? "POST";

    // GET and HEAD carry no body; every body-bearing method sends a JSON body - the supplied payload, or an empty object for a parameterless command - with the matching
    // content-type, so the wire shape is uniform across every write and "does this command carry a body?" has one answer instead of a per-call choice.
    const hasBody = (method !== "GET") && (method !== "HEAD");
    const response = await this.ctx.transport.send(deviceEndpoint(this.ctx.host, this.modelKey, this.id) + path, {

      ...(hasBody && { body: JSON.stringify(opts.payload ?? {}), headers: { "content-type": "application/json" } }),
      method,
      ...((opts.signal !== undefined) && { signal: opts.signal })
    });

    return response.ensureOk();
  }

  /**
   * Apply a configuration change to the device. Write-through: PATCHes the controller and returns this live handle on success. Does not mutate the store - the change
   * is reflected once the realtime stream (or the next refresh) delivers it.
   *
   * @param payload - The partial configuration to apply.
   * @param opts    - Optional abort signal.
   *
   * @returns This projection.
   *
   * @throws The classified `FatalError` on a non-2xx (e.g., {@link ProtectAuthorizationError} when the account lacks admin rights), or a transport-level
   *   `ProtectError` on failure.
   */
  async update(payload: DeepPartial<TConfig>, opts: { signal?: AbortSignal } = {}): Promise<this> {

    // Write-through PATCH of the device record. We deliberately discard the controller's response, which echoes the updated config: state advances only through the
    // reducer-fed stream, never through a command's own reply.
    await this.dispatch("", { method: "PATCH", payload, signal: opts.signal });

    return this;
  }

  /**
   * Reboot the device. Every Protect device category exposes a reboot endpoint, so this is shared device behavior. Write-through: the controller drops and
   * re-establishes the device; the projection reflects the cycle as the realtime stream reports it (the response is not folded into the store).
   *
   * @param opts - Optional abort signal.
   *
   * @throws The classified `FatalError` on a non-2xx, or a transport-level `ProtectError` on failure.
   */
  async reboot(opts: { signal?: AbortSignal } = {}): Promise<void> {

    await this.dispatch("/reboot", { signal: opts.signal });
  }

  // The absent-device guard message, naming the device by id and modelKey.
  protected absenceMessage(): string {

    return "Device " + this.id + " (" + this.modelKey + ") is no longer present in the controller state.";
  }
}
