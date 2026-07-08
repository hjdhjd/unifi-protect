/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * redact-bootstrap.mjs: Redact a UniFi Protect bootstrap JSON capture into a synthetic fixture suitable for committing as a test fixture.
 *
 * Strategy:
 *   - Maintain a per-category replacement map keyed by the original value, so cross-references stay internally consistent.
 *     (A camera whose mac is X, referenced elsewhere by mac X, still resolves to the same synthetic mac after redaction.) The one exception is email, which is
 *     shape-driven only: each occurrence gets a fresh synthetic address, so the same real email can map to two different synthetic addresses.
 *   - Walk the entire JSON tree once; apply value-shape replacements (MACs, IPs, UUIDs) and key-name replacements (name, host,
 *     hostname, accessKey, etc.) at every leaf.
 *   - Preserve structure, types, lengths where possible. Strings stay strings, arrays stay arrays, IDs stay UUID-shaped.
 */
import { readFileSync, writeFileSync } from "node:fs";
import process, { argv } from "node:process";

const [ , , inputPath, outputPath ] = argv;

if(!inputPath || !outputPath) {

  process.stderr.write("Usage: node redact-bootstrap.mjs <input.json> <output.json>\n");
  process.exit(1);
}

const raw = JSON.parse(readFileSync(inputPath, "utf8"));

// Replacement maps. Each call to mapMac(realValue) returns the same synthetic value for the same realValue across the run.
const macMap = new Map();
const ipMap = new Map();
const uuidMap = new Map();
const nameMap = new Map();
const tokenMap = new Map();
const hostnameMap = new Map();

let macCounter = 0;
let ipCounter = 0;
let uuidCounter = 0;
let nameCounter = 0;
let tokenCounter = 0;
let hostnameCounter = 0;

// Build a synthetic MAC in the locally-administered range (X2/X6/XA/XE first byte). Format with no separators (matches Protect's wire format) or with colons,
// depending on the input shape.
function mapMac(value) {

  if(typeof value !== "string") {

    return value;
  }

  if(!macMap.has(value)) {

    const idx = macCounter++;
    const hex = "AABBCC" + idx.toString(16).padStart(6, "0").toUpperCase();

    if(value.includes(":")) {

      macMap.set(value, hex.match(/.{2}/g).join(":"));
    } else {

      macMap.set(value, hex);
    }
  }

  return macMap.get(value);
}

// Build a synthetic IP in RFC 5737's TEST-NET-1 range (192.0.2.0/24, reserved for documentation).
function mapIp(value) {

  if(typeof value !== "string") {

    return value;
  }

  if(!ipMap.has(value)) {

    ipMap.set(value, "192.0.2." + ((ipCounter++ % 254) + 1).toString());
  }

  return ipMap.get(value);
}

// Build a synthetic UUID in deterministic order. We keep the dash layout so consumer regex/length checks still pass.
function mapUuid(value) {

  if(typeof value !== "string") {

    return value;
  }

  if(!uuidMap.has(value)) {

    const next = uuidCounter++;
    const idx = next.toString(16).padStart(12, "0");

    uuidMap.set(value, "00000000-0000-0000-0000-" + idx);
  }

  return uuidMap.get(value);
}

// Map a free-form name to a synthetic form. The keyHint argument seeds the output shape "Test <keyHint> N", so a `name` becomes "Test Device 1" and an `ssid`
// becomes "Test ssid 1".
function mapName(value, keyHint = "Device") {

  if((typeof value !== "string") || (value.length === 0)) {

    return value;
  }

  const cacheKey = keyHint + "|" + value;

  if(!nameMap.has(cacheKey)) {

    nameMap.set(cacheKey, "Test " + keyHint + " " + (++nameCounter));
  }

  return nameMap.get(cacheKey);
}

// Map a token / key / password / hash / arbitrary secret. Same length category, but synthetic content. Empty strings stay empty.
function mapToken(value) {

  if((typeof value !== "string") || (value.length === 0)) {

    return value;
  }

  if(!tokenMap.has(value)) {

    const next = tokenCounter++;
    const idx = next.toString(16).padStart(8, "0");

    // The synthetic value preserves the original length: the padding subtracts 18, which is the fixed prefix width ("REDACTED-" is 9 chars, plus 8 hex digits
    // from idx, plus the trailing "-").
    tokenMap.set(value, "REDACTED-" + idx + "-" + "x".repeat(Math.max(0, value.length - 18)));
  }

  return tokenMap.get(value);
}

// Map a hostname that's not an IP. We synthesize a test.local-style hostname.
function mapHostname(value) {

  if(typeof value !== "string") {

    return value;
  }

  if(!hostnameMap.has(value)) {

    hostnameMap.set(value, "host-" + (++hostnameCounter) + ".test.local");
  }

  return hostnameMap.get(value);
}

// Pattern guards. Each predicate accepts an arbitrary string and answers "does this look like the kind of thing we want to redact under this category".
const macPattern = /^[0-9a-fA-F]{12}$|^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/;
const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
const uuidPattern = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Keys whose values are always sensitive secrets - clear them regardless of the value shape.
const SECRET_KEYS = new Set([

  "accessKey", "homekitSetupCode", "homekitSetupPayload", "hashedPassword", "password", "privateKey", "publicKey", "token",
  "anonymousDeviceId", "hardwareId", "ssoToken", "macTouched", "wifiPassword", "psk", "pairingCode", "pin",
  "tlsCertificate", "tlsKey", "rtspAlias", "credentials", "secret"
]);

// Keys that are display names. Mapped through mapName for a friendly synthetic value.
const NAME_KEYS = new Set([

  "name", "ssid", "displayName", "loginName", "firstName", "lastName", "fullName", "label"
]);

// Keys whose values are always hostnames or IPs. We try IP shape first, then fall back to hostname mapping.
const HOST_KEYS = new Set([

  "host", "connectionHost", "publicIp", "internalHost", "externalHost", "rtspHost"
]);

// Keys whose values are MAC addresses. Note that "anonymousId" is MAC-shaped on the wire and belongs here, whereas the similarly-named "anonymousDeviceId" is an
// opaque token that lives in SECRET_KEYS above - the names are close, but the shapes and redaction paths differ.
const MAC_KEYS = new Set([

  "mac", "bridgeMac", "anonymousId"
]);

// Keys whose values are checksum hashes (MD5, SHA, etc). Not sensitive in themselves. The synthetic value is stable within a single run (the same real hash always
// maps to the same replacement via hashMap), but it is derived from encounter order rather than the hash content, so it is not stable across separate recaptures.
const HASH_KEYS = new Set([

  "md5", "sha1", "sha256", "checksum", "fingerprint"
]);

const hashMap = new Map();
let hashCounter = 0;

function mapHash(value) {

  if((typeof value !== "string") || (value.length === 0)) {

    return value;
  }

  if(!hashMap.has(value)) {

    const next = hashCounter++;
    const idx = next.toString(16).padStart(8, "0");

    hashMap.set(value, ("0".repeat(Math.max(0, value.length - 8)) + idx).slice(0, value.length));
  }

  return hashMap.get(value);
}

// Walk the tree. Strings get redacted by their own shape and by the key context. Objects/arrays recurse.
function redact(value, keyContext) {

  if((value === null) || (value === undefined)) {

    return value;
  }

  if(Array.isArray(value)) {

    return value.map((entry) => redact(entry, keyContext));
  }

  if(typeof value === "object") {

    const result = {};

    for(const [ key, child ] of Object.entries(value)) {

      // Object keys themselves can be sensitive (e.g., featureFlagsMap is keyed by raw MAC). Redact the key by shape if it matches.
      let redactedKey = key;

      if(macPattern.test(key)) {

        redactedKey = mapMac(key);
      } else if(uuidPattern.test(key)) {

        redactedKey = mapUuid(key);
      } else if(ipPattern.test(key)) {

        redactedKey = mapIp(key);
      }

      result[redactedKey] = redact(child, key);
    }

    return result;
  }

  if(typeof value !== "string") {

    return value;
  }

  // Key-driven redaction takes precedence over shape-driven so a `name` of "192.168.1.5" still becomes a name, not an IP.
  if((keyContext !== undefined) && SECRET_KEYS.has(keyContext)) {

    return mapToken(value);
  }

  if((keyContext !== undefined) && NAME_KEYS.has(keyContext)) {

    return mapName(value, keyContext === "name" ? "Device" : keyContext);
  }

  if((keyContext !== undefined) && MAC_KEYS.has(keyContext)) {

    return mapMac(value);
  }

  if((keyContext !== undefined) && HOST_KEYS.has(keyContext)) {

    return ipPattern.test(value) ? mapIp(value) : mapHostname(value);
  }

  if((keyContext !== undefined) && HASH_KEYS.has(keyContext)) {

    return mapHash(value);
  }

  // Shape-driven redaction for cross-cutting fields the key catalog above doesn't enumerate.
  if(macPattern.test(value)) {

    return mapMac(value);
  }

  if(ipPattern.test(value)) {

    return mapIp(value);
  }

  if(uuidPattern.test(value)) {

    return mapUuid(value);
  }

  if(emailPattern.test(value)) {

    return "user-" + (++hostnameCounter) + "@example.com";
  }

  return value;
}

const redacted = redact(raw, undefined);

writeFileSync(outputPath, JSON.stringify(redacted, null, 2) + "\n", "utf8");

process.stdout.write("Wrote " + outputPath + " (" + JSON.stringify(redacted).length + " bytes)\n");
process.stdout.write("Replacement counts: macs=" + macCounter + ", ips=" + ipCounter + ", uuids=" + uuidCounter + ", names=" + nameCounter +
  ", tokens=" + tokenCounter + ", hostnames=" + hostnameCounter + "\n");
