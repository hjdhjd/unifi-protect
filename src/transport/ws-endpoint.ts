/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * ws-endpoint.ts: The single source of truth for negotiating a WebSocket URL over the authenticated HTTP transport - shared by the livestream pool and the talkback
 * session.
 */

/**
 * `wsEndpointResolver` is the one place the library negotiates a WebSocket URL over the authenticated HTTP transport. Both the livestream pool and the talkback session
 * need the identical shape: issue an authenticated GET to a controller endpoint, classify a non-2xx through {@link ProtectResponse.ensureOk}, parse the `{ url }` body,
 * and rewrite the controller-minted URL's hostname to the configured address - the controller sometimes returns an internal hostname that does not resolve elsewhere on
 * the network, while its path and port carry the authorization token and the WebSocket port we must keep.
 *
 * Every caller differs from the others in exactly one thing - the endpoint path - so the negotiator is parameterized on path alone: the controller negotiates its WS
 * endpoints over GET, so each channel shares the method and differs only in path. Encoding a method parameter that never varies would assert a difference that does not
 * exist; consolidating the parse-and-rewrite logic here once, rather than duplicating it per channel, applies the single-source-of-truth principle.
 *
 * @module wsEndpointResolver
 */
import { ProtectProtocolError } from "../errors.ts";
import type { Transport } from "./http.ts";

// The controller WebSocket-negotiation endpoint paths. Named constants rather than inline strings so the path each channel negotiates over has one home, and the
// specialization helpers below read as the only difference between the channels (which they are).
const LIVESTREAM_ENDPOINT_PATH = "/proxy/protect/api/ws/livestream";
const TALKBACK_ENDPOINT_PATH = "/proxy/protect/api/ws/talkback";

/**
 * Build a `resolveUrl` closure that negotiates a WebSocket endpoint over the authenticated transport. The returned function takes the channel-specific query params and
 * an optional abort signal, issues the GET, and returns the controller-minted URL with its hostname rewritten to `host`. Suitable for {@link LivestreamSessionOptions},
 * {@link TalkbackSessionOptions}, and {@link LivestreamPoolOptions} `resolveUrl` members.
 *
 * @param transport - The HTTP transport to negotiate through.
 * @param host      - The configured controller address (no scheme), substituted into the returned URL's hostname.
 * @param path      - The controller endpoint path to GET (the only thing that differs between the livestream and talkback channels).
 *
 * @returns A `resolveUrl` function: given the request params and an optional signal, it resolves to the host-rewritten WebSocket URL.
 *
 * @throws {@link ProtectProtocolError} when the controller's 2xx response carries no string `url`; the classified `FatalError` on a non-2xx; a transport-level
 *   `ProtectError` on failure.
 *
 * @category Transport
 */
export function wsEndpointResolver(transport: Transport, host: string, path: string): (params: URLSearchParams, opts: { signal?: AbortSignal }) => Promise<string> {

  return async (params: URLSearchParams, opts: { signal?: AbortSignal }): Promise<string> => {

    const url = "https://" + host + path + "?" + params.toString();
    const response = await transport.send(url, (opts.signal !== undefined) ? { signal: opts.signal } : {});

    // A non-2xx becomes its classified FatalError here, the same throw-on-error path every other caller uses.
    response.ensureOk();

    const body = response.json<{ url?: string }>();

    if(typeof body.url !== "string") {

      throw new ProtectProtocolError("The UniFi Protect WebSocket endpoint response did not contain a WebSocket URL.");
    }

    // Keep the controller's path and port (which carry the authorization token and the WebSocket port), swapping only the hostname for the configured address.
    const resolved = new URL(body.url);

    resolved.hostname = host;

    return resolved.toString();
  };
}

/**
 * The livestream-channel specialization of {@link wsEndpointResolver}: the GET negotiation against the controller's livestream WebSocket endpoint. The composition root
 * builds it once and hands it to the {@link LivestreamPool}; the pool calls it with each session's stream params.
 *
 * @param transport - The HTTP transport to negotiate through.
 * @param host      - The configured controller address, substituted into the returned URL's hostname.
 *
 * @returns A `resolveUrl` function for the livestream endpoint.
 *
 * @category Transport
 */
export function livestreamUrlResolver(transport: Transport, host: string): (params: URLSearchParams, opts: { signal?: AbortSignal }) => Promise<string> {

  return wsEndpointResolver(transport, host, LIVESTREAM_ENDPOINT_PATH);
}

/**
 * The talkback-channel specialization of {@link wsEndpointResolver}: the GET negotiation against the controller's talkback WebSocket endpoint (`?camera={id}`). The
 * composition root builds it once and binds it into the {@link DeviceContext} talkback factory; each {@link TalkbackSession} calls it with its camera param.
 *
 * @param transport - The HTTP transport to negotiate through.
 * @param host      - The configured controller address, substituted into the returned URL's hostname.
 *
 * @returns A `resolveUrl` function for the talkback endpoint.
 *
 * @category Transport
 */
export function talkbackUrlResolver(transport: Transport, host: string): (params: URLSearchParams, opts: { signal?: AbortSignal }) => Promise<string> {

  return wsEndpointResolver(transport, host, TALKBACK_ENDPOINT_PATH);
}
