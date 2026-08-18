[**unifi-protect**](../README.md)

***

[Home](../README.md) / ThrottleSource

# Interface: ThrottleSource

The narrow Transport surface the monitor depends on - exactly the throttle verdict and the two throttle rails, nothing more. Expressing the dependency as this
structural type (rather than the concrete [Transport](Transport.md)) is what makes the contract's "narrow coupling to Transport" a compile-time guarantee: the monitor cannot
reach into the transport's request path or breaker internals because the type does not expose them. The concrete `Transport` satisfies this structurally.

## Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="isthrottled"></a> `isThrottled` | `readonly` | `boolean` |

## Methods

### on()

```ts
on(event, handler): Disposable;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `event` | `"throttleEntered"` \| `"throttleExited"` |
| `handler` | () => `void` |

#### Returns

`Disposable`
