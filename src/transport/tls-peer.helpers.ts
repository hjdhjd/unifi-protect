/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * tls-peer.helpers.ts: Loopback peers the transport suites drive real sockets against - an HTTPS responder for the request path, a hand-rolled WebSocket upgrader
 * for the socket paths, an HTTPS peer that takes requests and answers none, a TLS peer that offers HTTP/2 ahead of HTTP/1.1 and answers nothing, a silent peer that
 * holds a dial in its handshake, a peer that resets every connection it accepts, a plain peer whose answers a test scripts at the socket level, and a TLS peer
 * behind a proxy whose client-facing connections a test writes raw bytes to - with the client-side captures the connector suites read a connection through and the
 * socket suites read an announced connection through, and the real-time bounds a settlement and a release are read against.
 */
import type { AddressInfo, Server, Socket } from "node:net";
import type { Dispatcher, buildConnector } from "undici";
import type { Http2ServerRequest, ServerHttp2Session } from "node:http2";
import { connect as connectTcp, createServer as createTcpServer } from "node:net";
import { loopbackCertificateFixture, loopbackPrivateKeyFixture } from "./tls.fixtures.ts";
import { subscribe, unsubscribe } from "node:diagnostics_channel";
import type { IncomingMessage } from "node:http";
import type { TLSSocket } from "node:tls";
import { createHash } from "node:crypto";
import { createServer as createHttpsServer } from "node:https";
import { createSecureServer } from "node:http2";
import { createServer as createTlsServer } from "node:tls";
import { setTimeout as delay } from "node:timers/promises";
import { request } from "undici";

// The fixed value RFC 6455 defines for the handshake digest, and the blank line that ends an HTTP header block.
const WEBSOCKET_ACCEPT_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const HEADER_TERMINATOR = "\r\n\r\n";

// The diagnostics channel undici announces each connection a client establishes on, carrying the connection's socket.
const CLIENT_CONNECTED_CHANNEL = "undici:client:connected";

/**
 * The answers a test hands the scripted peer to write: one that keeps its connection open for the next request, and one that asks the client to close it. The TLS
 * peer behind the proxy writes the first to every request it reads.
 */
export const KEEP_ALIVE_RESPONSE = "HTTP/1.1 200 OK\r\ncontent-length: 2\r\nconnection: keep-alive\r\n\r\nok";
export const CLOSING_RESPONSE = "HTTP/1.1 200 OK\r\ncontent-length: 2\r\nconnection: close\r\n\r\nok";

/**
 * A TLS record no session can decrypt: an application-data header announcing sixteen bytes, then sixteen zero bytes. Written to the client past the peer's TLS layer
 * once the handshake is over, through the proxied peer's `write`, it makes the client's own TLS layer raise the error.
 */
export const CORRUPT_TLS_RECORD = Buffer.concat([ Buffer.from([ 0x17, 0x03, 0x03, 0x00, 0x10 ]), Buffer.alloc(16) ]);

/* The real-time bound, in milliseconds, within which a cancelled or expired request settles and within which a reset or a teardown releases a connection, before a
 * test calls it a failure. It sits more than an order of magnitude above what either costs and an order of magnitude below undici's own ten-second connect timer -
 * which is what a settlement or a release that silently did nothing would fall through to, and is what makes the bound tell the two apart.
 */
export const DIAL_SETTLE_BOUND_MS = 1000;

/* How long a dial test waits on real time before it reads what a cancel left alone: that no second connection attempt reached the peer, that a connection attempt
 * left to the pool is still open, and that a request waiting on it is still pending. A re-dial is a connect syscall and an accept event, a couple of milliseconds on
 * loopback, which a single macrotask turn does not reliably span; this wait spans it more than an order of magnitude over.
 */
const REDIAL_WAIT_MS = 50;

// How long the resetting peer holds a connection before it resets it. The accept and a test's own reaction to it share one turn of the event loop, so any delay
// orders the reset after whatever the test does to the connection attempt; this one also gives the client time to send the opening of its handshake.
const HANDSHAKE_RESET_DELAY_MS = 50;

// Nanoseconds per millisecond, which is the unit `process.hrtime.bigint()` answers in and the one the bound above is written in.
const NANOSECONDS_PER_MILLISECOND = 1000000;

/**
 * Real elapsed milliseconds since a `process.hrtime.bigint()` reading.
 *
 * A settlement has to be bounded on real time whatever clock its subject is driven by: a virtual clock cannot tell a prompt settlement from undici's own connect
 * timer, because the two end a request the same way and a `TestClock` reports whatever elapsed time its advance says.
 *
 * @param startedAt - The reading to measure from.
 *
 * @returns Milliseconds of real time elapsed since that reading.
 */
export function elapsedSince(startedAt: bigint): number {

  return Number(process.hrtime.bigint() - startedAt) / NANOSECONDS_PER_MILLISECOND;
}

/**
 * Wait out the re-dial wait on real time, and report whether every promise given was still pending when it elapsed.
 *
 * A promise that settles inside the wait - a rejection as much as a resolution - ends the wait early and answers `false`, so a test that expects something to stay
 * open learns at once when it did not.
 *
 * @param promises - What has to stay pending: a request, an accepted connection's `closed`, or a connection the peer has yet to accept.
 *
 * @returns Whether the wait elapsed with every one of them still pending.
 */
export async function pendingThroughRedialWait(...promises: Promise<unknown>[]): Promise<boolean> {

  return Promise.race([ delay(REDIAL_WAIT_MS, true), ...promises.map(async (promise) => promise.then(() => false, () => false)) ]);
}

/**
 * One connection the peer accepted, as a test observes it and acts on it. `closed` is armed at accept rather than on demand, because a client that refuses the
 * certificate severs within milliseconds and a listener attached after the fact would miss the very event it exists to observe. `end` sends the client a bare FIN and
 * `reset` a TCP RST, each on the accepted TCP socket beneath any TLS above it and each a way a peer drops a connection: a hang-up the client's socket raises no
 * error for, and a reset it raises `ECONNRESET` for.
 */
export interface LoopbackConnection {

  readonly closed: Promise<void>;
  end(): void;
  reset(): void;
}

/**
 * A listening loopback peer. `host` is the `address:port` authority the library's own URL builders expect, `127.0.0.1:<port>` or, for a peer bound to IPv6,
 * `[::1]:<port>`, so a test hands it straight to a client as the controller address. Dispose it (or call `close()`) to sever every connection and stop listening.
 *
 * `accepted` counts the connections the peer accepted at the TCP layer, which is how a test proves that a settled request was never dialed again, and
 * `connection(index)` resolves with the connection at that position in accept order, at once if it already arrived, so a test can arm itself before the client
 * dials or read the result after. Each index supports a single outstanding waiter: a second concurrent call with the same argument replaces the first, whose
 * promise never settles.
 */
export interface LoopbackPeer extends AsyncDisposable {

  readonly accepted: number;
  readonly host: string;
  close(): Promise<void>;
  connection(index: number): Promise<LoopbackConnection>;
}

/**
 * A listening loopback peer that is a TLS peer behind a TCP proxy. Beside every {@link LoopbackPeer} member, whose connections are the proxy's client-facing ones,
 * `write` sends raw bytes to the client on each of those connections, past the TLS peer's own layer, which is how a test hands the client's TLS layer a record no
 * session can decrypt.
 */
export interface LoopbackTlsProxyPeer extends LoopbackPeer {

  write(bytes: Buffer): void;
}

/**
 * A listening loopback TLS peer. Beside every {@link LoopbackPeer} member, `handshakes` counts the TLS handshakes that completed, which is what distinguishes a
 * client that accepted the certificate from one that refused it: both open a TCP connection, and only the accepting one gets above it. `whenHandshakes(count)`
 * resolves once that many have completed, and `protocol(index)` with the application protocol the handshake at that position negotiated, which a test asserts
 * before anything protocol-specific, because a row meant for one protocol that quietly ran over the other would pass for the wrong reason. Each count and each
 * index supports a single outstanding waiter, as `connection` does.
 */
export interface LoopbackTlsPeer extends LoopbackPeer {

  readonly handshakes: number;
  protocol(index: number): Promise<string | false | null>;
  whenHandshakes(count: number): Promise<void>;
}

/**
 * A listening loopback HTTPS peer. Beside every {@link LoopbackTlsPeer} member, `requests` counts the HTTP requests the peer has answered, which is how a test reads
 * the number of attempts a client's retry policy made.
 */
export interface LoopbackHttpsPeer extends LoopbackTlsPeer {

  readonly requests: number;
}

/**
 * One request a peer that answers nothing received, as a test observes it: the method and the path it carried. Each is typed as the platform's request declares
 * it, optional because that class carries a client's responses as well, though a request a server receives always carries each.
 */
export interface UnansweredRequest {

  readonly method: string | undefined;
  readonly path: string | undefined;
}

/**
 * A listening loopback HTTPS peer that answers nothing. Beside every {@link LoopbackTlsPeer} member, `request(index)` resolves with the request at that position in
 * arrival order, at once if it already arrived.
 */
export interface LoopbackHungHttpsPeer extends LoopbackTlsPeer {

  request(index: number): Promise<UnansweredRequest>;
}

/**
 * Options every loopback peer takes.
 *
 * - `ipv6` binds the peer to the IPv6 loopback address `::1` rather than to `127.0.0.1`, so a client reaches it through a bracketed authority. It defaults to `false`.
 */
export interface LoopbackPeerOptions {

  ipv6?: boolean;
}

/**
 * Options for {@link createLoopbackHttpsPeer}, beside every {@link LoopbackPeerOptions} member.
 *
 * - `respond` decides each answer from the 1-based index of the request being answered, so a test scripts a sequence (two 503s, then a 200) as readily as a fixed
 *   reply. Each answer goes out under a JSON content type. It defaults to a 200 with `{"ok":true}` for every request.
 */
export interface LoopbackHttpsPeerOptions extends LoopbackPeerOptions {

  respond?: (request: number) => { body: string; status: number };
}

/**
 * Options for {@link createLoopbackHungHttpsPeer}, beside every {@link LoopbackPeerOptions} member.
 *
 * - `offerH2` decides whether the peer negotiates HTTP/2 with a client that offers it. It defaults to `true`, a secure HTTP/2 server that takes HTTP/1.1 as well and
 *   offers `h2` ahead of `http/1.1`; `false` makes it an HTTPS server that speaks HTTP/1.1 alone, which is how a test holds a request on HTTP/1.1.
 */
export interface LoopbackHungHttpsPeerOptions extends LoopbackPeerOptions {

  offerH2?: boolean;
}

/**
 * Options for {@link createLoopbackWebSocketPeer}, beside every {@link LoopbackPeerOptions} member.
 *
 * - `resetUpgrade` makes the peer reset the connection once the upgrade request has arrived, rather than answer it, which is how a peer drops a connection after the
 *   TLS handshake and before the WebSocket opens. It defaults to `false`.
 */
export interface LoopbackWebSocketPeerOptions extends LoopbackPeerOptions {

  resetUpgrade?: boolean;
}

// The answer a peer gives when a test scripts none: a 200 and a small JSON body, all a test asking whether a request completes needs.
const answerOk = (): { body: string; status: number } => ({ body: "{\"ok\":true}", status: 200 });

// The throwaway self-signed identity every TLS peer here presents, which stands in for the certificate a controller itself presents.
const identity = { cert: loopbackCertificateFixture, key: loopbackPrivateKeyFixture };

/**
 * Build a loopback HTTPS peer that answers each request as `respond` decides and counts the requests it answered, presenting the throwaway self-signed identity a
 * controller's own certificate stands in for.
 *
 * An `undici.MockAgent` replaces undici's dispatch wholesale, so the pool's connect options - certificate verification among them - and the retry interceptor the
 * pool composes are permanently out of its reach. Establishing what the option does to a handshake, or what the interceptor does with a status it retries, therefore
 * takes a real peer, dialed by a transport that built its own pool.
 *
 * @param options - The peer's options; see {@link LoopbackHttpsPeerOptions}.
 *
 * @returns The listening peer.
 */
export async function createLoopbackHttpsPeer({ ipv6 = false, respond = answerOk }: LoopbackHttpsPeerOptions = {}): Promise<LoopbackHttpsPeer> {

  let requests = 0;

  const server = createHttpsServer(identity, (_request, response) => {

    requests++;

    const { body, status } = respond(requests);

    response.writeHead(status, { "content-type": "application/json" });
    response.end(body);
  });

  const peer = await startPeer(server, { ipv6 });

  // The peer is wrapped member by member rather than spread, because a spread copies each getter's value once and would freeze its count at that moment.
  return {

    get accepted(): number {

      return peer.accepted;
    },
    close: async (): Promise<void> => peer.close(),
    connection: async (index: number): Promise<LoopbackConnection> => peer.connection(index),
    get handshakes(): number {

      return peer.handshakes;
    },
    host: peer.host,
    protocol: async (index: number): Promise<string | false | null> => peer.protocol(index),
    get requests(): number {

      return requests;
    },
    whenHandshakes: async (count: number): Promise<void> => peer.whenHandshakes(count),
    [Symbol.asyncDispose]: async (): Promise<void> => peer.close()
  };
}

/**
 * Build a loopback HTTPS peer that takes every request and answers none, over HTTP/2 or HTTP/1.1.
 *
 * A request this peer has received is in flight on an established connection for as long as a test needs it, which is the state a teardown meets once the dial is
 * over and the one neither the silent peers nor the responder can hold. Each request is recorded as it arrives, so a test arms itself against it before the client
 * sends it and tears down only once it is in flight.
 *
 * @param options - The peer's options; see {@link LoopbackHungHttpsPeerOptions}.
 *
 * @returns The listening peer. Dispose it to end every session and connection and stop listening.
 */
export async function createLoopbackHungHttpsPeer({ ipv6 = false, offerH2 = true }: LoopbackHungHttpsPeerOptions = {}): Promise<LoopbackHungHttpsPeer> {

  const requests = createLedger<UnansweredRequest>();
  const sessions: ServerHttp2Session[] = [];

  // Each server hands this one handler its requests, and it reads only what the HTTP/2 server's request and the HTTPS server's request have in common.
  const onRequest = (request: Http2ServerRequest | IncomingMessage): void => requests.record({ method: request.method, path: request.url });

  /* Which server answers decides the protocol, rather than a setting on one server: the HTTP/2 server writes its own offer, with `h2` at its head, while the HTTPS
   * server offers `http/1.1` alone. Only the HTTP/2 server opens sessions, so only it records them for the disposal to end.
   */
  const server = offerH2 ? createSecureServer({ ...identity, allowHTTP1: true }, onRequest).on("session", (session) => void sessions.push(session)) :
    createHttpsServer(identity, onRequest);

  const peer = await startPeer(server, { ipv6 });

  // An HTTP/2 session is ended ahead of the socket it runs over, so no session outlives the connection under it.
  const close = async (): Promise<void> => {

    for(const session of sessions) {

      session.destroy();
    }

    await peer.close();
  };

  return {

    get accepted(): number {

      return peer.accepted;
    },
    close,
    connection: async (index: number): Promise<LoopbackConnection> => peer.connection(index),
    get handshakes(): number {

      return peer.handshakes;
    },
    host: peer.host,
    protocol: async (index: number): Promise<string | false | null> => peer.protocol(index),
    request: async (index: number): Promise<UnansweredRequest> => requests.at(index),
    whenHandshakes: async (count: number): Promise<void> => peer.whenHandshakes(count),
    [Symbol.asyncDispose]: close
  };
}

/**
 * Build a loopback TLS peer that offers `h2` ahead of `http/1.1`, completes the handshake, and then answers nothing above it.
 *
 * The peer negotiates whatever the client offered that it prefers, so the protocol each handshake recorded is a reading of the client's own offer: `h2` from a client
 * that offers HTTP/2 and `http/1.1` from one that withholds it. Answering nothing also holds a WebSocket upgrade pending after TLS, one stage further along than the
 * silent peer holds a dial.
 *
 * @param options - The peer's options; see {@link LoopbackPeerOptions}.
 *
 * @returns The listening peer.
 */
export async function createLoopbackAlpnPeer({ ipv6 = false }: LoopbackPeerOptions = {}): Promise<LoopbackTlsPeer> {

  const server = createTlsServer({ ALPNProtocols: [ "h2", "http/1.1" ], ...identity });

  // Every accepted socket is put in flowing mode, because a socket that is never read may never emit `close` once its peer severs it.
  server.on("secureConnection", (socket: TLSSocket) => socket.resume());

  return startPeer(server, { ipv6 });
}

/**
 * Build a loopback peer that accepts every connection and then says nothing at all.
 *
 * A TLS client dialing it completes TCP and waits forever in the handshake, which is the one peer behavior that leaves a connection attempt in flight for as long as
 * a test needs it - a black hole at a loopback address, with none of a routed black hole's dependence on the network.
 *
 * @param options - The peer's options; see {@link LoopbackPeerOptions}.
 *
 * @returns The listening peer.
 */
export async function createLoopbackSilentPeer({ ipv6 = false }: LoopbackPeerOptions = {}): Promise<LoopbackPeer> {

  // Every accepted socket is put in flowing mode, because a socket that is never read may never emit `close` once its peer severs it.
  return startPeer(createTcpServer((socket) => socket.resume()), { ipv6 });
}

/**
 * Build a loopback peer that accepts every connection, says nothing, and resets it a short while later.
 *
 * A TLS client dialing it completes TCP and then has its handshake reset under it, reported as `ECONNRESET` - a connection fault undici's retry interceptor treats as
 * retryable, so this is the peer that asks whether a failed connection attempt is dialed again. The delay before the reset is the window a test acts in while the
 * attempt is still in flight, and the accepted connection's `closed` is how a test knows the reset has landed.
 *
 * @param options - The peer's options; see {@link LoopbackPeerOptions}.
 *
 * @returns The listening peer.
 */
export async function createLoopbackResettingPeer({ ipv6 = false }: LoopbackPeerOptions = {}): Promise<LoopbackPeer> {

  return startPeer(createTcpServer((socket) => {

    socket.resume();

    const reset = setTimeout(() => socket.resetAndDestroy(), HANDSHAKE_RESET_DELAY_MS);

    // A connection that ends before its reset is due, severed by the client or by disposal, has nothing left to reset.
    socket.once("close", () => clearTimeout(reset));
  }), { ipv6 });
}

/**
 * Build a loopback peer, over plain TCP, that reads each HTTP request's head and hands its connection to `onRequest`, which answers it, resets it or leaves it be.
 *
 * Writing the answer at the socket level is what lets a test choose what a response asks of the connection, to stay open for the next request or to close, and act
 * on the connection at a moment of its own choosing through the accepted connection's `end` and `reset`, which an HTTP server's own keep-alive handling would decide
 * for it. A client reaches it as an `http:` origin.
 *
 * @param onRequest - What the peer does with a connection once a request's head has arrived on it.
 * @param options   - The peer's options; see {@link LoopbackPeerOptions}.
 *
 * @returns The listening peer.
 */
export async function createLoopbackScriptedPeer(onRequest: (socket: Socket) => void, { ipv6 = false }: LoopbackPeerOptions = {}): Promise<LoopbackPeer> {

  return startPeer(createTcpServer((socket) => {

    let head = "";

    socket.on("data", (chunk: Buffer) => {

      head += chunk.toString("latin1");

      if(head.includes(HEADER_TERMINATOR)) {

        head = "";
        onRequest(socket);
      }
    });
  }), { ipv6 });
}

/**
 * Build a loopback TLS peer that answers a keep-alive `200` to whatever it is sent, presenting the throwaway self-signed identity, reached through a TCP proxy that
 * pipes each client connection to it.
 *
 * The proxy is what puts the client's own TLS layer within a test's reach: the peer's connections are the proxy's client-facing ones, so `write` and each accepted
 * connection's `reset` act on the client's socket without passing the peer's TLS layer, which would otherwise encrypt the bytes and answer for the reset. Every leg
 * swallows its errors, because the client's alert over a corrupt record and a reset leg reach the peer as errors, and what a test reads is the client's side.
 *
 * @param options - The peer's options; see {@link LoopbackPeerOptions}.
 *
 * @returns The listening peer. Dispose it to end every leg and stop listening.
 */
export async function createLoopbackTlsProxyPeer({ ipv6 = false }: LoopbackPeerOptions = {}): Promise<LoopbackTlsProxyPeer> {

  const upstream = createTlsServer(identity, (socket) => {

    socket.on("error", () => undefined);
    socket.on("data", () => socket.write(KEEP_ALIVE_RESPONSE));
  });

  const peer = await startPeer(upstream, { ipv6 });
  const upstreamPort = (upstream.address() as AddressInfo).port;
  const clients = new Set<Socket>();
  const legs = new Set<Socket>();

  const proxy = await startPeer(createTcpServer((client) => {

    const leg = connectTcp(upstreamPort, ipv6 ? "::1" : "127.0.0.1");

    clients.add(client);
    legs.add(leg);
    client.once("close", () => clients.delete(client));
    leg.once("close", () => legs.delete(leg));
    leg.on("error", () => undefined);
    client.pipe(leg);
    leg.pipe(client);
  }), { ipv6 });

  // A leg to the peer outlives the client connection it served unless it is ended here, so the legs go first, then the proxy, then the peer.
  const close = async (): Promise<void> => {

    for(const leg of legs) {

      leg.destroy();
    }

    await proxy.close();
    await peer.close();
  };

  return {

    get accepted(): number {

      return proxy.accepted;
    },
    close,
    connection: async (index: number): Promise<LoopbackConnection> => proxy.connection(index),
    host: proxy.host,
    write: (bytes: Buffer): void => {

      for(const client of clients) {

        client.write(bytes);
      }
    },
    [Symbol.asyncDispose]: close
  };
}

/**
 * Build a loopback TLS peer that speaks just enough of the WebSocket protocol for a session to connect to it: it completes the RFC 6455 upgrade by hand and then holds
 * the connection, sending no frames of its own.
 *
 * Holding rather than conversing is the whole point. Every WebSocket URL this library connects to is `wss://` - the events URL by construction, and the negotiated
 * livestream and talkback URLs as the controller mints them - so reaching a session's own socket path takes a real TLS peer, and what these tests ask is whether the
 * handshake completes at all - which the client's `open` event answers on its own - and whether a teardown ends the connection, which a peer that never answers the
 * close frame leaves to the client alone. The frame protocol above the socket is the injected-fake suites' subject, not this peer's.
 *
 * A peer built with `resetUpgrade` answers no upgrade: it resets each connection once the request has arrived, so the client's TLS handshake completes and its
 * WebSocket never opens, the one stage at which a dropped connection is neither a failed dial nor the loss of an open socket.
 *
 * @param options - The peer's options; see {@link LoopbackWebSocketPeerOptions}.
 *
 * @returns The listening peer.
 */
export async function createLoopbackWebSocketPeer({ ipv6 = false, resetUpgrade = false }: LoopbackWebSocketPeerOptions = {}): Promise<LoopbackTlsPeer> {

  // The peer offers only http/1.1 over ALPN because the WebSocket upgrade it answers by hand is an HTTP/1.1 exchange.
  const server = createTlsServer({ ALPNProtocols: ["http/1.1"], ...identity });

  // The TCP socket beneath each TLS connection, by the client's port, which is how a peer that resets the upgrade reaches past its own TLS layer: a reset is a TCP
  // act, and the TLS socket above it has no way to send one.
  const accepted = new Map<number | undefined, Socket>();

  if(resetUpgrade) {

    server.on("connection", (socket: Socket) => {

      const port = socket.remotePort;

      accepted.set(port, socket);
      socket.once("close", () => accepted.delete(port));
    });
  }

  server.on("secureConnection", (socket) => {

    let buffered = Buffer.alloc(0);
    let upgraded = false;

    // A client severing its end of the connection is what every one of these tests arranges on teardown, so the reset it raises here is expected rather than a fault.
    socket.on("error", () => undefined);

    socket.on("data", (chunk: Buffer) => {

      // Once the upgrade is answered the peer simply reads and discards: the client's frames (a close frame above all) need no reply for its own teardown to complete.
      if(upgraded) {

        return;
      }

      buffered = Buffer.concat([ buffered, chunk ]);

      const boundary = buffered.indexOf(HEADER_TERMINATOR);

      if(boundary < 0) {

        return;
      }

      if(resetUpgrade) {

        accepted.get(socket.remotePort)?.resetAndDestroy();

        return;
      }

      const key = (/^sec-websocket-key: *(\S+)/im).exec(buffered.subarray(0, boundary).toString("latin1"))?.[1] ?? "";

      upgraded = true;
      socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + acceptDigest(key) + HEADER_TERMINATOR);
    });
  });

  return startPeer(server, { ipv6 });
}

/**
 * A connector that dials through `connector` and keeps each socket a successful dial vends, so a test can read or act on the established socket itself. It wraps
 * the callback rather than the connector, so the connector's own listeners are on the socket before the test's copy of it is kept.
 *
 * @param connector - The connector to dial through, the library's own or homebridge-plugin-utils'.
 * @param vended    - Where each vended socket is kept, in dial order.
 *
 * @returns The connector to hand an `Agent`.
 */
export function keepingVended(connector: { readonly connect: buildConnector.connector }, vended: Socket[]): buildConnector.connector {

  return (options, callback): void => connector.connect(options, (...args) => {

    const [ error, socket ] = args;

    if(error === null) {

      vended.push(socket);
    }

    callback(...args);
  });
}

/**
 * The sockets undici's clients establish while a capture is held, in connection order. A socket a library object holds privately is read here, at the moment a row
 * asks about it - inside a listener, say, where it is destroyed already or not yet - rather than at the peer, which learns of a severance only on a later
 * turn. Dispose the capture, ordinarily through `using`, to stop it.
 */
export interface AnnouncedSockets extends Disposable {

  readonly sockets: readonly Socket[];
}

/**
 * Capture every socket an undici client establishes from undici's own announcement of each connection, until the capture is disposed.
 *
 * @returns The capture, its sockets filling in as each connection is announced.
 */
export function announcedSockets(): AnnouncedSockets {

  const sockets: Socket[] = [];
  const onConnected = (message: unknown): void => void sockets.push((message as { socket: Socket }).socket);

  subscribe(CLIENT_CONNECTED_CHANNEL, onConnected);

  return { [Symbol.dispose]: (): void => void unsubscribe(CLIENT_CONNECTED_CHANNEL, onConnected), sockets };
}

/**
 * Issue one request through `dispatcher` and drain its body, so the connection returns to the pool rather than staying checked out.
 *
 * @param dispatcher - The dispatcher to send through.
 * @param origin     - The origin to send to.
 *
 * @returns The status the peer answered with.
 */
export async function fetchStatus(dispatcher: Dispatcher, origin: string): Promise<number> {

  const response = await request(origin + "/", { dispatcher });

  await response.body.text();

  return response.statusCode;
}

// The handshake's proof that the peer speaks the protocol: the client's key concatenated with the RFC's fixed value, hashed and encoded. A client that does not see its
// own key echoed back this way refuses the connection, which is why the peer cannot simply answer 101 and be done.
function acceptDigest(key: string): string {

  return createHash("sha1").update(key + WEBSOCKET_ACCEPT_GUID).digest("base64");
}

// The arrival-order bookkeeping every peer here shares: values recorded in the order they arrive, and an accessor that resolves with the one at a given position
// whether it has already arrived or is still to come. Arming against a value before the client produces it is what these tests need, because severance lands within
// milliseconds of a teardown and a listener attached after the fact would miss the very event it exists to observe.
interface Ledger<T> {

  readonly count: number;
  at(index: number): Promise<T>;
  record(value: T): void;
}

function createLedger<T>(): Ledger<T> {

  const values: T[] = [];
  const waiting = new Map<number, (value: T) => void>();

  return {

    at: async (index: number): Promise<T> => {

      const arrived = values[index];

      if(arrived !== undefined) {

        return arrived;
      }

      const { promise, resolve } = Promise.withResolvers<T>();

      waiting.set(index, resolve);

      return promise;
    },
    get count(): number {

      return values.length;
    },
    record: (value: T): void => {

      const index = values.length;

      values.push(value);
      waiting.get(index)?.(value);
      waiting.delete(index);
    }
  };
}

// Bind the server to an ephemeral port on the loopback address of the family asked for and wrap it as a disposable peer. Shared by every peer above so the listen,
// address, accept-order and teardown semantics are identical whichever protocol runs on top, or none.
async function startPeer(server: Server, { ipv6 }: Required<LoopbackPeerOptions>): Promise<LoopbackTlsPeer> {

  const connections = createLedger<LoopbackConnection>();
  const listening = Promise.withResolvers<undefined>();
  const protocols = createLedger<string | false | null>();
  const sockets: Socket[] = [];
  const waitingOnHandshakes = new Map<number, (value: undefined) => void>();

  // Handshakes are counted above the TCP layer, so the count rises only for a client that accepted the certificate, and the protocol each one negotiated is recorded
  // in the same order. A server with no TLS above it never reaches this event, so its count stays at zero.
  server.on("secureConnection", (socket: TLSSocket) => {

    protocols.record(socket.alpnProtocol);

    for(const [ count, resolve ] of waitingOnHandshakes) {

      if(protocols.count >= count) {

        waitingOnHandshakes.delete(count);
        resolve(undefined);
      }
    }
  });

  /* Every accepted connection is recorded at the raw TCP layer, which every peer reaches through the same event, which severing at teardown reaches whether or not the
   * TLS handshake above it ever completed, and which a client that refuses the certificate still reaches on its way to hanging up.
   */
  server.on("connection", (socket: Socket) => {

    const closed = Promise.withResolvers<undefined>();

    sockets.push(socket);
    socket.once("close", () => closed.resolve(undefined));

    // A client severing its end is what these tests arrange, so the reset it raises here is expected rather than a fault.
    socket.on("error", () => undefined);

    connections.record({

      closed: closed.promise.then(() => undefined),
      end: (): void => {

        socket.end();
      },
      reset: (): void => {

        socket.resetAndDestroy();
      }
    });
  });

  server.listen(0, ipv6 ? "::1" : "127.0.0.1", () => listening.resolve(undefined));

  await listening.promise;

  const address = server.address();

  if((address === null) || (typeof address === "string")) {

    throw new Error("The loopback peer did not report a TCP address.");
  }

  const close = async (): Promise<void> => {

    // Severing before closing rather than after: close() resolves only once every connection has ended, and a client holding a keepalive connection open is exactly
    // the state these tests leave behind.
    for(const socket of sockets) {

      socket.destroy();
    }

    const stopped = Promise.withResolvers<undefined>();

    server.close(() => stopped.resolve(undefined));

    await stopped.promise;
  };

  return {

    get accepted(): number {

      return connections.count;
    },
    close,
    connection: async (index: number): Promise<LoopbackConnection> => connections.at(index),
    get handshakes(): number {

      return protocols.count;
    },
    host: (ipv6 ? "[::1]:" : "127.0.0.1:") + address.port.toString(),
    protocol: async (index: number): Promise<string | false | null> => protocols.at(index),
    whenHandshakes: async (count: number): Promise<void> => {

      if(protocols.count >= count) {

        return;
      }

      const { promise, resolve } = Promise.withResolvers<undefined>();

      waitingOnHandshakes.set(count, resolve);

      await promise;
    },
    [Symbol.asyncDispose]: close
  };
}
