/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * sensor.ts: The Sensor device projection.
 */
import type { DeviceContext } from "./context.ts";
import { DeviceProjection } from "./device.ts";
import type { ProtectSensorConfig } from "../types/index.ts";

/**
 * A sensor projection. Inherits the read-through getters, live `observe`, and write-through `update` / `reboot` from {@link DeviceProjection}; sensor-specific
 * behavior (sensitivity, mount type, thresholds) is expressed through `update` payloads.
 *
 * @category Devices
 */
export class Sensor extends DeviceProjection<ProtectSensorConfig> {

  readonly modelKey = "sensor";

  constructor(ctx: DeviceContext, id: string) {

    super(ctx, id, ctx.store.selectors.sensor.byId);
  }
}
