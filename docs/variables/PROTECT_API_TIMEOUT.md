[**unifi-protect**](../README.md)

***

[Home](../README.md) / PROTECT\_API\_TIMEOUT

# Variable: PROTECT\_API\_TIMEOUT

```ts
const PROTECT_API_TIMEOUT: 3500 = 3500;
```

Protect API response timeout, in milliseconds. This should never be greater than 5000 ms, the reasonable upper limit for a controller that is merely slow. The value
balances retries and responsiveness against genuinely slow networks and controllers: a consumer such as a HomeKit snapshot request runs under a hard deadline of
its own, so the library's timeout must leave it room to fail over, while a controller that hangs during a reboot must surface as a timeout rather than be masked by
a longer wait.
