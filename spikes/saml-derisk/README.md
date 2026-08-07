# Spike: SAML de-risk — better-auth + @better-auth/sso vs Keycloak (ADR #1245, risk 2)

Exercises better-auth (`1.6.26`) with `@better-auth/sso` (`1.6.26`) against a
local Keycloak configured as a university-style SAML IdP: metadata exchange in
both directions, **SP-initiated login with signed AuthnRequests**,
IdP-initiated login, and attribute mapping — all driven headlessly (a
cookie-jar fetch plays the browser).

**Result: all flows pass.** Gaps and the plan for the real-university-IdP pass
are on the ADR issue:
https://github.com/complexdatacollective/network-canvas-monorepo/issues/1245

## Reproduce (~5 min)

Prerequisites: Node ≥ 24, Docker, openssl.

```bash
npm install

# Backing services: Postgres (shared with the other spikes) + Keycloak
docker run -d --name studio-spike-pg -e POSTGRES_PASSWORD=spike -p 54318:5432 postgres:18
docker run -d --name studio-spike-kc \
  -e KEYCLOAK_ADMIN=admin -e KEYCLOAK_ADMIN_PASSWORD=admin \
  -e KC_BOOTSTRAP_ADMIN_USERNAME=admin -e KC_BOOTSTRAP_ADMIN_PASSWORD=admin \
  -p 8080:8080 quay.io/keycloak/keycloak:latest start-dev

# better-auth schema
docker exec studio-spike-pg psql -U postgres -c "CREATE DATABASE studio_saml"
npx --yes @better-auth/cli@latest migrate --config auth.ts --yes

# SP signing keypair (Keycloak's descriptor advertises WantAuthnRequestsSigned)
openssl req -x509 -newkey rsa:2048 -keyout sp-key.pem -out sp-cert.pem -days 365 -nodes -subj "/CN=studio-sp"

# The SP (Hono + better-auth, the Studio mounting shape), the IdP realm, the flows
node server.ts &
node setup-keycloak.mjs   # realm, SAML client + mappers + IdP-initiated URL, test user
node run-flows.mjs        # registration → SP metadata → SP-initiated → IdP-initiated
```

Expected output ends with `all flows passed`, printing the mapped user record
(`Alice Reilly <alice@university.example>` assembled from the IdP's
givenName/surname/email SAML attributes).

## Files

- `auth.ts` — better-auth instance: pg-backed, `sso()` plugin.
- `server.ts` — Hono host mounting the auth handler at `/api/auth/*`.
- `setup-keycloak.mjs` — admin-API realm build: SAML client (signed
  assertions, **required signed client requests** with the SP cert),
  email/givenName/surname protocol mappers, IdP-initiated SSO URL, test user.
- `run-flows.mjs` — registers the provider (IdP metadata XML + SP metadata
  XML with embedded signing cert), then drives both flows with a cookie-jar
  fetch, asserting the resulting better-auth session and mapped attributes.
