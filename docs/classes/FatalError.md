[**unifi-protect**](../README.md)

***

[Home](../README.md) / FatalError

# Abstract Class: FatalError

Abstract base for failures the caller should propagate. Retrying the identical call will reproduce the identical failure, so the correct response is to surface it.
The exception is a [ProtectRequestError](ProtectRequestError.md) carrying a status in the transport's retried set or a 429, which is the controller's readiness answer or its rate
limit rather than a verdict on the call, and which a later retry can clear.

## Extends

- [`ProtectError`](ProtectError.md)

## Extended by

- [`ProtectAuthError`](ProtectAuthError.md)
- [`ProtectAuthorizationError`](ProtectAuthorizationError.md)
- [`ProtectBootstrapError`](ProtectBootstrapError.md)
- [`ProtectCodecChangeError`](ProtectCodecChangeError.md)
- [`ProtectConfigurationError`](ProtectConfigurationError.md)
- [`ProtectLivestreamUnavailableError`](ProtectLivestreamUnavailableError.md)
- [`ProtectProtocolError`](ProtectProtocolError.md)
- [`ProtectRequestError`](ProtectRequestError.md)
- [`ProtectUnsupportedError`](ProtectUnsupportedError.md)
