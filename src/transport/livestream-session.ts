/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * livestream-session.ts: One livestream WebSocket per (cameraId, channel, lens) - negotiate, decode the fMP4 frame protocol, and fan segments out through a three-rail
 * EventBus, with a silence watchdog. The structural sibling of EventStream.
 */

/**
 * `LivestreamSession` owns one camera livestream WebSocket and decodes the controller's fMP4 frame protocol into a stream of {@link Segment}s. It is the **structural
 * sibling of {@link EventStream}**: construct-begins-connecting, socket listeners its one teardown removes by identity, a {@link Clock}-driven silence watchdog a
 * single {@link AbortController} ends, an injected `webSocket` factory, a private {@link EventBus} for its surface, and `AsyncDisposable`. A reader who has
 * internalized `EventStream` reads this class and recognizes the same skeleton.
 *
 * The one thing the events stream does not need and this one does is **URL negotiation**. The events WebSocket connects to a fixed, predictable address; a livestream
 * URL is minted on demand by the controller over authenticated HTTP and must be fetched first. That fetch is the injected `resolveUrl` hook (dependency inversion,
 * exactly like the {@link Transport}'s `getAuthHeaders` and the {@link StateStore}'s `refresh`): the session owns the *whole* connect attempt - negotiate the URL, open
 * the socket, receive the first init segment - so every failure flows through one error rail, while the session never imports `Transport`. The composition root wires
 * `resolveUrl` to a transport-backed GET that returns the WebSocket URL on the controller authority.
 *
 * **The session is the single source of truth for the livestream wire protocol** - both the request params it builds from its {@link LivestreamSpec} and the binary
 * frame decode (a 1-byte frame type + 3-byte big-endian length per frame, reassembled across WebSocket messages, accumulated into a segment between `beginSegment` and
 * `endSegment`). `resolveUrl` is only the generic "negotiate a ws endpoint" step; everything livestream-specific lives here.
 *
 * **The watchdog detects here; the consumer's policy responds.** The session clock-stamps the arrival of every frame and runs a silence watchdog on the injected
 * `Clock`; a wake that finds the channel silent beyond {@link PROTECT_LIVESTREAM_HEARTBEAT_TIMEOUT} tears the socket down and emits `error({@link ProtectStallError})`
 * once the connection is released. The session does not reconnect: it is the pure, non-resilient escape hatch. Recovery is owned one layer up by the pool's
 * `ManagedSession` (a direct consumer of a bare session handles its own restart). `ProtectStallError` is shared verbatim with `EventStream`'s watchdog.
 *
 * @module LivestreamSession
 */
import { Agent, WebSocket } from "undici";
import { PROTECT_LIVESTREAM_CHUNK_SIZE, PROTECT_LIVESTREAM_HEARTBEAT_TIMEOUT, PROTECT_LIVESTREAM_SEGMENT_LENGTH } from "../settings.ts";
import { ProtectAbortedError, ProtectError, ProtectNetworkError, ProtectStallError, assertNever } from "../errors.ts";
import type { ProtectWebSocket, ProtectWebSocketCloseEvent, ProtectWebSocketErrorEvent, ProtectWebSocketMessageEvent, SocketTeardown } from "./ws.ts";
import { createOwnedConnector, releaseOwned } from "./connector.ts";
import { millisecondsSince, wallClock } from "../clock.ts";
import { socketFault, teardownCode, toBuffer } from "./ws.ts";
import type { Clock } from "../clock.ts";
import { EventBus } from "../event-bus.ts";
import type { LivestreamInit } from "../protocol/init-segment.ts";
import type { OwnedDispatcher } from "./connector.ts";
import type { ProtectLogging } from "../logging.ts";
import type { StreamOptions } from "../event-bus.ts";
import { describeInitSegment } from "../protocol/init-segment.ts";
import { noopLog } from "../logging.ts";

// The frame-type identifier byte that prefixes every UniFi Protect livestream WebSocket payload. The single byte tells us how to read the body that follows it. An
// erasable `as const` map gives the dot-access shape of a numeric enum without the non-erasable runtime emit; keys are alphabetized per the project convention, and the
// wire-protocol byte values speak for themselves at the call sites.
const LiveFrame = {

  audio: 253,
  beginSegment: 249,
  codecInformation: 248,
  endSegment: 255,
  initSegment: 250,
  mdat: 254,
  moof: 251,
  timestamp: 247,
  video: 252
} as const;

// The set of valid frame-type bytes, for O(1) validation on the decode hot path. `Object.values` over the `as const` map yields just the literal bytes - no enum
// reverse-mapping artifacts to filter.
const VALID_LIVE_FRAMES: ReadonlySet<number> = new Set(Object.values(LiveFrame));

// A reused zero-length buffer so the common "no partial frame carried over" case allocates nothing.
const EMPTY_BUFFER: Buffer = Buffer.alloc(0);

// The byte width of each decode timestamp on the wire: a 64-bit big-endian unsigned integer, mirroring the `tfdt` box's baseMediaDecodeTime.
const TIMESTAMP_BYTES = 8;

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
 * The description of a livestream a consumer asks for. The stream-affecting fields - the `source` selector (a quality channel or a secondary lens) plus `segmentLength`,
 * `chunkSize`, and `timestamps` - form the pool's sharing identity, so two subscribers share one underlying session only when these agree. `requestId` is a log label
 * only. Every field except `cameraId` has a default; an omitted `source` is the primary view (channel 0).
 *
 * @category Transport
 */
export interface LivestreamSpec {

  /** Optional maximum WebSocket payload size, in bytes. Larger means lower fragmentation, higher per-frame latency. Default `PROTECT_LIVESTREAM_CHUNK_SIZE` (4096). */
  chunkSize?: number;

  /** The camera device id to stream. */
  cameraId: string;

  /** Optional request label sent to the controller, surfaced in its logs. Default `${cameraId}-${channel}`. Not part of the pool's sharing identity. */
  requestId?: string;

  /** Optional fMP4 segment length, in milliseconds. Floored at `PROTECT_LIVESTREAM_SEGMENT_LENGTH` (100), which is also the default. */
  segmentLength?: number;

  /**
   * Which stream to capture. `{ type: "channel", channel }` selects a quality channel (0 is the highest); `{ type: "lens", lens }` selects a secondary lens on a
   * multi-lens device (e.g., a package camera), which the controller always addresses on channel 0. The selectors are mutually exclusive - modeling them as a
   * discriminated union makes the illegal "channel and lens together" request unrepresentable. Omit `source` for the primary view (channel 0, lens 0).
   */
  source?: LivestreamSource;

  /** Optionally request per-segment decode timestamps. When `true`, the negotiation asks the controller for extended metadata and each media segment carries them. */
  timestamps?: boolean;
}

/**
 * A {@link LivestreamSpec} with every default applied. The single resolved shape both the session (to build its request params) and the pool (to compute its sharing
 * key) read, so the defaulting logic lives in exactly one place ({@link resolveLivestreamSpec}).
 *
 * @category Transport
 */
export interface ResolvedLivestreamSpec {

  chunkSize: number;
  cameraId: string;
  channel: number;
  lens: number;
  requestId: string;
  segmentLength: number;
  timestamps: boolean;
}

/**
 * One segment of a livestream, in CMAF/DASH vocabulary: either the stream's initialization segment or a media segment. Each arm is a complete, decodable unit.
 *
 * - `init` carries the FTYP+MOOV initialization segment as one {@link LivestreamInit}: the controller's RFC 6381 codec label, the init bytes, and the stream's
 *   description read from them - everything a decoder needs before the media flows.
 * - `media` carries one complete fMP4 fragment. `moof` and `mdat` are **zero-copy `subarray` views** into `data` (no byte copy), for a consumer that wants the boxes
 *   at the lowest usable level; carrying a one-buffer-many-views model onto the single yielded item rather than re-emitting the same bytes on separate items.
 *   `timestamps` is present only when the consumer opted in via `LivestreamSpec`'s `timestamps` field; it is one decode timestamp per frame (faithful to the wire's
 *   array, not a lossy scalar), and stays within JavaScript's safe-integer range because the session always negotiates `rebaseTimestampsToZero`, which is what makes
 *   `number` exact here rather than `bigint`. `discontinuity` is present (and `true`) only on the first media segment delivered after a genuine reconnect, and absent
 *   otherwise.
 *   It marks a timeline discontinuity: because the session always negotiates `rebaseTimestampsToZero`, a reconnect restarts the `tfdt` baseMediaDecodeTime near zero - a
 *   backward jump relative to the prior segments - so a consumer maintaining a decode timeline (an FFmpeg pipe, an MSE-style source buffer) should treat a
 *   marked segment as a splice point: flush and resume at this clean keyframe. A consumer that does not maintain a cross-segment timeline ignores it. The session itself
 *   never sets it - a session has no concept of a reconnect; that is the pool's, which stamps the marker as it fans the first post-reconnect media segment.
 *
 * @category Transport
 */
export type Segment =
  | ({ type: "init" } & LivestreamInit) |
  { type: "media"; data: Buffer; moof: Buffer; mdat: Buffer; timestamps?: number[]; discontinuity?: true };

/**
 * The events {@link LivestreamSession} publishes on its three-rail surface.
 *
 * - `segment` is the decoded stream: one init or media {@link Segment} per controller fragment. The pool bridges this rail and fans each segment to every subscriber.
 * - `closed` fires once when the session tears down, carrying a code and reason that classify the teardown: the peer's own close code and reason for a close it
 *   started, otherwise 1000 for a teardown we chose (an explicit close or a caller abort) and 1006 for one forced by a failure (a failed negotiation, a socket error,
 *   or a watchdog stall). It also carries the optional typed {@link ProtectError} cause an initiated teardown recorded - a caller abort, a failed negotiation, a socket
 *   error, or the watchdog stall - omitted for a plain or spontaneous close.
 * - `error` carries a typed {@link ProtectError}: the watchdog always emits a {@link ProtectStallError}, and a negotiation or socket failure typically wraps as a
 *   {@link ProtectNetworkError} - a socket failure classified by the rule the request path reads, so a refused certificate is a {@link ProtectCertificateError} and
 *   a connection attempt that timed out a {@link ProtectTimeoutError} - but when the injected `resolveUrl` hook throws an already-typed {@link ProtectError}, that
 *   instance passes through onto this rail unwrapped, so a negotiation failure can also surface a {@link ProtectStallError} or another {@link ProtectError} subtype.
 *   The error *type* is what a subscriber acts on. A listener sees the session already closed, with this error recorded as its close cause, because the teardown
 *   records the closed state and the cause before it reports.
 *
 * @category Transport
 */
export interface LivestreamSessionEvents {

  closed: [info: { cause?: ProtectError; code: number; reason: string }];
  error: [err: ProtectError];
  segment: [segment: Segment];
}

/**
 * Construction options for {@link LivestreamSession}.
 *
 * - `spec` describes the stream; the session resolves its defaults and builds the negotiation params from it.
 * - `resolveUrl` is the negotiation hook: given the request params, it returns the WebSocket URL on the controller authority. The composition root wires it to a
 *   transport-backed GET; tests pass a one-line fake.
 * - `getAuthHeaders` is the cookie hook, wired to {@link AuthSession} at the composition root (the same dependency inversion the {@link Transport} uses). The session
 *   reads it when it builds its socket, after its negotiation, so a relogin the negotiation triggered reaches the upgrade; an injected `webSocket` factory receives
 *   the URL alone.
 * - `webSocket` is the injected I/O dependency, shared with {@link EventStream}'s; omit it for the default undici-backed factory, inject it in tests.
 * - `signal` cancels the connect attempt and, once live, the session - if it aborts at any point, the session tears down.
 * - `clock` is the watchdog's time source; it defaults to the wall clock, and tests inject a fake to drive the silence watchdog deterministically.
 * - `log` is the destination for the session's diagnostic output; it defaults to a no-op logger, so a caller that never provides one incurs no logging cost.
 * - `verifyTls` opts the owned connection into strict TLS certificate verification; it defaults to `false` for the controller's self-signed certificate. An injected
 *   `webSocket` factory builds no agent here, so the option is inert alongside one.
 *
 * @category Transport
 */
export interface LivestreamSessionOptions {

  clock?: Clock;
  getAuthHeaders?: () => Record<string, string>;
  log?: ProtectLogging;
  resolveUrl: (params: URLSearchParams, opts: { signal?: AbortSignal }) => Promise<string>;
  signal?: AbortSignal;
  spec: LivestreamSpec;
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

/**
 * Apply every {@link LivestreamSpec} default in one place, so the session and the pool agree on the resolved stream identity. The segment length is floored at
 * {@link PROTECT_LIVESTREAM_SEGMENT_LENGTH}: a shorter request would only add controller load for no downstream benefit.
 *
 * @param spec - The raw spec a consumer supplied.
 *
 * @returns The spec with all defaults applied.
 *
 * @category Transport
 */
export function resolveLivestreamSpec(spec: LivestreamSpec): ResolvedLivestreamSpec {

  // Resolve the source selector to its wire (channel, lens) pair first, so the resolved channel is available both as a field and for the requestId label default below.
  const { channel, lens } = resolveSource(spec.source);

  return {

    cameraId: spec.cameraId,
    channel: channel,
    chunkSize: spec.chunkSize ?? PROTECT_LIVESTREAM_CHUNK_SIZE,
    lens: lens,
    requestId: spec.requestId ?? (spec.cameraId + "-" + channel.toString()),
    segmentLength: Math.max(spec.segmentLength ?? PROTECT_LIVESTREAM_SEGMENT_LENGTH, PROTECT_LIVESTREAM_SEGMENT_LENGTH),
    timestamps: spec.timestamps ?? false
  };
}

/**
 * Compute the pool's sharing key for a resolved spec. The key is every **stream-affecting** field - the params that change the controller's output - so two subscribers
 * share one underlying session only when they asked for a byte-identical stream. `requestId` is a log label and is deliberately excluded.
 *
 * @param spec - The resolved spec.
 *
 * @returns The pool key.
 *
 * @category Transport
 */
export function livestreamKey(spec: ResolvedLivestreamSpec): string {

  return [ spec.cameraId, spec.channel, spec.lens, spec.segmentLength, spec.chunkSize, spec.timestamps ].join(":");
}

// The mutable accumulator for the segment under construction. Chunks are collected per box during a segment and assembled into a single buffer at `endSegment`, so the
// hot path makes one allocation per segment rather than one per chunk. The controller delivers boxes in moof, mdat, video, audio order, the order we concatenate.
interface SegmentAccumulator {

  audio: Buffer[];
  mdat: Buffer[];
  moof: Buffer[];
  video: Buffer[];
}

/**
 * One livestream WebSocket, decoded into a {@link Segment} stream. Constructed directly (construction begins connecting); intended for {@link LivestreamPool} consumption
 * via its `segment` / `error` / `closed` rails, not direct consumer use.
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
  readonly #resolveUrl: (params: URLSearchParams, opts: { signal?: AbortSignal }) => Promise<string>;
  readonly #spec: ResolvedLivestreamSpec;
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
  // refusal names the address, and a connection attempt that times out measures its elapsed time from the stamp.
  #address = "";
  #connectStartedAt = 0;

  // The release of the connection the session owns, which the single teardown starts and close()/dispose await, null until the teardown runs, so it is also the gate
  // that runs the teardown once. lastSegmentAt is the watchdog's liveness source - the clock's monotonic reading at every frame.
  #released: Promise<void> | null = null;
  #lastSegmentAt = 0;
  #state: LivestreamState = "idle";

  // The typed cause of the session's closure, which the teardown writes once from the reason it ran for - the caller's abort, a failed endpoint negotiation, a socket
  // error, or the watchdog's stall - and null for a plain close and for a peer's close, whose frame is its whole account.
  #closeCause: ProtectError | null = null;

  // The cached init segment (a detached copy, since it is held for the session lifetime and replayed to late joiners) and the codec string captured from the controller.
  #codec = "";
  #initSegment: LivestreamInit | null = null;

  // The segment under construction, the partial-frame tail carried between WebSocket messages, and the decode timestamps awaiting the next media segment.
  #current: SegmentAccumulator = { audio: [], mdat: [], moof: [], video: [] };
  #packetRemaining: Buffer = EMPTY_BUFFER;
  #pendingTimestamps: number[] | null = null;

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
    // rail. It is launched detached; the constructor never throws and never blocks.
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
   * Wait for the next emission of a session event.
   *
   * @param event - The event to await.
   * @param opts  - Optional abort signal.
   *
   * @returns A promise resolving to the event's argument tuple.
   */
  async once<K extends keyof LivestreamSessionEvents>(event: K, opts: { signal?: AbortSignal } = {}): Promise<LivestreamSessionEvents[K]> {

    return this.#bus.once(event, opts);
  }

  /**
   * Stream every subsequent emission of a session event until the signal aborts.
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

  // Negotiate the URL and open the socket. This is the connecting phase: a negotiation or network failure tears the session down as a fault, which reaches the error
  // rail once the teardown has released the connection, exactly as a socket failure later would, so the consumer sees one uniform failure path for the whole connect
  // attempt. An abort tears the session down through the same teardown but never emits on the error rail - it surfaces only as the `closeCause` and the `closed`
  // payload's cause.
  async #connect(signal?: AbortSignal): Promise<void> {

    // An already-aborted caller signal tears us down in the constructor before this runs; bail without touching state so we never negotiate or build a socket.
    if(this.#released !== null) {

      return;
    }

    this.#state = "connecting";

    let url: string;

    try {

      // Only the caller's signal cancels the negotiation. A stop driven from inside the session (close()) lets the request finish and discards its result below; the
      // pool cancels a negotiation by passing its stream's lifetime signal as this session's signal.
      url = await this.#resolveUrl(this.#buildParams(), (signal !== undefined) ? { signal } : {});
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

    /* Build the socket: an injected factory in tests, otherwise undici's WebSocket over an owned HTTP/1.1 agent that dials through an owned connector, its
     * certificate posture following `verifyTls`, which is permissive by default for the controller's self-signed certificate. HTTP/2 is off and pipelining disabled
     * because a WebSocket upgrade can use neither, and `allowH2` reaches the connector and the agent alike. The upgrade carries the session's auth headers, as
     * EventStream's does, because UniFi OS's proxy refuses a media upgrade without the session even when the minted token is valid; they are read here, after the
     * negotiation, so a relogin the negotiation triggered reaches the upgrade. undici's WebSocket structurally satisfies the minimal ProtectWebSocket surface, so it
     * assigns directly. Building the socket is where the connection attempt begins, so the address and the attempt's start are read immediately ahead of it. The
     * address is parsed without a throw, because an injected factory may be handed a URL undici would refuse, and this runs detached.
     */
    this.#address = URL.parse(url)?.host ?? url;
    this.#connectStartedAt = this.#clock.monotonic();

    if(this.#webSocketFactory !== undefined) {

      this.#ws = this.#webSocketFactory(url);
    } else {

      const allowH2 = false;
      const connector = createOwnedConnector({ allowH2, verifyTls: this.#verifyTls });
      const agent = new Agent({ allowH2, connect: connector.connect, pipelining: 0 });

      this.#owned = { connector, dispatcher: agent };
      this.#ws = new WebSocket(url, { dispatcher: agent, headers: this.#getAuthHeaders?.() ?? {} });
    }

    this.#ws.binaryType = "arraybuffer";

    // The socket's handlers register with no `signal` option, since the teardown removes each itself. open, close, and error are `once` - each fires at most a single
    // time - while message stays live for the connection's lifetime.
    this.#ws.addEventListener("open", this.#socketListeners.open, { once: true });
    this.#ws.addEventListener("message", this.#socketListeners.message);
    this.#ws.addEventListener("close", this.#socketListeners.close, { once: true });
    this.#ws.addEventListener("error", this.#socketListeners.error, { once: true });
  }

  // Build the controller request params from the resolved spec. This is the library's single source for the livestream wire protocol's request shape. We always rebase
  // timestamps to zero (so any opted-in decode timestamps stay within safe-integer range as `number`) and never use the wall clock (so timestamps stay monotonic decode
  // timestamps, which every fMP4 consumer downstream expects). `extendedVideoMetadata` is requested only when the consumer asked for timestamps. `allowPartialGOP` and
  // `progressive` are sent unconditionally as empty-value flags, since presence alone is what the controller reads: `allowPartialGOP` asks it to emit a fragment every
  // `fragmentDurationMillis` instead of waiting for a full GOP's keyframe boundary, and `progressive` asks it to stream each fragment as it is produced instead of
  // batching them - both match the segment-paced, frame-by-frame protocol this session decodes as bytes arrive.
  #buildParams(): URLSearchParams {

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

  // The WebSocket opened. Move to handshaking, seed the watchdog's liveness clock, and start the silence watchdog now (not at construction) so it never trips during the
  // bounded negotiation phase. The watchdog starts ahead of the debug line, so a logger that throws on the line leaves it running.
  #onOpen(): void {

    this.#state = "handshaking";
    this.#lastSegmentAt = this.#clock.monotonic();

    void this.#runWatchdog();

    this.#log.debug("Connected to the UniFi Protect livestream API.", { camera: this.#spec.cameraId, channel: this.#spec.channel });
  }

  // A frame batch arrived. Stamp liveness first (any byte proves the channel is alive), then decode every complete frame the buffer holds, carrying a partial tail to the
  // next message. The wire layout per frame is a 1-byte type, a 3-byte big-endian length, then that many payload bytes.
  #onMessage(data: unknown): void {

    this.#lastSegmentAt = this.#clock.monotonic();

    const buffer = toBuffer(data);

    if(buffer === null) {

      this.#log.debug("Skipping an unsupported livestream message frame.", { type: typeof data });

      return;
    }

    // Prepend any leftover partial frame from the previous message so a frame split across two messages is reassembled before we decode it.
    let packet = buffer;

    if(this.#packetRemaining.length > 0) {

      packet = Buffer.concat([ this.#packetRemaining, packet ]);
      this.#packetRemaining = EMPTY_BUFFER;
    }

    let offset = 0;

    for(;;) {

      // Fewer than 4 bytes left is an incomplete header; save the tail to prepend to the next message.
      if((packet.length - offset) < 4) {

        this.#packetRemaining = packet.subarray(offset);

        break;
      }

      const frameType = packet.readUInt8(offset);

      // An unrecognized frame type means we have lost frame sync within this packet; we cannot resync mid-buffer, so we abandon the remainder and start fresh on the
      // next message. Genuine corruption is rare and the watchdog covers a wedged stream.
      if(!VALID_LIVE_FRAMES.has(frameType)) {

        this.#log.debug("Discarding a livestream packet after an invalid frame header.", { frameType });

        break;
      }

      // Protect encodes the length of the frame payload in the three bytes after the type, as a big-endian 24-bit unsigned integer.
      const length = packet.readUIntBE(offset + 1, 3);

      // If the full payload is not yet in hand, save the frame (header included) to prepend to the next message.
      if(packet.length < (offset + 4 + length)) {

        this.#packetRemaining = packet.subarray(offset);

        break;
      }

      const dataStart = offset + 4;
      const dataEnd = dataStart + length;

      this.#handleFrame(frameType, packet.subarray(dataStart, dataEnd));

      offset = dataEnd;
    }
  }

  // Dispatch one decoded frame. Media boxes accumulate into the current segment; control frames reset the accumulator, capture the codec or timestamps, or emit a
  // completed segment.
  #handleFrame(frameType: number, data: Buffer): void {

    switch(frameType) {

      case LiveFrame.audio:

        this.#current.audio.push(data);

        break;

      case LiveFrame.beginSegment:

        // Reset with fresh arrays so any leftovers from a prior segment cannot leak in if frames arrive out of the expected order.
        this.#current = { audio: [], mdat: [], moof: [], video: [] };

        break;

      case LiveFrame.codecInformation:

        this.#codec = data.toString();
        this.#log.debug("Livestream codec information received.", { codec: this.#codec });

        break;

      case LiveFrame.endSegment:

        this.#emitMediaSegment();

        break;

      case LiveFrame.initSegment:

        this.#emitInitSegment(data);

        break;

      case LiveFrame.mdat:

        this.#current.mdat.push(data);

        break;

      case LiveFrame.moof:

        this.#current.moof.push(data);

        break;

      case LiveFrame.timestamp:

        // Capture decode timestamps only when the consumer opted in; otherwise the controller would not be sending them and we ignore any that appear. Each is a 64-bit
        // big-endian value, read as a BigInt and narrowed to a number - safe because we always negotiate rebaseTimestampsToZero, keeping the values near zero.
        if(this.#spec.timestamps) {

          this.#pendingTimestamps = Array.from({ length: Math.floor(data.length / TIMESTAMP_BYTES) },
            (_value, index) => Number(data.readBigUInt64BE(index * TIMESTAMP_BYTES)));
        }

        break;

      case LiveFrame.video:

        this.#current.video.push(data);

        break;
    }
  }

  // Cache and emit the initialization segment. We take a detached copy because the cache is held for the session's lifetime and replayed to late joiners; holding the
  // zero-copy view would keep the whole originating message buffer alive. The description is read here, once per init frame, so the cache and every segment built
  // from it share one description and nothing on the media path ever parses. The first init segment is what advances the session to `live`.
  #emitInitSegment(raw: Buffer): void {

    const data = Buffer.from(raw);
    const description = describeInitSegment(data);
    const init: LivestreamInit = { codec: this.#codec, data, description };

    this.#initSegment = init;

    if(this.#state === "handshaking") {

      this.#state = "live";
    }

    this.#emitSegment({ ...init, type: "init" });
  }

  // Assemble the accumulated boxes into one media segment and emit it. We sum the box lengths, allocate once, and copy each chunk into place; `moof` and `mdat` are then
  // zero-copy views into that single buffer. `alloc` (not `allocUnsafe`) means a length miscount surfaces as zero padding rather than leaked memory, at negligible cost.
  #emitMediaSegment(): void {

    const moofLength = this.#sumChunks(this.#current.moof);
    const mdatLength = this.#sumChunks(this.#current.mdat);
    const total = moofLength + mdatLength + this.#sumChunks(this.#current.video) + this.#sumChunks(this.#current.audio);
    const data = Buffer.alloc(total);

    let position = 0;

    for(const chunks of [ this.#current.moof, this.#current.mdat, this.#current.video, this.#current.audio ]) {

      for(const chunk of chunks) {

        data.set(chunk, position);
        position += chunk.length;
      }
    }

    const moof = data.subarray(0, moofLength);
    const mdat = data.subarray(moofLength, moofLength + mdatLength);
    const timestamps = this.#pendingTimestamps;

    this.#pendingTimestamps = null;
    this.#emitSegment((timestamps !== null) ? { data, mdat, moof, timestamps, type: "media" } : { data, mdat, moof, type: "media" });
  }

  // Emit a decoded segment on the rail. A separate method so both segment kinds flow through one publish point.
  #emitSegment(segment: Segment): void {

    this.#bus.emit("segment", segment);
  }

  #sumChunks(chunks: readonly Buffer[]): number {

    let total = 0;

    for(const chunk of chunks) {

      total += chunk.length;
    }

    return total;
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
    const cause = connector?.lastDialFailure ?? connector?.lastConnectionFailure ?? event.error;

    this.#shutdown(socketFault({ cause, elapsed: millisecondsSince(this.#connectStartedAt, { clock: this.#clock }),
      failed: "The UniFi Protect livestream API connection failed.", host: this.#address, open: (this.#state === "handshaking") || (this.#state === "live"),
      reason: "the livestream connection errored", reported: "The UniFi Protect livestream API reported an error.",
      timedOut: "The UniFi Protect livestream API connection timed out." }));
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
   * from `closed` alone.
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
    this.#closeCause = this.#closeCauseOf(teardown);

    if(teardown.kind === "fault") {

      this.#bus.emit("error", teardown.error);

      if(teardown.line !== null) {

        this.#log[teardown.line.level](teardown.line.message, teardown.line.context);
      }
    }

    this.#log.debug("The UniFi Protect livestream API connection closed.", { code, reason });
    this.#bus.emit("closed", { ...((this.#closeCause !== null) && { cause: this.#closeCause }), code, reason });
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
