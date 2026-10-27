/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * ws.test.ts: Tests for the reasons a socket's one teardown runs for - the close code each reason announces, the frame a peer-close error names, and the fault a
 * socket's failure classifies into, with the line it carries at each level the connection-fault table answers.
 */
import { ProtectCertificateError, ProtectNetworkError, ProtectTimeoutError } from "../errors.ts";
import { closeFrameText, socketFault, teardownCode } from "./ws.ts";
import { describe, test } from "node:test";
import type { SocketTeardown } from "./ws.ts";
import assert from "node:assert/strict";
import { errnoError } from "homebridge-plugin-utils/testing";

// The sentences a socket hands the fault builder, and the address it dialed.
const FAULT_OPTIONS = { elapsed: 2500, failed: "The socket connection failed.", host: "10.0.0.1:7443", reason: "the socket connection errored",
  reported: "The socket reported an error.", timedOut: "The socket connection timed out." };

describe("teardownCode", () => {

  test("a caller's cancel and an explicit close announce 1000, a fault 1006, and a peer's close its own frame's code", () => {

    const teardowns: [SocketTeardown, number][] = [

      [ { kind: "callerSignal", reason: "aborted" }, 1000 ],
      [ { kind: "close", reason: "closed by the client" }, 1000 ],
      [ { error: new ProtectNetworkError("The socket connection failed."), kind: "fault", line: null, reason: "errored" }, 1006 ],
      [ { code: 4000, kind: "peer", reason: "bye" }, 4000 ]
    ];

    for(const [ teardown, code ] of teardowns) {

      assert.equal(teardownCode(teardown), code, teardown.kind);
    }
  });
});

describe("closeFrameText", () => {

  test("names the code alone for a frame with no reason, and the code and the reason otherwise", () => {

    assert.equal(closeFrameText(1006, ""), "close code 1006");
    assert.equal(closeFrameText(4000, "bye"), "close code 4000: bye");
  });
});

describe("socketFault", () => {

  test("a certificate refusal on an open socket carries an error line beside the ProtectCertificateError naming the address dialed", () => {

    const cause = errnoError("self-signed certificate", "DEPTH_ZERO_SELF_SIGNED_CERT");
    const fault = socketFault({ ...FAULT_OPTIONS, cause, open: true });

    assert.ok(fault.error instanceof ProtectCertificateError);
    assert.equal(fault.error.host, FAULT_OPTIONS.host);
    assert.deepEqual(fault.line, { context: { error: cause }, level: "error", message: FAULT_OPTIONS.reported });
    assert.equal(fault.kind, "fault");
    assert.equal(fault.reason, FAULT_OPTIONS.reason);
  });

  test("a reset on an open socket carries a warning line naming the reset, beside a ProtectNetworkError carrying its code", () => {

    const cause = errnoError("read ECONNRESET", "ECONNRESET");
    const fault = socketFault({ ...FAULT_OPTIONS, cause, open: true });

    assert.ok(fault.error instanceof ProtectNetworkError);
    assert.equal(fault.error.message, FAULT_OPTIONS.failed);
    assert.equal(fault.error.code, "ECONNRESET");
    assert.deepEqual(fault.line, { context: { error: cause }, level: "warn", message: FAULT_OPTIONS.reported });
    assert.ok(Object.is(fault.line.context.error, cause), "the line's subject is the cause itself");
  });

  test("a hang-up with no close frame on an open socket carries no line", () => {

    const fault = socketFault({ ...FAULT_OPTIONS, cause: new TypeError(""), open: true });

    assert.ok(fault.error instanceof ProtectNetworkError);
    assert.equal(fault.error.code, undefined);
    assert.equal(fault.line, null);
  });

  test("a deadline on an open socket carries no line beside a ProtectTimeoutError measuring the elapsed time", () => {

    const fault = socketFault({ ...FAULT_OPTIONS, cause: new DOMException("The operation timed out.", "TimeoutError"), open: true });

    assert.ok(fault.error instanceof ProtectTimeoutError);
    assert.equal(fault.error.message, FAULT_OPTIONS.timedOut);
    assert.equal(fault.error.elapsedMs, FAULT_OPTIONS.elapsed);
    assert.equal(fault.line, null);
  });

  test("a failure before the open carries no line whatever its level, its typed error unchanged", () => {

    for(const cause of [ errnoError("self-signed certificate", "DEPTH_ZERO_SELF_SIGNED_CERT"), errnoError("read ECONNRESET", "ECONNRESET") ]) {

      const fault = socketFault({ ...FAULT_OPTIONS, cause, open: false });

      assert.equal(fault.line, null, cause.message);
      assert.ok(fault.error instanceof ProtectNetworkError, cause.message);
      assert.ok(Object.is(fault.error.cause, cause), "the typed error carries the cause it was classified from");
    }
  });
});
