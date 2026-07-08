[**unifi-protect**](../README.md)

***

[Home](../README.md) / noopLog

# Variable: noopLog

```ts
const noopLog: ProtectLogging;
```

The default logger every subsystem falls back to when a consumer injects none. It discards every message at every level.

A library should be silent by default - emitting to the console uninvited is surprising output a consumer did not ask for. Consumers that want visibility inject
their own `ProtectLogging` (Homebridge's, Pino, Winston, console); the `ufp` CLI injects a console-backed logger. Defaulting to a no-op rather than `console` keeps
the library quiet in the embedded case while leaving the diagnostics channels (which are always available and zero-cost when unsubscribed) as the richer,
opt-in observability surface.
