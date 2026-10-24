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
 * Replacements are chosen to stay in their original shape: MACs stay MAC-shaped and locally administered, addresses land in the ranges reserved for documentation
 * and, past those, in a range that never routes, UUIDs stay UUID-shaped, and cleared secrets keep their original length. A consumer reading the bundle sees data
 * that still parses and still lines up.
 *
 * @module ProtectCliScrub
 */
import { isIPv4, isIPv6 } from "node:net";
import { isMacAddress, normalizeMacAddress } from "../../index.ts";
import { isPlainObject } from "./shared.ts";

// The replacement categories. Each keeps its own memory, so a hostname and a device name that happen to share text never collapse onto one pseudonym. The two
// internet-address families keep separate memories so each family's sequence of stand-ins stays dense and readable.
type ScrubCategory = "email" | "hash" | "host" | "ip" | "ipv6" | "mac" | "name" | "token" | "uuid";

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

// Keys carrying a display name a person chose, or a line a person wrote. Pseudonymized to a readable stand-in, so a bundle still reads as a system rather than a wall
// of tokens. Every entry is a label or a line an operator authored - a door, a greeting, a stream, a support file, an overlay corner's text, the doorbell's custom,
// stock, and default messages, a camera's LCD message, a user's saved AI search history - which is identity no shape rule can recognize, since the text is arbitrary.
// A key holding an array of such strings, or a `{ text }` envelope under it, resolves through this catalog by the inheritance rules below: an array element takes the
// key its array arrived under, and a `text` member takes its wrapper's key.
const NAME_KEYS: ReadonlySet<string> = new Set([

  "AI_SEARCH_RECENT_SEARCHES", "allMessages", "apName", "cameraName", "content", "controllerName", "customMessages", "defaultMessageText", "displayName",
  "doorName", "firstName", "foreignPgDumpConsoleName", "fullName", "globalAlarmManagerScopeNames", "greetingBroadcastName", "label", "lastName", "lcdMessage",
  "localStreamName", "loginName", "name", "sensorName", "ssid", "supportFileName"
]);

// The name keys that are, by construction, a copy of a device name recorded under `name` somewhere else in the same document: an access point's own record carries the
// `apName` a camera reports, an overlay's `cameraName` is the camera's own name as the overlay renders it, the controller name is the NVR record's own name, and an
// event frame's metadata names the sensor whose own record carries the same text under `name`. They share one hint below so the copy and the original resolve to the
// same stand-in and the cross-reference between the two records survives.
const DEVICE_NAME_KEYS: ReadonlySet<string> = new Set([ "apName", "cameraName", "controllerName", "name", "sensorName" ]);

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

// Keys carrying a version, which is evidence about what a system is running and never identity of who or where it is. These answer ahead of the shape rules,
// because the four-part spelling a controller sometimes sends is exactly what an address looks like to a guard that reads shape and nothing else, so a version
// would otherwise land in the ranges reserved for documentation and take the evidence a bundle was collected for with it. The catalog is the version members this
// library's own wire types declare, including the bare `version` a record spells it as. A version under a key no catalog names is still read by its shape, which
// is the accepted limit of a rule that decides by key: the shape rules exist to reach fields this library has never modeled, and that reach is worth more than a
// guarantee that every version everywhere survives.
const VERSION_KEYS: ReadonlySet<string> = new Set([

  "accessVersion", "actualVersion", "firmwareVersion", "latestFirmwareVersion", "mediaVersion", "minFirmwareVersion", "previousFirmwareVersion",
  "softwareVersion", "swaiVersion", "ucoreVersion", "uiVersion", "ulpVersion", "updateVersion", "version"
]);

// One catalog's member names as a frozen list. A set's keys are its own values and a map's keys are its member names, so the same reader serves both kinds of
// catalog and the export below needs no per-catalog spelling.
function members(catalog: ReadonlyMap<string, string> | ReadonlySet<string>): readonly string[] {

  return Object.freeze([...catalog.keys()]);
}

/**
 * The key catalogs, each under its own name, as frozen lists of the member names it holds.
 *
 * These are what the scrub decides by key rather than by shape. Anything that needs to know which members this engine treats as identity asks the engine here,
 * rather than reading the catalogs out of its source and going stale the first time one of them grows a member.
 *
 * Each list is a copy taken and frozen when this module loads, so nothing reachable through this export can reach the catalogs the engine itself reads, and no
 * consumer can widen or narrow what the scrub protects. The catalogs are the whole of what a key decides; the shape guards decide everything else.
 *
 * @category CLI
 */
export const SCRUB_CATALOGS = Object.freeze({

  COORDINATE_KEYS: members(COORDINATE_KEYS),
  DEVICE_NAME_KEYS: members(DEVICE_NAME_KEYS),
  HASH_KEYS: members(HASH_KEYS),
  HOST_KEYS: members(HOST_KEYS),
  LOCALE_KEYS: members(LOCALE_KEYS),
  MAC_KEYS: members(MAC_KEYS),
  NAME_KEYS: members(NAME_KEYS),
  SECRET_KEYS: members(SECRET_KEYS),
  USERNAME_KEYS: members(USERNAME_KEYS),
  VERSION_KEYS: members(VERSION_KEYS)
});

// Shape guards, each anchored so it recognizes a value that is entirely of that shape rather than one that merely contains it. Neither a hardware address nor an
// internet address has a guard here: the library's own vocabulary answers the first, and the platform's own parser answers the second in both families, because a
// parser is the one place that already knows what an address is, and one idiom for one concept is what keeps the scrub from drifting away from either.
const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The dotted spelling of an IPv4-mapped address, the conventional text form for naming an IPv4 host inside an IPv6 literal. This reads a form rather than deciding
// a shape: what makes the value an address at all is the parser, and this only says which family's memory the host belongs in. The hex-group spelling of the same
// host is a plain IPv6 literal here, because nothing in it says its low groups stand for a dotted quad.
const IPV4_MAPPED = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;

// The lowercase and uppercase halves of the hexadecimal alphabet, which together say what letter case one occurrence of a hardware address was spelled in.
const LOWER_HEX_PATTERN = /[a-f]/;
const UPPER_HEX_PATTERN = /[A-F]/;

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

/* A synthetic MAC in the locally-administered range. This is the only place a hardware address is minted, so the key catalog and the shape rule cannot answer two
 * spellings of one address differently.
 *
 * The memory is keyed by the library's own folded spelling and holds the canonical stand-in, because the controller spells one device's address in either case
 * and with or without separators, from one record to the next. The answer is then styled to the occurrence in hand rather than to the first occurrence seen,
 * which a memory keyed by the text as it arrived could not do: it would cache whichever spelling came first and answer it everywhere, so one device seen two ways
 * in one bundle would read as two devices and the cross-reference between the two records would be gone.
 */
function scrubMac(context: ScrubContext, value: string): string {

  const canonical = remember(context, "mac", normalizeMacAddress(value), (index) => "AABBCC" + index.toString(16).padStart(6, "0").toUpperCase());

  // An occurrence spelled with lowercase letters and no uppercase ones is a lowercase occurrence; anything else, an all-digit occurrence included, takes the
  // library's own uppercase spelling.
  const styled = (LOWER_HEX_PATTERN.test(value) && !UPPER_HEX_PATTERN.test(value)) ? canonical.toLowerCase() : canonical;

  // A colon-spelled occurrence answers colon-joined, which is the separator style the wire itself uses. Every other spelling answers contiguous: the hyphen and
  // dot forms are what an operator's own material carries rather than what a controller sends, so they collapse onto the spelling this library carries.
  return value.includes(":") ? (styled.match(/.{2}/g) ?? [styled]).join(":") : styled;
}

// The address stand-ins, in two tiers. The three blocks RFC 5737 reserves for documentation are the readable ones a bundle is expected to show, 254 hosts each.
// Past them the sequence continues in 0.0.0.0/8, the range RFC 1122 forbids as a destination, so a stand-in is never repeated however large a capture grows and
// none of them can ever route. The counter into that range starts at one, so the all-zeros address, which reads as no address at all, is never emitted and the
// last stand-in in range is 0.255.255.255.
const DOCUMENTATION_BLOCKS: readonly string[] = [ "192.0.2.", "198.51.100.", "203.0.113." ];
const HOSTS_PER_BLOCK = 254;
const DOCUMENTATION_HOSTS = DOCUMENTATION_BLOCKS.length * HOSTS_PER_BLOCK;
const UNROUTABLE_HOSTS = 16777215;

// One stand-in by its position in the sequence. Whether a position has a documentation block is itself the test for which tier it falls in, so both tiers are
// read off one lookup rather than off a count written twice. Past both the mint refuses rather than reuse a stand-in, because a silent repeat is the defect these
// tiers remove and no controller produces a capture carrying that many distinct addresses.
function documentationAddress(index: number): string {

  const block = DOCUMENTATION_BLOCKS[Math.floor(index / HOSTS_PER_BLOCK)];

  if(block !== undefined) {

    return block + ((index % HOSTS_PER_BLOCK) + 1).toString();
  }

  if(index >= (DOCUMENTATION_HOSTS + UNROUTABLE_HOSTS)) {

    throw new Error("The scrub has no unrepeated address stand-in left; the capture carries more distinct addresses than the documentation ranges and the " +
      "unroutable range together hold.");
  }

  const host = index - DOCUMENTATION_HOSTS + 1;

  return "0." + Math.floor(host / 65536).toString() + "." + (Math.floor(host / 256) % 256).toString() + "." + (host % 256).toString();
}

// A synthetic address, drawn from the documentation blocks first and the range that never routes after them, so nothing in a bundle can ever be mistaken for a
// routable host.
function scrubIp(context: ScrubContext, value: string): string {

  return remember(context, "ip", value, documentationAddress);
}

// The canonical spelling of an IPv6 literal, which is what its memory is keyed by. One address has several valid spellings - the case of its digits, where the
// run of zero groups is compressed, whether a group carries leading zeros - so a memory keyed by the text as it arrived would mint a second stand-in for the
// second spelling of one host. The platform's URL parser is the one canonicalizer already shipped with the runtime, and it serializes the form RFC 5952 asks for:
// lowercase, compressed, no leading zeros. A spelling the parser refuses is a zone-scoped literal, a form no capture carries; keying that by its lowercase text
// folds the one difference that does vary and keeps two distinct addresses distinct, which is the honest answer where there is no canonical form to ask for.
function canonicalIpv6(value: string): string {

  try {

    return new URL("http://[" + value + "]/").hostname.slice(1, -1);
  } catch {

    return value.toLowerCase();
  }
}

// A count written as colon-joined sixteen-bit groups, so a stand-in stays IPv6-shaped however many addresses a bundle carries: 1 reads as "1", 65535 as "ffff",
// 65536 as "1:0". Written straight into one group instead, a large enough count runs past that group's width and spells something that is not an address.
function hextets(n: number): string {

  const groups = [(n % 65536).toString(16)];

  for(let remaining = Math.floor(n / 65536); remaining > 0; remaining = Math.floor(remaining / 65536)) {

    groups.unshift((remaining % 65536).toString(16));
  }

  return groups.join(":");
}

// A synthetic address in the prefix RFC 3849 reserves for documentation. A dotted IPv4-mapped literal names an IPv4 host, so it is answered from the IPv4 memory
// and handed back in the mapped shape it arrived in: the two spellings of one host stay one host, and the cross-reference between the record that spells it one
// way and the record that spells it the other survives. Every other literal is remembered under its canonical spelling in this family's own memory.
function scrubIpv6(context: ScrubContext, value: string): string {

  const [ , quad ] = IPV4_MAPPED.exec(value) ?? [];

  if(quad !== undefined) {

    return "::ffff:" + scrubIp(context, quad);
  }

  return remember(context, "ipv6", canonicalIpv6(value), (index) => "2001:db8::" + hextets(index + 1));
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

      return isIPv4(stripped) ? scrubIp(context, stripped) : (isIPv6(stripped) ? scrubIpv6(context, stripped) : scrubHostname(context, stripped));
    }

    if(HASH_KEYS.has(key)) {

      return scrubHash(context, stripped);
    }

    // A locale value is answered from the fixed table rather than the replacement memory, so the lookup doubles as the test for whether this is a locale key at all.
    const locale = LOCALE_KEYS.get(key);

    if(locale !== undefined) {

      return locale;
    }

    if(VERSION_KEYS.has(key)) {

      return stripped;
    }
  }

  // Shape decides for everything the catalogs above do not name. This is what covers fields on device classes the library has never seen, which is the whole reason a
  // capture is worth collecting and the reason novelty evidence is safe to include.
  //
  // Two of the catalogs have no shape rule beneath them, and that is a decision rather than a gap. A hostname is a word, and a checksum is a run of hexadecimal
  // digits: a guard for either would also match ordinary text and the public digests a bundle is full of. So the key catalogs are the whole boundary for both, and
  // a hostname or a checksum under a member no catalog names is left exactly as it stands. Guessing in either direction costs something a reader cannot get back -
  // guess too widely and evidence is destroyed, guess too narrowly and identity survives - and the person reading a bundle is the one who can tell which it was.
  if(isMacAddress(stripped)) {

    return scrubMac(context, stripped);
  }

  if(isIPv4(stripped)) {

    return scrubIp(context, stripped);
  }

  if(isIPv6(stripped)) {

    return scrubIpv6(context, stripped);
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

  if(isMacAddress(key)) {

    return scrubMac(context, key);
  }

  if(UUID_PATTERN.test(key)) {

    return scrubUuid(context, key);
  }

  if(isIPv4(key)) {

    return scrubIp(context, key);
  }

  if(isIPv6(key)) {

    return scrubIpv6(context, key);
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

/* Clear every string beneath a secret container, keeping the structure and the key names. A member named for a secret may hold a structure rather than a bare
 * value - a credentials object, a list of tokens - whose inner keys no catalog can anticipate and whose strings are the secret itself.
 *
 * Text is what carries a credential, so text is all this clears: a number, a boolean, a null, and a binary payload beneath the same member stay as they are,
 * because they are evidence of when and how the secret is used and destroying them protects nothing. Keys still pass the key replacement, so an identifier used
 * as a key is pseudonymized here as it is anywhere else.
 */
function clearSecrets(context: ScrubContext, value: unknown): unknown {

  if(typeof value === "string") {

    return (value.length === 0) ? value : scrubToken(context, value);
  }

  if((value === null) || (value === undefined) || ArrayBuffer.isView(value)) {

    return value;
  }

  if(Array.isArray(value)) {

    return value.map((element) => clearSecrets(context, element));
  }

  if(isPlainObject(value)) {

    const cleared: Record<string, unknown> = {};

    for(const [ name, inner ] of Object.entries(value)) {

      cleared[scrubKey(context, name)] = clearSecrets(context, inner);
    }

    return cleared;
  }

  return value;
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

  // A secret key holding a structure clears everything beneath it. A single string under the same key was already cleared by the string arm above, so this is the
  // container arm of one rule rather than a second rule.
  if((key !== undefined) && SECRET_KEYS.has(key)) {

    return clearSecrets(context, value);
  }

  if(Array.isArray(value)) {

    // Every element inherits the key its array arrived under, so an array of MACs under a `macs` key is treated the same as a single one would be.
    return value.map((element) => scrubValue(element, context, key));
  }

  if(isPlainObject(value)) {

    const wrapped = isBase64Wrapper(value);
    const scrubbed: Record<string, unknown> = {};

    /* The wire wraps an event frame's display values in a `{ text }` envelope, so the envelope's own key is the semantic subject and the text member inherits it - the
     * same inheritance an array element takes from its array's key. That is what lets the key catalogs judge a `sensorName` envelope as a name, while an id or a
     * mount-type envelope passes through on its own merits. A top-level `text` arrives under no wrapper key, so it keeps its own.
     */
    for(const [ name, inner ] of Object.entries(value)) {

      const memberKey = ((name === "text") && (typeof inner === "string") && (key !== undefined)) ? key : name;

      scrubbed[scrubKey(context, name)] = (wrapped && (name === "bytes")) ? inner : scrubValue(inner, context, memberKey);
    }

    return scrubbed;
  }

  return value;
}
