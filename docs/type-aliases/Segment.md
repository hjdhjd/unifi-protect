[**unifi-protect**](../README.md)

***

[Home](../README.md) / Segment

# Type Alias: Segment

```ts
type Segment = 
  | {
  type: "init";
} & LivestreamInit
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

- `init` carries the FTYP+MOOV initialization segment as one [LivestreamInit](../interfaces/LivestreamInit.md): the stream's RFC 6381 codec label, the init bytes, and the stream's
  description read from them - everything a decoder needs before the media flows. On Protect's own fMP4 the label is the controller's, and on UBV the one the
  library wrote the init under.
- `media` carries one complete fMP4 fragment. `moof` and `mdat` are **zero-copy `subarray` views** into `data` (no byte copy), for a consumer that wants the boxes
  at the lowest usable level; carrying a one-buffer-many-views model onto the single yielded item rather than re-emitting the same bytes on separate items.
  `timestamps` is present only on Protect's own fMP4 when the consumer opted in via `LivestreamSpec`'s `timestamps` field, and never on UBV; it is one decode
  timestamp per frame (faithful to the wire's array, not a lossy scalar), and stays within JavaScript's safe-integer range because the session always negotiates
  `rebaseTimestampsToZero`, which is what makes `number` exact here rather than `bigint`. `discontinuity` is present (and `true`) only on the first media segment
  delivered after a genuine reconnect, and absent otherwise.
  It marks a timeline discontinuity: every session's timeline starts near zero - Protect's own fMP4 is negotiated with `rebaseTimestampsToZero`, and a UBV
  stream's writer counts from its first keyframe - so a reconnect restarts the `tfdt` baseMediaDecodeTime near zero, a
  backward jump relative to the prior segments, and a consumer maintaining a decode timeline (an FFmpeg pipe, an MSE-style source buffer) should treat a
  marked segment as a splice point: flush and resume at this clean keyframe. A consumer that does not maintain a cross-segment timeline ignores it. The session itself
  never sets it - a session has no concept of a reconnect; that is the pool's, which stamps the marker as it fans the first post-reconnect media segment.
