[**unifi-protect**](../README.md)

***

[Home](../README.md) / LivestreamRoute

# Type Alias: LivestreamRoute

```ts
type LivestreamRoute = "direct" | "preferDirect" | "proxied";
```

How a livestream reaches the controller. One negotiation answers both of a livestream's addresses, so the route is a dial choice over that one negotiation:

- `"proxied"`, the default, dials the controller authority under the UniFi OS proxy, carrying the session's auth headers and verifying the certificate as
  `verifyTls` says.
- `"direct"` dials the controller's media server at the authority's hostname and the port the controller minted, skipping the UniFi OS proxy and Protect's bridge.
  The minted alias in its path is its only credential, so it carries no session header, and it never verifies the media server's self-signed certificate, whatever
  `verifyTls` says. A negotiation that offers no direct address ends the stream with [ProtectLivestreamRouteError](../classes/ProtectLivestreamRouteError.md).
- `"preferDirect"` dials direct first each time the stream establishes or recovers, and once the direct route itself fails - a direct dial refused, reset or
  left unanswered, a direct socket that opens and sends no media, or a negotiation that offers no direct address - it falls back, publishing
  `livestreamRouteFallback` with the reason, and dials proxied until the stream is live again. Every route shares the negotiation, so a failed one moves nothing.
  A stream asking for Opus is the exception to the last case: its proxied route names its stream by the direct address, so a negotiation that offers none ends
  it with [ProtectLivestreamRouteError](../classes/ProtectLivestreamRouteError.md) on every route, this one included, with no fallback.
