/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * opus.test.ts: Tests for the Opus reader - the channel count a TOC byte states, the duration it states for every configuration and frame count code with the
 * refusals of a packet whose duration cannot be read or runs past 120 ms, the dOps record and label for mono and stereo, and the refusal of an empty packet.
 */
import { OPUS_DECODE_RATE, opusChannels, opusPacketDuration, readOpusConfiguration } from "./opus.ts";
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

describe("opusPacketDuration", () => {

  // The frame duration RFC 6716 Table 2 gives each of the 32 configurations, in milliseconds, written out from the table rather than derived: SILK-only 0 to 11,
  // hybrid 12 to 15, and CELT-only 16 to 31.
  const TABLE_2_MS = [ 10, 20, 40, 60, 10, 20, 40, 60, 10, 20, 40, 60, 10, 20, 10, 20, 2.5, 5, 10, 20, 2.5, 5, 10, 20, 2.5, 5, 10, 20, 2.5, 5, 10, 20 ];

  // Samples at the decode rate in one millisecond.
  const SAMPLES_PER_MS = OPUS_DECODE_RATE / 1000;

  for(const [ config, ms ] of TABLE_2_MS.entries()) {

    test("a code-0 packet of configuration " + String(config) + " holds one " + String(ms) + " ms frame", () => {

      assert.equal(opusPacketDuration(opusPacket({ config, payload: Buffer.from([0x5a]), stereo: false })), ms * SAMPLES_PER_MS);
    });
  }

  test("codes 1 and 2 hold two frames, and code 3 holds the count its second byte states, the stereo flag reading no differently", () => {

    // Configuration 19 is a CELT-only 20 ms frame, 960 samples, and configuration 3 a SILK-only 60 ms frame, 2880 samples.
    assert.equal(opusPacketDuration(opusPacket({ config: 19, frameCountCode: 1, payload: Buffer.from([ 0x5a, 0x5a ]), stereo: true })), 1920);
    assert.equal(opusPacketDuration(opusPacket({ config: 19, frameCountCode: 2, payload: Buffer.from([ 0x01, 0x5a, 0x5a ]), stereo: false })), 1920);
    assert.equal(opusPacketDuration(opusPacket({ config: 19, frameCountCode: 3, payload: Buffer.from([ 0x05, 0x5a ]), stereo: false })), 4800);
    assert.equal(opusPacketDuration(opusPacket({ config: 3, frameCountCode: 1, payload: Buffer.from([0x5a]), stereo: false })), 5760);
  });

  test("a code-3 count byte's VBR and padding flags are read past, so its low six bits alone count the frames", () => {

    // 0xc3 sets the VBR flag and the padding flag above a count of 3, and 0x83 the VBR flag alone.
    assert.equal(opusPacketDuration(opusPacket({ config: 18, frameCountCode: 3, payload: Buffer.from([ 0xc3, 0x00, 0x5a ]), stereo: false })), 1440);
    assert.equal(opusPacketDuration(opusPacket({ config: 18, frameCountCode: 3, payload: Buffer.from([ 0x83, 0x5a ]), stereo: false })), 1440);
  });

  test("reads any Uint8Array, a Buffer or not", () => {

    assert.equal(opusPacketDuration(Uint8Array.of((19 << 3) | 1, 0x5a)), 1920);
  });

  test("exactly 120 ms is accepted, and one frame more is refused", () => {

    assert.equal(opusPacketDuration(opusPacket({ config: 19, frameCountCode: 3, payload: Buffer.from([0x06]), stereo: false })), 5760);
    assert.throws(() => opusPacketDuration(opusPacket({ config: 19, frameCountCode: 3, payload: Buffer.from([0x07]), stereo: false })),
      { constructor: ProtectProtocolError, message: /120 ms/ });
    assert.throws(() => opusPacketDuration(opusPacket({ config: 11, frameCountCode: 3, payload: Buffer.from([0x03]), stereo: false })),
      { constructor: ProtectProtocolError, message: /120 ms/ });
  });

  test("refuses an empty packet, a code-3 packet without its count byte, and a code-3 packet counting zero frames", () => {

    assert.throws(() => opusPacketDuration(Buffer.alloc(0)), { constructor: ProtectProtocolError, message: /empty/ });
    assert.throws(() => opusPacketDuration(opusPacket({ config: 19, frameCountCode: 3, payload: Buffer.alloc(0), stereo: false })),
      { constructor: ProtectProtocolError, message: /no frame count byte/ });
    assert.throws(() => opusPacketDuration(opusPacket({ config: 19, frameCountCode: 3, payload: Buffer.from([0x00]), stereo: false })),
      { constructor: ProtectProtocolError, message: /zero frames/ });
    assert.throws(() => opusPacketDuration(opusPacket({ config: 19, frameCountCode: 3, payload: Buffer.from([0xc0]), stereo: false })),
      { constructor: ProtectProtocolError, message: /zero frames/ });
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
