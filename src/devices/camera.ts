/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * camera.ts: The Camera device projection - read-through config plus the camera-specific commands (snapshot, livestream, talkback, and the sensor and accessory
 * operations).
 */
import type { LivestreamFrame, LivestreamSpec } from "../livestream/session.ts";
import type { LivestreamOutput, LivestreamSubscribeOptions, LivestreamSubscription } from "../livestream/pool.ts";
import { ProtectProtocolError, ProtectUnsupportedError } from "../shared/errors.ts";
import type { TalkbackAudioCodec, TalkbackSession } from "../talkback/session.ts";
import type { DeviceContext } from "./context.ts";
import { DeviceProjection } from "./device.ts";
import type { ProtectCameraConfig } from "../types/index.ts";

/**
 * Options for {@link Camera.snapshot}. Width and height request a specific output size; omit both for the controller's default. Set `packageCamera` to capture from the
 * secondary package sensor on dual-camera devices (the G4/G5 Doorbell Pro) instead of the primary lens.
 *
 * @category Devices
 */
export interface SnapshotOptions {

  height?: number;

  /**
   * Capture from the camera's secondary package sensor (the downward-facing lens on dual-camera doorbells such as the G4/G5 Doorbell Pro) rather than the primary lens.
   * This is an endpoint distinction - it swaps the request path to `/package-snapshot` - not a multi-lens selection, and it is a hard precondition: {@link
   * Camera.snapshot} throws {@link ProtectUnsupportedError} before issuing any request when the camera's `featureFlags.hasPackageCamera` is not set. Named
   * `packageCamera` rather than `package` because `package` is a reserved word in strict-mode ES modules and so could not be destructured.
   */
  packageCamera?: boolean;
  signal?: AbortSignal;
  width?: number;
}

/**
 * Options for {@link Camera.livestream} - the `source` selector (a quality channel or a secondary lens), the tuning (segment length, chunk size, opt-in timestamps),
 * the `route` the stream is dialed on (`"proxied"` by default, `"direct"` or `"preferDirect"`), the `audio` codec it carries (`"aac"` by default, or `"opus"`) and
 * the `upstream` it reads (`"ubv"` to read UBV even for AAC), without `cameraId` (the camera supplies its own id) and without `audioExpected` (the camera states
 * it from its record), plus the per-subscription {@link LivestreamSubscribeOptions} (an abort signal that disposes the returned subscription, an `urgency` closure
 * feeding the pool's resilient recovery, and `discardOnDispose`). The `output` a subscription iterates is named beside these by the overloads of
 * {@link Camera.livestream} and never by this type, so a value typed as it answers segments.
 *
 * @category Devices
 */
export interface LivestreamOptions extends Omit<LivestreamSpec, "audioExpected" | "cameraId">, LivestreamSubscribeOptions {}

/**
 * A camera projection. Inherits the read-through getters, live `observe`, and the write-through `update` and `reboot` commands from {@link DeviceProjection}, and adds
 * the commands specific to cameras. Camera-specific *configuration* (RTSP enablement, recording settings, and so on) is expressed through `update` payloads rather
 * than bespoke methods.
 *
 * @category Devices
 */
export class Camera extends DeviceProjection<ProtectCameraConfig> {

  readonly modelKey = "camera";

  constructor(ctx: DeviceContext, id: string) {

    super(ctx, id, ctx.store.selectors.camera.byId);
  }

  /**
   * Fetch a current JPEG snapshot from the camera.
   *
   * @param opts - Snapshot sizing and an optional abort signal.
   *
   * @returns The snapshot image bytes.
   *
   * @throws {ProtectUnsupportedError} When `opts.packageCamera` is set but the camera has no package sensor (checked before any request is issued).
   * @throws The classified `FatalError` on a non-2xx, or a transport-level `ProtectError` on failure.
   */
  async snapshot(opts: SnapshotOptions = {}): Promise<Buffer> {

    // A package snapshot targets the secondary package sensor that only dual-camera devices (the G4/G5 Doorbell Pro) carry. The capability is a mandatory client-side
    // precondition, not a soft fallback: we read the camera's `hasPackageCamera` feature flag from its live config and throw a typed error before building any URL or
    // issuing a request, rather than dispatching one the controller is guaranteed to reject. We fail fast with a typed error - no wasted round-trip - and never silently
    // fall back to the primary snapshot.
    if(opts.packageCamera) {

      const { displayName, featureFlags, name } = this.config;

      if(!featureFlags.hasPackageCamera) {

        throw new ProtectUnsupportedError("Camera " + (name ?? displayName) + " (" + this.id + ") has no package camera, so a package snapshot is unavailable.",
          { feature: "hasPackageCamera" });
      }
    }

    // Build the size query from whatever dimensions the caller supplied; an empty query lets the controller pick its default resolution.
    const params = new URLSearchParams();

    if(opts.width !== undefined) {

      params.append("w", opts.width.toString());
    }

    if(opts.height !== undefined) {

      params.append("h", opts.height.toString());
    }

    // The only behavioral difference of a package snapshot is the endpoint segment; the size query and the rest of the path are identical to the primary snapshot.
    const query = params.toString();
    const endpoint = opts.packageCamera ? "/package-snapshot" : "/snapshot";

    // The snapshot is raw bytes, so we read the buffered body of the classified response directly rather than parsing - exactly what `ProtectResponse.body` is for.
    return (await this.dispatch(endpoint + ((query.length > 0) ? "?" + query : ""), { method: "GET", signal: opts.signal })).body;
  }

  /**
   * Read the camera's current ambient-light level. This is a live *query* of the camera's lux sensor - the instantaneous illuminance reading - and is distinct from the
   * config's `isDark` boolean (a derived day/night flag the reducer already holds). Because the reading is telemetry the controller does not broadcast as state, there is
   * nothing for the reducer to fold it into, so it is a direct request rather than an observable field.
   *
   * @param opts - An optional abort signal.
   *
   * @returns The live illuminance reading, in lux.
   *
   * @throws {ProtectUnsupportedError} When the camera has no ambient-light sensor (`featureFlags.hasLuxCheck` is unset), checked before any request is issued.
   * @throws {ProtectProtocolError} When the controller's 2xx response carries no numeric `illuminance` reading.
   * @throws The classified `FatalError` on a non-2xx, or a transport-level `ProtectError` on failure.
   */
  async lux(opts: { signal?: AbortSignal } = {}): Promise<number> {

    // The lux sensor is a hard precondition: we read the camera's `hasLuxCheck` feature flag from its live config and throw a typed error before issuing a request the
    // controller would reject, exactly as the package-snapshot guard does.
    const { displayName, featureFlags, name } = this.config;

    if(!featureFlags.hasLuxCheck) {

      throw new ProtectUnsupportedError("Camera " + (name ?? displayName) + " (" + this.id + ") has no ambient-light sensor, so a lux reading is unavailable.",
        { feature: "hasLuxCheck" });
    }

    // The reading is a single primitive we lift off the response and hand straight back as a typed `number`, so - unlike a structural body that flows into the reducer to
    // be reconciled - nothing downstream would catch a malformed shape. We validate it at the boundary, exactly as the WebSocket-URL negotiation does: type the parse
    // honestly as optional, then throw `ProtectProtocolError` (the same error `json()` raises on malformed JSON) when the controller's 2xx body carries no numeric
    // `illuminance`, rather than returning `undefined` behind a lying `number` return type.
    const body = (await this.dispatch("/lux", { method: "GET", signal: opts.signal })).json<{ illuminance?: number }>();

    if(typeof body.illuminance !== "number") {

      throw new ProtectProtocolError("The UniFi Protect lux endpoint response for camera " + this.id + " did not contain a numeric illuminance reading.");
    }

    return body.illuminance;
  }

  /**
   * Release a paired UniFi Access lock on this camera. Currently the controller supports unlocking only Access readers attached to a camera on the same controller as
   * Protect. Write-through: the command is issued and the method returns; it does not fold any response into the store. Unlike a config command, an unlock has no
   * lock-state result to observe - the Access bridge is one-way. `accessDeviceMetadata.doorInfo.lockState` is static capability metadata that does *not* change on an
   * unlock (confirmed live against an Access reader, via both the realtime stream and a REST refresh), and the controller emits no firehose occurrence a consumer can act
   * on: a software unlock arrives as a device-less, bare `type: "access"` packet byte-identical to the user-session audit event the controller emits on every
   * authentication, so the library deliberately surfaces no unlock-confirmation event. Treat `unlock()` as fire-and-forget - it issues the command and resolves;
   * there is no realtime acknowledgement to await.
   *
   * @param opts - An optional abort signal.
   *
   * @throws {ProtectUnsupportedError} When the camera has no paired Access lock (`accessDeviceMetadata.featureFlags.supportUnlock` is unset), checked before any
   *   request is issued.
   * @throws The classified `FatalError` on a non-2xx, or a transport-level `ProtectError` on failure.
   */
  async unlock(opts: { signal?: AbortSignal } = {}): Promise<void> {

    // The unlock capability lives in the optional Access metadata block, which is absent entirely on cameras with no paired reader; we guard on it before issuing the
    // request, the package-snapshot precedent.
    const { accessDeviceMetadata, displayName, name } = this.config;

    if(!accessDeviceMetadata?.featureFlags.supportUnlock) {

      throw new ProtectUnsupportedError("Camera " + (name ?? displayName) + " (" + this.id + ") has no paired Access lock, so it cannot be unlocked.",
        { feature: "supportUnlock" });
    }

    await this.dispatch("/unlock", { signal: opts.signal });
  }

  /**
   * Activate the package-camera downlight (the flashlight on dual-camera doorbells such as the G4/G5 Doorbell Pro). This is a **momentary** operation: the controller
   * exposes no off endpoint, and the light self-extinguishes roughly 25 seconds after the last activation. A consumer that wants the light to stay lit re-issues this
   * call on its own cadence (Protect's own apps pulse it every ~20 seconds); turning it off is simply ceasing to re-issue. The keepalive cadence is therefore consumer
   * policy - the library exposes only the single primitive operation. Write-through: the request is issued and the method returns.
   *
   * @param opts - An optional abort signal.
   *
   * @throws {ProtectUnsupportedError} When the camera has no package sensor (`featureFlags.hasPackageCamera` is unset), checked before any request is issued.
   * @throws The classified `FatalError` on a non-2xx, or a transport-level `ProtectError` on failure.
   */
  async turnOnFlashlight(opts: { signal?: AbortSignal } = {}): Promise<void> {

    // The flashlight lives on the secondary package sensor, so the same `hasPackageCamera` flag that gates a package snapshot gates the flashlight; we throw before
    // issuing the request when it is absent.
    const { displayName, featureFlags, name } = this.config;

    if(!featureFlags.hasPackageCamera) {

      throw new ProtectUnsupportedError("Camera " + (name ?? displayName) + " (" + this.id + ") has no package camera, so it has no flashlight.",
        { feature: "hasPackageCamera" });
    }

    await this.dispatch("/turnon-flashlight", { signal: opts.signal });
  }

  /**
   * Subscribe to this camera's livestream as frames. Delegates to the library-owned pool, as a segments subscription does, and reads the camera's UBV record stream
   * whatever `upstream` says: the returned subscription is an `AsyncIterable<LivestreamFrame>` and `AsyncDisposable`, yielding each video and audio frame as the
   * camera sent it, with no init. It shares one underlying WebSocket with every consumer asking for the same stream on the same route from UBV with the same audio,
   * segments consumers among them, and the camera states whether to expect audio as it does for segments.
   *
   * @param opts - The stream source, tuning, route and audio codec, the per-subscription options (abort signal, urgency, and discard-on-dispose), and
   *   `output: "frames"`.
   *
   * @returns The subscription: live, or already disposed when its signal had already aborted.
   */
  livestream(opts: LivestreamOptions & { output: "frames" }): LivestreamSubscription<LivestreamFrame>;

  /**
   * Subscribe to a live fMP4 stream from this camera. Delegates to the library-owned pool, which shares one underlying WebSocket across every consumer asking for the
   * same stream on the same route and replays the cached init segment to late joiners. The returned subscription is an `AsyncIterable<Segment>` and `AsyncDisposable`;
   * iterate it for segments, dispose it (or abort its signal) to leave - the underlying session closes once the last subscriber departs.
   *
   * The camera states whether the stream should expect audio, which decides whether a UBV stream holds its first segment for it: audio is expected when the camera
   * has a microphone and the microphone is enabled. Its recording settings govern what is recorded and leave the live stream's audio as it was, so they are not
   * read. A handle whose camera has left the controller state states nothing, and the spec's own default applies.
   *
   * @param opts - The stream source, tuning, route, audio codec and upstream, plus the per-subscription options (abort signal, urgency, and discard-on-dispose), with
   *   `output: "segments"`, the default.
   *
   * @returns The subscription: live, or already disposed when its signal had already aborted.
   */
  livestream(opts: LivestreamOptions & { output?: "segments" }): LivestreamSubscription;

  livestream(opts: LivestreamOptions & { output?: LivestreamOutput }): LivestreamSubscription<LivestreamFrame> | LivestreamSubscription {

    const { discardOnDispose, output, signal, urgency, ...spec } = opts;
    const record = this.peek();
    const stream: LivestreamSpec = { ...((record !== undefined) && { audioExpected: record.featureFlags.hasMic && record.isMicEnabled }), cameraId: this.id, ...spec };
    const options: LivestreamSubscribeOptions = { ...((discardOnDispose !== undefined) && { discardOnDispose }), ...((signal !== undefined) && { signal }),
      ...((urgency !== undefined) && { urgency }) };

    // The output picks the pool's overload, so a frames request reaches the pool through the one that answers frames.
    return (output === "frames") ? this.ctx.livestreamPool.subscribe(stream, { ...options, output }) :
      this.ctx.livestreamPool.subscribe(stream, { ...options, ...((output !== undefined) && { output }) });
  }

  /**
   * Open a send-direction two-way-audio (talkback) channel to this camera's speaker, in the codec `audio` names. Negotiates the channel and connects atomically: the
   * returned promise resolves with a live {@link TalkbackSession} or throws. The session is an `AsyncDisposable` - feed it audio with `session.send(source)` (a
   * consumer-supplied `AsyncIterable<Uint8Array>`, e.g. an ffmpeg `stdout`) and dispose it (or abort its signal) to close. The library transcodes nothing, so each
   * codec has its chunk contract:
   *
   * - `"aac"` (the default) streams an ADTS stream, cut anywhere, through the controller's talkback WebSocket, which relays it to the camera.
   * - `"opus"` sends each chunk as exactly one raw Opus packet straight to the camera's RTP listener, so a source taken from an Ogg or WebM container is split into
   *   its packets first, and a chunk that is not one packet ends the send with {@link ProtectProtocolError}.
   *
   * Every source paces itself in real time. The session's `samplingRate` is the rate the camera's talkback settings name, which the session reads from the controller
   * once its negotiation has switched the camera to the codec asked for. A camera has one talkback mode, and the last caller sets it: the negotiation switches the
   * camera to the codec asked for and saves it, the library never switches it back, and any AAC talkback to the camera by anyone - this library, the Protect app,
   * another client - switches it back to AAC, which silently ends the playback of an Opus session still sending.
   *
   * A client-side precondition is checked before any negotiation: a camera without a speaker cannot receive talkback, so this throws {@link
   * ProtectUnsupportedError} up front rather than issuing a request the controller would reject - the package-snapshot precedent applied to the send channel. The
   * projection holds no talkback state (a set-once "talkback active" flag on a live view would be the stale-flag failure mode); each call mints an independent session.
   *
   * @param opts        - The talkback options.
   * @param opts.audio  - The codec the session sends, `"aac"` when omitted.
   * @param opts.signal - An optional abort signal that cancels the connect and, once live, tears the session down.
   *
   * @returns A connected talkback session.
   *
   * @throws {ProtectUnsupportedError} When the camera has no speaker (`featureFlags.hasSpeaker` is unset), checked before any negotiation.
   * @throws The classified `FatalError` on a non-2xx negotiation or camera-record read, {@link ProtectProtocolError} when an answer lacks the address or the rate it
   *   must name, or a transport-level `ProtectError` when the socket fails to open.
   */
  async talkback(opts: { audio?: TalkbackAudioCodec; signal?: AbortSignal } = {}): Promise<TalkbackSession> {

    // The speaker is a hard precondition: read the camera's `hasSpeaker` feature flag from its live config and throw a typed error before negotiating a channel the
    // controller would refuse, exactly as the package-snapshot guard does for the snapshot endpoint.
    const { displayName, featureFlags, name } = this.config;

    if(!featureFlags.hasSpeaker) {

      throw new ProtectUnsupportedError("Camera " + (name ?? displayName) + " (" + this.id + ") has no speaker, so two-way audio is unavailable.",
        { feature: "hasSpeaker" });
    }

    const { audio, ...callOpts } = opts;

    return this.ctx.talkback({ ...((audio !== undefined) && { audio }), cameraId: this.id }, callOpts);
  }
}
