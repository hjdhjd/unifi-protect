/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * colors.ts: A tiny, TTY-aware semantic color palette for the ufp CLI, layered over Node's native util.styleText.
 */
import type { InspectColor } from "node:util";
import { styleText } from "node:util";

/**
 * The semantic color palette the CLI renders human-readable output through. Every member takes a string and returns it wrapped in the corresponding ANSI styling, or
 * returns it untouched when color is disabled - so a command never branches on "are we colorized" itself; it always calls the palette and lets the palette decide.
 *
 * The styling itself is delegated to Node's native `util.styleText`, in keeping with the library's "Node-native first" posture: the platform owns the escape sequences
 * (and emits precise per-attribute reset codes that nest correctly), while this module owns only the semantic naming and the one-time colorization decision.
 *
 * @category CLI
 */
export interface Palette {

  blue: (text: string) => string;
  bold: (text: string) => string;
  cyan: (text: string) => string;
  dim: (text: string) => string;
  gray: (text: string) => string;
  green: (text: string) => string;
  magenta: (text: string) => string;
  red: (text: string) => string;
  yellow: (text: string) => string;
}

// Build a wrapper for one `util.styleText` format. When colorization is on, the wrapper styles the text through the native primitive; when off, it is the identity
// function, so disabled output is byte-for-byte the plain text.
function wrap(format: InspectColor, enabled: boolean): (text: string) => string {

  if(!enabled) {

    return (text: string): string => text;
  }

  // We have already resolved the colorization decision ourselves (see colorsEnabled), and we may be styling a stream that styleText would not validate on its own - the
  // binary-piping commands point their human-readable Output at stderr, and the explicit `colorize` override bypasses environment detection entirely. So we disable
  // styleText's own stream validation and let it emit unconditionally; a disabled palette never reaches this branch.
  return (text: string): string => styleText(format, text, { validateStream: false });
}

/**
 * Build a {@link Palette}. Pass the resolved colorization decision (see {@link colorsEnabled}); the palette holds no I/O and no environment knowledge of its own, so it
 * is trivially testable - `createPalette(false)` returns a palette whose every member is the identity function.
 *
 * @param enabled - Whether to emit ANSI styling. When `false`, every palette member returns its input unchanged.
 *
 * @returns The palette.
 *
 * @category CLI
 */
export function createPalette(enabled: boolean): Palette {

  // Each semantic member maps to a native styleText format name. Gray is the conventional choice for de-emphasized detail; bold and dim are intensity modifiers rather
  // than colors, but the native primitive treats them uniformly.
  return {

    blue: wrap("blue", enabled),
    bold: wrap("bold", enabled),
    cyan: wrap("cyan", enabled),
    dim: wrap("dim", enabled),
    gray: wrap("gray", enabled),
    green: wrap("green", enabled),
    magenta: wrap("magenta", enabled),
    red: wrap("red", enabled),
    yellow: wrap("yellow", enabled)
  };
}

/**
 * Decide whether color should be emitted to a given stream. Color is on only when the stream is an interactive TTY and the environment does not opt out. We honor the
 * de-facto `NO_COLOR` standard (any non-empty value disables color) and treat `TERM=dumb` as non-color, matching the conventions every well-behaved CLI follows.
 *
 * @param stream - The destination stream (its `isTTY` flag is the primary signal).
 * @param env    - The process environment to read `NO_COLOR` / `TERM` from.
 *
 * @returns `true` when ANSI color should be emitted.
 *
 * @category CLI
 */
export function colorsEnabled(stream: { isTTY?: boolean }, env: NodeJS.ProcessEnv): boolean {

  // An explicit NO_COLOR (any non-empty value) wins over everything, per https://no-color.org.
  if((env["NO_COLOR"] !== undefined) && (env["NO_COLOR"] !== "")) {

    return false;
  }

  if(env["TERM"] === "dumb") {

    return false;
  }

  return stream.isTTY === true;
}
