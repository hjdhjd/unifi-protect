/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * settings.ts: Settings and constants for UniFi Protect.
 */

// Number of API errors to accept before we backoff so we don't slam a Protect controller.
export const PROTECT_API_ERROR_LIMIT = 10;

// Interval, in seconds, to wait before trying to access the API again once we've hit the PROTECT_API_ERROR_LIMIT threshold.
export const PROTECT_API_RETRY_INTERVAL = 300;

// Protect API response timeout, in milliseconds. This should never be greater than 5000 ms.
export const PROTECT_API_TIMEOUT = 3500;

// Livestream heartbeat timeout, in milliseconds. If no data is received within this interval, the livestream is considered unresponsive and the connection is closed.
export const PROTECT_LIVESTREAM_HEARTBEAT_TIMEOUT = 10000;
