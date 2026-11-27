[**unifi-protect**](../README.md)

***

[Home](../README.md) / TalkbackAudioCodec

# Type Alias: TalkbackAudioCodec

```ts
type TalkbackAudioCodec = "aac" | "opus";
```

The audio codecs a camera takes talkback in: `"aac"`, an ADTS stream relayed through the controller, and `"opus"`, Opus packets sent straight to the camera. The
set is the talkback channel's own, independent of [LivestreamAudioCodec](LivestreamAudioCodec.md), which names what a livestream carries from the camera.
