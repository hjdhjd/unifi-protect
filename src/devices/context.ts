/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * context.ts: The narrow, package-internal dependency surface a device projection needs from the client.
 */
import type { LivestreamPool } from "../client/livestream-pool.ts";
import type { ProtectLogging } from "../logging.ts";
import type { StateStore } from "../state/store.ts";
import type { TalkbackSession } from "../transport/talkback-session.ts";
import type { Transport } from "../transport/http.ts";

/**
 * The package-internal surface a device projection (and the {@link DeviceRegistry}) depends on, supplied by the client at the composition root. It is deliberately
 * narrow, so a projection couples to exactly what it needs and nothing of the full `ProtectClient` surface leaks into Layer 3's device classes. Tests build a tiny fake
 * context rather than a whole client.
 *
 * A projection reads its config through `store` (snapshot for sync getters, observe for the change stream) and issues its write-through commands through `transport`. It
 * never holds device state of its own - it is a live view over the single source of truth.
 *
 * The `livestreamPool` and `talkback` members are the binary-channel seams the composition root binds: a projection reaches the shared livestream pool through the
 * former and opens a per-call talkback session through the latter, in both cases passing only its own id while the WebSocket wire knowledge stays in Layer 2. `talkback`
 * is a factory (not a pool) because talkback is exclusive and per-call - each invocation mints an independent {@link TalkbackSession} - and it returns a `Promise`
 * because the session connects atomically (ready or throws), where `livestreamPool.subscribe` returns synchronously because the pool registers a subscription eagerly for
 * sharing.
 *
 * @category Devices
 */
export interface DeviceContext {

  readonly host: string;
  readonly livestreamPool: LivestreamPool;
  readonly log: ProtectLogging;
  readonly store: StateStore;
  readonly talkback: (params: { cameraId: string }, opts?: { signal?: AbortSignal }) => Promise<TalkbackSession>;
  readonly transport: Transport;
}
