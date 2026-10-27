/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * connector.ts: The connector every dialer hands undici - the one place a socket is held from the moment it is vended, so a reset or a teardown can end a dial in
 * flight - and the order every owned teardown lets a dispatcher and its connector go in.
 */
import { buildConnector, errors } from "undici";
import type { Dispatcher } from "undici";
import type { Socket } from "node:net";

/* The connector's own runtime shape. undici's types declare the call as returning `void` (`buildConnector.connector` in undici's connector types) while the
 * implementation returns the socket it just created (the `connect` function `buildConnector` returns, in undici's `lib/core/connect.js`), which is what lets a
 * wrapper hold a socket before any event has fired on it. Naming the runtime return here is what the cast below spends, and the connector suite's release test,
 * whose release reaches a connection attempt still in flight, is the proof that the return is real.
 */
type DialingConnector = (options: buildConnector.Options, callback: buildConnector.Callback) => Socket;

/**
 * Construction options for {@link createOwnedConnector}.
 *
 * - `allowH2` is what the dialer would otherwise have told undici's own builder: the HTTP pool offers HTTP/2, and a WebSocket upgrade cannot use it. It has to be
 *   stated here because a function connector bypasses the forwarding a `Pool` and an `Agent` do of their own builder options, and the builder's own default is to
 *   allow it - so a connector that stayed silent would quietly widen the ALPN offer.
 * - `verifyTls` is the certificate-verification flag. Every caller here leaves it off by default, because a UniFi Protect controller presents a self-signed
 *   certificate that no verification chain accepts.
 */
export interface OwnedConnectorOptions {

  allowH2: boolean;
  verifyTls: boolean;
}

/**
 * A connector that holds every socket it vends, and the operation that lets go of them.
 *
 * - `connect` is the connector to hand undici - a `Pool`'s or an `Agent`'s `connect` option.
 * - `lastDialFailure` is the error the most recent dial vended: `undefined` before any dial, and `undefined` again after one that succeeded, so it describes the
 *   most recent dial and nothing older. Its readers are the sockets, whose WebSocket implementation discards the dial's error before the socket's own error event
 *   is built - which leaves this the one place the failure is still readable.
 * - `release()` destroys every socket still held: a connecting one with a fresh `ClientDestroyedError`, so a request cut this way classifies exactly as a pool
 *   reset already does, and an established one with a bare destroy, because nothing is pending on the connector's side of an established socket - a request in
 *   flight on one meets the dispatcher's own destroy instead. Destroying a connecting socket with an error is what makes undici's pending request reject with that
 *   very object - a socket destroyed with no error emits nothing the connector listens for, and the request would hang until undici's own connect timer.
 */
export interface OwnedConnector {

  readonly connect: buildConnector.connector;
  readonly lastDialFailure: Error | undefined;
  release(): void;
}

/**
 * What an owned teardown lets go: a dispatcher this library built for itself, and the connector that dispatcher dials through. An injected dispatcher or socket
 * factory is never one - its lifecycle belongs to whoever injected it, and nothing here holds a connector beside it.
 */
export interface OwnedDispatcher {

  readonly connector: OwnedConnector;
  readonly dispatcher: Dispatcher;
}

/**
 * Let an owned dispatcher and its connector go: the dispatcher's destroy, then the connector's release, in one synchronous stack. This is the one place that order
 * is written, and every owned teardown goes through it.
 *
 * The destroy goes first because it is what settles a request in flight on an established connection as the pool reset: the dispatcher ends each of its
 * connections with its own destroyed-client error, and the request carried on one rejects with that error. Released the other way round, the connector severs the
 * socket first, under a request undici still counts as running - on an HTTP/2 session undici's socket-close handler then throws an internal assertion as an
 * uncaught exception, which ends the process, and on HTTP/1.1 the request misreports as a socket failure.
 *
 * The destroy is called rather than awaited ahead of the release, because the release is what reaches a dial still in its handshake, and letting that dial go must
 * depend on nothing that can stall or reject. The destroy and the release share one synchronous stack so that nothing can dial between them: the destroy marks the
 * dispatcher destroyed before it returns, and a destroyed dispatcher dials nothing more.
 *
 * This function is local to this library and outside the parity suite, which holds the connector itself in step with homebridge-plugin-utils.
 *
 * @param owned - The dispatcher and the connector it dials through.
 *
 * @returns The dispatcher's destroy, which settles once the dispatcher's own teardown has completed.
 */
export async function releaseOwned({ connector, dispatcher }: OwnedDispatcher): Promise<void> {

  const destroyed = dispatcher.destroy();

  connector.release();

  return destroyed;
}

/**
 * Build a connector that tracks every socket it vends, from the moment it is vended.
 *
 * A dial is held from the vend rather than from the completed connect because nobody else can reach a socket mid-handshake: undici's client discards the
 * connector's return value and holds nothing of its own until the connect completes, so a socket that is still in its TCP or TLS handshake is reachable through
 * this helper alone. That is the whole reason the helper exists - a pool reset and a teardown both have to end the dials still in flight, and neither could reach
 * a connecting socket without it.
 *
 * The two sets are two because release treats them differently: a connecting socket is destroyed with a fresh `ClientDestroyedError` and an established one bare,
 * so a socket moves out of the dialing set and into the established one the moment its connect completes. Release never clears a set itself - a destroyed dial
 * leaves through its own connector callback, and a destroyed established socket leaves through its close handler - which keeps each set the live picture of what
 * is actually held.
 *
 * The dial runs on undici's own connect timer, which this helper never sets: a request is bounded by the transport's own deadline instead, and a dial a settled
 * request leaves behind ends on that timer, at a reset, or at a teardown.
 *
 * @param options - Which ALPN offer to make, and whether to verify the peer's certificate.
 *
 * @returns The connector, and the operation that lets its sockets go.
 */
export function createOwnedConnector(options: OwnedConnectorOptions): OwnedConnector {

  const dialing = new Set<Socket>();
  const established = new Set<Socket>();
  const dial = buildConnector({ allowH2: options.allowH2, keepAlive: true, rejectUnauthorized: options.verifyTls }) as unknown as DialingConnector;

  let lastDialFailure: Error | undefined;

  return {

    connect: (connectOptions, callback): void => {

      /* The callback fires on a socket event - `connect`, `secureConnect`, or `error` - and never synchronously inside the inner call, so the binding below is
       * assigned by the time it runs. A connect that failed vends its error and no socket, so the success arm is what the established tracking hangs off;
       * reaching for a socket on the failure arm would fault inside undici's own error path, where nothing is left to catch it.
       */
      const socket = dial(connectOptions, (...vended) => {

        const [ error, vendedSocket ] = vended;

        dialing.delete(socket);

        /* Record what this dial vended, for a reader that cannot get at it any other way. undici's WebSocket delivers an empty `TypeError` for every
         * opening-handshake failure - a self-signed peer, a hostname mismatch, and a refused port alike - while this callback receives the real error, with its
         * errno, a moment earlier. The record is what carries that error across to the socket's own error handling.
         */
        lastDialFailure = error ?? undefined;

        if(error === null) {

          established.add(vendedSocket);
          vendedSocket.once("close", () => established.delete(vendedSocket));
        }

        callback(...vended);
      });

      dialing.add(socket);
    },

    get lastDialFailure(): Error | undefined {

      return lastDialFailure;
    },

    release: (): void => {

      for(const socket of dialing) {

        socket.destroy(new errors.ClientDestroyedError());
      }

      for(const socket of established) {

        socket.destroy();
      }
    }
  };
}
