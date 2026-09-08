# Security Policy

## Supported Versions

We only actively support the latest version of the software. All bug fixes and security updates will be made by patching or releasing new versions against the current latest version. No backporting will be carried out. With that said, the community is welcome to backport fixes and security updates to older versions, and we will be happy to review and release them.

## Security Model

Fresco is a **single-tenant, single-trust-level** application. Understanding this is important when reasoning about the codebase:

- **Administrators** authenticate (password, with optional TOTP or passkey two-factor) and are all fully trusted — there is no role hierarchy. Anyone who can sign in can manage every protocol, participant, and interview. "Any logged-in user can do X" is therefore by design, not a privilege-escalation flaw.
- **Participants** take interviews **without authenticating**. A participant is authorized purely by possession of their interview URL, which contains an unguessable interview id. **Treat interview URLs as secrets**: do not post them publicly, and Fresco does not write them to logs.
- **Account creation** has two paths. The **unauthenticated setup signup** is only available before the app is configured — once configured, the signup actions reject new accounts (the check is enforced inside the actions, not only on the setup page). Separately, **authenticated administrators can create additional accounts** at any time from the dashboard settings (User Management).

## Public and researcher-only URLs

Fresco's URL space is split by who may reach it, so that an institution can put every researcher surface behind its own network boundary (a campus network or VPN) at a reverse proxy with one rule, while participant traffic stays public. Exactly three prefixes plus the application's static assets are public; everything else is researcher-only.

| Reachable from                | Paths                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The public Internet           | `/interview/` (the interview pages, and the interview's own save and finish endpoints beneath them), `/onboard/` (participant onboarding links), `/api/public/` (protocol media at `/api/public/assets/<key>`, the liveness endpoint `/api/public/health`, and the UploadThing upload endpoint and callback `/api/public/uploadthing`), and `/_next/` (static assets) |
| The researchers' network only | Everything else: `/`, `/signin`, `/setup`, `/reset`, `/expired`, `/dashboard/…`, and every other `/api/` path — the session-authenticated route handlers the dashboard calls, and the bearer-token Interview Data API under `/api/v1/`                                                                                                                                |

Enforcing the boundary is the deployment's job: Fresco has no allowed-networks setting and never inspects source addresses, so the rule belongs in the reverse proxy or firewall in front of it (the documentation's FAQ for IT departments and Advanced Deployment guide give Traefik and nginx forms). What Fresco guarantees is that the split stays true across releases: `__tests__/routeVisibility.test.ts` classifies every page and route handler under `app/`, requires a session or token check on every researcher-only handler under `/api/`, and forbids one on the public handlers, so a route cannot be added outside the contract without changing it deliberately. The public routes are safe to expose by construction — none of them accepts a researcher credential — and the researcher-only ones check a Fresco credential as well, so the network boundary is a second layer rather than the only one.

The bundled MinIO layout (`docker-compose.prod.yml`) adds one public path that is not the application's: the bucket route `/assets/` on the same domain, which participants' media downloads are redirected to.

## Data at rest

- Passwords are hashed with scrypt; TOTP secrets and recovery codes are stored hashed and are single-use; API tokens are stored only as a SHA-256 hash (the plaintext is shown once, at creation).
- **Storage credentials** (S3 access key/secret, the UploadThing token) must remain reversible for the app to use them, so when configured through the **setup UI** they are stored **unencrypted** in the database. If database-at-rest exposure is part of your threat model, configure storage through **environment variables** instead — `STORAGE_PROVIDER`, `S3_ENDPOINT`, `S3_PUBLIC_URL`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, or `UPLOADTHING_TOKEN`. Env-provided values are read from the environment and never written to the database, and the setup UI locks the corresponding fields. See the `docker-compose.*.yml` deployment files.

## Transport & headers

Responses carry `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Strict-Transport-Security`, and `Referrer-Policy: strict-origin-when-cross-origin` on every route, including `/interview/*` and `/onboard/*`. Those URLs carry the interview id, which is the participant's unauthenticated access capability, and this policy keeps the path inside the origin: a cross-origin request carries only the scheme and host in its `Referer` header, an HTTPS→HTTP downgrade carries nothing, and the full URL is sent only to same-origin requests, which already know the id. Sending the origin is also what lets researchers use URL-restricted Mapbox tokens with Fresco — Mapbox evaluates URL restrictions from the `Referer` header and rejects requests that omit it, so a stricter `no-referrer` policy would make every Geospatial stage fail with such a token while protecting nothing more. User-uploaded assets are served with a validated content type and are forced to download (rather than render inline) for script-capable types such as SVG/HTML. Terminate TLS in front of the app. The bundled production Compose files do this with Traefik and enforce `Strict-Transport-Security` across the entire HTTPS entrypoint, including proxy-generated redirects and storage responses.

## Reporting a Vulnerability

To let us know about a security issue you have found. please email info@networkcanvas.com. Although we do not have the resources to offer any kind of reward, we would be extremely grateful for any instances of responsible disclosure that enable the community of network researchers to be more safe when collecting data using our software.
