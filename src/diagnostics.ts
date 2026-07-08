/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * diagnostics.ts: Named node:diagnostics_channel publishers for the UniFi Protect library.
 */
import diagnosticsChannel from "node:diagnostics_channel";

/**
 * The library's observability surface, expressed as `node:diagnostics_channel` publishers.
 *
 * Diagnostics channels are part of the public contract - they are named, documented, and versioned alongside the API. A consumer subscribes to any channel to observe the
 * library's internal lifecycle (HTTP requests, throttle transitions, realtime-event flow, livestream session/subscription lifecycle, connection-state transitions)
 * without the library having to grow bespoke logging hooks or callback parameters for each. This is the modern Node observability primitive: zero overhead when nobody is
 * listening (publishers gate on `channel.hasSubscribers` before building a payload), and adaptable to any backend - a consumer can bridge any channel to OpenTelemetry,
 * Pino, a metrics counter, or the `ufp diagnostics` CLI command.
 *
 * Channel names follow a stable `unifi-protect:<subsystem>:<event>:<phase>` taxonomy. This module declares every channel exactly once; subsystems import the publisher
 * they need from here rather than re-deriving the channel name string, so a rename is a single edit and a typo is impossible at the call site.
 *
 * This module is the single source of truth for the channel set. Each channel is declared with its payload type, so a consumer's `subscribe` handler is typed and the
 * generated reference `docs/variables/channels.md` (via `npm run build-docs`) links each channel to its payload. Adding a channel touches both: the typed, doc-commented
 * entry here and its payload interface below.
 *
 * @category Diagnostics
 */
export const channels = {

  /** The 401-triggered relogin ran. The only visibility into mid-session session recovery, which is otherwise silent (it has no return value a consumer sees); the
   * payload's `success` reports whether the session was recovered. Connect-time login is deliberately not channelled - the `connect()` result and the `http:request:*`
   * channels already are its single source.
   */
  authRelogin: diagnosticsChannel.channel<AuthReloginPayload>("unifi-protect:auth:relogin"),

  /** A controller reboot was detected by comparing the NVR's self-reported boot time (`upSince`) across bootstraps. */
  connectionRebootDetected: diagnosticsChannel.channel<ConnectionRebootDetectedPayload>("unifi-protect:connection:rebootDetected"),

  /** The connection-state FSM moved between states. */
  connectionTransition: diagnosticsChannel.channel<ConnectionTransitionPayload>("unifi-protect:connection:transition"),

  /** The realtime events WebSocket closed. */
  eventsClosed: diagnosticsChannel.channel<EventsClosedPayload>("unifi-protect:events:closed"),

  /** A realtime event packet was classified and dispatched. */
  eventsPacket: diagnosticsChannel.channel<EventsPacketPayload>("unifi-protect:events:packet"),

  /** The realtime events WebSocket is reconnecting. */
  eventsReconnecting: diagnosticsChannel.channel<EventsReconnectingPayload>("unifi-protect:events:reconnecting"),

  /** An HTTP request completed (success or failure). */
  httpRequestEnd: diagnosticsChannel.channel<HttpRequestEndPayload>("unifi-protect:http:request:end"),

  /** An HTTP request was dispatched. */
  httpRequestStart: diagnosticsChannel.channel<HttpRequestStartPayload>("unifi-protect:http:request:start"),

  /** The transport entered its throttle cooldown after crossing the consecutive-failure threshold. */
  httpThrottleEntered: diagnosticsChannel.channel<HttpThrottleEnteredPayload>("unifi-protect:http:throttle:entered"),

  /** The transport left its throttle cooldown and resumed normal operation. */
  httpThrottleExited: diagnosticsChannel.channel<Record<string, never>>("unifi-protect:http:throttle:exited"),

  /** A pooled livestream reconnected and the controller negotiated a different codec than the one in flight - the one terminal a recovering stream raises. */
  livestreamCodecChanged: diagnosticsChannel.channel<LivestreamCodecChangedPayload>("unifi-protect:livestream:codec:changed"),

  /** A pooled livestream's recovery policy gave up. The seam an opt-in consumer self-heal observer (a user-gated camera reboot) watches; the library reboots nothing. */
  livestreamRecoveryExhausted: diagnosticsChannel.channel<LivestreamRecoveryExhaustedPayload>("unifi-protect:livestream:recovery:exhausted"),

  /** A pooled livestream's recovery episode restored the stream after a fault. */
  livestreamRecoveryRecovered: diagnosticsChannel.channel<LivestreamRecoveryRecoveredPayload>("unifi-protect:livestream:recovery:recovered"),

  /** A pooled livestream began a recovery episode after a previously-live session faulted. */
  livestreamRecoveryStarted: diagnosticsChannel.channel<LivestreamRecoveryStartedPayload>("unifi-protect:livestream:recovery:started"),

  /** A pooled livestream session closed and released its underlying WebSocket. */
  livestreamSessionClosed: diagnosticsChannel.channel<LivestreamSessionClosedPayload>("unifi-protect:livestream:session:closed"),

  /** A pooled livestream session opened a new underlying WebSocket. */
  livestreamSessionOpened: diagnosticsChannel.channel<LivestreamSessionOpenedPayload>("unifi-protect:livestream:session:opened"),

  /** A livestream session went silent beyond the heartbeat watchdog window. */
  livestreamStallDetected: diagnosticsChannel.channel<LivestreamStallDetectedPayload>("unifi-protect:livestream:stall:detected"),

  /** A consumer subscribed to a pooled livestream session. */
  livestreamSubscriptionCreated: diagnosticsChannel.channel<LivestreamSubscriptionCreatedPayload>("unifi-protect:livestream:subscription:created"),

  /** A consumer disposed its livestream subscription. */
  livestreamSubscriptionDisposed: diagnosticsChannel.channel<LivestreamSubscriptionDisposedPayload>("unifi-protect:livestream:subscription:disposed"),

  /** A realtime packet carried a model key the library does not model. Published by the EventStream caller (not the classifier, which stays pure) on the first
   * occurrence per `(modelKey, action)` per session, so sustained drift does not spam. The signal exists so consumers see schema evolution explicitly rather than
   * silently absorbing it; the library version that adds support for the category closes the gap.
   */
  schemaUnknownModelKey: diagnosticsChannel.channel<SchemaUnknownModelKeyPayload>("unifi-protect:schema:unknownModelKey"),

  /** An applied bootstrap carried a populated, device-shaped collection (a `modelKey`+`mac` record array) the reducer does not model. Published by the StateStore from
   * its dispatch chokepoint on the first occurrence per `modelKey` per session - the bootstrap-dimension twin of `schema:unknownModelKey`, which is structurally blind to
   * a quiescent device that lives in the bootstrap but emits no realtime packet. The `known` flag separates a recognized-but-unreduced class (e.g. `aiport`) from genuine
   * drift the controller introduced; either way the signal exists so consumers see device classes the library does not yet project rather than silently absorbing it.
   */
  schemaUnmodeledCollection: diagnosticsChannel.channel<SchemaUnmodeledCollectionPayload>("unifi-protect:schema:unmodeledCollection"),

  /** A talkback (two-way audio) session closed and released its WebSocket. */
  talkbackSessionClosed: diagnosticsChannel.channel<TalkbackSessionClosedPayload>("unifi-protect:talkback:session:closed"),

  /** A talkback (two-way audio) session opened a WebSocket to a camera's speaker. */
  talkbackSessionOpened: diagnosticsChannel.channel<TalkbackSessionOpenedPayload>("unifi-protect:talkback:session:opened")
} as const;

/**
 * Payload published on {@link channels.authRelogin}. `success` is `true` when the relogin re-established the session, `false` when it could not (no retained credentials,
 * or the handshake failed).
 *
 * @category Diagnostics
 */
export interface AuthReloginPayload {

  success: boolean;
}

/**
 * Payload published on {@link channels.connectionRebootDetected}. The controller's own self-reported boot times are the wire-level reboot signal; no heuristics are
 * involved.
 *
 * @category Diagnostics
 */
export interface ConnectionRebootDetectedPayload {

  newUpSince: number;
  previousUpSince: number;
}

/**
 * Payload published on {@link channels.connectionTransition}. `reason` is present when a specific cause (a typed error, a watchdog trip) drove the transition.
 *
 * @category Diagnostics
 */
export interface ConnectionTransitionPayload {

  from: string;
  reason?: string;
  to: string;
}

/**
 * Payload published on {@link channels.eventsClosed}. Mirrors the WebSocket close frame.
 *
 * @category Diagnostics
 */
export interface EventsClosedPayload {

  code: number;
  reason: string;
}

/**
 * Payload published on {@link channels.eventsPacket}. `kind` is a `TypedEvent` discriminant; `modelKey` and `id` are present for device-scoped events.
 *
 * @category Diagnostics
 */
export interface EventsPacketPayload {

  id?: string;
  kind: string;
  modelKey?: string;
}

/**
 * Payload published on {@link channels.eventsReconnecting}.
 *
 * @category Diagnostics
 */
export interface EventsReconnectingPayload {

  reason: string;
}

/**
 * Payload published on {@link channels.httpRequestEnd}. `error` is present only when the request failed; `statusCode` is absent when the failure was transport-level (no
 * response was received).
 *
 * @category Diagnostics
 */
export interface HttpRequestEndPayload {

  durationMs: number;
  error?: string;
  method: string;
  requestId: string;
  statusCode?: number;
  url: string;
}

/**
 * Payload published on {@link channels.httpRequestStart}. `requestId` correlates the start with its matching {@link HttpRequestEndPayload}.
 *
 * @category Diagnostics
 */
export interface HttpRequestStartPayload {

  method: string;
  requestId: string;
  url: string;
}

/**
 * Payload published on {@link channels.httpThrottleEntered}.
 *
 * @category Diagnostics
 */
export interface HttpThrottleEnteredPayload {

  consecutiveFailures: number;
  cooldownMs: number;
}

/**
 * Payload published on {@link channels.livestreamCodecChanged}. `from` / `to` are the RFC 6381 codec descriptors of the prior and reconnected init segments. The
 * consumer's iterator also receives a {@link ProtectCodecChangeError}; this is its observable companion.
 *
 * @category Diagnostics
 */
export interface LivestreamCodecChangedPayload {

  cameraId: string;
  from: string;
  key: string;
  to: string;
}

/**
 * Payload published on {@link channels.livestreamRecoveryExhausted}. `attempts` is the number of consecutive failed reconnect attempts before the policy gave up. The
 * consumer's iterator also receives a {@link ProtectLivestreamUnavailableError}; this channel is the seam an opt-in self-heal observer watches.
 *
 * @category Diagnostics
 */
export interface LivestreamRecoveryExhaustedPayload {

  attempts: number;
  cameraId: string;
  key: string;
}

/**
 * Payload published on {@link channels.livestreamRecoveryRecovered}. `downtimeMs` is the elapsed time from the fault that began the episode to the first MEDIA segment
 * that restored the stream - liveness is media-keyed, so this measures how long media was actually absent, not how long until the controller re-acked with an init.
 *
 * @category Diagnostics
 */
export interface LivestreamRecoveryRecoveredPayload {

  cameraId: string;
  downtimeMs: number;
  key: string;
}

/**
 * Payload published on {@link channels.livestreamRecoveryStarted}. `attempts` is 0 at the start of an episode; `sinceLastSegmentMs` is how long the stream had been
 * silent when the fault was observed.
 *
 * @category Diagnostics
 */
export interface LivestreamRecoveryStartedPayload {

  attempts: number;
  cameraId: string;
  key: string;
  sinceLastSegmentMs: number;
}

/**
 * Payload published on {@link channels.livestreamSessionClosed}.
 *
 * @category Diagnostics
 */
export interface LivestreamSessionClosedPayload {

  cameraId: string;
  key: string;
  reason: string;
}

/**
 * Payload published on {@link channels.livestreamSessionOpened}. `key` is the pool's stream-affecting sharing key
 * `${cameraId}:${channel}:${lens}:${segmentLength}:${chunkSize}:${timestamps}` (the resolved stream-affecting identity).
 *
 * @category Diagnostics
 */
export interface LivestreamSessionOpenedPayload {

  cameraId: string;
  channel: number;
  key: string;
  lens?: number;
}

/**
 * Payload published on {@link channels.livestreamStallDetected}.
 *
 * @category Diagnostics
 */
export interface LivestreamStallDetectedPayload {

  cameraId: string;
  key: string;
  lastSegmentAt: number;
  silentForMs: number;
}

/**
 * Payload published on {@link channels.livestreamSubscriptionCreated}.
 *
 * @category Diagnostics
 */
export interface LivestreamSubscriptionCreatedPayload {

  key: string;
  subscriptionId: string;
}

/**
 * Payload published on {@link channels.livestreamSubscriptionDisposed}. `stats` carries the subscription's final delivery counters.
 *
 * @category Diagnostics
 */
export interface LivestreamSubscriptionDisposedPayload {

  key: string;
  stats: { delivered: number; lastSegmentAt: number; peakQueueDepth: number; queueDepth: number };
  subscriptionId: string;
}

/**
 * Payload published on {@link channels.schemaUnknownModelKey}. `action` and `exampleId` are the discriminating fields from the offending packet's header so a consumer
 * can correlate the drift signal with concrete wire activity (e.g., "modelKey 'garage' first seen at action 'add' with id <uuid>"). The library does not accumulate or
 * aggregate beyond the first-occurrence dedup; consumers building dashboards add their own counters from this channel.
 *
 * @category Diagnostics
 */
export interface SchemaUnknownModelKeyPayload {

  action: string;
  exampleId: string;
  modelKey: string;
}

/**
 * Payload published on {@link channels.schemaUnmodeledCollection}. `collection` is the bootstrap array key (e.g. `"aiports"`), `modelKey` is the record's self-declared
 * type (e.g. `"aiport"`), `count` is the array length, and `exampleId` is the first record's id - enough to correlate the signal with the bootstrap shape. `known`
 * distinguishes a recognized-but-unreduced class (a model key the library knows about but does not project, `true`) from genuine schema drift the controller introduced
 * (`false`). The library does not aggregate beyond the first-occurrence-per-`modelKey` dedup; consumers building dashboards add their own counters from this channel.
 *
 * @category Diagnostics
 */
export interface SchemaUnmodeledCollectionPayload {

  collection: string;
  count: number;
  exampleId: string;
  known: boolean;
  modelKey: string;
}

/**
 * Payload published on {@link channels.talkbackSessionClosed}. `reason` mirrors the WebSocket close frame's reason (or the teardown cause when the session closed
 * itself).
 *
 * @category Diagnostics
 */
export interface TalkbackSessionClosedPayload {

  cameraId: string;
  reason: string;
}

/**
 * Payload published on {@link channels.talkbackSessionOpened}. `cameraId` is the camera whose speaker the session connected to.
 *
 * @category Diagnostics
 */
export interface TalkbackSessionOpenedPayload {

  cameraId: string;
}
