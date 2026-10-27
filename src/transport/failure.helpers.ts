/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * failure.helpers.ts: Test support for the transport failure taxonomy - the one record of every kind its union names, which the classifier's suites and the
 * connection-fault level table's suites read their reach against.
 */
import type { TransportFailure } from "./failure.ts";

/**
 * Every kind the transport failure union names, keyed so the compiler holds the list to the union: a kind added to it without a key here fails to compile, and so
 * does a key naming a kind that does not exist. A suite reads its own table's reach against `Object.keys(EVERY_KIND)`.
 */
export const EVERY_KIND: Readonly<Record<TransportFailure["kind"], true>> = { aborted: true, certificate: true, "connect-timeout": true, destroyed: true, dns: true,
  refused: true, reset: true, "retries-exhausted": true, timeout: true, transport: true, unreachable: true };
