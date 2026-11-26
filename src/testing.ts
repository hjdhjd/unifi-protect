/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * testing.ts: The unifi-protect/testing entry - the shipped test doubles a consumer's suite drives, published apart from the root entry so no production path reaches
 * them. Each double sits beside the module it stands in for, and only its export path lives here.
 */
export { TestTalkbackFactory, TestTalkbackSocket } from "./talkback/double.ts";
export type { TestTalkbackConnectCall, TestTalkbackSocketOptions } from "./talkback/double.ts";
