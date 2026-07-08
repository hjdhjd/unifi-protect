[**unifi-protect**](../README.md)

***

[Home](../README.md) / isDeviceOnline

# Function: isDeviceOnline()

```ts
function isDeviceOnline(device): boolean;
```

Whether a device is currently connected to the controller. The single definition of "online" shared by the `online` selectors and the device projections'
`isOnline` getter, so the collection views and the per-device view never disagree.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `device` | \{ `state`: `string`; \} | Any device config (only its `state` field is read). |
| `device.state` | `string` | - |

## Returns

`boolean`

`true` when the device is fully connected.
