/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * udp-peer.helpers.ts: Loopback UDP peers the suites drive a real RTP socket against - a receiver that records every datagram it is sent, and a loopback port nothing
 * listens on, which a connected socket's sends are refused at.
 */
import { activeResources, expectAt } from "../shared/testing.helpers.ts";
import { createSocket } from "node:dgram";
import { once } from "node:events";

// A loopback UDP receiver: the address a socket under test sends to, and every datagram it has received, in arrival order. Disposing it closes its socket and waits
// until the socket is let go.
export interface LoopbackUdpReceiver extends AsyncDisposable {

  readonly datagrams: Buffer[];
  readonly host: string;
  readonly port: number;
}

// Wait until the process holds no more UDP sockets than it did before a helper opened its own, so a helper that closes its socket leaves no release in flight for a
// later count to trip on.
async function releasedTo(held: number): Promise<void> {

  await expectAt(() => activeResources("UDPWrap") <= held, { message: "expected the helper's UDP socket to be let go" });
}

// The loopback address of each family, which a receiver binds and a closed port belongs to.
function loopbackHost(ipv6: boolean): string {

  return ipv6 ? "::1" : "127.0.0.1";
}

// Bind a receiver to a free loopback port, IPv4 unless `ipv6` asks for the IPv6 loopback.
export async function createLoopbackUdpReceiver({ ipv6 = false }: { ipv6?: boolean } = {}): Promise<LoopbackUdpReceiver> {

  const held = activeResources("UDPWrap");
  const host = loopbackHost(ipv6);
  const socket = createSocket(ipv6 ? "udp6" : "udp4");
  const datagrams: Buffer[] = [];

  socket.on("message", (datagram: Buffer) => void datagrams.push(datagram));
  socket.bind(0, host);

  await once(socket, "listening");

  return {

    datagrams,
    host,
    port: socket.address().port,
    [Symbol.asyncDispose]: async (): Promise<void> => {

      socket.close();

      await releasedTo(held);
    }
  };
}

// A loopback port nothing listens on: one a socket was bound to and then let go, so a datagram sent there draws the ICMP refusal a closed port answers with.
export async function closedUdpPort({ ipv6 = false }: { ipv6?: boolean } = {}): Promise<{ host: string; port: number }> {

  const held = activeResources("UDPWrap");
  const host = loopbackHost(ipv6);
  const socket = createSocket(ipv6 ? "udp6" : "udp4");

  socket.bind(0, host);

  await once(socket, "listening");

  const { port } = socket.address();

  socket.close();

  await releasedTo(held);

  return { host, port };
}
