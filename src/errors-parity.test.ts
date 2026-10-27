/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * errors-parity.test.ts: Differential tests holding this library's cause-chain descent and its rendering of a chain equal to homebridge-plugin-utils' own. The
 * library takes no runtime dependency on that package, so each rule is implemented in both places; this suite feeds a table of shapes through each and asserts the
 * same links come back in the same order and the same text comes back, so a change to either side reddens it here.
 */
import { ProtectAuthError, ProtectBootstrapError, causeChain, formatErrorChain } from "./errors.ts";
import { causeChain as causeChainWithPluginUtils, formatErrorMessage } from "homebridge-plugin-utils";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { errnoError } from "homebridge-plugin-utils/testing";

interface ChainCase {

  name: string;
  value: unknown;
}

/* Every shape the descent branches on: a lone value, a chain that ends on a link with no cause key, one that ends on a link that is not an object, a cause key that
 * carries `undefined`, the depth bound and a chain that refers back to itself. Built by a function rather than held as a module constant so each run gets its own
 * values...the self-referential row mutates the error it names, and a shared table would carry that mutation between tests.
 */
function chainTable(): ChainCase[] {

  const looping = new Error("Unable to fetch the bootstrap.");

  looping.cause = new Error("the controller refused the request.", { cause: looping });

  let bounded = new Error("level 11.");

  for(let level = 10; level >= 0; level--) {

    bounded = new Error("level " + level.toString() + ".", { cause: bounded });
  }

  return [

    { name: "a lone error", value: new Error("Unable to fetch the bootstrap.") },
    { name: "a string", value: "socket hang up" },
    { name: "undefined", value: undefined },
    { name: "null", value: null },
    { name: "an errno one hop down, as undici's fetch wraps it", value: new TypeError("fetch failed", { cause: errnoError("connect ECONNREFUSED", "ECONNREFUSED") }) },
    { name: "a cause that is not an object", value: new Error("Unable to fetch the bootstrap.", { cause: "the controller refused." }) },
    { name: "a plain object carrying an error below it", value: new Error("wrapper.", { cause: { cause: new Error("connect ECONNREFUSED."), code: "X" } }) },
    { name: "a cause key carrying undefined", value: new Error("Unable to fetch the bootstrap.", { cause: undefined }) },
    { name: "a chain deeper than the bound", value: bounded },
    { name: "a chain that refers back to itself", value: looping }
  ];
}

describe("causeChain parity with homebridge-plugin-utils", () => {

  for(const { name, value } of chainTable()) {

    test("descends " + name + " exactly as homebridge-plugin-utils does", () => {

      const local = [...causeChain(value)];
      const shared = [...causeChainWithPluginUtils(value)];

      assert.equal(local.length, shared.length, "the two descents yield the same number of links for " + name);
      assert.ok(local.every((link, index) => Object.is(link, shared[index])), "the two descents yield the same links in the same order for " + name);
    });
  }
});

/* Every shape the rendering rule branches on, plus the chains the library produces: a bootstrap refusal wrapping the transport's own classification, and a socket's
 * failure wrapping the platform's errno. Built by a function for the reason the descent table is.
 */
function renderingTable(): ChainCase[] {

  const looping = new Error("Unable to fetch the bootstrap.");

  looping.cause = new Error("the controller refused the request.", { cause: looping });

  let bounded = new Error("level 11.");

  for(let level = 10; level >= 0; level--) {

    bounded = new Error("level " + level.toString() + ".", { cause: bounded });
  }

  return [

    { name: "a lone error whose message ends in a period", value: new Error("Unable to fetch the bootstrap.") },
    { name: "a lone error whose message carries no period", value: new Error("Unable to fetch the bootstrap") },
    { name: "a string", value: "the controller refused." },
    { name: "a number", value: 42 },
    { name: "undefined", value: undefined },
    { name: "a two-link chain", value: new Error("Unable to fetch the bootstrap.", { cause: new Error("the controller refused the request.") }) },
    { name: "a three-link chain", value: new Error("Unable to fetch the bootstrap.",
      { cause: new Error("the controller refused the request.", { cause: new Error("connect ECONNREFUSED.") }) }) },
    { name: "a cause whose words the top sentence already carries", value: new Error("Unable to fetch the bootstrap: the controller refused the request.",
      { cause: new Error("the controller refused the request.") }) },
    { name: "a cause whose words an earlier link already appended", value: new Error("Unable to reboot the camera.",
      { cause: new Error("the controller refused the request.", { cause: new Error("the controller refused.") }) }) },
    { name: "a cause whose message is empty", value: new Error("Unable to fetch the bootstrap.", { cause: new Error("") }) },
    { name: "a link that is not an error carrying a further error below it", value: new Error("Unable to fetch the bootstrap.",
      { cause: { cause: new Error("connect ECONNREFUSED."), code: "X" } }) },
    { name: "a cause that is not an object", value: new Error("Unable to fetch the bootstrap.", { cause: "the controller refused." }) },
    { name: "a top value that is not an error carrying an error below it", value: { cause: new Error("the controller refused the request."), code: "X" } },
    { name: "a chain deeper than the bound", value: bounded },
    { name: "a chain that refers back to itself", value: looping },
    { name: "a cause key carrying undefined", value: new Error("Unable to fetch the bootstrap.",
      { cause: new Error("the controller refused the request.", { cause: undefined }) }) },
    { name: "a bootstrap refusal wrapping the transport's classification", value: new ProtectBootstrapError("Unable to fetch the UniFi Protect controller bootstrap.",
      { cause: new ProtectAuthError("The UniFi Protect controller rejected the credentials.", { statusCode: 401 }), stage: "fetch" }) },
    { name: "a socket failure wrapping the platform's errno", value: new Error("The UniFi Protect realtime events API connection failed.",
      { cause: errnoError("connect ECONNREFUSED 10.0.0.1:443", "ECONNREFUSED") }) }
  ];
}

describe("formatErrorChain parity with homebridge-plugin-utils", () => {

  for(const { name, value } of renderingTable()) {

    test("renders " + name + " exactly as homebridge-plugin-utils does", () => {

      assert.equal(formatErrorChain(value), formatErrorMessage(value), "the two renderings agree on " + name);
    });
  }
});
