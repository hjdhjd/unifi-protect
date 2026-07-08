[**unifi-protect**](../README.md)

***

[Home](../README.md) / selectSensor

# Variable: selectSensor

```ts
const selectSensor: (id) => (state) => 
  | ProtectSensorConfigInterface
  | undefined = sensors.byId;
```

A single sensor by id, or `undefined` when absent.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

## Returns

(`state`) => 
  \| [`ProtectSensorConfigInterface`](../interfaces/ProtectSensorConfigInterface.md)
  \| `undefined`
