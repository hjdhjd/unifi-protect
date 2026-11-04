[**unifi-protect**](../README.md)

***

[Home](../README.md) / HttpRequestEndPayload

# Interface: HttpRequestEndPayload

Payload published on [channels.httpRequestEnd](../variables/channels.md#property-httprequestend). `statusCode` is present when a response was received and read to its end, whatever its status, and `error`
otherwise: the request failed at the transport level, before or while its response was read, or its caller cancelled it, which `cancelled` marks.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="cancelled"></a> `cancelled?` | `true` | Present, and `true`, only when the request ended because its caller chose to cancel it, so a consumer tells a cancel from a failure without reading the message. |
| <a id="durationms"></a> `durationMs` | `number` | - |
| <a id="error"></a> `error?` | `string` | - |
| <a id="host"></a> `host` | `string` | The controller address this client was built against, verbatim as supplied to `ProtectClient.connect()`. The structured identity that scopes a payload to one controller on the process-global diagnostics channel, mirroring `cameraId` on the livestream payloads. |
| <a id="method"></a> `method` | `string` | - |
| <a id="requestid"></a> `requestId` | `string` | - |
| <a id="statuscode"></a> `statusCode?` | `number` | - |
| <a id="url"></a> `url` | `string` | - |
