/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * errors.test.ts: Unit tests for the typed error hierarchy. The hierarchy's whole purpose is that a consumer can branch on the abstract base (RecoverableError vs.
 * FatalError) for policy and on the concrete class for handling, so these tests assert the instanceof relationships exhaustively, that each error reports its own
 * class name and chains its cause, that the typed fields are carried, and that the errno-resolution helpers behave across the shapes undici and Node produce.
 */
import { FatalError, INSPECT_OPTIONS, ProtectAbortedError, ProtectAuthError, ProtectAuthorizationError, ProtectBootstrapError, ProtectError,
  ProtectNetworkError, ProtectProtocolError, ProtectRequestError, ProtectStallError, ProtectThrottledError, ProtectTimeoutError, RecoverableError,
  assertNever, isExpectedWsDisconnect, resolveErrnoCause } from "./errors.ts";
import { describe, test } from "node:test";
import assert from "node:assert/strict";

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
    new ProtectProtocolError("protocol"),
    new ProtectRequestError("request", { statusCode: 500 })
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

    assert.ok(Object.is(new ProtectTimeoutError("m", { cause: root, elapsedMs: 1 }).cause, root));
    assert.ok(Object.is(new ProtectProtocolError("m", { cause: root }).cause, root));
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

  test("ProtectBootstrapError carries its stage discriminant", () => {

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

describe("INSPECT_OPTIONS", () => {

  test("centralizes the diagnostic inspect shape", () => {

    assert.deepEqual(INSPECT_OPTIONS, { colors: true, depth: null, sorted: true });
  });
});

describe("assertNever", () => {

  test("throws a ProtectProtocolError naming an object variant's kind discriminant", () => {

    // The reducer and event-attribution switches reach this only when untyped code smuggles in an unmodeled variant; we surface the discriminant for diagnosis.
    assert.throws(() => assertNever({ kind: "ghostKind" } as never),
      (error: unknown) => (error instanceof ProtectProtocolError) && error.message.includes("ghostKind"));
  });

  test("throws naming a bare value when the variant has no kind discriminant", () => {

    // The modelKey switch passes a bare string, not an object - the fallback branch surfaces its string form rather than a useless `undefined`.
    assert.throws(() => assertNever("phantomModelKey" as never),
      (error: unknown) => (error instanceof ProtectProtocolError) && error.message.includes("phantomModelKey"));
  });
});
