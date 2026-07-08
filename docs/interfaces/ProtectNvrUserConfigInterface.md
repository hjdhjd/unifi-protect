[**unifi-protect**](../README.md)

***

[Home](../README.md) / ProtectNvrUserConfigInterface

# Interface: ProtectNvrUserConfigInterface

A semi-complete description of the UniFi Protect NVR user JSON.

## Indexable

```ts
[key: string]: ProtectKnownJsonValue
```

## Properties

| Property | Type |
| ------ | ------ |
| <a id="alertrules"></a> `alertRules` | `ProtectKnownJsonValue`[] |
| <a id="allpermissions"></a> `allPermissions` | `string`[] |
| <a id="cloudaccount"></a> `cloudAccount?` | \{ `cloudId`: `string`; `email`: `string`; `firstName`: `string`; `id`: `string`; `lastName`: `string`; `modelKey`: `string`; `name`: `string`; `profileImg`: `string`; `user`: `string`; \} |
| `cloudAccount.cloudId` | `string` |
| `cloudAccount.email` | `string` |
| `cloudAccount.firstName` | `string` |
| `cloudAccount.id` | `string` |
| `cloudAccount.lastName` | `string` |
| `cloudAccount.modelKey` | `string` |
| `cloudAccount.name` | `string` |
| `cloudAccount.profileImg` | `string` |
| `cloudAccount.user` | `string` |
| <a id="email"></a> `email` | `string` |
| <a id="enablenotifications"></a> `enableNotifications` | `boolean` |
| <a id="firstname"></a> `firstName` | `string` |
| <a id="groups"></a> `groups` | `string`[] |
| <a id="hasacceptedinvite"></a> `hasAcceptedInvite` | `boolean` |
| <a id="id"></a> `id` | `string` |
| <a id="isowner"></a> `isOwner` | `boolean` |
| <a id="lastloginip"></a> `lastLoginIp` | `Nullable`\<`string`\> |
| <a id="lastlogintime"></a> `lastLoginTime` | `Nullable`\<`number`\> |
| <a id="lastname"></a> `lastName` | `string` |
| <a id="localusername"></a> `localUsername` | `string` |
| <a id="location"></a> `location?` | \{ `isAway`: `boolean`; `latitude`: `Nullable`\<`number`\>; `longitude`: `Nullable`\<`number`\>; \} |
| `location.isAway` | `boolean` |
| `location.latitude` | `Nullable`\<`number`\> |
| `location.longitude` | `Nullable`\<`number`\> |
| <a id="modelkey"></a> `modelKey` | `"user"` |
| <a id="name"></a> `name` | `string` |
| <a id="permissions"></a> `permissions` | `string`[] |
