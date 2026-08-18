[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectDiagnosticsChannel

# Interface: ProtectDiagnosticsChannel\<T\>

A diagnostics publisher bound to the payload shape it carries - the typed view of one `node:diagnostics_channel` channel.

The platform's own channel is payload-agnostic: `publish` accepts anything and a subscriber's handler receives `unknown`. Binding the payload type to the channel
instead makes the rail typed from end to end - a publisher cannot send the wrong shape, and a subscriber's handler parameter arrives fully typed, with no cast and no
runtime narrowing to recover what the library already knows. `subscribe` and `unsubscribe` are the primitive pair beneath [subscribeToChannel](../functions/subscribeToChannel.md), which is how a
consumer normally attaches: it returns a `Disposable` and so composes with `using`.

A payload-less channel is declared as `ProtectDiagnosticsChannel<void>`: it publishes with no argument and its handlers take none.

## Type Parameters

| Type Parameter |
| ------ |
| `T` |

## Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="hassubscribers"></a> `hasSubscribers` | `readonly` | `boolean` |
| <a id="name"></a> `name` | `readonly` | `string` \| `symbol` |

## Methods

### publish()

```ts
publish(payload): void;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `payload` | `T` |

#### Returns

`void`

***

### subscribe()

```ts
subscribe(handler): void;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `handler` | (`payload`) => `void` |

#### Returns

`void`

***

### unsubscribe()

```ts
unsubscribe(handler): void;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `handler` | (`payload`) => `void` |

#### Returns

`void`
