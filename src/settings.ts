/* Copyright(C) 2017-2022, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * settings.ts: Settings and constants for UniFi Protect.
 */

// Number of API errors to accept before we implement backoff so we don't slam a Protect controller.
export const PROTECT_API_ERROR_LIMIT = 10;

// Interval, in seconds, to wait before trying to access the API again once we've hit the PROTECT_API_ERROR_LIMIT threshold.
export const PROTECT_API_RETRY_INTERVAL = 300;

// Protect API response timeout, in seconds. This should never be greater than 5 seconds.
export const PROTECT_API_TIMEOUT = 3.5;

// Heartbeat interval, in seconds, for the realtime Protect API on UniFI OS devices.
// UniFi OS expects to hear from us every 15 seconds.
export const PROTECT_EVENTS_HEARTBEAT_INTERVAL = 10;

// How often, in seconds, should we refresh our Protect login credentials.
export const PROTECT_LOGIN_REFRESH_INTERVAL = 1800;
