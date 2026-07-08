[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectWebSocket

# Interface: ProtectWebSocket

The minimal *receive-direction* WebSocket surface the library's read-only transports (the events stream and each livestream session) consume - deliberately a small
subset of the WHATWG/undici `WebSocket` so the dependency is exactly what they need and a test fake is trivial to implement. The default factories adapt undici's
`WebSocket` to this shape (it satisfies the surface structurally, so no cast is required). This lives in one module, not on any one transport, so every consumer shares
a single definition and a test fake written against it drives any of them.

The send-direction transport (the [TalkbackSession](TalkbackSession.md)) is write-only and reads nothing inbound, so it depends on the separate, equally minimal
`ProtectWritableWebSocket` below rather than this one - the seam is split by direction so neither interface carries a method its consumers never call.

## Properties

| Property | Type |
| ------ | ------ |
| <a id="binarytype"></a> `binaryType` | `"arraybuffer"` \| `"blob"` |

## Methods

### addEventListener()

#### Call Signature

```ts
addEventListener(
   type, 
   listener, 
   options?): void;
```

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `type` | `"open"` |
| `listener` | () => `void` |
| `options?` | `ProtectWebSocketListenerOptions` |

##### Returns

`void`

#### Call Signature

```ts
addEventListener(
   type, 
   listener, 
   options?): void;
```

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `type` | `"message"` |
| `listener` | (`event`) => `void` |
| `options?` | `ProtectWebSocketListenerOptions` |

##### Returns

`void`

#### Call Signature

```ts
addEventListener(
   type, 
   listener, 
   options?): void;
```

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `type` | `"close"` |
| `listener` | (`event`) => `void` |
| `options?` | `ProtectWebSocketListenerOptions` |

##### Returns

`void`

#### Call Signature

```ts
addEventListener(
   type, 
   listener, 
   options?): void;
```

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `type` | `"error"` |
| `listener` | (`event`) => `void` |
| `options?` | `ProtectWebSocketListenerOptions` |

##### Returns

`void`

***

### close()

```ts
close(): void;
```

#### Returns

`void`
