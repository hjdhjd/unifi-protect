/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * lookup.test.ts: Unit tests for device resolution (by id and name, with ambiguity handling) and the id-to-name resolver, against a minimal fake client.
 */
import type { Camera, Light, ProtectClient } from "../../index.ts";
import { buildNameResolver, findCamera, findDevice, findDeviceOfType } from "./lookup.ts";
import { describe, test } from "node:test";
import { CliError } from "./shared.ts";
import assert from "node:assert/strict";

interface FakeOpts {

  cameras?: { id: string; name: string }[];
  lights?: { id: string; name: string }[];
  nvr?: { id: string; name: string } | null;
}

// Build a client exposing only what lookup reads: the device collections, camera(id), and the NVR snapshot. The device stubs carry the id, name, and the tag
// `modelKey` the typed resolver narrows on (the fields lookup touches), cast to the projection types.
function fakeClient(opts: FakeOpts): ProtectClient {

  const cameras = (opts.cameras ?? []).map((camera) => ({ ...camera, modelKey: "camera" })) as unknown as Camera[];
  const lights = (opts.lights ?? []).map((light) => ({ ...light, modelKey: "light" })) as unknown as Light[];

  return {

    camera: (id: string): Camera | undefined => cameras.find((camera) => camera.id === id),
    cameras,
    chimes: [],
    fobs: [],
    lights,
    relays: [],
    sensors: [],
    state: { snapshot: (): { nvr: { id: string; name: string } | null } => ({ nvr: opts.nvr ?? null }) },
    viewers: []
  } as unknown as ProtectClient;
}

describe("findCamera", () => {

  test("resolves by exact id", () => {

    const client = fakeClient({ cameras: [{ id: "c1", name: "Front Door" }] });

    assert.equal(findCamera(client, "c1").id, "c1");
  });

  test("resolves by case-insensitive name", () => {

    const client = fakeClient({ cameras: [{ id: "c1", name: "Front Door" }] });

    assert.equal(findCamera(client, "front door").id, "c1");
  });

  test("throws when nothing matches", () => {

    assert.throws(() => findCamera(fakeClient({ cameras: [{ id: "c1", name: "Front Door" }] }), "Back Yard"), CliError);
  });

  test("throws when a name is ambiguous", () => {

    const client = fakeClient({ cameras: [ { id: "c1", name: "Dup" }, { id: "c2", name: "Dup" } ] });

    assert.throws(() => findCamera(client, "Dup"), CliError);
  });
});

describe("findDevice", () => {

  test("resolves a non-camera device by id", () => {

    const client = fakeClient({ lights: [{ id: "l1", name: "Floodlight" }] });

    assert.equal(findDevice(client, "l1").id, "l1");
  });

  test("resolves a non-camera device by name", () => {

    const client = fakeClient({ lights: [{ id: "l1", name: "Floodlight" }] });

    assert.equal(findDevice(client, "floodlight").id, "l1");
  });
});

describe("findDeviceOfType", () => {

  test("resolves a device of the requested class and narrows it", () => {

    const client = fakeClient({ cameras: [{ id: "c1", name: "Front Door" }] });
    const camera = findDeviceOfType(client, "c1", "camera");

    assert.equal(camera.id, "c1");
    assert.equal(camera.modelKey, "camera");
  });

  test("rejects a token that resolves to a device of a different class", () => {

    // "Front Door" is a camera, so requesting it as a relay must fail with a usage error naming both classes rather than acting on the wrong device or returning nothing.
    // This is the resolver's one distinguishing behavior; without it, an implementation whose narrowing never rejects would still pass every other case.
    const client = fakeClient({ cameras: [{ id: "c1", name: "Front Door" }] });

    assert.throws(() => findDeviceOfType(client, "c1", "relay"),
      (error: unknown) => (error instanceof CliError) && (error.exitCode === 2) && error.message.includes("is a camera, not a relay"));
  });

  test("resolves within the requested class when a name collides across classes", () => {

    // A camera and a light both named "Dog Room" - a real controller configuration. Resolving by that name must pick the device *of the requested class* rather than
    // failing as a false cross-class ambiguity: a group command already knows the class it acts on. (This is the case a resolve-across-all-then-narrow implementation
    // regresses - it counts both matches as an ambiguity before narrowing.)
    const client = fakeClient({ cameras: [{ id: "c1", name: "Dog Room" }], lights: [{ id: "l1", name: "Dog Room" }] });
    const light = findDeviceOfType(client, "Dog Room", "light");
    const camera = findDeviceOfType(client, "Dog Room", "camera");

    assert.equal(light.id, "l1");
    assert.equal(light.modelKey, "light");
    assert.equal(camera.id, "c1");
    assert.equal(camera.modelKey, "camera");
  });
});

describe("buildNameResolver", () => {

  test("maps device and NVR ids to names, and unknown ids to undefined", () => {

    const client = fakeClient({ cameras: [{ id: "c1", name: "Front Door" }], nvr: { id: "nvr1", name: "Hubble" } });
    const resolve = buildNameResolver(client);

    assert.equal(resolve("c1"), "Front Door");
    assert.equal(resolve("nvr1"), "Hubble");
    assert.equal(resolve("unknown"), undefined);
  });
});
