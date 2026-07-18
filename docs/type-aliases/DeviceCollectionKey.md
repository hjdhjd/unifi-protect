[**unifi-protect**](../README.md)

***

[Home](../README.md) / DeviceCollectionKey

# Type Alias: DeviceCollectionKey

```ts
type DeviceCollectionKey = typeof DEVICE_COLLECTION_KEYS[number];
```

The id-keyed device collections - every `DeviceModelKey` except the NVR singleton. The vocabulary the device selectors, the projections, and every per-category
consumer iterate over; the innermost tier of the modelKey taxonomy.
