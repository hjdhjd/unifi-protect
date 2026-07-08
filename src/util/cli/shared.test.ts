/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * shared.test.ts: Unit tests for the cross-command CLI infrastructure - the realtime-event filter engine, the option parsers, the async-iterator take, and CliError.
 */
import { CliError, boundedSignal, buildEventFilter, buildRawFilter, commandList, compilePattern, matchesEvent, matchesRawPacket, parseDuration, parseList,
  parseNonNegativeInt, parsePositiveInt, take, wireAbortSignal } from "./shared.ts";
import type { CommandHandler, CommandSpec } from "./shared.ts";
import type { RawPacket, TypedEvent } from "../../index.ts";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

// A name resolver mapping the ids used across the filter tests; everything else resolves to undefined (the "render by id" fallback).
const resolveName = (id: string): string | undefined => ({ cam1: "Front Door", dev1: "Door Hub" })[id];

// Minimal but correctly-typed event literals, one per kind the filter axes exercise.
const motion: TypedEvent = { at: 0, cameraId: "cam1", eventId: "e1", kind: "motionDetected" };
const smartPerson: TypedEvent = { at: 0, cameraId: "cam1", eventId: "e2", kind: "smartDetect", objectTypes: ["person"] };
const smartVehicle: TypedEvent = { at: 0, cameraId: "cam2", eventId: "e3", kind: "smartDetect", objectTypes: ["vehicle"] };
const ring: TypedEvent = { at: 0, cameraId: "cam1", eventId: "e4", kind: "doorbellRing" };
const access: TypedEvent = { action: "entry", at: 0, deviceId: "dev1", eventId: "e5", kind: "accessEvent" };
const patchedCamera: TypedEvent = { id: "cam1", kind: "devicePatched", modelKey: "camera", patch: { name: "x" } };
const patchedLight: TypedEvent = { id: "light9", kind: "devicePatched", modelKey: "light", patch: {} };

describe("commandList", () => {

  test("renders each command beside its summary, sorted by name regardless of table insertion order", () => {

    const noop: CommandHandler = () => Promise.resolve();
    const table: Record<string, CommandSpec> = {};

    // Insert out of order so it is the sort - not the insertion order - that produces the alphabetical listing, proving the listing is derived from the table.
    table["watch"] = { run: noop, summary: "stream things" };
    table["info"] = { run: noop, summary: "show things" };

    assert.deepEqual(commandList(table), [ "  info   show things", "  watch  stream things" ]);
  });
});

describe("parseList", () => {

  test("returns an empty array for an absent flag", () => {

    assert.deepEqual(parseList(undefined), []);
  });

  test("splits, trims, and drops empty terms", () => {

    assert.deepEqual(parseList(" a, b ,,c,"), [ "a", "b", "c" ]);
  });

  test("returns an empty array for a whitespace-only value", () => {

    assert.deepEqual(parseList("  ,  , "), []);
  });
});

describe("parsePositiveInt", () => {

  test("parses a positive integer", () => {

    assert.equal(parsePositiveInt("5", "--count"), 5);
  });

  for(const bad of [ "0", "-1", "3.5", "x", "" ]) {

    test("rejects \"" + bad + "\"", () => {

      assert.throws(() => parsePositiveInt(bad, "--count"), CliError);
    });
  }
});

describe("parseNonNegativeInt", () => {

  test("accepts zero", () => {

    assert.equal(parseNonNegativeInt("0", "--channel"), 0);
  });

  test("accepts a positive integer", () => {

    assert.equal(parseNonNegativeInt("3", "--channel"), 3);
  });

  for(const bad of [ "-1", "2.5", "x" ]) {

    test("rejects \"" + bad + "\"", () => {

      assert.throws(() => parseNonNegativeInt(bad, "--channel"), CliError);
    });
  }
});

describe("parseDuration", () => {

  // Each unit, mapped to its millisecond value, with a magnitude greater than one to prove the magnitude is multiplied (not just the unit recognized).
  for(const [ value, ms ] of [ [ "500ms", 500 ], [ "30s", 30000 ], [ "5m", 300000 ], [ "2h", 7200000 ] ] as const) {

    test("parses " + value + " to " + ms.toString() + " ms", () => {

      assert.equal(parseDuration(value, "--duration"), ms);
    });
  }

  // A bare number (no unit), an unknown unit, a fractional value, zero, a negative, a unit with no magnitude, and empty - every shape that is not a positive integer
  // plus a known unit.
  for(const bad of [ "30", "30x", "1.5h", "0s", "-5s", "s", "" ]) {

    test("rejects \"" + bad + "\"", () => {

      assert.throws(() => parseDuration(bad, "--duration"), CliError);
    });
  }
});

describe("boundedSignal", () => {

  test("returns the base signal unchanged when no duration is set", () => {

    const base = new AbortController().signal;

    assert.equal(boundedSignal(base, undefined), base, "no duration means no new signal - the base is threaded through as-is");
  });

  test("aborts when the base signal aborts", () => {

    const controller = new AbortController();
    const bounded = boundedSignal(controller.signal, 60000);

    assert.equal(bounded.aborted, false);
    controller.abort();
    assert.equal(bounded.aborted, true, "a Ctrl-C on the base aborts the bounded signal");
  });

  test("aborts on its own after the duration elapses, independent of the base", async () => {

    const bounded = boundedSignal(new AbortController().signal, 10);

    assert.equal(bounded.aborted, false);

    // Wait comfortably past the 10 ms deadline; the timeout half of the combined signal fires on its own.
    await delay(40);

    assert.equal(bounded.aborted, true, "the duration deadline aborts the bounded signal");
  });
});

describe("compilePattern", () => {

  test("exact mode matches a whole token case-insensitively", () => {

    const matches = compilePattern("Foo", "exact");

    assert.equal(matches("foo"), true);
    assert.equal(matches("foobar"), false);
  });

  test("substring mode matches by case-insensitive containment", () => {

    const matches = compilePattern("oo", "substring");

    assert.equal(matches("foobar"), true);
    assert.equal(matches("bar"), false);
  });

  test("a wildcard term is an anchored glob regardless of mode", () => {

    assert.equal(compilePattern("Fr*", "substring")("Front Door"), true);
    assert.equal(compilePattern("*Detect*", "exact")("motionDetected"), true);
    assert.equal(compilePattern("?at", "exact")("cat"), true);
    assert.equal(compilePattern("?at", "exact")("scat"), false);
  });
});

describe("matchesEvent", () => {

  test("an empty filter matches every event", () => {

    const filter = buildEventFilter({});

    for(const event of [ motion, smartPerson, ring, access, patchedCamera ]) {

      assert.equal(matchesEvent(filter, event, resolveName), true);
    }
  });

  test("--kind matches the exact kind and excludes others", () => {

    const filter = buildEventFilter({ kind: "motionDetected" });

    assert.equal(matchesEvent(filter, motion, resolveName), true);
    assert.equal(matchesEvent(filter, patchedCamera, resolveName), false);
  });

  test("--kind with a glob matches every *Detect* kind", () => {

    const filter = buildEventFilter({ kind: "*Detect*" });

    assert.equal(matchesEvent(filter, motion, resolveName), true);
    assert.equal(matchesEvent(filter, smartPerson, resolveName), true);
    assert.equal(matchesEvent(filter, ring, resolveName), false);
  });

  test("--kind with a comma list is OR within the axis", () => {

    const filter = buildEventFilter({ kind: "motionDetected,doorbellRing" });

    assert.equal(matchesEvent(filter, motion, resolveName), true);
    assert.equal(matchesEvent(filter, ring, resolveName), true);
    assert.equal(matchesEvent(filter, smartPerson, resolveName), false);
  });

  test("--model-key matches a state transition's modelKey; an activity signal carries none and never matches a positive modelKey filter", () => {

    const filter = buildEventFilter({ modelKey: "camera" });

    assert.equal(matchesEvent(filter, patchedCamera, resolveName), true);
    assert.equal(matchesEvent(filter, patchedLight, resolveName), false);
    assert.equal(matchesEvent(filter, motion, resolveName), false);
  });

  test("--device matches the resolved name or the id, by substring or glob", () => {

    assert.equal(matchesEvent(buildEventFilter({ device: "front" }), motion, resolveName), true);
    assert.equal(matchesEvent(buildEventFilter({ device: "Front*" }), patchedCamera, resolveName), true);
    assert.equal(matchesEvent(buildEventFilter({ device: "cam1" }), motion, resolveName), true);
    assert.equal(matchesEvent(buildEventFilter({ device: "cam2" }), motion, resolveName), false);
  });

  test("--object matches smartDetect object types", () => {

    assert.equal(matchesEvent(buildEventFilter({ object: "person" }), smartPerson, resolveName), true);
    assert.equal(matchesEvent(buildEventFilter({ object: "person" }), smartVehicle, resolveName), false);
    assert.equal(matchesEvent(buildEventFilter({ object: "person" }), motion, resolveName), false);
  });

  test("axes AND together", () => {

    const filter = buildEventFilter({ kind: "smartDetect", object: "person" });

    assert.equal(matchesEvent(filter, smartPerson, resolveName), true);
    assert.equal(matchesEvent(filter, smartVehicle, resolveName), false);
  });

  test("an exclude axis drops matching events and keeps the rest", () => {

    const filter = buildEventFilter({ excludeKind: "devicePatched" });

    assert.equal(matchesEvent(filter, patchedCamera, resolveName), false);
    assert.equal(matchesEvent(filter, motion, resolveName), true);
  });

  test("a positive and an exclude axis combine", () => {

    const filter = buildEventFilter({ excludeObject: "vehicle", kind: "smartDetect" });

    assert.equal(matchesEvent(filter, smartPerson, resolveName), true);
    assert.equal(matchesEvent(filter, smartVehicle, resolveName), false);
  });

  test("the excludeDevice axis drops events attributed to a matching device, by id or resolved name, and keeps the rest", () => {

    // excludeDevice resolves the same way the inclusive device axis does - substring/glob over the id and its resolved name - but as a drop: "front" matches cam1's
    // resolved "Front Door", "cam1" matches the id, and a non-matching token leaves the event in.
    assert.equal(matchesEvent(buildEventFilter({ excludeDevice: "front" }), motion, resolveName), false);
    assert.equal(matchesEvent(buildEventFilter({ excludeDevice: "cam1" }), motion, resolveName), false);
    assert.equal(matchesEvent(buildEventFilter({ excludeDevice: "cam2" }), motion, resolveName), true);
  });

  test("the excludeModelKey axis drops devicePatched events of a matching model and keeps the others", () => {

    const filter = buildEventFilter({ excludeModelKey: "camera" });

    assert.equal(matchesEvent(filter, patchedCamera, resolveName), false);
    assert.equal(matchesEvent(filter, patchedLight, resolveName), true);
  });
});

describe("matchesRawPacket", () => {

  // A camera frame (its header id resolves to "Front Door") and an unmodeled garage frame whose id resolves to nothing.
  const cameraFrame: RawPacket = { header: { action: "update", id: "cam1", modelKey: "camera", newUpdateId: "u1" }, payload: { name: "x" } };
  const garageFrame: RawPacket = { header: { action: "add", id: "g1", modelKey: "garage", newUpdateId: "u2" }, payload: { id: "g1" } };

  test("an empty filter matches every packet", () => {

    const filter = buildRawFilter({});

    assert.equal(matchesRawPacket(filter, cameraFrame, resolveName), true);
    assert.equal(matchesRawPacket(filter, garageFrame, resolveName), true);
  });

  test("the modelKey axis matches whole header tokens, including unmodeled ones", () => {

    assert.equal(matchesRawPacket(buildRawFilter({ modelKey: "garage" }), garageFrame, resolveName), true);
    assert.equal(matchesRawPacket(buildRawFilter({ modelKey: "garage" }), cameraFrame, resolveName), false);
  });

  test("the action axis matches the header action", () => {

    assert.equal(matchesRawPacket(buildRawFilter({ action: "add" }), garageFrame, resolveName), true);
    assert.equal(matchesRawPacket(buildRawFilter({ action: "add" }), cameraFrame, resolveName), false);
  });

  test("the device axis matches the header id and its resolved name, by substring or glob", () => {

    assert.equal(matchesRawPacket(buildRawFilter({ device: "front" }), cameraFrame, resolveName), true);
    assert.equal(matchesRawPacket(buildRawFilter({ device: "Front*" }), cameraFrame, resolveName), true);
    assert.equal(matchesRawPacket(buildRawFilter({ device: "cam1" }), cameraFrame, resolveName), true);
    assert.equal(matchesRawPacket(buildRawFilter({ device: "cam2" }), cameraFrame, resolveName), false);
  });

  test("an exclude axis drops matching packets and keeps the rest", () => {

    const filter = buildRawFilter({ excludeAction: "update" });

    assert.equal(matchesRawPacket(filter, cameraFrame, resolveName), false);
    assert.equal(matchesRawPacket(filter, garageFrame, resolveName), true);
  });

  test("the excludeDevice axis drops packets whose header id or resolved name matches, and keeps the rest", () => {

    assert.equal(matchesRawPacket(buildRawFilter({ excludeDevice: "front" }), cameraFrame, resolveName), false);
    assert.equal(matchesRawPacket(buildRawFilter({ excludeDevice: "cam1" }), cameraFrame, resolveName), false);
    assert.equal(matchesRawPacket(buildRawFilter({ excludeDevice: "g1" }), cameraFrame, resolveName), true);
  });

  test("the excludeModelKey axis drops packets of a matching header model, including unmodeled ones, and keeps the rest", () => {

    const filter = buildRawFilter({ excludeModelKey: "garage" });

    assert.equal(matchesRawPacket(filter, garageFrame, resolveName), false);
    assert.equal(matchesRawPacket(filter, cameraFrame, resolveName), true);
  });
});

describe("take", () => {

  test("yields at most count values", async () => {

    const collected: number[] = [];

    for await (const value of take(naturals(), 3)) {

      collected.push(value);
    }

    assert.deepEqual(collected, [ 0, 1, 2 ]);
  });

  test("a non-positive count yields nothing", async () => {

    const collected: number[] = [];

    for await (const value of take(naturals(), 0)) {

      collected.push(value);
    }

    assert.deepEqual(collected, []);
  });

  test("returning early disposes the source", async () => {

    let disposed = false;
    const source = async function *(): AsyncGenerator<number> {

      try {

        for(let value = 0; ; value++) {

          yield value;
        }
      } finally {

        disposed = true;
      }
    };

    const collected: number[] = [];

    for await (const value of take(source(), 2)) {

      collected.push(value);
    }

    assert.deepEqual(collected, [ 0, 1 ]);
    assert.equal(disposed, true, "the source's finally must run when take stops early");
  });
});

describe("CliError", () => {

  test("defaults the exit code to 1", () => {

    assert.equal(new CliError("boom").exitCode, 1);
  });

  test("carries a custom exit code and cause", () => {

    const cause = new Error("root");
    const error = new CliError("usage", { cause, exitCode: 2 });

    assert.equal(error.exitCode, 2);
    assert.equal(error.cause, cause);
    assert.equal(error.name, "CliError");
  });
});

describe("wireAbortSignal", () => {

  test("aborts the shared signal when a termination signal fires and detaches its listeners on dispose", () => {

    // Snapshot the existing SIGINT listeners so we can find and invoke only the one wireAbortSignal registers - firing a real process.emit("SIGINT") would also run the
    // test runner's own handler, so we call the captured listener directly instead. This keeps the lifecycle assertion hermetic.
    const beforeInt = new Set(process.listeners("SIGINT"));
    const beforeTermCount = process.listenerCount("SIGTERM");
    const { dispose, signal } = wireAbortSignal();

    assert.equal(signal.aborted, false);

    const added = process.listeners("SIGINT").filter((listener) => !beforeInt.has(listener));

    assert.equal(added.length, 1, "wireAbortSignal attaches exactly one SIGINT listener");
    assert.equal(process.listenerCount("SIGTERM"), beforeTermCount + 1, "and exactly one SIGTERM listener");

    // Invoking the registered handler aborts the one signal threaded through the whole operation tree.
    (added[0] as () => void)();
    assert.equal(signal.aborted, true);

    // dispose() removes both handlers, so a short-lived command leaves nothing attached to the process.
    dispose();
    assert.equal(process.listeners("SIGINT").filter((listener) => !beforeInt.has(listener)).length, 0);
    assert.equal(process.listenerCount("SIGTERM"), beforeTermCount);
  });
});

// An infinite source of natural numbers, for exercising take without an external dependency.
async function *naturals(): AsyncGenerator<number> {

  for(let value = 0; ; value++) {

    yield value;
  }
}
