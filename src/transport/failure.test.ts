/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * failure.test.ts: Unit tests for the transport failure classifier - the precedence its readings are ranked in, the code map, the certificate family, and the
 * bounded descent of the cause chain it reads them from. failure-parity.test.ts holds the rule to homebridge-plugin-utils' own; these rows state what the rule is.
 */
import { describe, test } from "node:test";
import type { TransportFailure } from "./failure.ts";
import assert from "node:assert/strict";
import { classifyTransportError } from "./failure.ts";
import { errnoError } from "homebridge-plugin-utils/testing";
import { errors } from "undici";

// The fields a row asserts, read off one classification, so each row states its expectation as a single literal.
function reading(error: unknown, signal?: AbortSignal): { code: string | undefined; kind: TransportFailure["kind"] } {

  const failure = classifyTransportError(error, signal);

  return { code: failure.code, kind: failure.kind };
}

// The platform's deadline, spelled as `AbortSignal.timeout()` aborts with it: a `DOMException` named for what happened, carrying a legacy numeric code.
function platformTimeout(): DOMException {

  return new DOMException("The operation was aborted due to timeout", "TimeoutError");
}

// The platform's cancellation, spelled the same way.
function platformAbort(): DOMException {

  return new DOMException("This operation was aborted", "AbortError");
}

// An errno failure wrapped the given number of links deep, under wrappers that carry no code of their own.
function buried(depth: number): unknown {

  let link: unknown = errnoError("connect ECONNREFUSED", "ECONNREFUSED");

  for(let level = 0; level < depth; level++) {

    link = new Error("wrapper " + level.toString() + ".", { cause: link });
  }

  return link;
}

describe("classifyTransportError", () => {

  test("carries the value handed in verbatim as the cause", () => {

    const errno = errnoError("connect ECONNREFUSED", "ECONNREFUSED");

    assert.equal(classifyTransportError(errno).cause, errno);
    assert.equal(classifyTransportError("socket hang up").cause, "socket hang up", "a value that is not an error is carried as it was handed in");
  });

  test("reads a lifetime signal that has already aborted ahead of everything the error says", () => {

    const aborted = AbortSignal.abort();

    assert.deepEqual(reading(errnoError("connect ECONNREFUSED", "ECONNREFUSED"), aborted), { code: "ECONNREFUSED", kind: "aborted" },
      "a teardown reads as a teardown, and the code the chain carried still comes through");
    assert.deepEqual(reading(platformTimeout(), aborted), { code: undefined, kind: "aborted" }, "the signal outranks a timeout the rejection names");
    assert.deepEqual(reading(errnoError("connect ECONNREFUSED", "ECONNREFUSED"), new AbortController().signal), { code: "ECONNREFUSED", kind: "refused" },
      "a signal that has not aborted says nothing about the failure");
  });

  test("reads a timeout at any depth ahead of a cancellation and a code", () => {

    assert.deepEqual(reading(platformTimeout()), { code: undefined, kind: "timeout" }, "the platform's numeric legacy code is not a code this reads");
    assert.deepEqual(reading(errnoError("read ECONNRESET", "ECONNRESET", platformTimeout())), { code: "ECONNRESET", kind: "timeout" },
      "a timeout one link down outranks the code above it, which is still carried");
    assert.deepEqual(reading(new Error("aborted", { cause: new Error("timed out", { cause: platformTimeout() }) })), { code: undefined, kind: "timeout" },
      "a timeout two links down is found as well");
  });

  test("reads a cancellation that is not the lifetime signal's as the deadline", () => {

    assert.deepEqual(reading(platformAbort()), { code: undefined, kind: "timeout" });
    assert.deepEqual(reading(new errors.RequestAbortedError()), { code: "UND_ERR_ABORTED", kind: "timeout" }, "undici's own class for an aborted request");
    assert.deepEqual(reading(errnoError("connect ECONNREFUSED", "ECONNREFUSED", platformAbort())), { code: "ECONNREFUSED", kind: "timeout" },
      "a cancellation below a code outranks the code map");
  });

  test("reads undici's own failures by the codes they carry", () => {

    const aggregate = Object.assign(new AggregateError([errnoError("connect ETIMEDOUT 10.0.0.1:443", "ETIMEDOUT")], "connect ETIMEDOUT"), { code: "ETIMEDOUT" });
    const normalized = Object.assign(new errors.ConnectTimeoutError("Connect Timeout Error (attempted address: 10.0.0.1:443, timeout: 10000ms)"),
      { cause: aggregate });

    assert.deepEqual(reading(new errors.ConnectTimeoutError()), { code: "UND_ERR_CONNECT_TIMEOUT", kind: "connect-timeout" });
    assert.deepEqual(reading(normalized), { code: "UND_ERR_CONNECT_TIMEOUT", kind: "connect-timeout" },
      "undici's connect normalization wraps an ETIMEDOUT aggregate, and the nearer code is the one read");
    assert.deepEqual(reading(new errors.HeadersTimeoutError()), { code: "UND_ERR_HEADERS_TIMEOUT", kind: "timeout" });
    assert.deepEqual(reading(new errors.BodyTimeoutError()), { code: "UND_ERR_BODY_TIMEOUT", kind: "timeout" });
    assert.deepEqual(reading(new errors.RequestRetryError("Request failed", 503, {})), { code: "UND_ERR_REQ_RETRY", kind: "retries-exhausted" });
    assert.deepEqual(reading(new errors.ClientDestroyedError()), { code: "UND_ERR_DESTROYED", kind: "destroyed" });
    assert.deepEqual(reading(new errors.SocketError("other side closed")), { code: "UND_ERR_SOCKET", kind: "transport" },
      "a code with no kind of its own is still carried through");
  });

  test("reads the platform's errno codes, bare or wrapped the way undici wraps them", () => {

    assert.deepEqual(reading(errnoError("connect ECONNREFUSED", "ECONNREFUSED")), { code: "ECONNREFUSED", kind: "refused" });
    assert.deepEqual(reading(errnoError("connect EHOSTDOWN", "EHOSTDOWN")), { code: "EHOSTDOWN", kind: "refused" });
    assert.deepEqual(reading(errnoError("read ECONNRESET", "ECONNRESET")), { code: "ECONNRESET", kind: "reset" });
    assert.deepEqual(reading(errnoError("getaddrinfo ENOTFOUND", "ENOTFOUND")), { code: "ENOTFOUND", kind: "dns" });
    assert.deepEqual(reading(errnoError("getaddrinfo EAI_AGAIN", "EAI_AGAIN")), { code: "EAI_AGAIN", kind: "dns" });
    assert.deepEqual(reading(errnoError("write EPIPE", "EPIPE")), { code: "EPIPE", kind: "transport" });
    assert.deepEqual(reading(errnoError("read ETIMEDOUT", "ETIMEDOUT")), { code: "ETIMEDOUT", kind: "transport" },
      "a bare socket timeout is not one of undici's deadlines, so it carries its code as a transport failure");
    assert.deepEqual(reading(new TypeError("fetch failed", { cause: errnoError("connect ECONNREFUSED", "ECONNREFUSED") })), { code: "ECONNREFUSED",
      kind: "refused" }, "the errno one hop down, which is where undici's fetch puts it");
  });

  test("reads the certificate verdicts as one family, and nothing outside it", () => {

    assert.deepEqual(reading(errnoError("self-signed certificate", "DEPTH_ZERO_SELF_SIGNED_CERT")), { code: "DEPTH_ZERO_SELF_SIGNED_CERT", kind: "certificate" });
    assert.deepEqual(reading(errnoError("unable to verify the first certificate", "UNABLE_TO_VERIFY_LEAF_SIGNATURE")),
      { code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE", kind: "certificate" });
    assert.deepEqual(reading(errnoError("hostname mismatch", "ERR_TLS_CERT_ALTNAME_INVALID")), { code: "ERR_TLS_CERT_ALTNAME_INVALID", kind: "certificate" },
      "the hostname check Node runs itself is a verdict about the certificate too");
    assert.deepEqual(reading(new Error("fetch failed", { cause: errnoError("certificate has expired", "CERT_HAS_EXPIRED") })),
      { code: "CERT_HAS_EXPIRED", kind: "certificate" }, "the wrapped shape undici raises reads the same way");
    assert.deepEqual(reading(errnoError("out of memory", "OUT_OF_MEM")), { code: "OUT_OF_MEM", kind: "transport" },
      "the verifier running out of room is not a verdict about the certificate");
    assert.deepEqual(reading(new TypeError("terminated")), { code: undefined, kind: "transport" }, "a content-free socket failure carries nothing to read");
  });

  test("takes the nearest code, so a certificate verdict below a coded wrapper reads as the wrapper", () => {

    const wrapped = errnoError("other side closed", "UND_ERR_SOCKET", errnoError("self-signed certificate", "DEPTH_ZERO_SELF_SIGNED_CERT"));

    assert.deepEqual(reading(wrapped), { code: "UND_ERR_SOCKET", kind: "transport" });
  });

  test("skips a code that is not a string and keeps descending", () => {

    const wrapped = errnoError("wrapper.", 42, errnoError("read ECONNRESET", "ECONNRESET"));

    assert.deepEqual(reading(wrapped), { code: "ECONNRESET", kind: "reset" });
  });

  test("descends to the depth bound and no further", () => {

    assert.deepEqual(reading(buried(2)), { code: "ECONNREFUSED", kind: "refused" }, "a code two links down is read");
    assert.deepEqual(reading(buried(8)), { code: "ECONNREFUSED", kind: "refused" }, "a code at the bound is read");
    assert.deepEqual(reading(buried(9)), { code: undefined, kind: "transport" }, "a code one past the bound is not");
  });

  test("terminates on a chain that refers back to itself", () => {

    const outer = new Error("Unable to reach the controller.");

    outer.cause = new Error("the dial failed.", { cause: outer });

    assert.deepEqual(reading(outer), { code: undefined, kind: "transport" });
  });

  test("reads a value that is not an error as a transport failure, and an object's code whether or not it is an error", () => {

    assert.deepEqual(reading("socket hang up"), { code: undefined, kind: "transport" });
    assert.deepEqual(reading(undefined), { code: undefined, kind: "transport" });
    assert.deepEqual(reading(null), { code: undefined, kind: "transport" });
    assert.deepEqual(reading({ code: "ECONNREFUSED" }), { code: "ECONNREFUSED", kind: "refused" });
  });
});
