/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * chime.ts: The UniFi Protect chime configuration type.
 */
import type { Nullable } from "./common.ts";
import type { ProtectDeviceBaseInterface } from "./base.ts";

/**
 * The UniFi Protect chime configuration type: the chime device record, its per-camera ring settings, and the ringtone tracks it stores.
 *
 * @module ProtectTypesChime
 */

/**
 * A semi-complete description of the UniFi Protect chime JSON.
 */
export interface ProtectChimeConfigInterface extends ProtectDeviceBaseInterface {

  apMac: string;
  apMgmtIp: string;
  apRssi: Nullable<string>;
  cameraIds: string[];
  elementInfo: Nullable<string>;
  featureFlags: {

    hasHttpsClientOTA: boolean;
    hasWifi: boolean;
    supportCustomRingtone: boolean;
  };
  hasWifi: boolean;
  host: string;
  isConnected: boolean;
  isProbingForWifi: boolean;
  isWirelessUplinkEnabled: boolean;
  lastRing: number;
  modelKey: "chime";
  repeatTimes: number;
  ringSettings: {

    cameraId: string;
    repeatTimes: number;
    ringtoneId: string;
    volume: number;
  }[];
  speakerTrackList: {

    md5: string;
    name: string;
    size: number;
    state: string;
    track_no: number;
    volume: number;
  }[];
  userConfiguredAp: boolean;
  volume: number;
}

/** @see {@link ProtectChimeConfigInterface} */
export type ProtectChimeConfig = ProtectChimeConfigInterface;
