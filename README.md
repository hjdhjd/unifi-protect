<SPAN ALIGN="CENTER" STYLE="text-align:center">
<DIV ALIGN="CENTER" STYLE="text-align:center">

[![unifi-protect: UniFi Protect API](https://raw.githubusercontent.com/hjdhjd/unifi-protect/main/unifi-protect-logo-small.svg)](https://github.com/hjdhjd/unifi-protect)

# UniFi Protect API

[![Downloads](https://img.shields.io/npm/dt/unifi-protect?color=%230559C9&logo=icloud&logoColor=%23FFFFFF&style=for-the-badge)](https://www.npmjs.com/package/unifi-protect)
[![Version](https://img.shields.io/npm/v/unifi-protect?color=%230559C9&label=UniFi%20Protect%20API&logo=ubiquiti&logoColor=%23FFFFFF&style=for-the-badge)](https://www.npmjs.com/package/unifi-protect)

## A complete, modern TypeScript implementation of the UniFi Protect API.
</DIV>
</SPAN>

`unifi-protect` is a TypeScript library that connects to and communicates with the Ubiquiti UniFi Protect API and ecosystem. [UniFi Protect](https://ui.com/camera-security) is [Ubiquiti's](https://www.ui.com) video security platform, with rich camera, doorbell, and NVR controller hardware options for you to choose from, as well as an app you can use to view, configure, and manage your cameras and doorbells.

It is ESM-only, Node 22.18+, and built around a single insight: the controller's state is a reducer over a typed realtime packet stream, with a periodic re-bootstrap as a permanent failsafe. You connect once, then read live device projections, observe state as it changes, subscribe to a typed event firehose, and stream cameras through a shared livestream pool - all with typed errors and `await using` resource cleanup.

## Installation

To use this library in Node, install it from the command line:

```sh
npm install unifi-protect
```

## Getting started

`ProtectClient.connect()` is the one entry point. It logs in, fetches the initial bootstrap, opens the realtime events channel, and returns a fully-ready client - or throws a typed error. There is no half-constructed client to clean up on failure, and every long-lived object is an `AsyncDisposable`, so `await using` tears everything down at scope exit.

```ts
import { ProtectClient } from "unifi-protect";

await using client = await ProtectClient.connect({ host: "192.168.1.1", password: "password", username: "protect-user" });

console.log("Connected to", client.controllerName, "with", client.cameras.length, "cameras.");

// Devices are live projections over the current state - hold one for hours; its getters always reflect the latest state.
for(const camera of client.cameras) {

  console.log(camera.name, camera.isOnline ? "online" : "offline");
}
```

When the scope exits - including on a thrown error - `await using` closes the events stream, every livestream session, the refresh failsafe, and the connection pool. There is no `.stop()` to forget.

## The realtime firehose

`client.events()` is an async iterable of every typed event the controller emits, ending cleanly when its signal aborts:

```ts
for await (const event of client.events({ signal })) {

  switch(event.kind) {

    case "motionDetected": onMotion(event.cameraId); break;
    case "smartDetect":    onSmartDetect(event.cameraId, event.objectTypes); break;
    case "doorbellRing":   onRing(event.cameraId); break;
  }
}
```

To track a slice of state instead of the raw firehose, observe a selector: `client.state.observe(selector)` yields the selector's output only when it changes.

## Typed errors: recoverable vs fatal

Every failure is a typed `ProtectError`, classified by the only universal question - can the caller retry? Catch the abstract base for policy, the concrete class for specifics.

```ts
import { ProtectAuthorizationError, RecoverableError } from "unifi-protect";

try {

  const jpeg = await client.camera(id)?.snapshot({ signal, width: 1920 });
} catch(error) {

  if(error instanceof ProtectAuthorizationError) {

    return;                  // 403 - the account lacks the rights; not retryable.
  }

  if(error instanceof RecoverableError) {

    return deferAndRetry();  // throttle, timeout, network, abort, stall - defer and retry.
  }

  throw error;
}
```

`RecoverableError` (throttle, timeout, network, abort, stall, lag) means "you may retry or defer"; `FatalError` (auth, authorization, request, protocol, bootstrap) means "propagate." Connection health - throttling, controller reboots, automatic recovery after an outage - is observable on `client.connection`.

## Livestreaming

`camera.livestream()` returns a `LivestreamSubscription` - an async iterable of fMP4 segments. The library pools sessions: two subscriptions with identical parameters share one underlying WebSocket, and a late joiner is replayed the cached init segment. This is true access to the camera's encoded video datastream (H.264, HEVC, or AV1), not the RTSP URLs.

```ts
await using live = client.camera(id)?.livestream({ channel: 0, signal });

for await (const segment of live) {

  ffmpeg.stdin.write(segment.data);
}
```

## Guides

- **[Recipes](https://github.com/hjdhjd/unifi-protect/blob/main/docs/guides/recipes.md)** - the common composition patterns: streaming, observing state changes, RTSP enablement, qualified names, privilege gating, typed errors, and connection health.
- **[Diagnostics](https://github.com/hjdhjd/unifi-protect/blob/main/docs/guides/diagnostics.md)** - the `node:diagnostics_channel` observability surface: every named channel, its payload shape, and how to subscribe.
- **[Migrating from v4](https://github.com/hjdhjd/unifi-protect/blob/main/docs/guides/migrating-from-v4.md)** - a complete v4-to-v5 API mapping: what moved, what changed shape, and what was removed (and what to do instead).

The [`ufp` CLI](https://github.com/hjdhjd/unifi-protect/tree/main/src/util/cli) is the canonical reference consumer - it exercises every API surface against real hardware using the exact idioms in the guides (`await using`, `AbortSignal` for Ctrl-C, typed errors, async iteration). Read it alongside the guides; `ufp doctor` is also the quickest "is my install healthy?" probe.

## Why use this library for UniFi Protect support?

In short - because I use it every day to support a very popular [Homebridge](https://homebridge.io) plugin named [homebridge-unifi-protect](https://www.npmjs.com/package/homebridge-unifi-protect) that I maintain. I package the core API library separately from the plugin so that other open source projects can take advantage of the work that's been done here to understand and decode the UniFi Protect API.

This implementation is unique: it's the first complete open source implementation of the realtime UniFi Protect update API, enabling instantaneous updates to Protect-related events. It's also the first (and to my knowledge only) complete implementation of the livestream API provided by UniFi Protect - true access to the encoded video datastream (H.264, HEVC, or AV1) for any camera connected to the Protect controller, not the RTSP URLs the controller exposes.

Finally - the most significant reason that you should use this library: it's very well-tested, it is modern, and most importantly, *it just works*. It's quite easy to add support for UniFi Protect in your project, and you can rely on the fact that the code is used by a significant population of users out there who ensure its continued robustness.

### How you can contribute and make this library even better

This implementation is largely feature complete. I strive to add support for meaningful features for a broad group of people in order to avoid any unnecessary cruft and technical debt that may accrue over time.

The UniFi Protect API is undocumented, and implementing a library like this one is the result of many hours of trial and error as well as community support.

## Changelog

* [Changelog](https://github.com/hjdhjd/unifi-protect/blob/main/docs/Changelog.md): changes and release history of this library.

## The UniFi Protect realtime events API

So...how does UniFi Protect provide realtime events? On UniFi OS-based controllers, it uses a websocket called `updates`. This connection provides a realtime stream of health, status, and events that the cameras encounter - including motion events and doorbell ring events.

The library handles this for you: `ProtectClient.connect()` opens the websocket, and `client.events()` hands you a typed, decoded event stream. The notes below document the binary protocol the library decodes, for the curious and for anyone exploring the API themselves. The decoder lives in [`src/protocol/packet.ts`](https://github.com/hjdhjd/unifi-protect/blob/main/src/protocol/packet.ts), the event classifier in [`src/protocol/events.ts`](https://github.com/hjdhjd/unifi-protect/blob/main/src/protocol/events.ts), and the wire/configuration types in [`src/types.ts`](https://github.com/hjdhjd/unifi-protect/blob/main/src/types.ts).

The `updates` websocket uses a binary protocol to encode data, largely to minimize bandwidth and to allow more than JSON data if needed. Cameras continuously stream updates to the controller containing camera health, statistics, and - crucially - events such as motion and doorbell rings. A complete update packet is composed of four frames:

```sh
 Header Frame (8 bytes)
 ----------------------
 Action Frame
 ----------------------
 Header Frame (8 bytes)
 ----------------------
 Data Frame
```

##### Header Frame

The header frame is overhead that tells us what's coming in the frame that follows. It is 8 bytes:

| Byte Offset    |  Description    | Bits    | Values
|----------------|-----------------|---------|-----------------------------------------
| 0              | Packet Type     | 8       | 1 - action frame, 2 - payload frame.
| 1              | Payload Format  | 8       | 1 - JSON object, 2 - UTF8-encoded string, 3 - Node Buffer.
| 2              | Deflated        | 8       | 0 - uncompressed, 1 - deflated / compressed ([zlib](https://nodejs.org/api/zlib.html)-based).
| 3              | Unknown         | 8       | Always 0. Possibly reserved for future use by Ubiquiti?
| 4-7            | Payload Size    | 32      | Size of payload in network-byte order (big endian).

If the header marks the payload as deflated, inflate it before use.

##### Action Frame

The action frame identifies the action and category the update contains:

| Property    |  Description
|-------------|------------------------------------------------------------------------------------
| action      |  What action is being taken. Known actions are `add` and `update`.
| id          |  The identifier for the device we're updating.
| modelKey    |  The device model category that we're updating.
| newUpdateId |  A new UUID generated per update. This can be safely ignored, it seems.

##### Data Frame

The final part of the update packet is the data frame. It can be three types - although in practice JSONs are all that come across:

| Payload Type |  Description
|--------------|------------------------------------------------------------------------------------
| 1            | JSON. For an `update` action whose `modelKey` is not `event` (e.g. `camera`), this is **always** a subset of the configuration bootstrap JSON.
| 2            | A UTF8-encoded string.
| 3            | Node Buffer.

##### Notes

 * `update` actions are tied to any modelKey that exists in the bootstrap JSON. The exception is `event`, which is tied to the Protect events history list. The library recognizes these modelKeys on the wire: `camera`, `chime`, `light`, `sensor`, `viewer`, `nvr`, `user`, `liveview`, `group`, `bridge`, `event`, `activeSessionStat`, `aiport`, `aiprocessor`, `linkstation`, `relay`, and `smartDetectObject`. It reduces a subset of these into its canonical state (the devices, the NVR, and the `user` roster); the rest are recognized but not modeled, so a genuinely novel modelKey surfaces on the `unifi-protect:schema:unknownModelKey` diagnostics channel rather than being silently absorbed.
 * `add` actions are tied to the `event` modelKey and mark the beginning of an item in the Protect events list. A subsequent `update` action signals the end of the event capture and its confidence score.
 * This is **not** the same as motion detection. To detect motion, the library watches `update` actions for `camera` modelKeys (a JSON updating `lastMotion`); for doorbell rings, `lastRing`. The events list is useful for the Protect app but slower than watching the `lastMotion` JSON, which tends to be more timely.
 * With the exception of `update` actions with a `modelKey` of `event`, JSONs are always a subset of the bootstrap JSON, indexed off of `modelKey`.

I welcome any additions or corrections to the protocol for the benefit of the community. I hope this helps others launch their own exploration and create new and interesting Protect-enabled capabilities.

#### Non-Ubiquiti Apps Using the Protect API

This list represents all known apps using the realtime events API for UniFi Protect. If you're using the information you discovered here for your own UniFi Protect-based solution, please open an issue and I'm happy to add a link below.

 * [homebridge-unifi-protect](https://github.com/hjdhjd/homebridge-unifi-protect): Seamless integration of UniFi Protect into HomeKit with support for cameras, doorbells, and more.

## Library Development Dashboard

This is mostly of interest to the true developer nerds amongst us.

[![License](https://img.shields.io/npm/l/unifi-protect?color=%230559C9&logo=open%20source%20initiative&logoColor=%23FFFFFF&style=for-the-badge)](https://github.com/hjdhjd/unifi-protect/blob/main/LICENSE.md)
[![Build Status](https://img.shields.io/github/actions/workflow/status/hjdhjd/unifi-protect/ci.yml?branch=main&color=%230559C9&logo=github-actions&logoColor=%23FFFFFF&style=for-the-badge)](https://github.com/hjdhjd/unifi-protect/actions?query=workflow%3A%22Continuous+Integration%22)
[![Dependencies](https://img.shields.io/librariesio/release/npm/unifi-protect?color=%230559C9&logo=dependabot&style=for-the-badge)](https://libraries.io/npm/uniti-protect)
[![GitHub commits since latest release (by SemVer)](https://img.shields.io/github/commits-since/hjdhjd/unifi-protect/latest?color=%230559C9&logo=github&sort=semver&style=for-the-badge)](https://github.com/hjdhjd/unifi-protect/commits/main)
