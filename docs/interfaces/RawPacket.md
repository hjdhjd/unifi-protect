[**unifi-protect**](../README.md)

***

[Home](../README.md) / RawPacket

# Interface: RawPacket

The decoded, still-untyped form of a realtime-events packet: the validated action [ProtectEventHeader](ProtectEventHeader.md) and the raw data-frame payload. The payload is
`unknown` because the data frame may be parsed JSON (the dominant case), a UTF-8 string, or a raw `Buffer`; interpreting it is the classifier's job, not the codec's.
It is the element type of the raw firehose (`client.rawPackets()`) and the input/output of the static `ProtectClient.decodePacket` / `ProtectClient.classifyPacket`.

## Properties

| Property | Type |
| ------ | ------ |
| <a id="header"></a> `header` | [`ProtectEventHeader`](ProtectEventHeader.md) |
| <a id="payload"></a> `payload` | `unknown` |
