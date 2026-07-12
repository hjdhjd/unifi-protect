/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * commands.test.ts: Per-command unit tests driving each CLI command through the injected openClient seam - parse, render, dispatch, and error paths.
 */
import type { LivestreamSubscriptionStats, ProtectClient, ProtectStateRecord, RawPacket, Segment, TypedEvent } from "../../../index.ts";
import { ProtectAbortedError, ProtectAuthError, ProtectProtocolError, ProtectUnsupportedError } from "../../../index.ts";
import { buildPacket, jsonActionFrame, jsonDataFrame, makeActionHeader } from "../../../protocol/packet.helpers.ts";
import { describe, test } from "node:test";
import { makeCommandContext, makeFakeClient } from "../fake-client.helpers.ts";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { CliError } from "../shared.ts";
import type { CommandSpec } from "../shared.ts";
import { Readable } from "node:stream";
import assert from "node:assert/strict";
import { camera } from "./camera.ts";
import { cameraFlashlight } from "./camera-flashlight.ts";
import { cameraSnapshot } from "./camera-snapshot.ts";
import { cameraTalkback } from "./camera-talkback.ts";
import { cameraUnlock } from "./camera-unlock.ts";
import { channels } from "../../../index.ts";
import { chime } from "./chime.ts";
import { chimePlayBuzzer } from "./chime-play-buzzer.ts";
import { chimePlaySpeaker } from "./chime-play-speaker.ts";
import { decode } from "./decode.ts";
import { diagnostics } from "./diagnostics.ts";
import { doctor } from "./doctor.ts";
import { info } from "./info.ts";
import path from "node:path";
import { reboot } from "./reboot.ts";
import { relay } from "./relay.ts";
import { relayToggle } from "./relay-toggle.ts";
import { tmpdir } from "node:os";
import { update } from "./update.ts";
import { watch } from "./watch.ts";
import { watchEvents } from "./watch-events.ts";
import { watchLivestream } from "./watch-livestream.ts";
import { watchRaw } from "./watch-raw.ts";
import { watchState } from "./watch-state.ts";

// Encode a realtime packet from an action header and a JSON data payload - the wire bytes `ufp decode` reads. Mirrors the encoder the EventStream tests use.
function encodeFrame(header: Partial<{ action: string; id: string; modelKey: string }>, payload: object): Buffer {

  return buildPacket(jsonActionFrame(makeActionHeader(header)), jsonDataFrame(payload));
}

// Two scripted raw packets for the watch-raw tests: a modeled camera update and an unmodeled "garage" add (a modelKey the classifier drops but the raw firehose keeps).
const rawCamera: RawPacket = { header: { action: "update", id: "c1", modelKey: "camera", newUpdateId: "u1" }, payload: { name: "Renamed" } };
const rawGarage: RawPacket = { header: { action: "add", id: "g1", modelKey: "garage", newUpdateId: "u2" }, payload: { id: "g1" } };

describe("info", () => {

  test("renders the controller summary and a device inventory", async () => {

    const { calls, client } = makeFakeClient({ cameras: [{ id: "c1", name: "Front Door" }], controllerName: "Hubble", lights: [{ id: "l1", name: "Porch" }] });
    const { ctx, stdout } = makeCommandContext({ args: [], client });

    await info.run(ctx);

    const out = stdout();

    assert.match(out, /Hubble/);
    assert.match(out, /Cameras \(1\)/);
    assert.match(out, /Front Door/);
    assert.match(out, /Lights \(1\)/);
    assert.equal(calls.disposed, 1, "the client must be disposed via await using");
  });

  test("--json emits a structured summary", async () => {

    const { client } = makeFakeClient({ cameras: [{ id: "c1", name: "Front Door" }], controllerName: "Hubble" });
    const { ctx, stdout } = makeCommandContext({ args: ["--json"], client });

    await info.run(ctx);

    const parsed = JSON.parse(stdout()) as { devices: { name: string }[]; isAdmin: boolean };

    assert.equal(parsed.isAdmin, true);
    assert.equal(parsed.devices[0]?.name, "Front Door");
  });

  test("--json includes the session identity: authUser, controllerName, isAdmin", async () => {

    const { client } = makeFakeClient({ authUser: { id: "u1", name: "admin" }, controllerName: "Hubble", isAdmin: true });
    const { ctx, stdout } = makeCommandContext({ args: ["--json"], client });

    await info.run(ctx);

    const parsed = JSON.parse(stdout()) as { authUser: { name: string } | null; controllerName: string; isAdmin: boolean };

    assert.equal(parsed.controllerName, "Hubble");
    assert.equal(parsed.isAdmin, true);
    assert.equal(parsed.authUser?.name, "admin");
  });

  test("--raw dumps the full reduced state, with collections as arrays", async () => {

    const { client } = makeFakeClient({ cameras: [{ id: "c1", name: "Front Door" }] });
    const { ctx, stdout } = makeCommandContext({ args: ["--raw"], client });

    await info.run(ctx);

    const parsed = JSON.parse(stdout()) as { cameras: { id: string }[]; nvr: unknown };

    assert.ok(Array.isArray(parsed.cameras), "collections serialize as arrays, not empty maps");
    assert.equal(parsed.cameras[0]?.id, "c1");
    assert.ok(parsed.nvr !== null);
  });

  test("--bootstrap dumps the raw controller JSON from a fresh fetch", async () => {

    const { client } = makeFakeClient();
    const { ctx, stdout } = makeCommandContext({ args: ["--bootstrap"], client });

    await info.run(ctx);

    const parsed = JSON.parse(stdout()) as { raw: boolean };

    assert.equal(parsed.raw, true);
  });

  test("a category positional narrows the inventory to that class", async () => {

    const { client } = makeFakeClient({ cameras: [{ id: "c1", name: "Cam" }], lights: [{ id: "l1", name: "Lamp" }] });
    const { ctx, stdout } = makeCommandContext({ args: ["lights"], client });

    await info.run(ctx);

    const out = stdout();

    assert.match(out, /Lights \(1\)/);
    assert.match(out, /Lamp/);
    assert.doesNotMatch(out, /Cameras/, "only the requested category is shown");
  });

  test("a category narrows the --json devices array, keeping the object shape", async () => {

    const { client } = makeFakeClient({ cameras: [{ id: "c1", name: "Cam" }], lights: [{ id: "l1", name: "Lamp" }] });
    const { ctx, stdout } = makeCommandContext({ args: [ "lights", "--json" ], client });

    await info.run(ctx);

    const parsed = JSON.parse(stdout()) as { controllerName: string | null; devices: { modelKey: string }[] };

    assert.equal(parsed.devices.length, 1);
    assert.equal(parsed.devices[0]?.modelKey, "light");
    assert.ok("controllerName" in parsed, "the object shape is unchanged - only the devices array is narrowed");
  });

  test("an unknown category positional is a usage error", async () => {

    const { client } = makeFakeClient();
    const { ctx } = makeCommandContext({ args: ["widgets"], client });

    await assert.rejects(info.run(ctx), (error: unknown) => (error instanceof CliError) && (error.exitCode === 2));
  });
});

describe("watch raw", () => {

  test("renders each decoded frame - modelKey, action, resolved device, payload summary - including unmodeled frames", async () => {

    const { client } = makeFakeClient({ cameras: [{ id: "c1", name: "Front Door" }], rawPackets: [ rawCamera, rawGarage ] });
    const { ctx, stdout } = makeCommandContext({ args: [], client });

    await watchRaw.run(ctx);

    const out = stdout();

    assert.match(out, /camera/);
    assert.match(out, /Front Door/, "the header id resolves to the device name");
    assert.match(out, /fields=name/, "the payload summary lists the changed fields");
    assert.match(out, /garage/, "the unmodeled frame is shown, unlike on watch events");
  });

  test("--model-key filters the raw firehose", async () => {

    const { client } = makeFakeClient({ cameras: [{ id: "c1", name: "Front Door" }], rawPackets: [ rawCamera, rawGarage ] });
    const { ctx, stdout } = makeCommandContext({ args: [ "--model-key", "garage" ], client });

    await watchRaw.run(ctx);

    const out = stdout();

    assert.match(out, /garage/);
    assert.doesNotMatch(out, /Front Door/, "the camera frame is filtered out");
  });

  test("--json emits one full { header, payload } object per line", async () => {

    const { client } = makeFakeClient({ rawPackets: [ rawCamera, rawGarage ] });
    const { ctx, stdout } = makeCommandContext({ args: ["--json"], client });

    await watchRaw.run(ctx);

    const lines = stdout().trim().split("\n");

    assert.equal(lines.length, 2);

    const parsed = JSON.parse(lines[0] ?? "") as { header: { modelKey: string }; payload: unknown };

    assert.equal(parsed.header.modelKey, "camera");
    assert.deepEqual(parsed.payload, { name: "Renamed" });
  });

  test("renders a null data-frame payload as null, not as a fieldless object", async () => {

    const rawNull: RawPacket = { header: { action: "update", id: "c1", modelKey: "camera", newUpdateId: "u3" }, payload: null };
    const { client } = makeFakeClient({ rawPackets: [rawNull] });
    const { ctx, stdout } = makeCommandContext({ args: [], client });

    await watchRaw.run(ctx);

    const out = stdout();

    assert.match(out, /null/, "a null payload is named explicitly");
    assert.doesNotMatch(out, /fields=/, "a null payload is not mislabeled as a fieldless object");
  });

  test("summarizes a raw byte payload by its length", async () => {

    const rawBytes: RawPacket = { header: { action: "update", id: "c1", modelKey: "camera", newUpdateId: "u" }, payload: new Uint8Array([ 1, 2, 3 ]) };
    const { client } = makeFakeClient({ rawPackets: [rawBytes] });
    const { ctx, stdout } = makeCommandContext({ args: [], client });

    await watchRaw.run(ctx);

    assert.match(stdout(), /bytes=3/, "a raw byte frame is summarized by its byte length");
  });

  test("summarizes an array payload by its length", async () => {

    const rawArray: RawPacket = { header: { action: "update", id: "c1", modelKey: "camera", newUpdateId: "u" }, payload: [ 1, 2 ] };
    const { client } = makeFakeClient({ rawPackets: [rawArray] });
    const { ctx, stdout } = makeCommandContext({ args: [], client });

    await watchRaw.run(ctx);

    assert.match(stdout(), /len=2/, "an array payload is summarized by its length");
  });
});

describe("decode", () => {

  test("decodes a captured frame from a file, printing the raw frame and its classification", async () => {

    const dir = await mkdtemp(path.join(tmpdir(), "ufp-decode-"));

    try {

      const file = path.join(dir, "frame.bin");

      await writeFile(file, encodeFrame({ action: "add", id: "c1", modelKey: "camera" }, { id: "c1", name: "Front" }));

      const { client } = makeFakeClient();
      const { ctx, stdout } = makeCommandContext({ args: [file], client });

      await decode.run(ctx);

      const parsed = JSON.parse(stdout()) as { event: { kind: string } | null; raw: { header: { modelKey: string } } };

      assert.equal(parsed.raw.header.modelKey, "camera");
      assert.equal(parsed.event?.kind, "deviceAdded");
    } finally {

      await rm(dir, { force: true, recursive: true });
    }
  });

  test("classifies an unmodeled frame as null while still showing the decoded raw frame", async () => {

    const dir = await mkdtemp(path.join(tmpdir(), "ufp-decode-"));

    try {

      const file = path.join(dir, "frame.bin");

      await writeFile(file, encodeFrame({ action: "add", id: "g1", modelKey: "garage" }, { id: "g1" }));

      const { client } = makeFakeClient();
      const { ctx, stdout } = makeCommandContext({ args: [file], client });

      await decode.run(ctx);

      const parsed = JSON.parse(stdout()) as { event: unknown; raw: { header: { modelKey: string } } };

      assert.equal(parsed.event, null);
      assert.equal(parsed.raw.header.modelKey, "garage");
    } finally {

      await rm(dir, { force: true, recursive: true });
    }
  });

  test("a malformed frame throws the codec's typed protocol error", async () => {

    const dir = await mkdtemp(path.join(tmpdir(), "ufp-decode-"));

    try {

      const file = path.join(dir, "frame.bin");

      await writeFile(file, Buffer.from([ 1, 2, 3 ]));

      const { client } = makeFakeClient();
      const { ctx } = makeCommandContext({ args: [file], client });

      await assert.rejects(decode.run(ctx), ProtectProtocolError);
    } finally {

      await rm(dir, { force: true, recursive: true });
    }
  });

  test("a missing source argument is a usage error", async () => {

    const { client } = makeFakeClient();
    const { ctx } = makeCommandContext({ args: [], client });

    await assert.rejects(decode.run(ctx), (error: unknown) => (error instanceof CliError) && (error.exitCode === 2));
  });

  test("decodes a frame from stdin when the source is -", async () => {

    const frame = encodeFrame({ action: "add", id: "c1", modelKey: "camera" }, { id: "c1", name: "Front" });
    const { client } = makeFakeClient();
    const { ctx, stdout } = makeCommandContext({ args: ["-"], client });

    // process.stdin is a getter-only property, so we replace it with a one-shot Readable for the duration of the run and restore the original descriptor afterwards.
    const descriptor = Object.getOwnPropertyDescriptor(process, "stdin");

    try {

      Object.defineProperty(process, "stdin", { configurable: true, value: Readable.from([frame]) });

      await decode.run(ctx);

      const parsed = JSON.parse(stdout()) as { event: { kind: string } | null; raw: { header: { modelKey: string } } };

      assert.equal(parsed.raw.header.modelKey, "camera");
      assert.equal(parsed.event?.kind, "deviceAdded");
    } finally {

      if(descriptor !== undefined) {

        Object.defineProperty(process, "stdin", descriptor);
      }
    }
  });

  test("an unreadable file surfaces as a CliError naming the read failure", async () => {

    const { client } = makeFakeClient();
    const { ctx } = makeCommandContext({ args: ["/no/such/file.bin"], client });

    await assert.rejects(decode.run(ctx), (error: unknown) => (error instanceof CliError) && error.message.includes("Unable to read packet bytes"));
  });
});

const auth: TypedEvent = { at: 0, cameraId: "c1", eventId: "e3", kind: "authDetected", method: "fingerprint" };
const motion: TypedEvent = { at: 0, cameraId: "c1", eventId: "e1", kind: "motionDetected" };
const patched: TypedEvent = { id: "c1", kind: "devicePatched", modelKey: "camera", patch: {} };
const tamper: TypedEvent = { at: 0, cameraId: "c1", eventId: "e2", kind: "tamperDetected" };

describe("watch events", () => {

  test("renders each event and stops after the scripted stream ends", async () => {

    const { client } = makeFakeClient({ cameras: [{ id: "c1", name: "Front Door" }], events: [ motion, patched ] });
    const { ctx, stdout } = makeCommandContext({ args: [], client });

    await watchEvents.run(ctx);

    const out = stdout();

    assert.match(out, /motionDetected/);
    assert.match(out, /Front Door/);
    assert.match(out, /devicePatched/);
  });

  test("an invalid --duration is a usage error, surfaced before connecting", async () => {

    const { client } = makeFakeClient({ events: [motion] });
    const { ctx } = makeCommandContext({ args: [ "--duration", "30" ], client });

    // A bare number has no unit; the command parses --duration before opening a client, so this fails fast as a CliError.
    await assert.rejects(watchEvents.run(ctx), CliError);
  });

  test("renders a tamper event with its camera name and occurrence id", async () => {

    const { client } = makeFakeClient({ cameras: [{ id: "c1", name: "Front Door" }], events: [tamper] });
    const { ctx, stdout } = makeCommandContext({ args: [], client });

    await watchEvents.run(ctx);

    const out = stdout();

    // Attribution flows through ProtectClient.eventSubjects, so the camera name resolves; the detail suffix carries the occurrence id.
    assert.match(out, /tamperDetected/);
    assert.match(out, /Front Door/);
    assert.match(out, /id=e2/);
  });

  test("renders an auth event with its camera name, lifted method, and occurrence id", async () => {

    const { client } = makeFakeClient({ cameras: [{ id: "c1", name: "Front Door" }], events: [auth] });
    const { ctx, stdout } = makeCommandContext({ args: [], client });

    await watchEvents.run(ctx);

    const out = stdout();

    // authDetected is camera-attributed (so the doorbell name resolves) and its detail suffix carries the lifted method alongside the occurrence id, mirroring
    // smartDetect's objects= suffix.
    assert.match(out, /authDetected/);
    assert.match(out, /Front Door/);
    assert.match(out, /method=fingerprint/);
    assert.match(out, /id=e3/);
  });

  test("--device filters a tamper event by its attributed camera", async () => {

    const { client } = makeFakeClient({ cameras: [{ id: "c1", name: "Front Door" }], events: [ tamper, patched ] });
    const { ctx, stdout } = makeCommandContext({ args: [ "--device", "Front Door" ], client });

    await watchEvents.run(ctx);

    const out = stdout();

    // The regression that motivated lifting attribution into the library: a tamper event must match a camera --device filter, not be silently dropped.
    assert.match(out, /tamperDetected/);
  });

  test("--kind filters the stream", async () => {

    const { client } = makeFakeClient({ cameras: [{ id: "c1", name: "Front Door" }], events: [ motion, patched ] });
    const { ctx, stdout } = makeCommandContext({ args: [ "--kind", "motionDetected" ], client });

    await watchEvents.run(ctx);

    const out = stdout();

    assert.match(out, /motionDetected/);
    assert.doesNotMatch(out, /devicePatched/);
  });

  test("--count limits the count and --json emits NDJSON", async () => {

    const { client } = makeFakeClient({ events: [ motion, patched, motion ] });
    const { ctx, stdout } = makeCommandContext({ args: [ "--json", "--count", "2" ], client });

    await watchEvents.run(ctx);

    const lines = stdout().trimEnd().split("\n");

    assert.equal(lines.length, 2);
    assert.equal((JSON.parse(lines[0] ?? "{}") as { kind: string }).kind, "motionDetected");
  });

  test("renders a smartDetect event with its object classes and occurrence id", async () => {

    const smart: TypedEvent = { at: 0, cameraId: "c1", eventId: "e1", kind: "smartDetect", objectTypes: [ "person", "vehicle" ] };
    const { client } = makeFakeClient({ cameras: [{ id: "c1", name: "Front Door" }], events: [smart] });
    const { ctx, stdout } = makeCommandContext({ args: [], client });

    await watchEvents.run(ctx);

    const out = stdout();

    // The smartDetect detail suffix lists the detected object classes and carries the occurrence id, the same suffix shape doctor and fixture replay depend on.
    assert.match(out, /smartDetect/);
    assert.match(out, /Front Door/);
    assert.match(out, /objects=person,vehicle/);
    assert.match(out, /id=e1/);
  });

  test("renders an access event with its action and occurrence id", async () => {

    const access: TypedEvent = { action: "access", at: 0, deviceId: "d1", eventId: "e9", kind: "accessEvent" };
    const { client } = makeFakeClient({ events: [access] });
    const { ctx, stdout } = makeCommandContext({ args: [], client });

    await watchEvents.run(ctx);

    const out = stdout();

    // An access occurrence is access-device-attributed; its detail suffix carries the access action and the occurrence id.
    assert.match(out, /accessEvent/);
    assert.match(out, /action=access/);
    assert.match(out, /id=e9/);
  });

  test("renders device add/remove transitions, each naming its modelKey", async () => {

    const added: TypedEvent = { data: {} as ProtectStateRecord, id: "c1", kind: "deviceAdded", modelKey: "camera" };
    const removed: TypedEvent = { id: "l1", kind: "deviceRemoved", modelKey: "light" };
    const { client } = makeFakeClient({ events: [ added, removed ] });
    const { ctx, stdout } = makeCommandContext({ args: [], client });

    await watchEvents.run(ctx);

    const out = stdout();

    // A lifecycle add/remove names the modelKey of the device that came or went, so the two transitions are distinguishable on the stream.
    assert.match(out, /deviceAdded/);
    assert.match(out, /modelKey=camera/);
    assert.match(out, /deviceRemoved/);
    assert.match(out, /modelKey=light/);
  });
});

describe("camera snapshot", () => {

  test("writes the JPEG to a file and reports it", async () => {

    const dir = await mkdtemp(path.join(tmpdir(), "ufp-snap-"));

    try {

      const out = path.join(dir, "snap.jpg");
      const { client } = makeFakeClient({ cameras: [{ id: "c1", name: "Front Door", snapshot: Buffer.from([ 0xFF, 0xD8, 0x42, 0xFF, 0xD9 ]) }] });
      const { ctx, stdout } = makeCommandContext({ args: [ "Front Door", "--out", out ], client });

      await cameraSnapshot.run(ctx);

      const bytes = await readFile(out);

      assert.equal(bytes[0], 0xFF);
      assert.equal(bytes[1], 0xD8);
      assert.match(stdout(), /Wrote Front Door snapshot/);
    } finally {

      await rm(dir, { force: true, recursive: true });
    }
  });

  test("a missing camera target is a usage error", async () => {

    const { client } = makeFakeClient();
    const { ctx } = makeCommandContext({ args: [], client });

    await assert.rejects(cameraSnapshot.run(ctx), (error: unknown) => (error instanceof CliError) && (error.exitCode === 2));
  });

  test("refuses to write image bytes to an interactive terminal", async () => {

    const { client } = makeFakeClient({ cameras: [{ id: "c1", name: "Front Door" }] });
    const { ctx } = makeCommandContext({ args: ["Front Door"], client });

    // With no --out and an interactive stdout there is nowhere safe to put the JPEG, so the command refuses before connecting. We stub the real isTTY the command reads.
    const savedTTY = process.stdout.isTTY;

    try {

      process.stdout.isTTY = true;

      await assert.rejects(cameraSnapshot.run(ctx),
        (error: unknown) => (error instanceof CliError) && (error.exitCode === 2) && error.message.includes("Refusing to write image bytes to a terminal"));
    } finally {

      process.stdout.isTTY = savedTTY;
    }
  });

  test("pipes the JPEG to stdout and routes the confirmation to stderr", async () => {

    const { client } = makeFakeClient({ cameras: [{ id: "c1", name: "Front Door", snapshot: Buffer.from([ 0xFF, 0xD8, 0x42, 0xFF, 0xD9 ]) }] });
    const { ctx } = makeCommandContext({ args: [ "Front Door", "--out", "-" ], client });

    // --out - forces the byte stream onto process.stdout while the human confirmation goes to a stderr Output, so we capture both real streams and assert the split.
    const outChunks: Buffer[] = [];
    const errChunks: string[] = [];
    const realStdout = process.stdout.write.bind(process.stdout);
    const realStderr = process.stderr.write.bind(process.stderr);

    try {

      process.stdout.write = (chunk: string | Uint8Array): boolean => (outChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)), true);
      process.stderr.write = (chunk: string | Uint8Array): boolean => (errChunks.push((typeof chunk === "string") ? chunk : Buffer.from(chunk).toString()), true);

      await cameraSnapshot.run(ctx);
    } finally {

      process.stdout.write = realStdout;
      process.stderr.write = realStderr;
    }

    // The exact JPEG bytes landed on stdout (a byte-for-byte match also proves the confirmation never polluted the image stream), and the confirmation landed on stderr.
    assert.deepEqual([...Buffer.concat(outChunks)], [ 0xFF, 0xD8, 0x42, 0xFF, 0xD9 ]);
    assert.match(errChunks.join(""), /Wrote Front Door snapshot .* to stdout\./);
  });
});

describe("camera talkback", () => {

  test("streams a file's audio bytes to the camera and reports them", async () => {

    const dir = await mkdtemp(path.join(tmpdir(), "ufp-talk-"));

    try {

      const audio = path.join(dir, "clip.aac");

      await writeFile(audio, Buffer.alloc(1500, 0x41));

      const { calls, client } = makeFakeClient({ cameras: [{ id: "c1", name: "Front Door" }] });
      const { ctx, stdout } = makeCommandContext({ args: [ "Front Door", "--file", audio ], client });

      await cameraTalkback.run(ctx);

      assert.deepEqual(calls.talkback, [{ bytes: 1500, camera: "c1" }]);
      assert.match(stdout(), /Streamed .* of talkback audio to Front Door/);
    } finally {

      await rm(dir, { force: true, recursive: true });
    }
  });

  test("requires a camera target", async () => {

    const { client } = makeFakeClient();
    const { ctx } = makeCommandContext({ args: [], client });

    await assert.rejects(cameraTalkback.run(ctx), CliError);
  });

  test("a send failure propagates as an error, but an aborted send ends quietly", async () => {

    // A camera whose talkback session rejects on send(), so we can drive both the error path (propagate) and the abort path (swallow) off the same fake.
    const makeClient = (sendError: Error): ProtectClient => {

      const camera = {

        id: "c1",
        modelKey: "camera",
        name: "Cam",
        talkback: (): Promise<Record<string, unknown>> => Promise.resolve({

          close: (): Promise<void> => Promise.resolve(),
          send: (): Promise<void> => Promise.reject(sendError),
          state: "live",
          [Symbol.asyncDispose]: (): Promise<void> => Promise.resolve()
        })
      };

      return { camera: (token: string) => (token === "c1") ? camera : undefined, cameras: [camera], chimes: [], fobs: [], lights: [], relays: [], sensors: [],
        viewers: [], [Symbol.asyncDispose]: (): Promise<void> => Promise.resolve() } as unknown as ProtectClient;
    };

    // Un-aborted signal: a genuine send failure is not a stop, so it propagates to the entry point.
    const failing = makeCommandContext({ args: ["c1"], client: makeClient(new Error("boom")) });

    await assert.rejects(cameraTalkback.run(failing.ctx), (error: unknown) => (error instanceof Error) && (error.message === "boom"));

    // Already-aborted signal: the same send failure is treated as a clean Ctrl-C stop, so the command swallows it and reports the interrupted tally instead.
    const aborted = makeCommandContext({ args: ["c1"], client: makeClient(new Error("late")), signal: AbortSignal.abort() });

    await cameraTalkback.run(aborted.ctx);

    assert.match(aborted.stdout(), /Talkback interrupted after/);
  });

  test("refuses to read from an interactive stdin when no --file is given", async () => {

    const { client } = makeFakeClient({ cameras: [{ id: "c1", name: "Cam" }] });
    const { ctx } = makeCommandContext({ args: ["c1"], client });

    // Without --file the audio must arrive on a pipe; an interactive stdin has nothing to read, so the command refuses rather than hanging. We stub the isTTY it reads.
    const savedTTY = process.stdin.isTTY;

    try {

      process.stdin.isTTY = true;

      await assert.rejects(cameraTalkback.run(ctx),
        (error: unknown) => (error instanceof CliError) && (error.exitCode === 2) && error.message.includes("No audio on stdin"));
    } finally {

      process.stdin.isTTY = savedTTY;
    }
  });
});

describe("watch livestream", () => {

  test("writes the concatenated segments to a file and reports the total", async () => {

    const dir = await mkdtemp(path.join(tmpdir(), "ufp-live-"));

    try {

      const out = path.join(dir, "stream.mp4");
      const { client } = makeFakeClient({ cameras: [{ id: "c1", name: "Front Door", segments: [

        { codec: "avc1", data: Buffer.from([ 1, 2, 3 ]), type: "init" },
        { data: Buffer.from([ 4, 5, 6 ]), mdat: Buffer.alloc(0), moof: Buffer.alloc(0), type: "media" }
      ] }] });
      const { ctx, stdout } = makeCommandContext({ args: [ "Front Door", "--out", out ], client });

      await watchLivestream.run(ctx);

      const bytes = await readFile(out);

      assert.deepEqual([...bytes], [ 1, 2, 3, 4, 5, 6 ]);
      assert.match(stdout(), /Received 2 segment\(s\)/);
      assert.match(stdout(), /codec avc1/);
    } finally {

      await rm(dir, { force: true, recursive: true });
    }
  });

  test("--diagnostics subscribes to the livestream channels and routes them to stderr, leaving stdout clean", async () => {

    // A camera whose livestream publishes a livestream diagnostic as it streams - the only thing that exercises the in-process feed (the pool is not involved in the
    // fake, so nothing publishes on its own). The published codec-change event stands in for the recovery/codec telemetry the feed exists to surface.
    const makeClient = (): ProtectClient => {

      const camera = {

        id: "c1",
        livestream: (): AsyncIterable<Segment> & AsyncDisposable & { stats: LivestreamSubscriptionStats } => ({

          async *[Symbol.asyncIterator](): AsyncGenerator<Segment> {

            channels.livestreamCodecChanged.publish({ from: "avc1.640028", key: "c1:0:0:100:4096:false", to: "hev1.1.6.L150.90" });

            yield { codec: "avc1.640028", data: Buffer.from([ 1, 2, 3 ]), type: "init" };
          },
          [Symbol.asyncDispose]: (): Promise<void> => Promise.resolve(),
          stats: { delivered: 1, discarded: 0, lastSegmentAt: 0, peakQueueDepth: 0, queueDepth: 0 }
        }),
        modelKey: "camera",
        name: "Cam"
      };

      return { camera: (token: string) => (token === "c1") ? camera : undefined, cameras: [camera], chimes: [], fobs: [], lights: [], relays: [], sensors: [],
        viewers: [], [Symbol.asyncDispose]: (): Promise<void> => Promise.resolve() } as unknown as ProtectClient;
    };

    // Capture process.stderr (the dedicated diagnostics sink, distinct from the command's stdout Output) for the duration of one run.
    const run = async (args: string[]): Promise<{ stderr: string; stdout: string }> => {

      const errChunks: string[] = [];
      const realWrite = process.stderr.write.bind(process.stderr);
      const capture = (chunk: string | Uint8Array): boolean => (errChunks.push((typeof chunk === "string") ? chunk : Buffer.from(chunk).toString()), true);

      process.stderr.write = capture;

      try {

        const { ctx, stdout } = makeCommandContext({ args, client: makeClient() });

        await watchLivestream.run(ctx);

        return { stderr: errChunks.join(""), stdout: stdout() };
      } finally {

        process.stderr.write = realWrite;
      }
    };

    // With --diagnostics, the published codec-change event is rendered to stderr (JSON, honoring --json) and never pollutes the stdout NDJSON metadata stream.
    const withDiag = await run([ "c1", "--diagnostics", "--json", "--count", "1" ]);

    assert.match(withDiag.stderr, /unifi-protect:livestream:codec:changed/);
    assert.match(withDiag.stderr, /hev1\.1\.6\.L150\.90/);
    assert.doesNotMatch(withDiag.stdout, /unifi-protect:livestream/);

    // Without the flag, no feed is subscribed, so the same published event reaches neither stream.
    const withoutDiag = await run([ "c1", "--json", "--count", "1" ]);

    assert.doesNotMatch(withoutDiag.stderr, /unifi-protect:livestream/);
  });

  test("--json emits the per-segment metadata for a media segment", async () => {

    // A camera whose stream yields a single media segment, carrying the stats segmentMeta reads. The subscription exposes `stats`, which the basic fake camera omits.
    const camera = {

      id: "c1",
      livestream: (): AsyncIterable<Segment> & AsyncDisposable & { stats: LivestreamSubscriptionStats } => ({

        async *[Symbol.asyncIterator](): AsyncGenerator<Segment> {

          yield { data: Buffer.from([ 4, 5, 6 ]), mdat: Buffer.alloc(0), moof: Buffer.alloc(0), timestamps: [ 10, 20 ], type: "media" };
        },
        [Symbol.asyncDispose]: (): Promise<void> => Promise.resolve(),
        stats: { delivered: 1, discarded: 0, lastSegmentAt: 0, peakQueueDepth: 0, queueDepth: 0 }
      }),
      modelKey: "camera",
      name: "Cam"
    };
    const client = { camera: (token: string) => (token === "c1") ? camera : undefined, cameras: [camera], chimes: [], fobs: [], lights: [], relays: [], sensors: [],
      viewers: [], [Symbol.asyncDispose]: (): Promise<void> => Promise.resolve() } as unknown as ProtectClient;
    const { ctx, stdout } = makeCommandContext({ args: [ "c1", "--json", "--count", "1" ], client });

    await watchLivestream.run(ctx);

    const meta = JSON.parse(stdout()) as { bytes: number; delivered: number; queueDepth: number; timestamps: number[] | null; type: string };

    assert.equal(meta.type, "media");
    assert.equal(meta.bytes, 3);
    assert.equal(meta.delivered, 1);
    assert.equal(meta.queueDepth, 0);
    assert.deepEqual(meta.timestamps, [ 10, 20 ]);
  });

  test("a missing camera target is a usage error", async () => {

    const { client } = makeFakeClient();
    const { ctx } = makeCommandContext({ args: [], client });

    await assert.rejects(watchLivestream.run(ctx), (error: unknown) => (error instanceof CliError) && (error.exitCode === 2));
  });

  test("--channel and --lens are mutually exclusive", async () => {

    const { client } = makeFakeClient();
    const { ctx } = makeCommandContext({ args: [ "c1", "--channel", "0", "--lens", "1" ], client });

    // The guard runs before the client is opened, so no camera fixture is needed to exercise it.
    await assert.rejects(watchLivestream.run(ctx), (error: unknown) => (error instanceof CliError) && (error.exitCode === 2));
  });

  test("pipes the concatenated segment bytes to stdout, keeping the summary off it", async () => {

    const { client } = makeFakeClient({ cameras: [{ id: "c1", name: "Cam", segments: [

      { codec: "avc1", data: Buffer.from([ 1, 2, 3 ]), type: "init" },
      { data: Buffer.from([ 4, 5, 6 ]), mdat: Buffer.alloc(0), moof: Buffer.alloc(0), type: "media" }
    ] }] });
    const { ctx, stdout } = makeCommandContext({ args: ["c1"], client });

    // With no --out/--json and a non-TTY stdout, bytes go to process.stdout and the closing summary is diverted to a stderr Output. We capture stdout and pin isTTY off.
    const outChunks: Buffer[] = [];
    const savedTTY = process.stdout.isTTY;
    const realStdout = process.stdout.write.bind(process.stdout);

    try {

      process.stdout.isTTY = false;
      process.stdout.write = (chunk: string | Uint8Array): boolean => (outChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)), true);

      await watchLivestream.run(ctx);
    } finally {

      process.stdout.write = realStdout;
      process.stdout.isTTY = savedTTY;
    }

    // The byte stream is exactly the concatenated segment data, and the command's own Output captured nothing - the summary went to the stderr sink, not stdout.
    assert.deepEqual([...Buffer.concat(outChunks)], [ 1, 2, 3, 4, 5, 6 ]);
    assert.equal(stdout(), "");
  });

  test("the default TTY summary lists the init, codec, media, and queue stats", async () => {

    const camera = {

      id: "c1",
      livestream: (): AsyncIterable<Segment> & AsyncDisposable & { stats: LivestreamSubscriptionStats } => ({

        async *[Symbol.asyncIterator](): AsyncGenerator<Segment> {

          yield { codec: "avc1", data: Buffer.from([ 1, 2, 3 ]), type: "init" };
          yield { data: Buffer.from([ 4, 5, 6 ]), mdat: Buffer.alloc(0), moof: Buffer.alloc(0), type: "media" };
        },
        [Symbol.asyncDispose]: (): Promise<void> => Promise.resolve(),
        stats: { delivered: 2, discarded: 0, lastSegmentAt: 0, peakQueueDepth: 0, queueDepth: 0 }
      }),
      modelKey: "camera",
      name: "Cam"
    };
    const client = { camera: (token: string) => (token === "c1") ? camera : undefined, cameras: [camera], chimes: [], fobs: [], lights: [], relays: [], sensors: [],
      viewers: [], [Symbol.asyncDispose]: (): Promise<void> => Promise.resolve() } as unknown as ProtectClient;
    const { ctx, stdout } = makeCommandContext({ args: ["c1"], client });

    // An interactive stdout selects the per-segment summary mode (no bytes, no NDJSON), written to the command's own Output.
    const savedTTY = process.stdout.isTTY;

    try {

      process.stdout.isTTY = true;

      await watchLivestream.run(ctx);
    } finally {

      process.stdout.isTTY = savedTTY;
    }

    const out = stdout();

    assert.match(out, /init/);
    assert.match(out, /avc1/);
    assert.match(out, /media/);
    assert.match(out, /q=0 peak=0/);
    assert.match(out, /Received 2 segment\(s\)/);
  });
});

describe("update", () => {

  test("--dry-run previews the patch without contacting the controller", async () => {

    const { calls, client } = makeFakeClient({ lights: [{ id: "l1", name: "Porch" }] });
    const { ctx, stdout } = makeCommandContext({ args: [ "Porch", "--patch", "{\"name\":\"Front Porch\"}", "--dry-run" ], client });

    await update.run(ctx);

    assert.match(stdout(), /Dry run/);
    assert.equal(calls.updates.length, 0, "a dry run must not PATCH");
  });

  test("applies the patch through the device's write-through update", async () => {

    const { calls, client } = makeFakeClient({ lights: [{ id: "l1", name: "Porch" }] });
    const { ctx } = makeCommandContext({ args: [ "Porch", "--patch", "{\"name\":\"Front Porch\"}" ], client });

    await update.run(ctx);

    assert.equal(calls.updates.length, 1);
    assert.deepEqual(calls.updates[0], { id: "l1", patch: { name: "Front Porch" } });
  });

  test("rejects a non-object or malformed patch", async () => {

    const { client } = makeFakeClient({ lights: [{ id: "l1", name: "Porch" }] });
    const bad = makeCommandContext({ args: [ "Porch", "--patch", "not json" ], client });
    const array = makeCommandContext({ args: [ "Porch", "--patch", "[1,2]" ], client });

    await assert.rejects(update.run(bad.ctx), CliError);
    await assert.rejects(update.run(array.ctx), CliError);
  });

  test("a missing device target is a usage error", async () => {

    const { client } = makeFakeClient();
    const { ctx } = makeCommandContext({ args: [ "--patch", "{}" ], client });

    await assert.rejects(update.run(ctx), (error: unknown) => (error instanceof CliError) && (error.exitCode === 2));
  });

  test("a missing --patch is a usage error", async () => {

    const { client } = makeFakeClient({ lights: [{ id: "l1", name: "Porch" }] });
    const { ctx } = makeCommandContext({ args: ["Porch"], client });

    await assert.rejects(update.run(ctx), (error: unknown) => (error instanceof CliError) && (error.exitCode === 2) && error.message.includes("via --patch"));
  });
});

describe("reboot", () => {

  test("nvr reboots the controller via client.reboot", async () => {

    const { calls, client } = makeFakeClient();
    const { ctx, stdout } = makeCommandContext({ args: ["nvr"], client });

    await reboot.run(ctx);

    assert.deepEqual(calls.reboots, ["nvr"]);
    assert.match(stdout(), /Rebooting the UniFi Protect controller/);
  });

  test("a device target reboots that device", async () => {

    const { calls, client } = makeFakeClient({ cameras: [{ id: "c1", name: "Front Door" }] });
    const { ctx } = makeCommandContext({ args: ["Front Door"], client });

    await reboot.run(ctx);

    assert.deepEqual(calls.reboots, ["c1"]);
  });

  test("a missing target is a usage error", async () => {

    const { client } = makeFakeClient();
    const { ctx } = makeCommandContext({ args: [], client });

    await assert.rejects(reboot.run(ctx), CliError);
  });

  test("a category reboots every online device of that class and skips offline ones", async () => {

    const { calls, client } = makeFakeClient({ cameras: [ { id: "c1", name: "A" }, { id: "c2", name: "B", online: false }, { id: "c3", name: "C" } ] });
    const { ctx, stdout } = makeCommandContext({ args: ["cameras"], client });

    await reboot.run(ctx);

    assert.deepEqual(calls.reboots, [ "c1", "c3" ], "the two online cameras rebooted; the offline one was skipped");
    assert.match(stdout(), /skipped \(offline\)/);
    assert.match(stdout(), /Rebooted 2 cameras\./);
  });

  test("device-first resolution: a device named like a category reboots that device, not the class", async () => {

    const { calls, client } = makeFakeClient({ cameras: [ { id: "x1", name: "cameras" }, { id: "x2", name: "Other" } ] });
    const { ctx, stdout } = makeCommandContext({ args: ["cameras"], client });

    await reboot.run(ctx);

    assert.deepEqual(calls.reboots, ["x1"], "the device named \"cameras\" rebooted; the class was not bulk-rebooted");
    assert.match(stdout(), /Rebooting camera "cameras"/);
  });

  test("a category reboot continues past a failure and exits non-zero", async () => {

    const { calls, client } = makeFakeClient({ cameras: [ { id: "c1", name: "A" }, { id: "c2", name: "B", rebootFails: true }, { id: "c3", name: "C" } ] });
    const { ctx } = makeCommandContext({ args: ["cameras"], client });

    // The whole run still throws (non-zero exit), but the healthy devices were rebooted - the failure did not abort the loop.
    await assert.rejects(reboot.run(ctx), (error: unknown) => (error instanceof CliError) && (error.exitCode === 1));

    assert.deepEqual(calls.reboots, [ "c1", "c3" ], "the failing camera is absent; the other two rebooted despite it");
  });

  test("a token matching neither a device nor a category is a usage error", async () => {

    const { client } = makeFakeClient({ cameras: [{ id: "c1", name: "Front Door" }] });
    const { ctx } = makeCommandContext({ args: ["bogus"], client });

    await assert.rejects(reboot.run(ctx), (error: unknown) => (error instanceof CliError) && (error.exitCode === 2));
  });

  test("an empty device class reports there is nothing to reboot", async () => {

    const { calls, client } = makeFakeClient();
    const { ctx, stdout } = makeCommandContext({ args: ["sensors"], client });

    await reboot.run(ctx);

    assert.match(stdout(), /No sensors to reboot/);
    assert.deepEqual(calls.reboots, [], "an empty class issues no reboots");
  });

  test("an ambiguous device name is a usage error naming the conflict count", async () => {

    const { client } = makeFakeClient({ cameras: [ { id: "c1", name: "Dup" }, { id: "c2", name: "Dup" } ] });
    const { ctx } = makeCommandContext({ args: ["Dup"], client });

    await assert.rejects(reboot.run(ctx), (error: unknown) => (error instanceof CliError) && error.message.includes("matches 2 devices by name"));
  });

  test("a ProtectAbortedError from a device halts the bulk run rather than being counted as a failure", async () => {

    // A category whose single online camera's reboot rejects with ProtectAbortedError - the Ctrl-C surfacing the bulk loop must rethrow rather than swallow-and-continue.
    const camera = { id: "c1", isOnline: true, modelKey: "camera", name: "Cam", reboot: (): Promise<void> => Promise.reject(new ProtectAbortedError("aborted")) };
    const client = { camera: (token: string) => (token === "c1") ? camera : undefined, cameras: [camera], chimes: [], controllerName: "NVR", fobs: [], lights: [],
      reboot: (): Promise<void> => Promise.resolve(), relays: [], sensors: [], state: { snapshot: (): Record<string, unknown> => ({ nvr: { name: "NVR" } }) },
      viewers: [], [Symbol.asyncDispose]: (): Promise<void> => Promise.resolve() } as unknown as ProtectClient;
    const { ctx } = makeCommandContext({ args: ["cameras"], client });

    await assert.rejects(reboot.run(ctx), ProtectAbortedError);
  });

  test("an already-aborted signal breaks the bulk loop before any reboot is issued", async () => {

    const { calls, client } = makeFakeClient({ cameras: [ { id: "c1", name: "A" }, { id: "c2", name: "B" } ] });
    const { ctx, stdout } = makeCommandContext({ args: ["cameras"], client, signal: AbortSignal.abort() });

    await reboot.run(ctx);

    assert.deepEqual(calls.reboots, [], "the aborted signal breaks the loop on the first iteration, so nothing reboots");
    assert.match(stdout(), /Rebooted 0 cameras/);
  });
});

describe("command help paths", () => {

  // Every command short-circuits on --help before connecting (or, for the file-reading commands, before reading a byte), so these need no fake behavior - just the usage
  // banner. This table is the home for --help-path coverage: each command and device group gets a row rather than a duplicate inline per-command test. The one
  // exception is the top-level `watch` group, whose usage is asserted separately below via its no-subcommand path (which also verifies the subcommand listing).
  const cases: [ string, CommandSpec, RegExp ][] = [

    [ "camera (group)", camera, /Usage: ufp camera <subcommand>/ ],
    [ "camera flashlight", cameraFlashlight, /Usage: ufp camera flashlight/ ],
    [ "camera snapshot", cameraSnapshot, /Usage: ufp camera snapshot/ ],
    [ "camera talkback", cameraTalkback, /Usage: ufp camera talkback/ ],
    [ "camera unlock", cameraUnlock, /Usage: ufp camera unlock/ ],
    [ "chime (group)", chime, /Usage: ufp chime <subcommand>/ ],
    [ "chime play-buzzer", chimePlayBuzzer, /Usage: ufp chime play-buzzer/ ],
    [ "chime play-speaker", chimePlaySpeaker, /Usage: ufp chime play-speaker/ ],
    [ "decode", decode, /Usage: ufp decode/ ],
    [ "diagnostics", diagnostics, /Usage: ufp diagnostics/ ],
    [ "doctor", doctor, /Usage: ufp doctor/ ],
    [ "info", info, /Usage: ufp info/ ],
    [ "reboot", reboot, /Usage: ufp reboot/ ],
    [ "relay (group)", relay, /Usage: ufp relay <subcommand>/ ],
    [ "relay toggle", relayToggle, /Usage: ufp relay toggle/ ],
    [ "update", update, /Usage: ufp update/ ],
    [ "watch events", watchEvents, /Usage: ufp watch events/ ],
    [ "watch livestream", watchLivestream, /Usage: ufp watch livestream/ ],
    [ "watch raw", watchRaw, /Usage: ufp watch raw/ ],
    [ "watch state", watchState, /Usage: ufp watch state/ ]
  ];

  for(const [ name, command, pattern ] of cases) {

    test(name + " --help prints usage", async () => {

      const { client } = makeFakeClient();
      const { ctx, stdout } = makeCommandContext({ args: ["--help"], client });

      await command.run(ctx);

      assert.match(stdout(), pattern);
    });
  }

  test("watch (group) with no subcommand prints the group usage", async () => {

    const { client } = makeFakeClient();
    const { ctx, stdout } = makeCommandContext({ args: [], client });

    await watch.run(ctx);

    const out = stdout();

    assert.match(out, /Usage: ufp watch <subcommand>/);
    assert.match(out, /protocol-capture surface/, "each subcommand is listed beside the summary it declares");
  });
});

describe("watch group", () => {

  test("an unknown subcommand is a usage error", async () => {

    const { client } = makeFakeClient();
    const { ctx } = makeCommandContext({ args: ["bogus"], client });

    await assert.rejects(watch.run(ctx), (error: unknown) => (error instanceof CliError) && (error.exitCode === 2));
  });

  test("dispatches a known subcommand, forwarding the remaining args to it", async () => {

    const raw: RawPacket = { header: { action: "update", id: "c1", modelKey: "camera", newUpdateId: "u" }, payload: { name: "x" } };
    const { client } = makeFakeClient({ rawPackets: [raw] });
    const { ctx, stdout } = makeCommandContext({ args: ["raw"], client });

    await watch.run(ctx);

    assert.match(stdout(), /camera/, "the forwarded watch raw subcommand rendered the frame");
  });
});

describe("camera group", () => {

  test("no subcommand prints the group usage and exits zero", async () => {

    const { client } = makeFakeClient();
    const { ctx, stdout } = makeCommandContext({ args: [], client });

    await camera.run(ctx);

    const out = stdout();

    assert.match(out, /Usage: ufp camera <subcommand>/);
    assert.match(out, /See also: ufp watch livestream <camera>/, "the group cross-references the livestream operation under watch");
  });

  test("an unknown subcommand is a usage error listing the valid subcommands", async () => {

    const { client } = makeFakeClient();
    const { ctx } = makeCommandContext({ args: ["bogus"], client });

    // The valid list is derived from the dispatch table, so the diagnostic names the real subcommands rather than a hand-maintained copy that could drift.
    await assert.rejects(camera.run(ctx),
      (error: unknown) => (error instanceof CliError) && (error.exitCode === 2) && error.message.includes("snapshot") && error.message.includes("unlock"));
  });

  test("dispatches a known subcommand, forwarding the remaining args to it", async () => {

    const { calls, client } = makeFakeClient({ cameras: [{ id: "c1", name: "Front Door" }] });
    const { ctx } = makeCommandContext({ args: [ "unlock", "Front Door" ], client });

    await camera.run(ctx);

    assert.deepEqual(calls.unlocks, ["c1"], "the forwarded camera unlock subcommand invoked the method");
  });
});

describe("relay group", () => {

  test("no subcommand prints the group usage and exits zero", async () => {

    const { client } = makeFakeClient();
    const { ctx, stdout } = makeCommandContext({ args: [], client });

    await relay.run(ctx);

    assert.match(stdout(), /Usage: ufp relay <subcommand>/);
  });

  test("an unknown subcommand is a usage error listing the valid subcommands", async () => {

    const { client } = makeFakeClient();
    const { ctx } = makeCommandContext({ args: ["bogus"], client });

    await assert.rejects(relay.run(ctx),
      (error: unknown) => (error instanceof CliError) && (error.exitCode === 2) && error.message.includes("toggle"));
  });

  test("dispatches a known subcommand, forwarding the remaining args to it", async () => {

    const { calls, client } = makeFakeClient({ relays: [{ id: "r1", name: "Garage", outputs: [{ id: 3, state: "off" }] }] });
    const { ctx } = makeCommandContext({ args: [ "toggle", "Garage" ], client });

    await relay.run(ctx);

    assert.deepEqual(calls.toggles, [{ outputId: 3, relay: "r1" }], "the forwarded relay toggle subcommand invoked the method");
  });
});

describe("chime group", () => {

  test("no subcommand prints the group usage and exits zero", async () => {

    const { client } = makeFakeClient();
    const { ctx, stdout } = makeCommandContext({ args: [], client });

    await chime.run(ctx);

    assert.match(stdout(), /Usage: ufp chime <subcommand>/);
  });

  test("an unknown subcommand is a usage error listing the valid subcommands", async () => {

    const { client } = makeFakeClient();
    const { ctx } = makeCommandContext({ args: ["bogus"], client });

    await assert.rejects(chime.run(ctx),
      (error: unknown) => (error instanceof CliError) && (error.exitCode === 2) && error.message.includes("play-buzzer") && error.message.includes("play-speaker"));
  });

  test("dispatches a known subcommand, forwarding the remaining args to it", async () => {

    const { calls, client } = makeFakeClient({ chimes: [{ id: "ch1", name: "Hallway" }] });
    const { ctx } = makeCommandContext({ args: [ "play-buzzer", "Hallway" ], client });

    await chime.run(ctx);

    assert.deepEqual(calls.playBuzzers, ["ch1"], "the forwarded chime play-buzzer subcommand invoked the method");
  });
});

describe("camera unlock", () => {

  test("invokes only unlock, recording the camera, and touches no sibling method", async () => {

    const { calls, client } = makeFakeClient({ cameras: [{ id: "c1", name: "Front Door" }] });
    const { ctx, stdout } = makeCommandContext({ args: ["Front Door"], client });

    await cameraUnlock.run(ctx);

    // The verb hit exactly its own method. The sibling buckets prove no other special-endpoint action fired - the exactly-one-method control.
    assert.deepEqual(calls.unlocks, ["c1"]);
    assert.deepEqual(calls.flashlights, []);
    assert.deepEqual(calls.toggles, []);
    assert.deepEqual(calls.playSpeakers, []);
    assert.deepEqual(calls.playBuzzers, []);
    assert.match(stdout(), /Unlocked Front Door\./);
  });

  test("a missing camera target is a usage error", async () => {

    const { client } = makeFakeClient();
    const { ctx } = makeCommandContext({ args: [], client });

    await assert.rejects(cameraUnlock.run(ctx), (error: unknown) => (error instanceof CliError) && (error.exitCode === 2));
  });

  test("a library capability error propagates unwrapped rather than being swallowed", async () => {

    // The camera's unlock throws ProtectUnsupportedError (the library's own capability guard). This proves the verb does not swallow or re-wrap that error - it lets it
    // propagate so the entry point renders it as a calm one-line message. It does NOT prove any CLI-side guarding; there is none, and the guard is tested in the library.
    const camera = { id: "c1", modelKey: "camera", name: "Front Door",
      unlock: (): Promise<void> => Promise.reject(new ProtectUnsupportedError("no lock", { feature: "supportUnlock" })) };
    const client = { camera: (token: string) => (token === "c1") ? camera : undefined, cameras: [camera], chimes: [], fobs: [], lights: [], relays: [], sensors: [],
      viewers: [], [Symbol.asyncDispose]: (): Promise<void> => Promise.resolve() } as unknown as ProtectClient;
    const { ctx } = makeCommandContext({ args: ["Front Door"], client });

    await assert.rejects(cameraUnlock.run(ctx), ProtectUnsupportedError);
  });
});

describe("camera flashlight", () => {

  test("invokes only turnOnFlashlight, recording the camera, and touches no sibling method", async () => {

    const { calls, client } = makeFakeClient({ cameras: [{ id: "c1", name: "Front Door" }] });
    const { ctx, stdout } = makeCommandContext({ args: ["Front Door"], client });

    await cameraFlashlight.run(ctx);

    assert.deepEqual(calls.flashlights, ["c1"]);
    assert.deepEqual(calls.unlocks, []);
    assert.deepEqual(calls.toggles, []);
    assert.deepEqual(calls.playSpeakers, []);
    assert.deepEqual(calls.playBuzzers, []);
    assert.match(stdout(), /Turned on Front Door's flashlight\./);
  });

  test("a missing camera target is a usage error", async () => {

    const { client } = makeFakeClient();
    const { ctx } = makeCommandContext({ args: [], client });

    await assert.rejects(cameraFlashlight.run(ctx), (error: unknown) => (error instanceof CliError) && (error.exitCode === 2));
  });
});

describe("relay toggle", () => {

  test("with an explicit output id toggles that id and touches no sibling method", async () => {

    const { calls, client } = makeFakeClient({ relays: [{ id: "r1", name: "Garage", outputs: [ { id: 0, state: "off" }, { id: 2, state: "on" } ] }] });
    const { ctx, stdout } = makeCommandContext({ args: [ "Garage", "2" ], client });

    await relayToggle.run(ctx);

    assert.deepEqual(calls.toggles, [{ outputId: 2, relay: "r1" }]);
    assert.deepEqual(calls.unlocks, []);
    assert.deepEqual(calls.flashlights, []);
    assert.match(stdout(), /Toggled output 2 on Garage\./);
  });

  test("with a single output and no id toggles that output's id (not its index)", async () => {

    // The sole output carries id 7; the command must toggle 7, not the array position 0 - the id-versus-index distinction the controller cares about.
    const { calls, client } = makeFakeClient({ relays: [{ id: "r1", name: "Garage", outputs: [{ id: 7, state: "off" }] }] });
    const { ctx } = makeCommandContext({ args: ["Garage"], client });

    await relayToggle.run(ctx);

    assert.deepEqual(calls.toggles, [{ outputId: 7, relay: "r1" }]);
  });

  test("with several outputs and no id is a usage error listing the ids and states", async () => {

    const { calls, client } = makeFakeClient({ relays: [{ id: "r1", name: "Garage", outputs: [ { id: 1, state: "off" }, { id: 2, state: "on" } ] }] });
    const { ctx } = makeCommandContext({ args: ["Garage"], client });

    await assert.rejects(relayToggle.run(ctx),
      (error: unknown) => (error instanceof CliError) && (error.exitCode === 2) && error.message.includes("1 (off)") && error.message.includes("2 (on)"));
    assert.deepEqual(calls.toggles, [], "no output was toggled when the target was ambiguous");
  });

  test("with zero outputs and no id is a usage error rather than a call with no target", async () => {

    const { calls, client } = makeFakeClient({ relays: [{ id: "r1", name: "Garage", outputs: [] }] });
    const { ctx } = makeCommandContext({ args: ["Garage"], client });

    await assert.rejects(relayToggle.run(ctx),
      (error: unknown) => (error instanceof CliError) && (error.exitCode === 2) && error.message.includes("no outputs"));
    assert.deepEqual(calls.toggles, [], "no toggle was attempted against a relay with no outputs");
  });

  test("a missing relay target is a usage error", async () => {

    const { client } = makeFakeClient();
    const { ctx } = makeCommandContext({ args: [], client });

    await assert.rejects(relayToggle.run(ctx), (error: unknown) => (error instanceof CliError) && (error.exitCode === 2));
  });
});

describe("chime play-speaker", () => {

  test("maps the flags into the play-speaker options and touches no sibling method", async () => {

    const { calls, client } = makeFakeClient({ chimes: [{ id: "ch1", name: "Hallway" }] });
    const { ctx, stdout } = makeCommandContext({ args: [ "Hallway", "--ringtone", "abc", "--volume", "80", "--repeat", "2" ], client });

    await chimePlaySpeaker.run(ctx);

    assert.equal(calls.playSpeakers.length, 1);
    assert.equal(calls.playSpeakers[0]?.chime, "ch1");
    assert.equal(calls.playSpeakers[0]?.opts.ringtoneId, "abc");
    assert.equal(calls.playSpeakers[0]?.opts.volume, 80);
    assert.equal(calls.playSpeakers[0]?.opts.repeatTimes, 2);
    assert.deepEqual(calls.playBuzzers, []);
    assert.deepEqual(calls.unlocks, []);
    assert.match(stdout(), /Played Hallway's speaker\./);
  });

  test("with no flags sends no ringtone, volume, or repeat, leaving the controller its defaults", async () => {

    const { calls, client } = makeFakeClient({ chimes: [{ id: "ch1", name: "Hallway" }] });
    const { ctx } = makeCommandContext({ args: ["Hallway"], client });

    await chimePlaySpeaker.run(ctx);

    assert.equal(calls.playSpeakers[0]?.opts.ringtoneId, undefined);
    assert.equal(calls.playSpeakers[0]?.opts.volume, undefined);
    assert.equal(calls.playSpeakers[0]?.opts.repeatTimes, undefined);
  });

  test("a missing chime target is a usage error", async () => {

    const { client } = makeFakeClient();
    const { ctx } = makeCommandContext({ args: [], client });

    await assert.rejects(chimePlaySpeaker.run(ctx), (error: unknown) => (error instanceof CliError) && (error.exitCode === 2));
  });
});

describe("chime play-buzzer", () => {

  test("invokes only playBuzzer, recording the chime, and touches no sibling method", async () => {

    const { calls, client } = makeFakeClient({ chimes: [{ id: "ch1", name: "Hallway" }] });
    const { ctx, stdout } = makeCommandContext({ args: ["Hallway"], client });

    await chimePlayBuzzer.run(ctx);

    assert.deepEqual(calls.playBuzzers, ["ch1"]);
    assert.deepEqual(calls.playSpeakers, []);
    assert.deepEqual(calls.unlocks, []);
    assert.match(stdout(), /Played Hallway's buzzer\./);
  });

  test("a missing chime target is a usage error", async () => {

    const { client } = makeFakeClient();
    const { ctx } = makeCommandContext({ args: [], client });

    await assert.rejects(chimePlayBuzzer.run(ctx), (error: unknown) => (error instanceof CliError) && (error.exitCode === 2));
  });
});

describe("doctor", () => {

  // The fixture for a connected, healthy run: an authenticated admin, an online camera that snapshots and streams (init + media), and a scriptable event firehose.
  const healthyContext = (args: string[]): ReturnType<typeof makeCommandContext> => {

    const { client } = makeFakeClient({ authUser: { id: "u1", name: "admin" }, cameras: [{ id: "c1", name: "Cam", segments: [

      { codec: "avc1", data: Buffer.from([1]), type: "init" },
      { data: Buffer.from([2]), mdat: Buffer.alloc(0), moof: Buffer.alloc(0), type: "media" }
    ] }], events: [{ at: 0, cameraId: "c1", eventId: "e1", kind: "motionDetected" }] });

    return makeCommandContext({ args, client });
  };

  test("a healthy controller passes its checks and exits zero", async () => {

    const { ctx, stdout } = healthyContext([]);
    const savedExit = process.exitCode;

    try {

      await doctor.run(ctx);

      const out = stdout();

      // Every subsystem is exercised against the fake; the diagnostics-channels check warns (nothing publishes), which is not a failure, so the run exits zero.
      assert.match(out, /PASS/);
      assert.match(out, /\d+ passed, \d+ warnings, 0 failed\./);
      assert.equal(process.exitCode, 0);
    } finally {

      process.exitCode = savedExit;
    }
  });

  test("a connect failure fails fast, runs no later checks, and exits one", async () => {

    const { client } = makeFakeClient();
    const { ctx, stdout } = makeCommandContext({ args: [], client });

    ctx.openClient = (): Promise<ProtectClient> => Promise.reject(new ProtectAuthError("not authenticated", { statusCode: 401 }));

    const savedExit = process.exitCode;

    try {

      await doctor.run(ctx);

      const out = stdout();

      assert.match(out, /FAIL/);
      assert.match(out, /Connect and authenticate/);
      assert.doesNotMatch(out, /State and bootstrap/, "the early return skips every later check");
      assert.doesNotMatch(out, /Livestream pool/);
      assert.equal(process.exitCode, 1);
    } finally {

      process.exitCode = savedExit;
    }
  });

  test("a connect failure in --json emits ok:false with the single failed result", async () => {

    const { client } = makeFakeClient();
    const { ctx, stdout } = makeCommandContext({ args: ["--json"], client });

    ctx.openClient = (): Promise<ProtectClient> => Promise.reject(new ProtectAuthError("not authenticated", { statusCode: 401 }));

    const savedExit = process.exitCode;

    try {

      await doctor.run(ctx);

      const parsed = JSON.parse(stdout()) as { ok: boolean; results: { name: string; status: string }[] };

      assert.equal(parsed.ok, false);
      assert.equal(parsed.results.length, 1, "the early return records only the connect check");
      assert.equal(parsed.results[0]?.name, "Connect and authenticate");
      assert.equal(parsed.results[0]?.status, "fail");
      assert.equal(process.exitCode, 1);
    } finally {

      process.exitCode = savedExit;
    }
  });

  test("--json splits recognized-but-unmodeled from genuine schema drift and warns", async () => {

    const { ctx, stdout } = healthyContext(["--json"]);
    const realOpen = ctx.openClient;

    // doctor subscribes to every channel before it opens the client, so publishing inside the opener (before the fake resolves) lands on those subscriptions. The two
    // unmodeledCollection signals drive the known:true (recognized) vs known:false (drift) split; the events/http signals make the diagnostics-channels check pass.
    ctx.openClient = (opts?: { debug?: boolean; refreshIntervalMs?: number | false; signal?: AbortSignal }): Promise<ProtectClient> => {

      channels.schemaUnmodeledCollection.publish({ collection: "aiports", count: 1, exampleId: "a1", known: true, modelKey: "aiport" });
      channels.schemaUnmodeledCollection.publish({ collection: "garages", count: 1, exampleId: "g1", known: false, modelKey: "garage" });
      channels.schemaUnknownModelKey.publish({ action: "add", exampleId: "g1", modelKey: "garage" });
      channels.eventsPacket.publish({ kind: "motionDetected" });
      channels.httpRequestStart.publish({ method: "GET", requestId: "r1", url: "https://controller/" });

      return realOpen(opts);
    };

    const savedExit = process.exitCode;

    try {

      await doctor.run(ctx);

      const parsed = JSON.parse(stdout()) as { ok: boolean; results: { detail?: string; name: string; status: string }[] };
      const schema = parsed.results.find((result) => result.name === "Schema drift");

      assert.ok(schema !== undefined, "the schema-drift check ran");
      assert.equal(schema.status, "warn", "an unknown modelKey and a known:false collection are genuine drift, so the check warns");
      assert.match(schema.detail ?? "", /unmodeled drift \(known:false\): garage/);
      assert.match(schema.detail ?? "", /recognized-but-unmodeled: aiport \(not a defect\)/);
    } finally {

      process.exitCode = savedExit;
    }
  });
});

describe("diagnostics", () => {

  test("an unmatched --channel pattern is a usage error before connecting", async () => {

    const { client } = makeFakeClient();
    const { ctx } = makeCommandContext({ args: [ "--channel", "zzznope" ], client });

    await assert.rejects(diagnostics.run(ctx), (error: unknown) => (error instanceof CliError) && (error.exitCode === 2));
  });

  test("--count resolves once the message budget is met, having rendered the diagnostic", async () => {

    const { client } = makeFakeClient();
    const { ctx, stdout } = makeCommandContext({ args: [ "--count", "1" ], client });
    const realOpen = ctx.openClient;

    // The feed subscribes before the client opens, so a single message published inside the opener meets the --count 1 budget and resolves the wait.
    ctx.openClient = (opts?: { debug?: boolean; refreshIntervalMs?: number | false; signal?: AbortSignal }): Promise<ProtectClient> => {

      channels.httpRequestStart.publish({ method: "GET", requestId: "r1", url: "https://controller/" });

      return realOpen(opts);
    };

    await diagnostics.run(ctx);

    const out = stdout();

    assert.match(out, /unifi-protect:http:request:start/, "the published diagnostic was rendered");
    assert.match(out, /Subscribed to \d+ diagnostics channel\(s\)/);
  });

  test("an already-aborted signal resolves the wait immediately", async () => {

    const { client } = makeFakeClient();
    const { ctx, stdout } = makeCommandContext({ args: [], client, signal: AbortSignal.abort() });

    await diagnostics.run(ctx);

    assert.match(stdout(), /Subscribed to \d+ diagnostics channel\(s\)/);
  });
});

describe("watch state", () => {

  test("a missing target is a usage error", async () => {

    const { client } = makeFakeClient();
    const { ctx } = makeCommandContext({ args: [], client });

    await assert.rejects(watchState.run(ctx), (error: unknown) => (error instanceof CliError) && (error.exitCode === 2));
  });

  test("a device category renders a count header and each device's connectivity", async () => {

    const { client } = makeFakeClient({ cameras: [{ id: "c1", name: "Cam", online: true }], observations: 1 });
    const { ctx, stdout } = makeCommandContext({ args: ["cameras"], client });

    await watchState.run(ctx);

    const out = stdout();

    assert.match(out, /Cameras \(1\)/);
    assert.match(out, /Cam/);
    assert.match(out, /connected/, "the connectivity label is the library's own online predicate, lowercased");
  });

  test("--online observes the connected-only selector, dropping offline devices", async () => {

    const { client } = makeFakeClient({ cameras: [ { id: "c1", name: "OnCam", online: true }, { id: "c2", name: "OffCam", online: false } ], observations: 1 });
    const { ctx, stdout } = makeCommandContext({ args: [ "cameras", "--online" ], client });

    await watchState.run(ctx);

    const out = stdout();

    assert.match(out, /OnCam/);
    assert.doesNotMatch(out, /OffCam/, "the online selector excludes the offline camera, proving --online selects category.online");
  });

  test("a controller fact renders its current value", async () => {

    const admin = makeFakeClient({ observations: 1 });
    const adminCtx = makeCommandContext({ args: ["isAdmin"], client: admin.client });

    await watchState.run(adminCtx.ctx);

    // With no authenticated user reduced into state, isAdmin derives to false and renders as a colored "no".
    assert.match(adminCtx.stdout(), /isAdmin: no/);

    const named = makeFakeClient({ observations: 1 });
    const namedCtx = makeCommandContext({ args: ["controllerName"], client: named.client });

    await watchState.run(namedCtx.ctx);

    assert.match(namedCtx.stdout(), /controllerName: Fake NVR/);
  });

  test("a single device renders its name, connectivity, and firmware", async () => {

    const { client } = makeFakeClient({ lights: [{ id: "l1", name: "Porch", online: true }], observations: 1 });
    const { ctx, stdout } = makeCommandContext({ args: ["Porch"], client });

    await watchState.run(ctx);

    const out = stdout();

    assert.match(out, /Porch/);
    assert.match(out, /connected/);
    assert.match(out, /fw=1\.0\.0/);
  });

  test("--count bounds the change stream and the client is disposed", async () => {

    const { calls, client } = makeFakeClient({ cameras: [{ id: "c1", name: "Cam", online: true }], observations: 3 });
    const { ctx, stdout } = makeCommandContext({ args: [ "cameras", "--count", "2" ], client });

    await watchState.run(ctx);

    const headers = stdout().match(/Cameras \(1\)/g) ?? [];

    assert.equal(headers.length, 2, "take bounds three observations to two rendered changes");
    assert.equal(calls.disposed, 1, "the client is disposed via await using once the bounded stream ends");
  });

  test("--json emits each observed change as a JSON object", async () => {

    const { client } = makeFakeClient({ cameras: [{ id: "c1", name: "Cam", online: true }], observations: 3 });
    const { ctx, stdout } = makeCommandContext({ args: [ "cameras", "--count", "2", "--json" ], client });

    await watchState.run(ctx);

    const lines = stdout().trim().split("\n");

    assert.equal(lines.length, 2);

    const parsed = JSON.parse(lines[0] ?? "") as { count: number; devices: { id: string }[]; selector: string };

    assert.equal(parsed.selector, "cameras");
    assert.equal(parsed.count, 1);
    assert.equal(parsed.devices[0]?.id, "c1");
  });
});
