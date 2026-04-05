/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * protect-types.ts: Type definitions for UniFi Protect.
 */

/**
 * A semi-complete description of all the object types used by the UniFi Protect API.
 *
 * The UniFi Protect API is largely undocumented - these interfaces and types have been gleaned through a lot of experimentation and observation. Protect is always
 * evolving and I will attempt to keep up with the changes over time.
 *
 * Each device has an **Interface** (the full definition with all properties) and a **Config** type alias (for reads). For PATCH/update payloads, consumers use
 * `DeepPartial<...Config>` directly. All device interfaces include `[key: string]: ProtectKnownJsonValue` index signatures so that untyped API fields are accessible
 * without casting. Common device properties are inherited from `ProtectDeviceBaseInterface`.
 *
 * @module ProtectTypes
 */
// The `as P extends string ? P : never` key filter excludes the string index signature from the DeepPartial mapping. Without it, DeepPartial would recurse into
// the ProtectKnownJsonValue index signature (`[key: string]: ProtectKnownJsonValue`), causing infinite type instantiation. This allows device interfaces to have both
// explicit properties and a `[key: string]` index signature while still being usable with DeepPartial for payload types.
/** @ignore */
export type DeepPartial<T> = {

  [P in keyof T as P extends string ? P : never]?: T[P] extends (infer I)[] ? DeepPartial<I>[] : DeepPartial<T[P]>
};

/** @ignore */
export type Nullable<T> = T | null;

// Recursive JSON value type representing any valid JSON-compatible value. Used as the index signature type on device interfaces so that untyped fields flowing through
// from the Protect API are accessible without casting.
/** @ignore */
export type ProtectKnownJsonValue = boolean | null | number | string | undefined | ProtectKnownJsonValue[] | { [key: string]: ProtectKnownJsonValue };

/**
 * A semi-complete description of the UniFi Protect NVR bootstrap JSON.
 *
 */
export interface ProtectNvrBootstrapInterface {

  accessKey: string;
  aiports: ProtectKnownJsonValue[];
  aiprocessors: ProtectKnownJsonValue[];
  authUserId: string;
  bridges: ProtectKnownJsonValue[];
  cameraGroups: ProtectKnownJsonValue[];
  cameras: ProtectCameraConfig[];
  chimes: ProtectChimeConfig[];
  deviceGroups: ProtectKnownJsonValue[];
  fobs: ProtectKnownJsonValue[];
  groups: ProtectKnownJsonValue[];
  hubs: ProtectKnownJsonValue[];
  lastUpdateId: string;
  lights: ProtectLightConfig[];
  linkstations: ProtectKnownJsonValue[];
  liveviews: ProtectNvrLiveviewConfig[];
  nvr: ProtectNvrConfig;
  readers: ProtectKnownJsonValue[];
  relays: ProtectKnownJsonValue[];
  ringtones: ProtectRingtoneConfigInterface[];
  sensors: ProtectSensorConfig[];
  sirens: ProtectKnownJsonValue[];
  speakers: ProtectKnownJsonValue[];
  users: ProtectNvrUserConfig[];
  viewers: ProtectViewerConfig[];

  [key: string]: ProtectKnownJsonValue;
}

/**
 * A semi-complete description of the UniFi Protect NVR configuration JSON.
 */
export interface ProtectNvrConfigInterface {

  analyticsData: string;
  anonymousDeviceId: string;
  cameraCapacity: {

    qualities: {

      count: number;
      fraction: number;
      type: string;
    }[];
    state: string;
  };
  cameraUtilization: number;
  canAutoUpdate: boolean;
  consoleEnv: string;
  corruptionState: string;
  countryCode: string;
  deviceFirmwareSettings: {

    configuredBy: string;
    isAutoUpdateEnabled: boolean;
    schedule: { hour: number };
  };
  disableAudio: boolean;
  disableAutoLink: boolean;
  doorbellSettings?: {

    allMessages: {

      text: string;
      type: string;
    }[];
    customImages: string[];
    customMessages: string[];
    defaultMessageResetTimeoutMs: number;
    defaultMessageText: string;
  };
  enableAutomaticBackups: boolean;
  enableBridgeAutoAdoption: boolean;
  enableCrashReporting: boolean;
  errorCode: Nullable<string>;
  featureFlags: {

    beta: boolean;
    detectionLabels: boolean;
    dev: boolean;
    hasTwoWayAudioMediaStreams: boolean;
    homekitPaired: boolean;
    notificationsV2: boolean;
    ulpRoleManagement: boolean;
  };
  firmwareVersion: string;
  hardwareId: string;
  hardwareRevision: string;
  hasGateway: boolean;
  host: string;
  hostShortname: string;
  hostType: number;
  hosts: string[];
  id: string;
  isAccessInstalled: boolean;
  isAiReportingEnabled: boolean;
  isAway: boolean;
  isInsightsEnabled: boolean;
  isNetworkInstalled: boolean;
  isPrimary: boolean;
  isProtectUpdatable: boolean;
  isRecordingDisabled: boolean;
  isRecordingMotionOnly: boolean;
  isRecycling: boolean;
  isRemoteAccessEnabled: boolean;
  isSetup: boolean;
  isSshEnabled: boolean;
  isStacked: boolean;
  isUCoreSetup: boolean;
  isUCoreStacked: boolean;
  isUcoreUpdatable: boolean;
  isUpdating: boolean;
  isWirelessUplinkEnabled: Nullable<boolean>;
  lastSeen: number;
  lastUpdateAt: Nullable<number>;
  locationSettings: {

    isAway: boolean;
    isGeofencingEnabled: boolean;
    latitude: number;
    longitude: number;
    radius: number;
  };
  mac: string;
  marketName: string;
  maxCameraCapacity: Record<string, number>;
  modelKey: "nvr";
  name?: string;
  ports: {

    aiFeatureConsole: number;
    cameraEvents: number;
    cameraHttps: number;
    devicesWss: number;
    discoveryClient: number;
    emsCLI: number;
    emsJsonCLI: number;
    emsLiveFLV: number;
    http: number;
    https: number;
    liveWs: number;
    liveWss: number;
    playback: number;
    rtmp: number;
    rtsp: number;
    rtsps: number;
    stacking: number;
    tcpBridge: number;
    tcpStreams: number;
    ucore: number;
    ump: number;
  };
  publicIp: string;
  recordingRetentionDurationMs: Nullable<string>;
  releaseChannel: string;
  skipFirmwareUpdate: boolean;
  smartDetectAgreement: {

    lastUpdateAt: Nullable<number>;
    status: string;
  };
  smartDetection: {

    enable: boolean;
    faceRecognition: boolean;
    licensePlateRecognition: boolean;
  };
  storageStats: {

    capacity: number;
    recordingSpace: {

      available: number;
      total: number;
      used: number;
    };
    remainingCapacity: number;
    storageDistribution: {

      recordingTypeDistributions: {

        percentage: number;
        recordingType: string;
        size: number;
      }[];

      resolutionDistributions: {

        percentage: number;
        recordingType: string;
        size: number;
      }[];
    };
    utilization: number;
  };
  streamSharingAvailable: boolean;
  systemInfo: ProtectNvrSystemInfoInterface;
  temperatureUnit: string;
  timeFormat: string;
  timezone: string;
  type: string;
  ucoreVersion: string;
  upSince: number;
  version: string;
  wanIp: string;

  [key: string]: ProtectKnownJsonValue;
}

/**
 * A semi-complete description of the UniFi Protect NVR system information configuration JSON.
 */
export interface ProtectNvrSystemInfoInterface {

  cpu: {

    averageLoad: number;
    temperature: number;
  };
  memory: {

    available: number;
    free: number;
    total: number;
  };
  storage: {

    available: number;
    devices: {

      healthy: boolean;
      model: string;
      size: number;
    }[];
    isRecycling: boolean;
    size: number;
    type: string;
    used: number;
  };
  tmpfs: {

    available: number;
    path: string;
    total: number;
    used: number;
  };

  [key: string]: ProtectKnownJsonValue;
}

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
 * A description of the UniFi Protect device wired connection state JSON.
 */
export interface ProtectWiredConnectionStateInterface {

  phyRate: number;

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
  host: string;
  id: string;
  isAdopted: boolean;
  isAdoptedByOther: boolean;
  isAdopting: boolean;
  isAttemptingToConnect: boolean;
  isBlockedByArmMode: boolean;
  isConnected: boolean;
  isDownloadingFW: boolean;
  isProvisioned: boolean;
  isRebooting: boolean;
  isRestoring: boolean;
  isSshEnabled: boolean;
  isUpdating: boolean;
  lastDisconnect: Nullable<number>;
  lastSeen: number;
  latestFirmwareSizeBytes: Nullable<number>;
  latestFirmwareVersion: string;
  mac: string;
  marketName: string;
  name?: string;
  nvrMac: string;
  state: string;
  supportFileCreatedAt: Nullable<number>;
  supportFileName: Nullable<string>;
  supportFileState: Nullable<string>;
  sysid: Nullable<string>;
  type: string;
  upSince: number;
  uplinkDevice: Nullable<string>;
  uptime: number;

  [key: string]: ProtectKnownJsonValue;
}

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
  apRssi: string;
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
  elementInfo: null;
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
  platform: string;
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
  rtspClient: Nullable<ProtectKnownJsonValue>;
  secondLensSmartDetectZones: ProtectKnownJsonValue[];
  shortcuts: ProtectKnownJsonValue[];
  skipCameraUpdateDecalListener: boolean;
  smartDetectLines: [];
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
    token: Nullable<string>;
    shareLink: Nullable<string>;
    expires: Nullable<number>;
    sharedByUserId: Nullable<string>;
    sharedByUser: Nullable<string>;
    maxStreams: Nullable<number>;
  };
  streamingChannels: ProtectKnownJsonValue[];
  supportAiPortResolution: boolean;
  supportAiPortResolutionInHallway: boolean;
  supportUcp4: boolean;
  supportedScalingResolutions: string[];
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
  wifiConnectionState: ProtectWifiConnectionStateInterface;
  wiredConnectionState: ProtectWiredConnectionStateInterface;
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
  isProbingForWifi: boolean;
  isWirelessUplinkEnabled: boolean;
  lastRing: number;
  modelKey: "chime";
  platform: string;
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
  wifiConnectionState: ProtectWifiConnectionStateInterface;
  wiredConnectionState: ProtectWiredConnectionStateInterface;
}

/**
 * A semi-complete description of the UniFi Protect light JSON.
 */
export interface ProtectLightConfigInterface extends ProtectDeviceBaseInterface {

  camera: Nullable<string>;
  isCameraPaired: boolean;
  isDark: boolean;
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

    isLedForceOn: boolean;
  };
  modelKey: "light";
  wiredConnectionState: ProtectWiredConnectionStateInterface;
}

/**
 * A semi-complete description of the UniFi Protect NVR liveview JSON.
 */
export interface ProtectNvrLiveviewConfigInterface {

  id: string;
  isDefault: boolean;
  isGlobal: boolean;
  layout: number;
  modelKey: "liveview";
  name: string;
  owner: string;
  slots: {

    cameras: string[];
    cycleInterval: number;
    cycleMode: string;
  } [];

  [key: string]: ProtectKnownJsonValue;
}

/**
 * A semi-complete description of the UniFi Protect NVR user JSON.
 */
export interface ProtectNvrUserConfigInterface {

  alertRules: ProtectKnownJsonValue[];
  allPermissions: string[];
  cloudAccount?: {

    cloudId: string;
    email: string;
    firstName: string;
    id: string;
    lastName: string;
    modelKey: string;
    name: string;
    profileImg: string;
    user: string;
  };
  email: string;
  enableNotifications: boolean;
  firstName: string;
  groups: string[];
  hasAcceptedInvite: boolean;
  id: string;
  isOwner: boolean;
  lastLoginIp: Nullable<string>;
  lastLoginTime: Nullable<number>;
  lastName: string;
  localUsername: string;
  location?: {

    isAway: boolean;
    latitude: Nullable<number>;
    longitude: Nullable<number>;
  };
  modelKey: "user";
  name: string;
  permissions: string[];

  [key: string]: ProtectKnownJsonValue;
}

/**
 * A semi-complete description of the UniFi Protect system events JSON.
 */
export interface ProtectNvrSystemEventInterface {

  apps: {

    apps: unknown[];
    controllers: ProtectNvrSystemEventController[];
  };
  system: unknown;
  type: string;
}

/**
 * A semi-complete description of the UniFi Protect system events controller JSON.
 */
export interface ProtectNvrSystemEventControllerInterface {

  harddriveRequired: boolean;
  info: {

    events: number[];
    isAdopted: boolean;
    isConnectedToCloud: boolean;
    isSetup: boolean;
    lastMotion: number;
    lastMotionCamera: string;
    lastMotionCameraAddress: string;
    lastMotionCameraModel: string;
    managedCameras: number;
    offlineCameras: number;
    oldestRecording: number;
    onlineCameras: number;
    recordingSpaceTotal: number;
    recordingSpaceUsed: number;
    retentionTime: number;
    startedAt: number;
    throughput: number;
    timeFormat: string;
    updateAvailable: boolean;
    updateVersion: string;
  };
  installState: string;
  isConfigured: boolean;
  isInstalled: boolean;
  isRunning: boolean;
  name: string;
  port: number;
  required: boolean;
  state: string;
  status: string;
  statusMessage: string;
  swaiVersion: number;
  type: string;
  ui: {

    apiPrefix: string;
    baseUrl: string;
    cdnPublicPaths: string[];
    entrypoint: string;
    hotkey: string;
    icon: string;
    publicPath: string;
    swaiVersion: number;
  };
  uiNpmPackageName: string;
  uiVersion: string;
  unadoptedDevices: unknown[];
  updateAvailable: string;
  version: string;
}

/**
 * A semi-complete description of the UniFi Protect ringtone JSON.
 */
export interface ProtectRingtoneConfigInterface {

  id: string;
  isDefault: boolean;
  modelKey: "ringtone";
  name: string;
  nvrMac: string;
  size: number;

  [key: string]: ProtectKnownJsonValue;
}

/**
 * A semi-complete description of the UniFi Protect sensor JSON.
 */
export interface ProtectSensorConfigInterface extends ProtectDeviceBaseInterface {

  alarmSettings: {

    isEnabled: boolean;
  };
  alarmTriggeredAt: Nullable<number>;
  batteryStatus: {

    isLow: boolean;
    percentage: Nullable<number>;
  };
  bluetoothConnectionState: {

    signalQuality: number;
    signalStrength: number;
  };
  bridge: string;
  bridgeCandidates: [];
  camera: string;
  connectionType: string;
  humiditySettings: ProtectThresholdSettingsInterface;
  isMotionDetected: boolean;
  isOpened: Nullable<boolean>;
  leakDetectedAt: Nullable<number>;
  leakSettings: {

    isExternalEnabled: boolean;
    isInternalEnabled: boolean;
  };
  ledSettings: {

    isEnabled: boolean;
  };
  lightSettings: ProtectThresholdSettingsInterface;
  modelKey: "sensor";
  motionDetectedAt: number;
  motionSettings: {

    isEnabled: boolean;
    sensitivity: number;
  };
  mountType: string;
  openStatusChangedAt: number;
  stats?: {

    humidity?: ProtectAirQualityMetricInterface;
    light?: ProtectAirQualityMetricInterface;
    temperature?: ProtectAirQualityMetricInterface;
  };
  tamperingDetectedAt: Nullable<number>;
  temperatureSettings: ProtectThresholdSettingsInterface;
  wifiConnectionState: ProtectWifiConnectionStateInterface;
  wiredConnectionState: ProtectWiredConnectionStateInterface;
}

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
  isAccessDevice: boolean;
  liveview: Nullable<string>;
  modelKey: "viewer";
  needUpdateBeforeAdoption: boolean;
  softwareVersion: Nullable<string>;
  streamLimit: number;
  supportUcp4: boolean;
  wifiConnectionState: ProtectWifiConnectionStateInterface;
  wiredConnectionState: ProtectWiredConnectionStateInterface;
}

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
  locked: boolean;
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

// Type aliases ordered to match the interface declaration order above.

/** @see {@link ProtectNvrBootstrapInterface} */
export type ProtectNvrBootstrap = ProtectNvrBootstrapInterface;

/** @see {@link ProtectNvrConfigInterface} */
export type ProtectNvrConfig = ProtectNvrConfigInterface;

/** @see {@link ProtectNvrSystemInfoInterface} */
export type ProtectNvrSystemInfo = ProtectNvrSystemInfoInterface;

/** @see {@link ProtectWifiConnectionStateInterface} */
export type ProtectWifiConnectionState = ProtectWifiConnectionStateInterface;

/** @see {@link ProtectWiredConnectionStateInterface} */
export type ProtectWiredConnectionState = ProtectWiredConnectionStateInterface;

/** @see {@link ProtectDeviceBaseInterface} */
export type ProtectDeviceBase = ProtectDeviceBaseInterface;

/** @see {@link ProtectSmartZoneInterface} */
export type ProtectSmartZone = ProtectSmartZoneInterface;

/** @see {@link ProtectPtzAxisRangeInterface} */
export type ProtectPtzAxisRange = ProtectPtzAxisRangeInterface;

/** @see {@link ProtectAirQualityMetricInterface} */
export type ProtectAirQualityMetric = ProtectAirQualityMetricInterface;

/** @see {@link ProtectAirQualityThresholdSettingsInterface} */
export type ProtectAirQualityThresholdSettings = ProtectAirQualityThresholdSettingsInterface;

/** @see {@link ProtectThresholdSettingsInterface} */
export type ProtectThresholdSettings = ProtectThresholdSettingsInterface;

/** @see {@link ProtectCameraConfigInterface} */
export type ProtectCameraConfig = ProtectCameraConfigInterface;

/** @see {@link ProtectCameraChannelConfigInterface} */
export type ProtectCameraChannelConfig = ProtectCameraChannelConfigInterface;

/** @see {@link ProtectCameraLcdMessageConfigInterface} */
export type ProtectCameraLcdMessageConfig = ProtectCameraLcdMessageConfigInterface;

/** @see {@link ProtectCameraTalkbackConfigInterface} */
export type ProtectCameraTalkbackConfig = ProtectCameraTalkbackConfigInterface;

/** @see {@link ProtectChimeConfigInterface} */
export type ProtectChimeConfig = ProtectChimeConfigInterface;

/** @see {@link ProtectLightConfigInterface} */
export type ProtectLightConfig = ProtectLightConfigInterface;

/** @see {@link ProtectNvrLiveviewConfigInterface} */
export type ProtectNvrLiveviewConfig = ProtectNvrLiveviewConfigInterface;

/** @see {@link ProtectNvrUserConfigInterface} */
export type ProtectNvrUserConfig = ProtectNvrUserConfigInterface;

/** @see {@link ProtectNvrSystemEventInterface} */
export type ProtectNvrSystemEvent = ProtectNvrSystemEventInterface;

/** @see {@link ProtectNvrSystemEventControllerInterface} */
export type ProtectNvrSystemEventController = ProtectNvrSystemEventControllerInterface;

/** @see {@link ProtectRingtoneConfigInterface} */
export type ProtectRingtoneConfig = ProtectRingtoneConfigInterface;

/** @see {@link ProtectSensorConfigInterface} */
export type ProtectSensorConfig = ProtectSensorConfigInterface;

/** @see {@link ProtectViewerConfigInterface} */
export type ProtectViewerConfig = ProtectViewerConfigInterface;

/** @see {@link ProtectEventAddInterface} */
export type ProtectEventAdd = ProtectEventAddInterface;

/** @see {@link ProtectEventMetadataDetectedThumbnailInterface} */
export type ProtectEventMetadataDetectedThumbnail = DeepPartial<ProtectEventMetadataDetectedThumbnailInterface>;

/** @see {@link ProtectEventMetadataInterface} */
export type ProtectEventMetadata = DeepPartial<ProtectEventMetadataInterface>;
