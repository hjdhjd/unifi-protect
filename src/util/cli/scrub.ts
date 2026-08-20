/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * scrub.ts: Referentially-consistent pseudonymization of captured controller data, so a bundle can leave a user's site carrying evidence but no secrets.
 */

/**
 * The scrub: it replaces every identifying value in a captured document with a synthetic stand-in, and replaces the same input with the same stand-in everywhere it
 * appears.
 *
 * Referential consistency is the property that makes a scrubbed bundle still useful. A camera's MAC appears in its own record, in the NVR's device list, and in a
 * feature-flag map keyed by that MAC; if each occurrence got a fresh pseudonym, the relationships between records would be destroyed and the bundle would stop
 * describing a system. One replacement memory per bundle keeps every cross-reference intact while none of the real values survive.
 *
 * Two rules decide what a string becomes. The key it arrived under decides first, so a device named "192.168.1.5" is pseudonymized as a name rather than as an
 * address. Failing that, the value's own shape decides, which is what catches identifying values under keys no catalog anticipated - including fields on device classes
 * this version of the library has never seen, which is exactly the traffic a capture exists to collect.
 *
 * Numbers are otherwise left alone, with one exception. A latitude or a longitude carries a site's or a person's position, identity the string rules can never reach, so
 * a number arriving under a coordinate key becomes zero - the field stays numeric, and it points nowhere a real installation could be.
 *
 * Replacements are chosen to stay in their original shape: MACs stay MAC-shaped and locally administered, addresses land in the range reserved for documentation, UUIDs
 * stay UUID-shaped, and cleared secrets keep their original length. A consumer reading the bundle sees data that still parses and still lines up.
 *
 * @module ProtectCliScrub
 */

// The replacement categories. Each keeps its own memory, so a hostname and a device name that happen to share text never collapse onto one pseudonym.
type ScrubCategory = "email" | "hash" | "host" | "ip" | "mac" | "name" | "token" | "uuid";

/**
 * The replacement memory for one scrub run.
 *
 * One context scrubs one bundle: every value it has already replaced is remembered, so the same input maps to the same output for as long as the context lives, and
 * nothing carries over to the next run. Create it with {@link createScrubContext} and pass the same one to every {@link scrub} call that makes up a document.
 *
 * @category CLI
 */
export interface ScrubContext {

  readonly replacements: Map<ScrubCategory, Map<string, string>>;
}

// Keys whose values are secrets regardless of what they look like. Cleared rather than pseudonymized. A stream alias and a share link belong here even though they read
// as ordinary strings: each one grants access to a camera's stream on its own, and the wire spells the alias two ways, so clearing only one of them would leave the
// stream reachable. A share link carries its capability in the URL path, which is why it is cleared whole rather than left to the credential stripping that only
// reaches a URL's authority.
const SECRET_KEYS: ReadonlySet<string> = new Set([

  "accessKey", "anonymousDeviceId", "credentials", "hardwareId", "hashedPassword", "homekitSetupCode", "homekitSetupPayload", "internalRtspAlias", "macTouched",
  "pairingCode", "password", "pin", "privateKey", "psk", "publicKey", "rtspAlias", "secret", "shareLink", "ssoToken", "tlsCertificate", "tlsKey", "token",
  "wifiPassword"
]);

// Keys carrying a display name a person chose. Pseudonymized to a readable stand-in, so a bundle still reads as a system rather than a wall of tokens. Every entry is a
// label chosen by a person or an operator - a door, a greeting, a stream, a support file - which is identity no shape rule can recognize, since the text is arbitrary.
const NAME_KEYS: ReadonlySet<string> = new Set([

  "apName", "controllerName", "displayName", "doorName", "firstName", "foreignPgDumpConsoleName", "fullName", "globalAlarmManagerScopeNames",
  "greetingBroadcastName", "label", "lastName", "localStreamName", "loginName", "name", "ssid", "supportFileName"
]);

// The name keys that are, by construction, a copy of a device name recorded under `name` somewhere else in the same document: an access point's own record carries the
// `apName` a camera reports, and the controller name is the NVR record's own name. They share one hint below so the copy and the original resolve to the same stand-in
// and the cross-reference between the two records survives.
const DEVICE_NAME_KEYS: ReadonlySet<string> = new Set([ "apName", "controllerName", "name" ]);

// Keys carrying a login someone signs in with. A login is a display-name-class value, so it takes the name regime rather than a category of its own - and the wire
// spells the same concept several ways, a user record naming it one way, an activity frame's metadata another, and a shared stream naming the account that shared it,
// so all the spellings share one hint below and one account keeps one stand-in across them.
const USERNAME_KEYS: ReadonlySet<string> = new Set([ "localUsername", "sharedByUser", "userName", "username" ]);

// Keys carrying an address or a hostname. The value's own shape picks which of the two it is, and an array under one of these keys resolves element by element, so a
// `hosts` list of mixed addresses and names comes out mixed the same way.
const HOST_KEYS: ReadonlySet<string> = new Set([

  "connectionHost", "externalHost", "host", "hostShortname", "hosts", "internalHost", "lastMotionCameraAddress", "publicIp", "rtspHost"
]);

// Keys carrying a hardware address. `anonymousId` is MAC-shaped on the wire and belongs here, while the similarly named `anonymousDeviceId` is an opaque token and is
// cleared as a secret above - close names, different shapes, different handling.
const MAC_KEYS: ReadonlySet<string> = new Set([ "anonymousId", "bridgeMac", "mac" ]);

// Keys carrying a checksum or a hardware serial. Not sensitive in themselves, but they identify exact firmware, file contents, and individual units, so they are replaced
// with same-length stand-ins - a width that fits arbitrary serial formats as readily as fixed-width digests. `serialNumber` is an observed wire spelling that the types
// do not declare; the scrub reads wire keys, so the catalog rightly covers what a controller sends rather than only what the library models.
const HASH_KEYS: ReadonlySet<string> = new Set([ "checksum", "fingerprint", "md5", "serial", "serialNumber", "sha1", "sha256" ]);

// Keys carrying the site's locale, each replaced by a fixed placeholder rather than a minted pseudonym. An IANA timezone names a city and a country code names a country,
// so both are location by another route...but they are one-per-site properties with nothing cross-referencing them, so a conventional stand-in carries everything a
// pseudonym would while reading as obviously synthetic. "ZZ" is the ISO 3166 code reserved for private use, and "Etc/UTC" is the zone that names no place.
const LOCALE_KEYS: ReadonlyMap<string, string> = new Map([ [ "countryCode", "ZZ" ], [ "timezone", "Etc/UTC" ] ]);

// Keys carrying a geographic position, and the module's one rule that reads a number. A coordinate is identity expressed numerically, so no string rule can reach it; the
// replacement is a fixed zero rather than a pseudonym, for the same reason the locale keys take one - a position has no cross-reference worth preserving.
const COORDINATE_KEYS: ReadonlySet<string> = new Set([ "latitude", "longitude" ]);

// Shape guards, each anchored so it recognizes a value that is entirely of that shape rather than one that merely contains it.
const MAC_PATTERN = /^[0-9a-fA-F]{12}$|^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/;
const IP_PATTERN = /^(\d{1,3}\.){3}\d{1,3}$/;
const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The fixed width of a cleared secret's prefix: "REDACTED-" plus eight hex digits plus the separator. Subtracted from the original length so the replacement is the
// same length as what it replaced.
const TOKEN_PREFIX_WIDTH = 18;

/**
 * Create a replacement memory for one bundle.
 *
 * @returns A fresh context, remembering nothing.
 *
 * @category CLI
 */
export function createScrubContext(): ScrubContext {

  return { replacements: new Map() };
}

// Look up a value's replacement, minting one on first sight. The mint receives the count of replacements already issued in that category, which is what makes the
// synthetic values run in a stable, readable sequence within a run.
function remember(context: ScrubContext, category: ScrubCategory, value: string, mint: (index: number) => string): string {

  let known = context.replacements.get(category);

  if(known === undefined) {

    known = new Map<string, string>();
    context.replacements.set(category, known);
  }

  const existing = known.get(value);

  if(existing !== undefined) {

    return existing;
  }

  const minted = mint(known.size);

  known.set(value, minted);

  return minted;
}

// A synthetic MAC in the locally-administered range, matching the separator style of the value it replaces (the wire uses both forms).
function scrubMac(context: ScrubContext, value: string): string {

  return remember(context, "mac", value, (index) => {

    const hex = "AABBCC" + index.toString(16).padStart(6, "0").toUpperCase();

    return value.includes(":") ? (hex.match(/.{2}/g) ?? [hex]).join(":") : hex;
  });
}

// A synthetic address in TEST-NET-1, the range RFC 5737 reserves for documentation, so nothing in a bundle can ever be mistaken for a routable host.
function scrubIp(context: ScrubContext, value: string): string {

  return remember(context, "ip", value, (index) => "192.0.2." + ((index % 254) + 1).toString());
}

// A synthetic UUID that keeps the dash layout, so length and format checks downstream still pass.
function scrubUuid(context: ScrubContext, value: string): string {

  return remember(context, "uuid", value, (index) => "00000000-0000-0000-0000-" + index.toString(16).padStart(12, "0"));
}

// A synthetic hostname.
function scrubHostname(context: ScrubContext, value: string): string {

  return remember(context, "host", value, (index) => "host-" + (index + 1).toString() + ".test.local");
}

// A synthetic email address. Referential like every other category: the same address always becomes the same stand-in, so a bundle still shows that two records name
// the same person.
function scrubEmail(context: ScrubContext, value: string): string {

  return remember(context, "email", value, (index) => "user-" + (index + 1).toString() + "@example.com");
}

// A synthetic display name, seeded by the key it arrived under so the result reads as what it is - a `name` becomes "Test Device 1" and an `ssid` becomes "Test ssid 1".
// The memory is keyed by hint and value together, because the same text under two different keys deserves two differently-worded stand-ins.
//
// Two families are the exception, each because its several spellings name one thing. Every spelling of a login collapses onto the single `username` hint, so one account
// referenced from a user record and from an event's metadata shares a stand-in; every spelling of a device's own name collapses onto the `Device` hint, so a camera's
// `apName` and that access point's own record read as one device. Both cross-references survive the scrub because of it.
function scrubName(context: ScrubContext, value: string, key: string): string {

  const hint = USERNAME_KEYS.has(key) ? "username" : (DEVICE_NAME_KEYS.has(key) ? "Device" : key);

  return remember(context, "name", hint + "|" + value, (index) => "Test " + hint + " " + (index + 1).toString());
}

// Clear a secret, preserving its length so a bundle still shows how long the real value was without showing any of it.
function scrubToken(context: ScrubContext, value: string): string {

  return remember(context, "token", value, (index) => "REDACTED-" + index.toString(16).padStart(8, "0") + "-" +
    "x".repeat(Math.max(0, value.length - TOKEN_PREFIX_WIDTH)));
}

// Replace a checksum with a same-length stand-in. The replacement is stable within a run but derived from encounter order rather than content, so it says nothing about
// the original.
function scrubHash(context: ScrubContext, value: string): string {

  return remember(context, "hash", value, (index) => ("0".repeat(Math.max(0, value.length - 8)) + index.toString(16).padStart(8, "0")).slice(0, value.length));
}

// Strip any credentials embedded in a URL's authority. A capture can carry an RTSP or HTTP URL with a username and password in it, which no key catalog would catch,
// because the secret is inside the value rather than under a telling key. A value that is not a URL is returned untouched for the rest of the pipeline to judge.
function stripUrlCredentials(value: string): string {

  let url: URL;

  try {

    url = new URL(value);
  } catch {

    return value;
  }

  if((url.username === "") && (url.password === "")) {

    return value;
  }

  url.username = "";
  url.password = "";

  return url.toString();
}

// Whether a value is a plain JSON object. Buffers and typed arrays answer `typeof` as objects but are binary, and arrays are handled on their own path, so the
// prototype is what the test reads.
function isPlainObject(value: unknown): value is Record<string, unknown> {

  if((typeof value !== "object") || (value === null)) {

    return false;
  }

  const prototype: unknown = Object.getPrototypeOf(value);

  return (prototype === Object.prototype) || (prototype === null);
}

// Whether an object is the base64 wrapper the bundle wraps binary payloads in. Its `bytes` member is declared opaque and unscrubbed where it is produced, and base64
// text can coincidentally match the MAC or UUID shapes, so recognizing the wrapper here keeps the shape rules from mangling an encoded payload. The exemption is
// scoped to that one member of that one shape - every sibling field is scrubbed normally.
function isBase64Wrapper(value: Record<string, unknown>): boolean {

  return (value["encoding"] === "base64") && (typeof value["bytes"] === "string");
}

// Replace one string, key first and shape second.
function scrubString(context: ScrubContext, value: string, key: string | undefined): string {

  if(value.length === 0) {

    return value;
  }

  const stripped = stripUrlCredentials(value);

  // The key decides first, so a device named after an address is still pseudonymized as a name.
  if(key !== undefined) {

    if(SECRET_KEYS.has(key)) {

      return scrubToken(context, stripped);
    }

    if(NAME_KEYS.has(key) || USERNAME_KEYS.has(key)) {

      return scrubName(context, stripped, key);
    }

    if(MAC_KEYS.has(key)) {

      return scrubMac(context, stripped);
    }

    if(HOST_KEYS.has(key)) {

      return IP_PATTERN.test(stripped) ? scrubIp(context, stripped) : scrubHostname(context, stripped);
    }

    if(HASH_KEYS.has(key)) {

      return scrubHash(context, stripped);
    }

    // A locale value is answered from the fixed table rather than the replacement memory, so the lookup doubles as the test for whether this is a locale key at all.
    const locale = LOCALE_KEYS.get(key);

    if(locale !== undefined) {

      return locale;
    }
  }

  // Shape decides for everything the catalogs above do not name. This is what covers fields on device classes the library has never seen, which is the whole reason a
  // capture is worth collecting and the reason novelty evidence is safe to include.
  if(MAC_PATTERN.test(stripped)) {

    return scrubMac(context, stripped);
  }

  if(IP_PATTERN.test(stripped)) {

    return scrubIp(context, stripped);
  }

  if(UUID_PATTERN.test(stripped)) {

    return scrubUuid(context, stripped);
  }

  if(EMAIL_PATTERN.test(stripped)) {

    return scrubEmail(context, stripped);
  }

  return stripped;
}

// Replace an object key that is itself identifying. Some controller maps are keyed by raw MAC or UUID, so a scrub that only touched values would leave the identifiers
// sitting in the key positions.
function scrubKey(context: ScrubContext, key: string): string {

  if(MAC_PATTERN.test(key)) {

    return scrubMac(context, key);
  }

  if(UUID_PATTERN.test(key)) {

    return scrubUuid(context, key);
  }

  if(IP_PATTERN.test(key)) {

    return scrubIp(context, key);
  }

  return key;
}

/**
 * Scrub a captured value, returning a pseudonymized copy.
 *
 * The input is never modified: objects and arrays are rebuilt rather than edited, so a caller may keep using the original.
 *
 * Binary values pass through untouched. Bytes are not string territory, and the layer that assembles a bundle is what decides how to carry them.
 *
 * @param value - Any JSON-shaped value: a whole document, a record, or a single field.
 * @param context - The replacement memory. Pass one context through a whole bundle so its cross-references survive.
 *
 * @returns The scrubbed copy.
 *
 * @category CLI
 */
export function scrub(value: unknown, context: ScrubContext): unknown {

  return scrubValue(value, context, undefined);
}

// The recursive walk. `key` is the name the value arrived under, which is what lets the key catalogs decide ahead of the shape rules.
function scrubValue(value: unknown, context: ScrubContext, key: string | undefined): unknown {

  if(typeof value === "string") {

    return scrubString(context, value, key);
  }

  // The one numeric replacement. Gating on the number type as well as the key is what keeps it from shadowing anything else: a null coordinate still returns null below,
  // a string one still follows the string rules above, and an object or an array under the same key still takes its structural path.
  if((typeof value === "number") && (key !== undefined) && COORDINATE_KEYS.has(key)) {

    return 0;
  }

  if((value === null) || (value === undefined) || ArrayBuffer.isView(value)) {

    return value;
  }

  if(Array.isArray(value)) {

    // Every element inherits the key its array arrived under, so an array of MACs under a `macs` key is treated the same as a single one would be.
    return value.map((element) => scrubValue(element, context, key));
  }

  if(isPlainObject(value)) {

    const wrapped = isBase64Wrapper(value);
    const scrubbed: Record<string, unknown> = {};

    for(const [ name, inner ] of Object.entries(value)) {

      scrubbed[scrubKey(context, name)] = (wrapped && (name === "bytes")) ? inner : scrubValue(inner, context, name);
    }

    return scrubbed;
  }

  return value;
}
