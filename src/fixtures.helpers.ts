/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * fixtures.helpers.ts: Test-only factories for synthetic Protect device and bootstrap records. Tests build the exact records they need from these factories, so a
 * test expresses only the fields that matter to it and the noise of the full device interface stays out of the assertion. The full interfaces carry well over a
 * hundred fields the reducer never inspects (it merges and compares structurally), so the factories populate a small, realistic core and let each test override what
 * it cares about. The `as unknown as` casts needed to build these partial device and bootstrap records are confined here.
 */
import type { ProtectCameraConfig, ProtectChimeConfig, ProtectFobConfig, ProtectLightConfig, ProtectNvrBootstrap, ProtectNvrConfig, ProtectNvrLiveviewConfig,
  ProtectNvrUserConfig, ProtectRelayConfig, ProtectRingtoneConfig, ProtectSensorConfig, ProtectViewerConfig } from "./types/index.ts";

// A camera with a nested object (`featureFlags`) and an array (`channels`) so tests can exercise deep merges, array-wholesale-replacement, and structural sharing
// against realistic shapes rather than flat scalars.
export function makeCamera(overrides: Record<string, unknown> = {}): ProtectCameraConfig {

  return {

    channels: [ { id: 0, name: "High" }, { id: 1, name: "Medium" } ],
    featureFlags: { hasMotionZones: true, smartDetectTypes: ["person"] },
    host: "192.168.1.50",
    id: "camera-1",
    isMotionDetected: false,
    lastMotion: 0,
    mac: "AA:BB:CC:00:00:01",
    modelKey: "camera",
    name: "Front Door",
    state: "CONNECTED",
    ...overrides
  } as unknown as ProtectCameraConfig;
}

export function makeLight(overrides: Record<string, unknown> = {}): ProtectLightConfig {

  return { id: "light-1", isLightOn: false, modelKey: "light", name: "Driveway Light", state: "CONNECTED", ...overrides } as unknown as ProtectLightConfig;
}

export function makeSensor(overrides: Record<string, unknown> = {}): ProtectSensorConfig {

  return { id: "sensor-1", modelKey: "sensor", name: "Garage Sensor", state: "CONNECTED", ...overrides } as unknown as ProtectSensorConfig;
}

export function makeChime(overrides: Record<string, unknown> = {}): ProtectChimeConfig {

  return { id: "chime-1", modelKey: "chime", name: "Hallway Chime", state: "CONNECTED", volume: 100, ...overrides } as unknown as ProtectChimeConfig;
}

export function makeFob(overrides: Record<string, unknown> = {}): ProtectFobConfig {

  return { id: "fob-1", modelKey: "fob", name: "Keyfob", state: "CONNECTED", ...overrides } as unknown as ProtectFobConfig;
}

export function makeViewer(overrides: Record<string, unknown> = {}): ProtectViewerConfig {

  return { id: "viewer-1", modelKey: "viewer", name: "Lobby Viewer", state: "CONNECTED", ...overrides } as unknown as ProtectViewerConfig;
}

// A relay with its per-output state and an inputs/outputs/ledSettings core, so tests can exercise output toggles and nested deep-merges. The `as unknown as` cast absorbs
// the relay's wire reality the base now allows - it reports `host: null` and omits `isConnected` - so a test never reads those off this fixture expecting a wired value.
export function makeRelay(overrides: Record<string, unknown> = {}): ProtectRelayConfig {

  return {

    id: "relay-1",
    inputs: [{ actionOutputId: 0, id: 0, name: "Input 1", state: "off" }],
    ledSettings: { isEnabled: true },
    modelKey: "relay",
    name: "Garage Relay",
    outputs: [{ id: 0, name: "Output 1", state: "off" }],
    state: "CONNECTED",
    ...overrides
  } as unknown as ProtectRelayConfig;
}

export function makeNvr(overrides: Record<string, unknown> = {}): ProtectNvrConfig {

  return {

    host: "192.168.1.1",
    id: "nvr-1",
    mac: "AA:BB:CC:DD:EE:FF",
    marketName: "UDM Pro",
    modelKey: "nvr",
    name: "Dream Machine Pro",
    ports: { rtsp: 7447 },
    upSince: 1700000000000,
    ...overrides
  } as unknown as ProtectNvrConfig;
}

// A controller user. `allPermissions` is the resolved permission set the admin check reads; it defaults to empty (a non-admin) so a test opts into admin explicitly.
export function makeUser(overrides: Record<string, unknown> = {}): ProtectNvrUserConfig {

  return { allPermissions: [], id: "user-1", modelKey: "user", name: "Administrator", permissions: [], ...overrides } as unknown as ProtectNvrUserConfig;
}

// A liveview with a single populated slot, so tests can assert the nested `slots[].cameras` survives reduction and selection unflattened.
export function makeLiveview(overrides: Record<string, unknown> = {}): ProtectNvrLiveviewConfig {

  return {

    id: "liveview-1",
    isDefault: true,
    modelKey: "liveview",
    name: "All Cameras",
    slots: [{ cameras: ["camera-1"], cycleInterval: 10, cycleMode: "manual" }],
    ...overrides
  } as unknown as ProtectNvrLiveviewConfig;
}

// A controller ringtone. Carries an `id` and `modelKey` like every reduced record, but is reduced bootstrap-only (no realtime `ringtone` packet).
export function makeRingtone(overrides: Record<string, unknown> = {}): ProtectRingtoneConfig {

  return {

    id: "ringtone-1",
    isDefault: true,
    modelKey: "ringtone",
    name: "Default",
    nvrMac: "AA:BB:CC:00:00:FF",
    size: 1024,
    ...overrides
  } as unknown as ProtectRingtoneConfig;
}

// Assemble a bootstrap from device arrays, an NVR config, and the session's user roster. Every collection defaults to empty and `authUserId` to a sentinel that matches
// no user, so a test names only what it exercises; admin/identity tests pass `users` plus a matching `authUserId`.
export function makeBootstrap(overrides: {

  authUserId?: string;
  cameras?: ProtectCameraConfig[];
  chimes?: ProtectChimeConfig[];
  fobs?: ProtectFobConfig[];
  lights?: ProtectLightConfig[];
  liveviews?: ProtectNvrLiveviewConfig[];
  nvr?: ProtectNvrConfig;
  relays?: ProtectRelayConfig[];
  ringtones?: ProtectRingtoneConfig[];
  sensors?: ProtectSensorConfig[];
  users?: ProtectNvrUserConfig[];
  viewers?: ProtectViewerConfig[];
} = {}): ProtectNvrBootstrap {

  return {

    authUserId: overrides.authUserId ?? "",
    cameras: overrides.cameras ?? [],
    chimes: overrides.chimes ?? [],
    fobs: overrides.fobs ?? [],
    lights: overrides.lights ?? [],
    liveviews: overrides.liveviews ?? [],
    nvr: overrides.nvr ?? makeNvr(),
    relays: overrides.relays ?? [],
    ringtones: overrides.ringtones ?? [],
    sensors: overrides.sensors ?? [],
    users: overrides.users ?? [],
    viewers: overrides.viewers ?? []
  } as unknown as ProtectNvrBootstrap;
}
