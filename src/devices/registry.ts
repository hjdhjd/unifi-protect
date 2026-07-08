/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * registry.ts: The projection factory - typed device lookup and iteration over the current state.
 */
import { selectCamera, selectCameras, selectChime, selectChimes, selectFob, selectFobs, selectLight, selectLights, selectRelay, selectRelays, selectSensor,
  selectSensors, selectViewer, selectViewers } from "../state/selectors.ts";
import { Camera } from "./camera.ts";
import { Chime } from "./chime.ts";
import type { DeviceContext } from "./context.ts";
import { Fob } from "./fob.ts";
import { Light } from "./light.ts";
import { Nvr } from "./nvr.ts";
import type { ProtectState } from "../protocol/reducer.ts";
import { Relay } from "./relay.ts";
import { Sensor } from "./sensor.ts";
import { Viewer } from "./viewer.ts";

// A device-projection constructor: every projection is built from the shared context and a device id.
type ProjectionConstructor<T> = new (ctx: DeviceContext, id: string) => T;

/**
 * The projection factory the client composes. It turns ids into live {@link DeviceProjection} handles for every device category - looked up by id or iterated as a
 * collection against the current store snapshot - plus the id-free NVR singleton handle. This is where projection construction lives - at Layer 3 - so `StateStore`
 * stays a pure generic engine that never imports a device type.
 *
 * Projections are not cached: each lookup or iteration mints fresh handles. That is intentional and cheap - a handle is a thin `(context, id)` view, and identity is
 * meaningless for a value that simply reads through to the single source of truth.
 *
 * @category Devices
 */
export class DeviceRegistry {

  readonly #ctx: DeviceContext;

  constructor(ctx: DeviceContext) {

    this.#ctx = ctx;
  }

  /** Look up a camera by id, or `undefined` when no such camera is in the current state. */
  camera(id: string): Camera | undefined {

    return this.#lookup(id, selectCamera, Camera);
  }

  /** Look up a chime by id, or `undefined` when absent. */
  chime(id: string): Chime | undefined {

    return this.#lookup(id, selectChime, Chime);
  }

  /** Look up a fob by id, or `undefined` when absent. */
  fob(id: string): Fob | undefined {

    return this.#lookup(id, selectFob, Fob);
  }

  /** Look up a light by id, or `undefined` when absent. */
  light(id: string): Light | undefined {

    return this.#lookup(id, selectLight, Light);
  }

  /** Look up a relay by id, or `undefined` when absent. */
  relay(id: string): Relay | undefined {

    return this.#lookup(id, selectRelay, Relay);
  }

  /** Look up a sensor by id, or `undefined` when absent. */
  sensor(id: string): Sensor | undefined {

    return this.#lookup(id, selectSensor, Sensor);
  }

  /** Look up a viewer by id, or `undefined` when absent. */
  viewer(id: string): Viewer | undefined {

    return this.#lookup(id, selectViewer, Viewer);
  }

  /**
   * The NVR singleton projection. Unlike the device lookups there is no id and no `undefined`: the NVR is a singleton, so this always returns a handle. Its getters throw
   * before the first bootstrap (when the NVR record is not yet known) - the same absent-record contract a device projection uses. A connected client never hits it.
   */
  nvr(): Nvr {

    return new Nvr(this.#ctx);
  }

  /** Every camera in the current state, as live projections. */
  cameras(): readonly Camera[] {

    return this.#all(selectCameras, Camera);
  }

  /** Every chime in the current state, as live projections. */
  chimes(): readonly Chime[] {

    return this.#all(selectChimes, Chime);
  }

  /** Every fob in the current state, as live projections. */
  fobs(): readonly Fob[] {

    return this.#all(selectFobs, Fob);
  }

  /** Every light in the current state, as live projections. */
  lights(): readonly Light[] {

    return this.#all(selectLights, Light);
  }

  /** Every relay in the current state, as live projections. */
  relays(): readonly Relay[] {

    return this.#all(selectRelays, Relay);
  }

  /** Every sensor in the current state, as live projections. */
  sensors(): readonly Sensor[] {

    return this.#all(selectSensors, Sensor);
  }

  /** Every viewer in the current state, as live projections. */
  viewers(): readonly Viewer[] {

    return this.#all(selectViewers, Viewer);
  }

  // Build one projection if its id is present in the current snapshot, else undefined. The presence check reads through the by-id selector so lookup and the projection
  // share one notion of "exists".
  #lookup<T>(id: string, byId: (id: string) => (state: ProtectState) => unknown, Ctor: ProjectionConstructor<T>): T | undefined {

    return (byId(id)(this.#ctx.store.snapshot()) !== undefined) ? new Ctor(this.#ctx, id) : undefined;
  }

  // Map the memoized config array for a collection to fresh projection handles. One helper for every device collection keeps the construction logic single-source.
  #all<T>(all: (state: ProtectState) => readonly { id: string }[], Ctor: ProjectionConstructor<T>): readonly T[] {

    return all(this.#ctx.store.snapshot()).map((config) => new Ctor(this.#ctx, config.id));
  }
}
