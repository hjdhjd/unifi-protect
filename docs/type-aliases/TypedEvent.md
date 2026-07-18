[**unifi-protect**](../README.md)

***

[Home](../README.md) / TypedEvent

# Type Alias: TypedEvent

```ts
type TypedEvent = 
  | {
  data: ProtectStateRecord;
  id: string;
  kind: "deviceAdded";
  modelKey: StateModelKey;
}
  | {
  id: string;
  kind: "devicePatched";
  modelKey: StateModelKey;
  patch: DeepPartial<ProtectStateRecord>;
}
  | {
  id: string;
  kind: "deviceRemoved";
  modelKey: StateModelKey;
}
  | {
  data: ProtectNvrBootstrap;
  kind: "bootstrapLoaded";
}
  | {
  at: number;
  cameraId: string;
  eventId: string;
  kind: "motionDetected";
  metadata?: Record<string, unknown>;
}
  | {
  at: number;
  cameraId: string;
  eventId: string;
  kind: "smartDetect";
  metadata?: Record<string, unknown>;
  objectTypes: readonly SmartDetectType[];
}
  | {
  at: number;
  cameraId: string;
  eventId: string;
  kind: "tamperDetected";
  metadata?: Record<string, unknown>;
}
  | {
  at: number;
  cameraId: string;
  eventId: string;
  kind: "authDetected";
  metadata?: Record<string, unknown>;
  method: AuthMethod;
}
  | {
  at: number;
  cameraId: string;
  eventId: string;
  kind: "doorbellRing";
}
  | {
  action: string;
  at: number;
  deviceId: string;
  eventId: string;
  kind: "accessEvent";
  metadata?: Record<string, unknown>;
}
  | {
  at: number;
  button: string;
  deviceId: string;
  eventId: string;
  kind: "buttonPressed";
  metadata?: Record<string, unknown>;
  pressType: string;
};
```

The discriminated union of every realtime event the library models, exposed on the firehose ([ProtectClient.events](../classes/ProtectClient.md#events)) and by [ProtectClient.classifyPacket](../classes/ProtectClient.md#classifypacket).
It splits into two categories by relationship to state:

**State transitions** advance [ProtectState](ProtectState.md) - they describe the current condition of devices and the NVR:

- `deviceAdded` - a device appeared (or its full record was re-sent); the reducer upserts it.
- `devicePatched` - a partial update to an existing device; the reducer deep-merges it.
- `deviceRemoved` - a device was removed; the reducer deletes it.
- `bootstrapLoaded` - a fresh full bootstrap (initial connect, periodic refresh, or post-reboot recovery); the reducer reconciles state against it. Synthetic:
  dispatched by the StateStore, never produced by `classifyPacket`.

**Activity signals** describe discrete occurrences - a thing that happened, with its own `eventId`, lifecycle, and metadata. They are classified *solely* from the
`event` model key (the only place an occurrence carries identity and metadata), flow only to the `client.events()` firehose, and are no-ops in the reducer:

- `motionDetected` - raw motion began on a camera.
- `smartDetect` - a smart object class was detected (`objectTypes` carries the classes).
- `tamperDetected` - a camera reported tampering (the controller's `smartDetectTamper` occurrence). A one-way signal with no paired clear and no camera-state field,
  unlike motion's `lastMotion` - so the occurrence is its single source of truth. It is a sibling of `motionDetected`, not a `smartDetect` variant: tamper is not a
  smart object class and carries no `objectTypes`.
- `authDetected` - a doorbell reported an authentication scan: a fingerprint match (`fingerprintIdentified`) or an NFC card tap (`nfcCardScanned`). Camera-attributed
  (the doorbell that performed the scan, resolved via the payload `camera` field) and, like `tamperDetected`, a one-way occurrence with no paired state field, so the
  occurrence is its single source of truth. It is decided by its explicit auth `type` *ahead* of the generic `accessEvent` fallback as defensive precedence - live
  captures of both methods confirm auth metadata (`fingerprint`/`nfc`) and the `accessEventId` access marker are disjoint, so a scan is never absorbed as a bare access
  occurrence even were a future firmware to co-stamp it. The `method` the classifier resolved (`"fingerprint"` / `"nfc"`) is lifted onto the event - the consumer reads
  the classifier's own answer rather than re-deriving it from metadata shape, exactly as `smartDetect` lifts `objectTypes`; whether the scan succeeded and which
  identity matched stay metadata reads (an unrecognized scan still classifies, carrying e.g. `metadata.fingerprint.ulpId: null`).
- `doorbellRing` - a doorbell was pressed.
- `accessEvent` - a UniFi Access occurrence (door, reader, lock), distinguished within the `event` channel by its access metadata.
- `buttonPressed` - a security-action button was pressed on a fob (or a sensor with a button). Device-attributed (the pressing device, from the
  payload's `device` field), so it routes by `deviceId` like `accessEvent`; the classifier lifts `button` (which button) and `pressType` (how it was pressed), and
  the device family rides in `metadata.deviceModelKey` since the wire event type is shared across button-bearing devices.
