/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * sensor.ts: The UniFi Protect sensor configuration types, including its capability-channel, air-quality, sensitivity, and smoke-status shapes.
 */
import type { Nullable, ProtectKnownJsonValue } from "./common.ts";
import type { ProtectAirQualityMetricInterface, ProtectAirQualityThresholdSettingsInterface, ProtectBridgeCandidate, ProtectLedSettingsInterface,
  ProtectThresholdSettingsInterface } from "./shapes.ts";
import type { ProtectDeviceBaseInterface, ProtectWirelessConnectionSettingsInterface, ProtectWirelessConnectionStateInterface } from "./base.ts";

/**
 * The UniFi Protect sensor configuration types: the sensor device record and the sensor-scoped shapes it composes - the per-capability channel (name-bound to the
 * sensor), the air-quality readings and settings, the shared sensitivity toggle, and the smoke/CO detector status.
 *
 * @module ProtectTypesSensor
 */

/**
 * A description of a single capability channel within a UniFi Protect sensor's feature flags. Each capability the controller advertises (motion, humidity, water leak,
 * and so on) is reported as an object whose channelCount states how many channels the capability exposes; the water-leak capability additionally carries channelNames.
 */
export interface ProtectSensorChannelInterface {

  channelCount: number;

  [key: string]: ProtectKnownJsonValue;
}

/**
 * A description of the UniFi Protect sensor air-quality readings JSON. Each member is a {@link ProtectAirQualityMetricInterface} reading for one measured quantity; a
 * sensor without a given capability reports that metric with a `null` value.
 */
export interface ProtectSensorAirQualityInterface {

  aqi: ProtectAirQualityMetricInterface;
  co2: ProtectAirQualityMetricInterface;
  humidity: ProtectAirQualityMetricInterface;
  nox: ProtectAirQualityMetricInterface;
  pm10p0: ProtectAirQualityMetricInterface;
  pm1p0: ProtectAirQualityMetricInterface;
  pm2p5: ProtectAirQualityMetricInterface;
  pm4p0: ProtectAirQualityMetricInterface;
  temperature: ProtectAirQualityMetricInterface;
  tvoc: ProtectAirQualityMetricInterface;
  vape: ProtectAirQualityMetricInterface;
  voc: ProtectAirQualityMetricInterface;

  [key: string]: ProtectKnownJsonValue;
}

/**
 * A description of the UniFi Protect sensor air-quality settings JSON: the per-metric alert thresholds (each a {@link ProtectAirQualityThresholdSettingsInterface}), the
 * reading and alert intervals, the ring-LED display, the night-mode schedule, and the vape sensitivity.
 */
export interface ProtectSensorAirQualitySettingsInterface {

  alertInterval: Nullable<number>;
  aqiSettings: ProtectAirQualityThresholdSettingsInterface;
  co2Settings: ProtectAirQualityThresholdSettingsInterface;
  humiditySettings: ProtectAirQualityThresholdSettingsInterface;
  nightModeBrightness: number;
  nightModeEnabled: boolean;
  nightModeEndTime: string;
  nightModeStartTime: string;
  noxSettings: ProtectAirQualityThresholdSettingsInterface;
  pm10p0Settings: ProtectAirQualityThresholdSettingsInterface;
  pm1p0Settings: ProtectAirQualityThresholdSettingsInterface;
  pm2p5Settings: ProtectAirQualityThresholdSettingsInterface;
  pm4p0Settings: ProtectAirQualityThresholdSettingsInterface;
  readingInterval: Nullable<number>;
  ringLedBrightness: number;
  ringLedMetric: number;
  temperatureSettings: ProtectAirQualityThresholdSettingsInterface;
  tvocSettings: ProtectAirQualityThresholdSettingsInterface;
  vapeSensitivitySettings: {

    isEnabled: boolean;
    sensitivity: number;
  };
  vapeSettings: ProtectAirQualityThresholdSettingsInterface;
  vocSettings: ProtectAirQualityThresholdSettingsInterface;

  [key: string]: ProtectKnownJsonValue;
}

/**
 * A description of a UniFi Protect sensor sensitivity toggle - the shared shape of the sensor's motion and glass-break settings: whether the capability is enabled, its
 * base sensitivity, and the sensitivity applied while the sensor is armed.
 */
export interface ProtectSensorSensitivitySettingsInterface {

  isEnabled: boolean;
  sensitivity: number;
  sensitivityWhenArmed: number;

  [key: string]: ProtectKnownJsonValue;
}

/**
 * A description of the UniFi Protect sensor smoke/CO detector status JSON, reported by a sensor with a smoke sensor and `null` on one without. It carries the alarm and
 * fault booleans plus the raw smoke, CO, and battery-voltage readings.
 */
export interface ProtectSensorSmokeStatusInterface {

  alarmSilenced: boolean;
  batteryLow: boolean;
  batteryVoltage: number;
  cleanSmokeSensor: boolean;
  coAlarm: boolean;
  coSensorFault: boolean;
  coValue: number;
  enabled: boolean;
  endOfLife: boolean;
  ready: boolean;
  smokeAlarm: boolean;
  smokeSensorFault: boolean;
  smokeValue: number;
  testing: boolean;
  troubleHushed: boolean;
  wasMounted: boolean;

  [key: string]: ProtectKnownJsonValue;
}

/**
 * A semi-complete description of the UniFi Protect sensor JSON.
 *
 * The `...At` members are last-occurrence timestamps: each records when its event last fired and is `Nullable`, reporting `null` for any event the sensor has never
 * observed - which includes every event its hardware capabilities do not support. The per-field notes on `motionDetectedAt` and `openStatusChangedAt` below illustrate
 * that one rule rather than enumerating every field it governs.
 */
export interface ProtectSensorConfigInterface extends ProtectDeviceBaseInterface {

  airQuality: ProtectSensorAirQualityInterface;
  airQualitySettings: ProtectSensorAirQualitySettingsInterface;
  alarmSettings: {

    isEnabled: boolean;
  };
  alarmSilencedAt: Nullable<number>;
  alarmTriggeredAt: Nullable<number>;
  // Inferred `string[]` element type from the field name; `null` on all current sensor models.
  armProfileIds: Nullable<string[]>;
  batteryStatus: {

    isLow: boolean;
    modelKey: string;
    percentage: Nullable<number>;
  };
  // A sensor that reaches the controller over Bluetooth carries this link telemetry; one without that link reports the whole object as `null` (the UP Air Quality
  // sensor does), which is why the member is nullable rather than the readings inside it.
  bluetoothConnectionState: Nullable<{

    modelKey: string;
    signalNoiseRatio: Nullable<number>;
    signalQuality: number;
    signalStrength: number;
  }>;
  // A natively-connected sensor has no LoRa bridge (the UP Air Quality is one), and the controller omits the member rather than reporting `null`, so it is optional.
  bridge?: string;
  bridgeCandidates: ProtectBridgeCandidate[];
  camera: Nullable<string>;
  canSilenceTrouble: boolean;
  chosenBridge: Nullable<string>;
  coAlarmTriggeredAt: Nullable<number>;
  connectionType: string;
  externalLeakDetectedAt: Nullable<number>;
  featureFlags: {

    acceleration?: ProtectSensorChannelInterface;
    alarmTypes?: string[];
    button?: ProtectSensorChannelInterface;
    glassBreak?: ProtectSensorChannelInterface;
    humidity?: ProtectSensorChannelInterface;
    // The controller reports an empty `featureFlags` object on the air-quality sensor, so no member of this block is guaranteed present.
    isBidirectional?: boolean;
    led?: ProtectSensorChannelInterface;
    light?: ProtectSensorChannelInterface;
    micSoundLevel?: ProtectSensorChannelInterface;
    motion?: ProtectSensorChannelInterface;
    open?: ProtectSensorChannelInterface;
    smoke?: ProtectSensorChannelInterface;
    tamper?: ProtectSensorChannelInterface;
    temperature?: ProtectSensorChannelInterface & { range: { max: number; min: number } };
    testMode?: ProtectSensorChannelInterface;
    testModeControl?: ProtectSensorChannelInterface;
    waterLeak?: ProtectSensorChannelInterface & { channelNames: string[] };
  };
  functionButtonPressedAt: Nullable<number>;
  glassBreakSettings: ProtectSensorSensitivitySettingsInterface;
  glassBreakTriggeredAt: Nullable<number>;
  hasCustomSensitivityWhenArmed: boolean;
  humiditySettings: ProtectThresholdSettingsInterface;
  // Unlike the relay - its closest LoRa-bridged sibling, which omits `isConnected` entirely - a bridge-paired sensor is always reported with a connection boolean, so it
  // re-narrows from the shared base's optional form back to its always-present shape here (the wireless and bridge fields below describe the LoRa link and do not
  // displace it). `host` takes no such re-narrowing: the controller reports it as `null` on a sensor it reaches only through a bridge, so the base's nullable form is
  // the honest one.
  isConnected: boolean;
  isMotionDetected: boolean;
  isOpened: Nullable<boolean>;
  isTestModeActive: boolean;
  leakDetectedAt: Nullable<number>;
  leakSettings: {

    isExternalEnabled: boolean;
    isInternalEnabled: boolean;
  };
  ledSettings: ProtectLedSettingsInterface & { activityFeedback: boolean };
  lightSettings: ProtectThresholdSettingsInterface;
  // Observed only as `null`; a sound level is a numeric reading, and only a sensor advertising the `micSoundLevel` capability channel populates it.
  micSoundLevel: Nullable<number>;
  modelKey: "sensor";
  // `Nullable` because a sensor without motion capability reports this as `null` rather than a timestamp; only motion-capable models populate it.
  motionDetectedAt: Nullable<number>;
  motionSettings: ProtectSensorSensitivitySettingsInterface;
  mountType: string;
  // `Nullable` because only an open/close-capable sensor populates it; other sensor models report `null`.
  openStatusChangedAt: Nullable<number>;
  scheduleMode: string;
  sensorWidget: {

    // Observed only as `null`; the plural names the set of metrics the widget shows, but nothing on the wire describes an entry.
    enabledMetrics: Nullable<ProtectKnownJsonValue[]>;
    isEnabled: boolean;
  };
  smokeAlarmTriggeredAt: Nullable<number>;
  smokeStatus: Nullable<ProtectSensorSmokeStatusInterface>;
  stats?: {

    humidity?: ProtectAirQualityMetricInterface;
    light?: ProtectAirQualityMetricInterface;
    temperature?: ProtectAirQualityMetricInterface;
  };
  tamperingDetectedAt: Nullable<number>;
  temperatureSettings: ProtectThresholdSettingsInterface;
  testModeExpiresAt: Nullable<number>;
  troubleSilencedAt: Nullable<number>;
  updateInterval: number;
  wirelessConnectionSettings: ProtectWirelessConnectionSettingsInterface;
  wirelessConnectionState: ProtectWirelessConnectionStateInterface;
}

/** @see {@link ProtectSensorChannelInterface} */
export type ProtectSensorChannel = ProtectSensorChannelInterface;

/** @see {@link ProtectSensorAirQualityInterface} */
export type ProtectSensorAirQuality = ProtectSensorAirQualityInterface;

/** @see {@link ProtectSensorAirQualitySettingsInterface} */
export type ProtectSensorAirQualitySettings = ProtectSensorAirQualitySettingsInterface;

/** @see {@link ProtectSensorSensitivitySettingsInterface} */
export type ProtectSensorSensitivitySettings = ProtectSensorSensitivitySettingsInterface;

/** @see {@link ProtectSensorSmokeStatusInterface} */
export type ProtectSensorSmokeStatus = ProtectSensorSmokeStatusInterface;

/** @see {@link ProtectSensorConfigInterface} */
export type ProtectSensorConfig = ProtectSensorConfigInterface;
