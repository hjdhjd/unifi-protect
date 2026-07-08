/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * common.ts: Language-level generic helper types, with no UniFi Protect domain of their own.
 */

/**
 * The language-level generic building blocks the rest of the type surface composes from: a deep-partial mapped type for PATCH payloads, a nullable helper, and the
 * recursive JSON value type used as the index signature on device interfaces.
 *
 * @module ProtectTypesCommon
 */
/* The `as P extends string ? P : never` key filter excludes the string index signature from the DeepPartial mapping. Without it, DeepPartial would recurse into
 * the ProtectKnownJsonValue index signature (`[key: string]: ProtectKnownJsonValue`), causing infinite type instantiation. This allows device interfaces to have
 * both explicit properties and a `[key: string]` index signature while still being usable with DeepPartial for payload types.
 */
/** @ignore */
export type DeepPartial<T> = {

  [P in keyof T as P extends string ? P : never]?: T[P] extends (infer I)[] ? DeepPartial<I>[] : DeepPartial<T[P]>
};

/** @ignore */
export type Nullable<T> = T | null;

// Recursive JSON value type representing any JSON-compatible value, plus `undefined` for properties that may be absent on a partial payload. Used as the index signature
// type on device interfaces so that untyped fields flowing through from the Protect API are accessible without casting.
/** @ignore */
export type ProtectKnownJsonValue = boolean | null | number | string | undefined | ProtectKnownJsonValue[] | { [key: string]: ProtectKnownJsonValue };
