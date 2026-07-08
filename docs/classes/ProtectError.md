[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectError

# Abstract Class: ProtectError

The error model in one sentence: every failure the library raises is a subclass of ProtectError, and the *first* level of the hierarchy answers the only
question a caller universally needs answered - should I retry, or should I propagate?

- [RecoverableError](RecoverableError.md) means the operation could plausibly succeed if retried or deferred (a throttle window, a timeout, a transient network blip, a caller
  abort, a livestream stall). The caller decides the retry policy; the library does not retry user operations on the caller's behalf.
- [FatalError](FatalError.md) means retrying the same call will fail the same way (bad credentials, insufficient privileges, a 4xx/5xx the controller will keep returning,
  a protocol violation, a structural bootstrap failure). The caller should surface or propagate it.

Consumers branch on the abstract base for policy (`if(err instanceof RecoverableError) { defer(); }`) and on the concrete class for specific handling
(`if(err instanceof ProtectThrottledError) { waitFor(err.cooldownMs); }`). This is the Node idiom - a class hierarchy with `instanceof` - chosen deliberately over
a Result/Either return type, because it composes naturally with `try`/`catch`, `await`, and the platform's own error-cause chaining.

Every error chains its underlying `cause` so `resolveErrnoCause` keeps working one hop down the chain (the shape undici raises for connection failures).

## Extends

- `Error`

## Extended by

- [`FatalError`](FatalError.md)
- [`RecoverableError`](RecoverableError.md)
