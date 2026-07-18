/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * events.test.ts: Unit tests for the pure packet classifier. These pin the two-category taxonomy (state transitions vs. activity signals), the single-source rule
 * (activity signals come only from the `event` model key), the stateless self-description rule, and the `null` contract for valid-but-unmodeled packets. The event
 * identity is always the header id, shared across an occurrence's add and finalizing update.
 */
import { classifyPacket, eventSubjects, findUnmodeledDeviceCollections, isDeviceModelKey, isKnownModelKey } from "./events.ts";
import { describe, test } from "node:test";
import { makeBootstrap, makeCamera, makeFob } from "../fixtures.helpers.ts";
import type { ProtectNvrBootstrap } from "../types/index.ts";
import { ProtectProtocolError } from "../errors.ts";
import type { RawPacket } from "./packet.ts";
import type { TypedEvent } from "./events.ts";
import assert from "node:assert/strict";

// Build a RawPacket with sensible header defaults so each test names only what it cares about.
function pkt(options: { action?: string; id?: string; modelKey: string; payload?: unknown }): RawPacket {

  const { action = "update", id = "id-1", modelKey, payload = {} } = options;

  return { header: { action, id, modelKey, newUpdateId: "update-1" }, payload };
}

describe("classifyPacket - device transitions", () => {

  test("an add for a modeled device becomes deviceAdded carrying the payload as data", () => {

    const data = { id: "camera-1", modelKey: "camera", name: "Front" };
    const result = classifyPacket(pkt({ action: "add", id: "camera-1", modelKey: "camera", payload: data }));

    assert.equal(result?.kind, "deviceAdded");
    assert.ok((result?.kind === "deviceAdded") && Object.is(result.data, data), "the data is the payload reference");
    assert.equal((result?.kind === "deviceAdded") && result.modelKey, "camera");
  });

  test("an update for a modeled device becomes devicePatched carrying the payload as patch", () => {

    const patch = { lastMotion: 123 };
    const result = classifyPacket(pkt({ action: "update", id: "camera-1", modelKey: "camera", payload: patch }));

    assert.equal(result?.kind, "devicePatched");
    assert.ok((result?.kind === "devicePatched") && Object.is(result.patch, patch));
  });

  test("a remove for a modeled device becomes deviceRemoved", () => {

    const result = classifyPacket(pkt({ action: "remove", id: "camera-1", modelKey: "camera" }));

    assert.equal(result?.kind, "deviceRemoved");
    assert.equal((result?.kind === "deviceRemoved") && result.id, "camera-1");
  });

  test("an nvr update becomes devicePatched with modelKey nvr", () => {

    const result = classifyPacket(pkt({ action: "update", id: "nvr-1", modelKey: "nvr", payload: { name: "NVR" } }));

    assert.equal(result?.kind, "devicePatched");
    assert.equal((result?.kind === "devicePatched") && result.modelKey, "nvr");
  });

  test("a user update becomes devicePatched with modelKey user (the roster reduces in realtime)", () => {

    const patch = { allPermissions: ["camera:read,write"] };
    const result = classifyPacket(pkt({ action: "update", id: "user-1", modelKey: "user", payload: patch }));

    assert.equal(result?.kind, "devicePatched");
    assert.equal((result?.kind === "devicePatched") && result.modelKey, "user");
    assert.ok((result?.kind === "devicePatched") && Object.is(result.patch, patch));
  });

  test("a user add and remove become deviceAdded and deviceRemoved with modelKey user", () => {

    const data = { id: "user-2", modelKey: "user", name: "Guest" };

    assert.equal(classifyPacket(pkt({ action: "add", id: "user-2", modelKey: "user", payload: data }))?.kind, "deviceAdded");
    assert.equal(classifyPacket(pkt({ action: "remove", id: "user-2", modelKey: "user" }))?.kind, "deviceRemoved");
  });

  test("a liveview update becomes devicePatched with modelKey liveview (the collection reduces in realtime)", () => {

    const patch = { name: "Downstairs" };
    const result = classifyPacket(pkt({ action: "update", id: "lv-1", modelKey: "liveview", payload: patch }));

    assert.equal(result?.kind, "devicePatched");
    assert.equal((result?.kind === "devicePatched") && result.modelKey, "liveview");
    assert.ok((result?.kind === "devicePatched") && Object.is(result.patch, patch));
  });

  test("a liveview add and remove become deviceAdded and deviceRemoved with modelKey liveview", () => {

    const data = { id: "lv-2", modelKey: "liveview", name: "Upstairs" };

    assert.equal(classifyPacket(pkt({ action: "add", id: "lv-2", modelKey: "liveview", payload: data }))?.kind, "deviceAdded");
    assert.equal(classifyPacket(pkt({ action: "remove", id: "lv-2", modelKey: "liveview" }))?.kind, "deviceRemoved");
  });

  test("an add or update with a non-object payload classifies as null", () => {

    assert.equal(classifyPacket(pkt({ action: "add", modelKey: "camera", payload: "not-an-object" })), null);
    assert.equal(classifyPacket(pkt({ action: "update", modelKey: "camera", payload: 42 })), null);
  });

  test("an unrecognized action classifies as null", () => {

    assert.equal(classifyPacket(pkt({ action: "frobnicate", modelKey: "camera", payload: {} })), null);
  });

  test("a model key outside the reduced subset classifies as null", () => {

    // The classifier accepts any string from the wire (model keys are header strings, not constrained by our types at the I/O boundary). Anything outside the reduced
    // StateModelKey subset classifies as null - both a recognized-but-unmodeled collection (`group`/`bridge`) and a genuinely-unknown key (a bootstrap-only `ringtone`,
    // or drift). The two are identical here; the EventStream tells them apart against the ModelKey vocabulary to decide whether to fire the schema-drift diagnostic (see
    // events-stream.test).
    assert.equal(classifyPacket(pkt({ action: "update", modelKey: "group", payload: {} })), null);
    assert.equal(classifyPacket(pkt({ action: "update", modelKey: "bridge", payload: {} })), null);
    assert.equal(classifyPacket(pkt({ action: "update", modelKey: "ringtone", payload: {} })), null);
    assert.equal(classifyPacket(pkt({ action: "add", modelKey: "futureDeviceType", payload: {} })), null);
  });
});

describe("isKnownModelKey", () => {

  test("is true for every recognized wire model key (reduced, recognized-but-unmodeled, and event)", () => {

    for(const modelKey of [ "camera", "chime", "light", "sensor", "viewer", "nvr", "user", "liveview", "group", "bridge", "event" ]) {

      assert.equal(isKnownModelKey(modelKey), true, modelKey + " must be recognized");
    }
  });

  test("is false for a key the controller has never been observed to emit on the realtime stream (genuine drift)", () => {

    assert.equal(isKnownModelKey("doorlock"), false);
    assert.equal(isKnownModelKey("garage"), false);
    assert.equal(isKnownModelKey("futureDeviceType"), false);
  });

  test("is false for `ringtone` - reduced bootstrap-only, so it stays out of the vocabulary, keeping schema:unknownModelKey a tripwire", () => {

    // The asymmetry that pins the two-axis model: `liveview` is reduced AND realtime-addressed (known), `ringtone` is reduced bootstrap-only (deliberately unknown). If a
    // `ringtone` packet ever appears it must trip the schema-drift diagnostic, the signal that the collection would then need reducing as a realtime StateModelKey.
    assert.equal(isKnownModelKey("liveview"), true);
    assert.equal(isKnownModelKey("ringtone"), false);
  });
});

describe("classifyPacket - activity signals (event model key only)", () => {

  test("a motion event becomes motionDetected with the header id as eventId", () => {

    const result = classifyPacket(pkt({ action: "add", id: "evt-9", modelKey: "event", payload: { cameraId: "camera-1", start: 111, type: "motion" } }));

    assert.equal(result?.kind, "motionDetected");
    assert.ok(result?.kind === "motionDetected");
    assert.equal(result.cameraId, "camera-1");
    assert.equal(result.eventId, "evt-9", "the occurrence identity is the header id, not a payload field");
    assert.equal(result.at, 111);
  });

  test("a ring event becomes doorbellRing", () => {

    const result = classifyPacket(pkt({ action: "add", modelKey: "event", payload: { cameraId: "camera-1", start: 5, type: "ring" } }));

    assert.equal(result?.kind, "doorbellRing");
  });

  test("each smart event type becomes smartDetect carrying its object types", () => {

    for(const type of [ "smartDetectZone", "smartDetectLine", "smartAudioDetect" ]) {

      const result = classifyPacket(pkt({ action: "add", modelKey: "event", payload: { cameraId: "camera-1", smartDetectTypes: [ "person", "vehicle" ], type } }));

      assert.equal(result?.kind, "smartDetect", type + " should classify as smartDetect");
      assert.ok(result?.kind === "smartDetect");
      assert.deepEqual(result.objectTypes, [ "person", "vehicle" ]);
    }
  });

  test("a smart type with no detected object types still classifies as smartDetect with an empty list", () => {

    const result = classifyPacket(pkt({ action: "add", modelKey: "event", payload: { cameraId: "camera-1", type: "smartDetectZone" } }));

    assert.equal(result?.kind, "smartDetect");
    assert.deepEqual((result?.kind === "smartDetect") && result.objectTypes, []);
  });

  test("a finalizing update with no type but populated smartDetectTypes classifies as smartDetect", () => {

    const result = classifyPacket(pkt({ action: "update", modelKey: "event", payload: { cameraId: "camera-1", smartDetectTypes: ["person"] } }));

    assert.equal(result?.kind, "smartDetect", "self-describing finalize is classified even without a type field");
  });

  test("a tamper event becomes tamperDetected, camera-attributed with the header id as eventId", () => {

    const result = classifyPacket(pkt({ action: "add", id: "evt-t", modelKey: "event",
      payload: { cameraId: "camera-1", metadata: { reason: "lensObscured" }, start: 222, type: "smartDetectTamper" } }));

    assert.equal(result?.kind, "tamperDetected");
    assert.ok(result?.kind === "tamperDetected");
    assert.equal(result.cameraId, "camera-1");
    assert.equal(result.eventId, "evt-t", "the occurrence identity is the header id, not a payload field");
    assert.equal(result.at, 222);
    assert.deepEqual(result.metadata, { reason: "lensObscured" });
  });

  test("a tamper event with no camera id classifies as null (tamper is camera-attributed)", () => {

    assert.equal(classifyPacket(pkt({ modelKey: "event", payload: { start: 1, type: "smartDetectTamper" } })), null);
  });

  test("a tamper event is never a smartDetect - the type equality is decided before the objectTypes fallback", () => {

    // Tamper carries no `smartDetectTypes` in practice, but we pin the ordering guard: even a tamper packet with a stray object-types array stays a tamperDetected,
    // because the explicit `smartDetectTamper` type is tested before the smart-detection branch's `objectTypes`-presence fallback. This is what keeps a camera tamper
    // from ever leaking into the `smartDetect` object-classification path the consumer routes differently.
    const plain = classifyPacket(pkt({ modelKey: "event", payload: { cameraId: "camera-1", type: "smartDetectTamper" } }));
    const withStray = classifyPacket(pkt({ modelKey: "event", payload: { cameraId: "camera-1", smartDetectTypes: ["person"], type: "smartDetectTamper" } }));

    assert.equal(plain?.kind, "tamperDetected");
    assert.equal(withStray?.kind, "tamperDetected", "an explicit tamper type wins over the smart-detection objectTypes fallback");
    assert.notEqual(withStray?.kind, "smartDetect");
  });

  test("a fingerprint scan becomes authDetected with method \"fingerprint\", camera-attributed with the header id and its metadata carried through", () => {

    const result = classifyPacket(pkt({ action: "add", id: "evt-f", modelKey: "event",
      payload: { cameraId: "camera-1", metadata: { fingerprint: { ulpId: "ulp-1" } }, start: 333, type: "fingerprintIdentified" } }));

    assert.equal(result?.kind, "authDetected");
    assert.ok(result?.kind === "authDetected");
    assert.equal(result.method, "fingerprint", "the classifier lifts the method it resolved from the wire type, so the consumer never re-derives it from metadata shape");
    assert.equal(result.cameraId, "camera-1");
    assert.equal(result.eventId, "evt-f", "the occurrence identity is the header id, not a payload field");
    assert.equal(result.at, 333);
    assert.deepEqual(result.metadata, { fingerprint: { ulpId: "ulp-1" } });
  });

  test("an NFC card scan becomes authDetected with method \"nfc\", carrying its nfc metadata through and reading the camera field for attribution", () => {

    const result = classifyPacket(pkt({ action: "add", id: "evt-n", modelKey: "event",
      payload: { camera: "camera-2", metadata: { nfc: { nfcId: "card-9", ulpId: "ulp-2" } }, start: 444, type: "nfcCardScanned" } }));

    assert.equal(result?.kind, "authDetected");
    assert.ok(result?.kind === "authDetected");
    assert.equal(result.method, "nfc");
    assert.equal(result.cameraId, "camera-2", "cameraId is read from the camera field when cameraId is absent");
    assert.equal(result.at, 444);
    assert.deepEqual(result.metadata, { nfc: { nfcId: "card-9", ulpId: "ulp-2" } });
  });

  test("an auth scan that also carries accessEventId is never an accessEvent - the auth type is decided before the access fallback", () => {

    // The ordering guard, mirroring the tamper "never a smartDetect" pin. Live captures of both auth methods show a scan's metadata (`fingerprint`/`nfc`) and the
    // `accessEventId` access marker are disjoint - the two never co-occur on observed traffic - so this is a *defensive* precedence, not a response to an observed
    // co-stamp: were a future firmware to stamp an auth packet with access metadata, the explicit auth `type`, tested ahead of the accessEvent branch's `accessEventId`
    // marker, would still keep it an authDetected and out of the access path the consumer routes to its access devices rather than its cameras.
    const result = classifyPacket(pkt({ modelKey: "event",
      payload: { cameraId: "camera-1", metadata: { accessEventId: "a-1", nfc: { nfcId: "card-9" } }, type: "nfcCardScanned" } }));

    assert.equal(result?.kind, "authDetected", "an explicit auth type wins over the accessEvent metadata fallback");
    assert.equal((result?.kind === "authDetected") && result.method, "nfc", "the lifted method survives even a hypothetical access co-stamp");
    assert.notEqual(result?.kind, "accessEvent");
  });

  test("an auth scan with no camera id classifies as null (auth is camera-attributed)", () => {

    assert.equal(classifyPacket(pkt({ modelKey: "event", payload: { metadata: { fingerprint: { ulpId: "ulp-1" } }, start: 1, type: "fingerprintIdentified" } })), null);
  });

  test("an unrecognized fingerprint scan (matched no identity) still classifies as authDetected - the scan is classified, the match is data", () => {

    // Live capture: a fingerprint the reader cannot match to a user arrives camera-attributed with `metadata.fingerprint.ulpId: null`. Classification
    // branches on the auth `type`, so the occurrence still classifies; whether an identity matched is data the consumer reads from metadata,
    // never a classification input.
    const result = classifyPacket(pkt({ action: "add", id: "evt-fu", modelKey: "event",
      payload: { camera: "camera-1", metadata: { fingerprint: { ulpId: null } }, start: 555, type: "fingerprintIdentified" } }));

    assert.equal(result?.kind, "authDetected");
    assert.ok(result?.kind === "authDetected");
    assert.equal(result.method, "fingerprint");
    assert.equal(result.cameraId, "camera-1", "auth is camera-attributed via the payload camera field");
    assert.deepEqual(result.metadata, { fingerprint: { ulpId: null } }, "the unmatched identity is carried through unchanged as data for the consumer to read");
  });

  test("an access occurrence becomes accessEvent with deviceId and action from its metadata", () => {

    const result = classifyPacket(pkt({ action: "add", id: "evt-a", modelKey: "event",
      payload: { metadata: { accessEventId: "a-1", action: "entry", deviceId: { text: "door-1" } } } }));

    assert.equal(result?.kind, "accessEvent");
    assert.ok(result?.kind === "accessEvent");
    assert.equal(result.deviceId, "door-1");
    assert.equal(result.action, "entry");
    assert.equal(result.eventId, "evt-a");
  });

  test("an access occurrence falls back to cameraId for deviceId when metadata has no device text", () => {

    const result = classifyPacket(pkt({ modelKey: "event", payload: { cameraId: "camera-9", metadata: { accessEventId: "a-1" } } }));

    assert.equal((result?.kind === "accessEvent") && result.deviceId, "camera-9");
    assert.equal((result?.kind === "accessEvent") && result.action, "", "absent action defaults to empty string");
  });

  test("a door bell press (a ring carrying accessEventId) is decided as accessEvent, not doorbellRing, resolving deviceId via the camera fallback", () => {

    // An access door reports a bell press as `type: "ring"` carrying access metadata but no device text. The `accessEventId` branch is tested ahead of the ring branch,
    // so it is decided as an accessEvent - resolving deviceId through the camera field - rather than classifying as a doorbellRing.
    const result = classifyPacket(pkt({ action: "add", id: "evt-db", modelKey: "event", payload: { camera: "door-hub",
      metadata: { accessEventId: "ae-1", action: "door_bell", direction: "entry", doorName: "Door Hub", openSuccess: true }, type: "ring" } }));

    assert.equal(result?.kind, "accessEvent", "a ring carrying the accessEventId marker is decided as accessEvent, not doorbellRing");
    assert.ok(result?.kind === "accessEvent");
    assert.equal(result.deviceId, "door-hub", "deviceId resolves via the camera fallback when the metadata carries no device text");
    assert.equal(result.action, "door_bell");
  });

  test("a device-less bare type:access packet (a login/session audit event, indistinguishable from a software unlock) classifies as null", () => {

    // The controller emits this exact shape on every authentication and for a software unlock alike - device-less, `locked` always false, carrying only session
    // metadata (`clientPlatform`/`ip`/`userName`) - with no wire field to tell the two apart, so it is deliberately not modeled and falls through to the
    // valid-but-unmodeled `null` outcome rather than fabricating an unlock signal the wire does not carry.
    const result = classifyPacket(pkt({ action: "add", id: "evt-u", modelKey: "event",
      payload: { camera: null, device: null, locked: false, metadata: { clientPlatform: "web", ip: "172.16.0.30", userName: "Homebridge User" }, start: 7,
        type: "access", user: "user-1" } }));

    assert.equal(result, null, "a device-less type:access packet is unmodeled and classifies as null");
  });

  test("a stray type:access packet carrying a camera id matches no occurrence type and classifies as null at the tail", () => {

    // A bare type:access packet that carries a camera id passes the camera-id guard, then matches none of ring/motion/tamper/smartDetect and returns null at the tail.
    // We pin that tail null so a future type:access classification cannot silently route a camera-bearing packet, the same way the defensive-precedence branches above
    // (tamper-never-smartDetect, auth-never-accessEvent) are pinned.
    const result = classifyPacket(pkt({ action: "add", id: "evt-a", modelKey: "event", payload: { camera: "camera-1", locked: false, start: 9, type: "access" } }));

    assert.equal(result, null, "a camera-bearing type:access packet matches no occurrence type and classifies as null at the tail");
  });

  test("an access occurrence with neither device text nor cameraId classifies as null", () => {

    assert.equal(classifyPacket(pkt({ modelKey: "event", payload: { metadata: { accessEventId: "a-1" } } })), null);
  });

  test("a fob button press becomes buttonPressed, device-attributed, lifting the button and press type from metadata", () => {

    const result = classifyPacket(pkt({ action: "add", id: "evt-b", modelKey: "event",
      payload: { camera: null, device: "fob-1", metadata: { button: { text: "arm" }, buttonPressType: { text: "press" }, deviceModelKey: "fob" }, start: 7,
        type: "sensorButtonPressed" } }));

    assert.equal(result?.kind, "buttonPressed");
    assert.ok(result?.kind === "buttonPressed");
    assert.equal(result.deviceId, "fob-1");
    assert.equal(result.button, "arm");
    assert.equal(result.pressType, "press");
    assert.equal(result.eventId, "evt-b");
    assert.equal(result.at, 7);
  });

  test("a button press falls back to the metadata sensor id when the payload carries no device", () => {

    const result = classifyPacket(pkt({ modelKey: "event",
      payload: { metadata: { button: { text: "panic" }, sensorId: { text: "fob-9" } }, type: "sensorButtonPressed" } }));

    assert.equal((result?.kind === "buttonPressed") && result.deviceId, "fob-9");
    assert.equal((result?.kind === "buttonPressed") && result.button, "panic");
  });

  test("a button press with neither a device nor a sensor id classifies as null (it is unroutable)", () => {

    assert.equal(classifyPacket(pkt({ modelKey: "event", payload: { metadata: { button: { text: "arm" } }, type: "sensorButtonPressed" } })), null);
  });

  test("at falls back to detectedAt when start is absent, then to zero", () => {

    const fromDetectedAt = classifyPacket(pkt({ modelKey: "event", payload: { cameraId: "c1", detectedAt: 222, type: "motion" } }));
    const fromNeither = classifyPacket(pkt({ modelKey: "event", payload: { cameraId: "c1", type: "motion" } }));

    assert.equal((fromDetectedAt?.kind === "motionDetected") && fromDetectedAt.at, 222);
    assert.equal((fromNeither?.kind === "motionDetected") && fromNeither.at, 0);
  });

  test("cameraId is read from the camera field when cameraId is absent", () => {

    const result = classifyPacket(pkt({ modelKey: "event", payload: { camera: "camera-7", start: 1, type: "motion" } }));

    assert.equal((result?.kind === "motionDetected") && result.cameraId, "camera-7");
  });

  test("a camera-attributed event with no camera id classifies as null", () => {

    assert.equal(classifyPacket(pkt({ modelKey: "event", payload: { start: 1, type: "motion" } })), null);
  });

  test("an event with a non-object payload classifies as null", () => {

    assert.equal(classifyPacket(pkt({ modelKey: "event", payload: "nope" })), null);
  });

  test("an event whose type is unmodeled and which carries no object types classifies as null", () => {

    assert.equal(classifyPacket(pkt({ modelKey: "event", payload: { cameraId: "c1", type: "somethingNew" } })), null);
  });
});

describe("eventSubjects", () => {

  test("a state transition concerns its single reduced record id", () => {

    assert.deepEqual(eventSubjects({ id: "cam-1", kind: "deviceRemoved", modelKey: "camera" }), ["cam-1"]);
    assert.deepEqual(eventSubjects({ id: "lv-1", kind: "devicePatched", modelKey: "liveview", patch: {} }), ["lv-1"]);
  });

  test("a camera activity signal concerns its camera - motion, ring, smart, tamper, and auth alike", () => {

    assert.deepEqual(eventSubjects({ at: 0, cameraId: "cam-9", eventId: "e", kind: "motionDetected" }), ["cam-9"]);
    assert.deepEqual(eventSubjects({ at: 0, cameraId: "cam-9", eventId: "e", kind: "doorbellRing" }), ["cam-9"]);
    assert.deepEqual(eventSubjects({ at: 0, cameraId: "cam-9", eventId: "e", kind: "tamperDetected" }), ["cam-9"]);
    assert.deepEqual(eventSubjects({ at: 0, cameraId: "cam-9", eventId: "e", kind: "authDetected", method: "fingerprint" }), ["cam-9"]);
    assert.deepEqual(eventSubjects({ at: 0, cameraId: "cam-9", eventId: "e", kind: "smartDetect", objectTypes: ["person"] }), ["cam-9"]);
  });

  test("an access occurrence concerns its access device", () => {

    assert.deepEqual(eventSubjects({ action: "entry", at: 0, deviceId: "door-1", eventId: "e", kind: "accessEvent" }), ["door-1"]);
  });

  test("a button press concerns its device", () => {

    assert.deepEqual(eventSubjects({ at: 0, button: "arm", deviceId: "fob-1", eventId: "e", kind: "buttonPressed", pressType: "press" }), ["fob-1"]);
  });

  test("the synthetic bootstrap concerns no single record", () => {

    // We only need the tag here; the bootstrap payload shape is immaterial to attribution, so we cast past it.
    assert.deepEqual(eventSubjects({ kind: "bootstrapLoaded" } as unknown as TypedEvent), []);
  });

  test("an unmodeled kind throws rather than silently dropping attribution", () => {

    // The exhaustive default is unreachable for a well-typed event; if untyped code smuggles in an unknown kind, attribution fails loudly instead of returning an empty
    // subject set that would silently drop the event from a device filter.
    assert.throws(() => eventSubjects({ kind: "imaginaryKind" } as unknown as TypedEvent), ProtectProtocolError);
  });
});

describe("isDeviceModelKey", () => {

  test("is true for every modeled device key", () => {

    for(const modelKey of [ "camera", "chime", "fob", "light", "nvr", "relay", "sensor", "viewer" ]) {

      assert.equal(isDeviceModelKey(modelKey), true, modelKey + " must be a device model key");
    }
  });

  test("is false for recognized-but-unreduced keys and genuine drift", () => {

    // aiport/liveview/user are recognized (isKnownModelKey true) but not modeled as devices; garage is genuine drift. None is a DeviceModelKey.
    assert.equal(isDeviceModelKey("aiport"), false);
    assert.equal(isDeviceModelKey("liveview"), false);
    assert.equal(isDeviceModelKey("user"), false);
    assert.equal(isDeviceModelKey("garage"), false);
  });
});

describe("findUnmodeledDeviceCollections", () => {

  // A synthetic bootstrap: we spread makeBootstrap()'s result (its overrides parameter is closed to the modeled collections) and add the unmodeled keys. `aiports`,
  // `groups`, and `speakers` are already-named bootstrap fields; `garages` is genuinely out-of-schema and type-checks via the bootstrap's `[key: string]` index
  // signature. It carries a modeled collection (cameras), a recognized-but-unreduced device class (aiports), genuine drift (garages),
  // a non-device array (groups, no `mac`), and an empty array (speakers). makeCamera supplies the device shape (`mac`+`modelKey`+`id`), so overriding `modelKey`
  // yields a device-shaped record under a non-device key.
  const bootstrap: ProtectNvrBootstrap = {

    ...makeBootstrap({ cameras: [makeCamera({ id: "c1" })], fobs: [makeFob({ id: "fob1", mac: "AA:BB:CC:00:00:30" })] }),
    aiports: [makeCamera({ id: "ap1", mac: "AA:BB:CC:00:00:10", modelKey: "aiport" })],
    garages: [makeCamera({ id: "g1", mac: "AA:BB:CC:00:00:20", modelKey: "garage" })],
    groups: [{ id: "grp1", modelKey: "group", name: "All" }],
    speakers: []
  };

  test("reports a recognized-but-unreduced device collection with known=true", () => {

    const byCollection = new Map(findUnmodeledDeviceCollections(bootstrap).map((collection) => [ collection.collection, collection ]));

    assert.deepEqual(byCollection.get("aiports"), { collection: "aiports", count: 1, exampleId: "ap1", known: true, modelKey: "aiport" });
  });

  test("reports genuine drift (an unrecognized device class) with known=false", () => {

    const byCollection = new Map(findUnmodeledDeviceCollections(bootstrap).map((collection) => [ collection.collection, collection ]));

    assert.deepEqual(byCollection.get("garages"), { collection: "garages", count: 1, exampleId: "g1", known: false, modelKey: "garage" });
  });

  test("excludes a modeled collection, a non-device array, and empty arrays", () => {

    const reported = new Set(findUnmodeledDeviceCollections(bootstrap).map((collection) => collection.collection));

    // The cameras and fobs collections hold modeled DeviceModelKeys; groups has no `mac` (not device-shaped); speakers (and every empty array) is empty.
    assert.equal(reported.has("cameras"), false);
    assert.equal(reported.has("fobs"), false, "the fob is now a modeled DeviceModelKey, so its collection is not reported as unmodeled");
    assert.equal(reported.has("groups"), false);
    assert.equal(reported.has("speakers"), false);
  });

  test("returns an empty array when every collection is modeled or empty", () => {

    assert.deepEqual(findUnmodeledDeviceCollections(makeBootstrap({ cameras: [makeCamera({ id: "c1" })] })), []);
  });
});
