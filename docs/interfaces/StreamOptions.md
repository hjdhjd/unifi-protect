[**unifi-protect**](../README.md)

***

[Home](../README.md) / StreamOptions

# Interface: StreamOptions

Options accepted by the event-bus `stream` rail. Carries the abort signal that terminates the iteration; further keys are reserved for a future backpressure policy.
The default behavior is unbounded, matching the livestream-subscription rule (a subscriber receives every emission until it aborts or stops iterating).

## Properties

| Property | Type |
| ------ | ------ |
| <a id="signal"></a> `signal?` | `AbortSignal` |
