/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * format.test.ts: Unit tests for the Output value object and the presentation helpers (byte/duration/timestamp formatting).
 */
import { Output, alignedList, compareCodeUnit, formatBytes, formatDuration, nowStamp } from "./format.ts";
import { describe, test } from "node:test";
import assert from "node:assert/strict";

// A capturing stream: collects every write so the test can assert exactly what Output emitted. Colorization is forced off via the explicit `colorize: false` option;
// the `isTTY: false` field just shapes the fake stream realistically and never reaches the colorization decision, which short-circuits on the explicit false.
function capture(): { output: Output; written: () => string } {

  const chunks: string[] = [];
  const stream = {

    isTTY: false,
    write: (chunk: string | Uint8Array): boolean => {

      chunks.push((typeof chunk === "string") ? chunk : Buffer.from(chunk).toString());

      return true;
    }
  };

  return { output: new Output({ colorize: false, env: {}, stream }), written: (): string => chunks.join("") };
}

describe("Output", () => {

  test("write emits text with no newline; line appends one", () => {

    const { output, written } = capture();

    output.write("a");
    output.line("b");
    output.line();

    assert.equal(written(), "ab\n\n");
  });

  test("json emits one compact line per call (NDJSON)", () => {

    const { output, written } = capture();

    output.json({ a: 1, b: 2 });
    output.json({ c: 3 });

    assert.equal(written(), "{\"a\":1,\"b\":2}\n{\"c\":3}\n");
  });

  test("jsonPretty emits indented JSON", () => {

    const { output, written } = capture();

    output.jsonPretty({ a: 1 });

    assert.equal(written(), "{\n  \"a\": 1\n}\n");
  });

  test("json sorts object keys deterministically, recursing into nested objects", () => {

    const { output, written } = capture();

    // The input is parsed from a string rather than written as an object literal so its keys can be deliberately out of order; a source literal would be auto-sorted to
    // satisfy the house sort-keys rule, which would defeat the very thing this test asserts.
    output.json(JSON.parse("{\"b\":1,\"a\":{\"d\":4,\"c\":3}}"));

    assert.equal(written(), "{\"a\":{\"c\":3,\"d\":4},\"b\":1}\n");
  });

  test("json preserves array element order while sorting the keys within each element", () => {

    const { output, written } = capture();

    output.json(JSON.parse("{\"list\":[{\"y\":2,\"x\":1},{\"b\":2,\"a\":1}]}"));

    assert.equal(written(), "{\"list\":[{\"x\":1,\"y\":2},{\"a\":1,\"b\":2}]}\n");
  });

  test("json serializes a typed-array byte payload as an index-keyed object in byte order", () => {

    const { output, written } = capture();

    // A binary frame payload (a `watch raw` / `decode` Uint8Array or Buffer) serializes to an index-keyed object whose values stay in byte order, even where lexical and
    // numeric index order diverge ("10" stays after "9") - the observable contract those consumers rely on. The typed-array guard exempts byte payloads from the sort
    // machinery; integer keys canonicalize to this order anyway, so the guard says "bytes are data, not a record" - it is not the sole thing keeping them ordered.
    output.json({ payload: new Uint8Array([ 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15 ]) });

    assert.equal(written(), "{\"payload\":{\"0\":5,\"1\":6,\"2\":7,\"3\":8,\"4\":9,\"5\":10,\"6\":11,\"7\":12,\"8\":13,\"9\":14,\"10\":15}}\n");
  });

  test("jsonPretty also sorts object keys", () => {

    const { output, written } = capture();

    output.jsonPretty(JSON.parse("{\"b\":1,\"a\":2}"));

    assert.equal(written(), "{\n  \"a\": 2,\n  \"b\": 1\n}\n");
  });

  test("table aligns columns to the widest cell and trims trailing space", () => {

    const { output, written } = capture();

    output.table([ "A", "BB" ], [ [ "1", "22" ], [ "333", "4" ] ]);

    assert.equal(written(), "A    BB\n1    22\n333  4\n");
  });

  test("colorize defaults off for a non-TTY stream, so output is plain", () => {

    const { output, written } = capture();

    output.line(output.colors.red("x"));

    assert.equal(written(), "x\n");
  });
});

describe("alignedList", () => {

  test("pads every label to the widest, so the descriptions align in one column", () => {

    assert.deepEqual(alignedList([ [ "a", "x" ], [ "bbb", "y" ] ]), [ "  a    x", "  bbb  y" ]);
  });

  test("returns an empty list for no rows", () => {

    assert.deepEqual(alignedList([]), []);
  });
});

describe("compareCodeUnit", () => {

  test("orders by code unit - uppercase before lowercase, not locale collation", () => {

    assert.equal(compareCodeUnit("a", "b"), -1);
    assert.equal(compareCodeUnit("b", "a"), 1);
    assert.equal(compareCodeUnit("a", "a"), 0);
    assert.equal(compareCodeUnit("Z", "a"), -1);
  });
});

describe("formatBytes", () => {

  test("formats byte magnitudes with binary prefixes", () => {

    assert.equal(formatBytes(0), "0 B");
    assert.equal(formatBytes(512), "512 B");
    assert.equal(formatBytes(1024), "1.0 KiB");
    assert.equal(formatBytes(1536), "1.5 KiB");
    assert.equal(formatBytes(1048576), "1.0 MiB");
  });
});

describe("formatDuration", () => {

  test("formats the two most significant units, or 0s", () => {

    assert.equal(formatDuration(0), "0s");
    assert.equal(formatDuration(1000), "1s");
    assert.equal(formatDuration(65000), "1m 5s");
    assert.equal(formatDuration(3661000), "1h 1m");
    assert.equal(formatDuration(90061000), "1d 1h");
  });
});

describe("nowStamp", () => {

  test("is an HH:MM:SS.mmm stamp", () => {

    assert.match(nowStamp(), /^\d{2}:\d{2}:\d{2}\.\d{3}$/);
  });
});
