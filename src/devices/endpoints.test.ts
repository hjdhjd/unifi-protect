/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * endpoints.test.ts: Unit tests for the device endpoint builder - the per-device and whole-collection URL forms.
 */
import { describe, test } from "node:test";
import { DEVICE_COLLECTION_KEYS } from "../protocol/events.ts";
import assert from "node:assert/strict";
import { deviceEndpoint } from "./endpoints.ts";

describe("deviceEndpoint", () => {

  test("addresses a specific device under its plural collection", () => {

    // Every id-keyed collection's path is the plural of its key. The NVR singleton is no such collection, with neither a plural nor an id, so the row below reads it.
    for(const key of DEVICE_COLLECTION_KEYS) {

      assert.equal(deviceEndpoint("10.0.0.1", key, "d1"), "https://10.0.0.1/proxy/protect/api/" + key + "s/d1");
    }
  });

  test("addresses the whole collection when no id is given - the NVR singleton's PATCH target", () => {

    assert.equal(deviceEndpoint("10.0.0.1", "camera"), "https://10.0.0.1/proxy/protect/api/cameras");
    assert.equal(deviceEndpoint("10.0.0.1", "nvr"), "https://10.0.0.1/proxy/protect/api/nvr");
  });
});
