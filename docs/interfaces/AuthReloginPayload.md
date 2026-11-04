[**unifi-protect**](../README.md)

***

[Home](../README.md) / AuthReloginPayload

# Interface: AuthReloginPayload

Payload published on [channels.authRelogin](../variables/channels.md#property-authrelogin). `success` is `true` when the relogin re-established the session, and `false` when it did not: the controller
refused the sign-in or accepted it without a complete session, no credentials were retained, the session was ended or replaced while the relogin ran, or the
handshake failed on anything else, a failure the request that triggered the relogin then throws.

## Properties

| Property | Type |
| ------ | ------ |
| <a id="success"></a> `success` | `boolean` |
