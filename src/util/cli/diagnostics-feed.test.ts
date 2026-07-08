/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * diagnostics-feed.test.ts: Unit tests for the shared diagnostics render helpers - the subsystem color dispatch and the JSON-vs-human render branch that both `ufp
 * diagnostics` and `ufp watch livestream --diagnostics` route through.
 */
import { colorChannel, renderDiagnostic } from "./diagnostics-feed.ts";
import { describe, test } from "node:test";
import { Output } from "./output/format.ts";
import type { OutputStream } from "./output/format.ts";
import assert from "node:assert/strict";

// A capturing Output over an in-memory stream with color forced on, so the palette-vs-gray dispatch and the human render line are both observable as plain strings
// without touching the real process streams or depending on TTY detection.
function captureOutput(): { lines: string[]; output: Output } {

  const lines: string[] = [];
  const stream: OutputStream = { write: (chunk: string | Uint8Array): boolean => (lines.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString()), true) };

  return { lines, output: new Output({ colorize: true, env: {}, stream }) };
}

describe("colorChannel", () => {

  test("routes a known subsystem through its palette color and an unknown one through gray", () => {

    const { output } = captureOutput();

    // The subsystem is the second colon-delimited segment of the channel name; http maps to blue, an unrecognized subsystem falls back to gray. Comparing against the
    // palette functions directly proves the dispatch without asserting raw escape sequences.
    assert.equal(colorChannel(output, "unifi-protect:http:request"), output.colors.blue("unifi-protect:http:request"));
    assert.equal(colorChannel(output, "unifi-protect:mystery:thing"), output.colors.gray("unifi-protect:mystery:thing"));
  });
});

describe("renderDiagnostic", () => {

  test("emits one canonical JSON object per event when json is set", () => {

    const { lines, output } = captureOutput();

    renderDiagnostic(output, "unifi-protect:http:request", { method: "GET" }, { json: true });

    assert.deepEqual(JSON.parse(lines.join("")), { channel: "unifi-protect:http:request", payload: { method: "GET" } });
  });

  test("emits a timestamped human line carrying the channel and the stringified payload when json is not set", () => {

    const { lines, output } = captureOutput();

    renderDiagnostic(output, "unifi-protect:events:packet", { id: "c1" });

    const line = lines.join("");

    assert.match(line, /unifi-protect:events:packet/);
    assert.match(line, /\{"id":"c1"\}/);
  });

  test("renders a payload-less channel as a bare line with no payload object", () => {

    const { lines, output } = captureOutput();

    // A channel published with no payload renders the (undefined) payload as an empty string, so the human line carries the channel name but no trailing JSON object.
    renderDiagnostic(output, "unifi-protect:schema:unknownModelKey", undefined);

    assert.match(lines.join(""), /unifi-protect:schema:unknownModelKey/);
    assert.doesNotMatch(lines.join(""), /\{/);
  });
});
