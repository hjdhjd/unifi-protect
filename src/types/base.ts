/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * base.ts: The device foundation shared by every UniFi Protect device, and the connection-state shapes describing how devices link to the controller.
 */
import type { Nullable, ProtectKnownJsonValue } from "./common.ts";

/**
 * The device foundation and the connection-state shapes: the common properties every Protect device inherits, plus the wired, Wi-Fi, and LoRa (wireless) link
 * telemetry and settings a device carries.
 *
 * @module ProtectTypesBase
 */

/**
 * A description of the UniFi Protect device WiFi connection state JSON.
 */
export interface ProtectWifiConnectionStateInterface {

  apName: Nullable<string>;
  bssid: Nullable<string>;
  channel: Nullable<number>;
  connectivity: Nullable<string>;
  experience: Nullable<number>;
  frequency: Nullable<number>;
  phyRate: Nullable<number>;
  signalQuality: Nullable<number>;
  signalStrength: Nullable<number>;
  ssid: Nullable<string>;
  txRate: Nullable<number>;

  [key: string]: ProtectKnownJsonValue;
}

/**
 * A description of the UniFi Protect device wired connection state JSON. `phyRate` is nullable because a device with no wired link reports it as `null` (the relay, a
 * LoRa device, carries `wiredConnectionState: { phyRate: null }`); a genuinely wired device reports the negotiated rate as a number.
 */
export interface ProtectWiredConnectionStateInterface {

  phyRate: Nullable<number>;

  [key: string]: ProtectKnownJsonValue;
}

/**
 * A description of the UniFi Protect device wireless (LoRa) connection state JSON. Carried by long-range radio devices such as the relay: the live link telemetry - the
 * battery status, the bridge it is paired with and the bridges it can hear, the last function-button press time, and the radio signal state (SNR plus signal quality and
 * strength). The candidates are modeled inline rather than as {@link ProtectBridgeCandidate} because the relay's entries omit that type's required `modelKey`.
 */
export interface ProtectWirelessConnectionStateInterface {

  batteryStatus: {

    isLow: boolean;
    percentage: Nullable<number>;
  };
  bridge: Nullable<string>;
  bridgeCandidates: { id: string; lastSeen: number; signalQuality: number }[];
  functionButtonPressedAt: Nullable<number>;
  signalState: {

    signalNoiseRatio: number;
    signalQuality: number;
    signalStrength: number;
  };

  [key: string]: ProtectKnownJsonValue;
}

/**
 * A description of the UniFi Protect device wireless (LoRa) connection settings JSON, carried by long-range radio devices such as the relay, sensors, and the fob: the
 * paired bridge, the LoRa spreading factor and the spreading factors the device supports, and the telemetry update interval.
 */
export interface ProtectWirelessConnectionSettingsInterface {

  chosenBridge: Nullable<string>;
  loraSpreadingFactor: Nullable<number>;
  supportedLoraSpreadingFactors: number[];
  updateInterval: Nullable<number>;

  [key: string]: ProtectKnownJsonValue;
}

/**
 * The common properties shared by all UniFi Protect device configuration objects.
 */
export interface ProtectDeviceBaseInterface {

  anonymousDeviceId: Nullable<string>;
  canAdopt: boolean;
  connectedSince: number;
  connectionHost: Nullable<string>;
  displayName: string;
  firmwareBuild: string;
  firmwareVersion: Nullable<string>;
  fwUpdateState: Nullable<string>;
  globalAlarmManagerScopeNames: string[];
  guid: Nullable<string>;
  hardwareRevision: Nullable<string>;
  // `host` and `isConnected` are widened on the shared base so a device class without an IP host or a connection boolean can honestly extend it: the relay (a LoRa
  // device) reports `host: null` and omits `isConnected` entirely. The always-wired device classes re-narrow both back to their non-null, always-present forms, so they
  // keep full precision while the base stays honest about the looser members.
  host: Nullable<string>;
  id: string;
  isAdopted: boolean;
  isAdoptedByOther: boolean;
  isAdopting: boolean;
  isAttemptingToConnect: boolean;
  isBlockedByArmMode: boolean;
  // Optional on the base, re-narrowed to required on the wired device classes. See the note on `host` above.
  isConnected?: boolean;
  isDownloadingFW: boolean;
  isProvisioned: boolean;
  isRebooting: boolean;
  isRestoring: boolean;
  isReverting: boolean;
  isSshEnabled: boolean;
  isUpdating: boolean;
  lastDisconnect: Nullable<number>;
  lastSeen: number;
  latestFirmwareSizeBytes: Nullable<number>;
  latestFirmwareVersion: string;
  mac: string;
  marketName: string;
  minFirmwareVersion: string;
  name?: string;
  nvrMac: string;
  // `platform` is the SoC identifier, optional because a LoRa device does not report it and `Nullable` because some cameras report it as `null`. The
  // `previousFirmware*` fields describe the prior firmware image and are `null` on a device still on its factory firmware.
  platform?: Nullable<string>;
  previousFirmwareUrl: Nullable<string>;
  previousFirmwareVersion: Nullable<string>;
  releaseNotePath: Nullable<string>;
  state: string;
  supportFileCreatedAt: Nullable<number>;
  supportFileName: Nullable<string>;
  supportFileState: Nullable<string>;
  sysid: Nullable<string>;
  type: string;
  upSince: number;
  uplinkDevice: Nullable<string>;
  uptime: number;
  // Every device reports both connection states: a genuinely wired device carries a negotiated `wiredConnectionState.phyRate` and an all-null `wifiConnectionState`,
  // while a Wi-Fi or LoRa device reports the inverse, so both are always present even when one is entirely null.
  wifiConnectionState: ProtectWifiConnectionStateInterface;
  wiredConnectionState: ProtectWiredConnectionStateInterface;

  [key: string]: ProtectKnownJsonValue;
}

/** @see {@link ProtectWifiConnectionStateInterface} */
export type ProtectWifiConnectionState = ProtectWifiConnectionStateInterface;

/** @see {@link ProtectWiredConnectionStateInterface} */
export type ProtectWiredConnectionState = ProtectWiredConnectionStateInterface;

/** @see {@link ProtectWirelessConnectionStateInterface} */
export type ProtectWirelessConnectionState = ProtectWirelessConnectionStateInterface;

/** @see {@link ProtectWirelessConnectionSettingsInterface} */
export type ProtectWirelessConnectionSettings = ProtectWirelessConnectionSettingsInterface;

/** @see {@link ProtectDeviceBaseInterface} */
export type ProtectDeviceBase = ProtectDeviceBaseInterface;
