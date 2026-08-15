[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectBootstrapStage

# Type Alias: ProtectBootstrapStage

```ts
type ProtectBootstrapStage = "fetch" | "login" | "parse" | "subscribe";
```

The stages of the `connect()` sequence, used to tag a [ProtectBootstrapError](../classes/ProtectBootstrapError.md). The sequence authenticates, fetches the bootstrap document, parses it, then
subscribes to the realtime stream; only the fetch and parse stages are wrapped as a bootstrap error. A login or reachability failure already propagates as its
own typed fatal (`ProtectAuthError` / `ProtectNetworkError`), and a failure to open the realtime subscription propagates unwrapped rather than tagged with any
stage, so `"login"` and `"subscribe"` name stages of the sequence without either one being a tag a caller will observe on a thrown `ProtectBootstrapError`.
