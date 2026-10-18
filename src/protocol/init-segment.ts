/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * init-segment.ts: Pure reader of a livestream's fMP4 initialization segment, describing every track the stream carries.
 */

/**
 * Pure reader of the fMP4 initialization segment a livestream opens with (the `ftyp` and `moov` boxes the controller sends as its init frame). This module is Layer 1,
 * the packet codec's sibling: no I/O, no time, no side effects - bytes in, a description out. Unlike the packet codec it never throws, because an init the reader
 * cannot fully read is still a stream a consumer can decode...so a malformed init describes as the tracks that were readable, and a truncated one as its whole tracks.
 *
 * The walk reads one path through the box tree for each track, in file order:
 *
 * ```
 * moov
 *   trak                one per track
 *     tkhd              the track id (version 0 or version 1 layout)
 *     mdia
 *       hdlr            the handler type: vide reads as video, soun as audio, anything else as unknown
 *       minf
 *         stbl
 *           stsd        the first sample entry, which names the codec and carries its configuration
 * ```
 *
 * Each fact comes from the field a decoder is configured from. Offsets are counted from a box's payload, past its header; the ISO tables count from the box's first
 * byte, so a sample entry's offsets read 8 below the ones quoted there.
 *
 * | Sample entry      | Codec   | Facts and where they come from                                                                                             |
 * |-------------------|---------|----------------------------------------------------------------------------------------------------------------------------|
 * | `hvc1`, `hev1`    | `h265`  | width and height from the `VisualSampleEntry`; profile and level from `hvcC` (`general_profile_idc`, `general_level_idc`)  |
 * | `avc1`, `avc3`    | `h264`  | width and height from the `VisualSampleEntry`; profile and level from `avcC` (`AVCProfileIndication`, `AVCLevelIndication`) |
 * | `av01`            | `av1`   | width and height from the `VisualSampleEntry`; profile and level from `av1C` (`seq_profile`, `seq_level_idx_0`)            |
 * | `mp4a`            | `aac`   | sample rate and channels from the `esds` `AudioSpecificConfig`                                                             |
 * | `Opus`            | `opus`  | channels from `dOps` (`OutputChannelCount`); the sample rate is 48000, the rate Opus decodes at                            |
 *
 * An AAC track's facts come from its `AudioSpecificConfig`: the sampling-frequency index or its explicit 24-bit escape, and the channel configuration, with the
 * program config element read when that configuration is zero. AAC-LC reads as `aac`, and so do SBR and PS, which report the extension rate (PS also reporting the
 * stereo its decoder produces from a mono core); any other object type reads as unknown. The `hvcC` compatibility and constraint flags are not read, because Protect
 * writes the compatibility word bit-reversed and the constraint word all-ones. Frame rate and bitrate are not described at all: the header carries a frame rate in two
 * places (the `trex` default sample duration and the SPS timing) that disagree on a third-party camera, so neither is a fact this library asserts.
 *
 * A track the reader cannot read is reported as `codec: "unknown"` with its sample-entry type rather than dropped, because a consumer that knows the codec can still
 * decode it. A box whose size runs past its parent is clamped to the parent's end and still walked, a 64-bit `largesize` and a size of zero (to the parent's end) are
 * honored, and a size smaller than its own header ends that parent's walk. A `trak` whose size runs past its parent is the one box not described, so a cut init
 * reports the tracks it holds whole and never a cut track in place of the track the stream carries.
 *
 * @module ProtectInitSegment
 */

/**
 * What a livestream's init segment says about the stream: every track in its `moov`, in file order, or none when the bytes carry no readable `moov`. A stream with no
 * audio, or no AAC, is an empty filter result over `tracks` rather than an `undefined` - the library ships the list and the consumer picks the track it wants.
 *
 * @category Transport
 */
export interface LivestreamDescription {

  readonly tracks: readonly LivestreamTrack[];
}

/**
 * One track of a livestream, told apart by what the reader could read of its sample entry. A video arm carries the coded dimensions and the decoder configuration's
 * profile and level; an audio arm carries the sample rate it decodes at and its channel count. The unknown arm is a track whose sample entry the reader does not
 * describe or whose configuration it could not read: it carries the entry's four-character type (empty when the track lists no entry) and the handler's kind. A codec
 * arm's `kind` is the entry's own, because a video codec is a video track whatever the handler says.
 *
 * @category Transport
 */
export type LivestreamTrack =
  | { readonly codec: "av1" | "h264" | "h265"; readonly height: number; readonly id: number; readonly kind: "video"; readonly level: number;
    readonly profile: number; readonly width: number; } |
  { readonly channels: number; readonly codec: "aac" | "opus"; readonly id: number; readonly kind: "audio"; readonly sampleRate: number } |
  { readonly codec: "unknown"; readonly id: number; readonly kind: "audio" | "unknown" | "video"; readonly sampleEntry: string };

/**
 * One livestream initialization segment: the controller's codec label from its codec-information frame (`codec`, the RFC 6381 string, `""` when no such frame
 * preceded the init), the init bytes (`data`), and the stream's `description` read once from them. The label and the description come from different sources and
 * are carried side by side: the label names the codec family, profile, level and audio object type, and nothing about sample rate, channels or dimensions, which the
 * description reads from the bytes. Every place an init travels or rests carries this one type - a `Segment`'s init arm, a subscription's cached init, and the prior
 * and reconnected inits a codec change reports.
 *
 * @category Transport
 */
export interface LivestreamInit {

  readonly codec: string;
  readonly data: Buffer;
  readonly description: LivestreamDescription;
}

// A byte range within the init, from `start` up to `end`. Every box and descriptor the walk reads is one, and every field it reads is bounded by the range holding it.
interface Span {

  readonly end: number;
  readonly start: number;
}

// One box: its four-character type and the span of its payload, which begins past the 8- or 16-byte header and ends at the box's end clamped to its parent's, and
// whether that clamp cut the box short.
interface Box extends Span {

  readonly clamped: boolean;
  readonly type: string;
}

// One video sample entry the reader describes: the codec it reads as, the child box holding its decoder configuration record, and where in that record the profile
// and level sit.
interface VideoFormat {

  readonly codec: "av1" | "h264" | "h265";
  readonly config: string;
  readonly level: ConfigField;
  readonly profile: ConfigField;
}

// One field of a decoder configuration record: `bits` bits of the record's byte at `byte`, sitting `shift` bits above that byte's low end.
interface ConfigField {

  readonly bits: number;
  readonly byte: number;
  readonly shift: number;
}

// A box header's two sizes: the compact form carries a 32-bit size and the type, and a size of 1 adds a 64-bit `largesize` after the type.
const BOX_HEADER_SIZE = 8;
const LARGE_BOX_HEADER_SIZE = 16;

// The declared sizes that carry a meaning of their own: zero runs the box to the end of its parent, and one defers to the 64-bit `largesize`.
const BoxSize = {

  LARGE: 1,
  TO_END: 0
} as const;

// Field offsets within a box's payload. A full box opens with a version byte and three flag bytes; `tkhd` places its track id after the creation and modification
// times, 32-bit at version 0 and 64-bit at version 1; `hdlr` places its handler type after a pre-defined word; and `stsd` lists its entries after an entry count.
const PayloadOffset = {

  HDLR_HANDLER_TYPE: 8,
  STSD_ENTRIES: 8,
  STSD_ENTRY_COUNT: 4,
  TKHD_TRACK_ID_V0: 12,
  TKHD_TRACK_ID_V1: 20,
  VERSION: 0
} as const;

// Field offsets within a sample entry's payload. A visual entry's width and height follow the 16 bytes of pre-defined and reserved fields after the shared sample entry
// prefix, and its child boxes follow the fixed fields. An audio entry's child boxes follow its fixed fields, which the QuickTime sound-description version (read at
// AUDIO_VERSION under an `stsd` of version 0) lengthens: version 1 adds four 32-bit packet and frame sizes, and version 2 its own wider layout. Under an `stsd` of
// version 1 the entry is the ISO `AudioSampleEntryV1`, whose children sit where version 0 places them.
const SampleEntryOffset = {

  AUDIO_CHILDREN: 28,
  AUDIO_CHILDREN_QUICKTIME_V1: 44,
  AUDIO_CHILDREN_QUICKTIME_V2: 64,
  AUDIO_VERSION: 8,
  VISUAL_CHILDREN: 78,
  VISUAL_HEIGHT: 26,
  VISUAL_WIDTH: 24
} as const;

// The video sample entries the reader describes. The entries in each pair differ only in where the stream's parameter sets travel, so both read the same record:
// `hvcC` holds `general_profile_idc` in the low five bits of its byte 1 and `general_level_idc` in its byte 12, `avcC` holds `AVCProfileIndication` and
// `AVCLevelIndication` in its bytes 1 and 3, and `av1C` holds `seq_profile` in the high three bits of its byte 1 and `seq_level_idx_0` in the low five.
const AV1: VideoFormat = { codec: "av1", config: "av1C", level: { bits: 5, byte: 1, shift: 0 }, profile: { bits: 3, byte: 1, shift: 5 } };
const H264: VideoFormat = { codec: "h264", config: "avcC", level: { bits: 8, byte: 3, shift: 0 }, profile: { bits: 8, byte: 1, shift: 0 } };
const H265: VideoFormat = { codec: "h265", config: "hvcC", level: { bits: 8, byte: 12, shift: 0 }, profile: { bits: 5, byte: 1, shift: 0 } };

const VIDEO_FORMATS: ReadonlyMap<string, VideoFormat> = new Map([ [ "av01", AV1 ], [ "avc1", H264 ], [ "avc3", H264 ], [ "hev1", H265 ], [ "hvc1", H265 ] ]);

// The MPEG-4 Systems descriptor tags on the path from `esds` to the `AudioSpecificConfig`, and the fields of the elementary stream descriptor that decide where its
// nested descriptors begin: three optional fields follow its 16-bit id and its flags byte, each present when its flag bit is set.
const DescriptorTag = {

  DECODER_CONFIG: 4,
  DECODER_SPECIFIC_INFO: 5,
  ELEMENTARY_STREAM: 3
} as const;

const EsDescriptorFlag = {

  OCR_STREAM: 0x20,
  STREAM_DEPENDENCE: 0x80,
  URL: 0x40
} as const;

// A descriptor's length is an expandable field of one to four bytes, each carrying seven bits with the high bit flagging that another byte follows.
const DESCRIPTOR_LENGTH_MAX_BYTES = 4;

// The fixed fields of a decoder configuration descriptor that precede its nested descriptors: the object type indication, the stream type byte, a 24-bit buffer
// size and two 32-bit bitrates.
const DECODER_CONFIG_FIXED_SIZE = 13;

// The object type indication of MPEG-4 audio, whose decoder-specific info is an `AudioSpecificConfig`. Any other indication, the MPEG-2 AAC ones included, carries a
// configuration this reader does not interpret.
const OBJECT_TYPE_MPEG4_AUDIO = 0x40;

// The AudioSpecificConfig vocabulary. An audio object type of 31 escapes to 32 plus the next six bits. AAC-LC is the core codec; SBR and PS extend it, each signalling an
// extension sampling frequency and then the core's own object type. A sampling-frequency index indexes the table below, 15 escaping to an explicit 24-bit rate and 13
// and 14 being reserved. A channel configuration of 1 to 6 is that many channels, 7 is eight, 0 defers to the program config element, and 8 to 15 are reserved.
const AudioObjectType = {

  AAC_LC: 2,
  ESCAPE: 31,
  ESCAPE_BASE: 32,
  PS: 29,
  SBR: 5
} as const;

const SAMPLING_FREQUENCIES: readonly number[] = [ 96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350 ];
const SAMPLING_FREQUENCY_ESCAPE = 15;
const CHANNEL_CONFIGURATION_FROM_PCE = 0;
const CHANNEL_CONFIGURATION_DIRECT_MAX = 6;
const CHANNEL_CONFIGURATION_EIGHT = 7;

// The rate every Opus stream decodes at. The `dOps` box's input sample rate names the encoder's source and not the playback rate, so it is never the rate reported.
const OPUS_DECODE_RATE = 48000;

/**
 * Describe a livestream's fMP4 initialization segment: every track in its `moov`, each with the format a decoder is configured from.
 *
 * This is a total, synchronous, pure function that never throws: a non-box input or a missing `moov` describes as no tracks, a malformed init as the tracks that
 * were readable, and a truncated init as the tracks it holds whole. The livestream session reads it once per init frame, and a consumer holding init bytes of its
 * own reaches it through the static `ProtectClient.describeInitSegment`.
 *
 * @param data - The init segment bytes. Accepts any `Uint8Array` (a `Buffer` included) and reads it without copying.
 *
 * @returns The stream's description.
 *
 * @category Codec
 */
export function describeInitSegment(data: Uint8Array): LivestreamDescription {

  const bytes = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  const moov = findChild(bytes, { end: bytes.length, start: 0 }, "moov");
  const tracks: LivestreamTrack[] = [];

  if(moov === undefined) {

    return { tracks };
  }

  // A cut `trak` is passed over: its description may be the cut's rather than the stream's, and a truncated init reports only the tracks it holds whole.
  for(const box of children(bytes, moov)) {

    if((box.type !== "trak") || box.clamped) {

      continue;
    }

    const track = readTrack(bytes, box);

    if(track !== undefined) {

      tracks.push(track);
    }
  }

  return { tracks };
}

// Describe one `trak`. A track without a readable `tkhd` has no id to report, so it is skipped; every other track describes as its sample entry's format, or as the
// unknown arm when the entry is absent or unreadable.
function readTrack(bytes: Buffer, trak: Box): LivestreamTrack | undefined {

  const tkhd = findChild(bytes, trak, "tkhd");
  const version = readUInt(bytes, tkhd, PayloadOffset.VERSION, 1);
  const id = readUInt(bytes, tkhd, (version === 1) ? PayloadOffset.TKHD_TRACK_ID_V1 : PayloadOffset.TKHD_TRACK_ID_V0, 4);

  if(id === undefined) {

    return undefined;
  }

  const mdia = findChild(bytes, trak, "mdia");
  const kind = handlerKind(readFourCc(bytes, findChild(bytes, mdia, "hdlr"), PayloadOffset.HDLR_HANDLER_TYPE));
  const stsd = findChild(bytes, findChild(bytes, findChild(bytes, mdia, "minf"), "stbl"), "stsd");
  const entry = firstSampleEntry(bytes, stsd);

  if(entry === undefined) {

    return { codec: "unknown", id, kind, sampleEntry: "" };
  }

  return readSampleEntry(bytes, { entry, id, stsdVersion: readUInt(bytes, stsd, PayloadOffset.VERSION, 1) ?? 0 }) ??
    { codec: "unknown", id, kind, sampleEntry: entry.type };
}

// The kind a handler type names: `vide` is video, `soun` is audio, and anything else, an absent handler included, is unknown.
function handlerKind(handlerType: string | undefined): "audio" | "unknown" | "video" {

  switch(handlerType) {

    case "soun":

      return "audio";

    case "vide":

      return "video";

    default:

      return "unknown";
  }
}

// The first sample entry an `stsd` lists, or undefined when the box is absent or lists no entry.
function firstSampleEntry(bytes: Buffer, stsd: Box | undefined): Box | undefined {

  const count = readUInt(bytes, stsd, PayloadOffset.STSD_ENTRY_COUNT, 4);

  if((stsd === undefined) || (count === undefined) || (count === 0)) {

    return undefined;
  }

  for(const entry of children(bytes, { end: stsd.end, start: stsd.start + PayloadOffset.STSD_ENTRIES })) {

    return entry;
  }

  return undefined;
}

// Read a sample entry the reader describes into its track, or undefined when the entry is one it does not describe or its configuration cannot be read.
function readSampleEntry(bytes: Buffer, opts: { entry: Box; id: number; stsdVersion: number }): LivestreamTrack | undefined {

  const { entry, id, stsdVersion } = opts;
  const video = VIDEO_FORMATS.get(entry.type);

  if(video !== undefined) {

    return readVideoEntry(bytes, { entry, format: video, id });
  }

  switch(entry.type) {

    case "mp4a": {

      const format = readAacFormat(bytes, findEsds(bytes, audioChildren(bytes, entry, stsdVersion)));

      return (format === undefined) ? undefined : { channels: format.channels, codec: "aac", id, kind: "audio", sampleRate: format.sampleRate };
    }

    case "Opus": {

      const channels = readUInt(bytes, findChild(bytes, audioChildren(bytes, entry, stsdVersion), "dOps"), 1, 1);

      return (channels === undefined) ? undefined : { channels, codec: "opus", id, kind: "audio", sampleRate: OPUS_DECODE_RATE };
    }

    default:

      return undefined;
  }
}

// Read a video sample entry: its dimensions from the entry's own fields and its profile and level from the decoder configuration record among its children.
function readVideoEntry(bytes: Buffer, opts: { entry: Box; format: VideoFormat; id: number }): LivestreamTrack | undefined {

  const { entry, format, id } = opts;
  const width = readUInt(bytes, entry, SampleEntryOffset.VISUAL_WIDTH, 2);
  const height = readUInt(bytes, entry, SampleEntryOffset.VISUAL_HEIGHT, 2);
  const config = findChild(bytes, { end: entry.end, start: entry.start + SampleEntryOffset.VISUAL_CHILDREN }, format.config);
  const profile = readConfigField(bytes, config, format.profile);
  const level = readConfigField(bytes, config, format.level);

  if((width === undefined) || (height === undefined) || (profile === undefined) || (level === undefined)) {

    return undefined;
  }

  return { codec: format.codec, height, id, kind: "video", level, profile, width };
}

// Read one field of a decoder configuration record, or undefined when the record is absent or too short to hold it.
function readConfigField(bytes: Buffer, config: Box | undefined, field: ConfigField): number | undefined {

  const byte = readUInt(bytes, config, field.byte, 1);

  return (byte === undefined) ? undefined : ((byte >> field.shift) & ((1 << field.bits) - 1));
}

// The span holding an audio sample entry's child boxes. Under an `stsd` of version 1 the entry is the ISO `AudioSampleEntryV1`; under version 0 the QuickTime
// sound-description version decides, and a version the reader does not know leaves the children unlocated.
function audioChildren(bytes: Buffer, entry: Box, stsdVersion: number): Span | undefined {

  const childrenAt = (offset: number): Span => ({ end: entry.end, start: entry.start + offset });

  if(stsdVersion === 1) {

    return childrenAt(SampleEntryOffset.AUDIO_CHILDREN);
  }

  switch(readUInt(bytes, entry, SampleEntryOffset.AUDIO_VERSION, 2)) {

    case 0:

      return childrenAt(SampleEntryOffset.AUDIO_CHILDREN);

    case 1:

      return childrenAt(SampleEntryOffset.AUDIO_CHILDREN_QUICKTIME_V1);

    case 2:

      return childrenAt(SampleEntryOffset.AUDIO_CHILDREN_QUICKTIME_V2);

    default:

      return undefined;
  }
}

// The `esds` among an audio entry's children, or inside the `wave` box a QuickTime sound description wraps it in.
function findEsds(bytes: Buffer, entryChildren: Span | undefined): Box | undefined {

  return findChild(bytes, entryChildren, "esds") ?? findChild(bytes, findChild(bytes, entryChildren, "wave"), "esds");
}

/* Read an AAC track's sample rate and channel count from its `esds`, or undefined when the configuration cannot be read or names a format other than AAC.
 *
 * The facts come from the `AudioSpecificConfig` alone, never from the `mp4a` entry's own `channelcount` and `samplerate` fields: Protect's muxer writes the template
 * value 2 into the channel count over a mono configuration, so the entry's fields describe the template rather than the stream.
 */
function readAacFormat(bytes: Buffer, esds: Box | undefined): { channels: number; sampleRate: number } | undefined {

  const config = findAudioSpecificConfig(bytes, esds);

  if(config === undefined) {

    return undefined;
  }

  const reader = new BitReader(bytes, config);
  const objectType = readAudioObjectType(reader);
  let sampleRate = readSamplingFrequency(reader);
  const channelConfiguration = reader.read(4);

  // SBR and PS signal the extension sampling frequency, the rate the decoder produces, and then the core codec's own object type, whose configuration follows.
  if((objectType === AudioObjectType.SBR) || (objectType === AudioObjectType.PS)) {

    sampleRate = readSamplingFrequency(reader);
    readAudioObjectType(reader);
  } else if(objectType !== AudioObjectType.AAC_LC) {

    return undefined;
  }

  const channels = readChannelCount(reader, channelConfiguration);

  if(reader.overrun || (sampleRate === undefined) || (channels === undefined)) {

    return undefined;
  }

  // Parametric stereo decodes a mono core into stereo, so a PS stream over one coded channel plays as two.
  return { channels: ((objectType === AudioObjectType.PS) && (channels === 1)) ? 2 : channels, sampleRate };
}

/* Locate the `AudioSpecificConfig` inside an `esds`: the elementary stream descriptor, then its decoder configuration descriptor, which must name MPEG-4 audio, then
 * that descriptor's decoder-specific info, whose payload is the configuration.
 *
 * The elementary stream descriptor opens with its 16-bit id and a flags byte, and each set flag adds an optional field before its nested descriptors: a 16-bit
 * dependency id, a length-prefixed URL and a 16-bit OCR stream id.
 */
function findAudioSpecificConfig(bytes: Buffer, esds: Box | undefined): Span | undefined {

  if(esds === undefined) {

    return undefined;
  }

  const es = findDescriptor(bytes, { end: esds.end, start: esds.start + 4 }, DescriptorTag.ELEMENTARY_STREAM);
  const flags = readUInt(bytes, es, 2, 1);

  if((es === undefined) || (flags === undefined)) {

    return undefined;
  }

  let offset = 3;

  if(flags & EsDescriptorFlag.STREAM_DEPENDENCE) {

    offset += 2;
  }

  if(flags & EsDescriptorFlag.URL) {

    offset += 1 + (readUInt(bytes, es, offset, 1) ?? 0);
  }

  if(flags & EsDescriptorFlag.OCR_STREAM) {

    offset += 2;
  }

  const decoderConfig = findDescriptor(bytes, { end: es.end, start: es.start + offset }, DescriptorTag.DECODER_CONFIG);

  if((decoderConfig === undefined) || (readUInt(bytes, decoderConfig, 0, 1) !== OBJECT_TYPE_MPEG4_AUDIO)) {

    return undefined;
  }

  return findDescriptor(bytes, { end: decoderConfig.end, start: decoderConfig.start + DECODER_CONFIG_FIXED_SIZE }, DescriptorTag.DECODER_SPECIFIC_INFO);
}

// Read an audio object type: five bits, the escape value reading as 32 plus the next six.
function readAudioObjectType(reader: BitReader): number {

  const objectType = reader.read(5);

  return (objectType === AudioObjectType.ESCAPE) ? (AudioObjectType.ESCAPE_BASE + reader.read(6)) : objectType;
}

// Read a sampling frequency: a four-bit index into the table, or the escape followed by the explicit 24-bit rate. A reserved index reads as undefined.
function readSamplingFrequency(reader: BitReader): number | undefined {

  const index = reader.read(4);

  return (index === SAMPLING_FREQUENCY_ESCAPE) ? reader.read(24) : SAMPLING_FREQUENCIES[index];
}

// Read the channel count a channel configuration names, reading the program config element when the configuration defers to it. A reserved configuration reads as
// undefined.
function readChannelCount(reader: BitReader, channelConfiguration: number): number | undefined {

  if(channelConfiguration === CHANNEL_CONFIGURATION_FROM_PCE) {

    return readProgramConfigChannels(reader);
  }

  if(channelConfiguration <= CHANNEL_CONFIGURATION_DIRECT_MAX) {

    return channelConfiguration;
  }

  return (channelConfiguration === CHANNEL_CONFIGURATION_EIGHT) ? 8 : undefined;
}

/* Count the channels a program config element declares. It follows the `GASpecificConfig`'s own fields, which the reader steps over first: the frame length flag,
 * the core coder flag with its 14-bit delay when set, and the extension flag.
 *
 * The element then carries its instance tag, object type and sampling-frequency index, which the count does not need; its front, side, back and LFE element counts;
 * its associated-data and coupling-channel counts; three optional mixdown fields; and one entry per front, side and back element, a flag marking a channel pair ahead
 * of a four-bit tag. The count is those elements, a pair counting as two, plus the LFE elements.
 */
function readProgramConfigChannels(reader: BitReader): number {

  reader.skip(1);

  if(reader.read(1) === 1) {

    reader.skip(14);
  }

  reader.skip(1);
  reader.skip(4 + 2 + 4);

  const elements = reader.read(4) + reader.read(4) + reader.read(4);
  let channels = reader.read(2);

  reader.skip(3 + 4);

  for(const mixdownBits of [ 4, 4, 3 ]) {

    if(reader.read(1) === 1) {

      reader.skip(mixdownBits);
    }
  }

  for(let element = 0; element < elements; element++) {

    channels += (reader.read(1) === 1) ? 2 : 1;
    reader.skip(4);
  }

  return channels;
}

/* A big-endian bit reader over a span, for the `AudioSpecificConfig`'s packed fields.
 *
 * A read that runs past the span answers zero and marks the reader overrun, rather than answering undefined at each call: the configuration's later fields depend
 * on its earlier ones, so a caller reads the whole configuration and checks `overrun` once, and a cut configuration reads as unknown instead of throwing.
 */
class BitReader {

  readonly #bytes: Buffer;
  readonly #end: number;
  #overrun = false;
  #position: number;

  constructor(bytes: Buffer, span: Span) {

    this.#bytes = bytes;
    this.#end = span.end * 8;
    this.#position = span.start * 8;
  }

  // Whether any read ran past the span.
  get overrun(): boolean {

    return this.#overrun;
  }

  // Read the next `bits` bits as an unsigned integer, most significant bit first.
  read(bits: number): number {

    if((this.#position + bits) > this.#end) {

      this.#overrun = true;
      this.#position = this.#end;

      return 0;
    }

    let value = 0;

    for(let index = 0; index < bits; index++) {

      const bit = (this.#bytes.readUInt8(this.#position >> 3) >> (7 - (this.#position & 7))) & 1;

      value = (value * 2) + bit;
      this.#position++;
    }

    return value;
  }

  // Step over the next `bits` bits.
  skip(bits: number): void {

    this.read(bits);
  }
}

// Iterate the boxes within a span. A size of one reads the 64-bit `largesize`, a size of zero runs to the span's end, a size past the span's end is clamped to it and
// the box still yielded marked as clamped, and a size smaller than its own header, or a header the span cannot hold, ends the walk.
function *children(bytes: Buffer, parent: Span): Generator<Box> {

  let offset = parent.start;

  while((parent.end - offset) >= BOX_HEADER_SIZE) {

    const declared = bytes.readUInt32BE(offset);
    const type = bytes.toString("latin1", offset + 4, offset + 8);

    let headerSize = BOX_HEADER_SIZE;
    let size = declared;

    if(declared === BoxSize.TO_END) {

      size = parent.end - offset;
    } else if(declared === BoxSize.LARGE) {

      if((parent.end - offset) < LARGE_BOX_HEADER_SIZE) {

        return;
      }

      headerSize = LARGE_BOX_HEADER_SIZE;
      size = Number(bytes.readBigUInt64BE(offset + BOX_HEADER_SIZE));
    }

    if(size < headerSize) {

      return;
    }

    const end = Math.min(offset + size, parent.end);

    yield { clamped: (offset + size) > parent.end, end, start: offset + headerSize, type };

    offset = end;
  }
}

// The first child box of a type within a span, or undefined when the span is absent or holds none.
function findChild(bytes: Buffer, parent: Span | undefined, type: string): Box | undefined {

  if(parent === undefined) {

    return undefined;
  }

  for(const box of children(bytes, parent)) {

    if(box.type === type) {

      return box;
    }
  }

  return undefined;
}

// The first descriptor of a tag within a span, as the span of its body, or undefined when the span holds none. A descriptor is a tag byte, an expandable length, then
// its body; a body that runs past the span is clamped to its end, as a box is, and a length that never ends within its four bytes ends the walk.
function findDescriptor(bytes: Buffer, parent: Span, tag: number): Span | undefined {

  let offset = parent.start;

  while(offset < parent.end) {

    const found = bytes.readUInt8(offset);
    let cursor = offset + 1;
    let length = 0;
    let more = true;

    for(let count = 0; more; count++) {

      if((count === DESCRIPTOR_LENGTH_MAX_BYTES) || (cursor >= parent.end)) {

        return undefined;
      }

      const byte = bytes.readUInt8(cursor++);

      length = (length * 128) + (byte & 0x7f);
      more = (byte & 0x80) !== 0;
    }

    const end = Math.min(cursor + length, parent.end);

    if(found === tag) {

      return { end, start: cursor };
    }

    offset = end;
  }

  return undefined;
}

// Read an unsigned big-endian integer `width` bytes wide at `offset` within a span, or undefined when the span is absent or the field runs past its end. Every fixed
// field the walk reads comes through here, which is what keeps a truncated or malformed init from ever throwing.
function readUInt(bytes: Buffer, span: Span | undefined, offset: number, width: 1 | 2 | 4): number | undefined {

  if((span === undefined) || ((span.start + offset + width) > span.end)) {

    return undefined;
  }

  return bytes.readUIntBE(span.start + offset, width);
}

// Read a four-character code at `offset` within a span, or undefined when the span is absent or the code runs past its end.
function readFourCc(bytes: Buffer, span: Span | undefined, offset: number): string | undefined {

  if((span === undefined) || ((span.start + offset + 4) > span.end)) {

    return undefined;
  }

  return bytes.toString("latin1", span.start + offset, span.start + offset + 4);
}
