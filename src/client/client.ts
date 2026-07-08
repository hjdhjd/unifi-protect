/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * client.ts: ProtectClient - the consumer-facing composition root and its atomic connect() factory.
 */

/**
 * The consumer-facing entry point and composition root. {@link ProtectClient.connect} is the one way in: it performs login and the initial bootstrap as a single atomic
 * operation, returning a fully-ready client or throwing a typed `FatalError`. There is no half-constructed state - a failure at any stage tears down what was built (no
 * leaked connection pool) before the error propagates.
 *
 * The client *composes* its subsystems rather than inheriting from any of them. It owns a {@link Transport}, an {@link AuthSession}, a {@link StateStore}, a {@link
 * DeviceRegistry}, and a private {@link EventBus} - and exposes a deliberately small surface over them:
 *
 * - `state` is the data layer: synchronous `snapshot()` and live `observe(selector)` over config records.
 * - `cameras` / `camera(id)` (and the other device accessors) are the device layer: live {@link DeviceProjection} handles built by the registry. They live on the
 *   client, not on `state`, because a projection is Layer 3 - it needs the client - while `state` stays a pure generic engine.
 * - `transport` is the documented escape hatch for raw API calls the typed surface does not yet cover.
 * - `on` / `once` / `stream` are the rail-based event surface, delegated to the private bus; the realtime firehose rides the `packet` rail (see `events()`).
 *
 * @module ProtectClient
 */
import type { ProtectNvrBootstrap, ProtectNvrLiveviewConfig, ProtectRingtoneConfig } from "../types/index.ts";
import { classifyPacket, eventSubjects } from "../protocol/events.ts";
import { livestreamUrlResolver, talkbackUrlResolver } from "../transport/ws-endpoint.ts";
import { selectControllerName, selectIsAdmin, selectLiveviews, selectRingtones } from "../state/selectors.ts";
import { AuthSession } from "../transport/auth.ts";
import type { Camera } from "../devices/camera.ts";
import type { Chime } from "../devices/chime.ts";
import type { Clock } from "../clock.ts";
import { ConnectionMonitor } from "./connection.ts";
import type { DeviceContext } from "../devices/context.ts";
import { DeviceRegistry } from "../devices/registry.ts";
import type { Dispatcher } from "undici";
import { EventBus } from "../event-bus.ts";
import { EventStream } from "../transport/events-stream.ts";
import type { Fob } from "../devices/fob.ts";
import type { Light } from "../devices/light.ts";
import { LivestreamPool } from "./livestream-pool.ts";
import type { Nvr } from "../devices/nvr.ts";
import { ProtectBootstrapError } from "../errors.ts";
import type { ProtectLogging } from "../logging.ts";
import type { ProtectWebSocket } from "../transport/ws.ts";
import type { RawPacket } from "../protocol/packet.ts";
import type { RecoveryPolicy } from "./livestream-pool.ts";
import type { Relay } from "../devices/relay.ts";
import type { Sensor } from "../devices/sensor.ts";
import { StateStore } from "../state/store.ts";
import type { StreamOptions } from "../event-bus.ts";
import { TalkbackSession } from "../transport/talkback-session.ts";
import { Transport } from "../transport/http.ts";
import type { TypedEvent } from "../protocol/events.ts";
import type { Viewer } from "../devices/viewer.ts";
import { decodePacket } from "../protocol/packet.ts";
import { noopLog } from "../logging.ts";
import { wallClock } from "../clock.ts";

/**
 * Options for {@link ProtectClient.connect}. `host`, `username`, and `password` are the required controller address and credentials; the rest are optional injected
 * seams, each defaulted at the composition root:
 *
 * - `clock` is the time source threaded into every subsystem (transport, store, event stream, livestream pool); it defaults to the wall clock, and tests inject a
 *   fake to drive timers deterministically.
 * - `dispatcher` is an undici `Dispatcher` for the transport's connection pool; when omitted the transport builds and owns its own pool.
 * - `log` is the structured logger; it defaults to a no-op sink.
 * - `recoveryPolicy` is the per-stream livestream recovery decision authority handed to the livestream pool; it defaults to {@link
 *   defaultLivestreamRecoveryPolicy}.
 * - `refreshIntervalMs` sets the {@link StateStore}'s bootstrap-refresh failsafe cadence; it defaults to the store's interval, and passing `false` disables the
 *   failsafe entirely so the consumer relies solely on the realtime event stream.
 * - `signal` cancels the initial login and bootstrap fetch; it is bound only to connect, never to a later recovery relaunch.
 * - `webSocket` is the receive-direction {@link ProtectWebSocket} factory used by the events stream and livestream pool; it defaults to a real socket and is the
 *   socket-injection seam for tests. It does not apply to the write-direction talkback socket.
 *
 * @category Client
 */
export interface ConnectOptions {

  clock?: Clock;
  dispatcher?: Dispatcher;
  host: string;
  log?: ProtectLogging;
  password: string;
  recoveryPolicy?: RecoveryPolicy;
  refreshIntervalMs?: number | false;
  signal?: AbortSignal;
  username: string;
  webSocket?: (url: string) => ProtectWebSocket;
}

/**
 * The events the {@link ProtectClient} publishes. `packet` is the realtime event firehose - the same `TypedEvent` stream that feeds the reducer, fanned out to consumers.
 * It is produced by the realtime events WebSocket and bridged here at the composition root: each decoded event is dispatched into the store and then emitted on this rail
 * from the one bridge subscription, so there is a single decode path for both the state model and the firehose.
 *
 * `rawPacket` is the raw observability firehose - the decoded {@link RawPacket} of every frame, including the valid-but-unmodeled ones the classifier drops (so `packet`
 * never sees them). It is bridged from the same single decode site, one step before classification, and is pure observability: never dispatched into the store, no
 * state-ordering guarantee. Consumers use it for protocol exploration and capture; the modeled state and event model still flow through `packet`.
 *
 * @category Client
 */
export interface ProtectClientEvents {

  packet: [event: TypedEvent];
  rawPacket: [packet: RawPacket];
}

// The internal parts the private constructor assembles into a client. Built by `connect()` once login and the initial bootstrap have succeeded; the constructor wires the
// ConnectionMonitor from the events-channel seams (factory, re-bootstrap, verify) and the firehose packet sink, then `connect()` awaits the monitor's initial open.
interface ProtectClientParts {

  auth: AuthSession;
  clock: Clock;
  eventStreamFactory: (lastUpdateId: string, signal?: AbortSignal) => EventStream;
  host: string;
  initialLastUpdateId: string;
  livestreamPool: LivestreamPool;
  log: ProtectLogging;
  reBootstrap: (signal?: AbortSignal) => Promise<string>;
  signal?: AbortSignal;
  store: StateStore;
  talkback: (params: { cameraId: string }, opts?: { signal?: AbortSignal }) => Promise<TalkbackSession>;
  transport: Transport;
  verify: (signal?: AbortSignal) => Promise<void>;
}

// The controller bootstrap endpoint. One home for the path, shared by the full fetch and the cheap liveness probe so they can never address different endpoints.
function bootstrapUrl(host: string): string {

  return "https://" + host + "/proxy/protect/api/bootstrap";
}

// Probe the controller's liveness with a GET against the bootstrap endpoint - the ConnectionMonitor's verify() seam. We use GET, not HEAD: the controller does not answer
// HEAD there (it stalls until the deadline elapses and the retries exhaust, so a HEAD probe never succeeds - live validation found recovery could never complete because
// of this), whereas the GET the connect and refresh paths already use responds promptly. The response body is buffered and discarded; the bootstrap payload is small, so
// this stays a cheap liveness check next to a full re-bootstrap (which also parses and dispatches it). Resolves on a 2xx, throws otherwise. The send carries `probe:
// true` so this recovery trial dispatches through an open breaker at the monitor's cadence rather than being refused by the cooldown gate.
async function probeBootstrap(transport: Transport, host: string, signal?: AbortSignal): Promise<void> {

  const response = await transport.send(bootstrapUrl(host), { probe: true, ...((signal !== undefined) && { signal }) });

  response.ensureOk();
}

// Fetch and parse the controller bootstrap. Transport-level failures (network, timeout, throttle, abort) propagate raw - they are already typed and need no
// bootstrap-stage wrapping. A non-2xx status becomes a `fetch`-stage bootstrap error; a malformed body becomes a `parse`-stage one. Shared by the connect sequence, the
// store's refresh failsafe, and the connection-recovery re-bootstrap, so there is one bootstrap-fetch path in the library. The `probe` option marks the recovery caller:
// it passes `true` so the re-bootstrap dispatches through an open breaker (the monitor's cadence is the rate limiter during recovery), while the connect and refresh
// callers leave it `false` and stay subject to the breaker's cooldown gate.
async function fetchBootstrap(transport: Transport, host: string, opts: { probe?: boolean; signal?: AbortSignal } = {}): Promise<ProtectNvrBootstrap> {

  const response = await transport.send(bootstrapUrl(host),
    { ...((opts.probe === true) && { probe: true }), ...((opts.signal !== undefined) && { signal: opts.signal }) });

  try {

    response.ensureOk();
  } catch(error) {

    throw new ProtectBootstrapError("Unable to fetch the UniFi Protect controller bootstrap.", { cause: error, stage: "fetch" });
  }

  try {

    return response.json<ProtectNvrBootstrap>();
  } catch(error) {

    throw new ProtectBootstrapError("Unable to parse the UniFi Protect controller bootstrap.", { cause: error, stage: "parse" });
  }
}

/**
 * The UniFi Protect client. Construct via {@link ProtectClient.connect}.
 *
 * @category Client
 */
export class ProtectClient implements AsyncDisposable {

  readonly #auth: AuthSession;
  readonly #bus = new EventBus<ProtectClientEvents>();
  readonly #connection: ConnectionMonitor;
  readonly #host: string;
  readonly #livestreamPool: LivestreamPool;
  readonly #registry: DeviceRegistry;
  readonly #store: StateStore;
  readonly #transport: Transport;

  private constructor(parts: ProtectClientParts) {

    this.#auth = parts.auth;
    this.#host = parts.host;
    this.#livestreamPool = parts.livestreamPool;
    this.#store = parts.store;
    this.#transport = parts.transport;

    // The narrow context every projection reads from. Built here at the composition root and handed to the registry, so the device layer depends on exactly the members
    // of the client it needs and nothing more.
    const context: DeviceContext = { host: parts.host, livestreamPool: parts.livestreamPool, log: parts.log, store: parts.store, talkback: parts.talkback,
      transport: parts.transport };

    this.#registry = new DeviceRegistry(context);

    // The single decode sink. The events stream decodes and classifies each frame once and emits one TypedEvent; this fans that one event into both sinks - the store (so
    // state advances) and the client firehose (so consumers see it). Dispatching before emitting means a consumer reading `client.state` inside a `client.events()`
    // handler already observes the post-event state. The ConnectionMonitor owns the events-WebSocket lifecycle and re-attaches this sink across relaunches, so there is
    // exactly one decode path at every moment.
    const packetSink = (event: TypedEvent): void => {

      this.#store.dispatch(event);
      this.#bus.emit("packet", event);
    };

    // The raw observability sink. It fans the decoded RawPacket of every frame onto the client's raw firehose, one step before classification, so consumers can observe
    // frames the classifier drops. It never touches the store - the raw rail is pure observability. Like the packet sink, the ConnectionMonitor re-attaches it across
    // every events-WebSocket relaunch, so the raw firehose survives recovery exactly as the typed one does.
    const rawPacketSink = (packet: RawPacket): void => {

      this.#bus.emit("rawPacket", packet);
    };

    // Build the connection monitor from the events-channel seams. Its constructor begins connecting the initial events stream synchronously and attaches the packet sink
    // before anything awaits the open handshake, so the race-free "subscribe before open" property holds.
    this.#connection = new ConnectionMonitor({

      clock: parts.clock,
      eventStreamFactory: parts.eventStreamFactory,
      initialLastUpdateId: parts.initialLastUpdateId,
      log: parts.log,
      packetSink,
      rawPacketSink,
      reBootstrap: parts.reBootstrap,
      store: parts.store,
      transport: parts.transport,
      verify: parts.verify,
      ...((parts.signal !== undefined) && { signal: parts.signal })
    });
  }

  /**
   * Connect to a Protect controller. Logs in, fetches the initial bootstrap, seeds the reducer, and wires the periodic refresh failsafe - all as one atomic operation.
   *
   * @param opts - The controller address, credentials, and optional seams (logger, clock, refresh interval, injected dispatcher, abort signal).
   *
   * @returns A fully-ready client.
   *
   * @throws {@link ProtectAuthError} on bad credentials, {@link ProtectNetworkError} when the controller is unreachable, {@link ProtectBootstrapError} when the
   *   bootstrap cannot be fetched or parsed - and any other typed `FatalError` the login or fetch surfaces. No partial client escapes a failure.
   */
  static async connect(opts: ConnectOptions): Promise<ProtectClient> {

    const clock = opts.clock ?? wallClock;
    const log = opts.log ?? noopLog;

    // Wire the transport's auth seams to the session through a late-binding closure: the arrows below run only when a request is dispatched, which is strictly after
    // `auth` is assigned, so there is no temporal-dead-zone hazard. This is what lets the transport stamp auth headers and trigger relogin without importing upward. The
    // `let` is required (not the single-assignment `const` prefer-const wants) precisely because those closures capture `auth` before it is assigned.
    // eslint-disable-next-line prefer-const
    let auth: AuthSession;
    const transport = new Transport({

      clock,
      getAuthHeaders: (): Record<string, string> => auth.authHeaders(),
      host: opts.host,
      log,
      onUnauthorized: (): Promise<boolean> => auth.reauthenticate(),
      ...((opts.dispatcher !== undefined) && { dispatcher: opts.dispatcher })
    });

    auth = new AuthSession({ log, transport });

    let bootstrap: ProtectNvrBootstrap;

    try {

      // Stage 1: authenticate. A credential failure throws `ProtectAuthError`, an unreachable controller `ProtectNetworkError` - both already typed fatals, propagated
      // as-is rather than wrapped, so the caller sees the precise cause.
      await auth.login({ host: opts.host, password: opts.password, username: opts.username }, (opts.signal !== undefined) ? { signal: opts.signal } : {});

      // Stage 2: fetch the initial bootstrap. Not a probe - the breaker is closed at connect time, and the initial fetch should respect the gate like any normal request.
      bootstrap = await fetchBootstrap(transport, opts.host, (opts.signal !== undefined) ? { signal: opts.signal } : {});
    } catch(error) {

      // No client exists yet, so tear down the transport (destroying the owned pool) directly - nothing else has been built to leak.
      await transport[Symbol.asyncDispose]();

      throw error;
    }

    // Stage 3: assemble the store, seed it with the bootstrap through the single dispatch chokepoint, and wire the refresh failsafe. The refresh seam is the same
    // bootstrap fetch with no caller signal - the store owns its own lifetime and aborts the loop on disposal.
    const store = new StateStore({

      clock,
      log,
      refresh: (): Promise<ProtectNvrBootstrap> => fetchBootstrap(transport, opts.host),
      ...((opts.refreshIntervalMs !== undefined) && { refreshIntervalMs: opts.refreshIntervalMs })
    });

    store.dispatch({ data: bootstrap, kind: "bootstrapLoaded" });

    // Stage 4: build the events-channel seams the ConnectionMonitor drives. The factory is the single events-stream construction path - used for the initial stream and
    // every recovery relaunch; its optional signal is bound only to the initial connect. `reBootstrap` reuses the shared bootstrap fetch and the store's single dispatch
    // chokepoint, returning the fresh `lastUpdateId` to seed a relaunch. `verify` is the GET liveness probe (a HEAD probe stalls against this controller - see
    // `probeBootstrap`). The auth-header seam mirrors the transport's.
    const eventStreamFactory = (lastUpdateId: string, signal?: AbortSignal): EventStream => new EventStream({

      clock,
      getAuthHeaders: (): Record<string, string> => auth.authHeaders(),
      host: opts.host,
      lastUpdateId,
      log,
      ...((signal !== undefined) && { signal }),
      ...((opts.webSocket !== undefined) && { webSocket: opts.webSocket })
    });

    const reBootstrap = async (signal?: AbortSignal): Promise<string> => {

      // The recovery re-bootstrap carries `probe: true`: it runs only while the monitor is recovering, after a verify probe has already confirmed reachability, so it
      // must dispatch through a possibly-still-open breaker rather than be refused by the cooldown gate. The monitor's backoff curve is the rate limiter here.
      const refreshed = await fetchBootstrap(transport, opts.host, { probe: true, ...((signal !== undefined) && { signal }) });

      store.dispatch({ data: refreshed, kind: "bootstrapLoaded" });

      return refreshed.lastUpdateId;
    };

    const verify = (signal?: AbortSignal): Promise<void> => probeBootstrap(transport, opts.host, signal);

    // The livestream pool, composed with the transport-backed URL resolver and the shared WebSocket factory seam. It owns no transport itself - it negotiates through the
    // injected resolver - and lazily opens an underlying session only when a camera is first subscribed.
    const livestreamPool = new LivestreamPool({

      clock,
      log,
      ...((opts.recoveryPolicy !== undefined) && { recoveryPolicy: opts.recoveryPolicy }),
      resolveUrl: livestreamUrlResolver(transport, opts.host),
      ...((opts.webSocket !== undefined) && { webSocket: opts.webSocket })
    });

    // The talkback factory, bound to the transport-backed talkback URL resolver. Unlike the livestream pool, talkback is exclusive and per-call, so this mints an
    // independent atomic TalkbackSession per invocation rather than fanning out a shared one; the projection passes only its camera id and an optional signal, and the
    // WebSocket wire knowledge (negotiation path, self-signed agent) stays here in Layer 2. The resolver is built once and closed over. The talkback session uses its own
    // default (writable) WebSocket factory: the `opts.webSocket` ConnectOptions seam is the receive-direction socket factory (ProtectWebSocket, for the events stream and
    // livestream pool) and does not fit the write-direction ProtectWritableWebSocket talkback needs, so it is deliberately not threaded here - the send socket is faked
    // at the TalkbackSession level, not through the full client.
    const resolveTalkbackUrl = talkbackUrlResolver(transport, opts.host);
    const talkback = (params: { cameraId: string }, callOpts: { signal?: AbortSignal } = {}): Promise<TalkbackSession> => TalkbackSession.connect({

      cameraId: params.cameraId,
      log,
      resolveUrl: resolveTalkbackUrl,
      ...((callOpts.signal !== undefined) && { signal: callOpts.signal })
    });

    // Construct the client now - its constructor builds the ConnectionMonitor, which begins connecting the initial events stream and attaches the packet sink before we
    // await the open handshake below, with no intervening await, so the sink is in place before the socket can deliver its first (possibly replayed) frame.
    const client = new ProtectClient({

      auth,
      clock,
      eventStreamFactory,
      host: opts.host,
      initialLastUpdateId: bootstrap.lastUpdateId,
      livestreamPool,
      log,
      reBootstrap,
      store,
      talkback,
      transport,
      verify,
      ...((opts.signal !== undefined) && { signal: opts.signal })
    });

    try {

      // Stage 5: wait for the events WebSocket to actually open, completing the atomic connect. A failure here means the realtime channel never came up.
      await client.connection.opened;
    } catch(error) {

      // Atomic factory: tear the whole client down (connection/events stream, livestream pool, store, session, and transport pool, in that order) so no half-constructed
      // client escapes.
      await client[Symbol.asyncDispose]();

      throw error;
    }

    return client;
  }

  /**
   * Decode a raw realtime packet's bytes into a {@link RawPacket} - the validated wire header plus the data-frame payload, *before* classification. A static, pure,
   * connection-independent operation: it is the offline counterpart of the {@link ProtectClient.rawPackets} rail (which is this same decode applied to the live socket),
   * and it is a `static` rather than an instance method precisely because decoding needs no client - it reads no connection state. Pair it with {@link
   * ProtectClient.classifyPacket} to reproduce the live pipeline (`classifyPacket(decodePacket(bytes))`) over captured bytes.
   *
   * @param buf - The raw packet bytes (a `Buffer` included; read without copying).
   *
   * @returns The decoded raw packet.
   *
   * @throws {@link ProtectProtocolError} if the bytes are not a well-formed packet.
   */
  static decodePacket(buf: Uint8Array): RawPacket {

    return decodePacket(buf);
  }

  /**
   * Classify a decoded {@link RawPacket} into a {@link TypedEvent}, or `null` when the packet is valid but describes something the library does not model. The static,
   * pure, connection-independent counterpart of the {@link ProtectClient.events} rail (which is this same classification applied to the live socket). Takes the output of
   * {@link ProtectClient.decodePacket}, so the two compose to turn captured bytes into a typed event exactly as the realtime path does - one decode/classify
   * implementation, reached the same way live and offline.
   *
   * @param packet - The decoded raw packet.
   *
   * @returns The classified event, or `null` for a valid-but-unmodeled packet.
   */
  static classifyPacket(packet: RawPacket): TypedEvent | null {

    return classifyPacket(packet);
  }

  /**
   * The id(s) of the record(s) a {@link TypedEvent} concerns - a camera for a camera activity signal, the access device for an access occurrence, the reduced
   * record for a state transition, none for the synthetic bootstrap. The static, pure counterpart that attributes any firehose event to its device(s) without a
   * consumer re-deriving the mapping - the single source of truth the CLI's `--device` filter and event rendering both read, surfaced on the object model exactly
   * like {@link ProtectClient.classifyPacket}. Total and exhaustive: it cannot silently lag a new event kind.
   *
   * @param event - Any {@link TypedEvent}, e.g. from {@link ProtectClient.events} or {@link ProtectClient.classifyPacket}.
   *
   * @returns The subject record id(s), possibly empty.
   */
  static eventSubjects(event: TypedEvent): readonly string[] {

    return eventSubjects(event);
  }

  /** The data layer: synchronous `snapshot()` and live `observe(selector)` over the reduced controller state. */
  get state(): StateStore {

    return this.#store;
  }

  /** The HTTP transport - the documented escape hatch for raw API calls the typed surface does not cover. */
  get transport(): Transport {

    return this.#transport;
  }

  /** The connection monitor: the observable connection-state FSM, reboot detection, throttle/stall folding, and auto-recovery of the realtime events channel. */
  get connection(): ConnectionMonitor {

    return this.#connection;
  }

  /**
   * Whether the authenticated session holds Super Admin (camera-write) privileges. Sync sugar over {@link selectIsAdmin} of the current snapshot, for the hot-path read
   * where awaiting an iterator is overkill; consumers `observe` the selector instead. Re-evaluated from state, so a role change surfaces on the next refresh.
   */
  get isAdmin(): boolean {

    return selectIsAdmin(this.#store.snapshot());
  }

  /** The controller's display name, or `null` before the first bootstrap. Sync sugar over {@link selectControllerName} of the current snapshot. */
  get controllerName(): string | null {

    return selectControllerName(this.#store.snapshot());
  }

  /**
   * The NVR configuration as a read-only, observable projection. A singleton sibling of the device projections: `client.nvr` always returns a handle (the NVR is a
   * singleton, so there is no `undefined` lookup), whose read-through getters (`host`, `rtspPort`, `name`, `marketName`) and `observe()` reflect the live reduced state.
   * It bears no commands - NVR config writes are out of scope and controller reboot is {@link ProtectClient.reboot}. The getters throw only before the first bootstrap,
   * which a connected client never reaches (`connect()` awaits it).
   */
  get nvr(): Nvr {

    return this.#registry.nvr();
  }

  /**
   * The controller's saved liveviews, as read-only config records. Sync sugar over {@link selectLiveviews} of the current snapshot - the common "list them" read; for a
   * by-id lookup use `selectLiveview(id)`, and for reactivity `client.state.observe(selectLiveviews)`. Liveviews are read-only config (no commands), so they are bare
   * records rather than a command-bearing projection, and a top-level collection rather than a child of `client.nvr` - they ride the realtime wire exactly as devices do.
   */
  get liveviews(): readonly ProtectNvrLiveviewConfig[] {

    return selectLiveviews(this.#store.snapshot());
  }

  /**
   * The controller's ringtone library, as read-only config records. Sync sugar over {@link selectRingtones} of the current snapshot; for a by-id lookup use
   * `selectRingtone(id)`, and for reactivity `client.state.observe(selectRingtones)`. Surfaced identically to {@link liveviews} - the difference is only in lifecycle
   * (ringtones advance on the bootstrap refresh, as the controller broadcasts no realtime ringtone delta), which is invisible at this read-through surface.
   */
  get ringtones(): readonly ProtectRingtoneConfig[] {

    return selectRingtones(this.#store.snapshot());
  }

  /** Every camera in the current state, as live projections. */
  get cameras(): readonly Camera[] {

    return this.#registry.cameras();
  }

  /** Every chime in the current state, as live projections. */
  get chimes(): readonly Chime[] {

    return this.#registry.chimes();
  }

  /** Every fob in the current state, as live projections. */
  get fobs(): readonly Fob[] {

    return this.#registry.fobs();
  }

  /** Every light in the current state, as live projections. */
  get lights(): readonly Light[] {

    return this.#registry.lights();
  }

  /** Every relay in the current state, as live projections. */
  get relays(): readonly Relay[] {

    return this.#registry.relays();
  }

  /** Every sensor in the current state, as live projections. */
  get sensors(): readonly Sensor[] {

    return this.#registry.sensors();
  }

  /** Every viewer in the current state, as live projections. */
  get viewers(): readonly Viewer[] {

    return this.#registry.viewers();
  }

  /** Look up a camera by id, or `undefined` when no such camera is in the current state. */
  camera(id: string): Camera | undefined {

    return this.#registry.camera(id);
  }

  /** Look up a chime by id, or `undefined` when absent. */
  chime(id: string): Chime | undefined {

    return this.#registry.chime(id);
  }

  /** Look up a fob by id, or `undefined` when absent. */
  fob(id: string): Fob | undefined {

    return this.#registry.fob(id);
  }

  /** Look up a light by id, or `undefined` when absent. */
  light(id: string): Light | undefined {

    return this.#registry.light(id);
  }

  /** Look up a relay by id, or `undefined` when absent. */
  relay(id: string): Relay | undefined {

    return this.#registry.relay(id);
  }

  /** Look up a sensor by id, or `undefined` when absent. */
  sensor(id: string): Sensor | undefined {

    return this.#registry.sensor(id);
  }

  /** Look up a viewer by id, or `undefined` when absent. */
  viewer(id: string): Viewer | undefined {

    return this.#registry.viewer(id);
  }

  /**
   * Subscribe to a client event. Returns a `Disposable`; prefer `using sub = client.on(...)` so the listener detaches at scope exit.
   *
   * @param event   - The event to listen for.
   * @param handler - Invoked on each emission.
   *
   * @returns A `Disposable` that removes the listener when disposed.
   */
  on<K extends keyof ProtectClientEvents>(event: K, handler: (...args: ProtectClientEvents[K]) => void): Disposable {

    return this.#bus.on(event, handler);
  }

  /**
   * Wait for the next emission of a client event.
   *
   * @param event - The event to await.
   * @param opts  - Optional abort signal.
   *
   * @returns A promise resolving to the event's argument tuple.
   */
  async once<K extends keyof ProtectClientEvents>(event: K, opts: { signal?: AbortSignal } = {}): Promise<ProtectClientEvents[K]> {

    return this.#bus.once(event, opts);
  }

  /**
   * Stream every subsequent emission of a client event until the signal aborts.
   *
   * @param event - The event to stream.
   * @param opts  - Stream options, including the abort signal.
   *
   * @returns An async iterable of the event's argument tuples.
   */
  stream<K extends keyof ProtectClientEvents>(event: K, opts: StreamOptions = {}): AsyncIterable<ProtectClientEvents[K]> {

    return this.#bus.stream(event, opts);
  }

  /**
   * The realtime event firehose: every {@link TypedEvent} the controller emits, until the signal aborts or the client is disposed. Sugar over `stream("packet")` that
   * unwraps the single-element argument tuple. Each event has already been dispatched into the store by the time it reaches here, so reading `client.state` inside the
   * loop observes the post-event state.
   *
   * @param opts - Optional abort signal that terminates the iteration.
   *
   * @returns An async iterable of typed events.
   */
  async *events(opts: { signal?: AbortSignal } = {}): AsyncGenerator<TypedEvent> {

    // The raw `stream` rail rejects with the abort reason when its signal fires; the firehose sugar smooths the caller's own abort into a clean return, so a `for await
    // (const event of client.events({ signal }))` ends quietly on Ctrl-C. Any other error still propagates.
    try {

      for await (const [event] of this.#bus.stream("packet", opts)) {

        yield event;
      }
    } catch(error) {

      if(opts.signal?.aborted === true) {

        return;
      }

      throw error;
    }
  }

  /**
   * The raw realtime firehose: every decoded {@link RawPacket} the controller emits - header plus payload, *before* classification - until the signal aborts or the
   * client is disposed. Unlike {@link ProtectClient.events}, this carries the valid-but-unmodeled frames the classifier drops (an unrecognized model key, an unhandled
   * action, a non-self-describing `event`), so it is the surface for protocol exploration and capture rather than the modeled state/event model. It is pure
   * observability: a raw packet is never dispatched into the store, so reading `client.state` inside this loop carries no ordering guarantee relative to the frame. Sugar
   * over `stream("rawPacket")` that unwraps the single-element argument tuple and smooths the caller's own abort into a clean return.
   *
   * @param opts - Optional abort signal that terminates the iteration.
   *
   * @returns An async iterable of raw packets.
   */
  async *rawPackets(opts: { signal?: AbortSignal } = {}): AsyncGenerator<RawPacket> {

    // Same clean-abort handling as the typed firehose: the caller's own signal ends the loop quietly, any other error propagates.
    try {

      for await (const [packet] of this.#bus.stream("rawPacket", opts)) {

        yield packet;
      }
    } catch(error) {

      if(opts.signal?.aborted === true) {

        return;
      }

      throw error;
    }
  }

  /**
   * Fetch the controller bootstrap on demand and return the untouched parsed JSON. The library does not *retain* the raw bootstrap - it is consumed once at connect (and
   * on each refresh / recovery re-bootstrap) as a synthetic `bootstrapLoaded` event, and only the reduced state survives - so this is a fresh GET over the single shared
   * bootstrap-fetch path, returning the controller's response verbatim *without* dispatching it into the store. It is a faithful raw dump for diagnostics, not a cached
   * blob; the reduced, observable model remains `client.state`. The return type is `unknown` deliberately: this is whatever the controller sent, not the curated model.
   *
   * @param opts - Optional abort signal.
   *
   * @returns The raw bootstrap JSON as returned by the controller.
   *
   * @throws {@link ProtectBootstrapError} when the bootstrap cannot be fetched or parsed, or a transport-level `ProtectError`.
   */
  async fetchBootstrap(opts: { signal?: AbortSignal } = {}): Promise<unknown> {

    return fetchBootstrap(this.#transport, this.#host, opts);
  }

  /**
   * Reboot the UniFi OS controller hosting Protect. This is a controller-level operation - a UniFi-OS call (`POST /api/system/reboot`), distinct from a device's {@link
   * DeviceProjection.reboot}: it restarts the whole console, so every device drops and re-adopts. It lives on the client, not a projection, because it is out of the
   * Protect device model. The connection monitor observes the resulting outage and recovers automatically, firing `controllerLost` / `controllerRecovered` and - on the
   * controller's new boot time - `controllerRebooted`.
   *
   * @param opts - Optional abort signal.
   *
   * @throws The classified `FatalError` on a non-2xx (e.g. {@link ProtectAuthorizationError} when the account lacks reboot rights), or a transport-level `ProtectError`.
   */
  async reboot(opts: { signal?: AbortSignal } = {}): Promise<void> {

    const response = await this.#transport.send("https://" + this.#host + "/api/system/reboot", {

      body: "{}",
      headers: { "content-type": "application/json" },
      method: "POST",
      ...((opts.signal !== undefined) && { signal: opts.signal })
    });

    response.ensureOk();

    // The controller accepted the reboot, so the realtime channel is about to drop. Arm the monitor to treat the imminent fault as a known reboot - entering the
    // return-time-anticipating backoff track rather than the prompt one - now that the cause is certain. We arm only after the 2xx, so a rejected reboot never colors a
    // later unrelated fault; the monitor bounds the anticipation with a self-expiring window. See ConnectionMonitor.expectReboot.
    this.#connection.expectReboot();
  }

  /**
   * Dispose the client: tear down the connection monitor (stopping recovery and closing the events stream), close every livestream session in the pool, stop the refresh
   * failsafe and terminate observers, end the session, and destroy the connection pool - in that order, so ingestion stops before the state and transport it feeds.
   * Idempotent and the canonical teardown via `await using client = await ProtectClient.connect(...)`.
   */
  async [Symbol.asyncDispose](): Promise<void> {

    await this.#connection[Symbol.asyncDispose]();
    await this.#livestreamPool[Symbol.asyncDispose]();
    await this.#store[Symbol.asyncDispose]();
    this.#auth.logout();
    await this.#transport[Symbol.asyncDispose]();
  }
}
