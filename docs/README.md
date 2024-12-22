**unifi-protect**

***

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

## Modules

| Module | Description |
| ------ | ------ |
| [ProtectApi](ProtectApi.md) | A complete implementation of the UniFi Protect API, including access to the events, livestream data (not just RTSP), and websockets endpoints. |
| [ProtectApiEvents](ProtectApiEvents.md) | Utilities to help decode packets from the UniFi Protect realtime events API. |
| [ProtectLivestream](ProtectLivestream.md) | Access a direct MP4 livestream for a UniFi Protect camera. |
| [ProtectLogging](ProtectLogging.md) | Logging interface for this library that you can optionally specify. |
| [ProtectTypes](ProtectTypes.md) | A semi-complete description of all the object types used by the UniFi Protect API. |
