[**unifi-protect**](../README.md)

***

[Home](../README.md) / LivestreamSubscribeOptions

# Interface: LivestreamSubscribeOptions

Per-subscription options for `LivestreamPool.subscribe` (reached through the [Camera.livestream](Camera.md#livestream) consumer entry point). All optional: a bare `subscribe(spec)`
is a resilient, drain-on-dispose subscription with no abort wiring and no reported urgency.

## Extended by

- [`LivestreamOptions`](LivestreamOptions.md)

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="discardondispose"></a> `discardOnDispose?` | `boolean` | Discard any still-queued, undelivered segments the instant this subscription is disposed, so a consumer mid-iteration receives the terminal rather than draining stale bytes first. Off by default: a disposed subscription normally drains its queue before ending. Scoped to the consumer's own disposal alone; a pool-forced terminal (codec change, give-up, last-subscriber detach, pool disposal) still drains the queue before the terminal surfaces, exactly as it does without this option. |
| <a id="signal"></a> `signal?` | `AbortSignal` | An abort signal that disposes this subscription (and only this one - a shared session lives as long as any subscriber remains). |
| <a id="urgency"></a> `urgency?` | () => `number` | How many milliseconds this consumer can tolerate receiving no segment, pulled fresh at each decision and aggregated across a shared stream by the minimum. It serves consumer-owned policies at once. First, the resilient recovery's await budget self-tunes from the consumer's real buffer headroom: a live view reports ~0 (recover aggressively), a paced recording its cushion, a passive buffer a large value (wait patiently). Second, it is the consumer's MEDIA-stall detection deadline for the pool's always-on (while live) media watchdog: declaring nothing leaves the default 10 s window (every stream is media-watched by default), a tighter value tightens detection (clamped up to a small floor against jitter), and Infinity opts out of media-stall detection entirely (the session's any-byte heartbeat still watches the socket). Omit it to leave the stream maximally patient on recovery and media-watched at the 10 s default. |
