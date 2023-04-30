# Changelog

All notable changes to this project will be documented in this file. This project uses [semantic versioning](https://semver.org/).

## 4.2.2 (2023-04-30)
  * Housekeeping.

## 4.2.1 (2023-04-13)
  * Housekeeping.

## 4.2.0 (2023-04-10)
  * Only communicate to the Protect controller using HTTP 2 to further improve performance.

## 4.1.3 (2023-04-08)
  * Improve resiliency of the events API when controller connectivity issues occur.

## 4.1.2 (2023-04-06)
  * Address potential login race condition.

## 4.1.1 (2023-04-05)
  * Housekeeping.

## 4.1.0 (2023-04-02)
  * New feature: chime API endpoints.
  * Housekeeping.

## 4.0.0 (2023-03-26)
  * Rewrite and refactor of the API library for performance, efficiency, and future-proofing.
  * Shifted to ESM-only. If you need common Javascript (CJS) version, stick to 3.x.

## 3.0.4 (2022-02-20)
  * Housekeeping.

## 3.0.3 (2022-02-19)
  * Adjustments to the livestream API, and improved error handling.
  * Improve error handling in the events API.
  * Housekeeping.

## 3.0.2 (2022-02-12)
  * Housekeeping update.

## 3.0.1 (2022-02-12)
  * Housekeeping update.

## 3.0.0 (2022-02-12)
  * New feature: websockets API endpoint support.
  * New feature: websockets livestreaming API support.
  * Breaking change: make `protectLogging` camel case to `ProtectLogging` for consistency.
  * Breaking change: rename `eventsListener` to `eventsWs` for consistency.
  * Improvements: don't arbitrarily close the connection to the realtime updates API - only reconnect if we lose the connection somehow.
  * Improvements: further encapsulate the library to avoid spurious access of properties that shouldn't be modified by consumers of the library.

## 2.1.1 (2022-01-10)
  * Housekeeping.

## 2.1.0 (2022-01-09)
  * Full support for all known UniFi Protect device types (cameras, lights, sensors, viewers)
  * Code cleanup.

## 2.0.0 (2022-01-02)
  * Initial release: separated from [homebridge-unifi-protect](https://github.com/hjdhjd/homebridge-unifi-protect) for wider availability in other projects.
