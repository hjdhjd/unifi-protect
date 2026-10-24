/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * shared.ts: Cross-command CLI infrastructure - the typed CLI error, the realtime-event filter engine, and the Ctrl-C abort wiring.
 */
import type { RawPacket, TypedEvent } from "../../index.ts";
import { alignedList, compareCodeUnit } from "./output/format.ts";
import type { Output } from "./output/format.ts";
import { PROTECT_CLI_DURATION_MAX_MS } from "../../settings.ts";
import type { ParseArgsOptionsConfig } from "node:util";
import { ProtectClient } from "../../index.ts";
import { readFileSync } from "node:fs";

/**
 * A user-facing CLI failure. Carrying an `exitCode` lets the entry point render a clean one-line message to stderr and set the process exit code, rather than dumping a
 * stack trace - a stack is for a bug, a `CliError` is for "you asked for a camera that does not exist" or "no ufp.json was found". Library failures (the typed
 * `ProtectError` hierarchy) are rendered the same calm way; an *unexpected* error is the only thing that gets a stack, because that is the only thing that is a bug.
 *
 * @category CLI
 */
export class CliError extends Error {

  /** The process exit code to set when this error reaches the entry point. */
  readonly exitCode: number;

  constructor(message: string, opts: { cause?: unknown; exitCode?: number } = {}) {

    super(message, (opts.cause !== undefined) ? { cause: opts.cause } : undefined);

    this.exitCode = opts.exitCode ?? 1;
    this.name = "CliError";
  }
}

/**
 * The context every command receives from the entry point: its own argument slice (everything after the command verb), the environment, the injected client-opener hook
 * ({@link OpenClient}), the default `Output` (stdout), and the process-wide Ctrl-C signal. A command that pipes a binary payload to stdout builds its own stderr-pointed
 * `Output` from `env`; everything else writes through the supplied one.
 *
 * @category CLI
 */
export interface CommandContext {

  args: string[];
  env: NodeJS.ProcessEnv;
  openClient: OpenClient;
  output: Output;
  signal: AbortSignal;
}

/**
 * The client-opener hook. The entry point injects the production opener (load credentials, then `ProtectClient.connect`); a test injects a fake returning a fake client.
 * Commands always open through `ctx.openClient`, never by importing the opener directly, which is what makes every command unit-testable without a live controller.
 *
 * @category CLI
 */
export type OpenClient = (opts?: { debug?: boolean; refreshIntervalMs?: number | false; signal?: AbortSignal }) => Promise<ProtectClient>;

/**
 * The behavior half of a CLI command: it does its work and resolves, or throws (a {@link CliError} for an expected failure, a library `ProtectError` for a controller
 * failure). For the common case, the entry point renders the throw and sets the exit code, so a handler never calls `process.exit` itself. A handler that aggregates
 * several independent checks into one resolved result - `ufp doctor` - sets `process.exitCode` directly instead, since no single throw could represent the outcome.
 *
 * @category CLI
 */
export type CommandHandler = (ctx: CommandContext) => Promise<void>;

/**
 * A CLI command descriptor: the {@link CommandHandler} that runs it paired with the one-line summary the parent usage screen lists it by. The dispatcher and the usage
 * text both derive from this one object, so a command is registered in exactly one place - it can never be routable-but-unlisted or listed-but-unroutable, and its
 * listed description can never drift from the command that actually runs.
 *
 * @category CLI
 */
export interface CommandSpec {

  readonly run: CommandHandler;
  readonly summary: string;
}

/**
 * Render a command table as aligned `name  summary` lines for a usage screen's "Commands:" / "Subcommands:" block, sorted by command name (code unit).
 * Each summary is read off its {@link CommandSpec}, so the listing derives from the same dispatch table - it cannot drift from the commands that actually run.
 * Every command group - the top-level `ufp` screen and each subcommand group - renders its list through this one helper.
 *
 * @param table - The command (or subcommand) dispatch table.
 *
 * @returns One aligned `name  summary` line per command, sorted by name.
 *
 * @category CLI
 */
export function commandList(table: Record<string, CommandSpec>): string[] {

  const rows = Object.entries(table).sort(([a], [b]) => compareCodeUnit(a, b)).map(([ name, spec ]) => [ name, spec.summary ] as const);

  return alignedList(rows);
}

/**
 * Build the handler a command group runs. A group registers each subcommand once, in its table, and the handler reads both its usage and its unknown-subcommand
 * diagnostic from that table, so the subcommands a group lists, the ones its diagnostic names and the ones it dispatches can never drift apart. A missing
 * subcommand, or one of "help", "-h" or "--help", prints the group usage and exits zero; an unknown subcommand is a usage error (exit 2) naming every valid
 * subcommand; and a known one runs with the arguments after its name, sharing the same context (output, signal).
 *
 * @param name            - The group's verb, as its usage banner and its diagnostic name it.
 * @param subcommands     - The group's subcommand dispatch table.
 * @param options         - The group's optional usage content.
 * @param options.seeAlso - A cross-reference the usage prints beneath the subcommand list, after "See also: ". Defaults to none.
 *
 * @returns The group's command handler.
 *
 * @category CLI
 */
export function commandGroup(name: string, subcommands: Record<string, CommandSpec>, { seeAlso = "" }: { seeAlso?: string } = {}): CommandHandler {

  const usage = [

    "Usage: ufp " + name + " <subcommand> [options]",
    "",
    "Subcommands:",
    ...commandList(subcommands),
    ...((seeAlso.length > 0) ? [ "", "See also: " + seeAlso ] : []),
    "",
    "Run \"ufp " + name + " <subcommand> --help\" for subcommand options."
  ].join("\n");

  return async (ctx) => {

    const [ subcommand, ...rest ] = ctx.args;

    if((subcommand === undefined) || (subcommand === "help") || (subcommand === "--help") || (subcommand === "-h")) {

      ctx.output.line(usage);

      return;
    }

    // Only the table's own entries dispatch: a plain lookup also finds what every object inherits, so a subcommand named `constructor` or `toString` would reach a
    // property that is no command at all.
    const command = Object.hasOwn(subcommands, subcommand) ? subcommands[subcommand] : undefined;

    if(command === undefined) {

      throw new CliError("Unknown " + name + " subcommand \"" + subcommand + "\". Expected one of: " + Object.keys(subcommands).sort(compareCodeUnit).join(", ") + ".",
        { exitCode: 2 });
    }

    await command.run({ ...ctx, args: rest });
  };
}

/**
 * The options every command accepts, merged into each command's own option set before parsing. `--debug` turns on the library's debug logging (to stderr); `--help`
 * prints the command's usage. Centralizing them keeps these universal flags identical across every command.
 *
 * @category CLI
 */
export const COMMON_OPTIONS = {

  debug: { type: "boolean" },
  help: { short: "h", type: "boolean" }
} as const satisfies ParseArgsOptionsConfig;

/**
 * Split a comma-separated option value into its trimmed, non-empty terms. The shared parser for every list-shaped flag (`--kind a,b,c`, `--device "Front,Back"`), so the
 * splitting rule lives in one place.
 *
 * @param value - The raw flag value, or `undefined` when the flag was absent.
 *
 * @returns The trimmed terms, or an empty array when the flag was absent or held only whitespace.
 *
 * @category CLI
 */
export function parseList(value: string | undefined): string[] {

  if(value === undefined) {

    return [];
  }

  return value.split(",").map((term) => term.trim()).filter((term) => term.length > 0);
}

/**
 * Whether a value is a plain JSON object - the shape a record, an object node, and a dictionary all require, and the one payload shape with fields to read.
 *
 * The test is the prototype rather than `typeof`, because a raw frame's payload is whatever the codec produced: parsed JSON, a UTF-8 string, or a `Buffer`. A buffer
 * answers `typeof` as an object and enumerates as numeric index keys, so a looser test would walk one and read every byte as a field. Parsed JSON always carries the
 * ordinary object prototype, so this admits exactly what a record can be and nothing else, and an array, which a walk over JSON handles on its own path, answers false.
 *
 * @param value - The value to test.
 *
 * @returns `true` when the value is an object whose prototype is the ordinary object prototype or null.
 *
 * @category CLI
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {

  if((typeof value !== "object") || (value === null)) {

    return false;
  }

  const prototype: unknown = Object.getPrototypeOf(value);

  return (prototype === Object.prototype) || (prototype === null);
}

// A flag value made of decimal digits alone. The integer parsers hold a value to it before trusting what `Number` makes of it, because `Number` reads an empty value
// as zero and accepts surrounding whitespace, a sign, and hex and exponent spellings, so `--channel ""` would select channel 0 and `--count 0x10` would count
// sixteen. The integer check behind it is not redundant: a long enough run of digits reads as `Infinity`.
const DIGITS_PATTERN = /^\d+$/;

/**
 * Parse a CLI option value as a positive integer (`--count`, `--width`, `--height`), failing with a precise message rather than letting a bad value silently
 * become `NaN` deep in a command. We require a whole positive number because every consumer of this - a count, a pixel dimension - is meaningless at zero or below.
 *
 * @param value - The raw flag value.
 * @param flag  - The flag name, for the error message.
 *
 * @returns The parsed positive integer.
 *
 * @throws {@link CliError} when the value is not a positive integer.
 *
 * @category CLI
 */
export function parsePositiveInt(value: string, flag: string): number {

  const parsed = Number(value);

  if(!DIGITS_PATTERN.test(value) || !Number.isInteger(parsed) || (parsed <= 0)) {

    throw new CliError("The " + flag + " value must be a positive integer, but received \"" + value + "\".", { exitCode: 2 });
  }

  return parsed;
}

/**
 * Parse a CLI option value as a non-negative integer (`--channel`, `--lens`), where zero is a valid choice: `--channel` defaults to 0, while an absent `--lens`
 * selects the channel-based livestream source rather than an implicit lens value. Fails with a precise message rather than letting a bad value become `NaN`.
 *
 * @param value - The raw flag value.
 * @param flag  - The flag name, for the error message.
 *
 * @returns The parsed non-negative integer.
 *
 * @throws {@link CliError} when the value is not a non-negative integer.
 *
 * @category CLI
 */
export function parseNonNegativeInt(value: string, flag: string): number {

  const parsed = Number(value);

  if(!DIGITS_PATTERN.test(value) || !Number.isInteger(parsed)) {

    throw new CliError("The " + flag + " value must be a non-negative integer, but received \"" + value + "\".", { exitCode: 2 });
  }

  return parsed;
}

// The unit suffixes a duration accepts, mapped to their millisecond factor. Kept small and explicit: a streaming command's time bound is naturally expressed in
// seconds to hours, and `ms` covers the rare sub-second case. The single source for what a duration string may say.
const DURATION_UNITS: Record<string, number> = { h: 3600000, m: 60000, ms: 1, s: 1000 };

/**
 * Parse a CLI duration flag (`--duration`) into milliseconds. The value is a positive integer with a required unit suffix - `500ms`, `30s`, `5m`, `1h` - because a bare
 * number is ambiguous (30 what?). Requiring the unit is the unambiguous, modern convention (Go's
 * `time.ParseDuration`, systemd, k6 all do this). A single number-plus-unit expresses any bound the streaming commands need (90 minutes is `90m`), so we do not parse
 * compound forms like `1h30m` - one rule, no parser surface for a convenience the smallest unit already covers.
 *
 * @param value - The raw flag value.
 * @param flag  - The flag name, for the error message.
 *
 * @returns The duration in milliseconds.
 *
 * @throws {@link CliError} when the value is not a positive integer followed by a known unit (`ms` / `s` / `m` / `h`), or when it is longer than the platform timer
 * holds for its full length (`PROTECT_CLI_DURATION_MAX_MS`).
 *
 * @category CLI
 */
export function parseDuration(value: string, flag: string): number {

  // Anchor the whole token: a run of digits, then one of the known units. Anything else - a bare number, a unit we do not recognize, a fractional or negative value -
  // falls through to the single diagnostic below rather than silently misparsing.
  const match = /^(\d+)(ms|s|m|h)$/.exec(value);
  const unit = (match === null) ? undefined : DURATION_UNITS[match[2] ?? ""];

  if((match === null) || (unit === undefined)) {

    throw new CliError("The " + flag + " value must be a positive integer with a unit (ms, s, m, h), e.g. 30s or 5m, but received \"" + value + "\".",
      { exitCode: 2 });
  }

  const magnitude = Number(match[1]);

  if(magnitude <= 0) {

    throw new CliError("The " + flag + " value must be greater than zero, but received \"" + value + "\".", { exitCode: 2 });
  }

  const durationMs = magnitude * unit;

  // A duration past the ceiling would fire at once or be refused once the window is bound, so it is refused here at the parse, where every command reads it. A digit
  // run long enough to convert to Infinity lands past the ceiling too, so this one bound answers both.
  if(durationMs > PROTECT_CLI_DURATION_MAX_MS) {

    throw new CliError("The " + flag + " value must be at most " + PROTECT_CLI_DURATION_MAX_MS.toString() + "ms, but received \"" + value + "\".", { exitCode: 2 });
  }

  return durationMs;
}

/**
 * One axis's compiled match terms. A candidate value satisfies the axis when ANY term matches it (OR within an axis); a filter as a whole requires every present axis to
 * be satisfied (AND across axes). Holding compiled predicates rather than raw strings means the regex and string work happens once at build time, not per event.
 *
 * @category CLI
 */
export interface CompiledAxis {

  predicates: ((value: string) => boolean)[];
}

/**
 * How a pattern compares a literal (non-glob) term against a candidate. `exact` matches a whole token by case-insensitive equality (the kind/modelKey/object axes);
 * `substring` matches by case-insensitive containment (the free-text device axis and diagnostics channel names, `--channel http`). A term containing a glob wildcard is
 * always anchored, regardless of mode.
 *
 * @category CLI
 */
export type MatchMode = "exact" | "substring";

// Translate a shell-style glob into an anchored, case-insensitive regular expression. We escape every regex metacharacter first, then re-activate the glob wildcards:
// an escaped "\*" becomes ".*" (any run) and an escaped "\?" becomes "." (any single character). Anchoring with ^...$ makes a glob match the whole value, so "Front*"
// matches "Front Door" but not "The Front".
function globToRegExp(pattern: string): RegExp {

  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, (character) => "\\" + character);
  const globbed = escaped.replace(/\\\*/g, ".*").replace(/\\\?/g, ".");

  return new RegExp("^" + globbed + "$", "i");
}

/**
 * Compile one term into a predicate. A term containing a glob metacharacter (`*` or `?`) becomes an anchored, case-insensitive regular expression regardless of axis; a
 * literal term is compared by the axis's mode. This is the rule that makes `--kind motionDetected` an exact match, `--kind "*Detect*"` a glob, and a bare `--device`
 * term a substring search, all from the same engine.
 *
 * @param pattern - The single term to compile - a literal token or a `*` / `?` glob.
 * @param mode    - How a literal (non-glob) term is compared against a candidate: whole-token equality or substring containment.
 *
 * @returns A predicate that reports whether a candidate value satisfies the term.
 *
 * @category CLI
 */
export function compilePattern(pattern: string, mode: MatchMode): (value: string) => boolean {

  if(pattern.includes("*") || pattern.includes("?")) {

    const regExp = globToRegExp(pattern);

    return (value: string): boolean => regExp.test(value);
  }

  const needle = pattern.toLowerCase();

  if(mode === "substring") {

    return (value: string): boolean => value.toLowerCase().includes(needle);
  }

  return (value: string): boolean => value.toLowerCase() === needle;
}

/**
 * Compile a raw comma-list flag value into an axis, or `undefined` when the flag was absent or empty (an absent axis imposes no constraint). The compiled axis is what
 * the matcher consults; the raw string never reaches the hot path.
 *
 * This is the CLI's one matching engine. A command matching on its own axis - `capture --device`, say - compiles it here and tests it with {@link axisMatches}, so
 * every command's globbing, case handling, and comma-list parsing behave identically and a second hand-rolled matcher never appears.
 *
 * @param value - The raw flag text: a comma-separated list of literal terms or `*` / `?` globs.
 * @param mode  - How a literal term is compared: whole-token equality or substring containment.
 *
 * @returns The compiled axis, or `undefined` when the flag imposed no constraint.
 *
 * @category CLI
 */
export function compileAxis(value: string | undefined, mode: MatchMode): CompiledAxis | undefined {

  const terms = parseList(value);

  if(terms.length === 0) {

    return undefined;
  }

  return { predicates: terms.map((term) => compilePattern(term, mode)) };
}

/**
 * Does any candidate value satisfy this axis? An empty candidate set never satisfies a positive axis (nothing to match) and never trips an exclude axis (nothing to
 * exclude) - the principled rule for an event that simply does not carry that axis (an activity signal has no `modelKey`, for one).
 *
 * @param axis       - The compiled axis, from {@link compileAxis}.
 * @param candidates - The values to test - a record's id and name, an event's kind, whatever that axis reads.
 *
 * @returns Whether any candidate satisfies the axis.
 *
 * @category CLI
 */
export function axisMatches(axis: CompiledAxis, candidates: string[]): boolean {

  return candidates.some((candidate) => axis.predicates.some((predicate) => predicate(candidate)));
}

/* Compile a filter spec's raw flag strings into the axes the operator supplied, each by the mode its table names. This is the one compiler every watch filter goes
 * through, so an axis and its mode are declared once, in the filter's mode table, and an axis whose flag was absent or empty compiles to nothing and is never set,
 * which keeps a matcher's `axis !== undefined` checks honest. It runs once per invocation, never per item.
 */
function compileFilter<K extends string>(spec: Partial<Record<K, string>>, modes: Readonly<Record<K, MatchMode>>): Partial<Record<K, CompiledAxis>> {

  const filter: Partial<Record<K, CompiledAxis>> = {};

  for(const [ key, mode ] of Object.entries(modes) as [K, MatchMode][]) {

    const axis = compileAxis(spec[key], mode);

    if(axis !== undefined) {

      filter[key] = axis;
    }
  }

  return filter;
}

// One axis of a filter as a matcher tests it: the candidate values the item offers on that axis, and the axis's positive and exclude terms where the operator gave them.
interface AxisCheck {

  candidates: string[];
  exclude?: CompiledAxis;
  positive?: CompiledAxis;
}

// The match loop every filter runs, AND across axes and OR within an axis: every present positive axis must be satisfied by one of its candidates, and no present exclude
// axis may be satisfied by any of them. Each matcher derives its own candidates and hands over the checks it already built, so the loop adds no allocation per item.
function passes(checks: readonly AxisCheck[]): boolean {

  for(const check of checks) {

    if((check.positive !== undefined) && !axisMatches(check.positive, check.candidates)) {

      return false;
    }

    if((check.exclude !== undefined) && axisMatches(check.exclude, check.candidates)) {

      return false;
    }
  }

  return true;
}

/**
 * The raw filter flags as parsed from the command line - one comma-separated string per axis, in both positive and exclude forms. {@link buildEventFilter} compiles this
 * into the matcher the hot path uses.
 *
 * @category CLI
 */
export interface EventFilterSpec {

  device?: string;
  excludeDevice?: string;
  excludeKind?: string;
  excludeModelKey?: string;
  excludeObject?: string;
  kind?: string;
  modelKey?: string;
  object?: string;
}

/**
 * A compiled realtime-event filter. Each axis is optional; an absent axis imposes no constraint. Build it once with {@link buildEventFilter}, then test every event with
 * {@link matchesEvent}.
 *
 * @category CLI
 */
export interface EventFilter {

  device?: CompiledAxis;
  excludeDevice?: CompiledAxis;
  excludeKind?: CompiledAxis;
  excludeModelKey?: CompiledAxis;
  excludeObject?: CompiledAxis;
  kind?: CompiledAxis;
  modelKey?: CompiledAxis;
  object?: CompiledAxis;
}

// The match mode of each event filter axis: the token axes compare whole tokens, and the device axes search the id and the resolved name. The annotation holds the
// table to the spec's keys, so an axis added to the spec without a mode fails to compile.
const EVENT_AXIS_MODES: Readonly<Record<keyof EventFilterSpec, MatchMode>> = {

  device: "substring",
  excludeDevice: "substring",
  excludeKind: "exact",
  excludeModelKey: "exact",
  excludeObject: "exact",
  kind: "exact",
  modelKey: "exact",
  object: "exact"
};

/**
 * Compile the raw filter flags into an {@link EventFilter}. The token axes (kind, modelKey, object) match whole tokens by equality-or-glob; the device axis matches by
 * substring-or-glob against both the device id and its resolved name. The compilation is done once per `watch events` invocation, never per event.
 *
 * @param spec - The raw, comma-separated flag values.
 *
 * @returns The compiled filter; an all-absent spec yields a filter that matches every event.
 *
 * @category CLI
 */
export function buildEventFilter(spec: EventFilterSpec): EventFilter {

  return compileFilter(spec, EVENT_AXIS_MODES);
}

// The smart-detect object types an event carries, or none. Only a `smartDetect` event has an `objectTypes` array; every other kind contributes nothing here.
function objectsOf(event: TypedEvent): string[] {

  return (event.kind === "smartDetect") ? [...event.objectTypes] : [];
}

/**
 * Test an event against a compiled filter. AND across axes, OR within an axis: every *present* positive axis must be satisfied by at least one of the event's candidate
 * values, and no *present* exclude axis may be satisfied by any of them. The device axis tests both the event's device id and its resolved name, so a `--device` term
 * works whether the operator thinks in names or ids.
 *
 * @param filter      - The compiled filter.
 * @param event       - The event under test.
 * @param resolveName - Maps a device id to its display name (from the live state), or returns `undefined` when the id is unknown.
 *
 * @returns `true` when the event passes every axis.
 *
 * @category CLI
 */
export function matchesEvent(filter: EventFilter, event: TypedEvent, resolveName: (id: string) => string | undefined): boolean {

  const ids = ProtectClient.eventSubjects(event);
  const names = ids.map((id) => resolveName(id)).filter((name): name is string => name !== undefined);

  // The device axis tests both ids and names, and the object axis tests every smart-detect type the event carries; kind and modelKey test a single token each (the
  // latter only when the event carries one). Driving every axis off one table lets `passes` hold the AND-across/exclude logic the matchers share.
  const checks: AxisCheck[] = [
    { candidates: [event.kind], exclude: filter.excludeKind, positive: filter.kind },
    { candidates: ("modelKey" in event) ? [event.modelKey] : [], exclude: filter.excludeModelKey, positive: filter.modelKey },
    { candidates: [...new Set([ ...ids, ...names ])], exclude: filter.excludeDevice, positive: filter.device },
    { candidates: objectsOf(event), exclude: filter.excludeObject, positive: filter.object }
  ];

  return passes(checks);
}

/**
 * The raw filter flags as parsed from the command line, for `ufp watch raw`. The raw firehose matches on a {@link RawPacket}'s wire header rather than a classified
 * event, so its axes are `modelKey` and `action`, taken directly from the header, plus `device` (the header's `id`, resolved to a name like the event filter's).
 * Each has an exclude form. {@link buildRawFilter} compiles this into the matcher {@link matchesRawPacket} uses.
 *
 * @category CLI
 */
export interface RawFilterSpec {

  action?: string;
  device?: string;
  excludeAction?: string;
  excludeDevice?: string;
  excludeModelKey?: string;
  modelKey?: string;
}

/**
 * A compiled raw-packet filter. Each axis is optional; an absent axis imposes no constraint. Build it once with {@link buildRawFilter}, then test every packet with
 * {@link matchesRawPacket}.
 *
 * @category CLI
 */
export interface RawFilter {

  action?: CompiledAxis;
  device?: CompiledAxis;
  excludeAction?: CompiledAxis;
  excludeDevice?: CompiledAxis;
  excludeModelKey?: CompiledAxis;
  modelKey?: CompiledAxis;
}

// The match mode of each raw filter axis, held to the spec's keys as the event filter's table is: the header tokens compare whole, and the device axes search the
// header id and its resolved name.
const RAW_AXIS_MODES: Readonly<Record<keyof RawFilterSpec, MatchMode>> = {

  action: "exact",
  device: "substring",
  excludeAction: "exact",
  excludeDevice: "substring",
  excludeModelKey: "exact",
  modelKey: "exact"
};

/**
 * Compile the raw filter flags into a {@link RawFilter}. `modelKey` and `action` match whole header tokens by equality-or-glob; `device` matches by substring-or-glob
 * against the header's `id` and its resolved name. Compiled once per `watch raw` invocation, never per packet - the same engine the event filter uses.
 *
 * @param spec - The raw, comma-separated flag values.
 *
 * @returns The compiled filter; an all-absent spec yields a filter that matches every packet.
 *
 * @category CLI
 */
export function buildRawFilter(spec: RawFilterSpec): RawFilter {

  return compileFilter(spec, RAW_AXIS_MODES);
}

/**
 * Test a raw packet against a compiled filter. AND across axes, OR within an axis, with the exclude axes negating - the same semantics as {@link matchesEvent}. The
 * device axis tests both the header `id` and its resolved name, so a `--device` term works whether the operator thinks in names or ids.
 *
 * @param filter      - The compiled filter.
 * @param packet      - The raw packet under test.
 * @param resolveName - Maps a device id to its display name (from live state), or returns `undefined` when the id is unknown (e.g. an `event`-modelKey occurrence id).
 *
 * @returns `true` when the packet passes every axis.
 *
 * @category CLI
 */
export function matchesRawPacket(filter: RawFilter, packet: RawPacket, resolveName: (id: string) => string | undefined): boolean {

  const { action, id, modelKey } = packet.header;
  const name = resolveName(id);
  const deviceCandidates = (name !== undefined) ? [ id, name ] : [id];
  const checks: AxisCheck[] = [
    { candidates: [action], exclude: filter.excludeAction, positive: filter.action },
    { candidates: [modelKey], exclude: filter.excludeModelKey, positive: filter.modelKey },
    { candidates: deviceCandidates, exclude: filter.excludeDevice, positive: filter.device }
  ];

  return passes(checks);
}

/**
 * Yield the values of an async iterable that a predicate admits, in order, ending when the source ends. A pure pass-through generator, so it composes cleanly with
 * {@link take}: an early return propagates back through here and into the source, so the firehose beneath it (`client.events`, `client.rawPackets`) is unsubscribed.
 *
 * @typeParam T - The element type.
 *
 * @param source    - The async iterable to draw from.
 * @param predicate - Reports whether a value passes; a value it rejects is dropped.
 *
 * @returns An async generator of the admitted values.
 *
 * @category CLI
 */
export async function *filterStream<T>(source: AsyncIterable<T>, predicate: (item: T) => boolean): AsyncGenerator<T> {

  for await (const item of source) {

    if(predicate(item)) {

      yield item;
    }
  }
}

/**
 * Take at most `count` values from an async iterable, then stop. Returning early from the `for await` disposes the source, so the underlying stream (the events firehose,
 * a livestream subscription, a state observer) is torn down cleanly. This is the equivalent of the still-proposal-stage `AsyncIterator.prototype.take`, which is
 * unavailable across our supported Node range (22+, verified absent through 26), provided as a small generator so the `--count N` path stays in the async-iterator idiom.
 *
 * @typeParam T - The element type.
 *
 * @param source - The async iterable to draw from.
 * @param count  - The maximum number of values to yield; a non-positive count yields nothing.
 *
 * @returns An async generator of at most `count` values.
 *
 * @category CLI
 */
export async function *take<T>(source: AsyncIterable<T>, count: number): AsyncGenerator<T> {

  if(count <= 0) {

    return;
  }

  let taken = 0;

  for await (const value of source) {

    yield value;

    taken += 1;

    if(taken >= count) {

      return;
    }
  }
}

/**
 * Wire a single {@link AbortController} to SIGINT and SIGTERM. The returned signal is threaded through `ProtectClient.connect({ signal })` and every nested operation, so
 * one Ctrl-C aborts the whole tree - WebSockets, livestream sessions, the dispatcher - and `await using` unwinds it cleanly. Call `dispose()` on normal completion to
 * detach the listeners (so a short command does not leave handlers attached to the process).
 *
 * @returns The lifetime signal and a disposer that removes the process listeners.
 *
 * @category CLI
 */
export function wireAbortSignal(): { dispose: () => void; signal: AbortSignal } {

  const controller = new AbortController();
  const onSignal = (): void => controller.abort();

  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  const dispose = (): void => {

    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
  };

  return { dispose, signal: controller.signal };
}

/**
 * Bound a streaming command's lifetime by an optional `--duration`, returning the signal its iteration should actually run under. With no duration it is the base signal
 * (Ctrl-C only); with a duration it is the base signal **or** a fresh `AbortSignal.timeout(durationMs)`, combined via `AbortSignal.any`, so the stream ends cleanly on
 * whichever fires first. This is the single home for the duration half of the streaming commands' stop conditions - `--count` bounds the iterable's *length* (via
 * {@link take}), this bounds its *duration* - and every streaming command threads the returned signal where it would otherwise pass the bare Ctrl-C signal, so they
 * compose without either command or library knowing about the other.
 *
 * @param signal     - The base lifetime signal (the wired Ctrl-C signal).
 * @param durationMs - The parsed `--duration` in milliseconds, or `undefined` when the flag was absent.
 *
 * @returns The base signal unchanged when no duration is set; otherwise a signal that also aborts after `durationMs`.
 *
 * @category CLI
 */
export function boundedSignal(signal: AbortSignal, durationMs: number | undefined): AbortSignal {

  if(durationMs === undefined) {

    return signal;
  }

  return AbortSignal.any([ signal, AbortSignal.timeout(durationMs) ]);
}

/**
 * This package's own version, read from its `package.json`.
 *
 * One home for the question, because two answers would be a way for `ufp --version` and the version a capture bundle records itself under to disagree - and a bundle
 * whose stated tool version is not the tool that wrote it is worse than one carrying no version at all.
 *
 * An unreadable or malformed `package.json` yields `"unknown"` rather than throwing: a missing version is a cosmetic problem, and failing a command over it would turn
 * one into an outage.
 *
 * @returns The package version, or `"unknown"` when it cannot be read.
 *
 * @category CLI
 */
export function readVersion(): string {

  try {

    const pkg = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")) as { version?: string };

    return pkg.version ?? "unknown";
  } catch {

    return "unknown";
  }
}
