/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * ws-endpoint.ts: The single source of truth for negotiating a media WebSocket over the authenticated HTTP transport and composing the addresses its answer names -
 * a livestream's proxied and direct addresses, and talkback's proxied one.
 */

/**
 * The one place the library negotiates a media WebSocket over the authenticated HTTP transport and composes the addresses a session dials. A negotiation issues an
 * authenticated GET to a controller endpoint, classifies a non-2xx through {@link ProtectResponse.ensureOk} and parses the body, whose `url` the controller mints
 * through its own proxy and whose `directUrl`, on the livestream endpoint, names the controller's media server. Each composition below reads the minted text through
 * `URL.parse`, so a minted value that does not parse never raises an error that carries it, token and alias included.
 *
 * - The proxied address is the controller's URL authority under the UniFi OS proxy prefix, followed by the minted URL's path and the query that carries the token.
 *   The minted host and port are never dialed: they name the Protect service's own listener, whose self-signed certificate no certificate installed on UniFi OS
 *   replaces, so `verifyTls` could never hold there, and the host may be an internal name that does not resolve elsewhere on the network. The proxy refuses the
 *   upgrade without the session's auth headers, which each session on this address stamps on the socket it builds. It is the only address talkback has.
 * - The direct address, a livestream's alone, is `wss://`, the authority's hostname, and the minted `directUrl`'s port, path and query: the media server listens on
 *   the controller itself, at the port it minted, so the configured hostname reaches it wherever the minted host does not resolve. A `directUrl` that is absent, does
 *   not parse or is not `wss:` is no direct address.
 *
 * Every channel shares the method and the parse, and differs only in the endpoint path it negotiates and the addresses it composes, so each specialization below is
 * that path and those compositions over the one negotiation.
 *
 * @module ProtectWebSocketEndpoints
 */
import type { LivestreamAddresses } from "./livestream-session.ts";
import { PROTECT_PROXY_PATH } from "./url-host.ts";
import { ProtectProtocolError } from "../errors.ts";
import type { Transport } from "./http.ts";

// The negotiation endpoint paths, each composed from the shared Protect proxy prefix, under which the proxied address the negotiation answers sits too. The paths
// are named constants rather than inline strings so the path each channel negotiates over has one home, and each specialization below reads as its channel's path
// and the addresses that channel dials.
const LIVESTREAM_ENDPOINT_PATH = PROTECT_PROXY_PATH + "/api/ws/livestream";
const TALKBACK_ENDPOINT_PATH = PROTECT_PROXY_PATH + "/api/ws/talkback";

// What one negotiation answers: the proxied address it composed, and the minted `directUrl` as the body carried it, for the livestream specialization alone to compose.
interface Negotiated {

  directUrl: unknown;
  proxied: string;
}

// Negotiate one channel: issue the authenticated GET, classify a non-2xx, parse the body and compose its proxied address, which every channel dials and which a
// body with no string `url`, or one whose `url` does not parse, cannot give. The request is the controller's URL authority (`host`), which the GET goes to and the
// proxied address is built on, the channel's endpoint path and stream params, the caller's cancellation, and the transport the GET goes through.
async function negotiate({ host, params, path, signal, transport }: { host: string; params: URLSearchParams; path: string; signal?: AbortSignal;
  transport: Transport; }): Promise<Negotiated> {

  const response = await transport.send("https://" + host + path + "?" + params.toString(), (signal !== undefined) ? { signal } : {});

  // A non-2xx becomes its classified FatalError here, the same throw-on-error path every other caller uses.
  response.ensureOk();

  const body = response.json<{ directUrl?: unknown; url?: unknown }>();
  const proxied = (typeof body.url === "string") ? proxiedAddress(host, body.url) : null;

  if(proxied === null) {

    throw new ProtectProtocolError("The UniFi Protect WebSocket endpoint response did not contain a WebSocket URL.");
  }

  return { directUrl: body.directUrl, proxied };
}

// Compose the proxied address from the configured authority, the proxy prefix, the minted path and the minted query, which carries the token, or null when the
// minted text does not parse. The authority is concatenated whole rather than assigned through a URL setter, so its port and an IPv6 literal's brackets reach the URL
// exactly as `host` carries them.
function proxiedAddress(host: string, url: string): string | null {

  const minted = URL.parse(url);

  return (minted === null) ? null : ("wss://" + host + PROTECT_PROXY_PATH + minted.pathname + minted.search);
}

// Compose the direct address from the authority's hostname and the minted port, path and query, or null when the controller offered no direct address the library
// can dial. The hostname is read through the URL parser, which keeps an IPv6 literal's brackets and drops the configured port, because the media server listens at
// the port the controller minted. A minted port the scheme's default leaves out is left out here too, which dials the same port.
function directAddress(host: string, directUrl: unknown): string | null {

  const minted = (typeof directUrl === "string") ? URL.parse(directUrl) : null;

  if(minted?.protocol !== "wss:") {

    return null;
  }

  return "wss://" + new URL("https://" + host).hostname + ((minted.port === "") ? "" : (":" + minted.port)) + minted.pathname + minted.search;
}

/**
 * Build the livestream channel's `resolveUrl` closure: the negotiation against the controller's livestream WebSocket endpoint, answering both of a livestream's
 * addresses. The composition root builds it once and hands it to the {@link LivestreamPool}; the pool calls it with each session's stream params, and each session
 * dials the one address its route names.
 *
 * @param transport - The HTTP transport to negotiate through.
 * @param host      - The controller's URL authority (no scheme, an IPv6 literal bracketed, any port kept). The negotiation goes to it, the proxied address is built
 *                    on it whole, its port included, and the direct address on its hostname alone, at the port the controller minted.
 *
 * @returns A `resolveUrl` function: given the request params and an optional signal, it resolves to the livestream's {@link LivestreamAddresses}, the direct
 *   address null when the controller offered none the library can dial.
 *
 * @throws {@link ProtectProtocolError} when the controller's 2xx response carries no string `url`, or one that does not parse; the classified `FatalError` on a
 *   non-2xx; a transport-level `ProtectError` on failure.
 *
 * @category Transport
 */
export function livestreamUrlResolver(transport: Transport, host: string): (params: URLSearchParams, opts: { signal?: AbortSignal }) => Promise<LivestreamAddresses> {

  return async (params: URLSearchParams, opts: { signal?: AbortSignal }): Promise<LivestreamAddresses> => {

    const { directUrl, proxied } = await negotiate({ host, params, path: LIVESTREAM_ENDPOINT_PATH, signal: opts.signal, transport });

    return { direct: directAddress(host, directUrl), proxied };
  };
}

/**
 * Build the talkback channel's `resolveUrl` closure: the negotiation against the controller's talkback WebSocket endpoint (`?camera={id}`), answering its one,
 * proxied address. The composition root builds it once and binds it into the {@link DeviceContext} talkback factory; each {@link TalkbackSession} calls it with its
 * camera param.
 *
 * @param transport - The HTTP transport to negotiate through.
 * @param host      - The controller's URL authority, which the negotiation goes to and the returned URL is built on.
 *
 * @returns A `resolveUrl` function: given the request params and an optional signal, it resolves to the WebSocket URL on the controller authority under the UniFi
 *   OS proxy prefix, with the minted path and the query that carries the token.
 *
 * @throws {@link ProtectProtocolError} when the controller's 2xx response carries no string `url`, or one that does not parse; the classified `FatalError` on a
 *   non-2xx; a transport-level `ProtectError` on failure.
 *
 * @category Transport
 */
export function talkbackUrlResolver(transport: Transport, host: string): (params: URLSearchParams, opts: { signal?: AbortSignal }) => Promise<string> {

  return async (params: URLSearchParams, opts: { signal?: AbortSignal }): Promise<string> => {

    const { proxied } = await negotiate({ host, params, path: TALKBACK_ENDPOINT_PATH, signal: opts.signal, transport });

    return proxied;
  };
}
