# Changelog

All notable changes to this project will be documented in this file. This project uses [semantic versioning](https://semver.org/).

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
  * New feature: Websockets API endpoint support.
  * New feature: Websockets livestreaming API support.
  * Breaking change: Make `protectLogging` camel case to `ProtectLogging` for consistency.
  * Breaking change: Rename `eventsListener` to `eventsWs` for consistency.
  * Improvements: Don't arbitrarily close the connection to the realtime updates API - only reconnect if we lose the connection somehow.
  * Improvements: Further encapsulate the library to avoid spurious access of properties that shouldn't be modified by consumers of the library.

## 2.1.1 (2022-01-10)
  * Housekeeping.

## 2.1.0 (2022-01-09)
  * Full support for all known UniFi Protect device types (cameras, lights, sensors, viewers)
  * Code cleanup.

## 2.0.0 (2022-01-02)
  * Initial release: separated from [homebridge-unifi-protect](https://github.com/hjdhjd/homebridge-unifi-protect) for wider availability in other projects.
