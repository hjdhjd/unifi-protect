/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * ogg.helpers.ts: The test builders of an Ogg Opus stream - synthetic identification and comment packets, and the pages a run of packets is laced into, each page's
 * CRC left zero because the reader checks none - which the Ogg reader's suite and the CLI's talkback rows share.
 */

// A synthetic OpusHead identification packet (RFC 7845 § 5.1): version 1, mono, a pre-skip of 3840, an input rate of 48000, no gain, mapping family 0.
export function opusHead(): Buffer {

  const packet = Buffer.alloc(19);

  packet.write("OpusHead", 0, "latin1");
  packet.writeUInt8(1, 8);
  packet.writeUInt8(1, 9);
  packet.writeUInt16LE(3840, 10);
  packet.writeUInt32LE(48000, 12);

  return packet;
}

// A synthetic OpusTags comment packet (RFC 7845 § 5.2) with a vendor string of the given length and no comments, long enough to span pages when a test asks.
export function opusTags(vendorLength = 9): Buffer {

  return Buffer.concat([ Buffer.from("OpusTags", "latin1"), u32le(vendorLength), Buffer.alloc(vendorLength, 0x76), u32le(0) ]);
}

// Lace packets into the pages of one logical stream (RFC 3533 § 6): each packet's lacing values, 255 for every whole 255 bytes and then the remainder, so a packet a
// multiple of 255 long ends on a 0, laid across pages of at most `segmentsPerPage` segments each, a page that opens inside a packet flagged as its continuation, the
// first page flagged as the stream's opening and the last as its end.
export function oggPages(packets: readonly Uint8Array[], { segmentsPerPage = 255, serial = 1 }: { segmentsPerPage?: number; serial?: number } = {}): Buffer[] {

  const segments: { data: Buffer; ends: boolean }[] = [];

  for(const packet of packets) {

    for(let offset = 0; ; offset += 255) {

      const data = Buffer.from(packet.subarray(offset, offset + 255));

      segments.push({ data, ends: data.length < 255 });

      if(data.length < 255) {

        break;
      }
    }
  }

  const pages: Buffer[] = [];

  for(let start = 0; start < segments.length; start += segmentsPerPage) {

    const laced = segments.slice(start, start + segmentsPerPage);
    const continued = (start > 0) && !(segments[start - 1]?.ends ?? true);
    const type = (continued ? 0x01 : 0) | ((start === 0) ? 0x02 : 0) | (((start + segmentsPerPage) >= segments.length) ? 0x04 : 0);
    const header = Buffer.alloc(27);

    header.write("OggS", 0, "latin1");
    header.writeUInt8(type, 5);
    header.writeUInt32LE(serial, 14);
    header.writeUInt32LE(pages.length, 18);
    header.writeUInt8(laced.length, 26);

    pages.push(Buffer.concat([ header, Buffer.from(laced.map(({ data }) => data.length)), ...laced.map(({ data }) => data) ]));
  }

  return pages;
}

// An unsigned 32-bit little-endian integer.
function u32le(value: number): Buffer {

  const bytes = Buffer.alloc(4);

  bytes.writeUInt32LE(value);

  return bytes;
}
