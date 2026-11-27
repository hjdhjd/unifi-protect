/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * json.ts: The one reader of untrusted JSON text, whose refusal names where the text failed to parse and never quotes it.
 */

/**
 * The JSON reader: the one parse of untrusted text, such as a controller's response body, a realtime frame, a ufp.json configuration or a value typed on the
 * command line.
 *
 * The parser's own error is never carried, because its message can quote the text: where V8 does not report the position a parse failed at, it quotes a snippet
 * of the text around the failure instead, and that snippet is whatever the text held there...part of a controller's response, a field of a realtime frame, or,
 * in a hand-written ufp.json, a password. A refusal carrying that error as its `cause` would hand the snippet to the error-chain renderer and every log the chain
 * reaches. The position alone says where to look and quotes nothing, so it is the one part of that message the reader keeps. The reader answers a result rather
 * than throwing, because each caller refuses with its own typed error and its own sentence, and {@link jsonRefusal} completes that sentence from the answer, so
 * every refusal places the position and its closing period the same way.
 *
 * It holds no state and depends on nothing else in the library. It is internal, and the barrel exports none of it.
 *
 * @module ProtectJson
 */

// The clause V8's JSON parser closes a message with when it reports where a parse failed, such as "at position 2 (line 1 column 3)".
const JSON_ERROR_POSITION = /at position \d+ \(line \d+ column \d+\)/;

/**
 * What {@link readJson} answers: the parsed value for valid JSON, and otherwise the position the parse failed at, `null` when the parser reported none.
 *
 * @category Utilities
 */
export type JsonRead = { readonly parsed: true; readonly value: unknown } | { readonly parsed: false; readonly position: string | null };

/**
 * Parse text as JSON, answering the value it holds or, when it is not valid JSON, where the parse failed.
 *
 * A failure answers the position clause V8 closes its message with, such as `"at position 2 (line 1 column 3)"`, and `null` when the message carries none because
 * it quotes a snippet of the text instead. Neither the parser's error nor its message is returned or kept, so a refusal built from the answer carries nothing of
 * the text.
 *
 * @param text - The text to parse.
 *
 * @returns `{ parsed: true, value }` for valid JSON, and `{ parsed: false, position }` for anything else.
 *
 * @category Utilities
 */
export function readJson(text: string): JsonRead {

  try {

    return { parsed: true, value: JSON.parse(text) };
  } catch(error) {

    return { parsed: false, position: (error instanceof SyntaxError) ? (JSON_ERROR_POSITION.exec(error.message)?.[0] ?? null) : null };
  }
}

/**
 * Build the sentence a caller refuses text that is not JSON with: the subject the caller names, the position the parse failed at when the parser reported one,
 * and the closing period.
 *
 * @param subject - The refusal's opening, naming what failed to parse and written without its closing period, such as `"The --patch value is not valid JSON"`.
 * @param read    - The failed read, whose position the sentence carries when it is not `null`.
 *
 * @returns The whole sentence, such as `"The --patch value is not valid JSON at position 2 (line 1 column 3)."`.
 *
 * @category Utilities
 */
export function jsonRefusal(subject: string, read: { position: string | null }): string {

  return subject + ((read.position !== null) ? (" " + read.position) : "") + ".";
}
