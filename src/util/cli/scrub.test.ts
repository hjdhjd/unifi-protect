/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * scrub.test.ts: Unit tests for the capture scrub - referential consistency in both directions, key-over-shape precedence, key redaction, URL credential stripping,
 * the base64 wrapper exemption, and the promise that the input is never modified.
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

  test("a host key resolves by shape to an address or a hostname", () => {

    const result = scrubbed({ connectionHost: "10.0.0.5", host: "controller.example.com" }) as { connectionHost: string; host: string };

    assert.match(result.connectionHost, /^192\.0\.2\.\d+$/, "addresses land in the range reserved for documentation");
    assert.match(result.host, /^host-\d+\.test\.local$/);
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
