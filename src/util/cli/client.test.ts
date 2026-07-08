/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * client.test.ts: Unit tests for the CLI's stderr-routed logger - level gating (warn/error always, info/debug behind --debug) and the structured-context rendering that
 * keeps an object or Error legible. The connect-assembly half of this module (openClient) is the deliberately-mocked seam and is exercised one layer down, at the
 * ProtectClient.connect boundary.
 */
import { describe, test } from "node:test";
import type { OutputStream } from "./output/format.ts";
import assert from "node:assert/strict";
import { createCliLogger } from "./client.ts";

// A capturing stream standing in for stderr, so the logger's routing, level gating, and parameter rendering are observable without touching the real process streams.
function capture(): { lines: string[]; stream: OutputStream } {

  const lines: string[] = [];

  return { lines, stream: { write: (chunk: string | Uint8Array): boolean => (lines.push((typeof chunk === "string") ? chunk : Buffer.from(chunk).toString()), true) } };
}

describe("createCliLogger", () => {

  test("always prints warn and error, and gates info and debug behind debug", () => {

    const { lines, stream } = capture();
    const log = createCliLogger({ debug: false, stream });

    log.warn("a warning");
    log.error("an error");
    log.info("an info line");
    log.debug("a debug line");

    // Warnings and errors always reach the stream, tagged with their level; the lower-volume info and debug stay silent without debug enabled.
    assert.deepEqual(lines, [ "[warn] a warning\n", "[error] an error\n" ]);
  });

  test("prints info and debug once debug is enabled", () => {

    const { lines, stream } = capture();
    const log = createCliLogger({ debug: true, stream });

    log.info("an info line");
    log.debug("a debug line");

    assert.deepEqual(lines, [ "[info] an info line\n", "[debug] a debug line\n" ]);
  });

  test("inspects non-string context so an object or Error prints legibly, and adds no trailing space when there is none", () => {

    const { lines, stream } = capture();
    const log = createCliLogger({ debug: false, stream });

    log.warn("throttled", { reason: "backoff" });
    log.error("failed", new Error("boom"));
    log.error("plain");

    // A structured context object is inspected (not "[object Object]"), an Error renders its message, and a parameterless line carries no trailing space before the
    // newline - so a human reading stderr gets the detail without noise.
    assert.match(lines[0] ?? "", /^\[warn\] throttled \{ reason: 'backoff' \}\n$/);
    assert.match(lines[1] ?? "", /^\[error\] failed Error: boom/);
    assert.equal(lines[2], "[error] plain\n");
  });
});
