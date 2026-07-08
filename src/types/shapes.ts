/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * shapes.ts: Reusable, device-neutral value-shapes that a device or NVR config composes.
 */
import type { Nullable, ProtectKnownJsonValue } from "./common.ts";

/**
 * This tier holds reusable, device-neutral value-shapes that a device or NVR config composes. A shape belongs here only if its concept is not definitionally tied to one
 * device's mechanism (a zone, a threshold, a metric reading, a bridge candidate qualify; a PTZ axis range does not - PTZ is a camera mechanism). Anything borderline
 * co-locates with its consumer instead, to keep this tier from accreting into a grab-bag.
 *
 * @module ProtectTypesShapes
 */

/**
 * The common properties shared by all UniFi Protect smart detection and motion zone objects.
 */
export interface ProtectSmartZoneInterface {

  color: string;
  id: number;
  isTriggerLightEnabled: boolean;
  mergeId: Nullable<string>;
  name: string;
  points: [number, number][];
  sensitivity: number;

  [key: string]: ProtectKnownJsonValue;
}

/**
 * A description of a single air quality metric reading from a UniFi Protect sensor.
 */
export interface ProtectAirQualityMetricInterface {

  status: string;
  value: Nullable<number>;

  [key: string]: ProtectKnownJsonValue;
}

/**
 * A description of threshold settings for a single air quality metric on a UniFi Protect sensor.
 */
export interface ProtectAirQualityThresholdSettingsInterface {

  highThreshold: Nullable<number>;
  isEnabled: boolean;
  lowThreshold: Nullable<number>;

  [key: string]: ProtectKnownJsonValue;
}

/**
 * A description of threshold settings for environmental metrics (humidity, light, temperature) on a UniFi Protect sensor.
 */
export interface ProtectThresholdSettingsInterface {

  highThreshold: number;
  isEnabled: boolean;
  lowThreshold: number;
  margin: number;

  [key: string]: ProtectKnownJsonValue;
}

/**
 * A bridge candidate entry observed by a sensor. The Protect controller advertises every reachable bridge a sensor can hear, with signal-quality telemetry per
 * candidate, so the radio-management layer can pick the best uplink. Modeled as a typed shape rather than `ProtectKnownJsonValue[]` because the field is genuinely
 * structured...consumers reading `sensor.bridgeCandidates[0].signalQuality` get full type-checking instead of having to narrow an opaque blob at every call site.
 */
export interface ProtectBridgeCandidate {

  id: string;
  lastSeen: number;
  modelKey: "bridgeCandidate";
  signalQuality: number;

  [key: string]: ProtectKnownJsonValue;
}

/** @see {@link ProtectSmartZoneInterface} */
export type ProtectSmartZone = ProtectSmartZoneInterface;

/** @see {@link ProtectAirQualityMetricInterface} */
export type ProtectAirQualityMetric = ProtectAirQualityMetricInterface;

/** @see {@link ProtectAirQualityThresholdSettingsInterface} */
export type ProtectAirQualityThresholdSettings = ProtectAirQualityThresholdSettingsInterface;

/** @see {@link ProtectThresholdSettingsInterface} */
export type ProtectThresholdSettings = ProtectThresholdSettingsInterface;
