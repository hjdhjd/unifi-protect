[**unifi-protect**](../README.md)

***

[Home](../README.md) / LivestreamFrame

# Type Alias: LivestreamFrame

```ts
type LivestreamFrame = MediaFrame & {
  discontinuity?: true;
};
```

One frame of a livestream's frames output: a media frame a UBV stream carries, video or audio, told apart by `kind`, with its codec, its payload exactly as the
camera sent it (a view of the socket message it arrived in, never a copy), its timestamp in ticks at its `rate` on the camera's own timeline, and on video whether
it is a keyframe. Audio of a codec other than the one the stream asked for never arrives.

`discontinuity` is present (and `true`) only on the first frame delivered after a reconnect, or after an establishing attempt that delivered frames and ended
before its media, and absent otherwise. It marks a gap: the frames the camera sent between the last one delivered and the marked one never arrived, so a consumer
that decodes across frames treats a marked frame as a splice point. The session itself never sets it: the pool stamps it on a copy as it hands the frame out.

## Type Declaration

| Name | Type |
| ------ | ------ |
| `discontinuity?` | `true` |
