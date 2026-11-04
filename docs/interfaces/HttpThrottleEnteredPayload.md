[**unifi-protect**](../README.md)

***

[Home](../README.md) / HttpThrottleEnteredPayload

# Interface: HttpThrottleEnteredPayload

Payload published on [channels.httpThrottleEntered](../variables/channels.md#property-httpthrottleentered). `consecutiveFailures` is the count of consecutive requests the controller did not serve (no answer,
a status of 500 or above, or a 429) that tripped the breaker, and `cooldownMs` is how long, in milliseconds, the transport refuses requests before it lets them
through again as recovery probes.

## Properties

| Property | Type |
| ------ | ------ |
| <a id="consecutivefailures"></a> `consecutiveFailures` | `number` |
| <a id="cooldownms"></a> `cooldownMs` | `number` |
