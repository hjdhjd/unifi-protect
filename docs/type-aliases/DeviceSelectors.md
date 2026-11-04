[**unifi-protect**](../README.md)

***

[Home](../README.md) / DeviceSelectors

# Type Alias: DeviceSelectors

```ts
type DeviceSelectors = { readonly [K in DeviceCollectionKey]: CollectionSelectors<ProtectDeviceConfigMap[K]> };
```

The category-keyed selector catalog: one [CollectionSelectors](../interfaces/CollectionSelectors.md) quartet per [DeviceCollectionKey](DeviceCollectionKey.md), each exactly typed to its category's config record. The
single surface a consumer reaches every device collection's selectors through - `client.state.selectors.camera.all`, `client.state.selectors[key].byId(id)`, and the
rest - so the map-identity and content-memoization regimes this module documents reach every category through one entry rather than a flat export per category. The
mapped type holds each entry to its own config record, so `selectors.camera.all` returns `readonly ProtectCameraConfig[]` while generic iteration over the key set
stays fully typed.
