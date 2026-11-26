/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * opus.test.ts: Tests for the Opus reader - the channel count a TOC byte states, the dOps record and label for mono and stereo, and the refusal of an empty packet.
 */
import { OPUS_DECODE_RATE, opusChannels, readOpusConfiguration } from "./opus.ts";
import { describe, test } from "node:test";
import { ProtectProtocolError } from "../../../shared/errors.ts";
import assert from "node:assert/strict";
import { opusPacket } from "./codecs.helpers.ts";

// A configuration 13 packet coded in mono, TOC `68`, and a configuration 12 packet coded in stereo, TOC `64`. Each TOC byte's bit 0x08 is the opposite of its stereo
// flag, so a reader of the wrong bit reads each the other way.
const MONO = opusPacket({ config: 13, payload: Buffer.from([ 0x0b, 0xe4, 0xc1 ]), stereo: false });
const STEREO = opusPacket({ config: 12, frameCountCode: 1, payload: Buffer.from([ 0x7c, 0x10 ]), stereo: true });

describe("opusChannels", () => {

  test("reads one channel from a TOC byte whose stereo flag is clear and two from one whose flag is set", () => {

    assert.deepEqual([ MONO[0], STEREO[0] ], [ 0x68, 0x65 ]);
    assert.equal(opusChannels(MONO), 1);
    assert.equal(opusChannels(STEREO), 2);
  });

  test("refuses an empty packet", () => {

    assert.throws(() => opusChannels(Buffer.alloc(0)), { constructor: ProtectProtocolError, message: /empty/ });
  });
});

describe("readOpusConfiguration", () => {

  test("a mono packet writes the dOps payload with one output channel, a pre-skip of 3840 and an input rate of 48000, and the label opus", () => {

    assert.deepEqual(readOpusConfiguration(MONO), { channels: 1, codec: "opus", label: "opus",
      record: Buffer.from([ 0x00, 0x01, 0x0f, 0x00, 0x00, 0x00, 0xbb, 0x80, 0x00, 0x00, 0x00 ]), sampleRate: OPUS_DECODE_RATE });
  });

  test("a stereo packet writes the same dOps payload with two output channels", () => {

    assert.deepEqual(readOpusConfiguration(STEREO), { channels: 2, codec: "opus", label: "opus",
      record: Buffer.from([ 0x00, 0x02, 0x0f, 0x00, 0x00, 0x00, 0xbb, 0x80, 0x00, 0x00, 0x00 ]), sampleRate: 48000 });
  });

  test("refuses an empty packet", () => {

    assert.throws(() => readOpusConfiguration(Buffer.alloc(0)), ProtectProtocolError);
  });
});
