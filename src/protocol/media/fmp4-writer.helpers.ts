/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * fmp4-writer.helpers.ts: Test-only frame builders and fragment reader for the fMP4 writer's suites - frames from stated fields, and a reader that walks a written
 * media segment back into its tracks and samples.
 *
 * The fragment reader restates the fragment layout apart from the writer: it walks the segment through the shared box readers, reads each field at the offset the
 * format gives it within its box, and slices each sample out of the segment by its track run's data offset and sizes. A layout error on either side therefore
 * fails a row rather than cancelling out.
 */
import type { AudioFrame, VideoFrame } from "./frames.ts";
import type { LivestreamAudioCodec, LivestreamVideoCodec } from "./codecs.ts";
import { children, findChild, readUInt } from "./boxes.ts";
import type { Span } from "./boxes.ts";

// Frames.

// A video frame of a codec, a keyframe or not, at a timestamp on a clock of 90000 unless another is given.
export function videoFrame(codec: LivestreamVideoCodec, data: Buffer, opts: { keyframe?: boolean; rate?: number; timestamp: number }): VideoFrame {

  const { keyframe = false, rate = 90000, timestamp } = opts;

  return { codec, data, keyframe, kind: "video", rate, timestamp };
}

// An audio frame of a codec at a timestamp on its clock.
export function audioFrame(codec: LivestreamAudioCodec, data: Buffer, opts: { rate: number; timestamp: number }): AudioFrame {

  return { codec, data, kind: "audio", rate: opts.rate, timestamp: opts.timestamp };
}

// Fragments.

// One sample of a track run: its bytes as sliced from the segment, and its duration and flags as the run states them.
export interface FragmentSample {

  readonly bytes: Buffer;
  readonly duration: number;
  readonly flags: number;
}

// One track fragment: its header's version, flags and track id, its decode time's version and value, its run's version, flags and data offset, and its samples.
export interface FragmentTrack {

  readonly dataOffset: number;
  readonly decodeTime: number;
  readonly samples: readonly FragmentSample[];
  readonly tfdtVersion: number;
  readonly tfhdFlags: number;
  readonly tfhdVersion: number;
  readonly trackId: number;
  readonly trunFlags: number;
  readonly trunVersion: number;
}

// One media segment read back: its top-level boxes in order, the boxes its `moof` holds in order, its `mfhd` version and sequence number, and its tracks.
export interface Fragment {

  readonly boxes: readonly string[];
  readonly mfhdVersion: number;
  readonly moofBoxes: readonly string[];
  readonly sequence: number;
  readonly tracks: readonly FragmentTrack[];
}

// A field the format places within a box, read through the shared bounded reader. A field the box cannot hold fails the row that reads it.
function field(segment: Buffer, span: Span | undefined, offset: number, width: 1 | 2 | 4): number {

  const value = readUInt(segment, span, offset, width);

  if(value === undefined) {

    throw new Error("The fragment ends before a field its layout places at offset " + String(offset) + ".");
  }

  return value;
}

/* Read a media segment back. The `moof` opens with its `mfhd`, a full box holding the 32-bit sequence number, then one `traf` per track. Each `traf` holds a `tfhd`
 * (a full box with the 32-bit track id), a `tfdt` (a full box with a 64-bit decode time at version 1), and a `trun` (a full box with the 32-bit sample count, the
 * 32-bit data offset counted from the moof's first byte, then a 32-bit duration, size and flags per sample). Each sample is sliced from the segment at the data
 * offset plus the sizes of the samples before it.
 */
export function readFragment(segment: Buffer): Fragment {

  const top = [...children(segment, { end: segment.length, start: 0 })];
  const moof = findChild(segment, { end: segment.length, start: 0 }, "moof");

  if(moof === undefined) {

    throw new Error("The segment holds no moof.");
  }

  const moofStart = moof.start - 8;
  const mfhd = findChild(segment, moof, "mfhd");
  const tracks = [...children(segment, moof)].filter((box) => box.type === "traf").map((traf) => {

    const tfhd = findChild(segment, traf, "tfhd");
    const tfdt = findChild(segment, traf, "tfdt");
    const trun = findChild(segment, traf, "trun");
    const count = field(segment, trun, 4, 4);
    const dataOffset = field(segment, trun, 8, 4);
    const samples: FragmentSample[] = [];
    let position = moofStart + dataOffset;

    for(let index = 0; index < count; index++) {

      const size = field(segment, trun, 16 + (index * 12), 4);

      samples.push({ bytes: segment.subarray(position, position + size), duration: field(segment, trun, 12 + (index * 12), 4),
        flags: field(segment, trun, 20 + (index * 12), 4) });
      position += size;
    }

    return { dataOffset, decodeTime: (field(segment, tfdt, 4, 4) * (2 ** 32)) + field(segment, tfdt, 8, 4), samples, tfdtVersion: field(segment, tfdt, 0, 1),
      tfhdFlags: field(segment, tfhd, 0, 4) & 0xffffff, tfhdVersion: field(segment, tfhd, 0, 1), trackId: field(segment, tfhd, 4, 4),
      trunFlags: field(segment, trun, 0, 4) & 0xffffff, trunVersion: field(segment, trun, 0, 1) };
  });

  return { boxes: top.map((box) => box.type), mfhdVersion: field(segment, mfhd, 0, 1), moofBoxes: [...children(segment, moof)].map((box) => box.type),
    sequence: field(segment, mfhd, 4, 4), tracks };
}
