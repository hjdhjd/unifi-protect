/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * viewer.ts: The UniFi Protect viewer configuration type.
 */
import type { Nullable } from "./common.ts";
import type { ProtectDeviceBaseInterface } from "./base.ts";

/**
 * The UniFi Protect viewer configuration type: the viewport device record, the liveview it displays, and its capability feature flags.
 *
 * @module ProtectTypesViewer
 */

/**
 * A semi-complete description of the UniFi Protect viewer JSON.
 */
export interface ProtectViewerConfigInterface extends ProtectDeviceBaseInterface {

  enableContinuousMonitoring: boolean;
  featureFlags: {

    supportAdjustBrightness: boolean;
    supportLiveview: boolean;
    supportLocate: boolean;
    supportManualDownloadSupportFile: boolean;
    supportManualFirmwareUpdate: boolean;
    supportMic: boolean;
    supportSsh: boolean;
  };
  host: string;
  isAccessDevice: boolean;
  isConnected: boolean;
  liveview: Nullable<string>;
  modelKey: "viewer";
  needUpdateBeforeAdoption: boolean;
  softwareVersion: Nullable<string>;
  streamLimit: number;
  supportUcp4: boolean;
}

/** @see {@link ProtectViewerConfigInterface} */
export type ProtectViewerConfig = ProtectViewerConfigInterface;
