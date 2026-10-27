/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * url-host.test.ts: Unit tests for the controller address as a URL carries it - the userinfo mask and its publication, the bracket-aware formatter over each input
 * class it tells apart, and the derivation of the controller's URL authority over each address shape it accepts and each it refuses.
 */
import { controllerAuthority, formatUrlHost, maskAddressCredentials } from "./url-host.ts";
import { describe, test } from "node:test";
import { ProtectConfigurationError } from "../errors.ts";
import assert from "node:assert/strict";
import { maskAddressCredentials as barrelMaskAddressCredentials } from "../index.ts";
import { inspect } from "node:util";
import { present } from "homebridge-plugin-utils/testing";

// Assert that a call refuses the address with the typed configuration error, its message opening "The controller address" and quoting the address as `shown`, which
// is the address itself when it carries no `@` and its masked form otherwise, and return the refusal.
function refusal(call: () => unknown, shown: string): ProtectConfigurationError {

  let refused: ProtectConfigurationError | undefined;

  assert.throws(call, (error: unknown) => {

    assert.ok(error instanceof ProtectConfigurationError, JSON.stringify(shown) + " is refused with the configuration error");
    assert.ok(error.message.startsWith("The controller address \""), JSON.stringify(shown) + " is refused as the controller address");
    assert.ok(error.message.includes("\"" + shown + "\""), JSON.stringify(shown) + " is the form the refusal quotes");

    refused = error;

    return true;
  });

  return present(refused, "the refusal");
}

// An error as a person reads it printed, its properties and its causes included and its stack frames left out: a frame names a file path, which carries nothing of
// the address and could hold a word a userinfo is spelled with.
function printed(error: unknown): string {

  return inspect(error).split("\n").filter((line) => !line.trimStart().startsWith("at ")).join("\n");
}

describe("maskAddressCredentials", () => {

  test("shows everything up to and including the last `@` as `***@`, and returns an address carrying no `@` as given", () => {

    // A user and a password, an address with no `@` at all, an empty marker, which is masked like any other, and a second `@`, which the mask reaches through.
    const cases = [

      { address: "user:pass@h", masked: "***@h" },
      { address: "h", masked: "h" },
      { address: "@h", masked: "***@h" },
      { address: "a@b@h", masked: "***@h" }
    ];

    for(const { address, masked } of cases) {

      assert.equal(maskAddressCredentials(address), masked, JSON.stringify(address) + " masks as " + JSON.stringify(masked));
    }
  });

  test("the barrel publishes the very function", () => {

    /* Nothing else in the suite establishes that the mask reached the public surface, and TypeDoc reads the barrel alone, so a symbol missing from it has no page
     * and no consumer. Identity rather than behavior is the assertion, because a re-export that resolved to another function would still answer correctly.
     */
    assert.ok(Object.is(barrelMaskAddressCredentials, maskAddressCredentials), "the barrel's maskAddressCredentials is the url-host function itself");
  });
});

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

      // An empty marker before the `@`, an empty user alone or beside an empty password, names no account, and the parser folds it away as it folds an empty port.
      { authority: "nvr.local", host: "@nvr.local" },
      { authority: "nvr.local", host: ":@nvr.local" },
      { authority: "[fe80::1]", host: "fe80::1" },
      { authority: "[fe80::1]", host: "fe80::1/" },
      { authority: "[fe80::1]", host: "[fe80::1]" },
      { authority: "[fe80::1]:7443", host: "[fe80::1]:7443" },
      { authority: "[fe80::1]:7443", host: "[fe80::1]:7443/" },
      { authority: "10.0.0.1", host: "10.0.0.1" },
      { authority: "10.0.0.1", host: "10.0.0.1/" },
      { authority: "10.0.0.1", host: "10.0.0.1/." },
      { authority: "10.0.0.1:7443", host: "10.0.0.1:7443" },
      { authority: "nvr.local", host: "NVR.Local:443" },
      { authority: "nvr.local", host: "nvr.local" },
      { authority: "nvr.local:7443", host: "nvr.local:7443" },
      { authority: "nvr.local:7443", host: "nvr.local:7443/" }
    ];

    for(const { authority, host } of cases) {

      assert.equal(controllerAuthority(host), authority, JSON.stringify(host) + " derives its authority");
    }
  });

  test("refuses a host that is missing or is not a string before any text is read, quoting no value and with no cause", () => {

    // Each is a value a hand-edited configuration can hand a JavaScript consumer past the type. The sentence quotes no address, so the row reads it whole rather
    // than through refusal(), which expects a quoted one.
    for(const host of [ undefined, null, 7443, { host: "nvr.local" } ]) {

      assert.throws(() => controllerAuthority(host), (error: unknown) => {

        assert.ok(error instanceof ProtectConfigurationError, JSON.stringify(host) + " is refused with the configuration error");
        assert.equal(error.message, "The controller address is missing or is not text; set it to the controller's hostname or IP address.",
          JSON.stringify(host) + " is refused with the sentence that quotes no value");
        assert.equal(error.cause, undefined, JSON.stringify(host) + " is refused with no cause");

        return true;
      });
    }
  });

  test("refuses a zoned IPv6 literal through the formatter's own refusal", () => {

    assert.equal(refusal(() => controllerAuthority("fe80::1%en0"), "fe80::1%en0").cause, undefined,
      "the formatter refuses before any parse, so there is no parser cause");
    assert.equal(refusal(() => controllerAuthority("fe80::1%en0/"), "fe80::1%en0").cause, undefined,
      "the formatter names the literal its trailing slash was dropped from");
  });

  test("refuses an address the URL parser cannot read as a host, the parser's refusal as the cause", () => {

    // An empty address and a lone `/`, which drops to it, a forbidden host character, a zone inside brackets, a port out of range, brackets around something that
    // is no IPv6 literal, and a trailing space or control character, which the parser trims from a bare host and refuses once a path follows it.
    for(const host of [ "", "/", "nvr local", "[fe80::1%en0]", "10.0.0.1:99999", "[nvr.local]", "10.0.0.1 ", "10.0.0.1\u0001" ]) {

      assert.ok(refusal(() => controllerAuthority(host), host).cause instanceof TypeError, JSON.stringify(host) + " carries the parser's refusal as its cause");
    }
  });

  test("refuses an empty marker before a bare IPv6 literal through the parser, as homebridge-plugin-utils refuses it", () => {

    /* The empty marker goes on to the parse unstripped, and the formatter brackets only what reads as an IPv6 literal, which `@fe80::1` does not, so the parser
     * meets an authority it cannot read. Its refusal is the cause, and the input it keeps carries the empty marker alone, so the cause holds no credential.
     */
    const { cause } = refusal(() => controllerAuthority("@fe80::1"), "***@fe80::1");

    assert.ok(cause instanceof TypeError, "the parser's refusal is the cause");
    assert.equal((cause as { input?: unknown }).input, "https://@fe80::1/", "and the input it keeps is the composed authority with its empty marker");
  });

  test("refuses an address carrying more than a host and a port", () => {

    // Each parses, and each carries a URL part beyond the authority: a path, a query, a fragment, and a scheme, which parses as the host `https` with the rest of the
    // address as its path. A second trailing `/` (a single one is dropped as the empty path), an empty trailing `?` or `#`, or a backslash parses alone as a bare host
    // and carries that part once a path follows it, as every composed URL does.
    for(const host of [ "10.0.0.1/proxy", "10.0.0.1?debug=1", "10.0.0.1#top", "https://10.0.0.1", "10.0.0.1//", "10.0.0.1?", "10.0.0.1#", "10.0.0.1\\" ]) {

      assert.equal(refusal(() => controllerAuthority(host), host).cause, undefined, JSON.stringify(host) + " is refused on its parse, which raised nothing");
    }
  });

  test("refuses an address carrying a userinfo before any parse, quoting it with the userinfo hidden and no cause", () => {

    // Each hides everything up to its last `@`: a user alone and with a password, a scheme in front, which the composed URL would read as the host, a password and a
    // user that each carry an `@` of their own, and a port out of range, which the parser would refuse with the whole address kept on its cause.
    const cases = [

      { address: "kestrel@10.0.0.1", shown: "***@10.0.0.1", userinfo: "kestrel" },
      { address: "user:pass@10.0.0.1", shown: "***@10.0.0.1", userinfo: "user:pass" },
      { address: "https://user:pass@10.0.0.1", shown: "***@10.0.0.1", userinfo: "user:pass" },
      { address: "user:p@ss@10.0.0.1", shown: "***@10.0.0.1", userinfo: "user:p@ss" },
      { address: "me@corp.example:pass@10.0.0.1", shown: "***@10.0.0.1", userinfo: "me@corp.example:pass" },
      { address: "user:secret@10.0.0.1:99999", shown: "***@10.0.0.1:99999", userinfo: "user:secret" }
    ];

    for(const { address, shown, userinfo } of cases) {

      const refused = refusal(() => controllerAuthority(address), shown);

      assert.ok(refused.message.endsWith(" carries more than a host and a port."), JSON.stringify(address) + " is refused as more than a host and a port");
      assert.equal(refused.cause, undefined, JSON.stringify(address) + " is refused before the parse, with no cause");
      assert.ok(!printed(refused).includes(userinfo), JSON.stringify(address) + " prints none of its userinfo");
    }
  });

  test("refuses `::` and `@` as a userinfo before any parse, quoting each masked with no cause", () => {

    // The marker is read as typed, so only nothing or a lone `:` folds away: a second colon is a password of one colon, and a second `@` a user of one `@`.
    for(const address of [ "::@nvr.local", "@@nvr.local" ]) {

      assert.equal(refusal(() => controllerAuthority(address), "***@nvr.local").cause, undefined,
        JSON.stringify(address) + " is refused before the parse, with no cause");
    }
  });
});
