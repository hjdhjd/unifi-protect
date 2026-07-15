/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * registry.ts: The projection factory - typed device lookup and iteration over the current state.
 */
import { Camera } from "./camera.ts";
import { Chime } from "./chime.ts";
import type { DeviceCollectionKey } from "../protocol/events.ts";
import type { DeviceContext } from "./context.ts";
import { Fob } from "./fob.ts";
import { Light } from "./light.ts";
import { Nvr } from "./nvr.ts";
import { Relay } from "./relay.ts";
import { Sensor } from "./sensor.ts";
import { Viewer } from "./viewer.ts";
import { deviceSelectors } from "../state/selectors.ts";

// The concrete projection class for each device category. Correlated with deviceSelectors through the shared DeviceCollectionKey so a lookup and the class it constructs
// cannot drift apart.
interface RegistryProjectionMap {

  camera: Camera;
  chime: Chime;
  fob: Fob;
  light: Light;
  relay: Relay;
  sensor: Sensor;
  viewer: Viewer;
}

// The projection constructor for each category, keyed by the collection vocabulary. The mapped type pins each entry to its category's class, so the generic #lookup and
// #all can construct over an abstract key while every public accessor keeps its exact projection return type; a missing or transposed row is a compile error.
const PROJECTIONS: { readonly [K in DeviceCollectionKey]: new (ctx: DeviceContext, id: string) => RegistryProjectionMap[K] } = {

  camera: Camera,
  chime: Chime,
  fob: Fob,
  light: Light,
  relay: Relay,
  sensor: Sensor,
  viewer: Viewer
};

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

    return this.#lookup("camera", id);
  }

  /** Look up a chime by id, or `undefined` when absent. */
  chime(id: string): Chime | undefined {

    return this.#lookup("chime", id);
  }

  /** Look up a fob by id, or `undefined` when absent. */
  fob(id: string): Fob | undefined {

    return this.#lookup("fob", id);
  }

  /** Look up a light by id, or `undefined` when absent. */
  light(id: string): Light | undefined {

    return this.#lookup("light", id);
  }

  /** Look up a relay by id, or `undefined` when absent. */
  relay(id: string): Relay | undefined {

    return this.#lookup("relay", id);
  }

  /** Look up a sensor by id, or `undefined` when absent. */
  sensor(id: string): Sensor | undefined {

    return this.#lookup("sensor", id);
  }

  /** Look up a viewer by id, or `undefined` when absent. */
  viewer(id: string): Viewer | undefined {

    return this.#lookup("viewer", id);
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

    return this.#all("camera");
  }

  /** Every chime in the current state, as live projections. */
  chimes(): readonly Chime[] {

    return this.#all("chime");
  }

  /** Every fob in the current state, as live projections. */
  fobs(): readonly Fob[] {

    return this.#all("fob");
  }

  /** Every light in the current state, as live projections. */
  lights(): readonly Light[] {

    return this.#all("light");
  }

  /** Every relay in the current state, as live projections. */
  relays(): readonly Relay[] {

    return this.#all("relay");
  }

  /** Every sensor in the current state, as live projections. */
  sensors(): readonly Sensor[] {

    return this.#all("sensor");
  }

  /** Every viewer in the current state, as live projections. */
  viewers(): readonly Viewer[] {

    return this.#all("viewer");
  }

  // Build one projection if its id is present in the current snapshot, else undefined. The presence check reads through the category's by-id selector so lookup and the
  // projection share one notion of "exists"; the key correlates the selector and the constructor through PROJECTIONS, so a mismatched pair cannot compile.
  #lookup<K extends DeviceCollectionKey>(key: K, id: string): RegistryProjectionMap[K] | undefined {

    return (deviceSelectors[key].byId(id)(this.#ctx.store.snapshot()) !== undefined) ? new PROJECTIONS[key](this.#ctx, id) : undefined;
  }

  // Map the memoized config array for a collection to fresh projection handles. One helper for every device collection keeps the construction logic single-source.
  #all<K extends DeviceCollectionKey>(key: K): readonly RegistryProjectionMap[K][] {

    return deviceSelectors[key].all(this.#ctx.store.snapshot()).map((config) => new PROJECTIONS[key](this.#ctx, config.id));
  }
}
