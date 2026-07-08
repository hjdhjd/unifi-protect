/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * nvr.ts: The Nvr projection - the read-only, observable view over the controller's NVR configuration singleton.
 */
import type { DeviceContext } from "./context.ts";
import { Projection } from "./device.ts";
import type { ProtectNvrConfig } from "../types/index.ts";
import type { ProtectState } from "../protocol/reducer.ts";
import { selectNvr } from "../state/selectors.ts";

/**
 * The NVR projection - a read-only, observable view over the controller's configuration singleton (`state.nvr`). It is the singleton sibling of the device projections:
 * exactly like `Camera` it is a live view whose getters read through to the current store snapshot, so a held handle always reflects the latest reduced state. It
 * differs only in being constructed from just a context, since the NVR is a singleton with no id to bind, where `Camera` binds a `(context, id)` pair.
 *
 * It extends the read-only {@link Projection} core, **not** {@link DeviceProjection}, and so bears no commands: NVR configuration writes are out of scope, and the
 * controller-level reboot is `client.reboot()` (a UniFi-OS operation, not a Protect device op). This honors the device-method rule - a method exists iff it maps to an
 * operation the subject supports - and is why the NVR is a projection over the read-only core rather than a device projection with `update`/`reboot` it must hide. It
 * exposes only fields of its own `ProtectNvrConfig` record; the controller's liveviews and ringtones are peer top-level collections (`client.liveviews` /
 * `client.ringtones`), not children of the NVR record, so they are surfaced as selectors, not as getters here.
 *
 * Unlike the device projections there is no id and no `undefined` lookup: the NVR is a singleton, so `client.nvr` always returns a handle. Its getters throw
 * `ReferenceError` only before the first bootstrap (when `state.nvr` is still `null`) - the same absent-record contract a device projection uses for a removed device. A
 * connected client never hits that case, because `ProtectClient.connect()` awaits the initial bootstrap before returning.
 *
 * @category Devices
 */
export class Nvr extends Projection<ProtectNvrConfig> {

  constructor(ctx: DeviceContext) {

    // The base core observes/reads through a `(state) => TConfig | undefined` selector; selectNvr yields the record or `null` before the first bootstrap, which we map to
    // `undefined` so the absent-record guard fires uniformly with the device projections. The closure is created once here, giving observe a stable selector identity.
    super(ctx, (state: ProtectState): ProtectNvrConfig | undefined => selectNvr(state) ?? undefined);
  }

  /** The controller's host address (IP or hostname). */
  get host(): string {

    return this.config.host;
  }

  /**
   * The controller's hardware market name (the product model, e.g. "UDM Pro"). Always present; it is both useful on its own and the always-present fallback that
   * {@link name} cooks in when the controller has not been user-named.
   */
  get marketName(): string {

    return this.config.marketName;
  }

  /**
   * The controller's display label - its user-assigned name when set, otherwise the always-present {@link marketName}. Always a `string`, honoring the projection-wide
   * `.name` convention (a device's `name ?? displayName`): `marketName` is the NVR's analog of a device's `displayName`. This is single-sourced with
   * `client.controllerName` (which mirrors the same `name ?? marketName` label), so the two never disagree. The raw, possibly-unset user name stays reachable via
   * `nvr.config.name` for a consumer that needs the "was it explicitly named?" distinction - the getter-cooks / `config`-is-raw split also used for {@link rtspPort}.
   */
  get name(): string {

    return this.config.name ?? this.config.marketName;
  }

  /**
   * The controller's RTSP service port (`ports.rtsp`) - the one port a consumer building RTSP URLs needs. Other ports remain available through `nvr.config.ports`.
   */
  get rtspPort(): number {

    return this.config.ports.rtsp;
  }

  // The absent-record guard message: the NVR is a singleton, so it names no id - it is simply not yet known before the first bootstrap.
  protected absenceMessage(): string {

    return "The NVR configuration is not available; no bootstrap has been applied yet.";
  }
}
