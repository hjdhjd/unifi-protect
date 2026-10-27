/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * failure-parity.test.ts: Differential tests holding this library's transport failure classifier equal to homebridge-plugin-utils' classifier. The library takes no
 * runtime dependency on homebridge-plugin-utils, so the taxonomy is implemented in both places; this suite is what keeps the two of them one rule. It feeds a table
 * of failure shapes through each and asserts the same kind and code come back, so a change to either classification reddens it here.
 */
import { describe, test } from "node:test";
import type { TransportFailure } from "./failure.ts";
import assert from "node:assert/strict";
import { classifyTransportError } from "./failure.ts";
import { classifyTransportError as classifyWithPluginUtils } from "homebridge-plugin-utils";
import { errnoError } from "homebridge-plugin-utils/testing";
import { errors } from "undici";

interface ClassificationCase {

  name: string;
  signal?: AbortSignal;
  value: unknown;
}

/* Every kind the union names, keyed so the compiler holds the list to the union: a kind added to it without a key here fails to compile, and so does a key naming
 * a kind that does not exist. The coverage row below reads the table's reach against it.
 */
const EVERY_KIND: Record<TransportFailure["kind"], true> = { aborted: true, certificate: true, "connect-timeout": true, destroyed: true, dns: true, refused: true,
  reset: true, "retries-exhausted": true, timeout: true, transport: true };

/* Every shape this library's transports can hand the classifier, every code the code map names, a row at each boundary of the precedence, and the rules of the
 * descent the readings are taken from. Built by a function rather than held as a module constant so each run gets its own values...the self-referential row mutates
 * the error it names, and a shared table would carry that mutation between tests.
 */
function classificationTable(): ClassificationCase[] {

  const aborted = AbortSignal.abort();
  const timeout = (): DOMException => new DOMException("The operation was aborted due to timeout", "TimeoutError");
  const cancellation = (): DOMException => new DOMException("This operation was aborted", "AbortError");
  const selfSigned = (): NodeJS.ErrnoException => errnoError("self-signed certificate", "DEPTH_ZERO_SELF_SIGNED_CERT");
  const aggregate = Object.assign(new AggregateError([errnoError("connect ETIMEDOUT 10.0.0.1:443", "ETIMEDOUT")], "connect ETIMEDOUT"), { code: "ETIMEDOUT" });
  const looping = new Error("Unable to reach the controller.");

  looping.cause = new Error("the dial failed.", { cause: looping });

  // An errno failure the given number of links deep, under wrappers that carry no code of their own.
  const buried = (depth: number): unknown => {

    let link: unknown = errnoError("connect ECONNREFUSED", "ECONNREFUSED");

    for(let level = 0; level < depth; level++) {

      link = new Error("wrapper " + level.toString() + ".", { cause: link });
    }

    return link;
  };

  return [

    // The lifetime signal, and what it outranks.
    { name: "a refused dial read beside a lifetime signal that has already aborted", signal: aborted, value: errnoError("connect ECONNREFUSED", "ECONNREFUSED") },
    { name: "a timeout read beside a lifetime signal that has already aborted", signal: aborted, value: timeout() },
    { name: "a refused dial read beside a lifetime signal that has not aborted", signal: new AbortController().signal,
      value: errnoError("connect ECONNREFUSED", "ECONNREFUSED") },

    // Timeouts, and what they outrank.
    { name: "the platform's deadline reason", value: timeout() },
    { name: "a timeout one link below a coded wrapper", value: errnoError("read ECONNRESET", "ECONNRESET", timeout()) },
    { name: "a timeout two links down", value: new Error("aborted", { cause: new Error("timed out", { cause: timeout() }) }) },

    // Cancellations that are not the lifetime signal's, and what they outrank.
    { name: "the platform's cancellation", value: cancellation() },
    { name: "undici's aborted-request class, which the signal gate raises", value: new errors.RequestAbortedError() },
    { name: "a cancellation one link below a coded wrapper", value: errnoError("connect ECONNREFUSED", "ECONNREFUSED", cancellation()) },

    // undici's own failures.
    { name: "undici's connect timer", value: new errors.ConnectTimeoutError() },
    { name: "undici's connect normalization of an ETIMEDOUT aggregate", value: Object.assign(new errors.ConnectTimeoutError("Connect Timeout Error"),
      { cause: aggregate }) },
    { name: "undici's headers timeout", value: new errors.HeadersTimeoutError() },
    { name: "undici's body timeout", value: new errors.BodyTimeoutError() },
    { name: "undici's exhausted retries", value: new errors.RequestRetryError("Request failed", 503, {}) },
    { name: "undici's destroyed client", value: new errors.ClientDestroyedError() },
    { name: "undici's socket failure", value: new errors.SocketError("other side closed") },

    // The platform's errno codes.
    { name: "a refused connection", value: errnoError("connect ECONNREFUSED", "ECONNREFUSED") },
    { name: "a refused connection one hop down, as undici's fetch wraps it", value: new TypeError("fetch failed",
      { cause: errnoError("connect ECONNREFUSED", "ECONNREFUSED") }) },
    { name: "a host that is down", value: errnoError("connect EHOSTDOWN", "EHOSTDOWN") },
    { name: "a reset connection", value: errnoError("read ECONNRESET", "ECONNRESET") },
    { name: "a host name that does not resolve", value: errnoError("getaddrinfo ENOTFOUND", "ENOTFOUND") },
    { name: "a resolver's temporary failure", value: errnoError("getaddrinfo EAI_AGAIN", "EAI_AGAIN") },
    { name: "a broken pipe", value: errnoError("write EPIPE", "EPIPE") },
    { name: "a bare socket timeout", value: errnoError("read ETIMEDOUT", "ETIMEDOUT") },

    // The certificate family, and its neighbors.
    { name: "a self-signed certificate", value: selfSigned() },
    { name: "a leaf signature that does not verify", value: errnoError("unable to verify the first certificate", "UNABLE_TO_VERIFY_LEAF_SIGNATURE") },
    { name: "a hostname mismatch", value: errnoError("hostname mismatch", "ERR_TLS_CERT_ALTNAME_INVALID") },
    { name: "an expired certificate one hop down", value: new Error("fetch failed", { cause: errnoError("certificate has expired", "CERT_HAS_EXPIRED") }) },
    { name: "a certificate verdict one link below a coded wrapper", value: errnoError("other side closed", "UND_ERR_SOCKET", selfSigned()) },
    { name: "the verifier running out of room", value: errnoError("out of memory", "OUT_OF_MEM") },

    // The descent, and values that are not errors.
    { name: "a content-free socket failure", value: new TypeError("terminated") },
    { name: "a code that is not a string above an errno", value: errnoError("wrapper.", 42, errnoError("read ECONNRESET", "ECONNRESET")) },
    { name: "a code two links down", value: buried(2) },
    { name: "a code at the depth bound", value: buried(8) },
    { name: "a code one past the depth bound", value: buried(9) },
    { name: "a chain that refers back to itself", value: looping },
    { name: "a plain object carrying a code", value: { code: "ECONNREFUSED" } },
    { name: "a string", value: "socket hang up" },
    { name: "undefined", value: undefined },
    { name: "null", value: null }
  ];
}

describe("classifyTransportError parity with homebridge-plugin-utils", () => {

  for(const { name, signal, value } of classificationTable()) {

    test("classifies " + name + " exactly as homebridge-plugin-utils does", () => {

      const local = classifyTransportError(value, signal);
      const shared = classifyWithPluginUtils(value, signal);

      assert.equal(local.kind, shared.kind, "the two classifications agree on the kind of " + name);
      assert.equal(local.code, shared.code, "the two classifications agree on the code of " + name);
      assert.equal(local.cause, value, "the local classification carries the value handed in as its cause");
      assert.equal(shared.cause, value, "homebridge-plugin-utils' classification carries the value handed in as its cause");
    });
  }

  test("the table reaches every kind the union names", () => {

    const reached = new Set(classificationTable().map(({ signal, value }) => classifyTransportError(value, signal).kind));

    assert.deepEqual([...reached].sort(), Object.keys(EVERY_KIND).sort(), "a kind no row reaches is a kind whose parity nothing holds");
  });
});
