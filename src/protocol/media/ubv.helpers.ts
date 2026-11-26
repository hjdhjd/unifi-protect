/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * ubv.helpers.ts: Test-only builder of UBV records from stated field values, so the UBV suite builds a stream through the record layout rather than by hand.
 *
 * The builder restates the layout `ubv.ts` reads, field by field and apart from the reader, so a layout error on either side fails a row rather than cancelling out.
 * Every value it writes is a suite's own, the fields the reader passes over included.
 */

// The track ids the suites build records for.
export const UBV_AAC = 1000;
export const UBV_AV1 = 1004;
export const UBV_CLOCK = 0xda7e;
export const UBV_H264 = 7;
export const UBV_H265 = 1003;
export const UBV_OPUS = 1002;

/* The fields of one record. The builder writes the 20-byte header unless `longHeader` is false, the marker `a0` unless `marker` states another, the keyframe flag
 * when `keyframe` is set, the payload's own length unless `size` states another, and a trailer counting the header and the padded payload unless `trailer` states
 * another. `kind` fills byte 3, `code` bytes 5 to 7 and `shortField` bytes 8 to 11 of the 16-byte header, none of which the reader reads; each is 0 unless given.
 */
export interface UbvRecordFields {

  readonly code?: number;
  readonly keyframe?: boolean;
  readonly kind?: number;
  readonly longHeader?: boolean;
  readonly marker?: number;
  readonly payload: Uint8Array;
  readonly shortField?: number;
  readonly size?: number;
  readonly timestamp?: number;
  readonly track: number;
  readonly trailer?: number;
}

// One UBV record: the header, the payload, zero bytes up to the next four-byte boundary, then the 32-bit trailer. The 20-byte header writes its 64-bit timestamp as
// the high 32 bits at offset 8 and the low 32 bits at offset 12, then the payload's size at 16; the 16-byte header writes the size at 12.
export function ubvRecord(fields: UbvRecordFields): Buffer {

  const { code = 0, keyframe = false, kind = 0, longHeader = true, marker = 0xa0, payload, shortField = 0, size = payload.length, timestamp = 0, track,
    trailer } = fields;
  const headerSize = longHeader ? 20 : 16;
  const padding = (4 - (payload.length % 4)) % 4;
  const header = Buffer.alloc(headerSize);
  const end = Buffer.alloc(4);

  header.writeUInt8(marker, 0);
  header.writeUInt16BE(track, 1);
  header.writeUInt8(kind, 3);
  header.writeUInt8((longHeader ? 0x04 : 0) | (keyframe ? 0x20 : 0), 4);
  header.writeUIntBE(code, 5, 3);

  if(longHeader) {

    header.writeUInt32BE(Math.floor(timestamp / (2 ** 32)), 8);
    header.writeUInt32BE(timestamp % (2 ** 32), 12);
    header.writeUInt32BE(size, 16);
  } else {

    header.writeUInt32BE(shortField, 8);
    header.writeUInt32BE(size, 12);
  }

  end.writeUInt32BE(trailer ?? (headerSize + payload.length + padding), 0);

  return Buffer.concat([ header, payload, Buffer.alloc(padding), end ]);
}
