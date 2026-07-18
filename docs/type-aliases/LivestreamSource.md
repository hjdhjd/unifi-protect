[**unifi-protect**](../README.md)

***

[Home](../README.md) / LivestreamSource

# Type Alias: LivestreamSource

```ts
type LivestreamSource = 
  | {
  channel: number;
  type: "channel";
}
  | {
  lens: number;
  type: "lens";
};
```

The mutually-exclusive livestream source selector. A livestream is captured EITHER from a quality channel on the primary sensor OR from a secondary lens (which the
controller always addresses on channel 0); the two can never be combined. Tagged (matching [Segment](Segment.md)) so the tag is authoritative regardless
of how the value is built, and so the illegal "a non-zero channel paired with a lens" request is unrepresentable at the type level rather than silently coerced.
