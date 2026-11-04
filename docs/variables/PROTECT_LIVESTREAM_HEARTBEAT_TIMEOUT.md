[**unifi-protect**](../README.md)

***

[Home](../README.md) / PROTECT\_LIVESTREAM\_HEARTBEAT\_TIMEOUT

# Variable: PROTECT\_LIVESTREAM\_HEARTBEAT\_TIMEOUT

```ts
const PROTECT_LIVESTREAM_HEARTBEAT_TIMEOUT: 10000 = 10000;
```

Livestream heartbeat timeout, in milliseconds. If no data is received within this interval, the livestream is considered unresponsive and the connection is closed.
Any byte resets it, so a silence this long means the channel is dead rather than merely quiet; this is the transport-liveness backstop beneath the pool's media
watchdog.
