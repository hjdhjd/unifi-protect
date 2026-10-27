/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * connection-fault.test.ts: Unit tests for the connection-fault level table - every cell, by kind, by the code where a kind's level reads it, and by whether the
 * fault ended a long-lived connection that had been working. connection-fault-parity.test.ts holds the table to homebridge-plugin-utils' own; this suite states it.
 */
import { describe, test } from "node:test";
import type { ConnectionFaultLevel } from "./connection-fault.ts";
import { EVERY_KIND } from "./failure.helpers.ts";
import type { TransportFailure } from "./failure.ts";
import assert from "node:assert/strict";
import { connectionFaultLevel } from "./connection-fault.ts";

// One cell pair of the table: a classified failure, the level it reads when it ended a long-lived connection that had been working, and the level it reads while
// dialing or for a one-shot request.
interface Cell {

  readonly dialing: ConnectionFaultLevel;
  readonly failure: TransportFailure;
  readonly name: string;
  readonly open: ConnectionFaultLevel;
}

// The table the module states, row by row, each kind's codes split out where its level reads the code. The cause is immaterial to the level, so each row carries none.
const CELLS: readonly Cell[] = [

  { dialing: "quiet", failure: { cause: undefined, kind: "aborted" }, name: "a teardown", open: "quiet" },
  { dialing: "quiet", failure: { cause: undefined, code: "UND_ERR_DESTROYED", kind: "destroyed" }, name: "a destroyed pool", open: "quiet" },
  { dialing: "error", failure: { cause: undefined, code: "CERT_HAS_EXPIRED", kind: "certificate" }, name: "a certificate nothing trusts", open: "error" },
  { dialing: "error", failure: { cause: undefined, code: "ENOTFOUND", kind: "dns" }, name: "a host name that does not resolve", open: "error" },
  { dialing: "warning", failure: { cause: undefined, code: "EAI_AGAIN", kind: "dns" }, name: "a resolver failing temporarily", open: "warning" },
  { dialing: "warning", failure: { cause: undefined, code: "ECONNREFUSED", kind: "refused" }, name: "a refused connection", open: "warning" },
  { dialing: "warning", failure: { cause: undefined, code: "EHOSTUNREACH", kind: "unreachable" }, name: "an unreachable peer", open: "warning" },
  { dialing: "warning", failure: { cause: undefined, code: "UND_ERR_CONNECT_TIMEOUT", kind: "connect-timeout" }, name: "a connect deadline", open: "warning" },
  { dialing: "warning", failure: { cause: undefined, code: "ECONNRESET", kind: "reset" }, name: "a reset connection", open: "warning" },
  { dialing: "warning", failure: { cause: undefined, code: "UND_ERR_REQ_RETRY", kind: "retries-exhausted" }, name: "an exhausted retry budget", open: "warning" },
  { dialing: "warning", failure: { cause: undefined, code: "EPIPE", kind: "transport" }, name: "a failure carrying a code with no kind", open: "warning" },
  { dialing: "warning", failure: { cause: undefined, kind: "timeout" }, name: "a deadline", open: "quiet" },
  { dialing: "warning", failure: { cause: new TypeError(""), kind: "transport" }, name: "undici's empty WebSocket error, carrying no code", open: "quiet" }
];

describe("connectionFaultLevel", () => {

  test("answers every cell of the table, for each kind with each code its level reads, open and dialing", () => {

    // Every kind the classifier answers has a row, read against the one record of the kinds the compiler holds to the union.
    assert.deepEqual([...new Set(CELLS.map(({ failure }) => failure.kind))].sort(), Object.keys(EVERY_KIND).sort(), "the table must have a row for every kind");

    // One comparison over the whole table, so a wrong cell reads as the row and column it sits in, beside every cell that is right.
    const answered = CELLS.map(({ failure, name }) => ({ dialing: connectionFaultLevel(failure, { open: false }), name,
      open: connectionFaultLevel(failure, { open: true }) }));

    assert.deepEqual(answered, CELLS.map(({ dialing, name, open }) => ({ dialing, name, open })), "every cell must answer the level the table states");
  });
});
