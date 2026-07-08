/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * lookup.ts: Finding things in a connected client by what the operator typed - a device by id or name, and an id-to-name resolver for event rendering.
 */
import type { Camera, Chime, Fob, Light, ProtectClient, Relay, Sensor, Viewer } from "../../index.ts";
import { CliError } from "./shared.ts";

/**
 * Any device projection the CLI can address. The NVR is intentionally excluded - it is a state singleton with no device projection, so commands that act on the
 * controller itself (a reboot) handle it explicitly rather than through device lookup.
 *
 * @category CLI
 */
export type AnyDevice = Camera | Chime | Fob | Light | Relay | Sensor | Viewer;

/**
 * Every device projection in the current state, across every device category, in a single flat array. The basis for name resolution and id/name lookup.
 *
 * @param client - The connected client.
 *
 * @returns All device projections.
 *
 * @category CLI
 */
export function allDevices(client: ProtectClient): AnyDevice[] {

  return [ ...client.cameras, ...client.chimes, ...client.fobs, ...client.lights, ...client.relays, ...client.sensors, ...client.viewers ];
}

/**
 * The device categories the CLI selects a *class* of devices by - the plural words shared verbatim across `watch state <category>`, `reboot <category>`, and
 * `info [category]`, so the vocabulary is learned once and means the same thing wherever a command names a class of devices. This is the single source for that name set;
 * `watch state`'s selector map is typed against {@link DeviceCategory} so it cannot drift from it.
 *
 * @category CLI
 */
export const DEVICE_CATEGORIES = [ "cameras", "chimes", "fobs", "lights", "relays", "sensors", "viewers" ] as const;

/**
 * One of the {@link DEVICE_CATEGORIES} plural words.
 *
 * @category CLI
 */
export type DeviceCategory = typeof DEVICE_CATEGORIES[number];

/**
 * Whether a raw token is one of the device-category words. The membership test that lets a command resolve a positional to "a class of devices."
 *
 * @param token - The token as typed.
 *
 * @returns `true` when `token` is a known device category.
 *
 * @category CLI
 */
export function isDeviceCategory(token: string): token is DeviceCategory {

  return (DEVICE_CATEGORIES as readonly string[]).includes(token);
}

/**
 * The device projections of one category, read live from the client. The single mapping from a category word to its projection collection, shared by the commands that
 * act on or list a whole class (`reboot <category>` rebooting each, `info [category]` listing them).
 *
 * @param client   - The connected client.
 * @param category - The device category.
 *
 * @returns That category's device projections.
 *
 * @category CLI
 */
export function devicesInCategory(client: ProtectClient, category: DeviceCategory): readonly AnyDevice[] {

  switch(category) {

    case "cameras":

      return client.cameras;

    case "chimes":

      return client.chimes;

    case "fobs":

      return client.fobs;

    case "lights":

      return client.lights;

    case "relays":

      return client.relays;

    case "sensors":

      return client.sensors;

    case "viewers":

      return client.viewers;
  }
}

/**
 * Build a device-id-to-name resolver from the current state, used to render the `--device` filter and event output in names rather than opaque ids. Built once per
 * invocation from a snapshot; an id absent from the map (an event for a device that has since left state) resolves to `undefined` and the caller falls back to the id.
 *
 * @param client - The connected client.
 *
 * @returns A function mapping a device (or NVR) id to its display name, or `undefined` when unknown.
 *
 * @category CLI
 */
export function buildNameResolver(client: ProtectClient): (id: string) => string | undefined {

  const names = new Map<string, string>();

  for(const device of allDevices(client)) {

    names.set(device.id, device.name);
  }

  // Include the NVR so a `--device` term can match controller-attributed activity by the controller's own name, not only by id.
  const nvr = client.state.snapshot().nvr;

  if(nvr?.name !== undefined) {

    names.set(nvr.id, nvr.name);
  }

  return (id: string): string | undefined => names.get(id);
}

// Case-insensitive exact-name match across a device collection. We match the whole name rather than a substring here because device lookup feeds commands that act on a
// device (snapshot, update, reboot); a forgiving substring match risks acting on the wrong device, so disambiguation is the operator's job (use the id).
function matchByName<T extends { name: string }>(devices: readonly T[], token: string): T[] {

  const lower = token.toLowerCase();

  return devices.filter((device) => device.name.toLowerCase() === lower);
}

// Reduce a match set to exactly one device, or fail with a precise message: nothing matched, or the name was ambiguous (in which case the id is the disambiguator).
function requireOne<T>(matches: T[], category: string, token: string): T {

  const [first] = matches;

  if(first === undefined) {

    throw new CliError("No " + category + " matches \"" + token + "\" by id or name.");
  }

  if(matches.length > 1) {

    throw new CliError("\"" + token + "\" matches " + matches.length.toString() + " " + category + "s by name; use the device id to disambiguate.");
  }

  return first;
}

/**
 * Resolve a device of a specific class by the operator's token - an exact id across all collections first, then a case-insensitive exact name match - and narrow it to
 * that class. This is the single source of truth for "resolve a token to a device of a given class": every class-specific command (the `camera`/`relay`/`chime` action
 * groups) resolves through it, so there is one resolution mechanism rather than one per class. A token that resolves to a device of a *different* class fails with a
 * precise message naming both classes, rather than silently acting on the wrong device or returning nothing.
 *
 * @typeParam K - The requested device class, as a `modelKey` literal.
 *
 * @param client   - The connected client.
 * @param token    - The device id or name as typed.
 * @param modelKey - The class the device must be, as its `modelKey` literal (`"camera"`, `"relay"`, `"chime"`, ...).
 *
 * @returns The matching device, narrowed to the requested class.
 *
 * @throws {@link CliError} when nothing matches, when a name is ambiguous, or when the token resolves to a device of a different class.
 *
 * @category CLI
 */
export function findDeviceOfType<K extends AnyDevice["modelKey"]>(client: ProtectClient, token: string, modelKey: K): Extract<AnyDevice, { modelKey: K }> {

  // A user-defined type guard, not a bare `candidate.modelKey === modelKey`: TypeScript does not narrow the `AnyDevice` union to `Extract<AnyDevice, { modelKey: K }>`
  // from a comparison against a generic `K` on its own, so we express the narrowing explicitly and let the compiler carry it through `filter` to the return.
  const isType = (candidate: AnyDevice): candidate is Extract<AnyDevice, { modelKey: K }> => candidate.modelKey === modelKey;

  // Resolve *within the requested class*: narrow the id/name matches to the class before requiring uniqueness. A group command already knows the class it acts on, so a
  // same-named device of another class (a camera and a chime both named "Dog Room") must neither block resolution nor be miscounted as an ambiguity of this class.
  const matches = findDeviceMatches(client, token);
  const ofType = matches.filter(isType);

  // Nothing of the requested class matched. If the token nonetheless resolved to a device of another class, name that mismatch precisely rather than falling through to a
  // bare "no match"; otherwise let `requireOne` report the honest "no <class> matches".
  if(ofType.length === 0) {

    const [other] = matches;

    if(other !== undefined) {

      throw new CliError("\"" + token + "\" is a " + other.modelKey + ", not a " + modelKey + ".", { exitCode: 2 });
    }
  }

  // Exactly one device of the class is the target; zero yields "no <class> matches", several an accurate within-class ambiguity - all through the shared `requireOne`.
  return requireOne(ofType, modelKey, token);
}

/**
 * Resolve a camera by the operator's token - an exact id first (the unambiguous path), then a case-insensitive exact name match. A thin, typed convenience over
 * {@link findDeviceOfType}, so camera resolution and every other class-specific resolution share the one mechanism rather than maintaining a parallel resolver.
 *
 * @param client - The connected client.
 * @param token  - The camera id or name as typed.
 *
 * @returns The matching camera.
 *
 * @throws {@link CliError} when nothing matches, or when a name is ambiguous.
 *
 * @category CLI
 */
export function findCamera(client: ProtectClient, token: string): Camera {

  return findDeviceOfType(client, token, "camera");
}

/**
 * Resolve a device of any category by the operator's token - an exact id across all collections first, then a case-insensitive exact name match.
 *
 * @param client - The connected client.
 * @param token  - The device id or name as typed.
 *
 * @returns The matching device projection.
 *
 * @throws {@link CliError} when nothing matches, or when a name is ambiguous.
 *
 * @category CLI
 */
export function findDevice(client: ProtectClient, token: string): AnyDevice {

  return requireOne(findDeviceMatches(client, token), "device", token);
}

/**
 * The device projections a token matches - an exact id (at most one) or, failing that, every case-insensitive exact-name match. Returns the raw match set rather than
 * forcing it to one, so a caller can resolve "exactly one device" itself ({@link findDevice}) *or* decide what a zero-match means - which is what lets `reboot` try a
 * device first and fall back to a category word only when no device owns the name (the device-first resolution a destructive command wants).
 *
 * @param client - The connected client.
 * @param token  - The device id or name as typed.
 *
 * @returns The matching device projections: empty when nothing matches, one for an id or unique name, several for an ambiguous name.
 *
 * @category CLI
 */
export function findDeviceMatches(client: ProtectClient, token: string): AnyDevice[] {

  const devices = allDevices(client);
  const byId = devices.find((device) => device.id === token);

  return (byId !== undefined) ? [byId] : matchByName(devices, token);
}
