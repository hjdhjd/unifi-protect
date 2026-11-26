/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * plain-object.test.ts: Unit tests for the plain-object predicate - the two shapes a record can take, and each object-typed value that carries fields of its own or
 * none and still answers false, a `Buffer` above all.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { isPlainObject } from "./plain-object.ts";

describe("isPlainObject", () => {

  test("an object literal is a plain object", () => {

    assert.equal(isPlainObject({ id: "camera-1" }), true);
  });

  test("an object with a null prototype is a plain object", () => {

    assert.equal(isPlainObject(Object.create(null)), true);
  });

  test("an array is not a plain object", () => {

    assert.equal(isPlainObject([ "camera-1", "camera-2" ]), false);
  });

  test("a Buffer is not a plain object, though typeof reads it as an object with index keys", () => {

    assert.equal(isPlainObject(Buffer.from("{\"id\":\"camera-1\"}")), false);
  });

  test("a Uint8Array is not a plain object", () => {

    assert.equal(isPlainObject(new Uint8Array([ 1, 2, 3 ])), false);
  });

  test("null is not a plain object", () => {

    assert.equal(isPlainObject(null), false);
  });

  test("a class instance is not a plain object", () => {

    class CameraRecord {

      readonly id = "camera-1";
    }

    assert.equal(isPlainObject(new CameraRecord()), false);
  });

  test("a function is not a plain object", () => {

    assert.equal(isPlainObject(() => "camera-1"), false);
  });
});
