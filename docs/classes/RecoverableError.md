[**unifi-protect**](../README.md)

***

[Home](../README.md) / RecoverableError

# Abstract Class: RecoverableError

Abstract base for failures the caller may retry or defer. The library never retries the caller's operation itself - it classifies the failure as recoverable and
returns control so the caller can apply its own backoff, escalation, or alternative-path policy.

## Extends

- [`ProtectError`](ProtectError.md)

## Extended by

- [`ProtectAbortedError`](ProtectAbortedError.md)
- [`ProtectNetworkError`](ProtectNetworkError.md)
- [`ProtectStallError`](ProtectStallError.md)
- [`ProtectThrottledError`](ProtectThrottledError.md)
- [`ProtectTimeoutError`](ProtectTimeoutError.md)
