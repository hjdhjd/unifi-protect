/* Copyright(C) 2019-2025, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * protect-api.ts: Our UniFi Protect API implementation.
 */

/**
 * A complete implementation of the UniFi Protect API, providing comprehensive access to UniFi Protect controllers.
 *
 * ## Overview
 *
 * This module provides a high-performance, event-driven interface to the UniFi Protect API, enabling full access to
 * Protect's rich ecosystem of security devices and capabilities. The API has been reverse-engineered through careful
 * analysis of the Protect web interface and extensive testing, as Ubiquiti does not provide official documentation.
 *
 * ## Key Features
 *
 * - **Complete Device Support**: Cameras, lights, sensors, chimes, viewers, and the NVR itself
 * - **Real-time Events**: WebSocket-based event streaming for instant notifications
 * - **Livestream Access**: Direct H.264 fMP4 stream access, not just RTSP
 * - **Robust Error Handling**: Automatic retry logic with exponential backoff
 * - **Type Safety**: Full TypeScript support with comprehensive type definitions
 *
 * ## Quick Start
 *
 * ```typescript
 * import { ProtectApi } from "unifi-protect";
 *
 * // Create an API instance
 * const protect = new ProtectApi();
 *
 * // Login to your Protect controller
 * await protect.login("192.168.1.1", "username", "password");
 *
 * // Bootstrap to get the current state
 * await protect.getBootstrap();
 *
 * // Access your devices
 * const cameras = protect.bootstrap?.cameras ?? [];
 * console.log(`Found ${cameras.length} cameras`);
 *
 * // Listen for real-time events
 * protect.on("message", (packet) => {
 *   console.log("Event received:", packet);
 * });
 * ```
 *
 * ## Architecture
 *
 * The API is built on modern Node.js technologies:
 * - **Undici**: High-performance HTTP/1.1 and HTTP/2 client
 * - **WebSockets**: Real-time bidirectional communication
 * - **EventEmitter**: Node.js event-driven architecture
 *
 * ## Authentication
 *
 * The API uses cookie-based authentication with CSRF token protection, mimicking the Protect web interface.
 * Administrative privileges are required for configuration changes, while read-only access is available to all users.
 *
 * @module ProtectApi
 */
import { Agent, type Dispatcher, type ErrorEvent, type MessageEvent, Pool, WebSocket, errors, interceptors, request } from "undici";
import type { Nullable, ProtectCameraChannelConfigInterface, ProtectCameraConfig, ProtectCameraConfigInterface, ProtectCameraConfigPayload, ProtectChimeConfig,
  ProtectChimeConfigPayload, ProtectLightConfig, ProtectLightConfigPayload, ProtectNvrBootstrap, ProtectNvrConfig, ProtectNvrConfigPayload, ProtectNvrUserConfig,
  ProtectSensorConfig, ProtectSensorConfigPayload, ProtectViewerConfig, ProtectViewerConfigPayload } from "./protect-types.js";
import { PROTECT_API_ERROR_LIMIT, PROTECT_API_RETRY_INTERVAL, PROTECT_API_TIMEOUT } from "./settings.js";
import { EventEmitter } from "node:events";
import { ProtectApiEvents } from "./protect-api-events.js";
import { ProtectLivestream } from "./protect-api-livestream.js";
import type { ProtectLogging } from "./protect-logging.js";
import { STATUS_CODES } from "node:http";
import util from "node:util";

/**
 * Define our known Protect device types.
 */
export type ProtectKnownDeviceTypes = ProtectCameraConfig | ProtectChimeConfig | ProtectLightConfig | ProtectNvrConfig |
  ProtectSensorConfig | ProtectViewerConfig;

/**
 * Define our known Protect device payload types.
 */
export type ProtectKnownDevicePayloads = ProtectCameraConfigPayload | ProtectChimeConfigPayload | ProtectLightConfigPayload | ProtectNvrConfigPayload |
  ProtectSensorConfigPayload | ProtectViewerConfigPayload;

/**
 * Configuration options for HTTP requests executed by `retrieve()`.
 *
 * @remarks Extends Undici’s [`Dispatcher.RequestOptions`](https://undici.nodejs.org/#/docs/api/Dispatcher.md?id=parameter-requestoptions), but omits the `origin` and
 * `path` properties, since those are derived from the `url` argument passed to `retrieve()`. You can optionally supply a custom `Dispatcher` instance to control
 * connection pooling, timeouts, etc.
 */
export type RequestOptions = {

  /**
   * Optional custom Undici `Dispatcher` instance to use for this request. If omitted, the native `unifi-protect` dispatcher is used, which should be suitable for most
   * use cases.
   */
  dispatcher?: Dispatcher;
} & Omit<Dispatcher.RequestOptions, "origin" | "path">;

/**
 * Options to tailor the behavior of {@link ProtectApi.retrieve}.
 *
 * @property {boolean} [logErrors=true] - Log errors. Defaults to `true`.
 * @property {number} [timeout=3500] - Amount of time, in milliseconds, to wait for the Protect controller to respond before timing out. Defaults to `3500`.
 */
export interface RetrieveOptions {

  logErrors?: boolean;
  timeout?: number;
}

// Our private interface to retrieve.
interface InternalRetrieveOptions extends RetrieveOptions {

  decodeResponse?: boolean;
}

/**
 * This class provides an event-driven API to access the UniFi Protect API.
 *
 * ## Getting Started
 *
 * To begin using the API, follow these three essential steps:
 *
 * 1. **Login**: Authenticate with the Protect controller using {@link login}
 * 2. **Bootstrap**: Retrieve the controller configuration with {@link getBootstrap}
 * 3. **Listen**: Subscribe to real-time events via the `message` event
 *
 * ## Events
 *
 * The API emits several events during its lifecycle:
 *
 * | Event | Payload | Description |
 * |-------|---------|-------------|
 * | `login` | `boolean` | Emitted after each login attempt with success status |
 * | `bootstrap` | {@link ProtectNvrBootstrap} | Emitted when bootstrap data is retrieved |
 * | `message` | {@link ProtectApiEvents.ProtectEventPacket} | Real-time event packets from the controller |
 *
 * ## Connection Management
 *
 * The API automatically manages connection pooling and implements intelligent retry logic:
 * - Up to 5 concurrent connections
 * - Automatic retry with exponential backoff
 * - Throttling after repeated failures
 * - Graceful WebSocket reconnection
 *
 * ## Error Handling
 *
 * All API methods implement comprehensive error handling:
 * - Network errors are logged and retried
 * - Authentication failures trigger re-login attempts
 * - Server errors are handled gracefully
 * - Detailed logging for debugging
 *
 * @event login     - Emitted after each login attempt with the success status as a boolean value. This event fires whether the login succeeds or fails, allowing
 *                    applications to respond appropriately to authentication state changes.
 * @event bootstrap - Emitted when bootstrap data is successfully retrieved from the controller. The event includes the complete {@link ProtectNvrBootstrap}
 *                    configuration object containing all device states and system settings.
 * @event message   - Emitted for each real-time event packet received from the controller's WebSocket connection. The event includes a
 *                    {@link ProtectApiEvents.ProtectEventPacket} containing device updates, motion events, and other system notifications.
 *
 * @example
 * Complete example with error handling and event processing:
 *
 * ```typescript
 * import { ProtectApi, ProtectCameraConfig } from "unifi-protect";
 *
 * class ProtectManager {
 *   private api: ProtectApi;
 *
 *   constructor() {
 *     this.api = new ProtectApi();
 *     this.setupEventHandlers();
 *   }
 *
 *   private setupEventHandlers(): void {
 *     // Handle login events
 *     this.api.on("login", (success: boolean) => {
 *       console.log(success ? "Login successful" : "Login failed");
 *     });
 *
 *     // Process real-time events
 *     this.api.on("message", (packet) => {
 *       if (packet.header.modelKey === "camera") {
 *         console.log("Camera event:", packet);
 *       }
 *     });
 *   }
 *
 *   async connect(host: string, username: string, password: string): Promise<boolean> {
 *     try {
 *       // Login to the controller
 *       if (!await this.api.login(host, username, password)) {
 *         throw new Error("Authentication failed");
 *       }
 *
 *       // Bootstrap the configuration
 *       if (!await this.api.getBootstrap()) {
 *         throw new Error("Bootstrap failed");
 *       }
 *
 *       console.log(`Connected to ${this.api.name}`);
 *       return true;
 *
 *     } catch (error) {
 *       console.error("Connection failed:", error);
 *       return false;
 *     }
 *   }
 *
 *   async enableAllRtspStreams(): Promise<void> {
 *     const cameras = this.api.bootstrap?.cameras ?? [];
 *
 *     for (const camera of cameras) {
 *       const updated = await this.api.enableRtsp(camera);
 *       if (updated) {
 *         console.log(`RTSP enabled for ${this.api.getDeviceName(camera)}`);
 *       }
 *     }
 *   }
 * }
 * ```
 */
export class ProtectApi extends EventEmitter {

  private _bootstrap: Nullable<ProtectNvrBootstrap>;
  private _eventsWs: Nullable<WebSocket>;

  private apiErrorCount: number;
  private apiLastSuccess: number;
  private dispatcher?: Dispatcher;
  private headers: Partial<Record<string, string>>;
  private _isAdminUser: boolean;
  private _isThrottled: boolean;
  private log: ProtectLogging;
  private nvrAddress: string;
  private password: string;
  private username: string;

  /**
   * Create an instance of the UniFi Protect API.
   *
   * @param log - Custom logging implementation.
   *
   * @defaultValue Console logging to stdout/stderr
   *
   * @remarks
   * The logging interface allows you to integrate the API with your application's logging system.
   * By default, errors and warnings are logged to the console, while debug messages are suppressed.
   *
   * @example
   * Using a custom logger:
   *
   * ```typescript
   * import { ProtectApi, ProtectLogging } from "unifi-protect";
   * import winston from "winston";
   *
   * const logger = winston.createLogger({
   *   level: "info",
   *   format: winston.format.simple(),
   *   transports: [new winston.transports.Console()]
   * });
   *
   * const customLog: ProtectLogging = {
   *   debug: (message: string, ...args: unknown[]) => logger.debug(message, args),
   *   error: (message: string, ...args: unknown[]) => logger.error(message, args),
   *   info: (message: string, ...args: unknown[]) => logger.info(message, args),
   *   warn: (message: string, ...args: unknown[]) => logger.warn(message, args)
   * };
   *
   * const protect = new ProtectApi(customLog);
   * ```
   *
   * @category Constructor
   */
  constructor(log?: ProtectLogging) {

    // Initialize our parent.
    super();

    // If we didn't get passed a logging parameter, by default we log to the console.
    log ??= {

      /* eslint-disable no-console */
      debug: (): void => { /* No debug logging by default. */ },
      error: (message: string, ...parameters: unknown[]): void => console.error(message, ...parameters),
      info: (message: string, ...parameters: unknown[]): void => console.log(message, ...parameters),
      warn: (message: string, ...parameters: unknown[]): void => console.log(message, ...parameters)
      /* eslint-enable no-console */
    };

    this._bootstrap = null;
    this._eventsWs = null;
    this._isAdminUser = false;
    this._isThrottled = false;

    this.log = {

      debug: (message: string, ...parameters: unknown[]): void => log.debug(this.name + ": " + message, ...parameters),
      error: (message: string, ...parameters: unknown[]): void => log.error(this.name + ": API error: " + message, ...parameters),
      info: (message: string, ...parameters: unknown[]): void => log.info(this.name + ": " + message, ...parameters),
      warn: (message: string, ...parameters: unknown[]): void => log.warn(this.name + ": " + message, ...parameters)
    };

    this.apiErrorCount = 0;
    this.apiLastSuccess = 0;
    this.headers = {};
    this.nvrAddress = "";
    this.username = "";
    this.password = "";
  }

  /**
   * Execute a login attempt to the UniFi Protect API.
   *
   * @param nvrAddress - Address of the UniFi Protect controller (FQDN or IP address)
   * @param username   - Username for authentication
   * @param password   - Password for authentication
   *
   * @returns Promise resolving to `true` on success, `false` on failure.
   *
   * @event login      - Emitted with `true` if authentication succeeds, `false` if it fails. The event fires after every login attempt, regardless of outcome.
   *
   * @remarks
   * This method performs the following actions:
   *
   * - Terminates any existing sessions
   * - Acquires CSRF tokens for API security
   * - Establishes cookie-based authentication
   * - Emits a `login` event with the result
   *
   * The method automatically handles UniFi OS CSRF protection and maintains session state for subsequent API calls. Administrative privileges are determined during
   * login and cached for the session duration.
   *
   * @example
   * Multiple authentication patterns:
   *
   * ```typescript
   * import { ProtectApi } from "unifi-protect";
   *
   * const protect = new ProtectApi();
   *
   * // Pattern 1: Using async/await
   * async function connectWithAwait() {
   *   const success = await protect.login("192.168.1.1", "admin", "password");
   *   if (success) {
   *     console.log("Connected successfully");
   *   }
   * }
   *
   * // Pattern 2: Using event listeners
   * function connectWithEvents() {
   *   protect.once("login", (success: boolean) => {
   *     if (success) {
   *       console.log("Connected successfully");
   *       // Continue with bootstrap
   *       protect.getBootstrap();
   *     }
   *   });
   *
   *   protect.login("192.168.1.1", "admin", "password");
   * }
   *
   * // Pattern 3: With retry logic
   * async function connectWithRetry(maxAttempts = 3) {
   *   for (let i = 0; i < maxAttempts; i++) {
   *     if (await protect.login("192.168.1.1", "admin", "password")) {
   *       return true;
   *     }
   *     console.log(`Login attempt ${i + 1} failed, retrying...`);
   *     await new Promise(resolve => setTimeout(resolve, 2000));
   *   }
   *   return false;
   * }
   * ```
   *
   * @category Authentication
   */
  public async login(nvrAddress: string, username: string, password: string): Promise<boolean> {

    this.nvrAddress = nvrAddress;
    this.username = username;
    this.password = password;

    this.logout();

    // Let's attempt to login.
    const loginSuccess = await this.loginController();

    // Publish the result to our listeners
    this.emit("login", loginSuccess);

    // Return the status of our login attempt.
    return loginSuccess;
  }

  // Login to the UniFi Protect API.
  private async loginController(): Promise<boolean> {

    // If we're already logged in, we're done.
    if(this.headers.cookie && this.headers["x-csrf-token"]) {

      return true;
    }

    // Utility to grab the headers we're interested in a normalized manner.
    const getHeader = (name: string, headers?: Record<string, string | string[] | undefined>): Nullable<string> => {

      const rawHeader = headers?.[name.toLowerCase()];

      if(!rawHeader) {

        return null;
      }

      // Normalize it to a string:
      return Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    };

    // Acquire a CSRF token, if needed. We only need to do this if we aren't already logged in, or we don't already have a token.
    if(!this.headers["x-csrf-token"]) {

      // UniFi OS has cross-site request forgery protection built into it's web management UI. We retrieve the CSRF token, if available, by connecting to the Protect
      // controller and checking the headers for it.
      const response = await this.retrieve("https://" + this.nvrAddress, { method: "GET" }, { logErrors: false });

      if(this.responseOk(response?.statusCode)) {

        const csrfToken = getHeader("X-CSRF-Token", response?.headers);

        // Preserve the CSRF token, if found, for future API calls.
        if(csrfToken) {

          this.headers["x-csrf-token"] = csrfToken;
        }
      }
    }

    // Log us in.
    const response = await this.retrieve(this.getApiEndpoint("login"), {

      body: JSON.stringify({ password: this.password, rememberMe: true, token: "", username: this.username }),
      method: "POST"
    });

    // Something went wrong with the login call, possibly a controller reboot or failure.
    if(!this.responseOk(response?.statusCode)) {

      this.logout();

      return false;
    }

    // We're logged in. Let's configure our headers.
    const csrfToken = getHeader("X-Updated-CSRF-Token", response?.headers) ?? getHeader("X-CSRF-Token", response?.headers);
    const cookie = getHeader("Set-Cookie", response?.headers);

    // Save the refreshed cookie and CSRF token for future API calls and we're done.
    if(csrfToken && cookie) {

      // Only preserve the token element of the cookie and not the superfluous information that's been added to it.
      this.headers.cookie = cookie.split(";")[0];

      // Save the CSRF token.
      this.headers["x-csrf-token"] = csrfToken;

      return true;
    }

    // Clear out our login credentials.
    this.logout();

    return false;
  }

  // Attempt to retrieve the bootstrap configuration from the Protect NVR.
  private async bootstrapController(retry: boolean): Promise<boolean> {

    // Log us in if needed.
    if(!(await this.loginController())) {

      return retry ? this.bootstrapController(false) : false;
    }

    const response = await this.retrieve(this.getApiEndpoint("bootstrap"));

    // Something went wrong. Retry the bootstrap attempt once, and then we're done.
    if(!this.responseOk(response?.statusCode)) {

      this.logRetry("Unable to retrieve the UniFi Protect controller configuration.", retry);

      return retry ? this.bootstrapController(false) : false;
    }

    // Now let's get our NVR configuration information.
    let data: Nullable<ProtectNvrBootstrap> = null;

    try {

      data = await response?.body.json() as ProtectNvrBootstrap;

    } catch(error) {

      data = null;
      this.log.error("Unable to parse response from UniFi Protect. Will retry again later.");
    }

    // Is this the first time we're bootstrapping?
    const isFirstRun = this._bootstrap ? false : true;

    // Set the new bootstrap.
    this._bootstrap = data;

    // Check for admin user privileges or role changes.
    this.checkAdminUserStatus(isFirstRun);

    // We're good. Now connect to the event listener API.
    if(!(await this.launchEventsWs())) {

      return retry ? this.bootstrapController(false) : false;
    }

    // Notify our users.
    this.emit("bootstrap", this._bootstrap);

    // We're bootstrapped and connected to the events API.
    return true;
  }

  /**
   * Connect to the realtime update events API.
   *
   * @event message - Emitted for each WebSocket message received from the controller after successful decoding. Each message contains a
   *                  {@link ProtectApiEvents.ProtectEventPacket} with real-time device updates and system events.
   *
   * @internal
   */
  private async launchEventsWs(): Promise<boolean> {

    // Log us in if needed.
    if(!(await this.loginController())) {

      return false;
    }

    // If we already have a listener, we're already all set.
    if(this._eventsWs) {

      return true;
    }

    // Launch the realtime events WebSocket. We need to hand it the last update ID we know about in order
    // to ensure we don't miss any actual updates since we last pulled the bootstrap configuration.
    const params = new URLSearchParams({ lastUpdateId: this._bootstrap?.lastUpdateId ?? "" });

    try {

      // Let's open the WebSocket connection.
      const ws = new WebSocket("wss://" + this.nvrAddress + "/proxy/protect/ws/updates?" + params.toString(),
        { dispatcher: new Agent({ connect: { rejectUnauthorized: false } }), headers: { Cookie: this.headers.cookie ?? "" } });

      let messageHandler: Nullable<(event: MessageEvent) => void>;

      // Fired when the handshake completes
      ws.addEventListener("open", (): void => {

        // Make the WebSocket available.
        this._eventsWs = ws;
      }, { once: true });

      // Handle any WebSocket errors.
      ws.addEventListener("error", (event: ErrorEvent): void => {

        this.log.error("Events API error: %s", event.error.cause);
        this.log.error(util.inspect(event.error, { colors: true, depth: null, sorted: true }));

        ws.close();
      }, { once: true });

      // Cleanup after ourselves if our WebSocket closes for some resaon.
      ws.addEventListener("close", (): void => {

        this._eventsWs = null;

        if(messageHandler) {

          ws.removeEventListener("message", messageHandler);
          messageHandler = null;
        }
      }, { once: true });

      // Process messages as they come in.
      ws.addEventListener("message", messageHandler = async (event: MessageEvent): Promise<void> => {

        try {

          // We need to normalize event.data into an ArrayBuffer so we can process it.
          let ab: ArrayBuffer;

          if(event.data instanceof Blob) {

            ab = await event.data.arrayBuffer();
          } else if(event.data instanceof ArrayBuffer) {

            ab = event.data;
          } else if(typeof event.data === "string") {

            ab = new TextEncoder().encode(event.data).buffer;
          } else {

            this.log.error("Unsupported WebSocket message type: %s", typeof event.data);
            ws.close();

            return;
          }

          // Now we decode our packet.
          const packet = ProtectApiEvents.decodePacket(this.log, Buffer.from(ab));

          if(!packet) {

            this.log.error("Unable to process message from the realtime update events API.");
            ws.close();

            return;
          }

          // Emit the decoded packet for users.
          this.emit("message", packet);
        } catch(error) {

          this.log.error("Error processing events WebSocket message: ", error);
          ws.close();
        }
      });
    } catch(error) {

      this.log.error("Error connecting to the realtime update events API: %s", error);
    }

    return true;
  }

  /**
   * Retrieve the bootstrap JSON from a UniFi Protect controller.
   *
   * @returns Promise resolving to `true` on success, `false` on failure.
   *
   * @event bootstrap - Emitted with the complete {@link ProtectNvrBootstrap} configuration when successfully retrieved. The bootstrap contains all device configurations,
   *                    user accounts, system settings, and current device states.
   * @event message   - Once the bootstrap is retrieved, the WebSocket connection is established and this event will be emitted for each real-time update packet received
   *                    from the controller.
   *
   * @remarks
   * The bootstrap contains the complete state of the Protect controller, including:
   *
   * - All device configurations (cameras, lights, sensors, etc.)
   * - User accounts and permissions
   * - System settings and capabilities
   * - Current device states and health
   *
   * This method automatically:
   *
   * - Reconnects if the session has expired
   * - Establishes WebSocket connections for real-time events
   * - Determines administrative privileges
   * - Emits a `bootstrap` event with the configuration
   *
   * @example
   * Working with bootstrap data:
   *
   * ```typescript
   * import { ProtectApi, ProtectCameraConfig } from "unifi-protect";
   *
   * const protect = new ProtectApi();
   *
   * async function analyzeSystem() {
   *   // Login and bootstrap
   *   await protect.login("192.168.1.1", "admin", "password");
   *   await protect.getBootstrap();
   *
   *   // Access the bootstrap data
   *   const bootstrap = protect.bootstrap;
   *   if (!bootstrap) return;
   *
   *   // System information
   *   console.log(`NVR: ${bootstrap.nvr.name}`);
   *   console.log(`Version: ${bootstrap.nvr.version}`);
   *   console.log(`Uptime: ${bootstrap.nvr.uptime} seconds`);
   *
   *   // Device inventory
   *   console.log(`Cameras: ${bootstrap.cameras.length}`);
   *   console.log(`Lights: ${bootstrap.lights.length}`);
   *   console.log(`Sensors: ${bootstrap.sensors.length}`);
   *
   *   // Find specific devices
   *   const doorbells = bootstrap.cameras.filter(cam =>
   *     cam.featureFlags.isDoorbell
   *   );
   *
   *   const motionSensors = bootstrap.sensors.filter(sensor =>
   *     sensor.type === "motion"
   *   );
   *
   *   // Check recording status
   *   const recording = bootstrap.cameras.filter(cam =>
   *     cam.isRecording && cam.isConnected
   *   );
   *
   *   console.log(`${recording.length} cameras actively recording`);
   * }
   * ```
   *
   * @category API Access
   */
  public async getBootstrap(): Promise<boolean> {

    // Bootstrap the controller, and attempt to retry the bootstrap if it fails.
    return this.bootstrapController(true);
  }

  // Check admin privileges.
  private checkAdminUserStatus(isFirstRun = false): boolean {

    // Get the properties we care about from the bootstrap.
    const { users, authUserId } = this._bootstrap ?? {};

    // Find this user, if it exists.
    const user = users?.find((x: ProtectNvrUserConfig) => x.id === authUserId);

    // User doesn't exist, we're done.
    if(!user?.allPermissions) {

      return false;
    }

    // Save our prior state so we can detect role changes without having to restart.
    const oldAdminStatus = this.isAdminUser;

    // Determine if the user has administrative camera permissions.
    this._isAdminUser = user.allPermissions.some(entry => entry.startsWith("camera:") && entry.split(":")[1].split(",").includes("write"));

    // Only admin users can change certain settings. Inform the user on startup, or if we detect a role change.
    if(isFirstRun && !this.isAdminUser) {

      this.log.info("User '%s' requires the Super Admin role in order to change certain settings like camera RTSP stream availability.", this.username);
    } else if(!isFirstRun && (oldAdminStatus !== this.isAdminUser)) {

      this.log.info("Role change detected for user '%s': the Super Admin role has been %s.", this.username, this.isAdminUser ? "enabled" : "disabled");
    }

    return true;
  }

  /**
   * Retrieve a snapshot image from a Protect camera.
   *
   * @param device  - Protect camera device
   * @param options - Snapshot configuration options
   *
   * @returns Promise resolving to a Buffer containing the JPEG image, or `null` on failure.
   *
   * @remarks
   * Snapshots are generated on-demand by the Protect controller. The image quality and resolution depend on the camera's capabilities and current settings. Package
   * camera snapshots are only available on devices with dual cameras (e.g., G4 Doorbell Pro).
   *
   * The `options` parameter accepts:
   *
   * | Property | Type | Description | Default |
   * |----------|------|-------------|---------|
   * | `width` | `number` | Requested image width in pixels | Camera default |
   * | `height` | `number` | Requested image height in pixels | Camera default |
   * | `usePackageCamera` | `boolean` | Use package camera if available | `false` |
   *
   * @example
   * Capturing and saving snapshots:
   *
   * ```typescript
   * import { ProtectApi } from "unifi-protect";
   * import { writeFile } from "fs/promises";
   *
   * const protect = new ProtectApi();
   *
   * async function captureSnapshots() {
   *   await protect.login("192.168.1.1", "admin", "password");
   *   await protect.getBootstrap();
   *
   *   const cameras = protect.bootstrap?.cameras ?? [];
   *
   *   for (const camera of cameras) {
   *     // Full resolution snapshot
   *     const fullRes = await protect.getSnapshot(camera);
   *
   *     // Thumbnail snapshot
   *     const thumbnail = await protect.getSnapshot(camera, {
   *       width: 640,
   *       height: 360
   *     });
   *
   *     // Package camera snapshot (if available)
   *     if (camera.featureFlags.hasPackageCamera) {
   *       const packageSnap = await protect.getSnapshot(camera, {
   *         usePackageCamera: true
   *       });
   *
   *       if (packageSnap) {
   *         await writeFile(`${camera.name}-package.jpg`, packageSnap);
   *       }
   *     }
   *
   *     if (fullRes && thumbnail) {
   *       await writeFile(`${camera.name}-full.jpg`, fullRes);
   *       await writeFile(`${camera.name}-thumb.jpg`, thumbnail);
   *       console.log(`Saved snapshots for ${camera.name}`);
   *     }
   *   }
   * }
   * ```
   *
   * @category API Access
   */
  public async getSnapshot(device: ProtectCameraConfig, options: Partial<{ width: number; height: number; usePackageCamera: boolean }> = {}): Promise<Nullable<Buffer>> {

    // It's not a camera, or we're requesting a package camera snapshot on a camera without one - we're done.
    if((device.modelKey !== "camera") || (options.usePackageCamera && !device.featureFlags.hasPackageCamera)) {

      return null;
    }

    // Create the parameters needed for the snapshot request.
    const params = new URLSearchParams();

    // If we have details of the snapshot request, use it to request the right size.
    if(options.height !== undefined) {

      params.append("h", options.height.toString());
    }

    if(options.width !== undefined) {

      params.append("w", options.width.toString());
    }

    // Request the image from the controller.
    const response = await this.retrieve(this.getApiEndpoint(device.modelKey) + "/" + device.id + "/" + (options.usePackageCamera ? "package-" : "") +
      "snapshot?" + params.toString(), { method: "GET" });

    if(!response || !this.responseOk(response.statusCode)) {

      this.log.error("%s: Unable to retrieve the snapshot.", this.getFullName(device));

      return null;
    }

    let snapshot;

    try {

      snapshot = Buffer.from(await response.body.arrayBuffer());
    } catch(error) {

      this.log.error("%s: Error retrieving the snapshot image: %s", this.getFullName(device), error);

      return null;
    }

    return snapshot;
  }

  /**
   * Update a Protect device's configuration on the UniFi Protect controller.
   *
   * @typeParam DeviceType - Generic for any known Protect device type
   *
   * @param device  - Protect device to update
   * @param payload - Configuration changes to apply
   *
   * @returns Promise resolving to the updated device configuration, or `null` on failure.
   *
   * @remarks
   * This method applies configuration changes to any Protect device. Common modifications include:
   *
   * - Camera settings (name, recording modes, motion zones)
   * - Light settings (brightness, motion activation)
   * - Sensor settings (sensitivity, mount type)
   * - Chime settings (volume, ringtones)
   *
   * **Important**: Most configuration changes require administrative privileges. The user account must have the Super Admin role assigned in UniFi Protect.
   *
   * Changes are applied immediately and persist across device reboots. The method returns the complete updated device configuration, reflecting any server-side
   * adjustments.
   *
   * @example
   * Common device configuration scenarios:
   *
   * ```typescript
   * import { ProtectApi, ProtectCameraConfig } from "unifi-protect";
   *
   * const protect = new ProtectApi();
   *
   * async function configureDevices() {
   *   await protect.login("192.168.1.1", "admin", "password");
   *   await protect.getBootstrap();
   *
   *   const camera = protect.bootstrap?.cameras[0];
   *   if (!camera) return;
   *
   *   // Update camera name and recording settings
   *   const updatedCamera = await protect.updateDevice(camera, {
   *     name: "Front Door Camera",
   *     recordingSettings: {
   *       mode: "always",
   *       prePaddingSecs: 3,
   *       postPaddingSecs: 3,
   *       retentionDurationMs: 7 * 24 * 60 * 60 * 1000 // 7 days
   *     }
   *   });
   *
   *   // Configure motion detection
   *   await protect.updateDevice(camera, {
   *     motionSettings: {
   *       mode: "always",
   *       sensitivity: 80
   *     },
   *     smartDetectSettings: {
   *       objectTypes: ["person", "vehicle"],
   *       autoTrackingEnabled: true
   *     }
   *   });
   *
   *   // Update light device
   *   const light = protect.bootstrap?.lights[0];
   *   if (light) {
   *     await protect.updateDevice(light, {
   *       lightSettings: {
   *         mode: "motion",
   *         brightness: 100,
   *         durationMs: 15000 // 15 seconds
   *       }
   *     });
   *   }
   *
   *   // Configure doorbell chime
   *   const chime = protect.bootstrap?.chimes[0];
   *   if (chime) {
   *     await protect.updateDevice(chime, {
   *       volume: 75,
   *       ringtones: ["traditional"]
   *     });
   *   }
   * }
   * ```
   *
   * @category API Access
   */
  public async updateDevice<DeviceType extends ProtectKnownDeviceTypes>(device: DeviceType, payload: ProtectKnownDevicePayloads): Promise<Nullable<DeviceType>> {

    // Log us in if needed.
    if(!(await this.loginController())) {

      return null;
    }

    // Only admin users can update JSON objects.
    if(!this.isAdminUser) {

      return null;
    }

    this.log.debug("%s: %s", this.getFullName(device), util.inspect(payload, { colors: true, depth: null, sorted: true }));

    // Update Protect with the new configuration.
    const response = await this.retrieve(this.getApiEndpoint(device.modelKey) + (device.modelKey === "nvr" ? "" :  "/" + device.id), {

      body: JSON.stringify(payload),
      method: "PATCH"
    });

    // Something happened - the retrieve call will log the error for us.
    if(!response) {

      return null;
    }

    if(!this.responseOk(response.statusCode)) {

      this.log.error("%s: Unable to configure the %s: %s.", this.getFullName(device), device.modelKey, response.statusCode);

      return null;
    }

    // We successfully set the message, return the updated device object.
    return await response.body.json() as DeviceType;
  }

  // Update camera channels on a supported Protect device.
  private async updateCameraChannels(device: ProtectCameraConfigInterface): Promise<Nullable<ProtectCameraConfig>> {

    // Make sure we have the permissions to modify the camera JSON.
    if(!(await this.canModifyCamera(device))) {

      return null;
    }

    // Update Protect with the new configuration.
    const response = await this._retrieve(this.getApiEndpoint(device.modelKey) + "/" + device.id, {

      body: JSON.stringify({ channels: device.channels }),
      method: "PATCH"
    }, { decodeResponse: false });

    // Since we took responsibility for interpreting the outcome of the fetch, we need to check for any errors.
    if(!response || !this.responseOk(response.statusCode)) {

      this.apiErrorCount++;

      if(response?.statusCode === 403) {

        this.log.error("%s: Insufficient privileges to enable RTSP on all channels. Please ensure this username has the Administrator role assigned in UniFi Protect.",
          this.getFullName(device));
      } else {

        this.log.error("%s: Unable to enable RTSP on all channels: %s.", this.getFullName(device), response?.statusCode);
      }

      // We still return our camera object if there is at least one RTSP channel enabled.
      return device;
    }

    // Since we have taken responsibility for decoding response types, we need to reset our API backoff count.
    this.apiErrorCount = 0;
    this.apiLastSuccess = Date.now();

    // Everything worked, save the new channel array.
    return await response.body.json() as ProtectCameraConfig;
  }

  /**
   * Utility method that enables all RTSP channels on a given Protect camera.
   *
   * @param device - Protect camera to modify
   *
   * @returns Promise resolving to the updated camera configuration, or `null` on failure.
   *
   * @remarks
   * RTSP (Real Time Streaming Protocol) streams allow third-party applications to access camera feeds directly. This method enables RTSP on all available
   * channels (resolutions) for a camera, making them accessible at:
   *
   * - High: `rtsp://[NVR_IP]:7447/[CAMERA_GUID]_0`
   * - Medium: `rtsp://[NVR_IP]:7447/[CAMERA_GUID]_1`
   * - Low: `rtsp://[NVR_IP]:7447/[CAMERA_GUID]_2`
   *
   * **Note**: Enabling RTSP requires Super Admin privileges in UniFi Protect.
   *
   * @example
   * Enabling RTSP streams for integration:
   *
   * ```typescript
   * import { ProtectApi } from "unifi-protect";
   *
   * const protect = new ProtectApi();
   *
   * async function setupRtspStreams() {
   *   await protect.login("192.168.1.1", "admin", "password");
   *   await protect.getBootstrap();
   *
   *   const cameras = protect.bootstrap?.cameras ?? [];
   *
   *   for (const camera of cameras) {
   *     const updated = await protect.enableRtsp(camera);
   *
   *     if (updated) {
   *       console.log(`RTSP enabled for ${camera.name}`);
   *
   *       // Display RTSP URLs
   *       updated.channels.forEach((channel, index) => {
   *         if (channel.isRtspEnabled) {
   *           const rtspUrl = `rtsp://192.168.1.1:7447/${channel.rtspAlias}`;
   *           console.log(`  Channel ${index}: ${rtspUrl}`);
   *         }
   *       });
   *     } else {
   *       console.log(`Failed to enable RTSP for ${camera.name}`);
   *     }
   *   }
   * }
   * ```
   *
   * @category Utilities
   */
  public async enableRtsp(device: ProtectCameraConfigInterface): Promise<Nullable<ProtectCameraConfig>> {

    // Make sure we have the permissions to modify the camera JSON.
    if(!(await this.canModifyCamera(device))) {

      return null;
    }

    // Do we have any non-RTSP enabled channels? If not, we're done.
    if(!device.channels.some(channel => !channel.isRtspEnabled)) {

      return device;
    }

    // Enable RTSP on all available channels.
    device.channels = device.channels.map((channel: ProtectCameraChannelConfigInterface) => {

      channel.isRtspEnabled = true;

      return channel;
    });

    // Update the camera channel JSON with our edits.
    return this.updateCameraChannels(device);
  }

  /**
   * Utility method that generates a nicely formatted device information string.
   *
   * @param device     - Protect device
   * @param name       - Custom name to use (defaults to device name)
   * @param deviceInfo - Include IP and MAC address information
   *
   * @returns Formatted device string.
   *
   * @remarks
   * Returns device information in a consistent, readable format:
   *
   * - Basic: `Device Name [Device Type]`
   * - With info: `Device Name [Device Type] (address: IP mac: MAC)`
   *
   * This method handles all Protect device types and gracefully handles missing information.
   *
   * @example
   * Formatting device information:
   *
   * ```typescript
   * import { ProtectApi } from "unifi-protect";
   *
   * const protect = new ProtectApi();
   *
   * async function listDevices() {
   *   await protect.login("192.168.1.1", "admin", "password");
   *   await protect.getBootstrap();
   *
   *   // List all devices with full information
   *   const allDevices = [
   *     ...(protect.bootstrap?.cameras ?? []),
   *     ...(protect.bootstrap?.lights ?? []),
   *     ...(protect.bootstrap?.sensors ?? []),
   *     ...(protect.bootstrap?.chimes ?? []),
   *     ...(protect.bootstrap?.viewers ?? [])
   *   ];
   *
   *   allDevices.forEach(device => {
   *     // Basic format
   *     console.log(protect.getDeviceName(device));
   *     // Output: "Front Door [G4 Doorbell Pro]"
   *
   *     // With network info
   *     console.log(protect.getDeviceName(device, device.name, true));
   *     // Output: "Front Door [G4 Doorbell Pro] (address: 192.168.1.50 mac: 00:00:00:00:00:00)"
   *
   *     // Custom name
   *     console.log(protect.getDeviceName(device, "Custom Name"));
   *     // Output: "Custom Name [G4 Doorbell Pro]"
   *   });
   * }
   * ```
   *
   * @category Utilities
   */
  public getDeviceName(device: ProtectKnownDeviceTypes, name = device.name, deviceInfo = false): string {

    // Include the host address information, if we have it.
    const host = (("host" in device) && device.host) ? "address: " + device.host + " " : "";

    const type = (("marketName" in device) && device.marketName) ? device.marketName : device.type;

    // A completely enumerated device will appear as:
    // Device Name [Device Type] (address: IP address, mac: MAC address).
    return (name ?? type) + " [" + type + "]" + (deviceInfo ? " (" + host + "mac: " + device.mac + ")" : "");
  }

  /**
   * Utility method that generates a combined device and controller information string.
   *
   * @param device - Protect device
   *
   * @returns Formatted string including both controller and device information.
   *
   * @remarks
   * Combines controller and device information for complete context: `Controller Name [Controller Type] Device Name [Device Type]`
   *
   * Useful for logging and multi-controller environments where device context is important.
   *
   * @example
   * Logging with full context:
   *
   * ```typescript
   * import { ProtectApi } from "unifi-protect";
   *
   * const protect = new ProtectApi();
   *
   * async function monitorDevices() {
   *   await protect.login("192.168.1.1", "admin", "password");
   *   await protect.getBootstrap();
   *
   *   protect.on("message", (packet) => {
   *     const device = protect.bootstrap?.cameras.find(
   *       c => c.id === packet.header.id
   *     );
   *
   *     if (device) {
   *       // Logs: "Dream Machine Pro [UDMP] Front Door [G4 Doorbell Pro]"
   *       console.log(`${protect.getFullName(device)}: ${packet.header.action}`);
   *     }
   *   });
   * }
   * ```
   *
   * @category Utilities
   */
  public getFullName(device: ProtectKnownDeviceTypes): string {

    const deviceName = this.getDeviceName(device);

    // Returns: NVR [NVR Type] Device Name [Device Type]
    return this.name + (deviceName.length ? " " + deviceName : "");
  }

  /**
   * Terminate any open connection to the UniFi Protect API.
   *
   * @remarks
   * Performs a clean shutdown of all API connections:
   *
   * - Closes WebSocket connections
   * - Destroys the HTTP connection pool
   * - Clears cached bootstrap data
   * - Resets authentication state
   *
   * Call this method when shutting down your application or switching controllers. The API can be reused after reset by calling {@link login} again.
   *
   * @example
   * Proper cleanup:
   *
   * ```typescript
   * import { ProtectApi } from "unifi-protect";
   *
   * const protect = new ProtectApi();
   *
   * async function main() {
   *   try {
   *     await protect.login("192.168.1.1", "admin", "password");
   *     await protect.getBootstrap();
   *
   *     // Do work...
   *
   *   } finally {
   *     // Always clean up connections
   *     protect.reset();
   *   }
   * }
   *
   * // Handle process termination
   * process.on("SIGINT", () => {
   *   protect.reset();
   *   process.exit(0);
   * });
   * ```
   *
   * @category Utilities
   */
  public reset(): void {

    this._bootstrap = null;

    this._eventsWs?.close();
    this._eventsWs = null;

    if(this.nvrAddress) {

      // Cleanup any prior pool.
      void this.dispatcher?.destroy();

      // Create an interceptor that allows us to set the user agent to our liking.
      const ua: Dispatcher.DispatcherComposeInterceptor = (dispatch) => (opts: Dispatcher.DispatchOptions, handler: Dispatcher.DispatchHandler) => {

        opts.headers ??= {};
        (opts.headers as Record<string, string>)["user-agent"] = "unifi-protect";

        return dispatch(opts, handler);
      };

      // Create a dispatcher using a new pool. We want to explicitly allow self-signed SSL certificates, enabled HTTP2 connections, and allow up to five connections at a
      // time and provide some robust retry handling - we retry each request up to three times, with backoff. We allow for up to five retries, with a maximum wait time of
      // 1500ms per retry, in factors of 2 starting from a 100ms delay.
      this.dispatcher = new Pool("https://" + this.nvrAddress, { allowH2: true, clientTtl: 60 * 1000, connect: { rejectUnauthorized: false }, connections: 5 })
        .compose(ua, interceptors.retry({ maxRetries: 5, maxTimeout: 1500, methods: [ "DELETE", "GET", "HEAD", "OPTIONS", "POST", "PUT" ], minTimeout: 100,
          statusCodes: [ 400, 404, 429, 500, 502, 503, 504 ], timeoutFactor: 2 }));
    }
  }

  /**
   * Clear login credentials and terminate all API connections.
   *
   * @remarks
   * Performs a complete logout:
   *
   * - Clears authentication tokens and cookies
   * - Terminates all active connections
   * - Resets user privilege status
   * - Preserves CSRF token for future logins
   *
   * After logout, a new {@link login} call is required to use the API again.
   *
   * @example
   * Switching between controllers:
   *
   * ```typescript
   * import { ProtectApi } from "unifi-protect";
   *
   * const protect = new ProtectApi();
   *
   * async function switchControllers() {
   *   // Connect to first controller
   *   await protect.login("192.168.1.1", "admin", "password1");
   *   await protect.getBootstrap();
   *   console.log(`Connected to ${protect.name}`);
   *
   *   // Switch to second controller
   *   protect.logout();
   *
   *   await protect.login("192.168.2.1", "admin", "password2");
   *   await protect.getBootstrap();
   *   console.log(`Connected to ${protect.name}`);
   * }
   * ```
   *
   * @category Authentication
   */
  public logout(): void {

    // Close any connection to the Protect API.
    this.reset();

    // Reset our parameters.
    this._isAdminUser = false;

    // Save our CSRF token, if we have one.
    const csrfToken = this.headers["x-csrf-token"];

    // Initialize the headers we need.
    this.headers = {};
    this.headers["content-type"] = "application/json";

    // Restore the CSRF token if we have one.
    if(csrfToken) {

      this.headers["x-csrf-token"] = csrfToken;
    }
  }

  // Utility to validate that we have the privileges we need to modify the camera JSON.
  private async canModifyCamera(device: ProtectCameraConfigInterface): Promise<boolean> {

    // Log us in if needed.
    if(!(await this.loginController())) {

      return false;
    }

    // Only admin users can activate RTSP streams.
    if(!this.isAdminUser) {

      return false;
    }

    // At the moment, we only know about camera devices.
    if(device.modelKey !== "camera") {

      return false;
    }

    return true;
  }

  /**
   * Return a websocket API endpoint for the requested endpoint type.
   *
   * @param endpoint - Endpoint type (`livestream` or `talkback`)
   * @param params   - URL parameters for the endpoint
   *
   * @returns Promise resolving to the WebSocket URL, or `null` on failure.
   *
   * @remarks
   * This method provides access to real-time WebSocket endpoints:
   *
   * ### Livestream Endpoint
   * Returns a WebSocket URL for H.264 fMP4 video streams. **Do not use directly** - use {@link createLivestream} instead for proper stream handling.
   *
   * ### Talkback Endpoint
   * Creates a two-way audio connection to cameras with speakers (doorbells, two-way audio cameras). The WebSocket accepts AAC-encoded ADTS audio streams.
   *
   * Required parameter:
   *
   * - `camera`: The camera ID to connect to
   *
   * @example
   * Setting up two-way audio:
   *
   * ```typescript
   * import { ProtectApi } from "unifi-protect";
   * import { WebSocket } from "ws";
   *
   * const protect = new ProtectApi();
   *
   * async function setupTalkback(cameraId: string) {
   *   await protect.login("192.168.1.1", "admin", "password");
   *
   *   // Get the talkback endpoint
   *   const params = new URLSearchParams({ camera: cameraId });
   *   const wsUrl = await protect.getWsEndpoint("talkback", params);
   *
   *   if (!wsUrl) {
   *     console.error("Failed to get talkback endpoint");
   *     return;
   *   }
   *
   *   // Connect to the WebSocket
   *   const ws = new WebSocket(wsUrl);
   *
   *   ws.on("open", () => {
   *     console.log("Talkback connection established");
   *     // Send AAC-encoded audio data
   *     // ws.send(aacAudioBuffer);
   *   });
   *
   *   ws.on("error", (error) => {
   *     console.error("Talkback error:", error);
   *   });
   * }
   * ```
   *
   * @category API Access
   */
  public async getWsEndpoint(endpoint: "livestream" | "talkback", params?: URLSearchParams): Promise<Nullable<string>> {

    return this._getWsEndpoint(endpoint, params);
  }

  // Internal interface to returning a WebSocket URL endpoint from the Protect controller for Protect API services (e.g. livestream, talkback).
  private async _getWsEndpoint(endpoint: "livestream" | "talkback", params?: URLSearchParams): Promise<Nullable<string>> {

    // Log us in if needed.
    if(!(await this.loginController())) {

      return null;
    }

    // Ask Protect to give us a URL for this websocket.
    const response = await this.retrieve(this.getApiEndpoint("websocket") + "/" + endpoint +
      ((params && params.toString().length) ? "?" + params.toString() : ""));

    // Something went wrong, we're done here.
    if(!response || !this.responseOk(response.statusCode)) {

      // Only inform users if we have a response if we have something to say.
      if(response) {

        this.log.error("API endpoint access error: " + response.statusCode.toString() + " - " + STATUS_CODES[response.statusCode] + ".");
      }

      return null;
    }

    try {

      const responseJson = await response.body.json() as Record<string, string>;

      // Adjust the URL for our address.
      const responseUrl = new URL(responseJson.url);

      responseUrl.hostname = this.nvrAddress;

      // Return the URL to the websocket.
      return responseUrl.toString();

    } catch(error) {

      if(error instanceof TypeError) {

        const cause = error.cause as NodeJS.ErrnoException;

        switch(cause.code) {

          default:

            this.log.error("Unknown error while communicating with the controller: %s", cause.message);

            break;
        }
      } else if(error instanceof SyntaxError) {

        this.log.error("Received syntax error while communicating with the controller. This is typically due to a controller reboot.");

      } else {

        this.log.error("An error occurred while communicating with the controller: %s.", error);
      }

      return null;
    }
  }

  /**
   * Execute an HTTP request to the Protect controller.
   *
   * @param url             - Full URL to request (e.g., `https://192.168.1.1/proxy/protect/api/cameras`)
   * @param options         - Undici-compatible request options
   * @param retrieveOptions - Additional options for error handling and timeouts
   *
   * @returns Promise resolving to the Response object, or `null` on failure.
   *
   * @remarks
   * This method provides direct access to the Protect controller API for advanced use cases
   * not covered by the built-in methods. It handles:
   *
   * - Authentication and session management
   * - Automatic retry with exponential backoff
   * - Error logging and throttling
   * - CSRF token management
   *
   * The `options` parameter extends [Undici's RequestOptions](https://undici.nodejs.org/#/docs/api/Dispatcher.md?id=parameter-requestoptions), providing full control
   * over the HTTP request.
   *
   * @example
   * Making custom API calls:
   *
   * ```typescript
   * import { ProtectApi } from "unifi-protect";
   *
   * const protect = new ProtectApi();
   *
   * async function customApiCalls() {
   *   await protect.login("192.168.1.1", "admin", "password");
   *
   *   // Get events from the last hour
   *   const end = Date.now();
   *   const start = end - (60 * 60 * 1000);
   *
   *   const response = await protect.retrieve(
   *     `https://192.168.1.1/proxy/protect/api/events?start=${start}&end=${end}`,
   *     { method: "GET" }
   *   );
   *
   *   if (response) {
   *     const events = await response.body.json();
   *     console.log(`Found ${events.length} events`);
   *   }
   *
   *   // Download a video clip
   *   const videoResponse = await protect.retrieve(
   *     `https://192.168.1.1/proxy/protect/api/video/export`,
   *     {
   *       method: "POST",
   *       body: JSON.stringify({
   *         camera: "camera-id",
   *         start: start,
   *         end: end,
   *         type: "timelapse"
   *       })
   *     },
   *     {
   *       timeout: 30000 // 30 second timeout for video export
   *     }
   *   );
   *
   *   if (videoResponse) {
   *     const videoBuffer = Buffer.from(await videoResponse.body.arrayBuffer());
   *     // Save or process the video
   *   }
   * }
   * ```
   *
   * @category API Access
   */
  public async retrieve(url: string, options: RequestOptions = { method: "GET" }, retrieveOptions: RetrieveOptions = {}):
  Promise<Nullable<Dispatcher.ResponseData<unknown>>> {

    return this._retrieve(url, options, retrieveOptions);
  }

  // Internal interface to communicating HTTP requests with a Protect controller, with error handling.
  private async _retrieve(url: string, options: RequestOptions = { method: "GET" }, retrieveOptions: InternalRetrieveOptions = {}):
  Promise<Nullable<Dispatcher.ResponseData<unknown>>> {

    // Set our defaults unless the user has overriden them.
    retrieveOptions.decodeResponse ??= true;
    retrieveOptions.logErrors ??= true;
    retrieveOptions.timeout ??= PROTECT_API_TIMEOUT;

    // Log errors if that's what the caller requested.
    const logError = (message: string, ...parameters: unknown[]): void => {

      if(!retrieveOptions.logErrors) {

        return;
      }

      this.log.error(message, ...parameters);
    };

    // Catch Protect controller server-side issues:
    //
    // 400: Bad request.
    // 404: Not found.
    // 429: Too many requests.
    // 500: Internal server error.
    // 502: Bad gateway.
    // 503: Service temporarily unavailable.
    const serverErrors = new Set([ 400, 404, 429, 500, 502, 503 ]);

    let response: Dispatcher.ResponseData<unknown>;

    // Create a signal handler to deliver the abort operation.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), retrieveOptions.timeout);

    options.dispatcher = this.dispatcher;
    options.headers = this.headers;
    options.signal = controller.signal;

    try {

      const now = Date.now();

      // Throttle this after PROTECT_API_ERROR_LIMIT attempts.
      if(this.apiErrorCount >= PROTECT_API_ERROR_LIMIT) {

        // Let the user know we've got an API problem.
        if(!this._isThrottled) {

          this.apiLastSuccess = now;
          this._isThrottled = true;

          this.log.error("Throttling API calls due to errors with the %s previous attempts. Pausing communication with the Protect controller for %s minutes.",
            this.apiErrorCount++, PROTECT_API_RETRY_INTERVAL / 60);

          this.reset();

          return null;
        }

        // Check to see if we are still throttling our API calls.
        if((now - this.apiLastSuccess) < (PROTECT_API_RETRY_INTERVAL * 1000)) {

          return null;
        }

        // Inform the user that we're out of the penalty box and try again.
        this.log.error("Resuming connectivity to the UniFi Protect API after pausing for %s minutes.", PROTECT_API_RETRY_INTERVAL / 60);

        this.apiErrorCount = 0;
        this._isThrottled = false;

        if(!(await this.loginController())) {

          return null;
        }
      }

      // Execute the API request.
      response = await request(url, options);

      // The caller will sort through responses instead of us.
      if(!retrieveOptions.decodeResponse) {

        return response;
      }

      // Preemptively increase the error count.
      this.apiErrorCount++;

      // Bad username and password.
      if(response.statusCode === 401) {

        this.logout();
        logError("Invalid login credentials given. Please check your login and password.");

        return null;
      }

      // Insufficient privileges.
      if(response.statusCode === 403) {

        logError("Insufficient privileges for this user. Please check the roles assigned to this user and ensure it has sufficient privileges.");

        return null;
      }

      if(!this.responseOk(response.statusCode)) {

        if(serverErrors.has(response.statusCode)) {

          logError("Unable to connect to the Protect controller. This is temporary and may occur during device reboots.");

          return null;
        }

        // Some other unknown error occurred.
        logError("%s - %s", response.statusCode, STATUS_CODES[response.statusCode]);

        return null;
      }

      // We're all good - return the response and we're done.
      this.apiLastSuccess = Date.now();
      this.apiErrorCount = 0;
      this._isThrottled = false;

      return response;
    } catch(error) {

      // Increment our API error count.
      this.apiErrorCount++;

      // We aborted the connection.
      if((error instanceof DOMException) && (error.name === "AbortError")) {

        logError("Protect controller is taking too long to respond to a request. This error can usually be safely ignored.");

        return null;
      }

      // We destroyed the pool due to a reset event and our inflight connections are failing.
      if(error instanceof errors.ClientDestroyedError) {

        return null;
      }

      // We destroyed the pool due to a reset event and our inflight connections are failing.
      if(error instanceof errors.RequestRetryError) {

        logError("Unable to connect to the Protect controller. This is temporary and may occur during device reboots.");

        return null;
      }

      // Connection timed out.
      if(error instanceof errors.ConnectTimeoutError) {

        logError("Connection timed out.");

        return null;
      }

      let cause;

      if(error instanceof TypeError) {

        cause = error.cause as NodeJS.ErrnoException;
      }

      if((error instanceof Error) && ("code" in error) && (typeof (error as NodeJS.ErrnoException).code === "string")) {

        cause = error;
      }

      if(cause) {

        switch(cause.code) {

          case "ECONNREFUSED":
          case "EHOSTDOWN":

            logError("Connection refused.");

            break;

          case "ECONNRESET":

            logError("Network connection to Protect controller has been reset.");

            break;

          case "ENOTFOUND":

            if(this.nvrAddress) {

              logError("Hostname or IP address not found: %s. Please ensure the address you configured for this UniFi Protect controller is correct.", this.nvrAddress);
            } else {

              logError("No hostname or IP address provided.");
            }

            break;

          default:

            // If we're logging when we have an error, do so.
            logError("Error: %s | %s.", cause.code, cause.message);

            break;
        }

        return null;
      }

      logError("Unknown error: %s", util.inspect(error, { colors: true, depth: null, sorted: true}));

      return null;
    } finally {

      // Clear out our response timeout.
      clearTimeout(timer);
    }
  }

  // Utility function for logging connection retries.
  private logRetry(logMessage: string, isRetry: boolean): void {

    // If we're over the API limit, no need to continue indicating errors since we already inform users we're throttling API calls.
    if(this.apiErrorCount >= PROTECT_API_ERROR_LIMIT) {

      return;
    }

    // If we're retrying, only log when debugging.
    if(isRetry) {

      this.log.debug("%s Retrying.", logMessage);
    } else {

      this.log.error(logMessage);
    }
  }

  /**
   * Determines whether an HTTP status code represents a successful response.
   *
   * @param code - HTTP status code to check
   *
   * @returns `true` if code is 2xx, `false` otherwise.
   *
   * @remarks
   * Validates HTTP response codes according to standard conventions:
   *
   * - 2xx codes (200-299) indicate success
   * - All other codes indicate failure
   * - `undefined` is treated as failure
   *
   * @example
   * Response validation:
   *
   * ```typescript
   * import { ProtectApi } from "unifi-protect";
   *
   * const protect = new ProtectApi();
   *
   * async function validateResponses() {
   *   const response = await protect.retrieve(
   *     "https://192.168.1.1/proxy/protect/api/cameras"
   *   );
   *
   *   if (response && protect.responseOk(response.statusCode)) {
   *     console.log("Request successful");
   *     const data = await response.body.json();
   *     // Process data...
   *   } else {
   *     console.error(`Request failed: ${response?.statusCode}`);
   *   }
   * }
   * ```
   *
   * @category Utilities
   */
  public responseOk(code?: number): boolean {

    return (code !== undefined) && (code >= 200) && (code < 300);
  }

  /**
   * Return a new instance of the Protect livestream API.
   *
   * @returns New livestream API instance.
   *
   * @remarks
   * The livestream API provides direct access to camera H.264 fMP4 streams, enabling:
   *
   * - Real-time video streaming
   * - Stream recording and processing
   * - Integration with video processing pipelines
   * - Low-latency video access
   *
   * Unlike RTSP streams, livestreams are delivered over WebSockets with minimal latency and don't require additional authentication.
   *
   * @example
   * Working with livestreams:
   *
   * ```typescript
   * import { ProtectApi, ProtectLivestream } from "unifi-protect";
   * import { createWriteStream } from "fs";
   *
   * const protect = new ProtectApi();
   *
   * async function recordLivestream(cameraId: string, durationMs: number) {
   *   await protect.login("192.168.1.1", "admin", "password");
   *   await protect.getBootstrap();
   *
   *   // Create a livestream instance
   *   const livestream = protect.createLivestream();
   *
   *   // Start the livestream
   *   const camera = protect.bootstrap?.cameras.find(c => c.id === cameraId);
   *   if (!camera) return;
   *
   *   // The livestream can be piped to a file, processed, or streamed elsewhere
   *   const output = createWriteStream(`recording-${Date.now()}.mp4`);
   *
   *   // Start streaming (implementation depends on ProtectLivestream class)
   *   await livestream.start(camera, output);
   *
   *   // Stop after duration
   *   setTimeout(() => {
   *     livestream.stop();
   *     console.log("Recording complete");
   *   }, durationMs);
   * }
   * ```
   *
   * @category API Access
   */
  public createLivestream(): ProtectLivestream {

    return new ProtectLivestream(this, this.log);
  }

  /**
   * Return an API endpoint URL for the requested endpoint type.
   *
   * @param endpoint - Endpoint type to retrieve
   *
   * @returns Full URL to the requested endpoint, or empty string if invalid.
   *
   * @remarks
   * Generates properly formatted URLs for Protect API endpoints:
   *
   * | Endpoint | Path | Description |
   * |----------|------|-------------|
   * | `bootstrap` | `/api/bootstrap` | Complete system configuration |
   * | `camera` | `/api/cameras` | Camera management |
   * | `chime` | `/api/chimes` | Chime device management |
   * | `light` | `/api/lights` | Light device management |
   * | `login` | `/api/auth/login` | Authentication endpoint |
   * | `nvr` | `/api/nvr` | NVR configuration |
   * | `self` | `/api/users/self` | Current user information |
   * | `sensor` | `/api/sensors` | Sensor device management |
   * | `websocket` | `/api/ws` | WebSocket endpoints |
   * | `viewer` | `/api/viewers` | Viewport device management |
   *
   * @example
   * Building custom API URLs:
   *
   * ```typescript
   * import { ProtectApi } from "unifi-protect";
   *
   * const protect = new ProtectApi();
   *
   * async function customEndpoints() {
   *   await protect.login("192.168.1.1", "admin", "password");
   *
   *   // Get base endpoints
   *   const cameraEndpoint = protect.getApiEndpoint("camera");
   *   // Returns: "https://192.168.1.1/proxy/protect/api/cameras"
   *
   *   // Build specific camera URL
   *   const cameraId = "abc123";
   *   const specificCamera = `${cameraEndpoint}/${cameraId}`;
   *
   *   // Make custom request
   *   const response = await protect.retrieve(specificCamera);
   *   if (response) {
   *     const camera = await response.body.json();
   *     console.log(`Camera: ${camera.name}`);
   *   }
   * }
   * ```
   *
   * @category API Access
   */
  public getApiEndpoint(endpoint: string): string {

    let endpointSuffix;
    let endpointPrefix = "/proxy/protect/api/";

    switch(endpoint) {

      case "bootstrap":

        endpointSuffix = "bootstrap";

        break;

      case "camera":

        endpointSuffix = "cameras";

        break;

      case "chime":

        endpointSuffix = "chimes";

        break;

      case "light":

        endpointSuffix = "lights";

        break;

      case "login":
        endpointPrefix = "/api/";
        endpointSuffix = "auth/login";

        break;

      case "nvr":

        endpointSuffix = "nvr";

        break;

      case "self":

        endpointPrefix = "/api/";
        endpointSuffix = "users/self";

        break;

      case "sensor":

        endpointSuffix = "sensors";

        break;

      case "websocket":

        endpointSuffix = "ws";

        break;

      case "viewer":

        endpointSuffix = "viewers";

        break;

      default:

        break;
    }

    if(!endpointSuffix) {

      return "";
    }

    return "https://" + this.nvrAddress + endpointPrefix + endpointSuffix;
  }

  /**
   * Access the Protect controller bootstrap JSON.
   *
   * @returns Bootstrap configuration if available, `null` otherwise.
   *
   * @remarks
   * The bootstrap must be retrieved via {@link getBootstrap} before accessing this property. The bootstrap contains the complete system state and is automatically
   * updated when configuration changes occur.
   *
   * @see {@link getBootstrap} to retrieve the bootstrap configuration
   * @see {@link ProtectNvrBootstrap} for the complete data structure
   *
   * @category API Access
   */
  public get bootstrap(): Nullable<ProtectNvrBootstrap> {

    return this._bootstrap;
  }

  /**
   * Check if the current user has administrative privileges.
   *
   * @returns `true` if the user has Super Admin role, `false` otherwise.
   *
   * @remarks
   * Administrative privileges are required for:
   *
   * - Modifying device configurations
   * - Enabling/disabling RTSP streams
   * - Changing system settings
   * - Managing user accounts
   *
   * The privilege level is determined during login and updated on each bootstrap.
   *
   * @category Utilities
   */
  public get isAdminUser(): boolean {

    return this._isAdminUser;
  }

  /**
   * Check if API calls are currently throttled due to errors.
   *
   * @returns `true` if throttled, `false` otherwise.
   *
   * @remarks
   * The API implements automatic throttling after repeated errors to prevent overwhelming the controller. During throttling:
   *
   * - API calls return `null` immediately
   * - No network requests are made
   * - Throttling automatically clears after the retry interval
   *
   * Default throttling occurs after 10 consecutive errors for 5 minutes.
   *
   * @category Utilities
   */
  public get isThrottled(): boolean {

    return this._isThrottled;
  }

  /**
   * Get a formatted name for the Protect controller.
   *
   * @returns Controller name in format: `Name [Type]` or just the address if not bootstrapped.
   *
   * @remarks
   * Returns a human-readable controller identifier. After bootstrap, includes the controller's configured name and model type. Before bootstrap, returns the network
   * address used for connection.
   *
   * @example
   * ```typescript
   * // Before bootstrap: "192.168.1.1"
   * // After bootstrap: "Dream Machine Pro [UDMP]"
   * console.log(protect.name);
   * ```
   *
   * @category Utilities
   */
  public get name(): string {

    // Our NVR string, if it exists, appears as `NVR [NVR Type]`. Otherwise, we appear as `NVRaddress`.
    if(this._bootstrap?.nvr) {

      return (this._bootstrap.nvr.name ?? this._bootstrap.nvr.marketName) + " [" + this._bootstrap.nvr.marketName + "]";
    } else {

      return this.nvrAddress;
    }
  }
}
