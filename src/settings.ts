/* Copyright(C) 2017-2024, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * settings.ts: Settings and constants for UniFi Protect.
 */

// Number of API errors to accept before we backoff so we don't slam a Protect controller.
export const PROTECT_API_ERROR_LIMIT = 10;

// Interval, in seconds, to wait before trying to access the API again once we've hit the PROTECT_API_ERROR_LIMIT threshold.
export const PROTECT_API_RETRY_INTERVAL = 300;

// Protect API response timeout, in milliseconds. This should never be greater than 5 seconds.
export const PROTECT_API_TIMEOUT = 3500;
