/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * session.ts: One livestream WebSocket per (cameraId, channel, lens) - negotiate, hand each message to the intake that decodes it, and fan segments out
 * through a three-rail EventBus, with a silence watchdog. The structural sibling of EventStream.
 */

/**
 * `LivestreamSession` owns one camera livestream WebSocket and, through its intake, decodes what the controller streams into a stream of {@link Segment}s. It is
 * the **structural sibling of {@link EventStream}**: construct-begins-connecting, socket listeners its one teardown removes by identity, a {@link Clock}-driven
 * silence watchdog a single {@link AbortController} ends, an injected `webSocket` factory, a private {@link EventBus} for its surface, and `AsyncDisposable`. A reader
 * who has internalized `EventStream` reads this class and recognizes the same skeleton.
 *
 * The one thing the events stream does not need and this one does is **URL negotiation**. The events WebSocket connects to a fixed, predictable address; a
 * livestream's addresses are minted on demand by the controller over authenticated HTTP and must be fetched first. That fetch is the injected `resolveUrl` hook
 * (dependency inversion, exactly like the {@link Transport}'s `getAuthHeaders` and the {@link StateStore}'s `refresh`): the session owns the *whole* connect attempt -
 * negotiate the addresses, open the socket on its route, receive the first init segment - so every failure flows through one error rail, while the session never
 * imports `Transport`. The composition root wires `resolveUrl` to a transport-backed GET that answers both of a livestream's addresses: the proxied one on the
 * controller authority under the UniFi OS proxy, and the direct one on the controller's media server when the controller offers it.
 *
 * **A session dials exactly one route.** Its spec's `route` is `"proxied"`, the default, or `"direct"`, and never `"preferDirect"`, which the pool resolves to one of
 * them for each attempt. The proxied route dials the controller authority with the session's auth headers and the certificate posture `verifyTls` sets; the direct
 * route dials the media server, whose minted alias in the path is its only credential, with no session header and no certificate check. A direct session handed no
 * direct address tears down with {@link ProtectLivestreamRouteError} and builds no socket, and so does a proxied session asking for Opus, which names its stream by
 * that address.
 *
 * **A livestream reads one upstream or the other.** Protect's own fMP4 carries AAC, and Ubiquiti's UBV record stream carries Opus as well, read by the library and
 * written as fMP4 by it: a spec that names `upstream: "ubv"` or asks for Opus reads UBV, and any other reads Protect's own fMP4. The proxy's bridge drops the
 * audio codec from the request, so a proxied session asking for Opus sends one play command on its socket, naming its stream by the path of the negotiation's
 * direct address, when its first binary message arrives and never at open, where it can lose a race with the bridge's own. It is the one message the library
 * sends on a livestream socket, and the alias it carries is never logged and never carried by an error.
 *
 * **The session is the single source of truth for the livestream wire protocol** - both the request params it builds from its {@link LivestreamSpec} and the
 * decode, which lives behind the {@link LivestreamIntake} boundary: the session hands every binary message to the one intake it holds for its life, picked by the
 * stream's upstream, and each hands every init and media segment back through the session's sink. {@link Fmp4Intake} reads the controller's own frames (a 1-byte
 * frame type + 3-byte big-endian length per frame, reassembled across WebSocket messages, accumulated into a segment between `beginSegment` and `endSegment`), and
 * {@link UbvIntake} reads UBV records into frames, which it also hands to the sink, and writes them as fMP4. An intake's refusal ends the session as a fault.
 * `resolveUrl` is only the generic "negotiate a ws endpoint" step; everything livestream-specific lives here and behind the intake.
 *
 * **The watchdog detects here; the consumer's policy responds.** The session clock-stamps the arrival of every frame and runs a silence watchdog on the injected
 * `Clock`; a wake that finds the channel silent beyond {@link PROTECT_LIVESTREAM_HEARTBEAT_TIMEOUT} tears the socket down and emits `error({@link ProtectStallError})`
 * once the connection is released. The session does not reconnect: it is the pure, non-resilient escape hatch. Recovery is owned one layer up by the pool's
 * `ManagedSession` (a direct consumer of a bare session handles its own restart). `ProtectStallError` is shared verbatim with `EventStream`'s watchdog.
 *
 * @module LivestreamSession
 */
import { Agent, WebSocket } from "undici";
import { Fmp4Intake, UbvIntake } from "./intake.ts";
import type { LivestreamIntake, LivestreamIntakeSink } from "./intake.ts";
import { PROTECT_LIVESTREAM_CHUNK_SIZE, PROTECT_LIVESTREAM_HEARTBEAT_TIMEOUT, PROTECT_LIVESTREAM_SEGMENT_LENGTH } from "../shared/settings.ts";
import { ProtectAbortedError, ProtectConfigurationError, ProtectError, ProtectLivestreamRouteError, ProtectNetworkError, ProtectProtocolError, ProtectStallError,
  assertNever } from "../shared/errors.ts";
import type { ProtectWebSocket, ProtectWebSocketCloseEvent, ProtectWebSocketErrorEvent, ProtectWebSocketMessageEvent, SocketTeardown } from "../transport/ws.ts";
import { createOwnedConnector, releaseOwned } from "../transport/connector.ts";
import { millisecondsSince, wallClock } from "../shared/clock.ts";
import { socketFault, teardownCode, toBuffer } from "../transport/ws.ts";
import type { Clock } from "../shared/clock.ts";
import { EventBus } from "../shared/event-bus.ts";
import type { LivestreamAudioCodec } from "../protocol/media/codecs/codecs.ts";
import type { LivestreamInit } from "../protocol/media/fmp4/init-segment.ts";
import type { MediaFrame } from "../protocol/media/frames.ts";
import type { OwnedDispatcher } from "../transport/connector.ts";
import type { ProtectLogging } from "../shared/logging.ts";
import type { StreamOptions } from "../shared/event-bus.ts";
import { noopLog } from "../shared/logging.ts";

// The width of the length a play command's JSON follows on the wire, a 32-bit big-endian count of its bytes.
const PLAY_LENGTH_BYTES = 4;

// The sentence a session reports media its intake could not read with, as the fault's line and as the error a throw that is not a ProtectError is wrapped in.
const UNREADABLE_MEDIA = "The UniFi Protect livestream sent media the library could not read.";

// The port a WebSocket address dials when it names none, by its scheme.
const WEBSOCKET_DEFAULT_PORTS: Readonly<Record<string, number>> = { "ws:": 80, "wss:": 443 };

/**
 * The deterministic lifecycle of a livestream session. The transitions are: `idle -> connecting` (construction begins; the URL is negotiated and the socket built),
 * `connecting -> handshaking` (WebSocket `open`), `handshaking -> live` (first init segment received and cached), and `any -> closed` (teardown run, listeners
 * detached; the owned connection's release is what close() awaits). A teardown the session runs itself - self-initiated (an explicit close() or an aborted signal) or
 * failure-driven (a negotiation failure, a socket error, or a watchdog stall) - passes through `closing` only momentarily inside that teardown, so `closing` is never
 * observable from outside; a peer-initiated close reaches `closed` directly.
 *
 * @category Transport
 */
export type LivestreamState = "idle" | "connecting" | "handshaking" | "live" | "closing" | "closed";

/**
 * The mutually-exclusive livestream source selector. A livestream is captured EITHER from a quality channel on the primary sensor OR from a secondary lens (which the
 * controller always addresses on channel 0); no two can be combined. Tagged (matching {@link Segment}) so the tag is authoritative regardless
 * of how the value is built, and so the illegal "a non-zero channel paired with a lens" request is unrepresentable at the type level rather than silently coerced.
 *
 * @category Transport
 */
export type LivestreamSource =
  | { channel: number; type: "channel" } |
  { lens: number; type: "lens" };

/**
 * How a livestream reaches the controller. One negotiation answers both of a livestream's addresses, so the route is a dial choice over that one negotiation:
 *
 * - `"proxied"`, the default, dials the controller authority under the UniFi OS proxy, carrying the session's auth headers and verifying the certificate as
 *   `verifyTls` says.
 * - `"direct"` dials the controller's media server at the authority's hostname and the port the controller minted, skipping the UniFi OS proxy and Protect's bridge.
 *   The minted alias in its path is its only credential, so it carries no session header, and it never verifies the media server's self-signed certificate, whatever
 *   `verifyTls` says. A negotiation that offers no direct address ends the stream with {@link ProtectLivestreamRouteError}.
 * - `"preferDirect"` dials direct first each time the stream establishes or recovers, and once the direct route itself fails - a direct dial refused, reset or
 *   left unanswered, a direct socket that opens and sends no media, or a negotiation that offers no direct address - it falls back, publishing
 *   `livestreamRouteFallback` with the reason, and dials proxied until the stream is live again. Every route shares the negotiation, so a failed one moves nothing.
 *   A stream asking for Opus is the exception to the last case: its proxied route names its stream by the direct address, so a negotiation that offers none ends
 *   it with {@link ProtectLivestreamRouteError} on every route, this one included, with no fallback.
 *
 * @category Transport
 */
export type LivestreamRoute = "direct" | "preferDirect" | "proxied";

/**
 * Where a livestream's media comes from: `"fmp4"`, Protect's own fMP4, or `"ubv"`, Ubiquiti's UBV record stream, which the library reads and writes as fMP4 itself.
 * A stream reads UBV when its spec names `upstream: "ubv"` or asks for Opus, which Protect's own fMP4 does not carry, and Protect's own fMP4 otherwise.
 *
 * @category Transport
 */
export type LivestreamUpstream = "fmp4" | "ubv";

/**
 * A route one session dials: every {@link LivestreamRoute} but `"preferDirect"`, which the pool resolves to one of these for each attempt.
 *
 * @category Transport
 */
export type LivestreamDialRoute = Exclude<LivestreamRoute, "preferDirect">;

/**
 * The description of a livestream a consumer asks for. The fields that shape the stream - the `source` selector (a quality channel or a secondary lens) plus
 * `segmentLength`, `chunkSize`, and `timestamps` - the `route` it is dialed on, and the `upstream` it resolves to with the `audio` it asks for form the pool's
 * sharing identity, so two subscribers share one underlying session only when these agree. `requestId` is a log label only, and `audioExpected` shapes only how a
 * UBV stream waits for its audio. Every field except `cameraId` has a default; an omitted `source` is the primary view (channel 0), an omitted `route` is
 * `"proxied"`, an omitted `audio` is AAC, and an omitted `upstream` is resolved from the audio.
 *
 * @category Transport
 */
export interface LivestreamSpec {

  /**
   * Optional audio codec the stream carries: `"aac"`, the default, or `"opus"`. Protect's own fMP4 carries AAC alone, so a stream asking for Opus reads UBV, on
   * every route: the direct route asks for it in the request, and the proxied route by a play command on its socket.
   */
  audio?: LivestreamAudioCodec;

  /**
   * Optional statement of whether the camera sends audio, `true` when left out. It shapes only how a UBV stream waits for its audio: a stream that expects audio holds
   * its first segment until an audio frame of the asked codec arrives, under the library's safety net, and one that expects none closes it at the segment length.
   * It never joins the stream's sharing key. `Camera.livestream` states it from the camera's record.
   */
  audioExpected?: boolean;

  /** Optional maximum WebSocket payload size, in bytes. Larger means lower fragmentation, higher per-frame latency. Default `PROTECT_LIVESTREAM_CHUNK_SIZE` (4096). */
  chunkSize?: number;

  /** The camera device id to stream. */
  cameraId: string;

  /** Optional request label sent to the controller, surfaced in its logs. Default `${cameraId}-${channel}`. Not part of the pool's sharing identity. */
  requestId?: string;

  /**
   * Optional route the stream is dialed on: `"proxied"` (the default) through the UniFi OS proxy, `"direct"` to the controller's media server, or `"preferDirect"`,
   * direct with the proxy behind it. See {@link LivestreamRoute}: a direct dial carries no session header and never verifies the media server's certificate.
   */
  route?: LivestreamRoute;

  /**
   * Optional fMP4 segment length, in milliseconds, which the controller writes to on Protect's own fMP4 and the library on UBV. Floored at
   * `PROTECT_LIVESTREAM_SEGMENT_LENGTH` (100), which is also the default. A stream reading UBV refuses a length that is not a finite number of milliseconds with
   * `ProtectProtocolError`.
   */
  segmentLength?: number;

  /**
   * Which stream to capture. `{ type: "channel", channel }` selects a quality channel (0 is the highest); `{ type: "lens", lens }` selects a secondary lens on a
   * multi-lens device (e.g., a package camera), which the controller always addresses on channel 0. The selectors are mutually exclusive - modeling them as a
   * discriminated union makes the illegal "channel and lens together" request unrepresentable. Omit `source` for the primary view (channel 0, lens 0).
   */
  source?: LivestreamSource;

  /**
   * Optionally request per-segment decode timestamps, Protect's own fMP4 metadata. When `true`, the negotiation asks the controller for extended metadata and each
   * media segment of Protect's own fMP4 carries them. A UBV stream does not carry them, so its segments carry none whatever this says.
   */
  timestamps?: boolean;

  /**
   * Optional upstream the stream is read from: `"ubv"` reads Ubiquiti's UBV record stream even for AAC. Left out, a stream asking for Opus reads UBV and any other
   * reads Protect's own fMP4.
   */
  upstream?: "ubv";
}

/**
 * A {@link LivestreamSpec} with every default applied. The single resolved shape both the session (to build its request params and pick its intake) and the pool
 * (to compute its sharing key) read, so the defaulting logic lives in exactly one place ({@link resolveLivestreamSpec}). Every field but `audioExpected` and
 * `requestId` joins the key.
 *
 * @category Transport
 */
export interface ResolvedLivestreamSpec {

  audio: LivestreamAudioCodec;
  audioExpected: boolean;
  chunkSize: number;
  cameraId: string;
  channel: number;
  lens: number;
  requestId: string;
  route: LivestreamRoute;
  segmentLength: number;
  timestamps: boolean;
  upstream: LivestreamUpstream;
}

/**
 * One segment of a livestream, in CMAF/DASH vocabulary: either the stream's initialization segment or a media segment. Each arm is a complete, decodable unit.
 *
 * - `init` carries the FTYP+MOOV initialization segment as one {@link LivestreamInit}: the stream's RFC 6381 codec label, the init bytes, and the stream's
 *   description read from them - everything a decoder needs before the media flows. On Protect's own fMP4 the label is the controller's, and on UBV the one the
 *   library wrote the init under.
 * - `media` carries one complete fMP4 fragment. `moof` and `mdat` are **zero-copy `subarray` views** into `data` (no byte copy), for a consumer that wants the boxes
 *   at the lowest usable level; carrying a one-buffer-many-views model onto the single yielded item rather than re-emitting the same bytes on separate items.
 *   `timestamps` is present only on Protect's own fMP4 when the consumer opted in via `LivestreamSpec`'s `timestamps` field, and never on UBV; it is one decode
 *   timestamp per frame (faithful to the wire's array, not a lossy scalar), and stays within JavaScript's safe-integer range because the session always negotiates
 *   `rebaseTimestampsToZero`, which is what makes `number` exact here rather than `bigint`. `discontinuity` is present (and `true`) only on the first media segment
 *   delivered after a genuine reconnect, and absent otherwise.
 *   It marks a timeline discontinuity: every session's timeline starts near zero - Protect's own fMP4 is negotiated with `rebaseTimestampsToZero`, and a UBV
 *   stream's writer counts from its first keyframe - so a reconnect restarts the `tfdt` baseMediaDecodeTime near zero, a
 *   backward jump relative to the prior segments, and a consumer maintaining a decode timeline (an FFmpeg pipe, an MSE-style source buffer) should treat a
 *   marked segment as a splice point: flush and resume at this clean keyframe. A consumer that does not maintain a cross-segment timeline ignores it. The session itself
 *   never sets it - a session has no concept of a reconnect; that is the pool's, which stamps the marker as it fans the first post-reconnect media segment.
 *
 * @category Transport
 */
export type Segment =
  | ({ type: "init" } & LivestreamInit) |
  { type: "media"; data: Buffer; moof: Buffer; mdat: Buffer; timestamps?: number[]; discontinuity?: true };

/**
 * One frame of a livestream's frames output: a media frame a UBV stream carries, video or audio, told apart by `kind`, with its codec, its payload exactly as the
 * camera sent it (a view of the socket message it arrived in, never a copy), its timestamp in ticks at its `rate` on the camera's own timeline, and on video whether
 * it is a keyframe. Audio of a codec other than the one the stream asked for never arrives.
 *
 * `discontinuity` is present (and `true`) only on the first frame delivered after a reconnect, or after an establishing attempt that delivered frames and ended
 * before its media, and absent otherwise. It marks a gap: the frames the camera sent between the last one delivered and the marked one never arrived, so a consumer
 * that decodes across frames treats a marked frame as a splice point. The session itself never sets it: the pool stamps it on a copy as it hands the frame out.
 *
 * @category Transport
 */
export type LivestreamFrame = MediaFrame & { readonly discontinuity?: true };

/**
 * The events {@link LivestreamSession} publishes on its three-rail surface.
 *
 * - `segment` is the decoded stream: one init or media {@link Segment} per fragment. The pool bridges this rail and fans each segment to every subscriber.
 * - `frame` carries each media frame a UBV stream's intake reads, as it arrives and as a view of the socket message it arrived in, ahead of the segments the frame
 *   completes. Audio of a codec other than the one the stream asked for never reaches it. Protect's own fMP4 carries no frames, so a session reading it emits none.
 * - `closed` fires once when the session tears down, carrying a code and reason that classify the teardown: the peer's own close code and reason for a close it
 *   started, otherwise 1000 for a teardown we chose (an explicit close or a caller abort) and 1006 for one forced by a failure (a failed negotiation, a negotiation
 *   that offered no direct address to a session that needs one, a socket that cannot send the play command or fails to, a socket error, media the intake could not
 *   read, or a watchdog stall). It also carries the optional typed {@link ProtectError} cause an initiated teardown recorded - a caller abort or the failure's own
 *   error - omitted for a plain or spontaneous close.
 * - `error` carries a typed {@link ProtectError}: the watchdog always emits a {@link ProtectStallError}; a session whose negotiation offered no direct address, a
 *   direct one or a proxied one asking for Opus, emits a {@link ProtectLivestreamRouteError}; a proxied session asking for Opus whose socket has no `send` emits a
 *   {@link ProtectConfigurationError}; an intake's refusal emits its own error, a {@link ProtectProtocolError} for media it could not read or a
 *   {@link ProtectLivestreamAudioError} for a UBV stream carrying another audio codec; and a negotiation or socket failure typically wraps as a
 *   {@link ProtectNetworkError} - a socket failure classified by the rule the request path reads, so a refused certificate is a {@link ProtectCertificateError} and a
 *   connection attempt that timed out a {@link ProtectTimeoutError} - but when the injected `resolveUrl` hook throws an already-typed {@link ProtectError}, that
 *   instance passes through onto this rail unwrapped, so a negotiation failure can also surface a {@link ProtectStallError} or another {@link ProtectError} subtype.
 *   The error *type* is what a subscriber acts on. A listener sees the session already closed, with this error recorded as its close cause, because the teardown
 *   records the closed state and the cause before it reports.
 *
 * @category Transport
 */
export interface LivestreamSessionEvents {

  closed: [info: { cause?: ProtectError; code: number; reason: string }];
  error: [err: ProtectError];
  frame: [frame: MediaFrame];
  segment: [segment: Segment];
}

/**
 * The addresses one livestream negotiation answers, which a session's `resolveUrl` hook resolves to. `proxied` is the controller authority under the UniFi OS proxy
 * with the minted path and the query that carries the token, and is always present. `direct` is the controller's media server at the authority's hostname with the
 * minted port, path and query, or null when the controller offered no direct address the library can dial. A session dials exactly one of them, the one its route
 * names.
 *
 * @category Transport
 */
export interface LivestreamAddresses {

  direct: string | null;
  proxied: string;
}

/**
 * Construction options for {@link LivestreamSession}.
 *
 * - `spec` describes the stream and the one route the session dials, `"proxied"` (the default) or `"direct"`; a session is never handed `"preferDirect"`, which the
 *   pool resolves to one of them for each attempt. The session resolves its defaults and builds the negotiation params from it.
 * - `resolveUrl` is the negotiation hook: given the request params, it returns both of the livestream's {@link LivestreamAddresses}. The composition root wires it to
 *   a transport-backed GET; tests pass a one-line fake.
 * - `getAuthHeaders` is the cookie hook, wired to {@link AuthSession} at the composition root (the same dependency inversion the {@link Transport} uses). On the
 *   proxied route the session reads it when it builds its socket, after its negotiation, so a relogin the negotiation triggered reaches the upgrade. The direct route
 *   never reads it, so no session header reaches the media server, and an injected `webSocket` factory receives the chosen URL alone.
 * - `webSocket` is the injected I/O dependency, shared with {@link EventStream}'s; omit it for the default undici-backed factory, inject it in tests. Its socket is
 *   typed by its receiving surface, but a proxied session asking for Opus must send its play command on it, so it reads the socket's `send` when it must send,
 *   and ends on {@link ProtectConfigurationError} when the socket has none.
 * - `signal` cancels the connect attempt and, once live, the session - if it aborts at any point, the session tears down.
 * - `clock` is the watchdog's time source; it defaults to the wall clock, and tests inject a fake to drive the silence watchdog deterministically.
 * - `log` is the destination for the session's diagnostic output; it defaults to a no-op logger, so a caller that never provides one incurs no logging cost.
 * - `verifyTls` opts the proxied route's owned connection into strict TLS certificate verification; it defaults to `false` for the controller's self-signed
 *   certificate. The direct route dials the media server, whose self-signed certificate nothing installed on UniFi OS replaces, with verification off whatever
 *   this says. An injected `webSocket` factory builds no agent here, so the option is inert alongside one.
 *
 * @category Transport
 */
export interface LivestreamSessionOptions {

  clock?: Clock;
  getAuthHeaders?: () => Record<string, string>;
  log?: ProtectLogging;
  resolveUrl: (params: URLSearchParams, opts: { signal?: AbortSignal }) => Promise<LivestreamAddresses>;
  signal?: AbortSignal;
  spec: LivestreamSpec & { route?: LivestreamDialRoute };
  verifyTls?: boolean;
  webSocket?: (url: string) => ProtectWebSocket;
}

// Resolve the source selector to the controller's (channel, lens) wire pair. This is the single place the protocol constraint lives: a secondary lens is always addressed
// on channel 0, and a quality-channel selection carries no lens, so each selector fixes the other coordinate at 0; an omitted source is the primary view. Because the
// input is a discriminated union, the illegal "both selected" request is unrepresentable, so this resolution never has to choose between a conflicting channel and lens.
function resolveSource(source: LivestreamSource | undefined): { channel: number; lens: number } {

  if(source === undefined) {

    return { channel: 0, lens: 0 };
  }

  switch(source.type) {

    case "channel": {

      return { channel: source.channel, lens: 0 };
    }

    case "lens": {

      return { channel: 0, lens: source.lens };
    }

    default: {

      return assertNever(source);
    }
  }
}

// Resolve the route a stream is dialed on: an omitted route is the proxied one, and a value outside the routes, which only an untyped caller can pass, is refused here
// as an unknown source type is, before anything is negotiated, so no mistyped value reaches the direct route's unverified socket. The resolved route keeps whatever
// narrower route type the caller's spec carries.
function resolveRoute<Route extends LivestreamRoute>(route: Route | undefined): Route | "proxied" {

  if(route === undefined) {

    return "proxied";
  }

  switch(route) {

    case "direct":
    case "preferDirect":
    case "proxied": {

      return route;
    }

    default: {

      return assertNever(route);
    }
  }
}

// Resolve the audio codec a stream asks for: an omitted codec is AAC, and a value outside the codecs, which only an untyped caller can pass, is refused here as an
// unknown route is.
function resolveAudio(audio: LivestreamAudioCodec | undefined): LivestreamAudioCodec {

  if(audio === undefined) {

    return "aac";
  }

  switch(audio) {

    case "aac":
    case "opus": {

      return audio;
    }

    default: {

      return assertNever(audio);
    }
  }
}

// Resolve the upstream a stream reads: UBV when the spec names it, and when it asks for Opus, which Protect's own fMP4 does not carry, and Protect's own fMP4
// otherwise. An upstream named as anything but UBV, which only an untyped caller can pass, is refused, so Protect's own fMP4 is never named, only left to the default.
function resolveUpstream(upstream: "ubv" | undefined, audio: LivestreamAudioCodec): LivestreamUpstream {

  switch(upstream) {

    case undefined: {

      return (audio === "opus") ? "ubv" : "fmp4";
    }

    case "ubv": {

      return upstream;
    }

    default: {

      return assertNever(upstream);
    }
  }
}

// Resolve a stream's segment length, floored at PROTECT_LIVESTREAM_SEGMENT_LENGTH. On UBV the library's writer closes each segment at that length, so a length that
// is not a finite number of milliseconds, which a number can still hold, is refused here as an unknown route is, before anything is negotiated. Protect's own fMP4
// hands the length to the controller as it is.
function resolveSegmentLength(segmentLength: number | undefined, upstream: LivestreamUpstream): number {

  const floored = Math.max(segmentLength ?? PROTECT_LIVESTREAM_SEGMENT_LENGTH, PROTECT_LIVESTREAM_SEGMENT_LENGTH);

  if((upstream === "ubv") && !Number.isFinite(floored)) {

    throw new ProtectProtocolError("The UniFi Protect livestream's segment length is not a finite number of milliseconds.");
  }

  return floored;
}

/**
 * Apply every {@link LivestreamSpec} default in one place, so the session and the pool agree on the resolved stream identity. The segment length is floored at
 * {@link PROTECT_LIVESTREAM_SEGMENT_LENGTH}: a shorter request would only add controller load for no downstream benefit. An omitted route is `"proxied"`, a route
 * outside {@link LivestreamRoute} is refused with {@link ProtectProtocolError} as an unknown source type is, and the resolved route keeps whatever narrower route type
 * the spec carries, so a session's spec, which admits only the routes a session dials, resolves to one of those. An omitted audio codec is AAC, the upstream is UBV
 * when the spec names it or asks for Opus and Protect's own fMP4 otherwise, and an audio codec or an upstream outside its union is refused as a route is, as is a
 * segment length that is not a finite number of milliseconds on a spec resolving to UBV, whose writer the length paces. An omitted `audioExpected` is `true`.
 *
 * @typeParam Route - The routes the spec's own type admits.
 *
 * @param spec - The raw spec a consumer supplied.
 *
 * @returns The spec with all defaults applied.
 *
 * @category Transport
 */
export function resolveLivestreamSpec<Route extends LivestreamRoute = LivestreamRoute>(spec: LivestreamSpec & { route?: Route }):
  ResolvedLivestreamSpec & { route: Route | "proxied" } {

  // Resolve the source selector to its wire (channel, lens) pair first, so the resolved channel is available both as a field and for the requestId label default
  // below, the audio codec ahead of the upstream it decides, and the upstream ahead of the segment length it judges.
  const { channel, lens } = resolveSource(spec.source);
  const audio = resolveAudio(spec.audio);
  const upstream = resolveUpstream(spec.upstream, audio);

  return {

    audio,
    audioExpected: spec.audioExpected ?? true,
    cameraId: spec.cameraId,
    channel: channel,
    chunkSize: spec.chunkSize ?? PROTECT_LIVESTREAM_CHUNK_SIZE,
    lens: lens,
    requestId: spec.requestId ?? (spec.cameraId + "-" + channel.toString()),
    route: resolveRoute(spec.route),
    segmentLength: resolveSegmentLength(spec.segmentLength, upstream),
    timestamps: spec.timestamps ?? false,
    upstream
  };
}

/**
 * Compute the pool's sharing key for a resolved spec. The key is every field that changes what the controller produces or how the pool dials it - the source, the
 * segment length, the chunk size, the timestamps, the route, the upstream and the audio codec - so two subscribers share one underlying session only when they
 * asked for a byte-identical stream on the same route. `requestId` is a log label and `audioExpected` shapes only how a UBV stream waits for its audio, so each is
 * deliberately excluded.
 *
 * @param spec - The resolved spec.
 *
 * @returns The pool key.
 *
 * @category Transport
 */
export function livestreamKey(spec: ResolvedLivestreamSpec): string {

  return [ spec.cameraId, spec.channel, spec.lens, spec.segmentLength, spec.chunkSize, spec.timestamps, spec.route, spec.upstream, spec.audio ].join(":");
}

/**
 * One livestream WebSocket, decoded into a {@link Segment} stream, and on UBV a frame stream beside it. Constructed directly (construction begins connecting);
 * intended for {@link LivestreamPool} consumption via its `segment` / `frame` / `error` / `closed` rails, not direct consumer use. A proxied session asking for Opus
 * sends one play command on its socket, reading the socket's `send` when it must send, so a socket an injected factory built without one ends the session as a fault
 * on {@link ProtectConfigurationError}, with no line.
 *
 * @category Transport
 */
export class LivestreamSession implements AsyncDisposable {

  readonly #bus: EventBus<LivestreamSessionEvents>;
  readonly #clock: Clock;
  // One AbortController governs the watchdog loop, so a single abort() ends it, as EventStream's ends its own. The socket's listeners and the binding to the caller's
  // signal are not among what it governs: the session holds them and removes them itself in its teardown.
  readonly #controller = new AbortController();
  readonly #getAuthHeaders: (() => Record<string, string>) | undefined;
  readonly #log: ProtectLogging;
  readonly #resolveUrl: (params: URLSearchParams, opts: { signal?: AbortSignal }) => Promise<LivestreamAddresses>;
  readonly #spec: ResolvedLivestreamSpec & { route: LivestreamDialRoute };
  readonly #verifyTls: boolean;
  readonly #webSocketFactory: ((url: string) => ProtectWebSocket) | undefined;

  // The socket's handlers and the handler bound to the caller's signal, built once and held so the teardown removes each by the identity it was registered under, as
  // EventStream holds its own: on every Node before the fix for nodejs/node#63954 (all of 22, 24 before 24.22, 25, and 26 before 26.9) the `signal` registration
  // option can leave a listener attached after its abort.
  readonly #callerSignal: AbortSignal | undefined;
  readonly #onCallerAbort = (): void => this.#shutdown({ kind: "callerSignal", reason: "the livestream was aborted by the caller's signal" });
  readonly #socketListeners = {

    close: (event: ProtectWebSocketCloseEvent): void => this.#onClose({ code: event.code, kind: "peer", reason: event.reason }),
    error: (event: ProtectWebSocketErrorEvent): void => this.#onError(event),
    message: (event: ProtectWebSocketMessageEvent): void => this.#onMessage(event.data),
    open: (): void => this.#onOpen()
  };

  // The agent and the connector we own only when we built the default WebSocket, travelling as one value; null when a factory was injected. Mirrors EventStream: we
  // never destroy what we did not create.
  #owned: OwnedDispatcher | null = null;
  // The socket, built only after the URL is negotiated, so it is null through the connecting phase. close() guards on it being present.
  #ws: ProtectWebSocket | null = null;

  // The address the socket dials and when its connection attempt began, as the injected clock's monotonic reading, both set as the socket is built: a certificate
  // refusal names the address, and a connection attempt that times out measures its elapsed time from the stamp. The port it dials, set once the socket is
  // built, and whether the socket has opened, set by its open event and never cleared, are what the pool reads to say why a direct attempt failed.
  #address = "";
  #connectStartedAt = 0;
  #dialedPort: number | null = null;
  #opened = false;

  // The release of the connection the session owns, which the single teardown starts and close()/dispose await, null until the teardown runs, so it is also the gate
  // that runs the teardown once. lastSegmentAt is the watchdog's liveness source - the clock's monotonic reading at every frame.
  #released: Promise<void> | null = null;
  #lastSegmentAt = 0;
  #state: LivestreamState = "idle";

  // The typed cause of the session's closure, which the teardown writes once from the reason it ran for - the caller's abort, a failed endpoint negotiation, a socket
  // error, or the watchdog's stall - and null for a plain close and for a peer's close, whose frame is its whole account.
  #closeCause: ProtectError | null = null;

  // The cached init segment, held for the session lifetime and replayed to late joiners, which the intake hands over as bytes no socket message holds.
  #initSegment: LivestreamInit | null = null;

  // The one intake every socket message is handed to, picked by the stream's upstream, which the teardown releases so a closed session holds no reader's cut record
  // and no writer's held frames. And the play command a proxied session asking for Opus sends as its first binary message arrives, built once its negotiation
  // names the stream and released once sent, so it is sent at most once.
  #intake: LivestreamIntake | null;
  #play: Buffer | null = null;

  constructor(options: LivestreamSessionOptions) {

    this.#callerSignal = options.signal;
    this.#clock = options.clock ?? wallClock;
    this.#getAuthHeaders = options.getAuthHeaders;
    this.#log = options.log ?? noopLog;
    this.#bus = new EventBus<LivestreamSessionEvents>(this.#log);
    this.#resolveUrl = options.resolveUrl;
    this.#spec = resolveLivestreamSpec(options.spec);
    this.#verifyTls = options.verifyTls ?? false;
    this.#webSocketFactory = options.webSocket;

    // The one intake every socket message is handed to for the session's life, picked by the upstream, whose sink caches each init and emits each segment and frame
    // on its rail. A UBV stream's segment length and audio go to its writer, and Protect's own fMP4 is paced by the controller and reads neither. An upstream added
    // without an arm here leaves the intake unassigned, which fails to compile.
    const sink: LivestreamIntakeSink = { frame: (frame): void => void this.#bus.emit("frame", frame), init: (init): void => this.#onInit(init),
      media: (segment): void => this.#emitSegment(segment) };

    switch(this.#spec.upstream) {

      case "fmp4": {

        this.#intake = new Fmp4Intake({ log: this.#log, sink, timestamps: this.#spec.timestamps });

        break;
      }

      case "ubv": {

        this.#intake = new UbvIntake({ audio: this.#spec.audio, audioExpected: this.#spec.audioExpected, segmentLength: this.#spec.segmentLength, sink });

        break;
      }
    }

    // The caller's signal cancels the connect attempt and, once live, the session, and the teardown removes this binding as it removes the socket's handlers. An
    // already-aborted signal tears down immediately - the connect below sees the abort and bails before opening a socket.
    if(options.signal !== undefined) {

      if(options.signal.aborted) {

        this.#onCallerAbort();
      } else {

        options.signal.addEventListener("abort", this.#onCallerAbort, { once: true });
      }
    }

    // Begin connecting. Unlike EventStream (whose URL is immediate), we must negotiate the URL first, so the connect is an async task whose failures land on the error
    // rail. The connect is launched detached, so nothing it does throws into the constructor or blocks it.
    void this.#connect(options.signal);
  }

  /** The init segment cached once the session reaches `live`, used by the pool to replay to late joiners. Null before the first init segment arrives. */
  get initSegment(): LivestreamInit | null {

    return this.#initSegment;
  }

  /** The session's current lifecycle state, for diagnostics and tests. */
  get state(): LivestreamState {

    return this.#state;
  }

  /**
   * The typed cause of the session's closure: null while the session is open and for a plain close, otherwise the {@link ProtectError} an initiated teardown recorded.
   * This is the synchronous-closure surface - a session constructed with an already-aborted signal is closed before any listener can attach, so its cause is read here
   * rather than from the `closed` payload.
   */
  get closeCause(): ProtectError | null {

    return this.#closeCause;
  }

  /**
   * Whether the session has built its socket, which is where its connection attempt begins: false through the negotiation, and true once the negotiated address is
   * dialed, for the rest of the session's life. The socket is built at most once, after a negotiation that answered, since a session is single-use, so a session
   * that ended with this still false never reached its dial: its negotiation failed, it was handed no address it may dial, or it was closed first.
   */
  get dialed(): boolean {

    return this.#ws !== null;
  }

  /**
   * The port of the address the session dialed, the scheme's default when the address names none, and null until it dials. It stays null after the dial for an
   * address that does not parse, or that names no port under a scheme other than `ws:` and `wss:`, which only an injected `webSocket` factory is ever handed.
   */
  get dialedPort(): number | null {

    return this.#dialedPort;
  }

  /**
   * Whether the session's socket has opened: false until its `open` event, and true from then on for the rest of the session's life, so a session that ended with
   * this false never completed its WebSocket upgrade, and one that ended with it true completed it first.
   */
  get opened(): boolean {

    return this.#opened;
  }

  /**
   * Subscribe to a session event. Returns a `Disposable`; prefer `using sub = session.on(...)` so the listener detaches at scope exit.
   *
   * @param event   - The event to listen for.
   * @param handler - Invoked on each emission.
   *
   * @returns A `Disposable` that removes the listener when disposed.
   */
  on<K extends keyof LivestreamSessionEvents>(event: K, handler: (...args: LivestreamSessionEvents[K]) => void): Disposable {

    return this.#bus.on(event, handler);
  }

  /**
   * Wait for the next emission of a session event. A wait still pending when the session tears down, for any reason, rejects with a {@link ProtectAbortedError}, so a
   * wait that is never awaited needs a rejection handler; an abort of the signal rejects it with an `AbortError` whose `cause` is the signal's reason.
   *
   * @param event - The event to await.
   * @param opts  - Optional abort signal that cancels the wait.
   *
   * @returns A promise resolving to the event's argument tuple.
   */
  async once<K extends keyof LivestreamSessionEvents>(event: K, opts: { signal?: AbortSignal } = {}): Promise<LivestreamSessionEvents[K]> {

    return this.#bus.once(event, opts);
  }

  /**
   * Stream every subsequent emission of a session event until the signal aborts or the session tears down, for any reason. The teardown ends the iteration cleanly
   * once every emission made before it has been delivered; an abort rejects it with an `AbortError` whose `cause` is the signal's reason.
   *
   * @param event - The event to stream.
   * @param opts  - Stream options, including the abort signal.
   *
   * @returns An async iterable of the event's argument tuples.
   */
  stream<K extends keyof LivestreamSessionEvents>(event: K, opts: StreamOptions = {}): AsyncIterable<LivestreamSessionEvents[K]> {

    return this.#bus.stream(event, opts);
  }

  /**
   * Close the session: detach every listener, end the watchdog, request the WebSocket close, and release the connection the session owns. Safe to call more than
   * once, and awaitable.
   */
  async close(): Promise<void> {

    this.#shutdown({ kind: "close", reason: "the livestream was closed by the client" });

    await this.#released;
  }

  /**
   * Dispose the session. Delegates to {@link LivestreamSession.close} so `await using session = ...` tears the socket down cleanly.
   */
  async [Symbol.asyncDispose](): Promise<void> {

    await this.close();
  }

  // Negotiate the addresses and open the socket on the session's route. This is the connecting phase: a negotiation or network failure, or a direct session's
  // negotiation that offered no direct address, tears the session down as a fault, which reaches the error rail once the teardown has released the connection,
  // exactly as a socket failure later would, so the consumer sees one uniform failure path for the whole connect attempt. An abort tears the session down through the
  // same teardown but never emits on the error rail - it surfaces only as the `closeCause` and the `closed` payload's cause.
  async #connect(signal?: AbortSignal): Promise<void> {

    // An already-aborted caller signal tears us down in the constructor before this runs; bail without touching state so we never negotiate or build a socket.
    if(this.#released !== null) {

      return;
    }

    this.#state = "connecting";

    let addresses: LivestreamAddresses;

    try {

      // Only the caller's signal cancels the negotiation. A stop driven from inside the session (close()) lets the request finish and discards its result below; the
      // pool cancels a negotiation by passing its stream's lifetime signal as this session's signal.
      addresses = await this.#resolveUrl(this.#buildParams(), (signal !== undefined) ? { signal } : {});
    } catch(error) {

      // A teardown that already fired (caller abort during negotiation) has settled everything; do not also emit. We read the controller's abort state rather than
      // `#released` because it is a live getter the type system cannot narrow to a constant across the await - and it is set in lockstep with `#released` on teardown.
      if(!this.#controller.signal.aborted) {

        // Construct the typed negotiation failure once: the teardown puts this one object on the error rail and records it as the closure's cause.
        const failure = (error instanceof ProtectError) ? error :
          new ProtectNetworkError("The UniFi Protect livestream WebSocket endpoint could not be negotiated.", { cause: error });

        this.#shutdown({ error: failure, kind: "fault", line: null, reason: "the livestream endpoint negotiation failed" });
      }

      return;
    }

    // A concurrent close()/abort may have torn us down while we awaited negotiation. Bail before opening a socket we would immediately orphan.
    if(this.#controller.signal.aborted) {

      return;
    }

    /* The dial rule, one arm per route, each naming the URL, the certificate posture and the upgrade's headers. The proxied route dials the controller authority
     * under the UniFi OS proxy with the posture `verifyTls` sets, permissive by default for the controller's self-signed certificate, and the session's auth headers,
     * as EventStream's upgrade does, because UniFi OS's proxy refuses a media upgrade without the session even when the minted token is valid. The headers are read
     * as the socket is built, after the negotiation, so a relogin the negotiation triggered reaches the upgrade. The direct route dials the controller's media server,
     * where the minted alias in the path is the only credential: it never reads the auth hook, so the session's cookie and CSRF token never reach the media
     * server, and it never verifies the media server's certificate, which nothing installed on UniFi OS replaces. A direct session handed no direct address
     * has nothing it may dial, so it tears down as a fault and builds no socket. A proxied session asking for Opus names its stream in its play command by the
     * direct address's path less its leading slash, so one handed no direct address tears down the same way, and one handed an address builds its play command
     * here, where the alias is read and then held in the command alone. The headers are a function, so an injected factory, which takes the URL alone, never reads
     * the hook. A dial route added without an arm here leaves `dial` unassigned where the socket reads it, which fails to compile.
     */
    let dial: { headers: () => Record<string, string>; url: string; verifyTls: boolean };

    switch(this.#spec.route) {

      case "direct": {

        if(addresses.direct === null) {

          this.#refuseRoute();

          return;
        }

        dial = { headers: (): Record<string, string> => ({}), url: addresses.direct, verifyTls: false };

        break;
      }

      case "proxied": {

        // Opus is carried by UBV alone, so a stream asking for it is a UBV stream.
        if(this.#spec.audio === "opus") {

          const alias = (addresses.direct === null) ? undefined : URL.parse(addresses.direct)?.pathname.slice(1);

          if(alias === undefined) {

            this.#refuseRoute();

            return;
          }

          this.#play = this.#buildPlay(alias);
        }

        dial = { headers: (): Record<string, string> => this.#getAuthHeaders?.() ?? {}, url: addresses.proxied, verifyTls: this.#verifyTls };

        break;
      }
    }

    /* Build the socket: an injected factory in tests, handed the chosen URL alone, otherwise undici's WebSocket over an owned HTTP/1.1 agent that dials through an
     * owned connector carrying the route's certificate posture. HTTP/2 is off and pipelining disabled because a WebSocket upgrade can use neither, and `allowH2`
     * reaches the connector and the agent alike. undici's WebSocket structurally satisfies the minimal ProtectWebSocket surface, so it assigns directly. Building the
     * socket is where the connection attempt begins, so the address and the attempt's start are read immediately ahead of it. The address is the dialed host and
     * port alone, never the path or the query that carry the alias and the token, and it is parsed without a throw, because an injected factory may be handed a URL
     * undici would refuse, and this runs detached.
     */
    const target = URL.parse(dial.url);

    this.#address = target?.host ?? dial.url;
    this.#connectStartedAt = this.#clock.monotonic();

    if(this.#webSocketFactory !== undefined) {

      this.#ws = this.#webSocketFactory(dial.url);
    } else {

      const allowH2 = false;
      const connector = createOwnedConnector({ allowH2, verifyTls: dial.verifyTls });
      const agent = new Agent({ allowH2, connect: connector.connect, pipelining: 0 });

      this.#owned = { connector, dispatcher: agent };
      this.#ws = new WebSocket(dial.url, { dispatcher: agent, headers: dial.headers() });
    }

    // The port is read once the socket exists, so it is null for exactly as long as the session has not dialed. The URL parser reads a scheme's default port as no
    // port at all, so an address naming none dials its scheme's default.
    this.#dialedPort = (target === null) ? null : ((target.port === "") ? (WEBSOCKET_DEFAULT_PORTS[target.protocol] ?? null) : Number(target.port));
    this.#ws.binaryType = "arraybuffer";

    // The socket's handlers register with no `signal` option, since the teardown removes each itself. open, close, and error are `once` - each fires at most a single
    // time - while message stays live for the connection's lifetime.
    this.#ws.addEventListener("open", this.#socketListeners.open, { once: true });
    this.#ws.addEventListener("message", this.#socketListeners.message);
    this.#ws.addEventListener("close", this.#socketListeners.close, { once: true });
    this.#ws.addEventListener("error", this.#socketListeners.error, { once: true });
  }

  /* Build the controller request params from the resolved spec. This is the library's single source for the livestream wire protocol's request shape, one set
   * for each upstream.
   *
   * Protect's own fMP4: we always rebase timestamps to zero (so any opted-in decode timestamps stay within safe-integer range as `number`) and never use the wall
   * clock (so timestamps stay monotonic decode timestamps, which every fMP4 consumer downstream expects). `extendedVideoMetadata` is requested only when the consumer
   * asked for timestamps. `allowPartialGOP` and `progressive` are sent unconditionally as empty-value flags, since presence alone is what the controller reads:
   * `allowPartialGOP` asks it to emit a fragment every `fragmentDurationMillis` instead of waiting for a full GOP's keyframe boundary, and `progressive` asks it to
   * stream each fragment as it is produced instead of batching them - both match the segment-paced, frame-by-frame protocol the session's intake decodes as bytes
   * arrive.
   *
   * UBV: the camera, the channel, the lens, the chunk size and the request label alone, with `audiocodec` when the stream asks for Opus, which the direct route
   * honors and the proxy's bridge drops. Every fragmenting flag shapes Protect's own fMP4 and nothing of a record stream: the library writes the segments, at the
   * spec's segment length, and a UBV stream carries no decode timestamps to ask for. An upstream added without an arm here leaves the method without a return,
   * which fails to compile.
   */
  #buildParams(): URLSearchParams {

    switch(this.#spec.upstream) {

      case "fmp4": {

        return new URLSearchParams({

          allowPartialGOP: "",
          camera: this.#spec.cameraId,
          channel: this.#spec.channel.toString(),
          chunkSize: this.#spec.chunkSize.toString(),
          ...(this.#spec.timestamps ? { extendedVideoMetadata: "" } : {}),
          fragmentDurationMillis: this.#spec.segmentLength.toString(),
          lens: this.#spec.lens.toString(),
          progressive: "",
          rebaseTimestampsToZero: "true",
          requestId: this.#spec.requestId,
          type: "fmp4",
          useWallClock: "false"
        });
      }

      case "ubv": {

        return new URLSearchParams({

          ...((this.#spec.audio === "opus") ? { audiocodec: "opus" } : {}),
          camera: this.#spec.cameraId,
          channel: this.#spec.channel.toString(),
          chunkSize: this.#spec.chunkSize.toString(),
          lens: this.#spec.lens.toString(),
          requestId: this.#spec.requestId,
          type: "ubnt"
        });
      }
    }
  }

  // Build the play command a proxied session asking for Opus sends, the one message the library sends on a livestream socket: a 32-bit big-endian length, then the
  // JSON command asking the media server to play the stream the alias names with Opus audio. The proxy's bridge drops the audio codec from the request, which is why
  // the session asks again on its socket.
  #buildPlay(alias: string): Buffer {

    const command = Buffer.from(JSON.stringify({ cmd: "play", params: { audiocodec: "opus", name: alias } }));
    const play = Buffer.alloc(PLAY_LENGTH_BYTES + command.length);

    play.writeUInt32BE(command.length, 0);
    command.copy(play, PLAY_LENGTH_BYTES);

    return play;
  }

  // Tear down on a negotiation that offered no direct address to a session that needs one, a direct session that dials it or a proxied one asking for Opus that
  // names its stream by it. The session has nothing it may do, so it builds no socket.
  #refuseRoute(): void {

    this.#shutdown({ error: new ProtectLivestreamRouteError("The UniFi Protect controller offered no direct livestream address."), kind: "fault", line: null,
      reason: "the controller offered no direct livestream address" });
  }

  // The WebSocket opened. Record that it did, move to handshaking, seed the watchdog's liveness clock, and start the silence watchdog now (not at construction) so it
  // never trips during the bounded negotiation phase. The watchdog starts ahead of the debug line, so a logger that throws on the line leaves it running.
  #onOpen(): void {

    this.#opened = true;
    this.#state = "handshaking";
    this.#lastSegmentAt = this.#clock.monotonic();

    void this.#runWatchdog();

    this.#log.debug("Connected to the UniFi Protect livestream API.", { camera: this.#spec.cameraId, channel: this.#spec.channel });
  }

  /* A message arrived. Stamp liveness first (any byte proves the channel is alive), skip a message that is not part of the binary protocol, and hand the rest to the
   * intake, which decodes every complete frame it holds and carries a partial tail to the next message.
   *
   * A proxied session asking for Opus sends its play command as its first binary message arrives, ahead of that message's decode, and a send that fails ends the
   * session before the message is decoded. The intake's work runs in one `try`: its refusal ends the session as a fault with one warning, carried as the
   * teardown's line so a refusal after the session has closed logs nothing, and a throw that is not a ProtectError is wrapped as a ProtectProtocolError carrying it.
   */
  #onMessage(data: unknown): void {

    this.#lastSegmentAt = this.#clock.monotonic();

    const buffer = toBuffer(data);

    if(buffer === null) {

      this.#log.debug("Skipping an unsupported livestream message frame.", { type: typeof data });

      return;
    }

    if((this.#play !== null) && !this.#sendPlay(this.#play)) {

      return;
    }

    try {

      this.#intake?.push(buffer);
    } catch(error) {

      const failure = (error instanceof ProtectError) ? error : new ProtectProtocolError(UNREADABLE_MEDIA, { cause: error });

      this.#shutdown({ error: failure, kind: "fault", line: { context: { error: failure }, level: "warn", message: UNREADABLE_MEDIA },
        reason: "the livestream sent media the library could not read" });
    }
  }

  /* Send the play command, once: it is released before it is sent, so no later message sends it again. The socket is typed by its receiving surface, so its `send`
   * is read here, when the session must send, and called as the socket's own method, which undici's WebSocket requires of it. A socket with no `send`, one an
   * injected factory built, ends the session as a fault on ProtectConfigurationError with no line, since every attempt would meet the same socket, and a send that
   * throws is a failure of the socket, classified as any other is. Either answers false, and the caller decodes nothing more.
   */
  #sendPlay(play: Buffer): boolean {

    const socket: (ProtectWebSocket & { send?: (data: Uint8Array) => void }) | null = this.#ws;

    this.#play = null;

    if(typeof socket?.send !== "function") {

      this.#shutdown({ error: new ProtectConfigurationError("The UniFi Protect livestream socket has no send method, which a proxied stream asking for Opus needs to " +
        "ask for its codec."), kind: "fault", line: null, reason: "the livestream socket cannot send" });

      return false;
    }

    try {

      socket.send(play);
    } catch(error) {

      this.#shutdown(this.#socketFault(error, "the livestream play command could not be sent"));

      return false;
    }

    return true;
  }

  // The intake handed over an initialization segment: cache it and emit it. The first init segment is what advances the session to `live`.
  #onInit(init: LivestreamInit): void {

    this.#initSegment = init;

    if(this.#state === "handshaking") {

      this.#state = "live";
    }

    this.#emitSegment({ ...init, type: "init" });
  }

  // Emit a decoded segment on the rail. A separate method so both segment kinds flow through one publish point.
  #emitSegment(segment: Segment): void {

    this.#bus.emit("segment", segment);
  }

  /* The socket reported an error. The cause is read once, from the connector ahead of the event, as EventStream reads it: a failed upgrade reports a content-free
   * `TypeError` on this event while the connector still holds the dial's own error, and a reset of the established connection reports the same `TypeError` while
   * the connector holds the reset the socket raised. That one cause is the typed failure's cause and the line's subject. The line belongs to a socket whose `open`
   * event has fired, in `handshaking` as in `live`, at the level the connection-fault table answers; a failure before then reaches the pool on the rail and in the
   * closure's cause alone. Either way the classified failure is the fault the teardown runs for, which puts it on the error rail and records it as the closure's
   * cause once the connection is released, and only then logs its line.
   */
  #onError(event: { error?: unknown; message?: string }): void {

    const connector = this.#owned?.connector;

    this.#shutdown(this.#socketFault(connector?.lastDialFailure ?? connector?.lastConnectionFailure ?? event.error, "the livestream connection errored"));
  }

  // Classify a failure of the socket into the fault its teardown runs for, by the rule every socket reads, under the session's own sentences: a socket error and a
  // play command the socket failed to send are classified alike.
  #socketFault(cause: unknown, reason: string): Extract<SocketTeardown, { kind: "fault" }> {

    return socketFault({ cause, elapsed: millisecondsSince(this.#connectStartedAt, { clock: this.#clock }), failed: "The UniFi Protect livestream API connection failed.",
      host: this.#address, open: this.#opened, reason, reported: "The UniFi Protect livestream API reported an error.",
      timedOut: "The UniFi Protect livestream API connection timed out." });
  }

  /* The single teardown, run once whether the socket's close event, an error, the watchdog, the caller's signal or an explicit close starts it, with the reason it
   * ran. The removal of the listeners and the abort stay here as well as in #shutdown because the peer's own close listener reaches this teardown without passing
   * through it.
   *
   * The release starts directly after the abort, as EventStream starts it, ahead of every report, so everything the teardown then announces finds the connection
   * already severed: releaseOwned severs it in one synchronous stack, before it returns, so a listener that reopens on the close never overlaps the connection this
   * teardown lets go, and nothing that throws past this point, a logger included, can leave it held. releaseOwned destroys the agent and then releases the connector,
   * in the order and for the reasons it states; the connector's release is what severs a socket a completed upgrade handed to the WebSocket machinery, or one still
   * in its handshake.
   *
   * The reports then run in one order: the closure's cause recorded, a fault put on the error rail whether or not the socket had opened (the pool acts on a stall
   * alone, which only an open socket raises), the line a fault carries, the close line and `closed`. A peer's close puts nothing on the rail, so the pool recovers
   * from `closed` alone. The session never reconnects, so `closed` is its last emission, and the bus closes after it, carrying the closure's cause, if any, as the
   * cause of its reason.
   */
  #onClose(teardown: SocketTeardown): void {

    if(this.#released !== null) {

      return;
    }

    const code = teardownCode(teardown);
    const { reason } = teardown;

    this.#state = "closed";
    this.#detachListeners();
    this.#controller.abort();
    this.#released = (this.#owned === null) ? Promise.resolve() : releaseOwned(this.#owned);

    // The intake and a play command never sent are released with the socket, so a closed session holds no reader's cut record, no writer's held frames and no alias.
    this.#intake = null;
    this.#play = null;
    this.#closeCause = this.#closeCauseOf(teardown);

    if(teardown.kind === "fault") {

      this.#bus.emit("error", teardown.error);

      if(teardown.line !== null) {

        this.#log[teardown.line.level](teardown.line.message, teardown.line.context);
      }
    }

    this.#log.debug("The UniFi Protect livestream API connection closed.", { code, reason });
    this.#bus.emit("closed", { ...((this.#closeCause !== null) && { cause: this.#closeCause }), code, reason });
    this.#bus.close(new ProtectAbortedError("The UniFi Protect livestream session closed.", { ...((this.#closeCause !== null) && { cause: this.#closeCause }) }));
  }

  // What the closure records as its cause: the typed abort for the caller's cancel, the fault's own error, and nothing for an explicit close or a peer's close.
  #closeCauseOf(teardown: SocketTeardown): ProtectError | null {

    switch(teardown.kind) {

      case "callerSignal":

        return new ProtectAbortedError("The UniFi Protect livestream was aborted by the caller's signal.");

      case "close":
      case "peer":

        return null;

      case "fault":

        return teardown.error;

      default:

        // Exhaustiveness guard. A new reason joining the union without a case above stops `teardown` being `never` here, and this fails to compile.
        return assertNever(teardown);
    }
  }

  // Request a graceful WebSocket close, then run teardown with the reason it was asked for. Calling close() on the socket is best-effort - releasing the owned
  // connection (in #onClose) is what guarantees it is let go even if the close frame never completes, and a teardown before the socket was ever built (negotiation
  // abort) has nothing to release. The teardown runs once, so the first reason to reach it is the one the closure records, and a later trigger never overwrites it.
  // A call after the teardown has run still asks any socket the session built to close, which does nothing on a socket already closing or closed.
  #shutdown(teardown: SocketTeardown): void {

    if(this.#released === null) {

      this.#state = "closing";
    }

    // The socket's listeners come off before it is asked to close, the session taking them off itself as EventStream does: closing a socket that is still connecting
    // makes undici fire `error` and `close` synchronously inside close(), which an attached listener would report as a socket failure or a peer's close for a
    // teardown this session asked for. The abort that follows ends the watchdog.
    this.#detachListeners();
    this.#controller.abort();

    try {

      this.#ws?.close();
    } catch {

      // A socket that never opened (or a fake that rejects a premature close) must not block teardown; #onClose below releases everything regardless.
    }

    this.#onClose(teardown);
  }

  // Take the socket's listeners and the caller-signal binding off by the identity each was registered under. A teardown before negotiation built the socket has none
  // of the socket's to remove, and removing one a `once` dispatch already took off is quiet.
  #detachListeners(): void {

    this.#ws?.removeEventListener("close", this.#socketListeners.close);
    this.#ws?.removeEventListener("error", this.#socketListeners.error);
    this.#ws?.removeEventListener("message", this.#socketListeners.message);
    this.#ws?.removeEventListener("open", this.#socketListeners.open);
    this.#callerSignal?.removeEventListener("abort", this.#onCallerAbort);
  }

  // The silence watchdog, identical in shape to EventStream's. Each pass waits one heartbeat window on the injected clock, then checks how long the channel has been
  // quiet; once that crosses the threshold the channel is presumed dead-but-not-closed, so a typed stall (the consumer's cue to restart) travels into the teardown as
  // its fault, carrying a warning line, since the pool's recovery heals it, and the teardown reports the stall and logs its line once the connection is released.
  // The watchdog starts at `open`, so a stall always ends an open socket. The loop ends when teardown aborts the controller, which rejects the pending delay with its
  // abort error - swallowed here as the normal shutdown path, as is a throw from a logger refusing the stall's line, which reaches the loop only after the release.
  async #runWatchdog(): Promise<void> {

    try {

      for(;;) {

        // eslint-disable-next-line no-await-in-loop
        await this.#clock.delay(PROTECT_LIVESTREAM_HEARTBEAT_TIMEOUT, { signal: this.#controller.signal });

        const silentForMs = millisecondsSince(this.#lastSegmentAt, { clock: this.#clock });

        if(silentForMs >= PROTECT_LIVESTREAM_HEARTBEAT_TIMEOUT) {

          // Construct the stall once: the teardown puts this one object on the error rail and records it as the closure's cause.
          const stall = new ProtectStallError("The UniFi Protect livestream API produced no data within the heartbeat window.", { silentForMs });

          this.#shutdown({ error: stall, kind: "fault", line: { context: { silentForMs }, level: "warn",
            message: "The UniFi Protect livestream API went silent beyond the heartbeat window; tearing down the stalled session." },
          reason: "the livestream stalled past the heartbeat window" });

          return;
        }
      }
    } catch {

      // The delay rejects on abort when the session is torn down. That is the expected end of the loop, not an error.
    }
  }
}
