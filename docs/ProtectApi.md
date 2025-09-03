[**unifi-protect**](README.md)

***

[Home](README.md) / ProtectApi

# ProtectApi

A complete implementation of the UniFi Protect API, providing comprehensive access to UniFi Protect controllers.

## Overview

This module provides a high-performance, event-driven interface to the UniFi Protect API, enabling full access to
Protect's rich ecosystem of security devices and capabilities. The API has been reverse-engineered through careful
analysis of the Protect web interface and extensive testing, as Ubiquiti does not provide official documentation.

## Key Features

- **Complete Device Support**: Cameras, lights, sensors, chimes, viewers, and the NVR itself
- **Real-time Events**: WebSocket-based event streaming for instant notifications
- **Livestream Access**: Direct H.264 fMP4 stream access, not just RTSP
- **Robust Error Handling**: Automatic retry logic with exponential backoff
- **Type Safety**: Full TypeScript support with comprehensive type definitions

## Quick Start

```typescript
import { ProtectApi } from "unifi-protect";

// Create an API instance
const protect = new ProtectApi();

// Login to your Protect controller
await protect.login("192.168.1.1", "username", "password");

// Bootstrap to get the current state
await protect.getBootstrap();

// Access your devices
const cameras = protect.bootstrap?.cameras ?? [];
console.log(`Found ${cameras.length} cameras`);

// Listen for real-time events
protect.on("message", (packet) => {
  console.log("Event received:", packet);
});
```

## Architecture

The API is built on modern Node.js technologies:
- **Undici**: High-performance HTTP/1.1 and HTTP/2 client
- **WebSockets**: Real-time bidirectional communication
- **EventEmitter**: Node.js event-driven architecture

## Authentication

The API uses cookie-based authentication with CSRF token protection, mimicking the Protect web interface.
Administrative privileges are required for configuration changes, while read-only access is available to all users.

## Interfaces

### RetrieveOptions

Options to tailor the behavior of [ProtectApi.retrieve](#retrieve).

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="logerrors"></a> `logErrors?` | `boolean` | Log errors. Defaults to `true`. |
| <a id="timeout"></a> `timeout?` | `number` | Amount of time, in milliseconds, to wait for the Protect controller to respond before timing out. Defaults to `3500`. |

## Type Aliases

### ProtectKnownDevicePayloads

```ts
type ProtectKnownDevicePayloads = 
  | ProtectCameraConfigPayload
  | ProtectChimeConfigPayload
  | ProtectLightConfigPayload
  | ProtectNvrConfigPayload
  | ProtectSensorConfigPayload
  | ProtectViewerConfigPayload;
```

Define our known Protect device payload types.

***

### ProtectKnownDeviceTypes

```ts
type ProtectKnownDeviceTypes = 
  | ProtectCameraConfig
  | ProtectChimeConfig
  | ProtectLightConfig
  | ProtectNvrConfig
  | ProtectSensorConfig
  | ProtectViewerConfig;
```

Define our known Protect device types.

***

### RequestOptions

```ts
type RequestOptions = {
  dispatcher?: Dispatcher;
} & Omit<Dispatcher.RequestOptions, "origin" | "path">;
```

Configuration options for HTTP requests executed by `retrieve()`.

#### Type Declaration

| Name | Type | Description |
| ------ | ------ | ------ |
| `dispatcher?` | `Dispatcher` | Optional custom Undici `Dispatcher` instance to use for this request. If omitted, the native `unifi-protect` dispatcher is used, which should be suitable for most use cases. |

#### Remarks

Extends Undici’s [`Dispatcher.RequestOptions`](https://undici.nodejs.org/#/docs/api/Dispatcher.md?id=parameter-requestoptions), but omits the `origin` and
`path` properties, since those are derived from the `url` argument passed to `retrieve()`. You can optionally supply a custom `Dispatcher` instance to control
connection pooling, timeouts, etc.

## Events

### ProtectApi

This class provides an event-driven API to access the UniFi Protect API.

## Getting Started

To begin using the API, follow these three essential steps:

1. **Login**: Authenticate with the Protect controller using [login](#login)
2. **Bootstrap**: Retrieve the controller configuration with [getBootstrap](#getbootstrap)
3. **Listen**: Subscribe to real-time events via the `message` event

## Events

The API emits several events during its lifecycle:

| Event | Payload | Description |
|-------|---------|-------------|
| `login` | `boolean` | Emitted after each login attempt with success status |
| `bootstrap` | [ProtectNvrBootstrap](ProtectTypes.md#protectnvrbootstrap) | Emitted when bootstrap data is retrieved |
| `message` | [ProtectApiEvents.ProtectEventPacket](ProtectApiEvents.md#protecteventpacket) | Real-time event packets from the controller |

## Connection Management

The API automatically manages connection pooling and implements intelligent retry logic:
- Up to 5 concurrent connections
- Automatic retry with exponential backoff
- Throttling after repeated failures
- Graceful WebSocket reconnection

## Error Handling

All API methods implement comprehensive error handling:
- Network errors are logged and retried
- Authentication failures trigger re-login attempts
- Server errors are handled gracefully
- Detailed logging for debugging

 login     - Emitted after each login attempt with the success status as a boolean value. This event fires whether the login succeeds or fails, allowing
                   applications to respond appropriately to authentication state changes.
 bootstrap - Emitted when bootstrap data is successfully retrieved from the controller. The event includes the complete [ProtectNvrBootstrap](ProtectTypes.md#protectnvrbootstrap)
                   configuration object containing all device states and system settings.
 message   - Emitted for each real-time event packet received from the controller's WebSocket connection. The event includes a
                   [ProtectApiEvents.ProtectEventPacket](ProtectApiEvents.md#protecteventpacket) containing device updates, motion events, and other system notifications.

#### Example

Complete example with error handling and event processing:

```typescript
import { ProtectApi, ProtectCameraConfig } from "unifi-protect";

class ProtectManager {
  private api: ProtectApi;

  constructor() {
    this.api = new ProtectApi();
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Handle login events
    this.api.on("login", (success: boolean) => {
      console.log(success ? "Login successful" : "Login failed");
    });

    // Process real-time events
    this.api.on("message", (packet) => {
      if (packet.header.modelKey === "camera") {
        console.log("Camera event:", packet);
      }
    });
  }

  async connect(host: string, username: string, password: string): Promise<boolean> {
    try {
      // Login to the controller
      if (!await this.api.login(host, username, password)) {
        throw new Error("Authentication failed");
      }

      // Bootstrap the configuration
      if (!await this.api.getBootstrap()) {
        throw new Error("Bootstrap failed");
      }

      console.log(`Connected to ${this.api.name}`);
      return true;

    } catch (error) {
      console.error("Connection failed:", error);
      return false;
    }
  }

  async enableAllRtspStreams(): Promise<void> {
    const cameras = this.api.bootstrap?.cameras ?? [];

    for (const camera of cameras) {
      const updated = await this.api.enableRtsp(camera);
      if (updated) {
        console.log(`RTSP enabled for ${this.api.getDeviceName(camera)}`);
      }
    }
  }
}
```

#### Extends

- `EventEmitter`

#### Constructors

##### Constructor

```ts
new ProtectApi(log?): ProtectApi;
```

Create an instance of the UniFi Protect API.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `log?` | [`ProtectLogging`](ProtectLogging.md#protectlogging) | Custom logging implementation. |

###### Returns

[`ProtectApi`](#protectapi)

###### Default Value

```ts
Console logging to stdout/stderr
```

###### Remarks

The logging interface allows you to integrate the API with your application's logging system.
By default, errors and warnings are logged to the console, while debug messages are suppressed.

###### Example

Using a custom logger:

```typescript
import { ProtectApi, ProtectLogging } from "unifi-protect";
import winston from "winston";

const logger = winston.createLogger({
  level: "info",
  format: winston.format.simple(),
  transports: [new winston.transports.Console()]
});

const customLog: ProtectLogging = {
  debug: (message: string, ...args: unknown[]) => logger.debug(message, args),
  error: (message: string, ...args: unknown[]) => logger.error(message, args),
  info: (message: string, ...args: unknown[]) => logger.info(message, args),
  warn: (message: string, ...args: unknown[]) => logger.warn(message, args)
};

const protect = new ProtectApi(customLog);
```

###### Overrides

```ts
EventEmitter.constructor
```

#### API Access

##### bootstrap

###### Get Signature

```ts
get bootstrap(): Nullable<{
  accessKey: string;
  authUserId: string;
  bridges: unknown[];
  cameras: ProtectCameraConfigInterface[];
  chimes: ProtectChimeConfigInterface[];
  cloudPortalUrl: string;
  groups: unknown[];
  lastUpdateId: string;
  lights: ProtectLightConfigInterface[];
  liveviews: ProtectNvrLiveviewConfigInterface[];
  nvr: {
     analyticsData: string;
     anonymouseDeviceId: string;
     availableUpdate: string;
     avgMotions: number[];
     cameraCapacity: {
        qualities: {
           count: number;
           fraction: number;
           type: string;
        }[];
        state: string;
      } & {
      [key: string]: 
        | string
        | {
        count: number;
        fraction: number;
        type: string;
      }[];
     };
     cameraUtilization: number;
     canAutoUpdate: boolean;
     consoleEnv: string;
     corruptionState: string;
     countryCode: string;
     deviceFirmwareSettings: {
        configuredBy: string;
        isAutoUpdateEnabled: boolean;
        schedule: {
           hour: number;
         } & {
         [key: string]: number;
        };
      } & {
      [key: string]: 
        | string
        | boolean
        | {
        hour: number;
      } & {
      [key: string]: number;
      };
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
      } & {
      [key: string]: 
        | string
        | number
        | string[]
        | {
        text: ...;
        type: ...;
      }[];
     };
     enableAutomaticBackups: boolean;
     enableBridgeAutoAdoption: boolean;
     enableCrashReporting: boolean;
     enableStatsReporting: boolean;
     errorCode: Nullable<string>;
     featureFlags: {
        beta: boolean;
        detectionLabels: boolean;
        dev: boolean;
        hasTwoWayAudioMediaStreams: boolean;
        homekitPaired: boolean;
        notificationsV2: boolean;
        ulpRoleManagement: boolean;
      } & {
      [key: string]: boolean;
     };
     firmwareVersion: string;
     hardwareId: string;
     hardwarePlatform: string;
     hardwareRevision: string;
     hasGateway: boolean;
     host: string;
     hosts: string[];
     hostShortname: string;
     hostType: string;
     id: string;
     isAccessInstalled: boolean;
     isAiReportingEnabled: boolean;
     isAway: boolean;
     isHardware: boolean;
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
     isStation: boolean;
     isStatsGatheringEnabled: boolean;
     isUCoreSetup: boolean;
     isUCoreStacked: boolean;
     isUcoreUpdatable: boolean;
     isUpdating: boolean;
     isWirelessUplinkEnabled: boolean;
     lastSeen: number;
     lastUpdateAt: Nullable<number>;
     locationSettings: {
        isAway: boolean;
        isGeofencingEnabled: boolean;
        latitude: number;
        longitude: number;
        radius: number;
      } & {
      [key: string]: number | boolean;
     };
     mac: string;
     marketName: string;
     maxCameraCapacity: {
      [key: string]: number;
      } & {
      [key: string]: number;
     };
     modelKey: string;
     name?: string;
     network: string;
     ports: {
        aiFeatureConsole: number;
        cameraEvents: number;
        cameraHttps: number;
        cameraTcp: number;
        devicesWss: number;
        discoveryClient: number;
        emsCLI: number;
        emsJsonCLI: number;
        emsLiveFLV: number;
        http: number;
        https: number;
        liveWs: number;
        liveWss: number;
        piongw: number;
        playback: number;
        rtmp: number;
        rtsp: number;
        rtsps: number;
        stacking: number;
        tcpBridge: number;
        tcpStreams: number;
        ucore: number;
        ump: number;
      } & {
      [key: string]: number;
     };
     publicIp: string;
     recordingRetentionDurationMs: string;
     releaseChannel: string;
     skipFirmwareUpdate: boolean;
     smartDetectAgreement: {
        lastUpdateAt: Nullable<number>;
        status: string;
      } & {
      [key: string]: string | Nullable<number>;
     };
     smartDetection: {
        enable: boolean;
        faceRecognition: boolean;
        licensePlateRecognition: boolean;
      } & {
      [key: string]: boolean;
     };
     ssoChannel: Nullable<string>;
     storageStats: {
        capacity: number;
        recordingSpace: {
           available: number;
           total: number;
           used: number;
         } & {
         [key: string]: number;
        };
        remainingCapacity: number;
        storageDistribution: {
           recordingTypeDistributions: {
              percentage: ...;
              recordingType: ...;
              size: ...;
           }[];
           resolutionDistributions: {
              percentage: ...;
              recordingType: ...;
              size: ...;
           }[];
         } & {
         [key: string]: ...[] | ...[];
        };
        utilization: number;
      } & {
      [key: string]: 
        | number
        | {
        available: number;
        total: number;
        used: number;
      } & {
      [key: string]: number;
      }
        | {
        recordingTypeDistributions: ...[];
        resolutionDistributions: ...[];
      } & {
      [key: string]: ... | ...;
      };
     };
     streamSharingAvailable: boolean;
     systemInfo: {
        cpu: {
           averageLoad: number;
           temperature: number;
         } & {
         [key: string]: number;
        };
        memory: {
           available: number;
           free: number;
           total: number;
         } & {
         [key: string]: number;
        };
        storage: {
           available: number;
           devices: {
              healthy: ...;
              model: ...;
              size: ...;
           }[];
           isRecycling: boolean;
           size: number;
           type: string;
           used: number;
         } & {
         [key: string]: string | number | boolean | ...[];
        };
        tmpfs: {
           available: number;
           path: string;
           total: number;
           used: number;
         } & {
         [key: string]: string | number;
        };
      } & {
      [key: string]: 
        | {
        averageLoad: number;
        temperature: number;
      } & {
      [key: string]: number;
      }
        | {
        available: number;
        free: number;
        total: number;
      } & {
      [key: string]: number;
      }
        | {
        available: number;
        devices: ...[];
        isRecycling: boolean;
        size: number;
        type: string;
        used: number;
      } & {
      [key: string]: ... | ... | ... | ... | ...;
      }
        | {
        available: number;
        path: string;
        total: number;
        used: number;
      } & {
      [key: string]: ... | ...;
      };
     };
     temperatureUnit: string;
     timeFormat: string;
     timezone: string;
     type: string;
     ucoreVersion: string;
     uiVersion: string;
     upSince: number;
     uptime: number;
     version: string;
     wanIp: string;
     wifiSettings: {
        password: Nullable<string>;
        ssid: Nullable<string>;
        useThirdPartyWifi: boolean;
      } & {
      [key: string]: boolean | Nullable<string>;
     };
   } & {
   [key: string]: 
     | undefined
     | null
     | string
     | number
     | boolean
     | string[]
     | number[]
     | {
   [key: string]: number;
   } & {
   [key: string]: number;
   }
     | {
     qualities: {
        count: number;
        fraction: number;
        type: string;
     }[];
     state: string;
   } & {
   [key: string]: 
     | string
     | {
     count: ...;
     fraction: ...;
     type: ...;
   }[];
   }
     | {
     configuredBy: string;
     isAutoUpdateEnabled: boolean;
     schedule: {
        hour: number;
      } & {
      [key: string]: number;
     };
   } & {
   [key: string]: 
     | string
     | boolean
     | {
     hour: ...;
   } & {
   [key: ...]: ...;
   };
   }
     | {
     allMessages: {
        text: string;
        type: string;
     }[];
     customImages: string[];
     customMessages: string[];
     defaultMessageResetTimeoutMs: number;
     defaultMessageText: string;
   } & {
   [key: string]: 
     | string
     | number
     | string[]
     | {
     text: ...;
     type: ...;
   }[];
   }
     | {
     beta: boolean;
     detectionLabels: boolean;
     dev: boolean;
     hasTwoWayAudioMediaStreams: boolean;
     homekitPaired: boolean;
     notificationsV2: boolean;
     ulpRoleManagement: boolean;
   } & {
   [key: string]: boolean;
   }
     | {
     isAway: boolean;
     isGeofencingEnabled: boolean;
     latitude: number;
     longitude: number;
     radius: number;
   } & {
   [key: string]: number | boolean;
   }
     | {
     aiFeatureConsole: number;
     cameraEvents: number;
     cameraHttps: number;
     cameraTcp: number;
     devicesWss: number;
     discoveryClient: number;
     emsCLI: number;
     emsJsonCLI: number;
     emsLiveFLV: number;
     http: number;
     https: number;
     liveWs: number;
     liveWss: number;
     piongw: number;
     playback: number;
     rtmp: number;
     rtsp: number;
     rtsps: number;
     stacking: number;
     tcpBridge: number;
     tcpStreams: number;
     ucore: number;
     ump: number;
   } & {
   [key: string]: number;
   }
     | {
     lastUpdateAt: Nullable<number>;
     status: string;
   } & {
   [key: string]: string | Nullable<number>;
   }
     | {
     enable: boolean;
     faceRecognition: boolean;
     licensePlateRecognition: boolean;
   } & {
   [key: string]: boolean;
   }
     | {
     capacity: number;
     recordingSpace: {
        available: number;
        total: number;
        used: number;
      } & {
      [key: string]: number;
     };
     remainingCapacity: number;
     storageDistribution: {
        recordingTypeDistributions: ...[];
        resolutionDistributions: ...[];
      } & {
      [key: string]: ... | ...;
     };
     utilization: number;
   } & {
   [key: string]: 
     | number
     | {
     available: ...;
     total: ...;
     used: ...;
   } & {
   [key: ...]: ...;
   }
     | {
     recordingTypeDistributions: ...;
     resolutionDistributions: ...;
   } & {
   [key: ...]: ...;
   };
   }
     | {
     cpu: {
        averageLoad: number;
        temperature: number;
      } & {
      [key: string]: number;
     };
     memory: {
        available: number;
        free: number;
        total: number;
      } & {
      [key: string]: number;
     };
     storage: {
        available: number;
        devices: ...[];
        isRecycling: boolean;
        size: number;
        type: string;
        used: number;
      } & {
      [key: string]: ... | ... | ... | ... | ...;
     };
     tmpfs: {
        available: number;
        path: string;
        total: number;
        used: number;
      } & {
      [key: string]: ... | ...;
     };
   } & {
   [key: string]: 
     | {
     averageLoad: ...;
     temperature: ...;
   } & {
   [key: ...]: ...;
   }
     | {
     available: ...;
     free: ...;
     total: ...;
   } & {
   [key: ...]: ...;
   }
     | {
     available: ...;
     devices: ...;
     isRecycling: ...;
     size: ...;
     type: ...;
     used: ...;
   } & {
   [key: ...]: ...;
   }
     | {
     available: ...;
     path: ...;
     total: ...;
     used: ...;
   } & {
   [key: ...]: ...;
   };
   }
     | {
     password: Nullable<string>;
     ssid: Nullable<string>;
     useThirdPartyWifi: boolean;
   } & {
   [key: string]: boolean | Nullable<string>;
   };
  };
  ringtones: ProtectRingtoneConfigInterface[];
  sensors: ProtectSensorConfigInterface[];
  users: ProtectNvrUserConfigInterface[];
  viewers: ProtectViewerConfigInterface[];
} & {
[key: string]: 
  | string
  | unknown[]
  | ProtectCameraConfigInterface[]
  | ProtectChimeConfigInterface[]
  | ProtectLightConfigInterface[]
  | ProtectNvrLiveviewConfigInterface[]
  | ProtectRingtoneConfigInterface[]
  | ProtectSensorConfigInterface[]
  | ProtectNvrUserConfigInterface[]
  | ProtectViewerConfigInterface[]
  | {
  analyticsData: string;
  anonymouseDeviceId: string;
  availableUpdate: string;
  avgMotions: number[];
  cameraCapacity: {
     qualities: {
        count: number;
        fraction: number;
        type: string;
     }[];
     state: string;
   } & {
   [key: string]: 
     | string
     | {
     count: ...;
     fraction: ...;
     type: ...;
   }[];
  };
  cameraUtilization: number;
  canAutoUpdate: boolean;
  consoleEnv: string;
  corruptionState: string;
  countryCode: string;
  deviceFirmwareSettings: {
     configuredBy: string;
     isAutoUpdateEnabled: boolean;
     schedule: {
        hour: number;
      } & {
      [key: string]: number;
     };
   } & {
   [key: string]: 
     | string
     | boolean
     | {
     hour: ...;
   } & {
   [key: ...]: ...;
   };
  };
  disableAudio: boolean;
  disableAutoLink: boolean;
  doorbellSettings?: {
     allMessages: {
        text: ...;
        type: ...;
     }[];
     customImages: string[];
     customMessages: string[];
     defaultMessageResetTimeoutMs: number;
     defaultMessageText: string;
   } & {
   [key: string]: string | number | ...[] | ...[];
  };
  enableAutomaticBackups: boolean;
  enableBridgeAutoAdoption: boolean;
  enableCrashReporting: boolean;
  enableStatsReporting: boolean;
  errorCode: Nullable<string>;
  featureFlags: {
     beta: boolean;
     detectionLabels: boolean;
     dev: boolean;
     hasTwoWayAudioMediaStreams: boolean;
     homekitPaired: boolean;
     notificationsV2: boolean;
     ulpRoleManagement: boolean;
   } & {
   [key: string]: boolean;
  };
  firmwareVersion: string;
  hardwareId: string;
  hardwarePlatform: string;
  hardwareRevision: string;
  hasGateway: boolean;
  host: string;
  hosts: string[];
  hostShortname: string;
  hostType: string;
  id: string;
  isAccessInstalled: boolean;
  isAiReportingEnabled: boolean;
  isAway: boolean;
  isHardware: boolean;
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
  isStation: boolean;
  isStatsGatheringEnabled: boolean;
  isUCoreSetup: boolean;
  isUCoreStacked: boolean;
  isUcoreUpdatable: boolean;
  isUpdating: boolean;
  isWirelessUplinkEnabled: boolean;
  lastSeen: number;
  lastUpdateAt: Nullable<number>;
  locationSettings: {
     isAway: boolean;
     isGeofencingEnabled: boolean;
     latitude: number;
     longitude: number;
     radius: number;
   } & {
   [key: string]: number | boolean;
  };
  mac: string;
  marketName: string;
  maxCameraCapacity: {
   [key: string]: number;
   } & {
   [key: string]: number;
  };
  modelKey: string;
  name?: string;
  network: string;
  ports: {
     aiFeatureConsole: number;
     cameraEvents: number;
     cameraHttps: number;
     cameraTcp: number;
     devicesWss: number;
     discoveryClient: number;
     emsCLI: number;
     emsJsonCLI: number;
     emsLiveFLV: number;
     http: number;
     https: number;
     liveWs: number;
     liveWss: number;
     piongw: number;
     playback: number;
     rtmp: number;
     rtsp: number;
     rtsps: number;
     stacking: number;
     tcpBridge: number;
     tcpStreams: number;
     ucore: number;
     ump: number;
   } & {
   [key: string]: number;
  };
  publicIp: string;
  recordingRetentionDurationMs: string;
  releaseChannel: string;
  skipFirmwareUpdate: boolean;
  smartDetectAgreement: {
     lastUpdateAt: Nullable<number>;
     status: string;
   } & {
   [key: string]: string | Nullable<number>;
  };
  smartDetection: {
     enable: boolean;
     faceRecognition: boolean;
     licensePlateRecognition: boolean;
   } & {
   [key: string]: boolean;
  };
  ssoChannel: Nullable<string>;
  storageStats: {
     capacity: number;
     recordingSpace: {
        available: number;
        total: number;
        used: number;
      } & {
      [key: string]: number;
     };
     remainingCapacity: number;
     storageDistribution: {
        recordingTypeDistributions: ...[];
        resolutionDistributions: ...[];
      } & {
      [key: string]: ... | ...;
     };
     utilization: number;
   } & {
   [key: string]: 
     | number
     | {
     available: ...;
     total: ...;
     used: ...;
   } & {
   [key: ...]: ...;
   }
     | {
     recordingTypeDistributions: ...;
     resolutionDistributions: ...;
   } & {
   [key: ...]: ...;
   };
  };
  streamSharingAvailable: boolean;
  systemInfo: {
     cpu: {
        averageLoad: number;
        temperature: number;
      } & {
      [key: string]: number;
     };
     memory: {
        available: number;
        free: number;
        total: number;
      } & {
      [key: string]: number;
     };
     storage: {
        available: number;
        devices: ...[];
        isRecycling: boolean;
        size: number;
        type: string;
        used: number;
      } & {
      [key: string]: ... | ... | ... | ... | ...;
     };
     tmpfs: {
        available: number;
        path: string;
        total: number;
        used: number;
      } & {
      [key: string]: ... | ...;
     };
   } & {
   [key: string]: 
     | {
     averageLoad: ...;
     temperature: ...;
   } & {
   [key: ...]: ...;
   }
     | {
     available: ...;
     free: ...;
     total: ...;
   } & {
   [key: ...]: ...;
   }
     | {
     available: ...;
     devices: ...;
     isRecycling: ...;
     size: ...;
     type: ...;
     used: ...;
   } & {
   [key: ...]: ...;
   }
     | {
     available: ...;
     path: ...;
     total: ...;
     used: ...;
   } & {
   [key: ...]: ...;
   };
  };
  temperatureUnit: string;
  timeFormat: string;
  timezone: string;
  type: string;
  ucoreVersion: string;
  uiVersion: string;
  upSince: number;
  uptime: number;
  version: string;
  wanIp: string;
  wifiSettings: {
     password: Nullable<string>;
     ssid: Nullable<string>;
     useThirdPartyWifi: boolean;
   } & {
   [key: string]: boolean | Nullable<string>;
  };
} & {
[key: string]: 
  | undefined
  | null
  | string
  | number
  | boolean
  | string[]
  | number[]
  | {
[key: string]: number;
} & {
[key: string]: number;
}
  | {
  qualities: {
     count: ...;
     fraction: ...;
     type: ...;
  }[];
  state: string;
} & {
[key: string]: string | ...[];
}
  | {
  configuredBy: string;
  isAutoUpdateEnabled: boolean;
  schedule: {
     hour: ...;
   } & {
   [key: ...]: ...;
  };
} & {
[key: string]: string | boolean | ... & ...;
}
  | {
  allMessages: {
     text: ...;
     type: ...;
  }[];
  customImages: string[];
  customMessages: string[];
  defaultMessageResetTimeoutMs: number;
  defaultMessageText: string;
} & {
[key: string]: string | number | ...[] | ...[];
}
  | {
  beta: boolean;
  detectionLabels: boolean;
  dev: boolean;
  hasTwoWayAudioMediaStreams: boolean;
  homekitPaired: boolean;
  notificationsV2: boolean;
  ulpRoleManagement: boolean;
} & {
[key: string]: boolean;
}
  | {
  isAway: boolean;
  isGeofencingEnabled: boolean;
  latitude: number;
  longitude: number;
  radius: number;
} & {
[key: string]: number | boolean;
}
  | {
  aiFeatureConsole: number;
  cameraEvents: number;
  cameraHttps: number;
  cameraTcp: number;
  devicesWss: number;
  discoveryClient: number;
  emsCLI: number;
  emsJsonCLI: number;
  emsLiveFLV: number;
  http: number;
  https: number;
  liveWs: number;
  liveWss: number;
  piongw: number;
  playback: number;
  rtmp: number;
  rtsp: number;
  rtsps: number;
  stacking: number;
  tcpBridge: number;
  tcpStreams: number;
  ucore: number;
  ump: number;
} & {
[key: string]: number;
}
  | {
  lastUpdateAt: Nullable<number>;
  status: string;
} & {
[key: string]: string | Nullable<...>;
}
  | {
  enable: boolean;
  faceRecognition: boolean;
  licensePlateRecognition: boolean;
} & {
[key: string]: boolean;
}
  | {
  capacity: number;
  recordingSpace: {
     available: ...;
     total: ...;
     used: ...;
   } & {
   [key: ...]: ...;
  };
  remainingCapacity: number;
  storageDistribution: {
     recordingTypeDistributions: ...;
     resolutionDistributions: ...;
   } & {
   [key: ...]: ...;
  };
  utilization: number;
} & {
[key: string]: number | ... & ... | ... & ...;
}
  | {
  cpu: {
     averageLoad: ...;
     temperature: ...;
   } & {
   [key: ...]: ...;
  };
  memory: {
     available: ...;
     free: ...;
     total: ...;
   } & {
   [key: ...]: ...;
  };
  storage: {
     available: ...;
     devices: ...;
     isRecycling: ...;
     size: ...;
     type: ...;
     used: ...;
   } & {
   [key: ...]: ...;
  };
  tmpfs: {
     available: ...;
     path: ...;
     total: ...;
     used: ...;
   } & {
   [key: ...]: ...;
  };
} & {
[key: string]: ... & ... | ... & ... | ... & ... | ... & ...;
}
  | {
  password: Nullable<string>;
  ssid: Nullable<string>;
  useThirdPartyWifi: boolean;
} & {
[key: string]: boolean | Nullable<...>;
};
};
}>;
```

Access the Protect controller bootstrap JSON.

###### Remarks

The bootstrap must be retrieved via [getBootstrap](#getbootstrap) before accessing this property. The bootstrap contains the complete system state and is automatically
updated when configuration changes occur.

###### See

 - [getBootstrap](#getbootstrap) to retrieve the bootstrap configuration
 - [ProtectNvrBootstrap](ProtectTypes.md#protectnvrbootstrap) for the complete data structure

###### Returns

`Nullable`\<\{
  `accessKey`: `string`;
  `authUserId`: `string`;
  `bridges`: `unknown`[];
  `cameras`: [`ProtectCameraConfigInterface`](ProtectTypes.md#protectcameraconfiginterface)[];
  `chimes`: [`ProtectChimeConfigInterface`](ProtectTypes.md#protectchimeconfiginterface)[];
  `cloudPortalUrl`: `string`;
  `groups`: `unknown`[];
  `lastUpdateId`: `string`;
  `lights`: [`ProtectLightConfigInterface`](ProtectTypes.md#protectlightconfiginterface)[];
  `liveviews`: [`ProtectNvrLiveviewConfigInterface`](ProtectTypes.md#protectnvrliveviewconfiginterface)[];
  `nvr`: \{
     `analyticsData`: `string`;
     `anonymouseDeviceId`: `string`;
     `availableUpdate`: `string`;
     `avgMotions`: `number`[];
     `cameraCapacity`: \{
        `qualities`: \{
           `count`: `number`;
           `fraction`: `number`;
           `type`: `string`;
        \}[];
        `state`: `string`;
      \} & \{
      \[`key`: `string`\]: 
        \| `string`
        \| \{
        `count`: `number`;
        `fraction`: `number`;
        `type`: `string`;
      \}[];
     \};
     `cameraUtilization`: `number`;
     `canAutoUpdate`: `boolean`;
     `consoleEnv`: `string`;
     `corruptionState`: `string`;
     `countryCode`: `string`;
     `deviceFirmwareSettings`: \{
        `configuredBy`: `string`;
        `isAutoUpdateEnabled`: `boolean`;
        `schedule`: \{
           `hour`: `number`;
         \} & \{
         \[`key`: `string`\]: `number`;
        \};
      \} & \{
      \[`key`: `string`\]: 
        \| `string`
        \| `boolean`
        \| \{
        `hour`: `number`;
      \} & \{
      \[`key`: `string`\]: `number`;
      \};
     \};
     `disableAudio`: `boolean`;
     `disableAutoLink`: `boolean`;
     `doorbellSettings?`: \{
        `allMessages`: \{
           `text`: `string`;
           `type`: `string`;
        \}[];
        `customImages`: `string`[];
        `customMessages`: `string`[];
        `defaultMessageResetTimeoutMs`: `number`;
        `defaultMessageText`: `string`;
      \} & \{
      \[`key`: `string`\]: 
        \| `string`
        \| `number`
        \| `string`[]
        \| \{
        `text`: ...;
        `type`: ...;
      \}[];
     \};
     `enableAutomaticBackups`: `boolean`;
     `enableBridgeAutoAdoption`: `boolean`;
     `enableCrashReporting`: `boolean`;
     `enableStatsReporting`: `boolean`;
     `errorCode`: `Nullable`\<`string`\>;
     `featureFlags`: \{
        `beta`: `boolean`;
        `detectionLabels`: `boolean`;
        `dev`: `boolean`;
        `hasTwoWayAudioMediaStreams`: `boolean`;
        `homekitPaired`: `boolean`;
        `notificationsV2`: `boolean`;
        `ulpRoleManagement`: `boolean`;
      \} & \{
      \[`key`: `string`\]: `boolean`;
     \};
     `firmwareVersion`: `string`;
     `hardwareId`: `string`;
     `hardwarePlatform`: `string`;
     `hardwareRevision`: `string`;
     `hasGateway`: `boolean`;
     `host`: `string`;
     `hosts`: `string`[];
     `hostShortname`: `string`;
     `hostType`: `string`;
     `id`: `string`;
     `isAccessInstalled`: `boolean`;
     `isAiReportingEnabled`: `boolean`;
     `isAway`: `boolean`;
     `isHardware`: `boolean`;
     `isInsightsEnabled`: `boolean`;
     `isNetworkInstalled`: `boolean`;
     `isPrimary`: `boolean`;
     `isProtectUpdatable`: `boolean`;
     `isRecordingDisabled`: `boolean`;
     `isRecordingMotionOnly`: `boolean`;
     `isRecycling`: `boolean`;
     `isRemoteAccessEnabled`: `boolean`;
     `isSetup`: `boolean`;
     `isSshEnabled`: `boolean`;
     `isStacked`: `boolean`;
     `isStation`: `boolean`;
     `isStatsGatheringEnabled`: `boolean`;
     `isUCoreSetup`: `boolean`;
     `isUCoreStacked`: `boolean`;
     `isUcoreUpdatable`: `boolean`;
     `isUpdating`: `boolean`;
     `isWirelessUplinkEnabled`: `boolean`;
     `lastSeen`: `number`;
     `lastUpdateAt`: `Nullable`\<`number`\>;
     `locationSettings`: \{
        `isAway`: `boolean`;
        `isGeofencingEnabled`: `boolean`;
        `latitude`: `number`;
        `longitude`: `number`;
        `radius`: `number`;
      \} & \{
      \[`key`: `string`\]: `number` \| `boolean`;
     \};
     `mac`: `string`;
     `marketName`: `string`;
     `maxCameraCapacity`: \{
      \[`key`: `string`\]: `number`;
      \} & \{
      \[`key`: `string`\]: `number`;
     \};
     `modelKey`: `string`;
     `name?`: `string`;
     `network`: `string`;
     `ports`: \{
        `aiFeatureConsole`: `number`;
        `cameraEvents`: `number`;
        `cameraHttps`: `number`;
        `cameraTcp`: `number`;
        `devicesWss`: `number`;
        `discoveryClient`: `number`;
        `emsCLI`: `number`;
        `emsJsonCLI`: `number`;
        `emsLiveFLV`: `number`;
        `http`: `number`;
        `https`: `number`;
        `liveWs`: `number`;
        `liveWss`: `number`;
        `piongw`: `number`;
        `playback`: `number`;
        `rtmp`: `number`;
        `rtsp`: `number`;
        `rtsps`: `number`;
        `stacking`: `number`;
        `tcpBridge`: `number`;
        `tcpStreams`: `number`;
        `ucore`: `number`;
        `ump`: `number`;
      \} & \{
      \[`key`: `string`\]: `number`;
     \};
     `publicIp`: `string`;
     `recordingRetentionDurationMs`: `string`;
     `releaseChannel`: `string`;
     `skipFirmwareUpdate`: `boolean`;
     `smartDetectAgreement`: \{
        `lastUpdateAt`: `Nullable`\<`number`\>;
        `status`: `string`;
      \} & \{
      \[`key`: `string`\]: `string` \| `Nullable`\<`number`\>;
     \};
     `smartDetection`: \{
        `enable`: `boolean`;
        `faceRecognition`: `boolean`;
        `licensePlateRecognition`: `boolean`;
      \} & \{
      \[`key`: `string`\]: `boolean`;
     \};
     `ssoChannel`: `Nullable`\<`string`\>;
     `storageStats`: \{
        `capacity`: `number`;
        `recordingSpace`: \{
           `available`: `number`;
           `total`: `number`;
           `used`: `number`;
         \} & \{
         \[`key`: `string`\]: `number`;
        \};
        `remainingCapacity`: `number`;
        `storageDistribution`: \{
           `recordingTypeDistributions`: \{
              `percentage`: ...;
              `recordingType`: ...;
              `size`: ...;
           \}[];
           `resolutionDistributions`: \{
              `percentage`: ...;
              `recordingType`: ...;
              `size`: ...;
           \}[];
         \} & \{
         \[`key`: `string`\]: ...[] \| ...[];
        \};
        `utilization`: `number`;
      \} & \{
      \[`key`: `string`\]: 
        \| `number`
        \| \{
        `available`: `number`;
        `total`: `number`;
        `used`: `number`;
      \} & \{
      \[`key`: `string`\]: `number`;
      \}
        \| \{
        `recordingTypeDistributions`: ...[];
        `resolutionDistributions`: ...[];
      \} & \{
      \[`key`: `string`\]: ... \| ...;
      \};
     \};
     `streamSharingAvailable`: `boolean`;
     `systemInfo`: \{
        `cpu`: \{
           `averageLoad`: `number`;
           `temperature`: `number`;
         \} & \{
         \[`key`: `string`\]: `number`;
        \};
        `memory`: \{
           `available`: `number`;
           `free`: `number`;
           `total`: `number`;
         \} & \{
         \[`key`: `string`\]: `number`;
        \};
        `storage`: \{
           `available`: `number`;
           `devices`: \{
              `healthy`: ...;
              `model`: ...;
              `size`: ...;
           \}[];
           `isRecycling`: `boolean`;
           `size`: `number`;
           `type`: `string`;
           `used`: `number`;
         \} & \{
         \[`key`: `string`\]: `string` \| `number` \| `boolean` \| ...[];
        \};
        `tmpfs`: \{
           `available`: `number`;
           `path`: `string`;
           `total`: `number`;
           `used`: `number`;
         \} & \{
         \[`key`: `string`\]: `string` \| `number`;
        \};
      \} & \{
      \[`key`: `string`\]: 
        \| \{
        `averageLoad`: `number`;
        `temperature`: `number`;
      \} & \{
      \[`key`: `string`\]: `number`;
      \}
        \| \{
        `available`: `number`;
        `free`: `number`;
        `total`: `number`;
      \} & \{
      \[`key`: `string`\]: `number`;
      \}
        \| \{
        `available`: `number`;
        `devices`: ...[];
        `isRecycling`: `boolean`;
        `size`: `number`;
        `type`: `string`;
        `used`: `number`;
      \} & \{
      \[`key`: `string`\]: ... \| ... \| ... \| ... \| ...;
      \}
        \| \{
        `available`: `number`;
        `path`: `string`;
        `total`: `number`;
        `used`: `number`;
      \} & \{
      \[`key`: `string`\]: ... \| ...;
      \};
     \};
     `temperatureUnit`: `string`;
     `timeFormat`: `string`;
     `timezone`: `string`;
     `type`: `string`;
     `ucoreVersion`: `string`;
     `uiVersion`: `string`;
     `upSince`: `number`;
     `uptime`: `number`;
     `version`: `string`;
     `wanIp`: `string`;
     `wifiSettings`: \{
        `password`: `Nullable`\<`string`\>;
        `ssid`: `Nullable`\<`string`\>;
        `useThirdPartyWifi`: `boolean`;
      \} & \{
      \[`key`: `string`\]: `boolean` \| `Nullable`\<`string`\>;
     \};
   \} & \{
   \[`key`: `string`\]: 
     \| `undefined`
     \| `null`
     \| `string`
     \| `number`
     \| `boolean`
     \| `string`[]
     \| `number`[]
     \| \{
   \[`key`: `string`\]: `number`;
   \} & \{
   \[`key`: `string`\]: `number`;
   \}
     \| \{
     `qualities`: \{
        `count`: `number`;
        `fraction`: `number`;
        `type`: `string`;
     \}[];
     `state`: `string`;
   \} & \{
   \[`key`: `string`\]: 
     \| `string`
     \| \{
     `count`: ...;
     `fraction`: ...;
     `type`: ...;
   \}[];
   \}
     \| \{
     `configuredBy`: `string`;
     `isAutoUpdateEnabled`: `boolean`;
     `schedule`: \{
        `hour`: `number`;
      \} & \{
      \[`key`: `string`\]: `number`;
     \};
   \} & \{
   \[`key`: `string`\]: 
     \| `string`
     \| `boolean`
     \| \{
     `hour`: ...;
   \} & \{
   \[`key`: ...\]: ...;
   \};
   \}
     \| \{
     `allMessages`: \{
        `text`: `string`;
        `type`: `string`;
     \}[];
     `customImages`: `string`[];
     `customMessages`: `string`[];
     `defaultMessageResetTimeoutMs`: `number`;
     `defaultMessageText`: `string`;
   \} & \{
   \[`key`: `string`\]: 
     \| `string`
     \| `number`
     \| `string`[]
     \| \{
     `text`: ...;
     `type`: ...;
   \}[];
   \}
     \| \{
     `beta`: `boolean`;
     `detectionLabels`: `boolean`;
     `dev`: `boolean`;
     `hasTwoWayAudioMediaStreams`: `boolean`;
     `homekitPaired`: `boolean`;
     `notificationsV2`: `boolean`;
     `ulpRoleManagement`: `boolean`;
   \} & \{
   \[`key`: `string`\]: `boolean`;
   \}
     \| \{
     `isAway`: `boolean`;
     `isGeofencingEnabled`: `boolean`;
     `latitude`: `number`;
     `longitude`: `number`;
     `radius`: `number`;
   \} & \{
   \[`key`: `string`\]: `number` \| `boolean`;
   \}
     \| \{
     `aiFeatureConsole`: `number`;
     `cameraEvents`: `number`;
     `cameraHttps`: `number`;
     `cameraTcp`: `number`;
     `devicesWss`: `number`;
     `discoveryClient`: `number`;
     `emsCLI`: `number`;
     `emsJsonCLI`: `number`;
     `emsLiveFLV`: `number`;
     `http`: `number`;
     `https`: `number`;
     `liveWs`: `number`;
     `liveWss`: `number`;
     `piongw`: `number`;
     `playback`: `number`;
     `rtmp`: `number`;
     `rtsp`: `number`;
     `rtsps`: `number`;
     `stacking`: `number`;
     `tcpBridge`: `number`;
     `tcpStreams`: `number`;
     `ucore`: `number`;
     `ump`: `number`;
   \} & \{
   \[`key`: `string`\]: `number`;
   \}
     \| \{
     `lastUpdateAt`: `Nullable`\<`number`\>;
     `status`: `string`;
   \} & \{
   \[`key`: `string`\]: `string` \| `Nullable`\<`number`\>;
   \}
     \| \{
     `enable`: `boolean`;
     `faceRecognition`: `boolean`;
     `licensePlateRecognition`: `boolean`;
   \} & \{
   \[`key`: `string`\]: `boolean`;
   \}
     \| \{
     `capacity`: `number`;
     `recordingSpace`: \{
        `available`: `number`;
        `total`: `number`;
        `used`: `number`;
      \} & \{
      \[`key`: `string`\]: `number`;
     \};
     `remainingCapacity`: `number`;
     `storageDistribution`: \{
        `recordingTypeDistributions`: ...[];
        `resolutionDistributions`: ...[];
      \} & \{
      \[`key`: `string`\]: ... \| ...;
     \};
     `utilization`: `number`;
   \} & \{
   \[`key`: `string`\]: 
     \| `number`
     \| \{
     `available`: ...;
     `total`: ...;
     `used`: ...;
   \} & \{
   \[`key`: ...\]: ...;
   \}
     \| \{
     `recordingTypeDistributions`: ...;
     `resolutionDistributions`: ...;
   \} & \{
   \[`key`: ...\]: ...;
   \};
   \}
     \| \{
     `cpu`: \{
        `averageLoad`: `number`;
        `temperature`: `number`;
      \} & \{
      \[`key`: `string`\]: `number`;
     \};
     `memory`: \{
        `available`: `number`;
        `free`: `number`;
        `total`: `number`;
      \} & \{
      \[`key`: `string`\]: `number`;
     \};
     `storage`: \{
        `available`: `number`;
        `devices`: ...[];
        `isRecycling`: `boolean`;
        `size`: `number`;
        `type`: `string`;
        `used`: `number`;
      \} & \{
      \[`key`: `string`\]: ... \| ... \| ... \| ... \| ...;
     \};
     `tmpfs`: \{
        `available`: `number`;
        `path`: `string`;
        `total`: `number`;
        `used`: `number`;
      \} & \{
      \[`key`: `string`\]: ... \| ...;
     \};
   \} & \{
   \[`key`: `string`\]: 
     \| \{
     `averageLoad`: ...;
     `temperature`: ...;
   \} & \{
   \[`key`: ...\]: ...;
   \}
     \| \{
     `available`: ...;
     `free`: ...;
     `total`: ...;
   \} & \{
   \[`key`: ...\]: ...;
   \}
     \| \{
     `available`: ...;
     `devices`: ...;
     `isRecycling`: ...;
     `size`: ...;
     `type`: ...;
     `used`: ...;
   \} & \{
   \[`key`: ...\]: ...;
   \}
     \| \{
     `available`: ...;
     `path`: ...;
     `total`: ...;
     `used`: ...;
   \} & \{
   \[`key`: ...\]: ...;
   \};
   \}
     \| \{
     `password`: `Nullable`\<`string`\>;
     `ssid`: `Nullable`\<`string`\>;
     `useThirdPartyWifi`: `boolean`;
   \} & \{
   \[`key`: `string`\]: `boolean` \| `Nullable`\<`string`\>;
   \};
  \};
  `ringtones`: [`ProtectRingtoneConfigInterface`](ProtectTypes.md#protectringtoneconfiginterface)[];
  `sensors`: [`ProtectSensorConfigInterface`](ProtectTypes.md#protectsensorconfiginterface)[];
  `users`: [`ProtectNvrUserConfigInterface`](ProtectTypes.md#protectnvruserconfiginterface)[];
  `viewers`: [`ProtectViewerConfigInterface`](ProtectTypes.md#protectviewerconfiginterface)[];
\} & \{
\[`key`: `string`\]: 
  \| `string`
  \| `unknown`[]
  \| [`ProtectCameraConfigInterface`](ProtectTypes.md#protectcameraconfiginterface)[]
  \| [`ProtectChimeConfigInterface`](ProtectTypes.md#protectchimeconfiginterface)[]
  \| [`ProtectLightConfigInterface`](ProtectTypes.md#protectlightconfiginterface)[]
  \| [`ProtectNvrLiveviewConfigInterface`](ProtectTypes.md#protectnvrliveviewconfiginterface)[]
  \| [`ProtectRingtoneConfigInterface`](ProtectTypes.md#protectringtoneconfiginterface)[]
  \| [`ProtectSensorConfigInterface`](ProtectTypes.md#protectsensorconfiginterface)[]
  \| [`ProtectNvrUserConfigInterface`](ProtectTypes.md#protectnvruserconfiginterface)[]
  \| [`ProtectViewerConfigInterface`](ProtectTypes.md#protectviewerconfiginterface)[]
  \| \{
  `analyticsData`: `string`;
  `anonymouseDeviceId`: `string`;
  `availableUpdate`: `string`;
  `avgMotions`: `number`[];
  `cameraCapacity`: \{
     `qualities`: \{
        `count`: `number`;
        `fraction`: `number`;
        `type`: `string`;
     \}[];
     `state`: `string`;
   \} & \{
   \[`key`: `string`\]: 
     \| `string`
     \| \{
     `count`: ...;
     `fraction`: ...;
     `type`: ...;
   \}[];
  \};
  `cameraUtilization`: `number`;
  `canAutoUpdate`: `boolean`;
  `consoleEnv`: `string`;
  `corruptionState`: `string`;
  `countryCode`: `string`;
  `deviceFirmwareSettings`: \{
     `configuredBy`: `string`;
     `isAutoUpdateEnabled`: `boolean`;
     `schedule`: \{
        `hour`: `number`;
      \} & \{
      \[`key`: `string`\]: `number`;
     \};
   \} & \{
   \[`key`: `string`\]: 
     \| `string`
     \| `boolean`
     \| \{
     `hour`: ...;
   \} & \{
   \[`key`: ...\]: ...;
   \};
  \};
  `disableAudio`: `boolean`;
  `disableAutoLink`: `boolean`;
  `doorbellSettings?`: \{
     `allMessages`: \{
        `text`: ...;
        `type`: ...;
     \}[];
     `customImages`: `string`[];
     `customMessages`: `string`[];
     `defaultMessageResetTimeoutMs`: `number`;
     `defaultMessageText`: `string`;
   \} & \{
   \[`key`: `string`\]: `string` \| `number` \| ...[] \| ...[];
  \};
  `enableAutomaticBackups`: `boolean`;
  `enableBridgeAutoAdoption`: `boolean`;
  `enableCrashReporting`: `boolean`;
  `enableStatsReporting`: `boolean`;
  `errorCode`: `Nullable`\<`string`\>;
  `featureFlags`: \{
     `beta`: `boolean`;
     `detectionLabels`: `boolean`;
     `dev`: `boolean`;
     `hasTwoWayAudioMediaStreams`: `boolean`;
     `homekitPaired`: `boolean`;
     `notificationsV2`: `boolean`;
     `ulpRoleManagement`: `boolean`;
   \} & \{
   \[`key`: `string`\]: `boolean`;
  \};
  `firmwareVersion`: `string`;
  `hardwareId`: `string`;
  `hardwarePlatform`: `string`;
  `hardwareRevision`: `string`;
  `hasGateway`: `boolean`;
  `host`: `string`;
  `hosts`: `string`[];
  `hostShortname`: `string`;
  `hostType`: `string`;
  `id`: `string`;
  `isAccessInstalled`: `boolean`;
  `isAiReportingEnabled`: `boolean`;
  `isAway`: `boolean`;
  `isHardware`: `boolean`;
  `isInsightsEnabled`: `boolean`;
  `isNetworkInstalled`: `boolean`;
  `isPrimary`: `boolean`;
  `isProtectUpdatable`: `boolean`;
  `isRecordingDisabled`: `boolean`;
  `isRecordingMotionOnly`: `boolean`;
  `isRecycling`: `boolean`;
  `isRemoteAccessEnabled`: `boolean`;
  `isSetup`: `boolean`;
  `isSshEnabled`: `boolean`;
  `isStacked`: `boolean`;
  `isStation`: `boolean`;
  `isStatsGatheringEnabled`: `boolean`;
  `isUCoreSetup`: `boolean`;
  `isUCoreStacked`: `boolean`;
  `isUcoreUpdatable`: `boolean`;
  `isUpdating`: `boolean`;
  `isWirelessUplinkEnabled`: `boolean`;
  `lastSeen`: `number`;
  `lastUpdateAt`: `Nullable`\<`number`\>;
  `locationSettings`: \{
     `isAway`: `boolean`;
     `isGeofencingEnabled`: `boolean`;
     `latitude`: `number`;
     `longitude`: `number`;
     `radius`: `number`;
   \} & \{
   \[`key`: `string`\]: `number` \| `boolean`;
  \};
  `mac`: `string`;
  `marketName`: `string`;
  `maxCameraCapacity`: \{
   \[`key`: `string`\]: `number`;
   \} & \{
   \[`key`: `string`\]: `number`;
  \};
  `modelKey`: `string`;
  `name?`: `string`;
  `network`: `string`;
  `ports`: \{
     `aiFeatureConsole`: `number`;
     `cameraEvents`: `number`;
     `cameraHttps`: `number`;
     `cameraTcp`: `number`;
     `devicesWss`: `number`;
     `discoveryClient`: `number`;
     `emsCLI`: `number`;
     `emsJsonCLI`: `number`;
     `emsLiveFLV`: `number`;
     `http`: `number`;
     `https`: `number`;
     `liveWs`: `number`;
     `liveWss`: `number`;
     `piongw`: `number`;
     `playback`: `number`;
     `rtmp`: `number`;
     `rtsp`: `number`;
     `rtsps`: `number`;
     `stacking`: `number`;
     `tcpBridge`: `number`;
     `tcpStreams`: `number`;
     `ucore`: `number`;
     `ump`: `number`;
   \} & \{
   \[`key`: `string`\]: `number`;
  \};
  `publicIp`: `string`;
  `recordingRetentionDurationMs`: `string`;
  `releaseChannel`: `string`;
  `skipFirmwareUpdate`: `boolean`;
  `smartDetectAgreement`: \{
     `lastUpdateAt`: `Nullable`\<`number`\>;
     `status`: `string`;
   \} & \{
   \[`key`: `string`\]: `string` \| `Nullable`\<`number`\>;
  \};
  `smartDetection`: \{
     `enable`: `boolean`;
     `faceRecognition`: `boolean`;
     `licensePlateRecognition`: `boolean`;
   \} & \{
   \[`key`: `string`\]: `boolean`;
  \};
  `ssoChannel`: `Nullable`\<`string`\>;
  `storageStats`: \{
     `capacity`: `number`;
     `recordingSpace`: \{
        `available`: `number`;
        `total`: `number`;
        `used`: `number`;
      \} & \{
      \[`key`: `string`\]: `number`;
     \};
     `remainingCapacity`: `number`;
     `storageDistribution`: \{
        `recordingTypeDistributions`: ...[];
        `resolutionDistributions`: ...[];
      \} & \{
      \[`key`: `string`\]: ... \| ...;
     \};
     `utilization`: `number`;
   \} & \{
   \[`key`: `string`\]: 
     \| `number`
     \| \{
     `available`: ...;
     `total`: ...;
     `used`: ...;
   \} & \{
   \[`key`: ...\]: ...;
   \}
     \| \{
     `recordingTypeDistributions`: ...;
     `resolutionDistributions`: ...;
   \} & \{
   \[`key`: ...\]: ...;
   \};
  \};
  `streamSharingAvailable`: `boolean`;
  `systemInfo`: \{
     `cpu`: \{
        `averageLoad`: `number`;
        `temperature`: `number`;
      \} & \{
      \[`key`: `string`\]: `number`;
     \};
     `memory`: \{
        `available`: `number`;
        `free`: `number`;
        `total`: `number`;
      \} & \{
      \[`key`: `string`\]: `number`;
     \};
     `storage`: \{
        `available`: `number`;
        `devices`: ...[];
        `isRecycling`: `boolean`;
        `size`: `number`;
        `type`: `string`;
        `used`: `number`;
      \} & \{
      \[`key`: `string`\]: ... \| ... \| ... \| ... \| ...;
     \};
     `tmpfs`: \{
        `available`: `number`;
        `path`: `string`;
        `total`: `number`;
        `used`: `number`;
      \} & \{
      \[`key`: `string`\]: ... \| ...;
     \};
   \} & \{
   \[`key`: `string`\]: 
     \| \{
     `averageLoad`: ...;
     `temperature`: ...;
   \} & \{
   \[`key`: ...\]: ...;
   \}
     \| \{
     `available`: ...;
     `free`: ...;
     `total`: ...;
   \} & \{
   \[`key`: ...\]: ...;
   \}
     \| \{
     `available`: ...;
     `devices`: ...;
     `isRecycling`: ...;
     `size`: ...;
     `type`: ...;
     `used`: ...;
   \} & \{
   \[`key`: ...\]: ...;
   \}
     \| \{
     `available`: ...;
     `path`: ...;
     `total`: ...;
     `used`: ...;
   \} & \{
   \[`key`: ...\]: ...;
   \};
  \};
  `temperatureUnit`: `string`;
  `timeFormat`: `string`;
  `timezone`: `string`;
  `type`: `string`;
  `ucoreVersion`: `string`;
  `uiVersion`: `string`;
  `upSince`: `number`;
  `uptime`: `number`;
  `version`: `string`;
  `wanIp`: `string`;
  `wifiSettings`: \{
     `password`: `Nullable`\<`string`\>;
     `ssid`: `Nullable`\<`string`\>;
     `useThirdPartyWifi`: `boolean`;
   \} & \{
   \[`key`: `string`\]: `boolean` \| `Nullable`\<`string`\>;
  \};
\} & \{
\[`key`: `string`\]: 
  \| `undefined`
  \| `null`
  \| `string`
  \| `number`
  \| `boolean`
  \| `string`[]
  \| `number`[]
  \| \{
\[`key`: `string`\]: `number`;
\} & \{
\[`key`: `string`\]: `number`;
\}
  \| \{
  `qualities`: \{
     `count`: ...;
     `fraction`: ...;
     `type`: ...;
  \}[];
  `state`: `string`;
\} & \{
\[`key`: `string`\]: `string` \| ...[];
\}
  \| \{
  `configuredBy`: `string`;
  `isAutoUpdateEnabled`: `boolean`;
  `schedule`: \{
     `hour`: ...;
   \} & \{
   \[`key`: ...\]: ...;
  \};
\} & \{
\[`key`: `string`\]: `string` \| `boolean` \| ... & ...;
\}
  \| \{
  `allMessages`: \{
     `text`: ...;
     `type`: ...;
  \}[];
  `customImages`: `string`[];
  `customMessages`: `string`[];
  `defaultMessageResetTimeoutMs`: `number`;
  `defaultMessageText`: `string`;
\} & \{
\[`key`: `string`\]: `string` \| `number` \| ...[] \| ...[];
\}
  \| \{
  `beta`: `boolean`;
  `detectionLabels`: `boolean`;
  `dev`: `boolean`;
  `hasTwoWayAudioMediaStreams`: `boolean`;
  `homekitPaired`: `boolean`;
  `notificationsV2`: `boolean`;
  `ulpRoleManagement`: `boolean`;
\} & \{
\[`key`: `string`\]: `boolean`;
\}
  \| \{
  `isAway`: `boolean`;
  `isGeofencingEnabled`: `boolean`;
  `latitude`: `number`;
  `longitude`: `number`;
  `radius`: `number`;
\} & \{
\[`key`: `string`\]: `number` \| `boolean`;
\}
  \| \{
  `aiFeatureConsole`: `number`;
  `cameraEvents`: `number`;
  `cameraHttps`: `number`;
  `cameraTcp`: `number`;
  `devicesWss`: `number`;
  `discoveryClient`: `number`;
  `emsCLI`: `number`;
  `emsJsonCLI`: `number`;
  `emsLiveFLV`: `number`;
  `http`: `number`;
  `https`: `number`;
  `liveWs`: `number`;
  `liveWss`: `number`;
  `piongw`: `number`;
  `playback`: `number`;
  `rtmp`: `number`;
  `rtsp`: `number`;
  `rtsps`: `number`;
  `stacking`: `number`;
  `tcpBridge`: `number`;
  `tcpStreams`: `number`;
  `ucore`: `number`;
  `ump`: `number`;
\} & \{
\[`key`: `string`\]: `number`;
\}
  \| \{
  `lastUpdateAt`: `Nullable`\<`number`\>;
  `status`: `string`;
\} & \{
\[`key`: `string`\]: `string` \| `Nullable`\<...\>;
\}
  \| \{
  `enable`: `boolean`;
  `faceRecognition`: `boolean`;
  `licensePlateRecognition`: `boolean`;
\} & \{
\[`key`: `string`\]: `boolean`;
\}
  \| \{
  `capacity`: `number`;
  `recordingSpace`: \{
     `available`: ...;
     `total`: ...;
     `used`: ...;
   \} & \{
   \[`key`: ...\]: ...;
  \};
  `remainingCapacity`: `number`;
  `storageDistribution`: \{
     `recordingTypeDistributions`: ...;
     `resolutionDistributions`: ...;
   \} & \{
   \[`key`: ...\]: ...;
  \};
  `utilization`: `number`;
\} & \{
\[`key`: `string`\]: `number` \| ... & ... \| ... & ...;
\}
  \| \{
  `cpu`: \{
     `averageLoad`: ...;
     `temperature`: ...;
   \} & \{
   \[`key`: ...\]: ...;
  \};
  `memory`: \{
     `available`: ...;
     `free`: ...;
     `total`: ...;
   \} & \{
   \[`key`: ...\]: ...;
  \};
  `storage`: \{
     `available`: ...;
     `devices`: ...;
     `isRecycling`: ...;
     `size`: ...;
     `type`: ...;
     `used`: ...;
   \} & \{
   \[`key`: ...\]: ...;
  \};
  `tmpfs`: \{
     `available`: ...;
     `path`: ...;
     `total`: ...;
     `used`: ...;
   \} & \{
   \[`key`: ...\]: ...;
  \};
\} & \{
\[`key`: `string`\]: ... & ... \| ... & ... \| ... & ... \| ... & ...;
\}
  \| \{
  `password`: `Nullable`\<`string`\>;
  `ssid`: `Nullable`\<`string`\>;
  `useThirdPartyWifi`: `boolean`;
\} & \{
\[`key`: `string`\]: `boolean` \| `Nullable`\<...\>;
\};
\};
\}\>

Bootstrap configuration if available, `null` otherwise.

##### createLivestream()

```ts
createLivestream(): ProtectLivestream;
```

Return a new instance of the Protect livestream API.

###### Returns

[`ProtectLivestream`](ProtectLivestream.md#protectlivestream)

New livestream API instance.

###### Remarks

The livestream API provides direct access to camera H.264 fMP4 streams, enabling:

- Real-time video streaming
- Stream recording and processing
- Integration with video processing pipelines
- Low-latency video access

Unlike RTSP streams, livestreams are delivered over WebSockets with minimal latency and don't require additional authentication.

###### Example

Working with livestreams:

```typescript
import { ProtectApi, ProtectLivestream } from "unifi-protect";
import { createWriteStream } from "fs";

const protect = new ProtectApi();

async function recordLivestream(cameraId: string, durationMs: number) {
  await protect.login("192.168.1.1", "admin", "password");
  await protect.getBootstrap();

  // Create a livestream instance
  const livestream = protect.createLivestream();

  // Start the livestream
  const camera = protect.bootstrap?.cameras.find(c => c.id === cameraId);
  if (!camera) return;

  // The livestream can be piped to a file, processed, or streamed elsewhere
  const output = createWriteStream(`recording-${Date.now()}.mp4`);

  // Start streaming (implementation depends on ProtectLivestream class)
  await livestream.start(camera, output);

  // Stop after duration
  setTimeout(() => {
    livestream.stop();
    console.log("Recording complete");
  }, durationMs);
}
```

##### getApiEndpoint()

```ts
getApiEndpoint(endpoint): string;
```

Return an API endpoint URL for the requested endpoint type.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `endpoint` | `string` | Endpoint type to retrieve |

###### Returns

`string`

Full URL to the requested endpoint, or empty string if invalid.

###### Remarks

Generates properly formatted URLs for Protect API endpoints:

| Endpoint | Path | Description |
|----------|------|-------------|
| `bootstrap` | `/api/bootstrap` | Complete system configuration |
| `camera` | `/api/cameras` | Camera management |
| `chime` | `/api/chimes` | Chime device management |
| `light` | `/api/lights` | Light device management |
| `login` | `/api/auth/login` | Authentication endpoint |
| `nvr` | `/api/nvr` | NVR configuration |
| `self` | `/api/users/self` | Current user information |
| `sensor` | `/api/sensors` | Sensor device management |
| `websocket` | `/api/ws` | WebSocket endpoints |
| `viewer` | `/api/viewers` | Viewport device management |

###### Example

Building custom API URLs:

```typescript
import { ProtectApi } from "unifi-protect";

const protect = new ProtectApi();

async function customEndpoints() {
  await protect.login("192.168.1.1", "admin", "password");

  // Get base endpoints
  const cameraEndpoint = protect.getApiEndpoint("camera");
  // Returns: "https://192.168.1.1/proxy/protect/api/cameras"

  // Build specific camera URL
  const cameraId = "abc123";
  const specificCamera = `${cameraEndpoint}/${cameraId}`;

  // Make custom request
  const response = await protect.retrieve(specificCamera);
  if (response) {
    const camera = await response.body.json();
    console.log(`Camera: ${camera.name}`);
  }
}
```

##### getBootstrap()

```ts
getBootstrap(): Promise<boolean>;
```

Retrieve the bootstrap JSON from a UniFi Protect controller.

###### Returns

`Promise`\<`boolean`\>

Promise resolving to `true` on success, `false` on failure.

 bootstrap - Emitted with the complete [ProtectNvrBootstrap](ProtectTypes.md#protectnvrbootstrap) configuration when successfully retrieved. The bootstrap contains all device configurations,
                   user accounts, system settings, and current device states.
 message   - Once the bootstrap is retrieved, the WebSocket connection is established and this event will be emitted for each real-time update packet received
                   from the controller.

###### Remarks

The bootstrap contains the complete state of the Protect controller, including:

- All device configurations (cameras, lights, sensors, etc.)
- User accounts and permissions
- System settings and capabilities
- Current device states and health

This method automatically:

- Reconnects if the session has expired
- Establishes WebSocket connections for real-time events
- Determines administrative privileges
- Emits a `bootstrap` event with the configuration

###### Example

Working with bootstrap data:

```typescript
import { ProtectApi, ProtectCameraConfig } from "unifi-protect";

const protect = new ProtectApi();

async function analyzeSystem() {
  // Login and bootstrap
  await protect.login("192.168.1.1", "admin", "password");
  await protect.getBootstrap();

  // Access the bootstrap data
  const bootstrap = protect.bootstrap;
  if (!bootstrap) return;

  // System information
  console.log(`NVR: ${bootstrap.nvr.name}`);
  console.log(`Version: ${bootstrap.nvr.version}`);
  console.log(`Uptime: ${bootstrap.nvr.uptime} seconds`);

  // Device inventory
  console.log(`Cameras: ${bootstrap.cameras.length}`);
  console.log(`Lights: ${bootstrap.lights.length}`);
  console.log(`Sensors: ${bootstrap.sensors.length}`);

  // Find specific devices
  const doorbells = bootstrap.cameras.filter(cam =>
    cam.featureFlags.isDoorbell
  );

  const motionSensors = bootstrap.sensors.filter(sensor =>
    sensor.type === "motion"
  );

  // Check recording status
  const recording = bootstrap.cameras.filter(cam =>
    cam.isRecording && cam.isConnected
  );

  console.log(`${recording.length} cameras actively recording`);
}
```

##### getSnapshot()

```ts
getSnapshot(device, options): Promise<Nullable<Buffer<ArrayBufferLike>>>;
```

Retrieve a snapshot image from a Protect camera.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `device` | [`ProtectCameraConfigInterface`](ProtectTypes.md#protectcameraconfiginterface) | Protect camera device |
| `options` | `Partial`\<\{ `height`: `number`; `usePackageCamera`: `boolean`; `width`: `number`; \}\> | Snapshot configuration options |

###### Returns

`Promise`\<`Nullable`\<`Buffer`\<`ArrayBufferLike`\>\>\>

Promise resolving to a Buffer containing the JPEG image, or `null` on failure.

###### Remarks

Snapshots are generated on-demand by the Protect controller. The image quality and resolution depend on the camera's capabilities and current settings. Package
camera snapshots are only available on devices with dual cameras (e.g., G4 Doorbell Pro).

The `options` parameter accepts:

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| `width` | `number` | Requested image width in pixels | Camera default |
| `height` | `number` | Requested image height in pixels | Camera default |
| `usePackageCamera` | `boolean` | Use package camera if available | `false` |

###### Example

Capturing and saving snapshots:

```typescript
import { ProtectApi } from "unifi-protect";
import { writeFile } from "fs/promises";

const protect = new ProtectApi();

async function captureSnapshots() {
  await protect.login("192.168.1.1", "admin", "password");
  await protect.getBootstrap();

  const cameras = protect.bootstrap?.cameras ?? [];

  for (const camera of cameras) {
    // Full resolution snapshot
    const fullRes = await protect.getSnapshot(camera);

    // Thumbnail snapshot
    const thumbnail = await protect.getSnapshot(camera, {
      width: 640,
      height: 360
    });

    // Package camera snapshot (if available)
    if (camera.featureFlags.hasPackageCamera) {
      const packageSnap = await protect.getSnapshot(camera, {
        usePackageCamera: true
      });

      if (packageSnap) {
        await writeFile(`${camera.name}-package.jpg`, packageSnap);
      }
    }

    if (fullRes && thumbnail) {
      await writeFile(`${camera.name}-full.jpg`, fullRes);
      await writeFile(`${camera.name}-thumb.jpg`, thumbnail);
      console.log(`Saved snapshots for ${camera.name}`);
    }
  }
}
```

##### getWsEndpoint()

```ts
getWsEndpoint(endpoint, params?): Promise<Nullable<string>>;
```

Return a websocket API endpoint for the requested endpoint type.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `endpoint` | `"livestream"` \| `"talkback"` | Endpoint type (`livestream` or `talkback`) |
| `params?` | `URLSearchParams` | URL parameters for the endpoint |

###### Returns

`Promise`\<`Nullable`\<`string`\>\>

Promise resolving to the WebSocket URL, or `null` on failure.

###### Remarks

This method provides access to real-time WebSocket endpoints:

### Livestream Endpoint
Returns a WebSocket URL for H.264 fMP4 video streams. **Do not use directly** - use [createLivestream](#createlivestream) instead for proper stream handling.

### Talkback Endpoint
Creates a two-way audio connection to cameras with speakers (doorbells, two-way audio cameras). The WebSocket accepts AAC-encoded ADTS audio streams.

Required parameter:

- `camera`: The camera ID to connect to

###### Example

Setting up two-way audio:

```typescript
import { ProtectApi } from "unifi-protect";
import { WebSocket } from "ws";

const protect = new ProtectApi();

async function setupTalkback(cameraId: string) {
  await protect.login("192.168.1.1", "admin", "password");

  // Get the talkback endpoint
  const params = new URLSearchParams({ camera: cameraId });
  const wsUrl = await protect.getWsEndpoint("talkback", params);

  if (!wsUrl) {
    console.error("Failed to get talkback endpoint");
    return;
  }

  // Connect to the WebSocket
  const ws = new WebSocket(wsUrl);

  ws.on("open", () => {
    console.log("Talkback connection established");
    // Send AAC-encoded audio data
    // ws.send(aacAudioBuffer);
  });

  ws.on("error", (error) => {
    console.error("Talkback error:", error);
  });
}
```

##### retrieve()

```ts
retrieve(
   url, 
   options, 
retrieveOptions): Promise<Nullable<ResponseData<unknown>>>;
```

Execute an HTTP request to the Protect controller.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `url` | `string` | Full URL to request (e.g., `https://192.168.1.1/proxy/protect/api/cameras`) |
| `options` | [`RequestOptions`](#requestoptions) | Undici-compatible request options |
| `retrieveOptions` | [`RetrieveOptions`](#retrieveoptions) | Additional options for error handling and timeouts |

###### Returns

`Promise`\<`Nullable`\<`ResponseData`\<`unknown`\>\>\>

Promise resolving to the Response object, or `null` on failure.

###### Remarks

This method provides direct access to the Protect controller API for advanced use cases
not covered by the built-in methods. It handles:

- Authentication and session management
- Automatic retry with exponential backoff
- Error logging and throttling
- CSRF token management

The `options` parameter extends [Undici's RequestOptions](https://undici.nodejs.org/#/docs/api/Dispatcher.md?id=parameter-requestoptions), providing full control
over the HTTP request.

###### Example

Making custom API calls:

```typescript
import { ProtectApi } from "unifi-protect";

const protect = new ProtectApi();

async function customApiCalls() {
  await protect.login("192.168.1.1", "admin", "password");

  // Get events from the last hour
  const end = Date.now();
  const start = end - (60 * 60 * 1000);

  const response = await protect.retrieve(
    `https://192.168.1.1/proxy/protect/api/events?start=${start}&end=${end}`,
    { method: "GET" }
  );

  if (response) {
    const events = await response.body.json();
    console.log(`Found ${events.length} events`);
  }

  // Download a video clip
  const videoResponse = await protect.retrieve(
    `https://192.168.1.1/proxy/protect/api/video/export`,
    {
      method: "POST",
      body: JSON.stringify({
        camera: "camera-id",
        start: start,
        end: end,
        type: "timelapse"
      })
    },
    {
      timeout: 30000 // 30 second timeout for video export
    }
  );

  if (videoResponse) {
    const videoBuffer = Buffer.from(await videoResponse.body.arrayBuffer());
    // Save or process the video
  }
}
```

##### updateDevice()

```ts
updateDevice<DeviceType>(device, payload): Promise<Nullable<DeviceType>>;
```

Update a Protect device's configuration on the UniFi Protect controller.

###### Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| `DeviceType` *extends* [`ProtectKnownDeviceTypes`](#protectknowndevicetypes) | Generic for any known Protect device type |

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `device` | `DeviceType` | Protect device to update |
| `payload` | [`ProtectKnownDevicePayloads`](#protectknowndevicepayloads) | Configuration changes to apply |

###### Returns

`Promise`\<`Nullable`\<`DeviceType`\>\>

Promise resolving to the updated device configuration, or `null` on failure.

###### Remarks

This method applies configuration changes to any Protect device. Common modifications include:

- Camera settings (name, recording modes, motion zones)
- Light settings (brightness, motion activation)
- Sensor settings (sensitivity, mount type)
- Chime settings (volume, ringtones)

**Important**: Most configuration changes require administrative privileges. The user account must have the Super Admin role assigned in UniFi Protect.

Changes are applied immediately and persist across device reboots. The method returns the complete updated device configuration, reflecting any server-side
adjustments.

###### Example

Common device configuration scenarios:

```typescript
import { ProtectApi, ProtectCameraConfig } from "unifi-protect";

const protect = new ProtectApi();

async function configureDevices() {
  await protect.login("192.168.1.1", "admin", "password");
  await protect.getBootstrap();

  const camera = protect.bootstrap?.cameras[0];
  if (!camera) return;

  // Update camera name and recording settings
  const updatedCamera = await protect.updateDevice(camera, {
    name: "Front Door Camera",
    recordingSettings: {
      mode: "always",
      prePaddingSecs: 3,
      postPaddingSecs: 3,
      retentionDurationMs: 7 * 24 * 60 * 60 * 1000 // 7 days
    }
  });

  // Configure motion detection
  await protect.updateDevice(camera, {
    motionSettings: {
      mode: "always",
      sensitivity: 80
    },
    smartDetectSettings: {
      objectTypes: ["person", "vehicle"],
      autoTrackingEnabled: true
    }
  });

  // Update light device
  const light = protect.bootstrap?.lights[0];
  if (light) {
    await protect.updateDevice(light, {
      lightSettings: {
        mode: "motion",
        brightness: 100,
        durationMs: 15000 // 15 seconds
      }
    });
  }

  // Configure doorbell chime
  const chime = protect.bootstrap?.chimes[0];
  if (chime) {
    await protect.updateDevice(chime, {
      volume: 75,
      ringtones: ["traditional"]
    });
  }
}
```

#### Utilities

##### isAdminUser

###### Get Signature

```ts
get isAdminUser(): boolean;
```

Check if the current user has administrative privileges.

###### Remarks

Administrative privileges are required for:

- Modifying device configurations
- Enabling/disabling RTSP streams
- Changing system settings
- Managing user accounts

The privilege level is determined during login and updated on each bootstrap.

###### Returns

`boolean`

`true` if the user has Super Admin role, `false` otherwise.

##### isThrottled

###### Get Signature

```ts
get isThrottled(): boolean;
```

Check if API calls are currently throttled due to errors.

###### Remarks

The API implements automatic throttling after repeated errors to prevent overwhelming the controller. During throttling:

- API calls return `null` immediately
- No network requests are made
- Throttling automatically clears after the retry interval

Default throttling occurs after 10 consecutive errors for 5 minutes.

###### Returns

`boolean`

`true` if throttled, `false` otherwise.

##### name

###### Get Signature

```ts
get name(): string;
```

Get a formatted name for the Protect controller.

###### Remarks

Returns a human-readable controller identifier. After bootstrap, includes the controller's configured name and model type. Before bootstrap, returns the network
address used for connection.

###### Example

```typescript
// Before bootstrap: "192.168.1.1"
// After bootstrap: "Dream Machine Pro [UDMP]"
console.log(protect.name);
```

###### Returns

`string`

Controller name in format: `Name [Type]` or just the address if not bootstrapped.

##### enableRtsp()

```ts
enableRtsp(device): Promise<Nullable<ProtectCameraConfigInterface>>;
```

Utility method that enables all RTSP channels on a given Protect camera.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `device` | [`ProtectCameraConfigInterface`](ProtectTypes.md#protectcameraconfiginterface) | Protect camera to modify |

###### Returns

`Promise`\<`Nullable`\<[`ProtectCameraConfigInterface`](ProtectTypes.md#protectcameraconfiginterface)\>\>

Promise resolving to the updated camera configuration, or `null` on failure.

###### Remarks

RTSP (Real Time Streaming Protocol) streams allow third-party applications to access camera feeds directly. This method enables RTSP on all available
channels (resolutions) for a camera, making them accessible at:

- High: `rtsp://[NVR_IP]:7447/[CAMERA_GUID]_0`
- Medium: `rtsp://[NVR_IP]:7447/[CAMERA_GUID]_1`
- Low: `rtsp://[NVR_IP]:7447/[CAMERA_GUID]_2`

**Note**: Enabling RTSP requires Super Admin privileges in UniFi Protect.

###### Example

Enabling RTSP streams for integration:

```typescript
import { ProtectApi } from "unifi-protect";

const protect = new ProtectApi();

async function setupRtspStreams() {
  await protect.login("192.168.1.1", "admin", "password");
  await protect.getBootstrap();

  const cameras = protect.bootstrap?.cameras ?? [];

  for (const camera of cameras) {
    const updated = await protect.enableRtsp(camera);

    if (updated) {
      console.log(`RTSP enabled for ${camera.name}`);

      // Display RTSP URLs
      updated.channels.forEach((channel, index) => {
        if (channel.isRtspEnabled) {
          const rtspUrl = `rtsp://192.168.1.1:7447/${channel.rtspAlias}`;
          console.log(`  Channel ${index}: ${rtspUrl}`);
        }
      });
    } else {
      console.log(`Failed to enable RTSP for ${camera.name}`);
    }
  }
}
```

##### getDeviceName()

```ts
getDeviceName(
   device, 
   name, 
   deviceInfo): string;
```

Utility method that generates a nicely formatted device information string.

###### Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `device` | [`ProtectKnownDeviceTypes`](#protectknowndevicetypes) | `undefined` | Protect device |
| `name` | `undefined` \| `string` | `device.name` | Custom name to use (defaults to device name) |
| `deviceInfo` | `boolean` | `false` | Include IP and MAC address information |

###### Returns

`string`

Formatted device string.

###### Remarks

Returns device information in a consistent, readable format:

- Basic: `Device Name [Device Type]`
- With info: `Device Name [Device Type] (address: IP mac: MAC)`

This method handles all Protect device types and gracefully handles missing information.

###### Example

Formatting device information:

```typescript
import { ProtectApi } from "unifi-protect";

const protect = new ProtectApi();

async function listDevices() {
  await protect.login("192.168.1.1", "admin", "password");
  await protect.getBootstrap();

  // List all devices with full information
  const allDevices = [
    ...(protect.bootstrap?.cameras ?? []),
    ...(protect.bootstrap?.lights ?? []),
    ...(protect.bootstrap?.sensors ?? []),
    ...(protect.bootstrap?.chimes ?? []),
    ...(protect.bootstrap?.viewers ?? [])
  ];

  allDevices.forEach(device => {
    // Basic format
    console.log(protect.getDeviceName(device));
    // Output: "Front Door [G4 Doorbell Pro]"

    // With network info
    console.log(protect.getDeviceName(device, device.name, true));
    // Output: "Front Door [G4 Doorbell Pro] (address: 192.168.1.50 mac: 00:00:00:00:00:00)"

    // Custom name
    console.log(protect.getDeviceName(device, "Custom Name"));
    // Output: "Custom Name [G4 Doorbell Pro]"
  });
}
```

##### getFullName()

```ts
getFullName(device): string;
```

Utility method that generates a combined device and controller information string.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `device` | [`ProtectKnownDeviceTypes`](#protectknowndevicetypes) | Protect device |

###### Returns

`string`

Formatted string including both controller and device information.

###### Remarks

Combines controller and device information for complete context: `Controller Name [Controller Type] Device Name [Device Type]`

Useful for logging and multi-controller environments where device context is important.

###### Example

Logging with full context:

```typescript
import { ProtectApi } from "unifi-protect";

const protect = new ProtectApi();

async function monitorDevices() {
  await protect.login("192.168.1.1", "admin", "password");
  await protect.getBootstrap();

  protect.on("message", (packet) => {
    const device = protect.bootstrap?.cameras.find(
      c => c.id === packet.header.id
    );

    if (device) {
      // Logs: "Dream Machine Pro [UDMP] Front Door [G4 Doorbell Pro]"
      console.log(`${protect.getFullName(device)}: ${packet.header.action}`);
    }
  });
}
```

##### reset()

```ts
reset(): void;
```

Terminate any open connection to the UniFi Protect API.

###### Returns

`void`

###### Remarks

Performs a clean shutdown of all API connections:

- Closes WebSocket connections
- Destroys the HTTP connection pool
- Clears cached bootstrap data
- Resets authentication state

Call this method when shutting down your application or switching controllers. The API can be reused after reset by calling [login](#login) again.

###### Example

Proper cleanup:

```typescript
import { ProtectApi } from "unifi-protect";

const protect = new ProtectApi();

async function main() {
  try {
    await protect.login("192.168.1.1", "admin", "password");
    await protect.getBootstrap();

    // Do work...

  } finally {
    // Always clean up connections
    protect.reset();
  }
}

// Handle process termination
process.on("SIGINT", () => {
  protect.reset();
  process.exit(0);
});
```

##### responseOk()

```ts
responseOk(code?): boolean;
```

Determines whether an HTTP status code represents a successful response.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `code?` | `number` | HTTP status code to check |

###### Returns

`boolean`

`true` if code is 2xx, `false` otherwise.

###### Remarks

Validates HTTP response codes according to standard conventions:

- 2xx codes (200-299) indicate success
- All other codes indicate failure
- `undefined` is treated as failure

###### Example

Response validation:

```typescript
import { ProtectApi } from "unifi-protect";

const protect = new ProtectApi();

async function validateResponses() {
  const response = await protect.retrieve(
    "https://192.168.1.1/proxy/protect/api/cameras"
  );

  if (response && protect.responseOk(response.statusCode)) {
    console.log("Request successful");
    const data = await response.body.json();
    // Process data...
  } else {
    console.error(`Request failed: ${response?.statusCode}`);
  }
}
```

#### Authentication

##### login()

```ts
login(
   nvrAddress, 
   username, 
password): Promise<boolean>;
```

Execute a login attempt to the UniFi Protect API.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `nvrAddress` | `string` | Address of the UniFi Protect controller (FQDN or IP address) |
| `username` | `string` | Username for authentication |
| `password` | `string` | Password for authentication |

###### Returns

`Promise`\<`boolean`\>

Promise resolving to `true` on success, `false` on failure.

 login      - Emitted with `true` if authentication succeeds, `false` if it fails. The event fires after every login attempt, regardless of outcome.

###### Remarks

This method performs the following actions:

- Terminates any existing sessions
- Acquires CSRF tokens for API security
- Establishes cookie-based authentication
- Emits a `login` event with the result

The method automatically handles UniFi OS CSRF protection and maintains session state for subsequent API calls. Administrative privileges are determined during
login and cached for the session duration.

###### Example

Multiple authentication patterns:

```typescript
import { ProtectApi } from "unifi-protect";

const protect = new ProtectApi();

// Pattern 1: Using async/await
async function connectWithAwait() {
  const success = await protect.login("192.168.1.1", "admin", "password");
  if (success) {
    console.log("Connected successfully");
  }
}

// Pattern 2: Using event listeners
function connectWithEvents() {
  protect.once("login", (success: boolean) => {
    if (success) {
      console.log("Connected successfully");
      // Continue with bootstrap
      protect.getBootstrap();
    }
  });

  protect.login("192.168.1.1", "admin", "password");
}

// Pattern 3: With retry logic
async function connectWithRetry(maxAttempts = 3) {
  for (let i = 0; i < maxAttempts; i++) {
    if (await protect.login("192.168.1.1", "admin", "password")) {
      return true;
    }
    console.log(`Login attempt ${i + 1} failed, retrying...`);
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  return false;
}
```

##### logout()

```ts
logout(): void;
```

Clear login credentials and terminate all API connections.

###### Returns

`void`

###### Remarks

Performs a complete logout:

- Clears authentication tokens and cookies
- Terminates all active connections
- Resets user privilege status
- Preserves CSRF token for future logins

After logout, a new [login](#login) call is required to use the API again.

###### Example

Switching between controllers:

```typescript
import { ProtectApi } from "unifi-protect";

const protect = new ProtectApi();

async function switchControllers() {
  // Connect to first controller
  await protect.login("192.168.1.1", "admin", "password1");
  await protect.getBootstrap();
  console.log(`Connected to ${protect.name}`);

  // Switch to second controller
  protect.logout();

  await protect.login("192.168.2.1", "admin", "password2");
  await protect.getBootstrap();
  console.log(`Connected to ${protect.name}`);
}
```
