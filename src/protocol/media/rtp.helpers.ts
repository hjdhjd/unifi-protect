/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * rtp.helpers.ts: The test reader of an RTP packet - every field of its fixed header and its payload, read as RFC 3550 § 5.1 lays them out, independently of the
 * writer, so a suite holds what the writer wrote to the RFC rather than to itself.
 */

// Every field of an RTP packet's fixed header, and the payload after it.
export interface ReadRtpPacket {

  readonly csrcCount: number;
  readonly extension: number;
  readonly marker: number;
  readonly padding: number;
  readonly payload: Buffer;
  readonly payloadType: number;
  readonly sequence: number;
  readonly ssrc: number;
  readonly timestamp: number;
  readonly version: number;
}

// Read an RTP packet whose fixed header carries no contributing sources, as every packet the library writes does.
export function readRtpPacket(packet: Buffer): ReadRtpPacket {

  const first = packet.readUInt8(0);
  const second = packet.readUInt8(1);

  return {

    csrcCount: first & 0x0f,
    extension: (first >> 4) & 0x01,
    marker: second >> 7,
    padding: (first >> 5) & 0x01,
    payload: packet.subarray(12),
    payloadType: second & 0x7f,
    sequence: packet.readUInt16BE(2),
    ssrc: packet.readUInt32BE(8),
    timestamp: packet.readUInt32BE(4),
    version: first >> 6
  };
}
