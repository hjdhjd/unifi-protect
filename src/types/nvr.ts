/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * nvr.ts: The UniFi Protect NVR configuration types, including the bootstrap collections, system info and events, liveviews, users, and ringtones.
 */
import type { Nullable, ProtectKnownJsonValue } from "./common.ts";
import type { ProtectCameraConfig } from "./camera.ts";
import type { ProtectChimeConfig } from "./chime.ts";
import type { ProtectFobConfig } from "./fob.ts";
import type { ProtectLightConfig } from "./light.ts";
import type { ProtectOverlaySettingsInterface } from "./shapes.ts";
import type { ProtectRelayConfig } from "./relay.ts";
import type { ProtectSensorConfig } from "./sensor.ts";
import type { ProtectSirenConfig } from "./siren.ts";
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
  agreements: ProtectNvrAgreementsInterface;
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
  sirens: ProtectSirenConfig[];
  speakers: ProtectKnownJsonValue[];
  users: ProtectNvrUserConfig[];
  viewers: ProtectViewerConfig[];

  [key: string]: ProtectKnownJsonValue;
}

/**
 * A description of a UniFi Protect NVR legal-agreement record: the contract identifier, its link, the contract version, and the acceptance status (`null` until the
 * agreement is accepted). One record; {@link ProtectNvrAgreementsInterface} is the container that holds the controller's named agreements.
 */
export interface ProtectNvrAgreementInterface {

  actualContract: string;
  actualContractLink: string;
  actualVersion: string;
  status: Nullable<string>;

  [key: string]: ProtectKnownJsonValue;
}

/**
 * The container holding each of the controller's named legal agreements, every one a {@link ProtectNvrAgreementInterface} record (the singular name is one such
 * record; this plural one is the set of them). The controller reports the identical shape at the bootstrap's top level and on the NVR record, so both reference this.
 */
export interface ProtectNvrAgreementsInterface {

  aiReportingAgreement: ProtectNvrAgreementInterface;
  smartDetectAgreement: ProtectNvrAgreementInterface;

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

  accessMigratedAt: Nullable<number>;
  accessMigrationStatus: Nullable<string>;
  accessSwitchBackStatus: Nullable<string>;
  accessVersion: string;
  agreements: ProtectNvrAgreementsInterface;
  aiFeatureSettings: {

    aiSummarySettings: ProtectNvrAiFeatureToggleInterface;
    // The same toggle every sibling setting carries, plus this feature's own tuning. The added members were observed only as `null`; a cutoff is a numeric threshold,
    // while the rest leave their kind genuinely open on the wire.
    deepUnderstandingSettings: ProtectNvrAiFeatureToggleInterface & {

      describe: ProtectKnownJsonValue;
      reidCutoffByCamera: ProtectKnownJsonValue;
      reidCutoffDefault: Nullable<number>;
    };
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
  canMigrateAccessDevices: boolean;
  canSwitchBackToAccess: boolean;
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
  emergencyMode: string;
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

    aiFeatureFlag: {

      supportAiSummary: { enabled: boolean };
      supportFaceEnhancement: { enabled: boolean };
      supportFaceRecognition: { enabled: boolean };
      supportImageSearch: { enabled: boolean };
      supportLicensePlateRecognition: { enabled: boolean };
      supportMessageProxy: { enabled: boolean };
      supportPersonReId: { enabled: boolean };
      supportPoseEstimation: { enabled: boolean };
      supportRecognizeAnything: { enabled: boolean };
      supportRetroactiveProcessing: { enabled: boolean };
      supportTts: { enabled: boolean };
    };
    autoRetentionSupported: boolean;
    beta: boolean;
    detectionLabels: boolean;
    dev: boolean;
    externalAlarmManagerReady: boolean;
    hasSessionStats: boolean;
    hasTwoWayAudioMediaStreams: boolean;
    homekitPaired: boolean;
    isCasePresentationSupported: boolean;
    isRecordingContinuitySupported: boolean;
    isUnifiCloudStorageSupported: boolean;
    isVideoSigningSupported: boolean;
    lastMigratedEventId: Nullable<string>;
    msApixSupported: boolean;
    msIdSupport: boolean;
    notificationsV2: boolean;
    smartDoorAccess: boolean;
    stackedMigration: boolean;
    supportAccessAppRingEvent: boolean;
    supportAccessMigration: boolean;
    supportAccessPlayback: boolean;
    supportsExpansionUnits: boolean;
    ulpRoleManagement: boolean;
    useExternalAlarmManager: boolean;
  };
  firmwareVersion: string;
  foreignPgDumpConsoleName: Nullable<string>;
  foreignPgDumpDetected: boolean;
  guid: string;
  hardDriveState: string;
  hardwareId: string;
  hardwareRevision: string;
  hasAccessMigrationBackup: boolean;
  hasBackportedRetentionSettings: boolean;
  hasGateway: boolean;
  hasInternet: boolean;
  hasMigratableAccessDevices: boolean;
  hasUnsupportedAccessDevices: boolean;
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
  isGapRecoveryEnabled: boolean;
  isHomekitEnabled: boolean;
  isInsightsEnabled: boolean;
  isInternalOwner: boolean;
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
  isVideoSigningEnabled: boolean;
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
  offlineAccessDevices: ProtectKnownJsonValue[];
  offlineMigratedAccessDevices: ProtectKnownJsonValue[];
  overlaySettings: ProtectOverlaySettingsInterface;
  pinCodeSettings: {

    pinCodeLengthRange: string;
  };
  portStatus: ProtectKnownJsonValue[];
  ports: {

    accessHttp: number;
    aiFeatureConsole: number;
    cameraEvents: number;
    cameraHttps: number;
    devicesWs: number;
    devicesWss: number;
    discoveryClient: number;
    dsWebServer: number;
    edgeCameraHttps: number;
    emsCLI: number;
    emsJsonCLI: number;
    emsLiveFLV: number;
    emsLiveFLVs: number;
    http: number;
    https: number;
    liveWs: number;
    liveWss: number;
    mspHttp: number;
    playApplication: number;
    playback: number;
    rtmp: number;
    rtsp: number;
    rtsps: number;
    stacking: number;
    tcpBridge: number;
    tcpStreams: number;
    ucore: number;
    ulp: number;
    ump: number;
    uosExternalAutomationManager: number;
    userAssets: number;
  };
  publicIp: string;
  recordingRetentionDurationMs: Nullable<string>;
  registeredEvidenceKeyId: Nullable<string>;
  registeredEvidenceKeyValidUntilMs: Nullable<number>;
  releaseChannel: string;
  serialNumber: string;
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
    precision: string;
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

    averageCapacity: number;
    capacity: number;
    recordingDistribution: {

      hq: { bytes: number; percentage: number };
      lq: { bytes: number; percentage: number };
      persistent: { bytes: number; percentage: number };
      reserved: { bytes: number; percentage: number };
      timelapse: { bytes: number; percentage: number };
      unused: { bytes: number; percentage: number };
    };
    recordingRate: number;
    recordingSpace: {

      available: number;
      total: number;
      used: number;
    };
    remainingCapacity: number;
    retentionRatioLQ: number;
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
  videoSigningEnabledAt: Nullable<number>;
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
  degradation: {

    level: number;
    loadLevel: string;
    // Observed only as `null`; the plural names a list, but nothing on the wire describes what an entry holds.
    pressures: Nullable<ProtectKnownJsonValue[]>;
    updatedAt: number;
  };
  memory: {

    available: number;
    free: number;
    total: number;
  };
  storage: {

    available: number;
    capability: string;
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
  // The disk and volume inventory the console's storage layer reports, in its own snake_case wire vocabulary rather than the camelCase the rest of the API uses. The
  // `estimate` and `progress` members carry a number only while an operation is running, and read `null` otherwise.
  ustorage: {

    disks: {

      action: string;
      ata: string;
      bad_sector: number;
      estimate: Nullable<number>;
      firmware: string;
      healthy: string;
      model: string;
      poweronhrs: number;
      progress: Nullable<number>;
      reason: ProtectKnownJsonValue[];
      rpm: number;
      sata: string;
      serial: string;
      size: number;
      slot: number;
      state: string;
      temperature: number;
      type: string;
    }[];
    hotspare: boolean;
    raid: string;
    sdcards: ProtectKnownJsonValue[];
    space: {

      action: string;
      device: string;
      estimate: Nullable<number>;
      health: string;
      progress: Nullable<number>;
      reasons: ProtectKnownJsonValue[];
      space_type: string;
      total_bytes: number;
      used_bytes: number;
    }[];
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

/* The continuous-archive state a user's OAuth-backed cloud destination reports: the last attempt and its outcome, whether archiving is on, and the destination's own
 * quota accounting. Every such provider reports the identical shape, so it is declared once here...it stays module-private because it is a nested detail of the user
 * record rather than a shape a consumer reaches for on its own.
 */
interface ProtectNvrUserCloudProviderInterface {

  continuousArchiveConsecutiveFailures: number;
  continuousArchiveLastAttemptAt: Nullable<number>;
  continuousArchiveLastFailureAt: Nullable<number>;
  continuousArchiveLastFailureReason: Nullable<string>;
  continuousArchiveLastSuccessfulAt: Nullable<number>;
  continuousArchiveStatus: Nullable<string>;
  displayName: Nullable<string>;
  email: Nullable<string>;
  errors: ProtectKnownJsonValue[];
  expiresAt: number;
  isContinuousArchivingEnabled: boolean;
  retentionPolicy: {

    currentArchiveSizeBytes: Nullable<number>;
    isStorageInfoSyncing: boolean;
    maxArchiveSizeGB: Nullable<number>;
    reservedFreeSpaceGB: Nullable<number>;
    totalSpaceBytes: Nullable<number>;
    totalUsedSpaceBytes: Nullable<number>;
  };

  [key: string]: ProtectKnownJsonValue;
}

/**
 * A semi-complete description of the UniFi Protect NVR user JSON.
 */
export interface ProtectNvrUserConfigInterface {

  alertRules: ProtectKnownJsonValue[];
  allPermissions: string[];
  archivingSettings: {

    cameras: ProtectKnownJsonValue[];
    detections: ProtectKnownJsonValue[];
    isAllCameras: boolean;
    isAllDetections: boolean;
  };
  // Present on every user record and `null` on any whose account is not linked to the cloud, so the member is required and the object is what is nullable.
  cloudAccount: Nullable<{

    cloudId: string;
    email: string;
    firstName: string;
    id: string;
    lastName: string;
    // The account's own location record, distinct from the user's `location` state below - a different subject, so the two shapes stay separate. Optional because
    // only a linked account reports it. The coordinates are numeric by inference: every observation of them came through a capture that nulls coordinates.
    location?: {

      isAway: boolean;
      latitude: Nullable<number>;
      longitude: Nullable<number>;
      modelKey: string;
    };
    modelKey: string;
    name: string;
    profileImg: string;
    user: string;
  }>;
  cloudProviders: {

    NAS: ProtectKnownJsonValue[];
    dropbox: ProtectNvrUserCloudProviderInterface;
    google: ProtectNvrUserCloudProviderInterface;
    oneDrive: ProtectNvrUserCloudProviderInterface;
    unifiCloudStorage: {

      continuousArchiveConsecutiveFailures: number;
      continuousArchiveLastAttemptAt: Nullable<number>;
      continuousArchiveLastFailureAt: Nullable<number>;
      continuousArchiveLastFailureReason: Nullable<string>;
      continuousArchiveLastSuccessfulAt: Nullable<number>;
      continuousArchiveStatus: Nullable<string>;
      isContinuousArchivingEnabled: boolean;
      lastStatusSyncAt: Nullable<number>;
      quotaLimitBytes: Nullable<number>;
      subscriptionDataDeletedAt: Nullable<number>;
      subscriptionDataWillBeDeletedAt: Nullable<number>;
      subscriptionExpiredAt: Nullable<number>;
      subscriptionId: Nullable<string>;
      subscriptionIsActive: Nullable<boolean>;
      subscriptionRegion: Nullable<string>;
      subscriptionStatus: Nullable<string>;
      subscriptionType: Nullable<string>;
    };
  };
  email: string;
  enableNotifications: boolean;
  featureFlags: {

    hasCriticalAlarmNotifications: boolean;
    notificationsV2: boolean;
  };
  firstName: string;
  groups: string[];
  hasAcceptedInvite: boolean;
  id: string;
  isAdmin: boolean;
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
  notificationSnoozeSettings: {

    deliveryMethods: ProtectKnownJsonValue[];
    eventTypes: ProtectKnownJsonValue[];
    excludedDevices: {

      bridges: ProtectKnownJsonValue[];
      cameras: ProtectKnownJsonValue[];
      chimes: ProtectKnownJsonValue[];
      lights: ProtectKnownJsonValue[];
      sensors: ProtectKnownJsonValue[];
      viewers: ProtectKnownJsonValue[];
    };
    validUntil: number;
  };
  // Both were observed as empty objects, so their keys are undeclarable; the open signatures keep whatever the controller puts there readable.
  notifications: Record<string, ProtectKnownJsonValue>;
  notificationsV2: Record<string, ProtectKnownJsonValue>;
  permissions: string[];
  scopes: string[];
  settings: {

    showFeaturesIntroduction: boolean;
    smartDetectionHighlightSettings?: {

      cameraID: string;
      enabledSmartDetectStats: ProtectKnownJsonValue[];
      enabledSmartDetectTypes: string[];
    }[];
    // The web console's own preference blob, written by that app for its own use: its keys are a mix of UI state and record ids, they vary by user and by console
    // version, and none of them is part of the controller's API contract. Declared open so the shape stays readable without reporting every console preference as
    // schema drift.
    web?: Record<string, ProtectKnownJsonValue>;
  };
  ucoreUserId: Nullable<string>;

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

/** @see {@link ProtectNvrAgreementsInterface} */
export type ProtectNvrAgreements = ProtectNvrAgreementsInterface;

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
