[**unifi-protect**](../README.md)

***

[Home](../README.md) / Segment

# Type Alias: Segment

```ts
type Segment = 
  | {
  codec: string;
  data: Buffer;
  type: "init";
}
  | {
  data: Buffer;
  discontinuity?: true;
  mdat: Buffer;
  moof: Buffer;
  timestamps?: number[];
  type: "media";
};
```

One segment of a livestream, in CMAF/DASH vocabulary: either the stream's initialization segment or a media segment. Each arm is a complete, decodable unit.

- `init` carries the FTYP+MOOV initialization segment and its RFC 6381 codec descriptor - everything a decoder needs before the media flows.
- `media` carries one complete fMP4 fragment. `moof` and `mdat` are **zero-copy `subarray` views** into `data` (no byte copy), for a consumer that wants the boxes
  at the lowest usable level; carrying a one-buffer-many-views model onto the single yielded item rather than re-emitting the same bytes on separate items.
  `timestamps` is present only when the consumer opted in via the `timestamps` stream option; it is one decode timestamp per frame (faithful to the wire's array,
  not a lossy scalar), and stays within JavaScript's safe-integer range because the session always negotiates `rebaseTimestampsToZero`, which is what makes `number`
  exact here rather than `bigint`. `discontinuity` is present (and `true`) only on the first media segment delivered after a genuine reconnect, and absent otherwise.
  It marks a timeline discontinuity: because the session always negotiates `rebaseTimestampsToZero`, a reconnect restarts the `tfdt` baseMediaDecodeTime near zero - a
  backward jump relative to the prior segments - so a consumer maintaining a decode timeline (an FFmpeg pipe, an MSE-style source buffer) should treat a
  marked segment as a splice point: flush and resume at this clean keyframe. A consumer that does not maintain a cross-segment timeline ignores it. The session itself
  never sets it - a session has no concept of a reconnect; that is the pool's, which stamps the marker as it fans the first post-reconnect media segment.
