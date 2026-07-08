# Changelog

All notable changes to this project will be documented in this file.

## 5.0.0 (2026-07-08)

v5 is a ground-up rewrite around a single model: the controller's state is a reducer over a typed realtime packet stream, with a periodic re-bootstrap as a permanent failsafe. The entry point, error handling, resource lifetimes, and event model are all new.

  * Breaking change: the entry point is now `ProtectClient.connect()` - a single atomic operation that logs in, bootstraps, and opens the realtime channel, returning a fully-ready client or throwing. The `new ProtectApi()` + `login()` + `getBootstrap()` sequence and its half-constructed-object state are gone.
  * Breaking change: failures throw a typed `ProtectError` hierarchy split into `RecoverableError` (throttle, timeout, network, abort, stall) and `FatalError` (auth, authorization, request, protocol, bootstrap, capability, codec change, livestream availability). The v4 `Nullable<T>`-on-failure return pattern is removed - methods resolve with their value or throw.
  * Breaking change: devices are live projections, not cached entities. `client.cameras` / `client.camera(id)` return handles whose getters read through to the current state; per-device operations (`snapshot`, `update`, `reboot`, `livestream`) are methods on the projection.
  * Breaking change: state is observable - `client.state.observe(selector)` yields a selector's output only when it changes, and `client.events()` is an async-iterable firehose of typed events. The v4 `on("message", ...)` raw-packet listener is replaced by the typed event model.
  * Breaking change: every long-lived resource is an `AsyncDisposable`; `await using client = await ProtectClient.connect(...)` cleans up the events stream, livestream sessions, refresh timer, and connection pool at scope exit. There are no `.stop()` methods to forget.
  * Breaking change: the event surface is a three-rail facade - `on` returns a `Disposable`, `once` returns a `Promise`, `stream` returns an `AsyncIterable`. The library no longer extends `EventEmitter`, so its inherited methods no longer leak onto the public surface.
  * Breaking change: `camera.enableRtsp()` is removed - enable RTSP with a configuration write, `camera.update({ channels })`.
  * Breaking change: the minimum supported Node version is now Node 22.18 or later.
  * New feature: multi-subscriber livestream pooling - `camera.livestream()` subscriptions with identical parameters share one underlying WebSocket, late joiners are replayed the cached init segment, and each subscriber has its own unbounded queue so a slow consumer never blocks a fast one. The pool is resilient by default: it reconnects across a controller fault or reboot, a media-stall watchdog surfaces a stream that has gone silent, the first segment after a reconnect is flagged so a pipe consumer can resynchronize, and a codec change across a reconnect ends the stream cleanly rather than feeding a downstream decoder mismatched media.
  * New feature: first-class two-way audio - `camera.talkback()` opens a send-direction session to a camera's speaker and drains a caller-supplied audio stream with built-in backpressure.
  * New feature: relay and fob device support. Both are first-class devices - `client.relays` / `client.fobs` return live projections that reduce into state and are observable like every other device; a relay exposes per-output state and `relay.toggleOutput(outputId)`, and a fob button press surfaces as a typed event on the firehose.
  * New feature: capability-gated device operations as methods on the projections - `camera.unlock()` (a paired Access door), `camera.turnOnFlashlight()`, the package-camera variant of `camera.snapshot()`, and `chime.playSpeaker()` / `chime.playBuzzer()` - each guarded so a device lacking the capability throws `ProtectUnsupportedError` instead of issuing a doomed request.
  * New feature: doorbell fingerprint and NFC authentication scans are classified as a typed `authDetected` event on the firehose.
  * New feature: a connection-health monitor (`client.connection`) with an observable state machine, controller reboot detection, throttle status, and automatic events-channel recovery after an outage.
  * New feature: a `node:diagnostics_channel` observability surface - 23 named channels across HTTP, auth relogin, realtime events, connection state, livestream lifecycle, talkback, and schema drift. Part of the public contract.
  * Improvement: the `ufp` CLI is rebuilt as a first-class reference consumer with rich filters, device-class command groups (`ufp camera unlock`, `ufp relay toggle`), and a `doctor` health probe.
  * Housekeeping.

## 4.29.0 (2026-04-09)
  * Breaking change: `DeepIndexable` has been removed. Device interfaces now include index signatures directly for accessing untyped API fields. `ProtectNvrBootstrapData` is now simply `Nullable<ProtectNvrBootstrap>`.
  * Breaking change: the named payload type aliases (e.g. `ProtectCameraConfigPayload`) have been removed. Use `DeepPartial<ProtectCameraConfig>` directly instead.
  * Breaking change: `getInitSegment()` now rejects with an `AbortError` when the livestream session is stopped, rather than leaving the promise unsettled. Callers using timeouts will see no difference, but those relying on the promise never settling should update their error handling.
  * Improvement: comprehensive type system overhaul with shared base interfaces, index signatures for untyped API field passthrough, and literal `modelKey` discriminants across all device types.
  * Improvement: hundreds of new device properties added for cameras, sensors, lights, chimes, and viewers to reflect the current Protect API surface.
  * Improvement: livestream session lifecycle now uses an `AbortController` for clean teardown of all WebSocket listeners and pending promises through a single mechanism.
  * Improvement: CLI `--device` filter now searches entire event packets for the device ID, picking up events regardless of which field references the device.
  * Improvement: CLI flags that accept a value now support both `--flag VALUE` and `--flag=VALUE` syntax.
  * Improvement: CLI input validation for `--timeout`, `--count`, numeric filters, and regex patterns.
  * Housekeeping.

## 4.28.0 (2026-03-17)
  * Breaking change: `decodePacket` is now an async standalone export rather than a static method on the `ProtectApiEvents` class. Consumers should update imports accordingly.
  * New feature: ufp CLI event filtering, output formatting, device management, and command registry.
  * Improvement: connection efficiency and non-blocking event processing.
  * Improvement: dedicated livestream heartbeat timeout.
  * Housekeeping.

## 4.27.7 (2026-01-24)
  * Housekeeping.

## 4.27.6 (2026-01-02)
  * Housekeeping.

## 4.27.5 (2025-11-24)
  * Housekeeping.

## 4.27.4 (2025-09-27)
  * Housekeeping.

## 4.27.3 (2025-09-15)
  * Improvement: additional typing refinements.
  * Housekeeping.

## 4.27.2 (2025-09-04)
  * Improvement: additional typing refinements.
  * Housekeeping.

## 4.27.1 (2025-09-04)
  * Improvement: additional typing refinements.
  * Improvement: support for SuperLink sensors.
  * Housekeeping.

## 4.27.0 (2025-09-01)
  * Improvement: the livestream API semantics have been expanded to provide additional options that can be tailored.
  * Housekeeping.

## 4.26.0 (2025-08-08)
  * Housekeeping.

## 4.25.0 (2025-07-14)
  * Improvement: refinements to the livestream API.
  * Housekeeping.

## 4.24.0 (2025-07-13)
  * Breaking change: `unifi-protect` now uses the modern Undici library for network requests to the Protect controller to improve connection resilience. If you rely on custom `retrieve` options, you may need to revise your code. Documentation has been updated to reflect the changes.
  * Improvement: added a utility helper, `requestOk` to validate that responses from `retrieve` are valid, given we no longer use the `fetch` API and `response.ok` is no longer available to us.
  * Improvement: livestream refinements.
  * Housekeeping.

## 4.23.0 (2025-06-22)
  * New feature: UniFi Protect v6 support.
  * Improvement: updates to various Protect JSON descriptions.
  * Housekeeping.

## 4.22.0 (2025-06-14)
  * Breaking change: the semantics for starting a livestream API session have changed to be more future-proof.
  * New feature: the livestream API semantics now support creating a Node Readable stream to process the live video. The benefit for users is this frees up the semantics of handling backpressure and edge cases in many instances for more straightforward and simple use cases.
  * Improvement: optimizations to the livestream API pipeline.
  * Housekeeping.

## 4.21.0 (2025-04-11)
  * Breaking change: the `retrieve` method has updated semantics to make it more future-proof as options and capabilities evolve.
  * Improvement: minor updates to the Protect JSON descriptions.
  * Fix: address edge cases in the livestream API.
  * Housekeeping.

## 4.20.3 (2025-01-05)
  * Improvement: refinements to Protect controller connectivity and recovery.
  * Housekeeping.

## 4.20.2 (2025-01-05)
  * Housekeeping.

## 4.20.1 (2025-01-03)
  * Fix: address a regression related to type exports.
  * Housekeeping.

## 4.20.0 (2025-01-03)
  * Improvement: further refinements to Protect controller connectivity and recovery.
  * Housekeeping.

## 4.19.0 (2024-12-27)
  * Improvement: refinements to Protect controller connectivity and recovery.
  * Improvement: minor updates to the Protect JSON descriptions.
  * Housekeeping.

## 4.18.0 (2024-12-22)
  * Breaking change: the minimum supported node version is now node 20.
  * Improvement: we've adjusted strategies to deal with Protect controller quirkiness/bugginess that results in network disconnects from the controller, while ensuring we have reasonable backpressure measures.
  * Housekeeping.

## 4.17.0 (2024-12-08)
  * Improvement: minor updates to the Protect JSON descriptions.
  * Housekeeping.

## 4.16.0 (2024-10-05)
  * New feature: ufp - a command line utility to query and execute some utility commands using the Protect API. You'll need to create either ~/.ufp.json or ufp.json in your current directory with the properties `controller`, `username`, `password` all defined in a valid JSON.
  * Housekeeping.

## 4.15.1 (2024-09-29)
  * Improvement: minor updates to the Protect JSON descriptions.
  * Housekeeping.

## 4.15.0 (2024-09-26)
  * New feature: added the `isThrottled` as a publicly accessible readonly property that returns whether the API connection is currently throttled due to connectivity issues.
  * Housekeeping.

## 4.14.0 (2024-09-22)
  * Improvement: minor updates to the Protect JSON descriptions.
  * Housekeeping.

## 4.13.0 (2024-09-15)
  * Improvement: minor updates to the Protect JSON descriptions.
  * Housekeeping.

## 4.12.0 (2024-09-14)
  * Change: API has been updated to reflect the recent changes to the Protect API by Ubiquiti to snapshots. Specifically, you can no longer specify a timestamp.
  * Minor updates to the Protect JSON descriptions.
  * Housekeeping.

## 4.11.1 (2024-06-06)
  * Housekeeping.

## 4.11.0 (2024-06-03)
  * Performance improvements and housekeeping.

## 4.10.0 (2024-06-01)
  * Improvement: device JSON updates for Protect 4.0.
  * Improvement: added the codec event to the livestream API so you can retrieve the codec information associated with a particular livestream.
  * Documentation updates.
  * Housekeeping.

## 4.9.0 (2024-04-20)
  * Improvement: minor updates to the Protect JSON descriptions.
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
