/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * format.ts: The Output value object - the single home for the CLI's stdout/stderr discipline, colorization, NDJSON, and table rendering.
 */
import { colorsEnabled, createPalette } from "./colors.ts";
import type { Palette } from "./colors.ts";

/**
 * The minimal writable surface the CLI needs. We type against this rather than `NodeJS.WriteStream` so output is testable with a trivial in-memory capture - and so the
 * abstraction states exactly what it uses: a `write` and an `isTTY` hint. (`Buffer extends Uint8Array`, so this accepts raw fMP4 frames as readily as text.)
 *
 * @category CLI
 */
export interface OutputStream {

  isTTY?: boolean;
  write(chunk: string | Uint8Array): boolean;
}

/**
 * Construction options for {@link Output}. All optional; the defaults bind to the real process streams and environment. A command that pipes a binary payload to stdout
 * constructs its `Output` with `stream: process.stderr` so every human-readable line lands on stderr and the stdout byte stream stays pristine.
 *
 * @category CLI
 */
export interface OutputOptions {

  colorize?: boolean;
  env?: NodeJS.ProcessEnv;
  stream?: OutputStream;
}

/**
 * `Output` is the one place the CLI decides *where* a byte goes and *whether* it is colored. Every command writes human-readable output through an `Output`; nothing
 * calls `console` (which the lint preset flags) or pokes `process.stdout` for text directly. Centralizing it is what makes the stdout-versus-stderr contract a property
 * of the design rather than a convention each command must remember - the binary-piping commands point their `Output` at stderr, and everything they log is automatically
 * kept clear of the payload on stdout.
 *
 * @category CLI
 */
export class Output {

  /** The resolved color palette for this output's stream. Commands call `output.colors.dim(...)` and never branch on whether color is enabled. */
  readonly colors: Palette;

  readonly #stream: OutputStream;

  constructor(opts: OutputOptions = {}) {

    const stream = opts.stream ?? process.stdout;
    const env = opts.env ?? process.env;

    this.#stream = stream;
    this.colors = createPalette(opts.colorize ?? colorsEnabled(stream, env));
  }

  /**
   * Write text with no trailing newline.
   *
   * @param text - The text to write.
   */
  write(text: string): void {

    this.#stream.write(text);
  }

  /**
   * Write a line of text, appending a newline.
   *
   * @param text - The line to write; defaults to an empty line.
   */
  line(text = ""): void {

    this.#stream.write(text + "\n");
  }

  /**
   * Write one value as a single line of compact JSON. Called once per record, this method produces NDJSON - the line-delimited capture format that `jq` and
   * fixture-replay tooling consume - which is exactly what `watch events --json` emits, one event per line with no truncation and no color. Object keys are emitted in
   * deterministic sorted order (see {@link sortKeysReplacer}), so a captured stream diffs and replays identically regardless of the order the wire delivered fields in.
   *
   * @param value - The value to serialize.
   */
  json(value: unknown): void {

    this.#stream.write(JSON.stringify(value, sortKeysReplacer) + "\n");
  }

  /**
   * Write one value as indented, human-readable JSON. For single-shot dumps (a controller summary, a device record) where readability beats line-delimited density.
   * Object keys are emitted in deterministic sorted order (see {@link sortKeysReplacer}), so a bootstrap or a reduced-state dump reads the same way every time.
   *
   * @param value - The value to serialize.
   */
  jsonPretty(value: unknown): void {

    this.#stream.write(JSON.stringify(value, sortKeysReplacer, 2) + "\n");
  }

  /**
   * Render a column-aligned table. Each column is padded to the width of its widest cell (header included); the header row is emphasized via the palette. Cells are
   * coerced to strings by the caller, so a column can carry pre-colored text and still align correctly - we measure visible width with the ANSI escapes stripped.
   *
   * @param headers - The column headers.
   * @param rows    - The data rows; each row must have one cell per header.
   */
  table(headers: string[], rows: string[][]): void {

    // Each column's width is the widest visible (escape-stripped) cell, so a colored cell does not throw alignment off by the byte length of its escapes.
    const widths = headers.map((header, column) => Math.max(visibleWidth(header), ...rows.map((row) => visibleWidth(row[column] ?? ""))));

    this.line(headers.map((header, column) => this.colors.bold(padVisible(header, widths[column] ?? 0))).join("  ").trimEnd());

    for(const row of rows) {

      this.line(row.map((cell, column) => padVisible(cell, widths[column] ?? 0)).join("  ").trimEnd());
    }
  }
}

/**
 * Render a list of label/description pairs as aligned lines: every label is right-padded to the widest label so the descriptions line up in one column. The single home
 * for the CLI's "name then description" lists - the top-level command list, the `watch` subcommand list, and the top-level examples block - so they all align by the same
 * rule and an added entry can never leave a list ragged (the width is measured from the entries, not hand-spaced). Each line is indented two spaces, with two spaces
 * between the columns.
 *
 * @param rows - The `[label, description]` pairs, in display order.
 *
 * @returns One formatted line per row.
 *
 * @category CLI
 */
export function alignedList(rows: readonly (readonly [string, string])[]): string[] {

  const width = rows.reduce((max, [label]) => Math.max(max, label.length), 0);

  return rows.map(([ label, description ]) => "  " + label.padEnd(width) + "  " + description);
}

/**
 * Format an epoch-millisecond instant as an ISO-8601 string. We render times unambiguously (UTC, with the offset explicit) rather than in an unstated local zone, because
 * CLI output is frequently piped, logged, and compared across machines.
 *
 * @param epochMs - Milliseconds since the Unix epoch.
 *
 * @returns The ISO-8601 representation.
 *
 * @category CLI
 */
export function formatTimestamp(epochMs: number): string {

  return new Date(epochMs).toISOString();
}

/**
 * The current wall-clock time as a compact HH:MM:SS.mmm stamp - enough to correlate streaming output (events, state changes, segments) without the date noise of a full
 * ISO string on every line. The single source for the CLI's streaming-line timestamp.
 *
 * @returns The HH:MM:SS.mmm stamp for now.
 *
 * @category CLI
 */
export function nowStamp(): string {

  return new Date().toISOString().slice(11, 23);
}

/**
 * Format a byte count as a compact, binary-prefixed size (e.g. "4.0 KiB", "1.3 MiB"). Used for livestream segment sizes and capture totals, where the order of magnitude
 * matters more than the exact byte count.
 *
 * @param bytes - The byte count.
 *
 * @returns The formatted size.
 *
 * @category CLI
 */
export function formatBytes(bytes: number): string {

  if(bytes < 1024) {

    return bytes.toString() + " B";
  }

  const units = [ "KiB", "MiB", "GiB", "TiB" ];

  let value = bytes / 1024;
  let unit = 0;

  while((value >= 1024) && (unit < (units.length - 1))) {

    value /= 1024;
    unit += 1;
  }

  return value.toFixed(1) + " " + (units[unit] ?? "B");
}

/**
 * Format a duration in milliseconds as a compact, human-readable string - the two most significant non-zero units, e.g. "3d 4h" or "12m 8s". Used for controller uptime
 * and inter-segment gaps, where a precise millisecond count is noise but the order of magnitude is the point.
 *
 * @param ms - The duration in milliseconds.
 *
 * @returns The compact representation, or "0s" when the duration rounds down to zero whole seconds (any value under one second, a non-positive one included).
 *
 * @category CLI
 */
export function formatDuration(ms: number): string {

  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];

  if(days > 0) {

    parts.push(days.toString() + "d");
  }

  if(hours > 0) {

    parts.push(hours.toString() + "h");
  }

  if(minutes > 0) {

    parts.push(minutes.toString() + "m");
  }

  if(seconds > 0) {

    parts.push(seconds.toString() + "s");
  }

  return (parts.length > 0) ? parts.slice(0, 2).join(" ") : "0s";
}

/**
 * Compare two strings by UTF-16 code unit - the default, locale-independent string ordering. The single comparator behind every deterministic sort the CLI performs (the
 * JSON key ordering below and the usage-screen command lists), so "sorted" means one thing, identical on every machine, everywhere the CLI orders by string.
 *
 * @param a - The first string.
 * @param b - The second string.
 *
 * @returns A negative number when `a` precedes `b`, positive when it follows, zero when equal.
 *
 * @category CLI
 */
export function compareCodeUnit(a: string, b: string): number {

  return (a < b) ? -1 : ((a > b) ? 1 : 0);
}

/* The `JSON.stringify` replacer that gives the CLI's machine output a stable shape: every plain object's keys are emitted in deterministic order via the shared
 * `compareCodeUnit` (locale-independent, so the ordering is identical on every machine and a captured stream diffs cleanly - the same cross-machine determinism
 * `formatTimestamp` targets for instants). Any value that is not a plain record - null, a primitive, an array, or a typed array/`Buffer` - is returned untouched rather
 * than reordered, each exempt for its own reason. An array is exempt for correctness: folding it through the entries/sort path would turn `[1, 2, 3]` into the object
 * `{ "0": 1, ... }`, losing both its element order and its array-ness. A
 * typed array or `Buffer` is exempt as a deliberate choice: a raw byte payload (a `watch raw` / `decode` frame whose payload is binary) is data, not a record to
 * alphabetize, so we neither pay to sort its thousands of numeric index keys nor let any future change to the object-sort path disturb them - today their index order
 * survives the sort anyway because `Object.fromEntries` re-canonicalizes integer keys, but exempting them makes that independence explicit rather than incidental. The
 * returned object holds the original values; `JSON.stringify` re-applies this replacer as it descends, so the whole tree sorts from this one rule - the single source of
 * the CLI's JSON key order, behind both `Output.json` and `Output.jsonPretty`. Note this normalizes a JSON-object payload's keys too, so the output is canonical, not a
 * byte-for-byte reproduction of the controller's field order.
 */
function sortKeysReplacer(_key: string, value: unknown): unknown {

  if((value === null) || (typeof value !== "object") || Array.isArray(value) || ArrayBuffer.isView(value)) {

    return value;
  }

  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => compareCodeUnit(a, b)));
}

// The control-sequence-introducer pattern for an SGR escape, used to measure and pad colored text by its visible length rather than its byte length.
// eslint-disable-next-line no-control-regex -- an SGR escape legitimately begins with the ESC control character; matching it is the entire purpose here.
const ANSI_PATTERN = /\u001b\[[0-9;]*m/g;

// The visible width of a cell - its length with any ANSI color escapes removed. A colored string is longer in bytes than it looks on screen, so we strip the escapes
// before measuring to keep table columns aligned regardless of color.
function visibleWidth(text: string): number {

  return text.replace(ANSI_PATTERN, "").length;
}

// Right-pad a cell to a target visible width. Because the padding is computed from the visible width (escapes excluded), a colored cell receives exactly the spaces it
// needs to align with a plain one.
function padVisible(text: string, width: number): string {

  const pad = width - visibleWidth(text);

  return (pad > 0) ? text + " ".repeat(pad) : text;
}
