/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * fake-client.helpers.ts: A minimal, configurable fake ProtectClient and command-context harness for unit-testing CLI commands through the injected openClient seam.
 */
import type { PlaySpeakerOptions, ProtectClient, ProtectState, RawPacket, Segment, TypedEvent } from "../../index.ts";
import type { CommandContext } from "./shared.ts";
import { Output } from "./output/format.ts";

// One relay output as the fake surfaces it through `config.outputs`, mirroring the real record's numeric `id` and `"off" | "on"` state - the fields `relay toggle` reads
// to resolve which output to toggle.
export interface FakeRelayOutput {

  id: number;
  name?: string;
  state: "off" | "on";
}

// A device the fake exposes. Cameras may additionally carry snapshot bytes and a livestream segment script; relays may carry the outputs `relay toggle` resolves against.
export interface FakeDeviceSpec {

  id: string;
  name: string;
  online?: boolean;
  outputs?: FakeRelayOutput[];
  rebootFails?: boolean;
}

export interface FakeCameraSpec extends FakeDeviceSpec {

  segments?: Segment[];
  snapshot?: Buffer;
}

// The NVR singleton the fake reports through state.snapshot().nvr and the derived getters.
export interface FakeNvr {

  firmwareVersion?: string;
  host?: string;
  id?: string;
  mac?: string;
  name?: string;
  upSince?: number;
  version?: string;
}

// Everything the fake client can be configured to report: the device collections keyed by class, the NVR singleton, the authenticated session, the derived facts
// (isAdmin, controllerName), and the scripted realtime streams (events, rawPackets). `observations` is the one non-obvious field - it sets how many times every fake
// observe (state.observe and each device.observe) yields before ending, driving the `watch state` tests; 0 (the default) keeps observe a no-op.
export interface FakeClientOptions {

  authUser?: { id: string; name: string } | null;
  cameras?: FakeCameraSpec[];
  chimes?: FakeDeviceSpec[];
  controllerName?: string | null;
  events?: TypedEvent[];
  fobs?: FakeDeviceSpec[];
  isAdmin?: boolean;
  lights?: FakeDeviceSpec[];
  nvr?: FakeNvr | null;
  observations?: number;
  rawPackets?: RawPacket[];
  relays?: FakeDeviceSpec[];
  sensors?: FakeDeviceSpec[];
  viewers?: FakeDeviceSpec[];
}

// The calls a command made, captured for assertions: device reboots and the controller reboot (by id or "nvr"), update payloads, talkback streams (camera + bytes
// drained), the special-endpoint device actions (camera unlock/flashlight, relay output toggles, chime speaker/buzzer plays), and the dispose count. Each action records
// into its own bucket so a per-verb test can assert its verb hit exactly its method and no sibling.
export interface FakeCalls {

  disposed: number;
  flashlights: string[];
  playBuzzers: string[];
  playSpeakers: { chime: string; opts: PlaySpeakerOptions }[];
  reboots: string[];
  talkback: { bytes: number; camera: string }[];
  toggles: { outputId: number; relay: string }[];
  unlocks: string[];
  updates: { id: string; patch: unknown }[];
}

// Build one fake device projection, recording its update/reboot calls. The config record carries exactly the fields the commands read through. The `observations` count
// is how many times the projection's `observe` yields before ending - 0 (the default) keeps observe a no-op; a positive count drives `watch state`'s single-device
// branch.
function makeDevice(spec: FakeDeviceSpec, modelKey: string, calls: FakeCalls, observations: number): Record<string, unknown> {

  const config = {

    displayName: spec.name,
    firmwareVersion: "1.0.0",
    id: spec.id,
    mac: "AABBCC" + spec.id,
    marketName: "Fake " + modelKey,
    name: spec.name,
    // Surface a relay's outputs through `config.outputs` (as the real read-through config does) so `relay toggle` can resolve single / multi / zero-output cases; a
    // non-relay spec omits it, so the field is present only when a test supplied it.
    ...((spec.outputs !== undefined) && { outputs: spec.outputs }),
    state: (spec.online ?? true) ? "CONNECTED" : "DISCONNECTED",
    type: "FAKE"
  };

  // We build the device into a named const first so its `observe` generator can close over it, then return that same reference - the generator only reads `device` when
  // iterated (after the assignment completes), so the self-reference is safe.
  const device: Record<string, unknown> = {

    config,
    id: spec.id,
    isOnline: spec.online ?? true,
    modelKey,
    name: spec.name,
    observe: async function *(opts?: { signal?: AbortSignal }): AsyncGenerator<Record<string, unknown>> {

      // A real device.observe yields the live projection on each change; the fake yields the same projection a fixed `observations` times then ends, standing in for the
      // single-device branch of `watch state`.
      for(let emitted = 0; emitted < observations; emitted += 1) {

        if(opts?.signal?.aborted === true) {

          return;
        }

        yield device;
      }
    },
    // The special-endpoint device actions, each an unconditional recording stub: it records the call into its own bucket and resolves. The stubs are deliberately not
    // gated on any capability flag - the real capability guard lives in the library method (and is tested there), so gating here would falsely simulate a CLI-side guard
    // the CLI does not have. Every fake device carries every special-endpoint stub; a verb test drives only the one its device class exposes and asserts the sibling
    // buckets stayed empty.
    playBuzzer: (): Promise<void> => {

      calls.playBuzzers.push(spec.id);

      return Promise.resolve();
    },
    playSpeaker: (opts: PlaySpeakerOptions = {}): Promise<void> => {

      calls.playSpeakers.push({ chime: spec.id, opts });

      return Promise.resolve();
    },
    reboot: (): Promise<void> => {

      // A spec can mark its reboot as failing, to exercise the bulk-reboot continue-on-error path; a failed reboot is not recorded as a successful one.
      if(spec.rebootFails === true) {

        return Promise.reject(new Error("simulated reboot failure"));
      }

      calls.reboots.push(spec.id);

      return Promise.resolve();
    },
    toggleOutput: (outputId: number): Promise<void> => {

      calls.toggles.push({ outputId, relay: spec.id });

      return Promise.resolve();
    },
    turnOnFlashlight: (): Promise<void> => {

      calls.flashlights.push(spec.id);

      return Promise.resolve();
    },
    unlock: (): Promise<void> => {

      calls.unlocks.push(spec.id);

      return Promise.resolve();
    },
    update: (patch: unknown): Promise<unknown> => {

      calls.updates.push({ id: spec.id, patch });

      return Promise.resolve(undefined);
    }
  };

  return device;
}

// Build a fake camera: a device plus snapshot bytes and a livestream that yields the scripted segments then ends. The `observations` count is threaded into the device
// beneath so the camera's `observe` yields the same fixed number of times.
function makeCamera(spec: FakeCameraSpec, calls: FakeCalls, observations: number): Record<string, unknown> {

  const device = makeDevice(spec, "camera", calls, observations);
  const segments = spec.segments ?? [];

  return {

    ...device,
    livestream: (): AsyncIterable<Segment> & AsyncDisposable => ({

      async *[Symbol.asyncIterator](): AsyncGenerator<Segment> {

        for(const segment of segments) {

          yield segment;
        }
      },
      [Symbol.asyncDispose]: (): Promise<void> => Promise.resolve()
    }),
    // A snapshot: the spec's bytes when supplied, else the minimal valid JPEG - the SOI marker (0xFF 0xD8) immediately followed by the EOI marker (0xFF 0xD9) - standing
    // in for a real snapshot payload without embedding one.
    snapshot: (): Promise<Buffer> => Promise.resolve(spec.snapshot ?? Buffer.from([ 0xFF, 0xD8, 0xFF, 0xD9 ])),
    // A fake talkback session: its send() drains the supplied source and records the camera and total bytes, so a `talkback` command test can assert what was streamed
    // without a live WebSocket. close/dispose are inert.
    talkback: (): Promise<Record<string, unknown>> => Promise.resolve({

      close: (): Promise<void> => Promise.resolve(),
      send: async (audioSource: AsyncIterable<Uint8Array>): Promise<void> => {

        let bytes = 0;

        for await (const chunk of audioSource) {

          bytes += chunk.length;
        }

        calls.talkback.push({ bytes, camera: spec.id });
      },
      state: "live",
      [Symbol.asyncDispose]: (): Promise<void> => Promise.resolve()
    })
  };
}

/**
 * Build a fake {@link ProtectClient} and a record of the calls commands make against it. Sufficient for unit-testing the CLI commands through the injected `openClient`
 * seam: device collections and lookups, snapshot/livestream/update/reboot, the controller reboot, the realtime firehose, and the derived getters. It is intentionally
 * minimal - tests configure only what the command under test reads - and is cast to `ProtectClient` at the one boundary where a structural fake meets the nominal type.
 *
 * @param options - The devices, NVR, derived facts, and scripted events the fake should report.
 *
 * @returns The fake client and the captured calls.
 *
 * @category CLI
 */
export function makeFakeClient(options: FakeClientOptions = {}): { calls: FakeCalls; client: ProtectClient } {

  const calls: FakeCalls = { disposed: 0, flashlights: [], playBuzzers: [], playSpeakers: [], reboots: [], talkback: [], toggles: [], unlocks: [], updates: [] };

  // How many times each fake observe (state.observe and every device.observe) yields before ending. Default 0 keeps observe a no-op.
  const observations = options.observations ?? 0;
  const cameras = (options.cameras ?? []).map((spec) => makeCamera(spec, calls, observations));
  const lights = (options.lights ?? []).map((spec) => makeDevice(spec, "light", calls, observations));
  const sensors = (options.sensors ?? []).map((spec) => makeDevice(spec, "sensor", calls, observations));
  const chimes = (options.chimes ?? []).map((spec) => makeDevice(spec, "chime", calls, observations));
  const viewers = (options.viewers ?? []).map((spec) => makeDevice(spec, "viewer", calls, observations));
  const relays = (options.relays ?? []).map((spec) => makeDevice(spec, "relay", calls, observations));
  const fobs = (options.fobs ?? []).map((spec) => makeDevice(spec, "fob", calls, observations));
  const nvr = (options.nvr === undefined) ? { name: "Fake NVR" } : options.nvr;
  const events = options.events ?? [];
  const rawPackets = options.rawPackets ?? [];

  // The authenticated session, modeled as the reducer does: an id plus a one-entry users map, so selectAuthUser (and the curated info --json identity block) resolves it.
  const authUser = options.authUser ?? null;
  const authUserId = authUser?.id ?? null;
  const users = new Map<string, unknown>((authUser === null) ? [] : [[ authUser.id, authUser ]]);

  const lookup = (collection: Record<string, unknown>[]) => (id: string): Record<string, unknown> | undefined => collection.find((device) => device["id"] === id);

  // Project a device collection into the id-keyed config map ProtectState holds, so state.snapshot() is shaped like the real reduced state and info --raw can serialize
  // it.
  const configMap = (devices: Record<string, unknown>[]): Map<string, unknown> => new Map(devices.map((device) => [ String(device["id"]), device["config"] ]));

  // A state.snapshot() shaped like the real reduced state: the id-keyed config maps, the nvr singleton, and the session identity (authUserId + users). info renders
  // host/version/firmwareVersion/upSince, so the nvr defaults are filled (nvr overrides); info --raw serializes the whole thing, selectAuthUser resolves the session.
  // Named so both state.snapshot and state.observe build a fresh projection from the same source.
  const buildSnapshot = (): Record<string, unknown> => ({

    authUserId,
    bootstrapId: 0,
    cameras: configMap(cameras),
    chimes: configMap(chimes),
    fobs: configMap(fobs),
    lights: configMap(lights),
    nvr: (nvr === null) ? null :
      { firmwareVersion: "1.0.0", host: "10.0.0.1", id: "nvr-id", mac: "AABBCCDDEEFF", name: "Fake NVR", upSince: 1700000000000, version: "7.0.0", ...nvr },
    relays: configMap(relays),
    sensors: configMap(sensors),
    users,
    viewers: configMap(viewers)
  });

  const client = {

    camera: lookup(cameras),
    cameras,
    chime: lookup(chimes),
    chimes,
    connection: { isHealthy: true, isThrottled: false, state: "healthy" },
    controllerName: (options.controllerName === undefined) ? "Fake NVR" : options.controllerName,
    async *events(): AsyncGenerator<TypedEvent> {

      for(const event of events) {

        yield event;
      }
    },
    fetchBootstrap: (): Promise<unknown> => Promise.resolve({ nvr: (nvr === null) ? null : { name: "Fake NVR", ...nvr }, raw: true }),
    fob: lookup(fobs),
    fobs,
    isAdmin: options.isAdmin ?? true,
    light: lookup(lights),
    lights,
    async *rawPackets(): AsyncGenerator<RawPacket> {

      for(const packet of rawPackets) {

        yield packet;
      }
    },
    reboot: (): Promise<void> => {

      calls.reboots.push("nvr");

      return Promise.resolve();
    },
    relay: lookup(relays),
    relays,
    sensor: lookup(sensors),
    sensors,
    state: {

      // A real observe yields on each state change; the fake yields the selector applied to a fresh snapshot a fixed `observations` times then ends - the bound a live
      // --count / --duration imposes - returning early if the supplied signal is already aborted before a yield. Default 0 keeps it a no-op.
      observe: async function *(selector: (state: ProtectState) => unknown, opts?: { signal?: AbortSignal }): AsyncGenerator {

        for(let emitted = 0; emitted < observations; emitted += 1) {

          if(opts?.signal?.aborted === true) {

            return;
          }

          yield selector(buildSnapshot() as unknown as ProtectState);
        }
      },

      snapshot: buildSnapshot
    },
    viewer: lookup(viewers),
    viewers,
    [Symbol.asyncDispose]: (): Promise<void> => {

      calls.disposed += 1;

      return Promise.resolve();
    }
  };

  return { calls, client: client as unknown as ProtectClient };
}

/**
 * Build a {@link CommandContext} wired to a fake client, with a capturing stdout, for driving a command in a test. The returned `stdout()` reads everything the command
 * wrote, and `signal` is a fresh, un-aborted signal unless one is supplied via `options.signal` (which the abort-path tests pass an already-aborted signal to).
 *
 * @param options - The command arguments, the fake client to inject, and an optional abort signal to drive abort-path tests.
 *
 * @returns The context and a stdout reader.
 *
 * @category CLI
 */
export function makeCommandContext(options: { args: string[]; client: ProtectClient; signal?: AbortSignal }): { ctx: CommandContext; stdout: () => string } {

  const chunks: string[] = [];
  const write = (chunk: string | Uint8Array): boolean => (chunks.push((typeof chunk === "string") ? chunk : Buffer.from(chunk).toString()), true);
  const stream = { isTTY: false, write };
  const output = new Output({ colorize: false, env: {}, stream });

  const ctx: CommandContext = {

    args: options.args,
    env: {},
    openClient: (): Promise<ProtectClient> => Promise.resolve(options.client),
    output,
    signal: options.signal ?? new AbortController().signal
  };

  return { ctx, stdout: (): string => chunks.join("") };
}
