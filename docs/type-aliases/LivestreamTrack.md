[**unifi-protect**](../README.md)

***

[Home](../README.md) / LivestreamTrack

# Type Alias: LivestreamTrack

```ts
type LivestreamTrack = 
  | {
  codec: "av1" | "h264" | "h265";
  height: number;
  id: number;
  kind: "video";
  level: number;
  profile: number;
  width: number;
}
  | {
  channels: number;
  codec: "aac" | "opus";
  id: number;
  kind: "audio";
  sampleRate: number;
}
  | {
  codec: "unknown";
  id: number;
  kind: "audio" | "unknown" | "video";
  sampleEntry: string;
};
```

One track of a livestream, told apart by what the reader could read of its sample entry. A video arm carries the coded dimensions and the decoder configuration's
profile and level; an audio arm carries the sample rate it decodes at and its channel count. The unknown arm is a track whose sample entry the reader does not
describe or whose configuration it could not read: it carries the entry's four-character type (empty when the track lists no entry) and the handler's kind. A codec
arm's `kind` is the entry's own, because a video codec is a video track whatever the handler says.
