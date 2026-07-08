/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * index.ts: The internal barrel forwarding every UniFi Protect type, and the cross-domain state unions the reducer maintains.
 */

/**
 * A semi-complete description of all the object types used by the UniFi Protect API.
 *
 * The UniFi Protect API is largely undocumented - these interfaces and types have been gleaned through a lot of experimentation and observation. Protect is always
 * evolving and I will attempt to keep up with the changes over time.
 *
 * Each device has an **Interface** (the full definition with all properties) and a **Config** type alias (for reads). For PATCH/update payloads, consumers use
 * `DeepPartial<...Config>` directly. All device interfaces include `[key: string]: ProtectKnownJsonValue` index signatures so that untyped API fields are accessible
 * without casting. Common device properties are inherited from `ProtectDeviceBaseInterface`.
 *
 * @module ProtectTypes
 */
export type * from "./base.ts";
export type * from "./camera.ts";
export type * from "./chime.ts";
export type * from "./common.ts";
export type * from "./events.ts";
export type * from "./fob.ts";
export type * from "./light.ts";
export type * from "./nvr.ts";
export type * from "./relay.ts";
export type * from "./sensor.ts";
export type * from "./shapes.ts";
export type * from "./viewer.ts";

import type { ProtectNvrConfig, ProtectNvrLiveviewConfig, ProtectNvrUserConfig } from "./nvr.ts";
import type { ProtectCameraConfig } from "./camera.ts";
import type { ProtectChimeConfig } from "./chime.ts";
import type { ProtectFobConfig } from "./fob.ts";
import type { ProtectLightConfig } from "./light.ts";
import type { ProtectRelayConfig } from "./relay.ts";
import type { ProtectSensorConfig } from "./sensor.ts";
import type { ProtectViewerConfig } from "./viewer.ts";

/**
 * The union of every device-config record the reducer maintains as canonical state. A realtime device transition (`deviceAdded` / `devicePatched`) carries one of
 * these shapes, discriminated by the packet's `modelKey`. The NVR config is included because the controller emits `modelKey: "nvr"` updates that patch the NVR's
 * own configuration through the same dispatch path as any other device. Consumers narrow on `modelKey` (or on a structural field) to recover the specific shape.
 */
export type ProtectKnownDevice = ProtectCameraConfig | ProtectChimeConfig | ProtectFobConfig | ProtectLightConfig | ProtectNvrConfig | ProtectRelayConfig |
  ProtectSensorConfig | ProtectViewerConfig;

/**
 * The union of every config record the reducer stores in {@link ProtectState}: the devices and NVR of {@link ProtectKnownDevice}, plus the controller's user and liveview
 * records. A realtime state transition (`deviceAdded` / `devicePatched`) carries one of these, discriminated by the packet's `modelKey`. The `user` roster is included
 * because the controller emits `modelKey: "user"` updates - permission and login changes - on the realtime stream; the `liveview` collection because it emits
 * `modelKey: "liveview"` updates as liveviews are added, edited, or removed. The reducer folds both in through the same dispatch path as any device. This widens
 * {@link ProtectKnownDevice} by exactly the record types the user roster (`user`) and the liveview collection (`liveview`) introduce; consumers narrow on `modelKey` to
 * recover the shape. (`ringtones` is reduced into {@link ProtectState} too, but bootstrap-only - the controller broadcasts no `ringtone` realtime packet - so it never
 * arrives as a state transition and is deliberately absent from this union.)
 */
export type ProtectStateRecord = ProtectKnownDevice | ProtectNvrLiveviewConfig | ProtectNvrUserConfig;
