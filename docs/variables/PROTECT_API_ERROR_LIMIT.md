[**unifi-protect**](../README.md)

***

[Home](../README.md) / PROTECT\_API\_ERROR\_LIMIT

# Variable: PROTECT\_API\_ERROR\_LIMIT

```ts
const PROTECT_API_ERROR_LIMIT: 10 = 10;
```

Number of consecutive requests the controller did not serve (no answer, a status of 500 or above, or a 429) to accept before we back off so we don't slam a
Protect controller.
