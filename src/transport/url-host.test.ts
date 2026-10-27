/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * url-host.test.ts: Unit tests for the controller address as a URL carries it - the bracket-aware formatter over each input class it tells apart, and the derivation
 * of the controller's URL authority over each address shape it accepts and each it refuses.
 */
import { controllerAuthority, formatUrlHost } from "./url-host.ts";
import { describe, test } from "node:test";
import { ProtectConfigurationError } from "../errors.ts";
import assert from "node:assert/strict";

// Assert that a call refuses the address with the typed configuration error, its message naming the address exactly as given, and return the refusal's cause.
function refusal(call: () => unknown, address: string): unknown {

  let cause: unknown;

  assert.throws(call, (error: unknown) => {

    assert.ok(error instanceof ProtectConfigurationError, JSON.stringify(address) + " is refused with the configuration error");
    assert.ok(error.message.includes("\"" + address + "\""), JSON.stringify(address) + " is named in the refusal");

    cause = error.cause;

    return true;
  });

  return cause;
}

describe("formatUrlHost", () => {

  test("brackets a bare IPv6 literal", () => {

    assert.equal(formatUrlHost("fe80::1"), "[fe80::1]");
    assert.equal(formatUrlHost("::1"), "[::1]");
    assert.equal(formatUrlHost("::ffff:10.0.0.1"), "[::ffff:10.0.0.1]");
  });

  test("passes a hostname or an IPv4 address, with or without a port, and a bracketed literal through untouched", () => {

    for(const host of [ "nvr.local", "10.0.0.1", "nvr.local:7443", "10.0.0.1:7443", "[fe80::1]", "[fe80::1]:7443" ]) {

      assert.equal(formatUrlHost(host), host);
    }
  });

  test("refuses an IPv6 literal carrying a zone, naming the address", () => {

    refusal(() => formatUrlHost("fe80::1%en0"), "fe80::1%en0");
  });
});

describe("controllerAuthority", () => {

  test("derives the authority every URL is composed on as the URL parser reads it, a single trailing slash dropped and a bare IPv6 literal bracketed", () => {

    const cases = [

      { authority: "[fe80::1]", host: "fe80::1" },
      { authority: "[fe80::1]", host: "fe80::1/" },
      { authority: "[fe80::1]", host: "[fe80::1]" },
      { authority: "[fe80::1]:7443", host: "[fe80::1]:7443" },
      { authority: "[fe80::1]:7443", host: "[fe80::1]:7443/" },
      { authority: "10.0.0.1", host: "10.0.0.1" },
      { authority: "10.0.0.1", host: "10.0.0.1/" },
      { authority: "10.0.0.1", host: "10.0.0.1/." },
      { authority: "10.0.0.1:7443", host: "10.0.0.1:7443" },
      { authority: "nvr.local", host: "@nvr.local" },
      { authority: "nvr.local", host: "NVR.Local:443" },
      { authority: "nvr.local", host: "nvr.local" },
      { authority: "nvr.local:7443", host: "nvr.local:7443" },
      { authority: "nvr.local:7443", host: "nvr.local:7443/" }
    ];

    for(const { authority, host } of cases) {

      assert.equal(controllerAuthority(host), authority, JSON.stringify(host) + " derives its authority");
    }
  });

  test("refuses a zoned IPv6 literal through the formatter's own refusal", () => {

    assert.equal(refusal(() => controllerAuthority("fe80::1%en0"), "fe80::1%en0"), undefined, "the formatter refuses before any parse, so there is no parser cause");
    assert.equal(refusal(() => controllerAuthority("fe80::1%en0/"), "fe80::1%en0"), undefined, "the formatter names the literal its trailing slash was dropped from");
  });

  test("refuses an address the URL parser cannot read as a host, the parser's refusal as the cause", () => {

    // An empty address and a lone `/`, which drops to it, a forbidden host character, a zone inside brackets, a port out of range, brackets around something that
    // is no IPv6 literal, and a trailing space or control character, which the parser trims from a bare host and refuses once a path follows it.
    for(const host of [ "", "/", "nvr local", "[fe80::1%en0]", "10.0.0.1:99999", "[nvr.local]", "10.0.0.1 ", "10.0.0.1\u0001" ]) {

      assert.ok(refusal(() => controllerAuthority(host), host) instanceof TypeError, JSON.stringify(host) + " carries the parser's refusal as its cause");
    }
  });

  test("refuses an address carrying more than a host and a port", () => {

    // Each parses, and each carries a URL part beyond the authority: a user, a password, a path, a query, a fragment, and a scheme, which parses as the host
    // `https` with the rest of the address as its path. A second trailing `/` (a single one is dropped as the empty path), an empty trailing `?` or `#`, or a backslash
    // parses alone as a bare host and carries that part once a path follows it, as every composed URL does.
    for(const host of [ "user@10.0.0.1", "user:pass@10.0.0.1", "10.0.0.1/proxy", "10.0.0.1?debug=1", "10.0.0.1#top", "https://10.0.0.1", "10.0.0.1//", "10.0.0.1?",
      "10.0.0.1#", "10.0.0.1\\" ]) {

      assert.equal(refusal(() => controllerAuthority(host), host), undefined, JSON.stringify(host) + " is refused on its parse, which raised nothing");
    }
  });
});
