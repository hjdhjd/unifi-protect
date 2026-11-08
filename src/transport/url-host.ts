/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * url-host.ts: The controller address as a URL carries it - the published mask over the userinfo an address can carry, the bracket-aware host formatter and the
 * one derivation of the controller's URL authority, with each refusal that names the address quoting it through that mask, and the Protect proxy prefix every
 * Protect path on that authority opens with.
 */
import { ProtectConfigurationError } from "../errors.ts";
import { isIP } from "node:net";

/**
 * The path under which UniFi OS serves the Protect application on the controller's URL authority. Every Protect URL the library composes opens with it after the
 * scheme and the authority, while UniFi OS's own paths, the sign-in and the root fetch among them, carry none. It is a fact of the controller's wire rather than a
 * tunable, so it sits beside the authority it extends rather than among the library's settings.
 */
export const PROTECT_PROXY_PATH = "/proxy/protect";

/**
 * Mask the userinfo a controller address can carry, for a message or a log line that names the address: an address carrying no `@` is returned as given, and
 * otherwise everything up to and including its last `@` is shown as `***@`, an empty marker (`@nvr.local`) included. Every refusal of the controller address is a
 * {@link ProtectConfigurationError}, and each refusal that names the address quotes it through this mask, so a consumer naming the address in its own log applies
 * the library's own rule.
 *
 * The cut reads the raw text rather than a parse of it, because a parse can misplace a userinfo: behind a composed `https://`, `https://user:pass@10.0.0.1` parses
 * as the host `https`. It falls at the last `@` because a password may itself carry an `@`, a `/`, a `?`, a `#` or a `\`, so a cut at any earlier `@` can leave
 * part of one showing.
 *
 * @param address - The controller address as configured.
 *
 * @returns The address as given when it carries no `@`, and otherwise `***@` followed by the text after its last `@`.
 *
 * @category Utilities
 */
export function maskAddressCredentials(address: string): string {

  const at = address.lastIndexOf("@");

  return (at === -1) ? address : ("***@" + address.slice(at + 1));
}

// Quote the address as a refusal shows it: masked, inside double quotes.
function quotedAddress(address: string): string {

  return "\"" + maskAddressCredentials(address) + "\"";
}

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
 * @throws {@link ProtectConfigurationError} if `host` is an IPv6 literal carrying a zone, quoting it as the controller address, as given.
 */
export function formatUrlHost(host: string): string {

  // Everything `isIP` does not read as IPv6 passes through, a bracketed literal among it, because `isIP` reads no brackets: what a caller bracketed is its own business.
  if(isIP(host) !== 6) {

    return host;
  }

  if(host.includes("%")) {

    throw new ProtectConfigurationError("The controller address " + quotedAddress(host) + " carries an IPv6 zone, which a URL has no place for.");
  }

  return "[" + host + "]";
}

/**
 * Derive the controller's URL authority from the address the client is configured with: the host and port the URL parser reads from it, a bare IPv6 literal
 * bracketed first. The client derives it once at connect, and every URL it composes is the scheme, this authority and a path.
 *
 * A host that is missing or is not a string, as a hand-edited configuration can hand a JavaScript consumer, is refused first, before any text is read, so the
 * caller meets the typed refusal rather than the `TypeError` its first read would raise. Its sentence quotes no value, because there is no address text to mask.
 *
 * An address whose text before its last `@` is anything but nothing or a lone `:` is refused next, before anything else reads it, because a host never carries an
 * account: what comes before the `@` is a userinfo, and the account belongs in the connect options rather than in the address. The refusal comes ahead of the parse
 * because the URL parser's own refusal keeps the whole input it was handed, so a cause would print the userinfo the message hides. An empty marker (`@nvr.local`,
 * `:@nvr.local`) names no account, so it goes on to the parse unstripped and the parser folds it away as it folds an empty port, as homebridge-plugin-utils'
 * `addressListingForm` folds it. The marker is read as typed, so one the parser alone would read as empty (a tab, a leading `/`) is refused, which is the safe side.
 *
 * A single trailing `/` is dropped next, because it is the empty path every composed URL places after the authority anyway, so an address carrying one says nothing
 * its slash-less form does not. It is dropped before formatting, because `isIP` reads `fe80::1/` as no address and would leave it unbracketed.
 *
 * The address is refused unless it parses as an authority. A parse alone is not enough, because a value can parse and still carry more than a host and a port: a
 * path, a query or a fragment each parse as a URL part of their own, and every URL the client composes would then carry them. The parse reads the authority with a
 * path after it, the way every composed URL reads it, because an address ending in a second trailing `/`, an empty `?` or `#`, a backslash or a trailing space
 * parses alone as a bare host and still breaks every URL once a path follows it. The authority returned is the parser's reading, not the address's text, so what the
 * parser normalizes away (a dot segment, an empty port, a stray tab) never reaches a composed URL, and the host comes back lowercased, an IPv6 literal in its
 * canonical form and the scheme's default port omitted.
 *
 * @param host - The controller address as configured. Typed `unknown` because a JavaScript consumer's configuration can hand in a value of any type.
 *
 * @returns The controller's URL authority.
 *
 * @throws {@link ProtectConfigurationError} if the address is missing or is not a string, quoting no value and with no cause, or if no URL authority can carry the
 * address, quoting it through {@link maskAddressCredentials} so that no userinfo is printed, with the URL parser's own refusal as the cause when it refused; the
 * refusal of an address carrying a userinfo has no cause.
 */
export function controllerAuthority(host: unknown): string {

  if(typeof host !== "string") {

    throw new ProtectConfigurationError("The controller address is missing or is not text; set it to the controller's hostname or IP address.");
  }

  const at = host.lastIndexOf("@");

  // An empty user, alone or beside an empty password, is the one text before the `@` that carries no account, and the parse below folds it away.
  if((at !== -1) && ![ "", ":" ].includes(host.slice(0, at))) {

    throw new ProtectConfigurationError("The controller address " + quotedAddress(host) + " carries more than a host and a port.");
  }

  const formatted = formatUrlHost(host.endsWith("/") ? host.slice(0, -1) : host);

  let parsed: URL;

  try {

    parsed = new URL("https://" + formatted + "/");
  } catch(error) {

    throw new ProtectConfigurationError("The controller address " + quotedAddress(host) + " is not a host a URL can carry.", { cause: error });
  }

  if((parsed.pathname !== "/") || (parsed.search !== "") || (parsed.hash !== "")) {

    throw new ProtectConfigurationError("The controller address " + quotedAddress(host) + " carries more than a host and a port.");
  }

  return parsed.host;
}
