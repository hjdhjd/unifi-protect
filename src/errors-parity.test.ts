/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * errors-parity.test.ts: Differential tests holding this library's cause-chain descent equal to homebridge-plugin-utils' own. The library takes no runtime
 * dependency on that package, so the rule is implemented in both places; this suite feeds a table of shapes through each and asserts the same links come back in the
 * same order, so a change to either descent reddens it here.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { causeChain } from "./errors.ts";
import { causeChain as causeChainWithPluginUtils } from "homebridge-plugin-utils";
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
