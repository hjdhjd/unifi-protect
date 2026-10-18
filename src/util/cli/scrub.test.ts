/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * scrub.test.ts: Unit tests for the capture scrub - referential consistency in both directions, key-over-shape precedence, the text-envelope key inheritance,
 * coordinate and locale replacement, key redaction, URL credential stripping, the base64 wrapper exemption, and the promise that the input is never modified.
 */
import { SCRUB_CATALOGS, createScrubContext, scrub } from "./scrub.ts";
import { describe, test } from "node:test";
import assert from "node:assert/strict";

// Scrub a value with a fresh context, for the cases that do not need one context spanning several calls.
function scrubbed(value: unknown): unknown {

  return scrub(value, createScrubContext());
}

/* A replacement memory that reports a count without holding one. Every mint reads its next index from the size of the memory it is minting into, so seeding that
 * size is what lets a test stand at the far end of a sequence without first minting the sixteen million stand-ins in front of it. Nothing else about the memory
 * changes: a lookup still misses, so the mint still runs and answers for the index it is handed.
 */
class SeededMemory extends Map<string, string> {

  readonly #seeded: number;

  constructor(seeded: number) {

    super();

    this.#seeded = seeded;
  }

  override get size(): number {

    return this.#seeded;
  }
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

  test("a hardware address keeps one stand-in and takes the styling of each occurrence", () => {

    /* The controller spells one device's address in either case and with or without separators, from one record to the next. A memory keyed by the text as it
     * arrived would mint a second stand-in for the second spelling and split one device in two; keying it by the library's own folded spelling and styling the
     * answer to the occurrence in hand is what keeps the device whole while each occurrence still reads in the form it arrived in. The hyphen and dot spellings
     * are what an operator's own material carries rather than what a controller sends, and they reach the same stand-in through the same fold.
     */
    const context = createScrubContext();
    const result = scrub({ bare: { mac: "02ffee000002" }, colons: { mac: "02:FF:EE:00:00:02" }, dots: { mac: "02ff.ee00.0002" },
      hyphens: { mac: "02-FF-EE-00-00-02" }, upper: { mac: "02FFEE000002" } }, context) as {

      bare: { mac: string };
      colons: { mac: string };
      dots: { mac: string };
      hyphens: { mac: string };
      upper: { mac: string };
    };

    assert.match(result.upper.mac, /^[0-9A-F]{12}$/);
    assert.equal(result.bare.mac, result.upper.mac.toLowerCase(), "a lowercase occurrence answers in lowercase");
    assert.equal(result.colons.mac, (result.upper.mac.match(/.{2}/g) ?? []).join(":"), "a colon-spelled occurrence answers with its colons");
    assert.equal(result.colons.mac.replaceAll(":", ""), result.upper.mac, "every spelling is one address underneath");
    assert.equal(result.hyphens.mac, result.upper.mac, "a hyphen-spelled address collapses onto the carried spelling and the same stand-in");
    assert.equal(result.dots.mac, result.upper.mac.toLowerCase(), "a dot-spelled address collapses onto the carried spelling and the same stand-in");
  });

  test("the shape arm and the key arm share one address memory and one styling", () => {

    /* One address can arrive under a cataloged key, under a key no catalog names, and as a map's key in the same bundle. All three reach the one mint, so what
     * decided that a value is an address changes nothing about which stand-in it gets or how that stand-in is spelled.
     */
    const context = createScrubContext();
    const spellings = [ "02ffee000002", "02:FF:EE:00:00:02", "02ff.ee00.0002", "02-FF-EE-00-00-02", "02FFEE000002" ];
    const result = scrub({ keyed: spellings.map((mac) => ({ mac })), novel: { vocSensorPeerAddress: spellings },
      peers: { "02-FF-EE-00-00-02": true } }, context) as {

      keyed: { mac: string }[];
      novel: { vocSensorPeerAddress: string[] };
      peers: Record<string, unknown>;
    };

    const keyed = result.keyed.map((entry) => entry.mac);
    const upper = keyed[4] ?? "";

    assert.match(upper, /^[0-9A-F]{12}$/);
    assert.deepEqual(result.novel.vocSensorPeerAddress, keyed, "a spelling answers the same way whether its key named it an address or its shape did");
    assert.equal(Object.keys(result.peers)[0], upper, "an address in a key position answers with the same stand-in, spelled the way the key spelled it");
    assert.equal(keyed[0], upper.toLowerCase(), "the bare lowercase spelling reads lowercase and contiguous");
    assert.equal(keyed[1], (upper.match(/.{2}/g) ?? []).join(":"), "the colon spelling keeps its colons");
    assert.equal(keyed[2], upper.toLowerCase(), "the dot spelling reads lowercase and contiguous");
    assert.equal(keyed[3], upper, "the hyphen spelling reads uppercase and contiguous");

    for(const [ index, answer ] of keyed.entries()) {

      assert.notEqual(answer, spellings[index], "no occurrence survives as itself");
    }
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

  test("a secret container clears every string beneath it and keeps its structure", () => {

    // A camera's stream credentials arrive as a structure whose member names are the controller's own and whose values are what opens the stream. No catalog can
    // anticipate those member names, so it is the container they sit in that says the values beneath them are secrets.
    const result = scrubbed({ credentials: { rtspPassword: "Tr0ub4dor-Horse-9x", streamUser: "protect-viewer" }, name: "Front Door" }) as {

      credentials: Record<string, string>;
      name: string;
    };

    assert.deepEqual(Object.keys(result.credentials), [ "rtspPassword", "streamUser" ], "the member names survive so the shape of the record is still readable");
    assert.match(result.credentials["rtspPassword"] ?? "", /^REDACTED-/);
    assert.match(result.credentials["streamUser"] ?? "", /^REDACTED-/);
    assert.ok(!JSON.stringify(result.credentials).includes("Tr0ub4dor"));
    assert.ok(!JSON.stringify(result.credentials).includes("protect-viewer"));
    assert.ok(result.name.startsWith("Test Device "), "a sibling outside the container is still judged by its own key");
  });

  test("a secret container reaches through an array as well as an object", () => {

    // The object element's member name is one no catalog carries, which is the case the container exists for: what says the value is a secret is the container
    // it sits in, not its own name.
    const result = scrubbed({ credentials: [ { rtspPassword: "9fT2xKqL8mNbVc4z" }, "kL9mQwErTyUiOp3a" ] }) as { credentials: [{ rtspPassword: string }, string] };

    assert.match(result.credentials[0].rtspPassword, /^REDACTED-/, "an object element is walked and its strings cleared");
    assert.match(result.credentials[1], /^REDACTED-/, "a bare string element is cleared where it stands");
  });

  test("a secret container clears the strings beneath it and leaves everything else as it found it", () => {

    // The container rule is about text, because text is what carries a credential. A timestamp, a flag, a member that was never set, and a binary payload are
    // evidence about when and how the secret is used, and destroying them would protect nothing.
    const bytes = Buffer.from([0x01]);
    const result = scrubbed({ credentials: { certificate: bytes, expiresAt: 1755300000, isActive: true, revokedAt: null,
      rtspPassword: "Tr0ub4dor-Horse-9x" } }) as {

      credentials: { certificate: Buffer; expiresAt: number; isActive: boolean; revokedAt: null; rtspPassword: string };
    };

    assert.match(result.credentials.rtspPassword, /^REDACTED-/);
    assert.equal(result.credentials.expiresAt, 1755300000);
    assert.equal(result.credentials.isActive, true);
    assert.equal(result.credentials.revokedAt, null);
    assert.equal(result.credentials.certificate, bytes);
    assert.deepEqual(scrubbed({ secret: "" }), { secret: "" }, "an empty secret has nothing to clear");
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
    const result = scrub({ camera: { apName: "Garage AP" }, controllerName: "Winterfell", nvr: { name: "Winterfell" }, ports: [{ name: "Garage AP" }] }, context) as {

      camera: { apName: string };
      controllerName: string;
      nvr: { name: string };
      ports: [{ name: string }];
    };

    assert.equal(result.camera.apName, result.ports[0].name, "an access point reads the same from its own record and from the camera reporting it");
    assert.equal(result.controllerName, result.nvr.name, "the controller name reads the same as the NVR record it is taken from");
    assert.notEqual(result.camera.apName, "Garage AP");
    assert.notEqual(result.controllerName, "Winterfell");
  });

  test("a name inside an event frame's text envelope is pseudonymized under the envelope's key", () => {

    // The wire hands a display value to the scrub wrapped in `{ text }`, so the inner string arrives under a key no catalog can responsibly claim. Inheriting the
    // envelope's key is what puts it back under the name regime.
    const result = scrubbed({ metadata: { sensorName: { text: "Upstairs Hallway" } } }) as { metadata: { sensorName: { text: string } } };

    assert.match(result.metadata.sensorName.text, /^Test Device \d+$/);
  });

  test("a sensor's own name and the envelope naming it in an event frame resolve to one stand-in", () => {

    // The same text reaches the scrub twice, once as the sensor record's `name` and once wrapped in an event frame's `sensorName` envelope. Both have to land on the
    // same stand-in or the bundle stops showing which sensor the event belongs to.
    const context = createScrubContext();
    const result = scrub({ event: { metadata: { sensorName: { text: "Basement Door" } } }, sensor: { name: "Basement Door" } }, context) as {

      event: { metadata: { sensorName: { text: string } } };
      sensor: { name: string };
    };

    assert.equal(result.event.metadata.sensorName.text, result.sensor.name, "the event's envelope reads the same as the sensor record it names");
    assert.notEqual(result.sensor.name, "Basement Door");
  });

  test("an envelope under a key no catalog names passes through on its own merits", () => {

    // Inheriting the wrapper's key only changes the outcome where that key is cataloged. A mount type is a fixed vocabulary word and a record id matches none of the
    // shape rules, so both survive the walk intact and the frame stays readable.
    const result = scrubbed({ metadata: { mountType: { text: "door" }, sensorId: { text: "61d9e2b04a7c8f0e5d3b1a92" } } }) as {

      metadata: { mountType: { text: string }; sensorId: { text: string } };
    };

    assert.equal(result.metadata.mountType.text, "door");
    assert.equal(result.metadata.sensorId.text, "61d9e2b04a7c8f0e5d3b1a92");
  });

  test("a text member keeps its own key when no wrapper key can lend it one", () => {

    // The inheritance needs a wrapper key to inherit, and a `text` at the top of a document has none. Both cases fall through to the shape rules, which is what keeps
    // the rule from reaching values that were never envelopes.
    const nested = scrubbed({ note: { text: "a free-form remark" } }) as { note: { text: string } };
    const bare = scrubbed({ text: "a free-form remark" }) as { text: string };

    assert.equal(nested.note.text, "a free-form remark");
    assert.equal(bare.text, "a free-form remark");
  });

  test("the overlay's camera name and the camera's own name resolve to one stand-in", () => {

    // A camera's overlay renders the camera's own name, so the same text reaches the scrub twice. Both have to land on the same stand-in or the overlay would caption
    // the video with a camera the rest of the bundle does not contain.
    const context = createScrubContext();
    const result = scrub({ camera: { name: "Side Yard", overlaySettings: { cameraName: "Side Yard" } } }, context) as {

      camera: { name: string; overlaySettings: { cameraName: string } };
    };

    assert.equal(result.camera.overlaySettings.cameraName, result.camera.name, "the overlay reads the same as the camera record it renders");
    assert.notEqual(result.camera.name, "Side Yard");
    assert.notEqual(result.camera.overlaySettings.cameraName, "Side Yard");
  });

  test("operator-authored text takes the name regime under its own key", () => {

    // Every string here is a line someone typed, which has no shape a fallback rule could recognize, so the key it arrived under is the only thing that can claim it.
    // The siblings carrying the wire's own vocabulary have to survive that, or the bundle stops showing how the feature was configured.
    const document = {

      doorbellSettings: {

        allMessages: [{ text: "LEAVE PACKAGE AT DOOR", type: "LEAVE_PACKAGE_AT_DOOR" }],
        customMessages: ["Please use the side door"],
        defaultMessageText: "WELCOME"
      },
      lcdMessage: { duration: 60, resetAt: null, text: "Back in five minutes", type: "CUSTOM_MESSAGE" },
      overlaySettings: { topLeft: { content: "{Datetime} {CameraName}", orientation: "horizontal" } }
    };
    const result = scrubbed(document) as {

      doorbellSettings: { allMessages: [{ text: string; type: string }]; customMessages: [string]; defaultMessageText: string };
      lcdMessage: { duration: number; text: string; type: string };
      overlaySettings: { topLeft: { content: string; orientation: string } };
    };

    assert.match(result.doorbellSettings.allMessages[0].text, /^Test allMessages \d+$/);
    assert.equal(result.doorbellSettings.allMessages[0].type, "LEAVE_PACKAGE_AT_DOOR", "the message type is a fixed vocabulary word and survives the walk");
    assert.match(result.doorbellSettings.customMessages[0], /^Test customMessages \d+$/);
    assert.match(result.doorbellSettings.defaultMessageText, /^Test defaultMessageText \d+$/);
    assert.match(result.lcdMessage.text, /^Test lcdMessage \d+$/);
    assert.equal(result.lcdMessage.type, "CUSTOM_MESSAGE");
    assert.equal(result.lcdMessage.duration, 60, "a duration is a number no rule reaches");
    assert.match(result.overlaySettings.topLeft.content, /^Test content \d+$/);
    assert.equal(result.overlaySettings.topLeft.orientation, "horizontal");
  });

  test("a user's saved searches are pseudonymized one search at a time", () => {

    // The search history is a bare array of phrases a person typed, and each element inherits the key its array arrived under, so the list comes out as many stand-ins
    // rather than collapsing onto one.
    const result = scrubbed({ settings: { web: { AI_SEARCH_RECENT_SEARCHES: [ "mail truck", "person at the front door" ] } } }) as {

      settings: { web: { AI_SEARCH_RECENT_SEARCHES: [ string, string ] } };
    };

    assert.match(result.settings.web.AI_SEARCH_RECENT_SEARCHES[0], /^Test AI_SEARCH_RECENT_SEARCHES \d+$/);
    assert.match(result.settings.web.AI_SEARCH_RECENT_SEARCHES[1], /^Test AI_SEARCH_RECENT_SEARCHES \d+$/);
    assert.notEqual(result.settings.web.AI_SEARCH_RECENT_SEARCHES[0], result.settings.web.AI_SEARCH_RECENT_SEARCHES[1]);
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

  test("an IPv6 address is replaced under a host key, by its shape, and as an object key", () => {

    // The same three placements an IPv4 address is caught in, and the one memory behind all of them.
    const result = scrubbed({ host: "2001:db8:1234::5", peers: { "2001:db8:1234::5": true }, vocSensorPeer: "2001:db8:1234::5" }) as {

      host: string;
      peers: Record<string, unknown>;
      vocSensorPeer: string;
    };

    assert.match(result.host, /^2001:db8::[0-9a-f:]+$/, "stand-ins land in the prefix reserved for documentation");
    assert.match(result.vocSensorPeer, /^2001:db8::[0-9a-f:]+$/);
    assert.match(Object.keys(result.peers)[0] ?? "", /^2001:db8::[0-9a-f:]+$/);
    assert.equal(result.vocSensorPeer, result.host, "one address is one stand-in wherever it appears");
    assert.equal(Object.keys(result.peers)[0], result.host);
  });

  test("every spelling of one IPv6 address shares a stand-in through its canonical form", () => {

    /* One address has several valid spellings: the case of its digits, where the run of zero groups is compressed, whether a group carries leading zeros. A
     * memory keyed by the text as it arrived would mint a second stand-in for the second spelling and split one host in two.
     */
    const result = scrubbed({ compressed: "2001:db8::1", expanded: "2001:DB8:0:0:0:0:0:1", other: "2001:db8::2", padded: "2001:0db8::0001" }) as {

      compressed: string;
      expanded: string;
      other: string;
      padded: string;
    };

    assert.match(result.expanded, /^2001:db8::[0-9a-f:]+$/);
    assert.equal(result.compressed, result.expanded, "the compressed spelling names the same host");
    assert.equal(result.padded, result.expanded, "leading zeros do not make a second host");
    assert.notEqual(result.other, result.expanded, "and an address that really is different still gets its own stand-in");
  });

  test("the 65536th IPv6 stand-in is written as groups rather than as one long number", () => {

    // A counter written straight into the last group stops spelling an address the moment it runs past sixteen bits, so the index is written as colon-joined
    // groups and the stand-in stays IPv6-shaped at any count a bundle can reach.
    const context = createScrubContext();
    const addresses: string[] = [];

    for(let index = 0; index < 65536; index++) {

      addresses.push("fd00:" + index.toString(16) + "::1");
    }

    const result = scrub({ peers: addresses }, context) as { peers: string[] };

    assert.equal(result.peers[0], "2001:db8::1", "the first stand-in is the first host in the documentation prefix");
    assert.equal(result.peers[65535], "2001:db8::1:0", "the 65536th carries into a second group rather than overflowing the first");
    assert.equal(new Set(result.peers).size, 65536, "and none of them repeats");
  });

  test("a dotted IPv4-mapped literal shares the IPv4 memory and answers in the mapped shape", () => {

    /* A mapped literal names an IPv4 host, so it is answered out of that family's memory and handed back in the shape it arrived in. Keyed by its canonical IPv6
     * form instead, it would mint a "2001:db8::" stand-in and the record spelling the host one way would stop pointing at the record spelling it the other.
     */
    const context = createScrubContext();
    const result = scrub({ host: "::ffff:10.0.0.1", ip: "10.0.0.1", peer: "::FFFF:10.0.0.1" }, context) as { host: string; ip: string; peer: string };

    assert.match(result.host, /^::ffff:192\.0\.2\.\d+$/);
    assert.equal(result.host, "::ffff:" + result.ip, "the mapped answer carries the very stand-in the plain address received");
    assert.equal(result.peer, result.host, "an uppercase mapped prefix is the same literal, which is what keeps it out of the IPv6 memory");
  });

  test("a zone-scoped literal is replaced, and two of them stay two", () => {

    // A zone-scoped literal is the one spelling the URL parser refuses, so its memory is keyed by its lowercase text instead. That folds the difference that does
    // vary, while two literals naming different hosts still take different stand-ins.
    const result = scrubbed({ first: "fe80::1%eth0", second: "fe80::2%eth0", third: "FE80::1%eth0" }) as { first: string; second: string; third: string };

    assert.match(result.first, /^2001:db8::/);
    assert.match(result.second, /^2001:db8::/);
    assert.notEqual(result.first, result.second, "two addresses that differ stay two");
    assert.equal(result.third, result.first, "and the same address in the other case is still one");
  });

  test("a malformed dotted quad is not an address on either path", () => {

    // The parser is narrower than a four-number pattern, and rightly so: 300 is not an octet, so this is not an address and the scrub does not pretend it is.
    // Under a host key it is still a host and takes the hostname mint; under a key no catalog names there is nothing left to judge it by.
    const result = scrubbed({ host: "300.1.2.3", vocSensorGateway: "300.1.2.3" }) as { host: string; vocSensorGateway: string };

    assert.match(result.host, /^host-\d+\.test\.local$/, "a host key whose value is not an address falls to the hostname mint");
    assert.equal(result.vocSensorGateway, "300.1.2.3", "and under an uncataloged key it is left exactly as it stands");
  });

  test("address stand-ins walk the documentation blocks in order and continue past them", () => {

    /* Referential consistency means a stand-in can never repeat, so the sequence cannot cycle inside one block. It walks the three blocks RFC 5737 reserves for
     * documentation and then continues in a range that never routes, which is what keeps the promise at any size a capture can reach.
     */
    const context = createScrubContext();
    const addresses: string[] = [];

    for(let index = 0; index < 763; index++) {

      addresses.push("10." + Math.floor(index / 65536).toString() + "." + (Math.floor(index / 256) % 256).toString() + "." + (index % 256).toString());
    }

    const result = scrub({ peers: addresses }, context) as { peers: string[] };

    assert.equal(new Set(result.peers).size, 763, "no stand-in repeats");
    assert.equal(result.peers[0], "192.0.2.1");
    assert.equal(result.peers[253], "192.0.2.254", "the first block runs to its 254th host");
    assert.equal(result.peers[254], "198.51.100.1", "and the second one starts");
    assert.equal(result.peers[507], "198.51.100.254");
    assert.equal(result.peers[508], "203.0.113.1");
    assert.equal(result.peers[761], "203.0.113.254", "the third block ends the documentation ranges");
    assert.equal(result.peers[762], "0.0.0.1", "past them the sequence continues in the range that never routes");
  });

  test("the address mint refuses at its ceiling, and answers the last stand-in below it", () => {

    /* Three documentation blocks of 254 hosts each is 762 stand-ins, and the range that never routes adds 16777215 more, so the sequence holds 16777977 in all
     * and its indices run from 0 through 16777976. A silent repeat is the defect the second tier exists to remove, so the mint refuses rather than reuse once
     * the sequence is spent. No capture comes anywhere near that far, which is why the memory is seeded here rather than filled.
     */
    const spent = createScrubContext();

    spent.replacements.set("ip", new SeededMemory(16777977));

    assert.throws(() => scrub({ ip: "10.0.0.1" }, spent), { message: /no unrepeated address stand-in left/ },
      "the mint refuses once every stand-in has been issued");

    const last = createScrubContext();

    last.replacements.set("ip", new SeededMemory(16777976));

    assert.deepEqual(scrub({ ip: "10.0.0.1" }, last), { ip: "0.255.255.255" },
      "and the index just below the ceiling answers with the last address the range that never routes holds");
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

  test("a version survives every member the wire spells it under, while an address under an address key still does not", () => {

    /* The version keys answer ahead of the shape rules, because the four-part spelling a controller sometimes sends is what an address looks like to a guard that
     * reads shape alone. Every member is planted here rather than a sample, each with its own address-shaped value, so a key dropped from the catalog fails in
     * this test rather than by quietly destroying the evidence a bundle is collected for.
     */
    const versions = { accessVersion: "9.8.7.1", actualVersion: "9.8.7.2", firmwareVersion: "9.8.7.3", latestFirmwareVersion: "9.8.7.4",
      mediaVersion: "9.8.7.5", minFirmwareVersion: "9.8.7.6", previousFirmwareVersion: "9.8.7.7", softwareVersion: "9.8.7.8", swaiVersion: "9.8.7.9",
      ucoreVersion: "9.8.7.10", uiVersion: "9.8.7.11", ulpVersion: "9.8.7.12", updateVersion: "9.8.7.13", version: "9.8.7.14" };

    assert.deepEqual(scrubbed(versions), versions, "every version member carries its value through untouched");
    assert.deepEqual(scrubbed({ firmwareVersion: "v9.8.7", version: "9.8.7+1234" }), { firmwareVersion: "v9.8.7", version: "9.8.7+1234" },
      "a prefixed or build-tagged spelling comes through the same way");

    const mixed = scrubbed({ firmwareVersion: "9.8.7.6", ip: "10.13.0.42", mac: "02FFEE000002" }) as { firmwareVersion: string; ip: string; mac: string };

    assert.equal(mixed.firmwareVersion, "9.8.7.6", "a version that happens to be address-shaped is still a version");
    assert.match(mixed.ip, /^192\.0\.2\.\d+$/, "and an address beside it is still replaced, which is the polarity that makes the rule a rule");
    assert.match(mixed.mac, /^[0-9A-F]{12}$/);

    /* The accepted limit of deciding by key: the same four numbers under a key no catalog names are read as the address they look like. The shape rules exist to
     * reach fields this library has never modeled, and that reach is worth more than a promise that every version everywhere survives.
     */
    const uncataloged = scrubbed({ vocSensorBuild: "9.8.7.6" }) as { vocSensorBuild: string };

    assert.match(uncataloged.vocSensorBuild, /^192\.0\.2\.\d+$/, "a version under an uncataloged key is judged by its shape, which reads it as an address");
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

  test("SCRUB_CATALOGS names every key catalog as a frozen list bound to its own members", () => {

    /* Anything that needs to know what this engine treats as identity reads it here rather than out of the source. The lists are frozen copies, so reaching them
     * through the export can neither widen nor narrow what the scrub protects.
     */
    assert.deepEqual(Object.keys(SCRUB_CATALOGS).sort(), [ "COORDINATE_KEYS", "DEVICE_NAME_KEYS", "HASH_KEYS", "HOST_KEYS", "LOCALE_KEYS", "MAC_KEYS",
      "NAME_KEYS", "SECRET_KEYS", "USERNAME_KEYS", "VERSION_KEYS" ]);
    assert.equal(Object.isFrozen(SCRUB_CATALOGS), true, "the wrapper is frozen");

    for(const [ name, list ] of Object.entries(SCRUB_CATALOGS)) {

      assert.equal(Object.isFrozen(list), true, name + " is frozen");
    }

    assert.throws(() => (SCRUB_CATALOGS.MAC_KEYS as string[]).push("intruder"), TypeError, "a push into a frozen list throws rather than widening a catalog");

    /* Each list has to be bound to its own catalog rather than merely to some catalog. A member no other catalog holds is present in its own list and absent from
     * every other one, so binding a name to the wrong catalog reds this test.
     */
    const unique = { COORDINATE_KEYS: "latitude", HASH_KEYS: "sha256", HOST_KEYS: "host", LOCALE_KEYS: "timezone", MAC_KEYS: "mac", NAME_KEYS: "ssid",
      SECRET_KEYS: "password", USERNAME_KEYS: "username", VERSION_KEYS: "firmwareVersion" };

    for(const [ owner, member ] of Object.entries(unique)) {

      for(const [ name, list ] of Object.entries(SCRUB_CATALOGS)) {

        assert.equal(list.includes(member), name === owner, member + " belongs to " + owner + " alone, and " + name + " answers accordingly");
      }
    }

    // Every device-name key is also a name key, so the device-name list has no member of its own to be caught by. What tells the two apart is a name key it does
    // not hold.
    assert.equal(SCRUB_CATALOGS.DEVICE_NAME_KEYS.includes("apName"), true);
    assert.equal(SCRUB_CATALOGS.DEVICE_NAME_KEYS.includes("ssid"), false, "binding this list to the name catalog would show up here");
  });
});
