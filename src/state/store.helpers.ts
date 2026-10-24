/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * store.helpers.ts: Test-only builders for the StateStore, shared by the suites that drive a store directly rather than through a client.
 *
 * A builder lives here rather than in a suite because more than one suite needs the same store: the store's own suite exercises dispatch and observe in isolation,
 * and the device suite backs its projections with a real store seeded by an explicit dispatch. The helper is specific to the store, so it sits beside the store as
 * the cross-cutting helpers' placement rule asks, and it is excluded from the build emit by the helpers exclude pattern in tsconfig.build.json.
 */
import type { ProtectLogging } from "../logging.ts";
import { StateStore } from "./store.ts";
import { fakeClock } from "../testing.helpers.ts";

/**
 * Build a store with the refresh failsafe disabled - the common shape for a test that exercises dispatch and observe in isolation, or that drives state through
 * explicit dispatch alone. The refresh hook is never invoked, so it rejects to make an accidental call loud.
 *
 * @param options     - The store's optional collaborators.
 * @param options.log - The logger the store writes to. Defaults to the store's own silent logger.
 *
 * @returns a store on a fake clock whose refresh failsafe never runs.
 */
export function plainStore({ log }: { log?: ProtectLogging } = {}): StateStore {

  return new StateStore({ clock: fakeClock(), log, refresh: () => Promise.reject(new Error("the refresh hook must not be called when the failsafe is disabled")),
    refreshIntervalMs: false });
}
