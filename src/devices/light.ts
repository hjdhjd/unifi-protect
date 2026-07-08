/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * light.ts: The Light device projection.
 */
import type { DeviceContext } from "./context.ts";
import { DeviceProjection } from "./device.ts";
import type { ProtectLightConfig } from "../types/index.ts";
import { selectLight } from "../state/selectors.ts";

/**
 * A light projection. Inherits the read-through getters, live `observe`, and write-through `update` from {@link DeviceProjection}; light-specific behavior (level,
 * motion activation) is expressed through `update` payloads rather than bespoke methods.
 *
 * @category Devices
 */
export class Light extends DeviceProjection<ProtectLightConfig> {

  readonly modelKey = "light";

  constructor(ctx: DeviceContext, id: string) {

    super(ctx, id, selectLight);
  }
}
