/* Copyright(C) 2019-2024, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * protect-types.ts: Type definitions for UniFi Protect.
 */

/**
 * A semi-complete description of all the object types used by the UniFi Protect API.
 *
 * The UniFi Protect API is largely undocumented - these interfaces and types have been gleaned through a lot of experimentation and observation. Protect is always
 * evolving and U will attempt to keep up with the changes over time.
 *
 * We use types instead of interfaces because we have a need to provide two versions of each interface: one that represents the interface and one that is recursively
 * partial, for patching the configuration objects and receiving event updates related to them.
 *
 * - We append **Config** to the primary version of a device configuration object.
 * - We append **Payload** to the version of a device configuration object that can have partial components of the object in it, used for patching or updates.
 *
 * @module ProtectTypes
 */
import { DeepPartial } from "homebridge-plugin-utils";

/**
 * An semi-complete description of the UniFi Protect NVR bootstrap JSON.
 *
 */
export interface ProtectNvrBootstrapInterface {

  accessKey: string,
  authUserId: string,
  bridges: unknown[],
  cameras: ProtectCameraConfig[],
  chimes: ProtectChimeConfig[],
  cloudPortalUrl: string,
  groups: unknown[],
  lastUpdateId: string,
  lights: ProtectLightConfig[],
  liveviews: ProtectNvrLiveviewConfig[],
  nvr: ProtectNvrConfig,
  ringtones: ProtectRingtoneConfigInterface[],
  sensors: ProtectSensorConfig[],
  users: ProtectNvrUserConfig[],
  viewers: ProtectViewerConfig[],
  [key: string]: ProtectCameraConfig[] | ProtectChimeConfig[] | ProtectLightConfig[] | ProtectNvrConfig | ProtectNvrLiveviewConfig[] | ProtectNvrUserConfig[] |
    ProtectSensorConfig[] | ProtectViewerConfig[] | string | unknown[]
}

/**
 * A semi-complete description of the UniFi Protect NVR configuration JSON.
 */
export interface ProtectNvrConfigInterface {

  analyticsData: string,
  anonymouseDeviceId: string,
  availableUpdate: string,
  avgMotions: number[],
  cameraUtilization: number,
  canAutoUpdate: boolean,
  consoleEnv: string,
  corruptionState: string,
  countryCode: string,
  deviceFirmwareSettings: {

    configuredBy: string,
    isAutoUpdateEnabled: boolean,
    schedule: { hour: number }
  },
  disableAudio: boolean,
  disableAutoLink: boolean,
  doorbellSettings: {

    allMessages: {

      text: string,
      type: string
    }[],
    customImages: string[],
    customMessages: string[],
    defaultMessageResetTimeoutMs: number,
    defaultMessageText: string
  },
  enableAutomaticBackups: boolean,
  enableBridgeAutoAdoption: boolean,
  enableCrashReporting: boolean,
  enableStatsReporting: boolean,
  errorCode: string | null,
  featureFlags: {

    beta: boolean,
    detectionLabels: boolean,
    dev: boolean,
    hasTwoWayAudioMediaStreams: boolean,
    homekitPaired: boolean,
    notificationsV2: boolean,
    ulpRoleManagement: boolean
  },
  firmwareVersion: string,
  hardwareId: string,
  hardwarePlatform: string,
  hardwareRevision: string,
  hasGateway: boolean,
  host: string,
  hostShortname: string,
  hostType: string,
  hosts: string[],
  id: string,
  isAway: boolean,
  isHardware: boolean,
  isInsightsEnabled: boolean,
  isNetworkInstalled: boolean,
  isPrimary: boolean,
  isProtectUpdatable: boolean,
  isRecordingDisabled: boolean,
  isRecordingMotionOnly: boolean,
  isRecycling: boolean,
  isSetup: boolean,
  isSshEnabled: boolean,
  isStacked: boolean,
  isStation: boolean,
  isStatsGatheringEnabled: boolean,
  isUCoreSetup: boolean,
  isUCoreStacked: boolean,
  isUcoreUpdatable: boolean,
  isUpdating: boolean,
  isWirelessUplinkEnabled: boolean,
  lastSeen: number,
  lastUpdateAt: number | null,
  locationSettings: {

    isAway: boolean,
    isGeofencingEnabled: boolean,
    latitude: number,
    longitude: number,
    radius: number
  },
  mac: string,
  marketName: string,
  maxCameraCapacity: Record<string, number>,
  modelKey: string,
  name: string,
  network: string,
  ports: {

    aiFeatureConsole: number,
    cameraEvents: number,
    cameraHttps: number,
    cameraTcp: number,
    devicesWss: number,
    discoveryClient: number,
    emsCLI: number,
    emsJsonCLI: number,
    emsLiveFLV: number,
    http: number,
    https: number,
    liveWs: number,
    liveWss: number,
    piongw: number,
    playback: number,
    rtmp: number,
    rtsp: number,
    rtsps: number,
    stacking: number,
    tcpBridge: number,
    tcpStreams: number,
    ucore: number,
    ump: number
  },
  publicIp: string,
  recordingRetentionDurationMs: string,
  releaseChannel: string,
  skipFirmwareUpdate: boolean,
  smartDetectAgreement: {

    lastUpdateAt: number | null,
    status: string
  },
  smartDetection: {

    enable: boolean,
    faceRecognition: boolean,
    licensePlateRecognition: boolean
  },
  ssoChannel: string | null,
  storageStats: {

    capacity: number,
    recordingSpace: {

      available: number,
      total: number,
      used: number
    },
    remainingCapacity: number,
    storageDistribution: {

      recordingTypeDistributions: {

        percentage: number,
        recordingType: string,
        size: number
      }[],

      resolutionDistributions: {

        percentage: number,
        recordingType: string,
        size: number
      }[]
    }
    utilization: number
  },
  streamSharingAvailable: boolean,
  systemInfo: ProtectNvrSystemInfoInterface,
  temperatureUnit: string,
  timeFormat: string,
  timezone: string,
  type: string,
  ucoreVersion: string,
  uiVersion: string,
  upSince: number,
  uptime: number,
  version: string,
  wanIp: string,
  wifiSettings: {

    password: string | null,
    ssid: string | null,
    useThirdPartyWifi: boolean
  }
}

/**
 * A semi-complete description of the UniFi Protect NVR system information configuration JSON.
 */
export interface ProtectNvrSystemInfoInterface {

  cpu: {

    averageLoad: number,
    temperature: number
  },
  memory: {

    available: number,
    free: number,
    total: number
  },
  storage: {

    available: number,
    devices: {

      healthy: boolean,
      model: string,
      size: number
    }[],
    isRecycling: boolean,
    size: number,
    type: string,
    used: number
  },
  tmpfs: {

    available: number,
    path: string,
    total: number,
    used: number
  }
}

/**
 * A semi-complete description of the UniFi Protect camera JSON.
 */
export interface ProtectCameraConfigInterface {

  apMac: string,
  apRssi: string,
  audioBitrate: number,
  canManage: boolean,
  channels: ProtectCameraChannelConfigInterface[],
  chimeDuration: number,
  connectedSince: number,
  connectionHost: string,
  currentResolution: string,
  displayName: string,
  elementInfo: null,
  enableNfc: boolean,
  featureFlags: {

    audio: string[],
    audioCodecs: string[],
    audioStyle: string[],
    canAdjustIrLedLevel: boolean,
    canMagicZoom: boolean,
    canOpticalZoom: boolean,
    canTouchFocus: boolean,
    hasAccelerometer: boolean,
    hasAec: boolean,
    hasAutoICROnly: boolean,
    hasBattery: boolean,
    hasBluetooth: boolean,
    hasChime: boolean,
    hasColorLcdScreen: boolean,
    hasExternalIr: boolean,
    hasFingerprintSensor: boolean,
    hasFlash: boolean,
    hasHdr: boolean,
    hasIcrSensitivity: boolean,
    hasInfrared: boolean,
    hasLcdScreen: boolean,
    hasLdc: boolean,
    hasLedIr: boolean,
    hasLedStatus: boolean,
    hasLineCrossing: boolean,
    hasLineCrossingCounting: boolean,
    hasLineIn: boolean,
    hasLiveviewTracking: boolean,
    hasLuxCheck: boolean,
    hasMic: boolean,
    hasMotionZones: boolean,
    hasNewMotionAlgorithm: boolean,
    hasPackageCamera: boolean,
    hasPrivacyMask: boolean,
    hasRtc: boolean,
    hasSdCard: boolean,
    hasSmartDetect: boolean,
    hasSpeaker: boolean,
    hasSquareEventThumbnail: boolean,
    hasVerticalFlip: boolean,
    hasWifi: boolean,
    isDoorbell: boolean,
    isPtz: boolean,
    maxScaleDownLevel: number,
    motionAlgorithms: string[],
    privacyMaskCapability: {
      maxMasks: number,
      rectangleOnly: boolean
    },
    smartDetectAudioTypes: string[],
    smartDetectTypes: string[],
    supportDoorAccessConfig: boolean,
    supportLpDetectionWithoutVehicle: boolean,
    supportNfc: boolean,
    videoCodecs: string[],
    videoModeMaxFps: number[],
    videoModes: string[]
  },
  fingerprintSettings: {

    enable: boolean,
    enablePrintLatency: boolean,
    mode: string,
    reportCaptureComplete: boolean,
    reportFingerTouch: boolean
  },
  fingerprintState: {

    fingerprintId: string,
    free: number,
    progress: string,
    status: string,
    total: number
  },
  firmwareBuild: string,
  firmwareVersion: string,
  fwUpdateState: string,
  guid: string,
  hardwareRevision: string,
  hasRecordings: boolean,
  hasSpeaker: boolean,
  hasWifi: boolean,
  hdrMode: boolean,
  homekitSettings: {

    microphoneMuted: boolean,
    speakerMuted: boolean,
    streamInProgress: boolean,
    talkbackSettingsActive: boolean
  },
  host: string,
  hubMac: string,
  id: string,
  is2K: boolean,
  is4K: boolean,
  isAdopted: boolean,
  isAdoptedByOther: boolean,
  isAdopting: boolean,
  isAttemptingToConnect: boolean,
  isConnected: boolean,
  isDark: boolean,
  isDeleting: boolean,
  isDownloadingFW: boolean,
  isExtenderInstalledEver: boolean,
  isHidden: boolean,
  isLiveHeatmapEnabled: boolean,
  isManaged: boolean,
  isMicEnabled: boolean,
  isMissingRecordingDetected: boolean,
  isMotionDetected: boolean,
  isPairedWithAiPort: boolean,
  isPoorNetwork: boolean,
  isProbingForWifi: boolean,
  isProvisioned: boolean,
  isRebooting: boolean,
  isRecording: boolean,
  isRestoring: boolean,
  isSmartDetected: boolean,
  isSshEnabled: boolean,
  isThirdPartyCamera: boolean,
  isUpdating: boolean,
  isWaterproofCaseAttached: boolean,
  isWirelessUplinkEnabled: boolean,
  ispSettings: {

    aeMode: string,
    brightness: number,
    contrast: number,
    dZoomCenterX: number,
    dZoomCenterY: number,
    dZoomScale: number,
    dZoomStreamId: number,
    denoise: number,
    focusMode: string,
    focusPosition: number,
    hue: number,
    icrCustomValue: number,
    icrSensitivity: number,
    irLedLevel: number,
    irLedMode: string,
    is3dnrEnabled: boolean,
    isAggressiveAntiFlickerEnabled: boolean,
    isAutoRotateEnabled: boolean,
    isExternalIrEnabled: boolean,
    isFlippedHorizontal: boolean,
    isFlippedVertical: boolean,
    isLdcEnabled: boolean,
    isPauseMotionEnabled: boolean,
    saturation: number,
    sharpness: number,
    touchFocusX: number,
    touchFocusY: number,
    wdr: number,
    zoomPosition: number
  },
  lastMotion: number,
  lastRing: number | null,
  lastSeen: number,
  latestFirmwareVersion: string,
  lcdMessage: ProtectCameraLcdMessageConfigInterface,
  ledSettings: {

    blinkRate: number,
    isEnabled: boolean
  },
  lenses: {

    id: number,
    video: {
      recordingEnd: number | null,
      recordingEndLQ: number | null,
      recordingStart: number | null,
      recordingStartLQ: number | null,
      timelapseEnd: number | null,
      timelapseEndLQ: number | null,
      timelapseStart: number | null,
      timelapseStartLQ: number | null
    }
  }[],
  mac: string,
  marketName: string,
  micVolume: number,
  modelKey: string
  name: string,
  nfcSettings: {

    enableNfc: boolean,
    supportThirdPartyCard: boolean
  },
  nfcState: {

    cardId: string,
    isUACard: boolean,
    lastSeen: number,
    mode: string
  },
  nvrMac: string,
  osdSettings: {

    isDateEnabled: boolean,
    isDebugEnabled: boolean,
    isLogoEnabled: boolean,
    isNameEnabled: boolean
  },
  phyRate: number,
  pirSettings: {

    pirMotionClipLength: number,
    pirSensitivity: number,
    timelapseFrameInterval: number,
    timelapseTransferInterval: number
  },
  platform: string,
  recordingSchedule: null,
  recordingSettings: {

    enablePirTimelapse: boolean,
    endMotionEventDelay: number,
    geofencing: string,
    minMotionEventTrigger: number,
    mode: string,
    postPaddingSecs: number,
    prePaddingSecs: number,
    retentionDurationMs: number | null,
    suppressIlluminationSurge: boolean,
    useNewMotionAlgorithm: boolean
  },
  smartDetectLines: [],
  smartDetectSettings: {

    audioTypes: string[],
    autoTrackingObjectTypes: string[],
    detectionRange: [max: number, min: number],
    objectTypes: string[]
  },
  smartDetectZones: {

    color: string,
    name: string,
    objectTypes: string[],
    points: [number, number][],
    sensitivity: number
  }[],
  speakerSettings: {

    areSystemSoundsEnabled: boolean,
    isEnabled: boolean,
    volume: number
  },
  state: string,
  stats: {

    battery: {

      isCharging: boolean,
      percentage: number | null,
      sleepState: string
    },
    rxBytes: number,
    storage: {

      rate: number,
      used: number
    },
    txBytes: number,
    video: {

      recordingEnd: number,
      recordingEndLQ: number,
      recordingStart: number,
      recordingStartLQ: number,
      timelapseEnd: number,
      timelapseEndLQ: number,
      timelapseStart: number,
      timelapseStartLQ: number
    },
    wifi: {

      channel: number | null,
      frequency: number | null,
      linkSpeedMbps: number | null,
      signalQuality: number,
      signalStrength: number
    },
    wifiQuality: number,
    wifiStrength: number
  },
  supportedScalingResolutions: string[],
  talkbackSettings: {

    bindAddr: string,
    bindPort: number,
    bitsPerSample: number,
    channels: number,
    filterAddr: string,
    filterPort: number,
    typeFmt: string,
    typeIn: string,
    quality: number,
    samplingRate: number
  },
  thirdPartyCameraInfo: {

    port: number,
    rtspUrl: string,
    rtspUrlLQ: string,
    snapshotUrl: string
  },
  tiltLimitsOfPrivacyZones: {

    limit: number,
    side: string
  },
  type: string,
  upSince: number,
  uptime: number,
  useGlobal: boolean,
  videoCodec: string,
  videoCodecState: number,
  videoCodecSwitchingSince: number,
  videoMode: string,
  videoReconfigurationInProgress: boolean,
  voltage: number,
  wifiConnectionState: {

    channel: number,
    frequency: number,
    phyRate: number,
    signalQuality: number,
    signalStrength: number
  },
  wiredConnectionState: {

    phyRate: number
  }
}

/**
 * A semi-complete description of the UniFi Protect camera channel JSON.
 */
export interface ProtectCameraChannelConfigInterface {

  bitrate: number,
  enabled: boolean,
  fps: number,
  fpsValues: number[],
  height: number,
  id: number,
  idrInterval: number,
  isRtspEnabled: boolean,
  maxBitrate: number,
  minBitrate: number,
  minClientAdaptiveBitRate: number,
  minMotionAdaptiveBitRate: number,
  name: string,
  rtspAlias: string,
  videoId: string,
  width: number
}

/**
 * A semi-complete description of the UniFi Protect LCD message JSON.
 */
export interface ProtectCameraLcdMessageConfigInterface {

  duration: number,
  resetAt: number | null,
  text: string,
  type: string
}

/**
 * A semi-complete description of the UniFi Protect chime JSON.
 */
export interface ProtectChimeConfigInterface {

  apMac: string,
  apMgmtIp: string,
  apRssi: string,
  cameraIds: string[],
  canAdopt: boolean,
  connectedSince: number,
  connectionHost: string,
  elementInfo: string,
  featureFlags: {

    hasHttpsClientOTA: boolean,
    hasWifi: boolean,
    supportCustomRingtone: boolean
  },
  firmwareBuild: string,
  firmwareVersion: string,
  fwUpdateState: string,
  hardwareRevision: string,
  host: string,
  id: string,
  isAdopted: boolean,
  isAdoptedByOther: boolean,
  isAdopting: boolean,
  isAttemptingToConnect: boolean,
  isConnected: boolean,
  isDownloadingFW: boolean,
  isProbingForWifi: boolean,
  isProvisioned: boolean,
  isRebooting: boolean,
  isSshEnabled: boolean,
  isUpdating: boolean,
  isWirelessUplinkEnabled: boolean,
  lastRing: number,
  lastSeen: number,
  latestFirmwareVersion: string,
  mac: string,
  marketName: string,
  modelKey: string,
  name: string,
  nvrMac: string,
  platform: string,
  repeatTimes: number,
  ringSettings: {

    cameraId: string,
    repeatTimes: number,
    ringtoneId: string,
    volume: number
  }[],
  speakerTrackList: {

    md5: string,
    name: string,
    size: number,
    state: string,
    track_no: number,
    volume: number
  }[],
  state: string,
  sysId: string,
  type: string,
  upSince: number,
  uptime: number,
  userConfiguredAp: boolean,
  volume: number,
  wifiConnectionState: {

    apName: string | null,
    bssid: string | null,
    channel: string | null,
    connectivity: string,
    experience: null,
    frequency: null,
    phyRate: number,
    signalQuality: number,
    signalStrength: number,
    ssid: string | null,
    txRate: null
  },
  wiredConnectionState: {

    phyRate: number
  }
}

/**
 * A semi-complete description of the UniFi Protect light JSON.
 */
export interface ProtectLightConfigInterface {

  camera: string,
  canAdopt: boolean,
  connectedSince: number,
  connectionHost: string,
  firmwareBuild: string,
  firmwareVersion: string,
  hardwareRevision: string,
  host: string,
  id: string,
  isAdopted: boolean,
  isAdoptedByOther: boolean,
  isAdopting: boolean,
  isAttemptingToConnect: boolean,
  isCameraPaired: boolean,
  isConnected: boolean,
  isDark: boolean,
  isLightOn: boolean,
  isLocating: boolean,
  isPirMotionDetected: boolean,
  isProvisioned: boolean,
  isRebooting: boolean,
  isSshEnabled: boolean,
  isUpdating: boolean,
  lastMotion: number,
  lastSeen: number,
  latestFirmwareVersion: string,
  lightDeviceSettings: {

    isIndicatorEnabled: boolean,
    ledLevel: number,
    luxSensitivity: string,
    pirDuration: number,
    pirSensitivity: number
  },
  lightModeSettings: {

    enableAt: string,
    mode: string
  },
  lightOnSettings: {

    isLedForceOn: boolean
  },
  mac: string,
  marketName: string,
  modelKey: string,
  name: string,
  nvrMac: string,
  state: string,
  type: string,
  upSince: number,
  uptime: number,
  wiredConnectionState: {

    phyRate: number
  }
}

/**
 * A semi-complete description of the UniFi Protect NVR liveview JSON.
 */
export interface ProtectNvrLiveviewConfigInterface {

  id: string,
  isDefault: boolean,
  isGlobal: boolean,
  layout: number,
  modelKey: string,
  name: string,
  owner: string,
  slots: {

    cameras: string[],
    cycleInterval: number,
    cycleMode: string
  } []
}

/**
 * A semi-complete description of the UniFi Protect NVR user JSON.
 */
export interface ProtectNvrUserConfigInterface {

  alertRules: unknown[],
  allPermissions: string[],
  cloudAccount: {
    firstName: string
    lastName: string
    email: string
    profileImg: string
    user: string
    id: string
    cloudId: string
    name: string
    modelKey: string
  },
  email: string,
  enableNotifications: boolean,
  firstName: string,
  groups: string[],
  hasAcceptedInvite: boolean,
  id: string,
  isOwner: boolean,
  lastLoginIp: string,
  lastLoginTime: number,
  lastName: string,
  localUsername: string,
  location: {

    isAway: boolean,
    latitude: string,
    longitude: string
  },
  modelKey: string,
  name: string,
  permissions: string[],
  role: string,
  settings: {

    flags: string[]
  },
  syncSso: boolean
}

/**
 * A semi-complete description of the UniFi Protect system events JSON.
 */
export interface ProtectNvrSystemEventInterface {

  apps: {

    apps: unknown[],
    controllers: ProtectNvrSystemEventController[]
  },
  system: unknown,
  type: string
}

/**
 * A semi-complete description of the UniFi Protect system events controller JSON.
 */
export interface ProtectNvrSystemEventControllerInterface {

  harddriveRequired: boolean,
  info: {

    events: number[],
    isAdopted: boolean,
    isConnectedToCloud: boolean,
    isSetup: boolean,
    lastMotion: number,
    lastMotionCamera: string,
    lastMotionCameraAddress: string,
    lastMotionCameraModel: string,
    managedCameras: number,
    offlineCameras: number,
    oldestRecording: number,
    onlineCameras: number,
    recordingSpaceTotal: number,
    recordingSpaceUsed: number,
    retentionTime: number,
    startedAt: number,
    throughput: number,
    timeFormat: string,
    updateAvailable: boolean,
    updateVersion: string
  },
  installState: string,
  isConfigured: boolean,
  isInstalled: boolean,
  isRunning: boolean,
  name: string,
  port: number,
  required: boolean,
  state: string,
  status: string,
  statusMessage: string,
  swaiVersion: number,
  type: string,
  ui: {

    apiPrefix: string,
    baseUrl: string,
    cdnPublicPaths: string[],
    entrypoint: string,
    hotkey: string,
    icon: string,
    publicPath: string,
    swaiVersion: number
  },
  uiNpmPackageName: string,
  uiVersion: string,
  unadoptedDevices: unknown[],
  updateAvailable: string,
  version: string
}

/**
 * A semi-complete description of the UniFi Protect ringtone JSON.
 */
export interface ProtectRingtoneConfigInterface {

  id: string,
  isDefault: boolean,
  modelKey: string,
  name: string,
  nvrMac: string,
  size: number
}

/**
 * A semi-complete description of the UniFi Protect sensor JSON.
 */
export interface ProtectSensorConfigInterface {

  alarmSettings: {

    isEnabled: boolean
  },
  alarmTriggeredAt: number | null,
  batteryStatus: {

    isLow: boolean,
    percentage: number
  },
  bluetoothConnectionState: {

    signalQuality: number,
    signalStrength: number
  },
  bridge: string,
  bridgeCandidates: [],
  camera: string,
  canAdopt: boolean,
  connectedSince: number,
  connectionHost: string,
  firmwareBuild: string,
  firmwareVersion: string,
  hardwareRevision: string,
  humiditySettings: {

    highThreshold: number,
    isEnabled: boolean,
    lowThreshold: number,
    margin: number
  },
  id: string,
  isAdopted: boolean,
  isAdoptedByOther: boolean,
  isAdopting: boolean,
  isAttemptingToConnect: boolean,
  isConnected: boolean,
  isMotionDetected: boolean,
  isOpened: boolean,
  isProvisioned: boolean,
  isRebooting: boolean,
  isSshEnabled: boolean,
  isUpdating: boolean,
  lastSeen: number,
  latestFirmwareVersion: string,
  leakDetectedAt: number,
  ledSettings: {

    isEnabled: boolean
  },
  lightSettings: {

    highThreshold: number,
    isEnabled: boolean,
    lowThreshold: number,
    margin: number
  },
  mac: string,
  marketName: string,
  modelKey: string,
  motionDetectedAt: number,
  motionSettings: {

    isEnabled: boolean,
    sensitivity: number
  },
  mountType: string,
  name: string,
  nvrMac: string,
  openStatusChangedAt: number,
  state: string,
  stats: {

    humidity: {

      status: string,
      value: number | null
    },
    light: {

      status: string,
      value: number | null
    },
    temperature: {

      status: string,
      value: number | null
    }
  },
  tamperingDetectedAt: number | null,
  temperatureSettings: {

    highThreshold: number,
    isEnabled: boolean,
    lowThreshold: number,
    margin: number
  },
  type: string,
  upSince: number,
  uptime: number,
  wiredConnectionState: {

    phyRate: number
  }
}

/**
 * A semi-complete description of the UniFi Protect viewer JSON.
 */
export interface ProtectViewerConfigInterface {

  canAdopt: boolean,
  connectedSince: number,
  connectionHost: string,
  firmwareBuild: string,
  firmwareVersion: string,
  hardwareRevision: string,
  host: string,
  id: string,
  isAdopted: boolean,
  isAdoptedByOther: boolean,
  isAdopting: boolean,
  isAttemptingToConnect: boolean,
  isConnected: boolean,
  isProvisioned: boolean,
  isRebooting: boolean,
  isSshEnabled: boolean,
  isUpdating: boolean,
  lastSeen: number,
  latestFirmwareVersion: string,
  liveview: string | null,
  mac: string,
  marketName: string,
  modelKey: string,
  name: string,
  nvrMac: string,
  softwareVersion: string,
  state: string,
  streamLimit: number,
  type: string,
  upSince: number,
  uptime: number,
  wiredConnectionState: {

    phyRate: number
  }
}

/**
 * A semi-complete description of the UniFi Protect smart motion detection event JSON.
 */
export interface ProtectEventAddInterface {

  camera: string,
  cameraId: string,
  detectedAt: number,
  end: number,
  eventId: string,
  id: string,
  metadata: ProtectEventMetadata,
  modelKey: string,
  partition: string,
  score: number,
  smartDetectEvents: string[],
  smartDetectTypes: string[],
  start: number,
  thumbnailId: string,
  type: string,
  user: string
}

/**
 * A description of metadata in UniFi Protect smart motion detect events.
 */
export interface ProtectEventMetadataInterface {

  deviceId: {

    text: string
  },
  fingerprint: {

    ulpId: string
  },
  isLowBattery: boolean,
  isWireless: boolean,
  licensePlate: {

    confidenceLevel: number,
    name: string
  },
  name: {

    text: string
  },
  nfc: {

    nfcId: string,
    ulpId: string
  },
  reason: string
}

/** @see {@link ProtectEventAddInterface} */
export type ProtectEventAdd = ProtectEventAddInterface;

/** @see {@link ProtectEventMetadataInterface} */
export type ProtectEventMetadata = ProtectEventMetadataInterface;

/** @see {@link ProtectNvrBootstrapInterface} */
export type ProtectNvrBootstrap = ProtectNvrBootstrapInterface;

/** @see {@link ProtectNvrConfigInterface} */
export type ProtectNvrConfig = ProtectNvrConfigInterface;

/** @see {@link ProtectNvrConfigInterface} */
export type ProtectNvrConfigPayload = DeepPartial<ProtectNvrConfigInterface>;

/** @see {@link ProtectNvrSystemInfoInterface} */
export type ProtectNvrSystemInfoConfig = ProtectNvrSystemInfoInterface;

/** @see {@link ProtectCameraConfigInterface} */
export type ProtectCameraConfig = ProtectCameraConfigInterface;

/** @see {@link ProtectCameraConfigInterface} */
export type ProtectCameraConfigPayload = DeepPartial<ProtectCameraConfigInterface>;

/** @see {@link ProtectCameraChannelConfigInterface} */
export type ProtectCameraChannelConfig = ProtectCameraChannelConfigInterface;

/** @see {@link ProtectCameraLcdMessageConfigInterface} */
export type ProtectCameraLcdMessageConfig = ProtectCameraLcdMessageConfigInterface;

/** @see {@link ProtectCameraLcdMessageConfigInterface} */
export type ProtectCameraLcdMessagePayload = DeepPartial<ProtectCameraLcdMessageConfigInterface>;

/** @see {@link ProtectChimeConfigInterface} */
export type ProtectChimeConfig = ProtectChimeConfigInterface;

/** @see {@link ProtectChimeConfigInterface} */
export type ProtectChimeConfigPayload = DeepPartial<ProtectChimeConfigInterface>;

/** @see {@link ProtectLightConfigInterface} */
export type ProtectLightConfig = ProtectLightConfigInterface;

/** @see {@link ProtectLightConfigInterface} */
export type ProtectLightConfigPayload = DeepPartial<ProtectLightConfigInterface>;

/** @see {@link ProtectNvrLiveviewConfigInterface} */
export type ProtectNvrLiveviewConfig = ProtectNvrLiveviewConfigInterface;

/** @see {@link ProtectNvrSystemEventInterface} */
export type ProtectNvrSystemEvent = ProtectNvrSystemEventInterface;

/** @see {@link ProtectNvrSystemEventInterface} */
export type ProtectNvrSystemEventController = ProtectNvrSystemEventControllerInterface;

/** @see {@link ProtectNvrUserConfigInterface} */
export type ProtectNvrUserConfig = ProtectNvrUserConfigInterface;

/** @see {@link ProtectRingtoneConfigInterface} */
export type ProtectRingtoneConfig = ProtectRingtoneConfigInterface;

/** @see {@link ProtectSensorConfigInterface} */
export type ProtectSensorConfig = ProtectSensorConfigInterface;

/** @see {@link ProtectSensorConfigInterface} */
export type ProtectSensorConfigPayload = DeepPartial<ProtectSensorConfigInterface>;

/** @see {@link ProtectViewerConfigInterface} */
export type ProtectViewerConfig = ProtectViewerConfigInterface;

/** @see {@link ProtectViewerConfigInterface} */
export type ProtectViewerConfigPayload = DeepPartial<ProtectViewerConfigInterface>;
