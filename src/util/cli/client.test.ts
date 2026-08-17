/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * client.test.ts: Unit tests for the CLI's stderr-routed logger - level gating (warn/error always, info/debug behind --debug) and the structured-context rendering that
 * keeps an object or Error legible. The connect-assembly half of this module (openClient) is the deliberately-mocked dependency and is exercised one layer down, at the
 * ProtectClient.connect boundary.
 */
import { createCliLogger, resolveInteractivePrompt } from "./client.ts";
import { describe, test } from "node:test";
import type { InteractivePrompt } from "./credentials.ts";
import type { OutputStream } from "./output/format.ts";
import assert from "node:assert/strict";

// A capturing stream standing in for stderr, so the logger's routing, level gating, and parameter rendering are observable without touching the real process streams.
function capture(): { lines: string[]; stream: OutputStream } {

  const lines: string[] = [];

  // The write callback always reports capacity by returning true - these tests never simulate stream backpressure, so every chunk is captured unconditionally.
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

describe("resolveInteractivePrompt", () => {

  // The gate reads nothing but `isTTY`, so a bare object carrying that flag is the whole fixture. The cast is the structural-fake-to-nominal coercion the rest of the
  // suite uses at this boundary; nothing in the gate touches any other stream member.
  const stream = (isTTY: boolean | undefined): InteractivePrompt["input"] & InteractivePrompt["output"] => {

    return { isTTY } as unknown as InteractivePrompt["input"] & InteractivePrompt["output"];
  };

  test("a terminal on both streams yields the prompt option carrying those streams", () => {

    const input = stream(true);
    const output = stream(true);
    const signal = new AbortController().signal;
    const resolved = resolveInteractivePrompt({ input, output, signal });

    assert.equal(resolved?.input, input, "the option carries the very streams it was handed");
    assert.equal(resolved?.output, output);
    assert.equal(resolved?.signal, signal, "the prompt is cancellable by the same signal the run is");
  });

  test("the signal is left off entirely when the caller has none", () => {

    // Absent rather than undefined, so a prompt built from this option is never handed a signal member that is not there.
    assert.deepEqual(Object.keys(resolveInteractivePrompt({ input: stream(true), output: stream(true) }) ?? {}).sort(), [ "input", "output" ]);
  });

  test("anything short of a terminal on both streams declines", () => {

    // A pipe on either side means there is nobody to answer a question, so the loader keeps the behavior it has in every script and CI job.
    for(const [ input, output ] of [ [ true, false ], [ false, true ], [ false, false ], [ undefined, undefined ], [ true, undefined ] ] as const) {

      assert.equal(resolveInteractivePrompt({ input: stream(input), output: stream(output) }), undefined,
        "input isTTY=" + String(input) + ", output isTTY=" + String(output));
    }
  });
});
