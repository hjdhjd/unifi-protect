[**unifi-protect**](../README.md)

***

[Home](../README.md) / StateStore

# Interface: StateStore

The canonical state holder. See the module doc for the model. Constructed by `ProtectClient.connect()`; consumers read it as `client.state`. The one documented
exception is [createStateStore](../functions/createStateStore.md), the test-construction factory a harness uses to drive the real engine standalone.

## Implements

- `AsyncDisposable`

## Methods

### \[asyncDispose\]()

```ts
asyncDispose: Promise<void>;
```

Stop the refresh failsafe and terminate every open observer. Safe to call more than once.

#### Returns

`Promise`\<`void`\>

#### Implementation of

```ts
AsyncDisposable.[asyncDispose]
```

***

### observe()

```ts
observe<T>(selector, opts?): AsyncGenerator<T>;
```

Observe a selector over the state. The returned async iterable yields the selector's output once at every point the value *changes* by reference, and never on a
dispatch that left the value unchanged. Pair it with [StateStore.snapshot](#snapshot) for the current value: snapshot for "what is it now", observe for "tell me when
it changes".

Termination: pass `opts.signal` to end the iteration (the iterator returns cleanly on abort), or simply `break` out of the `for await` - either path unregisters
the observer. An already-aborted signal yields nothing.

#### Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| `T` | The selector's output type. |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `selector` | (`state`) => `T` | A pure function from state to the value of interest. Use the memoized selectors in `state/selectors.ts` so unchanged collections compare equal. |
| `opts` | \{ `signal?`: `AbortSignal`; \} | Optional abort signal that terminates the iteration. |
| `opts.signal?` | `AbortSignal` | - |

#### Returns

`AsyncGenerator`\<`T`\>

An async iterable of the selector's value at each change.

***

### snapshot()

```ts
snapshot(): ProtectState;
```

The current state. Synchronous and reference-stable between dispatches - safe to read on a hot path and to compare with `Object.is`.

#### Returns

[`ProtectState`](../type-aliases/ProtectState.md)

The current [ProtectState](../type-aliases/ProtectState.md).
