/* Copyright(C) 2019-2025, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * protect-api.ts: Our UniFi Protect API implementation.
 */

/**
 * A complete implementation of the UniFi Protect API, including access to the events, livestream data (not just RTSP), and websocket endpoints.
 *
 * The UniFi Protect API is largely undocumented and has been reverse engineered mostly through the Protect native web interface as well as trial and error. This
 * implementation provides a high-performance, event-driven interface into the Protect API, allowing you to access all of Protect's rich capabilities.
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
  dispatcher?: Dispatcher
} & Omit<Dispatcher.RequestOptions, "origin" | "path">;

/**
 * Options to tailor the behavior of {@link ProtectApi.retrieve}.
 *
 * @property {boolean} [logErrors=true] - Log errors. Defaults to `true`.
 * @property {number} [timeout=3500] - Amount of time, in milliseconds, to wait for the Protect controller to respond before timing out. Defaults to `3500`.
 */
export interface RetrieveOptions {

  logErrors?: boolean,
  timeout?: number
}

// Our private interface to retrieve.
interface InternalRetrieveOptions extends RetrieveOptions {

  decodeResponse?: boolean
}

/**
 * This class provides an event-driven API to access the UniFi Protect API. Here's how to quickly get up and running with this library once you've instantiated the class:
 *
 * 1. {@link login | Login} to the UniFi Protect controller and acquire security credentials for further calls to the API.
 *
 * 2. Retrieve the current configuration and state of the Protect controller by calling the {@link bootstrap} endpoint. This contains everything you would want to know
 *    about this particular UniFi Protect controller, including enumerating all the devices it knows about.
 *
 * 3. Listen for `message` events emitted by {@link ProtectApi} containing all Protect controller events, in realtime. They are delivered as
 *    {@link ProtectApiEvents.ProtectEventPacket | ProtectEventPacket} packets, containing the event-specific details.
 *
 * Those are the basics that gets us up and running.
 */
export class ProtectApi extends EventEmitter {

  private _bootstrap: Nullable<ProtectNvrBootstrap>;
  private _eventsWs: Nullable<WebSocket>;

  private apiErrorCount: number;
  private apiLastSuccess: number;
  private dispatcher!: Dispatcher;
  private headers: Record<string, string>;
  private _isAdminUser: boolean;
  private _isThrottled: boolean;
  private log: ProtectLogging;
  private nvrAddress: string;
  private password: string;
  private username: string;

  /**
   * Create an instance of the UniFi Protect API.
   *
   * @param log - Logging functions to use.
   *
   * @defaultValue `none` - Logging will be done to stdout and stderr.
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

      debug: (message: string, ...parameters: unknown[]): void => log?.debug(this.name + ": " + message, ...parameters),
      error: (message: string, ...parameters: unknown[]): void => log?.error(this.name + ": API error: " + message, ...parameters),
      info: (message: string, ...parameters: unknown[]): void => log?.info(this.name + ": " + message, ...parameters),
      warn: (message: string, ...parameters: unknown[]): void => log?.warn(this.name + ": " + message, ...parameters)
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
   * @param nvrAddress - Address of the UniFi Protect controller, expressed as an FQDN or IP address.
   * @param username   - Username to use when logging into the controller.
   * @param password   - Password to use when logging into the controller.
   *
   * @returns Returns a promise that will resolve to `true` if successful and `false` otherwise.
   *
   * @remarks A `login` event will be emitted each time this method is called, with the result of the attempt as an argument. If there are any existing logins from prior
   *          calls to login, they will be terminated.
   *
   * @example
   * Login to the Protect controller. You can selectively choose to either `await` the promise that is returned by `login`, or subscribe to the `login` event.
   *
   * ```ts
   * import { ProtectApi } from "unifi-protect";
   *
   * // Create a new Protect API instance.
   * const ufp = new ProtectApi();
   *
   * // Set a listener to wait for the login event to occur.
   * ufp.once("login", (successfulLogin: boolean) => {
   *
   *   // Indicate if we are successful.
   *   if(successfulLogin) {
   *
   *     console.log("Logged in successfully.");
   *     process.exit(0);
   *   }
   * });
   *
   * // Login to the Protect controller.
   * if(!(await ufp.login("protect-controller.local", "username", "password"))) {
   *
   *   console.log("Invalid login credentials.");
   *   process.exit(0);
   * };
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

  // Connect to the realtime update events API.
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
   * @returns Returns a promise that will resolve to `true` if successful and `false` otherwise.
   *
   * @remarks A `bootstrap` event will be emitted each time this method is successfully called, with the {@link ProtectNvrBootstrap} JSON as an argument.
   *
   * @example
   * Retrieve the bootstrap JSON. You can selectively choose to either `await` the promise that is returned by `getBootstrap`, or subscribe to the `bootstrap` event.
   *
   * ```ts
   * import { ProtectApi, ProtectNvrBootstrap } from "unifi-protect";
   * import util from "node:util";
   *
   * // Create a new Protect API instance.
   * const ufp = new ProtectApi();
   *
   * // Set a listener to wait for the bootstrap event to occur.
   * ufp.once("bootstrap", (bootstrapJSON: ProtectNvrBootstrap) => {
   *
   *   // Once we've bootstrapped the Protect controller, output the bootstrap JSON and we're done.
   *   process.stdout.write(util.inspect(bootstrapJSON, { colors: true, depth: null, sorted: true }) + "\n", () => process.exit(0));
   * });
   *
   * // Login to the Protect controller.
   * if(!(await ufp.login("protect-controller.local", "username", "password"))) {
   *
   *   console.log("Invalid login credentials.");
   *   process.exit(0);
   * };
   *
   * // Bootstrap the controller. It will emit a message once it's received the bootstrap JSON, or you can alternatively wait for the promise to resolve.
   * if(!(await ufp.getBootstrap())) {
   *
   *   console.log("Unable to bootstrap the Protect controller.");
   *   process.exit(0);
   * }
   * ```
   *
   * Alternatively, you can access the bootstrap JSON directly through the {@link bootstrap} accessor:
   *
   * ```ts
   * import { ProtectApi } from "unifi-protect";
   * import util from "node:util";
   *
   * // Create a new Protect API instance.
   * const ufp = new ProtectApi();
   *
   * // Login to the Protect controller.
   * if(!(await ufp.login("protect-controller.local", "username", "password"))) {
   *
   *   console.log("Invalid login credentials.");
   *   process.exit(0);
   * };
   *
   * // Bootstrap the controller.
   * if(!(await ufp.getBootstrap())) {
   *
   *   console.log("Unable to bootstrap the Protect controller.");
   *   process.exit(0);
   * }
   *
   * // Once we've bootstrapped the Protect controller, access the bootstrap JSON through the bootstrap accessor and we're done.
   * process.stdout.write(util.inspect(ufp.bootstrap, { colors: true, depth: null, sorted: true }) + "\n", () => process.exit(0));
   * ```
   *
   * @category API Access
   */
  // Get our UniFi Protect NVR configuration.
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
   * @param device           - Protect device.
   * @param options          - Parameters to pass on for the snapshot request.
   *
   * @returns Returns a promise that will resolve to a Buffer containing the JPEG image snapshot if successful, and `null` otherwise.
   *
   * @remarks The `options` object for snapshot parameters accepts the following properties, all of which are optional:
   *
   * | Property          | Description                                                                                                |
   * |-------------------|------------------------------------------------------------------------------------------------------------|
   * | height            | The image height to request. Defaults selected by the Protect controller, based on the camera resolution.  |
   * | width             | The image width to request. Defaults selected by the Protect controller, based on the camera resolution.   |
   * | usePackageCamera  | Retriver a snapshot fron the package camera rather than the primary camera lens. Defaults to `false`.      |
   *
   * @category API Access
   */
  public async getSnapshot(device: ProtectCameraConfig, options: Partial<{ width: number, height: number, usePackageCamera: boolean }> = {}): Promise<Nullable<Buffer>> {

    // No device object, or it's not a camera, or we're requesting a package camera snapshot on a camera without one - we're done.
    if(!device || (device.modelKey !== "camera") || (options.usePackageCamera && !device.featureFlags.hasPackageCamera)) {

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

    if(!response || !this.responseOk(response?.statusCode)) {

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
   * @typeParam DeviceType - Generic for any known Protect device type.
   *
   * @param device  - Protect device.
   * @param payload - Device configuration payload to upload, usually a subset of the device-specific configuration JSON.
   *
   * @returns Returns a promise that will resolve to the updated device-specific configuration JSON if successful, and `null` otherwise.
   *
   * @remarks Use this method to change the configuration of a given Protect device or controller. It requires the credentials used to login to the Protect API
   *   to have administrative privileges for most settings.
   *
   * @category API Access
   */
  public async updateDevice<DeviceType extends ProtectKnownDeviceTypes>(device: DeviceType, payload: ProtectKnownDevicePayloads): Promise<Nullable<DeviceType>> {

    // No device object, we're done.
    if(!device) {

      return null;
    }

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

      this.log.error("%s: Unable to configure the %s: %s.", this.getFullName(device), device.modelKey, response?.statusCode);

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
   * @param device - Protect camera to modify.
   *
   * @returns Returns a promise that will resolve to the updated {@link ProtectCameraConfig} if successful, and `null` otherwise.
   *
   * @category Utilities
   */
  public async enableRtsp(device: ProtectCameraConfigInterface): Promise<Nullable<ProtectCameraConfig>> {

    // Make sure we have the permissions to modify the camera JSON.
    if(!(await this.canModifyCamera(device))) {

      return null;
    }

    // Do we have any non-RTSP enabled channels? If not, we're done.
    if(!device.channels?.some(channel => !channel.isRtspEnabled)) {

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
   * @param device     - Protect device.
   * @param name       - Optional name for the device. Defaults to the device type (e.g. `G4 Pro`).
   * @param deviceInfo - Optionally specify whether or not to include the IP address and MAC address in the returned string. Defaults to `false`.
   *
   * @returns Returns the Protect device name in the following format: <code>*Protect device name* [*Protect device type*] (address: *IP address*
   *          mac: *MAC address*)</code>.
   *
   * @remarks The example above assumed the `deviceInfo` parameter is set to `true`.
   *
   * @category Utilities
   */
  public getDeviceName(device: ProtectKnownDeviceTypes, name = device?.name, deviceInfo = false): string {

    // Validate our inputs.
    if(!device) {

      return "";
    }

    // Include the host address information, if we have it.
    const host = (("host" in device) && device.host) ? "address: " + device.host + " " : "";

    const type = (("marketName" in device) && device.marketName) ? device.marketName : device.type;

    // A completely enumerated device will appear as:
    // Device Name [Device Type] (address: IP address, mac: MAC address).
    return (name ?? type) + " [" + type + "]" + (deviceInfo ? " (" + host + "mac: " + device.mac + ")" : "");
  }

  /**
   * Utility method that generates a combined, nicely formatted device and NVR string.
   *
   * @param device - Protect device.
   *
   * @returns Returns the Protect device name in the following format:
   *   <code>*Protect controller name* [*Protect controller type*] *Protect device name* [*Protect device type*]</code>.
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
   * @category Utilities
   */
  public reset(): void {

    this._bootstrap = null;

    this._eventsWs?.close();
    this._eventsWs = null;

    if(this.nvrAddress) {

      // Cleanup any prior pool.
      if(this.dispatcher) {

        void this.dispatcher.destroy();
      }

      // Create an interceptor that allows us to set the user agent to our liking.
      const ua: Dispatcher.DispatcherComposeInterceptor = (dispatch) => (opts: Dispatcher.DispatchOptions, handler: Dispatcher.DispatchHandler) => {

        opts.headers ??= {};
        (opts.headers as Record<string, string>)["user-agent"] = "unifi-protect";

        return dispatch(opts, handler);
      };

      // Create a dispatcher using a new pool. We want to explicitly allow self-signed SSL certificates, enabled HTTP2 connections, and allow up to five connections at a
      // time and provide some robust retry handling - we retry each request up to three times, with backoff.
      this.dispatcher = new Pool("https://" + this.nvrAddress, { allowH2: true, clientTtl: 60 * 1000, connect: { rejectUnauthorized: false }, connections: 5 })
        .compose(ua, interceptors.retry({ maxRetries: 5, maxTimeout: 1000, minTimeout: 100, statusCodes: [ 400, 404, 429, 500, 502, 503, 504 ], timeoutFactor: 2 }));
    }
  }

  /**
   * Clear the login credentials and terminate any open connection to the UniFi Protect API.
   *
   * @category Authentication
   */
  // Utility to clear out old login credentials or attempts.
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
   * @param endpoint - Requested endpoint type. Valid types are `livestream` and `talkback`.
   * @param params   - Parameters to pass on for the endpoint request.
   *
   * @returns Returns a promise that will resolve to a URL to the requested endpoint if successful, and `null` otherwise.
   *
   * @remarks Valid API endpoints are `livestream` and `talkback`.
   *
   * - The `livestream` endpoint will return a URL to a websocket that provides an encoded livestream from a given camera. **Do not access this endpoint directly, use
   *   {@link createLivestream} instead.** Accessing the livestream endpoint directly is not directly useful without additional manipulation, which, unless you have
   *   a need for, you should avoid dealing with and use the {@link ProtectLivestream} API instead that provides you direct access to the livestream as an H.264 fMP4.
   * - The `talkback` endpoint creates a talkback connection to a Protect camera that contains a speaker (e.g. Protect doorbells).
   *   The returned websocket accepts an AAC-encoded ADTS stream. The only valid parameter is `camera`, containing the ID of the Protect camera you want to connect to.
   *
   * @category API Access
   */
  // Return a WebSocket URL endpoint from the Protect controller for Protect API services (e.g. livestream, talkback).
  public async getWsEndpoint(endpoint: "livestream" | "talkback", params?: URLSearchParams): Promise<Nullable<string>> {

    return this._getWsEndpoint(endpoint, params);
  }

  // Internal interface to returning a WebSocket URL endpoint from the Protect controller for Protect API services (e.g. livestream, talkback).
  private async _getWsEndpoint(endpoint: "livestream" | "talkback", params?: URLSearchParams): Promise<Nullable<string>> {

    if(!endpoint) {

      return null;
    }

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
   * Execute an HTTP fetch request to the Protect controller.
   *
   * @param url             - URL to execute **without** any additional parameters you want to pass (e.g. https://unvr.local/proxy/protect/cameras/someid/snapshot).
   * @param options         - Parameters to pass on for the endpoint request.
   * @param retrieveOptions - Options that modify whether errors are logged and timeout intervals to wait for a response from the Protect controller.
   *
   * @returns Returns a promise that will resolve to a Response object successful, and `null` otherwise.
   *
   * @remarks This method should be used when direct access to the Protect controller is needed, or when this library doesn't have a needed method to access
   *   controller capabilities. `options` must be an
   *   [Undici request API compatible](https://undici.nodejs.org/#/docs/api/Dispatcher.md?id=parameter-requestoptions) request options object which itself is an
   *   extension of [DispatchOptions](https://undici.nodejs.org/#/docs/api/Dispatcher.md?id=parameter-dispatchoptions).
   *
   * @category API Access
   */
  // Communicate HTTP requests with a Protect controller.
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
    const serverErrors = new Set([400, 404, 429, 500, 502, 503]);

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

          logError("Unable to connect to the Protect controller. This is usually temporary and will occur during device reboots.");

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
        this.log.debug("Original request was: %s", url);

        return null;
      }

      // We destroyed the pool due to a reset event and our inflight connections are failing.
      if(error instanceof errors.ClientDestroyedError) {

        switch(error.code) {

          case "UND_ERR_DESTROYED":

            break;

          default:

            break;
        }

        return null;
      }

      // We destroyed the pool due to a reset event and our inflight connections are failing.
      if(error instanceof errors.RequestRetryError) {

        switch(error.code) {

          case "UND_ERR_REQ_RETRY":

            logError("Unable to connect to the Protect controller. This is usually temporary and will occur during device reboots.");

            break;

          default:

            break;
        }

        return null;
      }

      // Connection timed out.
      if(error instanceof errors.ConnectTimeoutError) {

        switch(error.code) {

          case "UND_ERR_CONNECT_TIMEOUT":

            logError("Connection timed out.");

            break;

          default:

            break;
        }

        return null;
      }

      if(error instanceof TypeError) {

        const cause = error.cause as NodeJS.ErrnoException;

        switch(cause.code) {

          case "ECONNREFUSED":
          case "EHOSTDOWN":

            logError("Connection refused.");

            break;

          case "ECONNRESET":

            logError("Network connection to Protect controller has been reset.");

            break;

          case "ENOTFOUND":

            logError("Hostname or IP address not found: %s. Please ensure the address you configured for this UniFi Protect controller is correct.",
              this.nvrAddress);

            break;

          default:

            // If we're logging when we have an error, do so.
            logError("Error: %s | %s.", cause.code, cause.message);

            break;
        }

        return null;
      }

      logError(util.inspect(error, { colors: true, depth: null, sorted: true}));

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
   * Determines whether a given HTTP status code represents a successful response.
   *
   * @param code - The HTTP status code returned by a request. If `undefined`, the response is considered not okay.
   *
   * @returns `true` if `code` is between 200 (inclusive) and 300 (exclusive); otherwise returns `false`.
   *
   * @category Utilities
   */
  public responseOk(code?: number): boolean {

    return (code !== undefined) && (code >= 200) && (code < 300);
  }

  /**
   * Return a new instance of the Protect livestream API.
   *
   * @returns Returns a new livestream API object.
   *
   * @remarks This method should be used to create a new livestream API object. It allows you to create access livestreams of individual cameras and interact
   *   directly with the H.264 fMP4 streams for a given camera.
   *
   * @category API Access
   */
  public createLivestream(): ProtectLivestream {

    return new ProtectLivestream(this, this.log);
  }

  /**
   * Return an API endpoint for the requested endpoint type.
   *
   * @param endpoint - Requested endpoint type.
   *
   * @returns Returns a URL to the requested endpoint if successful, and an empty string otherwise.
   *
   * @remarks Valid API endpoints are `bootstrap`, `camera`, `chime`, `light`, `login`, `nvr`, `self`, `sensor`, `websocket` and `viewer`.
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
   * @returns Returns the bootstrap JSON if the Protect controller has been bootstrapped, `null` otherwise.
   *
   * @remarks A call to {@link getBootstrap} is required before calling this getter. Otherwise, it will return `null`. Put another way, you need to execute a bootstrap
   * request to the Protect controller before accessing the bootstrap JSON.
   *
   * @category API Access
   */
  public get bootstrap(): Nullable<ProtectNvrBootstrap> {

    return this._bootstrap;
  }

  /**
   * Utility method that returns whether the credentials that were used to login to the Protect controller have administrative privileges or not.
   *
   * @returns Returns `true` if the logged in user has administrative privileges, `false` otherwise.
   *
   * @category Utilities
   */
  public get isAdminUser(): boolean {

    return this._isAdminUser;
  }

  /**
   * Utility method that returns whether our connection to the Protect controller is currently throttled or not.
   *
   * @returns Returns `true` if the API has returned too many errors and is now throttled for a period of time, `false` otherwise.
   *
   * @category Utilities
   */
  public get isThrottled(): boolean {

    return this._isThrottled;
  }

  /**
   * Utility method that returns a nicely formatted version of the Protect controller name.
   *
   * @returns Returns the Protect controller name in the following format:
   *   <code>*Protect controller name* [*Protect controller type*]</code>.
   *
   * @category Utilities
   */
  public get name(): string {

    // Our NVR string, if it exists, appears as `NVR [NVR Type]`. Otherwise, we appear as `NVRaddress`.
    if(this._bootstrap?.nvr) {

      return this._bootstrap.nvr.name + " [" + this._bootstrap.nvr.type + "]";
    } else {

      return this.nvrAddress;
    }
  }
}
