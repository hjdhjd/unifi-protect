<SPAN ALIGN="CENTER" STYLE="text-align:center">
<DIV ALIGN="CENTER" STYLE="text-align:center">

[![unifi-protect: UniFi Protect API](https://raw.githubusercontent.com/hjdhjd/unifi-protect/main/unifi-protect-logo-small.svg)](https://github.com/hjdhjd/unifi-protect)

# UniFi Protect API

[![Downloads](https://img.shields.io/npm/dt/unifi-protect?color=%230559C9&logo=icloud&logoColor=%23FFFFFF&style=for-the-badge)](https://www.npmjs.com/package/unifi-protect)
[![Version](https://img.shields.io/npm/v/unifi-protect?color=%230559C9&label=UniFi%20Protect%20API&logo=ubiquiti&logoColor=%23FFFFFF&style=for-the-badge)](https://www.npmjs.com/package/unifi-protect)

## A complete UniFi Protect API implementation.
</DIV>
</SPAN>

`unifi-protect` is a library that enabled you to connect to and communicate with the Ubiquiti UniFi Protect API and ecosystem. [UniFi Protect](https://ui.com/camera-security) is [Ubiquiti's](https://www.ui.com) next-generation video security platform, with rich camera, doorbell, and NVR controller hardware options for you to choose from, as well as an app which you can use to view, configure and manage your video camera and doorbells.

## Why use this library for UniFi Protect support?
In short - because I use it every day to support a very popular [Homebridge](https://homebridge.io) plugin named [homebridge-unifi-protect](https://www.npmjs.com/package/homebridge-unifi-protect) that I maintain. I have been occasionally asked if I would consider packaging the core API library separately from the plugin so that other open source projects can take advantage of the work that's been done here to understand and decode the UniFi Protect API.

In addition, this implementation is unique: it's the first complete open source implementation of the realtime UniFi Protect update API, enabling instantaneous updates to Protect-related events. It's also the first (and to my knowledge only) complete implementation of the livestream API provided by UniFi Protect. Note: this is **not** the RTSP URLs that are provided by UniFi Protect controllers, but rather, true access to the H.264 datastream for any camera connected to the Protect controller.

Finally - the most significant reason that you should use this library: it's very well-tested, it is modern, and most importantly, *it just works*. It's quite easy to add support for UniFi Protect in your project using this library, and you can rely on the fact that the code is used by a significant population of users out there who ensure its continued robustness.

### <A NAME="protect-contribute"></A>How you can contribute and make this library even better
This implementation is largely feature complete. I strive to add support for meaningful features to a broad groups of people in order to avoid any unnecessary cruft and technical debt that may accrue over time.

The UniFi Protect API is undocumented and implementing a library like this one is the result of many hours of trial and error as well as community support.

### Features
- Full access to the UniFi Protect NVR JSON.
- The ability to retrieve the JSON details, including status, of any supported UniFi Protect device.
- The ability to modify the Protect NVR JSON or Protect devices.
- The ability to programmatically access the H.264 livestream for any camera. This is useful when you want lightweight access to the full camera feed without resorting to RTSP. For example, this is how [homebridge-unifi-protect](https://github.com/hjdhjd/homebridge-unifi-protect) implements HomeKit Secure Video capabilities, resulting in a lighter weight solution than trying to read the RTSP streams for each camera from the Protect controller.

## Changelog
* [Changelog](https://github.com/hjdhjd/unifi-protect/blob/main/docs/Changelog.md): changes and release history of this library.

## Installation
To use this library in Node, install it from the command line:

```sh
npm install unifi-protect
```

## Documentation

Documentation and examples for using this library to access UniFi Protect controllers is [available here](https://github.com/hjdhjd/unifi-protect/blob/main/docs/ProtectApi.md). Additionally, if you'd like to see all this in action in a well-documented, real-world example, please take a good look at my [homebridge-unifi-protect](https://github.com/hjdhjd/homebridge-unifi-protect) project. It relies heavily on this library for the core functionality it provides.

## UniFi Protect Realtime Events API
So...how does UniFi Protect provide realtime events? On UniFi OS-based controllers, it uses a websocket called `updates`. This connection provides a realtime stream of health, status, and events that the cameras encounter - including motion events and doorbell ring events.

Reverse engineering the realtime events API is a bit more difficult than the system events API because it's based on a binary protocol. The Protect system events API is a steady stream of JSONs published on all UniFi OS controllers over the `system` websocket. It's used by more than just UniFi Protect, which makes it interesting for future exploration.

The Protect realtime events API, however, is a binary protocol published over the `updates` websocket, and until now has been undocumented. I spent time analyzing what's happening in the Protect browser webUI as well as observing the controller and various Protect versions themselves to reverse engineer what's going on. Pouring through obfuscated code is like solving a puzzle with all the pieces in front of you - you know it's all there, you're just not always sure how it fits together.

For the impatient, you can take a look at the code for how to decode and read the binary protocol here in [protect-updates-api.ts](https://github.com/hjdhjd/unifi-protect/blob/master/src/protect-api-events.ts) and the interface information located in [protect-types.ts](https://github.com/hjdhjd/unifi-protect/blob/master/src/protect-types.ts) as well.

I welcome any additions or corrections to the protocol for the benefit of the community. I hope this helps others launch their own exploration and create new and interesting Protect-enabled capabilities.

#### Non-Ubiquiti Apps Using the Protect API
This list represents all known apps that are using the realtime events API for UniFi Protect. If you're using the information you discovered on this page for your own UniFi Protect-based solution, please open an issue and I'm happy to add a link to it below. I hope this can serve as a repository of sorts for UniFi Protect-based apps and solutions in the community.

 * [homebridge-unifi-protect](https://github.com/hjdhjd/homebridge-unifi-protect): Seamless integration of UniFi Protect into HomeKit with support for cameras, doorbells, and more.

#### Connecting
 * Login to the UniFi Protect controller and obtain the bootstrap JSON. The URL is: `https://protect-nvr-ip/proxy/protect/api/bootstrap`. You can look through [protect-api.ts](https://github.com/hjdhjd/unifi-protect/blob/master/src/protect-api.ts) for a better understanding of the Protect login process and how to obtain the bootstrap JSON.
 * Open the websocket to the updates URL. The URL is: `wss://protect-nvr-ip/proxy/protect/ws/updates?lastUpdateId?lastUpdateId=X`. You can grab lastUpdateId from the bootstrap JSON in the prior step. You can [see an example in protect-api.ts](https://github.com/hjdhjd/unifi-protect/blob/src/protect-api.ts#L225).
 * Then you're ready to listen to messages. You can see an [example of this in protect-nvr.ts](https://github.com/hjdhjd/unifi-protect/blob/src/protect-nvr.ts#L408).

Those are the basics and gets us up and running. Now, to explain how the updates API works...

#### Updates Websocket Binary Format
UniFi OS update data packets are used to provide a realtime stream of updates to Protect. It differs from the system events API in that the system events API appears to be shared across other applications (Network, Access, etc.) while the updates events API appears to only be utilized by Protect and not shared by other applications, although the protocol is shared.

The `updates` websocket is used by the UniFi Protect webUI and native applications to provide realtime events back to the controller. UniFi cameras and doorbells also use a websocket to provide those same updates to the Protect controller. The `updates` websocket uses a binary protocol to encode data largely to minimize bandwidth requirements, and provide access to more than JSON data, if needed.

So how does it all work? Cameras continuously stream updates to the UniFi Protect controller containing things like camera health, statistics, and - crucially for us - events such as motion and doorbell ring. A complete update packet is composed of four frames:

```sh
 Header Frame (8 bytes)
 ----------------------
 Action Frame
 ----------------------
 Header Frame (8 bytes)
 ----------------------
 Data Frame
```

Let's look at each of these.

##### Header Frame
The header frame is required overhead since websockets provide only a transport medium. It's purpose is to tell us what's coming in the frame that follows.

A packet header is composed of 8 bytes in this order:

| Byte Offset    |  Description    | Bits    | Values
|----------------|-----------------|---------|-----------------------------------------
| 0              | Packet Type     | 8       | 1 - action frame, 2 - payload frame.
| 1              | Payload Format  | 8       | 1 - JSON object, 2 - UTF8-encoded string, 3 - Node Buffer.
| 2              | Deflated        | 8       | 0 - uncompressed, 1 - deflated / compressed ([zlib](https://nodejs.org/api/zlib.html)-based).
| 3              | Unknown         | 8       | Always 0. Possibly reserved for future use by Ubiquiti?
| 4-7            | Payload Size    | 32      | Size of payload in network-byte order (big endian).

If the header has marked the payload as deflated (compressed), you'll need to inflate (uncompress) the payload before you can use it.

##### Action Frame
The action frame identifies what the action and category that the update contains:

| Property    |  Description
|-------------|------------------------------------------------------------------------------------
| action      |  What action is being taken. Known actions are `add` and `update`.
| id          |  The identifier for the device we're updating.
| modelKey    |  The device model category that we're updating.
| newUpdateId |  A new UUID generated on a per-update basis. This can be safely ignored it seems.

##### Data Frame
The final part of the update packet is the data frame. The data frame can be three different types of data - although in practice, JSONs are all that come across, I've found. Those types are:

| Payload Type |  Description
|--------------|------------------------------------------------------------------------------------
| 1            | JSON. If the action frame's `action` property is set to `update` and the `modelKey` property is not set to `event` (e.g. `camera`), this will **always** a subset of the [configuration bootstrap JSON](https://github.com/hjdhjd/unifi-protect/blob/src/protect-types.ts#L6).
| 2            | A UTF8-encoded string.
| 3            | Node Buffer.

#### Tips
 * `update` actions are always tied to any valid modelKey that exists in the bootstrap JSON. The exception is `events` which is tied to the Protect events history list that it maintains. The supported modelKeys from the bootstrap JSON are: `bridge`, `camera`, `group`, `light`, `liveview`, `nvr`, `sensor`, `user`, and `viewer`.
 * `add` actions are always tied to the `event` modelKey and indicate the beginning of an event item in the Protect events list. A subsequent `update` action is sent signaling the end of the event capture, and it's confidence score for motion detection.
 * This is **not** the same thing as motion detection. If you want to detect motion, you should watch the `update` action for `camera` modelKeys, and look for a JSON that updates `lastMotion`. For doorbell rings, `lastRing`. The Protect events list is useful for the Protect app, but it's of limited utility to HomeKit, and it's slow relative to just looking for the `lastMotion` JSON that tends to be much more timely in its delivery. If you want true realtime events, you want to look at the `update` action.
 * JSONs are only payload type that seems to be sent, although the protocol is designed to accept all three.
 * With the exception of `update` actions with a `modelKey` of `event`, JSONs are always a subset of the bootstrap JSON, indexed off of `modelKey`. So for a `modelKey` of `camera`, the data payload is always a subset of ProtectCameraConfigInterface (see [protect-types.ts](https://github.com/hjdhjd/unifi-protect/blob/src/protect-types.ts#L108)).

## Library Development Dashboard
This is mostly of interest to the true developer nerds amongst us.

[![License](https://img.shields.io/npm/l/unifi-protect?color=%230559C9&logo=open%20source%20initiative&logoColor=%23FFFFFF&style=for-the-badge)](https://github.com/hjdhjd/unifi-protect/blob/main/LICENSE.md)
[![Build Status](https://img.shields.io/github/actions/workflow/status/hjdhjd/unifi-protect/ci.yml?branch=main&color=%230559C9&logo=github-actions&logoColor=%23FFFFFF&style=for-the-badge)](https://github.com/hjdhjd/unifi-protect/actions?query=workflow%3A%22Continuous+Integration%22)
[![Dependencies](https://img.shields.io/librariesio/release/npm/unifi-protect?color=%230559C9&logo=dependabot&style=for-the-badge)](https://libraries.io/npm/uniti-protect)
[![GitHub commits since latest release (by SemVer)](https://img.shields.io/github/commits-since/hjdhjd/unifi-protect/latest?color=%230559C9&logo=github&sort=semver&style=for-the-badge)](https://github.com/hjdhjd/unifi-protect/commits/main)
