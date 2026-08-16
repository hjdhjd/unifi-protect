/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * tls-peer.helpers.ts: Loopback TLS peers presenting a self-signed certificate - an HTTPS responder for the request path and a hand-rolled WebSocket upgrader for the
 * socket paths - so the certificate-verification option can be exercised at each construction site that owns a TLS connection.
 */
import type { Server, Socket } from "node:net";
import { loopbackCertificateFixture, loopbackPrivateKeyFixture } from "./tls.fixtures.ts";
import { createHash } from "node:crypto";
import { createServer as createHttpsServer } from "node:https";
import { createServer as createTlsServer } from "node:tls";

// The fixed value RFC 6455 defines for the handshake digest, and the blank line that ends an HTTP header block.
const WEBSOCKET_ACCEPT_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const HEADER_TERMINATOR = "\r\n\r\n";

/**
 * One connection the peer accepted, as a test observes it. `closed` is armed at accept rather than on demand, because a client that refuses the certificate severs
 * within milliseconds and a listener attached after the fact would miss the very event it exists to observe.
 */
export interface LoopbackConnection {

  readonly closed: Promise<void>;
}

/**
 * A listening loopback peer. `host` is the bare `address:port` the library's own URL builders expect, so a test hands it straight to a client as the controller
 * address. Dispose it (or call `close()`) to sever every connection and stop listening.
 *
 * `handshakes` counts the TLS handshakes that completed, which is what distinguishes a client that accepted the certificate from one that refused it: both open a TCP
 * connection, and only the accepting one gets above it. `connection(index)` resolves with the connection at that position in accept order, and `whenHandshakes(count)`
 * once that many have completed - either resolving immediately if it already happened, so a test can arm itself before the client dials or read the result after.
 */
export interface LoopbackTlsPeer extends AsyncDisposable {

  readonly handshakes: number;
  readonly host: string;
  close(): Promise<void>;
  connection(index: number): Promise<LoopbackConnection>;
  whenHandshakes(count: number): Promise<void>;
}

/**
 * Build a loopback HTTPS peer that answers any request with a 200 and a small JSON body, presenting the throwaway self-signed identity a controller's own certificate
 * stands in for.
 *
 * An `undici.MockAgent` replaces undici's dispatch wholesale, so the pool's connect options - certificate verification among them - are permanently out of its reach.
 * Establishing what the option does to a handshake therefore takes a real peer, dialed by a transport that built its own pool.
 *
 * @returns The listening peer.
 */
export async function createLoopbackHttpsPeer(): Promise<LoopbackTlsPeer> {

  const server = createHttpsServer({ cert: loopbackCertificateFixture, key: loopbackPrivateKeyFixture }, (request, response) => {

    response.writeHead(200, { "content-type": "application/json" });
    response.end("{\"ok\":true}");
  });

  return startPeer(server);
}

/**
 * Build a loopback TLS peer that speaks just enough of the WebSocket protocol for a session to connect to it: it completes the RFC 6455 upgrade by hand and then holds
 * the connection, sending no frames of its own.
 *
 * Holding rather than conversing is the whole point. Every WebSocket URL this library builds is `wss://` by construction, so reaching a session's own socket path takes
 * a real TLS peer, and what these tests ask is whether the handshake completes at all - which the client's `open` event answers on its own. The frame protocol above
 * the socket is the injected-fake suites' subject, not this peer's.
 *
 * @returns The listening peer.
 */
export async function createLoopbackWebSocketPeer(): Promise<LoopbackTlsPeer> {

  const server = createTlsServer({ ALPNProtocols: ["http/1.1"], cert: loopbackCertificateFixture, key: loopbackPrivateKeyFixture });

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

      const key = (/^sec-websocket-key: *(\S+)/im).exec(buffered.subarray(0, boundary).toString("latin1"))?.[1] ?? "";

      upgraded = true;
      socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + acceptDigest(key) + HEADER_TERMINATOR);
    });
  });

  return startPeer(server);
}

// The handshake's proof that the peer speaks the protocol: the client's key concatenated with the RFC's fixed value, hashed and encoded. A client that does not see its
// own key echoed back this way refuses the connection, which is why the peer cannot simply answer 101 and be done.
function acceptDigest(key: string): string {

  return createHash("sha1").update(key + WEBSOCKET_ACCEPT_GUID).digest("base64");
}

// Bind the server to an ephemeral loopback port and wrap it as a disposable peer. Shared by both peers above so the listen, address, and teardown semantics are
// identical whichever protocol rides on top.
async function startPeer(server: Server): Promise<LoopbackTlsPeer> {

  const connections: LoopbackConnection[] = [];
  const listening = Promise.withResolvers<undefined>();
  const sockets: Socket[] = [];
  const waiting = new Map<number, (connection: LoopbackConnection) => void>();
  const waitingOnHandshakes = new Map<number, (value: undefined) => void>();
  let handshakes = 0;

  // Handshakes are counted above the TCP layer, so the count rises only for a client that accepted the certificate.
  server.on("secureConnection", () => {

    handshakes++;

    for(const [ count, resolve ] of waitingOnHandshakes) {

      if(handshakes >= count) {

        waitingOnHandshakes.delete(count);
        resolve(undefined);
      }
    }
  });

  /* Every accepted connection is recorded at the raw TCP layer, which both peers reach through the same event, which severing at teardown reaches whether or not the
   * TLS handshake above it ever completed, and which a client that refuses the certificate still reaches on its way to hanging up.
   */
  server.on("connection", (socket: Socket) => {

    const closed = Promise.withResolvers<undefined>();
    const connection: LoopbackConnection = { closed: closed.promise.then(() => undefined) };
    const index = connections.length;

    connections.push(connection);
    sockets.push(socket);
    socket.once("close", () => closed.resolve(undefined));

    // A client severing its end is what these tests arrange, so the reset it raises here is expected rather than a fault.
    socket.on("error", () => undefined);

    waiting.get(index)?.(connection);
    waiting.delete(index);
  });

  server.listen(0, "127.0.0.1", () => listening.resolve(undefined));

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

    close,
    connection: async (index: number): Promise<LoopbackConnection> => {

      const arrived = connections[index];

      if(arrived !== undefined) {

        return arrived;
      }

      const { promise, resolve } = Promise.withResolvers<LoopbackConnection>();

      waiting.set(index, resolve);

      return promise;
    },
    get handshakes(): number {

      return handshakes;
    },
    host: "127.0.0.1:" + address.port.toString(),
    whenHandshakes: async (count: number): Promise<void> => {

      if(handshakes >= count) {

        return;
      }

      const { promise, resolve } = Promise.withResolvers<undefined>();

      waitingOnHandshakes.set(count, resolve);

      await promise;
    },
    [Symbol.asyncDispose]: close
  };
}
