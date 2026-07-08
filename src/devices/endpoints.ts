/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * endpoints.ts: The single source of truth for Protect device REST endpoint URLs.
 */
import type { DeviceModelKey } from "../protocol/events.ts";

// The Protect application REST path segment for each device model key. Declared once here so a path typo is impossible at the call site and a future controller path
// change is a single edit. The NVR singleton lives at the bare `nvr` collection (no id suffix); every other device is addressed by id under its plural collection.
const DEVICE_API_PATH: Record<DeviceModelKey, string> = {

  camera: "cameras",
  chime: "chimes",
  fob: "fobs",
  light: "lights",
  nvr: "nvr",
  relay: "relays",
  sensor: "sensors",
  viewer: "viewers"
};

/**
 * Build the REST endpoint URL for a device collection or a specific device. The Protect application API is reached through the controller's `/proxy/protect/api/`
 * prefix; the device's model key selects the collection and the optional id addresses one device within it.
 *
 * @param host     - The controller address (no scheme).
 * @param modelKey - The device category whose collection to address.
 * @param id       - The specific device id; omit to address the collection root itself (`.../cameras`, or the `.../nvr` singleton, which carries no id suffix).
 *
 * @returns The fully-qualified endpoint URL.
 *
 * @category Devices
 */
export function deviceEndpoint(host: string, modelKey: DeviceModelKey, id?: string): string {

  const base = "https://" + host + "/proxy/protect/api/" + DEVICE_API_PATH[modelKey];

  return (id === undefined) ? base : base + "/" + id;
}
