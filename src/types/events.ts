/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * events.ts: The UniFi Protect detection-event types - the smart-motion event record and its detection metadata shapes.
 */
import type { DeepPartial, ProtectKnownJsonValue } from "./common.ts";

/**
 * The UniFi Protect detection-event types: the smart-motion event record the controller broadcasts and the detection metadata (thumbnails and attributes) it carries.
 * These are the Protect detection events, distinct from the NVR system events modeled in `nvr.ts`.
 *
 * @module ProtectTypesEvents
 */

/**
 * A semi-complete description of the UniFi Protect smart motion detection event JSON.
 */
export interface ProtectEventAddInterface {

  camera?: string;
  cameraId: string;
  detectedAt: number;
  end: number;
  eventId: string;
  id: string;
  locked?: boolean;
  metadata?: ProtectEventMetadata;
  modelKey: "event";
  partition: string;
  score: number;
  smartDetectEvents: string[];
  smartDetectTypes?: string[];
  start: number;
  thumbnailId: string;
  type: string;
  user: string;

  [key: string]: ProtectKnownJsonValue;
}

/**
 * A semi-complete description of the UniFi Protect smart motion detection thumbnail metadata JSON.
 */
export interface ProtectEventMetadataDetectedThumbnailInterface {

  attributes: {

    color: {

      confidence: number;
      val: string;
    };
    faceMask: {

      confidence: number;
      val: string;
    };
    trackerId: string;
    vehicleType: {

      confidence: number;
      val: string;
    };
    zone: number[];
  };
  clockBestWall: number;
  confidence: number;
  // The detected object's bounding box within the thumbnail frame, reported by the controller as a fixed [x, y, width, height] tuple. Carried through verbatim - no code
  // in this library reads or transforms it - for a consumer that wants to draw or crop to the detection.
  coord: [ number, number, number, number ];
  croppedId: string;
  name: string;
  objectId: string;
  type: string;
}

/**
 * A description of metadata in UniFi Protect smart motion detect events.
 */
export interface ProtectEventMetadataInterface {

  accessEventId: string;
  action: string;
  detectedAreas: {

    areaIndexes: number[];
    smartDetectObject: string;
  }[];
  detectedThumbnails: ProtectEventMetadataDetectedThumbnail[];
  deviceId: {

    text: string;
  };
  direction: string;
  doorName: string;
  fingerprint: {

    ulpId: string;
  };
  firstName: string;
  hallwayMode: string;
  isLowBattery: boolean;
  isWireless: boolean;
  lastName: string;
  licensePlate: {

    confidenceLevel: number;
    name: string;
  };
  name: {

    text: string;
  };
  nfc: {

    nfcId: string;
    ulpId: string;
  };
  openMethod: string;
  openSuccess: boolean;
  reason: string;
  uniqueId: string;
  userType: string;
  zonesStatus: Record<string, { level: number; status: string }>;
}

/** @see {@link ProtectEventAddInterface} */
export type ProtectEventAdd = ProtectEventAddInterface;

/** @see {@link ProtectEventMetadataDetectedThumbnailInterface} */
export type ProtectEventMetadataDetectedThumbnail = DeepPartial<ProtectEventMetadataDetectedThumbnailInterface>;

/** @see {@link ProtectEventMetadataInterface} */
export type ProtectEventMetadata = DeepPartial<ProtectEventMetadataInterface>;
