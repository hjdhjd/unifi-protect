[**unifi-protect**](../README.md)

***

[Home](../README.md) / AnyProtectDiagnosticsChannel

# Type Alias: AnyProtectDiagnosticsChannel

```ts
type AnyProtectDiagnosticsChannel = typeof channels[keyof typeof channels];
```

The element type of a subscription that spans channels carrying different payloads - the union of every channel in [channels](../variables/channels.md).

A generic observer (a feed that renders whatever arrives, a census that counts which channels fired) holds channels of mixed payload types in one array and attaches
an `unknown`-taking handler to each; this is that array's element type.

Subscribing is the supported direction. Publishing through the union is not: a parameter position combines across a union rather than distributing over it, so
`publish` there demands a value satisfying every payload shape at once, which no real payload does. Publish through the concrete channel from [channels](../variables/channels.md).
