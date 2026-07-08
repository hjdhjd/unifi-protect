[**unifi-protect**](../README.md)

***

[Home](../README.md) / FatalError

# Abstract Class: FatalError

Abstract base for failures the caller should propagate. Retrying the identical call will reproduce the identical failure, so the correct response is to surface it.

## Extends

- [`ProtectError`](ProtectError.md)

## Extended by

- [`ProtectAuthError`](ProtectAuthError.md)
- [`ProtectAuthorizationError`](ProtectAuthorizationError.md)
- [`ProtectBootstrapError`](ProtectBootstrapError.md)
- [`ProtectCodecChangeError`](ProtectCodecChangeError.md)
- [`ProtectLivestreamUnavailableError`](ProtectLivestreamUnavailableError.md)
- [`ProtectProtocolError`](ProtectProtocolError.md)
- [`ProtectRequestError`](ProtectRequestError.md)
- [`ProtectUnsupportedError`](ProtectUnsupportedError.md)
