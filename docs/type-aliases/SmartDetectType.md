[**unifi-protect**](../README.md)

***

[Home](../README.md) / SmartDetectType

# Type Alias: SmartDetectType

```ts
type SmartDetectType = 
  | "animal"
  | "face"
  | "licensePlate"
  | "package"
  | "person"
  | "vehicle"
  | string & {
};
```

The known UniFi Protect smart-detection object classes. Modeled as an open union: the listed literals give editor autocomplete and exhaustiveness hints for the
common cases, while the trailing `string` keeps the type honest against firmware that introduces new detection classes the library has not enumerated yet.
