[**unifi-protect**](../README.md)

***

[Home](../README.md) / PROTECT\_REBOOT\_ANTICIPATION\_WINDOW\_MS

# Variable: PROTECT\_REBOOT\_ANTICIPATION\_WINDOW\_MS

```ts
const PROTECT_REBOOT_ANTICIPATION_WINDOW_MS: 60000 = 60000;
```

Known-reboot anticipation window, in milliseconds. When client.reboot() succeeds, it arms the ConnectionMonitor to treat the next fault as a known reboot (the long
backoff track) for this long. The window is the staleness guard for that one-shot signal: it must comfortably exceed the few seconds between "the controller accepts
the reboot" and "the events channel faults," yet stay well under the gap to any unrelated later fault, so a stall minutes afterward is never misattributed as a planned
reboot. If no fault arrives within the window, the anticipation self-expires and the next fault takes the unknown-unreachable track.
