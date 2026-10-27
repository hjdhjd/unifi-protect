/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * url-host-parity.test.ts: Differential tests holding this library's host formatter to homebridge-plugin-utils' formatUrlHost. The library takes no runtime
 * dependency on homebridge-plugin-utils, so the formatter is implemented in each library; this suite runs one input table through each and asserts the same
 * outcome for every input, so a change to the behavior of one reddens it here.
 *
 * A refusal is compared as an outcome and never by its class, because the libraries refuse through different errors by design: homebridge-plugin-utils raises a
 * `TypeError`, and this library raises its own typed configuration error.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { formatUrlHost as formatPluginUtilsUrlHost } from "homebridge-plugin-utils";
import { formatUrlHost } from "./url-host.ts";

// Every input class the formatter tells apart: an empty value, hostnames and IPv4 addresses with and without a port, bare IPv6 literals (an IPv4-mapped one and one
// whose last group reads like a port among them), bracketed literals with and without a port, and zoned literals bare, bracketed and percent-encoded.
const INPUTS = [ "", "nvr.local", "nvr.local:7443", "10.0.0.1", "10.0.0.1:7443", "::1", "fe80::1", "::ffff:10.0.0.1", "::1:7443", "[::1]", "[fe80::1]:7443",
  "fe80::1%en0", "fe80::1%25en0", "[fe80::1%en0]", "nvr%local" ];

// What one formatter makes of one input: the formatted host, or `null` for a refusal.
function outcomeOf(format: (host: string) => string, host: string): string | null {

  try {

    return format(host);
  } catch {

    return null;
  }
}

describe("formatUrlHost parity with homebridge-plugin-utils", () => {

  test("every input formats to the same host, or is refused, in each library", () => {

    // The table is compared whole, each outcome beside its input, so a divergence reports every input it reaches rather than stopping at the first.
    assert.deepEqual(INPUTS.map((host) => ({ host, outcome: outcomeOf(formatUrlHost, host) })),
      INPUTS.map((host) => ({ host, outcome: outcomeOf(formatPluginUtilsUrlHost, host) })));
  });
});
