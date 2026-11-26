[**unifi-protect**](../README.md)

***

[Home](../README.md) / LivestreamSessionOpenedPayload

# Interface: LivestreamSessionOpenedPayload

Payload published on [channels.livestreamSessionOpened](../variables/channels.md#property-livestreamsessionopened). `key` is the pool's sharing key
`${cameraId}:${channel}:${lens}:${segmentLength}:${chunkSize}:${timestamps}:${route}:${upstream}:${audio}` (every resolved field that changes what the controller
produces or how the pool dials it, the requested route, the upstream the stream reads and the audio codec it asks for among them).

## Properties

| Property | Type |
| ------ | ------ |
| <a id="cameraid"></a> `cameraId` | `string` |
| <a id="channel"></a> `channel` | `number` |
| <a id="key"></a> `key` | `string` |
| <a id="lens"></a> `lens?` | `number` |
