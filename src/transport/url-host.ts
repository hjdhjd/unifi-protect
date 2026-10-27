/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * url-host.ts: The controller address as a URL carries it - the bracket-aware host formatter and the one derivation of the controller's URL authority.
 */
import { ProtectConfigurationError } from "../errors.ts";
import { isIP } from "node:net";

/**
 * Format a host for a URL authority, wrapping an IPv6 literal in square brackets as the URL grammar requires.
 *
 * A literal IPv6 address carries colons, which collide with the authority's own host-port separator, so it has to be bracketed: `[fe80::1]`. A hostname or an IPv4
 * address, with or without a port, and a literal the caller has already bracketed pass through untouched. A literal carrying a zone (`fe80::1%en0`, the form a
 * link-local address takes to name the link it is reachable through) is refused, because a URL authority has no place for a zone.
 *
 * Detection reads `isIP` rather than looking for a colon, so a hostname carrying a port is never mistaken for a literal, and `isIP` reads a zoned literal as IPv6
 * too, which is why the zone is tested only once the value has read as one. This is homebridge-plugin-utils' `formatUrlHost`, ported because that library is never a
 * runtime dependency here, and a parity suite holds the two to the same answer for every input.
 *
 * @param host - The hostname or address to place in a URL authority.
 *
 * @returns The host as a URL authority carries it.
 *
 * @throws {@link ProtectConfigurationError} if `host` is an IPv6 literal carrying a zone, naming the address.
 */
export function formatUrlHost(host: string): string {

  // Everything `isIP` does not read as IPv6 passes through, a bracketed literal among it, because `isIP` reads no brackets: what a caller bracketed is its own business.
  if(isIP(host) !== 6) {

    return host;
  }

  if(host.includes("%")) {

    throw new ProtectConfigurationError("The address \"" + host + "\" carries an IPv6 zone, which a URL has no place for.");
  }

  return "[" + host + "]";
}

/**
 * Derive the controller's URL authority from the address the client is configured with: the host and port the URL parser reads from it, a bare IPv6 literal
 * bracketed first. The client derives it once at connect, and every URL it composes is the scheme, this authority and a path.
 *
 * A single trailing `/` is dropped first, because it is the empty path every composed URL places after the authority anyway, so an address carrying one says
 * nothing its slash-less form does not. It is dropped before formatting, because `isIP` reads `fe80::1/` as no address and would leave it unbracketed.
 *
 * The address is refused unless it parses as an authority. A parse alone is not enough, because a value can parse and still carry more than a host and a port:
 * credentials before an `@`, a path, a query or a fragment each parse as a URL part of their own, and every URL the client composes would then carry them. The
 * parse reads the authority with a path after it, the way every composed URL reads it, because an address ending in a second trailing `/`, an empty `?` or `#`, a
 * backslash or a trailing space parses alone as a bare host and still breaks every URL once a path follows it. The authority returned is the parser's reading, not
 * the address's text, so what the parser normalizes away (a dot segment, an empty user or port, a stray tab) never reaches a composed URL, and the host comes back
 * lowercased, an IPv6 literal in its canonical form and the scheme's default port omitted.
 *
 * @param host - The controller address as configured.
 *
 * @returns The controller's URL authority.
 *
 * @throws {@link ProtectConfigurationError} if no URL authority can carry the address, naming it, with the URL parser's own refusal as the cause when it refused.
 */
export function controllerAuthority(host: string): string {

  const formatted = formatUrlHost(host.endsWith("/") ? host.slice(0, -1) : host);

  let parsed: URL;

  try {

    parsed = new URL("https://" + formatted + "/");
  } catch(error) {

    throw new ProtectConfigurationError("The controller address \"" + host + "\" is not a host a URL can carry.", { cause: error });
  }

  if((parsed.username !== "") || (parsed.password !== "") || (parsed.pathname !== "/") || (parsed.search !== "") || (parsed.hash !== "")) {

    throw new ProtectConfigurationError("The controller address \"" + host + "\" carries more than a host and a port.");
  }

  return parsed.host;
}
