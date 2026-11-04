[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectBootstrapStage

# Type Alias: ProtectBootstrapStage

```ts
type ProtectBootstrapStage = "apply" | "fetch" | "login" | "parse" | "subscribe";
```

The stages of the `connect()` sequence, used to tag a [ProtectBootstrapError](../classes/ProtectBootstrapError.md). The sequence authenticates, fetches the bootstrap document, parses it, applies
it, then subscribes to the realtime stream; only the fetch, parse and apply stages are wrapped as a bootstrap error. A login failure already propagates as its own
typed error - `ProtectAuthError` (fatal) when the controller rejected the sign-in, `ProtectRequestError` (fatal) when it answered with a status that is no verdict on
the credentials - and a reachability failure as `ProtectNetworkError` (recoverable). A failure to open the realtime subscription propagates unwrapped rather than
tagged with any stage, so `"login"` and `"subscribe"` name stages of the sequence without either one being a tag a caller will observe on a thrown
`ProtectBootstrapError`.
