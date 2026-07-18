[**unifi-protect**](../README.md)

***

[Home](../README.md) / CollectionViews

# Interface: CollectionViews\<T\>

The base pair of selectors every id-keyed collection exposes: the full array (memoized on the backing map's identity) and an O(1) by-id lookup.

## Extended by

- [`CollectionSelectors`](CollectionSelectors.md)

## Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| `T` | The collection's config record type. |

## Properties

| Property | Type |
| ------ | ------ |
| <a id="all"></a> `all` | (`state`) => readonly `T`[] |
| <a id="byid"></a> `byId` | (`id`) => (`state`) => `T` \| `undefined` |
