/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * diagnostics.test.ts: Unit tests for the typed diagnostics rails - the payload-typed round trip and its disposal, the payload-less channel, the `using` idiom, and the
 * committed type table that binds every channel to the payload it carries.
 */
import type { AdoptionContradictionPayload, AuthReloginPayload, ConnectionRebootDetectedPayload, ConnectionTransitionPayload, EventsClosedPayload, EventsPacketPayload,
  EventsReconnectingPayload, HttpRequestEndPayload, HttpRequestStartPayload, HttpThrottleEnteredPayload, LivestreamCodecChangedPayload,
  LivestreamRecoveryExhaustedPayload, LivestreamRecoveryRecoveredPayload, LivestreamRecoveryStartedPayload, LivestreamSessionClosedPayload,
  LivestreamSessionOpenedPayload, LivestreamStallDetectedPayload, LivestreamSubscriptionCreatedPayload, LivestreamSubscriptionDisposedPayload,
  ProtectDiagnosticsChannel, SchemaUnknownModelKeyPayload, SchemaUnmodeledCollectionPayload, TalkbackSessionClosedPayload,
  TalkbackSessionOpenedPayload } from "./diagnostics.ts";
import { channels, subscribeToChannel } from "./diagnostics.ts";
import { describe, test } from "node:test";
import assert from "node:assert/strict";

/* The authored table: every channel name beside the typed rail it is declared as. The payload-less channel binds `void`, which is what makes its `publish()` take no
 * argument and its handlers take none.
 *
 * The table is written out by hand rather than derived from the registry, because deriving it from the very thing it checks would make it agree with any binding,
 * correct or not.
 */
interface ChannelBindings {

  adoptionContradiction: ProtectDiagnosticsChannel<AdoptionContradictionPayload>;
  authRelogin: ProtectDiagnosticsChannel<AuthReloginPayload>;
  connectionRebootDetected: ProtectDiagnosticsChannel<ConnectionRebootDetectedPayload>;
  connectionTransition: ProtectDiagnosticsChannel<ConnectionTransitionPayload>;
  eventsClosed: ProtectDiagnosticsChannel<EventsClosedPayload>;
  eventsPacket: ProtectDiagnosticsChannel<EventsPacketPayload>;
  eventsReconnecting: ProtectDiagnosticsChannel<EventsReconnectingPayload>;
  httpRequestEnd: ProtectDiagnosticsChannel<HttpRequestEndPayload>;
  httpRequestStart: ProtectDiagnosticsChannel<HttpRequestStartPayload>;
  httpThrottleEntered: ProtectDiagnosticsChannel<HttpThrottleEnteredPayload>;
  httpThrottleExited: ProtectDiagnosticsChannel<void>;
  livestreamCodecChanged: ProtectDiagnosticsChannel<LivestreamCodecChangedPayload>;
  livestreamRecoveryExhausted: ProtectDiagnosticsChannel<LivestreamRecoveryExhaustedPayload>;
  livestreamRecoveryRecovered: ProtectDiagnosticsChannel<LivestreamRecoveryRecoveredPayload>;
  livestreamRecoveryStarted: ProtectDiagnosticsChannel<LivestreamRecoveryStartedPayload>;
  livestreamSessionClosed: ProtectDiagnosticsChannel<LivestreamSessionClosedPayload>;
  livestreamSessionOpened: ProtectDiagnosticsChannel<LivestreamSessionOpenedPayload>;
  livestreamStallDetected: ProtectDiagnosticsChannel<LivestreamStallDetectedPayload>;
  livestreamSubscriptionCreated: ProtectDiagnosticsChannel<LivestreamSubscriptionCreatedPayload>;
  livestreamSubscriptionDisposed: ProtectDiagnosticsChannel<LivestreamSubscriptionDisposedPayload>;
  schemaUnknownModelKey: ProtectDiagnosticsChannel<SchemaUnknownModelKeyPayload>;
  schemaUnmodeledCollection: ProtectDiagnosticsChannel<SchemaUnmodeledCollectionPayload>;
  talkbackSessionClosed: ProtectDiagnosticsChannel<TalkbackSessionClosedPayload>;
  talkbackSessionOpened: ProtectDiagnosticsChannel<TalkbackSessionOpenedPayload>;
}

/* The shape the registry is checked against. Mapping over the registry's own keys is what makes the table total in both directions: a channel added to `channels`
 * without a row in `ChannelBindings` leaves `ChannelBindings[K]` unresolvable and fails to compile, so no channel can slip through unpinned, and the `satisfies` check
 * in the test below rejects any channel whose declared payload is not the one the table names.
 */
type ChannelTypeTable = { [K in keyof typeof channels]: ChannelBindings[K] };

describe("diagnostics rails", () => {

  test("a typed subscription reads the payload's own fields, and disposal detaches the handler", () => {

    const seen: SchemaUnknownModelKeyPayload[] = [];

    // The handler's parameter is the channel's payload type, so these field reads are typechecked against it - no cast, and no runtime narrowing to recover a shape the
    // channel already declares.
    const sub = subscribeToChannel(channels.schemaUnknownModelKey, (payload) => {

      seen.push({ action: payload.action, exampleId: payload.exampleId, modelKey: payload.modelKey });
    });

    channels.schemaUnknownModelKey.publish({ action: "add", exampleId: "g1", modelKey: "garage" });

    sub[Symbol.dispose]();

    // Disposing twice is documented as safe, and the publish that follows proves the detach was real rather than merely recorded.
    sub[Symbol.dispose]();
    channels.schemaUnknownModelKey.publish({ action: "update", exampleId: "g2", modelKey: "garage" });

    assert.deepEqual(seen, [{ action: "add", exampleId: "g1", modelKey: "garage" }], "only the publication made while the subscription was live is observed");
  });

  test("a `using` declaration detaches the handler at scope exit", () => {

    const seen: boolean[] = [];

    // The subscription's lifetime is the function's: it is established on entry and detached on the way out, with no teardown bookkeeping of its own.
    const observeOnce = (): void => {

      using _sub = subscribeToChannel(channels.authRelogin, (payload) => seen.push(payload.success));

      channels.authRelogin.publish({ success: true });
    };

    observeOnce();
    channels.authRelogin.publish({ success: false });

    assert.deepEqual(seen, [true], "the publication after the scope closed reaches nothing");
  });

  test("the payload-less channel publishes with no argument to a handler that takes none", () => {

    let exits = 0;
    const sub = subscribeToChannel(channels.httpThrottleExited, () => {

      exits += 1;
    });

    channels.httpThrottleExited.publish();

    sub[Symbol.dispose]();
    channels.httpThrottleExited.publish();

    assert.equal(exits, 1, "the throttle-exit transition is the whole signal, so the handler is invoked with nothing to read");
  });

  test("every channel is bound to the payload type the table names", () => {

    // The `satisfies` operator is the assertion here: it compiles only while every channel in the registry carries exactly the payload the table binds it to, so a
    // payload type attached to the wrong channel is a build failure rather than a wrong shape arriving in a consumer's handler. The runtime check that follows keeps the
    // test honest as a test - it confirms the registry the type check ran against is the live one.
    const pinned = channels satisfies ChannelTypeTable;

    for(const [ name, channel ] of Object.entries(pinned)) {

      assert.equal(typeof channel.publish, "function", "every table entry names a live channel: " + name);
    }
  });
});
