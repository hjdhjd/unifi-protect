[**unifi-protect**](../README.md)

***

[Home](../README.md) / isDeviceAdopted

# Function: isDeviceAdopted()

```ts
function isDeviceAdopted(device): boolean;
```

Whether a device is adopted by *this* controller - owned and managed here, rather than merely visible on the network or owned by a different NVR. The single
definition of "adopted by us", shared by the membership-id selectors so the collection views and any per-device check never disagree, exactly as [isDeviceOnline](isDeviceOnline.md)
is the single definition of "online".

The predicate is **ownership**, not **readiness**: `isAdopted` is set once any controller has adopted the device, and `isAdoptedByOther` marks one adopted by a
*different* NVR, so `isAdopted && !isAdoptedByOther` is precisely "ours". We deliberately do not also exclude the transient `isAdopting`: a device mid-adoption has not
yet flipped `isAdopted` true (so it is already excluded), and a device being *re*-provisioned is still owned by us - dropping it from the membership set on a transient
would churn the set, the opposite of what the membership selectors are for. "Can it stream right now?" is liveness ([isDeviceOnline](isDeviceOnline.md)), a separate question.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `device` | \{ `isAdopted`: `boolean`; `isAdoptedByOther`: `boolean`; \} | Any device config (only its adoption flags are read). |
| `device.isAdopted` | `boolean` | - |
| `device.isAdoptedByOther` | `boolean` | - |

## Returns

`boolean`

`true` when the device is adopted by this controller and not by another.
