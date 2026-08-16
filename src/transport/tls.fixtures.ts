/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * tls.fixtures.ts: A throwaway self-signed identity for the loopback TLS servers the transport suite connects to.
 */

/* Establishing what the `verifyTls` option does to a handshake takes a real peer - a MockAgent replaces undici's dispatch wholesale, so the pool's own connect options
 * are permanently out of its reach, and the WebSocket URLs are `wss://` by construction. A TLS peer needs an identity to present, and this is that identity: a
 * self-signed prime256v1 certificate for `localhost`, minted once and embedded here so the suite mints nothing at run time and depends on no local toolchain.
 *
 * Publishing the private key beside the certificate is deliberate and safe. The pair is trusted by nothing - no store, no chain, no service - and the only peer that
 * ever accepts it is a test client that disables verification outright, exactly as the library does by default for a controller's own self-signed certificate. Treat
 * it as test material, never as a credential.
 */
export const loopbackCertificateFixture = [

  "-----BEGIN CERTIFICATE-----",
  "MIIBgDCCASWgAwIBAgIUQ3DBZO5eF/XEqTttTjA8hxenaL4wCgYIKoZIzj0EAwIw",
  "FDESMBAGA1UEAwwJbG9jYWxob3N0MCAXDTI2MDgxNTE5MTEyNloYDzIxMjYwNzIy",
  "MTkxMTI2WjAUMRIwEAYDVQQDDAlsb2NhbGhvc3QwWTATBgcqhkjOPQIBBggqhkjO",
  "PQMBBwNCAAQ0dHfCXprDsX+M2BOfJKSxIt5vSx8sgdZhnI5zgVNM2rm9K8gOCtiy",
  "P6LU8Y0gTT8w3XTwrFyCoBvpvPfID5E/o1MwUTAdBgNVHQ4EFgQUe2vFVhDNfUgA",
  "7VmTcoXt58szVwgwHwYDVR0jBBgwFoAUe2vFVhDNfUgA7VmTcoXt58szVwgwDwYD",
  "VR0TAQH/BAUwAwEB/zAKBggqhkjOPQQDAgNJADBGAiEAi9DXMpKJ7heElYCXH3sT",
  "75o5ZRTgHABCSNriUNkGpoICIQDxUtRXyV5+r4DDIy9c8bpfUyeyzwzL43rKfXHH",
  "tHf21A==",
  "-----END CERTIFICATE-----",
  ""
].join("\n");

/** The private key for {@link loopbackCertificateFixture}. Public by design - see that constant's note. */
export const loopbackPrivateKeyFixture = [

  "-----BEGIN PRIVATE KEY-----",
  "MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQge/esMeldEGOxKftC",
  "RYrfukkIgMdW1kTX60pcJkDaqm2hRANCAAQ0dHfCXprDsX+M2BOfJKSxIt5vSx8s",
  "gdZhnI5zgVNM2rm9K8gOCtiyP6LU8Y0gTT8w3XTwrFyCoBvpvPfID5E/",
  "-----END PRIVATE KEY-----",
  ""
].join("\n");
