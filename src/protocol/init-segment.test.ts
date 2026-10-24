/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * init-segment.test.ts: Tests for the livestream init segment reader - the captured Protect and third-party inits, the sample entry and box shapes the wire does not
 * exercise, and the never-throw contract over empty, partial and corrupted bytes.
 */
import { AI_PRO_INIT, AI_PRO_RECONNECT_INIT, AMCREST_INIT, AV1_INIT, AVC3_INIT, AVC_INIT, CHANNEL_CONFIGURATION_SEVEN_INIT, CHANNEL_CONFIGURATION_SIX_INIT,
  CORE_CODER_DELAY_INIT, CUT_LARGESIZE_HEADER_INIT, DESCRIPTOR_AFTER_OTHER_TAG_INIT, DESCRIPTOR_TAG_ON_LAST_BYTE_INIT, DOORBELL_INIT, EMPTY_BOX_INIT, EMPTY_STSD_INIT,
  ESCAPED_AAC_OBJECT_TYPE_INIT, ESCAPED_OBJECT_TYPE_INIT, ES_OPTIONAL_FIELDS_INIT, EXPLICIT_FREQUENCY_INIT, HEV1_INIT, ISO_V1_AUDIO_INIT, LARGESIZE_INIT,
  MISSING_HDLR_INIT, MISSING_TKHD_INIT, MIXDOWN_PCE_INIT, MPEG2_AAC_INIT, NESTED_TO_END_BOX_INIT, OPUS_INIT, OPUS_WITHOUT_DOPS_INIT, OVERRUNNING_DESCRIPTOR_INIT,
  OVERRUNNING_DESCRIPTOR_PAST_BUFFER_INIT, PADDED_DESCRIPTOR_INIT, PROGRAM_CONFIG_INIT, PROTECT_AV1_INIT, PS_INIT, QUICKTIME_V1_INIT, QUICKTIME_V2_INIT,
  RESERVED_CHANNEL_CONFIGURATION_INIT, RESERVED_FREQUENCY_INIT, RUNAWAY_DESCRIPTOR_LENGTH_INIT, SBR_INIT, SHORT_AVCC_INIT, SHORT_HDLR_INIT, SHORT_SIZE_BOX_INIT,
  SHORT_TKHD_INIT, STSD_COUNT_WITHOUT_ENTRY_INIT, STSD_ZERO_COUNT_WITH_ENTRY_INIT, TO_END_BOX_INIT, TRUNCATED_CONFIG_INIT, TWO_ENTRY_STSD_INIT, UNKNOWN_ENTRY_INIT,
  UNKNOWN_HANDLER_INIT, UNKNOWN_QUICKTIME_VERSION_INIT, VIDEO_WITHOUT_CONFIG_INIT, WRONG_TAG_ES_DESCRIPTOR_INIT, box } from "./init-segment.fixtures.ts";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { describeInitSegment } from "./init-segment.ts";

// The H.264 Baseline track at 640 by 360, level 3.0, that several composed inits carry beside the shape under test.
const COMPANION_VIDEO = { codec: "h264", height: 360, id: 1, kind: "video", level: 30, profile: 66, width: 640 } as const;

// The doorbell capture's tracks, HEVC Main at 3024 by 4096 and AAC-LC at 16000 Hz mono, asserted for the capture in each form the reader accepts it in.
const DOORBELL_TRACKS = [

  { codec: "h265", height: 4096, id: 1, kind: "video", level: 180, profile: 1, width: 3024 },
  { channels: 1, codec: "aac", id: 2, kind: "audio", sampleRate: 16000 }
] as const;

// The doorbell capture's `trak` spans, read from its box headers: the video `trak` runs from byte 220 to byte 802, and the audio `trak` from 802 to 1250, the end of
// the init.
const DOORBELL_VIDEO_TRAK_START = 220;
const DOORBELL_VIDEO_TRAK_END = 802;
const DOORBELL_AUDIO_TRAK_END = 1250;

describe("describeInitSegment", () => {

  describe("captured inits", () => {

    test("a Protect doorbell describes as HEVC at 3024 by 4096 and AAC-LC at 16000 Hz mono", () => {

      assert.deepEqual(describeInitSegment(DOORBELL_INIT).tracks, DOORBELL_TRACKS);
    });

    test("a Protect AI Pro describes as HEVC at 3840 by 2160 and AAC-LC at 16000 Hz mono", () => {

      assert.deepEqual(describeInitSegment(AI_PRO_INIT).tracks, [

        { codec: "h265", height: 2160, id: 1, kind: "video", level: 150, profile: 1, width: 3840 },
        { channels: 1, codec: "aac", id: 2, kind: "audio", sampleRate: 16000 }
      ]);
    });

    test("an Amcrest camera describes as H.264 Main at 2592 by 1944 and AAC-LC at 8000 Hz mono", () => {

      assert.deepEqual(describeInitSegment(AMCREST_INIT).tracks, [

        { codec: "h264", height: 1944, id: 1, kind: "video", level: 51, profile: 77, width: 2592 },
        { channels: 1, codec: "aac", id: 2, kind: "audio", sampleRate: 8000 }
      ]);
    });

    test("a Protect AV1 camera describes as AV1 Main at 3840 by 2160 and AAC-LC at 16000 Hz mono", () => {

      assert.deepEqual(describeInitSegment(PROTECT_AV1_INIT).tracks, [

        { codec: "av1", height: 2160, id: 1, kind: "video", level: 12, profile: 0, width: 3840 },
        { channels: 1, codec: "aac", id: 2, kind: "audio", sampleRate: 16000 }
      ]);
    });

    test("inits of one stream that differ only in their timestamps describe identically", () => {

      // The captures differ in their creation and modification times alone, the difference every reconnect of the same stream carries, so their descriptions must
      // compare equal while their bytes do not.
      assert.notDeepEqual(AI_PRO_INIT, AI_PRO_RECONNECT_INIT);
      assert.deepEqual(describeInitSegment(AI_PRO_INIT), describeInitSegment(AI_PRO_RECONNECT_INIT));
    });

    test("a capture passed as a plain Uint8Array describes as the capture's tracks", () => {

      assert.deepEqual(describeInitSegment(new Uint8Array(DOORBELL_INIT)).tracks, DOORBELL_TRACKS);
    });

    test("a capture passed as a Uint8Array view at a byte offset into a larger buffer describes as the capture's tracks", () => {

      // The view opens 8 bytes into a buffer of its own, past 8 zero bytes, so the reader is handed a typed array that is not a `Buffer` at a non-zero byte offset.
      // A reader that ignored the view's offset would take the zero bytes for a box whose size of zero runs it to the end of the buffer, and find no `moov`.
      const backing = new Uint8Array(8 + DOORBELL_INIT.length);

      backing.set(DOORBELL_INIT, 8);

      assert.deepEqual(describeInitSegment(backing.subarray(8)).tracks, DOORBELL_TRACKS);
    });
  });

  describe("sample entries", () => {

    test("an Opus track reports its dOps output channel count and the 48000 Hz it decodes at, not the dOps input rate", () => {

      assert.deepEqual(describeInitSegment(OPUS_INIT).tracks, [ COMPANION_VIDEO, { channels: 2, codec: "opus", id: 2, kind: "audio", sampleRate: 48000 } ]);
    });

    test("an Opus entry without a dOps box reads as unknown with its sample entry type", () => {

      assert.deepEqual(describeInitSegment(OPUS_WITHOUT_DOPS_INIT).tracks, [{ codec: "unknown", id: 1, kind: "audio", sampleEntry: "Opus" }],
        "An Opus track's channel count comes from its dOps alone, so an entry without one reads as unknown.");
    });

    test("an AAC configuration with an explicit sampling rate reports that rate over the entry's own sample rate field", () => {

      assert.deepEqual(describeInitSegment(EXPLICIT_FREQUENCY_INIT).tracks, [{ channels: 1, codec: "aac", id: 1, kind: "audio", sampleRate: 44100 }]);
    });

    test("a reserved sampling-frequency index reads as unknown with its sample entry type", () => {

      assert.deepEqual(describeInitSegment(RESERVED_FREQUENCY_INIT).tracks, [{ codec: "unknown", id: 1, kind: "audio", sampleEntry: "mp4a" }]);
    });

    test("an escaped audio object type that is not AAC reads as unknown with its sample entry type", () => {

      assert.deepEqual(describeInitSegment(ESCAPED_OBJECT_TYPE_INIT).tracks, [{ codec: "unknown", id: 1, kind: "audio", sampleEntry: "mp4a" }]);
    });

    test("an escaped audio object type reads as 32 plus its six bits, so six bits naming AAC-LC alone read as unknown", () => {

      assert.deepEqual(describeInitSegment(ESCAPED_AAC_OBJECT_TYPE_INIT).tracks, [{ codec: "unknown", id: 1, kind: "audio", sampleEntry: "mp4a" }]);
    });

    test("an AAC configuration that ends before its fields do reads as unknown with its sample entry type", () => {

      assert.deepEqual(describeInitSegment(TRUNCATED_CONFIG_INIT).tracks, [{ codec: "unknown", id: 1, kind: "audio", sampleEntry: "mp4a" }]);
    });

    test("a decoder configuration naming MPEG-2 AAC rather than MPEG-4 audio reads as unknown with its sample entry type", () => {

      assert.deepEqual(describeInitSegment(MPEG2_AAC_INIT).tracks, [{ codec: "unknown", id: 1, kind: "audio", sampleEntry: "mp4a" }]);
    });

    test("a channel configuration of zero counts the program config element's channels, a pair as two plus each LFE", () => {

      assert.deepEqual(describeInitSegment(PROGRAM_CONFIG_INIT).tracks, [{ channels: 3, codec: "aac", id: 1, kind: "audio", sampleRate: 44100 }]);
    });

    test("a core coder delay ahead of the program config element is stepped over, so the element's channels are counted", () => {

      assert.deepEqual(describeInitSegment(CORE_CODER_DELAY_INIT).tracks, [{ channels: 6, codec: "aac", id: 1, kind: "audio", sampleRate: 48000 }]);
    });

    test("a program config element's mixdown fields are stepped over, so the element's channels are counted", () => {

      assert.deepEqual(describeInitSegment(MIXDOWN_PCE_INIT).tracks, [{ channels: 2, codec: "aac", id: 1, kind: "audio", sampleRate: 48000 }]);
    });

    test("a channel configuration of 6 counts six channels", () => {

      assert.deepEqual(describeInitSegment(CHANNEL_CONFIGURATION_SIX_INIT).tracks, [{ channels: 6, codec: "aac", id: 1, kind: "audio", sampleRate: 48000 }]);
    });

    test("a channel configuration of 7 counts eight channels", () => {

      assert.deepEqual(describeInitSegment(CHANNEL_CONFIGURATION_SEVEN_INIT).tracks, [{ channels: 8, codec: "aac", id: 1, kind: "audio", sampleRate: 48000 }]);
    });

    test("a reserved channel configuration reads as unknown with its sample entry type", () => {

      assert.deepEqual(describeInitSegment(RESERVED_CHANNEL_CONFIGURATION_INIT).tracks, [{ codec: "unknown", id: 1, kind: "audio", sampleEntry: "mp4a" }]);
    });

    test("an SBR configuration reports the extension sampling rate over the core's", () => {

      assert.deepEqual(describeInitSegment(SBR_INIT).tracks, [{ channels: 2, codec: "aac", id: 1, kind: "audio", sampleRate: 48000 }]);
    });

    test("a PS configuration over a mono core reports the extension sampling rate and the stereo its decoder produces", () => {

      assert.deepEqual(describeInitSegment(PS_INIT).tracks, [{ channels: 2, codec: "aac", id: 1, kind: "audio", sampleRate: 48000 }]);
    });

    test("an avc1 entry reports its own coded dimensions and its avcC profile and level, not the tkhd's presentation size", () => {

      assert.deepEqual(describeInitSegment(AVC_INIT).tracks, [{ codec: "h264", height: 720, id: 1, kind: "video", level: 40, profile: 100, width: 1280 }]);
    });

    test("an avc3 entry reads as H.264 with its avcC profile and level", () => {

      assert.deepEqual(describeInitSegment(AVC3_INIT).tracks, [{ codec: "h264", height: 1080, id: 1, kind: "video", level: 41, profile: 77, width: 1920 }]);
    });

    test("an hev1 entry reads as HEVC with its hvcC profile and level", () => {

      assert.deepEqual(describeInitSegment(HEV1_INIT).tracks, [{ codec: "h265", height: 1080, id: 1, kind: "video", level: 120, profile: 2, width: 1920 }]);
    });

    test("an av01 entry reads as AV1 with its av1C profile and level", () => {

      assert.deepEqual(describeInitSegment(AV1_INIT).tracks, [{ codec: "av1", height: 1080, id: 1, kind: "video", level: 13, profile: 0, width: 1920 }]);
    });

    test("a video entry without its decoder configuration record reads as unknown with its sample entry type", () => {

      assert.deepEqual(describeInitSegment(VIDEO_WITHOUT_CONFIG_INIT).tracks, [{ codec: "unknown", id: 1, kind: "video", sampleEntry: "avc1" }]);
    });

    test("a decoder configuration record too short to hold its level reads as unknown with its sample entry type", () => {

      assert.deepEqual(describeInitSegment(SHORT_AVCC_INIT).tracks, [{ codec: "unknown", id: 1, kind: "video", sampleEntry: "avc1" }]);
    });

    test("a QuickTime version 1 sound description finds its esds inside a wave box past the longer fixed fields", () => {

      assert.deepEqual(describeInitSegment(QUICKTIME_V1_INIT).tracks, [{ channels: 2, codec: "aac", id: 1, kind: "audio", sampleRate: 48000 }]);
    });

    test("a QuickTime version 2 sound description finds its esds past the version 2 fields and reports the rate its configuration states", () => {

      assert.deepEqual(describeInitSegment(QUICKTIME_V2_INIT).tracks, [{ channels: 2, codec: "aac", id: 1, kind: "audio", sampleRate: 44100 }]);
    });

    test("a QuickTime sound-description version the reader does not know reads as unknown with its sample entry type", () => {

      assert.deepEqual(describeInitSegment(UNKNOWN_QUICKTIME_VERSION_INIT).tracks, [{ codec: "unknown", id: 1, kind: "audio", sampleEntry: "mp4a" }]);
    });

    test("an ISO AudioSampleEntryV1 under an stsd of version 1 finds its esds where version 0 places it", () => {

      assert.deepEqual(describeInitSegment(ISO_V1_AUDIO_INIT).tracks, [{ channels: 1, codec: "aac", id: 1, kind: "audio", sampleRate: 44100 }]);
    });

    test("a sample entry the reader does not describe reads as unknown with its type and the handler's kind", () => {

      assert.deepEqual(describeInitSegment(UNKNOWN_ENTRY_INIT).tracks, [{ codec: "unknown", id: 1, kind: "audio", sampleEntry: "xyz1" }]);
    });

    test("an unknown handler leaves a codec arm's kind to its entry and gives an unknown arm the unknown kind", () => {

      assert.deepEqual(describeInitSegment(UNKNOWN_HANDLER_INIT).tracks, [ COMPANION_VIDEO, { codec: "unknown", id: 2, kind: "unknown", sampleEntry: "tx3g" } ]);
    });

    test("a track without a handler reads as the unknown kind", () => {

      assert.deepEqual(describeInitSegment(MISSING_HDLR_INIT).tracks, [{ codec: "unknown", id: 1, kind: "unknown", sampleEntry: "zzzz" }]);
    });

    test("a handler too short to hold its handler type reads as the unknown kind", () => {

      assert.deepEqual(describeInitSegment(SHORT_HDLR_INIT).tracks, [{ codec: "unknown", id: 1, kind: "unknown", sampleEntry: "zzzz" }]);
    });

    test("an stsd that lists no entry reads as unknown with an empty sample entry type", () => {

      assert.deepEqual(describeInitSegment(EMPTY_STSD_INIT).tracks, [{ codec: "unknown", id: 1, kind: "video", sampleEntry: "" }]);
    });

    test("an stsd whose count names an entry it does not hold reads as unknown with an empty sample entry type", () => {

      assert.deepEqual(describeInitSegment(STSD_COUNT_WITHOUT_ENTRY_INIT).tracks, [{ codec: "unknown", id: 1, kind: "audio", sampleEntry: "" }]);
    });

    test("an stsd whose count reads zero reads as unknown with an empty sample entry type, though an entry box follows the count", () => {

      assert.deepEqual(describeInitSegment(STSD_ZERO_COUNT_WITH_ENTRY_INIT).tracks, [{ codec: "unknown", id: 1, kind: "audio", sampleEntry: "" }],
        "A count of zero lists no entry, so the entry box after it is never read.");
    });

    test("an stsd listing two entries describes the track from its first", () => {

      assert.deepEqual(describeInitSegment(TWO_ENTRY_STSD_INIT).tracks, [{ channels: 1, codec: "aac", id: 1, kind: "audio", sampleRate: 16000 }]);
    });
  });

  describe("box and descriptor shapes", () => {

    test("descriptor lengths written in the padded four-byte form read as their values", () => {

      assert.deepEqual(describeInitSegment(PADDED_DESCRIPTOR_INIT).tracks, [{ channels: 1, codec: "aac", id: 1, kind: "audio", sampleRate: 16000 }]);
    });

    test("a descriptor length that has not ended within four bytes ends the walk, so the track reads as unknown with its sample entry type", () => {

      assert.deepEqual(describeInitSegment(RUNAWAY_DESCRIPTOR_LENGTH_INIT).tracks, [{ codec: "unknown", id: 1, kind: "audio", sampleEntry: "mp4a" }]);
    });

    test("an elementary stream descriptor's optional fields are stepped over to reach its decoder configuration", () => {

      assert.deepEqual(describeInitSegment(ES_OPTIONAL_FIELDS_INIT).tracks, [{ channels: 1, codec: "aac", id: 1, kind: "audio", sampleRate: 22050 }]);
    });

    test("a descriptor of another tag ahead of the elementary stream descriptor is stepped over to reach it", () => {

      assert.deepEqual(describeInitSegment(DESCRIPTOR_AFTER_OTHER_TAG_INIT).tracks, [{ channels: 1, codec: "aac", id: 1, kind: "audio", sampleRate: 16000 }]);
    });

    test("an esds holding no elementary stream descriptor reads as unknown with its sample entry type", () => {

      assert.deepEqual(describeInitSegment(WRONG_TAG_ES_DESCRIPTOR_INIT).tracks, [{ codec: "unknown", id: 1, kind: "audio", sampleEntry: "mp4a" }]);
    });

    test("an elementary stream descriptor whose length runs past its esds is clamped to the box, and its nested descriptors are read", () => {

      assert.deepEqual(describeInitSegment(OVERRUNNING_DESCRIPTOR_INIT).tracks, [{ channels: 1, codec: "aac", id: 1, kind: "audio", sampleRate: 16000 }]);
    });

    test("an elementary stream descriptor whose length runs past the end of the init is clamped to its esds, so the walk ends at the box", () => {

      assert.deepEqual(describeInitSegment(OVERRUNNING_DESCRIPTOR_PAST_BUFFER_INIT).tracks, [{ codec: "unknown", id: 1, kind: "audio", sampleEntry: "mp4a" }]);
    });

    test("a descriptor tag on the last byte of its span has no length to read, so the walk ends and the track reads as unknown with its sample entry type", () => {

      assert.deepEqual(describeInitSegment(DESCRIPTOR_TAG_ON_LAST_BYTE_INIT).tracks, [{ codec: "unknown", id: 1, kind: "audio", sampleEntry: "mp4a" }],
        "A tag on the span's last byte ends the descriptor walk rather than reading a length past the span.");
    });

    test("a moov written with a 64-bit largesize is walked", () => {

      assert.deepEqual(describeInitSegment(LARGESIZE_INIT).tracks, [COMPANION_VIDEO]);
    });

    test("a 64-bit box header its parent cannot hold ends the parent's walk", () => {

      assert.deepEqual(describeInitSegment(CUT_LARGESIZE_HEADER_INIT).tracks, [COMPANION_VIDEO]);
    });

    test("a moov whose size reads zero runs to the end of the init and is walked", () => {

      assert.deepEqual(describeInitSegment(TO_END_BOX_INIT).tracks, [COMPANION_VIDEO]);
    });

    test("a trak whose size reads zero runs to the end of its moov rather than of the init, and is described", () => {

      assert.deepEqual(describeInitSegment(NESTED_TO_END_BOX_INIT).tracks, [ COMPANION_VIDEO, { channels: 1, codec: "aac", id: 2, kind: "audio", sampleRate: 16000 } ]);
    });

    test("a box whose size is smaller than its header ends its parent's walk, so no track past it is described", () => {

      assert.deepEqual(describeInitSegment(SHORT_SIZE_BOX_INIT).tracks, [COMPANION_VIDEO]);
    });

    test("a box exactly its header's size is stepped over, so the track past it is described", () => {

      assert.deepEqual(describeInitSegment(EMPTY_BOX_INIT).tracks, [ COMPANION_VIDEO, { channels: 1, codec: "aac", id: 2, kind: "audio", sampleRate: 16000 } ]);
    });

    test("a trak without a tkhd is skipped, and a version 1 tkhd yields its track id", () => {

      assert.deepEqual(describeInitSegment(MISSING_TKHD_INIT).tracks, [{ ...COMPANION_VIDEO, id: 2 }]);
    });

    test("a trak whose tkhd is too short to hold its track id is skipped", () => {

      assert.deepEqual(describeInitSegment(SHORT_TKHD_INIT).tracks, [COMPANION_VIDEO]);
    });
  });

  describe("never throws", () => {

    test("an empty buffer describes as no tracks", () => {

      assert.deepEqual(describeInitSegment(Buffer.alloc(0)), { tracks: [] });
    });

    test("a bare ftyp with no moov describes as no tracks", () => {

      assert.deepEqual(describeInitSegment(box("ftyp", Buffer.from("iso6iso6mp41", "latin1"))), { tracks: [] });
    });

    test("every prefix of a real init describes exactly the tracks it holds whole, as a prefix of the full track list", () => {

      // A cut init describes the tracks it holds whole: a box running past its parent is clamped and still walked, so the cut `moov` still yields its complete traks,
      // while a cut `trak` is passed over rather than described from its partial bytes. A prefix short of the video trak's end therefore describes no track, a prefix
      // holding the video trak but not the whole audio trak describes the video track alone, and only the full init describes both. The spans are checked against
      // the box headers first, so the bounds the sweep holds come from the bytes rather than from anything the reader reports.
      const full = describeInitSegment(DOORBELL_INIT).tracks;

      assert.equal(DOORBELL_INIT.readUInt32BE(DOORBELL_VIDEO_TRAK_START), DOORBELL_VIDEO_TRAK_END - DOORBELL_VIDEO_TRAK_START);
      assert.equal(DOORBELL_INIT.readUInt32BE(DOORBELL_VIDEO_TRAK_END), DOORBELL_AUDIO_TRAK_END - DOORBELL_VIDEO_TRAK_END);
      assert.equal(DOORBELL_INIT.length, DOORBELL_AUDIO_TRAK_END);
      assert.deepEqual(full.map((track) => track.kind), [ "video", "audio" ]);

      for(let length = 0; length <= DOORBELL_INIT.length; length++) {

        const tracks = describeInitSegment(DOORBELL_INIT.subarray(0, length)).tracks;
        const wholeTraks = (length === DOORBELL_AUDIO_TRAK_END) ? 2 : ((length >= DOORBELL_VIDEO_TRAK_END) ? 1 : 0);
        const message = "the prefix of length " + length.toString() + " described " + JSON.stringify(tracks) + ".";

        assert.deepEqual(tracks, full.slice(0, tracks.length), message);
        assert.equal(tracks.length, wholeTraks, message);
      }
    });

    test("overwriting each byte of a real init in turn with a pseudo-random byte describes without throwing", () => {

      // Every offset of the doorbell init, from its first byte to its last, is overwritten in a copy of its own with the next byte of a 32-bit xorshift generator
      // from a fixed seed, so each box header and each reader the walk reaches meets a corrupted byte, and the sequence is the same on every run.
      let state = 20261011;

      for(let offset = 0; offset < DOORBELL_INIT.length; offset++) {

        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        state >>>= 0;

        const value = state & 0xff;
        const corrupted = Buffer.from(DOORBELL_INIT);

        corrupted[offset] = value;

        assert.doesNotThrow(() => describeInitSegment(corrupted), "overwriting offset " + offset.toString() + " with " + value.toString() + " threw.");
      }
    });
  });
});
