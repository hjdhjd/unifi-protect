[**unifi-protect**](../README.md)

***

[Home](../README.md) / StreamOptions

# Interface: StreamOptions

Options accepted by the event-bus `stream` rail: the abort signal that terminates the iteration. The queue is unbounded, matching the livestream-subscription rule (a
subscriber receives every emission until it aborts, stops iterating, or the owner of the events closes).

## Properties

| Property | Type |
| ------ | ------ |
| <a id="signal"></a> `signal?` | `AbortSignal` |
