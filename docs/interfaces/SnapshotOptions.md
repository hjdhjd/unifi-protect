[**unifi-protect**](../README.md)

***

[Home](../README.md) / SnapshotOptions

# Interface: SnapshotOptions

Options for [Camera.snapshot](Camera.md#snapshot). Width and height request a specific output size; omit both for the controller's default. Set `packageCamera` to capture from the
secondary package sensor on dual-camera devices (the G4/G5 Doorbell Pro) instead of the primary lens.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="height"></a> `height?` | `number` | - |
| <a id="packagecamera"></a> `packageCamera?` | `boolean` | Capture from the camera's secondary package sensor (the downward-facing lens on dual-camera doorbells such as the G4/G5 Doorbell Pro) rather than the primary lens. This is an endpoint distinction - it swaps the request path to `/package-snapshot` - not a multi-lens selection, and it is a hard precondition: [Camera.snapshot](Camera.md#snapshot) throws [ProtectUnsupportedError](../classes/ProtectUnsupportedError.md) before issuing any request when the camera's `featureFlags.hasPackageCamera` is not set. Named `packageCamera` rather than `package` because `package` is a reserved word in strict-mode ES modules and so could not be destructured. |
| <a id="signal"></a> `signal?` | `AbortSignal` | - |
| <a id="width"></a> `width?` | `number` | - |
