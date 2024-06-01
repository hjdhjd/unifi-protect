# Changelog

All notable changes to this project will be documented in this file. This project uses [semantic versioning](https://semver.org/).

## 4.10.0 (2024-05-XX)
  * Device JSON updates for Protect 4.0.
  * Improvement: added the codec event to the livestream API so you can retrieve the codec information associated with a particular livestream.
  * Documentation updates.
  * Housekeeping.

## 4.9.0 (2024-04-20)
  * Minor updates to the Protect JSON descriptions.
  * Housekeeping.

## 4.8.2 (2024-03-17)
  * Housekeeping.

## 4.8.1 (2024-03-17)
  * Housekeeping.

## 4.8.0 (2023-11-05)
  * New feature: added the `logout()` and `reset()` functions. These replace the `clearLoginCredentials()` function and provide more granular control for when you truly want to logout of the API versus just close all open connections and start over.

## 4.7.0 (2023-10-02)
  * Housekeeping and add additional event telemetry for new Protect event types.

## 4.6.1 (2023-08-19)
## 4.6.0 (2023-08-19)
  * Housekeeping and minor enhancements to error handling.

## 4.5.0 (2023-07-16)
  * Snapshot convenience function added.
  * Documentation updates.
  * Housekeeping.

## 4.4.0 (2023-06-19)
  * New feature: support for livestreams from secondary cameras on Protect devices.

## 4.3.0 (2023-06-04)
  * New feature: added the `isAdminUser` as a publicly accessible readonly property that returns whether the currently logged in user is an administrator or not.

## 4.2.4 (2023-06-03)
  * Housekeeping.

## 4.2.3 (2023-05-11)
  * Housekeeping.

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
