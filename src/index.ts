/* Copyright(C) 2019-2024, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * index.ts: UniFi Protect API registration.
 */
/** @internal */
export * from "./protect-api.js";
export type { ProtectLivestream } from "./protect-api-livestream.js";
export { ProtectApiEvents, ProtectEventPacket } from "./protect-api-events.js";
export * from "./protect-logging.js";
export * from "./protect-types.js";
export { FetchError } from "@adobe/fetch";
export * from "./util";
