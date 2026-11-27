/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * media-endpoint.ts: The single source of truth for negotiating a camera media channel over the authenticated HTTP transport and composing the addresses its answer
 * names - a livestream's proxied and direct addresses, talkback's proxied one and the camera's own RTP listener - and for composing a talkback session's endpoint
 * from its negotiation and the rate the camera's record names.
 */

/**
 * The one place the library negotiates a camera media channel over the authenticated HTTP transport, composes the addresses a session dials, and reads the rate a
 * talkback session reports. A negotiation issues an authenticated GET to a controller endpoint, classifies a non-2xx through {@link ProtectResponse.ensureOk}, parses
 * the body and refuses one that is not a JSON object, and each composition below reads its own field of that one body: a WebSocket channel the `url` the controller
 * mints through its own proxy and, on the livestream endpoint, the `directUrl` naming the controller's media server, and talkback's Opus channel the
 * `audioRemoteTrackUrl` the controller's WebRTC talkback route answers. Each composition reads the minted text through `URL.parse`, so a minted value that does not
 * parse never raises an error that carries it, token and alias included.
 *
 * - The proxied address is the controller's URL authority under the UniFi OS proxy prefix, followed by the minted URL's path and the query that carries the token.
 *   The minted host and port are never dialed: they name the Protect service's own listener, whose self-signed certificate no certificate installed on UniFi OS
 *   replaces, so `verifyTls` could never hold there, and the host may be an internal name that does not resolve elsewhere on the network. The proxy refuses the
 *   upgrade without the session's auth headers, which each session on this address stamps on the socket it builds. It is the only address talkback's AAC channel
 *   has.
 * - The direct address, a livestream's alone, is `wss://`, the authority's hostname, and the minted `directUrl`'s port, path and query: the media server listens on
 *   the controller itself, at the port it minted, so the configured hostname reaches it wherever the minted host does not resolve. A `directUrl` that is absent, does
 *   not parse or is not `wss:` is no direct address.
 * - The RTP address, talkback's Opus channel's alone, is the camera's own listener, dialed as minted. The WebRTC talkback route (`/api/tcp/talkback` with
 *   `source=ucore`) switches the camera to Opus and answers an `rtp:` address with no proxy, token or certificate between the library and the camera, so there is
 *   nothing to compose but the host, an IPv6 literal's brackets removed because a UDP socket takes the literal bare, and the port. An `audioRemoteTrackUrl` that is
 *   not an `rtp:` address with a host and a port from 1 to 65535 is no address at all.
 *
 * No talkback route's answer names the rate the camera plays at, so each talkback session reads it from the camera's record, `talkbackSettings.samplingRate`,
 * through the same request once its negotiation has answered. The rate is read from the controller rather than the store because the negotiation is what switches
 * the camera's talkback settings, which the controller saves before it answers, while the store learns of the switch only through the realtime stream, which trails
 * that answer. The record's URL is the caller's to supply, so the device endpoint builder stays the one home of every device URL, and a talkback session's whole
 * endpoint is composed in one place, the negotiation and then the rate read.
 *
 * Every channel shares the request, the classification and the parse, and differs only in the endpoint path it negotiates and the field it composes, so each
 * specialization below is that path and that composition over the one negotiation.
 *
 * @module ProtectMediaEndpoints
 */
import { ProtectProtocolError, assertNever } from "../shared/errors.ts";
import type { TalkbackAudioCodec, TalkbackEndpoint } from "../talkback/session.ts";
import type { LivestreamAddresses } from "../livestream/session.ts";
import { PROTECT_PROXY_PATH } from "./url-host.ts";
import type { Transport } from "./http.ts";
import { isPlainObject } from "../protocol/realtime/plain-object.ts";

// The negotiation endpoint paths, each composed from the shared Protect proxy prefix, under which the proxied address the negotiation answers sits too. The paths
// are named constants rather than inline strings so the path each channel negotiates over has one home, and each specialization below reads as its channel's path
// and the addresses that channel dials.
const LIVESTREAM_ENDPOINT_PATH = PROTECT_PROXY_PATH + "/api/ws/livestream";
const TALKBACK_ENDPOINT_PATH = PROTECT_PROXY_PATH + "/api/ws/talkback";
const TALKBACK_RTP_ENDPOINT_PATH = PROTECT_PROXY_PATH + "/api/tcp/talkback";

// Read one controller endpoint's answer as a record: issue the authenticated GET, classify a non-2xx, parse the body and refuse one that is not a JSON object, so
// every composition below reads its field off a record and never off null, an array or a number. Each negotiation and the camera-record read go through it, so the
// request, its classification and the refusal have one home. The request is the endpoint's whole URL, the caller's cancellation, and the transport the GET goes
// through.
async function getRecord({ signal, transport, url }: { signal?: AbortSignal; transport: Transport; url: string }): Promise<Record<string, unknown>> {

  const response = await transport.send(url, (signal !== undefined) ? { signal } : {});

  // A non-2xx becomes its classified FatalError here, the same throw-on-error path every other caller uses.
  response.ensureOk();

  const body = response.json<unknown>();

  if(!isPlainObject(body)) {

    throw new ProtectProtocolError("The UniFi Protect controller answered with a JSON document that is not an object.");
  }

  return body;
}

// Negotiate one channel: the GET of the channel's endpoint path and stream params on the controller's URL authority (`host`), answering the parsed body for the
// channel's composition to read its own field of.
async function negotiate({ host, params, path, signal, transport }: { host: string; params: URLSearchParams; path: string; signal?: AbortSignal;
  transport: Transport; }): Promise<Record<string, unknown>> {

  return getRecord({ signal, transport, url: "https://" + host + path + "?" + params.toString() });
}

// Compose the proxied address from the configured authority, the proxy prefix, the minted path and the minted query, which carries the token, refusing a `url` that
// is not a string or does not parse. The authority is concatenated whole rather than assigned through a URL setter, so its port and an IPv6 literal's brackets reach
// the URL exactly as `host` carries them.
function proxiedAddress(host: string, url: unknown): string {

  const minted = (typeof url === "string") ? URL.parse(url) : null;

  if(minted === null) {

    throw new ProtectProtocolError("The UniFi Protect WebSocket endpoint response did not contain a WebSocket URL.");
  }

  return "wss://" + host + PROTECT_PROXY_PATH + minted.pathname + minted.search;
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

// Read the camera's RTP listener from the minted `audioRemoteTrackUrl`: its host, an IPv6 literal's brackets removed, and its port, refusing an answer that is not
// an `rtp:` address with a host and a port from 1 to 65535. The URL parser refuses a port past 65535 and leaves an absent one empty, which reads as 0, so the floor
// is the one bound read here.
function rtpAddress(audioRemoteTrackUrl: unknown): { host: string; port: number } {

  const minted = (typeof audioRemoteTrackUrl === "string") ? URL.parse(audioRemoteTrackUrl) : null;
  const port = Number(minted?.port ?? "");

  if((minted?.protocol !== "rtp:") || (minted.hostname.length === 0) || (port < 1)) {

    throw new ProtectProtocolError("The UniFi Protect talkback endpoint response did not contain an RTP address.");
  }

  const { hostname } = minted;

  return { host: hostname.startsWith("[") ? hostname.slice(1, -1) : hostname, port };
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
 * @throws {@link ProtectProtocolError} when the controller's 2xx response is not a JSON object or carries no string `url`, or one that does not parse; the
 *   classified `FatalError` on a non-2xx; a transport-level `ProtectError` on failure.
 *
 * @category Transport
 */
export function livestreamUrlResolver(transport: Transport, host: string): (params: URLSearchParams, opts: { signal?: AbortSignal }) => Promise<LivestreamAddresses> {

  return async (params: URLSearchParams, opts: { signal?: AbortSignal }): Promise<LivestreamAddresses> => {

    const body = await negotiate({ host, params, path: LIVESTREAM_ENDPOINT_PATH, signal: opts.signal, transport });

    return { direct: directAddress(host, body["directUrl"]), proxied: proxiedAddress(host, body["url"]) };
  };
}

/**
 * Build the talkback AAC channel's `resolveUrl` closure: the negotiation against the controller's talkback WebSocket endpoint (`?camera={id}`), answering its one,
 * proxied address. {@link talkbackEndpointResolver} builds it once and calls it with an AAC session's camera param.
 *
 * @param transport - The HTTP transport to negotiate through.
 * @param host      - The controller's URL authority, which the negotiation goes to and the returned URL is built on.
 *
 * @returns A `resolveUrl` function: given the request params and an optional signal, it resolves to the WebSocket URL on the controller authority under the UniFi
 *   OS proxy prefix, with the minted path and the query that carries the token.
 *
 * @throws {@link ProtectProtocolError} when the controller's 2xx response is not a JSON object or carries no string `url`, or one that does not parse; the
 *   classified `FatalError` on a non-2xx; a transport-level `ProtectError` on failure.
 *
 * @category Transport
 */
export function talkbackUrlResolver(transport: Transport, host: string): (params: URLSearchParams, opts: { signal?: AbortSignal }) => Promise<string> {

  return async (params: URLSearchParams, opts: { signal?: AbortSignal }): Promise<string> => {

    const body = await negotiate({ host, params, path: TALKBACK_ENDPOINT_PATH, signal: opts.signal, transport });

    return proxiedAddress(host, body["url"]);
  };
}

/**
 * Build the talkback Opus channel's resolver: the negotiation against the controller's WebRTC talkback route (`?camera={id}&source=ucore`), which switches the
 * camera to Opus and answers the camera's own RTP listener. {@link talkbackEndpointResolver} builds it once and calls it with an Opus session's camera id.
 *
 * @param transport - The HTTP transport to negotiate through.
 * @param host      - The controller's URL authority, which the negotiation goes to.
 *
 * @returns A resolver: given the camera id and an optional signal, it resolves to the camera's RTP listener, its host without an IPv6 literal's brackets.
 *
 * @throws {@link ProtectProtocolError} when the controller's 2xx response is not a JSON object or its `audioRemoteTrackUrl` is not an `rtp:` address with a host
 *   and a port from 1 to 65535, carrying none of the minted text; the classified `FatalError` on a non-2xx, {@link ProtectAuthorizationError} among them for an
 *   account without the live-view permission; a transport-level `ProtectError` on failure.
 *
 * @category Transport
 */
export function talkbackRtpResolver(transport: Transport, host: string): (cameraId: string, opts: { signal?: AbortSignal }) => Promise<{ host: string; port: number }> {

  return async (cameraId: string, opts: { signal?: AbortSignal }): Promise<{ host: string; port: number }> => {

    const body = await negotiate({ host, params: new URLSearchParams({ camera: cameraId, source: "ucore" }), path: TALKBACK_RTP_ENDPOINT_PATH, signal: opts.signal,
      transport });

    return rtpAddress(body["audioRemoteTrackUrl"]);
  };
}

/**
 * Build the talkback rate reader: the GET of a camera's record from the controller, answering the sampling rate its talkback settings name.
 * {@link talkbackEndpointResolver} builds it once and reads the rate after each negotiation has answered, because the negotiation is what switches the settings the
 * rate belongs to.
 *
 * @param transport - The HTTP transport to read through.
 * @param recordUrl - The URL of a camera's record, given its id, which the read goes to.
 *
 * @returns A reader: given the camera id and an optional signal, it resolves to the camera's talkback sampling rate in hertz.
 *
 * @throws {@link ProtectProtocolError} when the controller's 2xx response is not a JSON object or its `talkbackSettings.samplingRate` is not a positive integer;
 *   the classified `FatalError` on a non-2xx; a transport-level `ProtectError` on failure.
 *
 * @category Transport
 */
export function talkbackRateReader(transport: Transport,
  recordUrl: (cameraId: string) => string): (cameraId: string, opts: { signal?: AbortSignal }) => Promise<number> {

  return async (cameraId: string, opts: { signal?: AbortSignal }): Promise<number> => {

    const record = await getRecord({ signal: opts.signal, transport, url: recordUrl(cameraId) });
    const settings = record["talkbackSettings"];
    const rate = isPlainObject(settings) ? settings["samplingRate"] : undefined;

    if((typeof rate !== "number") || !Number.isInteger(rate) || (rate <= 0)) {

      throw new ProtectProtocolError("The UniFi Protect camera record did not contain a talkback sampling rate.");
    }

    return rate;
  };
}

/**
 * Build the talkback endpoint resolver: for each session, the negotiation its codec names and then the camera-record read of the rate the camera plays at, in that
 * order, the caller's signal reaching each request. The rate is read only once the negotiation has answered, because the negotiation is what switches the camera's
 * talkback settings, and the controller has saved the switch by the time it answers. The composition root builds it once and binds it into the
 * {@link DeviceContext} talkback factory, which calls it with each session's codec and camera id.
 *
 * - `"aac"` negotiates the talkback WebSocket endpoint and answers a `webSocket` endpoint at its proxied address.
 * - `"opus"` negotiates the WebRTC talkback route and answers an `rtp` endpoint at the camera's own listener.
 *
 * @param options           - The resolver's options.
 * @param options.host      - The controller's URL authority, which each negotiation goes to.
 * @param options.recordUrl - The URL of a camera's record, given its id, which the rate is read from.
 * @param options.transport - The HTTP transport every request goes through.
 *
 * @returns A resolver: given a session's codec and camera id and an optional signal, it resolves to the {@link TalkbackEndpoint} the session dials, at the rate the
 *   camera's talkback settings name.
 *
 * @throws What the codec's negotiation throws, as {@link talkbackUrlResolver} and {@link talkbackRtpResolver} state, in which case the rate is never read, and what
 *   the rate read throws, as {@link talkbackRateReader} states.
 *
 * @category Transport
 */
export function talkbackEndpointResolver({ host, recordUrl, transport }: { host: string; recordUrl: (cameraId: string) => string;
  transport: Transport; }): (params: { audio: TalkbackAudioCodec; cameraId: string }, opts: { signal?: AbortSignal }) => Promise<TalkbackEndpoint> {

  const resolveUrl = talkbackUrlResolver(transport, host);
  const resolveRtp = talkbackRtpResolver(transport, host);
  const readRate = talkbackRateReader(transport, recordUrl);

  return async ({ audio, cameraId }: { audio: TalkbackAudioCodec; cameraId: string }, opts: { signal?: AbortSignal }): Promise<TalkbackEndpoint> => {

    switch(audio) {

      case "aac": {

        const url = await resolveUrl(new URLSearchParams({ camera: cameraId }), opts);

        return { kind: "webSocket", samplingRate: await readRate(cameraId, opts), url };
      }

      case "opus": {

        const listener = await resolveRtp(cameraId, opts);

        return { host: listener.host, kind: "rtp", port: listener.port, samplingRate: await readRate(cameraId, opts) };
      }

      default:

        // Exhaustiveness guard. A new codec joining the union without a case above stops `audio` being `never` here, and this fails to compile.
        return assertNever(audio);
    }
  };
}
