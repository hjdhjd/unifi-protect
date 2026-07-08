[**unifi-protect**](../README.md)

***

[Home](../README.md) / HttpRequestEndPayload

# Interface: HttpRequestEndPayload

Payload published on [channels.httpRequestEnd](../variables/channels.md#property-httprequestend). `error` is present only when the request failed; `statusCode` is absent when the failure was transport-level (no
response was received).

## Properties

| Property | Type |
| ------ | ------ |
| <a id="durationms"></a> `durationMs` | `number` |
| <a id="error"></a> `error?` | `string` |
| <a id="method"></a> `method` | `string` |
| <a id="requestid"></a> `requestId` | `string` |
| <a id="statuscode"></a> `statusCode?` | `number` |
| <a id="url"></a> `url` | `string` |
