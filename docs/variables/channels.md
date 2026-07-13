[**unifi-protect**](../README.md)

***

[Home](../README.md) / channels

# Variable: channels

```ts
const channels: {
  adoptionContradiction: Channel<AdoptionContradictionPayload, AdoptionContradictionPayload>;
  authRelogin: Channel<AuthReloginPayload, AuthReloginPayload>;
  connectionRebootDetected: Channel<ConnectionRebootDetectedPayload, ConnectionRebootDetectedPayload>;
  connectionTransition: Channel<ConnectionTransitionPayload, ConnectionTransitionPayload>;
  eventsClosed: Channel<EventsClosedPayload, EventsClosedPayload>;
  eventsPacket: Channel<EventsPacketPayload, EventsPacketPayload>;
  eventsReconnecting: Channel<EventsReconnectingPayload, EventsReconnectingPayload>;
  httpRequestEnd: Channel<HttpRequestEndPayload, HttpRequestEndPayload>;
  httpRequestStart: Channel<HttpRequestStartPayload, HttpRequestStartPayload>;
  httpThrottleEntered: Channel<HttpThrottleEnteredPayload, HttpThrottleEnteredPayload>;
  httpThrottleExited: Channel<Record<string, never>, Record<string, never>>;
  livestreamCodecChanged: Channel<LivestreamCodecChangedPayload, LivestreamCodecChangedPayload>;
  livestreamRecoveryExhausted: Channel<LivestreamRecoveryExhaustedPayload, LivestreamRecoveryExhaustedPayload>;
  livestreamRecoveryRecovered: Channel<LivestreamRecoveryRecoveredPayload, LivestreamRecoveryRecoveredPayload>;
  livestreamRecoveryStarted: Channel<LivestreamRecoveryStartedPayload, LivestreamRecoveryStartedPayload>;
  livestreamSessionClosed: Channel<LivestreamSessionClosedPayload, LivestreamSessionClosedPayload>;
  livestreamSessionOpened: Channel<LivestreamSessionOpenedPayload, LivestreamSessionOpenedPayload>;
  livestreamStallDetected: Channel<LivestreamStallDetectedPayload, LivestreamStallDetectedPayload>;
  livestreamSubscriptionCreated: Channel<LivestreamSubscriptionCreatedPayload, LivestreamSubscriptionCreatedPayload>;
  livestreamSubscriptionDisposed: Channel<LivestreamSubscriptionDisposedPayload, LivestreamSubscriptionDisposedPayload>;
  schemaUnknownModelKey: Channel<SchemaUnknownModelKeyPayload, SchemaUnknownModelKeyPayload>;
  schemaUnmodeledCollection: Channel<SchemaUnmodeledCollectionPayload, SchemaUnmodeledCollectionPayload>;
  talkbackSessionClosed: Channel<TalkbackSessionClosedPayload, TalkbackSessionClosedPayload>;
  talkbackSessionOpened: Channel<TalkbackSessionOpenedPayload, TalkbackSessionOpenedPayload>;
};
```

The library's observability surface, expressed as `node:diagnostics_channel` publishers.

Diagnostics channels are part of the public contract - they are named, documented, and versioned alongside the API. A consumer subscribes to any channel to observe the
library's internal lifecycle (HTTP requests, throttle transitions, realtime-event flow, livestream session/subscription lifecycle, connection-state transitions)
without the library having to grow bespoke logging hooks or callback parameters for each. This is the modern Node observability primitive: zero overhead when nobody is
listening (publishers gate on `channel.hasSubscribers` before building a payload), and adaptable to any backend - a consumer can bridge any channel to OpenTelemetry,
Pino, a metrics counter, or the `ufp diagnostics` CLI command.

Channel names follow a stable `unifi-protect:<subsystem>:<event>:<phase>` taxonomy. This module declares every channel exactly once; subsystems import the publisher
they need from here rather than re-deriving the channel name string, so a rename is a single edit and a typo is impossible at the call site.

This module is the single source of truth for the channel set. Each channel is declared with its payload type, so a consumer's `subscribe` handler is typed and the
generated reference `docs/variables/channels.md` (via `npm run build-docs`) links each channel to its payload. Adding a channel touches both: the typed, doc-commented
entry here and its payload interface below.

## Type Declaration

| Name | Type | Description |
| ------ | ------ | ------ |
| <a id="property-adoptioncontradiction"></a> `adoptionContradiction` | `Channel`\<[`AdoptionContradictionPayload`](../interfaces/AdoptionContradictionPayload.md), [`AdoptionContradictionPayload`](../interfaces/AdoptionContradictionPayload.md)\> | A device record asserted that another controller has adopted it while naming this controller as its owner - the two cannot both be true, so the model corrected the record to keep the device adopted here. Published by the StateStore from its dispatch chokepoint on the first edge of each episode per device (a device is one `modelKey:id`), driven by what the wire explicitly asserts: a fresh assertion of the contradiction publishes, and the same device re-asserting it on the next refresh publishes nothing until the controller retracts it (or the device leaves). A G2-generation controller defect surfaces this on 4-hour anchors and holds until a reboot; the signal exists so a consumer sees the anomaly explicitly rather than the model silently absorbing it. |
| <a id="property-authrelogin"></a> `authRelogin` | `Channel`\<[`AuthReloginPayload`](../interfaces/AuthReloginPayload.md), [`AuthReloginPayload`](../interfaces/AuthReloginPayload.md)\> | The 401-triggered relogin ran. The only visibility into mid-session session recovery, which is otherwise silent (it has no return value a consumer sees); the payload's `success` reports whether the session was recovered. Connect-time login is deliberately not channelled - the `connect()` result and the `http:request:*` channels already are its single source. |
| <a id="property-connectionrebootdetected"></a> `connectionRebootDetected` | `Channel`\<[`ConnectionRebootDetectedPayload`](../interfaces/ConnectionRebootDetectedPayload.md), [`ConnectionRebootDetectedPayload`](../interfaces/ConnectionRebootDetectedPayload.md)\> | A controller reboot was detected by comparing the NVR's self-reported boot time (`upSince`) across bootstraps. |
| <a id="property-connectiontransition"></a> `connectionTransition` | `Channel`\<[`ConnectionTransitionPayload`](../interfaces/ConnectionTransitionPayload.md), [`ConnectionTransitionPayload`](../interfaces/ConnectionTransitionPayload.md)\> | The connection-state FSM moved between states. |
| <a id="property-eventsclosed"></a> `eventsClosed` | `Channel`\<[`EventsClosedPayload`](../interfaces/EventsClosedPayload.md), [`EventsClosedPayload`](../interfaces/EventsClosedPayload.md)\> | The realtime events WebSocket closed. |
| <a id="property-eventspacket"></a> `eventsPacket` | `Channel`\<[`EventsPacketPayload`](../interfaces/EventsPacketPayload.md), [`EventsPacketPayload`](../interfaces/EventsPacketPayload.md)\> | A realtime event packet was classified and dispatched. |
| <a id="property-eventsreconnecting"></a> `eventsReconnecting` | `Channel`\<[`EventsReconnectingPayload`](../interfaces/EventsReconnectingPayload.md), [`EventsReconnectingPayload`](../interfaces/EventsReconnectingPayload.md)\> | The realtime events WebSocket is reconnecting. |
| <a id="property-httprequestend"></a> `httpRequestEnd` | `Channel`\<[`HttpRequestEndPayload`](../interfaces/HttpRequestEndPayload.md), [`HttpRequestEndPayload`](../interfaces/HttpRequestEndPayload.md)\> | An HTTP request completed (success or failure). |
| <a id="property-httprequeststart"></a> `httpRequestStart` | `Channel`\<[`HttpRequestStartPayload`](../interfaces/HttpRequestStartPayload.md), [`HttpRequestStartPayload`](../interfaces/HttpRequestStartPayload.md)\> | An HTTP request was dispatched. |
| <a id="property-httpthrottleentered"></a> `httpThrottleEntered` | `Channel`\<[`HttpThrottleEnteredPayload`](../interfaces/HttpThrottleEnteredPayload.md), [`HttpThrottleEnteredPayload`](../interfaces/HttpThrottleEnteredPayload.md)\> | The transport entered its throttle cooldown after crossing the consecutive-failure threshold. |
| <a id="property-httpthrottleexited"></a> `httpThrottleExited` | `Channel`\<`Record`\<`string`, `never`\>, `Record`\<`string`, `never`\>\> | The transport left its throttle cooldown and resumed normal operation. |
| <a id="property-livestreamcodecchanged"></a> `livestreamCodecChanged` | `Channel`\<[`LivestreamCodecChangedPayload`](../interfaces/LivestreamCodecChangedPayload.md), [`LivestreamCodecChangedPayload`](../interfaces/LivestreamCodecChangedPayload.md)\> | A pooled livestream reconnected and the controller negotiated a different codec than the one in flight - the one terminal a recovering stream raises. |
| <a id="property-livestreamrecoveryexhausted"></a> `livestreamRecoveryExhausted` | `Channel`\<[`LivestreamRecoveryExhaustedPayload`](../interfaces/LivestreamRecoveryExhaustedPayload.md), [`LivestreamRecoveryExhaustedPayload`](../interfaces/LivestreamRecoveryExhaustedPayload.md)\> | A pooled livestream's recovery policy gave up. The seam an opt-in consumer self-heal observer (a user-gated camera reboot) watches; the library reboots nothing. |
| <a id="property-livestreamrecoveryrecovered"></a> `livestreamRecoveryRecovered` | `Channel`\<[`LivestreamRecoveryRecoveredPayload`](../interfaces/LivestreamRecoveryRecoveredPayload.md), [`LivestreamRecoveryRecoveredPayload`](../interfaces/LivestreamRecoveryRecoveredPayload.md)\> | A pooled livestream's recovery episode restored the stream after a fault. |
| <a id="property-livestreamrecoverystarted"></a> `livestreamRecoveryStarted` | `Channel`\<[`LivestreamRecoveryStartedPayload`](../interfaces/LivestreamRecoveryStartedPayload.md), [`LivestreamRecoveryStartedPayload`](../interfaces/LivestreamRecoveryStartedPayload.md)\> | A pooled livestream began a recovery episode after a previously-live session faulted. |
| <a id="property-livestreamsessionclosed"></a> `livestreamSessionClosed` | `Channel`\<[`LivestreamSessionClosedPayload`](../interfaces/LivestreamSessionClosedPayload.md), [`LivestreamSessionClosedPayload`](../interfaces/LivestreamSessionClosedPayload.md)\> | A pooled livestream session closed and released its underlying WebSocket. |
| <a id="property-livestreamsessionopened"></a> `livestreamSessionOpened` | `Channel`\<[`LivestreamSessionOpenedPayload`](../interfaces/LivestreamSessionOpenedPayload.md), [`LivestreamSessionOpenedPayload`](../interfaces/LivestreamSessionOpenedPayload.md)\> | A pooled livestream session opened a new underlying WebSocket. |
| <a id="property-livestreamstalldetected"></a> `livestreamStallDetected` | `Channel`\<[`LivestreamStallDetectedPayload`](../interfaces/LivestreamStallDetectedPayload.md), [`LivestreamStallDetectedPayload`](../interfaces/LivestreamStallDetectedPayload.md)\> | A livestream session went silent beyond the heartbeat watchdog window. |
| <a id="property-livestreamsubscriptioncreated"></a> `livestreamSubscriptionCreated` | `Channel`\<[`LivestreamSubscriptionCreatedPayload`](../interfaces/LivestreamSubscriptionCreatedPayload.md), [`LivestreamSubscriptionCreatedPayload`](../interfaces/LivestreamSubscriptionCreatedPayload.md)\> | A consumer subscribed to a pooled livestream session. |
| <a id="property-livestreamsubscriptiondisposed"></a> `livestreamSubscriptionDisposed` | `Channel`\<[`LivestreamSubscriptionDisposedPayload`](../interfaces/LivestreamSubscriptionDisposedPayload.md), [`LivestreamSubscriptionDisposedPayload`](../interfaces/LivestreamSubscriptionDisposedPayload.md)\> | A consumer disposed its livestream subscription. |
| <a id="property-schemaunknownmodelkey"></a> `schemaUnknownModelKey` | `Channel`\<[`SchemaUnknownModelKeyPayload`](../interfaces/SchemaUnknownModelKeyPayload.md), [`SchemaUnknownModelKeyPayload`](../interfaces/SchemaUnknownModelKeyPayload.md)\> | A realtime packet carried a model key the library does not model. Published by the EventStream caller (not the classifier, which stays pure) on the first occurrence per `(modelKey, action)` per session, so sustained drift does not spam. The signal exists so consumers see schema evolution explicitly rather than silently absorbing it; the library version that adds support for the category closes the gap. |
| <a id="property-schemaunmodeledcollection"></a> `schemaUnmodeledCollection` | `Channel`\<[`SchemaUnmodeledCollectionPayload`](../interfaces/SchemaUnmodeledCollectionPayload.md), [`SchemaUnmodeledCollectionPayload`](../interfaces/SchemaUnmodeledCollectionPayload.md)\> | An applied bootstrap carried a populated, device-shaped collection (a `modelKey`+`mac` record array) the reducer does not model. Published by the StateStore from its dispatch chokepoint on the first occurrence per `modelKey` per session - the bootstrap-dimension twin of `schema:unknownModelKey`, which is structurally blind to a quiescent device that lives in the bootstrap but emits no realtime packet. The `known` flag separates a recognized-but-unreduced class (e.g. `aiport`) from genuine drift the controller introduced; either way the signal exists so consumers see device classes the library does not yet project rather than silently absorbing it. |
| <a id="property-talkbacksessionclosed"></a> `talkbackSessionClosed` | `Channel`\<[`TalkbackSessionClosedPayload`](../interfaces/TalkbackSessionClosedPayload.md), [`TalkbackSessionClosedPayload`](../interfaces/TalkbackSessionClosedPayload.md)\> | A talkback (two-way audio) session closed and released its WebSocket. |
| <a id="property-talkbacksessionopened"></a> `talkbackSessionOpened` | `Channel`\<[`TalkbackSessionOpenedPayload`](../interfaces/TalkbackSessionOpenedPayload.md), [`TalkbackSessionOpenedPayload`](../interfaces/TalkbackSessionOpenedPayload.md)\> | A talkback (two-way audio) session opened a WebSocket to a camera's speaker. |
