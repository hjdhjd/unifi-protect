[**unifi-protect**](../README.md)

***

[Home](../README.md) / TransportEvents

# Interface: TransportEvents

The events the [Transport](Transport.md) publishes on its three-rail surface. Both are parameterless: a consumer that needs the cooldown duration reads it from the
[ProtectThrottledError](../classes/ProtectThrottledError.md) thrown by `send`, and a consumer that needs richer detail subscribes to the `unifi-protect:http:throttle:*` diagnostics channels.

## Properties

| Property | Type |
| ------ | ------ |
| <a id="throttleentered"></a> `throttleEntered` | \[\] |
| <a id="throttleexited"></a> `throttleExited` | \[\] |
