/* Copyright(C) 2019-2023, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * protect-api.ts: Our UniFi Protect API implementation.
 */
import { PROTECT_API_ERROR_LIMIT, PROTECT_API_RETRY_INTERVAL, PROTECT_API_TIMEOUT } from "./settings.js";
import {
  ProtectCameraChannelConfigInterface,
  ProtectCameraConfig,
  ProtectCameraConfigInterface,
  ProtectCameraConfigPayload,
  ProtectChimeConfig,
  ProtectChimeConfigPayload,
  ProtectLightConfig,
  ProtectLightConfigPayload,
  ProtectNvrBootstrap,
  ProtectNvrConfig,
  ProtectNvrConfigPayload,
  ProtectNvrUserConfig,
  ProtectSensorConfig,
  ProtectSensorConfigPayload,
  ProtectViewerConfig,
  ProtectViewerConfigPayload
} from "./protect-types.js";

import fetch, { AbortError, FetchError, Headers, RequestInfo, RequestInit, Response } from "node-fetch";
import https, { Agent } from "node:https";
import { AbortController } from "abort-controller";
import { EventEmitter } from "node:events";
import { ProtectApiEvents } from "./protect-api-events.js";
import { ProtectLivestream } from "./protect-api-livestream.js";
import { ProtectLogging } from "./protect-logging.js";
import WebSocket from "ws";
import util from "node:util";

// Define our known Protect types.
type ProtectKnownDeviceTypes = ProtectCameraConfig | ProtectChimeConfig | ProtectLightConfig | ProtectNvrConfig |
  ProtectSensorConfig | ProtectViewerConfig;

type ProtectKnownDevicePayloads = ProtectCameraConfigPayload | ProtectChimeConfigPayload | ProtectLightConfigPayload | ProtectNvrConfigPayload |
  ProtectSensorConfigPayload | ProtectViewerConfigPayload;

/*
 * The UniFi Protect API is largely undocumented and has been reverse engineered mostly through
 * the web interface, and trial and error.
 *
 * Here's how the UniFi Protect API works:
 *
 * 1. Login to the UniFi Protect NVR device and acquire security credentials for further calls to the API.
 *
 * 2. Enumerate the list of UniFi Protect devices by calling the bootstrap URL. This
 *    contains almost everything you would want to know about this particular UniFi Protect controller.
 *
 * 3. Use the events API to track updates to the devices detected by the Protect controller.
 *
 * Those are the basics that gets us up and running.
 */
export class ProtectApi extends EventEmitter {

  private _bootstrap: ProtectNvrBootstrap | null;
  private _eventsWs: WebSocket | null;
  private _log: ProtectLogging;

  private apiErrorCount: number;
  private apiLastSuccess: number;
  private headers!: Headers;
  private httpsAgent: Agent;
  private isAdminUser: boolean;
  private loginAge: number;
  private nvrAddress: string;
  private password: string;
  private username: string;

  // Initialize this instance with our login information.
  constructor(log?: ProtectLogging) {

    // Initialize our parent.
    super();

    // If we didn't get passed a logging parameter, by default we log to the console.
    if(!log) {

      log = {

        /* eslint-disable no-console */
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        debug: (message: string, ...parameters: unknown[]): void => { /* No debug logging by default. */ },
        error: (message: string, ...parameters: unknown[]): void => console.error(message, ...parameters),
        info: (message: string, ...parameters: unknown[]): void => console.log(message, ...parameters),
        warn: (message: string, ...parameters: unknown[]): void => console.log(message, ...parameters)
        /* eslint-enable no-console */
      };
    }

    this._bootstrap = null;
    this._eventsWs = null;

    this._log = {

      debug: (message: string, ...parameters: unknown[]): void => log?.debug(this.name + ": " + message, ...parameters),
      error: (message: string, ...parameters: unknown[]): void => log?.error(this.name + ": API error: " + message, ...parameters),
      info: (message: string, ...parameters: unknown[]): void => log?.info(this.name + ": " + message, ...parameters),
      warn: (message: string, ...parameters: unknown[]): void => log?.warn(this.name + ": " + message, ...parameters)
    };

    this.apiErrorCount = 0;
    this.apiLastSuccess = 0;
    this.httpsAgent = new https.Agent({ rejectUnauthorized: false });
    this.isAdminUser = false;
    this.loginAge = 0;
    this.nvrAddress = "";
    this.username = "";
    this.password = "";

    this.clearLoginCredentials();
  }

  // Login to the Protect controller and terminate any existing login we might have.
  public async login(nvrAddress: string, username: string, password: string): Promise<boolean> {

    this.clearLoginCredentials();

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

  // Acquire a CSRF token for our API session if needed.
  private async _acquireCsrfToken(): Promise<boolean> {

    // We only need to acquire a token if we aren't already logged in, or we don't already have a token.
    if(this.headers.has("X-CSRF-Token")) {

      return true;
    }

    // UniFi OS has cross-site request forgery protection built into it's web management UI. We use this fact to fingerprint it
    // by connecting directly to the supplied Protect controller address and see if there's a CSRF token waiting for us.
    const response = await this.fetch("https://" + this.nvrAddress, { method: "GET" }, false);

    if(response?.ok) {

      const csrfToken = response.headers.get("X-CSRF-Token");

      // We found a token.
      if(csrfToken) {

        this.headers.set("X-CSRF-Token", csrfToken);
        return true;
      }
    }

    // Something went wrong.
    return false;
  }

  // Login to the UniFi Protect API.
  private async loginController(): Promise<boolean> {

    // If we're already logged in, we're done.
    if(this.headers.has("Cookie") && this.headers.has("X-CSRF-Token")) {

      return true;
    }

    // Make sure we have a CSRF token, or get one if needed.
    if(!(await this._acquireCsrfToken())) {

      this.clearLoginCredentials();
      return false;
    }

    // Log us in.
    const response = await this.fetch(this.getApiEndpoint("login"), {

      body: JSON.stringify({ password: this.password, rememberMe: "true", username: this.username }),
      method: "POST"
    });

    // Something went wrong with the login call, possibly a controller reboot or failure.
    if(!response?.ok) {

      this.clearLoginCredentials();
      return false;
    }

    // We're logged in. Let's configure our headers.
    const csrfToken = response.headers.get("X-CSRF-Token");
    const cookie = response.headers.get("Set-Cookie");

    // Save the refreshed cookie and CSRF token for future API calls and we're done.
    if(csrfToken && cookie && this.headers.has("X-CSRF-Token")) {

      this.headers.set("Cookie", cookie);
      this.headers.set("X-CSRF-Token", csrfToken);

      return true;
    }

    // Clear out our login credentials and reset for another try.
    this.clearLoginCredentials();

    return false;
  }

  // Attempt to retrieve the bootstrap configuration from the Protect NVR.
  private async bootstrapController(retry: boolean): Promise<boolean> {

    // Log us in if needed.
    if(!(await this.loginController())) {

      this.clearLoginCredentials();

      return retry ? this.bootstrapController(false) : false;
    }

    const response = await this.fetch(this.getApiEndpoint("bootstrap"));

    // Something went wrong. Retry the bootstrap attempt once, and then we're done.
    if(!response?.ok) {

      this.log.error("Unable to retrieve the UniFi Protect controller configuration.%s", retry ? " Retrying." : "");

      return retry ? this.bootstrapController(false) : false;
    }

    // Now let's get our NVR configuration information.
    let data: ProtectNvrBootstrap | null = null;

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

      let messageHandler: ((event: Buffer) => void) | null;

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

  // Get our UniFi Protect NVR configuration.
  public async getBootstrap(): Promise<boolean> {

    // Bootstrap the controller, and attempt to retry the bootstrap if it fails.
    return this.bootstrapController(true);
  }

  // Validate if all RTSP channels enabled on all cameras.
  public isAllRtspConfigured(): boolean {

    // Look for any cameras with any non-RTSP enabled channels.
    return this._bootstrap?.cameras?.some(camera => camera.channels?.some(channel => !channel.isRtspEnabled)) ? true : false;
  }

  // Check admin privileges.
  private checkAdminUserStatus(isFirstRun = false): boolean {

    if(!this._bootstrap?.users) {

      return false;
    }

    // Save our prior state so we can detect role changes without having to restart.
    const oldAdminStatus = this.isAdminUser;

    // Find this user.
    const user = this._bootstrap?.users.find((x: ProtectNvrUserConfig) => x.id === this._bootstrap?.authUserId);

    if(!user?.allPermissions) {

      return false;
    }

    // Let's figure out this user's permissions.
    let newAdminStatus = false;

    for(const entry of user.allPermissions) {

      // Each permission line exists as: permissiontype:permissions:scope.
      const permType = entry.split(":");

      // We only care about camera permissions.
      if(permType[0] !== "camera") {

        continue;
      }

      // Get the individual permissions.
      const permissions = permType[1].split(",");

      // We found our administrative privileges - we're done.
      if(permissions.indexOf("write") !== -1) {

        newAdminStatus = true;
        break;
      }
    }

    this.isAdminUser = newAdminStatus;

    // Only admin users can activate RTSP streams. Inform the user on startup, or if we detect a role change.
    if(isFirstRun && !this.isAdminUser) {

      this.log.info("The user '%s' requires the Administrator role in order to automatically configure camera RTSP streams.", this.username);
    } else if(!isFirstRun && (oldAdminStatus !== this.isAdminUser)) {

      this.log.info("Detected a role change for user '%s': the Administrator role has been %s.", this.username, this.isAdminUser ? "enabled" : "disabled");
    }

    return true;
  }

  // Update a Protect device object.
  public async updateDevice<DeviceType extends ProtectKnownDeviceTypes>(device: DeviceType, payload: ProtectKnownDevicePayloads): Promise<DeviceType | null> {

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
    const response = await this.fetch(this.getApiEndpoint(device.modelKey) + (device.modelKey === "nvr" ? "" :  "/" + device.id), {

      body: JSON.stringify(payload),
      method: "PATCH"
    });

    if(!response?.ok) {

      this.log.error("%s: Unable to configure the %s: %s.", this.getFullName(device), device.modelKey, response?.status);
      return null;
    }

    // We successfully set the message, return the updated device object.
    return await response.json() as DeviceType;
  }

  // Update camera channels on a supported Protect device.
  public async updateCameraChannels(device: ProtectCameraConfigInterface): Promise<ProtectCameraConfig | null> {

    // Make sure we have the permissions to modify the camera JSON.
    if(!(await this.canModifyCamera(device))) {

      return null;
    }

    // Update Protect with the new configuration.
    const response = await this.fetch(this.getApiEndpoint(device.modelKey) + "/" + device.id, {

      body: JSON.stringify({ channels: device.channels }),
      method: "PATCH"
    }, true, false);

    // Since we took responsibility for interpreting the outcome of the fetch, we need to check for any errors.
    if (!response || !response?.ok) {

      this.apiErrorCount++;

      if (response?.status === 403) {

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

  // Enable RTSP stream support on an attached Protect device.
  public async enableRtsp(device: ProtectCameraConfigInterface): Promise<ProtectCameraConfig | null> {

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

  // Utility to generate a nicely formatted device string.
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
    return name + " [" + type + "]" + (deviceInfo ? " (" + host + "mac: " + device.mac + ")" : "");
  }

  // Utility to generate a nicely formatted NVR and device string.
  public getFullName(device: ProtectKnownDeviceTypes): string {

    const deviceName = this.getDeviceName(device);

    // Returns: NVR [NVR Type] Device Name [Device Type]
    return this.name + (deviceName.length ? " " + deviceName : "");
  }

  // Utility to clear out old login credentials or attempts.
  public clearLoginCredentials(): void {

    this.isAdminUser = false;
    this.loginAge = 0;
    this._bootstrap = null;

    this._eventsWs?.terminate();
    this._eventsWs = null;

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
    if (!(await this.loginController())) {

      return false;
    }

    // Only admin users can activate RTSP streams.
    if (!this.isAdminUser) {

      return false;
    }

    // At the moment, we only know about camera devices.
    if (device.modelKey !== "camera") {

      return false;
    }

    return true;
  }

  // Return a WebSocket URL endpoint from the Protect controller for Protect API services (e.g. livestream, talkback).
  public async getWsEndpoint(endpoint: "livestream" | "talkback", params?: URLSearchParams): Promise<string | null> {

    return this._getWsEndpoint(endpoint, params);
  }

  // Internal interface to returning a WebSocket URL endpoint from the Protect controller for Protect API services (e.g. livestream, talkback).
  private async _getWsEndpoint(endpoint: "livestream" | "talkback", params?: URLSearchParams, retry = true): Promise<string | null> {

    if(!endpoint) {

      return null;
    }

    // Log us in if needed.
    if(!(await this.loginController())) {

      return null;
    }

    // Ask Protect to give us a URL for this websocket.
    const response = await this.fetch(this.getApiEndpoint("websocket") + "/" + endpoint + ((params && params.toString().length) ? "?" + params.toString() : ""));

    // Something went wrong, we're done here.
    if(!response?.ok) {

      // Only inform users if we have a response if we have something to say.
      if(response) {

        this.log.error("API endpoint access error: %s - %s.%s", response.status.toString(), response.statusText, retry ? " Retrying." : "");
      }

      // We failed, but controllers are sometimes rebooted, we can lose our access token or something else may have occurred. Retry one time, after logging back in.
      if(retry) {

        this.clearLoginCredentials();

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

  // Utility to let us streamline error handling and return checking from the Protect API.
  public async fetch(url: RequestInfo, options: RequestInit = { method: "GET" }, logErrors = true, decodeResponse = true, isRetry = false): Promise<Response | null> {

    const logError = (message: string, ...parameters: unknown[]): void => this.log.error(message, ...parameters);

    let response: Response;

    const controller = new AbortController();

    // Ensure API responsiveness and guard against hung connections.
    const timeout = setTimeout(() => {

      controller.abort();
    }, 1000 * PROTECT_API_TIMEOUT);

    options.agent = this.httpsAgent;
    options.headers = this.headers;
    options.signal = controller.signal;

    try {

      const now = Date.now();

      // Throttle this after PROTECT_API_ERROR_LIMIT attempts.
      if(this.apiErrorCount >= PROTECT_API_ERROR_LIMIT) {

        // Let the user know we've got an API problem.
        if(this.apiErrorCount === PROTECT_API_ERROR_LIMIT) {

          logError("Throttling API calls due to errors with the %s previous attempts. Pausing communication with the Protect controller for %s minutes.",
            this.apiErrorCount, PROTECT_API_RETRY_INTERVAL / 60);
          this.apiErrorCount++;
          this.apiLastSuccess = now;
          return null;
        }

        // Check to see if we are still throttling our API calls.
        if((this.apiLastSuccess + (PROTECT_API_RETRY_INTERVAL * 1000)) > now) {

          return null;
        }

        // Inform the user that we're out of the penalty box and try again.
        logError("Resuming connectivity to the UniFi Protect API after pausing for %s minutes.", PROTECT_API_RETRY_INTERVAL / 60);

        this.apiErrorCount = 0;
        this.clearLoginCredentials();

        if(!(await this.loginController())) {

          return null;
        }
      }

      response = await fetch(url, options);

      // The caller will sort through responses instead of us.
      if(!decodeResponse) {

        return response;
      }

      // Bad username and password.
      if(response.status === 401) {

        this.clearLoginCredentials();
        this.apiErrorCount++;
        logError("Invalid login credentials given. Please check your login and password.");
        return null;
      }

      // Insufficient privileges.
      if(response.status === 403) {

        this.apiErrorCount++;
        logError("Insufficient privileges for this user. Please check the roles assigned to this user and ensure it has sufficient privileges.");
        return null;
      }

      // Some other unknown error occurred.
      if(!response.ok) {

        this.apiErrorCount++;
        logError("%s - %s", response.status, response.statusText);
        return null;
      }

      this.apiLastSuccess = Date.now();
      this.apiErrorCount = 0;
      return response;
    } catch(error) {

      this.apiErrorCount++;

      if(error instanceof AbortError) {

        logError("Protect controller is taking too long to respond to a request. This error can usually be safely ignored.");
        logError("Original request was: %s", url);
        return null;
      }

      if(error instanceof FetchError) {

        switch(error.code) {

          case "ECONNREFUSED":

            logError("Connection refused.");
            break;

          case "ECONNRESET":

            // Retry on connection reset, but no more than once.
            if(!isRetry) {

              return this.fetch(url, options, logErrors, decodeResponse, true);
            }

            logError("Network connection to Protect controller has been reset.");
            break;

          case "ENOTFOUND":

            logError("Hostname or IP address not found: %s. Please ensure the address you configured for this UniFi Protect controller is correct.",
              this.nvrAddress);
            break;

          default:

            // If we're logging when we have an error, do so.
            if(logErrors) {

              logError(error.message);
            }
            break;
        }
      }

      return null;
    } finally {

      // Clear out our response timeout if needed.
      clearTimeout(timeout);
    }
  }

  // Create a new livestream API instance.
  public createLivestream(): ProtectLivestream {

    return new ProtectLivestream(this);
  }

  // Return the appropriate URL to access various Protect API endpoints.
  public getApiEndpoint(deviceType: string): string {

    let endpointSuffix;
    let endpointPrefix = "/proxy/protect/api/";

    switch(deviceType) {

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

  // Get the bootstrap JSON.
  public get bootstrap(): ProtectNvrBootstrap | null {

    return this._bootstrap;
  }

  // Utility to access the logging functions, used by other classes in this library.
  public get log(): ProtectLogging {

    return this._log;
  }

  // Utility to generate a nicely formatted NVR string.
  public get name(): string {

    // Our NVR string, if it exists, appears as `NVR [NVR Type]`. Otherwise, we appear as `NVRaddress`.
    if(this._bootstrap?.nvr) {

      return this._bootstrap.nvr.name + " [" + this._bootstrap.nvr.type + "]";
    } else {

      return this.nvrAddress;
    }
  }
}
