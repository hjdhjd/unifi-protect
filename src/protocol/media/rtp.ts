/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * rtp.ts: The RTP writer - one packet's fixed header and its payload in one buffer, and the advances of a stream's sequence number and timestamp.
 */

/**
 * The RTP writer: one packet's fixed header and its payload in one buffer, and the advances of a stream's sequence number and timestamp. This module is Layer 1: no
 * I/O, no time, no side effects - a header and a payload in, one packet out.
 *
 * Every packet opens with the twelve-byte fixed header (RFC 3550 § 5.1), every field big-endian:
 *
 * | Byte offset | Field           | Bits | Values                                                                                     |
 * |-------------|-----------------|------|--------------------------------------------------------------------------------------------|
 * | 0           | version         | 2    | 2                                                                                          |
 * | 0           | padding         | 1    | 0: the payload is never padded                                                             |
 * | 0           | extension       | 1    | 0: no header extension follows                                                             |
 * | 0           | CSRC count      | 4    | 0: one source, so no contributing-source list follows                                      |
 * | 1           | marker          | 1    | 0: a stream sent without silence suppression marks no talkspurt (RFC 3551 § 4.1)           |
 * | 1           | payload type    | 7    | the stream's payload type                                                                  |
 * | 2-3         | sequence number | 16   | one more than the packet before it, wrapping at 65536                                      |
 * | 4-7         | timestamp       | 32   | the stream's clock at the packet's first sample, wrapping at 2^32                          |
 * | 8-11        | SSRC            | 32   | the stream's synchronization source                                                        |
 *
 * The stream the library writes carries Opus to a camera's speaker: payload type 111, the dynamic type the camera's talkback listener plays as Opus, on the clock RFC
 * 7587 § 4.1 gives Opus, 48000 ticks a second whatever rate the audio was encoded at, so each packet advances the timestamp by its duration at the decode rate.
 *
 * @module ProtectRtp
 */

// The fixed header's length, and its first byte: version 2 in the top two bits, with the padding, extension and CSRC count fields all zero.
const RTP_HEADER_SIZE = 12;
const RTP_VERSION_BYTE = 0x80;

// The payload type the payload-type field's seven bits leave room for, and the sequence number's sixteen bits.
const PAYLOAD_TYPE_MASK = 0x7f;
const SEQUENCE_MASK = 0xffff;

/**
 * The payload type a camera's talkback listener plays as Opus, which every packet the library sends it carries.
 *
 * @category Codec
 */
export const OPUS_RTP_PAYLOAD_TYPE = 111;

/**
 * The fields of an RTP fixed header a sender varies: the payload type, the packet's sequence number and timestamp, and the stream's synchronization source. Every
 * other field is fixed, as the module's table states.
 *
 * @category Codec
 */
export interface RtpHeader {

  readonly payloadType: number;
  readonly sequence: number;
  readonly ssrc: number;
  readonly timestamp: number;
}

/**
 * Write one RTP packet: the fixed header and then the payload, in one allocation.
 *
 * @param header  - The header's varying fields.
 * @param payload - The packet's payload. Accepts any `Uint8Array` (a `Buffer` included) and copies it once, into the packet.
 *
 * @returns The packet, twelve bytes longer than its payload.
 *
 * @category Codec
 */
export function writeRtpPacket(header: RtpHeader, payload: Uint8Array): Buffer {

  const packet = Buffer.allocUnsafe(RTP_HEADER_SIZE + payload.length);

  packet.writeUInt8(RTP_VERSION_BYTE, 0);
  packet.writeUInt8(header.payloadType & PAYLOAD_TYPE_MASK, 1);
  packet.writeUInt16BE(header.sequence & SEQUENCE_MASK, 2);
  packet.writeUInt32BE(header.timestamp >>> 0, 4);
  packet.writeUInt32BE(header.ssrc >>> 0, 8);
  packet.set(payload, RTP_HEADER_SIZE);

  return packet;
}

/**
 * The sequence number of the packet after one numbered `sequence`, wrapping from 65535 to 0.
 *
 * @param sequence - The packet's sequence number.
 *
 * @returns The next packet's sequence number.
 *
 * @category Codec
 */
export function nextRtpSequence(sequence: number): number {

  return (sequence + 1) & SEQUENCE_MASK;
}

/**
 * The timestamp of the packet after one stamped `timestamp` that holds `samples` ticks of audio, wrapping at 2^32.
 *
 * @param timestamp - The packet's timestamp.
 * @param samples   - The packet's duration, in ticks of the stream's clock.
 *
 * @returns The next packet's timestamp.
 *
 * @category Codec
 */
export function nextRtpTimestamp(timestamp: number, samples: number): number {

  return (timestamp + samples) >>> 0;
}
