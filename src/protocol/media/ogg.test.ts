/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * ogg.test.ts: Tests for the Ogg Opus reader - the Opus packets of a stream laced into pages, cut anywhere, reassembled across pages, past an identification
 * packet and a comment packet that spans pages, on the first logical stream alone, with no CRC checked, and its refusals of a stream that lost its framing or does
 * not open with OpusHead. The streams are built from synthetic packets by the shared page builder.
 */
import { describe, test } from "node:test";
import { oggPages, opusHead, opusTags } from "./ogg.helpers.ts";
import { OggOpusReader } from "./ogg.ts";
import { ProtectProtocolError } from "../../shared/errors.ts";
import assert from "node:assert/strict";

// Synthetic Opus packets, a TOC byte and filler: a short one, one exactly 255 bytes long, so its lacing ends on a 0, and one long enough to span segments.
const SHORT = Buffer.from([ 19 << 3, 0x01, 0x02 ]);
const EXACT = Buffer.concat([ Buffer.from([19 << 3]), Buffer.alloc(254, 0x03) ]);
const LONG = Buffer.concat([ Buffer.from([19 << 3]), Buffer.alloc(700, 0x04) ]);

// A whole Ogg Opus stream of the given audio packets, as one buffer.
function stream(packets: readonly Uint8Array[], options: { segmentsPerPage?: number; tags?: Buffer } = {}): Buffer {

  return Buffer.concat(oggPages([ opusHead(), options.tags ?? opusTags(), ...packets ], { ...((options.segmentsPerPage !== undefined) &&
    { segmentsPerPage: options.segmentsPerPage }) }));
}

describe("OggOpusReader", () => {

  test("answers the stream's Opus packets in order, its identification and comment packets read past", () => {

    assert.deepEqual(new OggOpusReader().push(stream([ SHORT, EXACT, LONG ])), [ SHORT, EXACT, LONG ]);
  });

  test("a stream cut at every byte answers the same packets", () => {

    const reader = new OggOpusReader();
    const packets = [...stream([ SHORT, EXACT, LONG ])].flatMap((byte) => reader.push(Uint8Array.of(byte)));

    assert.deepEqual(packets, [ SHORT, EXACT, LONG ]);
  });

  test("a packet laced across pages is reassembled, and a comment packet spanning pages is read past", () => {

    // A page that holds few segments lays the comment packet and the long packet each across pages.
    assert.deepEqual(new OggOpusReader().push(stream([ LONG, SHORT ], { segmentsPerPage: 2, tags: opusTags(1000) })), [ LONG, SHORT ]);
  });

  test("follows the first logical stream alone, reading past the pages of another", () => {

    const [ head, tags, audio ] = oggPages([ opusHead(), opusTags(), SHORT ], { segmentsPerPage: 1 });
    const [other] = oggPages([LONG], { serial: 2 });

    assert.ok((head !== undefined) && (tags !== undefined) && (audio !== undefined) && (other !== undefined));
    assert.deepEqual(new OggOpusReader().push(Buffer.concat([ head, other, tags, other, audio ])), [SHORT]);
  });

  test("checks no page CRC", () => {

    const pages = oggPages([ opusHead(), opusTags(), SHORT ]).map((page) => {

      page.writeUInt32LE(0xdeadbeef, 22);

      return page;
    });

    assert.deepEqual(new OggOpusReader().push(Buffer.concat(pages)), [SHORT]);
  });

  test("a page a chunk's end cuts is held until the chunk that completes it, and a cut packet is never answered", () => {

    const whole = stream([SHORT]);
    const reader = new OggOpusReader();

    assert.deepEqual(reader.push(whole.subarray(0, whole.length - 2)), []);
    assert.deepEqual(reader.push(whole.subarray(whole.length - 2)), [SHORT]);
  });

  test("a stream that does not open with the capture pattern, or loses it between pages, is refused", () => {

    assert.throws(() => new OggOpusReader().push(Buffer.from("OggX")), { constructor: ProtectProtocolError, message: /capture pattern/ });
    assert.throws(() => new OggOpusReader().push(Buffer.concat([ stream([SHORT]), Buffer.from("junk") ])),
      { constructor: ProtectProtocolError, message: /capture pattern/ });
  });

  test("a stream whose first packet is not OpusHead is refused", () => {

    assert.throws(() => new OggOpusReader().push(Buffer.concat(oggPages([ opusTags(), SHORT ]))), { constructor: ProtectProtocolError, message: /OpusHead/ });
  });
});
