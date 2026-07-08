/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * camera.ts: The UniFi Protect camera configuration types, including the camera-specific PTZ axis range and channel, LCD-message, recording-path, and talkback shapes.
 */
import type { DeepPartial, Nullable, ProtectKnownJsonValue } from "./common.ts";
import type { ProtectDeviceBaseInterface } from "./base.ts";
import type { ProtectSmartZoneInterface } from "./shapes.ts";

/**
 * The UniFi Protect camera configuration types: the camera record itself and the camera-scoped value-shapes it composes - the PTZ axis range (a camera mechanism), the
 * per-channel stream config, the LCD message, the recording-path settings, and the talkback settings.
 *
 * @module ProtectTypesCamera
 */

/**
 * A description of a PTZ axis range for UniFi Protect camera feature flags.
 */
export interface ProtectPtzAxisRangeInterface {

  degrees: {

    max: Nullable<number>;
    min: Nullable<number>;
    step: Nullable<number>;
  };
  steps: {

    max: Nullable<number>;
    min: Nullable<number>;
    step: Nullable<number>;
  };

  [key: string]: ProtectKnownJsonValue;
}

/**
 * A semi-complete description of the UniFi Protect camera JSON.
 */
export interface ProtectCameraConfigInterface extends ProtectDeviceBaseInterface {

  accessDeviceMetadata?: {

    channels: {

      bitrate: number;
      fps: number;
      fpsValues: number[];
      height: number;
      id: number;
      localStreamName: string;
      quality: string;
      width: number;
    }[];

    connectedSince: number;
    disableRecordingByDefault: boolean;
    doorInfo: {

      canLock: boolean;
      lockState: string;
    };
    featureFlags: {

      supportLivestream: boolean;
      supportMicManagement: boolean;
      supportUnlock: boolean;
    };
    ledSettings: {

      isEnabled: boolean;
    };
    micVolume: number;
    pairedInfo: {

      guid: Nullable<string>;
      name: string;
      uri: string;
    };
    speakerSettings: {

      areSystemSoundsEnabled: boolean;
    };

    // The Access integration's talkback channels (an array under accessDeviceMetadata), distinct from the camera's own single top-level `talkbackSettings` object below.
    talkbackSettings: ProtectCameraTalkbackConfigInterface[];
  };
  accessMethodSettings: {

    methods: string[];
  };
  activePatrolSlot: Nullable<string>;
  aiPortCapacityPoints: number;
  aiPortCompatibleResolutions: string[];
  aiPortCompatibleResolutionsInHallway: string[];
  alarms: {

    autoTrackingThermalThresholdReached: boolean;
    lensThermal: number;
    lensThermalThresholdReached: boolean;
    motorOverheated: boolean;
    panTiltMotorFaults: string[];
    tiltThermal: number;
  };
  apMac: string;
  apMgmtIp: Nullable<string>;
  apRssi: Nullable<string>;
  audioBitrate: number;
  audioSettings: {

    style: string[];
  };
  autoRetentionLqMs: Nullable<number>;
  autoRetentionMs: Nullable<number>;
  brightnessSettings: {

    autoBrightness: boolean;
    brightness: number;
  };
  canCreateAccessEvent: boolean;
  canManage: boolean;
  channels: ProtectCameraChannelConfigInterface[];
  chimeDuration: number;
  clarityZones: ProtectKnownJsonValue[];
  currentResolution: string;
  doorbellSession: {

    sessionId: Nullable<string>;
    status: Nullable<string>;
  };
  downScaleMode: number;
  elementInfo: Nullable<string>;
  enableNfc: boolean;
  excludeZones: ProtectKnownJsonValue[];
  extendedAiFeatures: {

    smartDetectTypes: string[];
  };
  faceUnlockSettings: {

    faceDetectionSensitive: string;
    lastUpdateTime: number;
    licenseConfigured: boolean;
  };
  featureFlags: {

    audio: string[];
    audioCodecs: string[];
    audioStyle: string[];
    canAdjustIrLedLevel: boolean;
    canAdjustIspSettings: boolean;
    canAdjustSpeakerVolume: boolean;
    canMagicZoom: boolean;
    canOpticalZoom: boolean;
    canTouchFocus: boolean;
    clarityZones: Nullable<{

      maxZones: number;
      rectangleOnly: boolean;
    }>;
    downScaleResolutions: number[][];
    excludeZones: {

      maxZones: number;
      rectangleOnly: boolean;
    };
    flashRange: Nullable<number>;
    focus: ProtectPtzAxisRangeInterface;
    hallwayModeWarningRequired: boolean;
    hasAccelerometer: boolean;
    hasAec: boolean;
    hasAutoICROnly: boolean;
    hasBluetooth: boolean;
    hasChime: boolean;
    hasColorLcdScreen: boolean;
    hasEdgeRecording: boolean;
    hasExternalIr: boolean;
    hasFingerprintSensor: boolean;
    hasFisheye: boolean;
    hasFlash: boolean;
    hasHallwayMode: boolean;
    hasHallwayModeHdrOnRequired: boolean;
    hasHdr: boolean;
    hasHorizontalFlip: boolean;
    hasIcrSensitivity: boolean;
    hasInfrared: boolean;
    hasLcdScreen: boolean;
    hasLdc: boolean;
    hasLedIr: boolean;
    hasLedStatus: boolean;
    hasLineCrossing: boolean;
    hasLineCrossingCounting: boolean;
    hasLineIn: boolean;
    hasLiveviewTracking: boolean;
    hasLprReflex: boolean;
    hasLuxCheck: boolean;
    hasManualPersonOfInterest: boolean;
    hasMic: boolean;
    hasMotionZones: boolean;
    hasOptimizeIr: boolean;
    hasPackageCamera: boolean;
    hasPackageZoneSupportForPrimaryLens: boolean;
    hasPackageZoneSupportForSecondaryLens: boolean;
    hasPrivacyMask: boolean;
    hasRtc: boolean;
    hasSdCard: boolean;
    hasSmartDetect: boolean;
    hasSmartZoom: boolean;
    hasSmokeCover: boolean;
    hasSpeaker: boolean;
    hasSquareEventThumbnail: boolean;
    hasTamperDetection: boolean;
    hasVerticalFlip: boolean;
    hasWdr: boolean;
    hasWifi: boolean;
    hotplug: {

      audio: Nullable<string>;
      extender: {

        flashRange: Nullable<number>;
        hasFlash: boolean;
        hasIR: boolean;
        hasRadar: boolean;
        isAttached: boolean;
        radarRangeMax: Nullable<number>;
        radarRangeMin: Nullable<number>;
      };
      sdCardAttached: boolean;
      standaloneAdoption: boolean;
      video: Nullable<string>;
    };
    isDoorbell: boolean;
    isPtz: boolean;
    lensModel: Nullable<string>;
    lensType: Nullable<string>;
    maxScaleDownLevel: number;
    motionAlgorithms: string[];
    mountPositions: string[];
    pan: ProtectPtzAxisRangeInterface;
    presetMinDuration: Nullable<number>;
    presetTour: boolean;
    privacyMaskCapability: {
      maxMasks: number;
      rectangleOnly: boolean;
    };
    reader: {

      canAdjustBrightness: boolean;
      support2fa: boolean;
      supportAccessMethods: string[];
      supportAdjustSpeakerVolume: boolean;
      supportAudioCodecs: string[];
      supportAutoBrightness: boolean;
      supportAutoTurnOffDisplay: boolean;
      supportCallerManager: boolean;
      supportDoorDirection: boolean;
      supportDoorbellTriggerMethod: boolean;
      supportFloodLed: boolean;
      supportGateStop: boolean;
      supportGreetings: boolean;
      supportInterfaceDesigner: boolean;
      supportInterfaceDirectory: boolean;
      supportInterfaceLayout: boolean;
      supportLocate: boolean;
      supportManualDownloadSupportFile: boolean;
      supportManualFirmwareUpdate: boolean;
      supportMic: boolean;
      supportShowHeading: boolean;
      supportShowInterfaceImage: boolean;
      supportShowStatusBar: boolean;
      supportShowUnlockSchedule: boolean;
      supportSpeaker: boolean;
      supportSsh: boolean;
      supportStatusLed: boolean;
      supportStreamEncryption: boolean;
      supportTwilioSip: boolean;
      supportWelcomeLed: boolean;
    };
    smartDetectAudioTypes: string[];
    smartDetectTypes: string[];
    stitchDistance: {

      support: boolean;
    };
    storage: {

      sdSlotCount: number;
      ssdSlotCount: number;
    };
    streamEncryptable: boolean;
    supportCustomRingtone: boolean;
    supportDoorAccessConfig: boolean;
    supportFullHdSnapshot: boolean;
    supportLocate: boolean;
    supportLpDetectionWithoutVehicle: boolean;
    supportMinMotionAdaptiveBitrate: boolean;
    supportNfc: boolean;
    supportPtzTrackingTimeout: boolean;
    tilt: ProtectPtzAxisRangeInterface;
    verticalFlipWarning: boolean;
    videoCodecs: string[];
    videoDeviceCount: Nullable<number>;
    videoInputModes: string[];
    videoModeMaxFps: number[];
    videoModes: string[];
    zoom: ProtectPtzAxisRangeInterface & { ratio: number };
  };
  fingerprintSettings: {

    enable: boolean;
    enablePrintLatency: boolean;
    mode: string;
    reportCaptureComplete: boolean;
    reportFingerTouch: boolean;
  };
  fingerprintState: {

    fingerprintId: string;
    free: number;
    progress: string;
    status: string;
    total: number;
  };
  greetingSettings: {

    greetingBroadcastName: string;
    greetingText: string;
  };
  hallwayMode: string;
  hasPackageCamera: boolean;
  hasRecordingStarted: boolean;
  hasRecordings: boolean;
  hasSpeaker: boolean;
  hasWifi: boolean;
  hdrMode: boolean;
  hdrType: string;
  homekitAccessoryId: Nullable<string>;
  homekitSettings: {

    doorbellMuted: Nullable<boolean>;
    microphoneMuted: boolean;
    recordingActive: boolean;
    speakerMuted: boolean;
    streamInProgress: boolean;
    talkbackSettingsActive: boolean;
  };
  host: string;
  hqBytesPerDay: number;
  hubMac: string;
  interfaceSettings: {

    bgImageId: Nullable<string>;
    callMethod: string;
    heading: Nullable<string>;
    layout: string;
    logoImageId: Nullable<string>;
    showLogo: boolean;
    showTime: boolean;
    showWeather: boolean;
    subHeading: Nullable<string>;
  };
  is2K: boolean;
  is4K: boolean;
  isAccessDevice: boolean;
  isAccessFloodlightTriggerEnabled: boolean;
  isAdoptedByAccessApp: boolean;
  isConnected: boolean;
  isDark: boolean;
  isDeleting: boolean;
  isExtenderInstalledEver: boolean;
  isIntercom: boolean;
  isLiveHeatmapEnabled: boolean;
  isManaged: boolean;
  isMicEnabled: boolean;
  isMissingRecordingDetected: boolean;
  isMotionDetected: boolean;
  isPairedWithAiPort: boolean;
  isPoorNetwork: boolean;
  isProbingForWifi: boolean;
  isReaderPro: boolean;
  isRecording: boolean;
  isRecordingsPaused: boolean;
  isRecordingsPausedChangedAt: Nullable<number>;
  isSmartDetected: boolean;
  isThirdPartyCamera: boolean;
  isWaterproofCaseAttached: boolean;
  isWirelessUplinkEnabled: boolean;
  ispSettings: {

    aeMode: string;
    brightness: number;
    contrast: number;
    dZoomCenterX: number;
    dZoomCenterY: number;
    dZoomScale: number;
    dZoomStreamId: number;
    denoise: number;
    focusMode: string;
    focusPosition: number;
    hdrMode: string;
    hue: number;
    icrCustomValue: number;
    icrSensitivity: number;
    icrSwitchMode: string;
    irLedLevel: number;
    irLedMode: string;
    is3dnrEnabled: boolean;
    isAggressiveAntiFlickerEnabled: boolean;
    isAutoRotateEnabled: boolean;
    isColorNightVisionEnabled: boolean;
    isExternalIrEnabled: boolean;
    isFlippedHorizontal: boolean;
    isFlippedVertical: boolean;
    isLdcEnabled: boolean;
    isPauseMotionEnabled: boolean;
    isSmokeCoverModeEnabled: boolean;
    mountPosition: string;
    saturation: number;
    sceneMode: string;
    sharpness: number;
    spotlightDuration: number;
    touchFocusX: number;
    touchFocusY: number;
    wdr: number;
    zoomPosition: number;
  };
  lastMotion: number;
  lastRing: Nullable<number>;
  lcdMessage?: DeepPartial<ProtectCameraLcdMessageConfigInterface>;
  ledSettings: {

    floodLed: boolean;
    isEnabled: boolean;
    welcomeLed: boolean;
  };
  lenses: {

    id: number;
    video: {
      recordingEnd: Nullable<number>;
      recordingEndLQ: Nullable<number>;
      recordingStart: Nullable<number>;
      recordingStartLQ: Nullable<number>;
      timelapseEnd: Nullable<number>;
      timelapseEndLQ: Nullable<number>;
      timelapseStart: Nullable<number>;
      timelapseStartLQ: Nullable<number>;
    };
  }[];
  // Inferred `string[]` element type from the field name; `null` on all current cameras.
  lowMemoryDisabledProcesses: Nullable<string[]>;
  lqBytesPerDay: number;
  micVolume: number;
  modelKey: "camera";
  motionZones: ProtectSmartZoneInterface[];
  needUpdateBeforeAdoption: boolean;
  nfcSettings: {

    enableNfc: boolean;
    supportThirdPartyCard: boolean;
  };
  nfcState: {

    cardId: string;
    isUACard: boolean;
    lastSeen: number;
    mode: string;
  };
  optimizeIrSettings: {

    irZones: ProtectKnownJsonValue[];
    mode: string;
  };
  osdSettings: {

    isDateEnabled: boolean;
    isDebugEnabled: boolean;
    isLogoEnabled: boolean;
    isNameEnabled: boolean;
    overlayLocation: string;
  };
  parentCameraGroupId: Nullable<string>;
  phyRate: number;
  pinCodeSettings: {

    pinCodeLengthRange: string;
    pinCodeShuffle: boolean;
  };
  privacyZones: ProtectKnownJsonValue[];
  ptz: {

    pauseAutoTrackingUntilTs: Nullable<number>;
    recentAutoHomeReturnAt: Nullable<number>;
    recentMoveAutoTrackResumeAtTs: Nullable<number>;
    returnHomeAfterInactivityMs: Nullable<number>;
  };
  ptzControlEnabled: boolean;
  readerSettings: {

    allowThirdPartyNfcCards: boolean;
    doorEntryMethod: string;
    doorId: Nullable<string>;
    doorName: Nullable<string>;
    language: string;
    screenOffTimeout: string;
    unlockDuration: number;
  };
  receiverGroups: ProtectKnownJsonValue[];
  recordingPath: Nullable<string>;
  recordingPathFailedAt: Nullable<number>;
  recordingPathSettings: ProtectCameraRecordingPathSettingsInterface;
  recordingSchedulesV2: ProtectKnownJsonValue[];
  recordingSettings: {

    accessEventPostPaddingSecs: number;
    accessEventPrePaddingSecs: number;
    createAccessEvent: boolean;
    enableMotionDetection: boolean;
    endMotionEventDelay: number;
    geofencing: string;
    inScheduleMode: string;
    minMotionEventTrigger: number;
    mode: string;
    motionAlgorithm: string;
    outScheduleMode: string;
    postPaddingSecs: number;
    prePaddingSecs: number;
    recordAudio: boolean;
    recordVideo: boolean;
    retentionDurationLQMs: Nullable<number>;
    retentionDurationMs: Nullable<number>;
    smartDetectPostPaddingSecs: number;
    smartDetectPrePaddingSecs: number;
    suppressIlluminationSurge: boolean;
    useNewMotionAlgorithm: boolean;
  };
  recordingsPausedReason: Nullable<string>;
  rtspClient: Nullable<ProtectKnownJsonValue>;
  secondLensSmartDetectZones: ProtectKnownJsonValue[];
  shortcuts: ProtectKnownJsonValue[];
  skipCameraUpdateDecalListener: boolean;
  smartDetectLines: ProtectKnownJsonValue[];
  smartDetectLoiterZones: (ProtectSmartZoneInterface & { loiterTriggers: { loiterTriggerTime: number; objectType: string }[]; triggerAccessTypes: string[] })[];
  smartDetectSettings: {

    audioTypes: string[];
    autoTrackingObjectTypes: string[];
    autoTrackingTimeoutSec: number;
    autoTrackingWithZoom: boolean;
    detectionRange: { max: Nullable<number>; min: Nullable<number> };
    enableTamperDetection: boolean;
    objectTypes: string[];
  };
  smartDetectZones: (ProtectSmartZoneInterface & { objectTypes: string[] })[];
  speakerSettings: {

    areSystemSoundsEnabled: boolean;
    isEnabled: boolean;
    repeatTimes: number;
    ringtoneId: Nullable<string>;
    ringVolume: number;
    speakerVolume: number;
    volume: number;
  };
  stats: {

    edgeRecording: {

      deviceMac: Nullable<string>;
      recordMode: string;
      recordStreamNumber: Nullable<number>;
    };
    sdCard: {

      health: Nullable<string>;
      healthStatus: string;
      hotPlugCapable: Nullable<boolean>;
      mounts: ProtectKnownJsonValue[];
      sdRecordingSupported: Nullable<boolean>;
      serial: Nullable<string>;
      size: Nullable<number>;
      slotId: string;
      slotIdx: Nullable<number>;
      state: string;
      type: Nullable<string>;
      usedSize: number;
    };
    sdCardStorageCapacityMs: Nullable<number>;
    storage: {

      rate: number;
      used: number;
    };
    storageSlots: ProtectKnownJsonValue[];
    totalStorageCapacityMs: Nullable<number>;
    video: {

      recordingEnd: number;
      recordingEndLQ: number;
      recordingStart: number;
      recordingStartLQ: number;
      timelapseEnd: number;
      timelapseEndLQ: number;
      timelapseStart: number;
      timelapseStartLQ: number;
    };
    wifi: {

      channel: Nullable<number>;
      frequency: Nullable<number>;
      linkSpeedMbps: Nullable<number>;
      signalQuality: number;
      signalStrength: number;
    };
    wifiQuality: number;
    wifiStrength: number;
  };
  stitchDistance: Nullable<number>;
  stopStreamLevel: Nullable<number>;
  streamSharing: {

    enabled: boolean;
    expires: Nullable<number>;
    maxStreams: Nullable<number>;
    shareLink: Nullable<string>;
    sharedByUser: Nullable<string>;
    sharedByUserId: Nullable<string>;
    token: Nullable<string>;
  };
  streamingChannels: ProtectKnownJsonValue[];
  supportAiPortResolution: boolean;
  supportAiPortResolutionInHallway: boolean;
  supportUcp4: boolean;
  supportedScalingResolutions: string[];
  // The camera's own talkback settings (a single object), distinct from the Access-integration talkback channel array nested under `accessDeviceMetadata` above.
  talkbackSettings: ProtectCameraTalkbackConfigInterface;
  template: Nullable<ProtectKnownJsonValue>;
  thirdPartyCameraInfo: {

    enableRtspAudio: Nullable<boolean>;
    errors: ProtectKnownJsonValue[];
    forceTcp: Nullable<boolean>;
    hasAudio: Nullable<boolean>;
    port: number;
    rtspUrl: string;
    rtspUrlLQ: string;
    snapshotUrl: string;
  };
  tiltLimitsOfPrivacyZones: {

    limit: number;
    side: string;
  };
  userConfiguredAp: boolean;
  videoCodec: string;
  videoCodecLastSwitchAt: Nullable<number>;
  videoCodecState: number;
  videoCodecSwitchingSince: number;
  videoInputMode: Nullable<string>;
  videoMode: string;
  videoReconfigurationInProgress: boolean;
  voltage: number;
}

/**
 * A semi-complete description of the UniFi Protect camera channel JSON.
 */
export interface ProtectCameraChannelConfigInterface {

  autoBitrate: boolean;
  autoFps: boolean;
  bitrate: number;
  enabled: boolean;
  fps: number;
  fpsValues: number[];
  height: number;
  id: number;
  idrInterval: number;
  internalRtspAlias: Nullable<string>;
  isInternalRtspEnabled: boolean;
  isRtspEnabled: boolean;
  maxBitrate: number;
  minBitrate: number;
  minClientAdaptiveBitRate: number;
  minMotionAdaptiveBitRate: number;
  name: string;
  rtspAlias: string;
  validBitrateRangeMargin: Nullable<number>;
  videoId: string;
  width: number;

  [key: string]: ProtectKnownJsonValue;
}

/**
 * A semi-complete description of the UniFi Protect LCD message JSON.
 */
export interface ProtectCameraLcdMessageConfigInterface {

  duration: number;
  resetAt: Nullable<number>;
  text: string;
  type: string;

  [key: string]: ProtectKnownJsonValue;
}

/**
 * A description of the UniFi Protect camera recording-path settings JSON: the storage console the camera records to, whether it automatically fails over to another, and
 * the failover timeout.
 */
export interface ProtectCameraRecordingPathSettingsInterface {

  failoverTimeoutMs: Nullable<number>;
  isAutoFailoverEnabled: boolean;
  storageConsoleIndex: number;

  [key: string]: ProtectKnownJsonValue;
}

/**
 * A semi-complete description of the UniFi Protect talkback settings JSON.
 */
export interface ProtectCameraTalkbackConfigInterface {

  bindAddr: string;
  bindPort: number;
  bitsPerSample: number;
  channels: number;
  filterAddr: string;
  filterPort: number;
  quality: number;
  samplingRate: number;
  typeFmt: string;
  typeIn: string;
  url: string;

  [key: string]: ProtectKnownJsonValue;
}

/** @see {@link ProtectPtzAxisRangeInterface} */
export type ProtectPtzAxisRange = ProtectPtzAxisRangeInterface;

/** @see {@link ProtectCameraConfigInterface} */
export type ProtectCameraConfig = ProtectCameraConfigInterface;

/** @see {@link ProtectCameraChannelConfigInterface} */
export type ProtectCameraChannelConfig = ProtectCameraChannelConfigInterface;

/** @see {@link ProtectCameraLcdMessageConfigInterface} */
export type ProtectCameraLcdMessageConfig = ProtectCameraLcdMessageConfigInterface;

/** @see {@link ProtectCameraRecordingPathSettingsInterface} */
export type ProtectCameraRecordingPathSettings = ProtectCameraRecordingPathSettingsInterface;

/** @see {@link ProtectCameraTalkbackConfigInterface} */
export type ProtectCameraTalkbackConfig = ProtectCameraTalkbackConfigInterface;
