[**unifi-protect**](../README.md)

***

[Home](../README.md) / PlaySpeakerOptions

# Interface: PlaySpeakerOptions

Options for [Chime.playSpeaker](Chime.md#playspeaker). Every field is optional. The ringtone/playback fields (`repeatTimes`, `ringtoneId`, `volume`) map 1:1 to the controller's
`play-speaker` payload: omit all of them to play the chime's default assigned ringtone at the controller's chosen repeat count and volume, or supply any subset to
select a specific ringtone and/or override its playback. `signal` is the client-side abort signal for the request and is never sent to the controller.

To play a ringtone *the way it is configured* (the per-ringtone `repeatTimes`/`volume` stored in the chime's `ringSettings`), join those values yourself from the
read-through `chime.config.ringSettings` and pass them here. That join is deliberately
left to the consumer: `ringSettings` is keyed by `(cameraId, ringtoneId)`, so which entry to match and what to fall back to are policy decisions the library does not
make on the caller's behalf, and a command that read state internally would be a second, invisible reader of `ringSettings`.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="repeattimes"></a> `repeatTimes?` | `number` | How many times to repeat the ringtone. Omit to let the controller use its default for the selected ringtone. |
| <a id="ringtoneid"></a> `ringtoneId?` | `string` | The id of the ringtone to play (from the controller's `ringtones` list). Omit to play the chime's default assigned ringtone. |
| <a id="signal"></a> `signal?` | `AbortSignal` | - |
| <a id="volume"></a> `volume?` | `number` | The playback volume, 0-100. Omit to let the controller use its default for the selected ringtone. |
