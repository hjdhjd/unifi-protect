/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * scrub.test.ts: Unit tests for the capture scrub - referential consistency in both directions, key-over-shape precedence, coordinate and locale replacement, key
 * redaction, URL credential stripping, the base64 wrapper exemption, and the promise that the input is never modified.
 */
import { createScrubContext, scrub } from "./scrub.ts";
import { describe, test } from "node:test";
import assert from "node:assert/strict";

// Scrub a value with a fresh context, for the cases that do not need one context spanning several calls.
function scrubbed(value: unknown): unknown {

  return scrub(value, createScrubContext());
}

describe("scrub", () => {

  test("the same value maps to one pseudonym wherever it appears", () => {

    // The property that keeps a scrubbed bundle usable: a camera referenced by MAC from three places is still one camera afterward.
    const result = scrubbed({ devices: [ { mac: "AABBCCDDEEFF" }, { peer: "AABBCCDDEEFF" } ], owner: { mac: "AABBCCDDEEFF" } }) as {

      devices: [{ mac: string }, { peer: string }];
      owner: { mac: string };
    };

    assert.equal(result.devices[0].mac, result.devices[1].peer);
    assert.equal(result.devices[0].mac, result.owner.mac);
    assert.notEqual(result.devices[0].mac, "AABBCCDDEEFF");
  });

  test("two different values map to two different pseudonyms", () => {

    // The other direction, and the one that fails an implementation that simply collapses everything onto a single token: distinctness has to survive too, or the
    // bundle stops describing a system with more than one device in it.
    const result = scrubbed({ first: { mac: "AABBCCDDEE01" }, second: { mac: "AABBCCDDEE02" } }) as { first: { mac: string }; second: { mac: string } };

    assert.notEqual(result.first.mac, result.second.mac);
  });

  test("a novel field carrying a known value gets the same pseudonym as the declared one", () => {

    // Novelty evidence is the part of a bundle no key catalog anticipates, so shape-driven replacement has to reach it - and reach it consistently, or a new device
    // class would appear unrelated to the records that reference it.
    const result = scrubbed({ mac: "AABBCCDDEEFF", vocSensorPeerAddress: "AABBCCDDEEFF" }) as { mac: string; vocSensorPeerAddress: string };

    assert.equal(result.mac, result.vocSensorPeerAddress);
    assert.notEqual(result.mac, "AABBCCDDEEFF");
  });

  test("a secret is cleared and keeps its length", () => {

    const secret = "s3cr3t-token-value-abcdefghijklmnop";
    const result = scrubbed({ token: secret }) as { token: string };

    assert.equal(result.token.length, secret.length, "the length survives so a bundle still shows how long the real value was");
    assert.ok(result.token.startsWith("REDACTED-"));
    assert.ok(!result.token.includes("s3cr3t"));
  });

  test("an empty secret stays empty", () => {

    assert.deepEqual(scrubbed({ accessKey: "" }), { accessKey: "" });
  });

  test("both spellings of a stream alias are cleared", () => {

    // A channel record carries the alias under two names, and either one opens the stream on its own, so clearing whichever spelling a catalog happened to list first
    // would leave the stream reachable through the other.
    const result = scrubbed({ internalRtspAlias: "7NqBpVeZvJcXmR2t", rtspAlias: "kL9mQwErTyUiOp3a" }) as { internalRtspAlias: string; rtspAlias: string };

    assert.ok(result.internalRtspAlias.startsWith("REDACTED-"));
    assert.ok(!result.internalRtspAlias.includes("NqBpVeZ"));
    assert.ok(result.rtspAlias.startsWith("REDACTED-"));
    assert.ok(!result.rtspAlias.includes("mQwErTy"));
  });

  test("a share link is cleared whole rather than stripped of credentials", () => {

    // The case that separates the two ways a URL can be handled. A share link's capability lives in the path, so the credential stripping that reaches only a URL's
    // authority would hand back a working link. It is a secret by key, which clears the whole value and keeps its length.
    const link = "https://share.ui.com/v/9fT2xKqL8mNbVc4z";
    const result = scrubbed({ shareLink: link }) as { shareLink: string };

    assert.equal(result.shareLink.length, link.length, "the length survives so a bundle still shows how long the real link was");
    assert.ok(result.shareLink.startsWith("REDACTED-"));
    assert.ok(!result.shareLink.includes("9fT2xKqL8mNbVc4z"), "the capability in the path does not survive");
    assert.ok(!result.shareLink.includes("https://"), "the whole value is cleared, so nothing is left that still reads as a link");
  });

  test("the key decides ahead of the value's shape", () => {

    // A device someone named after an address is a name, not an address. Without this precedence the bundle would show a device called "192.0.2.1".
    const result = scrubbed({ name: "192.168.1.5" }) as { name: string };

    assert.ok(result.name.startsWith("Test Device "), "a name key wins over the address shape");
  });

  test("a name key seeds the stand-in with the field it came from", () => {

    const result = scrubbed({ name: "Front Door", ssid: "HomeNetwork" }) as { name: string; ssid: string };

    assert.ok(result.name.startsWith("Test Device "));
    assert.ok(result.ssid.startsWith("Test ssid "));
  });

  test("a door label and a greeting label are pseudonymized under their own hints", () => {

    // Labels an operator typed, under keys whose values have no shape a fallback rule could recognize. Each is its own entity, so each keeps its own hint and the
    // bundle still reads as a door and a greeting rather than two anonymous tokens.
    const result = scrubbed({ doorName: "Side Entrance", greetingBroadcastName: "Welcome Home" }) as { doorName: string; greetingBroadcastName: string };

    assert.match(result.doorName, /^Test doorName \d+$/);
    assert.match(result.greetingBroadcastName, /^Test greetingBroadcastName \d+$/);
  });

  test("a device's own name and the copies of it elsewhere resolve to one stand-in", () => {

    // A camera reports the name of the access point it is attached to, and the client reports the NVR's name as the controller name. Each is a copy of a `name`
    // recorded on another record, so every spelling has to land on the same stand-in or the bundle would stop showing which device is which.
    const context = createScrubContext();
    const result = scrub({ camera: { apName: "Garage AP" }, controllerName: "Hubble", nvr: { name: "Hubble" }, ports: [{ name: "Garage AP" }] }, context) as {

      camera: { apName: string };
      controllerName: string;
      nvr: { name: string };
      ports: [{ name: string }];
    };

    assert.equal(result.camera.apName, result.ports[0].name, "an access point reads the same from its own record and from the camera reporting it");
    assert.equal(result.controllerName, result.nvr.name, "the controller name reads the same as the NVR record it is taken from");
    assert.notEqual(result.camera.apName, "Garage AP");
    assert.notEqual(result.controllerName, "Hubble");
  });

  test("a login is pseudonymized under every spelling that names one", () => {

    const result = scrubbed({ localUsername: "operator", userName: "ubnt", username: "homebridge" }) as {

      localUsername: string;
      userName: string;
      username: string;
    };

    assert.match(result.localUsername, /^Test username \d+$/);
    assert.match(result.userName, /^Test username \d+$/);
    assert.match(result.username, /^Test username \d+$/);
  });

  test("one login is one stand-in across the spellings that name it", () => {

    // The cross-reference a bundle is read for: an activity frame attributing something to an account has to still point at that account's record afterward, which it
    // only does if both spellings of the login resolve to the same pseudonym.
    const context = createScrubContext();
    const result = scrub({ event: { metadata: { userName: "operator" } }, user: { localUsername: "operator" } }, context) as {

      event: { metadata: { userName: string } };
      user: { localUsername: string };
    };

    assert.equal(result.user.localUsername, result.event.metadata.userName);
    assert.notEqual(result.user.localUsername, "operator");
  });

  test("the account behind a shared stream is the login its user record names", () => {

    // A shared stream records who shared it, which is the same account the user list carries. Both take the login regime, so the bundle still shows that the share
    // belongs to that person without either spelling of the account surviving.
    const context = createScrubContext();
    const result = scrub({ streamSharing: { sharedByUser: "operator" }, users: [{ localUsername: "operator" }] }, context) as {

      streamSharing: { sharedByUser: string };
      users: [{ localUsername: string }];
    };

    assert.match(result.streamSharing.sharedByUser, /^Test username \d+$/);
    assert.equal(result.streamSharing.sharedByUser, result.users[0].localUsername);
    assert.notEqual(result.streamSharing.sharedByUser, "operator");
  });

  test("an email-shaped login takes the name path rather than the email path", () => {

    // Key precedence where it matters most: a controller lets an account be named by its email address, and routing those logins through the email category while
    // the plain ones went through the name category would break the cross-reference between them.
    const result = scrubbed({ localUsername: "operator@example.org" }) as { localUsername: string };

    assert.match(result.localUsername, /^Test username \d+$/);
  });

  test("a host key resolves by shape to an address or a hostname", () => {

    const result = scrubbed({ connectionHost: "10.0.0.5", host: "controller.example.com" }) as { connectionHost: string; host: string };

    assert.match(result.connectionHost, /^192\.0\.2\.\d+$/, "addresses land in the range reserved for documentation");
    assert.match(result.host, /^host-\d+\.test\.local$/);
  });

  test("a host key the controller spells its own way is still resolved by shape", () => {

    // A bare shortname carries no shape at all, so nothing but the key can catch it, and the address of the camera that last saw motion is a host under a name that
    // reads like an event field.
    const result = scrubbed({ hostShortname: "protect-nvr", lastMotionCameraAddress: "10.0.0.44" }) as { hostShortname: string; lastMotionCameraAddress: string };

    assert.match(result.hostShortname, /^host-\d+\.test\.local$/);
    assert.match(result.lastMotionCameraAddress, /^192\.0\.2\.\d+$/);
  });

  test("an array of hosts resolves each element by its own shape", () => {

    // Elements inherit the key their array arrived under, so a mixed list is judged the way each single value would be - the address as an address, the name as a name.
    const result = scrubbed({ hosts: [ "10.0.0.1", "protect.example.com" ] }) as { hosts: string[] };

    assert.match(result.hosts[0] ?? "", /^192\.0\.2\.\d+$/);
    assert.match(result.hosts[1] ?? "", /^host-\d+\.test\.local$/);
  });

  test("an identifying object key is replaced along with the values", () => {

    // Some controller maps are keyed by raw MAC, so a scrub that only touched values would leave the identifiers in the key positions.
    const result = scrubbed({ featureFlagsMap: { AABBCCDDEEFF: { enabled: true } } }) as { featureFlagsMap: Record<string, unknown> };
    const keys = Object.keys(result.featureFlagsMap);

    assert.equal(keys.length, 1);
    assert.notEqual(keys[0], "AABBCCDDEEFF");
    assert.match(keys[0] ?? "", /^[0-9A-F]{12}$/, "the replacement is still MAC-shaped, so the map still parses");
  });

  test("UUID-shaped and address-shaped object keys are replaced too", () => {

    const result = scrubbed({ byAddress: { "10.0.0.7": true }, byId: { "01234567-89ab-cdef-0123-456789abcdef": true } }) as {

      byAddress: Record<string, unknown>;
      byId: Record<string, unknown>;
    };

    assert.match(Object.keys(result.byId)[0] ?? "", /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    assert.notEqual(Object.keys(result.byId)[0], "01234567-89ab-cdef-0123-456789abcdef");
    assert.match(Object.keys(result.byAddress)[0] ?? "", /^192\.0\.2\.\d+$/);
  });

  test("an address under a key no catalog names is caught by its shape", () => {

    // The fallback that reaches novelty evidence: a new device class can carry an address under any field name at all, and the shape is what catches it.
    const result = scrubbed({ vocSensorGateway: "10.0.0.9" }) as { vocSensorGateway: string };

    assert.match(result.vocSensorGateway, /^192\.0\.2\.\d+$/);
  });

  test("a URL carrying no credentials survives intact", () => {

    // Only the credentials are stripped. A firmware or documentation URL is evidence worth keeping, so it has to come through unchanged.
    const url = "https://fw.example.com/firmware/UVC-G4.bin";

    assert.deepEqual(scrubbed({ firmwareUrl: url }), { firmwareUrl: url });
  });

  test("a key and a value carrying the same identifier agree", () => {

    const context = createScrubContext();
    const result = scrub({ byMac: { AABBCCDDEEFF: true }, mac: "AABBCCDDEEFF" }, context) as { byMac: Record<string, unknown>; mac: string };

    assert.deepEqual(Object.keys(result.byMac), [result.mac], "the key and the value resolve to one pseudonym, so the map still points at the device");
  });

  test("credentials embedded in a URL are stripped", () => {

    // A secret inside a value, under a key no catalog would flag. The rest of the URL survives, because it is the part that carries meaning.
    const result = scrubbed({ streamUrl: "rtsp://admin:hunter2@10.0.0.5:7447/abc123" }) as { streamUrl: string };

    assert.ok(!result.streamUrl.includes("hunter2"));
    assert.ok(!result.streamUrl.includes("admin"));
    assert.ok(result.streamUrl.startsWith("rtsp://"));
  });

  test("an email is referential and distinct across different addresses", () => {

    const context = createScrubContext();
    const result = scrub({ contacts: [ "a@example.org", "b@example.org", "a@example.org" ] }, context) as { contacts: string[] };

    assert.equal(result.contacts[0], result.contacts[2], "the same address is the same person throughout");
    assert.notEqual(result.contacts[0], result.contacts[1]);
    assert.match(result.contacts[0] ?? "", /^user-\d+@example\.com$/);
  });

  test("a UUID keeps its shape and a checksum keeps its length", () => {

    const uuid = "01234567-89ab-cdef-0123-456789abcdef";
    const sha = "0123456789abcdef0123456789abcdef01234567";
    const result = scrubbed({ id: uuid, sha1: sha }) as { id: string; sha1: string };

    assert.match(result.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    assert.notEqual(result.id, uuid);
    assert.equal(result.sha1.length, sha.length);
    assert.notEqual(result.sha1, sha);
  });

  test("a hardware serial takes a same-length opaque replacement", () => {

    // A serial names one physical unit for its whole life, and the formats vary by device, so the replacement is sized to whatever it replaced rather than to any fixed
    // digest width. The controller spells the field both ways.
    const unitSerial = "UBNTX1234567";
    const result = scrubbed({ serial: unitSerial, serialNumber: "UBNT-9911" }) as { serial: string; serialNumber: string };

    assert.equal(result.serial.length, unitSerial.length);
    assert.notEqual(result.serial, unitSerial);
    assert.equal(result.serialNumber.length, "UBNT-9911".length);
    assert.notEqual(result.serialNumber, "UBNT-9911");
  });

  test("the site's locale is replaced by fixed placeholders", () => {

    // An IANA timezone names a city and a country code names a country, so both are location under another name. There is one of each per site and nothing points at
    // them, so a conventional value says as much as a minted pseudonym would.
    assert.deepEqual(scrubbed({ countryCode: "US", timezone: "America/New_York" }), { countryCode: "ZZ", timezone: "Etc/UTC" });
  });

  test("a coordinate is zeroed while the numbers beside it are untouched", () => {

    // A position is identity carried as numbers, which no string rule can reach. The neighbors are the other half of the promise: a settings block mixes coordinates
    // with ordinary readings, and replacing those would destroy evidence while protecting nothing.
    const result = scrubbed({ locationSettings: { isAway: false, latitude: 40.741895, longitude: -73.989308, radius: 200 } }) as {

      locationSettings: { isAway: boolean; latitude: number; longitude: number; radius: number };
    };

    assert.equal(result.locationSettings.latitude, 0);
    assert.equal(result.locationSettings.longitude, 0);
    assert.equal(result.locationSettings.radius, 200, "a number under any other key is evidence, not identity");
    assert.equal(result.locationSettings.isAway, false);
  });

  test("a coordinate that was never set stays null", () => {

    // A user's geofencing position is null until the feature is used. Null is not a position, so it comes through as itself rather than as a zero that would read as
    // one.
    const document = { location: { isAway: false, latitude: null, longitude: null } };

    assert.deepEqual(scrubbed(document), document);
  });

  test("an object under a coordinate key is walked rather than replaced", () => {

    // The coordinate rule reads the value's type as well as its key, so it can never stand in front of the structural paths. An implementation keyed on the name alone
    // would answer zero here and drop everything the object carried.
    const result = scrubbed({ latitude: { mac: "AABBCCDDEEFF", precision: 4 } }) as { latitude: { mac: string; precision: number } };

    assert.equal(result.latitude.precision, 4);
    assert.match(result.latitude.mac, /^[0-9A-F]{12}$/, "the walk went into the object and pseudonymized what was inside it");
    assert.notEqual(result.latitude.mac, "AABBCCDDEEFF");
  });

  test("values with nothing to hide pass through", () => {

    const document = { count: 3, empty: "", enabled: true, missing: null, modelKey: "camera", ratio: 1.5 };

    assert.deepEqual(scrubbed(document), document);
  });

  test("arrays and nesting recurse", () => {

    const result = scrubbed({ groups: [{ members: [{ mac: "AABBCCDDEEFF" }] }] }) as { groups: [{ members: [{ mac: string }] }] };

    assert.notEqual(result.groups[0].members[0].mac, "AABBCCDDEEFF");
    assert.match(result.groups[0].members[0].mac, /^[0-9A-F]{12}$/);
  });

  test("binary passes through untouched", () => {

    const bytes = Buffer.from([ 0xAA, 0xBB, 0xCC ]);
    const result = scrubbed({ payload: bytes }) as { payload: Buffer };

    assert.equal(result.payload, bytes, "bytes are not string territory, so the walk leaves them alone");
  });

  test("a base64 wrapper's bytes survive the shape rules, while a sibling string does not", () => {

    // Base64 text can coincidentally match the MAC shape. The wrapped payload is declared opaque where it is produced, so it is exempt - but the exemption is scoped
    // to that one member of that one shape, which is what the sibling proves.
    const encoded = "AABBCCDDEEFF";
    const result = scrubbed({ note: encoded, payload: { bytes: encoded, encoding: "base64" } }) as {

      note: string;
      payload: { bytes: string; encoding: string };
    };

    assert.equal(result.payload.bytes, encoded, "the wrapped payload is carried through byte-identical");
    assert.equal(result.payload.encoding, "base64");
    assert.notEqual(result.note, encoded, "a plain sibling carrying the same text is still pseudonymized");
  });

  test("the input document is not modified", () => {

    // A reference-identity check alone would pass an implementation that edited a nested object in place, so the whole document is compared against a snapshot of
    // itself taken before the call.
    const document = { devices: [{ mac: "AABBCCDDEEFF", name: "Front Door" }], nvr: { host: "10.0.0.1", token: "abcdef" } };
    const before = structuredClone(document);

    scrubbed(document);

    assert.deepEqual(document, before);
  });

  test("two contexts do not share a memory", () => {

    // One context per bundle: a later run must not be able to reverse an earlier one by comparing pseudonyms, and a run's numbering starts fresh.
    const first = scrub({ mac: "AABBCCDDEE01" }, createScrubContext()) as { mac: string };
    const second = scrub({ mac: "AABBCCDDEE02" }, createScrubContext()) as { mac: string };

    assert.equal(first.mac, second.mac, "each context numbers its own replacements from the start");
  });

  test("a bare value scrubs without a surrounding document", () => {

    assert.match(scrubbed("AABBCCDDEEFF") as string, /^[0-9A-F]{12}$/);
    assert.equal(scrubbed(42), 42);
  });
});
