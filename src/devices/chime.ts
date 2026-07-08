/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * chime.ts: The Chime device projection - read-through config plus the chime-specific play commands (speaker, buzzer).
 */
import type { DeviceContext } from "./context.ts";
import { DeviceProjection } from "./device.ts";
import type { ProtectChimeConfig } from "../types/index.ts";
import { selectChime } from "../state/selectors.ts";

/**
 * Options for {@link Chime.playSpeaker}. Every field is optional. The ringtone/playback fields (`repeatTimes`, `ringtoneId`, `volume`) map 1:1 to the controller's
 * `play-speaker` payload: omit all of them to play the chime's default assigned ringtone at the controller's chosen repeat count and volume, or supply any subset to
 * select a specific ringtone and/or override its playback. `signal` is the client-side abort signal for the request and is never sent to the controller.
 *
 * To play a ringtone *the way it is configured* (the per-ringtone `repeatTimes`/`volume` stored in the chime's `ringSettings`), join those values yourself from the
 * read-through `chime.config.ringSettings` and pass them here. That join is deliberately
 * left to the consumer: `ringSettings` is keyed by `(cameraId, ringtoneId)`, so which entry to match and what to fall back to are policy decisions the library does not
 * make on the caller's behalf, and a command that read state internally would be a second, invisible reader of `ringSettings`.
 *
 * @category Devices
 */
export interface PlaySpeakerOptions {

  /** How many times to repeat the ringtone. Omit to let the controller use its default for the selected ringtone. */
  repeatTimes?: number;

  /** The id of the ringtone to play (from the controller's `ringtones` list). Omit to play the chime's default assigned ringtone. */
  ringtoneId?: string;
  signal?: AbortSignal;

  /** The playback volume, 0-100. Omit to let the controller use its default for the selected ringtone. */
  volume?: number;
}

/**
 * A chime projection. Inherits the read-through getters, live `observe`, and write-through `update` from {@link DeviceProjection}; chime *configuration* (default
 * volume, per-camera ringtone assignment) is expressed through `update` payloads, while the things a chime can be told to *do* are first-class commands.
 *
 * The controller exposes each of the chime's sound sources through its own endpoint, so each is a distinct method rather than a single parameterized call:
 * {@link Chime.playSpeaker} plays a ringtone through the speaker, and {@link Chime.playBuzzer} plays the piezo buzzer. None is capability-gated - every chime has them
 * all, and the controller advertises no per-chime flag for any of them - so, like {@link DeviceProjection.reboot}, they are universal operations of the chime class.
 *
 * @category Devices
 */
export class Chime extends DeviceProjection<ProtectChimeConfig> {

  readonly modelKey = "chime";

  constructor(ctx: DeviceContext, id: string) {

    super(ctx, id, selectChime);
  }

  /**
   * Play a ringtone through the chime's speaker. Write-through: the command is issued and the method returns; it does not fold any response into the store. With no
   * options the controller plays the chime's default assigned ringtone; supply {@link PlaySpeakerOptions} to select a specific ringtone or override its playback.
   *
   * @param opts - The ringtone selection and playback overrides, plus an optional abort signal. All fields are optional.
   *
   * @throws The classified `FatalError` on a non-2xx (e.g., {@link ProtectRequestError} when the controller rejects an unknown `ringtoneId`), or a transport-level
   *   `ProtectError` on failure.
   */
  async playSpeaker(opts: PlaySpeakerOptions = {}): Promise<void> {

    const { repeatTimes, ringtoneId, signal, volume } = opts;

    // The payload maps 1:1 to the endpoint: we include only the fields the caller supplied, so an empty options object sends `{}` and the controller plays the chime's
    // default ringtone. We do not read `ringSettings` here - sourcing the configured repeat/volume for a ringtone is a consumer-composed join.
    const payload: { repeatTimes?: number; ringtoneId?: string; volume?: number } = {

      ...((repeatTimes !== undefined) && { repeatTimes }),
      ...((ringtoneId !== undefined) && { ringtoneId }),
      ...((volume !== undefined) && { volume })
    };

    await this.dispatch("/play-speaker", { payload, signal });
  }

  /**
   * Play the chime's buzzer - the simple piezo tone, distinct from a ringtone. The buzzer takes no parameters. Write-through: the command is issued and the method
   * returns; it does not fold any response into the store.
   *
   * @param opts - An optional abort signal.
   *
   * @throws The classified `FatalError` on a non-2xx, or a transport-level `ProtectError` on failure.
   */
  async playBuzzer(opts: { signal?: AbortSignal } = {}): Promise<void> {

    await this.dispatch("/play-buzzer", { signal: opts.signal });
  }
}
