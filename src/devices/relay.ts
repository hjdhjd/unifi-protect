/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * relay.ts: The Relay device projection.
 */
import type { DeviceContext } from "./context.ts";
import { DeviceProjection } from "./device.ts";
import type { ProtectRelayConfig } from "../types/index.ts";
import { selectRelay } from "../state/selectors.ts";

/**
 * A relay projection. Inherits the read-through getters, live `observe`, and write-through `update` / `reboot` from {@link DeviceProjection}, and adds the one
 * relay-specific command: {@link Relay.toggleOutput}, the faithful primitive over the controller's per-output activate endpoint.
 *
 * @category Devices
 */
export class Relay extends DeviceProjection<ProtectRelayConfig> {

  readonly modelKey = "relay";

  constructor(ctx: DeviceContext, id: string) {

    super(ctx, id, selectRelay);
  }

  /**
   * Toggle one of the relay's outputs. The controller exposes a single latching toggle per output: each call flips that output's `state` (off becomes on, on becomes off)
   * - there is no momentary pulse and no separate "set on/off". Write-through, like every device command: the projection reflects the new state once the realtime stream
   * (or the next refresh) delivers the broadcast `outputs[]` update, so a consumer `observe()`s the change rather than reading it back. The output id is not
   * pre-validated here - an unknown id surfaces as the controller's classified {@link FatalError}, consistent with the write-through, controller-as-authority grain.
   *
   * @param outputId - The numeric id of the output to toggle (as reported on each `outputs[]` entry).
   * @param opts     - Optional abort signal.
   *
   * @throws The classified `FatalError` on a non-2xx (e.g., an unknown output id), or a transport-level `ProtectError` on failure.
   */
  async toggleOutput(outputId: number, opts: { signal?: AbortSignal } = {}): Promise<void> {

    await this.dispatch("/outputs/" + outputId.toString() + "/activate", { signal: opts.signal });
  }
}
