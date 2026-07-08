[**unifi-protect**](../README.md)

***

[Home](../README.md) / AuthMethod

# Type Alias: AuthMethod

```ts
type AuthMethod = "fingerprint" | "nfc";
```

The authentication method a doorbell [\`authDetected\`](TypedEvent.md) occurrence resolved: a fingerprint match or an NFC card tap. The deliberate counterpoint to
[SmartDetectType](SmartDetectType.md): that one is *open* (`| (string & {})`) because `objectTypes` passes wire-provided detection-class strings through verbatim and must stay
honest against new firmware classes; this one is *closed*, because `method` is not passed through but *computed* by the classifier from the enumerated auth `type`
values via a single map - the library can only ever produce a value it mapped, so a new auth method is an explicit extension of this union and that map together,
never a silent wire passthrough.
