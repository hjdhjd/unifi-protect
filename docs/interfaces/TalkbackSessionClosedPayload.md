[**unifi-protect**](../README.md)

***

[Home](../README.md) / TalkbackSessionClosedPayload

# Interface: TalkbackSessionClosedPayload

Payload published on [channels.talkbackSessionClosed](../variables/channels.md#property-talkbacksessionclosed). `reason` mirrors a WebSocket close frame's reason when the controller closed the session's WebSocket,
and is the teardown cause otherwise: when the session closed itself, and always for an RTP socket, which has no peer that closes it.

## Properties

| Property | Type |
| ------ | ------ |
| <a id="cameraid"></a> `cameraId` | `string` |
| <a id="reason"></a> `reason` | `string` |
