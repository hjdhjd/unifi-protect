[**unifi-protect**](../README.md)

***

[Home](../README.md) / LivestreamSessionOpenedPayload

# Interface: LivestreamSessionOpenedPayload

Payload published on [channels.livestreamSessionOpened](../variables/channels.md#property-livestreamsessionopened). `key` is the pool's stream-affecting sharing key
`${cameraId}:${channel}:${lens}:${segmentLength}:${chunkSize}:${timestamps}` (the resolved stream-affecting identity).

## Properties

| Property | Type |
| ------ | ------ |
| <a id="cameraid"></a> `cameraId` | `string` |
| <a id="channel"></a> `channel` | `number` |
| <a id="key"></a> `key` | `string` |
| <a id="lens"></a> `lens?` | `number` |
