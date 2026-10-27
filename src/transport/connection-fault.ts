/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * connection-fault.ts: The one level a connection fault is logged at - error, warning or quiet - read from its transport classification and whether the fault
 * ended a long-lived connection that had been working.
 */

/* This module is a faithful local copy of homebridge-plugin-utils' connection-fault level table: the same levels, the same columns and the same cells. The library
 * takes no runtime dependency on homebridge-plugin-utils, so the rule is implemented here as well, and a differential test in this package's suite feeds every cell
 * through this table and homebridge-plugin-utils' alike and asserts the same level comes back, which is what keeps the two of them one rule.
 *
 * The family logs a connection fault by one rule: error when the operator must act, warning when the fault heals itself, and quiet for a teardown and for the way a
 * working long-lived connection ordinarily ends. The table, by the kind the transport failure classifier answers and by whether the fault ended a long-lived
 * connection that had been working, which a caller passes as `open`:
 *
 * | Kind | `true`, a working long-lived connection | `false`, a connection being dialed or a one-shot request |
 * |------|------|---------|
 * | `aborted`, `destroyed` | quiet | quiet |
 * | `certificate`; `dns` with `ENOTFOUND` | error | error |
 * | `dns` with `EAI_AGAIN`; `refused`; `unreachable`; `connect-timeout`; `reset`; `retries-exhausted`; `transport` with a code | warning | warning |
 * | `timeout` | quiet | warning |
 * | `transport` with no code | quiet | warning |
 *
 * A teardown is no fault, so it is quiet in every column. A certificate nothing trusts and a host name that does not resolve stay broken until someone changes
 * something, so they are errors. Everything that heals itself is a warning, a code the table names no row for among them, so a new code is reported rather than
 * silenced. The rows that read `open` are the ways a working long-lived connection ordinarily ends, a timeout and a hang-up, which stay quiet there, while a dial
 * or a one-shot request that ends in one of them went unanswered, which is a warning.
 *
 * Open means the fault ended a long-lived connection that had been working, a WebSocket or a stream past its upgrade, and dialing means the connection was still
 * being dialed, its TCP, TLS or upgrade handshake under way. A one-shot HTTP request passes `open` as `false` whatever socket undici gave it, so its timeouts and its
 * codeless failures log as warnings. The codeless `transport` row speaks for undici's empty WebSocket `TypeError`, which an open WebSocket raises when the peer hangs
 * up without a close frame, and which a refused upgrade raises while dialing. This library's own error types carry no code of their own, so a clean close, a stall,
 * an HTTP status and a refused sign-in all classify into that row, and each is decided above the table by the site that raises it.
 */
import type { TransportFailure } from "./failure.ts";

/**
 * The level {@link connectionFaultLevel} answers: `error` when the operator must act, `warning` when the fault heals itself, and `quiet` when it is no fault worth a
 * user's attention, such as a teardown.
 */
export type ConnectionFaultLevel = "error" | "quiet" | "warning";

/**
 * Answer the level a connection fault is logged at, from its transport classification and whether the fault ended a long-lived connection that had been working,
 * by the table this module states.
 *
 * Pure: no state, no clock and no logging. The `switch` over the kind is exhaustive, so a kind the classifier learns fails the build here until the table places it.
 *
 * @param failure      - The classified failure, as the transport failure classifier answered it.
 * @param options      - Which of the table's columns the fault falls in.
 * @param options.open - Whether the fault ended a long-lived connection that had been working: `true` for a WebSocket or a stream past its upgrade, `false` while
 *                       the connection was still being dialed. A one-shot HTTP request passes `false` whatever socket undici gave it, so its timeouts and codeless
 *                       failures log as warnings.
 *
 * @returns The level to log the fault at.
 */
export function connectionFaultLevel(failure: TransportFailure, { open }: { readonly open: boolean }): ConnectionFaultLevel {

  switch(failure.kind) {

    case "aborted":
    case "destroyed":

      return "quiet";

    case "certificate":

      return "error";

    // A host name that does not resolve stays broken until someone fixes it, while a resolver failing temporarily heals itself, as does any code the kind learns.
    case "dns":

      return (failure.code === "ENOTFOUND") ? "error" : "warning";

    case "connect-timeout":
    case "refused":
    case "reset":
    case "retries-exhausted":
    case "unreachable":

      return "warning";

    case "timeout":

      return open ? "quiet" : "warning";

    case "transport":

      return ((failure.code === undefined) && open) ? "quiet" : "warning";
  }
}
