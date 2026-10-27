/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * errors.test.ts: Unit tests for the typed error hierarchy. The hierarchy's whole purpose is that a consumer can branch on the abstract base (RecoverableError vs.
 * FatalError) for policy and on the concrete class for handling, so these tests assert the instanceof relationships for every RecoverableError subclass and every
 * FatalError subclass, that each error reports its own class name, that every concrete class chains its cause, that the typed fields are carried, and that the
 * errno-resolution helpers behave across the shapes undici and Node produce.
 */
import * as errorModule from "./errors.ts";
import { FatalError, ProtectAbortedError, ProtectAuthError, ProtectAuthorizationError, ProtectBootstrapError, ProtectCertificateError, ProtectCodecChangeError,
  ProtectConfigurationError, ProtectError, ProtectLivestreamUnavailableError, ProtectNetworkError, ProtectProtocolError, ProtectRequestError, ProtectStallError,
  ProtectThrottledError, ProtectTimeoutError, ProtectUnsupportedError, RecoverableError, assertNever, causeChain, isExpectedWsDisconnect,
  resolveErrnoCause } from "./errors.ts";
import { describe, test } from "node:test";
import { DOORBELL_INIT } from "./protocol/init-segment.fixtures.ts";
import assert from "node:assert/strict";
import { describeInitSegment } from "./protocol/init-segment.ts";
import { errnoError } from "homebridge-plugin-utils/testing";

// A livestream init, the shape the codec-change error carries on both sides of the change, shared by the hierarchy rows and the cause row.
const init = { codec: "avc1.640028", data: DOORBELL_INIT, description: describeInitSegment(DOORBELL_INIT) };

describe("ProtectError hierarchy", () => {

  const recoverable = [

    new ProtectAbortedError("aborted"),
    new ProtectCertificateError({ cause: new Error("self-signed certificate"), host: "10.0.0.1" }),
    new ProtectNetworkError("net", { code: "ECONNREFUSED" }),
    new ProtectStallError("stall", { silentForMs: 10000 }),
    new ProtectThrottledError("throttle", { cooldownMs: 300000 }),
    new ProtectTimeoutError("timeout", { elapsedMs: 3500 })
  ];

  const fatal = [

    new ProtectAuthError("auth", { statusCode: 401 }),
    new ProtectAuthorizationError("authz", { statusCode: 403 }),
    new ProtectBootstrapError("bootstrap", { stage: "fetch" }),
    new ProtectCodecChangeError("codec", { from: init, to: init }),
    new ProtectConfigurationError("configuration"),
    new ProtectLivestreamUnavailableError("unavailable", { attempts: 1, phase: "establishing" }),
    new ProtectProtocolError("protocol"),
    new ProtectRequestError("request", { statusCode: 500 }),
    new ProtectUnsupportedError("unsupported")
  ];

  for(const error of recoverable) {

    test(error.name + " is a RecoverableError and a ProtectError, not a FatalError", () => {

      assert.ok(error instanceof RecoverableError);
      assert.ok(error instanceof ProtectError);
      assert.ok(error instanceof Error);
      assert.ok(!(error instanceof FatalError));
      assert.equal(error.name, error.constructor.name, "name should reflect the concrete class");
    });
  }

  for(const error of fatal) {

    test(error.name + " is a FatalError and a ProtectError, not a RecoverableError", () => {

      assert.ok(error instanceof FatalError);
      assert.ok(error instanceof ProtectError);
      assert.ok(error instanceof Error);
      assert.ok(!(error instanceof RecoverableError));
      assert.equal(error.name, error.constructor.name);
    });
  }
});

describe("typed error fields and cause chaining", () => {

  test("each error chains its cause", () => {

    const root = new Error("root cause");

    // Each concrete class, built with the same root cause, so a constructor that drops its cause on the way to the base class fails here.
    const errors = [

      new ProtectAbortedError("m", { cause: root }),
      new ProtectAuthError("m", { cause: root }),
      new ProtectAuthorizationError("m", { cause: root }),
      new ProtectBootstrapError("m", { cause: root, stage: "fetch" }),
      new ProtectCertificateError({ cause: root, host: "10.0.0.1" }),
      new ProtectCodecChangeError("m", { cause: root, from: init, to: init }),
      new ProtectConfigurationError("m", { cause: root }),
      new ProtectLivestreamUnavailableError("m", { attempts: 1, cause: root, phase: "establishing" }),
      new ProtectNetworkError("m", { cause: root }),
      new ProtectProtocolError("m", { cause: root }),
      new ProtectRequestError("m", { cause: root, statusCode: 500 }),
      new ProtectStallError("m", { cause: root, silentForMs: 1 }),
      new ProtectThrottledError("m", { cause: root, cooldownMs: 1 }),
      new ProtectTimeoutError("m", { cause: root, elapsedMs: 1 }),
      new ProtectUnsupportedError("m", { cause: root })
    ];

    for(const error of errors) {

      assert.ok(Object.is(error.cause, root), error.name + " must chain its cause");
    }

    // The module's own exports hold the list to completeness: each exported class whose prototype chain reaches ProtectError, less the abstract bases beneath it, is one
    // the list builds, so a class added to the module without an entry above fails this row rather than leaving its cause unread.
    const abstractBases = new Set<unknown>([ FatalError, RecoverableError ]);
    const exported = Object.values(errorModule).flatMap((value) => ((typeof value === "function") && (value.prototype instanceof ProtectError) &&
      !abstractBases.has(value)) ? [value.name] : []);
    const built = [...new Set(errors.map((error) => error.constructor))].map((errorClass) => errorClass.name);

    assert.deepEqual(built.sort(), exported.sort(), "the list builds every concrete class the module exports and no other");
  });

  test("ProtectThrottledError carries cooldownMs", () => {

    assert.equal(new ProtectThrottledError("m", { cooldownMs: 300000 }).cooldownMs, 300000);
  });

  test("ProtectTimeoutError carries elapsedMs", () => {

    assert.equal(new ProtectTimeoutError("m", { elapsedMs: 3500 }).elapsedMs, 3500);
  });

  test("ProtectStallError carries silentForMs", () => {

    assert.equal(new ProtectStallError("m", { silentForMs: 10000 }).silentForMs, 10000);
  });

  test("ProtectRequestError carries statusCode, body, and headers", () => {

    const error = new ProtectRequestError("m", { body: { error: "nope" }, headers: { "content-type": "application/json" }, statusCode: 503 });

    assert.equal(error.statusCode, 503);
    assert.deepEqual(error.body, { error: "nope" });
    assert.deepEqual(error.headers, { "content-type": "application/json" });
  });

  test("ProtectBootstrapError carries its stage tag", () => {

    assert.equal(new ProtectBootstrapError("m", { stage: "subscribe" }).stage, "subscribe");
  });

  test("ProtectAuthError and ProtectAuthorizationError carry their status codes", () => {

    assert.equal(new ProtectAuthError("m", { statusCode: 401 }).statusCode, 401);
    assert.equal(new ProtectAuthorizationError("m", { statusCode: 403 }).statusCode, 403);
  });

  test("ProtectNetworkError resolves its code from the cause chain when not given explicitly", () => {

    const errno = Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" });

    assert.equal(new ProtectNetworkError("m", { cause: errno }).code, "ENOTFOUND");
    assert.equal(new ProtectNetworkError("m", { code: "ECONNREFUSED" }).code, "ECONNREFUSED", "an explicit code wins over the cause chain");
    assert.equal(new ProtectNetworkError("m").code, undefined, "no code and no resolvable cause yields undefined");
  });
});

describe("ProtectCertificateError", () => {

  const selfSigned = errnoError("self-signed certificate", "DEPTH_ZERO_SELF_SIGNED_CERT");

  test("is a ProtectNetworkError, so every reading that already treats a reachability failure as recoverable covers it", () => {

    const error = new ProtectCertificateError({ cause: selfSigned, host: "10.0.0.1" });

    assert.ok(error instanceof ProtectNetworkError, "a certificate refusal is a network failure with a name");
    assert.ok(error instanceof RecoverableError, "an operator installing a certificate fixes it while the process runs");
    assert.ok(!(error instanceof FatalError), "a fatal classification would stop the connection monitor trying again");
  });

  test("names the address dialed, the reason, and the code, with the code read from the cause", () => {

    const error = new ProtectCertificateError({ cause: selfSigned, host: "[fe80::1]:7443" });

    assert.equal(error.message, "The UniFi Protect controller at [fe80::1]:7443 presented a certificate that could not be verified: self-signed certificate " +
      "(DEPTH_ZERO_SELF_SIGNED_CERT).");
    assert.equal(error.code, "DEPTH_ZERO_SELF_SIGNED_CERT", "the code lifts from the very cause the sentence was composed from");
    assert.equal(error.host, "[fe80::1]:7443");
    assert.ok(Object.is(error.cause, selfSigned));
  });

  test("reads an errno one hop down the cause, as ProtectNetworkError reads its code", () => {

    const error = new ProtectCertificateError({ cause: new TypeError("fetch failed", { cause: selfSigned }), host: "10.0.0.1" });

    assert.equal(error.code, "DEPTH_ZERO_SELF_SIGNED_CERT");
    assert.ok(error.message.endsWith(": self-signed certificate (DEPTH_ZERO_SELF_SIGNED_CERT)."));
  });

  test("drops the reason clause when the platform supplied no words", () => {

    const error = new ProtectCertificateError({ cause: errnoError("", "DEPTH_ZERO_SELF_SIGNED_CERT"), host: "10.0.0.1" });

    assert.equal(error.message, "The UniFi Protect controller at 10.0.0.1 presented a certificate that could not be verified (DEPTH_ZERO_SELF_SIGNED_CERT).",
      "a sentence with nothing to introduce carries no colon to introduce it with");
  });

  test("states the refusal alone when the cause carries no errno to read", () => {

    // The class is public, so a caller can construct it around a cause the errno resolution cannot read. There is then neither a reason nor a code to report, and the
    // sentence says the one thing still known.
    const error = new ProtectCertificateError({ cause: new TypeError("terminated"), host: "10.0.0.1" });

    assert.equal(error.message, "The UniFi Protect controller at 10.0.0.1 presented a certificate that could not be verified.");
    assert.equal(error.code, undefined, "there was no errno to lift one from");
  });

  test("trims the platform's own padding out of the reason clause", () => {

    const error = new ProtectCertificateError({ cause: errnoError("  self-signed certificate \n", "DEPTH_ZERO_SELF_SIGNED_CERT"), host: "10.0.0.1" });

    assert.ok(error.message.includes(": self-signed certificate ("), "the reason reads as one clause rather than carrying the platform's whitespace");
  });
});

describe("causeChain", () => {

  test("yields the value handed in and then each cause beneath it, nearest first", () => {

    const errno = errnoError("connect ECONNREFUSED", "ECONNREFUSED");
    const middle = new Error("the dial failed.", { cause: errno });
    const outer = new TypeError("fetch failed", { cause: middle });

    assert.deepEqual([...causeChain(outer)], [ outer, middle, errno ], "a link carrying no cause key is the last one yielded");
    assert.deepEqual([...causeChain("refused")], ["refused"], "a value that is not an object is yielded and holds nothing beneath it");

    // A cause that is not an object is still a link: it is yielded verbatim, and what it means is left to the reader.
    assert.deepEqual([...causeChain(new Error("wrapped", { cause: "refused" }))].slice(1), ["refused"]);
  });

  test("stops at the depth bound", () => {

    const links: Error[] = [new Error("level 11.")];

    for(let level = 10; level >= 0; level--) {

      links.unshift(new Error("level " + level.toString() + ".", { cause: links[0] }));
    }

    // The value handed in is depth zero, and the bound's worth of links below it are still yielded...the link one past the bound, and everything beneath it, is not.
    assert.deepEqual([...causeChain(links[0])], links.slice(0, 9));
  });

  test("terminates on a chain that refers back to itself", () => {

    const outer = new Error("Unable to fetch the bootstrap.");
    const inner = new Error("the controller refused the request.", { cause: outer });

    outer.cause = inner;

    // The bound is what ends the descent, so the two links alternate until it is exhausted rather than the walk running forever.
    assert.deepEqual([...causeChain(outer)], [ outer, inner, outer, inner, outer, inner, outer, inner, outer ]);
  });
});

describe("resolveErrnoCause", () => {

  test("resolves a Node ErrnoException wrapped on the cause chain (undici shape)", () => {

    const inner = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
    const outer = new TypeError("fetch failed", { cause: inner });

    assert.ok(Object.is(resolveErrnoCause(outer), inner));
    assert.equal(resolveErrnoCause(outer)?.code, "ECONNREFUSED");
  });

  test("resolves a bare ErrnoException", () => {

    const errno = Object.assign(new Error("read ETIMEDOUT"), { code: "ETIMEDOUT" });

    assert.ok(Object.is(resolveErrnoCause(errno), errno));
  });

  test("returns undefined for an error whose code is not a string", () => {

    assert.equal(resolveErrnoCause(Object.assign(new Error("x"), { code: 42 })), undefined);
  });

  test("returns undefined for non-error and code-less inputs", () => {

    assert.equal(resolveErrnoCause("a string"), undefined);
    assert.equal(resolveErrnoCause(undefined), undefined);
    assert.equal(resolveErrnoCause(new Error("plain")), undefined);
  });
});

describe("isExpectedWsDisconnect", () => {

  test("treats a TypeError as an expected disconnect", () => {

    assert.equal(isExpectedWsDisconnect(new TypeError("socket closed mid-frame")), true);
  });

  test("treats an ETIMEDOUT errno as an expected disconnect", () => {

    assert.equal(isExpectedWsDisconnect(Object.assign(new Error("x"), { code: "ETIMEDOUT" })), true);
  });

  test("does not suppress an ordinary error", () => {

    assert.equal(isExpectedWsDisconnect(new Error("a real failure")), false);
    assert.equal(isExpectedWsDisconnect("a string"), false);
  });
});

describe("assertNever", () => {

  test("throws a ProtectProtocolError naming an object variant's kind tag", () => {

    // The reducer and event-attribution switches reach this only when untyped code smuggles in an unmodeled variant; we surface the tag for diagnosis.
    assert.throws(() => assertNever({ kind: "ghostKind" } as never), { constructor: ProtectProtocolError, message: /ghostKind/ });
  });

  test("throws naming a bare value when the variant has no kind tag", () => {

    // The modelKey switch passes a bare string, not an object - the fallback branch surfaces its string form rather than a useless `undefined`.
    assert.throws(() => assertNever("phantomModelKey" as never), { constructor: ProtectProtocolError, message: /phantomModelKey/ });
  });

  test("throws with the coerced object form when an object variant carries no kind tag", () => {

    // An object tagged some other way (a `type`-tagged union) takes the same fallback branch as a bare value, where String() yields the generic "[object Object]" -
    // no name distinguishes the variant, which is exactly what the message reports.
    assert.throws(() => assertNever({ type: "phantomTag" } as never), { constructor: ProtectProtocolError, message: /\[object Object\]/ });
  });
});
