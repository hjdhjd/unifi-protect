[**unifi-protect**](../README.md)

***

[Home](../README.md) / LivestreamOptions

# Interface: LivestreamOptions

Options for [Camera.livestream](Camera.md#livestream) - the `source` selector (a quality channel or a secondary lens), the tuning (segment length, chunk size, opt-in timestamps),
the `route` the stream is dialed on (`"proxied"` by default, `"direct"` or `"preferDirect"`), the `audio` codec it carries (`"aac"` by default, or `"opus"`) and
the `upstream` it reads (`"ubv"` to read UBV even for AAC), without `cameraId` (the camera supplies its own id) and without `audioExpected` (the camera states
it from its record), plus the per-subscription [LivestreamSubscribeOptions](LivestreamSubscribeOptions.md) (an abort signal that disposes the returned subscription, an `urgency` closure
feeding the pool's resilient recovery, and `discardOnDispose`). The `output` a subscription iterates is named beside these by the overloads of
[Camera.livestream](Camera.md#livestream) and never by this type, so a value typed as it answers segments.

## Extends

- `Omit`\<`LivestreamSpec`, `"audioExpected"` \| `"cameraId"`\>
- [`LivestreamSubscribeOptions`](LivestreamSubscribeOptions.md)

## Properties

| Property | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="audio"></a> `audio?` | [`LivestreamAudioCodec`](../type-aliases/LivestreamAudioCodec.md) | Optional audio codec the stream carries: `"aac"`, the default, or `"opus"`. Protect's own fMP4 carries AAC alone, so a stream asking for Opus reads UBV, on every route: the direct route asks for it in the request, and the proxied route by a play command on its socket. | `Omit.audio` |
| <a id="chunksize"></a> `chunkSize?` | `number` | Optional maximum WebSocket payload size, in bytes. Larger means lower fragmentation, higher per-frame latency. Default `PROTECT_LIVESTREAM_CHUNK_SIZE` (4096). | `Omit.chunkSize` |
| <a id="discardondispose"></a> `discardOnDispose?` | `boolean` | Discard any still-queued, undelivered items the instant this subscription is disposed, so a consumer mid-iteration receives the terminal rather than draining stale bytes first. Off by default: a disposed subscription normally drains its queue before ending. Scoped to the consumer's own disposal alone; a pool-forced terminal (codec change, a missing direct address, another audio codec, a socket that cannot send, give-up, last-subscriber detach, pool disposal) still drains the queue before the terminal surfaces, exactly as it does without this option. | [`LivestreamSubscribeOptions`](LivestreamSubscribeOptions.md).[`discardOnDispose`](LivestreamSubscribeOptions.md#discardondispose) |
| <a id="requestid"></a> `requestId?` | `string` | Optional request label sent to the controller, surfaced in its logs. Default `${cameraId}-${channel}`. Not part of the pool's sharing identity. | `Omit.requestId` |
| <a id="route"></a> `route?` | [`LivestreamRoute`](../type-aliases/LivestreamRoute.md) | Optional route the stream is dialed on: `"proxied"` (the default) through the UniFi OS proxy, `"direct"` to the controller's media server, or `"preferDirect"`, direct with the proxy behind it. See [LivestreamRoute](../type-aliases/LivestreamRoute.md): a direct dial carries no session header and never verifies the media server's certificate. | `Omit.route` |
| <a id="segmentlength"></a> `segmentLength?` | `number` | Optional fMP4 segment length, in milliseconds, which the controller writes to on Protect's own fMP4 and the library on UBV. Floored at `PROTECT_LIVESTREAM_SEGMENT_LENGTH` (100), which is also the default. A stream reading UBV refuses a length that is not a finite number of milliseconds with `ProtectProtocolError`. | `Omit.segmentLength` |
| <a id="signal"></a> `signal?` | `AbortSignal` | An abort signal that disposes this subscription (and only this one - a shared session lives as long as any subscriber remains), or, when it has already aborted, makes `subscribe` return one that is already disposed and joined no shared stream. | [`LivestreamSubscribeOptions`](LivestreamSubscribeOptions.md).[`signal`](LivestreamSubscribeOptions.md#signal) |
| <a id="source"></a> `source?` | [`LivestreamSource`](../type-aliases/LivestreamSource.md) | Which stream to capture. `{ type: "channel", channel }` selects a quality channel (0 is the highest); `{ type: "lens", lens }` selects a secondary lens on a multi-lens device (e.g., a package camera), which the controller always addresses on channel 0. The selectors are mutually exclusive - modeling them as a discriminated union makes the illegal "channel and lens together" request unrepresentable. Omit `source` for the primary view (channel 0, lens 0). | `Omit.source` |
| <a id="timestamps"></a> `timestamps?` | `boolean` | Optionally request per-segment decode timestamps, Protect's own fMP4 metadata. When `true`, the negotiation asks the controller for extended metadata and each media segment of Protect's own fMP4 carries them. A UBV stream does not carry them, so its segments carry none whatever this says. | `Omit.timestamps` |
| <a id="upstream"></a> `upstream?` | `"ubv"` | Optional upstream the stream is read from: `"ubv"` reads Ubiquiti's UBV record stream even for AAC. Left out, a stream asking for Opus reads UBV and any other reads Protect's own fMP4. | `Omit.upstream` |
| <a id="urgency"></a> `urgency?` | () => `number` | How many milliseconds this consumer can tolerate receiving no segment, pulled fresh at each decision and aggregated across a shared stream by the minimum. It serves each consumer-owned policy from one closure. First, the resilient recovery's await budget self-tunes from the consumer's real buffer headroom: a live view reports ~0 (recover aggressively), a paced recording its cushion, a passive buffer a large value (wait patiently). Second, it is the consumer's MEDIA-stall detection deadline for the pool's always-on (while live) media watchdog: declaring nothing leaves `PROTECT_LIVESTREAM_STALL_DEFAULT_MS` (the default media-stall window, so every stream is media-watched by default), a tighter value tightens detection (clamped up to a small floor against jitter), and Infinity opts out of media-stall detection entirely (the session's any-byte heartbeat still watches the socket). Omit it to leave the stream maximally patient on recovery and media-watched at the default media-stall window. | [`LivestreamSubscribeOptions`](LivestreamSubscribeOptions.md).[`urgency`](LivestreamSubscribeOptions.md#urgency) |
