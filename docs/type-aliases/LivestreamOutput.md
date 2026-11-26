[**unifi-protect**](../README.md)

***

[Home](../README.md) / LivestreamOutput

# Type Alias: LivestreamOutput

```ts
type LivestreamOutput = "frames" | "segments";
```

What a subscription iterates: `"segments"`, the default, the stream's fMP4 initialization and media segments, or `"frames"`, the media frames a UBV stream
carries, each a [LivestreamFrame](LivestreamFrame.md) as the camera sent it. A frames subscription reads UBV whatever its spec names, so it shares a stream with the segments
subscribers that read UBV with the same audio, and the output itself never joins the stream's identity. It is named by the overloads of `LivestreamPool.subscribe`
and [Camera.livestream](../interfaces/Camera.md#livestream) beside the shared option types, so a value typed as those keeps answering segments.
