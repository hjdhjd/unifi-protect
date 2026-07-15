/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * viewer.ts: The Viewer device projection.
 */
import type { DeviceContext } from "./context.ts";
import { DeviceProjection } from "./device.ts";
import type { ProtectViewerConfig } from "../types/index.ts";
import { deviceSelectors } from "../state/selectors.ts";

/**
 * A viewer projection. Inherits the read-through getters, live `observe`, and write-through `update` from {@link DeviceProjection}; viewer-specific behavior
 * (assigned liveview) is expressed through `update` payloads.
 *
 * @category Devices
 */
export class Viewer extends DeviceProjection<ProtectViewerConfig> {

  readonly modelKey = "viewer";

  constructor(ctx: DeviceContext, id: string) {

    super(ctx, id, deviceSelectors.viewer.byId);
  }
}
