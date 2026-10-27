/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * connection-fault-parity.test.ts: Differential tests holding this library's connection-fault level table equal to homebridge-plugin-utils' connectionFaultLevel.
 * The library takes no runtime dependency on homebridge-plugin-utils, so the table is implemented here as well as there; this suite is what keeps the two of them
 * one rule. It feeds every kind, with each code a kind's level reads and a code the table names no row for, through this library's table and
 * homebridge-plugin-utils' alike, open and dialing, and asserts the same level comes back, so a change one table makes and the other does not reddens it here.
 */
import { describe, test } from "node:test";
import { EVERY_KIND } from "./failure.helpers.ts";
import type { TransportFailure } from "./failure.ts";
import assert from "node:assert/strict";
import { connectionFaultLevel } from "./connection-fault.ts";
import { connectionFaultLevel as levelWithPluginUtils } from "homebridge-plugin-utils";

// Every classified failure the table can be asked about: each kind, the codes a kind's level reads split out, and a code that falls to a kind's catch-all. The cause
// is immaterial to the level, so each case carries none.
const CASES: readonly { readonly failure: TransportFailure; readonly name: string }[] = [

  { failure: { cause: undefined, kind: "aborted" }, name: "a teardown" },
  { failure: { cause: undefined, code: "UND_ERR_DESTROYED", kind: "destroyed" }, name: "a destroyed pool" },
  { failure: { cause: undefined, code: "DEPTH_ZERO_SELF_SIGNED_CERT", kind: "certificate" }, name: "a self-signed certificate" },
  { failure: { cause: undefined, code: "ENOTFOUND", kind: "dns" }, name: "a host name that does not resolve" },
  { failure: { cause: undefined, code: "EAI_AGAIN", kind: "dns" }, name: "a resolver failing temporarily" },
  { failure: { cause: undefined, code: "ECONNREFUSED", kind: "refused" }, name: "a refused connection" },
  { failure: { cause: undefined, code: "EHOSTDOWN", kind: "unreachable" }, name: "a host that is down" },
  { failure: { cause: undefined, code: "ETIMEDOUT", kind: "unreachable" }, name: "a peer the platform's own timer gave up on" },
  { failure: { cause: undefined, code: "UND_ERR_CONNECT_TIMEOUT", kind: "connect-timeout" }, name: "a connect deadline" },
  { failure: { cause: undefined, code: "ECONNRESET", kind: "reset" }, name: "a reset connection" },
  { failure: { cause: undefined, code: "UND_ERR_REQ_RETRY", kind: "retries-exhausted" }, name: "an exhausted retry budget" },
  { failure: { cause: undefined, kind: "timeout" }, name: "a deadline carrying no code" },
  { failure: { cause: undefined, code: "UND_ERR_HEADERS_TIMEOUT", kind: "timeout" }, name: "a response deadline" },
  { failure: { cause: undefined, code: "EPIPE", kind: "transport" }, name: "a failure carrying a code with no kind" },
  { failure: { cause: new TypeError(""), kind: "transport" }, name: "undici's empty WebSocket error, carrying no code" }
];

describe("connectionFaultLevel parity with homebridge-plugin-utils", () => {

  for(const { failure, name } of CASES) {

    test("levels " + name + " exactly as homebridge-plugin-utils does, open and dialing", () => {

      for(const open of [ true, false ]) {

        assert.equal(connectionFaultLevel(failure, { open }), levelWithPluginUtils(failure, { open }),
          "homebridge-plugin-utils' table answers the same level for " + name + " " + (open ? "ending an open connection" : "while dialing"));
      }
    });
  }

  test("the cases reach every kind the union names", () => {

    assert.deepEqual([...new Set(CASES.map(({ failure }) => failure.kind))].sort(), Object.keys(EVERY_KIND).sort(),
      "a kind no case reaches is a kind whose parity nothing holds");
  });
});
