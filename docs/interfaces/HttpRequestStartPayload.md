[**unifi-protect**](../README.md)

***

[Home](../README.md) / HttpRequestStartPayload

# Interface: HttpRequestStartPayload

Payload published on [channels.httpRequestStart](../variables/channels.md#property-httprequeststart). `requestId` correlates the start with its matching [HttpRequestEndPayload](HttpRequestEndPayload.md).

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="host"></a> `host` | `string` | The controller address this client was built against, verbatim as supplied to `ProtectClient.connect()`. The structured identity that scopes a payload to one controller on the process-global diagnostics channel, mirroring `cameraId` on the livestream payloads. |
| <a id="method"></a> `method` | `string` | - |
| <a id="requestid"></a> `requestId` | `string` | - |
| <a id="url"></a> `url` | `string` | - |
