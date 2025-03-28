/* Copyright(C) 2019-2025, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * protect-api.ts: Our UniFi Protect API implementation.
 */

/**
 * A complete implementation of the UniFi Protect API, including access to the events, livestream data (not just RTSP), and websockets endpoints.
 *
 * The UniFi Protect API is largely undocumented and has been reverse engineered mostly through the Protect native web interface as well as trial and error. This
 * implementation provides a high-performance, event-driven interface into the Protect API, allowing you to access all of Protect's rich capabilities.
 *
 * @module ProtectApi
 */
import { ALPNProtocol, AbortError, FetchError, Headers, Request, RequestOptions, Response, context, reset, timeoutSignal } from "@adobe/fetch";
import { Nullable, ProtectCameraChannelConfigInterface, ProtectCameraConfig, ProtectCameraConfigInterface, ProtectCameraConfigPayload, ProtectChimeConfig,
  ProtectChimeConfigPayload, ProtectLightConfig, ProtectLightConfigPayload, ProtectNvrBootstrap, ProtectNvrConfig, ProtectNvrConfigPayload, ProtectNvrUserConfig,
  ProtectSensorConfig, ProtectSensorConfigPayload, ProtectViewerConfig, ProtectViewerConfigPayload } from "./protect-types.js";
import { PROTECT_API_ERROR_LIMIT, PROTECT_API_RETRY_INTERVAL, PROTECT_API_TIMEOUT } from "./settings.js";
import { EventEmitter } from "node:events";
import { ProtectApiEvents } from "./protect-api-events.js";
import { ProtectLivestream } from "./protect-api-livestream.js";
import { ProtectLogging } from "./protect-logging.js";
import WebSocket from "ws";
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
  private fetch: (url: string | Request, options?: RequestOptions) => Promise<Response>;
  private headers: Headers;
  private _isAdminUser: boolean;
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

    this.log = {

      debug: (message: string, ...parameters: unknown[]): void => log?.debug(this.name + ": " + message, ...parameters),
      error: (message: string, ...parameters: unknown[]): void => log?.error(this.name + ": API error: " + message, ...parameters),
      info: (message: string, ...parameters: unknown[]): void => log?.info(this.name + ": " + message, ...parameters),
      warn: (message: string, ...parameters: unknown[]): void => log?.warn(this.name + ": " + message, ...parameters)
    };

    this.apiErrorCount = 0;
    this.apiLastSuccess = 0;
    this.fetch = context({ alpnProtocols: [ ALPNProtocol.ALPN_HTTP2 ], maxCacheSize: 0, rejectUnauthorized: false, userAgent: "unifi-protect" }).fetch;
    this.headers = new Headers();
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

    this.logout();

    this.nvrAddress = nvrAddress;
    this.username = username;
    this.password = password;

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
    if(this.headers.has("Cookie") && this.headers.has("X-CSRF-Token")) {

      return true;
    }

    // Acquire a CSRF token, if needed. We only need to do this if we aren't already logged in, or we don't already have a token.
    if(!this.headers.has("X-CSRF-Token")) {

      // UniFi OS has cross-site request forgery protection built into it's web management UI. We retrieve the CSRF token, if available, by connecting to the Protect
      // controller and checking the headers for it.
      const response = await this.retrieve("https://" + this.nvrAddress, { method: "GET" }, false);

      if(response?.ok) {

        const csrfToken = response.headers.get("X-CSRF-Token");

        // Preserve the CSRF token, if found, for future API calls.
        if(csrfToken) {

          this.headers.set("X-CSRF-Token", csrfToken);
        }
      }
    }

    // Log us in.
    const response = await this.retrieve(this.getApiEndpoint("login"), {

      body: JSON.stringify({ password: this.password, rememberMe: true, token: "", username: this.username }),
      method: "POST"
    });

    // Something went wrong with the login call, possibly a controller reboot or failure.
    if(!response?.ok) {

      this.logout();

      return false;
    }

    // We're logged in. Let's configure our headers.
    const csrfToken = response.headers.get("X-Updated-CSRF-Token") ?? response.headers.get("X-CSRF-Token");
    const cookie = response.headers.get("Set-Cookie");

    // Save the refreshed cookie and CSRF token for future API calls and we're done.
    if(csrfToken && cookie) {

      // Only preserve the token element of the cookie and not the superfluous information that's been added to it.
      this.headers.set("Cookie", cookie.split(";")[0]);

      // Save the CSRF token.
      this.headers.set("X-CSRF-Token", csrfToken);

      return true;
    }

    // Clear out our login credentials.
    this.logout();

    return false;
  }

  // Attempt to retrieve the bootstrap configuration from the Protect NVR.
  private async bootstrapController(retry: boolean): Promise<boolean> {

    // If we're retrying, let's first reset our connection context compleely.
    if(retry) {

      await reset();
    }

    // Log us in if needed.
    if(!(await this.loginController())) {

      return retry ? this.bootstrapController(false) : false;
    }

    const response = await this.retrieve(this.getApiEndpoint("bootstrap"));

    // Something went wrong. Retry the bootstrap attempt once, and then we're done.
    if(!response?.ok) {

      this.logRetry("Unable to retrieve the UniFi Protect controller configuration.", retry);

      return retry ? this.bootstrapController(false) : false;
    }

    // Now let's get our NVR configuration information.
    let data: Nullable<ProtectNvrBootstrap> = null;

    try {

      data = await response.json() as ProtectNvrBootstrap;

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

      const ws = new WebSocket("wss://" + this.nvrAddress + "/proxy/protect/ws/updates?" + params.toString(), {

        headers: {

          Cookie: this.headers.get("Cookie") ?? ""
        },

        rejectUnauthorized: false
      });

      if(!ws) {

        this.log.error("Unable to connect to the realtime update events API. Will retry again later.");
        this._eventsWs = null;

        return false;
      }

      let messageHandler: Nullable<(event: Buffer) => void>;

      // Cleanup after ourselves if our websocket closes for some resaon.
      ws.once("close", (): void => {

        this._eventsWs = null;

        if(messageHandler) {

          ws.removeListener("message", messageHandler);
          messageHandler = null;
        }
      });

      // Handle any websocket errors.
      ws.once("error", (error: Error): void => {

        // If we're closing before fully established it's because we're shutting down the API - ignore it.
        if(error.message !== "WebSocket was closed before the connection was established") {

          this.log.error(error.toString());
        }

        ws.terminate();
      });

      // Process messages as they come in.
      ws.on("message", messageHandler = (event: Buffer): void => {

        const packet = ProtectApiEvents.decodePacket(this.log, event);

        if(!packet) {

          this.log.error("Unable to process message from the realtime update events API.");
          ws.terminate();

          return;
        }

        // Emit the decoded packet for users.
        this.emit("message", packet);
      });

      // Make the websocket available, and then we're done.
      this._eventsWs = ws;
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

    if(!response?.ok) {

      this.log.error("%s: Unable to retrieve the snapshot.", this.getFullName(device));

      return null;
    }

    let snapshot;

    try {

      snapshot = Buffer.from(await response.arrayBuffer());
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

    if(!response.ok) {

      this.log.error("%s: Unable to configure the %s: %s.", this.getFullName(device), device.modelKey, response?.status);

      return null;
    }

    // We successfully set the message, return the updated device object.
    return await response.json() as DeviceType;
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
    }, true, undefined, false);

    // Since we took responsibility for interpreting the outcome of the fetch, we need to check for any errors.
    if(!response || !response?.ok) {

      this.apiErrorCount++;

      if(response?.status === 403) {

        this.log.error("%s: Insufficient privileges to enable RTSP on all channels. Please ensure this username has the Administrator role assigned in UniFi Protect.",
          this.getFullName(device));
      } else {

        this.log.error("%s: Unable to enable RTSP on all channels: %s.", this.getFullName(device), response?.status);
      }

      // We still return our camera object if there is at least one RTSP channel enabled.
      return device;
    }

    // Since we have taken responsibility for decoding response types, we need to reset our API backoff count.
    this.apiErrorCount = 0;
    this.apiLastSuccess = Date.now();

    // Everything worked, save the new channel array.
    return await response.json() as ProtectCameraConfig;
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

    this._eventsWs?.terminate();
    this._eventsWs = null;
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
    const csrfToken = this.headers?.get("X-CSRF-Token");

    // Initialize the headers we need.
    this.headers = new Headers();
    this.headers.set("Content-Type", "application/json");

    // Restore the CSRF token if we have one.
    if(csrfToken) {

      this.headers.set("X-CSRF-Token", csrfToken);
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
  private async _getWsEndpoint(endpoint: "livestream" | "talkback", params?: URLSearchParams, retry = true): Promise<Nullable<string>> {

    if(!endpoint) {

      return null;
    }

    // Log us in if needed.
    if(!(await this.loginController())) {

      return null;
    }

    // Ask Protect to give us a URL for this websocket.
    const response = await this.retrieve(this.getApiEndpoint("websocket") + "/" + endpoint +
      ((params && params.toString().length) ? "?" + params.toString() : ""), undefined, !retry);

    // Something went wrong, we're done here.
    if(!response?.ok) {

      // Only inform users if we have a response if we have something to say.
      if(response) {

        this.logRetry("API endpoint access error: " + response.status.toString() + " - " + response.statusText + ".", retry);
      }

      // We failed, but controllers are sometimes rebooted, we can lose our access token or something else may have occurred. Retry one time, after resetting the
      // connection.
      if(retry) {

        this.reset();

        return this._getWsEndpoint(endpoint, params, false);
      }

      return null;
    }

    try {

      const responseJson = await response.json() as Record<string, string>;

      // Adjust the URL for our address.
      const responseUrl = new URL(responseJson.url);

      responseUrl.hostname = this.nvrAddress;

      // Return the URL to the websocket.
      return responseUrl.toString();

    } catch(error) {

      if(error instanceof FetchError) {

        switch(error.code) {

          default:

            this.log.error("Unknown error while communicating with the controller: %s", error.message);

            break;
        }

      } else {

        this.log.error("An error occurred while communicating with the controller: %s.", error);
      }

      return null;
    }
  }

  /**
   * Execute an HTTP fetch request to the Protect controller.
   *
   * @param url       - Complete URL to execute **without** any additional parameters you want to pass (e.g. https://unvr.local/proxy/protect/cameras/someid/snapshot).
   * @param options   - Parameters to pass on for the endpoint request.
   * @param logErrors - Log errors that aren't already accounted for and handled, rather than failing silently. Defaults to `true`.
   * @param overrideTimeout - Override the default timeout for the request (useful for AI-Key analyzer requests). Defaults to the global timeout value.
   *
   * @returns Returns a promise that will resolve to a Response object successful, and `null` otherwise.
   *
   * @remarks This method should be used when direct access to the Protect controller is needed, or when this library doesn't have a needed method to access
   *   controller capabilities. `options` must be a
   *   [Fetch API compatible](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options) request options object.
   *
   * @category API Access
   */
  // Communicate HTTP requests with a Protect controller.
  public async retrieve(url: string, options: RequestOptions = { method: "GET" }, logErrors = true, overrideTimeout?: number): Promise<Nullable<Response>> {

    return this._retrieve(url, options, logErrors, overrideTimeout);
  }

  // Internal interface to communicating HTTP requests with a Protect controller, with error handling.
  private async _retrieve(url: string, options: RequestOptions = { method: "GET" }, logErrors = true, overrideTimeout?: number, decodeResponse = true, isRetry = false):
  Promise<Nullable<Response>> {

    // Log errors if that's what the caller requested.
    const logError = (message: string, ...parameters: unknown[]): void => {

      if(!logErrors) {

        return;
      }

      this.log.error(message, ...parameters);
    };

    // We'll delay our retry by 50 to 150ms, with a little randomness thrown in for good measure, to give the controller a chance to recover from it's quirkiness.
    const retry = async (): Promise<Nullable<Response>> => {

      // Reset our connection context compleely.
      await reset();

      return new Promise(resolve => setTimeout(() => resolve(this._retrieve(url, options, logErrors, overrideTimeout, decodeResponse, true)),
        Math.floor(Math.random() * (150 - 50 + 1)) + 50));
    };

    // Catch Protect controller server-side issues:
    //
    // 400: Bad request.
    // 404: Not found.
    // 429: Too many requests.
    // 500: Internal server error.
    // 502: Bad gateway.
    // 503: Service temporarily unavailable.
    const isServerSideIssue = (code: number): boolean => [400, 404, 429, 500, 502, 503].some(x => x === code);

    let response: Response;

    // Create a signal handler to deliver the abort operation.
    const signal = timeoutSignal(overrideTimeout ?? PROTECT_API_TIMEOUT);

    options.headers = this.headers;
    options.signal = signal;

    try {

      const now = Date.now();

      // Throttle this after PROTECT_API_ERROR_LIMIT attempts.
      if(this.apiErrorCount >= PROTECT_API_ERROR_LIMIT) {

        // Let the user know we've got an API problem.
        if(this.apiErrorCount === PROTECT_API_ERROR_LIMIT) {

          this.log.error("Throttling API calls due to errors with the %s previous attempts. Pausing communication with the Protect controller for %s minutes.",
            this.apiErrorCount, PROTECT_API_RETRY_INTERVAL / 60);
          this.apiErrorCount++;
          this.apiLastSuccess = now;
          this.reset();

          return null;
        }

        // Check to see if we are still throttling our API calls.
        if((this.apiLastSuccess + (PROTECT_API_RETRY_INTERVAL * 1000)) > now) {

          return null;
        }

        // Inform the user that we're out of the penalty box and try again.
        this.log.error("Resuming connectivity to the UniFi Protect API after pausing for %s minutes.", PROTECT_API_RETRY_INTERVAL / 60);

        this.apiErrorCount = 0;
        this.reset();

        if(!(await this.loginController())) {

          return null;
        }
      }

      // Execute the API request.
      response = await this.fetch(url, options);

      // The caller will sort through responses instead of us.
      if(!decodeResponse) {

        return response;
      }

      // Preemptively increase the error count, but only if we're not retrying.
      if(!isRetry) {

        this.apiErrorCount++;
      }

      // Bad username and password.
      if(response.status === 401) {

        this.logout();
        logError("Invalid login credentials given. Please check your login and password.");

        return null;
      }

      // Insufficient privileges.
      if(response.status === 403) {

        logError("Insufficient privileges for this user. Please check the roles assigned to this user and ensure it has sufficient privileges.");

        return null;
      }

      if(!response.ok && isServerSideIssue(response.status)) {

        // Retry on server side status issues, but no more than once.
        if(!isRetry) {

          return retry();
        }

        logError("Unable to connect to the Protect controller. This is usually temporary and will occur during device reboots.");

        return null;
      }

      // Some other unknown error occurred.
      if(!response.ok) {

        logError("%s - %s", response.status, response.statusText);

        return null;
      }

      // We're all good - return the response and we're done.
      this.apiLastSuccess = Date.now();
      this.apiErrorCount = 0;

      return response;
    } catch(error) {

      // Increment our API error count only if we're not in currently in a retry.
      if(!isRetry) {

        this.apiErrorCount++;
      }

      if(error instanceof AbortError) {

        // Retry on API timeouts, but no more than once.
        if(!isRetry) {

          return retry();
        }

        logError("Protect controller is taking too long to respond to a request. This error can usually be safely ignored.");
        this.log.debug("Original request was: %s", url);

        return null;
      }

      if(error instanceof FetchError) {

        switch(error.code) {

          case "ECONNREFUSED":
          case "EHOSTDOWN":

            // Retry on connection refused, but no more than once.
            if(!isRetry) {

              return retry();
            }

            logError("Connection refused.");

            break;

          case "ECONNRESET":
          case "ERR_HTTP2_STREAM_CANCEL":
          case "ERR_HTTP2_STREAM_ERROR":

            // Retry on connection reset, but no more than once.
            if(!isRetry) {

              return retry();
            }

            logError("Network connection to Protect controller has been reset.");

            break;

          case "ENOTFOUND":

            logError("Hostname or IP address not found: %s. Please ensure the address you configured for this UniFi Protect controller is correct.",
              this.nvrAddress);

            break;

          default:

            // If we're logging when we have an error, do so.
            logError("Error: %s | %s.", error.code, error.message);

            break;
        }
      }

      return null;
    } finally {

      // Clear out our response timeout.
      signal.clear();
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

    return this.apiErrorCount >= PROTECT_API_ERROR_LIMIT;
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
