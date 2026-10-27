/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * failure.ts: One kind-tagged reading of whatever a transport threw, so the request path and every socket sort each failure by the same rule.
 */

/* This module is a faithful local copy of homebridge-plugin-utils' transport failure classifier: the same kinds, the same precedence, and the same bounded descent
 * of the `cause` chain. The library takes no runtime dependency on homebridge-plugin-utils, so the rule is implemented here as well, and a differential test in this
 * package's suite feeds a table of failure shapes through both classifiers and asserts the same kind and code come back, which is what keeps the two of them one rule.
 *
 * It answers what kind of failure occurred and stops there. What a kind means - the typed error it reports as and the sentence that error carries - belongs to each
 * transport, which translates the kind into this library's own hierarchy, and the level a connection fault is logged at belongs to the level table in
 * connection-fault.ts, which reads this same classification.
 *
 * The precedence is fixed, and each step exists because the step below it cannot tell the case apart:
 *
 * 1. The lifetime signal, if one is handed in and has aborted. A teardown reads as a teardown whatever the rejection looked like.
 * 2. A timeout shape anywhere in the cause chain.
 * 3. A remaining cancellation shape, which belongs to the per-request deadline once the lifetime signal is ruled out.
 * 4. The transport and errno codes, mapped to their kinds.
 * 5. Everything else, which is a real failure carrying no marker anyone can read.
 */
import { causeChain } from "../errors.ts";

/* The verdicts the platform's certificate verification can return, each spelled as Node spells it on the error's `code`: the OpenSSL X509 verification family Node
 * maps by name, together with the hostname check Node runs itself.
 *
 * Neighbors from that same table are left out on purpose. `OUT_OF_MEM` is the verifier running out of room rather than a verdict about the certificate, so a
 * failure carrying it tells a user nothing that installing a certificate would fix. `CERT_DIR`, `CERT_FILE`, `CERT_STORE`, `CERT_ALTNAME_FORMAT`,
 * `UNABLE_TO_CHECK_GENERATOR`, and `UNABLE_TO_PIPE` are not verification verdicts at all - they are store locations and unrelated failures that share the
 * library's naming.
 */
const CERTIFICATE_VERIFICATION_CODES: ReadonlySet<string> = new Set([ "CERT_CHAIN_TOO_LONG", "CERT_HAS_EXPIRED", "CERT_NOT_YET_VALID", "CERT_REJECTED",
  "CERT_REVOKED", "CERT_SIGNATURE_FAILURE", "CERT_UNTRUSTED", "CRL_HAS_EXPIRED", "CRL_NOT_YET_VALID", "CRL_SIGNATURE_FAILURE", "DEPTH_ZERO_SELF_SIGNED_CERT",
  "ERR_TLS_CERT_ALTNAME_INVALID", "ERROR_IN_CERT_NOT_AFTER_FIELD", "ERROR_IN_CERT_NOT_BEFORE_FIELD", "ERROR_IN_CRL_LAST_UPDATE_FIELD",
  "ERROR_IN_CRL_NEXT_UPDATE_FIELD", "HOSTNAME_MISMATCH", "INVALID_CA", "INVALID_PURPOSE", "PATH_LENGTH_EXCEEDED", "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_DECODE_ISSUER_PUBLIC_KEY", "UNABLE_TO_DECRYPT_CERT_SIGNATURE", "UNABLE_TO_DECRYPT_CRL_SIGNATURE", "UNABLE_TO_GET_CRL",
  "UNABLE_TO_GET_ISSUER_CERT", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY", "UNABLE_TO_VERIFY_LEAF_SIGNATURE" ]);

// Everything one descent of a `cause` chain collects, and the whole of what the classification reads afterwards.
interface CauseWalk {

  // Whether any link is an `Error` whose name marks it a cancellation. The platform cancels in more than one shape - a `DOMException` whose only code is a legacy
  // number, and Node's own `AbortError` carrying `ABORT_ERR` - so the name is the one signal every shape shares.
  abortNamed: boolean;

  // The first string-valued `code` found, nearest link first, or `undefined` when no link carried one.
  code: string | undefined;

  // Whether any link is an `Error` whose name marks it a timeout, which is the platform's own deadline shape.
  timedOut: boolean;
}

/* Read every fact the classification needs off one bounded descent of the `cause` chain, the same descent the library's error rendering reads for its sentences.
 *
 * One walk rather than one per question is what makes a wrapped failure classify as its bare equivalent does. A wrapper carrying a platform rejection as its `cause`
 * presents the timeout or cancellation marker one level down, so reading the names only at the top would classify the wrapper by what it is not, while reading them
 * at every link classifies it by what it carries.
 *
 * A `code` that is not a string is skipped rather than adopted, and skipping it does not stop the descent: the platform's `DOMException` carries a legacy numeric
 * `code` that means nothing here, and the errno the caller actually needs is usually below it.
 *
 * The timeout test reads the platform's shape alone, an `Error` named `TimeoutError`, which is what `AbortSignal.timeout()` and the library's own deadline abort
 * with. homebridge-plugin-utils' own test recognizes its abort error class carrying a timeout name as well, but that class exists only inside homebridge-plugin-utils
 * and never reaches this library's transports, so there is nothing for this copy to recognize in its place.
 */
function walkCauses(error: unknown): CauseWalk {

  const walk: CauseWalk = { abortNamed: false, code: undefined, timedOut: false };

  for(const link of causeChain(error)) {

    if((link instanceof Error) && (link.name === "TimeoutError")) {

      walk.timedOut = true;
    }

    if((link instanceof Error) && (link.name === "AbortError")) {

      walk.abortNamed = true;
    }

    // The nearest code wins, so once one is held the deeper ones are passed over. Only an object carries a code at all, and the descent ends on a link that is not
    // one, so that link answers the name checks above and nothing further.
    if((walk.code === undefined) && (typeof link === "object") && (link !== null) && ("code" in link) && (typeof link.code === "string")) {

      walk.code = link.code;
    }
  }

  return walk;
}

/**
 * A classified transport failure: `kind` is the taxonomy answer, `cause` is the thrown value verbatim, and `code` is the transport or errno code the cause chain
 * carried, when it carried one.
 *
 * What each kind means, and which observed shapes produce it:
 *
 * - `"aborted"` - the lifetime signal handed to the classifier had already aborted, so this is a teardown rather than a fault. Produced by that signal alone, whatever
 *   shape the rejection itself took.
 * - `"certificate"` - the peer's certificate did not pass the platform's verification. Produced by the platform's own certificate verdict codes, which are read as a
 *   family rather than one name at a time.
 * - `"connect-timeout"` - the connection attempt timed out before a request was ever written. Produced by `UND_ERR_CONNECT_TIMEOUT`.
 * - `"destroyed"` - the request was dispatched against a pool that has been torn down. Produced by `UND_ERR_DESTROYED`, which is how a request in flight when its
 *   dispatcher is destroyed settles.
 * - `"dns"` - the host name did not resolve. Produced by `ENOTFOUND`, and by `EAI_AGAIN`, the temporary-failure form a struggling resolver returns.
 * - `"refused"` - the host answered the connection attempt by declining it. Produced by `ECONNREFUSED`.
 * - `"reset"` - an established connection was dropped mid-exchange. Produced by `ECONNRESET`.
 * - `"retries-exhausted"` - the transport's retry interceptor gave up. Produced by `UND_ERR_REQ_RETRY`.
 * - `"timeout"` - a deadline elapsed. Produced by the platform `TimeoutError` from `AbortSignal.timeout()`, by a cancellation that is not the lifetime signal's, and
 *   by the response deadlines `UND_ERR_HEADERS_TIMEOUT` and `UND_ERR_BODY_TIMEOUT`.
 * - `"transport"` - a genuine failure carrying no marker anyone can read. The catch-all, and where a value that is not an error at all lands.
 * - `"unreachable"` - the peer could not be reached, so nothing answered rather than the host declining. Produced by `EHOSTUNREACH` and `ENETUNREACH`, where no
 *   route leads to the peer, by `ENETDOWN` and `EHOSTDOWN`, where the network or the host is down, and by `ETIMEDOUT`, the platform's own timer giving up on a peer
 *   that stopped answering.
 *
 * The union is split by whether a kind is reached only by matching a code. Such a kind carries the code as a required field, so a caller narrowing to one reads a
 * plain string; a kind reached by a signal or by a name may or may not have passed a code on the way down, so there the field is optional.
 */
export type TransportFailure = {

  readonly cause: unknown;
  readonly code: string;
  readonly kind: "certificate" | "connect-timeout" | "destroyed" | "dns" | "refused" | "reset" | "retries-exhausted" | "unreachable";
} | {

  readonly cause: unknown;
  readonly code?: string;
  readonly kind: "aborted" | "timeout" | "transport";
};

/**
 * Classify a thrown transport failure into one kind-tagged record.
 *
 * Pure: no state, no clock, no logging, and nothing thrown back at the caller. Any value at all can be handed to it, including values that are not errors.
 *
 * @param error  - Whatever was thrown or rejected.
 * @param signal - The lifetime signal composed into the request, when there is one. Its aborted flag outranks every reading taken from the error itself. The
 *                 library's transports hand in none, because the request path reads its own signals by identity before it asks; the parameter exists so this
 *                 copy takes the same arguments as homebridge-plugin-utils' classifier, which is what lets the parity test reach the `aborted` kind.
 *
 * @returns The classification, carrying the input verbatim as its `cause`.
 */
export function classifyTransportError(error: unknown, signal?: AbortSignal): TransportFailure {

  const walk = walkCauses(error);

  /* The lifetime signal outranks every reading taken from the error, unconditionally. Near a deadline boundary the rejection a composed cancellation produces is
   * ambiguous about which half of it fired, and the ways of being wrong here are not equally cheap: a teardown reported as a transport fault is an alarming line in a
   * log that should have stayed quiet, while a deadline reported during a teardown already underway costs nothing at all.
   */
  if(signal?.aborted === true) {

    return { cause: error, code: walk.code, kind: "aborted" };
  }

  // A deadline in the platform's shape, found at any depth.
  if(walk.timedOut) {

    return { cause: error, code: walk.code, kind: "timeout" };
  }

  /* A cancellation that is not the lifetime signal's. The signature takes a single signal because the composition it assumes is a lifetime bound plus a per-request
   * deadline, and with the lifetime ruled out one step above, the deadline is what is left. A caller that composes some third cancellation source ranks that source
   * itself before calling here.
   */
  if(walk.abortNamed || (walk.code === "UND_ERR_ABORTED")) {

    return { cause: error, code: walk.code, kind: "timeout" };
  }

  /* The code map. The transport's own codes and the platform's errno strings share one namespace here because a caller cares which failure it was, not which layer
   * named it.
   */
  switch(walk.code) {

    case "UND_ERR_CONNECT_TIMEOUT":

      return { cause: error, code: walk.code, kind: "connect-timeout" };

    // A server that stops answering partway through a response has timed out in every sense a caller would phrase it, so the response deadlines answer to the
    // timeout kind rather than becoming kinds of their own.
    case "UND_ERR_BODY_TIMEOUT":
    case "UND_ERR_HEADERS_TIMEOUT":

      return { cause: error, code: walk.code, kind: "timeout" };

    case "UND_ERR_REQ_RETRY":

      return { cause: error, code: walk.code, kind: "retries-exhausted" };

    case "UND_ERR_DESTROYED":

      return { cause: error, code: walk.code, kind: "destroyed" };

    case "ECONNREFUSED":

      return { cause: error, code: walk.code, kind: "refused" };

    case "ECONNRESET":

      return { cause: error, code: walk.code, kind: "reset" };

    // None of these is the host declining the attempt: no route leads to the peer, the network or the host is down, or the platform's own timer gave up on a peer
    // that never answered, so each is a peer out of reach rather than one that refused.
    case "EHOSTDOWN":
    case "EHOSTUNREACH":
    case "ENETDOWN":
    case "ENETUNREACH":
    case "ETIMEDOUT":

      return { cause: error, code: walk.code, kind: "unreachable" };

    case "EAI_AGAIN":
    case "ENOTFOUND":

      return { cause: error, code: walk.code, kind: "dns" };

    /* A code that matched no name above is worth one more question: whether it is one of the platform's certificate verdicts. Those are a family rather than a
     * handful of names, so they are held as a set the map consults here...spelling them out as `case` labels would state the family in the wrong place, and would
     * make every addition to it an edit of this `switch`.
     */
    default:

      if((walk.code !== undefined) && CERTIFICATE_VERIFICATION_CODES.has(walk.code)) {

        return { cause: error, code: walk.code, kind: "certificate" };
      }

      // A real failure with nothing recognizable on it. Any code the chain did carry is carried through regardless, because a code nobody has a kind for is still
      // the most useful thing a caller can put in a log line.
      return { cause: error, code: walk.code, kind: "transport" };
  }
}
