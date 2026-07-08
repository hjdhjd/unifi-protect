/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * livestream-session.ts: One livestream WebSocket per (cameraId, channel, lens) - negotiate, decode the fMP4 frame protocol, and fan segments out through a three-rail
 * EventBus, with a silence watchdog. The structural sibling of EventStream.
 */

/**
 * `LivestreamSession` owns one camera livestream WebSocket and decodes the controller's fMP4 frame protocol into a stream of {@link Segment}s. It is the **structural
 * sibling of {@link EventStream}**: construct-begins-connecting, a single {@link AbortController} that detaches every listener at once, a {@link Clock}-driven silence
 * watchdog, an injected `webSocket` factory seam, a private {@link EventBus} for its surface, and `AsyncDisposable`. A reader who has internalized `EventStream` reads
 * this class and recognizes the same skeleton.
 *
 * The one thing the events stream does not need and this one does is **URL negotiation**. The events WebSocket connects to a fixed, predictable address; a livestream
 * URL is minted on demand by the controller over authenticated HTTP and must be fetched first. That fetch is the injected `resolveUrl` seam (dependency inversion,
 * exactly like the {@link Transport}'s `getAuthHeaders` and the {@link StateStore}'s `refresh`): the session owns the *whole* connect attempt - negotiate the URL, open
 * the socket, receive the first init segment - so every failure flows through one error rail, while the session never imports `Transport`. The composition root wires
 * `resolveUrl` to a transport-backed GET that returns the controller-minted, host-rewritten URL.
 *
 * **The session is the single source of truth for the livestream wire protocol** - both the request params it builds from its {@link LivestreamSpec} and the binary
 * frame decode (a 1-byte frame type + 3-byte big-endian length per frame, reassembled across WebSocket messages, accumulated into a segment between `beginSegment` and
 * `endSegment`). `resolveUrl` is only the generic "negotiate a ws endpoint" step; everything livestream-specific lives here.
 *
 * **The watchdog detects here; the consumer's policy responds.** The session clock-stamps the arrival of every frame and runs a silence watchdog on the injected
 * `Clock`; a tick that finds the channel silent beyond {@link PROTECT_LIVESTREAM_HEARTBEAT_TIMEOUT} emits `error({@link ProtectStallError})` and tears the socket down.
 * The session does not reconnect: it is the pure, non-resilient escape hatch. Recovery is owned one layer up by the pool's `ManagedSession` (a direct consumer of a bare
 * session handles its own restart). `ProtectStallError` is shared verbatim with `EventStream`'s watchdog.
 *
 * @module LivestreamSession
 */
import { Agent, WebSocket } from "undici";
import { PROTECT_LIVESTREAM_CHUNK_SIZE, PROTECT_LIVESTREAM_HEARTBEAT_TIMEOUT, PROTECT_LIVESTREAM_SEGMENT_LENGTH } from "../settings.ts";
import { ProtectError, ProtectNetworkError, ProtectStallError, assertNever } from "../errors.ts";
import type { Clock } from "../clock.ts";
import { EventBus } from "../event-bus.ts";
import type { ProtectLogging } from "../logging.ts";
import type { ProtectWebSocket } from "./ws.ts";
import type { StreamOptions } from "../event-bus.ts";
import { isExpectedWsDisconnect } from "../errors.ts";
import { noopLog } from "../logging.ts";
import { toBuffer } from "./ws.ts";
import { wallClock } from "../clock.ts";

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
 * `connecting -> handshaking` (WebSocket `open`), `handshaking -> live` (first init segment received and cached), `any -> closing` (error, abort, watchdog, or external
 * close), `closing -> closed` (socket fully closed, owned agent destroyed, resources released).
 *
 * @category Transport
 */
export type LivestreamState = "idle" | "connecting" | "handshaking" | "live" | "closing" | "closed";

/**
 * The mutually-exclusive livestream source selector. A livestream is captured EITHER from a quality channel on the primary sensor OR from a secondary lens (which the
 * controller always addresses on channel 0); the two can never be combined. Tag-discriminated (matching {@link Segment}) so the discriminant is authoritative regardless
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
   * multi-lens device (e.g., a package camera), which the controller always addresses on channel 0. The two selectors are mutually exclusive - modeling them as a
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
 * - `init` carries the FTYP+MOOV initialization segment and its RFC 6381 codec descriptor - everything a decoder needs before the media flows.
 * - `media` carries one complete fMP4 fragment. `moof` and `mdat` are **zero-copy `subarray` views** into `data` (no byte copy), for a consumer that wants the boxes
 *   at the lowest usable level; carrying a one-buffer-many-views model onto the single yielded item rather than re-emitting the same bytes on separate items.
 *   `timestamps` is present only when the consumer opted in via the `timestamps` stream option; it is one decode timestamp per frame (faithful to the wire's array,
 *   not a lossy scalar), and stays within JavaScript's safe-integer range because the session always negotiates `rebaseTimestampsToZero`, which is what makes `number`
 *   exact here rather than `bigint`. `discontinuity` is present (and `true`) only on the first media segment delivered after a genuine reconnect, and absent otherwise.
 *   It marks a timeline discontinuity: because the session always negotiates `rebaseTimestampsToZero`, a reconnect restarts the `tfdt` baseMediaDecodeTime near zero - a
 *   backward jump relative to the prior segments - so a consumer maintaining a decode timeline (an FFmpeg pipe, an MSE-style source buffer) should treat a
 *   marked segment as a splice point: flush and resume at this clean keyframe. A consumer that does not maintain a cross-segment timeline ignores it. The session itself
 *   never sets it - a session has no concept of a reconnect; that is the pool's, which stamps the marker as it fans the first post-reconnect media segment.
 *
 * @category Transport
 */
export type Segment =
  | { type: "init"; data: Buffer; codec: string } |
  { type: "media"; data: Buffer; moof: Buffer; mdat: Buffer; timestamps?: number[]; discontinuity?: true };

/**
 * The events {@link LivestreamSession} publishes on its three-rail surface.
 *
 * - `segment` is the decoded stream: one init or media {@link Segment} per controller fragment. The pool bridges this rail and fans each segment to every subscriber.
 * - `closed` fires once when the WebSocket closes (naturally, on error, or on a watchdog stall), carrying the close frame's code and reason.
 * - `error` carries a typed {@link ProtectError} - a {@link ProtectStallError} from the watchdog, or a {@link ProtectNetworkError} from a negotiation or socket failure.
 *   The error *type* is the discriminant a subscriber acts on.
 *
 * @category Transport
 */
export interface LivestreamSessionEvents {

  closed: [info: { code: number; reason: string }];
  error: [err: ProtectError];
  segment: [segment: Segment];
}

/**
 * Construction options for {@link LivestreamSession}.
 *
 * - `spec` describes the stream; the session resolves its defaults and builds the negotiation params from it.
 * - `resolveUrl` is the negotiation seam: given the request params, it returns the controller-minted, host-rewritten WebSocket URL. The composition root wires it to a
 *   transport-backed GET; tests pass a one-line fake.
 * - `webSocket` is the injected I/O seam, shared with {@link EventStream}'s; omit it for the default undici-backed factory, inject it in tests.
 * - `signal` cancels the connect attempt - if it aborts before or during connection, the session tears down.
 *
 * @category Transport
 */
export interface LivestreamSessionOptions {

  clock?: Clock;
  log?: ProtectLogging;
  resolveUrl: (params: URLSearchParams, opts: { signal?: AbortSignal }) => Promise<string>;
  signal?: AbortSignal;
  spec: LivestreamSpec;
  webSocket?: (url: string) => ProtectWebSocket;
}

// Resolve the source selector to the controller's (channel, lens) wire pair. This is the single place the protocol constraint lives: a secondary lens is always addressed
// on channel 0, and a quality-channel selection carries no lens, so each selector pins the other coordinate to 0; an omitted source is the primary view. Because the
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

  readonly #bus = new EventBus<LivestreamSessionEvents>();
  readonly #clock: Clock;
  // One AbortController governs every WebSocket listener and the watchdog loop. A single abort() detaches them all at once - the teardown primitive EventStream uses.
  readonly #controller = new AbortController();
  readonly #log: ProtectLogging;
  readonly #resolveUrl: (params: URLSearchParams, opts: { signal?: AbortSignal }) => Promise<string>;
  readonly #spec: ResolvedLivestreamSpec;
  readonly #webSocketFactory: ((url: string) => ProtectWebSocket) | undefined;

  // The agent we own only when we built the default WebSocket; null when a factory was injected. Mirrors EventStream: we never destroy what we did not create.
  #ownedAgent: Agent | null = null;
  // The socket, built only after the URL is negotiated, so it is null through the connecting phase. close() guards on it being present.
  #ws: ProtectWebSocket | null = null;

  // The single teardown gate and the agent-destruction promise close()/dispose await. lastSegmentAt is the watchdog's liveness source - clock-stamped on every frame.
  #closePromise: Promise<void> | null = null;
  #closed = false;
  #lastSegmentAt = 0;
  #state: LivestreamState = "idle";

  // The cached init segment (a detached copy, since it is held for the session lifetime and replayed to late joiners) and the codec string captured from the controller.
  #codec = "";
  #initSegment: { codec: string; data: Buffer } | null = null;

  // The segment under construction, the partial-frame tail carried between WebSocket messages, and the decode timestamps awaiting the next media segment.
  #current: SegmentAccumulator = { audio: [], mdat: [], moof: [], video: [] };
  #packetRemaining: Buffer = EMPTY_BUFFER;
  #pendingTimestamps: number[] | null = null;

  constructor(options: LivestreamSessionOptions) {

    this.#clock = options.clock ?? wallClock;
    this.#log = options.log ?? noopLog;
    this.#resolveUrl = options.resolveUrl;
    this.#spec = resolveLivestreamSpec(options.spec);
    this.#webSocketFactory = options.webSocket;

    // The caller's signal cancels the connect attempt. Bound to our own signal too, so it detaches with everything else once we tear down. An already-aborted signal
    // tears down immediately - the connect below sees the abort and bails before opening a socket.
    if(options.signal !== undefined) {

      if(options.signal.aborted) {

        this.#shutdown(1000, "the livestream was aborted by the caller's signal");
      } else {

        options.signal.addEventListener("abort", () => this.#shutdown(1000, "the livestream was aborted by the caller's signal"),
          { once: true, signal: this.#controller.signal });
      }
    }

    // Begin connecting. Unlike EventStream (whose URL is immediate), we must negotiate the URL first, so the connect is an async task whose failures land on the error
    // rail. It is launched detached; the constructor never throws and never blocks.
    void this.#connect(options.signal);
  }

  /** The init segment cached once the session reaches `live`, used by the pool to replay to late joiners. Null before the first init segment arrives. */
  get initSegment(): { codec: string; data: Buffer } | null {

    return this.#initSegment;
  }

  /** The session's current lifecycle state, for diagnostics and tests. */
  get state(): LivestreamState {

    return this.#state;
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
   * Close the session: request the WebSocket close, detach every listener, end the watchdog, and destroy the owned agent. Idempotent and awaitable.
   */
  async close(): Promise<void> {

    this.#shutdown(1000, "the livestream was closed by the client");

    await (this.#closePromise ?? Promise.resolve());
  }

  /**
   * Dispose the session. Delegates to {@link LivestreamSession.close} so `await using session = ...` tears the socket down cleanly.
   */
  async [Symbol.asyncDispose](): Promise<void> {

    await this.close();
  }

  // Negotiate the URL and open the socket. This is the connecting phase: any failure (negotiation 4xx/5xx, network, abort) lands on the error rail and tears down,
  // exactly as a socket failure later would, so the consumer sees one uniform failure path for the whole connect attempt.
  async #connect(signal?: AbortSignal): Promise<void> {

    // An already-aborted caller signal tears us down in the constructor before this runs; bail without touching state so we never negotiate or build a socket.
    if(this.#closed) {

      return;
    }

    this.#state = "connecting";

    let url: string;

    try {

      url = await this.#resolveUrl(this.#buildParams(), (signal !== undefined) ? { signal } : {});
    } catch(error) {

      // A teardown that already fired (caller abort during negotiation) has settled everything; do not also emit. We read the controller's abort state rather than
      // `#closed` because it is a live getter the type system cannot narrow to a constant across the await - and it is set in lockstep with `#closed` on teardown.
      if(!this.#controller.signal.aborted) {

        this.#bus.emit("error", (error instanceof ProtectError) ? error :
          new ProtectNetworkError("The UniFi Protect livestream WebSocket endpoint could not be negotiated.", { cause: error }));
        this.#shutdown(1006, "the livestream endpoint negotiation failed");
      }

      return;
    }

    // A concurrent close()/abort may have torn us down while we awaited negotiation. Bail before opening a socket we would immediately orphan.
    if(this.#controller.signal.aborted) {

      return;
    }

    // Build the socket: an injected factory in tests, otherwise undici's WebSocket over an owned HTTP/1.1 agent that accepts the controller's self-signed certificate.
    // The negotiated URL already carries its own authorization token, so - unlike EventStream - no auth headers are stamped on the upgrade. undici's WebSocket
    // structurally satisfies the minimal ProtectWebSocket surface, so it assigns directly.
    if(this.#webSocketFactory !== undefined) {

      this.#ws = this.#webSocketFactory(url);
    } else {

      const agent = new Agent({ connect: { rejectUnauthorized: false } });

      this.#ownedAgent = agent;
      this.#ws = new WebSocket(url, { dispatcher: agent });
    }

    this.#ws.binaryType = "arraybuffer";

    // All listeners bind to the controller's signal, so one abort() detaches them together. close and error are `once` - a socket reports each terminal condition a
    // single time - while message stays live for the connection's lifetime.
    const wsSignal = this.#controller.signal;

    this.#ws.addEventListener("open", () => this.#onOpen(), { once: true, signal: wsSignal });
    this.#ws.addEventListener("message", (event) => this.#onMessage(event.data), { signal: wsSignal });
    this.#ws.addEventListener("close", (event) => this.#onClose(event.code, event.reason), { once: true, signal: wsSignal });
    this.#ws.addEventListener("error", (event) => this.#onError(event), { once: true, signal: wsSignal });
  }

  // Build the controller request params from the resolved spec. This is the library's single source for the livestream wire protocol's request shape. We always rebase
  // timestamps to zero (so any opted-in decode timestamps stay within safe-integer range as `number`) and never use the wall clock (so timestamps stay monotonic decode
  // timestamps, which every fMP4 consumer downstream expects). `extendedVideoMetadata` is requested only when the consumer asked for timestamps.
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
  // bounded negotiation phase.
  #onOpen(): void {

    this.#state = "handshaking";
    this.#lastSegmentAt = this.#clock.now();
    this.#log.debug("Connected to the UniFi Protect livestream API.", { camera: this.#spec.cameraId, channel: this.#spec.channel });

    void this.#runWatchdog();
  }

  // A frame batch arrived. Stamp liveness first (any byte proves the channel is alive), then decode every complete frame the buffer holds, carrying a partial tail to the
  // next message. The wire layout per frame is a 1-byte type, a 3-byte big-endian length, then that many payload bytes.
  #onMessage(data: unknown): void {

    this.#lastSegmentAt = this.#clock.now();

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
  // zero-copy view would pin the whole originating message buffer. The first init segment is what advances the session to `live`.
  #emitInitSegment(raw: Buffer): void {

    const data = Buffer.from(raw);

    this.#initSegment = { codec: this.#codec, data };

    if(this.#state === "handshaking") {

      this.#state = "live";
    }

    this.#emitSegment({ codec: this.#codec, data, type: "init" });
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

  // Sum the byte lengths of a box's accumulated chunks.
  #sumChunks(chunks: readonly Buffer[]): number {

    let total = 0;

    for(const chunk of chunks) {

      total += chunk.length;
    }

    return total;
  }

  // The socket reported an error. Suppress the expected-disconnect noise (the same predicate EventStream uses), surface a typed error, and request a close so teardown
  // flows through the single close path.
  #onError(event: { error?: unknown; message?: string }): void {

    if(!isExpectedWsDisconnect(event.error)) {

      this.#log.error("The UniFi Protect livestream API reported an error.", event.error ?? event.message);
    }

    this.#bus.emit("error", new ProtectNetworkError("The UniFi Protect livestream API connection failed.", { cause: event.error }));
    this.#shutdown(1006, "the livestream connection errored");
  }

  // The single teardown. Guarded so it runs once whether triggered by the socket's close event, an error, the watchdog, or an explicit close. Aborts the controller
  // (detaching every listener and ending the watchdog), announces the close, and destroys the owned agent.
  #onClose(code: number, reason: string): void {

    if(this.#closed) {

      return;
    }

    this.#closed = true;
    this.#state = "closed";
    this.#controller.abort();
    this.#log.debug("The UniFi Protect livestream API connection closed.", { code, reason });
    this.#bus.emit("closed", { code, reason });

    this.#closePromise = (this.#ownedAgent === null) ? Promise.resolve() : this.#ownedAgent.destroy();
  }

  // Request a graceful WebSocket close, then run teardown. Calling close() on the socket is best-effort - destroying the owned agent (in #onClose) is what guarantees the
  // underlying connection is released even if the close frame never completes, or if we tear down before the socket was ever built (negotiation abort).
  #shutdown(code: number, reason: string): void {

    if(!this.#closed) {

      this.#state = "closing";
    }

    try {

      this.#ws?.close();
    } catch {

      // A socket that never opened (or a fake that rejects a premature close) must not block teardown; #onClose below releases everything regardless.
    }

    this.#onClose(code, reason);
  }

  // The silence watchdog, identical in shape to EventStream's. Each tick checks how long the channel has been quiet; once it crosses the threshold the channel is
  // presumed dead-but-not-closed, so we surface a typed stall (the consumer's cue to restart) and tear the socket down. The loop ends when teardown aborts the
  // controller, which the interval iterator reports as an abort - swallowed here as the normal shutdown path.
  async #runWatchdog(): Promise<void> {

    try {

      for await (const _tick of this.#clock.setInterval(PROTECT_LIVESTREAM_HEARTBEAT_TIMEOUT, { signal: this.#controller.signal })) {

        const silentForMs = this.#clock.now() - this.#lastSegmentAt;

        if(silentForMs >= PROTECT_LIVESTREAM_HEARTBEAT_TIMEOUT) {

          this.#log.error("The UniFi Protect livestream API went silent beyond the heartbeat window; tearing down the stalled session.", { silentForMs });
          this.#bus.emit("error", new ProtectStallError("The UniFi Protect livestream API produced no data within the heartbeat window.", { silentForMs }));
          this.#shutdown(1006, "the livestream stalled past the heartbeat window");

          return;
        }
      }
    } catch {

      // The interval iterator throws on abort when the session is torn down. That is the expected end of the loop, not an error.
    }
  }
}
