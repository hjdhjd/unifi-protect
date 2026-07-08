/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * settings.ts: Settings and constants for UniFi Protect.
 */

// Number of API errors to accept before we backoff so we don't slam a Protect controller.
export const PROTECT_API_ERROR_LIMIT = 10;

// Interval, in seconds, to wait before trying to access the API again once we've hit the PROTECT_API_ERROR_LIMIT threshold.
export const PROTECT_API_RETRY_INTERVAL = 300;

// Protect API response timeout, in milliseconds. This should never be greater than 5000 ms.
export const PROTECT_API_TIMEOUT = 3500;

// Bootstrap refresh failsafe interval, in milliseconds. The StateStore re-bootstraps the controller on this cadence because Protect firmware occasionally drops realtime
// events; a periodic full re-bootstrap is the only way to guarantee eventual consistency. The reducer's applyBootstrap reconciliation makes the refresh invisible (zero
// observer notifications) when nothing has actually drifted. This is a permanent contract, not a workaround.
export const PROTECT_BOOTSTRAP_REFRESH_INTERVAL = 120000;

// Events WebSocket watchdog timeout, in milliseconds. If the realtime events stream is silent for longer than this window, the EventStream's watchdog presumes the
// channel dead, emits a ProtectStallError, and tears the socket down; the ConnectionMonitor observes that fault and drives recovery (verify, re-bootstrap, relaunch). The
// threshold is deliberately generous: a healthy controller emits device health telemetry well within this window, so prolonged silence is a strong signal that the stream
// has stalled rather than merely gone quiet.
export const PROTECT_EVENTS_WATCHDOG_TIMEOUT = 300000;

// Connection-recovery backoff, in milliseconds, for the known-reboot track. The ConnectionMonitor enters this track only when a fault follows a self-initiated controller
// reboot (the one case where the cause is certain). It is a return-time-anticipating curve: a controller takes 5-7 minutes to come back, so probing earlier is wasted
// effort that risks hammering a fragile fresh controller. The stages are the delays *before* successive probes - wait 5 minutes, probe, then +2 minutes, probe - after
// which the monitor falls through to the shared steady floor. See the unknown-track curve for the complementary entry point.
export const PROTECT_RECOVERY_BACKOFF_KNOWN_MS = [ 300000, 120000 ];

// Connection-recovery backoff, in milliseconds, for the unknown-unreachable track. The ConnectionMonitor enters this track on any unsolicited fault (a stall, a socket
// drop, a network error - including an autonomous reboot, which at t=0 is indistinguishable from a transient blip). It enters at the short end - probe at once to catch a
// blip in seconds - then walks the delay out toward the steady floor, so an autonomous reboot still recovers within roughly a steady interval of the controller's return.
// The leading zero reproduces "probe immediately on the fault." After these stages the monitor falls through to the shared steady floor.
export const PROTECT_RECOVERY_BACKOFF_UNKNOWN_MS = [ 0, 5000, 15000, 30000 ];

// Connection-recovery steady-state floor, in milliseconds. Both backoff tracks walk out to this interval and then probe at it indefinitely until the controller returns
// or the monitor is disposed. This is the single "recover without slamming a down controller" guarantee: no matter how an episode began, sustained re-probing settles to
// this cadence. It sits well below the bootstrap-refresh and throttle windows so recovery is prompt, yet coarse enough not to hammer a rebooting controller.
export const PROTECT_RECOVERY_STEADY_INTERVAL_MS = 60000;

// Known-reboot anticipation window, in milliseconds. When client.reboot() succeeds, it arms the ConnectionMonitor to treat the next fault as a known reboot (the long
// backoff track) for this long. The window is the staleness guard for that one-shot signal: it must comfortably exceed the few seconds between "the controller accepts
// the reboot" and "the events channel faults," yet stay well under the gap to any unrelated later fault, so a stall minutes afterward is never misattributed as a planned
// reboot. If no fault arrives within the window, the anticipation self-expires and the next fault takes the unknown-unreachable track.
export const PROTECT_REBOOT_ANTICIPATION_WINDOW_MS = 60000;

// Livestream heartbeat timeout, in milliseconds. If no data is received within this interval, the livestream is considered unresponsive and the connection is closed.
export const PROTECT_LIVESTREAM_HEARTBEAT_TIMEOUT = 10000;

// Default media-stall detection threshold, in milliseconds, for the pool's always-on media watchdog. The watchdog is the MEDIA-silence analog of the session's any-byte
// heartbeat watchdog: the session timer proves the socket is alive (any byte, including the negotiated timestamp frames that carry no picture), while this one proves a
// decodable picture is actually flowing. A subscriber that declares no urgency contributes this default, so every live stream is media-watched by default - the fail-safe
// counterpart of the byte watchdog. It mirrors the heartbeat window's magnitude deliberately: a 10 s media silence is the same "this channel is dead, not merely quiet"
// signal, one layer up. A consumer that needs a tighter deadline (HBUP, whose HKSV path tolerates only a few seconds) declares a smaller urgency; one that wants the byte
// watchdog alone declares Infinity to opt out. This is a DETECTION default, deliberately distinct from PROTECT_LIVESTREAM_DEFAULT_TOLERANCE_MS (the recovery-await
// patience default): detection answers "notice a stall this fast," the recovery-await answers "how long to wait per reconnect attempt," and the two must not leak.
export const PROTECT_LIVESTREAM_STALL_DEFAULT_MS = 10000;

// Media-stall detection floor, in milliseconds. The pool clamps the aggregated detection threshold up to this value so a maximally-urgent consumer (declaring a near-zero
// urgency) cannot set a threshold so tight that ordinary inter-segment jitter trips it. Liveness arrives per media segment, and a livestream is paced at one segment per
// PROTECT_LIVESTREAM_SEGMENT_LENGTH (100 ms) under allowPartialGOP, so this floor (~2 s) is roughly twenty missed segments - unambiguously a stall, yet decoupled from
// the ~5 s IDR keyframe cadence so it does not depend on keyframe spacing. The detection MUST stay keyed on every media segment, never on keyframes: a future "stamp
// liveness only on a keyframe" refactor would couple the floor to the IDR interval and silently let a stream that produces P-frames but no keyframes read healthy.
export const PROTECT_LIVESTREAM_STALL_FLOOR_MS = 2000;

// Media-stall watchdog poll interval, in milliseconds. The watchdog is an interval-poll (the proven LivestreamSession watchdog shape), so its detection latency is
// [threshold, threshold + this] - the tick must therefore be no coarser than the tightest useful threshold (the floor) for crisp detection inside a consumer's prebuffer.
// A 1 s tick keeps the worst-case overshoot at the floor (~2 s) modest while staying a coarse, near-zero-cost idle timer; a finer tick buys little and a coarser one
// would blur detection past the floor. Reading the threshold live on every tick is what lets a tightened policy take effect within one tick - including a tighten that
// lands during an active media silence, which a per-segment-rearmed one-shot would miss because no segment arrives to rearm it.
export const PROTECT_LIVESTREAM_STALL_POLL_MS = 1000;

// Livestream establishment deadline, in milliseconds. The pool's recovery runs in two regimes: bounded establishment (the stream has never produced a segment) and
// unbounded live recovery (it produced one once and then faulted). The default recovery policy gives up - surfacing ProtectLivestreamUnavailableError - once an
// establishing episode has run for longer than this without a first segment - a stream that connects but never produces media. Live recovery has no such deadline: a
// stream that proved itself once keeps being retried (throttled by the backoff curve) until it returns or every subscriber leaves.
export const PROTECT_LIVESTREAM_ESTABLISH_DEADLINE_MS = 30000;

// Livestream establishment backoff curve, in milliseconds, indexed by consecutive failed attempts. Establishment - the stream has never produced a segment - is bound by
// the camera's own first-segment latency, which no consumer can hurry: an impatient consumer cannot make the hardware mint faster, and tearing a fresh stream down early
// only churns the negotiation. So the default policy's establishment windows are deliberately patient and urgency-INDEPENDENT (they ignore the reported tolerance), each
// value the time it grants a fresh stream to produce its first segment before abandoning the attempt and reconnecting. Summed against the 30 s deadline this yields
// roughly four attempts (5s + 8s + 10s + 10s) before give-up. The last value is the steady ceiling once attempts exceed the curve length. These are safe ecosystem
// defaults sized for diverse real hardware; a consumer that has measured its own controllers (e.g. HBUP) injects a tighter policy.
export const PROTECT_LIVESTREAM_ESTABLISH_BACKOFF_MS = [ 5000, 8000, 10000 ];

// Livestream live-recovery backoff curve, in milliseconds, indexed by consecutive failed attempts. Live recovery - the stream produced a segment once and then faulted -
// uses this curve as the headroom-clamped per-attempt window: the default policy grants the stage this long for a segment, having torn down and negotiated a fresh URL
// (which often clears a wedged endpoint), before abandoning the attempt and consulting the policy again. The window doubles as the inter-attempt spacing - a fast-failing
// attempt still occupies its full window - so one curve expresses both "how long to give this attempt" and "how hard to back off," growing with each failure; the last
// value is the steady ceiling. Unlike establishment, recovery is clamped by the consumer's reported headroom (see the await clamp below), so an urgent consumer recovers
// faster than this curve and a patient one follows it.
export const PROTECT_LIVESTREAM_RECOVERY_BACKOFF_MS = [ 3000, 5000, 10000 ];

// Default livestream delay tolerance, in milliseconds, used by the default recovery policy's live-recovery branch when no subscriber reported an urgency. Urgency is each
// subscriber's "how long can I receive no segment" budget, aggregated across a shared stream by the minimum (the most-urgent governs); when the aggregate is Infinity
// (nobody reported), recovery treats the stream as patient and uses this value as the headroom ceiling. It sits at the upper await clamp so an un-urgent stream re-probes
// on a relaxed pace. (Establishment ignores this entirely - it is hardware-bound, not headroom-bound.)
export const PROTECT_LIVESTREAM_DEFAULT_TOLERANCE_MS = 10000;

// Livestream await margin, in milliseconds. The default policy's live-recovery branch derives a reconnect attempt's window from the most-urgent subscriber's reported
// tolerance, less this margin, so it always leaves the consumer some cushion between "the library abandons this attempt" and "the consumer's own buffer runs dry."
// Subtracting a fixed margin rather than a fraction keeps the headroom math legible and the cushion predictable regardless of the reported tolerance's magnitude.
export const PROTECT_LIVESTREAM_AWAIT_MARGIN_MS = 1000;

// Livestream await window clamp, in milliseconds, for the default policy's live-recovery branch (establishment is unclamped - it follows its own patient curve). Recovery
// clamps every reconnect attempt's window to [min, max]: the floor keeps even a maximally-urgent consumer (reporting near-zero tolerance) from tearing down a fresh
// stream before the controller can plausibly mint its first segment - the same first-segment latency establishment respects - and the ceiling keeps a patient consumer
// re-probing often enough to catch the controller's return promptly. The headroom-derived window is clamped into this band, so the policy self-tunes within sane bounds.
export const PROTECT_LIVESTREAM_AWAIT_MIN_MS = 3000;
export const PROTECT_LIVESTREAM_AWAIT_MAX_MS = 10000;

// Reboot-detection noise floor, in milliseconds. The controller's self-reported boot time (nvr.upSince) is a noisy measurement of the boot instant, not a stable epoch:
// it is observed to jitter by a few milliseconds across bootstraps (plausibly recomputed as now - uptime, and NTP-perturbable). A genuine reboot moves upSince by at
// least the prior uptime - minutes to hours - so the ConnectionMonitor treats a boot-time change smaller than this threshold as measurement noise rather than a reboot.
// The value sits orders of magnitude above the observed jitter and far below any realistic reboot delta.
export const PROTECT_REBOOT_DETECTION_THRESHOLD = 5000;

// Default maximum payload size, in bytes, of each livestream WebSocket frame the controller produces. Larger sizes mean lower fragmentation but higher per-frame latency.
// The controller defaults to 4096; consumers override it per subscription via the spec.
export const PROTECT_LIVESTREAM_CHUNK_SIZE = 4096;

// Default and minimum fMP4 segment length, in milliseconds, for a livestream. Protect itself defaults to 100 ms, and we enforce the same value as a floor: shorter
// segments increase controller load for no practical benefit downstream. Consumers may request a longer segment via the spec, but never a shorter one.
export const PROTECT_LIVESTREAM_SEGMENT_LENGTH = 100;

// Talkback send-buffer safety ceiling, in bytes. The TalkbackSession drains a consumer-supplied audio source with structural backpressure - it pulls the next chunk only
// after the socket has absorbed the prior one - so a real-time, producer-paced source (an ffmpeg pipe) keeps the WebSocket's bufferedAmount near zero and never
// approaches this bound. The ceiling exists for the other case: a non-real-time source (a file fed faster than the wire can drain) would otherwise balloon the socket's
// send buffer without limit. Crossing it rejects the send with a ProtectNetworkError rather than buffering unboundedly or injecting seconds-stale audio into a live
// channel. It is a tripwire, not active flow control - there is no timer, consistent with talkback's deliberate absence of a Clock. Sized generously (1 MiB is many
// seconds of voice audio) so it never trips a legitimate real-time stream and fires only on a genuinely wedged socket or a misbehaving source.
export const PROTECT_TALKBACK_MAX_BUFFERED_BYTES = 1048576;
