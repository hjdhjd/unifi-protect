[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectBootstrapStage

# Type Alias: ProtectBootstrapStage

```ts
type ProtectBootstrapStage = "fetch" | "login" | "parse" | "subscribe";
```

The stages of the `connect()` sequence, used to discriminate a [ProtectBootstrapError](../classes/ProtectBootstrapError.md). The sequence authenticates, fetches the bootstrap document, parses it,
then subscribes to the realtime stream; only the fetch and parse stages are wrapped as a bootstrap error, because a login or reachability failure already propagates as
its own typed fatal (`ProtectAuthError` / `ProtectNetworkError`).
