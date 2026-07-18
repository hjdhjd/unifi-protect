[**unifi-protect**](../README.md)

***

[Home](../README.md) / CollectionSelectors

# Interface: CollectionSelectors\<T\>

The selectors every *device* collection exposes: the [CollectionViews](CollectionViews.md) pair (records, memoized on map identity), the connected-only subset, and the
content-memoized set of ids adopted by this controller - the membership set a reactive consumer observes to react to devices being adopted or removed without waking on
every config patch. See `memoizeArrayByContent` for the content-vs-identity memoization distinction `adoptedIds` rests on.

## Extends

- [`CollectionViews`](CollectionViews.md)\<`T`\>

## Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| `T` | The collection's config record type. |

## Properties

| Property | Type | Inherited from |
| ------ | ------ | ------ |
| <a id="adoptedids"></a> `adoptedIds` | (`state`) => readonly `string`[] | - |
| <a id="all"></a> `all` | (`state`) => readonly `T`[] | [`CollectionViews`](CollectionViews.md).[`all`](CollectionViews.md#all) |
| <a id="byid"></a> `byId` | (`id`) => (`state`) => `T` \| `undefined` | [`CollectionViews`](CollectionViews.md).[`byId`](CollectionViews.md#byid) |
| <a id="online"></a> `online` | (`state`) => readonly `T`[] | - |
