/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * diagnostics.ts: Named node:diagnostics_channel publishers for the UniFi Protect library.
 */
import type { LivestreamInit } from "./protocol/init-segment.ts";
import type { LivestreamSubscriptionStats } from "./client/livestream-pool.ts";
import diagnosticsChannel from "node:diagnostics_channel";

/**
 * A diagnostics publisher bound to the payload shape it carries - the typed view of one `node:diagnostics_channel` channel.
 *
 * The platform's own channel is payload-agnostic: `publish` accepts anything and a subscriber's handler receives `unknown`. Binding the payload type to the channel
 * instead makes the rail typed from end to end - a publisher cannot send the wrong shape, and a subscriber's handler parameter arrives fully typed, with no cast and no
 * runtime narrowing to recover what the library already knows. `subscribe` and `unsubscribe` are the primitive pair beneath {@link subscribeToChannel}, which is how a
 * consumer normally attaches: it returns a `Disposable` and so composes with `using`.
 *
 * A payload-less channel is declared as `ProtectDiagnosticsChannel<void>`: it publishes with no argument and its handlers take none.
 *
 * @category Diagnostics
 */
export interface ProtectDiagnosticsChannel<T> {

  readonly hasSubscribers: boolean;
  readonly name: string | symbol;
  publish(payload: T): void;
  subscribe(handler: (payload: T) => void): void;
  unsubscribe(handler: (payload: T) => void): void;
}

// Bind a channel to the payload it carries. The platform hands back a payload-agnostic channel, so this is the single place in the library that asserts what a given
// channel publishes...every declaration below is created through it, and no other module casts a channel. The assertion is safe because the two sides of it meet in one
// place: the name and the payload type are written together on the same line, and the publish sites are typechecked against that same type.
function typed<T>(name: string): ProtectDiagnosticsChannel<T> {

  return diagnosticsChannel.channel<T>(name) as ProtectDiagnosticsChannel<T>;
}

// Declare a channel whose signal is the transition itself, with nothing to carry: the payload type is `void`, so it publishes with no argument and its handlers take
// none. It is a named companion to `typed` rather than a `typed<void>(...)` call because the payload type belongs in a return position here, where it reads as what the
// channel is - a bare signal - instead of as a type argument that happens to be empty.
function payloadless(name: string): ProtectDiagnosticsChannel<void> {

  return typed(name);
}

/**
 * The library's observability surface, expressed as `node:diagnostics_channel` publishers.
 *
 * Diagnostics channels are part of the public contract - they are named, documented, and versioned alongside the API. A consumer subscribes to any channel to observe the
 * library's internal lifecycle (HTTP requests, throttle transitions, realtime-event flow, livestream session/subscription lifecycle, connection-state transitions)
 * without the library having to grow bespoke logging hooks or callback parameters for each. This is the modern Node observability primitive: zero overhead when nobody is
 * listening (publishers gate on `channel.hasSubscribers` before building a payload), and adaptable to any backend - a consumer can bridge any channel to OpenTelemetry,
 * Pino, a metrics counter, or the `ufp diagnostics` CLI command.
 *
 * Channel names follow a `unifi-protect:<subsystem>:<event>[:<phase>]` taxonomy; the phase segment is present only when the event name doesn't already carry a
 * terminal state of its own. This module declares every channel exactly once; subsystems import the publisher they need from here rather than re-deriving the
 * channel name string, so a rename is a single edit and a typo is impossible at the call site.
 *
 * This module is the single source of truth for the channel set. Each channel is a {@link ProtectDiagnosticsChannel} bound to its payload type, so both directions of
 * the rail are typed - a publish is checked against the payload shape, and a subscriber's handler receives it already narrowed - and the generated reference
 * `docs/variables/channels.md` (via `npm run build-docs`) links each channel to its payload. {@link subscribeToChannel} is the subscription path a consumer reaches for:
 * it returns a `Disposable`, so a handler's lifetime is scoped by `using` rather than tracked by hand. Adding a channel touches the typed, doc-commented entry here, its
 * payload interface below (a payload-less channel declares none), and its row in the `ChannelBindings` table in `diagnostics.test.ts`, without which that suite fails to
 * compile.
 *
 * @category Diagnostics
 */
export const channels = {

  /** A device record asserted that another controller has adopted it while naming this controller as its owner - the two cannot both be true, so the model corrected the
   * record to keep the device adopted here. Published by the StateStore from its dispatch chokepoint on the first edge of each episode per device (a device is one
   * `modelKey:id`), driven by what the wire explicitly asserts: a fresh assertion of the contradiction publishes, and the same device re-asserting it on the next refresh
   * publishes nothing until the controller retracts it (or the device leaves). A G2-generation controller defect surfaces this on 4-hour anchors and holds until a
   * reboot; the signal exists so a consumer sees the anomaly explicitly rather than the model silently absorbing it.
   */
  adoptionContradiction: typed<AdoptionContradictionPayload>("unifi-protect:adoption:contradiction"),

  /** The 401-triggered relogin ran. The only visibility into mid-session session recovery, which is otherwise silent (it has no return value a consumer sees); the
   * payload's `success` reports whether the session was recovered. Connect-time login is deliberately not channelled - the `connect()` result and the `http:request:*`
   * channels already are its single source.
   */
  authRelogin: typed<AuthReloginPayload>("unifi-protect:auth:relogin"),

  /** A controller reboot was detected by comparing the NVR's self-reported boot time (`upSince`) across bootstraps. */
  connectionRebootDetected: typed<ConnectionRebootDetectedPayload>("unifi-protect:connection:rebootDetected"),

  /** The connection-state FSM moved between states. */
  connectionTransition: typed<ConnectionTransitionPayload>("unifi-protect:connection:transition"),

  /** The realtime events WebSocket closed. */
  eventsClosed: typed<EventsClosedPayload>("unifi-protect:events:closed"),

  /** A realtime event packet was classified and dispatched. */
  eventsPacket: typed<EventsPacketPayload>("unifi-protect:events:packet"),

  /** The realtime events WebSocket is reconnecting. */
  eventsReconnecting: typed<EventsReconnectingPayload>("unifi-protect:events:reconnecting"),

  /** An HTTP request ended: it received a response, it failed, or its caller cancelled it. */
  httpRequestEnd: typed<HttpRequestEndPayload>("unifi-protect:http:request:end"),

  /** An HTTP request was dispatched. */
  httpRequestStart: typed<HttpRequestStartPayload>("unifi-protect:http:request:start"),

  /** The transport entered its throttle cooldown after crossing the consecutive-failure threshold. */
  httpThrottleEntered: typed<HttpThrottleEnteredPayload>("unifi-protect:http:throttle:entered"),

  /** The transport left its throttle cooldown and resumed normal operation. A payload-less channel: the transition itself is the whole signal, so it publishes with no
   * argument and its handlers take none.
   */
  httpThrottleExited: payloadless("unifi-protect:http:throttle:exited"),

  /** A pooled livestream reconnected and the controller delivered a different stream than the one in flight, its codec label or its description changed - one of
   * the terminal errors a recovering stream can raise.
   */
  livestreamCodecChanged: typed<LivestreamCodecChangedPayload>("unifi-protect:livestream:codec:changed"),

  /** A pooled livestream's recovery policy gave up. What an opt-in consumer self-heal observer (a user-gated camera reboot) watches; the library reboots nothing. */
  livestreamRecoveryExhausted: typed<LivestreamRecoveryExhaustedPayload>("unifi-protect:livestream:recovery:exhausted"),

  /** A pooled livestream's recovery episode restored the stream after a fault. */
  livestreamRecoveryRecovered: typed<LivestreamRecoveryRecoveredPayload>("unifi-protect:livestream:recovery:recovered"),

  /** A pooled livestream began a recovery episode after a previously-live session faulted. */
  livestreamRecoveryStarted: typed<LivestreamRecoveryStartedPayload>("unifi-protect:livestream:recovery:started"),

  /** The livestream pool tore down the managed session it held for a stream. */
  livestreamSessionClosed: typed<LivestreamSessionClosedPayload>("unifi-protect:livestream:session:closed"),

  /** The livestream pool created a managed session for a stream, shared by every subscriber that joins it. */
  livestreamSessionOpened: typed<LivestreamSessionOpenedPayload>("unifi-protect:livestream:session:opened"),

  /** A livestream session went silent beyond the heartbeat watchdog window. */
  livestreamStallDetected: typed<LivestreamStallDetectedPayload>("unifi-protect:livestream:stall:detected"),

  /** A consumer subscribed to a livestream through the pool. */
  livestreamSubscriptionCreated: typed<LivestreamSubscriptionCreatedPayload>("unifi-protect:livestream:subscription:created"),

  /** A consumer disposed its livestream subscription. */
  livestreamSubscriptionDisposed: typed<LivestreamSubscriptionDisposedPayload>("unifi-protect:livestream:subscription:disposed"),

  /** A realtime packet carried a model key the library does not model. Published by the EventStream caller (not the classifier, which stays pure) on the first
   * occurrence per `(modelKey, action)` per session, so sustained drift does not spam. The signal exists so consumers see schema evolution explicitly rather than
   * silently absorbing it; the library version that adds support for the category closes the gap.
   */
  schemaUnknownModelKey: typed<SchemaUnknownModelKeyPayload>("unifi-protect:schema:unknownModelKey"),

  /** An applied bootstrap carried a populated, device-shaped collection (a `modelKey`+`mac` record array) the reducer does not model. Published by the StateStore from
   * its dispatch chokepoint on the first occurrence per `modelKey` per session - the bootstrap-dimension twin of `schema:unknownModelKey`, which is structurally blind to
   * a quiescent device that lives in the bootstrap but emits no realtime packet. The `known` flag separates a recognized-but-unreduced class (e.g. `aiport`) from genuine
   * drift the controller introduced; either way the signal exists so consumers see device classes the library does not yet project rather than silently absorbing it.
   */
  schemaUnmodeledCollection: typed<SchemaUnmodeledCollectionPayload>("unifi-protect:schema:unmodeledCollection"),

  /** A talkback (two-way audio) session closed and released its WebSocket. */
  talkbackSessionClosed: typed<TalkbackSessionClosedPayload>("unifi-protect:talkback:session:closed"),

  /** A talkback (two-way audio) session opened a WebSocket to a camera's speaker. */
  talkbackSessionOpened: typed<TalkbackSessionOpenedPayload>("unifi-protect:talkback:session:opened")
} as const;

/**
 * The element type of a subscription that spans channels carrying different payloads - the union of every channel in {@link channels}.
 *
 * A generic observer (a feed that renders whatever arrives, a census that counts which channels fired) holds channels of mixed payload types in one array and attaches
 * an `unknown`-taking handler to each; this is that array's element type.
 *
 * Subscribing is the supported direction. Publishing through the union is not: a parameter position combines across a union rather than distributing over it, so
 * `publish` there demands a value satisfying every payload shape at once, which no real payload does. Publish through the concrete channel from {@link channels}.
 *
 * @category Diagnostics
 */
export type AnyProtectDiagnosticsChannel = typeof channels[keyof typeof channels];

/**
 * Attach `handler` to `channel` and return a `Disposable` that detaches it.
 *
 * This is the subscription path for the diagnostics rails, mirroring how every other long-lived subscription in the library is expressed: `using sub =
 * subscribeToChannel(channels.eventsPacket, (payload) => ...)` detaches the handler when the binding leaves scope, so no observer outlives the code that wanted it.
 * Where a `using` declaration does not fit, call `sub[Symbol.dispose]()` explicitly; disposing twice is safe, because the second detach is a no-op.
 *
 * Passing a concrete channel types the handler's payload from that channel, so the handler reads its fields directly. Passing an
 * {@link AnyProtectDiagnosticsChannel} - an element of a mixed-payload array - hands the handler an `unknown` payload instead, which is what a generic observer wants.
 *
 * @param channel - The channel to observe.
 * @param handler - Invoked with the published payload on every publication until the returned handle is disposed.
 *
 * @returns A `Disposable` that detaches this handler when disposed.
 *
 * @category Diagnostics
 */
export function subscribeToChannel<T>(channel: ProtectDiagnosticsChannel<T>, handler: (payload: T) => void): Disposable;
export function subscribeToChannel(channel: AnyProtectDiagnosticsChannel, handler: (payload: unknown) => void): Disposable;
export function subscribeToChannel(channel: ProtectDiagnosticsChannel<unknown>, handler: (payload: unknown) => void): Disposable {

  channel.subscribe(handler);

  return { [Symbol.dispose]: (): void => channel.unsubscribe(handler) };
}

/**
 * Payload published on {@link channels.adoptionContradiction}. `modelKey` and `id` identify the device whose record was self-contradictory; `mac` is the device's own
 * hardware address; `nvrMac` is the owning-controller address the record asserted, which equals this controller's own MAC (that equality is what makes the
 * adopted-by-another claim provably false). The library corrects the record and publishes this once per episode; consumers building dashboards add their own counters.
 *
 * @category Diagnostics
 */
export interface AdoptionContradictionPayload {

  id: string;
  mac: string;
  modelKey: string;
  nvrMac: string;
}

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
 * Payload published on {@link channels.connectionRebootDetected}. The controller's own self-reported boot time (`upSince`) is the underlying wire-level signal; a
 * threshold-based comparison across bootstraps distinguishes a genuine reboot from measurement jitter in that value.
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
 * Payload published on {@link channels.eventsClosed}. When the controller closes the stream unprompted, `code` and `reason` carry the peer's WebSocket close frame. When
 * the stream closes itself, they carry the library's own classification instead: `1000` for a deliberate teardown (an explicit `close()` or the caller's abort) and
 * `1006` for a failure-driven one (a socket error or a watchdog stall), with a reason describing what ended it.
 *
 * @category Diagnostics
 */
export interface EventsClosedPayload {

  code: number;
  reason: string;
}

/**
 * Payload published on {@link channels.eventsPacket}. `kind` is a `TypedEvent` tag; `modelKey` and `id` are present for device-scoped events.
 *
 * @category Diagnostics
 */
export interface EventsPacketPayload {

  id?: string;
  kind: string;
  modelKey?: string;
}

/**
 * Payload published on {@link channels.eventsReconnecting}. `reason` is the message of the fault that dropped the events channel, or a generic description when no
 * fault was recorded.
 *
 * @category Diagnostics
 */
export interface EventsReconnectingPayload {

  reason: string;
}

/**
 * Payload published on {@link channels.httpRequestEnd}. `statusCode` is present when a response was received and read to its end, whatever its status, and `error`
 * otherwise: the request failed at the transport level, before or while its response was read, or its caller cancelled it, which `cancelled` marks.
 *
 * @category Diagnostics
 */
export interface HttpRequestEndPayload {

  /** Present, and `true`, only when the request ended because its caller chose to cancel it, so a consumer tells a cancel from a failure without reading the message. */
  cancelled?: true;
  durationMs: number;
  error?: string;

  /**
   * The controller address this client was built against, verbatim as supplied to `ProtectClient.connect()`. The structured identity that scopes a payload to one
   * controller on the process-global diagnostics channel, mirroring `cameraId` on the livestream payloads.
   */
  host: string;
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

  /**
   * The controller address this client was built against, verbatim as supplied to `ProtectClient.connect()`. The structured identity that scopes a payload to one
   * controller on the process-global diagnostics channel, mirroring `cameraId` on the livestream payloads.
   */
  host: string;
  method: string;
  requestId: string;
  url: string;
}

/**
 * Payload published on {@link channels.httpThrottleEntered}. `consecutiveFailures` is the count of consecutive failed requests that tripped the breaker, and
 * `cooldownMs` is how long, in milliseconds, the transport refuses requests before it lets them through again as recovery probes.
 *
 * @category Diagnostics
 */
export interface HttpThrottleEnteredPayload {

  consecutiveFailures: number;
  cooldownMs: number;
}

/**
 * Payload published on {@link channels.livestreamCodecChanged}. `from` / `to` are the prior and the reconnected inits themselves, each with its codec label, its bytes
 * and its description, the same pair the {@link ProtectCodecChangeError} the consumer's iterator receives carries; this is its observable companion.
 *
 * @category Diagnostics
 */
export interface LivestreamCodecChangedPayload {

  cameraId: string;
  from: LivestreamInit;
  key: string;
  to: LivestreamInit;
}

/**
 * Payload published on {@link channels.livestreamRecoveryExhausted}. `attempts` is the number of consecutive failed reconnect attempts before the policy gave up. The
 * consumer's iterator also receives a {@link ProtectLivestreamUnavailableError}; this channel is what an opt-in self-heal observer watches.
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
 * Payload published on {@link channels.livestreamRecoveryStarted}. `attempts` is 0 at the start of an episode; `sinceLastSegmentMs` is the time since the last segment of
 * any kind, init segments included, when the fault was observed. It is not a measure of media downtime: an episode started by the media-stall watchdog can report a
 * small value while media has been absent for the whole detection threshold, because non-media frames kept arriving.
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
 * Payload published on {@link channels.livestreamSessionClosed}. `reason` is a short description of what ended the stream, such as its last subscriber leaving, a codec
 * change, or the recovery policy giving up.
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
 * Payload published on {@link channels.livestreamStallDetected}. `lastSegmentAt` is when the pool last saw a segment of any kind, read from the injected `Clock`, so it
 * is epoch milliseconds only under the production clock. `silentForMs` is how long, in milliseconds, the session's heartbeat watchdog found the channel silent when it
 * declared the stall.
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
 * Payload published on {@link channels.livestreamSubscriptionDisposed}. `stats` carries the subscription's final delivery counters, including any segments discarded on
 * disposal.
 *
 * @category Diagnostics
 */
export interface LivestreamSubscriptionDisposedPayload {

  key: string;
  stats: LivestreamSubscriptionStats;
  subscriptionId: string;
}

/**
 * Payload published on {@link channels.schemaUnknownModelKey}. `action` and `exampleId` are the identifying fields from the offending packet's header so a consumer
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
