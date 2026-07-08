/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * light.ts: The UniFi Protect light configuration type.
 */
import type { Nullable } from "./common.ts";
import type { ProtectDeviceBaseInterface } from "./base.ts";

/**
 * The UniFi Protect light configuration type: the floodlight's device record, its paired camera, PIR and lux settings, and light-mode schedule.
 *
 * @module ProtectTypesLight
 */

/**
 * A semi-complete description of the UniFi Protect light JSON.
 */
export interface ProtectLightConfigInterface extends ProtectDeviceBaseInterface {

  camera: Nullable<string>;
  host: string;
  isCameraPaired: boolean;
  isConnected: boolean;
  isDark: boolean;
  // The device-level force-on flag: whether the floodlight is being forced on irrespective of its `lightModeSettings` mode and schedule. The override it reflects is
  // configured in the `lightOnSettings` block below (`isLedForceOn`); this top-level flag surfaces that the override is in effect.
  isLightForceEnabled: boolean;
  isLightOn: boolean;
  isLocating: boolean;
  isPirMotionDetected: boolean;
  lastMotion: Nullable<number>;
  lightDeviceSettings: {

    isIndicatorEnabled: boolean;
    ledLevel: number;
    luxSensitivity: string;
    pirDuration: number;
    pirSensitivity: number;
  };
  lightModeSettings: {

    enableAt: string;
    mode: string;
  };
  lightOnSettings: {

    // The force-on override toggle itself; the top-level `isLightForceEnabled` flag above surfaces when it is in effect.
    isLedForceOn: boolean;
  };
  modelKey: "light";
}

/** @see {@link ProtectLightConfigInterface} */
export type ProtectLightConfig = ProtectLightConfigInterface;
