/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * nvr.ts: The UniFi Protect NVR configuration types, including the bootstrap collections, system info and events, liveviews, users, and ringtones.
 */
import type { Nullable, ProtectKnownJsonValue } from "./common.ts";
import type { ProtectCameraConfig } from "./camera.ts";
import type { ProtectChimeConfig } from "./chime.ts";
import type { ProtectFobConfig } from "./fob.ts";
import type { ProtectLightConfig } from "./light.ts";
import type { ProtectRelayConfig } from "./relay.ts";
import type { ProtectSensorConfig } from "./sensor.ts";
import type { ProtectViewerConfig } from "./viewer.ts";

/**
 * The UniFi Protect NVR configuration types: the bootstrap payload and the device collections it carries, the NVR record itself, its system info and system-event
 * shapes, and the liveview, user, and ringtone records the controller stores.
 *
 * @module ProtectTypesNvr
 */

/**
 * A semi-complete description of the UniFi Protect NVR bootstrap JSON.
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
  fobs: ProtectFobConfig[];
  groups: ProtectKnownJsonValue[];
  hubs: ProtectKnownJsonValue[];
  lastUpdateId: string;
  lights: ProtectLightConfig[];
  linkstations: ProtectKnownJsonValue[];
  liveviews: ProtectNvrLiveviewConfig[];
  nvr: ProtectNvrConfig;
  readers: ProtectKnownJsonValue[];
  relays: ProtectRelayConfig[];
  ringtones: ProtectRingtoneConfigInterface[];
  sensors: ProtectSensorConfig[];
  sirens: ProtectKnownJsonValue[];
  speakers: ProtectKnownJsonValue[];
  users: ProtectNvrUserConfig[];
  viewers: ProtectViewerConfig[];

  [key: string]: ProtectKnownJsonValue;
}

/**
 * A description of a UniFi Protect NVR legal-agreement record: the contract identifier, its link, the contract version, and the acceptance status (`null` until the
 * agreement is accepted).
 */
export interface ProtectNvrAgreementInterface {

  actualContract: string;
  actualContractLink: string;
  actualVersion: string;
  status: Nullable<string>;

  [key: string]: ProtectKnownJsonValue;
}

/**
 * A description of a UniFi Protect NVR AI-feature toggle: whether the feature is enabled and whether it applies to all cameras or only the enumerated `cameras` subset.
 */
export interface ProtectNvrAiFeatureToggleInterface {

  allCameras: boolean;
  cameras: string[];
  enabled: boolean;

  [key: string]: ProtectKnownJsonValue;
}

/**
 * A semi-complete description of the UniFi Protect NVR configuration JSON.
 */
export interface ProtectNvrConfigInterface {

  accessVersion: string;
  agreements: {

    aiReportingAgreement: ProtectNvrAgreementInterface;
    smartDetectAgreement: ProtectNvrAgreementInterface;
  };
  aiFeatureSettings: {

    aiSummarySettings: ProtectNvrAiFeatureToggleInterface;
    faceEnhanceSettings: ProtectNvrAiFeatureToggleInterface;
    faceRecognitionSettings: ProtectNvrAiFeatureToggleInterface;
    licensePlateRecognitionSettings: ProtectNvrAiFeatureToggleInterface;
    recognizeAnythingSettings: ProtectNvrAiFeatureToggleInterface;
    reverificationSettings: ProtectNvrAiFeatureToggleInterface;
    speechToTextSettings: ProtectNvrAiFeatureToggleInterface;
  };
  allowThirdPartyNfcCards: boolean;
  analyticsData: string;
  anonymousDeviceId: string;
  armMode: {

    armedAt: Nullable<number>;
    breachDetectedAt: Nullable<number>;
    breachEventCount: number;
    // Two ids naming the arm-mode breach: `breachEventId` identifies the breach event record itself, while `breachTriggerEventId` identifies the event that tripped it
    // (the detection that caused the breach). Both are `null` while no breach is active.
    breachEventId: Nullable<string>;
    breachTriggerEventId: Nullable<string>;
    status: string;
    willBeArmedAt: Nullable<number>;
  };
  autoBalanceStorageBytes: number;
  autoRetentionEnabled: boolean;
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
  cefSettings: {

    enabledCategories: string[];
    server: {

      host: string;
      port: number;
    };
    syslogMode: number;
  };
  consoleEnv: string;
  corruptionState: string;
  countryCode: string;
  dbRecoveryOptions: {

    canRecover: Nullable<boolean>;
    hasConfigBackup: Nullable<boolean>;
    hasDbBackup: Nullable<boolean>;
    hddFailing: Nullable<boolean>;
    partitionReadonly: Nullable<boolean>;
  };
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
  enableThirdPartyCamerasDiscovery: boolean;
  errorCode: Nullable<string>;
  estimatedHqRetentionDays: Nullable<number>;
  estimatedLqRetentionDays: Nullable<number>;
  expansionUnitRetention: ProtectKnownJsonValue[];
  expansionUnits: ProtectKnownJsonValue[];
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
  foreignPgDumpConsoleName: Nullable<string>;
  foreignPgDumpDetected: boolean;
  guid: string;
  hardDriveState: string;
  hardwareId: string;
  hardwareRevision: string;
  hasBackportedRetentionSettings: boolean;
  hasGateway: boolean;
  homekitError: Nullable<string>;
  homekitSetupCode: Nullable<string>;
  homekitSetupPayload: Nullable<string>;
  homekitShutdownReason: Nullable<string>;
  homekitStatus: string;
  host: string;
  hostShortname: string;
  hostType: number;
  hosts: string[];
  id: string;
  isAccessInstalled: boolean;
  isAiReportingEnabled: boolean;
  isAway: boolean;
  isEdgeDevice: boolean;
  isFullBackupPreparing: boolean;
  isFullBackupReady: boolean;
  isHomekitEnabled: boolean;
  isInsightsEnabled: boolean;
  isMigrationFailed: boolean;
  isNetworkInstalled: boolean;
  isPrimary: boolean;
  isProtectUpdatable: boolean;
  isRecordingDisabled: boolean;
  isRecordingMotionOnly: boolean;
  isRecordingPauseAllowedDuringRaidSync: Nullable<boolean>;
  isRecycling: boolean;
  isRemoteAccessEnabled: boolean;
  isSecondary: boolean;
  isSetup: boolean;
  isSshEnabled: boolean;
  isStacked: boolean;
  isUCoreSetup: boolean;
  isUCoreStacked: boolean;
  isUcoreUpdatable: boolean;
  isUpdating: boolean;
  isWirelessUplinkEnabled: Nullable<boolean>;
  lastDeviceFWUpdatesCheckedAt: number;
  lastSeen: number;
  lastUpdateAt: Nullable<number>;
  liveview: Nullable<string>;
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
  msrServiceMeta: {

    inStateSince: number;
    isRecycling: boolean;
    progress: number;
    reasons: ProtectKnownJsonValue[];
  };
  msrServiceState: string;
  name?: string;
  pinCodeSettings: {

    pinCodeLengthRange: string;
  };
  portStatus: ProtectKnownJsonValue[];
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
  sessionSettings: {

    doorbellTimeout: number;
    liveviewTimeout: number;
    supportedClients: string[];
  };
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
  storageAllocationHqPercent: number;
  storageAllocationHqPercentBalanced: number;
  storageAllocationHqPercentMaxRetention: number;
  storageAllocationMode: string;
  storageConsoleCameraCounts: {

    consoleIndex: number;
    offlineCameraCount: number;
    onlineCameraCount: number;
  }[];
  storageConsoleFailoverSettings: ProtectKnownJsonValue[];
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
  streamEncryptionEnabled: boolean;
  streamSharingAvailable: boolean;
  switchPoeBudget: number;
  switchPorts: ProtectKnownJsonValue[];
  syncingEstimateMs: Nullable<number>;
  syncingProgress: Nullable<number>;
  syncingSince: Nullable<number>;
  systemInfo: ProtectNvrSystemInfoInterface;
  temperatureUnit: string;
  timeFormat: string;
  timelapseEnabled: boolean;
  timezone: string;
  totalHqBytesPerDay: number;
  totalLqBytesPerDay: number;
  type: string;
  ucoreVersion: string;
  ulpVersion: string;
  upSince: number;
  version: string;
  voipForbidden: boolean;
  wanIp: string;
  wanPorts: ProtectKnownJsonValue[];

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
 * A semi-complete description of the UniFi Protect NVR system events JSON.
 */
export interface ProtectNvrSystemEventInterface {

  apps: {

    apps: ProtectKnownJsonValue[];
    controllers: ProtectNvrSystemEventController[];
  };
  system: ProtectKnownJsonValue;
  type: string;
}

/**
 * A semi-complete description of the UniFi Protect NVR system events controller JSON.
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

/** @see {@link ProtectNvrBootstrapInterface} */
export type ProtectNvrBootstrap = ProtectNvrBootstrapInterface;

/** @see {@link ProtectNvrAgreementInterface} */
export type ProtectNvrAgreement = ProtectNvrAgreementInterface;

/** @see {@link ProtectNvrAiFeatureToggleInterface} */
export type ProtectNvrAiFeatureToggle = ProtectNvrAiFeatureToggleInterface;

/** @see {@link ProtectNvrConfigInterface} */
export type ProtectNvrConfig = ProtectNvrConfigInterface;

/** @see {@link ProtectNvrSystemInfoInterface} */
export type ProtectNvrSystemInfo = ProtectNvrSystemInfoInterface;

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
