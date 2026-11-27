/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * json.test.ts: Unit tests for the one JSON reader, the sentence its callers refuse with, and the refusal each of its callers builds from it. The reader's rows hold
 * that valid JSON parses to the value it holds, that a failure V8 reports by its position answers that position, and that a failure V8 reports by quoting the text
 * answers nothing of it. The sentence's row holds its subject, the position where the read has one, and the closing period. Each caller's row holds that its
 * refusal keeps its class and its sentence, gains the position where the parser reports one, carries no cause, and repeats nothing of the failing text in its
 * message or its rendered error chain. Every text here is synthetic.
 */
import { PACKET_TYPE_DATA, PAYLOAD_FORMAT_JSON, buildFrame, buildPacket, jsonActionFrame, makeActionHeader } from "../protocol/realtime/packet.helpers.ts";
import { ProtectProtocolError, formatErrorChain } from "./errors.ts";
import { decodePacket, parsePacket } from "../protocol/realtime/packet.ts";
import { describe, test } from "node:test";
import { jsonRefusal, readJson } from "./json.ts";
import { makeCommandContext, makeFakeClient } from "../cli/fake-client.helpers.ts";
import { CliError } from "../cli/shared.ts";
import { ProtectResponse } from "../transport/http.ts";
import assert from "node:assert/strict";
import { inspect } from "node:util";
import { loadCredentials } from "../cli/credentials.ts";
import { parseSchemaManifest } from "../cli/commands/capture/manifest.ts";
import path from "node:path";
import { update } from "../cli/commands/update.ts";
import { withTempDir } from "./testing.helpers.ts";
import { writeFile } from "node:fs/promises";

// The token each malformed text below carries, which no answer and no refusal may repeat.
const TOKEN = "quokka";

// A text V8 reports by the position its parse failed at, and the clause it reports that position with.
const BY_POSITION = "{\"name\": \"x\" quokka}";
const POSITION = "at position 13 (line 1 column 14)";

// A text V8 reports by quoting a snippet of it, the token among what it quotes.
const BY_SNIPPET = "{\"name\": quokka}";

// Run a caller and answer what it threw or rejected with, failing the row when it accepted its text.
async function refusalOf(run: () => unknown): Promise<unknown> {

  try {

    await run();
  } catch(error) {

    return error;
  }

  return assert.fail("The malformed text was accepted.");
}

/* Run a caller over the text V8 reports by position and then the one it reports by snippet, holding each refusal to the caller's class and sentence, with the
 * position before the closing period where the parser reported one, no cause, and the token in neither its message nor its rendered chain. The refusals are
 * answered for any check a caller's row adds.
 */
async function assertRefusals<E extends Error>(refuse: (text: string) => unknown, expected: { sentence: string; type: new (...args: never[]) => E }): Promise<E[]> {

  const refusals: E[] = [];

  for(const [ text, message ] of [ [ BY_POSITION, expected.sentence + " " + POSITION + "." ], [ BY_SNIPPET, expected.sentence + "." ] ] as const) {

    // Sequential by intent: a caller that reads a file reads the one file each text is written to in turn.
    // eslint-disable-next-line no-await-in-loop
    const error = await refusalOf(() => refuse(text));

    assert.ok(error instanceof expected.type, "the refusal keeps its class");
    assert.equal(error.message, message);
    assert.equal(error.cause, undefined, "the parser's error is not carried");

    for(const rendered of [ error.message, formatErrorChain(error) ]) {

      assert.ok(!rendered.includes(TOKEN), "nothing of the text is repeated: " + rendered);
    }

    refusals.push(error);
  }

  return refusals;
}

describe("readJson", () => {

  test("valid JSON parses to the value it holds", () => {

    assert.deepEqual(readJson("{\"name\":\"x\",\"list\":[1,true,null]}"), { parsed: true, value: { list: [ 1, true, null ], name: "x" } });
  });

  test("a failure V8 reports by its position answers that position", () => {

    assert.deepEqual(readJson(BY_POSITION), { parsed: false, position: POSITION });
    assert.deepEqual(readJson("{\n  \"a\": 1,\n  quokka\n}"), { parsed: false, position: "at position 14 (line 3 column 3)" }, "a line past the first is read too");
  });

  test("a failure V8 reports by quoting the text answers no position and nothing of the text", () => {

    // The parser's own message quotes the token, so the answer's silence about it is the reader's doing rather than the parser's.
    assert.throws(() => JSON.parse(BY_SNIPPET), { constructor: SyntaxError, message: new RegExp(TOKEN) });

    const read = readJson(BY_SNIPPET);

    assert.deepEqual(read, { parsed: false, position: null });
    assert.ok(!inspect(read).includes(TOKEN), "the answer carries nothing of the text");
  });
});

describe("jsonRefusal", () => {

  test("answers the subject, the position when the read has one, and the closing period", () => {

    assert.equal(jsonRefusal("The text is not valid JSON", { position: POSITION }), "The text is not valid JSON " + POSITION + ".");
    assert.equal(jsonRefusal("The text is not valid JSON", { position: null }), "The text is not valid JSON.", "a read with no position closes on the subject");
  });
});

describe("the refusal each caller builds from readJson", () => {

  test("ProtectResponse.json refuses a body that is not JSON with its own sentence", async () => {

    await assertRefusals((text) => new ProtectResponse(200, {}, Buffer.from(text)).json(),
      { sentence: "The UniFi Protect controller returned a response that could not be parsed as JSON", type: ProtectProtocolError });
  });

  test("the realtime codec refuses a data frame and a recorded packet that are not JSON, each with its own sentence", async () => {

    const packet = (text: string): Buffer => buildPacket(jsonActionFrame(makeActionHeader()),
      buildFrame({ packetType: PACKET_TYPE_DATA, payload: Buffer.from(text), payloadFormat: PAYLOAD_FORMAT_JSON }));

    await assertRefusals((text) => decodePacket(packet(text)), { sentence: "Realtime events packet payload is not valid JSON", type: ProtectProtocolError });
    await assertRefusals((text) => parsePacket(text), { sentence: "Recorded realtime events packet is not valid JSON", type: ProtectProtocolError });
  });

  test("ufp update refuses a --patch value that is not JSON with its own sentence and its usage exit code", async () => {

    const { client } = makeFakeClient({ lights: [{ id: "l1", name: "Porch" }] });
    const refusals = await assertRefusals((text) => update.run(makeCommandContext({ args: [ "Porch", "--patch", text ], client }).ctx),
      { sentence: "The --patch value is not valid JSON", type: CliError });

    for(const refusal of refusals) {

      assert.equal(refusal.exitCode, 2);
    }
  });

  test("the schema manifest loader refuses text that is not JSON with its own sentence", async () => {

    await assertRefusals((text) => parseSchemaManifest(text, "manifest.json"), { sentence: "The schema manifest at manifest.json is not valid JSON", type: CliError });
  });

  test("the credentials loader refuses a ufp.json that is not JSON with its own sentence", async () => {

    await withTempDir(async (dir) => {

      const file = path.join(dir, "ufp.json");

      await assertRefusals(async (text) => {

        await writeFile(file, text);

        return loadCredentials({ cwd: dir, home: dir });
      }, { sentence: "The ufp.json configuration at " + file + " is not valid JSON", type: CliError });
    });
  });
});
