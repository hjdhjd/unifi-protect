/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * fob.ts: The Fob device projection.
 */
import type { DeviceContext } from "./context.ts";
import { DeviceProjection } from "./device.ts";
import type { ProtectFobConfig } from "../types/index.ts";
import { selectFob } from "../state/selectors.ts";

/**
 * A fob projection. Inherits the read-through getters, live `observe`, and write-through `update` / `reboot` from {@link DeviceProjection}. A fob is an input device: its
 * security-action button presses arrive as occurrences on the event firehose, and its away/arm state is read through the device record (`awayState`, `pendingActionType`,
 * `wirelessConnectionState.functionButtonPressedAt`), so it adds no fob-specific commands.
 *
 * @category Devices
 */
export class Fob extends DeviceProjection<ProtectFobConfig> {

  readonly modelKey = "fob";

  constructor(ctx: DeviceContext, id: string) {

    super(ctx, id, selectFob);
  }
}
