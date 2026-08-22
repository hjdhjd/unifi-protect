/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * siren.ts: The UniFi Protect siren configuration type - the device record, its supervised alarm-input wiring, and the live state of its sounder.
 */
import type { Nullable, ProtectKnownJsonValue } from "./common.ts";
import type { ProtectDeviceBaseInterface, ProtectWirelessConnectionSettingsInterface, ProtectWirelessConnectionStateInterface } from "./base.ts";
import type { ProtectLedSettingsInterface } from "./shapes.ts";

/**
 * The UniFi Protect siren configuration type: the siren's device record, carrying how its supervised alarm input is wired, the live state of the sounder, and the
 * volume it sounds at.
 *
 * @module ProtectTypesSiren
 */

/**
 * A semi-complete description of the UniFi Protect siren JSON. A siren is a wired sounder the controller arms and triggers, either from its own supervised alarm input
 * or from an automation; it carries the standard device record (inherited from {@link ProtectDeviceBaseInterface}) plus that input's wiring and the sounder's live
 * state. It reports a concrete `host` and re-narrows it, but omits `isConnected` entirely, so that member keeps the base's optional form. It also carries the
 * long-range radio shapes with their telemetry reported `null`, which is why those members are nullable on the shared shapes.
 */
export interface ProtectSirenConfigInterface extends ProtectDeviceBaseInterface {

  alarmInputSettings: {

    detectorType: string;
    eolr: number;
    lightAlarmEnable: boolean;
    resistor: number;
    soundAlarmEnable: boolean;
  };
  connectionType: string;
  featureFlags: {

    hasLedStatus: boolean;
  };
  host: string;
  // Observed only as `null` on a siren that has never sounded, and no other device class declares the member, so there is no sibling shape to reuse - the payload stays
  // opaque rather than guessed at.
  lastEvent: ProtectKnownJsonValue;
  ledSettings: ProtectLedSettingsInterface;
  modelKey: "siren";
  // The nullable members were observed only as `null`; their non-null halves are inferred from what each names - a trigger time and a duration are numeric, an
  // input state and an automation identifier are strings. The shape is deliberately closed: the record-level index signature absorbs drift around it, so a member the
  // controller adds inside `sirenStatus` is reported as novelty rather than passing silently.
  sirenStatus: {

    activatedAt: Nullable<number>;
    alarmInputState: Nullable<string>;
    automationId: Nullable<string>;
    duration: Nullable<number>;
    isActive: boolean;
  };
  volume: number;
  wirelessConnectionSettings: ProtectWirelessConnectionSettingsInterface;
  wirelessConnectionState: ProtectWirelessConnectionStateInterface;
}

/** @see {@link ProtectSirenConfigInterface} */
export type ProtectSirenConfig = ProtectSirenConfigInterface;
