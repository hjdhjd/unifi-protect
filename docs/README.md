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

`unifi-protect` is a library that enables you to connect to and communicate with the Ubiquiti UniFi Protect API and ecosystem. [UniFi Protect](https://ui.com/camera-security) is [Ubiquiti's](https://www.ui.com) next-generation video security platform, with rich camera, doorbell, and NVR controller hardware options for you to choose from, as well as an app which you can use to view, configure and manage your video camera and doorbells.

## Getting started

`ProtectClient.connect()` is the one entry point. It logs in, fetches the initial bootstrap, opens the realtime events channel, and returns a fully-ready client - or throws a typed error. Every long-lived object is an `AsyncDisposable`, so `await using` cleans everything up at scope exit.

```ts
import { ProtectClient } from "unifi-protect";

await using client = await ProtectClient.connect({ host: "192.168.1.1", password: "password", username: "protect-user" });

// Devices are live projections over the current state.
for(const camera of client.cameras) {

  console.log(camera.name, camera.isOnline ? "online" : "offline");
}

// The realtime firehose is an async iterable of typed events.
for await (const event of client.events({ signal })) {

  if(event.kind === "motionDetected") {

    console.log("Motion on", event.cameraId);
  }
}
```

The [`ufp` CLI](https://github.com/hjdhjd/unifi-protect/tree/main/src/util/cli) is the canonical reference consumer - it exercises every API surface against real hardware. Read it to see the library in practice.

## Why use this library for UniFi Protect support?
In short - because I use it every day to support a very popular [Homebridge](https://homebridge.io) plugin named [homebridge-unifi-protect](https://www.npmjs.com/package/homebridge-unifi-protect) that I maintain. I have been occasionally asked if I would consider packaging the core API library separately from the plugin so that other open source projects can take advantage of the work that's been done here to understand and decode the UniFi Protect API.

In addition, this implementation is unique: it's the first complete open source implementation of the realtime UniFi Protect update API, enabling instantaneous updates to Protect-related events. It's also the first (and to my knowledge only) complete implementation of the livestream API provided by UniFi Protect. Note: this is **not** the RTSP URLs that are provided by UniFi Protect controllers, but rather, true access to the encoded video datastream (H.264, HEVC, or AV1) for any camera connected to the Protect controller.

Finally - the most significant reason that you should use this library: it's very well-tested, it is modern, and most importantly, *it just works*. It's quite easy to add support for UniFi Protect in your project using this library, and you can rely on the fact that the code is used by a significant population of users out there who ensure its continued robustness.

### <A NAME="protect-contribute"></A>How you can contribute and make this library even better
This implementation is largely feature complete. I strive to add support for meaningful features to a broad groups of people in order to avoid any unnecessary cruft and technical debt that may accrue over time.

The UniFi Protect API is undocumented and implementing a library like this one is the result of many hours of trial and error as well as community support.

## Utilities

| Name | Description |
| ------ | ------ |
| [Clock](interfaces/Clock.md) | Source of time for any code that needs to know "what time is it now?" or "wake me up at intervals." Production code reads time exclusively through this interface, never through `Date.now()` or `node:timers/promises` directly. Tests substitute a fake clock to drive time deterministically without real-time waits or module-level mocking. |
| [noopLog](variables/noopLog.md) | The default logger every subsystem falls back to when a consumer injects none. It discards every message at every level. |
| [wallClock](variables/wallClock.md) | The production clock. Reads wall-clock time via `Date.now()` and timers via `node:timers/promises`. This shim is the single bridge between the `Clock` interface and Node's runtime; consumers always go through `Clock`, never directly to the Node primitives, so an unmocked call site behaves exactly like a direct `Date.now()` or `node:timers/promises` call would. |

## Client

| Name | Description |
| ------ | ------ |
| [ProtectClient](classes/ProtectClient.md) | The UniFi Protect client. Construct via [ProtectClient.connect](classes/ProtectClient.md#connect). |
| [ConnectionEvents](interfaces/ConnectionEvents.md) | The events [ConnectionMonitor](interfaces/ConnectionMonitor.md) publishes on its three-rail surface. |
| [ConnectionMonitor](interfaces/ConnectionMonitor.md) | The connection-state coordinator. Constructed by `ProtectClient.connect()`; consumers read it as `client.connection`. |
| [ConnectionTransition](interfaces/ConnectionTransition.md) | One edge of the connection-state machine, yielded by [ConnectionMonitor.observe](interfaces/ConnectionMonitor.md#observe) and carried on the `stateChanged` event. `reason` is present when a typed fault (a stall, a failed liveness probe) drove the edge. |
| [ConnectOptions](interfaces/ConnectOptions.md) | Options for [ProtectClient.connect](classes/ProtectClient.md#connect). `host`, `username`, and `password` are the required controller address and credentials; the rest are optional injected seams, each defaulted at the composition root: |
| [LivestreamSubscribeOptions](interfaces/LivestreamSubscribeOptions.md) | Per-subscription options for `LivestreamPool.subscribe` (reached through the [Camera.livestream](interfaces/Camera.md#livestream) consumer entry point). All optional: a bare `subscribe(spec)` is a resilient, drain-on-dispose subscription with no abort wiring and no reported urgency. |
| [LivestreamSubscription](interfaces/LivestreamSubscription.md) | A consumer's handle into a pooled livestream. It is an `AsyncIterable<Segment>` (the iterator *is* the surface - no callback rail) and `AsyncDisposable`. Each subscription has its **own unbounded queue**: the pool pushes every segment to every subscriber, so one slow consumer cannot stall a fast one, and nothing is dropped. |
| [LivestreamSubscriptionStats](interfaces/LivestreamSubscriptionStats.md) | The delivery counters a [LivestreamSubscription](interfaces/LivestreamSubscription.md) exposes, so a consumer can monitor its own slowness (a growing `queueDepth` / `peakQueueDepth`) and respond - the only backpressure mechanism, since the queue itself is unbounded. |
| [ProtectClientEvents](interfaces/ProtectClientEvents.md) | The events the [ProtectClient](classes/ProtectClient.md) publishes. `packet` is the realtime event firehose - the same `TypedEvent` stream that feeds the reducer, fanned out to consumers. It is produced by the realtime events WebSocket and bridged here at the composition root: each decoded event is dispatched into the store and then emitted on this rail from the one bridge subscription, so there is a single decode path for both the state model and the firehose. |
| [RecoveryContext](interfaces/RecoveryContext.md) | What the library can observe at a recovery decision point. Consumer-private state (buffer headroom, controller health) is deliberately *not* here - a consumer that wants to correlate recovery with controller health reads it in its own policy closure. The fields are exactly what the library itself can compute. |
| [ConnectionState](type-aliases/ConnectionState.md) | The connection's observable state. `healthy` is steady operation; `degraded` means a fault was detected and reachability is being probed; `reconnecting` means the controller is reachable and the monitor is re-bootstrapping and relaunching the events stream; `lost` means the controller is unreachable and recovery is polling; `throttled` means the transport's circuit breaker is open (HTTP is paused on a cooldown). `throttled` is derived live from the transport and takes precedence. |
| [LivestreamSubscriptionState](type-aliases/LivestreamSubscriptionState.md) | The coarse, stable lifecycle of a pooled stream as a subscriber observes it. `connecting` is bounded establishment (no segment has ever flowed); `live` is a healthy stream; `recovering` is an in-flight recovery episode (a recoverable stall shows here *without* ending iteration); `closed` is terminal (disposed, codec change, or the policy gave up). |
| [RecoveryDecision](type-aliases/RecoveryDecision.md) | A recovery decision the [RecoveryPolicy](type-aliases/RecoveryPolicy.md) returns. Its arms are exhaustive: |
| [RecoveryPolicy](type-aliases/RecoveryPolicy.md) | The single decision authority for a stream's recovery, injected at the pool (the same dependency-inversion seam as `resolveUrl`). Pure: given the library-observable [RecoveryContext](interfaces/RecoveryContext.md), it returns a [RecoveryDecision](type-aliases/RecoveryDecision.md). The library ships [defaultLivestreamRecoveryPolicy](functions/defaultLivestreamRecoveryPolicy.md), a health-agnostic default; a consumer injects its own to add the controller-health correlation only it can observe. |
| [defaultLivestreamRecoveryPolicy](functions/defaultLivestreamRecoveryPolicy.md) | The library's default, health-agnostic recovery policy. It is **phase-split**, because the two regimes have different timing authorities: |

## Devices

| Name | Description |
| ------ | ------ |
| [Camera](interfaces/Camera.md) | A camera projection. Inherits the read-through getters, live `observe`, and the write-through `update` and `reboot` commands from [DeviceProjection](interfaces/DeviceProjection.md), and adds the commands specific to cameras: a JPEG snapshot and a pooled livestream subscription. Camera-specific *configuration* (RTSP enablement, recording settings, and so on) is expressed through `update` payloads rather than bespoke methods. |
| [Chime](interfaces/Chime.md) | A chime projection. Inherits the read-through getters, live `observe`, and write-through `update` from [DeviceProjection](interfaces/DeviceProjection.md); chime *configuration* (default volume, per-camera ringtone assignment) is expressed through `update` payloads, while the things a chime can be told to *do* are first-class commands. |
| [DeviceProjection](interfaces/DeviceProjection.md) | The shared base of every *device* projection (`Camera`, `Chime`, `Fob`, `Light`, `Relay`, `Sensor`, `Viewer`). It extends the read-only [Projection](interfaces/Projection.md) core with what every device category adds: a stable `id`, the `modelKey` discriminant, the `name` / `isOnline` getters, and the write-through `update` and `reboot` commands (every Protect device type exposes a reboot endpoint). |
| [Fob](interfaces/Fob.md) | A fob projection. Inherits the read-through getters, live `observe`, and write-through `update` / `reboot` from [DeviceProjection](interfaces/DeviceProjection.md). A fob is an input device: its security-action button presses arrive as occurrences on the event firehose, and its away/arm state is read through the device record (`awayState`, `pendingActionType`, `wirelessConnectionState.functionButtonPressedAt`), so it adds no fob-specific commands. |
| [Light](interfaces/Light.md) | A light projection. Inherits the read-through getters, live `observe`, and write-through `update` from [DeviceProjection](interfaces/DeviceProjection.md); light-specific behavior (level, motion activation) is expressed through `update` payloads rather than bespoke methods. |
| [LivestreamOptions](interfaces/LivestreamOptions.md) | Options for [Camera.livestream](interfaces/Camera.md#livestream) - the stream-affecting `source` selector (a quality channel or a secondary lens) and tuning (segment length, chunk size, opt-in timestamps) without `cameraId` (the camera supplies its own id), plus the per-subscription [LivestreamSubscribeOptions](interfaces/LivestreamSubscribeOptions.md) (an abort signal that disposes the returned subscription, an `urgency` closure feeding the pool's resilient recovery, and `discardOnDispose`). |
| [Nvr](interfaces/Nvr.md) | The NVR projection - a read-only, observable view over the controller's configuration singleton (`state.nvr`). It is the singleton sibling of the device projections: exactly like `Camera` it is a live view whose getters read through to the current store snapshot, so a held handle always reflects the latest reduced state. It differs only in being constructed from just a context, since the NVR is a singleton with no id to bind, where `Camera` binds a `(context, id)` pair. |
| [PlaySpeakerOptions](interfaces/PlaySpeakerOptions.md) | Options for [Chime.playSpeaker](interfaces/Chime.md#playspeaker). Every field is optional. The ringtone/playback fields (`repeatTimes`, `ringtoneId`, `volume`) map 1:1 to the controller's `play-speaker` payload: omit all of them to play the chime's default assigned ringtone at the controller's chosen repeat count and volume, or supply any subset to select a specific ringtone and/or override its playback. `signal` is the client-side abort signal for the request and is never sent to the controller. |
| [Projection](interfaces/Projection.md) | The read-only core every projection shares - whether it is a command-bearing device ([DeviceProjection](interfaces/DeviceProjection.md)) or the read-only NVR singleton (`Nvr`). A projection is **a live view, not a cached entity**: it holds only its context and a stable selector, and every property access reads through to the current store snapshot. Holding a projection across hours of state change is safe - its getters always reflect the latest reduced state. |
| [Relay](interfaces/Relay.md) | A relay projection. Inherits the read-through getters, live `observe`, and write-through `update` / `reboot` from [DeviceProjection](interfaces/DeviceProjection.md), and adds the one relay-specific command: [Relay.toggleOutput](interfaces/Relay.md#toggleoutput), the faithful primitive over the controller's per-output activate endpoint. |
| [Sensor](interfaces/Sensor.md) | A sensor projection. Inherits the read-through getters, live `observe`, and write-through `update` from [DeviceProjection](interfaces/DeviceProjection.md); sensor-specific behavior (sensitivity, mount type, thresholds) is expressed through `update` payloads. |
| [SnapshotOptions](interfaces/SnapshotOptions.md) | Options for [Camera.snapshot](interfaces/Camera.md#snapshot). Width and height request a specific output size; omit both for the controller's default. Set `packageCamera` to capture from the secondary package sensor on dual-camera devices (the G4/G5 Doorbell Pro) instead of the primary lens. |
| [Viewer](interfaces/Viewer.md) | A viewer projection. Inherits the read-through getters, live `observe`, and write-through `update` from [DeviceProjection](interfaces/DeviceProjection.md); viewer-specific behavior (assigned liveview) is expressed through `update` payloads. |
| [ProtectDeviceConfig](type-aliases/ProtectDeviceConfig.md) | The config-record union a device projection can wrap - every modeled device except the NVR singleton. |

## Diagnostics

| Name | Description |
| ------ | ------ |
| [AdoptionContradictionPayload](interfaces/AdoptionContradictionPayload.md) | Payload published on [channels.adoptionContradiction](variables/channels.md#property-adoptioncontradiction). `modelKey` and `id` identify the device whose record was self-contradictory; `mac` is the device's own hardware address; `nvrMac` is the owning-controller address the record asserted, which equals this controller's own MAC (that equality is what makes the adopted-by-another claim provably false). The library corrects the record and publishes this once per episode; consumers building dashboards add their own counters. |
| [AuthReloginPayload](interfaces/AuthReloginPayload.md) | Payload published on [channels.authRelogin](variables/channels.md#property-authrelogin). `success` is `true` when the relogin re-established the session, `false` when it could not (no retained credentials, or the handshake failed). |
| [ConnectionRebootDetectedPayload](interfaces/ConnectionRebootDetectedPayload.md) | Payload published on [channels.connectionRebootDetected](variables/channels.md#property-connectionrebootdetected). The controller's own self-reported boot times are the wire-level reboot signal; no heuristics are involved. |
| [ConnectionTransitionPayload](interfaces/ConnectionTransitionPayload.md) | Payload published on [channels.connectionTransition](variables/channels.md#property-connectiontransition). `reason` is present when a specific cause (a typed error, a watchdog trip) drove the transition. |
| [EventsClosedPayload](interfaces/EventsClosedPayload.md) | Payload published on [channels.eventsClosed](variables/channels.md#property-eventsclosed). Mirrors the WebSocket close frame. |
| [EventsPacketPayload](interfaces/EventsPacketPayload.md) | Payload published on [channels.eventsPacket](variables/channels.md#property-eventspacket). `kind` is a `TypedEvent` discriminant; `modelKey` and `id` are present for device-scoped events. |
| [EventsReconnectingPayload](interfaces/EventsReconnectingPayload.md) | Payload published on [channels.eventsReconnecting](variables/channels.md#property-eventsreconnecting). |
| [HttpRequestEndPayload](interfaces/HttpRequestEndPayload.md) | Payload published on [channels.httpRequestEnd](variables/channels.md#property-httprequestend). `error` is present only when the request failed; `statusCode` is absent when the failure was transport-level (no response was received). |
| [HttpRequestStartPayload](interfaces/HttpRequestStartPayload.md) | Payload published on [channels.httpRequestStart](variables/channels.md#property-httprequeststart). `requestId` correlates the start with its matching [HttpRequestEndPayload](interfaces/HttpRequestEndPayload.md). |
| [HttpThrottleEnteredPayload](interfaces/HttpThrottleEnteredPayload.md) | Payload published on [channels.httpThrottleEntered](variables/channels.md#property-httpthrottleentered). |
| [LivestreamCodecChangedPayload](interfaces/LivestreamCodecChangedPayload.md) | Payload published on [channels.livestreamCodecChanged](variables/channels.md#property-livestreamcodecchanged). `from` / `to` are the RFC 6381 codec descriptors of the prior and reconnected init segments. The consumer's iterator also receives a [ProtectCodecChangeError](classes/ProtectCodecChangeError.md); this is its observable companion. |
| [LivestreamRecoveryExhaustedPayload](interfaces/LivestreamRecoveryExhaustedPayload.md) | Payload published on [channels.livestreamRecoveryExhausted](variables/channels.md#property-livestreamrecoveryexhausted). `attempts` is the number of consecutive failed reconnect attempts before the policy gave up. The consumer's iterator also receives a [ProtectLivestreamUnavailableError](classes/ProtectLivestreamUnavailableError.md); this channel is the seam an opt-in self-heal observer watches. |
| [LivestreamRecoveryRecoveredPayload](interfaces/LivestreamRecoveryRecoveredPayload.md) | Payload published on [channels.livestreamRecoveryRecovered](variables/channels.md#property-livestreamrecoveryrecovered). `downtimeMs` is the elapsed time from the fault that began the episode to the first MEDIA segment that restored the stream - liveness is media-keyed, so this measures how long media was actually absent, not how long until the controller re-acked with an init. |
| [LivestreamRecoveryStartedPayload](interfaces/LivestreamRecoveryStartedPayload.md) | Payload published on [channels.livestreamRecoveryStarted](variables/channels.md#property-livestreamrecoverystarted). `attempts` is 0 at the start of an episode; `sinceLastSegmentMs` is how long the stream had been silent when the fault was observed. |
| [LivestreamSessionClosedPayload](interfaces/LivestreamSessionClosedPayload.md) | Payload published on [channels.livestreamSessionClosed](variables/channels.md#property-livestreamsessionclosed). |
| [LivestreamSessionOpenedPayload](interfaces/LivestreamSessionOpenedPayload.md) | Payload published on [channels.livestreamSessionOpened](variables/channels.md#property-livestreamsessionopened). `key` is the pool's stream-affecting sharing key `${cameraId}:${channel}:${lens}:${segmentLength}:${chunkSize}:${timestamps}` (the resolved stream-affecting identity). |
| [LivestreamStallDetectedPayload](interfaces/LivestreamStallDetectedPayload.md) | Payload published on [channels.livestreamStallDetected](variables/channels.md#property-livestreamstalldetected). |
| [LivestreamSubscriptionCreatedPayload](interfaces/LivestreamSubscriptionCreatedPayload.md) | Payload published on [channels.livestreamSubscriptionCreated](variables/channels.md#property-livestreamsubscriptioncreated). |
| [LivestreamSubscriptionDisposedPayload](interfaces/LivestreamSubscriptionDisposedPayload.md) | Payload published on [channels.livestreamSubscriptionDisposed](variables/channels.md#property-livestreamsubscriptiondisposed). `stats` carries the subscription's final delivery counters, including any segments discarded on disposal. |
| [SchemaUnknownModelKeyPayload](interfaces/SchemaUnknownModelKeyPayload.md) | Payload published on [channels.schemaUnknownModelKey](variables/channels.md#property-schemaunknownmodelkey). `action` and `exampleId` are the discriminating fields from the offending packet's header so a consumer can correlate the drift signal with concrete wire activity (e.g., "modelKey 'garage' first seen at action 'add' with id <uuid>"). The library does not accumulate or aggregate beyond the first-occurrence dedup; consumers building dashboards add their own counters from this channel. |
| [SchemaUnmodeledCollectionPayload](interfaces/SchemaUnmodeledCollectionPayload.md) | Payload published on [channels.schemaUnmodeledCollection](variables/channels.md#property-schemaunmodeledcollection). `collection` is the bootstrap array key (e.g. `"aiports"`), `modelKey` is the record's self-declared type (e.g. `"aiport"`), `count` is the array length, and `exampleId` is the first record's id - enough to correlate the signal with the bootstrap shape. `known` distinguishes a recognized-but-unreduced class (a model key the library knows about but does not project, `true`) from genuine schema drift the controller introduced (`false`). The library does not aggregate beyond the first-occurrence-per-`modelKey` dedup; consumers building dashboards add their own counters from this channel. |
| [TalkbackSessionClosedPayload](interfaces/TalkbackSessionClosedPayload.md) | Payload published on [channels.talkbackSessionClosed](variables/channels.md#property-talkbacksessionclosed). `reason` mirrors the WebSocket close frame's reason (or the teardown cause when the session closed itself). |
| [TalkbackSessionOpenedPayload](interfaces/TalkbackSessionOpenedPayload.md) | Payload published on [channels.talkbackSessionOpened](variables/channels.md#property-talkbacksessionopened). `cameraId` is the camera whose speaker the session connected to. |
| [channels](variables/channels.md) | The library's observability surface, expressed as `node:diagnostics_channel` publishers. |

## Errors

| Name | Description |
| ------ | ------ |
| [FatalError](classes/FatalError.md) | Abstract base for failures the caller should propagate. Retrying the identical call will reproduce the identical failure, so the correct response is to surface it. |
| [ProtectAbortedError](classes/ProtectAbortedError.md) | The caller's `AbortSignal` fired. The operation was cancelled by the consumer, not by the library's own deadline. Recoverable in the sense that the caller chose to stop - re-issuing the operation with a fresh signal is valid. |
| [ProtectAuthError](classes/ProtectAuthError.md) | Authentication failed: invalid credentials, an expired session that could not be renewed, or a CSRF-token rotation that did not complete. Fatal because retrying with the same credentials reproduces the failure. |
| [ProtectAuthorizationError](classes/ProtectAuthorizationError.md) | The credentials authenticated but lack the privilege the operation requires (typically a `403`; Protect reserves many operations for administrator accounts). Fatal because the same account will keep being refused. |
| [ProtectBootstrapError](classes/ProtectBootstrapError.md) | The bootstrap sequence failed while fetching or parsing the controller bootstrap document. `stage` discriminates which - `"fetch"` when the bootstrap endpoint returns a non-2xx status or the transport fails reaching it, `"parse"` when the body cannot be decoded - so the caller and the diagnostics surface can report the precise point of failure rather than a generic "connect failed." A login or reachability failure is not wrapped here; it propagates as its own typed fatal. |
| [ProtectCodecChangeError](classes/ProtectCodecChangeError.md) | A pooled livestream reconnected and the controller negotiated a different codec than the one in flight (H.264 to HEVC, or a channel reconfigured mid-stream). Fatal because no fixed-codec consumer can adapt in place: an FFmpeg pipe cannot re-initialize, and HKSV tolerates no second init segment. The pool surfaces this as the one terminal a recovering stream can raise, after which the consumer re-subscribes for a fresh stream against the new codec. The `from` / `to` descriptors are the RFC 6381 codec strings the two init segments carried, so a consumer can log precisely what changed. |
| [ProtectError](classes/ProtectError.md) | The error model in one sentence: every failure the library raises is a subclass of [ProtectError](classes/ProtectError.md), and the *first* level of the hierarchy answers the only question a caller universally needs answered - should I retry, or should I propagate? |
| [ProtectLivestreamUnavailableError](classes/ProtectLivestreamUnavailableError.md) | A pooled livestream's recovery policy gave up. The `phase` discriminates the two regimes the pool runs: `establishing` means the first segment never arrived within the bounded establishment deadline (the stream that never produced media), and `recovering` means a previously-live stream could not be re-established and the policy elected to stop. Fatal because the policy - the single authority over whether to keep trying - has declared the stream unrecoverable; the consumer re-subscribes if it still wants the stream. `attempts` carries how many consecutive reconnect attempts the episode made before the policy returned `giveUp`. |
| [ProtectNetworkError](classes/ProtectNetworkError.md) | A connect, DNS, TLS, or socket-level failure reaching the controller. The originating Node `ErrnoException` is preserved on the `cause` chain (the shape undici raises as `TypeError("fetch failed", { cause: errnoError })`); `code` lifts the errno string out for convenient branching. |
| [ProtectProtocolError](classes/ProtectProtocolError.md) | A wire- or response-level violation the library cannot make sense of: an event packet that does not match the documented frame structure, a WebSocket message that breaks the spec the library decodes against, an HTTP response body that fails to parse, or a response missing data the operation requires. Fatal because the same bytes will not decode or validate differently on retry - the defect is in the payload, not in reaching it. |
| [ProtectRequestError](classes/ProtectRequestError.md) | The controller returned an error status the library does not classify more specifically (a 4xx other than 401/403, or any 5xx). The status, body, and headers are preserved so the caller can inspect the controller's own explanation. |
| [ProtectStallError](classes/ProtectStallError.md) | A realtime channel produced no data for longer than its heartbeat watchdog window - either the events WebSocket (silent beyond `PROTECT_EVENTS_WATCHDOG_TIMEOUT`) or a livestream session (silent beyond `PROTECT_LIVESTREAM_HEARTBEAT_TIMEOUT`). The underlying channel is presumed dead. As a `RecoverableError`, the error type itself is the signal to recover: the events stream's subscriber (the `ConnectionMonitor`) re-bootstraps and relaunches, and a stalled livestream session's owner (the pool's `ManagedSession`) drives a recovery loop that reconnects under the injected policy - the bare `LivestreamSession` escape hatch is the only livestream surface that surfaces this verbatim to a direct consumer without recovering on its behalf. |
| [ProtectThrottledError](classes/ProtectThrottledError.md) | We are inside the throttle cooldown window. The library has seen enough consecutive failures to back off from the controller, and this request was rejected locally rather than sent. Retry once the cooldown elapses. |
| [ProtectTimeoutError](classes/ProtectTimeoutError.md) | Our own request deadline elapsed before the controller responded. Distinct from [ProtectAbortedError](classes/ProtectAbortedError.md): this fires when the library's internal `AbortSignal.timeout()` wins the race, whereas an aborted error fires when the caller's signal wins. The transport tells the two apart by checking whether the caller's own `AbortSignal` is already aborted: if it is, the cancellation came from the caller; if not, the library's timeout won. |
| [ProtectUnsupportedError](classes/ProtectUnsupportedError.md) | The requested operation is not available on this device. This is a *client-side precondition* failure - distinct from [ProtectRequestError](classes/ProtectRequestError.md), which classifies a status the controller actually returned - raised before any request is issued because the device lacks the capability the operation requires (for example, a package snapshot on a camera that has no secondary package sensor). Fatal because a device's capabilities do not change on retry; the caller should pick a different operation or device. The optional `feature` names the missing capability flag, for precise logging and programmatic branching. |
| [RecoverableError](classes/RecoverableError.md) | Abstract base for failures the caller may retry or defer. The library never retries the caller's operation itself - it classifies the failure as recoverable and returns control so the caller can apply its own backoff, escalation, or alternative-path policy. |
| [ProtectBootstrapStage](type-aliases/ProtectBootstrapStage.md) | The stages of the `connect()` sequence, used to discriminate a [ProtectBootstrapError](classes/ProtectBootstrapError.md). The sequence authenticates, fetches the bootstrap document, parses it, then subscribes to the realtime stream; only the fetch and parse stages are wrapped as a bootstrap error, because a login or reachability failure already propagates as its own typed fatal (`ProtectAuthError` / `ProtectNetworkError`). |

## Events

| Name | Description |
| ------ | ------ |
| [StreamOptions](interfaces/StreamOptions.md) | Options accepted by the event-bus `stream` rail. Carries the abort signal that terminates the iteration; further keys are reserved for a future backpressure policy. The default behavior is unbounded, matching the livestream-subscription rule (a subscriber receives every emission until it aborts or stops iterating). |
| [TypedEvent](type-aliases/TypedEvent.md) | The discriminated union of every realtime event the library models, exposed on the firehose ([ProtectClient.events](classes/ProtectClient.md#events)) and by [ProtectClient.classifyPacket](classes/ProtectClient.md#classifypacket). It splits into two categories by relationship to state: |

## Other

| Name | Description |
| ------ | ------ |
| [ProtectAirQualityMetricInterface](interfaces/ProtectAirQualityMetricInterface.md) | A description of a single air quality metric reading from a UniFi Protect sensor. |
| [ProtectAirQualityThresholdSettingsInterface](interfaces/ProtectAirQualityThresholdSettingsInterface.md) | A description of threshold settings for a single air quality metric on a UniFi Protect sensor. |
| [ProtectBridgeCandidate](interfaces/ProtectBridgeCandidate.md) | A bridge candidate entry observed by a sensor. The Protect controller advertises every reachable bridge a sensor can hear, with signal-quality telemetry per candidate, so the radio-management layer can pick the best uplink. Modeled as a typed shape rather than `ProtectKnownJsonValue[]` because the field is genuinely structured...consumers reading `sensor.bridgeCandidates[0].signalQuality` get full type-checking instead of having to narrow an opaque blob at every call site. |
| [ProtectCameraChannelConfigInterface](interfaces/ProtectCameraChannelConfigInterface.md) | A semi-complete description of the UniFi Protect camera channel JSON. |
| [ProtectCameraConfigInterface](interfaces/ProtectCameraConfigInterface.md) | A semi-complete description of the UniFi Protect camera JSON. |
| [ProtectCameraLcdMessageConfigInterface](interfaces/ProtectCameraLcdMessageConfigInterface.md) | A semi-complete description of the UniFi Protect LCD message JSON. |
| [ProtectCameraRecordingPathSettingsInterface](interfaces/ProtectCameraRecordingPathSettingsInterface.md) | A description of the UniFi Protect camera recording-path settings JSON: the storage console the camera records to, whether it automatically fails over to another, and the failover timeout. |
| [ProtectCameraTalkbackConfigInterface](interfaces/ProtectCameraTalkbackConfigInterface.md) | A semi-complete description of the UniFi Protect talkback settings JSON. |
| [ProtectChimeConfigInterface](interfaces/ProtectChimeConfigInterface.md) | A semi-complete description of the UniFi Protect chime JSON. |
| [ProtectDeviceBaseInterface](interfaces/ProtectDeviceBaseInterface.md) | The common properties shared by all UniFi Protect device configuration objects. |
| [ProtectEventAddInterface](interfaces/ProtectEventAddInterface.md) | A semi-complete description of the UniFi Protect smart motion detection event JSON. |
| [ProtectEventHeader](interfaces/ProtectEventHeader.md) | The realtime-events action header. Every action frame is a JSON object carrying at least these four string fields; controllers may include arbitrary additional keys, which are preserved on the index signature. The decoder validates this shape, so a [RawPacket](interfaces/RawPacket.md)'s `header` is always trustworthy downstream. |
| [ProtectEventMetadataDetectedThumbnailInterface](interfaces/ProtectEventMetadataDetectedThumbnailInterface.md) | A semi-complete description of the UniFi Protect smart motion detection thumbnail metadata JSON. |
| [ProtectEventMetadataInterface](interfaces/ProtectEventMetadataInterface.md) | A description of metadata in UniFi Protect smart motion detect events. |
| [ProtectFobConfigInterface](interfaces/ProtectFobConfigInterface.md) | A semi-complete description of the UniFi Protect fob JSON. A fob is a long-range (LoRa) handheld with security-action buttons; it carries the standard device record (inherited from [ProtectDeviceBaseInterface](interfaces/ProtectDeviceBaseInterface.md)) plus its away/arm state, its button-label profile, any pending arm action, and its LoRa link state. It reports `host: null` and omits `isConnected`, which the shared base widens for LoRa devices. |
| [ProtectLightConfigInterface](interfaces/ProtectLightConfigInterface.md) | A semi-complete description of the UniFi Protect light JSON. |
| [ProtectLogging](interfaces/ProtectLogging.md) | Logging interface, leveraging what we do for Homebridge and elsewhere as a good template. |
| [ProtectNvrAgreementInterface](interfaces/ProtectNvrAgreementInterface.md) | A description of a UniFi Protect NVR legal-agreement record: the contract identifier, its link, the contract version, and the acceptance status (`null` until the agreement is accepted). |
| [ProtectNvrAiFeatureToggleInterface](interfaces/ProtectNvrAiFeatureToggleInterface.md) | A description of a UniFi Protect NVR AI-feature toggle: whether the feature is enabled and whether it applies to all cameras or only the enumerated `cameras` subset. |
| [ProtectNvrBootstrapInterface](interfaces/ProtectNvrBootstrapInterface.md) | A semi-complete description of the UniFi Protect NVR bootstrap JSON. |
| [ProtectNvrConfigInterface](interfaces/ProtectNvrConfigInterface.md) | A semi-complete description of the UniFi Protect NVR configuration JSON. |
| [ProtectNvrLiveviewConfigInterface](interfaces/ProtectNvrLiveviewConfigInterface.md) | A semi-complete description of the UniFi Protect NVR liveview JSON. |
| [ProtectNvrSystemEventControllerInterface](interfaces/ProtectNvrSystemEventControllerInterface.md) | A semi-complete description of the UniFi Protect NVR system events controller JSON. |
| [ProtectNvrSystemEventInterface](interfaces/ProtectNvrSystemEventInterface.md) | A semi-complete description of the UniFi Protect NVR system events JSON. |
| [ProtectNvrSystemInfoInterface](interfaces/ProtectNvrSystemInfoInterface.md) | A semi-complete description of the UniFi Protect NVR system information configuration JSON. |
| [ProtectNvrUserConfigInterface](interfaces/ProtectNvrUserConfigInterface.md) | A semi-complete description of the UniFi Protect NVR user JSON. |
| [ProtectPtzAxisRangeInterface](interfaces/ProtectPtzAxisRangeInterface.md) | A description of a PTZ axis range for UniFi Protect camera feature flags. |
| [ProtectRelayConfigInterface](interfaces/ProtectRelayConfigInterface.md) | A semi-complete description of the UniFi Protect relay JSON. A relay is a long-range (LoRa) device that exposes one or more latching outputs the controller toggles individually, plus inputs that each map an external trigger to an action on one of those outputs; it carries the standard device record (inherited from [ProtectDeviceBaseInterface](interfaces/ProtectDeviceBaseInterface.md)) plus its per-output state, LoRa link state, and radio settings. It reports `host: null` and omits `isConnected`, which is why the shared base widens both - see the note on those members in the base interface. |
| [ProtectRelayInputConfigInterface](interfaces/ProtectRelayInputConfigInterface.md) | A description of a single relay input. An input maps an external trigger to an action on one of the relay's outputs; every field but the numeric `id` is reported nullable on the wire. |
| [ProtectRelayOutputConfigInterface](interfaces/ProtectRelayOutputConfigInterface.md) | A description of a single relay output. Each output is a latching switch the controller flips via the dedicated activate endpoint (see `Relay.toggleOutput`); its `state` is reported in the record and broadcast in realtime on change. The numeric `id` and the `"off" | "on"` `state` are always present; the remaining fields are nullable on the wire. |
| [ProtectRingtoneConfigInterface](interfaces/ProtectRingtoneConfigInterface.md) | A semi-complete description of the UniFi Protect ringtone JSON. |
| [ProtectSensorAirQualityInterface](interfaces/ProtectSensorAirQualityInterface.md) | A description of the UniFi Protect sensor air-quality readings JSON. Each member is a [ProtectAirQualityMetricInterface](interfaces/ProtectAirQualityMetricInterface.md) reading for one measured quantity; a sensor without a given capability reports that metric with a `null` value. |
| [ProtectSensorAirQualitySettingsInterface](interfaces/ProtectSensorAirQualitySettingsInterface.md) | A description of the UniFi Protect sensor air-quality settings JSON: the per-metric alert thresholds (each a [ProtectAirQualityThresholdSettingsInterface](interfaces/ProtectAirQualityThresholdSettingsInterface.md)), the reading and alert intervals, the ring-LED display, the night-mode schedule, and the vape sensitivity. |
| [ProtectSensorConfigInterface](interfaces/ProtectSensorConfigInterface.md) | A semi-complete description of the UniFi Protect sensor JSON. |
| [ProtectSensorSensitivitySettingsInterface](interfaces/ProtectSensorSensitivitySettingsInterface.md) | A description of a UniFi Protect sensor sensitivity toggle - the shared shape of the sensor's motion and glass-break settings: whether the capability is enabled, its base sensitivity, and the sensitivity applied while the sensor is armed. |
| [ProtectSensorSmokeStatusInterface](interfaces/ProtectSensorSmokeStatusInterface.md) | A description of the UniFi Protect sensor smoke/CO detector status JSON, reported by a sensor with a smoke sensor and `null` on one without. It carries the alarm and fault booleans plus the raw smoke, CO, and battery-voltage readings. |
| [ProtectSmartZoneInterface](interfaces/ProtectSmartZoneInterface.md) | The common properties shared by all UniFi Protect smart detection and motion zone objects. |
| [ProtectThresholdSettingsInterface](interfaces/ProtectThresholdSettingsInterface.md) | A description of threshold settings for environmental metrics (humidity, light, temperature) on a UniFi Protect sensor. |
| [ProtectViewerConfigInterface](interfaces/ProtectViewerConfigInterface.md) | A semi-complete description of the UniFi Protect viewer JSON. |
| [ProtectWifiConnectionStateInterface](interfaces/ProtectWifiConnectionStateInterface.md) | A description of the UniFi Protect device WiFi connection state JSON. |
| [ProtectWiredConnectionStateInterface](interfaces/ProtectWiredConnectionStateInterface.md) | A description of the UniFi Protect device wired connection state JSON. `phyRate` is nullable because a device with no wired link reports it as `null` (the relay, a LoRa device, carries `wiredConnectionState: { phyRate: null }`); a genuinely wired device reports the negotiated rate as a number. |
| [ProtectWirelessConnectionSettingsInterface](interfaces/ProtectWirelessConnectionSettingsInterface.md) | A description of the UniFi Protect device wireless (LoRa) connection settings JSON, carried by long-range radio devices such as the relay, sensors, and the fob: the paired bridge, the LoRa spreading factor and the spreading factors the device supports, and the telemetry update interval. |
| [ProtectWirelessConnectionStateInterface](interfaces/ProtectWirelessConnectionStateInterface.md) | A description of the UniFi Protect device wireless (LoRa) connection state JSON. Carried by long-range radio devices such as the relay: the live link telemetry - the battery status, the bridge it is paired with and the bridges it can hear, the last function-button press time, and the radio signal state (SNR plus signal quality and strength). The candidates are modeled inline rather than as [ProtectBridgeCandidate](interfaces/ProtectBridgeCandidate.md) because the relay's entries omit that type's required `modelKey`. |
| [RawPacket](interfaces/RawPacket.md) | The decoded, still-untyped form of a realtime-events packet: the validated action [ProtectEventHeader](interfaces/ProtectEventHeader.md) and the raw data-frame payload. The payload is `unknown` because the data frame may be parsed JSON (the dominant case), a UTF-8 string, or a raw `Buffer`; interpreting it is the classifier's job, not the codec's. It is the element type of the raw firehose (`client.rawPackets()`) and the input/output of the static `ProtectClient.decodePacket` / `ProtectClient.classifyPacket`. |
| [AuthMethod](type-aliases/AuthMethod.md) | The authentication method a doorbell [\`authDetected\`](type-aliases/TypedEvent.md) occurrence resolved: a fingerprint match or an NFC card tap. The deliberate counterpoint to [SmartDetectType](type-aliases/SmartDetectType.md): that one is *open* (`| (string & {})`) because `objectTypes` passes wire-provided detection-class strings through verbatim and must stay honest against new firmware classes; this one is *closed*, because `method` is not passed through but *computed* by the classifier from the enumerated auth `type` values via a single map - the library can only ever produce a value it mapped, so a new auth method is an explicit extension of this union and that map together, never a silent wire passthrough. |
| [ProtectAirQualityMetric](type-aliases/ProtectAirQualityMetric.md) | - |
| [ProtectAirQualityThresholdSettings](type-aliases/ProtectAirQualityThresholdSettings.md) | - |
| [ProtectCameraChannelConfig](type-aliases/ProtectCameraChannelConfig.md) | - |
| [ProtectCameraConfig](type-aliases/ProtectCameraConfig.md) | - |
| [ProtectCameraLcdMessageConfig](type-aliases/ProtectCameraLcdMessageConfig.md) | - |
| [ProtectCameraRecordingPathSettings](type-aliases/ProtectCameraRecordingPathSettings.md) | - |
| [ProtectCameraTalkbackConfig](type-aliases/ProtectCameraTalkbackConfig.md) | - |
| [ProtectChimeConfig](type-aliases/ProtectChimeConfig.md) | - |
| [ProtectDeviceBase](type-aliases/ProtectDeviceBase.md) | - |
| [ProtectEventAdd](type-aliases/ProtectEventAdd.md) | - |
| [ProtectEventMetadata](type-aliases/ProtectEventMetadata.md) | - |
| [ProtectEventMetadataDetectedThumbnail](type-aliases/ProtectEventMetadataDetectedThumbnail.md) | - |
| [ProtectFobConfig](type-aliases/ProtectFobConfig.md) | - |
| [ProtectKnownDevice](type-aliases/ProtectKnownDevice.md) | The union of every device-config record the reducer maintains as canonical state. A realtime device transition (`deviceAdded` / `devicePatched`) carries one of these shapes, discriminated by the packet's `modelKey`. The NVR config is included because the controller emits `modelKey: "nvr"` updates that patch the NVR's own configuration through the same dispatch path as any other device. Consumers narrow on `modelKey` (or on a structural field) to recover the specific shape. |
| [ProtectLightConfig](type-aliases/ProtectLightConfig.md) | - |
| [ProtectNvrAgreement](type-aliases/ProtectNvrAgreement.md) | - |
| [ProtectNvrAiFeatureToggle](type-aliases/ProtectNvrAiFeatureToggle.md) | - |
| [ProtectNvrBootstrap](type-aliases/ProtectNvrBootstrap.md) | - |
| [ProtectNvrConfig](type-aliases/ProtectNvrConfig.md) | - |
| [ProtectNvrLiveviewConfig](type-aliases/ProtectNvrLiveviewConfig.md) | - |
| [ProtectNvrSystemEvent](type-aliases/ProtectNvrSystemEvent.md) | - |
| [ProtectNvrSystemEventController](type-aliases/ProtectNvrSystemEventController.md) | - |
| [ProtectNvrSystemInfo](type-aliases/ProtectNvrSystemInfo.md) | - |
| [ProtectNvrUserConfig](type-aliases/ProtectNvrUserConfig.md) | - |
| [ProtectPtzAxisRange](type-aliases/ProtectPtzAxisRange.md) | - |
| [ProtectRelayConfig](type-aliases/ProtectRelayConfig.md) | - |
| [ProtectRingtoneConfig](type-aliases/ProtectRingtoneConfig.md) | - |
| [ProtectSensorAirQuality](type-aliases/ProtectSensorAirQuality.md) | - |
| [ProtectSensorAirQualitySettings](type-aliases/ProtectSensorAirQualitySettings.md) | - |
| [ProtectSensorConfig](type-aliases/ProtectSensorConfig.md) | - |
| [ProtectSensorSensitivitySettings](type-aliases/ProtectSensorSensitivitySettings.md) | - |
| [ProtectSensorSmokeStatus](type-aliases/ProtectSensorSmokeStatus.md) | - |
| [ProtectSmartZone](type-aliases/ProtectSmartZone.md) | - |
| [ProtectState](type-aliases/ProtectState.md) | The immutable snapshot of a controller's modeled state. Devices are normalized into `id -> config` maps for O(1) lookup; selectors derive arrays on demand and memoize on map identity. `bootstrapId` is a monotonic counter incremented on every applied bootstrap - internal bookkeeping that guarantees a bootstrap always mints a fresh state reference (the store's dispatch gate relies on this), surfaced for diagnostics but read by no device observer. |
| [ProtectStateRecord](type-aliases/ProtectStateRecord.md) | The union of every config record the reducer stores in [ProtectState](type-aliases/ProtectState.md): the devices and NVR of [ProtectKnownDevice](type-aliases/ProtectKnownDevice.md), plus the controller's user and liveview records. A realtime state transition (`deviceAdded` / `devicePatched`) carries one of these, discriminated by the packet's `modelKey`. The `user` roster is included because the controller emits `modelKey: "user"` updates - permission and login changes - on the realtime stream; the `liveview` collection because it emits `modelKey: "liveview"` updates as liveviews are added, edited, or removed. The reducer folds both in through the same dispatch path as any device. This widens [ProtectKnownDevice](type-aliases/ProtectKnownDevice.md) by exactly the record types the user roster (`user`) and the liveview collection (`liveview`) introduce; consumers narrow on `modelKey` to recover the shape. (`ringtones` is reduced into [ProtectState](type-aliases/ProtectState.md) too, but bootstrap-only - the controller broadcasts no `ringtone` realtime packet - so it never arrives as a state transition and is deliberately absent from this union.) |
| [ProtectThresholdSettings](type-aliases/ProtectThresholdSettings.md) | - |
| [ProtectViewerConfig](type-aliases/ProtectViewerConfig.md) | - |
| [ProtectWifiConnectionState](type-aliases/ProtectWifiConnectionState.md) | - |
| [ProtectWiredConnectionState](type-aliases/ProtectWiredConnectionState.md) | - |
| [ProtectWirelessConnectionSettings](type-aliases/ProtectWirelessConnectionSettings.md) | - |
| [ProtectWirelessConnectionState](type-aliases/ProtectWirelessConnectionState.md) | - |
| [SmartDetectType](type-aliases/SmartDetectType.md) | The known UniFi Protect smart-detection object classes. Modeled as an open union: the listed literals give editor autocomplete and exhaustiveness hints for the common cases, while the trailing `string` keeps the type honest against firmware that introduces new detection classes the library has not enumerated yet. |
| [StateModelKey](type-aliases/StateModelKey.md) | The model keys the library reduces into canonical [ProtectState](type-aliases/ProtectState.md) *from the realtime stream*: the devices, the NVR, the user roster, and the liveview collection. A superset of `DeviceModelKey` (it adds `user` and `liveview`, reduced but not device-addressed) and a subset of `ModelKey` (the full observed wire vocabulary). |
| [PROTECT\_API\_ERROR\_LIMIT](variables/PROTECT_API_ERROR_LIMIT.md) | - |
| [PROTECT\_API\_RETRY\_INTERVAL](variables/PROTECT_API_RETRY_INTERVAL.md) | - |
| [PROTECT\_API\_TIMEOUT](variables/PROTECT_API_TIMEOUT.md) | - |
| [PROTECT\_BOOTSTRAP\_REFRESH\_INTERVAL](variables/PROTECT_BOOTSTRAP_REFRESH_INTERVAL.md) | - |
| [PROTECT\_EVENTS\_WATCHDOG\_TIMEOUT](variables/PROTECT_EVENTS_WATCHDOG_TIMEOUT.md) | - |
| [PROTECT\_LIVESTREAM\_AWAIT\_MARGIN\_MS](variables/PROTECT_LIVESTREAM_AWAIT_MARGIN_MS.md) | - |
| [PROTECT\_LIVESTREAM\_AWAIT\_MAX\_MS](variables/PROTECT_LIVESTREAM_AWAIT_MAX_MS.md) | - |
| [PROTECT\_LIVESTREAM\_AWAIT\_MIN\_MS](variables/PROTECT_LIVESTREAM_AWAIT_MIN_MS.md) | - |
| [PROTECT\_LIVESTREAM\_DEFAULT\_TOLERANCE\_MS](variables/PROTECT_LIVESTREAM_DEFAULT_TOLERANCE_MS.md) | - |
| [PROTECT\_LIVESTREAM\_ESTABLISH\_BACKOFF\_MS](variables/PROTECT_LIVESTREAM_ESTABLISH_BACKOFF_MS.md) | - |
| [PROTECT\_LIVESTREAM\_ESTABLISH\_DEADLINE\_MS](variables/PROTECT_LIVESTREAM_ESTABLISH_DEADLINE_MS.md) | - |
| [PROTECT\_LIVESTREAM\_HEARTBEAT\_TIMEOUT](variables/PROTECT_LIVESTREAM_HEARTBEAT_TIMEOUT.md) | - |
| [PROTECT\_LIVESTREAM\_RECOVERY\_BACKOFF\_MS](variables/PROTECT_LIVESTREAM_RECOVERY_BACKOFF_MS.md) | - |
| [PROTECT\_REBOOT\_ANTICIPATION\_WINDOW\_MS](variables/PROTECT_REBOOT_ANTICIPATION_WINDOW_MS.md) | - |
| [PROTECT\_REBOOT\_DETECTION\_THRESHOLD](variables/PROTECT_REBOOT_DETECTION_THRESHOLD.md) | - |
| [PROTECT\_RECOVERY\_BACKOFF\_KNOWN\_MS](variables/PROTECT_RECOVERY_BACKOFF_KNOWN_MS.md) | - |
| [PROTECT\_RECOVERY\_BACKOFF\_UNKNOWN\_MS](variables/PROTECT_RECOVERY_BACKOFF_UNKNOWN_MS.md) | - |
| [PROTECT\_RECOVERY\_STEADY\_INTERVAL\_MS](variables/PROTECT_RECOVERY_STEADY_INTERVAL_MS.md) | - |

## State

| Name | Description |
| ------ | ------ |
| [StateStore](interfaces/StateStore.md) | The canonical state holder. See the module doc for the model. Constructed by `ProtectClient.connect()`; consumers read it as `client.state`. |
| [selectAdoptedCameraIds](variables/selectAdoptedCameraIds.md) | The ids of the cameras adopted by this controller, content-memoized to change reference only when the membership set changes. |
| [selectAdoptedChimeIds](variables/selectAdoptedChimeIds.md) | The ids of the chimes adopted by this controller, content-memoized to change reference only when the membership set changes. |
| [selectAdoptedFobIds](variables/selectAdoptedFobIds.md) | The ids of the fobs adopted by this controller, content-memoized to change reference only when the membership set changes. |
| [selectAdoptedLightIds](variables/selectAdoptedLightIds.md) | The ids of the lights adopted by this controller, content-memoized to change reference only when the membership set changes. |
| [selectAdoptedRelayIds](variables/selectAdoptedRelayIds.md) | The ids of the relays adopted by this controller, content-memoized to change reference only when the membership set changes. |
| [selectAdoptedSensorIds](variables/selectAdoptedSensorIds.md) | The ids of the sensors adopted by this controller, content-memoized to change reference only when the membership set changes. |
| [selectAdoptedViewerIds](variables/selectAdoptedViewerIds.md) | The ids of the viewers adopted by this controller, content-memoized to change reference only when the membership set changes. |
| [selectCamera](variables/selectCamera.md) | A single camera by id, or `undefined` when absent. |
| [selectCameras](variables/selectCameras.md) | All cameras, memoized on the camera-map identity. |
| [selectChime](variables/selectChime.md) | A single chime by id, or `undefined` when absent. |
| [selectChimes](variables/selectChimes.md) | All chimes, memoized on the chime-map identity. |
| [selectFob](variables/selectFob.md) | A single fob by id, or `undefined` when absent. |
| [selectFobs](variables/selectFobs.md) | All fobs, memoized on the fob-map identity. |
| [selectLight](variables/selectLight.md) | A single light by id, or `undefined` when absent. |
| [selectLights](variables/selectLights.md) | All lights, memoized on the light-map identity. |
| [selectLiveview](variables/selectLiveview.md) | A single liveview by id, or `undefined` when absent. |
| [selectLiveviews](variables/selectLiveviews.md) | All liveviews, memoized on the liveview-map identity. Each record carries its `slots[].cameras`. |
| [selectOnlineCameras](variables/selectOnlineCameras.md) | The connected cameras only. |
| [selectOnlineChimes](variables/selectOnlineChimes.md) | The connected chimes only. |
| [selectOnlineFobs](variables/selectOnlineFobs.md) | The connected fobs only. |
| [selectOnlineLights](variables/selectOnlineLights.md) | The connected lights only. |
| [selectOnlineRelays](variables/selectOnlineRelays.md) | The connected relays only. |
| [selectOnlineSensors](variables/selectOnlineSensors.md) | The connected sensors only. |
| [selectOnlineViewers](variables/selectOnlineViewers.md) | The connected viewers only. |
| [selectRelay](variables/selectRelay.md) | A single relay by id, or `undefined` when absent. |
| [selectRelays](variables/selectRelays.md) | All relays, memoized on the relay-map identity. |
| [selectRingtone](variables/selectRingtone.md) | A single ringtone by id, or `undefined` when absent. |
| [selectRingtones](variables/selectRingtones.md) | All ringtones, memoized on the ringtone-map identity. |
| [selectSensor](variables/selectSensor.md) | A single sensor by id, or `undefined` when absent. |
| [selectSensors](variables/selectSensors.md) | All sensors, memoized on the sensor-map identity. |
| [selectViewer](variables/selectViewer.md) | A single viewer by id, or `undefined` when absent. |
| [selectViewers](variables/selectViewers.md) | All viewers, memoized on the viewer-map identity. |
| [isDeviceAdopted](functions/isDeviceAdopted.md) | Whether a device is adopted by *this* controller - owned and managed here, rather than merely visible on the network or owned by a different NVR. The single definition of "adopted by us", shared by the membership-id selectors so the collection views and any per-device check never disagree, exactly as [isDeviceOnline](functions/isDeviceOnline.md) is the single definition of "online". |
| [isDeviceOnline](functions/isDeviceOnline.md) | Whether a device is currently connected to the controller. The single definition of "online" shared by the `online` selectors and the device projections' `isOnline` getter, so the collection views and the per-device view never disagree. |
| [selectAuthUser](functions/selectAuthUser.md) | The authenticated session's own user record, or `null` when there is no such user (before the first bootstrap, or if the id is absent from the roster). The single-source primitive for session-identity facts: [selectIsAdmin](functions/selectIsAdmin.md) derives from it, and consumers can `observe` it directly to react to "who am I" changes. Reads straight through the roster map, so the returned record reference is structurally-sharing-stable across dispatches that did not touch it - no memoization needed. |
| [selectControllerName](functions/selectControllerName.md) | The controller's display label - its user-assigned name, else the always-present `marketName` - or `null` only before the first bootstrap (no `nvr` record yet), never for a merely-unnamed controller (which surfaces its model). Single-sourced with `Nvr.name`, so the projection getter and this primitive never disagree; a consumer needing the raw "was it explicitly named?" distinction reads `client.nvr.config.name`. Returns a primitive, so it needs no memoization: the value is its own `Object.is` key for the observer's dedup, and two property reads are already cheaper than a cache lookup. |
| [selectIsAdmin](functions/selectIsAdmin.md) | Whether the authenticated session has Super Admin (camera-write) privileges. Derived from the session user's record and the controller's permission grammar; `false` before the first bootstrap or when the session's user is absent. Re-evaluated whenever the user's record changes, so a role change at the controller surfaces on the next bootstrap refresh. |
| [selectNvr](functions/selectNvr.md) | The controller's NVR configuration record, or `null` before the first bootstrap. The single-source primitive the [Nvr](interfaces/Nvr.md) singleton projection reads through (its `config` getter and `observe()`), and the record the narrower NVR-derived selectors ([selectControllerName](functions/selectControllerName.md), ...) pull their fields from. Reads straight through the `nvr` singleton field, so the returned reference is structurally-sharing-stable across dispatches that did not touch it - no memoization needed; the observer's `Object.is` dedup yields only when the record actually changes. |

## Transport

| Name | Description |
| ------ | ------ |
| [ProtectResponse](interfaces/ProtectResponse.md) | An HTTP response from the Protect controller, returned by [Transport.send](interfaces/Transport.md#send). The body is eagerly buffered (so no undrained stream can hold a slot in the connection pool), and decoding is synchronous and lazy on top of that buffer. `send` returns this for *any* status; call [ProtectResponse.ensureOk](interfaces/ProtectResponse.md#ensureok) to turn a non-2xx into its typed `FatalError`. |
| [ProtectWebSocket](interfaces/ProtectWebSocket.md) | The minimal *receive-direction* WebSocket surface the library's read-only transports (the events stream and each livestream session) consume - deliberately a small subset of the WHATWG/undici `WebSocket` so the dependency is exactly what they need and a test fake is trivial to implement. The default factories adapt undici's `WebSocket` to this shape (it satisfies the surface structurally, so no cast is required). This lives in one module, not on any one transport, so every consumer shares a single definition and a test fake written against it drives any of them. |
| [RequestOptions](interfaces/RequestOptions.md) | Per-request options accepted by [Transport.request](interfaces/Transport.md#request) and [Transport.send](interfaces/Transport.md#send). The library composes the caller's `signal` with its own timeout deadline, so a caller can cancel independently of the timeout. `headers` here override the auth headers the transport stamps on automatically. |
| [SendOptions](interfaces/SendOptions.md) | The lower-level [Transport.send](interfaces/Transport.md#send) options. Both flags follow the same pattern: a special caller opting out of one default send behavior. |
| [TalkbackSession](interfaces/TalkbackSession.md) | One talkback WebSocket, write-only. Constructed atomically via the static `connect()` (the constructor is private): it negotiates the URL, opens the socket, and resolves to a live session or throws a typed `FatalError` - there is no half-open session. Feed it audio with [TalkbackSession.send](interfaces/TalkbackSession.md#send) and dispose it (or abort its signal) to close. |
| [Transport](interfaces/Transport.md) | The HTTP transport. Owns the undici connection pool, composes each request's deadline with the caller's cancellation, classifies every failure into the typed `ProtectError` hierarchy, and runs the throttle circuit breaker that protects a degraded controller from being hammered. |
| [TransportEvents](interfaces/TransportEvents.md) | The events the [Transport](interfaces/Transport.md) publishes on its three-rail surface. Both are parameterless: a consumer that needs the cooldown duration reads it from the [ProtectThrottledError](classes/ProtectThrottledError.md) thrown by `send`, and a consumer that needs richer detail subscribes to the `unifi-protect:http:throttle:*` diagnostics channels. |
| [LivestreamSource](type-aliases/LivestreamSource.md) | The mutually-exclusive livestream source selector. A livestream is captured EITHER from a quality channel on the primary sensor OR from a secondary lens (which the controller always addresses on channel 0); the two can never be combined. Tag-discriminated (matching [Segment](type-aliases/Segment.md)) so the discriminant is authoritative regardless of how the value is built, and so the illegal "a non-zero channel paired with a lens" request is unrepresentable at the type level rather than silently coerced. |
| [Segment](type-aliases/Segment.md) | One segment of a livestream, in CMAF/DASH vocabulary: either the stream's initialization segment or a media segment. Each arm is a complete, decodable unit. |
| [TalkbackState](type-aliases/TalkbackState.md) | The deterministic lifecycle of a talkback session. The transitions are: construction begins connecting (`connecting`); WebSocket `open` advances to `live` (and the static `connect()`'s promise resolves); an error, the caller's abort, or an explicit `close()` requests a graceful close and moves to `closing`; the socket fully closing and the owned agent being destroyed is `closed`, which a peer-initiated close reaches directly without passing through `closing`. There is no `handshaking` arm - talkback has no init segment. |
