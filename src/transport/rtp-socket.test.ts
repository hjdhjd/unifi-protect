/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * rtp-socket.test.ts: Tests for the talkback RTP socket over a loopback receiver - its open, the RTP header of every datagram it sends and the sequence number and
 * timestamp it advances, the refusal of a chunk that is not one Opus packet, each of its error paths (the ICMP refusal of a closed port through the socket's event and
 * an oversize datagram through the send callback), the contract it keeps after close, an IPv6 receiver, and the UDP socket it releases.
 */
import type { ProtectWebSocketCloseEvent, ProtectWebSocketErrorEvent } from "./ws.ts";
import { activeResources, expectAt } from "../shared/testing.helpers.ts";
import { closedUdpPort, createLoopbackUdpReceiver } from "./udp-peer.helpers.ts";
import { describe, test } from "node:test";
import { ProtectProtocolError } from "../shared/errors.ts";
import { RtpTalkbackSocket } from "./rtp-socket.ts";
import assert from "node:assert/strict";
import { opusPacket } from "../protocol/media/codecs/codecs.helpers.ts";
import { readRtpPacket } from "../protocol/media/rtp.helpers.ts";
import { settle } from "homebridge-plugin-utils/testing";

// Synthetic Opus packets of known durations, a TOC byte and filler: configuration 19 is a CELT-only 20 ms frame, 960 samples, and configuration 3 a SILK-only 60 ms
// frame, 2880 samples.
const CELT_20MS = opusPacket({ config: 19, payload: Buffer.from([ 0x11, 0x22, 0x33 ]), stereo: false });
const SILK_60MS = opusPacket({ config: 3, payload: Buffer.from([ 0x44, 0x55 ]), stereo: false });

// A synthetic Opus packet whose datagram, its twelve-byte header ahead of it, is 65508 bytes, one past the largest a UDP datagram over IPv4 carries.
const OVERSIZE = Buffer.concat([ Buffer.from([19 << 3]), Buffer.alloc(65495, 0x5a) ]);

// A socket scoped to the row that opened it: disposing the scope closes the socket and waits until the UDP socket it bound is let go, so a row that fails partway
// leaves nothing open to hold the process, and every row counts open sockets from a settled start.
interface ScopedSocket extends AsyncDisposable {

  readonly socket: RtpTalkbackSocket;
}

function scope(endpoint: { host: string; port: number }): ScopedSocket {

  const held = activeResources("UDPWrap");
  const socket = new RtpTalkbackSocket(endpoint);

  return {

    socket,
    [Symbol.asyncDispose]: async (): Promise<void> => {

      socket.close();

      await expectAt(() => activeResources("UDPWrap") <= held, { message: "expected the closed socket to be let go" });
    }
  };
}

// Build a scoped socket to a listener and wait for its open.
async function openSocket(endpoint: { host: string; port: number }): Promise<ScopedSocket> {

  const scoped = scope(endpoint);
  const opened = Promise.withResolvers<undefined>();

  scoped.socket.addEventListener("open", () => opened.resolve(undefined), { once: true });

  await opened.promise;

  return scoped;
}

// The error events a socket reports, collected as they arrive.
function collectErrors(socket: RtpTalkbackSocket): ProtectWebSocketErrorEvent[] {

  const errors: ProtectWebSocketErrorEvent[] = [];

  socket.addEventListener("error", (event) => void errors.push(event));

  return errors;
}

// The error code an error event carries as its cause.
function causeCode(event: ProtectWebSocketErrorEvent | undefined): unknown {

  return (event?.error as NodeJS.ErrnoException | undefined)?.code;
}

describe("RtpTalkbackSocket", () => {

  test("opens once its connect completes and sends each Opus packet as one datagram whose every RTP header field reads as the RFCs state", async () => {

    await using receiver = await createLoopbackUdpReceiver();
    await using scoped = await openSocket(receiver);
    const { socket } = scoped;

    socket.send(CELT_20MS);
    socket.send(SILK_60MS);
    socket.send(CELT_20MS);

    await expectAt(() => receiver.datagrams.length === 3, { message: "expected the receiver to hold every datagram" });

    const [ first, second, third ] = receiver.datagrams.map((datagram) => readRtpPacket(datagram));

    assert.ok((first !== undefined) && (second !== undefined) && (third !== undefined));

    for(const packet of [ first, second, third ]) {

      assert.deepEqual({ csrcCount: packet.csrcCount, extension: packet.extension, marker: packet.marker, padding: packet.padding, payloadType: packet.payloadType,
        version: packet.version }, { csrcCount: 0, extension: 0, marker: 0, padding: 0, payloadType: 111, version: 2 });
    }

    assert.deepEqual([ first.payload, second.payload, third.payload ], [ CELT_20MS, SILK_60MS, CELT_20MS ], "each datagram carries its packet whole");
    assert.equal(second.sequence, (first.sequence + 1) & 0xffff, "the sequence number counts up by one");
    assert.equal(third.sequence, (second.sequence + 1) & 0xffff);
    assert.equal(second.timestamp, (first.timestamp + 960) >>> 0, "the timestamp advances by the first packet's 20 ms at 48 kHz");
    assert.equal(third.timestamp, (second.timestamp + 2880) >>> 0, "the timestamp advances by the second packet's 60 ms at 48 kHz");
    assert.equal(new Set([ first.ssrc, second.ssrc, third.ssrc ]).size, 1, "every datagram carries the stream's one SSRC");
  });

  test("each socket seeds its sequence number, timestamp and SSRC apart from another's", async () => {

    await using receiver = await createLoopbackUdpReceiver();
    await using first = await openSocket(receiver);
    await using second = await openSocket(receiver);

    first.socket.send(CELT_20MS);
    await expectAt(() => receiver.datagrams.length === 1);
    second.socket.send(CELT_20MS);
    await expectAt(() => receiver.datagrams.length === 2);

    const [ one, two ] = receiver.datagrams.map((datagram) => readRtpPacket(datagram));

    assert.ok((one !== undefined) && (two !== undefined));
    assert.notDeepEqual([ one.sequence, one.timestamp, one.ssrc ], [ two.sequence, two.timestamp, two.ssrc ], "each socket's stream is seeded at random");
  });

  test("a chunk that is not one Opus packet throws ProtectProtocolError and writes nothing, leaving the stream where it was", async () => {

    await using receiver = await createLoopbackUdpReceiver();
    await using scoped = await openSocket(receiver);
    const { socket } = scoped;

    socket.send(CELT_20MS);
    assert.throws(() => socket.send(new Uint8Array()), ProtectProtocolError);
    assert.throws(() => socket.send(opusPacket({ config: 19, frameCountCode: 3, payload: Buffer.from([0x00]), stereo: false })), ProtectProtocolError);
    socket.send(CELT_20MS);

    await expectAt(() => receiver.datagrams.length === 2, { message: "expected the receiver to hold the valid packets alone" });
    await settle();

    const [ first, second ] = receiver.datagrams.map((datagram) => readRtpPacket(datagram));

    assert.equal(receiver.datagrams.length, 2, "a refused chunk sends nothing");
    assert.ok((first !== undefined) && (second !== undefined));
    assert.equal(second.sequence, (first.sequence + 1) & 0xffff, "a refused chunk takes no sequence number");
    assert.equal(second.timestamp, (first.timestamp + 960) >>> 0, "a refused chunk advances no timestamp");
  });

  test("a closed port's ICMP refusal reaches the error listener as ECONNREFUSED through the socket's error event", async () => {

    await using scoped = await openSocket(await closedUdpPort());
    const errors = collectErrors(scoped.socket);

    scoped.socket.send(CELT_20MS);

    await expectAt(() => errors.length > 0, { message: "expected the refusal to reach the error listener" });

    assert.equal(causeCode(errors[0]), "ECONNREFUSED");
  });

  test("a datagram past 65507 bytes reaches the error listener as EMSGSIZE through the send callback", async () => {

    await using receiver = await createLoopbackUdpReceiver();
    await using scoped = await openSocket(receiver);
    const errors = collectErrors(scoped.socket);

    scoped.socket.send(OVERSIZE);

    await expectAt(() => errors.length > 0, { message: "expected the oversize send to reach the error listener" });

    assert.equal(causeCode(errors[0]), "EMSGSIZE");
    assert.equal(receiver.datagrams.length, 0);
  });

  test("once closed it discards sends, reads a bufferedAmount of 0, reports nothing, and is safe to close again", async () => {

    await using receiver = await createLoopbackUdpReceiver();
    await using scoped = await openSocket(receiver);
    const { socket } = scoped;
    const errors = collectErrors(socket);
    const closes: ProtectWebSocketCloseEvent[] = [];

    socket.addEventListener("close", (event) => void closes.push(event));

    assert.equal(socket.bufferedAmount, 0, "an idle loopback socket's send queue is empty");

    socket.close();
    socket.close();
    socket.send(CELT_20MS);
    socket.send(new Uint8Array());

    await settle();
    await settle();

    assert.equal(socket.bufferedAmount, 0);
    assert.equal(receiver.datagrams.length, 0, "a send after close reaches nothing");
    assert.deepEqual(errors, [], "a closed socket reports no error");
    assert.deepEqual(closes, [], "a UDP socket reports no close, having no peer to close it");
  });

  test("a failure that lands once the socket has closed is discarded, the close having stopped every report at once", async () => {

    await using receiver = await createLoopbackUdpReceiver();
    await using scoped = await openSocket(receiver);
    const { socket } = scoped;
    const errors = collectErrors(socket);

    // The oversize send's completion arrives a turn after the send, so closing in the same turn lands its failure on a closed socket.
    socket.send(OVERSIZE);
    socket.close();

    await settle();
    await settle();

    assert.deepEqual(errors, [], "a failure after close reaches no listener");
  });

  test("a failure with no error listener is dropped rather than thrown, and the next failure reaches a listener added later", async () => {

    await using receiver = await createLoopbackUdpReceiver();
    await using scoped = await openSocket(receiver);
    const { socket } = scoped;

    socket.send(OVERSIZE);

    await settle();
    await settle();

    const errors = collectErrors(socket);

    socket.send(OVERSIZE);

    await expectAt(() => errors.length === 1, { message: "expected the second oversize send to reach the listener added after the first" });

    assert.equal(causeCode(errors[0]), "EMSGSIZE");
  });

  test("a socket closed before its connect completes never opens, reports nothing and is let go", async () => {

    await using receiver = await createLoopbackUdpReceiver();
    const before = activeResources("UDPWrap");
    const socket = new RtpTalkbackSocket(receiver);
    let opened = false;

    socket.addEventListener("open", () => (opened = true));

    const errors = collectErrors(socket);

    assert.equal(socket.bufferedAmount, 0, "a socket still connecting reads no queue");

    socket.close();

    await expectAt(() => activeResources("UDPWrap") === before, { message: "expected the socket closed behind its bind to be let go" });
    await settle();

    assert.equal(opened, false);
    assert.deepEqual(errors, []);
  });

  test("an IPv6 listener on ::1 receives its datagrams over udp6", async () => {

    await using receiver = await createLoopbackUdpReceiver({ ipv6: true });
    await using scoped = await openSocket(receiver);

    scoped.socket.send(CELT_20MS);

    await expectAt(() => receiver.datagrams.length === 1, { message: "expected the IPv6 receiver to hold the datagram" });

    assert.deepEqual(readRtpPacket(receiver.datagrams[0] ?? Buffer.alloc(12)).payload, CELT_20MS);
  });

  test("close releases the UDP socket it bound", async () => {

    await using receiver = await createLoopbackUdpReceiver();

    const before = activeResources("UDPWrap");

    await using scoped = await openSocket(receiver);

    assert.equal(activeResources("UDPWrap"), before + 1, "the open socket holds one UDP socket");

    scoped.socket.close();

    await expectAt(() => activeResources("UDPWrap") === before, { message: "expected close to release the UDP socket" });
  });

  test("a listener removed by identity hears nothing more, and a once listener hears only the first failure", async () => {

    await using receiver = await createLoopbackUdpReceiver();
    await using scoped = await openSocket(receiver);
    const { socket } = scoped;
    const removed: ProtectWebSocketErrorEvent[] = [];
    const onError = (event: ProtectWebSocketErrorEvent): void => void removed.push(event);
    const once: ProtectWebSocketErrorEvent[] = [];
    const kept = collectErrors(socket);

    socket.addEventListener("error", onError);
    socket.removeEventListener("error", onError);
    socket.addEventListener("error", (event) => void once.push(event), { once: true });

    socket.send(OVERSIZE);
    await expectAt(() => kept.length === 1, { message: "expected the first oversize send to fail" });
    socket.send(OVERSIZE);
    await expectAt(() => kept.length === 2, { message: "expected the second oversize send to fail" });

    assert.deepEqual(removed, []);
    assert.equal(once.length, 1);
  });
});
