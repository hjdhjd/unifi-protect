[**unifi-protect**](../README.md)

***

[Home](../README.md) / deviceSelectors

# Variable: deviceSelectors

```ts
const deviceSelectors: { readonly [K in DeviceCollectionKey]: CollectionSelectors<ProtectDeviceConfigMap[K]> };
```

The category-keyed selector catalog: one [CollectionSelectors](../interfaces/CollectionSelectors.md) quartet per [DeviceCollectionKey](../type-aliases/DeviceCollectionKey.md), each exactly typed to its category's config record. The
single surface a consumer reaches every device collection's selectors through - `deviceSelectors.camera.all`, `deviceSelectors[key].byId(id)`, and the rest - so the
two memo regimes this module documents (map-identity for the record views, content memoization for `adoptedIds`) reach every category through one entry rather than a
flat export per category. The mapped type pins each entry to its own config record, so `deviceSelectors.camera.all` returns `readonly ProtectCameraConfig[]` while
generic iteration over the key set stays fully typed.
