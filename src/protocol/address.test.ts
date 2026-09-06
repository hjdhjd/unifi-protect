/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * address.test.ts: Unit tests for the hardware-address vocabulary - the four spellings a device address is written in, the fold that spells every one of them
 * the library's single way, and the pass-through that keeps the fold from filtering a vocabulary it does not own.
 */
import { describe, test } from "node:test";
import { isMacAddress, normalizeMacAddress } from "./address.ts";
import assert from "node:assert/strict";

// One address in every spelling the vocabulary accepts: colon-joined pairs, hyphen-joined pairs, dot-joined quads, and the twelve digits run together in either
// case. Every one of them names the same device, which is the whole reason the fold exists.
const SPELLINGS = [ "02:ff:ee:00:00:02", "02-FF-EE-00-00-02", "02ff.ee00.0002", "02ffee000002", "02FFEE000002" ];

// The near misses, each one digit, one group, or one separator away from an address. They are reused by both tests below, so a value the guard wrongly accepts
// fails the recognition test and the pass-through test together.
const NEAR_MISSES = [ "02:ff:ee:00:00", "02ffee00000", "02:ff-ee:00:00:02", "01234567-89ab-cdef-0123-456789abcdef", "" ];

describe("address", () => {

  test("every spelling of a hardware address is recognized", () => {

    for(const spelling of SPELLINGS) {

      assert.equal(isMacAddress(spelling), true, "the vocabulary reads " + spelling + " as an address");
    }
  });

  test("a value one group, one digit, or one separator away from an address is refused", () => {

    for(const nearMiss of NEAR_MISSES) {

      assert.equal(isMacAddress(nearMiss), false, "the vocabulary refuses " + JSON.stringify(nearMiss));
    }
  });

  test("a hostname is not a hardware address", () => {

    assert.equal(isMacAddress("protect.example.com"), false);
  });

  test("every spelling folds to the same uppercase digits", () => {

    // The anchored literal rather than a comparison between two spellings: pairwise equality alone would pass a fold that agreed with itself while spelling the
    // address some third way.
    for(const spelling of SPELLINGS) {

      assert.equal(normalizeMacAddress(spelling), "02FFEE000002", "the fold is uppercase with no separators, whatever the spelling in hand");
    }
  });

  test("a second address folds to its own digits", () => {

    // The literal above alone would also pass a fold that answered one fixed string, so a second address is what shows the output following the input.
    assert.equal(normalizeMacAddress("aa:bb:cc:dd:ee:ff"), "AABBCCDDEEFF");
  });

  test("a value that is not a hardware address passes through the fold untouched", () => {

    // The fold folds a known split rather than filtering a vocabulary it does not own, so anything it does not recognize is returned exactly as it arrived.
    for(const nearMiss of NEAR_MISSES) {

      assert.equal(normalizeMacAddress(nearMiss), nearMiss);
    }

    assert.equal(normalizeMacAddress("protect.example.com"), "protect.example.com");
  });
});
