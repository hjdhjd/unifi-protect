/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * plain-object.ts: The one test for whether a value is a record with fields to read, the shape a wire payload must have before anything reads it by key.
 */

/**
 * The plain-object predicate: whether a value is a record, the shape parsed JSON gives an object.
 *
 * This module is Layer 1: no I/O, no time, no state, no dependency on anything else in the library. Judging the shape of a wire payload is the protocol layer's
 * concern, so the reducer and the classifier test with this one definition, and the CLI reaches it through the barrel as any consumer does.
 *
 * @module ProtectPlainObject
 */

/**
 * Whether a value is a plain object: a non-null object whose prototype is the ordinary object prototype or null, the shape parsed JSON gives a record.
 *
 * The test is the prototype rather than `typeof`, because a payload is whatever the codec produced: parsed JSON, a UTF-8 string, or a `Buffer`. A buffer answers
 * `typeof` as an object and enumerates as numeric index keys, so a looser test would merge one into a record or walk it and read every byte as a field. Parsed JSON
 * always carries the ordinary object prototype, so this admits exactly what a record can be, and an array, a `Buffer` or any other typed array, a class instance and
 * a function each answer false.
 *
 * @param value - The value to test.
 *
 * @returns `true` when the value is an object whose prototype is the ordinary object prototype or null.
 *
 * @category Utilities
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {

  if((typeof value !== "object") || (value === null)) {

    return false;
  }

  const prototype: unknown = Object.getPrototypeOf(value);

  return (prototype === Object.prototype) || (prototype === null);
}
