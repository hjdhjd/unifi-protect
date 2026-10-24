/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * errors.test.ts: Unit tests for the typed error hierarchy. The hierarchy's whole purpose is that a consumer can branch on the abstract base (RecoverableError vs.
 * FatalError) for policy and on the concrete class for handling, so these tests assert the instanceof relationships for every RecoverableError subclass and every
 * FatalError subclass, that each error reports its own class name, that every concrete class chains its cause, that the typed fields are carried, and that the
 * errno-resolution helpers behave across the shapes undici and Node produce.
 */
import * as errorModule from "./errors.ts";
import { FatalError, ProtectAbortedError, ProtectAuthError, ProtectAuthorizationError, ProtectBootstrapError, ProtectCodecChangeError, ProtectError,
  ProtectLivestreamUnavailableError, ProtectNetworkError, ProtectProtocolError, ProtectRequestError, ProtectStallError, ProtectThrottledError, ProtectTimeoutError,
  ProtectUnsupportedError, RecoverableError, assertNever, isExpectedWsDisconnect, resolveErrnoCause } from "./errors.ts";
import { describe, test } from "node:test";
import { DOORBELL_INIT } from "./protocol/init-segment.fixtures.ts";
import assert from "node:assert/strict";
import { describeInitSegment } from "./protocol/init-segment.ts";

// A livestream init, the shape the codec-change error carries on both sides of the change, shared by the hierarchy rows and the cause row.
const init = { codec: "avc1.640028", data: DOORBELL_INIT, description: describeInitSegment(DOORBELL_INIT) };

describe("ProtectError hierarchy", () => {

  const recoverable = [

    new ProtectAbortedError("aborted"),
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
      new ProtectCodecChangeError("m", { cause: root, from: init, to: init }),
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
