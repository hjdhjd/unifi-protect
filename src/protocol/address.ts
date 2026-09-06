/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * address.ts: The hardware address spelled one way, so a consumer keyed on a device is never re-keyed by the case a record happened to arrive in.
 */

/**
 * The hardware-address vocabulary: what counts as an address, and the single spelling this library carries one in.
 *
 * This module is Layer 1: no I/O, no time, no state, no dependency on anything else in the library. The controller spells one device's address with the case
 * varying from record to record and from one read to the next, so anything that keys on an address needs one place to ask what an address is and one place to
 * fold it. That place is here rather than inside whichever subsystem happens to notice the split, which is what keeps two spellings of one device from becoming
 * two devices.
 *
 * @module ProtectAddress
 */

/* The shapes a hardware address is written in: the six pairs joined by colons, the twelve digits run together, the six pairs joined by hyphens, and the three
 * quads joined by dots. Only the first two come from the controller - either arrives in either case, and the same device can arrive in both cases from one read
 * to the next - while the hyphen and dot spellings are what other tools and operators write, recognized here so a value a consumer hands in folds the same way
 * the wire's own does.
 */
const MAC_ADDRESS = /^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$|^(?:[0-9a-f]{2}-){5}[0-9a-f]{2}$|^(?:[0-9a-f]{4}\.){2}[0-9a-f]{4}$|^[0-9a-f]{12}$/i;

/**
 * Whether a value is a hardware address. The accepted spellings are the six pairs joined by colons, the twelve digits run together, the six pairs joined by
 * hyphens, and the three quads joined by dots, in either case.
 *
 * @param value - The value exactly as a record carried it.
 *
 * @returns `true` when the value is a hardware address, in any of the four spellings and either case.
 *
 * @category Utilities
 */
export function isMacAddress(value: string): boolean {

  return MAC_ADDRESS.test(value);
}

/**
 * Fold a hardware address into the library's single spelling of it: uppercase, with no separators. Every spelling {@link isMacAddress} accepts folds the same way,
 * whether the digits are joined by colons, by hyphens, by dots, or by nothing at all.
 *
 * Uppercase without separators is the spelling this library carries because it is the spelling a device record's `mac` arrives in on this wire, and the spelling
 * the companion UniFi Access library carries, so a consumer serving both families keys every device one way. One spelling is the whole point: a consumer keyed on
 * an address must never be re-keyed by the case a record happened to arrive in. A value that is not an address passes through untouched, because this folds a
 * known split rather than filtering a vocabulary it does not own.
 *
 * @param value - The address exactly as a record spelled it.
 *
 * @returns The address in the library's spelling, or the value unchanged when it is not an address.
 *
 * @category Utilities
 */
export function normalizeMacAddress(value: string): string {

  return MAC_ADDRESS.test(value) ? value.replaceAll(/[:.-]/g, "").toUpperCase() : value;
}
