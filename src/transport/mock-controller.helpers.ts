/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * mock-controller.helpers.ts: Test-only factory wiring an undici MockAgent and a `TestClock` into a Transport, so transport and auth tests exercise the real
 * request path, throttle breaker, deadline, and error classification without a live controller or real-time waits.
 */
import type { Interceptable } from "undici";
import { MockAgent } from "undici";
import type { ProtectLogging } from "../logging.ts";
import { TestClock } from "homebridge-plugin-utils/testing";
import { Transport } from "./http.ts";

/**
 * The bundle a test drives: the agent (for intercept setup and teardown), the interceptable pool bound to the controller origin, the transport under test, the
 * `TestClock` that advances breaker time and fires request deadlines, and the host string for building request URLs.
 */
export interface MockTransport {

  agent: MockAgent;
  clock: TestClock;
  host: string;
  pool: Interceptable;
  transport: Transport;
}

/**
 * Build a Transport backed by a MockAgent and a `TestClock`. Optional dependencies (getAuthHeaders, onUnauthorized, log) are added to the options object only
 * when the caller supplies them, mirroring how every options object in this codebase is built: a key appears only for a value actually given, never as undefined.
 */
export function makeMockTransport(options: {
  getAuthHeaders?: () => Record<string, string>;
  host?: string;
  log?: ProtectLogging;
  onUnauthorized?: (opts: { probe: boolean }) => Promise<boolean>;
} = {}): MockTransport {

  const host = options.host ?? "10.0.0.1";
  const origin = "https://" + host;
  const agent = new MockAgent();

  // Disable real network connections so a request that misses every configured intercept fails immediately instead of silently reaching a live host.
  agent.disableNetConnect();

  const clock = new TestClock();
  const transport = new Transport({

    clock,
    dispatcher: agent,
    host,
    origin,
    ...((options.getAuthHeaders !== undefined) && { getAuthHeaders: options.getAuthHeaders }),
    ...((options.log !== undefined) && { log: options.log }),
    ...((options.onUnauthorized !== undefined) && { onUnauthorized: options.onUnauthorized })
  });

  return { agent, clock, host, pool: agent.get(origin), transport };
}

/**
 * Build a fully-qualified URL for a path on the mock controller's origin, using the same https scheme and host every test's MockAgent pool is scoped to in
 * {@link makeMockTransport}, so a mismatched scheme or origin never silently misses the intercept.
 */
export function url(host: string, path: string): string {

  return "https://" + host + path;
}
