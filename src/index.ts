/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * index.ts: The public surface of the UniFi Protect library.
 */

// This file is the consumer contract, and the contract is Layer 3. The surface is curated by one rule, expressed in the type system so it cannot drift:
//
//   - `export` a value only for what a consumer constructs, calls as a free function, or tests `instanceof` against: ProtectClient (its static connect()), the error
//     hierarchy, the selectors, the diagnostics channels, the default logger/clock, and the timing constants.
//   - `export type` only for what a consumer receives but never builds: the device projections, the getter-return classes (StateStore / ConnectionMonitor / Transport /
//     ProtectResponse / LivestreamSubscription), and every event, state, option, and domain type reachable from a public signature. Exporting these as types makes a
//     second composition path unrepresentable - there is exactly one way to build a client, ProtectClient.connect() - so the single-source-of-truth rule is enforced by
//     the compiler rather than by documentation.
//   - Export nothing that is pure composition internals: AuthSession, EventStream, EventBus, LivestreamSession, LivestreamPool, DeviceRegistry, the free codec/reducer
//     functions, and the internal seams and helpers. They are reachable in source for the reader, never on the published surface.
//
// The test the next contributor applies to any new symbol: does a consumer construct or call it (value), receive it (type), or neither (internal)? That keeps this file
// a deliberate, reviewable contract rather than whatever each module happens to export.

// Errors - the typed hierarchy. Consumers branch on these with `instanceof`, so they are value exports; the bootstrap-stage discriminant is a type.
export { FatalError, ProtectAbortedError, ProtectAuthError, ProtectAuthorizationError, ProtectBootstrapError, ProtectCodecChangeError, ProtectError,
  ProtectLivestreamUnavailableError, ProtectNetworkError, ProtectProtocolError, ProtectRequestError, ProtectStallError, ProtectThrottledError, ProtectTimeoutError,
  ProtectUnsupportedError, RecoverableError } from "./errors.ts";
export type { ProtectBootstrapStage } from "./errors.ts";

// Logging - the consumer-injectable logger interface and the silent default a consumer may pass to suppress output.
export { noopLog } from "./logging.ts";
export type { ProtectLogging } from "./logging.ts";

// Event bus - only the options type appears in a public signature (`stream(event, opts)`); the EventBus facade itself is internal machinery.
export type { StreamOptions } from "./event-bus.ts";

// Transport - the documented `client.transport` escape hatch. Its instance type and the types in its method signatures are public; the class is never constructed by a
// consumer (ProtectClient.connect() builds it), so it is a type-only export.
export type { ProtectResponse, RequestOptions, SendOptions, Transport, TransportEvents } from "./transport/http.ts";

// The minimal WebSocket surface a consumer must return when injecting the optional `webSocket` factory seam via ConnectOptions; reachable from the public surface, so it
// is named here even though the default undici-backed factory means most consumers never touch it.
export type { ProtectWebSocket } from "./transport/ws.ts";

// Clock - the time abstraction (a ConnectOptions seam) and its production implementation a consumer may reuse.
export { wallClock } from "./clock.ts";
export type { Clock } from "./clock.ts";

// Protocol - the realtime event taxonomy a consumer reads off the firehose. The pure codec/classifier/reducer functions stay internal; the static `ProtectClient`
// .decodePacket() / .classifyPacket() methods are the consumer-facing codec entries (the offline counterpart of the rawPackets()/events() rails), so a second
// free-function path would be the divergence the architecture forbids. `RawPacket` / `ProtectEventHeader` are the element type of the raw firehose
// (`client.rawPackets()`) and the input/output of those codec statics: the decoded-but-unclassified frame, header plus payload, including ones the classifier drops.
export type { ProtectEventHeader, RawPacket } from "./protocol/packet.ts";
export type { LivestreamSource, Segment } from "./transport/livestream-session.ts";
export type { AuthMethod, SmartDetectType, StateModelKey, TypedEvent } from "./protocol/events.ts";
// Talkback - the send-direction two-way-audio session a consumer receives from `camera.talkback()` and its lifecycle-state type. Type-only: a consumer never constructs
// one (the camera factory does), drives it through `send`/`close`/dispose, and reads `state`.
export type { TalkbackSession, TalkbackState } from "./transport/talkback-session.ts";
export type { ProtectState } from "./protocol/reducer.ts";

// State - the observable store a consumer receives from `client.state`, and the memoized selectors a consumer passes to `observe` (or calls directly). The
// `selectAdopted<Category>Ids` selectors are the content-memoized membership sets: they change reference only when a device is adopted or removed, so a consumer can
// `observe` one to drive accessory add/remove without waking on routine config churn.
export { isDeviceAdopted, isDeviceOnline, selectAdoptedCameraIds, selectAdoptedChimeIds, selectAdoptedFobIds, selectAdoptedLightIds, selectAdoptedRelayIds,
  selectAdoptedSensorIds, selectAdoptedViewerIds, selectAuthUser, selectCamera, selectCameras, selectChime, selectChimes, selectControllerName, selectFob, selectFobs,
  selectIsAdmin, selectLight, selectLights, selectLiveview, selectLiveviews, selectNvr, selectOnlineCameras, selectOnlineChimes, selectOnlineFobs, selectOnlineLights,
  selectOnlineRelays, selectOnlineSensors, selectOnlineViewers, selectRelay, selectRelays, selectRingtone, selectRingtones, selectSensor, selectSensors, selectViewer,
  selectViewers } from "./state/selectors.ts";
export type { StateStore } from "./state/store.ts";

// Devices - the projections a consumer receives from `client.cameras` / `client.camera(id)`. They are type-only: a consumer never constructs one (the registry does) and
// narrows a handle by its `modelKey` discriminant rather than `instanceof`, which is the discriminated-union idiom the design is built on.
export type { Camera, LivestreamOptions, SnapshotOptions } from "./devices/camera.ts";
export type { Chime, PlaySpeakerOptions } from "./devices/chime.ts";
export type { DeviceProjection, Projection, ProtectDeviceConfig } from "./devices/device.ts";
export type { Fob } from "./devices/fob.ts";
export type { Light } from "./devices/light.ts";
export type { Nvr } from "./devices/nvr.ts";
export type { Relay } from "./devices/relay.ts";
export type { Sensor } from "./devices/sensor.ts";
export type { Viewer } from "./devices/viewer.ts";

// Client - the one entry point. ProtectClient is a value export for its static `connect()` factory and `instanceof`; everything reachable through its getters
// (ConnectionMonitor, LivestreamSubscription) and its method signatures is a type.
export { ProtectClient } from "./client/client.ts";
export type { ConnectOptions, ProtectClientEvents } from "./client/client.ts";
export type { ConnectionEvents, ConnectionMonitor, ConnectionState, ConnectionTransition } from "./client/connection.ts";
// Livestream pool - the subscription handle a consumer receives (a type), the recovery-policy contract a consumer's injected `recoveryPolicy` is written against (types),
// and the library's default policy a consumer may delegate to when composing its own (a value).
export { defaultLivestreamRecoveryPolicy } from "./client/livestream-pool.ts";
export type { LivestreamSubscribeOptions, LivestreamSubscription, LivestreamSubscriptionState, LivestreamSubscriptionStats, RecoveryContext, RecoveryDecision,
  RecoveryPolicy } from "./client/livestream-pool.ts";

// Diagnostics - the named observability channels (subscribed by a consumer) and their payload shapes. Part of the public contract.
export { channels } from "./diagnostics.ts";
export type { AdoptionContradictionPayload, AuthReloginPayload, ConnectionRebootDetectedPayload, ConnectionTransitionPayload, EventsClosedPayload, EventsPacketPayload,
  EventsReconnectingPayload,
  HttpRequestEndPayload, HttpRequestStartPayload, HttpThrottleEnteredPayload, LivestreamCodecChangedPayload, LivestreamRecoveryExhaustedPayload,
  LivestreamRecoveryRecoveredPayload, LivestreamRecoveryStartedPayload, LivestreamSessionClosedPayload, LivestreamSessionOpenedPayload,
  LivestreamStallDetectedPayload, LivestreamSubscriptionCreatedPayload, LivestreamSubscriptionDisposedPayload,
  SchemaUnknownModelKeyPayload, SchemaUnmodeledCollectionPayload, TalkbackSessionClosedPayload, TalkbackSessionOpenedPayload } from "./diagnostics.ts";

// Settings - the externally observable timing and retry constants behind the ConnectOptions defaults, exposed as documented reference values.
export { PROTECT_API_ERROR_LIMIT, PROTECT_API_RETRY_INTERVAL, PROTECT_API_TIMEOUT, PROTECT_BOOTSTRAP_REFRESH_INTERVAL, PROTECT_EVENTS_WATCHDOG_TIMEOUT,
  PROTECT_LIVESTREAM_AWAIT_MARGIN_MS, PROTECT_LIVESTREAM_AWAIT_MAX_MS, PROTECT_LIVESTREAM_AWAIT_MIN_MS, PROTECT_LIVESTREAM_DEFAULT_TOLERANCE_MS,
  PROTECT_LIVESTREAM_ESTABLISH_BACKOFF_MS, PROTECT_LIVESTREAM_ESTABLISH_DEADLINE_MS, PROTECT_LIVESTREAM_HEARTBEAT_TIMEOUT, PROTECT_LIVESTREAM_RECOVERY_BACKOFF_MS,
  PROTECT_REBOOT_ANTICIPATION_WINDOW_MS,
  PROTECT_REBOOT_DETECTION_THRESHOLD, PROTECT_RECOVERY_BACKOFF_KNOWN_MS, PROTECT_RECOVERY_BACKOFF_UNKNOWN_MS, PROTECT_RECOVERY_STEADY_INTERVAL_MS } from "./settings.ts";

// Domain types - the Protect wire/configuration shapes. Every export here is intentionally public; consumers type their controller interactions against these.
export type { DeepPartial, Nullable, ProtectAirQualityMetric, ProtectAirQualityMetricInterface, ProtectAirQualityThresholdSettings,
  ProtectAirQualityThresholdSettingsInterface, ProtectBridgeCandidate, ProtectCameraChannelConfig, ProtectCameraChannelConfigInterface, ProtectCameraConfig,
  ProtectCameraConfigInterface, ProtectCameraLcdMessageConfig, ProtectCameraLcdMessageConfigInterface, ProtectCameraRecordingPathSettings,
  ProtectCameraRecordingPathSettingsInterface, ProtectCameraTalkbackConfig, ProtectCameraTalkbackConfigInterface, ProtectChimeConfig, ProtectChimeConfigInterface,
  ProtectDeviceBase, ProtectDeviceBaseInterface, ProtectEventAdd,
  ProtectEventAddInterface, ProtectEventMetadata, ProtectEventMetadataDetectedThumbnail, ProtectEventMetadataDetectedThumbnailInterface,
  ProtectEventMetadataInterface, ProtectFobConfig, ProtectFobConfigInterface, ProtectKnownDevice, ProtectKnownJsonValue, ProtectLightConfig,
  ProtectLightConfigInterface, ProtectNvrAgreement,
  ProtectNvrAgreementInterface, ProtectNvrAiFeatureToggle, ProtectNvrAiFeatureToggleInterface, ProtectNvrBootstrap, ProtectNvrBootstrapInterface, ProtectNvrConfig,
  ProtectNvrConfigInterface, ProtectNvrLiveviewConfig, ProtectNvrLiveviewConfigInterface, ProtectNvrSystemEvent,
  ProtectNvrSystemEventController, ProtectNvrSystemEventControllerInterface, ProtectNvrSystemEventInterface, ProtectNvrSystemInfo, ProtectNvrSystemInfoInterface,
  ProtectNvrUserConfig, ProtectNvrUserConfigInterface, ProtectPtzAxisRange, ProtectPtzAxisRangeInterface, ProtectRelayConfig, ProtectRelayConfigInterface,
  ProtectRelayInputConfigInterface, ProtectRelayOutputConfigInterface, ProtectRingtoneConfig, ProtectRingtoneConfigInterface, ProtectSensorAirQuality,
  ProtectSensorAirQualityInterface, ProtectSensorAirQualitySettings, ProtectSensorAirQualitySettingsInterface, ProtectSensorConfig, ProtectSensorConfigInterface,
  ProtectSensorSensitivitySettings, ProtectSensorSensitivitySettingsInterface, ProtectSensorSmokeStatus, ProtectSensorSmokeStatusInterface, ProtectSmartZone,
  ProtectSmartZoneInterface, ProtectStateRecord, ProtectThresholdSettings, ProtectThresholdSettingsInterface,
  ProtectViewerConfig, ProtectViewerConfigInterface, ProtectWifiConnectionState, ProtectWifiConnectionStateInterface, ProtectWiredConnectionState,
  ProtectWiredConnectionStateInterface, ProtectWirelessConnectionSettings, ProtectWirelessConnectionSettingsInterface, ProtectWirelessConnectionState,
  ProtectWirelessConnectionStateInterface } from "./types/index.ts";
