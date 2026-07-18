[**unifi-protect**](../README.md)

***

[Home](../README.md) / HttpRequestEndPayload

# Interface: HttpRequestEndPayload

Payload published on [channels.httpRequestEnd](../variables/channels.md#property-httprequestend). `error` is present only when the request failed; `statusCode` is absent when the failure was transport-level (no
response was received).

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="durationms"></a> `durationMs` | `number` | - |
| <a id="error"></a> `error?` | `string` | - |
| <a id="host"></a> `host` | `string` | The controller address this client was built against, verbatim as supplied to `ProtectClient.connect()`. The structured identity that scopes a payload to one controller on the process-global diagnostics channel, mirroring `cameraId` on the livestream payloads. |
| <a id="method"></a> `method` | `string` | - |
| <a id="requestid"></a> `requestId` | `string` | - |
| <a id="statuscode"></a> `statusCode?` | `number` | - |
| <a id="url"></a> `url` | `string` | - |
