[**unifi-protect**](../README.md)

***

[Home](../README.md) / LivestreamOptions

# Interface: LivestreamOptions

Options for [Camera.livestream](Camera.md#livestream) - the stream-affecting `source` selector (a quality channel or a secondary lens) and tuning (segment length, chunk size, opt-in
timestamps) without `cameraId` (the camera supplies its own id), plus the per-subscription [LivestreamSubscribeOptions](LivestreamSubscribeOptions.md) (an abort signal that disposes the
returned subscription, an `urgency` closure feeding the pool's resilient recovery, and `discardOnDispose`).

## Extends

- `Omit`\<`LivestreamSpec`, `"cameraId"`\>.[`LivestreamSubscribeOptions`](LivestreamSubscribeOptions.md)

## Properties

| Property | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="chunksize"></a> `chunkSize?` | `number` | Optional maximum WebSocket payload size, in bytes. Larger means lower fragmentation, higher per-frame latency. Default `PROTECT_LIVESTREAM_CHUNK_SIZE` (4096). | `Omit.chunkSize` |
| <a id="discardondispose"></a> `discardOnDispose?` | `boolean` | Discard any still-queued, undelivered segments the instant this subscription is disposed, so a consumer mid-iteration receives the terminal rather than draining stale bytes first. Off by default: a disposed subscription normally drains its queue before ending. Scoped to the consumer's own disposal alone; a pool-forced terminal (codec change, give-up, last-subscriber detach, pool disposal) still drains the queue before the terminal surfaces, exactly as it does without this option. | [`LivestreamSubscribeOptions`](LivestreamSubscribeOptions.md).[`discardOnDispose`](LivestreamSubscribeOptions.md#discardondispose) |
| <a id="requestid"></a> `requestId?` | `string` | Optional request label sent to the controller, surfaced in its logs. Default `${cameraId}-${channel}`. Not part of the pool's sharing identity. | `Omit.requestId` |
| <a id="segmentlength"></a> `segmentLength?` | `number` | Optional fMP4 segment length, in milliseconds. Floored at `PROTECT_LIVESTREAM_SEGMENT_LENGTH` (100), which is also the default. | `Omit.segmentLength` |
| <a id="signal"></a> `signal?` | `AbortSignal` | An abort signal that disposes this subscription (and only this one - a shared session lives as long as any subscriber remains). | [`LivestreamSubscribeOptions`](LivestreamSubscribeOptions.md).[`signal`](LivestreamSubscribeOptions.md#signal) |
| <a id="source"></a> `source?` | [`LivestreamSource`](../type-aliases/LivestreamSource.md) | Which stream to capture. `{ type: "channel", channel }` selects a quality channel (0 is the highest); `{ type: "lens", lens }` selects a secondary lens on a multi-lens device (e.g., a package camera), which the controller always addresses on channel 0. The two selectors are mutually exclusive - modeling them as a discriminated union makes the illegal "channel and lens together" request unrepresentable. Omit `source` for the primary view (channel 0, lens 0). | `Omit.source` |
| <a id="timestamps"></a> `timestamps?` | `boolean` | Optionally request per-segment decode timestamps. When `true`, the negotiation asks the controller for extended metadata and each media segment carries them. | `Omit.timestamps` |
| <a id="urgency"></a> `urgency?` | () => `number` | How many milliseconds this consumer can tolerate receiving no segment, pulled fresh at each decision and aggregated across a shared stream by the minimum. It serves consumer-owned policies at once. First, the resilient recovery's await budget self-tunes from the consumer's real buffer headroom: a live view reports ~0 (recover aggressively), a paced recording its cushion, a passive buffer a large value (wait patiently). Second, it is the consumer's MEDIA-stall detection deadline for the pool's always-on (while live) media watchdog: declaring nothing leaves the default 10 s window (every stream is media-watched by default), a tighter value tightens detection (clamped up to a small floor against jitter), and Infinity opts out of media-stall detection entirely (the session's any-byte heartbeat still watches the socket). Omit it to leave the stream maximally patient on recovery and media-watched at the 10 s default. | [`LivestreamSubscribeOptions`](LivestreamSubscribeOptions.md).[`urgency`](LivestreamSubscribeOptions.md#urgency) |
