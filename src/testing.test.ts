/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * testing.test.ts: Tests for the unifi-protect/testing entry - it publishes the talkback doubles themselves, so a consumer's suite drives the classes the library's
 * own talkback suites hold against the real session.
 */
import * as testing from "./testing.ts";
import { TestTalkbackFactory, TestTalkbackSocket } from "./talkback/double.ts";
import { describe, test } from "node:test";
import assert from "node:assert/strict";

describe("unifi-protect/testing", () => {

  test("publishes the talkback doubles' own classes and no other value", () => {

    // The entry publishes doubles alone, so a real session constructor, which dials a controller, can never reach a consumer through it.
    assert.deepEqual(Object.keys(testing).sort(), [ "TestTalkbackFactory", "TestTalkbackSocket" ], "the entry publishes exactly the talkback doubles");
    assert.ok(Object.is(testing.TestTalkbackFactory, TestTalkbackFactory), "the entry's TestTalkbackFactory is the double's class itself");
    assert.ok(Object.is(testing.TestTalkbackSocket, TestTalkbackSocket), "the entry's TestTalkbackSocket is the double's class itself");
  });
});
