/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * endpoints.test.ts: Unit tests for the device endpoint builder - the per-device and whole-collection URL forms.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { deviceEndpoint } from "./endpoints.ts";

describe("deviceEndpoint", () => {

  test("addresses a specific device under its plural collection", () => {

    assert.equal(deviceEndpoint("10.0.0.1", "camera", "c1"), "https://10.0.0.1/proxy/protect/api/cameras/c1");
    assert.equal(deviceEndpoint("10.0.0.1", "light", "l1"), "https://10.0.0.1/proxy/protect/api/lights/l1");
    assert.equal(deviceEndpoint("10.0.0.1", "relay", "r1"), "https://10.0.0.1/proxy/protect/api/relays/r1");
  });

  test("addresses the whole collection when no id is given - the NVR singleton's PATCH target", () => {

    assert.equal(deviceEndpoint("10.0.0.1", "nvr"), "https://10.0.0.1/proxy/protect/api/nvr");
  });
});
