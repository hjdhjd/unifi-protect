[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectCertificateError

# Class: ProtectCertificateError

The controller presented a certificate the platform's verification refused. The request path and every socket raise it, so a caller reads one class wherever the
refusal was met, and its sentence names the address that was dialed and the verifier's own reason.

Recoverable, and deliberately so: an operator who installs a certificate the verifier accepts fixes this while the process runs, so the connection monitor keeps
trying on its own cadence and finds the controller answering rather than stopping on a fault it would never retry. Subclassing [ProtectNetworkError](ProtectNetworkError.md) is what
keeps that true without any policy being restated - every reading that treats a reachability failure as recoverable treats this one the same way, and a caller that
wants the certificate case in particular branches on this class.

## Extends

- [`ProtectNetworkError`](ProtectNetworkError.md)

## Constructors

### Constructor

```ts
new ProtectCertificateError(options): ProtectCertificateError;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | \{ `cause`: `unknown`; `host`: `string`; \} |
| `options.cause` | `unknown` |
| `options.host` | `string` |

#### Returns

`ProtectCertificateError`

#### Overrides

[`ProtectNetworkError`](ProtectNetworkError.md).[`constructor`](ProtectNetworkError.md#constructor)

## Properties

| Property | Modifier | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ | ------ |
| <a id="code"></a> `code` | `readonly` | `string` \| `undefined` | The Node errno string (e.g., `"ECONNREFUSED"`, `"ETIMEDOUT"`), when one could be resolved from the cause chain. | [`ProtectNetworkError`](ProtectNetworkError.md).[`code`](ProtectNetworkError.md#code) |
| <a id="host"></a> `host` | `readonly` | `string` | The address that was dialed, exactly as the transport or the socket dialed it: the host and port of the request path's origin, or of the socket's URL, each the controller authority the consumer configured. | - |
