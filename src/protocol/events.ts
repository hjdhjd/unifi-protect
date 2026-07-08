/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * events.ts: The typed-event taxonomy and the pure classifier that lifts a RawPacket into it.
 */

/**
 * The typed-event taxonomy for the UniFi Protect realtime stream, the pure {@link classifyPacket} that lifts a {@link RawPacket} into it, and the bootstrap-dimension
 * {@link findUnmodeledDeviceCollections} that lifts an applied bootstrap into the device collections the reducer does not model.
 *
 * This module is Layer 1: it depends only on the codec's output shape and the domain types, performs no I/O, holds no state, and never throws. It is the second half
 * of the protocol contract - {@link ../protocol/packet | packet.ts} turns bytes into a `RawPacket`; this turns a `RawPacket` into a {@link TypedEvent}. Because it owns
 * the modelKey vocabulary ({@link DEVICE_MODEL_KEYS} / {@link KNOWN_MODEL_KEYS}), it also hosts the bootstrap-dimension classifier: where `classifyPacket` catches
 * an unmodeled class that *emits a realtime packet*, `findUnmodeledDeviceCollections` catches one that merely *lives in the bootstrap* - the standing twin the realtime
 * tripwire is structurally blind to. Both lifts read the same vocabulary, so a class becoming modeled drops out of both with a single edit.
 *
 * @module ProtectEvents
 */
import type { DeepPartial, ProtectNvrBootstrap, ProtectStateRecord } from "../types/index.ts";
import type { RawPacket } from "./packet.ts";
import { assertNever } from "../errors.ts";

// The modelKey taxonomy is three nested tiers (DeviceModelKey ⊂ StateModelKey ⊂ ModelKey), each declared once as the single source of truth for both its type and its
// runtime membership test. The controller emits realtime `update` packets for more than the projectable devices, so the tiers separate three distinct questions:
// "is this device-addressable?", "do we reduce it into state?", and "is this a modelKey we recognize on the wire at all?".

// Tier 1 - addressable via a REST endpoint and surfaced as a Layer-3 projection identity.
const DEVICE_MODEL_KEYS = [ "camera", "chime", "fob", "light", "nvr", "relay", "sensor", "viewer" ] as const;

// Tier 2 - the model keys the reducer folds into ProtectState from the realtime stream: every device, the user roster, and the liveview collection. `user` and `liveview`
// are reduced (their realtime updates carry permission/role and liveview changes we want reflected immediately) but are not device-addressed, so each is a StateModelKey
// without being a DeviceModelKey. Note this is the *realtime-reduced* set: `ringtones` is also reduced into ProtectState but bootstrap-only (the controller emits no
// `ringtone` packet), so it is deliberately not here and not in KNOWN_MODEL_KEYS - leaving schema:unknownModelKey armed as a tripwire if that ever changes.
/** @internal */
const STATE_MODEL_KEYS = [ ...DEVICE_MODEL_KEYS, "liveview", "user" ] as const;

// Tier 3 - every model key the controller is observed to emit on the realtime stream: the reduced set, the `event` activity channel, and the recognized-but-unmodeled
// keys the controller broadcasts but the library does not fold into state - the `group`/`bridge` collections, the newer device classes (`aiport`, `aiprocessor`,
// `linkstation`), and detection/session telemetry (`smartDetectObject`, `activeSessionStat`). A device-shaped key here can become a reduced StateModelKey when a
// consumer needs it - `relay` made exactly that promotion to a DeviceModelKey. Membership in this set is what makes the schema:unknownModelKey diagnostic
// honest - a key in this set is known even when we do not reduce it, so the diagnostic fires only for a key outside it (genuine wire drift). This set beyond the
// collections was confirmed by a schema-drift sweep against a real controller; `doorlock` and `ringtone` remain deliberately absent, as neither is observed in practice.
const KNOWN_MODEL_KEYS = [ ...STATE_MODEL_KEYS, "activeSessionStat", "aiport", "aiprocessor", "bridge", "event", "group", "linkstation", "smartDetectObject" ] as const;

/**
 * The model keys addressable via a REST endpoint and a Layer-3 projection. The innermost tier - a subset of {@link StateModelKey}.
 */
export type DeviceModelKey = typeof DEVICE_MODEL_KEYS[number];

/**
 * The model keys the library reduces into canonical {@link ProtectState} *from the realtime stream*: the devices, the NVR, the user roster, and the liveview collection.
 * A superset of `DeviceModelKey` (it adds `user` and `liveview`, reduced but not device-addressed) and a subset of `ModelKey` (the full observed wire vocabulary).
 *
 * "Reduced into state" and "is a `StateModelKey`" are two orthogonal axes. `applyBootstrap` reconciles *every* reduced collection (it is the universal input), so a
 * collection can live in {@link ProtectState} without being a `StateModelKey`: `ringtones` is reduced and observable, but the controller broadcasts no `ringtone` packet,
 * so it advances bootstrap-only and is intentionally excluded here (and from `ModelKey`). `StateModelKey` is precisely the subset the controller *also* emits
 * realtime deltas for - the keys the reducer's realtime upsert/patch/remove path touches.
 */
export type StateModelKey = typeof STATE_MODEL_KEYS[number];

/**
 * Every Protect model key the realtime stream is observed to address: the reduced {@link StateModelKey}s, the recognized-but-unmodeled collections (`group`, `bridge`,
 * and the newer device-shaped classes), and `event` (the activity-occurrence channel). The library recognizes these but reduces only the {@link StateModelKey} subset;
 * the rest are carried here purely so the `unifi-protect:schema:unknownModelKey` diagnostic stays honest - a key *outside* this union is genuine schema drift the
 * controller has introduced, surfaced for visibility, whereas a recognized-but-unmodeled key is a deliberate non-reduction, not drift. `ringtone` is deliberately *not*
 * here: it is reduced bootstrap-only, never seen on the realtime stream, so leaving it out keeps the tripwire armed should the controller ever start broadcasting it.
 */
export type ModelKey = typeof KNOWN_MODEL_KEYS[number];

/**
 * The known UniFi Protect smart-detection object classes. Modeled as an open union: the listed literals give editor autocomplete and exhaustiveness hints for the
 * common cases, while the trailing `string` keeps the type honest against firmware that introduces new detection classes the library has not enumerated yet.
 */
export type SmartDetectType = "animal" | "face" | "licensePlate" | "package" | "person" | "vehicle" | (string & {});

/**
 * The authentication method a doorbell {@link TypedEvent | `authDetected`} occurrence resolved: a fingerprint match or an NFC card tap. The deliberate counterpoint to
 * {@link SmartDetectType}: that one is *open* (`| (string & {})`) because `objectTypes` passes wire-provided detection-class strings through verbatim and must stay
 * honest against new firmware classes; this one is *closed*, because `method` is not passed through but *computed* by the classifier from the enumerated auth `type`
 * values via a single map - the library can only ever produce a value it mapped, so a new auth method is an explicit extension of this union and that map together,
 * never a silent wire passthrough.
 */
export type AuthMethod = "fingerprint" | "nfc";

/**
 * The discriminated union of every realtime event the library models, exposed on the firehose ({@link ProtectClient.events}) and by {@link ProtectClient.classifyPacket}.
 * It splits into two categories by relationship to state:
 *
 * **State transitions** advance {@link ProtectState} - they describe the current condition of devices and the NVR:
 *
 * - `deviceAdded` - a device appeared (or its full record was re-sent); the reducer upserts it.
 * - `devicePatched` - a partial update to an existing device; the reducer deep-merges it.
 * - `deviceRemoved` - a device was removed; the reducer deletes it.
 * - `bootstrapLoaded` - a fresh full bootstrap (initial connect, periodic refresh, or post-reboot recovery); the reducer reconciles state against it. Synthetic:
 *   dispatched by the StateStore, never produced by `classifyPacket`.
 *
 * **Activity signals** describe discrete occurrences - a thing that happened, with its own `eventId`, lifecycle, and metadata. They are classified *solely* from the
 * `event` model key (the only place an occurrence carries identity and metadata), flow only to the `client.events()` firehose, and are no-ops in the reducer:
 *
 * - `motionDetected` - raw motion began on a camera.
 * - `smartDetect` - a smart object class was detected (`objectTypes` carries the classes).
 * - `tamperDetected` - a camera reported tampering (the controller's `smartDetectTamper` occurrence). A one-way signal with no paired clear and no camera-state field,
 *   unlike motion's `lastMotion` - so the occurrence is its single source of truth. It is a sibling of `motionDetected`, not a `smartDetect` variant: tamper is not a
 *   smart object class and carries no `objectTypes`.
 * - `authDetected` - a doorbell reported an authentication scan: a fingerprint match (`fingerprintIdentified`) or an NFC card tap (`nfcCardScanned`). Camera-attributed
 *   (the doorbell that performed the scan, resolved via the payload `camera` field) and, like `tamperDetected`, a one-way occurrence with no paired state field, so the
 *   occurrence is its single source of truth. It is decided by its explicit auth `type` *ahead* of the generic `accessEvent` fallback as defensive precedence - live
 *   captures of both methods confirm auth metadata (`fingerprint`/`nfc`) and the `accessEventId` access marker are disjoint, so a scan is never absorbed as a bare access
 *   occurrence even were a future firmware to co-stamp it. The `method` the classifier resolved (`"fingerprint"` / `"nfc"`) is lifted onto the event - the consumer reads
 *   the classifier's own answer rather than re-deriving it from metadata shape, exactly as `smartDetect` lifts `objectTypes`; whether the scan succeeded and which
 *   identity matched stay metadata reads (an unrecognized scan still classifies, carrying e.g. `metadata.fingerprint.ulpId: null`).
 * - `doorbellRing` - a doorbell was pressed.
 * - `accessEvent` - a UniFi Access occurrence (door, reader, lock), discriminated within the `event` channel by its access metadata.
 * - `buttonPressed` - a security-action button was pressed on a fob (or a sensor with a button). Device-attributed (the pressing device, from the
 *   payload's `device` field), so it routes by `deviceId` like `accessEvent`; the classifier lifts `button` (which button) and `pressType` (how it was pressed), and
 *   the device family rides in `metadata.deviceModelKey` since the wire event type is shared across button-bearing devices.
 *
 * @category Events
 */
export type TypedEvent =

  // State transitions - reduced into ProtectState. modelKey is the reduced StateModelKey subset (never `"event"`, `"group"`, or `"bridge"`):
  // activity-occurrence packets produce activity signals via classifyActivity below, and recognized-but-unmodeled keys classify as null, so the type system rules out
  // the impossible combinations here at the source rather than the reducer defending against them at runtime. The `device*` kind names cover the reduced records
  // generally - the NVR singleton and the user roster are reduced records that are not devices, the same latitude the names already took for `nvr`.
  | { kind: "deviceAdded"; modelKey: StateModelKey; id: string; data: ProtectStateRecord } |
  { kind: "devicePatched"; modelKey: StateModelKey; id: string; patch: DeepPartial<ProtectStateRecord> } |
  { kind: "deviceRemoved"; modelKey: StateModelKey; id: string } |
  { kind: "bootstrapLoaded"; data: ProtectNvrBootstrap } |

  // Activity signals - firehose-only; no-ops in the reducer.
  { kind: "motionDetected"; cameraId: string; eventId: string; at: number; metadata?: Record<string, unknown> } |
  { kind: "smartDetect"; cameraId: string; eventId: string; at: number; objectTypes: readonly SmartDetectType[]; metadata?: Record<string, unknown> } |
  { kind: "tamperDetected"; cameraId: string; eventId: string; at: number; metadata?: Record<string, unknown> } |
  { kind: "authDetected"; cameraId: string; eventId: string; at: number; method: AuthMethod; metadata?: Record<string, unknown> } |
  { kind: "doorbellRing"; cameraId: string; eventId: string; at: number } |
  { kind: "accessEvent"; deviceId: string; eventId: string; at: number; action: string; metadata?: Record<string, unknown> } |
  { kind: "buttonPressed"; deviceId: string; eventId: string; at: number; button: string; pressType: string; metadata?: Record<string, unknown> };

// The discriminating `type` values on an `event`-modelKey payload, grouped by the activity signal each maps to. Naming them as constants keeps the wire vocabulary in
// one place and makes it cheap to extend as live-controller captures confirm additional values.
// The auth wire types map to their resolved `AuthMethod` rather than a bare membership list: under `noUncheckedIndexedAccess` a lookup returns `AuthMethod | undefined`,
// so this map is both the "is this an auth type?" test and the method resolution - no parallel list-and-switch to keep in sync, and a new auth type is a single entry
// whose value the `AuthMethod` union must admit (a closed-by-construction extension point, not an open passthrough).
const AUTH_EVENT_METHODS: Readonly<Record<string, AuthMethod>> = { fingerprintIdentified: "fingerprint", nfcCardScanned: "nfc" };
const MOTION_EVENT_TYPE = "motion";
const RING_EVENT_TYPE = "ring";
const SENSOR_BUTTON_EVENT_TYPE = "sensorButtonPressed";
const SMART_EVENT_TYPES: readonly string[] = [ "smartAudioDetect", "smartDetectLine", "smartDetectZone" ];
const TAMPER_EVENT_TYPE = "smartDetectTamper";

/**
 * Classify a decoded {@link RawPacket} into a {@link TypedEvent}, or `null` if the packet is valid but describes something the library does not model.
 *
 * This is a pure, stateless, total function. It reads only the packet's own self-description - the action, the model key, and the payload's discriminating fields -
 * and never consults prior state, never holds state, and never throws. Returning `null` is the documented signal for "a well-formed packet we do not (yet) model":
 * an unknown model key, an action we do not handle, a device transition whose payload is not an object, or an `event` packet that does not self-describe as one of
 * the modeled occurrences. The caller observes the `null` and moves on (logging at debug if it wishes).
 *
 * Statelessness is the load-bearing property. Activity signals (`motionDetected`, `smartDetect`, `tamperDetected`, `authDetected`, `doorbellRing`, `accessEvent`) are
 * derived *exclusively* from the `event` model key, because that is the only packet that carries an occurrence's identity and metadata. Camera state - `lastMotion`,
 * `lastRing`, `isMotionDetected` - flows through the same classifier as a `devicePatched`; it is never re-synthesized into an activity signal, which would require
 * remembering the previous value and thus break purity. "Did motion happen?" has exactly one home (the occurrence); "what is the camera's current `lastMotion`?" has
 * exactly one home (the state).
 *
 * @param raw - A structurally valid packet from {@link ../protocol/packet | decodePacket}.
 *
 * @returns The classified {@link TypedEvent}, or `null` for a valid-but-unmodeled packet.
 *
 * @category Events
 */
export function classifyPacket(raw: RawPacket): TypedEvent | null {

  const { action, id, modelKey } = raw.header;

  // The `event` model key is the sole source of activity signals; it is never reduced into device state.
  if(modelKey === "event") {

    return classifyActivity(id, raw.payload);
  }

  // Any model key we reduce into state becomes a state transition. We narrow the wire string to the reduced subset; a recognized-but-unmodeled key (`group`, `bridge`)
  // or genuine drift returns null here, and the EventStream distinguishes the two against the ModelKey vocabulary for the diagnostic.
  if(isStateModelKey(modelKey)) {

    return classifyStateTransition(action, modelKey, id, raw.payload);
  }

  return null;
}

/**
 * The id(s) of the record(s) a {@link TypedEvent} concerns - the single, total mapping from an event to its subject(s), shared by every consumer that attributes an event
 * to a device (the CLI's `--device` filter and event rendering today; any future generic consumer tomorrow). A state transition concerns the one reduced record it
 * carries; a camera activity signal (`motionDetected`, `smartDetect`, `tamperDetected`, `authDetected`, `doorbellRing`) concerns its camera; an access occurrence
 * concerns its access device; the synthetic `bootstrapLoaded` concerns no single record and yields the empty array.
 *
 * Exhaustive by construction: a new {@link TypedEvent} kind that does not declare its subject is a *compile* error here (the `default` narrows to `never`), so
 * attribution can never silently drift from the union - the failure a per-consumer re-derivation would otherwise surface as silently dropped events on a device filter.
 * Pure and total; surfaced to consumers as {@link ProtectClient.eventSubjects} so there is one attribution path, on the object model, mirroring the codec statics.
 *
 * @param event - Any typed event from the firehose.
 *
 * @returns The subject record id(s), possibly empty.
 *
 * @throws {@link ProtectProtocolError} only if an unrecognized event kind reaches this function - a defect the exhaustiveness guard converts from a silently dropped
 *   attribution into a loud failure.
 *
 * @category Events
 */
export function eventSubjects(event: TypedEvent): readonly string[] {

  switch(event.kind) {

    case "deviceAdded":
    case "devicePatched":
    case "deviceRemoved":

      return [event.id];

    case "authDetected":
    case "doorbellRing":
    case "motionDetected":
    case "smartDetect":
    case "tamperDetected":

      return [event.cameraId];

    case "accessEvent":
    case "buttonPressed":

      return [event.deviceId];

    case "bootstrapLoaded":

      return [];

    default:

      // Compile-time exhaustiveness: every modeled kind is handled above, so `event` is `never` here, and a new kind added without a case fails to compile. At runtime
      // this is unreachable for a well-typed event; the throw catches untyped misuse loudly rather than silently dropping attribution.
      return assertNever(event);
  }
}

/**
 * A populated, device-shaped bootstrap collection the reducer does not model. The pure result of {@link findUnmodeledDeviceCollections}; the store lifts it verbatim onto
 * the `schema:unmodeledCollection` diagnostic. `known` distinguishes a recognized-but-unreduced class (a {@link ModelKey} member such as `aiport`, which the library
 * recognizes but does not project) from genuine schema drift the controller introduced (a `modelKey` outside the vocabulary entirely).
 *
 * @category Events
 */
export interface UnmodeledCollection {

  collection: string;
  count: number;
  exampleId: string;
  known: boolean;
  modelKey: string;
}

/**
 * The bootstrap-dimension twin of {@link classifyPacket}: scan an applied bootstrap for device-shaped collections the reducer does not model. Pure, total, and
 * side-effect-free - it reads only the bootstrap and the modelKey vocabulary beside it. A collection qualifies when its value is a non-empty array whose first element
 * is a record carrying both a string `modelKey` and a string `mac` - the device shape, present on relay/aiport/aiprocessor/linkstation/bridge and absent on the
 * user/liveview/ringtone rosters (no `mac`) and the group collections (no `modelKey`+`mac`) - and whose `modelKey` is not already a {@link DeviceModelKey} the library
 * models. For each survivor it reports the bootstrap array key (`collection`), the record's self-declared `modelKey`, the array length (`count`), the first record's id
 * (`exampleId`), and whether the `modelKey` is otherwise recognized (`known`, via {@link isKnownModelKey}) - `true` for a recognized-but-unreduced class, `false` for
 * genuine drift.
 *
 * Where {@link classifyPacket} catches an unmodeled class that emits a realtime packet, this catches a quiescent one that merely lives in the bootstrap. Both read the
 * same vocabulary, so a class the library already models is automatically excluded from both, with no separate edit needed here.
 *
 * @param bootstrap - The applied bootstrap document.
 *
 * @returns Zero or more unmodeled device collections, one per qualifying bootstrap key.
 *
 * @category Events
 */
export function findUnmodeledDeviceCollections(bootstrap: ProtectNvrBootstrap): readonly UnmodeledCollection[] {

  const collections: UnmodeledCollection[] = [];

  for(const [ collection, value ] of Object.entries(bootstrap)) {

    // The device-shaped predicate: a non-empty array whose first element is a record with both a string `modelKey` and a string `mac`. The `mac` is what separates a
    // device collection from the user/liveview/ringtone rosters (no `mac`) and the group collections (no `modelKey`+`mac`).
    if(!Array.isArray(value) || (value.length === 0)) {

      continue;
    }

    const first = value[0];

    if(!isRecord(first)) {

      continue;
    }

    const modelKey = stringField(first, "modelKey");
    const mac = stringField(first, "mac");

    if((modelKey === undefined) || (mac === undefined)) {

      continue;
    }

    // A class the library already models is not unmodeled - drop it. This is the single-source-of-truth win: promoting a class into DEVICE_MODEL_KEYS excludes it
    // here automatically, with no edit to this scan.
    if(isDeviceModelKey(modelKey)) {

      continue;
    }

    collections.push({ collection, count: value.length, exampleId: stringField(first, "id") ?? "", known: isKnownModelKey(modelKey), modelKey });
  }

  return collections;
}

// Map a reduced-model-key packet to a state transition. The wire actions are `add` (upsert from full data), `update` (deep-merge a partial), and `remove` (delete).
// An add/update whose payload is not an object cannot carry a config record, so it classifies as null rather than a malformed transition.
function classifyStateTransition(action: string, modelKey: StateModelKey, id: string, payload: unknown): TypedEvent | null {

  switch(action) {

    case "add":

      return isRecord(payload) ? { data: payload as ProtectStateRecord, id, kind: "deviceAdded", modelKey } : null;

    case "update":

      return isRecord(payload) ? { id, kind: "devicePatched", modelKey, patch: payload as DeepPartial<ProtectStateRecord> } : null;

    case "remove":

      return { id, kind: "deviceRemoved", modelKey };

    default:

      return null;
  }
}

// Map an `event`-model-key packet to an activity signal. The packet must self-describe: an `add` always carries the full event object (with `type`), while a
// finalizing `update` is classified only when its partial still carries the discriminating fields. The header id is the occurrence identity, shared across the add
// and any finalizing update so a consumer can correlate them.
function classifyActivity(eventId: string, payload: unknown): TypedEvent | null {

  if(!isRecord(payload)) {

    return null;
  }

  // The occurrence timestamp comes from `start` (most occurrences) or `detectedAt` (the rest), falling back to `0` when a finalizing partial carries neither.
  const at = numberField(payload, "start") ?? numberField(payload, "detectedAt") ?? 0;
  const cameraId = stringField(payload, "cameraId") ?? stringField(payload, "camera");
  const metadata = recordField(payload, "metadata");
  const type = stringField(payload, "type");

  // A doorbell authentication scan - a fingerprint match or an NFC card tap - is camera-attributed (the doorbell that performed it), resolved live via the payload's
  // `camera` field (no `cameraId`). Live captures of both methods confirm its metadata (`fingerprint`/`nfc`) and a generic access occurrence's `accessEventId` marker are
  // disjoint, so the two branches do not collide on observed traffic; we nonetheless resolve the `method` from the wire `type` and decide the occurrence by it
  // *before* the accessEvent branch below - the same "an explicit type wins over the metadata fallback" discipline `tamperDetected` uses against the
  // smart-detection branch - as defensive precedence, so a future firmware that co-stamped a scan with `accessEventId` could still never have it
  // absorbed as a bare `accessEvent`. The resolved method is lifted onto the event (the classifier's own answer, so the consumer never re-derives it
  // from metadata shape), exactly as `smartDetect` lifts `objectTypes`. Because this test precedes the shared camera-id guard further down, it carries
  // its own: without a camera id the signal is unroutable, so we decline. Whether the scan succeeded and which identity matched stay metadata reads at
  // delivery - data, not classification (an unrecognized scan still classifies, carrying `metadata.fingerprint.ulpId: null`).
  const method = (type !== undefined) ? AUTH_EVENT_METHODS[type] : undefined;

  if(method !== undefined) {

    return (cameraId === undefined) ? null : { at, cameraId, eventId, kind: "authDetected", metadata, method };
  }

  // A device-attributed access occurrence - a door event such as a bell press - carries the `accessEventId` marker and a device, so it routes here regardless of the
  // specific access `type` string: a doorbell `ring` that carries the marker is decided here, not in the ring branch below. `deviceId` resolves from the metadata's
  // device text, or the camera fallback when the metadata carries no device text.
  if((metadata !== undefined) && (typeof metadata["accessEventId"] === "string")) {

    const deviceId = readNestedText(metadata["deviceId"]) ?? cameraId;

    if(deviceId === undefined) {

      return null;
    }

    return { action: stringField(metadata, "action") ?? type ?? "", at, deviceId, eventId, kind: "accessEvent", metadata };
  }

  // A button press on a fob (or a sensor with a button) is a device-attributed occurrence: the wire carries the pressing device on `device` (with `camera` null), so it
  // routes by `deviceId` like an access occurrence rather than through the camera-id guard below. The lifted `button` and `pressType` are the occurrence's identity -
  // which button, and how it was pressed - while the device family rides in `metadata.deviceModelKey`, since the event type is shared across button-bearing devices.
  if(type === SENSOR_BUTTON_EVENT_TYPE) {

    const deviceId = stringField(payload, "device") ?? readNestedText(metadata?.["sensorId"]);

    if(deviceId === undefined) {

      return null;
    }

    return { at, button: readNestedText(metadata?.["button"]) ?? "", deviceId, eventId, kind: "buttonPressed", metadata,
      pressType: readNestedText(metadata?.["buttonPressType"]) ?? "" };
  }

  // A device-less, bare `type: "access"` packet is deliberately left unmodeled: lacking a camera id it returns `null` at the guard just below (and a stray one bearing a
  // camera id would match no occurrence `type` and return `null` at the tail regardless). We decline it because the wire makes a login and an unlock indistinguishable
  // (confirmed live): the controller emits this packet as a user login/session audit record on every authentication - including this library's own `connect()` - and a
  // genuine software unlock (the path `camera.unlock()` drives) is byte-identical to it: device-less (`camera`/`device` null), `locked` always `false`, the same
  // `metadata.{clientPlatform, ip, userName}`, differing only in the event id/start timestamps. No wire field separates a login from an unlock, and the auto-relock emits
  // nothing, so an unlock kind would fire a phantom on every login and carry a permanently meaningless `locked`. We do not manufacture a signal the wire does not carry;
  // recognizing this shape later (as a `userAccess` audit kind) is a non-breaking, additive change the day a consumer needs it.

  // The remaining occurrences are camera-attributed; without a camera id we cannot route the signal, so we decline to classify.
  if(cameraId === undefined) {

    return null;
  }

  const objectTypes = stringArrayField(payload, "smartDetectTypes");

  if(type === RING_EVENT_TYPE) {

    return { at, cameraId, eventId, kind: "doorbellRing" };
  }

  if(type === MOTION_EVENT_TYPE) {

    return { at, cameraId, eventId, kind: "motionDetected", metadata };
  }

  // Camera tampering is a one-way occurrence the controller reports as `smartDetectTamper`. Despite the `smartDetect*` wire name it is not a smart object class - it
  // carries no `smartDetectTypes` - and the camera config has no tamper-state field, so the occurrence is its only home (no paired `devicePatched`, no `tamperCleared`).
  // We test it before the smart-detection branch so an explicit tamper `type` is decided by its own equality check and never absorbed by that branch's
  // `objectTypes`-presence fallback.
  if(type === TAMPER_EVENT_TYPE) {

    return { at, cameraId, eventId, kind: "tamperDetected", metadata };
  }

  // A recognized smart `type`, or a finalizing update that omits `type` but still carries a populated `smartDetectTypes`, both classify as a smart detection.
  if(((type !== undefined) && SMART_EVENT_TYPES.includes(type)) || (objectTypes.length > 0)) {

    return { at, cameraId, eventId, kind: "smartDetect", metadata, objectTypes };
  }

  return null;
}

// Narrow the wire model-key string to the reduced StateModelKey subset - the keys classifyPacket lifts into a state transition.
function isStateModelKey(value: string): value is StateModelKey {

  return (STATE_MODEL_KEYS as readonly string[]).includes(value);
}

/**
 * Whether the given wire model key is one the library recognizes at all - any {@link StateModelKey}, the recognized-but-unmodeled `group`/`bridge`, or
 * `event`. The single source of truth for the recognized model-key vocabulary: the `EventStream` consults it to distinguish a `classifyPacket` `null` that means
 * "genuine schema drift the controller introduced" (a key *outside* this vocabulary, worth surfacing on the `schema:unknownModelKey` diagnostic) from a `null` that
 * merely means "a recognized key we chose not to lift" (a non-self-describing `event`, an unhandled action, or a recognized-but-unmodeled collection). Keeping the test
 * here, beside the vocabulary it checks, means a new category is added in exactly one place.
 *
 * @param value - The wire model-key string.
 *
 * @returns `true` if the model key is one the library recognizes, `false` if it is unrecognized (genuine drift).
 *
 * @category Events
 */
export function isKnownModelKey(value: string): value is ModelKey {

  return (KNOWN_MODEL_KEYS as readonly string[]).includes(value);
}

/**
 * Whether the given wire model key is one the library models as a device - a {@link DeviceModelKey} with a REST endpoint and a Layer-3 projection. The innermost of the
 * three nested vocabulary guards ({@link isKnownModelKey} is the outermost). {@link findUnmodeledDeviceCollections} uses it to drop a bootstrap collection the library
 * already models, so a class promoted into {@link DEVICE_MODEL_KEYS} (as `relay` was) leaves the unmodeled report automatically, with no second edit.
 *
 * @param value - The wire model-key string.
 *
 * @returns `true` if the model key is a modeled device class.
 *
 * @category Events
 */
export function isDeviceModelKey(value: string): value is DeviceModelKey {

  return (DEVICE_MODEL_KEYS as readonly string[]).includes(value);
}

// True for a non-null, non-array object - the shape a device record or event payload must have.
function isRecord(value: unknown): value is Record<string, unknown> {

  return (typeof value === "object") && (value !== null) && !Array.isArray(value);
}

// A family of defensive field readers over untyped wire records: each returns the requested property only when it is present and of the expected runtime type
// (string, number, nested object), and undefined otherwise. Centralizing the `typeof` guard here keeps the classifiers free of repeated inline type checks when they
// read fields off a raw record.
function stringField(record: Record<string, unknown>, key: string): string | undefined {

  const value = record[key];

  return (typeof value === "string") ? value : undefined;
}

function numberField(record: Record<string, unknown>, key: string): number | undefined {

  const value = record[key];

  return (typeof value === "number") ? value : undefined;
}

function recordField(record: Record<string, unknown>, key: string): Record<string, unknown> | undefined {

  const value = record[key];

  return isRecord(value) ? value : undefined;
}

// Read a property as an array of strings, keeping only the string elements. Returns an empty array if absent or not an array, so callers can branch on length.
function stringArrayField(record: Record<string, unknown>, key: string): readonly string[] {

  const value = record[key];

  return Array.isArray(value) ? value.filter((element): element is string => typeof element === "string") : [];
}

// Read the `.text` of a `{ text: string }`-shaped property (the access metadata's deviceId shape), or undefined if it does not match.
function readNestedText(value: unknown): string | undefined {

  return isRecord(value) ? stringField(value, "text") : undefined;
}
