[**unifi-protect**](../README.md)

***

[Home](../README.md) / livestreamAudioSampleRate

# Function: livestreamAudioSampleRate()

```ts
function livestreamAudioSampleRate(camera): 16000 | 48000;
```

The livestream (fMP4) audio sample rate for a camera, in hertz. On the fMP4 livestream, Protect doorbells deliver AAC audio at 48 kHz and every other camera delivers
16 kHz, so this is the single source of that wire fact - a consumer branching on the rate reads it here rather than re-deriving it from the doorbell flag. The scope is
the livestream source rate only: the RTSP transport delivers 48 kHz regardless of camera type, a separate fact this helper deliberately does not model.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `camera` | \{ `featureFlags`: \{ `isDoorbell`: `boolean`; \}; \} | Any camera config (only `featureFlags.isDoorbell` is read). |
| `camera.featureFlags` | \{ `isDoorbell`: `boolean`; \} | - |
| `camera.featureFlags.isDoorbell` | `boolean` | - |

## Returns

`16000` \| `48000`

48000 for a doorbell, 16000 for every other camera.
