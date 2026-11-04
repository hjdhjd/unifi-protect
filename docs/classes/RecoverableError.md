[**unifi-protect**](../README.md)

***

[Home](../README.md) / RecoverableError

# Abstract Class: RecoverableError

Abstract base for failures the caller may retry or defer. The library classifies the failure as recoverable and returns control so the caller can apply its own
backoff, escalation, or alternative-path policy, and the owned HTTP pool's transparent retries of a transient answer or connection fault are the layer beneath
that policy rather than a part of it.

## Extends

- [`ProtectError`](ProtectError.md)

## Extended by

- [`ProtectAbortedError`](ProtectAbortedError.md)
- [`ProtectNetworkError`](ProtectNetworkError.md)
- [`ProtectStallError`](ProtectStallError.md)
- [`ProtectThrottledError`](ProtectThrottledError.md)
- [`ProtectTimeoutError`](ProtectTimeoutError.md)
