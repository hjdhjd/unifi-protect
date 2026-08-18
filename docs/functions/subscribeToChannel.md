[**unifi-protect**](../README.md)

***

[Home](../README.md) / subscribeToChannel

# Function: subscribeToChannel()

## Call Signature

```ts
function subscribeToChannel<T>(channel, handler): Disposable;
```

Attach `handler` to `channel` and return a `Disposable` that detaches it.

This is the subscription path for the diagnostics rails, mirroring how every other long-lived subscription in the library is expressed: `using sub =
subscribeToChannel(channels.eventsPacket, (payload) => ...)` detaches the handler when the binding leaves scope, so no observer outlives the code that wanted it.
Where a `using` declaration does not fit, call `sub[Symbol.dispose]()` explicitly; disposing twice is safe, because the second detach is a no-op.

Passing a concrete channel types the handler's payload from that channel, so the handler reads its fields directly. Passing an
[AnyProtectDiagnosticsChannel](../type-aliases/AnyProtectDiagnosticsChannel.md) - an element of a mixed-payload array - hands the handler an `unknown` payload instead, which is what a generic observer wants.

### Type Parameters

| Type Parameter |
| ------ |
| `T` |

### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `channel` | [`ProtectDiagnosticsChannel`](../interfaces/ProtectDiagnosticsChannel.md)\<`T`\> | The channel to observe. |
| `handler` | (`payload`) => `void` | Invoked with the published payload on every publication until the returned handle is disposed. |

### Returns

`Disposable`

A `Disposable` that detaches this handler when disposed.

## Call Signature

```ts
function subscribeToChannel(channel, handler): Disposable;
```

Attach `handler` to `channel` and return a `Disposable` that detaches it.

This is the subscription path for the diagnostics rails, mirroring how every other long-lived subscription in the library is expressed: `using sub =
subscribeToChannel(channels.eventsPacket, (payload) => ...)` detaches the handler when the binding leaves scope, so no observer outlives the code that wanted it.
Where a `using` declaration does not fit, call `sub[Symbol.dispose]()` explicitly; disposing twice is safe, because the second detach is a no-op.

Passing a concrete channel types the handler's payload from that channel, so the handler reads its fields directly. Passing an
[AnyProtectDiagnosticsChannel](../type-aliases/AnyProtectDiagnosticsChannel.md) - an element of a mixed-payload array - hands the handler an `unknown` payload instead, which is what a generic observer wants.

### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `channel` | [`AnyProtectDiagnosticsChannel`](../type-aliases/AnyProtectDiagnosticsChannel.md) | The channel to observe. |
| `handler` | (`payload`) => `void` | Invoked with the published payload on every publication until the returned handle is disposed. |

### Returns

`Disposable`

A `Disposable` that detaches this handler when disposed.
