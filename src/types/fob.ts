/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * fob.ts: The UniFi Protect fob configuration type.
 */
import type { ProtectDeviceBaseInterface, ProtectWirelessConnectionSettingsInterface, ProtectWirelessConnectionStateInterface } from "./base.ts";
import type { Nullable } from "./common.ts";

/**
 * The UniFi Protect fob configuration type: the LoRa handheld's device record, its away/arm state, its button-label profile, any pending arm action, and its LoRa link
 * state.
 *
 * @module ProtectTypesFob
 */

/**
 * A semi-complete description of the UniFi Protect fob JSON. A fob is a long-range (LoRa) handheld with security-action buttons; it carries the standard device record
 * (inherited from {@link ProtectDeviceBaseInterface}) plus its away/arm state, its button-label profile, any pending arm action, and its LoRa link state. It reports
 * `host: null` and omits `isConnected`, which the shared base widens for LoRa devices.
 */
export interface ProtectFobConfigInterface extends ProtectDeviceBaseInterface {

  awayState: string;
  buttonLabels: string;
  connectionType: string;
  modelKey: "fob";
  pendingActionExpiresAt: Nullable<number>;
  pendingActionType: Nullable<string>;
  wirelessConnectionSettings: ProtectWirelessConnectionSettingsInterface;
  wirelessConnectionState: ProtectWirelessConnectionStateInterface;
}

/** @see {@link ProtectFobConfigInterface} */
export type ProtectFobConfig = ProtectFobConfigInterface;
