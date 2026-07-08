/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * colors.test.ts: Unit tests for the TTY-aware ANSI palette - identity behavior when disabled, native styleText styling when enabled, and the colorization decision.
 */
import { colorsEnabled, createPalette } from "./colors.ts";
import { describe, test } from "node:test";
import assert from "node:assert/strict";

// The ESC control character, built rather than embedded so the test source carries no literal control byte.
const ESC = String.fromCharCode(27);

describe("createPalette", () => {

  test("every member is the identity function when disabled", () => {

    const palette = createPalette(false);

    for(const color of [ palette.blue, palette.bold, palette.cyan, palette.dim, palette.gray, palette.green, palette.magenta, palette.red, palette.yellow ]) {

      assert.equal(color("text"), "text");
    }
  });

  test("wraps text in the matching native styleText escapes when enabled", () => {

    const palette = createPalette(true);

    // Node's native styleText emits precise per-attribute reset codes (foreground 39, intensity 22) rather than a blanket reset, which is what lets styled spans nest.
    assert.equal(palette.red("x"), ESC + "[31mx" + ESC + "[39m");
    assert.equal(palette.bold("x"), ESC + "[1mx" + ESC + "[22m");
    assert.equal(palette.green("x"), ESC + "[32mx" + ESC + "[39m");
  });
});

describe("colorsEnabled", () => {

  test("is true for an interactive TTY with no opt-out", () => {

    assert.equal(colorsEnabled({ isTTY: true }, {}), true);
  });

  test("is false for a non-TTY", () => {

    assert.equal(colorsEnabled({ isTTY: false }, {}), false);
    assert.equal(colorsEnabled({}, {}), false);
  });

  test("honors a non-empty NO_COLOR over a TTY", () => {

    assert.equal(colorsEnabled({ isTTY: true }, { NO_COLOR: "1" }), false);
  });

  test("treats an empty NO_COLOR as not opting out", () => {

    assert.equal(colorsEnabled({ isTTY: true }, { NO_COLOR: "" }), true);
  });

  test("treats TERM=dumb as non-color", () => {

    assert.equal(colorsEnabled({ isTTY: true }, { TERM: "dumb" }), false);
  });
});
